import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  TEAM_LOBBY_THREAD_KEY,
  TEAM_RECIPIENT_UID,
  buildThreadKey,
  mergeChatMessageIdempotent,
  type ChatContactDTO,
  type ChatMessageDTO,
  type ChatMessageType
} from '../utils/chatLogic';

interface UseLiveChatParams {
  authUser: User | null;
  getAuthToken: () => Promise<string | null>;
  isChatOpen: boolean;
}

export interface SendChatMessageInput {
  recipientUid: string;
  body?: string;
  messageType?: ChatMessageType;
  attachment?: {
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    dataUrl: string;
  } | null;
  replyToId?: number | null;
  isUrgent?: boolean;
}

function playNotificationChime() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1174.66, ctx.currentTime + 0.09);
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.23);
    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 300);
  } catch {
    // Ignore audio context autoplay restrictions
  }
}

export function useLiveChat({
  authUser,
  getAuthToken,
  isChatOpen
}: UseLiveChatParams) {
  const [contacts, setContacts] = useState<ChatContactDTO[]>([]);
  const [teamLobby, setTeamLobby] = useState({
    unreadCount: 0,
    lastMessagePreview: 'Team room for all signed-in members',
    lastMessageAt: ''
  });
  const [totalUnread, setTotalUnread] = useState<number>(0);
  const [myStatus, setMyStatus] = useState<string>('Available');
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [activeRecipientUid, setActiveRecipientUid] = useState<string>(
    TEAM_RECIPIENT_UID
  );
  const [messages, setMessages] = useState<ChatMessageDTO[]>([]);
  const [loadingMessages, setLoadingMessages] = useState<boolean>(false);
  const [typingUser, setTypingUser] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [chatError, setChatError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const heartbeatTimerRef = useRef<number | null>(null);
  const typingClearTimerRef = useRef<number | null>(null);

  const activeThreadKey = useMemo(() => {
    if (!authUser) return TEAM_LOBBY_THREAD_KEY;
    if (!activeRecipientUid || activeRecipientUid === TEAM_RECIPIENT_UID) {
      return TEAM_LOBBY_THREAD_KEY;
    }
    return buildThreadKey(authUser.uid, activeRecipientUid);
  }, [authUser, activeRecipientUid]);

  const activeThreadKeyRef = useRef<string>(activeThreadKey);
  const isChatOpenRef = useRef<boolean>(isChatOpen);
  const soundEnabledRef = useRef<boolean>(soundEnabled);
  const authUidRef = useRef<string | null>(authUser?.uid ?? null);

  useEffect(() => {
    activeThreadKeyRef.current = activeThreadKey;
  }, [activeThreadKey]);

  useEffect(() => {
    isChatOpenRef.current = isChatOpen;
  }, [isChatOpen]);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  useEffect(() => {
    authUidRef.current = authUser?.uid ?? null;
  }, [authUser]);

  const refreshContacts = useCallback(async () => {
    if (!authUser) return;
    try {
      const token = await getAuthToken();
      if (!token) return;
      const resp = await fetch('/api/chat/contacts', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!resp.ok) return;
      const data = await resp.json();
      if (Array.isArray(data.contacts)) setContacts(data.contacts);
      if (data.teamLobby) setTeamLobby(data.teamLobby);
      if (typeof data.totalUnread === 'number') setTotalUnread(data.totalUnread);
      if (typeof data.myStatus === 'string') setMyStatus(data.myStatus);
    } catch {
      // Silent refresh failure
    }
  }, [authUser, getAuthToken]);

  const markThreadRead = useCallback(
    async (threadKey: string) => {
      if (!authUser) return;
      try {
        const token = await getAuthToken();
        if (!token) return;
        await fetch('/api/chat/read', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ threadKey })
        });
      } catch {
        // Ignore read receipt error
      }
    },
    [authUser, getAuthToken]
  );

  const loadMessagesForThread = useCallback(
    async (threadKey: string) => {
      if (!authUser) return;
      setLoadingMessages(true);
      setChatError(null);
      try {
        const token = await getAuthToken();
        if (!token) return;
        const resp = await fetch(
          `/api/chat/messages?threadKey=${encodeURIComponent(threadKey)}`,
          {
            headers: { Authorization: `Bearer ${token}` }
          }
        );
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          setChatError(err?.error || 'Could not load conversation');
          return;
        }
        const data = await resp.json();
        if (Array.isArray(data.messages)) {
          setMessages(data.messages);
        }
        await markThreadRead(threadKey);
        await refreshContacts();
      } catch {
        setChatError('Network error while loading messages.');
      } finally {
        setLoadingMessages(false);
      }
    },
    [authUser, getAuthToken, markThreadRead, refreshContacts]
  );

  // Maintain live WebSocket connection whenever signed in
  useEffect(() => {
    if (!authUser) {
      setContacts([]);
      setMessages([]);
      setTotalUnread(0);
      setWsConnected(false);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    let cancelled = false;
    let attempt = 0;

    const connect = async () => {
      if (cancelled) return;
      const token = await getAuthToken();
      if (!token || cancelled) return;

      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${proto}//${window.location.host}/ws/chat`;

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          attempt = 0;
          ws.send(JSON.stringify({ type: 'auth', token }));
        };

        ws.onmessage = event => {
          try {
            const data = JSON.parse(String(event.data || '{}'));
            if (data.type === 'auth:ok') {
              setWsConnected(true);
              refreshContacts();
              if (isChatOpenRef.current) {
                loadMessagesForThread(activeThreadKeyRef.current);
              }
              return;
            }

            if (data.type === 'presence:update') {
              const onlineSet = new Set<string>(
                Array.isArray(data.onlineUids) ? data.onlineUids : []
              );
              const statuses: Record<string, string> =
                data.statuses && typeof data.statuses === 'object'
                  ? data.statuses
                  : {};

              setContacts(prev => {
                const updated = prev.map(c => ({
                  ...c,
                  isOnline: onlineSet.has(c.uid),
                  statusMessage: statuses[c.uid] || c.statusMessage
                }));
                return updated.sort((a, b) => {
                  if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
                  return b.unreadCount - a.unreadCount;
                });
              });

              // Also refresh full contacts if a brand-new user just came online
              refreshContacts();
              return;
            }

            if (data.type === 'chat:message' && data.message) {
              const incoming = data.message as ChatMessageDTO;
              const isFromOther = incoming.senderUid !== authUidRef.current;

              if (incoming.threadKey === activeThreadKeyRef.current) {
                setMessages(prev => mergeChatMessageIdempotent(prev, incoming));
                if (isFromOther && isChatOpenRef.current) {
                  markThreadRead(incoming.threadKey);
                }
              }

              if (isFromOther && soundEnabledRef.current) {
                playNotificationChime();
              }
              refreshContacts();
              return;
            }

            if (data.type === 'chat:updated' && data.message) {
              const updatedMsg = data.message as ChatMessageDTO;
              if (updatedMsg.threadKey === activeThreadKeyRef.current) {
                setMessages(prev => mergeChatMessageIdempotent(prev, updatedMsg));
              }
              refreshContacts();
              return;
            }

            if (data.type === 'chat:read') {
              if (
                data.threadKey === activeThreadKeyRef.current &&
                Array.isArray(data.messageIds) &&
                typeof data.readerUid === 'string'
              ) {
                const idSet = new Set<number>(data.messageIds);
                const readerUid = data.readerUid;
                setMessages(prev =>
                  prev.map(m =>
                    idSet.has(m.id) && !m.readBy.includes(readerUid)
                      ? { ...m, readBy: [...m.readBy, readerUid] }
                      : m
                  )
                );
              }
              return;
            }

            if (data.type === 'chat:typing') {
              if (
                data.threadKey === activeThreadKeyRef.current &&
                data.fromUid !== authUidRef.current
              ) {
                if (typingClearTimerRef.current) {
                  window.clearTimeout(typingClearTimerRef.current);
                }
                if (data.isTyping) {
                  setTypingUser(data.fromName || 'Teammate');
                  typingClearTimerRef.current = window.setTimeout(() => {
                    setTypingUser(null);
                  }, 3500);
                } else {
                  setTypingUser(null);
                }
              }
            }
          } catch {
            // Ignore malformed socket frames
          }
        };

        ws.onclose = () => {
          setWsConnected(false);
          if (wsRef.current === ws) {
            wsRef.current = null;
          }
          if (!cancelled) {
            attempt += 1;
            const delay = Math.min(12000, 1200 * attempt);
            reconnectTimerRef.current = window.setTimeout(connect, delay);
          }
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch {
        setWsConnected(false);
      }
    };

    connect();
    refreshContacts();

    // Heartbeat every 25s keeps presence fresh in Cloud SQL and WS alive
    heartbeatTimerRef.current = window.setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }));
      } else {
        refreshContacts();
      }
    }, 25_000);

    return () => {
      cancelled = true;
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
      if (heartbeatTimerRef.current) window.clearInterval(heartbeatTimerRef.current);
      if (typingClearTimerRef.current) window.clearTimeout(typingClearTimerRef.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [authUser, getAuthToken, refreshContacts, loadMessagesForThread, markThreadRead]);

  // Load thread messages whenever chat opens or active conversation switches
  useEffect(() => {
    if (!authUser || !isChatOpen) return;
    setTypingUser(null);
    loadMessagesForThread(activeThreadKey);
  }, [authUser, isChatOpen, activeThreadKey, loadMessagesForThread]);

  const sendMessage = useCallback(
    async (input: SendChatMessageInput): Promise<ChatMessageDTO | null> => {
      if (!authUser) return null;
      setChatError(null);
      const token = await getAuthToken();
      if (!token) {
        setChatError('Please sign in with Google to send messages.');
        return null;
      }
      const resp = await fetch('/api/chat/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(input)
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        const msg = err?.error || 'Failed to send message';
        setChatError(msg);
        return null;
      }
      const data = await resp.json();
      if (data?.message) {
        setMessages(prev => mergeChatMessageIdempotent(prev, data.message));
        refreshContacts();
        return data.message as ChatMessageDTO;
      }
      return null;
    },
    [authUser, getAuthToken, refreshContacts]
  );

  const toggleReaction = useCallback(
    async (messageId: number, emoji: string) => {
      const token = await getAuthToken();
      if (!token) return;
      const resp = await fetch(`/api/chat/messages/${messageId}/react`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ emoji })
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data?.message) {
          setMessages(prev => mergeChatMessageIdempotent(prev, data.message));
        }
      }
    },
    [getAuthToken]
  );

  const togglePin = useCallback(
    async (messageId: number) => {
      const token = await getAuthToken();
      if (!token) return;
      const resp = await fetch(`/api/chat/messages/${messageId}/pin`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data?.message) {
          setMessages(prev => mergeChatMessageIdempotent(prev, data.message));
        }
      }
    },
    [getAuthToken]
  );

  const editMessage = useCallback(
    async (messageId: number, body: string) => {
      const token = await getAuthToken();
      if (!token) return false;
      const resp = await fetch(`/api/chat/messages/${messageId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ body })
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data?.message) {
          setMessages(prev => mergeChatMessageIdempotent(prev, data.message));
        }
        return true;
      }
      return false;
    },
    [getAuthToken]
  );

  const deleteMessage = useCallback(
    async (messageId: number) => {
      const token = await getAuthToken();
      if (!token) return false;
      const resp = await fetch(`/api/chat/messages/${messageId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data?.message) {
          setMessages(prev => mergeChatMessageIdempotent(prev, data.message));
        }
        refreshContacts();
        return true;
      }
      return false;
    },
    [getAuthToken, refreshContacts]
  );

  const sendTyping = useCallback(
    (isTyping: boolean) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'typing',
            threadKey: activeThreadKey,
            isTyping
          })
        );
      }
    },
    [activeThreadKey]
  );

  const updateMyStatus = useCallback(
    async (nextStatus: string) => {
      setMyStatus(nextStatus);
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({ type: 'status:set', status: nextStatus })
        );
      }
      const token = await getAuthToken();
      if (!token) return;
      await fetch('/api/chat/status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status: nextStatus })
      }).catch(() => {});
    },
    [getAuthToken]
  );

  const onlineContacts = useMemo(
    () => contacts.filter(c => c.isOnline),
    [contacts]
  );

  return {
    contacts,
    onlineContacts,
    teamLobby,
    totalUnread,
    myStatus,
    wsConnected,
    activeRecipientUid,
    setActiveRecipientUid,
    activeThreadKey,
    messages,
    loadingMessages,
    typingUser,
    soundEnabled,
    setSoundEnabled,
    chatError,
    setChatError,
    refreshContacts,
    sendMessage,
    toggleReaction,
    togglePin,
    editMessage,
    deleteMessage,
    sendTyping,
    updateMyStatus
  };
}
