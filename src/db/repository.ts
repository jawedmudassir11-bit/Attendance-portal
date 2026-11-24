import { and, desc, eq, sql } from 'drizzle-orm';
import { getSqlDb, markSqlUnavailableRuntime } from './index.ts';
import { bookkeepingSnapshots, siteSnapshots, users } from './schema.ts';
import {
  hydrateUserDates,
  isSqlConnectionError,
  loadLocalStore,
  saveLocalStore,
  type LocalUserRecord
} from './localStore.ts';
import { isSuperAdminEmail, sanitizeAvatarUrl } from '../utils/siteLogic.ts';
import {
  getEffectiveVerifiedTier,
  normalizeSubscriptionTier,
  normalizeVerificationStatus,
  type SubscriptionTier,
  type SubscriptionVerificationStatus
} from '../utils/accountLogic.ts';

export interface SyncUserParams {
  uid: string;
  email: string;
  displayName?: string;
  photoUrl?: string;
  incrementSignIn?: boolean;
}

function getOrCreateUserLocal(params: SyncUserParams) {
  const store = loadLocalStore();
  const normalizedEmail = (params.email || `${params.uid}@users.local`)
    .trim()
    .toLowerCase();
  const cleanName = (params.displayName || '').trim();
  const safePhoto = sanitizeAvatarUrl(params.photoUrl);
  const computedRole = isSuperAdminEmail(normalizedEmail)
    ? 'super_admin'
    : 'member';
  const nowIso = new Date().toISOString();

  const existing = store.users.find(u => u.uid === params.uid);
  if (existing) {
    existing.email = normalizedEmail;
    existing.role = computedRole;
    existing.updatedAt = nowIso;
    if (cleanName && !existing.displayName) {
      existing.displayName = cleanName;
    }
    if (
      safePhoto &&
      !existing.photoUrl.startsWith('data:image/') &&
      !existing.photoUrl.startsWith('/assets/')
    ) {
      existing.photoUrl = safePhoto;
    }
    if (params.incrementSignIn) {
      existing.signInCount = (Number(existing.signInCount) || 0) + 1;
      existing.lastSignInAt = nowIso;
    }
    saveLocalStore(store);
    return hydrateUserDates(existing);
  }

  store.counters.users += 1;
  const created: LocalUserRecord = {
    id: store.counters.users,
    uid: params.uid,
    email: normalizedEmail,
    displayName: cleanName,
    photoUrl: safePhoto,
    role: computedRole,
    subscriptionTier: 'standard',
    subscriptionVerified: false,
    subscriptionVerificationStatus: 'none',
    subscriptionRequestedTier: '',
    subscriptionProofUrl: '',
    subscriptionVerifiedAt: null,
    subscriptionVerifiedBy: '',
    statusMessage: 'Available',
    signInCount: 1,
    lastSignInAt: nowIso,
    lastActiveAt: nowIso,
    createdAt: nowIso,
    updatedAt: nowIso
  };
  store.users.push(created);
  saveLocalStore(store);
  return hydrateUserDates(created);
}

export async function getOrCreateUser(params: SyncUserParams) {
  const sqlDb = getSqlDb();
  if (!sqlDb) {
    return getOrCreateUserLocal(params);
  }

  try {
    const normalizedEmail = (params.email || `${params.uid}@users.local`)
      .trim()
      .toLowerCase();
    const cleanName = (params.displayName || '').trim();
    const safePhoto = sanitizeAvatarUrl(params.photoUrl);
    const computedRole = isSuperAdminEmail(normalizedEmail)
      ? 'super_admin'
      : 'member';
    const now = new Date();

    const updateSet: Record<string, unknown> = {
      email: normalizedEmail,
      role: computedRole,
      updatedAt: now
    };

    if (cleanName) {
      updateSet.displayName = sql`CASE WHEN ${users.displayName} = '' THEN ${cleanName} ELSE ${users.displayName} END`;
    }
    if (safePhoto) {
      updateSet.photoUrl = sql`CASE WHEN ${users.photoUrl} LIKE 'data:image/%' OR ${users.photoUrl} LIKE '/assets/%' THEN ${users.photoUrl} ELSE ${safePhoto} END`;
    }
    if (params.incrementSignIn) {
      updateSet.signInCount = sql`${users.signInCount} + 1`;
      updateSet.lastSignInAt = now;
    }

    const result = await sqlDb
      .insert(users)
      .values({
        uid: params.uid,
        email: normalizedEmail,
        displayName: cleanName,
        photoUrl: safePhoto,
        role: computedRole,
        subscriptionTier: 'standard',
        subscriptionVerified: false,
        subscriptionVerificationStatus: 'none',
        signInCount: 1,
        lastSignInAt: now,
        updatedAt: now
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: updateSet
      })
      .returning();

    return result[0];
  } catch (error) {
    if (isSqlConnectionError(error)) {
      markSqlUnavailableRuntime();
      return getOrCreateUserLocal(params);
    }
    console.error('Database query failed (getOrCreateUser):', error);
    throw new Error('Database query failed. Please try again later.', {
      cause: error
    });
  }
}

