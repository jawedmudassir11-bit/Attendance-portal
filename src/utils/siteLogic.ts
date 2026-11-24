export interface SubgroupNode {
  id: string;
  name: string;
}

export interface SiteNode {
  id: string;
  name: string;
  subgroups: SubgroupNode[];
}

export interface WorkerProfile {
  id: string;
  name: string;
  phone?: string;
  desig: string;
  rate: number;
}

export interface KeyPersonProfile {
  id: string;
  name: string;
  phone?: string;
  desig: string;
}

export interface AttendanceRecord {
  duty: number | null;
  ot: number;
  adv: number;
  locked?: boolean;
  graceChances?: number;
}

export interface MaterialEntry {
  item: string;
  qty: string | number;
  unit: string;
  challan?: string;
  supplier?: string;
}

export interface DPRRecord {
  work: string;
  weather: string;
  rainStart: string;
  rainEnd: string;
  workStop: string;
  downtimeReason?: string;
  downtimeHours?: string | number;
  downtimeNotes?: string;
  matReceived: MaterialEntry[];
  matConsumed: MaterialEntry[];
  photos: string[];
}

export interface TimelineNote {
  id: string;
  text: string;
  priority: 'General' | 'Urgent' | 'Safety';
  completed: boolean;
  completedBy: string;
  completedAt: number | null;
  author: string;
  role: string;
  timestamp: number;
}

export interface EquipmentItem {
  id: string;
  name: string;
  operator: string;
  fuel: string;
  status: 'Operational' | 'Maintenance' | 'Idle';
}

export interface AppState {
  workers: WorkerProfile[];
  keyPersons: KeyPersonProfile[];
  attendance: Record<string, Record<string, Record<number, AttendanceRecord>>>;
  kpAttendance: Record<string, Record<string, Record<number, { duty: number | null; locked?: boolean }>>>;
  advances: Record<string, number>;
  dpr: Record<string, DPRRecord>;
  timeline: Record<string, TimelineNote[]>;
  stockThresholds: Record<string, number>;
  equipment: EquipmentItem[];
}

export type UserRole = 'viewer' | 'supervisor' | 'incharge' | 'admin';

// Per-portal Firebase Realtime Database configuration and role passwords
// are configured dynamically inside the app via src/utils/portalLogic.ts
// and src/utils/firebaseBridge.ts (zero hardcoded credentials).

export function parseDutyInput(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  const s = String(val).trim().toUpperCase();
  if (s === 'P' || s === '1') return 1;
  if (s === 'H' || s === '0.5') return 0.5;
  if (s === 'A' || s === '0') return 0;
  const num = parseFloat(s);
  return isNaN(num) ? null : num;
}

export function getDutyDisplaySymbol(val: unknown): 'P' | 'H' | 'A' | '' {
  if (val === 1 || String(val).toUpperCase() === 'P') return 'P';
  if (val === 0.5 || String(val).toUpperCase() === 'H') return 'H';
  if (val === 0 || String(val).toUpperCase() === 'A') return 'A';
  return '';
}

export function getInitials(name: string): string {
  const parts = (name || '')
    .trim()
    .split(/\s+/)
    .map(p => p.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, ''))
    .filter(Boolean);
  if (parts.length > 1) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return parts[0] ? parts[0][0].toUpperCase() : 'U';
}

export const DEFAULT_SITE_EQUIPMENT: EquipmentItem[] = [
  { id: 'eq_1', name: 'Tower Crane TC-01 (Potain)', operator: 'Rakesh Singh', fuel: '7.5h / Elec', status: 'Operational' },
  { id: 'eq_2', name: 'JCB 3DX Backhoe Loader', operator: 'Vikram Yadav', fuel: '6.0h / 42L Diesel', status: 'Operational' },
  { id: 'eq_3', name: 'Kirloskar 125kVA DG Set', operator: 'Manoj Kumar', fuel: '4.5h / 35L Diesel', status: 'Operational' },
  { id: 'eq_4', name: 'Ajax Fiori Transit Mixer', operator: 'Santosh Paswan', fuel: '5.0h / 28L Diesel', status: 'Maintenance' },
  { id: 'eq_5', name: 'Argon TIG/ARC Welding Bank (x6)', operator: 'Md. Irfan', fuel: '8.0h / Grid', status: 'Operational' },
  { id: 'eq_6', name: 'Safety PPE & Harness Locker (100 Sets)', operator: 'Safety Officer', fuel: '100% Inspected', status: 'Operational' }
];

export const DEFAULT_SEED_SITES: SiteNode[] = [
  {
    id: 'site_main',
    name: 'Main Site',
    subgroups: [
      { id: 'sub_team_a', name: 'Team A' },
      { id: 'sub_team_b', name: 'Team B' }
    ]
  }
];

export function createSeedAppState(monthKey: string, currentDay: number): AppState {
  const workers: WorkerProfile[] = [
    { id: 'w_101', name: 'Ramesh Kumar', phone: '9876543210', desig: 'Head Mason', rate: 800 },
    { id: 'w_102', name: 'Sanjay Paswan', phone: '9876543211', desig: 'Bar Bender', rate: 700 },
    { id: 'w_103', name: 'Md. Irfan Ansari', phone: '9876543212', desig: 'Welder (Argon)', rate: 850 },
    { id: 'w_104', name: 'Vikash Yadav', phone: '9876543213', desig: 'Carpenter', rate: 700 },
    { id: 'w_105', name: 'Dinesh Mandal', phone: '9876543214', desig: 'Helper', rate: 500 },
    { id: 'w_106', name: 'Arjun Mahto', phone: '9876543215', desig: 'Fitter', rate: 750 }
  ];

  const keyPersons: KeyPersonProfile[] = [
    { id: 'kp_1', name: 'Er. Rajeshwar Prasad', phone: '9800001122', desig: 'Project Manager' },
    { id: 'kp_2', name: 'Amitabh Verma', phone: '9800001133', desig: 'Site Engineer' }
  ];

  const attendance: AppState['attendance'] = { [monthKey]: {} };
  workers.forEach((w, idx) => {
    attendance[monthKey][w.id] = {};
    const startD = Math.max(1, currentDay - 4);
    for (let d = startD; d <= currentDay; d++) {
      const isToday = d === currentDay;
      const duty = isToday ? (idx === 4 ? 0.5 : 1) : (idx % 5 === 0 && d === startD ? 0 : 1);
      const ot = isToday ? (idx % 2 === 0 ? 2 : 0) : (idx === 0 ? 1.5 : 0);
      const adv = d === currentDay - 1 && idx === 0 ? 500 : 0;
      attendance[monthKey][w.id][d] = { duty, ot, adv, locked: false, graceChances: 2 };
    }
  });

  const dateKey = `${currentDay}-${monthKey}`;
  const dpr: Record<string, DPRRecord> = {
    [dateKey]: {
      work: 'RCC column casting at Grid B1-B6 and structural steel truss alignment at Platform 2.',
      weather: '☀️ Sunny / Clear',
      rainStart: '',
      rainEnd: '',
      workStop: 'No',
      matReceived: [
        { item: 'OPC-53 Cement', qty: 120, unit: 'Bag' },
        { item: 'TMT Fe-500D Rebar', qty: 4.5, unit: 'MT (Metric Tonne)' }
      ],
      matConsumed: [
        { item: 'OPC-53 Cement', qty: 45, unit: 'Bag' },
        { item: 'TMT Fe-500D Rebar', qty: 1.2, unit: 'MT (Metric Tonne)' }
      ],
      photos: []
    }
  };

  const timeline: Record<string, TimelineNote[]> = {
    [dateKey]: [
      {
        id: 'note_seed_1',
        text: 'Verify column shuttering plumb & cover blocks before afternoon pour.',
        priority: 'Urgent',
        completed: false,
        completedBy: '',
        completedAt: null,
        author: 'Site Engineer',
        role: 'incharge',
        timestamp: Date.now() - 3600000
      },
      {
        id: 'note_seed_2',
        text: 'Safety harness & PPE check completed for elevation welding crew.',
        priority: 'Safety',
        completed: true,
        completedBy: 'Supervisor',
        completedAt: Date.now() - 1800000,
        author: 'Supervisor',
        role: 'supervisor',
        timestamp: Date.now() - 5400000
      }
    ]
  };

  return {
    workers,
    keyPersons,
    attendance,
    kpAttendance: {
      [monthKey]: {
        kp_1: { [currentDay]: { duty: 1, locked: false } },
        kp_2: { [currentDay]: { duty: 1, locked: false } }
      }
    },
    advances: { w_101: 1000, w_103: 500 },
    dpr,
    timeline,
    stockThresholds: { 'opc-53 cement': 30, 'tmt fe-500d rebar': 2 },
    equipment: DEFAULT_SITE_EQUIPMENT.map(e => ({ ...e }))
  };
}

