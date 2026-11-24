import React, { useState, useMemo, useRef } from 'react';
import {
  FileText,
  FileSpreadsheet,
  Printer,
  Download,
  Calendar,
  Calculator,
  MessageSquare,
  Sliders,
  HardHat,
  Receipt,
  Check,
  Users,
  Package,
  Wallet,
  SlidersHorizontal,
  RotateCcw,
  ShieldCheck,
  Database,
  Upload,
  RefreshCw,
  AlertTriangle,
  Copy
} from 'lucide-react';
import {
  AppState,
  UserRole,
  calculateWorkerMonthlySummary,
  parseDutyInput,
  buildMonthlyBookkeepingWorkbookData,
  calculateMonthlyExecutiveSummary
} from '../utils/siteLogic';
import { safeGetStorage, safeSetStorage } from '../utils/firebaseBridge';
import { useAuth } from '../context/AuthContext';
import {
  BACKUP_INTERVAL_DAYS,
  BackupMeta,
  BackupScheduleStatus,
  FullBackupSnapshot
} from '../utils/backupLogic';

declare global {
  interface Window {
    html2pdf?: any;
    XLSX?: any;
  }
}

interface AutoBackupApi {
  backupMeta: BackupMeta;
  scheduleStatus: BackupScheduleStatus;
  snapshots: FullBackupSnapshot[];
  isRunningBackup: boolean;
  isLoadingHistory: boolean;
  backupRtdbPermissionNeeded: boolean;
  backupStoragePermissionNeeded: boolean;
  runFullBackup: (triggerType?: 'auto-15d' | 'manual') => Promise<FullBackupSnapshot | null>;
  loadBackupHistory: () => Promise<void>;
  downloadSnapshotJson: (snapshot: FullBackupSnapshot) => void;
  restoreSubgroupFromSnapshot: (
    snapshot: FullBackupSnapshot,
    siteId: string,
    subgroupId: string
  ) => Promise<boolean>;
  parseAndValidateUploadedBackup: (
    file: File
  ) => Promise<{ valid: boolean; snapshot?: FullBackupSnapshot; error?: string }>;
}