function updateUserProfileLocal(params: {
  uid: string;
  displayName?: string;
  photoUrl?: string | null;
}) {
  const store = loadLocalStore();
  const existing = store.users.find(u => u.uid === params.uid);
  if (!existing) return null;
  if (typeof params.displayName === 'string') {
    const cleaned = params.displayName.trim().slice(0, 80);
    if (cleaned) existing.displayName = cleaned;
  }
  if (params.photoUrl !== undefined) {
    existing.photoUrl = params.photoUrl ? sanitizeAvatarUrl(params.photoUrl) : '';
  }
  existing.updatedAt = new Date().toISOString();
  saveLocalStore(store);
  return hydrateUserDates(existing);
}

export async function updateUserProfile(params: {
  uid: string;
  displayName?: string;
  photoUrl?: string | null;
}) {
  const sqlDb = getSqlDb();
  if (!sqlDb) {
    return updateUserProfileLocal(params);
  }

  try {
    const updateSet: Record<string, unknown> = {
      updatedAt: new Date()
    };

    if (typeof params.displayName === 'string') {
      const cleaned = params.displayName.trim().slice(0, 80);
      if (cleaned) {
        updateSet.displayName = cleaned;
      }
    }

    if (params.photoUrl !== undefined) {
      updateSet.photoUrl = params.photoUrl
        ? sanitizeAvatarUrl(params.photoUrl)
        : '';
    }

    const updated = await sqlDb
      .update(users)
      .set(updateSet)
      .where(eq(users.uid, params.uid))
      .returning();

    return updated[0] || null;
  } catch (error) {
    if (isSqlConnectionError(error)) {
      markSqlUnavailableRuntime();
      return updateUserProfileLocal(params);
    }
    console.error('Database query failed (updateUserProfile):', error);
    throw new Error('Failed to update user profile.');
  }
}

function submitSubscriptionVerificationLocal(params: {
  uid: string;
  requestedTier: 'pro' | 'ultra';
  proofUrl: string;
}) {
  const safeProof = sanitizeAvatarUrl(params.proofUrl);
  if (!safeProof) {
    throw new Error('A valid PNG, JPG, or WebP subscription screenshot is required.');
  }
  const store = loadLocalStore();
  const existing = store.users.find(u => u.uid === params.uid);
  if (!existing) return null;
  existing.subscriptionRequestedTier = params.requestedTier;
  existing.subscriptionProofUrl = safeProof;
  existing.subscriptionVerificationStatus = 'pending';
  existing.updatedAt = new Date().toISOString();
  saveLocalStore(store);
  return hydrateUserDates(existing);
}

export async function submitSubscriptionVerificationRequest(params: {
  uid: string;
  requestedTier: 'pro' | 'ultra';
  proofUrl: string;
}) {
  const sqlDb = getSqlDb();
  if (!sqlDb) {
    return submitSubscriptionVerificationLocal(params);
  }

  try {
    const safeProof = sanitizeAvatarUrl(params.proofUrl);
    if (!safeProof) {
      throw new Error('A valid PNG, JPG, or WebP subscription screenshot is required.');
    }
    const updated = await sqlDb
      .update(users)
      .set({
        subscriptionRequestedTier: params.requestedTier,
        subscriptionProofUrl: safeProof,
        subscriptionVerificationStatus: 'pending',
        updatedAt: new Date()
      })
      .where(eq(users.uid, params.uid))
      .returning();

    return updated[0] || null;
  } catch (error) {
    if (isSqlConnectionError(error)) {
      markSqlUnavailableRuntime();
      return submitSubscriptionVerificationLocal(params);
    }
    console.error('Database query failed (submitSubscriptionVerificationRequest):', error);
    throw error instanceof Error
      ? error
      : new Error('Failed to submit subscription verification.');
  }
}