export function sanitizeStructure(struct: unknown): SiteNode[] {
  if (!struct) return [];
  const rawArr = Array.isArray(struct) ? struct : Object.values(struct as Record<string, unknown>);
  return rawArr
    .filter(Boolean)
    .map((site: any) => {
      const rawSubs = site.subgroups
        ? Array.isArray(site.subgroups)
          ? site.subgroups
          : Object.values(site.subgroups)
        : [];
      return {
        id: String(site.id || `site_${Date.now()}`),
        name: String(site.name || 'Unnamed Site'),
        subgroups: rawSubs.filter(Boolean).map((sub: any) => ({
          id: String(sub.id || `sub_${Date.now()}`),
          name: String(sub.name || 'Unnamed Group')
        }))
      };
    });
}

export function createEmptyAppState(): AppState {
  return {
    workers: [],
    keyPersons: [],
    attendance: {},
    kpAttendance: {},
    advances: {},
    dpr: {},
    timeline: {},
    stockThresholds: {},
    equipment: DEFAULT_SITE_EQUIPMENT.map(e => ({ ...e }))
  };
}

/**
 * Safely aggregates multiple subgroups for Master Roll-Up (ALL_GROUPS).
 * - Filters strictly to valid subgroups (excluding stray ALL_GROUPS / MASTER_ROLLUP / deleted orphan nodes).
 * - Namespaces worker & official IDs per subgroup (`${subId}::${id}`) so shared IDs never cause
 *   React duplicate-key errors or overwrite attendance/advance entries across subgroups.
 */
export function aggregateMasterRollupState(
  allGroupsRaw: unknown,
  validSubgroups: SubgroupNode[] = []
): AppState {
  if (!allGroupsRaw || typeof allGroupsRaw !== 'object') {
    return createEmptyAppState();
  }

  const allGroups = allGroupsRaw as Record<string, unknown>;
  const validSubMap = new Map<string, string>();
  validSubgroups.forEach(sub => {
    if (sub?.id) validSubMap.set(sub.id, sub.name || sub.id);
  });

  const reservedKeys = new Set(['ALL_GROUPS', 'MASTER_ROLLUP']);
  const candidateEntries = Object.entries(allGroups).filter(([subId, group]) => {
    if (!group || typeof group !== 'object') return false;
    if (reservedKeys.has(subId)) return false;
    if (validSubMap.size > 0 && !validSubMap.has(subId)) return false;
    return true;
  });

  if (candidateEntries.length === 0) {
    return createEmptyAppState();
  }

  const aggregated: AppState = {
    workers: [],
    keyPersons: [],
    attendance: {},
    kpAttendance: {},
    advances: {},
    dpr: {},
    timeline: {},
    stockThresholds: {},
    equipment: []
  };

  candidateEntries.forEach(([subId, rawGroup]) => {
    const clean = sanitizeState(rawGroup);
    const subLabel = validSubMap.get(subId);

    clean.workers.forEach(w => {
      const namespacedId = `${subId}::${w.id}`;
      aggregated.workers.push({
        ...w,
        id: namespacedId,
        desig: subLabel ? `${w.desig} (${subLabel})` : w.desig
      });
    });

    clean.keyPersons.forEach(kp => {
      const namespacedId = `${subId}::${kp.id}`;
      aggregated.keyPersons.push({
        ...kp,
        id: namespacedId
      });
    });

    Object.entries(clean.attendance || {}).forEach(([mKey, monthWorkers]) => {
      if (!monthWorkers || typeof monthWorkers !== 'object') return;
      if (!aggregated.attendance[mKey]) aggregated.attendance[mKey] = {};
      Object.entries(monthWorkers).forEach(([wId, days]) => {
        if (!days || typeof days !== 'object') return;
        aggregated.attendance[mKey][`${subId}::${wId}`] = days;
      });
    });

    Object.entries(clean.kpAttendance || {}).forEach(([mKey, monthKps]) => {
      if (!monthKps || typeof monthKps !== 'object') return;
      if (!aggregated.kpAttendance[mKey]) aggregated.kpAttendance[mKey] = {};
      Object.entries(monthKps).forEach(([kpId, days]) => {
        if (!days || typeof days !== 'object') return;
        aggregated.kpAttendance[mKey][`${subId}::${kpId}`] = days;
      });
    });

    Object.entries(clean.advances || {}).forEach(([wId, advVal]) => {
      const num = parseFloat(String(advVal)) || 0;
      if (num !== 0) {
        aggregated.advances[`${subId}::${wId}`] = num;
      }
    });

    Object.entries(clean.dpr || {}).forEach(([dk, rec]) => {
      if (!rec) return;
      const existing = aggregated.dpr[dk];
      if (!existing) {
        aggregated.dpr[dk] = {
          ...rec,
          matReceived: [...(rec.matReceived || [])],
          matConsumed: [...(rec.matConsumed || [])],
          photos: [...(rec.photos || [])]
        };
      } else {
        existing.work = [existing.work, rec.work].filter(Boolean).join('\n');
        existing.matReceived = [...(existing.matReceived || []), ...(rec.matReceived || [])];
        existing.matConsumed = [...(existing.matConsumed || []), ...(rec.matConsumed || [])];
        existing.photos = [...(existing.photos || []), ...(rec.photos || [])];
      }
    });

    Object.entries(clean.timeline || {}).forEach(([dk, notes]) => {
      if (!Array.isArray(notes) || notes.length === 0) return;
      if (!aggregated.timeline[dk]) aggregated.timeline[dk] = [];
      aggregated.timeline[dk].push(...notes);
    });

    Object.entries(clean.stockThresholds || {}).forEach(([matKey, val]) => {
      if (typeof val === 'number') {
        aggregated.stockThresholds[matKey] = Math.max(aggregated.stockThresholds[matKey] || 0, val);
      }
    });
  });

  if (aggregated.equipment.length === 0) {
    aggregated.equipment = DEFAULT_SITE_EQUIPMENT.map(e => ({ ...e }));
  }

  return aggregated;
}

