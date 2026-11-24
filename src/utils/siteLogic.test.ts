import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseDutyInput,
  getDutyDisplaySymbol,
  calculateWorkerMonthlySummary,
  calculateSiteDashboardStats,
  calculateActiveStockMap,
  sanitizeState,
  createEmptyAppState,
  aggregateMasterRollupState,
  isDayAutoLockedForRole,
  generateEndOfDayWhatsAppSummary,
  buildMonthlyBookkeepingWorkbookData,
  calculateMonthlyExecutiveSummary,
  isSuperAdminEmail,
  sanitizeAvatarUrl,
  getUserInitials
} from './siteLogic';

test('Duty parsing and display symbol formatting work accurately', () => {
  assert.equal(parseDutyInput('P'), 1);
  assert.equal(parseDutyInput(1), 1);
  assert.equal(parseDutyInput('H'), 0.5);
  assert.equal(parseDutyInput(0.5), 0.5);
  assert.equal(parseDutyInput('A'), 0);
  assert.equal(parseDutyInput(0), 0);
  assert.equal(parseDutyInput(''), null);

  assert.equal(getDutyDisplaySymbol(1), 'P');
  assert.equal(getDutyDisplaySymbol(0.5), 'H');
  assert.equal(getDutyDisplaySymbol(0), 'A');
  assert.equal(getDutyDisplaySymbol(null), '');
});

test('Worker monthly summary and dashboard stats calculate gross, advance, and net pay', () => {
  const worker = { id: 'w1', name: 'Ramesh Kumar', desig: 'Mason', rate: 800 };
  const monthAtt = {
    w1: {
      1: { duty: 1, ot: 2, adv: 200 },
      2: { duty: 0.5, ot: 0, adv: 0 },
      3: { duty: 0, ot: 0, adv: 100 }
    }
  };
  const summary = calculateWorkerMonthlySummary(worker, monthAtt, { w1: 500 }, 30);
  // Duty = 1.5 days * 800 = 1200; OT = 2 hrs * (800/8 = 100) = 200 => Gross = 1400
  // Advance = 500 opening + 300 daily = 800 => Net = 600
  assert.equal(summary.totalDuty, 1.5);
  assert.equal(summary.totalOT, 2);
  assert.equal(summary.grossAmount, 1400);
  assert.equal(summary.totalAdvance, 800);
  assert.equal(summary.netBalance, 600);

  const state = sanitizeState({
    workers: [worker],
    attendance: { '11-2026': monthAtt },
    advances: { w1: 500 }
  });
  const dash = calculateSiteDashboardStats(state, '11-2026', 1);
  assert.equal(dash.presentToday, 1);
  assert.equal(dash.totalNetBalance, 600);
});

test('Live material stock map reconciles received minus consumed quantities', () => {
  const stock = calculateActiveStockMap({
    '1-11-2026': {
      work: 'Pour',
      weather: 'Sunny',
      rainStart: '',
      rainEnd: '',
      workStop: 'No',
      matReceived: [{ item: 'Cement', qty: 100, unit: 'Bag', challan: 'CH-102', supplier: 'UltraTech' }],
      matConsumed: [{ item: 'Cement', qty: 35, unit: 'Bag' }],
      photos: []
    }
  });
  assert.equal(stock['cement'].qty, 65);
  assert.equal(stock['cement'].unit, 'Bag');
});

test('Attendance auto-lock locks past >48h days for Supervisor and Site Incharge while Admin can change anything at any time', () => {
  // Current date: Day 7 of 11-2026
  // Supervisor and Site Incharge can edit today (Day 7) and yesterday (Day 6)
  assert.equal(isDayAutoLockedForRole('supervisor', 7, '11-2026', 7, '11-2026', false), false);
  assert.equal(isDayAutoLockedForRole('incharge', 6, '11-2026', 7, '11-2026', false), false);
  // Both Supervisor and Site Incharge are auto-locked on Day 5 (48h+ old) and previous months
  assert.equal(isDayAutoLockedForRole('supervisor', 5, '11-2026', 7, '11-2026', false), true);
  assert.equal(isDayAutoLockedForRole('incharge', 5, '11-2026', 7, '11-2026', false), true);
  assert.equal(isDayAutoLockedForRole('incharge', 7, '10-2026', 7, '11-2026', false), true);
  // Admin is NEVER locked and can change anything at any time
  assert.equal(isDayAutoLockedForRole('admin', 1, '11-2026', 7, '11-2026', true), false);
  assert.equal(isDayAutoLockedForRole('admin', 1, '10-2026', 7, '11-2026', true), false);
});

