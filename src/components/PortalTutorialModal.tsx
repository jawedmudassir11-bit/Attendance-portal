import React, { useState } from 'react';
import {
  X,
  BookOpen,
  Building2,
  Database,
  Shield,
  CheckSquare,
  ClipboardList,
  Table,
  Share2,
  CheckCircle2,
  ArrowRight
} from 'lucide-react';
import { PORTAL_ROLE_DEFINITIONS } from '../utils/portalLogic';
import { GlassModal } from './LiquidGlass';

interface PortalTutorialModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ChapterId =
  | 'overview'
  | 'setup'
  | 'roles'
  | 'attendance'
  | 'dpr'
  | 'reports'
  | 'sharing';

const CHAPTERS: { id: ChapterId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'overview', label: '1. App Overview', icon: BookOpen },
  { id: 'setup', label: '2. Portal & Firebase Setup', icon: Database },
  { id: 'roles', label: '3. Roles & Passwords', icon: Shield },
  { id: 'attendance', label: '4. Daily Attendance', icon: CheckSquare },
  { id: 'dpr', label: '5. DPR & Material Stock', icon: ClipboardList },
  { id: 'reports', label: '6. Register, Slips & Backups', icon: Table },
  { id: 'sharing', label: '7. Sharing via Email', icon: Share2 }
];

