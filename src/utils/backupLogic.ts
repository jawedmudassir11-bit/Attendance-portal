import { AppState, SiteNode, sanitizeState } from './siteLogic';

export const BACKUP_INTERVAL_DAYS = 15;
export const BACKUP_INTERVAL_MS = BACKUP_INTERVAL_DAYS * 24 * 60 * 60 * 1000;
export const MAX_BACKUP_SNAPSHOTS = 24; // ~1 full year of 15-day snapshots

export interface BackupSubgroupEntry {
  subgroupId: string;
  subgroupName: string;
  state: AppState;
  workerCount: number;
  attendanceMonths: number;
  dprCount: number;
}

export interface BackupSiteEntry {
  siteId: string;
  siteName: string;
  subgroups: Record<string, BackupSubgroupEntry>;
}

export interface FullBackupSnapshot {
  id: string;
  version: 2;
  createdAt: number;
  createdIso: string;
  triggeredBy: string;
  triggerType: 'auto-15d' | 'manual';
  totalSites: number;
  totalSubgroups: number;
  totalWorkers: number;
  totalAttendanceRecords: number;
  sites: SiteNode[];
  dataBySite: Record<string, BackupSiteEntry>;
}

export interface BackupMeta {
  lastBackupAt: number | null;
  lastBackupId: string | null;
  lastTriggeredBy: string | null;
  lastTriggerType: 'auto-15d' | 'manual' | null;
  nextBackupAt: number | null;
  totalSites: number;
  totalSubgroups: number;
  totalWorkers: number;
  targets?: {
    backupRtdb: 'ok' | 'permission_denied' | 'error' | 'skipped';
    backupStorage: 'ok' | 'permission_denied' | 'error' | 'skipped';
    primaryVault: 'ok' | 'error' | 'skipped';
  };
}

export interface BackupScheduleStatus {
  isDue: boolean;
  daysRemaining: number;
  lastBackupAt: number | null;
  nextBackupAt: number;
}

const RESERVED_ROLLUP_IDS = new Set(['ALL_GROUPS', 'MASTER_ROLLUP']);

/**
 * Pure ownership guard preventing any cross-subgroup overwrite or write during
 * subgroup transitions, read-only Master Roll-Up, or before cloud hydration completes.
 */
export function shouldAllowSubgroupWrite(params: {
  currentSiteId: string;
  currentSubgroupId: string;
  activeSiteIdRef: string;
  activeSubgroupIdRef: string;
  cloudHydratedKey: string;
}): { allowed: boolean; reason?: string } {
  const {
    currentSiteId,
    currentSubgroupId,
    activeSiteIdRef,
    activeSubgroupIdRef,
    cloudHydratedKey
  } = params;

  if (!currentSiteId || !currentSubgroupId) {
    return { allowed: false, reason: 'No active site or subgroup selected.' };
  }
  if (RESERVED_ROLLUP_IDS.has(currentSubgroupId)) {
    return {
      allowed: false,
      reason: 'Master Roll-Up is read-only — select a specific subgroup to edit.'
    };
  }
  if (currentSiteId !== activeSiteIdRef || currentSubgroupId !== activeSubgroupIdRef) {
    return {
      allowed: false,
      reason: 'Subgroup switch in progress — skipped stale write to prevent data mixing.'
    };
  }
  const expectedKey = `${currentSiteId}__${currentSubgroupId}`;
  if (cloudHydratedKey !== expectedKey) {
    return {
      allowed: false,
      reason: 'Subgroup is still syncing from cloud — please wait a second before saving.'
    };
  }
  return { allowed: true };
}

/**
 * Returns true if no backup exists yet or at least 15 days have elapsed since lastBackupAt.
 */
export function isBackupDue(lastBackupAt: number | null | undefined, now: number = Date.now()): boolean {
  if (!lastBackupAt || !Number.isFinite(lastBackupAt) || lastBackupAt <= 0) {
    return true;
  }
  return now - lastBackupAt >= BACKUP_INTERVAL_MS;
}

/**
 * Computes human-readable countdown and schedule info for the 15-day backup cycle.
 */
export function getBackupScheduleStatus(
  lastBackupAt: number | null | undefined,
  now: number = Date.now()
): BackupScheduleStatus {
  const validLast =
    typeof lastBackupAt === 'number' && Number.isFinite(lastBackupAt) && lastBackupAt > 0
      ? lastBackupAt
      : null;

  if (!validLast) {
    return {
      isDue: true,
      daysRemaining: 0,
      lastBackupAt: null,
      nextBackupAt: now
    };
  }

  const nextBackupAt = validLast + BACKUP_INTERVAL_MS;
  const remainingMs = Math.max(0, nextBackupAt - now);
  const daysRemaining = Math.ceil(remainingMs / (24 * 60 * 60 * 1000));

  return {
    isDue: remainingMs <= 0,
    daysRemaining,
    lastBackupAt: validLast,
    nextBackupAt
  };
}

