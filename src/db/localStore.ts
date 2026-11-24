import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { SubscriptionTier, SubscriptionVerificationStatus } from '../utils/accountLogic.ts';
import type { ChatMessageType, ChatReactionsMap } from '../utils/chatLogic.ts';

export interface LocalUserRecord {
  id: number;
  uid: string;
  email: string;
  displayName: string;
  photoUrl: string;
  role: string;
  subscriptionTier: string;
  subscriptionVerified: boolean;
  subscriptionVerificationStatus: string;
  subscriptionRequestedTier: string;
  subscriptionProofUrl: string;
  subscriptionVerifiedAt: string | null;
  subscriptionVerifiedBy: string;
  statusMessage: string;
  signInCount: number;
  lastSignInAt: string;
  lastActiveAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface LocalSiteSnapshotRecord {
  id: number;
  userId: number;
  siteId: string;
  subgroupId: string;
  siteName: string;
  subgroupName: string;
  payloadJson: unknown;
  updatedAt: string;
}

export interface LocalBookkeepingSnapshotRecord {
  id: number;
  userId: number;
  siteId: string;
  subgroupId: string;
  siteName: string;
  subgroupName: string;
  monthKey: string;
  workerCount: number;
  totalLaborCost: number;
  totalMaterialValue: number;
  totalAdvances: number;
  netPayable: number;
  exportedAt: string;
}

export interface LocalChatMessageRecord {
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
  reactionsJson: ChatReactionsMap;
  isPinned: boolean;
  isUrgent: boolean;
  isEdited: boolean;
  isDeleted: boolean;
  readByJson: string[];
  createdAt: string;
  expiresAt: string;
}

export interface LocalStoreData {
  counters: {
    users: number;
    siteSnapshots: number;
    bookkeepingSnapshots: number;
    chatMessages: number;
  };
  users: LocalUserRecord[];
  siteSnapshots: LocalSiteSnapshotRecord[];
  bookkeepingSnapshots: LocalBookkeepingSnapshotRecord[];
  chatMessages: LocalChatMessageRecord[];
}

function createEmptyStore(): LocalStoreData {
  return {
    counters: {
      users: 0,
      siteSnapshots: 0,
      bookkeepingSnapshots: 0,
      chatMessages: 0
    },
    users: [],
    siteSnapshots: [],
    bookkeepingSnapshots: [],
    chatMessages: []
  };
}

function resolveStoreFilePath(): string {
  const custom = process.env.LOCAL_STORE_PATH?.trim();
  if (custom) return custom;
  return path.join(os.tmpdir(), 'attendance-portal-local-store.json');
}

let cachedStore: LocalStoreData | null = null;
let cachedStorePath: string | null = null;

export function resetLocalStoreCache(): void {
  cachedStore = null;
  cachedStorePath = null;
}

export function loadLocalStore(): LocalStoreData {
  const targetPath = resolveStoreFilePath();
  if (cachedStore && cachedStorePath === targetPath) {
    return cachedStore;
  }

  try {
    if (fs.existsSync(targetPath)) {
      const raw = fs.readFileSync(targetPath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<LocalStoreData>;
      cachedStore = {
        counters: {
          users: Number(parsed.counters?.users) || 0,
          siteSnapshots: Number(parsed.counters?.siteSnapshots) || 0,
          bookkeepingSnapshots: Number(parsed.counters?.bookkeepingSnapshots) || 0,
          chatMessages: Number(parsed.counters?.chatMessages) || 0
        },
        users: Array.isArray(parsed.users) ? parsed.users : [],
        siteSnapshots: Array.isArray(parsed.siteSnapshots) ? parsed.siteSnapshots : [],
        bookkeepingSnapshots: Array.isArray(parsed.bookkeepingSnapshots)
          ? parsed.bookkeepingSnapshots
          : [],
        chatMessages: Array.isArray(parsed.chatMessages) ? parsed.chatMessages : []
      };
      cachedStorePath = targetPath;
      return cachedStore;
    }
  } catch (err) {
    console.warn('Could not read local fallback store, initializing fresh state:', err);
  }

  cachedStore = createEmptyStore();
  cachedStorePath = targetPath;
  return cachedStore;
}

export function saveLocalStore(store: LocalStoreData): void {
  const targetPath = resolveStoreFilePath();
  cachedStore = store;
  cachedStorePath = targetPath;
  try {
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tmpPath = `${targetPath}.${process.pid}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(store), 'utf-8');
    fs.renameSync(tmpPath, targetPath);
  } catch (err) {
    // Keep operating cleanly in memory even on read-only filesystems
    console.warn('Local fallback store kept in memory (disk write skipped):', err);
  }
}

export function isSqlConnectionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const check = (obj: unknown, depth = 0): boolean => {
    if (!obj || typeof obj !== 'object' || depth > 4) return false;
    const rec = obj as Record<string, unknown>;
    const code = typeof rec.code === 'string' ? rec.code : '';
    const msg = typeof rec.message === 'string' ? rec.message : '';
    if (
      code === 'ECONNREFUSED' ||
      code === 'ENOTFOUND' ||
      code === 'EHOSTUNREACH' ||
      code === 'ETIMEDOUT' ||
      code === '57P01' ||
      msg.includes('ECONNREFUSED') ||
      msg.includes('connect ECONNREFUSED') ||
      msg.includes('Connection terminated unexpectedly')
    ) {
      return true;
    }
    return check(rec.cause, depth + 1);
  };
  return check(error);
}

export function hydrateUserDates(user: LocalUserRecord) {
  return {
    ...user,
    subscriptionTier: user.subscriptionTier as SubscriptionTier,
    subscriptionVerificationStatus:
      user.subscriptionVerificationStatus as SubscriptionVerificationStatus,
    subscriptionVerifiedAt: user.subscriptionVerifiedAt
      ? new Date(user.subscriptionVerifiedAt)
      : null,
    lastSignInAt: new Date(user.lastSignInAt),
    lastActiveAt: new Date(user.lastActiveAt),
    createdAt: new Date(user.createdAt),
    updatedAt: new Date(user.updatedAt)
  };
}