export const PortalTutorialModal: React.FC<PortalTutorialModalProps> = ({
  isOpen,
  onClose
}) => {
  const [activeChapter, setActiveChapter] = useState<ChapterId>('overview');

  if (!isOpen) return null;

  const currentIndex = CHAPTERS.findIndex(c => c.id === activeChapter);
  const nextChapter = CHAPTERS[currentIndex + 1];

  return (
    <GlassModal
      isOpen={isOpen}
      onClose={onClose}
      labelledBy="tutorial-modal-title"
      maxWidthClass="max-w-4xl"
      className="h-[86vh]"
    >
        {/* Top Bar */}
        <div className="px-6 py-4 border-b border-slate-900/10 dark:border-white/12 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600/15 dark:bg-sky-400/15 text-blue-700 dark:text-sky-300 border border-blue-500/20 flex items-center justify-center">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 id="tutorial-modal-title" className="text-base font-extrabold text-slate-900 dark:text-white">
                Attendance Portal — Complete Tutorial &amp; Guide
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Step-by-step instructions covering portal creation, Firebase setup, daily operations, and team sharing
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close tutorial guide"
            className="p-2 rounded-full text-slate-500 hover:text-slate-900 dark:hover:text-white bg-white/45 dark:bg-white/10 hover:bg-white/75 dark:hover:bg-white/20 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body: Left Chapters + Right Content */}
        <div className="flex-1 min-h-0 flex flex-col md:flex-row">
          {/* Chapter Navigation */}
          <nav
            aria-label="Tutorial Chapters"
            className="md:w-64 shrink-0 border-b md:border-b-0 md:border-r border-slate-900/10 dark:border-white/12 bg-white/25 dark:bg-slate-950/30 p-3 flex md:flex-col gap-1.5 overflow-x-auto md:overflow-y-auto"
          >
            {CHAPTERS.map(ch => {
              const Icon = ch.icon;
              const isActive = activeChapter === ch.id;
              return (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => setActiveChapter(ch.id)}
                  className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-full text-xs font-bold whitespace-nowrap md:whitespace-normal text-left transition-all cursor-pointer shrink-0 ${
                    isActive
                      ? 'lg-btn-primary text-white'
                      : 'text-slate-700 dark:text-slate-200 hover:bg-white/55 dark:hover:bg-white/10'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{ch.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Active Chapter Details */}
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
            {activeChapter === 'overview' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-slate-900 dark:text-white">
                  <Building2 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  <h3 className="text-lg font-extrabold">What Attendance Portal Does</h3>
                </div>
                <p>
                  <strong>Attendance Portal</strong> is a self-serve site workforce and operations platform built for contractors, construction firms, factories, and field teams. Any company or individual can sign in with Google, brand their own workspace with their logo and company name, connect their own Firebase Realtime Database in under two minutes, and invite teammates by email.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {[
                    {
                      title: 'Multi-Site & Multi-Team Structure',
                      desc: 'Organize crews by Site and Subgroup (team/contractor), or switch to Master Roll-Up to inspect all crews combined.'
                    },
                    {
                      title: 'Daily Attendance, OT & Cash Advances',
                      desc: 'Mark Present (P), Half-Day (H), or Absent (A) in one tap, record Overtime hours, and track daily site cash advances.'
                    },
                    {
                      title: 'DPR, Weather Downtime & Live Stock',
                      desc: 'Log daily progress notes, rain/downtime delays, challan receipts, material consumption, and low-stock alerts.'
                    },
                    {
                      title: 'Payroll Register, Slips & 15-Day Backups',
                      desc: 'Generate bilingual Hindi/English wage slips, 4-sheet Excel bookkeeping ledgers, and automated 15-day cloud backups.'
                    }
                  ].map(card => (
                    <div
                      key={card.title}
                      className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-1"
                    >
                      <div className="text-xs font-bold text-slate-900 dark:text-white">{card.title}</div>
                      <p className="text-xs text-slate-600 dark:text-slate-400">{card.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeChapter === 'setup' && (
              <div className="space-y-4">
                <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">
                  Creating a Portal &amp; Linking Firebase (No Coding Needed)
                </h3>
                <p className="text-xs sm:text-sm">
                  Each company portal stores its live attendance, workers, DPR, and backup records inside <strong>your own Firebase Realtime Database</strong>. You only do this setup once per portal:
                </p>
                <ol className="space-y-3 text-xs sm:text-sm">
                  <li className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                    <strong className="text-slate-900 dark:text-white block mb-1">Step 1 — Company Logo &amp; Name</strong>
                    From the Portal Hub, click <strong>Create an Attendance Portal</strong>. Upload your company logo (PNG/JPG/WebP) and enter your company name and optional office address. Your branding appears on the portal letterhead, shared portal cards, wage slips, and Excel exports.
                  </li>
                  <li className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                    <strong className="text-slate-900 dark:text-white block mb-1">Step 2 — Set Role Passwords</strong>
                    Choose three distinct passwords for <strong>Admin</strong>, <strong>Supervisor</strong>, and <strong>Site In-Charge</strong>. Passwords are stored securely as salted hashes — never in plain text.
                  </li>
                  <li className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                    <strong className="text-slate-900 dark:text-white block mb-1">Step 3 — Paste Your Firebase Realtime Database URL</strong>
                    Open <span className="font-mono">console.firebase.google.com</span>, create a free project, enable <strong>Realtime Database</strong>, and copy the Database URL (for example, <code className="text-xs">https://my-company-default-rtdb.firebasedatabase.app/</code>). Paste it into Step 3 — or paste the entire <code className="text-xs">firebaseConfig</code> block — and click <strong>Test Connection</strong>.
                  </li>
                  <li className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                    <strong className="text-slate-900 dark:text-white block mb-1">Step 4 — Open &amp; Use Anytime</strong>
                    Once created, the configuration is saved permanently to your account. On future sign-ins, simply click <strong>Open Portal</strong> from the Portal Hub.
                  </li>
                </ol>
              </div>
            )}

            {activeChapter === 'roles' && (
              <div className="space-y-4">
                <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">
                  Role Passwords &amp; Access Levels
                </h3>
                <p className="text-xs sm:text-sm">
                  Every portal opens in read-only <strong>Viewer</strong> mode by default to prevent accidental edits. Tap the <strong>View Only / Lock</strong> button in the header and enter a role password to unlock editing privileges:
                </p>
                <div className="space-y-3">
                  {PORTAL_ROLE_DEFINITIONS.map(def => (
                    <div
                      key={def.role}
                      className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-bold text-slate-900 dark:text-white">{def.label}</span>
                        <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">{def.shortTag}</span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400">{def.summary}</p>
                      <ul className="space-y-1 pt-1">
                        {def.permissions.map(p => (
                          <li key={p} className="text-xs flex items-start gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                            <span>{p}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeChapter === 'attendance' && (
              <div className="space-y-4">
                <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">
                  Daily Attendance, Overtime &amp; Advances
                </h3>
                <ul className="space-y-2.5 text-xs sm:text-sm">
                  <li className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                    <strong className="text-slate-900 dark:text-white block mb-0.5">Switching Sites &amp; Subgroups</strong>
                    Use the Site Dropdown at the top-left of the dark header bar to switch between Sites and Subgroups. Admins can create, rename, or delete sites and subgroups directly from that menu.
                  </li>
                  <li className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                    <strong className="text-slate-900 dark:text-white block mb-0.5">Fast 1-Tap Duty Marking</strong>
                    Tap <strong>P</strong> (Full Day = 1.0), <strong>H</strong> (Half Day = 0.5), or <strong>A</strong> (Absent = 0.0) on any worker row. Enter Overtime hours (calculated at Daily Rate ÷ 8) and daily cash advances inline.
                  </li>
                  <li className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                    <strong className="text-slate-900 dark:text-white block mb-0.5">48-Hour Auto-Lock &amp; Manual Day Lock</strong>
                    Supervisors and Site In-Charges can edit today and yesterday. Days older than 48 hours auto-lock to protect historical payroll; Admins can unlock or edit any date anytime.
                  </li>
                  <li className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                    <strong className="text-slate-900 dark:text-white block mb-0.5">Offline Support at Remote Sites</strong>
                    If mobile signal drops, changes are cached locally and queued automatically — once signal returns, the portal syncs everything to your Firebase Realtime Database.
                  </li>
                </ul>
              </div>
            )}

            {activeChapter === 'dpr' && (
              <div className="space-y-4">
                <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">
                  DPR, Weather Downtime &amp; Live Material Stock
                </h3>
                <ul className="space-y-2.5 text-xs sm:text-sm">
                  <li className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                    <strong className="text-slate-900 dark:text-white block mb-0.5">Daily Progress Report &amp; Weather</strong>
                    Record daily work completed, weather condition, rain start/end windows, and work downtime reasons/hours for transparent project audits.
                  </li>
                  <li className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                    <strong className="text-slate-900 dark:text-white block mb-0.5">Material Receipts &amp; Live Stock Balance</strong>
                    Log incoming materials with Challan numbers and supplier names, plus daily material consumption. The portal automatically computes live remaining stock and flags low-stock thresholds.
                  </li>
                  <li className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                    <strong className="text-slate-900 dark:text-white block mb-0.5">1-Tap 6:00 PM WhatsApp Executive Summary</strong>
                    Compile workforce turnout, trade breakdown, overtime, cash advances, downtime delays, and material logs into a clean WhatsApp report for Head Office in one tap.
                  </li>
                </ul>
              </div>
            )}

            {activeChapter === 'reports' && (
              <div className="space-y-4">
                <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">
                  Monthly Register, Wage Slips, Excel &amp; 15-Day Backups
                </h3>
                <ul className="space-y-2.5 text-xs sm:text-sm">
                  <li className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                    <strong className="text-slate-900 dark:text-white block mb-0.5">Monthly Register &amp; Master Roll-Up</strong>
                    View and edit the full 31-day attendance grid in <strong>Monthly Register &amp; Staff</strong>, add or transfer workers between subgroups, or select <strong>All Groups (Master Roll-Up)</strong> for read-only site totals.
                  </li>
                  <li className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                    <strong className="text-slate-900 dark:text-white block mb-0.5">Bilingual Wage Slips &amp; 4-Sheet Excel Ledger</strong>
                    Under <strong>Wage Slips, Reports &amp; Tools</strong>, print or PDF bilingual Hindi/English wage slips, WhatsApp individual slips, and export a 4-sheet Excel bookkeeping workbook (Payroll Summary, Muster Roll, OT Log, Advances Ledger).
                  </li>
                  <li className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                    <strong className="text-slate-900 dark:text-white block mb-0.5">Automated 15-Day Cloud Backup Vault</strong>
                    The Backup Vault automatically archives every site, subgroup, worker, attendance sheet, and DPR every 15 days. You can also run manual backups, download a <code className="text-xs">.json</code> snapshot, or restore a subgroup as Admin.
                  </li>
                </ul>
              </div>
            )}

            {activeChapter === 'sharing' && (
              <div className="space-y-4">
                <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">
                  Sharing Your Portal via Email (Profile &rarr; Share)
                </h3>
                <ol className="space-y-3 text-xs sm:text-sm">
                  <li className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                    <strong className="text-slate-900 dark:text-white block mb-1">1. Open Profile &rarr; Share</strong>
                    Click your profile avatar in the top bar (or open the Live Portal Analytics drawer) and select <strong>Share Portal</strong>. You can also click the Share icon on any owned portal card in the Portal Hub.
                  </li>
                  <li className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                    <strong className="text-slate-900 dark:text-white block mb-1">2. Enter &amp; Verify Recipient Email</strong>
                    Type your teammate&apos;s Google email address (e.g., <span className="font-mono">colleague@gmail.com</span>) and click <strong>Verify Email</strong>. The app checks for formatting issues and common domain typos before you confirm.
                  </li>
                  <li className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                    <strong className="text-slate-900 dark:text-white block mb-1">3. Instant Access in Shared Portals</strong>
                    When your teammate signs in with that verified Google email, your company portal appears automatically under their <strong>Shared Attendance Portals</strong> section with your company logo and name. Share the appropriate role password (Supervisor, Site In-Charge, or Admin) with them to control what they can edit.
                  </li>
                  <li className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                    <strong className="text-slate-900 dark:text-white block mb-1">4. Revoke Anytime</strong>
                    Open <strong>Profile &rarr; Share</strong> again to see everyone with access and click <strong>Revoke</strong> to remove a user immediately.
                  </li>
                </ol>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-white/30 dark:bg-slate-950/35 border-t border-slate-900/10 dark:border-white/12 flex items-center justify-between gap-3 shrink-0">
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
            Chapter {currentIndex + 1} of {CHAPTERS.length}
          </span>
          <div className="flex items-center gap-2">
            {nextChapter && (
              <button
                type="button"
                onClick={() => setActiveChapter(nextChapter.id)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold lg-btn-primary text-white cursor-pointer"
              >
                <span>Next: {nextChapter.label.replace(/^\d+\.\s*/, '')}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-full text-xs font-bold bg-white/60 dark:bg-white/12 hover:bg-white/85 dark:hover:bg-white/20 text-slate-900 dark:text-white border border-white/60 dark:border-white/18 cursor-pointer"
            >
              Close Guide
            </button>
          </div>
        </div>
    </GlassModal>
  );
};
