export const CHAT_RETENTION_DAYS = 5;
export const CHAT_RETENTION_MS = CHAT_RETENTION_DAYS * 24 * 60 * 60 * 1000;
export const TEAM_LOBBY_THREAD_KEY = 'team_lobby';
export const TEAM_RECIPIENT_UID = 'ALL';
export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024; // 4 MB

export const ALLOWED_CHAT_REACTIONS = ['👍', '✅', '🔥', '❤️', '🙏', '👀'] as const;

export const ALLOWED_USER_STATUSES = [
  'Available',
  'On Site',
  'In Meeting',
  'Busy'
] as const;

export const QUICK_SITE_REPLIES = [
  'Approved ✅',
  'Send challan photo 📄',
  'DPR updated for today',
  'Checking attendance now',
  'On my way to site 🚧',
  'Please share wage sheet'
] as const;

export type ChatMessageType =
  | 'text'
  | 'image'
  | 'document'
  | 'audio'
  | 'site_card'
  | 'location';

export interface ChatReactionEntry {
  uid: string;
  name: string;
}

export type ChatReactionsMap = Record<string, ChatReactionEntry[]>;

export interface ChatMessageDTO {
  id: number;
  threadKey: string;
  senderUid: string;
  recipientUid: string;
  senderName: string;
  senderEmail: string;
  senderPhoto: string;
  messageType: ChatMessageType;
  body: string;
  attachmentName: string;
  attachmentMime: string;
  attachmentSize: number;
  attachmentData: string;
  replyToId: number | null;
  replyToPreview: string;
  replyToSender: string;
  reactions: ChatReactionsMap;
  isPinned: boolean;
  isUrgent: boolean;
  isEdited: boolean;
  isDeleted: boolean;
  readBy: string[];
  createdAt: string;
  expiresAt: string;
}

export interface ChatContactDTO {
  uid: string;
  email: string;
  displayName: string;
  photoUrl: string;
  role: string;
  subscriptionTier?: 'standard' | 'pro' | 'ultra';
  statusMessage: string;
  isOnline: boolean;
  lastActiveAt: string;
  unreadCount: number;
  lastMessagePreview: string;
  lastMessageAt: string;
}

const ALLOWED_IMAGE_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif'
]);

const ALLOWED_AUDIO_MIMES = new Set([
  'audio/webm',
  'audio/ogg',
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/wav',
  'audio/x-wav',
  'audio/aac',
  'audio/m4a',
  'audio/x-m4a'
]);

const ALLOWED_DOC_MIMES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
  'application/x-zip-compressed',
  'application/octet-stream'
]);

const BLOCKED_EXTENSIONS = new Set([
  '.html',
  '.htm',
  '.svg',
  '.js',
  '.mjs',
  '.cjs',
  '.jsx',
  '.ts',
  '.tsx',
  '.exe',
  '.bat',
  '.cmd',
  '.sh',
  '.ps1',
  '.php',
  '.jsp'
]);

export function buildThreadKey(uidA: string, uidB: string): string {
  const a = (uidA || '').trim();
  const b = (uidB || '').trim();
  if (!a || !b) return TEAM_LOBBY_THREAD_KEY;
  if (a === TEAM_RECIPIENT_UID || b === TEAM_RECIPIENT_UID) {
    return TEAM_LOBBY_THREAD_KEY;
  }
  return a < b ? `${a}__${b}` : `${b}__${a}`;
}

export function isUserParticipantInThread(
  threadKey: string,
  userUid: string
): boolean {
  if (!threadKey || !userUid) return false;
  if (threadKey === TEAM_LOBBY_THREAD_KEY) return true;
  const parts = threadKey.split('__');
  return parts.length === 2 && (parts[0] === userUid || parts[1] === userUid);
}

export function computeExpiryDate(createdAt: Date = new Date()): Date {
  return new Date(createdAt.getTime() + CHAT_RETENTION_MS);
}

export function isMessageExpired(
  expiresAt: string | Date,
  nowMs: number = Date.now()
): boolean {
  const expMs =
    expiresAt instanceof Date
      ? expiresAt.getTime()
      : new Date(expiresAt).getTime();
  if (Number.isNaN(expMs)) return true;
  return expMs <= nowMs;
}

