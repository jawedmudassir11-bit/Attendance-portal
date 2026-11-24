import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  X,
  Send,
  Paperclip,
  Mic,
  Square,
  Search,
  Pin,
  Trash2,
  Edit3,
  Reply,
  Download,
  FileText,
  FolderOpen,
  Building2,
  MapPin,
  Zap,
  Volume2,
  VolumeX,
  Users,
  Check,
  CheckCheck,
  Clock,
  ChevronLeft,
  Smile,
  ShieldCheck,
  LogIn,
  BarChart3,
  Upload,
  FileSpreadsheet,
  Image as ImageIcon,
  Sparkles
} from 'lucide-react';
import {
  ALLOWED_CHAT_REACTIONS,
  ALLOWED_USER_STATUSES,
  CHAT_RETENTION_DAYS,
  QUICK_SITE_REPLIES,
  TEAM_RECIPIENT_UID,
  formatFileSize,
  formatTimeUntilExpiry,
  validateChatAttachment,
  type ChatContactDTO,
  type ChatMessageDTO
} from '../utils/chatLogic';
import type { SendChatMessageInput } from '../hooks/useLiveChat';
import type { SubscriptionTier } from '../utils/accountLogic';
import { SubscriptionTierBadge, UserAvatar } from './UserAvatar';

export interface ActiveSiteSnapshotInfo {
  siteName: string;
  subgroupName: string;
  dateLabel: string;
  presentToday: number;
  totalWorkers: number;
  monthlyOT: number;
  totalNetBalance: number;
}

interface LiveChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenProfileDrawer: () => void;
  authUser: User | null;
  activePhotoUrl?: string;
  activeSubscriptionTier?: SubscriptionTier;
  isSuperAdmin: boolean;
  onSignInGoogle: () => Promise<void>;
  contacts: ChatContactDTO[];
  teamLobby: {
    unreadCount: number;
    lastMessagePreview: string;
    lastMessageAt: string;
  };
  myStatus: string;
  onUpdateMyStatus: (status: string) => void;
  wsConnected: boolean;
  activeRecipientUid: string;
  onSelectRecipient: (uid: string) => void;
  messages: ChatMessageDTO[];
  loadingMessages: boolean;
  typingUser: string | null;
  soundEnabled: boolean;
  onToggleSound: () => void;
  chatError: string | null;
  onClearChatError: () => void;
  onSendMessage: (input: SendChatMessageInput) => Promise<ChatMessageDTO | null>;
  onToggleReaction: (messageId: number, emoji: string) => Promise<void>;
  onTogglePin: (messageId: number) => Promise<void>;
  onEditMessage: (messageId: number, body: string) => Promise<boolean>;
  onDeleteMessage: (messageId: number) => Promise<boolean>;
  onSendTyping: (isTyping: boolean) => void;
  activeSiteSnapshot: ActiveSiteSnapshotInfo;
}

interface PendingAttachment {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  dataUrl: string;
  kind: 'image' | 'audio' | 'document';
}

function formatMessageTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

