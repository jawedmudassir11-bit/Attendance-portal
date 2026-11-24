import { and, asc, desc, eq, gt, lte, or } from 'drizzle-orm';
import { getSqlDb, markSqlUnavailableRuntime } from './index.ts';
import { chatMessages, users } from './schema.ts';
import {
  isSqlConnectionError,
  loadLocalStore,
  saveLocalStore,
  type LocalChatMessageRecord
} from './localStore.ts';
import { sanitizeAvatarUrl } from '../utils/siteLogic.ts';
import { getEffectiveVerifiedTier } from '../utils/accountLogic.ts';
import {
  ALLOWED_CHAT_REACTIONS,
  ALLOWED_USER_STATUSES,
  TEAM_LOBBY_THREAD_KEY,
  TEAM_RECIPIENT_UID,
  buildThreadKey,
  computeExpiryDate,
  isUserParticipantInThread,
  toggleReactionInMap,
  validateChatAttachment,
  type ChatContactDTO,
  type ChatMessageDTO,
  type ChatMessageType,
  type ChatReactionsMap
} from '../utils/chatLogic.ts';

function rowToMessageDTO(
  row: typeof chatMessages.$inferSelect | LocalChatMessageRecord
): ChatMessageDTO {
  const reactions =
    row.reactionsJson && typeof row.reactionsJson === 'object'
      ? (row.reactionsJson as ChatReactionsMap)
      : {};
  const readBy = Array.isArray(row.readByJson)
    ? (row.readByJson as string[]).filter(v => typeof v === 'string')
    : [];

  return {
    id: row.id,
    threadKey: row.threadKey,
    senderUid: row.senderUid,
    recipientUid: row.recipientUid,
    senderName: row.senderName,
    senderEmail: row.senderEmail,
    senderPhoto: sanitizeAvatarUrl(row.senderPhoto),
    messageType: (row.messageType as ChatMessageType) || 'text',
    body: row.isDeleted ? '' : row.body,
    attachmentName: row.isDeleted ? '' : row.attachmentName,
    attachmentMime: row.isDeleted ? '' : row.attachmentMime,
    attachmentSize: row.isDeleted ? 0 : row.attachmentSize,
    attachmentData: row.isDeleted ? '' : row.attachmentData,
    replyToId: row.replyToId ?? null,
    replyToPreview: row.replyToPreview || '',
    replyToSender: row.replyToSender || '',
    reactions,
    isPinned: Boolean(row.isPinned),
    isUrgent: Boolean(row.isUrgent),
    isEdited: Boolean(row.isEdited),
    isDeleted: Boolean(row.isDeleted),
    readBy,
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : new Date().toISOString(),
    expiresAt: row.expiresAt ? new Date(row.expiresAt).toISOString() : computeExpiryDate().toISOString()
  };
}

function purgeExpiredChatMessagesLocal(): number {
  const store = loadLocalStore();
  const nowMs = Date.now();
  const before = store.chatMessages.length;
  store.chatMessages = store.chatMessages.filter(
    m => new Date(m.expiresAt).getTime() > nowMs
  );
  const removed = before - store.chatMessages.length;
  if (removed > 0) saveLocalStore(store);
  return removed;
}

export async function purgeExpiredChatMessages(): Promise<number> {
  const sqlDb = getSqlDb();
  if (!sqlDb) {
    return purgeExpiredChatMessagesLocal();
  }
  try {
    const deleted = await sqlDb
      .delete(chatMessages)
      .where(lte(chatMessages.expiresAt, new Date()))
      .returning({ id: chatMessages.id });
    return deleted.length;
  } catch (error) {
    if (isSqlConnectionError(error)) {
      markSqlUnavailableRuntime();
      return purgeExpiredChatMessagesLocal();
    }
    console.error('Database cleanup failed (purgeExpiredChatMessages):', error);
    return 0;
  }
}

function touchUserActivityLocal(uid: string, statusMessage?: string) {
  const store = loadLocalStore();
  const user = store.users.find(u => u.uid === uid);
  if (!user) return;
  const nowIso = new Date().toISOString();
  user.lastActiveAt = nowIso;
  user.updatedAt = nowIso;
  if (
    statusMessage &&
    (ALLOWED_USER_STATUSES as readonly string[]).includes(statusMessage)
  ) {
    user.statusMessage = statusMessage;
  }
  saveLocalStore(store);
}

