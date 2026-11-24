import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  Upload,
  Trash2,
  ArrowRight,
  ArrowLeft,
  Check,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Database,
  Shield,
  Building2,
  Copy,
  Loader2,
  ExternalLink,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import {
  MAX_COMPANY_LOGO_LENGTH,
  MAX_COMPANY_NAME_LENGTH,
  MAX_COMPANY_SUBTITLE_LENGTH,
  PORTAL_ROLE_DEFINITIONS,
  RECOMMENDED_PORTAL_RTDB_RULES,
  parseFirebaseRtdbInput,
  validateRolePasswordsSetup,
  type AttendancePortalRecord
} from '../utils/portalLogic';
import { testRealtimeDatabaseConnection } from '../utils/firebaseBridge';
import { CompanyBrandMark } from './CompanyBrandMark';
import { GlassModal } from './LiquidGlass';

export interface PortalWizardSubmitPayload {
  companyName: string;
  companySubtitle: string;
  companyLogo: string;
  adminPassword?: string;
  supervisorPassword?: string;
  inchargePassword?: string;
  updatePasswords: boolean;
  rtdbUrl: string;
  rtdbProjectId: string;
  backupRtdbUrl: string;
  storageBucket: string;
}

interface CreatePortalWizardProps {
  isOpen: boolean;
  editingPortal?: AttendancePortalRecord | null;
  onClose: () => void;
  onSubmit: (payload: PortalWizardSubmitPayload) => Promise<void>;
}