test('1-Tap 6:00 PM WhatsApp Executive Summary compiles workforce, trade breakdown, OT, downtime, and materials received', () => {
  const summary = generateEndOfDayWhatsAppSummary({
    siteName: 'Barsoi',
    subgroupName: 'Madan',
    dateKey: '07-11-2026',
    selectedDay: 7,
    monthKey: '11-2026',
    userName: 'Mudassir',
    userRole: 'supervisor',
    workers: [
      { id: 'w1', name: 'Ramesh', desig: 'Head Mason', rate: 800 },
      { id: 'w2', name: 'Sanjay', desig: 'Bar Bender', rate: 700 }
    ],
    attendance: {
      '11-2026': {
        w1: { 7: { duty: 1, ot: 2, adv: 500 } },
        w2: { 7: { duty: 0.5, ot: 0, adv: 0 } }
      }
    },
    dpr: {
      '07-11-2026': {
        work: 'Casting pile cap grid A',
        weather: '⛈️ Heavy Rain',
        rainStart: '14:00',
        rainEnd: '16:30',
        workStop: 'Yes',
        downtimeReason: 'Rain Stopped Work',
        downtimeHours: '2.5',
        downtimeNotes: 'Pour stopped due to sudden downpour',
        matReceived: [{ item: 'Ultratech Cement', qty: '150', unit: 'Bag', challan: 'CH-991', supplier: 'Begusarai Traders' }],
        matConsumed: [{ item: 'Ultratech Cement', qty: '80', unit: 'Bag' }],
        photos: []
      }
    }
  });

  assert.ok(summary.includes('6:00 PM DAILY EXECUTIVE SITE SUMMARY'));
  assert.ok(summary.includes('Barsoi ➔ Madan'));
  assert.ok(summary.includes('Total Present: *2*'));
  assert.ok(summary.includes('Head Mason'));
  assert.ok(summary.includes('Overtime Clocked: *2 Hrs*'));
  assert.ok(summary.includes('Cash Advances Paid: ₹500'));
  assert.ok(summary.includes('Rain Stopped Work (2.5 hrs lost)'));
  assert.ok(summary.includes('Ultratech Cement: 150 Bag'));
});

test('Monthly bookkeeping Excel builder generates 4 structured sheets with accurate payroll, attendance matrix, OT, and advances', () => {
  const state = sanitizeState({
    workers: [
      { id: 'w1', name: 'Madan tudu', phone: '9876543210', desig: 'Mason', rate: 800 },
      { id: 'w2', name: 'Suresh', phone: '9876543215', desig: 'Helper', rate: 600 }
    ],
    keyPersons: [{ id: 'kp1', name: 'Er. Rajeshwar', phone: '9800001122', desig: 'PM' }],
    attendance: {
      '11-2026': {
        w1: {
          1: { duty: 1, ot: 2, adv: 300 },
          2: { duty: 0.5, ot: 0, adv: 0 },
          3: { duty: 0, ot: 0, adv: 0 }
        },
        w2: {
          1: { duty: 1, ot: 4, adv: 200 },
          2: { duty: 1, ot: 0, adv: 0 }
        }
      }
    },
    kpAttendance: {
      '11-2026': {
        kp1: { 1: { duty: 1 } }
      }
    },
    advances: { w1: 500 }
  });

  const wb = buildMonthlyBookkeepingWorkbookData({
    appState: state,
    monthKey: '11-2026',
    siteName: 'Barsoi',
    subgroupName: 'Madan',
    companyName: 'Apex Civil Works',
    generatedAt: new Date('2026-11-21T10:00:00Z')
  });

  assert.equal(wb.filename, 'Apex_Civil_Works_Bookkeeping_Barsoi_Madan_Nov_2026.xlsx');
  assert.equal(wb.monthLabel, 'November 2026');
  assert.equal(wb.sheets.length, 4);
  assert.deepEqual(
    wb.sheets.map(s => s.name),
    ['Payroll_Summary', 'Attendance_Matrix', 'Overtime_Log', 'Advances_Ledger']
  );

  // w1: 1.5*800 (1200) + 2*(800/8=100) (200) = 1400 gross; adv = 500 open + 300 daily = 800; net = 600
  // w2: 2.0*600 (1200) + 4*(600/8=75) (300) = 1500 gross; adv = 200 daily; net = 1300
  assert.equal(wb.totals.workerCount, 2);
  assert.equal(wb.totals.totalDuties, 3.5);
  assert.equal(wb.totals.totalOT, 6);
  assert.equal(wb.totals.totalGross, 2900);
  assert.equal(wb.totals.totalOpeningAdv, 500);
  assert.equal(wb.totals.totalDailyAdv, 500);
  assert.equal(wb.totals.totalAdvance, 1000);
  assert.equal(wb.totals.totalNetPayable, 1900);
  assert.equal(wb.totals.advanceTransactionsCount, 3);

  // Attendance matrix should contain P, H, A for w1 on days 1, 2, 3
  const attSheet = wb.sheets[1];
  const w1Row = attSheet.rows.find(r => r[1] === 'Madan tudu');
  assert.ok(w1Row);
  assert.equal(w1Row[4], 'P');
  assert.equal(w1Row[5], 'H');
  assert.equal(w1Row[6], 'A');
  assert.equal(w1Row[7], '-');
});