export async function touchUserActivity(uid: string, statusMessage?: string) {
  const sqlDb = getSqlDb();
  if (!sqlDb) {
    touchUserActivityLocal(uid, statusMessage);
    return;
  }
  try {
    const now = new Date();
    const updateSet: Record<string, unknown> = {
      lastActiveAt: now,
      updatedAt: now
    };
    if (
      statusMessage &&
      (ALLOWED_USER_STATUSES as readonly string[]).includes(statusMessage)
    ) {
      updateSet.statusMessage = statusMessage;
    }
    await sqlDb.update(users).set(updateSet).where(eq(users.uid, uid));
  } catch (error) {
    if (isSqlConnectionError(error)) {
      markSqlUnavailableRuntime();
      touchUserActivityLocal(uid, statusMessage);
      return;
    }
    console.error('Failed to touch user activity:', error);
  }
}

function listChatContactsForUserLocal(
  currentUid: string,
  onlineUidSet: Set<string>
): {
  contacts: ChatContactDTO[];
  teamLobby: {
    unreadCount: number;
    lastMessagePreview: string;
    lastMessageAt: string;
  };
  totalUnread: number;
} {
  const store = loadLocalStore();
  const nowMs = Date.now();
  const recentOnlineThresholdMs = nowMs - 90_000;

  const activeMessages = store.chatMessages
    .filter(
      m =>
        new Date(m.expiresAt).getTime() > nowMs &&
        (m.threadKey === TEAM_LOBBY_THREAD_KEY ||
          m.senderUid === currentUid ||
          m.recipientUid === currentUid)
    )
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 400);

  const threadMeta = new Map<
    string,
    { unreadCount: number; lastMessagePreview: string; lastMessageAt: string }
  >();

  for (const msg of activeMessages) {
    const existing = threadMeta.get(msg.threadKey) || {
      unreadCount: 0,
      lastMessagePreview: '',
      lastMessageAt: ''
    };

    if (!existing.lastMessageAt) {
      let preview = msg.body || '';
      if (msg.isDeleted) {
        preview = 'Message deleted';
      } else if (!preview && msg.attachmentName) {
        preview =
          msg.messageType === 'image'
            ? `📷 Photo: ${msg.attachmentName}`
            : msg.messageType === 'audio'
            ? '🎤 Voice note'
            : `📎 ${msg.attachmentName}`;
      } else if (msg.messageType === 'site_card') {
        preview = '🏗️ Site status snapshot';
      } else if (msg.messageType === 'location') {
        preview = '📍 Shared location pin';
      }
      existing.lastMessagePreview = preview.slice(0, 72);
      existing.lastMessageAt = msg.createdAt || '';
    }

    const readBy = Array.isArray(msg.readByJson) ? msg.readByJson : [];
    if (!msg.isDeleted && msg.senderUid !== currentUid && !readBy.includes(currentUid)) {
      existing.unreadCount += 1;
    }

    threadMeta.set(msg.threadKey, existing);
  }

  const teamLobby = threadMeta.get(TEAM_LOBBY_THREAD_KEY) || {
    unreadCount: 0,
    lastMessagePreview: 'Team room for all signed-in members',
    lastMessageAt: ''
  };

  let totalUnread = teamLobby.unreadCount;

  const contacts: ChatContactDTO[] = store.users
    .filter(u => u.uid !== currentUid)
    .map(u => {
      const key = buildThreadKey(currentUid, u.uid);
      const meta = threadMeta.get(key);
      const unreadCount = meta?.unreadCount || 0;
      totalUnread += unreadCount;
      const lastActiveMs = u.lastActiveAt ? new Date(u.lastActiveAt).getTime() : 0;
      const isOnline = onlineUidSet.has(u.uid) || lastActiveMs >= recentOnlineThresholdMs;

      return {
        uid: u.uid,
        email: u.email,
        displayName: u.displayName || u.email.split('@')[0],
        photoUrl: sanitizeAvatarUrl(u.photoUrl),
        role: u.role,
        subscriptionTier: getEffectiveVerifiedTier(u.subscriptionTier, u.subscriptionVerified),
        statusMessage: u.statusMessage || 'Available',
        isOnline,
        lastActiveAt: u.lastActiveAt || '',
        unreadCount,
        lastMessagePreview: meta?.lastMessagePreview || '',
        lastMessageAt: meta?.lastMessageAt || ''
      };
    })
    .sort((a, b) => {
      if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
      if (a.unreadCount !== b.unreadCount) return b.unreadCount - a.unreadCount;
      const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      if (aTime !== bTime) return bTime - aTime;
      return a.displayName.localeCompare(b.displayName);
    });

  return { contacts, teamLobby, totalUnread };
}