interface ReportsSlipsTabProps {
  appState: AppState;
  monthKey: string;
  selectedDay: number;
  siteId?: string;
  subgroupId?: string;
  siteName: string;
  subgroupName: string;
  companyName?: string;
  companySubtitle?: string;
  backupProjectLabel?: string;
  userRole?: UserRole;
  autoBackup?: AutoBackupApi;
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const BACKUP_RTDB_RULES_SNIPPET = `{
  "rules": {
    "backups": {
      ".read": true,
      ".write": true
    }
  }
}`;

export const ReportsSlipsTab: React.FC<ReportsSlipsTabProps> = ({
  appState,
  monthKey,
  selectedDay,
  siteId = 'site_default',
  subgroupId = 'sub_default',
  siteName,
  subgroupName,
  companyName = 'Attendance Portal',
  companySubtitle = '',
  backupProjectLabel = 'Secondary Backup DB',
  userRole = 'viewer',
  autoBackup,
  onToast
}) => {
  const brandUpper = (companyName || 'Attendance Portal').trim().toUpperCase();
  const { user: authUser, getAuthToken } = useAuth();
  const [subTab, setSubTab] = useState<'slips' | 'reports' | 'calculators' | 'backups'>('slips');
  const [restoringTarget, setRestoringTarget] = useState<{
    snapshot: FullBackupSnapshot;
    siteId: string;
    subgroupId: string;
    label: string;
  } | null>(null);
  const [isRestoringNow, setIsRestoringNow] = useState(false);
  const [uploadedBackup, setUploadedBackup] = useState<FullBackupSnapshot | null>(null);
  const backupFileInputRef = useRef<HTMLInputElement>(null);

  // Wage Slips state
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>('ALL');
  const [slipStyle, setSlipStyle] = useState<'navy' | 'slate' | 'amber'>('navy');
  const [bilingualHindi, setBilingualHindi] = useState<boolean>(true);
  const slipsContainerRef = useRef<HTMLDivElement>(null);

  const sendWorkerWhatsAppSlip = (
    worker: AppState['workers'][number],
    s: ReturnType<typeof calculateWorkerMonthlySummary>
  ) => {
    const cleanPhone = (worker.phone || '').replace(/\D/g, '').slice(-10);
    const waTarget = cleanPhone.length === 10 ? `91${cleanPhone}` : '';
    const periodStr = `${MONTH_NAMES[monthNum]} ${yearNum}`;
    const msg = bilingualHindi
      ? `*${brandUpper} - वेतन पर्ची / WAGE SLIP*\n` +
        `📍 *साइट / Site:* ${siteName} (${subgroupName})\n` +
        `📅 *माह / Month:* ${periodStr}\n` +
        `--------------------------------\n` +
        `👷 *नाम / Worker:* ${worker.name} (${worker.desig})\n` +
        `💵 *दर / Rate:* ₹${worker.rate}/दिन\n` +
        `✅ *हाज़िरी / Days Worked:* ${s.totalDuty} Days\n` +
        `⏱️ *ओवरटाइम / OT:* ${s.totalOT} Hrs\n` +
        `💰 *कुल कमाई / Gross Earned:* ₹${Math.round(s.grossAmount).toLocaleString('en-IN')}\n` +
        `💸 *कुल एडवांस / Total Advance:* ₹${Math.round(s.totalAdvance).toLocaleString('en-IN')}\n` +
        `🏦 *कुल भुगतान / Net Payable:* ₹${Math.round(s.netBalance).toLocaleString('en-IN')}`
      : `*${brandUpper} - WAGE SLIP (${periodStr})*\n` +
        `📍 *Site:* ${siteName} (${subgroupName})\n` +
        `👷 *Worker:* ${worker.name} (${worker.desig})\n` +
        `💵 *Rate:* ₹${worker.rate}/day\n` +
        `✅ *Days Worked:* ${s.totalDuty} Days | *OT:* ${s.totalOT} Hrs\n` +
        `💰 *Gross Earned:* ₹${Math.round(s.grossAmount).toLocaleString('en-IN')}\n` +
        `💸 *Total Advance:* ₹${Math.round(s.totalAdvance).toLocaleString('en-IN')}\n` +
        `🏦 *Net Payable Balance:* ₹${Math.round(s.netBalance).toLocaleString('en-IN')}`;

    window.open(
      `https://wa.me/${waTarget}?text=${encodeURIComponent(msg)}`,
      '_blank',
      'noopener,noreferrer'
    );
  };

  // Date Report state
  const { monthNum, yearNum, daysInMonth } = useMemo(() => {
    const parts = monthKey.split('-');
    const m = parseInt(parts[0], 10) || 1;
    const y = parseInt(parts[1], 10) || 2026;
    return {
      monthNum: m,
      yearNum: y,
      daysInMonth: new Date(y, m, 0).getDate()
    };
  }, [monthKey]);

  const defaultIsoDate = `${yearNum}-${String(monthNum).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`;
  const firstOfMonthIso = `${yearNum}-${String(monthNum).padStart(2, '0')}-01`;

  const [reportMode, setReportMode] = useState<'single' | 'range'>('single');
  const [singleDate, setSingleDate] = useState<string>(defaultIsoDate);
  const [rangeStart, setRangeStart] = useState<string>(firstOfMonthIso);
  const [rangeEnd, setRangeEnd] = useState<string>(defaultIsoDate);
  const reportContainerRef = useRef<HTMLDivElement>(null);

  // Calculators state
  const [simHikePct, setSimHikePct] = useState<number>(0);
  const [simOtMult, setSimOtMult] = useState<number>(1);
  const [simRetentionPct, setSimRetentionPct] = useState<number>(5);

  // Concrete & Steel Calculator
  const [concVolume, setConcVolume] = useState<number>(10);
  const [concGrade, setConcGrade] = useState<'M15' | 'M20' | 'M25'>('M20');
  const [steelDia, setSteelDia] = useState<number>(12);
  const [steelLength, setSteelLength] = useState<number>(120);

  // RA Bill Calculator
  const [raGrossWork, setRaGrossWork] = useState<number>(850000);
  const [raGstPct, setRaGstPct] = useState<number>(18);
  const [raRetentionPct, setRaRetentionPct] = useState<number>(5);
  const [raTdsPct, setRaTdsPct] = useState<number>(2);
  const [raMobAdvRecovery, setRaMobAdvRecovery] = useState<number>(25000);

  const monthAtt = appState.attendance[monthKey] || {};
  const [justExportedBookkeeping, setJustExportedBookkeeping] = useState<boolean>(false);
  const [showMaterialRates, setShowMaterialRates] = useState<boolean>(false);
  const [customMaterialRates, setCustomMaterialRates] = useState<Record<string, number>>(() => {
    try {
      const saved = safeGetStorage('gi_mat_unit_rates');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const handleUpdateMaterialRate = (key: string, rawVal: string) => {
    const parsed = parseFloat(rawVal);
    setCustomMaterialRates(prev => {
      const next = { ...prev };
      if (rawVal.trim() === '' || isNaN(parsed) || parsed < 0) {
        delete next[key];
      } else {
        next[key] = parsed;
      }
      safeSetStorage('gi_mat_unit_rates', JSON.stringify(next));
      return next;
    });
  };

  const handleResetMaterialRates = () => {
    setCustomMaterialRates({});
    safeSetStorage('gi_mat_unit_rates', '{}');
    onToast('Material unit rates reset to standard reference values', 'info');
  };

  const executiveSummary = useMemo(
    () =>
      calculateMonthlyExecutiveSummary({
        appState,
        monthKey,
        customMaterialRates
      }),
    [appState, monthKey, customMaterialRates]
  );

  const monthlyBookkeeping = useMemo(
    () =>
      buildMonthlyBookkeepingWorkbookData({
        appState,
        monthKey,
        siteName,
        subgroupName,
        companyName,
        companySubtitle
      }),
    [appState, monthKey, siteName, subgroupName, companyName, companySubtitle]
  );

  const handleExportMonthlyBookkeepingExcel = () => {
    if (!window.XLSX) {
      onToast('Excel library is still loading. Please try again in a moment.', 'error');
      return;
    }
    if (appState.workers.length === 0) {
      onToast('No workers found for the selected site to export.', 'info');
      return;
    }

    try {
      const wb = window.XLSX.utils.book_new();
      monthlyBookkeeping.sheets.forEach(sheet => {
        const ws = window.XLSX.utils.aoa_to_sheet(sheet.rows);
        ws['!cols'] = sheet.colWidths.map(wch => ({ wch }));
        window.XLSX.utils.book_append_sheet(wb, ws, sheet.name);
      });

      window.XLSX.writeFile(wb, monthlyBookkeeping.filename);
      setJustExportedBookkeeping(true);
      setTimeout(() => setJustExportedBookkeeping(false), 2600);
      onToast(
        `Exported 4-sheet bookkeeping workbook (${monthlyBookkeeping.monthLabel})`,
        'success'
      );

      // Silently record bookkeeping snapshot for authenticated account
      if (authUser) {
        getAuthToken()
          .then(token => {
            if (!token) return;
            return fetch('/api/bookkeeping-snapshots', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
              },
              body: JSON.stringify({
                siteId,
                subgroupId,
                siteName,
                subgroupName,
                monthKey,
                workerCount: executiveSummary.labor.totalWorkers,
                totalLaborCost: executiveSummary.labor.totalLaborCost,
                totalMaterialValue: executiveSummary.materials.totalMaterialValue,
                totalAdvances: executiveSummary.advances.totalAdvances,
                netPayable: executiveSummary.advances.netLaborPayable
              })
            });
          })
          .catch(() => {});
      }
    } catch {
      onToast('Failed to generate Excel workbook. Please try again.', 'error');
    }
  };

  const workersToRenderSlips = useMemo(() => {
    if (selectedWorkerId === 'ALL') return appState.workers;
    return appState.workers.filter(w => w.id === selectedWorkerId);
  }, [appState.workers, selectedWorkerId]);

  const handlePrintSlips = () => {
    window.print();
  };

  const handleDownloadSlipsPdf = () => {
    if (!window.html2pdf || !slipsContainerRef.current) {
      onToast('PDF generator not ready. Use Print button as fallback.', 'error');
      return;
    }
    onToast('Generating Wage Slips PDF...', 'info');
    const opt = {
      margin: 8,
      filename: `Wage_Slips_${siteName.replace(/\s+/g, '_')}_${monthKey}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    window.html2pdf().set(opt).from(slipsContainerRef.current).save();
  };

  // Compute Custom Date / Range Report Data
  const reportResult = useMemo(() => {
    const startStr = reportMode === 'single' ? singleDate : rangeStart;
    const endStr = reportMode === 'single' ? singleDate : rangeEnd;

    const startObj = new Date(startStr + 'T00:00:00');
    const endObj = new Date(endStr + 'T00:00:00');

    const validRange = !isNaN(startObj.getTime()) && !isNaN(endObj.getTime()) && startObj <= endObj;
    if (!validRange) {
      return null;
    }

    const datesList: { d: number; m: number; y: number; mKey: string; dprKey: string; label: string }[] = [];
    const cur = new Date(startObj);
    let safety = 0;
    while (cur <= endObj && safety < 95) {
      const d = cur.getDate();
      const m = cur.getMonth() + 1;
      const y = cur.getFullYear();
      const mKey = `${m}-${y}`;
      const dprKey = `${d}-${m}-${y}`;
      datesList.push({
        d,
        m,
        y,
        mKey,
        dprKey,
        label: `${String(d).padStart(2, '0')} ${MONTH_NAMES[m]} ${y}`
      });
      cur.setDate(cur.getDate() + 1);
      safety++;
    }

    let totalDuty = 0;
    let totalOT = 0;
    let totalGross = 0;
    let totalAdv = 0;

    const workerRows = appState.workers.map(w => {
      let wDuty = 0;
      let wOT = 0;
      let wAdv = 0;

      datesList.forEach(dt => {
        const rec = appState.attendance[dt.mKey]?.[w.id]?.[dt.d];
        if (rec) {
          const dutyVal = parseDutyInput(rec.duty);
          if (dutyVal !== null) wDuty += dutyVal;
          wOT += parseFloat(String(rec.ot)) || 0;
          wAdv += parseFloat(String(rec.adv)) || 0;
        }
      });

      const wGross = wDuty * w.rate + wOT * (w.rate / 8);
      const wNet = wGross - wAdv;

      totalDuty += wDuty;
      totalOT += wOT;
      totalGross += wGross;
      totalAdv += wAdv;

      return {
        worker: w,
        duty: wDuty,
        ot: wOT,
        gross: wGross,
        adv: wAdv,
        net: wNet
      };
    });

    const dprEntries = datesList
      .map(dt => ({
        dateLabel: dt.label,
        dpr: appState.dpr[dt.dprKey]
      }))
      .filter(item => item.dpr && (item.dpr.work || item.dpr.matReceived?.length || item.dpr.matConsumed?.length));

    return {
      datesList,
      periodLabel:
        datesList.length === 1
          ? datesList[0].label
          : `${datesList[0]?.label} to ${datesList[datesList.length - 1]?.label} (${datesList.length} Days)`,
      totalDuty,
      totalOT,
      totalGross,
      totalAdv,
      totalNet: totalGross - totalAdv,
      workerRows,
      dprEntries
    };
  }, [reportMode, singleDate, rangeStart, rangeEnd, appState]);

  const handleExportReportExcel = () => {
    if (!window.XLSX || !reportResult) {
      onToast('Excel generator not ready', 'error');
      return;
    }
    const rows: any[][] = [
      [`${brandUpper} - SITE REPORT`],
      ['Site', siteName, 'Subgroup', subgroupName],
      ['Period', reportResult.periodLabel],
      [],
      ['SL', 'Worker Name', 'Designation', 'Rate (₹)', 'Duties', 'OT (Hrs)', 'Gross Earned (₹)', 'Advance (₹)', 'Net Balance (₹)']
    ];

    reportResult.workerRows.forEach((r, idx) => {
      rows.push([
        idx + 1,
        r.worker.name,
        r.worker.desig,
        r.worker.rate,
        r.duty,
        r.ot,
        Math.round(r.gross),
        Math.round(r.adv),
        Math.round(r.net)
      ]);
    });

    rows.push([
      '',
      'TOTAL',
      '',
      '',
      reportResult.totalDuty,
      reportResult.totalOT,
      Math.round(reportResult.totalGross),
      Math.round(reportResult.totalAdv),
      Math.round(reportResult.totalNet)
    ]);

    const wb = window.XLSX.utils.book_new();
    const ws = window.XLSX.utils.aoa_to_sheet(rows);
    window.XLSX.utils.book_append_sheet(wb, ws, 'Site_Report');
    window.XLSX.writeFile(wb, `Site_Report_${siteName.replace(/\s+/g, '_')}.xlsx`);
    onToast('Site Report exported to Excel', 'success');
  };

  const handleShareReportWhatsApp = () => {
    if (!reportResult) return;
    let msg =
      `*${brandUpper} - SITE REPORT*\n` +
      `📍 *Site:* ${siteName} (${subgroupName})\n` +
      `📅 *Period:* ${reportResult.periodLabel}\n` +
      `--------------------------------\n` +
      `👷 *Total Man-Days:* ${reportResult.totalDuty}\n` +
      `⏱️ *Total OT:* ${reportResult.totalOT} Hrs\n` +
      `💰 *Gross Wage:* ₹${Math.round(reportResult.totalGross).toLocaleString('en-IN')}\n` +
      `💸 *Advances:* ₹${Math.round(reportResult.totalAdv).toLocaleString('en-IN')}\n` +
      `🏦 *Net Liability:* ₹${Math.round(reportResult.totalNet).toLocaleString('en-IN')}\n`;

    if (reportResult.dprEntries.length > 0) {
      msg += `\n*DPR Highlights:*\n`;
      reportResult.dprEntries.slice(0, 3).forEach(e => {
        msg += `• ${e.dateLabel}: ${e.dpr.work || 'Material logged'}\n`;
      });
    }

    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
  };

  // Payroll Simulator Calculations
  const simPayroll = useMemo(() => {
    let baseGross = 0;
    let simGross = 0;
    let totalAdv = 0;

    appState.workers.forEach(w => {
      const s = calculateWorkerMonthlySummary(w, monthAtt, appState.advances, daysInMonth);
      baseGross += s.grossAmount;
      totalAdv += s.totalAdvance;

      const newRate = w.rate * (1 + simHikePct / 100);
      const newWorkerGross = s.totalDuty * newRate + s.totalOT * (newRate / 8) * simOtMult;
      simGross += newWorkerGross;
    });

    const retentionAmt = simGross * (simRetentionPct / 100);
    const netDisbursal = simGross - totalAdv - retentionAmt;
    return {
      baseGross,
      simGross,
      diff: simGross - baseGross,
      totalAdv,
      retentionAmt,
      netDisbursal
    };
  }, [appState.workers, monthAtt, appState.advances, daysInMonth, simHikePct, simOtMult, simRetentionPct]);

  // Concrete & Steel Calculations
  const concreteCalc = useMemo(() => {
    const dryVol = concVolume * 1.54;
    const ratios: Record<'M15' | 'M20' | 'M25', [number, number, number]> = {
      M15: [1, 2, 4],
      M20: [1, 1.5, 3],
      M25: [1, 1, 2]
    };
    const [c, s, a] = ratios[concGrade];
    const sum = c + s + a;
    const cementVol = (dryVol * c) / sum;
    const cementBags = Math.ceil(cementVol / 0.0347);
    const sandCft = Math.round(((dryVol * s) / sum) * 35.3147);
    const aggCft = Math.round(((dryVol * a) / sum) * 35.3147);
    const steelWeightKg = ((steelDia * steelDia) / 162.2) * steelLength;

    return {
      dryVol: dryVol.toFixed(2),
      cementBags,
      sandCft,
      aggCft,
      steelWeightKg: steelWeightKg.toFixed(1)
    };
  }, [concVolume, concGrade, steelDia, steelLength]);

  // RA Bill Calculations
  const raBillCalc = useMemo(() => {
    const gstAmt = raGrossWork * (raGstPct / 100);
    const totalInvoice = raGrossWork + gstAmt;
    const retentionDed = raGrossWork * (raRetentionPct / 100);
    const tdsDed = raGrossWork * (raTdsPct / 100);
    const netRelease = totalInvoice - retentionDed - tdsDed - raMobAdvRecovery;
    return {
      gstAmt,
      totalInvoice,
      retentionDed,
      tdsDed,
      netRelease
    };
  }, [raGrossWork, raGstPct, raRetentionPct, raTdsPct, raMobAdvRecovery]);

  const slipHeaderColor =
    slipStyle === 'navy'
      ? 'bg-slate-900 text-white'
      : slipStyle === 'slate'
      ? 'bg-blue-950 text-white'
      : 'bg-amber-900 text-white';

  return (
    <div className="space-y-4 pb-20 md:pb-6">
      {/* High-Level Monthly Executive Dashboard Summary */}
      <section
        aria-label="Monthly site financial summary"
        className="space-y-3 no-print tabular-nums"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Monthly Site Financial Summary
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {siteName} <span aria-hidden="true">·</span> {subgroupName}{' '}
              <span aria-hidden="true">·</span> {executiveSummary.monthLabel}{' '}
              <span aria-hidden="true">·</span> Combined Outflow{' '}
              <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                ₹{executiveSummary.totalSiteCost.toLocaleString('en-IN')}
              </span>
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowMaterialRates(prev => !prev)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              showMaterialRates
                ? 'bg-slate-900 text-white border-slate-900 dark:bg-slate-100 dark:text-slate-900 dark:border-slate-100'
                : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>{showMaterialRates ? 'Hide Material Rates' : 'Material Unit Rates'}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card 1: Total Site Labor Costs */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col justify-between gap-3">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Total Site Labor Cost
                </p>
                <div className="text-2xl font-mono font-bold tracking-tight text-slate-900 dark:text-white">
                  ₹{executiveSummary.labor.totalLaborCost.toLocaleString('en-IN')}
                </div>
              </div>
              <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                <Users className="w-4 h-4" />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-1 text-xs text-slate-600 dark:text-slate-400">
              <div className="flex items-center justify-between">
                <span>Base Wages ({executiveSummary.labor.totalDuties} Man-Days)</span>
                <span className="font-mono font-semibold text-slate-900 dark:text-slate-200">
                  ₹{executiveSummary.labor.baseWage.toLocaleString('en-IN')}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Overtime ({executiveSummary.labor.totalOT} Hrs)</span>
                <span className="font-mono font-semibold text-blue-600 dark:text-blue-400">
                  ₹{executiveSummary.labor.otPay.toLocaleString('en-IN')}
                </span>
              </div>
            </div>
          </div>

          {/* Card 2: Material Consumption Value */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col justify-between gap-3">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Material Consumption Value
                </p>
                <div className="text-2xl font-mono font-bold tracking-tight text-slate-900 dark:text-white">
                  ₹{executiveSummary.materials.totalMaterialValue.toLocaleString('en-IN')}
                </div>
              </div>
              <div className="w-9 h-9 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                <Package className="w-4 h-4" />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-1 text-xs text-slate-600 dark:text-slate-400">
              {executiveSummary.materials.breakdown.length > 0 ? (
                <>
                  {executiveSummary.materials.breakdown.slice(0, 2).map(m => (
                    <div key={m.key} className="flex items-center justify-between gap-2">
                      <span className="truncate">
                        {m.item} ({m.qty} {m.unit})
                      </span>
                      <span className="font-mono font-semibold text-slate-900 dark:text-slate-200 shrink-0">
                        ₹{m.value.toLocaleString('en-IN')}
                      </span>
                    </div>
                  ))}
                  {executiveSummary.materials.breakdown.length > 2 && (
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      +{executiveSummary.materials.breakdown.length - 2} more consumed items in DPR
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-center justify-between">
                  <span>No DPR material consumption logged</span>
                  <span className="font-mono text-slate-400">0 items</span>
                </div>
              )}
            </div>
          </div>

          {/* Card 3: Total Advances Issued */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col justify-between gap-3">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Total Advances Issued
                </p>
                <div className="text-2xl font-mono font-bold tracking-tight text-rose-600 dark:text-rose-400">
                  ₹{executiveSummary.advances.totalAdvances.toLocaleString('en-IN')}
                </div>
              </div>
              <div className="w-9 h-9 rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                <Wallet className="w-4 h-4" />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-1 text-xs text-slate-600 dark:text-slate-400">
              <div className="flex items-center justify-between">
                <span>
                  Monthly Cash ({executiveSummary.advances.workersWithAdvance} workers)
                </span>
                <span className="font-mono font-semibold text-slate-900 dark:text-slate-200">
                  ₹{executiveSummary.advances.monthlyDailyAdvances.toLocaleString('en-IN')}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Opening B/F · Net Payable</span>
                <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                  ₹{executiveSummary.advances.openingAdvances.toLocaleString('en-IN')} · ₹
                  {executiveSummary.advances.netLaborPayable.toLocaleString('en-IN')}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Expandable Material Unit Rates Editor */}
        {showMaterialRates && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                  Monthly Material Consumption Valuation ({executiveSummary.monthLabel})
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Adjust ₹/unit rates to match supplier bills. Saved automatically on this device.
                </p>
              </div>
              {Object.keys(customMaterialRates).length > 0 && (
                <button
                  type="button"
                  onClick={handleResetMaterialRates}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset Defaults</span>
                </button>
              )}
            </div>

            {executiveSummary.materials.breakdown.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                      <th className="py-2 pr-3 text-left font-semibold">Material Item</th>
                      <th className="py-2 px-3 text-right font-semibold">Consumed Qty</th>
                      <th className="py-2 px-3 text-right font-semibold">Unit Rate (₹)</th>
                      <th className="py-2 pl-3 text-right font-semibold">Total Value (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {executiveSummary.materials.breakdown.map(m => (
                      <tr key={m.key}>
                        <td className="py-2 pr-3 font-medium text-slate-900 dark:text-slate-100">
                          {m.item}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-slate-700 dark:text-slate-300">
                          {m.qty} {m.unit}
                        </td>
                        <td className="py-2 px-3 text-right">
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={customMaterialRates[m.key] ?? m.unitRate}
                            onChange={e => handleUpdateMaterialRate(m.key, e.target.value)}
                            aria-label={`Unit rate in rupees for ${m.item}`}
                            className="w-24 text-right font-mono px-2 py-1 rounded-md bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                          />
                        </td>
                        <td className="py-2 pl-3 text-right font-mono font-semibold text-slate-900 dark:text-white">
                          ₹{m.value.toLocaleString('en-IN')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-slate-200 dark:border-slate-800 font-bold text-slate-900 dark:text-white">
                      <td className="pt-2.5 pr-3" colSpan={3}>
                        Total Material Consumption Value
                      </td>
                      <td className="pt-2.5 pl-3 text-right font-mono text-amber-700 dark:text-amber-400">
                        ₹{executiveSummary.materials.totalMaterialValue.toLocaleString('en-IN')}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-2">
                No material consumption entries recorded in DPR for {executiveSummary.monthLabel}. Log consumed materials under the DPR & Site Stock tab to calculate monthly valuation automatically.
              </p>
            )}
          </div>
        )}
      </section>

      {/* Sub-navigation bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-2 shadow-xs flex flex-wrap items-center justify-between gap-2 no-print">
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => setSubTab('slips')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
              subTab === 'slips'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            Wage Slips
          </button>
          <button
            type="button"
            onClick={() => setSubTab('reports')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
              subTab === 'reports'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            Date & Range Reports
          </button>
          <button
            type="button"
            onClick={() => setSubTab('calculators')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              subTab === 'calculators'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Calculator className="w-3.5 h-3.5" />
            Engineering & Payroll Tools
          </button>
          <button
            type="button"
            onClick={() => setSubTab('backups')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              subTab === 'backups'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            15-Day Cloud Backup
          </button>
        </div>

        <button
          type="button"
          onClick={handleExportMonthlyBookkeepingExcel}
          title={`Export full ${monthlyBookkeeping.monthLabel} attendance, wages, overtime, and advances to a 4-sheet Excel workbook`}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          {justExportedBookkeeping ? (
            <>
              <Check className="w-3.5 h-3.5" />
              <span>Exported Bookkeeping (.xlsx)</span>
            </>
          ) : (
            <>
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Export Monthly Bookkeeping (.xlsx)</span>
            </>
          )}
        </button>
      </div>

      {/* SUB-TAB 1: WAGE SLIPS */}
      {subTab === 'slips' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-xs flex flex-wrap items-center justify-between gap-3 no-print">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedWorkerId}
                onChange={e => setSelectedWorkerId(e.target.value)}
                aria-label="Select worker for wage slip"
                className="px-3 py-2 text-xs font-semibold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200"
              >
                <option value="ALL">All Workers ({appState.workers.length} Slips)</option>
                {appState.workers.map(w => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.desig})
                  </option>
                ))}
              </select>

              <select
                value={slipStyle}
                onChange={e => setSlipStyle(e.target.value as 'navy' | 'slate' | 'amber')}
                aria-label="Wage slip header theme"
                className="px-3 py-2 text-xs font-medium bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200"
              >
                <option value="navy">Theme: Classic Navy</option>
                <option value="slate">Theme: Royal Slate</option>
                <option value="amber">Theme: Industrial Amber</option>
              </select>

              <button
                type="button"
                onClick={() => setBilingualHindi(b => !b)}
                className={`px-3 py-2 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                  bilingualHindi
                    ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                }`}
              >
                {bilingualHindi ? '🇮🇳 English + हिंदी (Bilingual)' : '🇬🇧 English Only'}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrintSlips}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                Print Slips
              </button>
              <button
                type="button"
                onClick={handleDownloadSlipsPdf}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Download PDF
              </button>
            </div>
          </div>

          <div
            ref={slipsContainerRef}
            className="grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            {workersToRenderSlips.map(worker => {
              const s = calculateWorkerMonthlySummary(worker, monthAtt, appState.advances, daysInMonth);
              return (
                <div
                  key={worker.id}
                  className="wage-slip-print-card bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl overflow-hidden shadow-xs tabular-nums"
                >
                  {/* Formal Header */}
                  <div className={`${slipHeaderColor} px-4 py-3 flex items-center justify-between gap-2`}>
                    <div>
                      <div className="text-xs font-extrabold tracking-wider uppercase">
                        {brandUpper}
                      </div>
                      <div className="text-[11px] opacity-80">
                        Site: {siteName} • {subgroupName}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => sendWorkerWhatsAppSlip(worker, s)}
                        title={
                          worker.phone
                            ? `Send Wage Slip on WhatsApp to ${worker.name} (${worker.phone})`
                            : `Share Wage Slip on WhatsApp for ${worker.name}`
                        }
                        className="no-print inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-500 hover:bg-emerald-600 text-white text-[11px] font-bold shadow-2xs transition-colors cursor-pointer"
                      >
                        <MessageSquare className="w-3 h-3" />
                        <span>{worker.phone ? 'WhatsApp' : 'Share'}</span>
                      </button>
                      <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-white/15 font-semibold">
                        {bilingualHindi ? 'वेतन पर्ची • ' : 'WAGE SLIP • '}
                        {MONTH_NAMES[monthNum]} {yearNum}
                      </span>
                    </div>
                  </div>

                  {/* Worker Metadata */}
                  <div className="p-4 space-y-3 text-xs">
                    <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2.5">
                      <div>
                        <div className="text-slate-400 text-[10px] uppercase font-semibold">
                          {bilingualHindi ? 'मज़दूर का नाम / Worker Name' : 'Worker Name'}
                        </div>
                        <div className="text-sm font-bold text-slate-900 dark:text-white">{worker.name}</div>
                        <div className="text-[11px] text-slate-500">
                          {worker.desig} {worker.phone ? `• 📞 ${worker.phone}` : ''}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-slate-400 text-[10px] uppercase font-semibold">
                          {bilingualHindi ? 'दैनिक दर / Daily Wage Rate' : 'Daily Wage Rate'}
                        </div>
                        <div className="text-sm font-mono font-bold text-slate-900 dark:text-white">
                          ₹{worker.rate.toLocaleString('en-IN')}/day
                        </div>
                        <div className="text-[11px] text-slate-500">ID: {worker.id.slice(-6)}</div>
                      </div>
                    </div>

                    {/* Earnings & Deductions Grid */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 space-y-1">
                        <div className="flex justify-between text-slate-600 dark:text-slate-400">
                          <span>{bilingualHindi ? 'हाज़िरी / Days:' : 'Days Worked:'}</span>
                          <strong className="font-mono text-slate-900 dark:text-white">{s.totalDuty} Days</strong>
                        </div>
                        <div className="flex justify-between text-slate-600 dark:text-slate-400">
                          <span>{bilingualHindi ? 'ओवरटाइम / OT:' : 'Overtime (OT):'}</span>
                          <strong className="font-mono text-blue-600 dark:text-blue-400">{s.totalOT} Hrs</strong>
                        </div>
                        <div className="flex justify-between pt-1 border-t border-slate-200 dark:border-slate-700 font-semibold text-slate-900 dark:text-white">
                          <span>{bilingualHindi ? 'कुल कमाई / Gross:' : 'Gross Earned:'}</span>
                          <span className="font-mono">₹{Math.round(s.grossAmount).toLocaleString('en-IN')}</span>
                        </div>
                      </div>

                      <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 space-y-1">
                        <div className="flex justify-between text-slate-600 dark:text-slate-400">
                          <span>{bilingualHindi ? 'पिछला एडवांस / Open:' : 'Opening Adv:'}</span>
                          <strong className="font-mono text-rose-600">₹{Math.round(s.openingAdv).toLocaleString('en-IN')}</strong>
                        </div>
                        <div className="flex justify-between text-slate-600 dark:text-slate-400">
                          <span>{bilingualHindi ? 'दैनिक एडवांस / Adv:' : 'Daily Adv:'}</span>
                          <strong className="font-mono text-rose-600">₹{Math.round(s.dailyAdv).toLocaleString('en-IN')}</strong>
                        </div>
                        <div className="flex justify-between pt-1 border-t border-slate-200 dark:border-slate-700 font-semibold text-rose-600">
                          <span>{bilingualHindi ? 'कुल कटौती / Ded.:' : 'Total Ded.:'}</span>
                          <span className="font-mono">₹{Math.round(s.totalAdvance).toLocaleString('en-IN')}</span>
                        </div>
                      </div>
                    </div>

                    {/* Net Payable Banner */}
                    <div className="px-3.5 py-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-emerald-900 dark:text-emerald-300">
                        {bilingualHindi ? 'कुल देय राशि / Net Payable' : 'Net Payable Balance'}
                      </span>
                      <span className="text-base font-mono font-extrabold text-emerald-700 dark:text-emerald-400">
                        ₹{Math.round(s.netBalance).toLocaleString('en-IN')}
                      </span>
                    </div>

                    {/* Signatures */}
                    <div className="pt-4 flex items-center justify-between text-[10px] text-slate-400 border-t border-dashed border-slate-200 dark:border-slate-800">
                      <span>{bilingualHindi ? 'मज़दूर के हस्ताक्षर / Worker Sign' : 'Worker Signature / Thumb'}</span>
                      <span>{bilingualHindi ? 'अधिकृत हस्ताक्षर / Authorized Sign' : `Authorized Signatory (${companyName})`}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SUB-TAB 2: DATE & RANGE REPORTS */}
      {subTab === 'reports' && (
        <div className="space-y-4">
          {/* Monthly Bookkeeping Export Panel */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs space-y-4 tabular-nums">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Monthly Bookkeeping Workbook — {monthlyBookkeeping.monthLabel}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {siteName} ({subgroupName}) <span aria-hidden="true">·</span> 4 structured sheets: Payroll Summary <span aria-hidden="true">·</span> Attendance Matrix (D1–D{daysInMonth}) <span aria-hidden="true">·</span> Overtime Log <span aria-hidden="true">·</span> Advances Ledger
                </p>
              </div>
              <button
                type="button"
                onClick={handleExportMonthlyBookkeepingExcel}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {justExportedBookkeeping ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Downloaded .xlsx</span>
                  </>
                ) : (
                  <>
                    <FileSpreadsheet className="w-4 h-4" />
                    <span>Download Bookkeeping Excel</span>
                  </>
                )}
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 text-xs">
              <div>
                <span className="text-slate-500 dark:text-slate-400 block">Workforce</span>
                <strong className="font-mono text-sm font-bold text-slate-900 dark:text-white">
                  {monthlyBookkeeping.totals.workerCount} Workers
                </strong>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400 block">Total Duties</span>
                <strong className="font-mono text-sm font-bold text-slate-900 dark:text-white">
                  {monthlyBookkeeping.totals.totalDuties} Days
                </strong>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400 block">Overtime</span>
                <strong className="font-mono text-sm font-bold text-blue-600 dark:text-blue-400">
                  {monthlyBookkeeping.totals.totalOT} Hrs
                </strong>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400 block">Gross Wages</span>
                <strong className="font-mono text-sm font-bold text-slate-900 dark:text-white">
                  ₹{monthlyBookkeeping.totals.totalGross.toLocaleString('en-IN')}
                </strong>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400 block">
                  Advances ({monthlyBookkeeping.totals.advanceTransactionsCount})
                </span>
                <strong className="font-mono text-sm font-bold text-rose-600 dark:text-rose-400">
                  ₹{monthlyBookkeeping.totals.totalAdvance.toLocaleString('en-IN')}
                </strong>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400 block">Net Payable</span>
                <strong className="font-mono text-sm font-bold text-emerald-600 dark:text-emerald-400">
                  ₹{monthlyBookkeeping.totals.totalNetPayable.toLocaleString('en-IN')}
                </strong>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex rounded-lg bg-slate-100 dark:bg-slate-800 p-1">
                <button
                  type="button"
                  onClick={() => setReportMode('single')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                    reportMode === 'single'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Single Day Report
                </button>
                <button
                  type="button"
                  onClick={() => setReportMode('range')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                    reportMode === 'range'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Custom Date Range
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {reportMode === 'single' ? (
                  <input
                    type="date"
                    value={singleDate}
                    onChange={e => setSingleDate(e.target.value)}
                    aria-label="Report single date"
                    className="px-3 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                  />
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={rangeStart}
                      onChange={e => setRangeStart(e.target.value)}
                      aria-label="Report start date"
                      className="px-2.5 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                    />
                    <span className="text-xs text-slate-400">to</span>
                    <input
                      type="date"
                      value={rangeEnd}
                      onChange={e => setRangeEnd(e.target.value)}
                      aria-label="Report end date"
                      className="px-2.5 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                    />
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleExportReportExcel}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 hover:bg-emerald-100"
                >
                  <Download className="w-3.5 h-3.5" />
                  Excel
                </button>
                <button
                  type="button"
                  onClick={handleShareReportWhatsApp}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  WhatsApp
                </button>
              </div>
            </div>
          </div>

          {reportResult ? (
            <div
              ref={reportContainerRef}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs space-y-4 tabular-nums"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Site Audit Report: {siteName} ({subgroupName})
                  </h3>
                  <p className="text-xs text-slate-500">Period: {reportResult.periodLabel}</p>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase">Man-Days</span>
                    <strong className="font-mono text-sm text-slate-900 dark:text-white">{reportResult.totalDuty}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase">Total OT</span>
                    <strong className="font-mono text-sm text-blue-600">{reportResult.totalOT}h</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase">Net Liability</span>
                    <strong className="font-mono text-sm text-emerald-600">
                      ₹{Math.round(reportResult.totalNet).toLocaleString('en-IN')}
                    </strong>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 uppercase text-[10px]">
                      <th className="py-2 px-3 text-left">Worker</th>
                      <th className="py-2 px-3 text-left">Trade</th>
                      <th className="py-2 px-3 text-right">Rate</th>
                      <th className="py-2 px-3 text-right">Duties</th>
                      <th className="py-2 px-3 text-right">OT (h)</th>
                      <th className="py-2 px-3 text-right">Gross (₹)</th>
                      <th className="py-2 px-3 text-right">Advance (₹)</th>
                      <th className="py-2 px-3 text-right">Net Pay (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {reportResult.workerRows.map(r => (
                      <tr key={r.worker.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-2 px-3 font-semibold text-slate-900 dark:text-slate-100">{r.worker.name}</td>
                        <td className="py-2 px-3 text-slate-500">{r.worker.desig}</td>
                        <td className="py-2 px-3 text-right font-mono">₹{r.worker.rate}</td>
                        <td className="py-2 px-3 text-right font-mono font-bold">{r.duty}</td>
                        <td className="py-2 px-3 text-right font-mono text-blue-600">{r.ot}h</td>
                        <td className="py-2 px-3 text-right font-mono">₹{Math.round(r.gross).toLocaleString('en-IN')}</td>
                        <td className="py-2 px-3 text-right font-mono text-rose-600">₹{Math.round(r.adv).toLocaleString('en-IN')}</td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-emerald-600">
                          ₹{Math.round(r.net).toLocaleString('en-IN')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="p-6 text-center bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 text-sm text-rose-600">
              Please select a valid start and end date range.
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 3: ENGINEERING & PAYROLL CALCULATORS */}
      {subTab === 'calculators' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 tabular-nums">
          {/* Card 1: Payroll Simulator */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-2.5">
              <Sliders className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                What-If Payroll Simulator
              </h3>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <div className="flex justify-between font-semibold mb-1">
                  <span className="text-slate-600 dark:text-slate-400">Wage Rate Adjustment</span>
                  <span className="font-mono text-blue-600">{simHikePct >= 0 ? `+${simHikePct}%` : `${simHikePct}%`}</span>
                </div>
                <input
                  type="range"
                  min="-20"
                  max="50"
                  step="5"
                  value={simHikePct}
                  onChange={e => setSimHikePct(parseInt(e.target.value, 10))}
                  aria-label="Wage Rate Adjustment Percentage"
                  className="w-full accent-blue-600"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Overtime Pay Multiplier
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {[1, 1.5, 2].map(mult => (
                    <button
                      key={mult}
                      type="button"
                      onClick={() => setSimOtMult(mult)}
                      className={`py-1.5 rounded-lg font-mono font-bold text-xs border ${
                        simOtMult === mult
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {mult}x OT
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex justify-between font-semibold mb-1">
                  <span className="text-slate-600 dark:text-slate-400">Contractor Retention Hold</span>
                  <span className="font-mono text-amber-600">{simRetentionPct}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="15"
                  step="1"
                  value={simRetentionPct}
                  onChange={e => setSimRetentionPct(parseInt(e.target.value, 10))}
                  aria-label="Contractor Retention Percentage"
                  className="w-full accent-amber-600"
                />
              </div>

              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 space-y-1.5 border border-slate-200/70 dark:border-slate-800">
                <div className="flex justify-between">
                  <span className="text-slate-500">Current Gross:</span>
                  <span className="font-mono font-semibold">₹{Math.round(simPayroll.baseGross).toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Projected Gross:</span>
                  <span className="font-mono font-bold text-blue-600">₹{Math.round(simPayroll.simGross).toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Retention ({simRetentionPct}%):</span>
                  <span className="font-mono text-amber-600">-₹{Math.round(simPayroll.retentionAmt).toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between pt-1.5 border-t border-slate-200 dark:border-slate-700 font-bold text-sm">
                  <span>Net Disbursal:</span>
                  <span className="font-mono text-emerald-600">₹{Math.round(simPayroll.netDisbursal).toLocaleString('en-IN')}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: IS-456 Concrete & BBS Steel Calculator */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-2.5">
              <HardHat className="w-4 h-4 text-amber-600" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                IS-456 Concrete & BBS Steel
              </h3>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold text-slate-500 mb-1">Wet Volume (m³)</label>
                  <input
                    type="number"
                    min="0.5"
                    step="0.5"
                    value={concVolume}
                    onChange={e => setConcVolume(parseFloat(e.target.value) || 0)}
                    aria-label="Concrete Wet Volume in cubic meters"
                    className="w-full px-2.5 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-500 mb-1">Mix Grade</label>
                  <select
                    value={concGrade}
                    onChange={e => setConcGrade(e.target.value as 'M15' | 'M20' | 'M25')}
                    aria-label="Concrete Mix Grade"
                    className="w-full px-2.5 py-1.5 font-semibold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  >
                    <option value="M15">M15 (1:2:4)</option>
                    <option value="M20">M20 (1:1.5:3)</option>
                    <option value="M25">M25 (1:1:2)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center p-2.5 rounded-lg bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-800/40">
                <div>
                  <span className="text-[10px] text-slate-500 block">Cement</span>
                  <strong className="font-mono text-sm text-amber-700 dark:text-amber-400">{concreteCalc.cementBags} Bags</strong>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block">River Sand</span>
                  <strong className="font-mono text-sm text-slate-800 dark:text-slate-200">{concreteCalc.sandCft} CFT</strong>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block">Aggregate</span>
                  <strong className="font-mono text-sm text-slate-800 dark:text-slate-200">{concreteCalc.aggCft} CFT</strong>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                <div>
                  <label className="block font-semibold text-slate-500 mb-1">Rebar Dia (mm)</label>
                  <select
                    value={steelDia}
                    onChange={e => setSteelDia(parseInt(e.target.value, 10))}
                    aria-label="Rebar Diameter in mm"
                    className="w-full px-2.5 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  >
                    {[8, 10, 12, 16, 20, 25, 32].map(d => (
                      <option key={d} value={d}>
                        {d} mm
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-500 mb-1">Total Length (m)</label>
                  <input
                    type="number"
                    min="1"
                    value={steelLength}
                    onChange={e => setSteelLength(parseFloat(e.target.value) || 0)}
                    aria-label="Total Steel Rebar Length in meters"
                    className="w-full px-2.5 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
              </div>

              <div className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 flex justify-between items-center">
                <span className="text-slate-600 dark:text-slate-400 font-medium">BBS Steel Weight (D²/162):</span>
                <strong className="font-mono text-sm text-slate-900 dark:text-white">{concreteCalc.steelWeightKg} kg</strong>
              </div>
            </div>
          </div>

          {/* Card 3: Client RA Bill Estimator */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-2.5">
              <Receipt className="w-4 h-4 text-emerald-600" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Client RA Bill Estimator
              </h3>
            </div>

            <div className="space-y-2.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-500 mb-1">Measured Work Value (₹)</label>
                <input
                  type="number"
                  step="5000"
                  value={raGrossWork}
                  onChange={e => setRaGrossWork(parseFloat(e.target.value) || 0)}
                  aria-label="RA Bill Measured Work Value"
                  className="w-full px-2.5 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block font-semibold text-slate-500 mb-1">GST %</label>
                  <input
                    type="number"
                    value={raGstPct}
                    onChange={e => setRaGstPct(parseFloat(e.target.value) || 0)}
                    aria-label="GST Percentage"
                    className="w-full px-2 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-500 mb-1">Ret. %</label>
                  <input
                    type="number"
                    value={raRetentionPct}
                    onChange={e => setRaRetentionPct(parseFloat(e.target.value) || 0)}
                    aria-label="Retention Percentage"
                    className="w-full px-2 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-500 mb-1">TDS %</label>
                  <input
                    type="number"
                    value={raTdsPct}
                    onChange={e => setRaTdsPct(parseFloat(e.target.value) || 0)}
                    aria-label="TDS Deduction Percentage"
                    className="w-full px-2 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-500 mb-1">Mobilization Adv. Recovery (₹)</label>
                <input
                  type="number"
                  step="1000"
                  value={raMobAdvRecovery}
                  onChange={e => setRaMobAdvRecovery(parseFloat(e.target.value) || 0)}
                  aria-label="Mobilization Advance Recovery"
                  className="w-full px-2.5 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </div>

              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 space-y-1 border border-slate-200/70 dark:border-slate-800">
                <div className="flex justify-between">
                  <span className="text-slate-500">Gross Invoice (+GST):</span>
                  <span className="font-mono font-semibold">₹{Math.round(raBillCalc.totalInvoice).toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between text-rose-600">
                  <span>Retention + TDS Ded.:</span>
                  <span className="font-mono">-₹{Math.round(raBillCalc.retentionDed + raBillCalc.tdsDed).toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between pt-1.5 border-t border-slate-200 dark:border-slate-700 font-bold text-sm">
                  <span>Net Cheque Release:</span>
                  <span className="font-mono text-emerald-600">₹{Math.round(raBillCalc.netRelease).toLocaleString('en-IN')}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 4: 15-DAY AUTOMATED CLOUD BACKUP VAULT */}
      {subTab === 'backups' && autoBackup && (
        <div className="space-y-4 no-print">
          {/* Header & Schedule Summary */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Automated {BACKUP_INTERVAL_DAYS}-Day Backup Vault
                  </h3>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 max-w-2xl">
                  Automatically archives every site, subgroup, worker roster, monthly attendance matrix, OT, advances, and DPR every{' '}
                  <strong>{BACKUP_INTERVAL_DAYS} days</strong> to your portal&apos;s Cloud Rolling Vault (and optional secondary backup database{' '}
                  <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[11px]">
                    {backupProjectLabel}
                  </code>
                  ).
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={autoBackup.isRunningBackup}
                  onClick={() => autoBackup.runFullBackup('manual')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white shadow-xs transition-colors cursor-pointer"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${autoBackup.isRunningBackup ? 'animate-spin' : ''}`}
                  />
                  <span>{autoBackup.isRunningBackup ? 'Backing Up...' : 'Run Full Backup Now'}</span>
                </button>

                {autoBackup.snapshots[0] && (
                  <button
                    type="button"
                    onClick={() => autoBackup.downloadSnapshotJson(autoBackup.snapshots[0])}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Latest (.json)</span>
                  </button>
                )}

                {userRole === 'admin' && (
                  <>
                    <input
                      ref={backupFileInputRef}
                      type="file"
                      accept=".json,application/json"
                      className="hidden"
                      onChange={async e => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (!file) return;
                        const result = await autoBackup.parseAndValidateUploadedBackup(file);
                        if (!result.valid || !result.snapshot) {
                          onToast(result.error || 'Invalid backup file', 'error');
                          return;
                        }
                        setUploadedBackup(result.snapshot);
                        onToast(
                          `Loaded backup file (${result.snapshot.createdIso.slice(0, 10)}) — choose a subgroup below to restore.`,
                          'info'
                        );
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => backupFileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:opacity-90 transition-opacity cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Import Backup (.json)</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* 4 Key Backup Status Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Last Full Backup
                </div>
                <div className="mt-1 text-sm font-bold text-slate-900 dark:text-white">
                  {autoBackup.backupMeta.lastBackupAt
                    ? new Date(autoBackup.backupMeta.lastBackupAt).toLocaleString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })
                    : 'Not run yet'}
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500">
                  {autoBackup.backupMeta.lastTriggerType === 'auto-15d'
                    ? 'Automatic 15-Day Cycle'
                    : autoBackup.backupMeta.lastTriggerType === 'manual'
                    ? `Manual by ${autoBackup.backupMeta.lastTriggeredBy || 'User'}`
                    : 'Waiting for first archive'}
                </div>
              </div>

              <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Next Auto-Backup
                </div>
                <div className="mt-1 text-sm font-bold text-emerald-700 dark:text-emerald-400">
                  {autoBackup.scheduleStatus.isDue
                    ? 'Scheduled Now'
                    : `In ${autoBackup.scheduleStatus.daysRemaining} Day${autoBackup.scheduleStatus.daysRemaining === 1 ? '' : 's'}`}
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500">
                  {new Date(autoBackup.scheduleStatus.nextBackupAt).toLocaleDateString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric'
                  })}
                </div>
              </div>

              <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Data Protected
                </div>
                <div className="mt-1 text-sm font-bold font-mono text-slate-900 dark:text-white">
                  {autoBackup.backupMeta.totalWorkers} Workers · {autoBackup.backupMeta.totalSubgroups} Groups
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500">
                  Across {autoBackup.backupMeta.totalSites} site{autoBackup.backupMeta.totalSites === 1 ? '' : 's'} ·{' '}
                  {autoBackup.snapshots.length} archive{autoBackup.snapshots.length === 1 ? '' : 's'} stored
                </div>
              </div>

              <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Backup Channels
                </div>
                <div className="mt-1 space-y-1 text-[11px] font-semibold">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 dark:text-slate-300">{backupProjectLabel}</span>
                    <span
                      className={
                        autoBackup.backupRtdbPermissionNeeded
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-emerald-600 dark:text-emerald-400'
                      }
                    >
                      {autoBackup.backupRtdbPermissionNeeded ? 'Rules Locked' : 'Ready'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 dark:text-slate-300">Cloud Rolling Vault</span>
                    <span className="text-emerald-600 dark:text-emerald-400">Active</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Helpful Firebase Rules Unlock Card if secondary backup RTDB is locked */}
            {autoBackup.backupRtdbPermissionNeeded && (
              <div className="p-3.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2 text-xs text-amber-900 dark:text-amber-200">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                    <div>
                      <strong>Action Needed in Firebase Console ({backupProjectLabel}):</strong>{' '}
                      Your secondary backup database currently returns <code>Permission denied</code>. Your 15-day backups are safely stored in the Cloud Rolling Vault right now; to also mirror into your secondary Realtime Database, open Firebase Console ➔{' '}
                      <strong>Realtime Database ➔ Rules</strong> and allow the{' '}
                      <code>backups</code> node:
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(BACKUP_RTDB_RULES_SNIPPET);
                      onToast('Copied Firebase rules snippet to clipboard', 'success');
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-semibold bg-amber-600 hover:bg-amber-700 text-white shrink-0 cursor-pointer"
                  >
                    <Copy className="w-3 h-3" />
                    Copy Rules
                  </button>
                </div>
                <pre className="text-[11px] font-mono bg-white/80 dark:bg-slate-900/80 border border-amber-200/80 dark:border-amber-800/50 rounded-md p-2.5 overflow-x-auto text-slate-800 dark:text-slate-200">
                  {BACKUP_RTDB_RULES_SNIPPET}
                </pre>
              </div>
            )}
          </div>

          {/* Uploaded Backup Restore Box (Admin Only) */}
          {uploadedBackup && userRole === 'admin' && (
            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-bold text-blue-900 dark:text-blue-200">
                  Imported Backup File ({uploadedBackup.createdIso.slice(0, 10)}) — {uploadedBackup.totalWorkers}{' '}
                  Workers across {uploadedBackup.totalSubgroups} Subgroups
                </div>
                <button
                  type="button"
                  onClick={() => setUploadedBackup(null)}
                  className="text-xs font-semibold text-blue-700 dark:text-blue-300 hover:underline cursor-pointer"
                >
                  Close
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {Object.values(uploadedBackup.dataBySite).flatMap(siteEntry =>
                  Object.values(siteEntry.subgroups).map(subEntry => (
                    <button
                      key={`${siteEntry.siteId}_${subEntry.subgroupId}`}
                      type="button"
                      onClick={() =>
                        setRestoringTarget({
                          snapshot: uploadedBackup,
                          siteId: siteEntry.siteId,
                          subgroupId: subEntry.subgroupId,
                          label: `${siteEntry.siteName} ➔ ${subEntry.subgroupName} (${subEntry.workerCount} workers)`
                        })
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-slate-900 border border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-900/40 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Restore {siteEntry.siteName} ➔ {subEntry.subgroupName} ({subEntry.workerCount})
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Restore Confirmation Banner */}
          {restoringTarget && userRole === 'admin' && (
            <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-rose-900 dark:text-rose-200">
                <strong>Confirm Subgroup Restore:</strong> Replace current live data of{' '}
                <strong>{restoringTarget.label}</strong> with backup from{' '}
                <strong>{restoringTarget.snapshot.createdIso.slice(0, 10)}</strong>? Other subgroups will NOT be touched.
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isRestoringNow}
                  onClick={() => setRestoringTarget(null)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isRestoringNow}
                  onClick={async () => {
                    setIsRestoringNow(true);
                    await autoBackup.restoreSubgroupFromSnapshot(
                      restoringTarget.snapshot,
                      restoringTarget.siteId,
                      restoringTarget.subgroupId
                    );
                    setIsRestoringNow(false);
                    setRestoringTarget(null);
                  }}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white cursor-pointer"
                >
                  {isRestoringNow ? 'Restoring...' : 'Confirm & Restore'}
                </button>
              </div>
            </div>
          )}

          {/* Saved 15-Day Snapshots History */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  Saved Cloud Backup History ({autoBackup.snapshots.length})
                </h4>
              </div>
              <button
                type="button"
                onClick={() => autoBackup.loadBackupHistory()}
                className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-blue-600 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${autoBackup.isLoadingHistory ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>

            {autoBackup.snapshots.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                No cloud backups archived yet. Click <strong>Run Full Backup Now</strong> above to create your first 15-day backup snapshot immediately.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {autoBackup.snapshots.map(snap => (
                  <div
                    key={snap.id}
                    className="py-3 flex flex-col md:flex-row md:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-slate-900 dark:text-white">
                          {new Date(snap.createdAt).toLocaleString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                          {snap.triggerType === 'auto-15d' ? '15-Day Auto' : 'Manual'}
                        </span>
                        <span className="text-[11px] font-mono text-slate-500">
                          {snap.totalWorkers} workers · {snap.totalSubgroups} groups · {snap.totalAttendanceRecords} attendance entries
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Triggered by {snap.triggeredBy} · ID: <span className="font-mono">{snap.id}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => autoBackup.downloadSnapshotJson(snap)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        JSON
                      </button>

                      {userRole === 'admin' &&
                        Object.values(snap.dataBySite || {}).flatMap(siteEntry =>
                          Object.values(siteEntry.subgroups || {}).map(subEntry => (
                            <button
                              key={`${snap.id}_${siteEntry.siteId}_${subEntry.subgroupId}`}
                              type="button"
                              onClick={() =>
                                setRestoringTarget({
                                  snapshot: snap,
                                  siteId: siteEntry.siteId,
                                  subgroupId: subEntry.subgroupId,
                                  label: `${siteEntry.siteName} ➔ ${subEntry.subgroupName} (${subEntry.workerCount} workers)`
                                })
                              }
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 cursor-pointer"
                            >
                              <RotateCcw className="w-3 h-3" />
                              Restore {subEntry.subgroupName} ({subEntry.workerCount})
                            </button>
                          ))
                        )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