function formatDateDivider(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

function parseStructuredCard(body: string): Record<string, string | number> | null {
  try {
    const parsed = JSON.parse(body);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export const LiveChatModal: React.FC<LiveChatModalProps> = ({
  isOpen,
  onClose,
  onOpenProfileDrawer,
  authUser,
  activePhotoUrl,
  activeSubscriptionTier = 'standard',
  isSuperAdmin,
  onSignInGoogle,
  contacts,
  teamLobby,
  myStatus,
  onUpdateMyStatus,
  wsConnected,
  activeRecipientUid,
  onSelectRecipient,
  messages,
  loadingMessages,
  typingUser,
  soundEnabled,
  onToggleSound,
  chatError,
  onClearChatError,
  onSendMessage,
  onToggleReaction,
  onTogglePin,
  onEditMessage,
  onDeleteMessage,
  onSendTyping,
  activeSiteSnapshot
}) => {
  const [contactSearch, setContactSearch] = useState('');
  const [onlineOnlyFilter, setOnlineOnlyFilter] = useState(false);
  const [mobileShowChat, setMobileShowChat] = useState(false);

  const [draftText, setDraftText] = useState('');
  const [isUrgent, setIsUrgent] = useState(false);
  const [pendingAttachment, setPendingAttachment] =
    useState<PendingAttachment | null>(null);
  const [replyingTo, setReplyingTo] = useState<ChatMessageDTO | null>(null);
  const [editingMsg, setEditingMsg] = useState<ChatMessageDTO | null>(null);
  const [sending, setSending] = useState(false);

  const [showInChatSearch, setShowInChatSearch] = useState(false);
  const [inChatSearch, setInChatSearch] = useState('');
  const [showVault, setShowVault] = useState(false);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [reactionPickerMsgId, setReactionPickerMsgId] = useState<number | null>(
    null
  );
  const [lightboxImage, setLightboxImage] = useState<{
    src: string;
    name: string;
  } | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Voice Note Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSec, setRecordingSec] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const typingStopTimerRef = useRef<number | null>(null);

  const activeContact = useMemo(() => {
    if (activeRecipientUid === TEAM_RECIPIENT_UID) return null;
    return contacts.find(c => c.uid === activeRecipientUid) || null;
  }, [contacts, activeRecipientUid]);

  const filteredContacts = useMemo(() => {
    const q = contactSearch.trim().toLowerCase();
    return contacts.filter(c => {
      if (onlineOnlyFilter && !c.isOnline) return false;
      if (!q) return true;
      return (
        c.displayName.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.statusMessage.toLowerCase().includes(q)
      );
    });
  }, [contacts, contactSearch, onlineOnlyFilter]);

  const onlineCount = useMemo(
    () => contacts.filter(c => c.isOnline).length,
    [contacts]
  );

  const pinnedMessages = useMemo(
    () => messages.filter(m => m.isPinned && !m.isDeleted),
    [messages]
  );

  const vaultFiles = useMemo(
    () =>
      messages
        .filter(m => !m.isDeleted && Boolean(m.attachmentData && m.attachmentName))
        .reverse(),
    [messages]
  );

  const visibleMessages = useMemo(() => {
    const q = inChatSearch.trim().toLowerCase();
    if (!q) return messages;
    return messages.filter(
      m =>
        !m.isDeleted &&
        (m.body.toLowerCase().includes(q) ||
          m.attachmentName.toLowerCase().includes(q) ||
          m.senderName.toLowerCase().includes(q))
    );
  }, [messages, inChatSearch]);

  useEffect(() => {
    if (isOpen && messagesEndRef.current && !inChatSearch) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, isOpen, activeRecipientUid, inChatSearch]);

  useEffect(() => {
    if (!isOpen) {
      setReactionPickerMsgId(null);
      setLightboxImage(null);
      if (isRecording && mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
      }
    }
  }, [isOpen, isRecording]);

  if (!isOpen) return null;

  const processSelectedFile = (file: File) => {
    onClearChatError();
    setLocalError(null);
    const preliminary = validateChatAttachment({
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      sizeBytes: file.size
    });
    if (!preliminary.valid || !preliminary.messageType) {
      setLocalError(preliminary.error || 'Unsupported file type or size.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) return;
      setPendingAttachment({
        fileName: preliminary.sanitizedName || file.name,
        mimeType: preliminary.normalizedMime || file.type || 'application/octet-stream',
        sizeBytes: file.size,
        dataUrl,
        kind: preliminary.messageType!
      });
    };
    reader.readAsDataURL(file);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processSelectedFile(file);
    e.target.value = '';
  };

  const handleDropFile = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processSelectedFile(file);
  };

  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/ogg';
      const recorder = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];

      recorder.ondataavailable = ev => {
        if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        if (recordTimerRef.current) {
          window.clearInterval(recordTimerRef.current);
          recordTimerRef.current = null;
        }
        setIsRecording(false);
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        if (blob.size < 200) return;
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = typeof reader.result === 'string' ? reader.result : '';
          if (!dataUrl) return;
          setPendingAttachment({
            fileName: `voice-note-${Date.now()}.webm`,
            mimeType: 'audio/webm',
            sizeBytes: blob.size,
            dataUrl,
            kind: 'audio'
          });
        };
        reader.readAsDataURL(blob);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecordingSec(0);
      setIsRecording(true);
      recordTimerRef.current = window.setInterval(() => {
        setRecordingSec(s => {
          if (s >= 119) {
            recorder.stop();
            return 120;
          }
          return s + 1;
        });
      }, 1000);
    } catch {
      onClearChatError();
    }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const handleDraftChange = (val: string) => {
    setDraftText(val);
    onSendTyping(true);
    if (typingStopTimerRef.current) {
      window.clearTimeout(typingStopTimerRef.current);
    }
    typingStopTimerRef.current = window.setTimeout(() => {
      onSendTyping(false);
    }, 1800);
  };

  const handleSendSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (sending) return;

    if (editingMsg) {
      const cleaned = draftText.trim();
      if (!cleaned) return;
      setSending(true);
      const ok = await onEditMessage(editingMsg.id, cleaned);
      setSending(false);
      if (ok) {
        setEditingMsg(null);
        setDraftText('');
      }
      return;
    }

    if (!draftText.trim() && !pendingAttachment) return;

    setSending(true);
    onSendTyping(false);
    const result = await onSendMessage({
      recipientUid: activeRecipientUid || TEAM_RECIPIENT_UID,
      body: draftText.trim(),
      attachment: pendingAttachment
        ? {
            fileName: pendingAttachment.fileName,
            mimeType: pendingAttachment.mimeType,
            sizeBytes: pendingAttachment.sizeBytes,
            dataUrl: pendingAttachment.dataUrl
          }
        : null,
      replyToId: replyingTo?.id ?? null,
      isUrgent
    });
    setSending(false);

    if (result) {
      setDraftText('');
      setPendingAttachment(null);
      setReplyingTo(null);
      setIsUrgent(false);
      setShowQuickReplies(false);
    }
  };

  const handleShareSiteCard = async () => {
    if (sending) return;
    setSending(true);
    await onSendMessage({
      recipientUid: activeRecipientUid || TEAM_RECIPIENT_UID,
      messageType: 'site_card',
      body: JSON.stringify(activeSiteSnapshot),
      isUrgent
    });
    setSending(false);
    setIsUrgent(false);
  };

  const handleShareLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        await onSendMessage({
          recipientUid: activeRecipientUid || TEAM_RECIPIENT_UID,
          messageType: 'location',
          body: JSON.stringify({
            lat,
            lng,
            site: `${activeSiteSnapshot.siteName} ➔ ${activeSiteSnapshot.subgroupName}`,
            accuracy: Math.round(pos.coords.accuracy || 0)
          })
        });
      },
      () => {}
    );
  };

  const handleExportTranscript = () => {
    const title = activeContact
      ? `${activeContact.displayName} (${activeContact.email})`
      : 'Global Team Room';
    const lines = [
      `ATTENDANCE PORTAL — LIVE CHAT TRANSCRIPT`,
      `Conversation: ${title}`,
      `Exported: ${new Date().toLocaleString('en-IN')}`,
      `Retention Policy: Messages auto-delete ${CHAT_RETENTION_DAYS} days after sending`,
      `------------------------------------------------------------`,
      ...messages
        .filter(m => !m.isDeleted)
        .map(m => {
          const ts = new Date(m.createdAt).toLocaleString('en-IN');
          const tag = m.isUrgent ? ' [URGENT]' : '';
          const att = m.attachmentName
            ? ` [Attachment: ${m.attachmentName} (${formatFileSize(m.attachmentSize)})]`
            : '';
          return `[${ts}] ${m.senderName}${tag}: ${m.body || ''}${att}`;
        })
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `GI_Chat_${(activeContact?.displayName || 'Team_Room').replace(/\s+/g, '_')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSelectThread = (uid: string) => {
    onSelectRecipient(uid);
    setMobileShowChat(true);
    setShowVault(false);
    setShowInChatSearch(false);
    setInChatSearch('');
    setReplyingTo(null);
    setEditingMsg(null);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 backdrop-blur-xs p-0 sm:p-4 no-print"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Attendance Portal Live Team Chat"
        className="w-full h-full sm:max-w-5xl sm:h-[86vh] bg-white dark:bg-slate-900 sm:rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden"
      >
        {/* TOP CHAT BAR */}
        <div className="bg-[#152E4D] text-white px-4 py-3 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="relative">
              <UserAvatar
                photoUrl={activePhotoUrl || authUser?.photoURL}
                name={authUser?.displayName}
                email={authUser?.email}
                size="sm"
                highlight={isSuperAdmin ? 'gold' : 'blue'}
                subscriptionTier={activeSubscriptionTier}
              />
              <span
                className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ring-2 ring-[#152E4D] ${
                  wsConnected ? 'bg-emerald-400' : 'bg-amber-400'
                }`}
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-black tracking-tight truncate">
                  Team Live Chat
                </h3>
                <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  {onlineCount} online
                </span>
              </div>
              <div className="text-[11px] text-slate-300 flex items-center gap-1.5">
                <Clock className="w-3 h-3 text-amber-400 shrink-0" />
                <span className="truncate">
                  Messages &amp; files auto-delete permanently after {CHAT_RETENTION_DAYS} days
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={onToggleSound}
              title={soundEnabled ? 'Mute notification chimes' : 'Enable notification chimes'}
              aria-label={soundEnabled ? 'Mute chat sound' : 'Unmute chat sound'}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
            >
              {soundEnabled ? (
                <Volume2 className="w-4 h-4 text-emerald-300" />
              ) : (
                <VolumeX className="w-4 h-4 text-slate-400" />
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenProfileDrawer();
              }}
              className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold text-white transition-colors cursor-pointer"
            >
              <BarChart3 className="w-3.5 h-3.5 text-amber-300" />
              <span>Profile &amp; Analytics</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Live Chat"
              className="p-2 rounded-lg hover:bg-white/20 text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* UNAUTHENTICATED SIGN-IN GATE */}
        {!authUser ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Users className="w-8 h-8" />
            </div>
            <div className="max-w-sm space-y-1.5">
              <h4 className="text-lg font-black text-slate-900 dark:text-white">
                Sign in with Google to Chat Live
              </h4>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                Send real-time messages, PDFs, Excel sheets, site photos, voice notes, and live site cards with teammates. All messages and files automatically purge after 5 days.
              </p>
            </div>
            <button
              type="button"
              onClick={onSignInGoogle}
              className="px-5 py-2.5 rounded-xl bg-[#152E4D] hover:bg-[#1e3f69] text-white text-sm font-extrabold flex items-center gap-2 shadow-md cursor-pointer"
            >
              <LogIn className="w-4 h-4 text-amber-400" />
              <span>Sign in with Google</span>
            </button>
          </div>
        ) : (
          <div className="flex-1 flex min-h-0 overflow-hidden">
            {/* LEFT SIDEBAR: CONTACTS & TEAM ROOM */}
            <aside
              className={`w-full sm:w-72 md:w-80 border-r border-slate-200 dark:border-slate-800 flex flex-col bg-slate-50/70 dark:bg-slate-900/80 shrink-0 ${
                mobileShowChat ? 'hidden sm:flex' : 'flex'
              }`}
            >
              {/* Status Selector + Search */}
              <div className="p-3 space-y-2.5 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    My Status
                  </span>
                  <select
                    aria-label="Set my online status"
                    value={myStatus}
                    onChange={e => onUpdateMyStatus(e.target.value)}
                    className="text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {ALLOWED_USER_STATUSES.map(st => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={contactSearch}
                    onChange={e => setContactSearch(e.target.value)}
                    placeholder="Search people or Gmail..."
                    aria-label="Search chat contacts"
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-1 p-0.5 rounded-lg bg-slate-200/70 dark:bg-slate-800">
                  <button
                    type="button"
                    onClick={() => setOnlineOnlyFilter(false)}
                    className={`py-1 text-[11px] font-extrabold rounded-md transition-colors cursor-pointer ${
                      !onlineOnlyFilter
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    All ({contacts.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setOnlineOnlyFilter(true)}
                    className={`py-1 text-[11px] font-extrabold rounded-md transition-colors cursor-pointer ${
                      onlineOnlyFilter
                        ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-2xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Online ({onlineCount})
                  </button>
                </div>
              </div>

              {/* Contacts List */}
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {/* Pinned All-Team Room */}
                <button
                  type="button"
                  onClick={() => handleSelectThread(TEAM_RECIPIENT_UID)}
                  className={`w-full text-left p-2.5 rounded-xl flex items-center gap-2.5 transition-colors cursor-pointer ${
                    activeRecipientUid === TEAM_RECIPIENT_UID
                      ? 'bg-[#152E4D] text-white'
                      : 'hover:bg-white dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100'
                  }`}
                >
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                      activeRecipientUid === TEAM_RECIPIENT_UID
                        ? 'bg-amber-400 text-[#152E4D]'
                        : 'bg-blue-600/15 text-blue-600 dark:text-blue-400'
                    }`}
                  >
                    <Users className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-extrabold truncate">
                        # Global Team Room
                      </span>
                      {teamLobby.unreadCount > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full bg-emerald-500 text-white text-[10px] font-black tabular-nums">
                          {teamLobby.unreadCount}
                        </span>
                      )}
                    </div>
                    <p
                      className={`text-[11px] truncate ${
                        activeRecipientUid === TEAM_RECIPIENT_UID
                          ? 'text-slate-300'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {teamLobby.lastMessagePreview}
                    </p>
                  </div>
                </button>

                <div className="px-2 pt-2 pb-1 text-[10px] font-black uppercase tracking-wider text-slate-400">
                  Direct Messages
                </div>

                {filteredContacts.length === 0 ? (
                  <div className="text-center py-6 px-3 text-xs text-slate-500 dark:text-slate-400">
                    {onlineOnlyFilter
                      ? 'No teammates are online right now.'
                      : 'No other signed-in teammates yet. Share the app so teammates can sign in with Google and chat live.'}
                  </div>
                ) : (
                  filteredContacts.map(contact => {
                    const isSelected = activeRecipientUid === contact.uid;
                    return (
                      <button
                        key={contact.uid}
                        type="button"
                        onClick={() => handleSelectThread(contact.uid)}
                        className={`w-full text-left p-2.5 rounded-xl flex items-center gap-2.5 transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-[#152E4D] text-white'
                            : 'hover:bg-white dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100'
                        }`}
                      >
                        <div className="relative shrink-0">
                          <UserAvatar
                            photoUrl={contact.photoUrl}
                            name={contact.displayName}
                            email={contact.email}
                            size="sm"
                            highlight={contact.role === 'super_admin' ? 'gold' : 'blue'}
                            subscriptionTier={contact.subscriptionTier}
                          />
                          <span
                            className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ring-2 ${
                              isSelected
                                ? 'ring-[#152E4D]'
                                : 'ring-white dark:ring-slate-900'
                            } ${
                              contact.isOnline ? 'bg-emerald-500' : 'bg-slate-400'
                            }`}
                          />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-xs font-extrabold truncate flex items-center gap-1">
                              <span className="truncate">{contact.displayName}</span>
                              <SubscriptionTierBadge
                                tier={contact.subscriptionTier}
                                size="xs"
                              />
                              {contact.role === 'super_admin' && (
                                <ShieldCheck className="w-3 h-3 text-amber-400 shrink-0" />
                              )}
                            </span>
                            {contact.unreadCount > 0 && (
                              <span className="px-1.5 py-0.5 rounded-full bg-emerald-500 text-white text-[10px] font-black tabular-nums shrink-0">
                                {contact.unreadCount}
                              </span>
                            )}
                          </div>
                          <div
                            className={`text-[11px] truncate ${
                              isSelected
                                ? 'text-slate-300'
                                : 'text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            {contact.lastMessagePreview ||
                              (contact.isOnline
                                ? `Online · ${contact.statusMessage}`
                                : contact.email)}
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </aside>

            {/* RIGHT PANE: ACTIVE CONVERSATION */}
            <div
              className={`flex-1 flex flex-col min-w-0 bg-white dark:bg-slate-950 relative ${
                mobileShowChat ? 'flex' : 'hidden sm:flex'
              }`}
              onDragOver={e => {
                e.preventDefault();
                setIsDraggingFile(true);
              }}
              onDragLeave={() => setIsDraggingFile(false)}
              onDrop={handleDropFile}
            >
              {/* Drag & Drop File Overlay */}
              {isDraggingFile && (
                <div className="absolute inset-0 z-30 bg-[#152E4D]/90 text-white flex flex-col items-center justify-center gap-2 border-2 border-dashed border-amber-400 m-3 rounded-2xl pointer-events-none">
                  <Upload className="w-10 h-10 text-amber-400" />
                  <p className="text-sm font-black">Drop document, Excel, PDF, or photo to send</p>
                  <p className="text-xs text-slate-300">Max 4 MB · Auto-deletes after 5 days</p>
                </div>
              )}

              {/* Conversation Header */}
              <div className="px-3.5 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 bg-white dark:bg-slate-900 shrink-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <button
                    type="button"
                    onClick={() => setMobileShowChat(false)}
                    aria-label="Back to contacts"
                    className="sm:hidden p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>

                  {activeContact ? (
                    <>
                      <div className="relative shrink-0">
                        <UserAvatar
                          photoUrl={activeContact.photoUrl}
                          name={activeContact.displayName}
                          email={activeContact.email}
                          size="sm"
                          highlight={
                            activeContact.role === 'super_admin' ? 'gold' : 'blue'
                          }
                          subscriptionTier={activeContact.subscriptionTier}
                        />
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ring-2 ring-white dark:ring-slate-900 ${
                            activeContact.isOnline
                              ? 'bg-emerald-500'
                              : 'bg-slate-400'
                          }`}
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-black text-slate-900 dark:text-white truncate flex items-center gap-1.5">
                          <span className="truncate">{activeContact.displayName}</span>
                          <SubscriptionTierBadge
                            tier={activeContact.subscriptionTier}
                            size="xs"
                          />
                          {activeContact.role === 'super_admin' && (
                            <span className="text-[10px] font-extrabold text-amber-600 dark:text-amber-400 shrink-0">
                              Super Admin
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {activeContact.isOnline ? (
                            <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                              Online · {activeContact.statusMessage}
                            </span>
                          ) : (
                            activeContact.email
                          )}
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="w-8 h-8 rounded-full bg-blue-600/15 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                        <Users className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-black text-slate-900 dark:text-white truncate">
                          # Global Team Room
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {onlineCount + 1} online across sites · 5-day retention
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Conversation Toolbar */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setShowInChatSearch(s => !s);
                      setInChatSearch('');
                    }}
                    title="Search messages"
                    aria-label="Search messages in conversation"
                    className={`p-2 rounded-lg transition-colors cursor-pointer ${
                      showInChatSearch
                        ? 'bg-blue-600 text-white'
                        : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <Search className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowVault(v => !v)}
                    title={`Shared documents & media (${vaultFiles.length})`}
                    aria-label="Open shared documents and media vault"
                    className={`px-2 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer ${
                      showVault
                        ? 'bg-[#152E4D] text-white'
                        : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <FolderOpen className="w-4 h-4" />
                    <span className="hidden md:inline">Files</span>
                    <span className="tabular-nums text-[10px]">({vaultFiles.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleExportTranscript}
                    title="Export chat transcript (.txt) before 5-day expiry"
                    aria-label="Export chat transcript"
                    className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* In-Chat Search Bar */}
              {showInChatSearch && (
                <div className="px-3.5 py-2 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
                  <Search className="w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="text"
                    autoFocus
                    value={inChatSearch}
                    onChange={e => setInChatSearch(e.target.value)}
                    placeholder="Find messages, challans, filenames..."
                    className="flex-1 bg-transparent text-xs text-slate-900 dark:text-white focus:outline-none"
                  />
                  {inChatSearch && (
                    <span className="text-[10px] font-bold text-slate-500 tabular-nums">
                      {visibleMessages.length} matches
                    </span>
                  )}
                </div>
              )}

              {/* Pinned Messages Banner */}
              {pinnedMessages.length > 0 && !showVault && (
                <div className="px-3.5 py-1.5 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800/50 flex items-center gap-2 text-xs">
                  <Pin className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span className="font-bold text-amber-800 dark:text-amber-300 shrink-0">
                    Pinned ({pinnedMessages.length}):
                  </span>
                  <span className="truncate text-slate-700 dark:text-slate-300">
                    {pinnedMessages[pinnedMessages.length - 1].body ||
                      pinnedMessages[pinnedMessages.length - 1].attachmentName}
                  </span>
                </div>
              )}

              {/* Chat Error Toast Bar */}
              {(chatError || localError) && (
                <div className="px-3.5 py-2 bg-rose-50 dark:bg-rose-950/50 border-b border-rose-200 dark:border-rose-800 flex items-center justify-between text-xs text-rose-700 dark:text-rose-300">
                  <span>{localError || chatError}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setLocalError(null);
                      onClearChatError();
                    }}
                    className="font-bold underline cursor-pointer"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              {/* SHARED FILES & MEDIA VAULT VIEW OR LIVE MESSAGE STREAM */}
              {showVault ? (
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-400">
                      Shared Documents, Photos &amp; Voice Notes ({vaultFiles.length})
                    </h4>
                    <button
                      type="button"
                      onClick={() => setShowVault(false)}
                      className="text-xs font-bold text-blue-600 hover:underline cursor-pointer"
                    >
                      Back to Messages
                    </button>
                  </div>
                  {vaultFiles.length === 0 ? (
                    <div className="text-center py-12 text-xs text-slate-500 dark:text-slate-400">
                      No documents or photos shared in this conversation yet.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {vaultFiles.map(fileMsg => (
                        <div
                          key={fileMsg.id}
                          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-3 flex items-center justify-between gap-2.5"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            {fileMsg.messageType === 'image' ? (
                              <img
                                src={fileMsg.attachmentData}
                                alt={fileMsg.attachmentName}
                                onClick={() =>
                                  setLightboxImage({
                                    src: fileMsg.attachmentData,
                                    name: fileMsg.attachmentName
                                  })
                                }
                                className="w-11 h-11 rounded-lg object-cover shrink-0 cursor-pointer border border-slate-200 dark:border-slate-700"
                              />
                            ) : (
                              <div className="w-11 h-11 rounded-lg bg-blue-600/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                                {fileMsg.attachmentName.match(/\.xlsx?|\.csv$/i) ? (
                                  <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                                ) : (
                                  <FileText className="w-5 h-5" />
                                )}
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                                {fileMsg.attachmentName}
                              </div>
                              <div className="text-[10px] text-slate-500 dark:text-slate-400">
                                {formatFileSize(fileMsg.attachmentSize)} · by{' '}
                                {fileMsg.senderName}
                              </div>
                              <div className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                                {formatTimeUntilExpiry(fileMsg.expiresAt)}
                              </div>
                            </div>
                          </div>
                          <a
                            href={fileMsg.attachmentData}
                            download={fileMsg.attachmentName}
                            className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-blue-400 shrink-0"
                            title="Download file"
                          >
                            <Download className="w-4 h-4" />
                          </a>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto px-3.5 py-3 space-y-3">
                  {loadingMessages && messages.length === 0 ? (
                    <div className="text-center py-12 text-xs text-slate-400">
                      Loading messages...
                    </div>
                  ) : visibleMessages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center py-10 space-y-2">
                      <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                        <Sparkles className="w-6 h-6" />
                      </div>
                      <p className="text-sm font-black text-slate-800 dark:text-white">
                        {inChatSearch
                          ? 'No messages match your search'
                          : 'Start the conversation'}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs">
                        Send text, PDFs, Excel sheets, site photos, voice notes, or a 1-tap Site Status Card. Everything auto-deletes after {CHAT_RETENTION_DAYS} days.
                      </p>
                    </div>
                  ) : (
                    visibleMessages.map((msg, index) => {
                      const isMine = msg.senderUid === authUser.uid;
                      const prevMsg = index > 0 ? visibleMessages[index - 1] : null;
                      const curDateLabel = formatDateDivider(msg.createdAt);
                      const prevDateLabel = prevMsg
                        ? formatDateDivider(prevMsg.createdAt)
                        : '';
                      const showDateDivider = curDateLabel !== prevDateLabel;
                      const isReadByOther = msg.readBy.some(
                        u => u !== msg.senderUid
                      );
                      const siteCard =
                        msg.messageType === 'site_card'
                          ? parseStructuredCard(msg.body)
                          : null;
                      const locCard =
                        msg.messageType === 'location'
                          ? parseStructuredCard(msg.body)
                          : null;

                      return (
                        <React.Fragment key={msg.id}>
                          {showDateDivider && (
                            <div className="flex items-center justify-center my-2">
                              <span className="px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-500 dark:text-slate-400">
                                {curDateLabel}
                              </span>
                            </div>
                          )}

                          <div
                            className={`group flex items-end gap-2 ${
                              isMine ? 'justify-end' : 'justify-start'
                            }`}
                          >
                            {!isMine && (
                              <UserAvatar
                                photoUrl={msg.senderPhoto}
                                name={msg.senderName}
                                email={msg.senderEmail}
                                size="xs"
                                className="mb-1"
                              />
                            )}

                            <div
                              className={`max-w-[82%] sm:max-w-[70%] space-y-1 ${
                                isMine ? 'items-end' : 'items-start'
                              } flex flex-col`}
                            >
                              {/* Sender Label in Team Room */}
                              {!isMine && activeRecipientUid === TEAM_RECIPIENT_UID && (
                                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 px-1">
                                  {msg.senderName}
                                </span>
                              )}

                              {/* Message Bubble */}
                              <div
                                className={`relative rounded-2xl px-3.5 py-2.5 text-xs sm:text-[13px] shadow-2xs ${
                                  msg.isDeleted
                                    ? 'bg-slate-100 dark:bg-slate-800/60 text-slate-400 italic border border-slate-200 dark:border-slate-700'
                                    : isMine
                                    ? `bg-[#152E4D] text-white ${
                                        msg.isUrgent
                                          ? 'ring-2 ring-amber-400'
                                          : ''
                                      }`
                                    : `bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 ${
                                        msg.isUrgent
                                          ? 'ring-2 ring-rose-500 bg-rose-50 dark:bg-rose-950/40'
                                          : ''
                                      }`
                                }`}
                              >
                                {/* Urgent / Pinned Badges */}
                                {!msg.isDeleted && (msg.isUrgent || msg.isPinned) && (
                                  <div className="flex items-center gap-1.5 mb-1 text-[10px] font-black uppercase tracking-wider">
                                    {msg.isUrgent && (
                                      <span className="text-amber-400 flex items-center gap-0.5">
                                        <Zap className="w-3 h-3" /> Urgent Alert
                                      </span>
                                    )}
                                    {msg.isPinned && (
                                      <span className="text-amber-300 flex items-center gap-0.5">
                                        <Pin className="w-3 h-3" /> Pinned
                                      </span>
                                    )}
                                  </div>
                                )}

                                {/* Quoted Reply Preview */}
                                {!msg.isDeleted && msg.replyToPreview && (
                                  <div
                                    className={`mb-1.5 px-2.5 py-1.5 rounded-lg border-l-2 text-[11px] ${
                                      isMine
                                        ? 'bg-white/10 border-amber-400 text-slate-200'
                                        : 'bg-white dark:bg-slate-900 border-blue-500 text-slate-600 dark:text-slate-300'
                                    }`}
                                  >
                                    <div className="font-extrabold text-[10px] opacity-90">
                                      {msg.replyToSender}
                                    </div>
                                    <div className="truncate">{msg.replyToPreview}</div>
                                  </div>
                                )}

                                {msg.isDeleted ? (
                                  <span>This message was deleted</span>
                                ) : (
                                  <>
                                    {/* Site Status Card */}
                                    {siteCard && (
                                      <div
                                        className={`rounded-xl p-2.5 mb-1.5 space-y-1.5 border ${
                                          isMine
                                            ? 'bg-white/10 border-white/15'
                                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'
                                        }`}
                                      >
                                        <div className="flex items-center gap-1.5 text-[11px] font-black">
                                          <Building2 className="w-3.5 h-3.5 text-amber-400" />
                                          <span>
                                            {String(siteCard.siteName || '')} ➔{' '}
                                            {String(siteCard.subgroupName || '')}
                                          </span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-1.5 text-[11px] tabular-nums">
                                          <div>
                                            <span className="opacity-70 block text-[10px]">
                                              Present Today
                                            </span>
                                            <span className="font-black">
                                              {String(siteCard.presentToday ?? 0)} /{' '}
                                              {String(siteCard.totalWorkers ?? 0)}
                                            </span>
                                          </div>
                                          <div>
                                            <span className="opacity-70 block text-[10px]">
                                              Monthly OT
                                            </span>
                                            <span className="font-black">
                                              {String(siteCard.monthlyOT ?? 0)} Hrs
                                            </span>
                                          </div>
                                          <div className="col-span-2">
                                            <span className="opacity-70 text-[10px]">
                                              Net Wage Liability ({String(siteCard.dateLabel || '')}):{' '}
                                            </span>
                                            <span className="font-black text-emerald-400">
                                              ₹{Number(siteCard.totalNetBalance || 0).toLocaleString('en-IN')}
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                    )}

                                    {/* GPS Location Card */}
                                    {locCard && (
                                      <div
                                        className={`rounded-xl p-2.5 mb-1.5 space-y-1 border ${
                                          isMine
                                            ? 'bg-white/10 border-white/15'
                                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'
                                        }`}
                                      >
                                        <div className="flex items-center gap-1.5 text-xs font-black">
                                          <MapPin className="w-3.5 h-3.5 text-rose-400" />
                                          <span>Site GPS Location Pin</span>
                                        </div>
                                        <div className="text-[11px] opacity-85">
                                          {String(locCard.site || '')}
                                        </div>
                                        <div className="text-[10px] font-mono opacity-80">
                                          {String(locCard.lat)}, {String(locCard.lng)}
                                        </div>
                                        <a
                                          href={`https://www.google.com/maps?q=${encodeURIComponent(
                                            `${locCard.lat},${locCard.lng}`
                                          )}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-block text-[11px] font-bold underline text-amber-300"
                                        >
                                          Open in Google Maps ↗
                                        </a>
                                      </div>
                                    )}

                                    {/* Image Attachment */}
                                    {msg.messageType === 'image' && msg.attachmentData && (
                                      <div className="mb-1.5">
                                        <img
                                          src={msg.attachmentData}
                                          alt={msg.attachmentName || 'Shared photo'}
                                          onClick={() =>
                                            setLightboxImage({
                                              src: msg.attachmentData,
                                              name: msg.attachmentName || 'photo.png'
                                            })
                                          }
                                          className="max-h-56 rounded-xl object-cover cursor-pointer border border-white/15"
                                        />
                                        <div className="flex items-center justify-between gap-2 mt-1 text-[10px] opacity-80">
                                          <span className="truncate">{msg.attachmentName}</span>
                                          <a
                                            href={msg.attachmentData}
                                            download={msg.attachmentName}
                                            className="underline font-bold shrink-0"
                                          >
                                            Download
                                          </a>
                                        </div>
                                      </div>
                                    )}

                                    {/* Voice Note Attachment */}
                                    {msg.messageType === 'audio' && msg.attachmentData && (
                                      <div className="mb-1.5 space-y-1">
                                        <div className="flex items-center gap-1 text-[10px] font-bold opacity-85">
                                          <Mic className="w-3 h-3 text-amber-400" />
                                          <span>Voice Note ({formatFileSize(msg.attachmentSize)})</span>
                                        </div>
                                        <audio
                                          controls
                                          src={msg.attachmentData}
                                          className="h-8 max-w-[240px]"
                                        />
                                      </div>
                                    )}

                                    {/* Document Attachment */}
                                    {msg.messageType === 'document' && msg.attachmentData && (
                                      <div
                                        className={`rounded-xl p-2.5 mb-1.5 flex items-center justify-between gap-2.5 border ${
                                          isMine
                                            ? 'bg-white/10 border-white/15'
                                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'
                                        }`}
                                      >
                                        <div className="flex items-center gap-2 min-w-0">
                                          <FileText className="w-5 h-5 text-amber-400 shrink-0" />
                                          <div className="min-w-0">
                                            <div className="text-xs font-extrabold truncate">
                                              {msg.attachmentName}
                                            </div>
                                            <div className="text-[10px] opacity-75">
                                              {formatFileSize(msg.attachmentSize)}
                                            </div>
                                          </div>
                                        </div>
                                        <a
                                          href={msg.attachmentData}
                                          download={msg.attachmentName}
                                          className={`px-2 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 shrink-0 ${
                                            isMine
                                              ? 'bg-white/20 hover:bg-white/30 text-white'
                                              : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-white'
                                          }`}
                                        >
                                          <Download className="w-3.5 h-3.5" />
                                          <span>Save</span>
                                        </a>
                                      </div>
                                    )}

                                    {/* Plain Text Body */}
                                    {!siteCard && !locCard && msg.body && (
                                      <p className="whitespace-pre-wrap break-words leading-relaxed">
                                        {msg.body}
                                      </p>
                                    )}
                                  </>
                                )}

                                {/* Bubble Meta Footer */}
                                <div
                                  className={`flex items-center justify-end gap-1.5 mt-1 text-[9px] tabular-nums ${
                                    isMine
                                      ? 'text-slate-300'
                                      : 'text-slate-400 dark:text-slate-500'
                                  }`}
                                >
                                  {msg.isEdited && !msg.isDeleted && (
                                    <span>edited</span>
                                  )}
                                  {!msg.isDeleted && (
                                    <span title="Time remaining before automatic permanent deletion">
                                      {formatTimeUntilExpiry(msg.expiresAt)}
                                    </span>
                                  )}
                                  <span>·</span>
                                  <span>{formatMessageTime(msg.createdAt)}</span>
                                  {isMine && !msg.isDeleted && (
                                    <span title={isReadByOther ? 'Read' : 'Delivered'}>
                                      {isReadByOther ? (
                                        <CheckCheck className="w-3.5 h-3.5 text-sky-400 inline" />
                                      ) : (
                                        <Check className="w-3.5 h-3.5 text-slate-400 inline" />
                                      )}
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Emoji Reactions Row */}
                              {!msg.isDeleted &&
                                Object.keys(msg.reactions || {}).length > 0 && (
                                  <div className="flex flex-wrap gap-1 px-1">
                                    {Object.entries(msg.reactions).map(
                                      ([emoji, usersList]) => {
                                        const iReacted = usersList.some(
                                          u => u.uid === authUser.uid
                                        );
                                        return (
                                          <button
                                            key={emoji}
                                            type="button"
                                            onClick={() =>
                                              onToggleReaction(msg.id, emoji)
                                            }
                                            title={usersList
                                              .map(u => u.name)
                                              .join(', ')}
                                            className={`px-1.5 py-0.5 rounded-full text-[11px] font-bold flex items-center gap-1 border cursor-pointer ${
                                              iReacted
                                                ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-400 text-blue-700 dark:text-blue-300'
                                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                                            }`}
                                          >
                                            <span>{emoji}</span>
                                            <span className="tabular-nums text-[10px]">
                                              {usersList.length}
                                            </span>
                                          </button>
                                        );
                                      }
                                    )}
                                  </div>
                                )}

                              {/* Hover/Tap Action Controls */}
                              {!msg.isDeleted && (
                                <div className="flex items-center gap-1 opacity-75 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity px-1">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setReactionPickerMsgId(prev =>
                                        prev === msg.id ? null : msg.id
                                      )
                                    }
                                    title="Add reaction"
                                    className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 cursor-pointer"
                                  >
                                    <Smile className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setReplyingTo(msg);
                                      setEditingMsg(null);
                                    }}
                                    title="Reply"
                                    className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 cursor-pointer"
                                  >
                                    <Reply className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => onTogglePin(msg.id)}
                                    title={msg.isPinned ? 'Unpin' : 'Pin message'}
                                    className={`p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer ${
                                      msg.isPinned
                                        ? 'text-amber-500'
                                        : 'text-slate-500'
                                    }`}
                                  >
                                    <Pin className="w-3.5 h-3.5" />
                                  </button>
                                  {isMine && msg.messageType === 'text' && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingMsg(msg);
                                        setReplyingTo(null);
                                        setDraftText(msg.body);
                                      }}
                                      title="Edit message"
                                      className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 cursor-pointer"
                                    >
                                      <Edit3 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  {(isMine || isSuperAdmin) && (
                                    <button
                                      type="button"
                                      onClick={() => onDeleteMessage(msg.id)}
                                      title="Delete for everyone"
                                      className="p-1 rounded hover:bg-rose-100 dark:hover:bg-rose-950/60 text-rose-500 cursor-pointer"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              )}

                              {/* Inline Emoji Reaction Picker */}
                              {reactionPickerMsgId === msg.id && (
                                <div className="flex items-center gap-1 p-1 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-md">
                                  {ALLOWED_CHAT_REACTIONS.map(emoji => (
                                    <button
                                      key={emoji}
                                      type="button"
                                      onClick={() => {
                                        onToggleReaction(msg.id, emoji);
                                        setReactionPickerMsgId(null);
                                      }}
                                      className="w-7 h-7 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-sm flex items-center justify-center cursor-pointer"
                                    >
                                      {emoji}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </React.Fragment>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>
              )}

              {/* Typing Indicator */}
              {typingUser && (
                <div className="px-4 py-1 text-[11px] font-bold text-blue-600 dark:text-blue-400 bg-white dark:bg-slate-950">
                  {typingUser} is typing...
                </div>
              )}

              {/* Quick Site Replies Strip */}
              {showQuickReplies && (
                <div className="px-3.5 py-2 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex flex-wrap gap-1.5">
                  {QUICK_SITE_REPLIES.map(reply => (
                    <button
                      key={reply}
                      type="button"
                      onClick={() => {
                        setDraftText(prev => (prev ? `${prev} ${reply}` : reply));
                        setShowQuickReplies(false);
                      }}
                      className="px-2.5 py-1 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-blue-400 text-[11px] font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
                    >
                      {reply}
                    </button>
                  ))}
                </div>
              )}

              {/* Pending Reply / Edit / Attachment Banner */}
              {(replyingTo || editingMsg || pendingAttachment) && (
                <div className="px-3.5 py-2 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 space-y-1.5">
                  {replyingTo && (
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <div className="min-w-0 border-l-2 border-blue-500 pl-2">
                        <div className="font-bold text-blue-600 dark:text-blue-400 text-[11px]">
                          Replying to {replyingTo.senderName}
                        </div>
                        <div className="truncate text-slate-600 dark:text-slate-300">
                          {replyingTo.body || replyingTo.attachmentName}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setReplyingTo(null)}
                        className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  {editingMsg && (
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-bold text-amber-600 dark:text-amber-400">
                        Editing your message
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingMsg(null);
                          setDraftText('');
                        }}
                        className="text-xs font-bold text-slate-500 underline cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  )}

                  {pendingAttachment && (
                    <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                      <div className="flex items-center gap-2 min-w-0">
                        {pendingAttachment.kind === 'image' ? (
                          <ImageIcon className="w-4 h-4 text-blue-500 shrink-0" />
                        ) : pendingAttachment.kind === 'audio' ? (
                          <Mic className="w-4 h-4 text-rose-500 shrink-0" />
                        ) : (
                          <FileText className="w-4 h-4 text-emerald-500 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-800 dark:text-white truncate">
                            {pendingAttachment.fileName}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {formatFileSize(pendingAttachment.sizeBytes)} · Ready to send
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPendingAttachment(null)}
                        className="p-1 text-slate-400 hover:text-rose-500 cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* COMPOSER FOOTER */}
              <form
                onSubmit={handleSendSubmit}
                className="p-2.5 sm:p-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2 shrink-0"
              >
                {/* Power Action Row */}
                <div className="flex items-center justify-between gap-1 overflow-x-auto pb-0.5">
                  <div className="flex items-center gap-1">
                    <input
                      ref={fileInputRef}
                      type="file"
                      onChange={handleFileInputChange}
                      accept=".pdf,.xlsx,.xls,.csv,.doc,.docx,.ppt,.pptx,.txt,.zip,.png,.jpg,.jpeg,.webp,.gif,.mp3,.wav,.m4a,.ogg,.webm"
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      title="Attach PDF, Excel, Word, or Photo (max 4 MB)"
                      className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-bold flex items-center gap-1 whitespace-nowrap cursor-pointer"
                    >
                      <Paperclip className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                      <span>Doc / Photo</span>
                    </button>

                    {isRecording ? (
                      <button
                        type="button"
                        onClick={stopVoiceRecording}
                        className="px-2 py-1 rounded-lg bg-rose-600 text-white text-[11px] font-extrabold flex items-center gap-1 whitespace-nowrap animate-pulse cursor-pointer"
                      >
                        <Square className="w-3 h-3 fill-current" />
                        <span>Stop ({recordingSec}s)</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={startVoiceRecording}
                        title="Record voice note"
                        className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-bold flex items-center gap-1 whitespace-nowrap cursor-pointer"
                      >
                        <Mic className="w-3.5 h-3.5 text-rose-500" />
                        <span className="hidden sm:inline">Voice</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={handleShareSiteCard}
                      title="Share live active site status card"
                      className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-bold flex items-center gap-1 whitespace-nowrap cursor-pointer"
                    >
                      <Building2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span className="hidden md:inline">Site Card</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleShareLocation}
                      title="Share current GPS location pin"
                      className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-bold flex items-center gap-1 whitespace-nowrap cursor-pointer"
                    >
                      <MapPin className="w-3.5 h-3.5 text-rose-500" />
                      <span className="hidden md:inline">GPS</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowQuickReplies(q => !q)}
                      title="Quick site reply templates"
                      className={`px-2 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 whitespace-nowrap cursor-pointer ${
                        showQuickReplies
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Quick</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsUrgent(u => !u)}
                    title="Mark message as Urgent Priority Alert"
                    className={`px-2 py-1 rounded-lg text-[11px] font-extrabold flex items-center gap-1 whitespace-nowrap cursor-pointer shrink-0 ${
                      isUrgent
                        ? 'bg-amber-500 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span>Urgent</span>
                  </button>
                </div>

                {/* Text Input + Send Button */}
                <div className="flex items-end gap-2">
                  <textarea
                    rows={1}
                    value={draftText}
                    onChange={e => handleDraftChange(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendSubmit();
                      }
                    }}
                    placeholder={
                      editingMsg
                        ? 'Edit message...'
                        : `Message ${
                            activeContact ? activeContact.displayName : 'Global Team Room'
                          }...`
                    }
                    aria-label="Chat message input"
                    className="flex-1 resize-none max-h-28 px-3.5 py-2.5 text-xs sm:text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="submit"
                    disabled={sending || (!draftText.trim() && !pendingAttachment)}
                    aria-label="Send message"
                    className="px-4 py-2.5 rounded-xl bg-[#152E4D] hover:bg-[#1e3f69] disabled:opacity-40 text-white text-xs sm:text-sm font-extrabold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                  >
                    <Send className="w-4 h-4" />
                    <span className="hidden sm:inline">
                      {editingMsg ? 'Update' : 'Send'}
                    </span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* FULL-SCREEN IMAGE LIGHTBOX */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-60 bg-slate-950/90 flex flex-col items-center justify-center p-4"
          onClick={() => setLightboxImage(null)}
        >
          <div className="max-w-4xl max-h-[85vh] flex flex-col items-center gap-3">
            <img
              src={lightboxImage.src}
              alt={lightboxImage.name}
              className="max-h-[78vh] rounded-xl object-contain shadow-2xl"
              onClick={e => e.stopPropagation()}
            />
            <div className="flex items-center gap-3 text-white text-xs font-bold">
              <span>{lightboxImage.name}</span>
              <a
                href={lightboxImage.src}
                download={lightboxImage.name}
                onClick={e => e.stopPropagation()}
                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1"
              >
                <Download className="w-3.5 h-3.5" />
                Download
              </a>
              <button
                type="button"
                onClick={() => setLightboxImage(null)}
                className="px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