function reviewUserSubscriptionVerificationLocal(params: {
  targetUid: string;
  tier: SubscriptionTier;
  verifiedByEmail: string;
  action?: 'approve' | 'reject';
}) {
  const store = loadLocalStore();
  const existing = store.users.find(u => u.uid === params.targetUid);
  if (!existing) return null;
  const nowIso = new Date().toISOString();
  const isReject = params.action === 'reject' || params.tier === 'standard';
  const normalizedTier = isReject ? 'standard' : normalizeSubscriptionTier(params.tier);
  existing.subscriptionTier = normalizedTier;
  existing.subscriptionVerified = !isReject;
  existing.subscriptionVerificationStatus =
    params.action === 'reject'
      ? 'rejected'
      : isReject
      ? 'none'
      : 'verified';
  existing.subscriptionRequestedTier = '';
  existing.subscriptionVerifiedAt = isReject ? null : nowIso;
  existing.subscriptionVerifiedBy = isReject ? '' : params.verifiedByEmail;
  existing.updatedAt = nowIso;
  saveLocalStore(store);
  return hydrateUserDates(existing);
}

export async function reviewUserSubscriptionVerification(params: {
  targetUid: string;
  tier: SubscriptionTier;
  verifiedByEmail: string;
  action?: 'approve' | 'reject';
}) {
  const sqlDb = getSqlDb();
  if (!sqlDb) {
    return reviewUserSubscriptionVerificationLocal(params);
  }

  try {
    const now = new Date();
    const isReject = params.action === 'reject' || params.tier === 'standard';
    const normalizedTier = isReject ? 'standard' : normalizeSubscriptionTier(params.tier);

    const updated = await sqlDb
      .update(users)
      .set({
        subscriptionTier: normalizedTier,
        subscriptionVerified: !isReject,
        subscriptionVerificationStatus:
          params.action === 'reject'
            ? 'rejected'
            : isReject
            ? 'none'
            : 'verified',
        subscriptionRequestedTier: '',
        subscriptionVerifiedAt: isReject ? null : now,
        subscriptionVerifiedBy: isReject ? '' : params.verifiedByEmail,
        updatedAt: now
      })
      .where(eq(users.uid, params.targetUid))
      .returning();

    return updated[0] || null;
  } catch (error) {
    if (isSqlConnectionError(error)) {
      markSqlUnavailableRuntime();
      return reviewUserSubscriptionVerificationLocal(params);
    }
    console.error('Database query failed (reviewUserSubscriptionVerification):', error);
    throw new Error('Failed to update verified subscription status.');
  }
}

function getSiteSnapshotForUserLocal(uid: string, siteId: string, subgroupId: string) {
  const store = loadLocalStore();
  const user = store.users.find(u => u.uid === uid);
  if (!user) return null;
  const row = store.siteSnapshots.find(
    s => s.userId === user.id && s.siteId === siteId && s.subgroupId === subgroupId
  );
  if (!row) return null;
  return {
    id: row.id,
    siteId: row.siteId,
    subgroupId: row.subgroupId,
    siteName: row.siteName,
    subgroupName: row.subgroupName,
    payloadJson: row.payloadJson,
    updatedAt: new Date(row.updatedAt)
  };
}

export async function getSiteSnapshotForUser(
  uid: string,
  siteId: string,
  subgroupId: string
) {
  const sqlDb = getSqlDb();
  if (!sqlDb) {
    return getSiteSnapshotForUserLocal(uid, siteId, subgroupId);
  }

  try {
    const rows = await sqlDb
      .select({
        id: siteSnapshots.id,
        siteId: siteSnapshots.siteId,
        subgroupId: siteSnapshots.subgroupId,
        siteName: siteSnapshots.siteName,
        subgroupName: siteSnapshots.subgroupName,
        payloadJson: siteSnapshots.payloadJson,
        updatedAt: siteSnapshots.updatedAt
      })
      .from(siteSnapshots)
      .innerJoin(users, eq(siteSnapshots.userId, users.id))
      .where(
        and(
          eq(users.uid, uid),
          eq(siteSnapshots.siteId, siteId),
          eq(siteSnapshots.subgroupId, subgroupId)
        )
      )
      .limit(1);

    return rows[0] || null;
  } catch (error) {
    if (isSqlConnectionError(error)) {
      markSqlUnavailableRuntime();
      return getSiteSnapshotForUserLocal(uid, siteId, subgroupId);
    }
    console.error('Database query failed (getSiteSnapshotForUser):', error);
    throw new Error('Database query failed. Please try again later.', {
      cause: error
    });
  }
}