export async function listChatContactsForUser(
  currentUid: string,
  onlineUidSet: Set<string>
): Promise<{
  contacts: ChatContactDTO[];
  teamLobby: {
    unreadCount: number;
    lastMessagePreview: string;
    lastMessageAt: string;
  };
  totalUnread: number;
}> {
  const sqlDb = getSqlDb();
  if (!sqlDb) {
    return listChatContactsForUserLocal(currentUid, onlineUidSet);
  }

  try {
    const now = new Date();
    const recentOnlineThresholdMs = Date.now() - 90_000;

    const [allUsers, activeMessages] = await Promise.all([
      sqlDb
        .select({
          uid: users.uid,
          email: users.email,
          displayName: users.displayName,
          photoUrl: users.photoUrl,
          role: users.role,
          subscriptionTier: users.subscriptionTier,
          subscriptionVerified: users.subscriptionVerified,
          statusMessage: users.statusMessage,
          lastActiveAt: users.lastActiveAt
        })
        .from(users)
        .orderBy(desc(users.lastActiveAt))
        .limit(200),
      sqlDb
        .select({
          id: chatMessages.id,
          threadKey: chatMessages.threadKey,
          senderUid: chatMessages.senderUid,
          recipientUid: chatMessages.recipientUid,
          messageType: chatMessages.messageType,
          body: chatMessages.body,
          attachmentName: chatMessages.attachmentName,
          isDeleted: chatMessages.isDeleted,
          readByJson: chatMessages.readByJson,
          createdAt: chatMessages.createdAt
        })
        .from(chatMessages)
        .where(
          and(
            gt(chatMessages.expiresAt, now),
            or(
              eq(chatMessages.threadKey, TEAM_LOBBY_THREAD_KEY),
              eq(chatMessages.senderUid, currentUid),
              eq(chatMessages.recipientUid, currentUid)
            )
          )
        )
        .orderBy(desc(chatMessages.createdAt))
        .limit(400)
    ]);

    const threadMeta = new Map<
      string,
      { unreadCount: number; lastMessagePreview: string; lastMessageAt: string }
    >();

    for (const msg of activeMessages) {
      const existing = threadMeta.get(msg.threadKey) || {
        unreadCount: 0,
        lastMessagePreview: '',
        lastMessageAt: ''
      };

      if (!existing.lastMessageAt) {
        let preview = msg.body || '';
        if (msg.isDeleted) {
          preview = 'Message deleted';
        } else if (!preview && msg.attachmentName) {
          preview =
            msg.messageType === 'image'
              ? `📷 Photo: ${msg.attachmentName}`
              : msg.messageType === 'audio'
              ? '🎤 Voice note'
              : `📎 ${msg.attachmentName}`;
        } else if (msg.messageType === 'site_card') {
          preview = '🏗️ Site status snapshot';
        } else if (msg.messageType === 'location') {
          preview = '📍 Shared location pin';
        }
        existing.lastMessagePreview = preview.slice(0, 72);
        existing.lastMessageAt = msg.createdAt
          ? new Date(msg.createdAt).toISOString()
          : '';
      }

      const readBy = Array.isArray(msg.readByJson)
        ? (msg.readByJson as string[])
        : [];
      if (
        !msg.isDeleted &&
        msg.senderUid !== currentUid &&
        !readBy.includes(currentUid)
      ) {
        existing.unreadCount += 1;
      }

      threadMeta.set(msg.threadKey, existing);
    }

    const teamLobby = threadMeta.get(TEAM_LOBBY_THREAD_KEY) || {
      unreadCount: 0,
      lastMessagePreview: 'Team room for all signed-in members',
      lastMessageAt: ''
    };

    let totalUnread = teamLobby.unreadCount;

    const contacts: ChatContactDTO[] = allUsers
      .filter(u => u.uid !== currentUid)
      .map(u => {
        const key = buildThreadKey(currentUid, u.uid);
        const meta = threadMeta.get(key);
        const unreadCount = meta?.unreadCount || 0;
        totalUnread += unreadCount;
        const lastActiveMs = u.lastActiveAt
          ? new Date(u.lastActiveAt).getTime()
          : 0;
        const isOnline =
          onlineUidSet.has(u.uid) || lastActiveMs >= recentOnlineThresholdMs;

        return {
          uid: u.uid,
          email: u.email,
          displayName: u.displayName || u.email.split('@')[0],
          photoUrl: sanitizeAvatarUrl(u.photoUrl),
          role: u.role,
          subscriptionTier: getEffectiveVerifiedTier(
            u.subscriptionTier,
            u.subscriptionVerified
          ),
          statusMessage: u.statusMessage || 'Available',
          isOnline,
          lastActiveAt: u.lastActiveAt
            ? new Date(u.lastActiveAt).toISOString()
            : '',
          unreadCount,
          lastMessagePreview: meta?.lastMessagePreview || '',
          lastMessageAt: meta?.lastMessageAt || ''
        };
      })
      .sort((a, b) => {
        if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
        if (a.unreadCount !== b.unreadCount) return b.unreadCount - a.unreadCount;
        const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
        const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
        if (aTime !== bTime) return bTime - aTime;
        return a.displayName.localeCompare(b.displayName);
      });

    return { contacts, teamLobby, totalUnread };
  } catch (error) {
    if (isSqlConnectionError(error)) {
      markSqlUnavailableRuntime();
      return listChatContactsForUserLocal(currentUid, onlineUidSet);
    }
    console.error('Database query failed (listChatContactsForUser):', error);
    throw new Error('Failed to load chat contacts.');
  }
}