test('Monthly executive summary calculates total labor costs, material consumption value, and advances issued for the month', () => {
  const state = sanitizeState({
    workers: [
      { id: 'w1', name: 'Madan tudu', desig: 'Mason', rate: 800 },
      { id: 'w2', name: 'Suresh', desig: 'Helper', rate: 600 }
    ],
    attendance: {
      '11-2026': {
        w1: { 1: { duty: 1, ot: 2, adv: 300 }, 2: { duty: 1, ot: 0, adv: 0 } },
        w2: { 1: { duty: 1, ot: 0, adv: 200 } }
      }
    },
    advances: { w1: 500 },
    dpr: {
      '01-11-2026': {
        work: 'Slab pour',
        weather: 'Sunny',
        rainStart: '',
        rainEnd: '',
        workStop: 'No',
        matReceived: [],
        matConsumed: [
          { item: 'OPC-53 Cement', qty: 50, unit: 'Bag' },
          { item: 'TMT Fe-500D Rebar', qty: 1, unit: 'MT' }
        ],
        photos: []
      },
      '05-11-2026': {
        work: 'Plastering',
        weather: 'Sunny',
        rainStart: '',
        rainEnd: '',
        workStop: 'No',
        matReceived: [],
        matConsumed: [{ item: 'OPC-53 Cement', qty: 10, unit: 'Bag' }],
        photos: []
      },
      // Previous month entry should be excluded
      '28-10-2026': {
        work: 'Old pour',
        weather: 'Sunny',
        rainStart: '',
        rainEnd: '',
        workStop: 'No',
        matReceived: [],
        matConsumed: [{ item: 'OPC-53 Cement', qty: 100, unit: 'Bag' }],
        photos: []
      }
    }
  });

  // Default rates: Cement 60 bags * 380 = 22800; TMT 1 MT * 62000 = 62000 => Total = 84800
  const summary = calculateMonthlyExecutiveSummary({
    appState: state,
    monthKey: '11-2026'
  });

  // Labor: w1 (2*800=1600 + 2*100=200 = 1800) + w2 (1*600=600) = 2400
  assert.equal(summary.labor.baseWage, 2200);
  assert.equal(summary.labor.otPay, 200);
  assert.equal(summary.labor.totalLaborCost, 2400);

  // Materials: excludes October entry, aggregates Nov 1 + Nov 5 Cement = 60 Bags
  assert.equal(summary.materials.itemsCount, 2);
  assert.equal(summary.materials.totalMaterialValue, 84800);

  // Advances: 500 opening + (300 + 200) daily = 1000
  assert.equal(summary.advances.openingAdvances, 500);
  assert.equal(summary.advances.monthlyDailyAdvances, 500);
  assert.equal(summary.advances.totalAdvances, 1000);
  assert.equal(summary.advances.netLaborPayable, 1400);
  assert.equal(summary.totalSiteCost, 87200);

  // Custom rate override test
  const customSummary = calculateMonthlyExecutiveSummary({
    appState: state,
    monthKey: '11-2026',
    customMaterialRates: { 'opc-53 cement__bag': 400 }
  });
  // Cement 60 * 400 = 24000 + TMT 62000 = 86000
  assert.equal(customSummary.materials.totalMaterialValue, 86000);
});