function upsertSiteSnapshotForUserLocal(params: {
  uid: string;
  email: string;
  displayName?: string;
  photoUrl?: string;
  siteId: string;
  subgroupId: string;
  siteName: string;
  subgroupName: string;
  payloadJson: unknown;
}) {
  const user = getOrCreateUserLocal({
    uid: params.uid,
    email: params.email,
    displayName: params.displayName || '',
    photoUrl: params.photoUrl || ''
  });
  const store = loadLocalStore();
  const nowIso = new Date().toISOString();
  const existing = store.siteSnapshots.find(
    s =>
      s.userId === user.id &&
      s.siteId === params.siteId &&
      s.subgroupId === params.subgroupId
  );
  if (existing) {
    existing.siteName = params.siteName;
    existing.subgroupName = params.subgroupName;
    existing.payloadJson = params.payloadJson;
    existing.updatedAt = nowIso;
    saveLocalStore(store);
    return { ...existing, updatedAt: new Date(existing.updatedAt) };
  }

  store.counters.siteSnapshots += 1;
  const created = {
    id: store.counters.siteSnapshots,
    userId: user.id,
    siteId: params.siteId,
    subgroupId: params.subgroupId,
    siteName: params.siteName,
    subgroupName: params.subgroupName,
    payloadJson: params.payloadJson,
    updatedAt: nowIso
  };
  store.siteSnapshots.push(created);
  saveLocalStore(store);
  return { ...created, updatedAt: new Date(created.updatedAt) };
}

export async function upsertSiteSnapshotForUser(params: {
  uid: string;
  email: string;
  displayName?: string;
  photoUrl?: string;
  siteId: string;
  subgroupId: string;
  siteName: string;
  subgroupName: string;
  payloadJson: unknown;
}) {
  const sqlDb = getSqlDb();
  if (!sqlDb) {
    return upsertSiteSnapshotForUserLocal(params);
  }

  try {
    const user = await getOrCreateUser({
      uid: params.uid,
      email: params.email,
      displayName: params.displayName || '',
      photoUrl: params.photoUrl || ''
    });
    const result = await sqlDb
      .insert(siteSnapshots)
      .values({
        userId: user.id,
        siteId: params.siteId,
        subgroupId: params.subgroupId,
        siteName: params.siteName,
        subgroupName: params.subgroupName,
        payloadJson: params.payloadJson,
        updatedAt: new Date()
      })
      .onConflictDoUpdate({
        target: [
          siteSnapshots.userId,
          siteSnapshots.siteId,
          siteSnapshots.subgroupId
        ],
        set: {
          siteName: params.siteName,
          subgroupName: params.subgroupName,
          payloadJson: params.payloadJson,
          updatedAt: new Date()
        }
      })
      .returning();

    return result[0];
  } catch (error) {
    if (isSqlConnectionError(error)) {
      markSqlUnavailableRuntime();
      return upsertSiteSnapshotForUserLocal(params);
    }
    console.error('Database query failed (upsertSiteSnapshotForUser):', error);
    throw new Error('Database query failed. Please try again later.', {
      cause: error
    });
  }
}