function getMessagesForThreadLocal(
  threadKey: string,
  currentUid: string,
  limitCount = 150
): ChatMessageDTO[] {
  if (!isUserParticipantInThread(threadKey, currentUid)) {
    throw new Error('Forbidden: Not a participant in this conversation.');
  }
  const store = loadLocalStore();
  const nowMs = Date.now();
  return store.chatMessages
    .filter(m => m.threadKey === threadKey && new Date(m.expiresAt).getTime() > nowMs)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .slice(0, limitCount)
    .map(rowToMessageDTO);
}

export async function getMessagesForThread(
  threadKey: string,
  currentUid: string,
  limitCount = 150
): Promise<ChatMessageDTO[]> {
  if (!isUserParticipantInThread(threadKey, currentUid)) {
    throw new Error('Forbidden: Not a participant in this conversation.');
  }
  const sqlDb = getSqlDb();
  if (!sqlDb) {
    return getMessagesForThreadLocal(threadKey, currentUid, limitCount);
  }
  try {
    const now = new Date();
    const rows = await sqlDb
      .select()
      .from(chatMessages)
      .where(
        and(
          eq(chatMessages.threadKey, threadKey),
          gt(chatMessages.expiresAt, now)
        )
      )
      .orderBy(asc(chatMessages.createdAt))
      .limit(limitCount);

    return rows.map(rowToMessageDTO);
  } catch (error) {
    if (isSqlConnectionError(error)) {
      markSqlUnavailableRuntime();
      return getMessagesForThreadLocal(threadKey, currentUid, limitCount);
    }
    throw error;
  }
}

