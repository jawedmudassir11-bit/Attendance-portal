import { sanitizeAvatarUrl } from './siteLogic.ts';

export type SubscriptionTier = 'standard' | 'pro' | 'ultra';
export type SubscriptionVerificationStatus =
  | 'none'
  | 'pending'
  | 'verified'
  | 'rejected';

export const SUBSCRIPTION_TIERS: readonly SubscriptionTier[] = [
  'standard',
  'pro',
  'ultra'
] as const;

export const SUBSCRIPTION_TIER_META: Record<
  SubscriptionTier,
  {
    label: string;
    pillText: string;
    fullName: string;
    tagline: string;
  }
> = {
  standard: {
    label: 'Standard',
    pillText: '',
    fullName: 'Google Account',
    tagline: 'Standard profile styling'
  },
  pro: {
    label: 'Pro',
    pillText: 'Pro',
    fullName: 'Verified Google AI Pro',
    tagline: 'Verified Google AI Pro iridescent ring & badge'
  },
  ultra: {
    label: 'Ultra',
    pillText: 'Ultra',
    fullName: 'Verified Google AI Ultra',
    tagline: 'Verified Google AI Ultra prismatic ring & badge'
  }
};

export interface SavedGoogleAccount {
  uid: string;
  slotKey: string;
  email: string;
  displayName: string;
  photoUrl: string;
  role: string;
  subscriptionTier: SubscriptionTier;
  subscriptionVerified: boolean;
  lastUsedAt: string;
}

export function normalizeSubscriptionTier(value?: unknown): SubscriptionTier {
  if (typeof value !== 'string') return 'standard';
  const clean = value.trim().toLowerCase();
  if (clean === 'pro' || clean === 'ultra' || clean === 'standard') {
    return clean;
  }
  return 'standard';
}

export function normalizeVerificationStatus(
  value?: unknown
): SubscriptionVerificationStatus {
  if (typeof value !== 'string') return 'none';
  const clean = value.trim().toLowerCase();
  if (
    clean === 'none' ||
    clean === 'pending' ||
    clean === 'verified' ||
    clean === 'rejected'
  ) {
    return clean;
  }
  return 'none';
}

/**
 * Only returns 'pro' or 'ultra' when verified by Google subscription check / Super Admin approval.
 * Unverified accounts always resolve strictly to 'standard'.
 */
export function getEffectiveVerifiedTier(
  tier?: unknown,
  verified?: unknown
): SubscriptionTier {
  if (verified !== true) return 'standard';
  const normalized = normalizeSubscriptionTier(tier);
  return normalized === 'pro' || normalized === 'ultra' ? normalized : 'standard';
}

export function upsertSavedAccount(
  existingList: SavedGoogleAccount[],
  incoming: {
    uid: string;
    slotKey?: string;
    email: string;
    displayName?: string;
    photoUrl?: string;
    role?: string;
    subscriptionTier?: SubscriptionTier;
    subscriptionVerified?: boolean;
    lastUsedAt?: string;
  }
): SavedGoogleAccount[] {
  const cleanUid = (incoming.uid || '').trim();
  const cleanEmail = (incoming.email || '').trim().toLowerCase();
  if (!cleanUid || !cleanEmail) return existingList;

  const existingMatch = existingList.find(
    acc => acc.uid === cleanUid || acc.email.toLowerCase() === cleanEmail
  );

  const verified =
    typeof incoming.subscriptionVerified === 'boolean'
      ? incoming.subscriptionVerified
      : existingMatch?.subscriptionVerified ?? false;

  const rawTier =
    incoming.subscriptionTier ?? existingMatch?.subscriptionTier ?? 'standard';

  const nextEntry: SavedGoogleAccount = {
    uid: cleanUid,
    slotKey:
      (incoming.slotKey || '').trim() ||
      existingMatch?.slotKey ||
      '[DEFAULT]',
    email: cleanEmail,
    displayName:
      (incoming.displayName || '').trim() ||
      existingMatch?.displayName ||
      cleanEmail.split('@')[0],
    photoUrl:
      sanitizeAvatarUrl(incoming.photoUrl) ||
      sanitizeAvatarUrl(existingMatch?.photoUrl) ||
      '',
    role: incoming.role || existingMatch?.role || 'member',
    subscriptionTier: getEffectiveVerifiedTier(rawTier, verified),
    subscriptionVerified: verified,
    lastUsedAt: incoming.lastUsedAt || new Date().toISOString()
  };

  const filtered = existingList.filter(
    acc => acc.uid !== cleanUid && acc.email.toLowerCase() !== cleanEmail
  );

  return sortSavedAccounts([nextEntry, ...filtered]).slice(0, 10);
}

export function removeSavedAccount(
  existingList: SavedGoogleAccount[],
  uidOrEmail: string
): SavedGoogleAccount[] {
  const target = (uidOrEmail || '').trim().toLowerCase();
  if (!target) return existingList;
  return existingList.filter(
    acc => acc.uid.toLowerCase() !== target && acc.email.toLowerCase() !== target
  );
}

export function sortSavedAccounts(
  list: SavedGoogleAccount[],
  activeUid?: string | null
): SavedGoogleAccount[] {
  return [...list].sort((a, b) => {
    if (activeUid) {
      if (a.uid === activeUid && b.uid !== activeUid) return -1;
      if (b.uid === activeUid && a.uid !== activeUid) return 1;
    }
    const ta = new Date(a.lastUsedAt || 0).getTime() || 0;
    const tb = new Date(b.lastUsedAt || 0).getTime() || 0;
    return tb - ta;
  });
}

export function validateProfilePhotoInput(params: {
  mimeType: string;
  sizeBytes: number;
}): { valid: boolean; error?: string } {
  const allowed = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);
  const normalizedMime = (params.mimeType || '').split(';')[0].trim().toLowerCase();
  if (!allowed.has(normalizedMime)) {
    return {
      valid: false,
      error: 'Please choose a PNG, JPG, or WebP image.'
    };
  }
  if (!Number.isFinite(params.sizeBytes) || params.sizeBytes <= 0) {
    return { valid: false, error: 'Selected image appears empty.' };
  }
  if (params.sizeBytes > 6 * 1024 * 1024) {
    return { valid: false, error: 'Image must be smaller than 6 MB.' };
  }
  return { valid: true };
}