function recordBookkeepingSnapshotLocal(params: {
  uid: string;
  email: string;
  displayName?: string;
  photoUrl?: string;
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
}) {
  const user = getOrCreateUserLocal({
    uid: params.uid,
    email: params.email,
    displayName: params.displayName || '',
    photoUrl: params.photoUrl || ''
  });
  const store = loadLocalStore();
  store.counters.bookkeepingSnapshots += 1;
  const nowIso = new Date().toISOString();
  const created = {
    id: store.counters.bookkeepingSnapshots,
    userId: user.id,
    siteId: params.siteId,
    subgroupId: params.subgroupId,
    siteName: params.siteName,
    subgroupName: params.subgroupName,
    monthKey: params.monthKey,
    workerCount: Math.round(params.workerCount),
    totalLaborCost: Math.round(params.totalLaborCost),
    totalMaterialValue: Math.round(params.totalMaterialValue),
    totalAdvances: Math.round(params.totalAdvances),
    netPayable: Math.round(params.netPayable),
    exportedAt: nowIso
  };
  store.bookkeepingSnapshots.push(created);
  saveLocalStore(store);
  return { ...created, exportedAt: new Date(created.exportedAt) };
}

export async function recordBookkeepingSnapshot(params: {
  uid: string;
  email: string;
  displayName?: string;
  photoUrl?: string;
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
}) {
  const sqlDb = getSqlDb();
  if (!sqlDb) {
    return recordBookkeepingSnapshotLocal(params);
  }

  try {
    const user = await getOrCreateUser({
      uid: params.uid,
      email: params.email,
      displayName: params.displayName || '',
      photoUrl: params.photoUrl || ''
    });
    const result = await sqlDb
      .insert(bookkeepingSnapshots)
      .values({
        userId: user.id,
        siteId: params.siteId,
        subgroupId: params.subgroupId,
        siteName: params.siteName,
        subgroupName: params.subgroupName,
        monthKey: params.monthKey,
        workerCount: Math.round(params.workerCount),
        totalLaborCost: Math.round(params.totalLaborCost),
        totalMaterialValue: Math.round(params.totalMaterialValue),
        totalAdvances: Math.round(params.totalAdvances),
        netPayable: Math.round(params.netPayable),
        exportedAt: new Date()
      })
      .returning();

    return result[0];
  } catch (error) {
    if (isSqlConnectionError(error)) {
      markSqlUnavailableRuntime();
      return recordBookkeepingSnapshotLocal(params);
    }
    console.error('Database query failed (recordBookkeepingSnapshot):', error);
    throw new Error('Database query failed. Please try again later.', {
      cause: error
    });
  }
}

function listBookkeepingSnapshotsForUserLocal(uid: string, siteId?: string) {
  const store = loadLocalStore();
  const user = store.users.find(u => u.uid === uid);
  if (!user) return [];
  return store.bookkeepingSnapshots
    .filter(row => row.userId === user.id && (!siteId || row.siteId === siteId))
    .sort((a, b) => new Date(b.exportedAt).getTime() - new Date(a.exportedAt).getTime())
    .slice(0, 24)
    .map(row => ({
      id: row.id,
      siteId: row.siteId,
      subgroupId: row.subgroupId,
      siteName: row.siteName,
      subgroupName: row.subgroupName,
      monthKey: row.monthKey,
      workerCount: row.workerCount,
      totalLaborCost: row.totalLaborCost,
      totalMaterialValue: row.totalMaterialValue,
      totalAdvances: row.totalAdvances,
      netPayable: row.netPayable,
      exportedAt: new Date(row.exportedAt)
    }));
}

export async function listBookkeepingSnapshotsForUser(
  uid: string,
  siteId?: string
) {
  const sqlDb = getSqlDb();
  if (!sqlDb) {
    return listBookkeepingSnapshotsForUserLocal(uid, siteId);
  }

  try {
    const conditions = [eq(users.uid, uid)];
    if (siteId) {
      conditions.push(eq(bookkeepingSnapshots.siteId, siteId));
    }

    return await sqlDb
      .select({
        id: bookkeepingSnapshots.id,
        siteId: bookkeepingSnapshots.siteId,
        subgroupId: bookkeepingSnapshots.subgroupId,
        siteName: bookkeepingSnapshots.siteName,
        subgroupName: bookkeepingSnapshots.subgroupName,
        monthKey: bookkeepingSnapshots.monthKey,
        workerCount: bookkeepingSnapshots.workerCount,
        totalLaborCost: bookkeepingSnapshots.totalLaborCost,
        totalMaterialValue: bookkeepingSnapshots.totalMaterialValue,
        totalAdvances: bookkeepingSnapshots.totalAdvances,
        netPayable: bookkeepingSnapshots.netPayable,
        exportedAt: bookkeepingSnapshots.exportedAt
      })
      .from(bookkeepingSnapshots)
      .innerJoin(users, eq(bookkeepingSnapshots.userId, users.id))
      .where(and(...conditions))
      .orderBy(desc(bookkeepingSnapshots.exportedAt))
      .limit(24);
  } catch (error) {
    if (isSqlConnectionError(error)) {
      markSqlUnavailableRuntime();
      return listBookkeepingSnapshotsForUserLocal(uid, siteId);
    }
    console.error(
      'Database query failed (listBookkeepingSnapshotsForUser):',
      error
    );
    throw new Error('Database query failed. Please try again later.', {
      cause: error
    });
  }
}