function createChatMessageLocal(params: {
  senderUid: string;
  senderName: string;
  senderEmail: string;
  senderPhoto: string;
  recipientUid: string;
  messageType?: ChatMessageType;
  body?: string;
  attachment?: {
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    dataUrl: string;
  } | null;
  replyToId?: number | null;
  isUrgent?: boolean;
}): ChatMessageDTO {
  const recipientUid = (params.recipientUid || '').trim();
  if (!recipientUid) {
    throw new Error('recipientUid is required');
  }
  if (recipientUid === params.senderUid) {
    throw new Error('Cannot start a direct chat with yourself');
  }

  const threadKey =
    recipientUid === TEAM_RECIPIENT_UID
      ? TEAM_LOBBY_THREAD_KEY
      : buildThreadKey(params.senderUid, recipientUid);

  const cleanBody = (params.body || '').trim().slice(0, 4000);
  let resolvedType: ChatMessageType = params.messageType || 'text';
  let attachmentName = '';
  let attachmentMime = '';
  let attachmentSize = 0;
  let attachmentData = '';

  if (params.attachment) {
    const check = validateChatAttachment(params.attachment);
    if (!check.valid || !check.messageType || !check.sanitizedName || !check.normalizedMime) {
      throw new Error(check.error || 'Invalid attachment');
    }
    resolvedType = check.messageType;
    attachmentName = check.sanitizedName;
    attachmentMime = check.normalizedMime;
    attachmentSize = Math.round(params.attachment.sizeBytes);
    attachmentData = params.attachment.dataUrl;
  } else if (!cleanBody) {
    throw new Error('Message text or attachment is required');
  }

  const store = loadLocalStore();
  let replyToId: number | null = null;
  let replyToPreview = '';
  let replyToSender = '';
  if (typeof params.replyToId === 'number' && params.replyToId > 0) {
    const parent = store.chatMessages.find(
      m =>
        m.id === params.replyToId &&
        m.threadKey === threadKey &&
        new Date(m.expiresAt).getTime() > Date.now()
    );
    if (parent && !parent.isDeleted) {
      replyToId = parent.id;
      replyToSender = parent.senderName || parent.senderEmail;
      replyToPreview = (
        parent.body ||
        (parent.attachmentName ? `Attachment: ${parent.attachmentName}` : 'Message')
      ).slice(0, 120);
    }
  }

  const now = new Date();
  const expiresAt = computeExpiryDate(now);
  store.counters.chatMessages += 1;

  const created: LocalChatMessageRecord = {
    id: store.counters.chatMessages,
    threadKey,
    senderUid: params.senderUid,
    recipientUid,
    senderName: (params.senderName || params.senderEmail.split('@')[0]).slice(0, 120),
    senderEmail: params.senderEmail.trim().toLowerCase(),
    senderPhoto: sanitizeAvatarUrl(params.senderPhoto),
    messageType: resolvedType,
    body: cleanBody,
    attachmentName,
    attachmentMime,
    attachmentSize,
    attachmentData,
    replyToId,
    replyToPreview,
    replyToSender,
    reactionsJson: {},
    isPinned: false,
    isUrgent: Boolean(params.isUrgent),
    isEdited: false,
    isDeleted: false,
    readByJson: [params.senderUid],
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString()
  };

  store.chatMessages.push(created);
  saveLocalStore(store);
  return rowToMessageDTO(created);
}