export function sanitizeState(rawState: unknown): AppState {
  const s: any = rawState && typeof rawState === 'object' ? rawState : {};
  const wArr = Array.isArray(s.workers) ? s.workers : s.workers ? Object.values(s.workers) : [];
  const kpArr = Array.isArray(s.keyPersons) ? s.keyPersons : s.keyPersons ? Object.values(s.keyPersons) : [];

  const dprObj: Record<string, DPRRecord> =
    Array.isArray(s.dpr) ? Object.assign({}, s.dpr) : s.dpr ? { ...s.dpr } : {};

  Object.keys(dprObj).forEach(k => {
    const d: any = dprObj[k];
    if (d) {
      d.matReceived = Array.isArray(d.matReceived)
        ? d.matReceived.filter(Boolean)
        : d.matReceived
        ? Object.values(d.matReceived).filter(Boolean)
        : [];
      d.matConsumed = Array.isArray(d.matConsumed)
        ? d.matConsumed.filter(Boolean)
        : d.matConsumed
        ? Object.values(d.matConsumed).filter(Boolean)
        : [];
      d.photos = Array.isArray(d.photos)
        ? d.photos.filter(Boolean)
        : d.photos
        ? Object.values(d.photos).filter(Boolean)
        : [];
    }
  });

  const timelineObj: Record<string, TimelineNote[]> = {};
  if (s.timeline && typeof s.timeline === 'object') {
    Object.entries(s.timeline).forEach(([dk, notes]: [string, any]) => {
      const arr = Array.isArray(notes) ? notes : notes ? Object.values(notes) : [];
      timelineObj[dk] = arr.filter(Boolean);
    });
  }

  const eqArr = Array.isArray(s.equipment) && s.equipment.length > 0
    ? s.equipment.filter(Boolean)
    : DEFAULT_SITE_EQUIPMENT.map(e => ({ ...e }));

  return {
    workers: wArr.filter(Boolean).map((w: any) => ({
      id: String(w.id),
      name: String(w.name || ''),
      phone: w.phone ? String(w.phone) : '',
      desig: String(w.desig || 'Labor'),
      rate: parseFloat(w.rate) || 0
    })),
    keyPersons: kpArr.filter(Boolean).map((kp: any) => ({
      id: String(kp.id),
      name: String(kp.name || ''),
      phone: kp.phone ? String(kp.phone) : '',
      desig: String(kp.desig || 'Official')
    })),
    attendance: Array.isArray(s.attendance) ? Object.assign({}, s.attendance) : s.attendance || {},
    kpAttendance: Array.isArray(s.kpAttendance) ? Object.assign({}, s.kpAttendance) : s.kpAttendance || {},
    advances: Array.isArray(s.advances) ? Object.assign({}, s.advances) : s.advances || {},
    dpr: dprObj,
    timeline: timelineObj,
    stockThresholds:
      s.stockThresholds && typeof s.stockThresholds === 'object' && !Array.isArray(s.stockThresholds)
        ? s.stockThresholds
        : {},
    equipment: eqArr
  };
}

export function calculateWorkerMonthlySummary(
  worker: WorkerProfile,
  monthAtt: Record<string, Record<number, AttendanceRecord>> | undefined,
  openingAdvances: Record<string, number> | undefined,
  totalDaysInMonth: number
) {
  let totalDuty = 0;
  let totalOT = 0;
  let dailyAdv = 0;
  const workerDays = (monthAtt && monthAtt[worker.id]) || {};

  for (let d = 1; d <= totalDaysInMonth; d++) {
    const rec = workerDays[d];
    if (rec) {
      const dutyNum = parseDutyInput(rec.duty);
      if (dutyNum !== null) totalDuty += dutyNum;
      totalOT += parseFloat(String(rec.ot)) || 0;
      dailyAdv += parseFloat(String(rec.adv)) || 0;
    }
  }

  const rate = parseFloat(String(worker.rate)) || 0;
  const grossAmount = totalDuty * rate + totalOT * (rate / 8);
  const openingAdv = (openingAdvances && parseFloat(String(openingAdvances[worker.id]))) || 0;
  const totalAdvance = openingAdv + dailyAdv;
  const netBalance = grossAmount - totalAdvance;

  return {
    totalDuty,
    totalOT,
    dailyAdv,
    openingAdv,
    totalAdvance,
    grossAmount,
    netBalance
  };
}

export function calculateSiteDashboardStats(
  appState: AppState,
  monthKey: string,
  selectedDay: number
) {
  const parts = monthKey.split('-');
  const m = parseInt(parts[0], 10) || 1;
  const y = parseInt(parts[1], 10) || 2026;
  const daysInMonth = new Date(y, m, 0).getDate();
  const monthAtt = appState.attendance[monthKey] || {};

  let presentToday = 0;
  let halfDayToday = 0;
  let absentToday = 0;
  let unmarkedToday = 0;
  let totalOT = 0;
  let totalGross = 0;
  let totalAdvance = 0;
  let totalNetBalance = 0;

  appState.workers.forEach(w => {
    const todayRec = monthAtt[w.id] && monthAtt[w.id][selectedDay];
    const dutyToday = todayRec ? parseDutyInput(todayRec.duty) : null;
    if (dutyToday === 1) {
      presentToday++;
    } else if (dutyToday === 0.5) {
      presentToday++;
      halfDayToday++;
    } else if (dutyToday === 0) {
      absentToday++;
    } else {
      unmarkedToday++;
    }

    const summary = calculateWorkerMonthlySummary(w, monthAtt, appState.advances, daysInMonth);
    totalOT += summary.totalOT;
    totalGross += summary.grossAmount;
    totalAdvance += summary.totalAdvance;
    totalNetBalance += summary.netBalance;
  });

  return {
    totalWorkers: appState.workers.length,
    presentToday,
    halfDayToday,
    absentToday,
    unmarkedToday,
    totalOT,
    totalGross,
    totalAdvance,
    totalNetBalance
  };
}