export interface AdminPortalOverview {
  summary: {
    totalSignedInUsers: number;
    totalCumulativeSignIns: number;
    activeLast24h: number;
    activeLast7d: number;
    superAdminCount: number;
    totalSiteSnapshots: number;
    totalBookkeepingExports: number;
  };
  users: {
    id: number;
    uid: string;
    email: string;
    displayName: string;
    photoUrl: string;
    role: string;
    subscriptionTier: SubscriptionTier;
    subscriptionVerified: boolean;
    subscriptionVerificationStatus: SubscriptionVerificationStatus;
    subscriptionRequestedTier: string;
    subscriptionProofUrl: string;
    signInCount: number;
    createdAt: string;
    lastSignInAt: string;
  }[];
  recentSiteSnapshots: {
    id: number;
    siteName: string;
    subgroupName: string;
    ownerEmail: string;
    ownerName: string;
    workerCount: number;
    dprCount: number;
    updatedAt: string;
  }[];
  recentBookkeepingExports: {
    id: number;
    siteName: string;
    subgroupName: string;
    monthKey: string;
    workerCount: number;
    totalLaborCost: number;
    totalMaterialValue: number;
    totalAdvances: number;
    netPayable: number;
    ownerEmail: string;
    ownerName: string;
    exportedAt: string;
  }[];
}

function getAdminPortalOverviewLocal(): AdminPortalOverview {
  const store = loadLocalStore();
  const userById = new Map(store.users.map(u => [u.id, u]));
  const sortedUsers = [...store.users]
    .sort((a, b) => new Date(b.lastSignInAt).getTime() - new Date(a.lastSignInAt).getTime())
    .slice(0, 200);

  const nowMs = Date.now();
  const ms24h = 24 * 60 * 60 * 1000;
  const ms7d = 7 * ms24h;

  let totalCumulativeSignIns = 0;
  let activeLast24h = 0;
  let activeLast7d = 0;
  let superAdminCount = 0;

  const formattedUsers = sortedUsers.map(u => {
    const count = Number(u.signInCount) || 1;
    totalCumulativeSignIns += count;
    const lastMs = u.lastSignInAt ? new Date(u.lastSignInAt).getTime() : 0;
    if (nowMs - lastMs <= ms24h) activeLast24h++;
    if (nowMs - lastMs <= ms7d) activeLast7d++;
    const effectiveRole = isSuperAdminEmail(u.email) ? 'super_admin' : u.role;
    if (effectiveRole === 'super_admin') superAdminCount++;

    return {
      id: u.id,
      uid: u.uid,
      email: u.email,
      displayName: u.displayName || '',
      photoUrl: sanitizeAvatarUrl(u.photoUrl),
      role: effectiveRole,
      subscriptionTier: getEffectiveVerifiedTier(u.subscriptionTier, u.subscriptionVerified),
      subscriptionVerified: Boolean(u.subscriptionVerified),
      subscriptionVerificationStatus: normalizeVerificationStatus(
        u.subscriptionVerificationStatus
      ),
      subscriptionRequestedTier: u.subscriptionRequestedTier || '',
      subscriptionProofUrl: sanitizeAvatarUrl(u.subscriptionProofUrl),
      signInCount: count,
      createdAt: u.createdAt || '',
      lastSignInAt: u.lastSignInAt || ''
    };
  });

  const recentSiteSnapshots = [...store.siteSnapshots]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 20)
    .map(row => {
      const owner = userById.get(row.userId);
      const payload =
        row.payloadJson && typeof row.payloadJson === 'object'
          ? (row.payloadJson as Record<string, unknown>)
          : {};
      const workerCount = Array.isArray(payload.workers) ? payload.workers.length : 0;
      const dprCount =
        payload.dpr && typeof payload.dpr === 'object'
          ? Object.keys(payload.dpr as Record<string, unknown>).length
          : 0;

      return {
        id: row.id,
        siteName: row.siteName,
        subgroupName: row.subgroupName,
        ownerEmail: owner?.email || '',
        ownerName: owner?.displayName || owner?.email || 'User',
        workerCount,
        dprCount,
        updatedAt: row.updatedAt || ''
      };
    });

  const recentBookkeepingExports = [...store.bookkeepingSnapshots]
    .sort((a, b) => new Date(b.exportedAt).getTime() - new Date(a.exportedAt).getTime())
    .slice(0, 20)
    .map(row => {
      const owner = userById.get(row.userId);
      return {
        id: row.id,
        siteName: row.siteName,
        subgroupName: row.subgroupName,
        monthKey: row.monthKey,
        workerCount: row.workerCount,
        totalLaborCost: row.totalLaborCost,
        totalMaterialValue: row.totalMaterialValue,
        totalAdvances: row.totalAdvances,
        netPayable: row.netPayable,
        ownerEmail: owner?.email || '',
        ownerName: owner?.displayName || owner?.email || 'User',
        exportedAt: row.exportedAt || ''
      };
    });

  return {
    summary: {
      totalSignedInUsers: formattedUsers.length,
      totalCumulativeSignIns,
      activeLast24h,
      activeLast7d,
      superAdminCount,
      totalSiteSnapshots: store.siteSnapshots.length,
      totalBookkeepingExports: store.bookkeepingSnapshots.length
    },
    users: formattedUsers,
    recentSiteSnapshots,
    recentBookkeepingExports
  };
}

