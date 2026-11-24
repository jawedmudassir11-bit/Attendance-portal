import { useCallback, useEffect, useRef, useState } from 'react';
import { getFirebaseServices, safeGetStorage, safeRemoveStorage, safeSetStorage } from '../utils/firebaseBridge';
import { SiteNode, sanitizeState, sanitizeStructure } from '../utils/siteLogic';
import {
  BACKUP_INTERVAL_MS,
  BackupMeta,
  FullBackupSnapshot,
  MAX_BACKUP_SNAPSHOTS,
  buildFullBackupSnapshot,
  getBackupScheduleStatus,
  isBackupDue,
  partitionBackupSnapshots,
  validateBackupSnapshot
} from '../utils/backupLogic';

interface UseAutoBackupParams {
  portalId?: string;
  companyName?: string;
  sites: SiteNode[];
  userName: string;
  userRole: string;
  onLogActivity: (action: string) => void;
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

function isPermissionDeniedError(err: unknown): boolean {
  const msg = String((err as any)?.message || (err as any)?.code || err || '').toLowerCase();
  return msg.includes('permission_denied') || msg.includes('permission denied') || msg.includes('unauthorized');
}

export function useAutoBackup({
  portalId = 'default',
  companyName = 'Attendance Portal',
  sites,
  userName,
  userRole,
  onLogActivity,
  onToast
}: UseAutoBackupParams) {
  const lastBackupStorageKey = `ap_${portalId}_last_15d_backup_at`;
  const backupLockStorageKey = `ap_${portalId}_15d_backup_lock_ts`;

  const [backupMeta, setBackupMeta] = useState<BackupMeta>(() => {
    const cachedTs = Number(safeGetStorage(lastBackupStorageKey) || 0) || null;
    return {
      lastBackupAt: cachedTs,
      lastBackupId: null,
      lastTriggeredBy: null,
      lastTriggerType: null,
      nextBackupAt: cachedTs ? cachedTs + BACKUP_INTERVAL_MS : null,
      totalSites: sites.length,
      totalSubgroups: sites.reduce((acc, s) => acc + (s.subgroups?.length || 0), 0),
      totalWorkers: 0
    };
  });
  const [snapshots, setSnapshots] = useState<FullBackupSnapshot[]>([]);
  const [isRunningBackup, setIsRunningBackup] = useState<boolean>(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);
  const [backupRtdbPermissionNeeded, setBackupRtdbPermissionNeeded] = useState<boolean>(false);
  const [backupStoragePermissionNeeded, setBackupStoragePermissionNeeded] = useState<boolean>(false);

  const runningRef = useRef<boolean>(false);
  const autoCheckedPortalRef = useRef<string>('');
  const sitesRef = useRef<SiteNode[]>(sites);
  useEffect(() => {
    sitesRef.current = sites;
  }, [sites]);

  const loadBackupHistory = useCallback(async () => {
    const { db, backupDb } = getFirebaseServices();
    if (!db && !backupDb) return;
    setIsLoadingHistory(true);
    try {
      let resolvedMeta: BackupMeta | null = null;
      const mergedById = new Map<string, FullBackupSnapshot>();

      // 1. Try reading from optional secondary backup RTDB first
      if (backupDb) {
        try {
          const [metaSnap, listSnap] = await Promise.all([
            backupDb.ref('backups/meta').once('value'),
            backupDb.ref('backups/snapshots').once('value')
          ]);
          setBackupRtdbPermissionNeeded(false);
          if (metaSnap?.val()) {
            resolvedMeta = metaSnap.val() as BackupMeta;
          }
          const rawList = listSnap?.val();
          if (rawList && typeof rawList === 'object') {
            Object.values(rawList).forEach((item: any) => {
              if (item && item.id && item.dataBySite) {
                mergedById.set(item.id, item as FullBackupSnapshot);
              }
            });
          }
        } catch (err) {
          if (isPermissionDeniedError(err)) {
            setBackupRtdbPermissionNeeded(true);
          }
        }
      }

      // 2. Also read Primary Cloud Rolling Vault so history & 1-click restore are always available
      if (db) {
        try {
          const [pMetaSnap, pListSnap] = await Promise.all([
            db.ref('global/autoBackupMeta').once('value'),
            db.ref('global/autoBackups').once('value')
          ]);
          const pMeta = pMetaSnap?.val() as BackupMeta | null;
          if (pMeta && (!resolvedMeta || (pMeta.lastBackupAt || 0) >= (resolvedMeta.lastBackupAt || 0))) {
            resolvedMeta = pMeta;
          }
          const rawPrimaryList = pListSnap?.val();
          if (rawPrimaryList && typeof rawPrimaryList === 'object') {
            Object.values(rawPrimaryList).forEach((item: any) => {
              if (item && item.id && item.dataBySite && !mergedById.has(item.id)) {
                mergedById.set(item.id, item as FullBackupSnapshot);
              }
            });
          }
        } catch {
          // ignore primary vault read issue
        }
      }

      const sortedSnapshots = Array.from(mergedById.values()).sort(
        (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
      );
      setSnapshots(sortedSnapshots);

      if (resolvedMeta) {
        setBackupMeta(resolvedMeta);
        if (resolvedMeta.lastBackupAt) {
          safeSetStorage(lastBackupStorageKey, String(resolvedMeta.lastBackupAt));
        }
        if (resolvedMeta.targets?.backupRtdb === 'permission_denied') {
          setBackupRtdbPermissionNeeded(true);
        }
        if (resolvedMeta.targets?.backupStorage === 'permission_denied') {
          setBackupStoragePermissionNeeded(true);
        }
      } else if (sortedSnapshots.length > 0) {
        const latest = sortedSnapshots[0];
        const derivedMeta: BackupMeta = {
          lastBackupAt: latest.createdAt,
          lastBackupId: latest.id,
          lastTriggeredBy: latest.triggeredBy,
          lastTriggerType: latest.triggerType,
          nextBackupAt: latest.createdAt + BACKUP_INTERVAL_MS,
          totalSites: latest.totalSites,
          totalSubgroups: latest.totalSubgroups,
          totalWorkers: latest.totalWorkers
        };
        setBackupMeta(derivedMeta);
        safeSetStorage(lastBackupStorageKey, String(latest.createdAt));
      }
    } finally {
      setIsLoadingHistory(false);
    }
  }, [lastBackupStorageKey]);

  const runFullBackup = useCallback(
    async (triggerType: 'auto-15d' | 'manual' = 'manual'): Promise<FullBackupSnapshot | null> => {
      if (runningRef.current) return null;
      const { db, backupDb } = getFirebaseServices();
      if (!db) {
        if (triggerType === 'manual') {
          onToast('Cloud database is offline — connect to internet to run backup', 'error');
        }
        return null;
      }

      runningRef.current = true;
      setIsRunningBackup(true);
      safeSetStorage(backupLockStorageKey, String(Date.now()));

      try {
        // Fetch live authoritative structure + full data across ALL sites & subgroups
        const [structSnap, dataSnap] = await Promise.all([
          db.ref('global/structure').once('value'),
          db.ref('data').once('value')
        ]);

        const liveSites = structSnap?.val()
          ? sanitizeStructure(structSnap.val())
          : sitesRef.current;
        const rawData = (dataSnap?.val() || {}) as Record<string, Record<string, any>>;

        const snapshot = buildFullBackupSnapshot({
          sites: liveSites,
          rawDataBySite: rawData,
          triggeredBy: userName || 'Portal Auto-Backup',
          triggerType
        });

        const targets: NonNullable<BackupMeta['targets']> = {
          backupRtdb: 'skipped',
          backupStorage: 'skipped',
          primaryVault: 'skipped'
        };

        // Channel 1: Write full snapshot to optional secondary backup Realtime Database
        if (backupDb) {
          try {
            await backupDb.ref(`backups/snapshots/${snapshot.id}`).set(snapshot);
            targets.backupRtdb = 'ok';
            setBackupRtdbPermissionNeeded(false);

            // Prune older than 24 snapshots (~1 year of 15-day snapshots)
            try {
              const allSnap = await backupDb.ref('backups/snapshots').once('value');
              const allObj = allSnap?.val();
              if (allObj && typeof allObj === 'object') {
                const { pruneIds } = partitionBackupSnapshots(
                  Object.values(allObj).map((x: any) => ({
                    id: String(x?.id || ''),
                    createdAt: Number(x?.createdAt || 0)
                  })),
                  MAX_BACKUP_SNAPSHOTS
                );
                await Promise.all(
                  pruneIds.filter(Boolean).map(id => backupDb.ref(`backups/snapshots/${id}`).remove())
                );
              }
            } catch {
              // ignore prune failure
            }
          } catch (err) {
            if (isPermissionDeniedError(err)) {
              targets.backupRtdb = 'permission_denied';
              setBackupRtdbPermissionNeeded(true);
            } else {
              targets.backupRtdb = 'error';
            }
          }
        }

        const nextMeta: BackupMeta = {
          lastBackupAt: snapshot.createdAt,
          lastBackupId: snapshot.id,
          lastTriggeredBy: snapshot.triggeredBy,
          lastTriggerType: snapshot.triggerType,
          nextBackupAt: snapshot.createdAt + BACKUP_INTERVAL_MS,
          totalSites: snapshot.totalSites,
          totalSubgroups: snapshot.totalSubgroups,
          totalWorkers: snapshot.totalWorkers,
          targets
        };

        // Update meta on secondary backup RTDB if writable
        if (backupDb && targets.backupRtdb === 'ok') {
          await backupDb.ref('backups/meta').set(nextMeta).catch(() => {});
        }

        // Channel 2: Always mirror to Primary Cloud Rolling Vault (last 12 snapshots) so restore is guaranteed
        try {
          await db.ref(`global/autoBackups/${snapshot.id}`).set(snapshot);
          await db.ref('global/autoBackupMeta').set(nextMeta);
          targets.primaryVault = 'ok';

          // Prune primary rolling vault to last 12 snapshots (~6 months)
          const pAll = await db.ref('global/autoBackups').once('value');
          const pObj = pAll?.val();
          if (pObj && typeof pObj === 'object') {
            const { pruneIds } = partitionBackupSnapshots(
              Object.values(pObj).map((x: any) => ({
                id: String(x?.id || ''),
                createdAt: Number(x?.createdAt || 0)
              })),
              12
            );
            await Promise.all(
              pruneIds.filter(Boolean).map(id => db.ref(`global/autoBackups/${id}`).remove())
            );
          }
        } catch {
          targets.primaryVault = 'error';
        }

        nextMeta.targets = targets;
        setBackupMeta(nextMeta);
        setSnapshots(prev => [snapshot, ...prev.filter(s => s.id !== snapshot.id)].slice(0, MAX_BACKUP_SNAPSHOTS));
        safeSetStorage(lastBackupStorageKey, String(snapshot.createdAt));

        const backedUpToSecondary = targets.backupRtdb === 'ok';
        onLogActivity(
          `${triggerType === 'auto-15d' ? '15-Day Auto-Backup' : 'Manual Full Backup'} saved (${snapshot.totalWorkers} workers across ${snapshot.totalSubgroups} groups)`
        );

        if (triggerType === 'manual') {
          if (backedUpToSecondary) {
            onToast(
              `Full backup saved to Backup Database & Cloud Vault (${snapshot.totalWorkers} workers, ${snapshot.totalSubgroups} groups)`,
              'success'
            );
          } else if (targets.primaryVault === 'ok') {
            onToast(
              `Backup saved to Cloud Rolling Vault (${snapshot.totalWorkers} workers across ${snapshot.totalSubgroups} groups).`,
              'success'
            );
          } else {
            onToast('Backup failed — please check internet connection and Firebase rules.', 'error');
          }
        } else if (targets.primaryVault === 'ok' || backedUpToSecondary) {
          onToast(
            `15-Day Auto-Backup complete (${snapshot.totalWorkers} workers safely archived)`,
            'success'
          );
        }

        return snapshot;
      } catch (err) {
        if (triggerType === 'manual') {
          onToast('Could not complete cloud backup. Please try again.', 'error');
        }
        console.warn('Auto-backup error:', err);
        return null;
      } finally {
        runningRef.current = false;
        setIsRunningBackup(false);
      }
    },
    [userName, onLogActivity, onToast, backupLockStorageKey, lastBackupStorageKey]
  );

  // Initial history load + Automatic 15-Day Schedule Check (and hourly re-check)
  useEffect(() => {
    if (!portalId || portalId === 'none') return;
    const checkAndAutoBackup = async () => {
      await loadBackupHistory();
      const { db } = getFirebaseServices();
      if (!db || !navigator.onLine) return;

      // Cross-tab lock (don't trigger duplicate auto-backups within 5 minutes)
      const lastLock = Number(safeGetStorage(backupLockStorageKey) || 0);
      if (Date.now() - lastLock < 5 * 60 * 1000) return;

      let latestBackupTs = Number(safeGetStorage(lastBackupStorageKey) || 0) || null;
      try {
        const metaSnap = await db.ref('global/autoBackupMeta/lastBackupAt').once('value');
        const cloudTs = Number(metaSnap?.val() || 0);
        if (cloudTs > (latestBackupTs || 0)) {
          latestBackupTs = cloudTs;
          safeSetStorage(lastBackupStorageKey, String(cloudTs));
        }
      } catch {
        // ignore
      }

      if (isBackupDue(latestBackupTs)) {
        await runFullBackup('auto-15d');
      }
    };

    const bootTimer = window.setTimeout(() => {
      if (autoCheckedPortalRef.current !== portalId) {
        autoCheckedPortalRef.current = portalId;
        checkAndAutoBackup();
      }
    }, 4000);

    const hourlyInterval = window.setInterval(() => {
      checkAndAutoBackup();
    }, 60 * 60 * 1000);

    return () => {
      window.clearTimeout(bootTimer);
      window.clearInterval(hourlyInterval);
    };
  }, [portalId, loadBackupHistory, runFullBackup, backupLockStorageKey, lastBackupStorageKey]);

  const downloadSnapshotJson = useCallback(
    (snapshot: FullBackupSnapshot) => {
      try {
        const dateSlug = (snapshot.createdIso || new Date().toISOString()).slice(0, 10);
        const safeBrand =
          (companyName || 'Attendance_Portal').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '') ||
          'Attendance_Portal';
        const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
          type: 'application/json'
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${safeBrand}_Backup_${dateSlug}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        onToast(`Downloaded backup file (${dateSlug})`, 'success');
      } catch {
        onToast('Could not download backup JSON file', 'error');
      }
    },
    [companyName, onToast]
  );

  const restoreSubgroupFromSnapshot = useCallback(
    async (snapshot: FullBackupSnapshot, siteId: string, subgroupId: string): Promise<boolean> => {
      if (userRole !== 'admin') {
        onToast('Only Admin can restore a subgroup from backup', 'error');
        return false;
      }
      const { db } = getFirebaseServices();
      if (!db) {
        onToast('Cloud database is offline — cannot restore right now', 'error');
        return false;
      }
      const siteEntry = snapshot.dataBySite?.[siteId];
      const subEntry = siteEntry?.subgroups?.[subgroupId];
      if (!subEntry?.state) {
        onToast('Selected subgroup was not found in this backup snapshot', 'error');
        return false;
      }

      try {
        const cleanRestored = sanitizeState(subEntry.state);
        await db.ref(`data/${siteId}/${subgroupId}`).set(cleanRestored);
        safeRemoveStorage(`ap_${portalId}_cache_${siteId}_${subgroupId}`);
        onLogActivity(
          `Restored ${siteEntry.siteName} ➔ ${subEntry.subgroupName} from backup (${snapshot.createdIso.slice(0, 10)}, ${cleanRestored.workers.length} workers)`
        );
        onToast(
          `Restored ${subEntry.subgroupName} (${cleanRestored.workers.length} workers) from backup`,
          'success'
        );
        return true;
      } catch {
        onToast('Failed to restore subgroup from backup', 'error');
        return false;
      }
    },
    [portalId, userRole, onLogActivity, onToast]
  );

  const parseAndValidateUploadedBackup = useCallback(
    async (file: File): Promise<{ valid: boolean; snapshot?: FullBackupSnapshot; error?: string }> => {
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        return validateBackupSnapshot(parsed);
      } catch {
        return { valid: false, error: 'Could not read JSON file. Please select a valid .json backup.' };
      }
    },
    []
  );

  const scheduleStatus = getBackupScheduleStatus(backupMeta.lastBackupAt);

  return {
    backupMeta,
    scheduleStatus,
    snapshots,
    isRunningBackup,
    isLoadingHistory,
    backupRtdbPermissionNeeded,
    backupStoragePermissionNeeded,
    runFullBackup,
    loadBackupHistory,
    downloadSnapshotJson,
    restoreSubgroupFromSnapshot,
    parseAndValidateUploadedBackup
  };
}