export function calculateActiveStockMap(dprMap: Record<string, DPRRecord>): Record<string, { qty: number; unit: string }> {
  const stockMap: Record<string, { qty: number; unit: string }> = {};
  Object.values(dprMap || {}).forEach(d => {
    if (!d) return;
    if (d.matReceived) {
      d.matReceived.forEach(m => {
        const name = (m.item || '').trim().toLowerCase();
        if (!name) return;
        if (!stockMap[name]) stockMap[name] = { qty: 0, unit: m.unit || 'Unit' };
        stockMap[name].qty += parseFloat(String(m.qty)) || 0;
        if (m.unit) stockMap[name].unit = m.unit;
      });
    }
    if (d.matConsumed) {
      d.matConsumed.forEach(m => {
        const name = (m.item || '').trim().toLowerCase();
        if (!name) return;
        if (!stockMap[name]) stockMap[name] = { qty: 0, unit: m.unit || 'Unit' };
        stockMap[name].qty -= parseFloat(String(m.qty)) || 0;
      });
    }
  });
  return stockMap;
}

/**
 * Attendance Auto-Lock for Supervisors & Site In-Charge + Admin Full Access:
 * - Admin is NEVER locked; Admin can change anything at any time.
 * - Viewer is always locked (read-only).
 * - Both Supervisor and Site In-Charge are auto-locked on days older than 24-48 hours
 *   (currentDay - day >= 2 or past months) or when a day has been manually locked by Admin.
 */
export function isDayAutoLockedForRole(
  userRole: UserRole,
  day: number,
  monthKey: string,
  currentDay: number,
  currentMonthKey: string,
  manualLocked?: boolean
): boolean {
  if (userRole === 'admin') {
    return false;
  }
  if (userRole === 'viewer') {
    return true;
  }
  // Both Supervisor and Site In-Charge:
  if (manualLocked) {
    return true;
  }
  if (monthKey !== currentMonthKey) {
    return true;
  }
  if (currentDay - day >= 2) {
    return true;
  }
  return false;
}

/**
 * 1-Tap End-of-Day 6:00 PM WhatsApp Executive Summary generator for Head Office.
 * Formats: Total Workforce Present, Trade Breakdown, Today's Overtime & Advances,
 * Weather & Downtime Delays, and Materials Received (Challan log).
 */
