import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BACKUP_INTERVAL_DAYS,
  BACKUP_INTERVAL_MS,
  buildBackupStoragePath,
  buildFullBackupSnapshot,
  getBackupScheduleStatus,
  isBackupDue,
  partitionBackupSnapshots,
  shouldAllowSubgroupWrite,
  validateBackupSnapshot
} from './backupLogic.ts';

test('15-day backup scheduler accurately determines due status and countdown', () => {
  const now = new Date('2026-11-22T12:00:00Z').getTime();
  assert.equal(BACKUP_INTERVAL_DAYS, 15);
  assert.equal(isBackupDue(null, now), true);
  assert.equal(isBackupDue(now - 5 * 24 * 60 * 60 * 1000, now), false);
  assert.equal(isBackupDue(now - BACKUP_INTERVAL_MS, now), true);
  assert.equal(isBackupDue(now - 16 * 24 * 60 * 60 * 1000, now), true);

  const recentStatus = getBackupScheduleStatus(now - 3 * 24 * 60 * 60 * 1000, now);
  assert.equal(recentStatus.isDue, false);
  assert.equal(recentStatus.daysRemaining, 12);
  assert.equal(recentStatus.nextBackupAt, now + 12 * 24 * 60 * 60 * 1000);
});

test('shouldAllowSubgroupWrite blocks Master Roll-Up, unhydrated transitions, and stale subgroup refs', () => {
  assert.equal(
    shouldAllowSubgroupWrite({
      currentSiteId: 'site_1',
      currentSubgroupId: 'ALL_GROUPS',
      activeSiteIdRef: 'site_1',
      activeSubgroupIdRef: 'ALL_GROUPS',
      cloudHydratedKey: 'site_1__ALL_GROUPS'
    }).allowed,
    false
  );

  // Switching from Madan to TAJUDDIN before Firebase finishes hydrating TAJUDDIN MUST be blocked
  assert.equal(
    shouldAllowSubgroupWrite({
      currentSiteId: 'site_1',
      currentSubgroupId: 'sub_taj',
      activeSiteIdRef: 'site_1',
      activeSubgroupIdRef: 'sub_taj',
      cloudHydratedKey: 'site_1__sub_madan'
    }).allowed,
    false
  );

  // Stale closure from previous subgroup MUST be blocked
  assert.equal(
    shouldAllowSubgroupWrite({
      currentSiteId: 'site_1',
      currentSubgroupId: 'sub_madan',
      activeSiteIdRef: 'site_1',
      activeSubgroupIdRef: 'sub_taj',
      cloudHydratedKey: 'site_1__sub_taj'
    }).allowed,
    false
  );

  // Properly hydrated active subgroup write is allowed
  assert.equal(
    shouldAllowSubgroupWrite({
      currentSiteId: 'site_1',
      currentSubgroupId: 'sub_taj',
      activeSiteIdRef: 'site_1',
      activeSubgroupIdRef: 'sub_taj',
      cloudHydratedKey: 'site_1__sub_taj'
    }).allowed,
    true
  );
});

test('buildFullBackupSnapshot packages all active sites/subgroups and excludes stray ALL_GROUPS', () => {
  const sites = [
    {
      id: 'site_barsoi',
      name: 'Barsoi',
      subgroups: [
        { id: 'sub_madan', name: 'Madan' },
        { id: 'sub_taj', name: 'TAJUDDIN' }
      ]
    }
  ];
  const rawDataBySite = {
    site_barsoi: {
      sub_madan: {
        workers: [{ id: 'w1', name: 'Madan tudu', desig: 'Mason', rate: 800 }],
        attendance: { '11-2026': { w1: { 1: { duty: 1, ot: 0, adv: 0 } } } },
        dpr: { '1-11-2026': { work: 'PCC', weather: 'Clear' } }
      },
      sub_taj: {
        workers: [
          { id: 'w_taj_1', name: 'VINDO (M)', desig: 'Mason', rate: 850 },
          { id: 'w_taj_2', name: 'SADIQ (M)', desig: 'Mason', rate: 850 }
        ],
        attendance: {}
      },
      ALL_GROUPS: {
        workers: [{ id: 'stray', name: 'Stray', desig: 'Helper', rate: 500 }]
      }
    }
  };

  const snap = buildFullBackupSnapshot({
    sites,
    rawDataBySite,
    triggeredBy: 'Admin',
    triggerType: 'auto-15d',
    now: 1795350000000
  });

  assert.equal(snap.totalSites, 1);
  assert.equal(snap.totalSubgroups, 2);
  assert.equal(snap.totalWorkers, 3);
  assert.equal(snap.totalAttendanceRecords, 1);
  assert.equal(Boolean(snap.dataBySite.site_barsoi.subgroups.ALL_GROUPS), false);
  assert.equal(snap.dataBySite.site_barsoi.subgroups.sub_taj.workerCount, 2);
  assert.match(buildBackupStoragePath(snap), /^backups\/\d{4}-\d{2}-\d{2}\/bkp_/);
  assert.equal(validateBackupSnapshot(snap).valid, true);
  assert.equal(validateBackupSnapshot({ bad: true }).valid, false);
});

test('partitionBackupSnapshots keeps newest N and prunes older snapshots', () => {
  const { keepIds, pruneIds } = partitionBackupSnapshots(
    [
      { id: 'b1', createdAt: 100 },
      { id: 'b3', createdAt: 300 },
      { id: 'b2', createdAt: 200 },
      { id: 'b4', createdAt: 400 }
    ],
    2
  );
  assert.deepEqual(keepIds, ['b4', 'b3']);
  assert.deepEqual(pruneIds, ['b2', 'b1']);
});