export function formatTimeUntilExpiry(
  expiresAt: string | Date,
  nowMs: number = Date.now()
): string {
  const expMs =
    expiresAt instanceof Date
      ? expiresAt.getTime()
      : new Date(expiresAt).getTime();
  if (Number.isNaN(expMs)) return 'Expiring';
  const diffMs = expMs - nowMs;
  if (diffMs <= 0) return 'Expired';
  const totalMinutes = Math.floor(diffMs / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const mins = totalMinutes % 60;
  if (days >= 1) {
    return `${days}d ${hours}h left`;
  }
  if (hours >= 1) {
    return `${hours}h ${mins}m left`;
  }
  return `${Math.max(1, mins)}m left`;
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function sanitizeFilename(name: string): string {
  const base = (name || 'attachment')
    .replace(/[/\\?%*:|"<>]/g, '_')
    .trim();
  return base.slice(0, 140) || 'attachment';
}

export function validateChatAttachment(params: {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  dataUrl?: string;
}): {
  valid: boolean;
  messageType?: 'image' | 'audio' | 'document';
  sanitizedName?: string;
  normalizedMime?: string;
  error?: string;
} {
  const sanitizedName = sanitizeFilename(params.fileName);
  const lowerName = sanitizedName.toLowerCase();
  const dotIdx = lowerName.lastIndexOf('.');
  const ext = dotIdx >= 0 ? lowerName.slice(dotIdx) : '';

  if (ext && BLOCKED_EXTENSIONS.has(ext)) {
    return {
      valid: false,
      error: `File type ${ext} is not allowed for security reasons.`
    };
  }

  if (!Number.isFinite(params.sizeBytes) || params.sizeBytes <= 0) {
    return { valid: false, error: 'Attachment file appears empty.' };
  }

  if (params.sizeBytes > MAX_ATTACHMENT_BYTES) {
    return {
      valid: false,
      error: `File exceeds ${formatFileSize(MAX_ATTACHMENT_BYTES)} limit.`
    };
  }

  const rawMime = (params.mimeType || 'application/octet-stream')
    .split(';')[0]
    .trim()
    .toLowerCase();

  if (
    rawMime === 'text/html' ||
    rawMime === 'image/svg+xml' ||
    rawMime === 'application/javascript' ||
    rawMime === 'text/javascript'
  ) {
    return {
      valid: false,
      error: 'Active web scripts/HTML/SVG files cannot be shared.'
    };
  }

  let messageType: 'image' | 'audio' | 'document' | null = null;
  if (ALLOWED_IMAGE_MIMES.has(rawMime)) {
    messageType = 'image';
  } else if (ALLOWED_AUDIO_MIMES.has(rawMime)) {
    messageType = 'audio';
  } else if (ALLOWED_DOC_MIMES.has(rawMime)) {
    messageType = 'document';
  }

  if (!messageType) {
    return {
      valid: false,
      error: `Unsupported file format (${rawMime}). Share PDF, Excel, Word, images, or voice notes.`
    };
  }

  if (params.dataUrl !== undefined) {
    if (
      typeof params.dataUrl !== 'string' ||
      !params.dataUrl.startsWith('data:') ||
      !params.dataUrl.includes(';base64,')
    ) {
      return { valid: false, error: 'Invalid base64 attachment encoding.' };
    }
    // Base64 overhead is ~1.37x; cap encoded string length accordingly
    if (params.dataUrl.length > Math.ceil(MAX_ATTACHMENT_BYTES * 1.45)) {
      return { valid: false, error: 'Encoded attachment exceeds size limit.' };
    }
  }

  return {
    valid: true,
    messageType,
    sanitizedName,
    normalizedMime: rawMime
  };
}

export function toggleReactionInMap(
  current: ChatReactionsMap,
  emoji: string,
  uid: string,
  name: string
): ChatReactionsMap {
  const next: ChatReactionsMap = {};
  for (const [key, list] of Object.entries(current || {})) {
    if (Array.isArray(list) && list.length > 0) {
      next[key] = [...list];
    }
  }

  const existing = next[emoji] || [];
  const idx = existing.findIndex(item => item.uid === uid);
  if (idx >= 0) {
    const updated = existing.filter(item => item.uid !== uid);
    if (updated.length > 0) {
      next[emoji] = updated;
    } else {
      delete next[emoji];
    }
  } else {
    next[emoji] = [...existing, { uid, name: name || 'User' }];
  }

  return next;
}

export function mergeChatMessageIdempotent(
  messages: ChatMessageDTO[],
  incoming: ChatMessageDTO
): ChatMessageDTO[] {
  const idx = messages.findIndex(m => m.id === incoming.id);
  if (idx >= 0) {
    const copy = [...messages];
    copy[idx] = incoming;
    return copy;
  }
  return [...messages, incoming].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}