/**
 * Builds a clean, self-contained backup snapshot of all active sites and subgroups,
 * filtering out reserved Master Roll-Up or deleted orphan nodes.
 */
export function buildFullBackupSnapshot(params: {
  sites: SiteNode[];
  rawDataBySite: Record<string, Record<string, any>> | null | undefined;
  triggeredBy: string;
  triggerType: 'auto-15d' | 'manual';
  now?: number;
}): FullBackupSnapshot {
  const now = params.now ?? Date.now();
  const iso = new Date(now).toISOString();
  const dateSlug = iso.slice(0, 10);
  const id = `bkp_${dateSlug.replace(/-/g, '')}_${now}`;

  const dataBySite: Record<string, BackupSiteEntry> = {};
  let totalSubgroups = 0;
  let totalWorkers = 0;
  let totalAttendanceRecords = 0;

  for (const site of params.sites || []) {
    if (!site?.id) continue;
    const rawSiteNode = params.rawDataBySite?.[site.id] || {};
    const subgroupsMap: Record<string, BackupSubgroupEntry> = {};

    for (const sub of site.subgroups || []) {
      if (!sub?.id || RESERVED_ROLLUP_IDS.has(sub.id)) continue;
      const cleanState = sanitizeState(rawSiteNode[sub.id] || {});
      const attMonths = Object.keys(cleanState.attendance || {});
      let attEntries = 0;
      for (const m of attMonths) {
        const monthMap = cleanState.attendance[m] || {};
        for (const wDays of Object.values(monthMap)) {
          if (wDays && typeof wDays === 'object') {
            attEntries += Object.keys(wDays).length;
          }
        }
      }

      subgroupsMap[sub.id] = {
        subgroupId: sub.id,
        subgroupName: sub.name,
        state: cleanState,
        workerCount: cleanState.workers.length,
        attendanceMonths: attMonths.length,
        dprCount: Object.keys(cleanState.dpr || {}).length
      };

      totalSubgroups += 1;
      totalWorkers += cleanState.workers.length;
      totalAttendanceRecords += attEntries;
    }

    dataBySite[site.id] = {
      siteId: site.id,
      siteName: site.name,
      subgroups: subgroupsMap
    };
  }

  return {
    id,
    version: 2,
    createdAt: now,
    createdIso: iso,
    triggeredBy: (params.triggeredBy || 'System').trim() || 'System',
    triggerType: params.triggerType,
    totalSites: Object.keys(dataBySite).length,
    totalSubgroups,
    totalWorkers,
    totalAttendanceRecords,
    sites: params.sites || [],
    dataBySite
  };
}

/**
 * Sorts backup snapshots newest-first and returns the IDs to keep and prune.
 */
export function partitionBackupSnapshots(
  snapshots: Array<{ id: string; createdAt: number }>,
  maxKeep: number = MAX_BACKUP_SNAPSHOTS
): { keepIds: string[]; pruneIds: string[] } {
  const sorted = [...snapshots].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return {
    keepIds: sorted.slice(0, maxKeep).map(s => s.id),
    pruneIds: sorted.slice(maxKeep).map(s => s.id)
  };
}

/**
 * Generates a deterministic Storage path inside the configured backup project.
 */
export function buildBackupStoragePath(snapshot: Pick<FullBackupSnapshot, 'id' | 'createdIso'>): string {
  const datePart = (snapshot.createdIso || new Date().toISOString()).slice(0, 10);
  return `backups/${datePart}/${snapshot.id}.json`;
}

/**
 * Validates that a parsed JSON object is a valid FullBackupSnapshot before restoring.
 */
export function validateBackupSnapshot(raw: unknown): {
  valid: boolean;
  snapshot?: FullBackupSnapshot;
  error?: string;
} {
  if (!raw || typeof raw !== 'object') {
    return { valid: false, error: 'Backup file is empty or invalid JSON.' };
  }
  const obj = raw as Partial<FullBackupSnapshot>;
  if (!obj.dataBySite || typeof obj.dataBySite !== 'object' || !Array.isArray(obj.sites)) {
    return {
      valid: false,
      error: 'Backup file does not contain valid Attendance Portal site & subgroup data.'
    };
  }
  return { valid: true, snapshot: obj as FullBackupSnapshot };
}