export async function createChatMessage(params: {
  senderUid: string;
  senderName: string;
  senderEmail: string;
  senderPhoto: string;
  recipientUid: string;
  messageType?: ChatMessageType;
  body?: string;
  attachment?: {
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    dataUrl: string;
  } | null;
  replyToId?: number | null;
  isUrgent?: boolean;
}): Promise<ChatMessageDTO> {
  const sqlDb = getSqlDb();
  if (!sqlDb) {
    return createChatMessageLocal(params);
  }

  try {
    const recipientUid = (params.recipientUid || '').trim();
    if (!recipientUid) {
      throw new Error('recipientUid is required');
    }
    if (recipientUid === params.senderUid) {
      throw new Error('Cannot start a direct chat with yourself');
    }

    const threadKey =
      recipientUid === TEAM_RECIPIENT_UID
        ? TEAM_LOBBY_THREAD_KEY
        : buildThreadKey(params.senderUid, recipientUid);

    const cleanBody = (params.body || '').trim().slice(0, 4000);
    let resolvedType: ChatMessageType = params.messageType || 'text';
    let attachmentName = '';
    let attachmentMime = '';
    let attachmentSize = 0;
    let attachmentData = '';

    if (params.attachment) {
      const check = validateChatAttachment(params.attachment);
      if (!check.valid || !check.messageType || !check.sanitizedName || !check.normalizedMime) {
        throw new Error(check.error || 'Invalid attachment');
      }
      resolvedType = check.messageType;
      attachmentName = check.sanitizedName;
      attachmentMime = check.normalizedMime;
      attachmentSize = Math.round(params.attachment.sizeBytes);
      attachmentData = params.attachment.dataUrl;
    } else if (!cleanBody) {
      throw new Error('Message text or attachment is required');
    }

    let replyToId: number | null = null;
    let replyToPreview = '';
    let replyToSender = '';
    if (typeof params.replyToId === 'number' && params.replyToId > 0) {
      const parentRows = await sqlDb
        .select()
        .from(chatMessages)
        .where(
          and(
            eq(chatMessages.id, params.replyToId),
            eq(chatMessages.threadKey, threadKey),
            gt(chatMessages.expiresAt, new Date())
          )
        )
        .limit(1);
      const parent = parentRows[0];
      if (parent && !parent.isDeleted) {
        replyToId = parent.id;
        replyToSender = parent.senderName || parent.senderEmail;
        replyToPreview = (
          parent.body ||
          (parent.attachmentName ? `Attachment: ${parent.attachmentName}` : 'Message')
        ).slice(0, 120);
      }
    }

    const now = new Date();
    const expiresAt = computeExpiryDate(now);

    const inserted = await sqlDb
      .insert(chatMessages)
      .values({
        threadKey,
        senderUid: params.senderUid,
        recipientUid,
        senderName: (params.senderName || params.senderEmail.split('@')[0]).slice(0, 120),
        senderEmail: params.senderEmail.trim().toLowerCase(),
        senderPhoto: sanitizeAvatarUrl(params.senderPhoto),
        messageType: resolvedType,
        body: cleanBody,
        attachmentName,
        attachmentMime,
        attachmentSize,
        attachmentData,
        replyToId,
        replyToPreview,
        replyToSender,
        reactionsJson: {},
        isPinned: false,
        isUrgent: Boolean(params.isUrgent),
        isEdited: false,
        isDeleted: false,
        readByJson: [params.senderUid],
        createdAt: now,
        expiresAt
      })
      .returning();

    return rowToMessageDTO(inserted[0]);
  } catch (error) {
    if (isSqlConnectionError(error)) {
      markSqlUnavailableRuntime();
      return createChatMessageLocal(params);
    }
    throw error;
  }
}

function markThreadMessagesReadLocal(threadKey: string, readerUid: string): number[] {
  if (!isUserParticipantInThread(threadKey, readerUid)) {
    throw new Error('Forbidden');
  }
  const store = loadLocalStore();
  const nowMs = Date.now();
  const updatedIds: number[] = [];
  for (const row of store.chatMessages) {
    if (row.threadKey !== threadKey || new Date(row.expiresAt).getTime() <= nowMs) continue;
    const list = Array.isArray(row.readByJson) ? row.readByJson : [];
    if (row.senderUid !== readerUid && !list.includes(readerUid)) {
      row.readByJson = [...list, readerUid];
      updatedIds.push(row.id);
    }
  }
  if (updatedIds.length > 0) saveLocalStore(store);
  return updatedIds;
}

export async function markThreadMessagesRead(
  threadKey: string,
  readerUid: string
): Promise<number[]> {
  if (!isUserParticipantInThread(threadKey, readerUid)) {
    throw new Error('Forbidden');
  }
  const sqlDb = getSqlDb();
  if (!sqlDb) {
    return markThreadMessagesReadLocal(threadKey, readerUid);
  }
  try {
    const now = new Date();
    const rows = await sqlDb
      .select({
        id: chatMessages.id,
        senderUid: chatMessages.senderUid,
        readByJson: chatMessages.readByJson
      })
      .from(chatMessages)
      .where(
        and(
          eq(chatMessages.threadKey, threadKey),
          gt(chatMessages.expiresAt, now)
        )
      );

    const updatedIds: number[] = [];
    for (const row of rows) {
      const list = Array.isArray(row.readByJson) ? (row.readByJson as string[]) : [];
      if (row.senderUid !== readerUid && !list.includes(readerUid)) {
        const nextList = [...list, readerUid];
        await sqlDb
          .update(chatMessages)
          .set({ readByJson: nextList })
          .where(eq(chatMessages.id, row.id));
        updatedIds.push(row.id);
      }
    }
    return updatedIds;
  } catch (error) {
    if (isSqlConnectionError(error)) {
      markSqlUnavailableRuntime();
      return markThreadMessagesReadLocal(threadKey, readerUid);
    }
    throw error;
  }
}