test('No personal email has hardcoded super-admin bypass in self-serve mode', () => {
  assert.equal(isSuperAdminEmail('jawedasfar1@gmail.com'), false);
  assert.equal(isSuperAdminEmail('jawedmudassir11@gmail.com'), false);
  assert.equal(isSuperAdminEmail('other@gmail.com'), false);
  assert.equal(isSuperAdminEmail(''), false);
  assert.equal(isSuperAdminEmail(null), false);
  assert.equal(isSuperAdminEmail(undefined), false);
});

test('Avatar URL sanitization blocks unsafe schemes and getUserInitials formats cleanly', () => {
  assert.equal(
    sanitizeAvatarUrl('https://lh3.googleusercontent.com/a/avatar123=s96-c'),
    'https://lh3.googleusercontent.com/a/avatar123=s96-c'
  );
  assert.equal(sanitizeAvatarUrl('javascript:alert(1)'), '');
  assert.equal(sanitizeAvatarUrl('data:text/html,<script>alert(1)</script>'), '');
  assert.equal(sanitizeAvatarUrl('not-a-url'), '');
  assert.equal(sanitizeAvatarUrl(null), '');

  assert.equal(getUserInitials('Jawed Mudassir', 'jawedmudassir11@gmail.com'), 'JM');
  assert.equal(getUserInitials('Mudassir', null), 'MU');
  assert.equal(getUserInitials('', 'jawedasfar1@gmail.com'), 'JA');
  assert.equal(getUserInitials('', ''), 'GI');
});

test('createEmptyAppState returns clean empty subgroup state and aggregateMasterRollupState prevents duplicate keys & orphan leakage', () => {
  const empty = createEmptyAppState();
  assert.equal(empty.workers.length, 0);
  assert.equal(empty.keyPersons.length, 0);
  assert.deepEqual(empty.attendance, {});

  const aggregated = aggregateMasterRollupState(
    {
      sub_a: {
        workers: [{ id: 'w_shared', name: 'Madan tudu', desig: 'Mason', rate: 800 }],
        attendance: { '11-2026': { w_shared: { 1: { duty: 1, ot: 2, adv: 100 } } } },
        advances: { w_shared: 500 }
      },
      sub_b: {
        workers: [{ id: 'w_shared', name: 'Madan tudu', desig: 'Mason', rate: 800 }],
        attendance: { '11-2026': { w_shared: { 1: { duty: 0.5, ot: 0, adv: 0 } } } },
        advances: { w_shared: 200 }
      },
      ALL_GROUPS: {
        workers: [{ id: 'w_stray', name: 'Stray Worker', desig: 'Helper', rate: 500 }]
      },
      sub_deleted: {
        workers: [{ id: 'w_orphan', name: 'Deleted Group Worker', desig: 'Helper', rate: 500 }]
      }
    },
    [
      { id: 'sub_a', name: 'Madan' },
      { id: 'sub_b', name: 'TAJUDDIN' }
    ]
  );

  // Strictly 2 workers with unique namespaced IDs (stray ALL_GROUPS & deleted subgroup excluded)
  assert.equal(aggregated.workers.length, 2);
  const uniqueIds = new Set(aggregated.workers.map(w => w.id));
  assert.equal(uniqueIds.size, 2);
  assert.ok(uniqueIds.has('sub_a::w_shared'));
  assert.ok(uniqueIds.has('sub_b::w_shared'));

  // Attendance and advances remain isolated per subgroup without overwriting each other
  assert.equal(aggregated.attendance['11-2026']['sub_a::w_shared'][1].duty, 1);
  assert.equal(aggregated.attendance['11-2026']['sub_b::w_shared'][1].duty, 0.5);
  assert.equal(aggregated.advances['sub_a::w_shared'], 500);
  assert.equal(aggregated.advances['sub_b::w_shared'], 200);
});