async function compressCompanyLogoFile(file: File): Promise<string> {
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'].includes(file.type)) {
    throw new Error('Please upload a PNG, JPG, WebP, or SVG logo image.');
  }
  if (file.size > 4 * 1024 * 1024) {
    throw new Error('Logo image must be under 4 MB.');
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read selected logo file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Selected file is not a valid image.'));
      img.onload = () => {
        const maxDim = 256;
        let width = img.width || maxDim;
        let height = img.height || maxDim;
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width = Math.max(1, Math.round(width * ratio));
          height = Math.max(1, Math.round(height * ratio));
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Image resizing is unavailable in this browser.'));
          return;
        }
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        // Prefer WebP (supports transparency & stays tiny), fallback to PNG/JPEG
        let dataUrl = canvas.toDataURL('image/webp', 0.88);
        if (!dataUrl.startsWith('data:image/webp')) {
          dataUrl = canvas.toDataURL('image/png');
        }
        if (dataUrl.length > MAX_COMPANY_LOGO_LENGTH) {
          dataUrl = canvas.toDataURL('image/jpeg', 0.82);
        }
        if (dataUrl.length > MAX_COMPANY_LOGO_LENGTH) {
          reject(new Error('Logo image is still too large after compression. Try a simpler image.'));
          return;
        }
        resolve(dataUrl);
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

export const CreatePortalWizard: React.FC<CreatePortalWizardProps> = ({
  isOpen,
  editingPortal = null,
  onClose,
  onSubmit
}) => {
  const isEditing = Boolean(editingPortal);
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1: Company Branding
  const [companyName, setCompanyName] = useState('');
  const [companySubtitle, setCompanySubtitle] = useState('');
  const [companyLogo, setCompanyLogo] = useState('');
  const [logoError, setLogoError] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  // Step 2: Role Passwords
  const [changePasswordsInEdit, setChangePasswordsInEdit] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [supervisorPassword, setSupervisorPassword] = useState('');
  const [inchargePassword, setInchargePassword] = useState('');
  const [showPwds, setShowPwds] = useState<Record<string, boolean>>({});

  // Step 3: Code-Free Firebase Realtime Database Setup
  const [firebaseInput, setFirebaseInput] = useState('');
  const [backupFirebaseInput, setBackupFirebaseInput] = useState('');
  const [showBackupField, setShowBackupField] = useState(false);
  const [showRulesBox, setShowRulesBox] = useState(false);
  const [copiedRules, setCopiedRules] = useState(false);
  const [testState, setTestState] = useState<{
    testing: boolean;
    result?: {
      ok: boolean;
      status: 'connected' | 'rules_locked' | 'unreachable' | 'sdk_unavailable';
      message: string;
    };
  }>({ testing: false });

  const [stepError, setStepError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setStep(1);
    setStepError(null);
    setLogoError(null);
    setSubmitting(false);
    setTestState({ testing: false });
    setCopiedRules(false);

    if (editingPortal) {
      setCompanyName(editingPortal.companyName || '');
      setCompanySubtitle(editingPortal.companySubtitle || '');
      setCompanyLogo(editingPortal.companyLogo || '');
      setChangePasswordsInEdit(false);
      setAdminPassword('');
      setSupervisorPassword('');
      setInchargePassword('');
      setFirebaseInput(editingPortal.rtdbUrl || '');
      setBackupFirebaseInput(editingPortal.backupRtdbUrl || '');
      setShowBackupField(Boolean(editingPortal.backupRtdbUrl));
      setShowRulesBox(false);
    } else {
      setCompanyName('');
      setCompanySubtitle('');
      setCompanyLogo('');
      setChangePasswordsInEdit(true);
      setAdminPassword('');
      setSupervisorPassword('');
      setInchargePassword('');
      setFirebaseInput('');
      setBackupFirebaseInput('');
      setShowBackupField(false);
      setShowRulesBox(false);
    }
  }, [isOpen, editingPortal]);

  if (!isOpen) return null;

  const parsedPrimary = parseFirebaseRtdbInput(firebaseInput);
  const parsedBackup = backupFirebaseInput.trim()
    ? parseFirebaseRtdbInput(backupFirebaseInput)
    : null;

  const handleLogoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setLogoError(null);
    try {
      const dataUrl = await compressCompanyLogoFile(file);
      setCompanyLogo(dataUrl);
    } catch (err: any) {
      setLogoError(err?.message || 'Could not process logo file.');
    }
  };

  const handleNextStep = () => {
    setStepError(null);
    if (step === 1) {
      if (companyName.trim().length < 2) {
        setStepError('Please enter your company or project name (at least 2 characters).');
        return;
      }
      setStep(2);
      return;
    }

    if (step === 2) {
      if (!isEditing || changePasswordsInEdit) {
        const pwdCheck = validateRolePasswordsSetup({
          admin: adminPassword,
          supervisor: supervisorPassword,
          incharge: inchargePassword
        });
        if (!pwdCheck.valid) {
          setStepError(pwdCheck.error || 'Please check your role passwords.');
          return;
        }
      }
      setStep(3);
    }
  };

  const handleTestFirebaseConnection = async () => {
    setStepError(null);
    if (!parsedPrimary.valid) {
      setStepError(parsedPrimary.error || 'Please paste a valid Firebase Realtime Database URL first.');
      return;
    }
    setTestState({ testing: true });
    const res = await testRealtimeDatabaseConnection({
      databaseURL: parsedPrimary.databaseURL,
      projectId: parsedPrimary.projectId
    });
    setTestState({ testing: false, result: res });
    if (res.status === 'rules_locked') {
      setShowRulesBox(true);
    }
  };

  const handleFinalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStepError(null);

    if (companyName.trim().length < 2) {
      setStep(1);
      setStepError('Please enter your company name.');
      return;
    }

    const shouldUpdatePasswords = !isEditing || changePasswordsInEdit;
    if (shouldUpdatePasswords) {
      const pwdCheck = validateRolePasswordsSetup({
        admin: adminPassword,
        supervisor: supervisorPassword,
        incharge: inchargePassword
      });
      if (!pwdCheck.valid) {
        setStep(2);
        setStepError(pwdCheck.error || 'Please set valid role passwords.');
        return;
      }
    }

    if (!parsedPrimary.valid) {
      setStepError(parsedPrimary.error || 'Please paste a valid Firebase Realtime Database URL.');
      return;
    }

    if (backupFirebaseInput.trim() && parsedBackup && !parsedBackup.valid) {
      setStepError(`Backup Database URL is invalid: ${parsedBackup.error}`);
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        companyName: companyName.trim(),
        companySubtitle: companySubtitle.trim(),
        companyLogo,
        adminPassword: shouldUpdatePasswords ? adminPassword.trim() : undefined,
        supervisorPassword: shouldUpdatePasswords ? supervisorPassword.trim() : undefined,
        inchargePassword: shouldUpdatePasswords ? inchargePassword.trim() : undefined,
        updatePasswords: shouldUpdatePasswords,
        rtdbUrl: parsedPrimary.databaseURL,
        rtdbProjectId: parsedPrimary.projectId,
        backupRtdbUrl: parsedBackup?.valid ? parsedBackup.databaseURL : '',
        storageBucket: parsedPrimary.storageBucket || parsedBackup?.storageBucket || ''
      });
    } catch (err: any) {
      setStepError(err?.message || 'Could not save portal. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const stepsMeta = [
    { num: 1 as const, label: 'Company Branding', icon: Building2 },
    { num: 2 as const, label: 'Role Passwords', icon: Shield },
    { num: 3 as const, label: 'Firebase Database', icon: Database }
  ];

  const getRoleInputState = (role: 'admin' | 'supervisor' | 'incharge') => {
    if (role === 'admin') {
      return {
        value: adminPassword,
        setValue: setAdminPassword,
        placeholder: 'e.g. Admin@2026 or 8492'
      };
    }
    if (role === 'supervisor') {
      return {
        value: supervisorPassword,
        setValue: setSupervisorPassword,
        placeholder: 'e.g. Sup@Site1 or 4421'
      };
    }
    return {
      value: inchargePassword,
      setValue: setInchargePassword,
      placeholder: 'e.g. Incharge@1 or 7310'
    };
  };

  return (
    <GlassModal
      isOpen={isOpen}
      onClose={onClose}
      labelledBy="create-portal-title"
      maxWidthClass="max-w-2xl"
    >
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-900/10 dark:border-white/12 flex items-center justify-between gap-3 shrink-0">
        <div>
          <h2 id="create-portal-title" className="text-lg font-extrabold text-slate-900 dark:text-white">
            {isEditing ? `Portal Settings — ${editingPortal?.companyName}` : 'Create an Attendance Portal'}
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
            One-time setup per portal — configure branding, role access, and your Firebase Realtime Database.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close portal setup wizard"
          className="p-2 rounded-full text-slate-500 hover:text-slate-900 dark:hover:text-white bg-white/45 dark:bg-white/10 hover:bg-white/75 dark:hover:bg-white/20 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* 3-Step Pill Indicator */}
      <div className="px-6 py-3 bg-white/30 dark:bg-slate-950/30 border-b border-slate-900/10 dark:border-white/12 shrink-0">
        <div className="grid grid-cols-3 gap-2">
          {stepsMeta.map(s => {
            const Icon = s.icon;
            const isCurrent = step === s.num;
            const isComplete = step > s.num;
            return (
              <button
                key={s.num}
                type="button"
                onClick={() => {
                  if (s.num < step || isEditing) {
                    setStepError(null);
                    setStep(s.num);
                  }
                }}
                className={`flex items-center gap-2 px-3 py-2 rounded-full text-left text-xs font-bold transition-all ${
                  isCurrent
                    ? 'lg-pill-thumb text-slate-950 dark:text-white'
                    : isComplete
                    ? 'text-emerald-700 dark:text-emerald-300 hover:bg-white/50 dark:hover:bg-white/10 cursor-pointer'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <span
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                    isComplete
                      ? 'bg-emerald-600 text-white'
                      : isCurrent
                      ? 'bg-blue-600 text-white'
                      : 'bg-white/60 dark:bg-white/12 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {isComplete ? <Check className="w-3.5 h-3.5" /> : s.num}
                </span>
                <span className="truncate hidden sm:inline">{s.label}</span>
                <Icon className="w-3.5 h-3.5 sm:hidden shrink-0" />
              </button>
            );
          })}
        </div>
      </div>

        {/* Scrollable Step Body */}
        <form onSubmit={handleFinalSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {/* STEP 1: COMPANY LOGO & NAME */}
            {step === 1 && (
              <div className="space-y-5">
                <div className="space-y-1.5">
                  <label
                    htmlFor="wizard-company-name"
                    className="block text-xs font-bold text-slate-700 dark:text-slate-200"
                  >
                    Company / Organization Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="wizard-company-name"
                    type="text"
                    required
                    maxLength={MAX_COMPANY_NAME_LENGTH}
                    value={companyName}
                    onChange={e => {
                      setCompanyName(e.target.value);
                      setStepError(null);
                    }}
                    placeholder="e.g. Apex Civil Works Pvt. Ltd."
                    className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="wizard-company-subtitle"
                    className="block text-xs font-bold text-slate-700 dark:text-slate-200"
                  >
                    Office Address / Tagline <span className="font-normal text-slate-400">(Optional — shown on letterhead &amp; reports)</span>
                  </label>
                  <input
                    id="wizard-company-subtitle"
                    type="text"
                    maxLength={MAX_COMPANY_SUBTITLE_LENGTH}
                    value={companySubtitle}
                    onChange={e => setCompanySubtitle(e.target.value)}
                    placeholder="e.g. Regd. Office: Sector 12, Industrial Area, Patna"
                    className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Logo Upload */}
                <div className="space-y-2">
                  <span className="block text-xs font-bold text-slate-700 dark:text-slate-200">
                    Company Logo <span className="font-normal text-slate-400">(PNG, JPG, WebP, or SVG)</span>
                  </span>
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    className="hidden"
                    onChange={handleLogoFileChange}
                  />
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => logoInputRef.current?.click()}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-100 transition-colors cursor-pointer"
                    >
                      <Upload className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      <span>{companyLogo ? 'Replace Company Logo' : 'Upload Company Logo'}</span>
                    </button>
                    {companyLogo && (
                      <button
                        type="button"
                        onClick={() => setCompanyLogo('')}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Remove Logo</span>
                      </button>
                    )}
                  </div>
                  {logoError && (
                    <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">{logoError}</p>
                  )}
                </div>

                {/* Live Letterhead Preview */}
                <div className="space-y-2 pt-1">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Live Portal Letterhead &amp; Hub Card Preview
                  </div>
                  <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 overflow-hidden">
                    <div className="px-4 py-3 border-b-[3px] border-[#8B5A2B] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <CompanyBrandMark
                        companyName={companyName || 'Your Company Name'}
                        companyLogo={companyLogo}
                        size="md"
                        idSuffix="wizard_preview"
                      />
                      {companySubtitle.trim() && (
                        <div className="text-[11px] text-slate-600 dark:text-slate-400 truncate max-w-xs">
                          {companySubtitle}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2: ROLE PASSWORDS */}
            {step === 2 && (
              <div className="space-y-4">
                <div className="space-y-1">
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    Set three distinct role passwords for your team. By default, anyone opening the portal starts in read-only <strong>Viewer</strong> mode until they unlock a role with its password.
                  </p>
                </div>

                {isEditing && (
                  <label className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={changePasswordsInEdit}
                      onChange={e => setChangePasswordsInEdit(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      Update role passwords (leave unchecked to keep current passwords)
                    </span>
                  </label>
                )}

                {(!isEditing || changePasswordsInEdit) && (
                  <div className="space-y-3.5">
                    {PORTAL_ROLE_DEFINITIONS.map((def, idx) => {
                      const state = getRoleInputState(def.role);
                      const isVisible = Boolean(showPwds[def.role]);
                      const inputId = `wizard-pwd-${def.role}`;
                      return (
                        <div
                          key={def.role}
                          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-4 space-y-3"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                            <div className="space-y-1 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-mono font-bold text-slate-400">
                                  {idx + 1}.
                                </span>
                                <label
                                  htmlFor={inputId}
                                  className="text-sm font-bold text-slate-900 dark:text-white"
                                >
                                  {def.label} Password
                                </label>
                                <span className="text-[11px] font-semibold text-blue-700 dark:text-blue-400">
                                  · {def.shortTag}
                                </span>
                              </div>
                              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                                {def.summary}
                              </p>
                            </div>

                            <div className="relative w-full sm:w-56 shrink-0">
                              <input
                                id={inputId}
                                type={isVisible ? 'text' : 'password'}
                                value={state.value}
                                onChange={e => {
                                  state.setValue(e.target.value);
                                  setStepError(null);
                                }}
                                placeholder={state.placeholder}
                                autoComplete="new-password"
                                className="w-full pl-3.5 pr-9 py-2 rounded-lg text-sm font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  setShowPwds(prev => ({ ...prev, [def.role]: !prev[def.role] }))
                                }
                                aria-label={isVisible ? `Hide ${def.label} password` : `Show ${def.label} password`}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                              >
                                {isVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                              </button>
                            </div>
                          </div>

                          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 pt-2 border-t border-slate-200/70 dark:border-slate-700/70">
                            {def.permissions.map(perm => (
                              <li
                                key={perm}
                                className="text-[11px] text-slate-600 dark:text-slate-300 flex items-start gap-1.5"
                              >
                                <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                                <span>{perm}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* STEP 3: CODE-FREE FIREBASE REALTIME DATABASE SETUP */}
            {step === 3 && (
              <div className="space-y-4">
                {/* Beginner-Friendly 4-Step Guide */}
                <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 p-4 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                      Connect Your Firebase Realtime Database (No Coding Required)
                    </h3>
                    <a
                      href="https://console.firebase.google.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      <span>Open Firebase Console</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <ol className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-600 dark:text-slate-300">
                    <li className="flex items-start gap-2">
                      <span className="w-4 h-4 rounded-full bg-slate-900 dark:bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
                      <span>Create a free project in Firebase Console and click <strong>Build &rarr; Realtime Database &rarr; Create Database</strong>.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="w-4 h-4 rounded-full bg-slate-900 dark:bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
                      <span>Copy the <strong>Database URL</strong> shown at the top of your Realtime Database Data tab (ends with <code>.firebasedatabase.app</code> or <code>.firebaseio.com</code>).</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="w-4 h-4 rounded-full bg-slate-900 dark:bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>
                      <span>Paste either that URL <strong>or</strong> your full Firebase Web Config snippet in the box below.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="w-4 h-4 rounded-full bg-slate-900 dark:bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">4</span>
                      <span>Click <strong>Test Connection</strong> — once saved, your portal remembers it permanently on every sign-in.</span>
                    </li>
                  </ol>
                </div>

                {/* Smart URL / Config Input */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="wizard-firebase-input"
                    className="block text-xs font-bold text-slate-700 dark:text-slate-200"
                  >
                    Firebase Realtime Database URL or Config Snippet <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    id="wizard-firebase-input"
                    rows={3}
                    value={firebaseInput}
                    onChange={e => {
                      setFirebaseInput(e.target.value);
                      setTestState({ testing: false });
                      setStepError(null);
                    }}
                    placeholder="https://your-company-default-rtdb.asia-southeast1.firebasedatabase.app/"
                    className="w-full px-3.5 py-2.5 rounded-xl text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Live Parsed Feedback + Test Connection Button */}
                {firebaseInput.trim() && (
                  <div
                    className={`p-3.5 rounded-xl border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      parsedPrimary.valid
                        ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-200'
                        : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200'
                    }`}
                  >
                    {parsedPrimary.valid ? (
                      <>
                        <div className="space-y-0.5 min-w-0">
                          <div className="font-semibold flex items-center gap-1.5">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            <span>Detected Firebase Project: <code className="font-mono">{parsedPrimary.projectId}</code></span>
                          </div>
                          <div className="font-mono text-[11px] opacity-80 truncate">
                            {parsedPrimary.databaseURL}
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={testState.testing}
                          onClick={handleTestFirebaseConnection}
                          className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shrink-0 cursor-pointer disabled:opacity-60"
                        >
                          {testState.testing ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Database className="w-3.5 h-3.5" />
                          )}
                          <span>{testState.testing ? 'Testing...' : 'Test Connection'}</span>
                        </button>
                      </>
                    ) : (
                      <div className="flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                        <span>{parsedPrimary.error}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Live Connection Probe Result */}
                {testState.result && (
                  <div
                    role="status"
                    className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
                      testState.result.ok
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                        : 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200'
                    }`}
                  >
                    {testState.result.ok ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    )}
                    <span>{testState.result.message}</span>
                  </div>
                )}

                {/* Recommended Realtime Database Rules */}
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowRulesBox(v => !v)}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                  >
                    <span>Recommended Firebase Realtime Database Rules (if your database is locked)</span>
                    {showRulesBox ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  {showRulesBox && (
                    <div className="p-4 space-y-2.5 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] text-slate-600 dark:text-slate-400">
                          In Firebase Console, open <strong>Realtime Database &rarr; Rules</strong>, paste this snippet, and click <strong>Publish</strong>:
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard?.writeText(RECOMMENDED_PORTAL_RTDB_RULES);
                            setCopiedRules(true);
                            setTimeout(() => setCopiedRules(false), 2000);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-slate-900 dark:bg-blue-600 text-white shrink-0 cursor-pointer"
                        >
                          {copiedRules ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedRules ? 'Copied' : 'Copy Rules'}</span>
                        </button>
                      </div>
                      <pre className="p-3 rounded-lg bg-slate-950 text-slate-100 text-[11px] font-mono overflow-x-auto">
                        {RECOMMENDED_PORTAL_RTDB_RULES}
                      </pre>
                    </div>
                  )}
                </div>

                {/* Optional Secondary Backup Database URL */}
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => setShowBackupField(v => !v)}
                    className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    {showBackupField
                      ? 'Hide optional secondary backup database'
                      : '+ Add optional secondary backup Realtime Database URL (for 15-day backup mirror)'}
                  </button>
                  {showBackupField && (
                    <div className="mt-2 space-y-1.5">
                      <label
                        htmlFor="wizard-backup-rtdb"
                        className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                      >
                        Backup Realtime Database URL <span className="font-normal text-slate-400">(Optional)</span>
                      </label>
                      <input
                        id="wizard-backup-rtdb"
                        type="text"
                        value={backupFirebaseInput}
                        onChange={e => setBackupFirebaseInput(e.target.value)}
                        placeholder="https://your-company-backup-default-rtdb.firebasedatabase.app/"
                        className="w-full px-3.5 py-2 rounded-xl text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {stepError && (
              <div
                role="alert"
                className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 flex items-start gap-2 text-xs text-rose-700 dark:text-rose-300 font-medium"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{stepError}</span>
              </div>
            )}
          </div>

          {/* Footer Navigation */}
          <div className="px-6 py-4 bg-white/30 dark:bg-slate-950/35 border-t border-slate-900/10 dark:border-white/12 flex items-center justify-between gap-3 shrink-0">
            <div>
              {step > 1 ? (
                <button
                  type="button"
                  onClick={() => {
                    setStepError(null);
                    setStep((step - 1) as 1 | 2);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold text-slate-700 dark:text-slate-200 bg-white/50 dark:bg-white/10 hover:bg-white/80 dark:hover:bg-white/20 transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-full text-xs font-bold text-slate-700 dark:text-slate-300 bg-white/45 dark:bg-white/10 hover:bg-white/75 dark:hover:bg-white/20 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              )}
            </div>

            <div>
              {step < 3 ? (
                <button
                  type="button"
                  onClick={handleNextStep}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full lg-btn-primary text-white text-xs font-bold transition-all cursor-pointer"
                >
                  <span>Continue</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full lg-btn-primary text-white text-xs font-bold transition-all cursor-pointer disabled:opacity-60"
                >
                  {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>
                    {submitting
                      ? 'Saving Portal...'
                      : isEditing
                      ? 'Save Portal Settings'
                      : 'Create & Open Portal'}
                  </span>
                </button>
              )}
            </div>
          </div>
        </form>
    </GlassModal>
  );
};