export async function getAdminPortalOverview(): Promise<AdminPortalOverview> {
  const sqlDb = getSqlDb();
  if (!sqlDb) {
    return getAdminPortalOverviewLocal();
  }

  try {
    const [allUsers, snapshotRows, bookkeepingRows, snapshotCountRow, bookkeepingCountRow] =
      await Promise.all([
        sqlDb
          .select({
            id: users.id,
            uid: users.uid,
            email: users.email,
            displayName: users.displayName,
            photoUrl: users.photoUrl,
            role: users.role,
            subscriptionTier: users.subscriptionTier,
            subscriptionVerified: users.subscriptionVerified,
            subscriptionVerificationStatus: users.subscriptionVerificationStatus,
            subscriptionRequestedTier: users.subscriptionRequestedTier,
            subscriptionProofUrl: users.subscriptionProofUrl,
            signInCount: users.signInCount,
            createdAt: users.createdAt,
            lastSignInAt: users.lastSignInAt
          })
          .from(users)
          .orderBy(desc(users.lastSignInAt))
          .limit(200),
        sqlDb
          .select({
            id: siteSnapshots.id,
            siteName: siteSnapshots.siteName,
            subgroupName: siteSnapshots.subgroupName,
            payloadJson: siteSnapshots.payloadJson,
            updatedAt: siteSnapshots.updatedAt,
            ownerEmail: users.email,
            ownerName: users.displayName
          })
          .from(siteSnapshots)
          .innerJoin(users, eq(siteSnapshots.userId, users.id))
          .orderBy(desc(siteSnapshots.updatedAt))
          .limit(20),
        sqlDb
          .select({
            id: bookkeepingSnapshots.id,
            siteName: bookkeepingSnapshots.siteName,
            subgroupName: bookkeepingSnapshots.subgroupName,
            monthKey: bookkeepingSnapshots.monthKey,
            workerCount: bookkeepingSnapshots.workerCount,
            totalLaborCost: bookkeepingSnapshots.totalLaborCost,
            totalMaterialValue: bookkeepingSnapshots.totalMaterialValue,
            totalAdvances: bookkeepingSnapshots.totalAdvances,
            netPayable: bookkeepingSnapshots.netPayable,
            exportedAt: bookkeepingSnapshots.exportedAt,
            ownerEmail: users.email,
            ownerName: users.displayName
          })
          .from(bookkeepingSnapshots)
          .innerJoin(users, eq(bookkeepingSnapshots.userId, users.id))
          .orderBy(desc(bookkeepingSnapshots.exportedAt))
          .limit(20),
        sqlDb.select({ count: sql<number>`count(*)::int` }).from(siteSnapshots),
        sqlDb
          .select({ count: sql<number>`count(*)::int` })
          .from(bookkeepingSnapshots)
      ]);

    const nowMs = Date.now();
    const ms24h = 24 * 60 * 60 * 1000;
    const ms7d = 7 * ms24h;

    let totalCumulativeSignIns = 0;
    let activeLast24h = 0;
    let activeLast7d = 0;
    let superAdminCount = 0;

    const formattedUsers = allUsers.map(u => {
      const count = Number(u.signInCount) || 1;
      totalCumulativeSignIns += count;
      const lastMs = u.lastSignInAt ? new Date(u.lastSignInAt).getTime() : 0;
      if (nowMs - lastMs <= ms24h) activeLast24h++;
      if (nowMs - lastMs <= ms7d) activeLast7d++;
      const effectiveRole = isSuperAdminEmail(u.email) ? 'super_admin' : u.role;
      if (effectiveRole === 'super_admin') superAdminCount++;

      return {
        id: u.id,
        uid: u.uid,
        email: u.email,
        displayName: u.displayName || '',
        photoUrl: sanitizeAvatarUrl(u.photoUrl),
        role: effectiveRole,
        subscriptionTier: getEffectiveVerifiedTier(
          u.subscriptionTier,
          u.subscriptionVerified
        ),
        subscriptionVerified: Boolean(u.subscriptionVerified),
        subscriptionVerificationStatus: normalizeVerificationStatus(
          u.subscriptionVerificationStatus
        ),
        subscriptionRequestedTier: u.subscriptionRequestedTier || '',
        subscriptionProofUrl: sanitizeAvatarUrl(u.subscriptionProofUrl),
        signInCount: count,
        createdAt: u.createdAt ? new Date(u.createdAt).toISOString() : '',
        lastSignInAt: u.lastSignInAt
          ? new Date(u.lastSignInAt).toISOString()
          : ''
      };
    });

    const recentSiteSnapshots = snapshotRows.map(row => {
      const payload =
        row.payloadJson && typeof row.payloadJson === 'object'
          ? (row.payloadJson as Record<string, unknown>)
          : {};
      const workerCount = Array.isArray(payload.workers)
        ? payload.workers.length
        : 0;
      const dprCount =
        payload.dpr && typeof payload.dpr === 'object'
          ? Object.keys(payload.dpr as Record<string, unknown>).length
          : 0;

      return {
        id: row.id,
        siteName: row.siteName,
        subgroupName: row.subgroupName,
        ownerEmail: row.ownerEmail,
        ownerName: row.ownerName || row.ownerEmail,
        workerCount,
        dprCount,
        updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : ''
      };
    });

    const recentBookkeepingExports = bookkeepingRows.map(row => ({
      id: row.id,
      siteName: row.siteName,
      subgroupName: row.subgroupName,
      monthKey: row.monthKey,
      workerCount: row.workerCount,
      totalLaborCost: row.totalLaborCost,
      totalMaterialValue: row.totalMaterialValue,
      totalAdvances: row.totalAdvances,
      netPayable: row.netPayable,
      ownerEmail: row.ownerEmail,
      ownerName: row.ownerName || row.ownerEmail,
      exportedAt: row.exportedAt ? new Date(row.exportedAt).toISOString() : ''
    }));

    return {
      summary: {
        totalSignedInUsers: formattedUsers.length,
        totalCumulativeSignIns,
        activeLast24h,
        activeLast7d,
        superAdminCount,
        totalSiteSnapshots: snapshotCountRow[0]?.count ?? 0,
        totalBookkeepingExports: bookkeepingCountRow[0]?.count ?? 0
      },
      users: formattedUsers,
      recentSiteSnapshots,
      recentBookkeepingExports
    };
  } catch (error) {
    if (isSqlConnectionError(error)) {
      markSqlUnavailableRuntime();
      return getAdminPortalOverviewLocal();
    }
    console.error('Database query failed (getAdminPortalOverview):', error);
    throw new Error('Database query failed. Please try again later.', {
      cause: error
    });
  }
}