function toggleMessageReactionLocal(
  messageId: number,
  uid: string,
  name: string,
  emoji: string
): ChatMessageDTO {
  if (!(ALLOWED_CHAT_REACTIONS as readonly string[]).includes(emoji)) {
    throw new Error('Unsupported reaction emoji');
  }
  const store = loadLocalStore();
  const existing = store.chatMessages.find(
    m => m.id === messageId && new Date(m.expiresAt).getTime() > Date.now()
  );
  if (!existing) throw new Error('Message not found or expired');
  if (!isUserParticipantInThread(existing.threadKey, uid)) throw new Error('Forbidden');
  existing.reactionsJson = toggleReactionInMap(existing.reactionsJson || {}, emoji, uid, name);
  saveLocalStore(store);
  return rowToMessageDTO(existing);
}

export async function toggleMessageReaction(
  messageId: number,
  uid: string,
  name: string,
  emoji: string
): Promise<ChatMessageDTO> {
  const sqlDb = getSqlDb();
  if (!sqlDb) {
    return toggleMessageReactionLocal(messageId, uid, name, emoji);
  }
  try {
    if (!(ALLOWED_CHAT_REACTIONS as readonly string[]).includes(emoji)) {
      throw new Error('Unsupported reaction emoji');
    }
    const rows = await sqlDb
      .select()
      .from(chatMessages)
      .where(
        and(eq(chatMessages.id, messageId), gt(chatMessages.expiresAt, new Date()))
      )
      .limit(1);
    const existing = rows[0];
    if (!existing) {
      throw new Error('Message not found or expired');
    }
    if (!isUserParticipantInThread(existing.threadKey, uid)) {
      throw new Error('Forbidden');
    }
    const currentMap =
      existing.reactionsJson && typeof existing.reactionsJson === 'object'
        ? (existing.reactionsJson as ChatReactionsMap)
        : {};
    const nextReactions = toggleReactionInMap(currentMap, emoji, uid, name);

    const updated = await sqlDb
      .update(chatMessages)
      .set({ reactionsJson: nextReactions })
      .where(eq(chatMessages.id, messageId))
      .returning();

    return rowToMessageDTO(updated[0]);
  } catch (error) {
    if (isSqlConnectionError(error)) {
      markSqlUnavailableRuntime();
      return toggleMessageReactionLocal(messageId, uid, name, emoji);
    }
    throw error;
  }
}

function toggleMessagePinLocal(messageId: number, uid: string): ChatMessageDTO {
  const store = loadLocalStore();
  const existing = store.chatMessages.find(
    m => m.id === messageId && new Date(m.expiresAt).getTime() > Date.now()
  );
  if (!existing || existing.isDeleted) throw new Error('Message not found or expired');
  if (!isUserParticipantInThread(existing.threadKey, uid)) throw new Error('Forbidden');
  existing.isPinned = !existing.isPinned;
  saveLocalStore(store);
  return rowToMessageDTO(existing);
}

export async function toggleMessagePin(
  messageId: number,
  uid: string
): Promise<ChatMessageDTO> {
  const sqlDb = getSqlDb();
  if (!sqlDb) {
    return toggleMessagePinLocal(messageId, uid);
  }
  try {
    const rows = await sqlDb
      .select()
      .from(chatMessages)
      .where(
        and(eq(chatMessages.id, messageId), gt(chatMessages.expiresAt, new Date()))
      )
      .limit(1);
    const existing = rows[0];
    if (!existing || existing.isDeleted) {
      throw new Error('Message not found or expired');
    }
    if (!isUserParticipantInThread(existing.threadKey, uid)) {
      throw new Error('Forbidden');
    }

    const updated = await sqlDb
      .update(chatMessages)
      .set({ isPinned: !existing.isPinned })
      .where(eq(chatMessages.id, messageId))
      .returning();

    return rowToMessageDTO(updated[0]);
  } catch (error) {
    if (isSqlConnectionError(error)) {
      markSqlUnavailableRuntime();
      return toggleMessagePinLocal(messageId, uid);
    }
    throw error;
  }
}