export function generateEndOfDayWhatsAppSummary(params: {
  companyName?: string;
  siteName: string;
  subgroupName: string;
  dateKey: string;
  selectedDay: number;
  monthKey: string;
  userName?: string;
  userRole?: string;
  workers: WorkerProfile[];
  keyPersons?: KeyPersonProfile[];
  attendance: Record<string, Record<string, Record<number, AttendanceRecord>>>;
  kpAttendance?: Record<string, Record<string, Record<number, { duty: number | null }>>>;
  dpr: Record<string, DPRRecord>;
}): string {
  const {
    companyName = 'Attendance Portal',
    siteName,
    subgroupName,
    dateKey,
    selectedDay,
    monthKey,
    userName = 'Site In-Charge',
    userRole = 'Supervisor',
    workers,
    keyPersons = [],
    attendance,
    kpAttendance = {},
    dpr
  } = params;

  const monthAtt = attendance[monthKey] || {};
  let totalPresent = 0;
  let fullDays = 0;
  let halfDays = 0;
  let absentCount = 0;
  let unmarkedCount = 0;
  let totalOT = 0;
  let workersWithOT = 0;
  let totalAdvance = 0;

  const tradeBreakdown: Record<string, { present: number; total: number }> = {};

  workers.forEach(w => {
    const trade = (w.desig || 'Unspecified').trim();
    if (!tradeBreakdown[trade]) {
      tradeBreakdown[trade] = { present: 0, total: 0 };
    }
    tradeBreakdown[trade].total++;

    const rec = monthAtt[w.id]?.[selectedDay];
    const dutyVal = parseDutyInput(rec?.duty);

    if (dutyVal === 1) {
      totalPresent++;
      fullDays++;
      tradeBreakdown[trade].present++;
    } else if (dutyVal === 0.5) {
      totalPresent++;
      halfDays++;
      tradeBreakdown[trade].present += 0.5;
    } else if (dutyVal === 0) {
      absentCount++;
    } else {
      unmarkedCount++;
    }

    if (rec?.ot && Number(rec.ot) > 0) {
      totalOT += Number(rec.ot);
      workersWithOT++;
    }
    if (rec?.adv && Number(rec.adv) > 0) {
      totalAdvance += Number(rec.adv);
    }
  });

  let kpPresent = 0;
  keyPersons.forEach(kp => {
    const kDuty = kpAttendance[monthKey]?.[kp.id]?.[selectedDay]?.duty;
    if (parseDutyInput(kDuty) !== null && (parseDutyInput(kDuty) || 0) > 0) {
      kpPresent++;
    }
  });

  const dprRec = dpr[dateKey];
  const weather = dprRec?.weather || '☀️ Sunny / Clear';
  const downtime = dprRec?.downtimeReason;
  const downtimeHrs = dprRec?.downtimeHours;
  const downtimeNotes = dprRec?.downtimeNotes;

  const percent = workers.length > 0 ? Math.round((totalPresent / workers.length) * 100) : 0;

  const brandUpper = (companyName || 'Attendance Portal').trim().toUpperCase();
  let text = `🏗️ *${brandUpper} — 6:00 PM DAILY EXECUTIVE SITE SUMMARY*\n`;
  text += `🏢 *Site:* ${siteName} ➔ ${subgroupName}\n`;
  text += `📅 *Date:* ${dateKey}\n`;
  text += `👤 *Prepared By:* ${userName} (${userRole.toUpperCase()})\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;

  text += `👥 *LABOUR WORKFORCE (हाज़िरी)*\n`;
  text += `• Registered Strength: ${workers.length} Workers\n`;
  text += `• Total Present: *${totalPresent}* (${percent}%)\n`;
  text += `• Full Day (1.0): ${fullDays} | Half Day (0.5): ${halfDays}\n`;
  text += `• Absent (0.0): ${absentCount}${unmarkedCount > 0 ? ` | Unmarked: ${unmarkedCount}` : ''}\n`;
  if (keyPersons.length > 0) {
    text += `• Key Officials On Site: ${kpPresent} of ${keyPersons.length}\n`;
  }

  text += `\n🔨 *TRADE BREAKDOWN (उपस्थिति)*\n`;
  const tradeEntries = Object.entries(tradeBreakdown);
  if (tradeEntries.length === 0) {
    text += `• None registered\n`;
  } else {
    tradeEntries.forEach(([trade, stats]) => {
      text += `• ${trade}: ${stats.present} Present (of ${stats.total})\n`;
    });
  }

  text += `\n⏱️ *OVERTIME & CASH ADVANCES TODAY*\n`;
  text += `• Total Overtime Clocked: *${totalOT} Hrs* (${workersWithOT} workers)\n`;
  text += `• Site Cash Advances Paid: ₹${totalAdvance.toLocaleString('en-IN')}\n`;

  text += `\n⛈️ *WEATHER & DOWNTIME TRACKER*\n`;
  text += `• Weather Condition: ${weather}\n`;
  if (downtime && downtime !== 'None' && downtime !== 'No Downtime') {
    text += `• ⚠️ *Downtime Delay:* ${downtime}${downtimeHrs ? ` (${downtimeHrs} hrs lost)` : ''}\n`;
    if (downtimeNotes) text += `• *Downtime Reason / Impact:* ${downtimeNotes}\n`;
  } else {
    text += `• Downtime Delay: None (Continuous full-shift work)\n`;
  }

  text += `\n📦 *MATERIALS RECEIVED TODAY (CHALANI LOG)*\n`;
  if (!dprRec?.matReceived || dprRec.matReceived.length === 0) {
    text += `• None received today\n`;
  } else {
    dprRec.matReceived.forEach(m => {
      const meta = [m.challan ? `Challan: ${m.challan}` : '', m.supplier ? `Party: ${m.supplier}` : '']
        .filter(Boolean)
        .join(', ');
      text += `• ${m.item}: ${m.qty} ${m.unit}${meta ? ` (${meta})` : ''}\n`;
    });
  }

  text += `\n🧱 *MATERIALS CONSUMED TODAY*\n`;
  if (!dprRec?.matConsumed || dprRec.matConsumed.length === 0) {
    text += `• None recorded\n`;
  } else {
    dprRec.matConsumed.forEach(m => {
      text += `• ${m.item}: ${m.qty} ${m.unit}\n`;
    });
  }

  text += `\n📝 *DAILY WORK ALLOCATION & TASKS*\n`;
  text += `${dprRec?.work?.trim() || 'Standard site operations and construction activities.'}\n`;

  text += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `_Dispatched via ${companyName || 'Attendance Portal'}_`;

  return text;
}

export interface BookkeepingSheetData {
  name: string;
  rows: (string | number)[][];
  colWidths: number[];
}

export interface MonthlyBookkeepingWorkbook {
  filename: string;
  monthLabel: string;
  totals: {
    workerCount: number;
    totalDuties: number;
    totalOT: number;
    totalBaseWage: number;
    totalOtPay: number;
    totalGross: number;
    totalOpeningAdv: number;
    totalDailyAdv: number;
    totalAdvance: number;
    totalNetPayable: number;
    advanceTransactionsCount: number;
  };
  sheets: BookkeepingSheetData[];
}

const BOOKKEEPING_MONTH_NAMES = [
  '',
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
];

/**
 * Builds a structured 4-sheet monthly bookkeeping workbook (Payroll Summary,
 * Day-by-Day Attendance Matrix, Overtime Log, and Itemized Advances Ledger)
 * for the selected site and month.
 */
export function buildMonthlyBookkeepingWorkbookData(params: {
  appState: AppState;
  monthKey: string;
  siteName: string;
  subgroupName: string;
  companyName?: string;
  companySubtitle?: string;
  generatedAt?: Date;
}): MonthlyBookkeepingWorkbook {
  const {
    appState,
    monthKey,
    siteName,
    subgroupName,
    companyName = 'Attendance Portal',
    companySubtitle = '',
    generatedAt = new Date()
  } = params;
  const brandUpper = (companyName || 'Attendance Portal').trim().toUpperCase();
  const parts = monthKey.split('-');
  const monthNum = parseInt(parts[0], 10) || 1;
  const yearNum = parseInt(parts[1], 10) || 2026;
  const daysInMonth = new Date(yearNum, monthNum, 0).getDate();
  const monthName = BOOKKEEPING_MONTH_NAMES[monthNum] || `Month-${monthNum}`;
  const monthLabel = `${monthName} ${yearNum}`;
  const monthShort = monthName.slice(0, 3);
  const monthAtt = appState.attendance[monthKey] || {};
  const monthKpAtt = appState.kpAttendance?.[monthKey] || {};

  let totalDuties = 0;
  let totalOT = 0;
  let totalBaseWage = 0;
  let totalOtPay = 0;
  let totalGross = 0;
  let totalOpeningAdv = 0;
  let totalDailyAdv = 0;
  let totalAdvance = 0;
  let totalNetPayable = 0;

  const tradeTotals: Record<
    string,
    { count: number; duties: number; ot: number; gross: number; adv: number; net: number }
  > = {};

  const dailyDutyTotals: number[] = Array(daysInMonth).fill(0);
  const dailyOtTotals: number[] = Array(daysInMonth).fill(0);

  const advanceLedgerEntries: {
    sortOrder: number;
    dateLabel: string;
    workerId: string;
    workerName: string;
    desig: string;
    type: string;
    amount: number;
  }[] = [];

  const payrollWorkerRows: (string | number)[][] = [];
  const attendanceMatrixRows: (string | number)[][] = [];
  const overtimeMatrixRows: (string | number)[][] = [];

  appState.workers.forEach((worker, idx) => {
    const workerDays = monthAtt[worker.id] || {};
    const rate = parseFloat(String(worker.rate)) || 0;
    const hourlyRate = rate / 8;

    let fullDays = 0;
    let halfDays = 0;
    let absentDays = 0;
    let wDuties = 0;
    let wOT = 0;
    let wDailyAdv = 0;

    const daySymbols: (string | number)[] = [];
    const dayOts: (string | number)[] = [];

    const openingAdv = parseFloat(String(appState.advances?.[worker.id])) || 0;
    if (openingAdv > 0) {
      advanceLedgerEntries.push({
        sortOrder: 0,
        dateLabel: `01 ${monthShort} ${yearNum} (B/F)`,
        workerId: worker.id,
        workerName: worker.name,
        desig: worker.desig,
        type: 'Opening Balance B/F',
        amount: Math.round(openingAdv)
      });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const rec = workerDays[d];
      const dutyVal = rec ? parseDutyInput(rec.duty) : null;
      const otVal = rec ? parseFloat(String(rec.ot)) || 0 : 0;
      const advVal = rec ? parseFloat(String(rec.adv)) || 0 : 0;

      if (dutyVal === 1) {
        fullDays++;
        wDuties += 1;
        dailyDutyTotals[d - 1] += 1;
        daySymbols.push('P');
      } else if (dutyVal === 0.5) {
        halfDays++;
        wDuties += 0.5;
        dailyDutyTotals[d - 1] += 0.5;
        daySymbols.push('H');
      } else if (dutyVal === 0) {
        absentDays++;
        daySymbols.push('A');
      } else if (dutyVal !== null) {
        wDuties += dutyVal;
        dailyDutyTotals[d - 1] += dutyVal;
        daySymbols.push(dutyVal);
      } else {
        daySymbols.push('-');
      }

      if (otVal > 0) {
        wOT += otVal;
        dailyOtTotals[d - 1] += otVal;
        dayOts.push(otVal);
      } else {
        dayOts.push('');
      }

      if (advVal > 0) {
        wDailyAdv += advVal;
        advanceLedgerEntries.push({
          sortOrder: d,
          dateLabel: `${String(d).padStart(2, '0')} ${monthShort} ${yearNum}`,
          workerId: worker.id,
          workerName: worker.name,
          desig: worker.desig,
          type: 'Daily Site Cash Advance',
          amount: Math.round(advVal)
        });
      }
    }

    const baseWage = wDuties * rate;
    const otPay = wOT * hourlyRate;
    const gross = baseWage + otPay;
    const totalAdv = openingAdv + wDailyAdv;
    const netPay = gross - totalAdv;

    totalDuties += wDuties;
    totalOT += wOT;
    totalBaseWage += baseWage;
    totalOtPay += otPay;
    totalGross += gross;
    totalOpeningAdv += openingAdv;
    totalDailyAdv += wDailyAdv;
    totalAdvance += totalAdv;
    totalNetPayable += netPay;

    const tradeKey = (worker.desig || 'Unspecified').trim();
    if (!tradeTotals[tradeKey]) {
      tradeTotals[tradeKey] = { count: 0, duties: 0, ot: 0, gross: 0, adv: 0, net: 0 };
    }
    tradeTotals[tradeKey].count += 1;
    tradeTotals[tradeKey].duties += wDuties;
    tradeTotals[tradeKey].ot += wOT;
    tradeTotals[tradeKey].gross += gross;
    tradeTotals[tradeKey].adv += totalAdv;
    tradeTotals[tradeKey].net += netPay;

    payrollWorkerRows.push([
      idx + 1,
      worker.id,
      worker.name,
      worker.desig,
      worker.phone || '-',
      rate,
      fullDays,
      halfDays,
      absentDays,
      Number(wDuties.toFixed(2)),
      Number(wOT.toFixed(2)),
      Math.round(baseWage),
      Math.round(otPay),
      Math.round(gross),
      Math.round(openingAdv),
      Math.round(wDailyAdv),
      Math.round(totalAdv),
      Math.round(netPay),
      ''
    ]);

    attendanceMatrixRows.push([
      idx + 1,
      worker.name,
      worker.desig,
      rate,
      ...daySymbols,
      Number(wDuties.toFixed(2)),
      Number(wOT.toFixed(2))
    ]);

    overtimeMatrixRows.push([
      idx + 1,
      worker.name,
      worker.desig,
      Number(hourlyRate.toFixed(2)),
      ...dayOts,
      Number(wOT.toFixed(2)),
      Math.round(otPay)
    ]);
  });

  const generatedStr = generatedAt.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  // SHEET 1: Payroll Summary & Trade Cost Breakdown
  const payrollSheetRows: (string | number)[][] = [
    [`${brandUpper} — MONTHLY BOOKKEEPING & PAYROLL LEDGER`],
    [companySubtitle || `${companyName} — Official Site Operations & Payroll`],
    ['Site', siteName, 'Subgroup / Team', subgroupName, 'Billing Month', monthLabel, 'Exported On', generatedStr],
    [],
    [
      'Total Workers',
      appState.workers.length,
      'Total Man-Days',
      Number(totalDuties.toFixed(2)),
      'Total OT (Hrs)',
      Number(totalOT.toFixed(2)),
      'Gross Wages (₹)',
      Math.round(totalGross),
      'Total Advances (₹)',
      Math.round(totalAdvance),
      'Net Payable (₹)',
      Math.round(totalNetPayable)
    ],
    [],
    [
      'SL',
      'Worker ID',
      'Worker Name',
      'Trade / Designation',
      'Phone',
      'Daily Rate (₹)',
      'Full Days (P)',
      'Half Days (H)',
      'Absent (A)',
      'Total Duties',
      'OT (Hrs)',
      'Base Wage (₹)',
      'OT Pay (₹)',
      'Gross Earned (₹)',
      'Opening Adv (₹)',
      'Monthly Adv (₹)',
      'Total Advance (₹)',
      'Net Payable (₹)',
      'Remarks / Sign'
    ],
    ...payrollWorkerRows,
    [
      '',
      '',
      'GRAND TOTAL',
      `${appState.workers.length} Workers`,
      '',
      '',
      '',
      '',
      '',
      Number(totalDuties.toFixed(2)),
      Number(totalOT.toFixed(2)),
      Math.round(totalBaseWage),
      Math.round(totalOtPay),
      Math.round(totalGross),
      Math.round(totalOpeningAdv),
      Math.round(totalDailyAdv),
      Math.round(totalAdvance),
      Math.round(totalNetPayable),
      ''
    ],
    [],
    ['TRADE-WISE COST CENTER SUMMARY'],
    ['Trade / Designation', 'Workers', 'Total Man-Days', 'Total OT (Hrs)', 'Gross Wages (₹)', 'Total Advances (₹)', 'Net Payable (₹)'],
    ...Object.entries(tradeTotals).map(([trade, t]) => [
      trade,
      t.count,
      Number(t.duties.toFixed(2)),
      Number(t.ot.toFixed(2)),
      Math.round(t.gross),
      Math.round(t.adv),
      Math.round(t.net)
    ])
  ];

  // SHEET 2: Day-by-Day Attendance Matrix
  const dayHeaders = Array.from({ length: daysInMonth }, (_, i) => `D${i + 1}`);
  const attendanceSheetRows: (string | number)[][] = [
    [`${brandUpper} — MONTHLY MUSTER ROLL (${monthLabel.toUpperCase()})`],
    ['Site', siteName, 'Subgroup', subgroupName, 'Legend', 'P = Full (1.0) | H = Half (0.5) | A = Absent (0.0) | - = Unmarked'],
    [],
    ['SL', 'Worker Name', 'Trade', 'Rate (₹)', ...dayHeaders, 'Total Duties', 'Total OT (Hrs)'],
    ...attendanceMatrixRows,
    [
      '',
      'DAILY HEADCOUNT (MAN-DAYS)',
      '',
      '',
      ...dailyDutyTotals.map(v => Number(v.toFixed(1))),
      Number(totalDuties.toFixed(2)),
      Number(totalOT.toFixed(2))
    ]
  ];

  if (appState.keyPersons && appState.keyPersons.length > 0) {
    attendanceSheetRows.push([], ['SITE OFFICIALS / KEY PERSONS ATTENDANCE']);
    attendanceSheetRows.push(['SL', 'Official Name', 'Designation', 'Phone', ...dayHeaders, 'Total Days']);
    appState.keyPersons.forEach((kp, idx) => {
      const kpDays = monthKpAtt[kp.id] || {};
      let kpTotal = 0;
      const kpSymbols: (string | number)[] = [];
      for (let d = 1; d <= daysInMonth; d++) {
        const val = kpDays[d] ? parseDutyInput(kpDays[d].duty) : null;
        if (val === 1) {
          kpTotal += 1;
          kpSymbols.push('P');
        } else if (val === 0.5) {
          kpTotal += 0.5;
          kpSymbols.push('H');
        } else if (val === 0) {
          kpSymbols.push('A');
        } else {
          kpSymbols.push('-');
        }
      }
      attendanceSheetRows.push([
        idx + 1,
        kp.name,
        kp.desig,
        kp.phone || '-',
        ...kpSymbols,
        Number(kpTotal.toFixed(1))
      ]);
    });
  }

  // SHEET 3: Overtime Log Matrix
  const overtimeSheetRows: (string | number)[][] = [
    [`${brandUpper} — MONTHLY OVERTIME LOG (${monthLabel.toUpperCase()})`],
    ['Site', siteName, 'Subgroup', subgroupName, 'OT Formula', 'Hourly Rate = Daily Rate / 8'],
    [],
    ['SL', 'Worker Name', 'Trade', 'OT Rate/Hr (₹)', ...dayHeaders, 'Total OT (Hrs)', 'OT Payable (₹)'],
    ...overtimeMatrixRows,
    [
      '',
      'DAILY OT TOTALS (HRS)',
      '',
      '',
      ...dailyOtTotals.map(v => (v > 0 ? Number(v.toFixed(1)) : '')),
      Number(totalOT.toFixed(2)),
      Math.round(totalOtPay)
    ]
  ];

  // SHEET 4: Itemized Advances Ledger
  advanceLedgerEntries.sort((a, b) => a.sortOrder - b.sortOrder || a.workerName.localeCompare(b.workerName));
  const advanceSheetRows: (string | number)[][] = [
    [`${brandUpper} — ADVANCES & DEDUCTIONS LEDGER (${monthLabel.toUpperCase()})`],
    ['Site', siteName, 'Subgroup', subgroupName, 'Opening B/F (₹)', Math.round(totalOpeningAdv), 'Monthly Cash Adv (₹)', Math.round(totalDailyAdv)],
    [],
    ['SL', 'Date', 'Worker ID', 'Worker Name', 'Trade / Designation', 'Entry Type', 'Amount (₹)']
  ];

  if (advanceLedgerEntries.length === 0) {
    advanceSheetRows.push(['', '-', '-', 'No advances recorded for this month', '-', '-', 0]);
  } else {
    advanceLedgerEntries.forEach((entry, idx) => {
      advanceSheetRows.push([
        idx + 1,
        entry.dateLabel,
        entry.workerId,
        entry.workerName,
        entry.desig,
        entry.type,
        entry.amount
      ]);
    });
  }

  advanceSheetRows.push(['', '', '', 'TOTAL ADVANCES DEDUCTED', '', `${advanceLedgerEntries.length} Entries`, Math.round(totalAdvance)]);

  const safeBrand = (companyName || 'Attendance_Portal').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '') || 'Attendance_Portal';
  const safeSite = siteName.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '') || 'Site';
  const safeSub = subgroupName.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '') || 'Team';
  const filename = `${safeBrand}_Bookkeeping_${safeSite}_${safeSub}_${monthShort}_${yearNum}.xlsx`;

  return {
    filename,
    monthLabel,
    totals: {
      workerCount: appState.workers.length,
      totalDuties: Number(totalDuties.toFixed(2)),
      totalOT: Number(totalOT.toFixed(2)),
      totalBaseWage: Math.round(totalBaseWage),
      totalOtPay: Math.round(totalOtPay),
      totalGross: Math.round(totalGross),
      totalOpeningAdv: Math.round(totalOpeningAdv),
      totalDailyAdv: Math.round(totalDailyAdv),
      totalAdvance: Math.round(totalAdvance),
      totalNetPayable: Math.round(totalNetPayable),
      advanceTransactionsCount: advanceLedgerEntries.length
    },
    sheets: [
      {
        name: 'Payroll_Summary',
        rows: payrollSheetRows,
        colWidths: [6, 12, 22, 18, 14, 13, 12, 12, 10, 12, 10, 14, 12, 15, 14, 14, 15, 15, 18]
      },
      {
        name: 'Attendance_Matrix',
        rows: attendanceSheetRows,
        colWidths: [6, 22, 16, 11, ...Array(daysInMonth).fill(5), 13, 14]
      },
      {
        name: 'Overtime_Log',
        rows: overtimeSheetRows,
        colWidths: [6, 22, 16, 13, ...Array(daysInMonth).fill(5), 14, 15]
      },
      {
        name: 'Advances_Ledger',
        rows: advanceSheetRows,
        colWidths: [6, 18, 12, 24, 18, 24, 14]
      }
    ]
  };
}

export interface MaterialConsumptionBreakdownItem {
  key: string;
  item: string;
  unit: string;
  qty: number;
  unitRate: number;
  value: number;
}

export interface MonthlyExecutiveSummary {
  monthLabel: string;
  daysInMonth: number;
  labor: {
    baseWage: number;
    otPay: number;
    totalLaborCost: number;
    totalDuties: number;
    totalOT: number;
    activeWorkers: number;
    totalWorkers: number;
  };
  materials: {
    totalMaterialValue: number;
    itemsCount: number;
    entriesCount: number;
    breakdown: MaterialConsumptionBreakdownItem[];
  };
  advances: {
    monthlyDailyAdvances: number;
    openingAdvances: number;
    totalAdvances: number;
    workersWithAdvance: number;
    netLaborPayable: number;
  };
  totalSiteCost: number;
}

/**
 * Provides realistic Indian construction material reference unit rates (in ₹)
 * based on item name and unit, used when custom site rates are not overridden.
 */
export function getDefaultMaterialUnitRate(itemName: string, unit: string): number {
  const n = (itemName || '').toLowerCase();
  const u = (unit || '').toLowerCase();

  if (n.includes('cement')) {
    if (u.includes('mt') || u.includes('ton')) return 7600;
    if (u.includes('kg')) return 7.6;
    return 380; // per 50kg bag
  }
  if (n.includes('tmt') || n.includes('rebar') || n.includes('steel') || n.includes('saria')) {
    if (u.includes('mt') || u.includes('ton')) return 62000;
    if (u.includes('qtl') || u.includes('quintal')) return 6200;
    return 62; // per kg
  }
  if (n.includes('binding') && n.includes('wire')) {
    return 95; // per kg
  }
  if (n.includes('sand') || n.includes('balu')) {
    if (u.includes('brass')) return 6500;
    if (u.includes('cum') || u.includes('m3') || u.includes('m³')) return 2300;
    if (u.includes('tractor') || u.includes('trolley')) return 4500;
    return 65; // per CFT
  }
  if (n.includes('agg') || n.includes('gitti') || n.includes('chip') || n.includes('ballast') || n.includes('stone')) {
    if (u.includes('brass')) return 5800;
    if (u.includes('cum') || u.includes('m3') || u.includes('m³')) return 2050;
    return 58; // per CFT
  }
  if (n.includes('brick') || n.includes('block') || n.includes('aac')) {
    if (n.includes('aac') || n.includes('block')) return 65;
    return 9; // per brick
  }
  if (n.includes('diesel') || n.includes('petrol') || n.includes('fuel')) {
    return 92; // per litre
  }
  if (n.includes('ply') || n.includes('shutter')) {
    if (u.includes('sqft') || u.includes('sq.ft')) return 65;
    return 1600; // per sheet
  }
  if (n.includes('paint') || n.includes('primer') || n.includes('putty')) {
    if (u.includes('bag')) return 850;
    return 240; // per litre/kg
  }
  if (n.includes('pipe') || n.includes('pvc') || n.includes('conduit')) {
    return 280;
  }
  return 500; // sensible fallback for uncategorized material
}

/**
 * Calculates a high-level monthly site financial summary covering:
 * - Total Site Labor Costs (Base + Overtime)
 * - Monthly Material Consumption Value (from DPR consumption logs)
 * - Total Advances Issued (Daily Cash Advances + Opening B/F)
 */
export function calculateMonthlyExecutiveSummary(params: {
  appState: AppState;
  monthKey: string;
  customMaterialRates?: Record<string, number>;
}): MonthlyExecutiveSummary {
  const { appState, monthKey, customMaterialRates = {} } = params;
  const parts = monthKey.split('-');
  const monthNum = parseInt(parts[0], 10) || 1;
  const yearNum = parseInt(parts[1], 10) || 2026;
  const daysInMonth = new Date(yearNum, monthNum, 0).getDate();
  const monthName = BOOKKEEPING_MONTH_NAMES[monthNum] || `Month-${monthNum}`;
  const monthLabel = `${monthName} ${yearNum}`;
  const monthAtt = appState.attendance[monthKey] || {};

  // 1. Labor & Advances aggregation
  let baseWage = 0;
  let otPay = 0;
  let totalDuties = 0;
  let totalOT = 0;
  let activeWorkers = 0;
  let monthlyDailyAdvances = 0;
  let openingAdvances = 0;
  let workersWithAdvance = 0;

  appState.workers.forEach(w => {
    const s = calculateWorkerMonthlySummary(w, monthAtt, appState.advances, daysInMonth);
    const rate = parseFloat(String(w.rate)) || 0;
    const wBase = s.totalDuty * rate;
    const wOt = s.totalOT * (rate / 8);

    baseWage += wBase;
    otPay += wOt;
    totalDuties += s.totalDuty;
    totalOT += s.totalOT;
    if (s.totalDuty > 0 || s.totalOT > 0) activeWorkers++;

    monthlyDailyAdvances += s.dailyAdv;
    openingAdvances += s.openingAdv;
    if (s.totalAdvance > 0) workersWithAdvance++;
  });

  const totalLaborCost = Math.round(baseWage + otPay);
  const totalAdvances = Math.round(openingAdvances + monthlyDailyAdvances);

  // 2. Material consumption aggregation for the selected month from DPR logs
  const matMap: Record<string, { item: string; unit: string; qty: number }> = {};
  let entriesCount = 0;

  Object.entries(appState.dpr || {}).forEach(([dprKey, record]) => {
    if (!record || !record.matConsumed || record.matConsumed.length === 0) return;
    const keyParts = dprKey.split('-');
    if (keyParts.length !== 3) return;
    const dprMonth = parseInt(keyParts[1], 10);
    const dprYear = parseInt(keyParts[2], 10);
    if (dprMonth !== monthNum || dprYear !== yearNum) return;

    record.matConsumed.forEach(entry => {
      const cleanName = (entry.item || '').trim();
      const qty = parseFloat(String(entry.qty)) || 0;
      if (!cleanName || qty <= 0) return;
      const unit = (entry.unit || 'Unit').trim();
      const key = `${cleanName.toLowerCase()}__${unit.toLowerCase()}`;
      if (!matMap[key]) {
        matMap[key] = { item: cleanName, unit, qty: 0 };
      }
      matMap[key].qty += qty;
      entriesCount++;
    });
  });

  let totalMaterialValue = 0;
  const breakdown: MaterialConsumptionBreakdownItem[] = Object.entries(matMap)
    .map(([key, info]) => {
      const customRate = customMaterialRates[key];
      const unitRate =
        typeof customRate === 'number' && !isNaN(customRate) && customRate >= 0
          ? customRate
          : getDefaultMaterialUnitRate(info.item, info.unit);
      const value = Math.round(info.qty * unitRate);
      totalMaterialValue += value;
      return {
        key,
        item: info.item,
        unit: info.unit,
        qty: Number(info.qty.toFixed(2)),
        unitRate,
        value
      };
    })
    .sort((a, b) => b.value - a.value);

  return {
    monthLabel,
    daysInMonth,
    labor: {
      baseWage: Math.round(baseWage),
      otPay: Math.round(otPay),
      totalLaborCost,
      totalDuties: Number(totalDuties.toFixed(2)),
      totalOT: Number(totalOT.toFixed(2)),
      activeWorkers,
      totalWorkers: appState.workers.length
    },
    materials: {
      totalMaterialValue: Math.round(totalMaterialValue),
      itemsCount: breakdown.length,
      entriesCount,
      breakdown
    },
    advances: {
      monthlyDailyAdvances: Math.round(monthlyDailyAdvances),
      openingAdvances: Math.round(openingAdvances),
      totalAdvances,
      workersWithAdvance,
      netLaborPayable: Math.round(totalLaborCost - totalAdvances)
    },
    totalSiteCost: Math.round(totalLaborCost + totalMaterialValue)
  };
}

// ==========================================
// PROFILE & AVATAR HELPERS (NO HARDCODED SUPER-ADMIN EMAILS)
// ==========================================
export const SUPER_ADMIN_EMAILS: readonly string[] = [] as const;

export function isSuperAdminEmail(email?: string | null): boolean {
  if (!email || typeof email !== 'string') return false;
  const normalized = email.trim().toLowerCase();
  return SUPER_ADMIN_EMAILS.includes(normalized);
}

const SAFE_IMAGE_DATA_URL_RE =
  /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/i;
const MAX_AVATAR_DATA_URL_LEN = 650_000;

export function sanitizeAvatarUrl(url?: string | null): string {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('/assets/') && !trimmed.includes('..')) {
    return trimmed;
  }
  if (
    trimmed.length <= MAX_AVATAR_DATA_URL_LEN &&
    SAFE_IMAGE_DATA_URL_RE.test(trimmed)
  ) {
    return trimmed;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
    return '';
  } catch {
    return '';
  }
}

export function getUserInitials(name?: string | null, email?: string | null): string {
  const cleanName = (name || '').trim();
  if (cleanName) {
    const parts = cleanName.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return cleanName.slice(0, 2).toUpperCase();
  }
  const cleanEmail = (email || '').trim();
  if (cleanEmail) {
    return cleanEmail.slice(0, 2).toUpperCase();
  }
  return 'GI';
}