function editOwnMessageLocal(
  messageId: number,
  senderUid: string,
  newBody: string
): ChatMessageDTO {
  const cleanBody = (newBody || '').trim().slice(0, 4000);
  if (!cleanBody) throw new Error('Updated message cannot be empty');
  const store = loadLocalStore();
  const existing = store.chatMessages.find(
    m => m.id === messageId && new Date(m.expiresAt).getTime() > Date.now()
  );
  if (!existing || existing.isDeleted) throw new Error('Message not found or expired');
  if (existing.senderUid !== senderUid) {
    throw new Error('Forbidden: You can only edit your own messages');
  }
  existing.body = cleanBody;
  existing.isEdited = true;
  saveLocalStore(store);
  return rowToMessageDTO(existing);
}

export async function editOwnMessage(
  messageId: number,
  senderUid: string,
  newBody: string
): Promise<ChatMessageDTO> {
  const sqlDb = getSqlDb();
  if (!sqlDb) {
    return editOwnMessageLocal(messageId, senderUid, newBody);
  }
  try {
    const cleanBody = (newBody || '').trim().slice(0, 4000);
    if (!cleanBody) {
      throw new Error('Updated message cannot be empty');
    }
    const rows = await sqlDb
      .select()
      .from(chatMessages)
      .where(
        and(eq(chatMessages.id, messageId), gt(chatMessages.expiresAt, new Date()))
      )
      .limit(1);
    const existing = rows[0];
    if (!existing || existing.isDeleted) {
      throw new Error('Message not found or expired');
    }
    if (existing.senderUid !== senderUid) {
      throw new Error('Forbidden: You can only edit your own messages');
    }

    const updated = await sqlDb
      .update(chatMessages)
      .set({ body: cleanBody, isEdited: true })
      .where(eq(chatMessages.id, messageId))
      .returning();

    return rowToMessageDTO(updated[0]);
  } catch (error) {
    if (isSqlConnectionError(error)) {
      markSqlUnavailableRuntime();
      return editOwnMessageLocal(messageId, senderUid, newBody);
    }
    throw error;
  }
}

function deleteMessageForEveryoneLocal(
  messageId: number,
  requesterUid: string,
  isSuperAdmin: boolean
): ChatMessageDTO {
  const store = loadLocalStore();
  const existing = store.chatMessages.find(m => m.id === messageId);
  if (!existing) throw new Error('Message not found');
  if (existing.senderUid !== requesterUid && !isSuperAdmin) {
    throw new Error('Forbidden: Only the sender or a Super Admin can delete this message');
  }
  existing.isDeleted = true;
  existing.isPinned = false;
  existing.body = '';
  existing.attachmentName = '';
  existing.attachmentMime = '';
  existing.attachmentSize = 0;
  existing.attachmentData = '';
  existing.reactionsJson = {};
  saveLocalStore(store);
  return rowToMessageDTO(existing);
}

export async function deleteMessageForEveryone(
  messageId: number,
  requesterUid: string,
  isSuperAdmin: boolean
): Promise<ChatMessageDTO> {
  const sqlDb = getSqlDb();
  if (!sqlDb) {
    return deleteMessageForEveryoneLocal(messageId, requesterUid, isSuperAdmin);
  }
  try {
    const rows = await sqlDb
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.id, messageId))
      .limit(1);
    const existing = rows[0];
    if (!existing) {
      throw new Error('Message not found');
    }
    if (existing.senderUid !== requesterUid && !isSuperAdmin) {
      throw new Error('Forbidden: Only the sender or a Super Admin can delete this message');
    }

    const updated = await sqlDb
      .update(chatMessages)
      .set({
        isDeleted: true,
        isPinned: false,
        body: '',
        attachmentName: '',
        attachmentMime: '',
        attachmentSize: 0,
        attachmentData: '',
        reactionsJson: {}
      })
      .where(eq(chatMessages.id, messageId))
      .returning();

    return rowToMessageDTO(updated[0]);
  } catch (error) {
    if (isSqlConnectionError(error)) {
      markSqlUnavailableRuntime();
      return deleteMessageForEveryoneLocal(messageId, requesterUid, isSuperAdmin);
    }
    throw error;
  }
}
