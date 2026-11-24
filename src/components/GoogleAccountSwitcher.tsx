import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  BadgeCheck,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Crown,
  Edit3,
  ExternalLink,
  LogIn,
  LogOut,
  MessageCircle,
  RotateCcw,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Upload,
  UserPlus,
  X,
  Zap,
  Share2,
  BookOpen,
  LayoutGrid
} from 'lucide-react';
import type { UserProfileRecord } from '../context/AuthContext';
import {
  SUBSCRIPTION_TIER_META,
  validateProfilePhotoInput,
  type SavedGoogleAccount,
  type SubscriptionTier
} from '../utils/accountLogic';
import { SubscriptionTierBadge, UserAvatar } from './UserAvatar';

async function compressAvatarFileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read selected photo.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () =>
        reject(new Error('Selected file is not a valid image.'));
      img.onload = () => {
        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Image processing unavailable in this browser.'));
          return;
        }
        const minSide = Math.min(img.width, img.height);
        const sx = (img.width - minSide) / 2;
        const sy = (img.height - minSide) / 2;
        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.86));
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

async function compressProofScreenshotToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(new Error('Could not read selected screenshot.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () =>
        reject(new Error('Selected file is not a valid image.'));
      img.onload = () => {
        const maxDim = 960;
        let width = img.width;
        let height = img.height;
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
          reject(new Error('Image processing unavailable in this browser.'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.78);
        if (dataUrl.length > 480_000) {
          resolve(canvas.toDataURL('image/jpeg', 0.58));
          return;
        }
        resolve(dataUrl);
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

export interface GoogleAccountCardProps {
  authUser: User | null;
  profileRecord: UserProfileRecord | null;
  userName: string;
  userRole: string;
  isSuperAdmin: boolean;
  activeSubscriptionTier: SubscriptionTier;
  activePhotoUrl: string;
  savedAccounts: SavedGoogleAccount[];
  liveSessionUids?: string[];
  onSignInGoogle: () => Promise<void>;
  onSwitchAccount: (uidOrEmail: string) => Promise<void>;
  onAddAnotherAccount: () => Promise<void>;
  onRemoveSavedAccount: (uidOrEmail: string) => Promise<void> | void;
  onSignOutGoogle: () => Promise<void>;
  onSignOutAllAccounts?: () => Promise<void>;
  onChangePhoto: (dataUrl: string | null) => Promise<void>;
  onSubmitVerification?: (
    requestedTier: 'pro' | 'ultra',
    proofImage: string
  ) => Promise<void>;
  onUpdateUserName?: (newName: string) => void;
  onRestoreSuperAdmin?: () => void;
  compact?: boolean;
}

export const GoogleAccountCard: React.FC<GoogleAccountCardProps> = ({
  authUser,
  profileRecord,
  userName,
  userRole,
  isSuperAdmin,
  activeSubscriptionTier,
  activePhotoUrl,
  savedAccounts,
  liveSessionUids = [],
  onSignInGoogle,
  onSwitchAccount,
  onAddAnotherAccount,
  onRemoveSavedAccount,
  onSignOutGoogle,
  onSignOutAllAccounts,
  onChangePhoto,
  onSubmitVerification,
  onUpdateUserName,
  onRestoreSuperAdmin,
  compact = false
}) => {
  const [showMoreAccounts, setShowMoreAccounts] = useState(true);
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(userName);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  // Google AI Pro / Ultra Verification submission UI state
  const [showVerifyForm, setShowVerifyForm] = useState(false);
  const [requestedPlan, setRequestedPlan] = useState<'pro' | 'ultra'>('pro');
  const [proofPreviewUrl, setProofPreviewUrl] = useState<string>('');
  const [verifyNotice, setVerifyNotice] = useState<string | null>(null);

  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const proofInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setTempName(userName);
  }, [userName]);

  const liveUidSet = useMemo(() => new Set(liveSessionUids), [liveSessionUids]);

  const otherAccounts = savedAccounts.filter(
    acc =>
      !authUser ||
      (acc.uid !== authUser.uid &&
        acc.email.toLowerCase() !== (authUser.email || '').toLowerCase())
  );

  const isCustomPhoto = Boolean(
    activePhotoUrl && activePhotoUrl.startsWith('data:image/')
  );

  const isVerifiedBadge =
    Boolean(authUser) &&
    Boolean(profileRecord?.subscriptionVerified) &&
    (activeSubscriptionTier === 'pro' || activeSubscriptionTier === 'ultra');

  const verificationStatus =
    profileRecord?.subscriptionVerificationStatus || 'none';

  const handlePhotoFileSelected = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setFeedbackError(null);

    const check = validateProfilePhotoInput({
      mimeType: file.type,
      sizeBytes: file.size
    });
    if (!check.valid) {
      setFeedbackError(check.error || 'Unsupported photo file.');
      return;
    }

    try {
      setBusyAction('photo');
      const dataUrl = await compressAvatarFileToDataUrl(file);
      await onChangePhoto(dataUrl);
    } catch (err: any) {
      setFeedbackError(err?.message || 'Could not update profile photo.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleProofFileSelected = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setFeedbackError(null);

    const check = validateProfilePhotoInput({
      mimeType: file.type,
      sizeBytes: file.size
    });
    if (!check.valid) {
      setFeedbackError(check.error || 'Please choose a PNG, JPG, or WebP screenshot.');
      return;
    }

    try {
      setBusyAction('proof-read');
      const compressed = await compressProofScreenshotToDataUrl(file);
      setProofPreviewUrl(compressed);
    } catch (err: any) {
      setFeedbackError(err?.message || 'Could not process screenshot.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleSubmitVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSubmitVerification) return;
    if (!proofPreviewUrl) {
      setFeedbackError(
        'Please attach a screenshot from one.google.com showing your active Google AI plan.'
      );
      return;
    }
    setFeedbackError(null);
    setVerifyNotice(null);
    try {
      setBusyAction('submit-verify');
      await onSubmitVerification(requestedPlan, proofPreviewUrl);
      setShowVerifyForm(false);
      setProofPreviewUrl('');
      setVerifyNotice(
        `Submitted Google AI ${requestedPlan === 'ultra' ? 'Ultra' : 'Pro'} proof for verification.`
      );
    } catch (err: any) {
      setFeedbackError(
        err?.message || 'Could not submit subscription verification.'
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleSaveNameEdit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = tempName.trim();
    if (cleaned && onUpdateUserName) {
      onUpdateUserName(cleaned);
      setIsEditingName(false);
    }
  };

  const displayTitle =
    profileRecord?.displayName ||
    authUser?.displayName ||
    userName ||
    'Guest User';
  const displayEmail =
    authUser?.email || profileRecord?.email || 'Sign in with Google to sync';

  return (
    <div
      className={
        compact
          ? 'space-y-2 text-slate-900 dark:text-slate-100'
          : 'rounded-[24px] bg-[#E9EEF6] dark:bg-slate-800/95 border border-slate-200/90 dark:border-slate-700 p-3 space-y-2.5 text-slate-900 dark:text-slate-100'
      }
    >
      <input
        ref={photoInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={handlePhotoFileSelected}
      />
      <input
        ref={proofInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={handleProofFileSelected}
      />

      {/* PRIMARY GOOGLE-STYLE PROFILE HERO CARD */}
      <div className="rounded-[20px] bg-white/95 dark:bg-slate-900/95 border border-white dark:border-slate-700/80 p-3.5 shadow-2xs space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3.5 min-w-0">
            <UserAvatar
              photoUrl={activePhotoUrl}
              name={displayTitle}
              email={authUser?.email || profileRecord?.email}
              size="lg"
              highlight={isSuperAdmin ? 'gold' : authUser ? 'blue' : 'neutral'}
              subscriptionTier={activeSubscriptionTier}
              showEditBadge={Boolean(authUser)}
              onEditClick={() => photoInputRef.current?.click()}
            />

            <div className="min-w-0 space-y-0.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <h4 className="text-[17px] font-semibold tracking-tight text-[#1F1F1F] dark:text-white truncate leading-snug">
                  {displayTitle}
                </h4>
                {isSuperAdmin && (
                  <span
                    title="Super Admin — Full Access"
                    className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 shrink-0"
                  >
                    <Crown className="w-3 h-3" />
                  </span>
                )}
              </div>

              <div className="text-[13px] text-[#444746] dark:text-slate-300 truncate">
                {displayEmail}
              </div>

              {/* Verified Google AI Pro / Ultra Frosted Pill Badge directly beneath email */}
              <div className="pt-1 flex flex-wrap items-center gap-1.5">
                {isVerifiedBadge ? (
                  <span className="inline-flex items-center gap-1">
                    <SubscriptionTierBadge
                      tier={activeSubscriptionTier}
                      size="md"
                    />
                    <span
                      title={SUBSCRIPTION_TIER_META[activeSubscriptionTier].fullName}
                      className="inline-flex items-center gap-0.5 text-[10px] font-bold text-blue-600 dark:text-blue-400"
                    >
                      <BadgeCheck className="w-3.5 h-3.5" />
                      <span>Verified</span>
                    </span>
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                    Standard Account
                  </span>
                )}
                <span className="text-[11px] font-bold uppercase text-emerald-700 dark:text-emerald-400 px-1">
                  {userRole}
                </span>
                {profileRecord?.signInCount ? (
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                    · {profileRecord.signInCount}{' '}
                    {profileRecord.signInCount === 1 ? 'sign-in' : 'sign-ins'}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          {!compact && onUpdateUserName && (
            <button
              type="button"
              onClick={() => {
                setTempName(userName);
                setIsEditingName(prev => !prev);
              }}
              aria-label="Edit display name"
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/80 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 shrink-0 transition-colors cursor-pointer"
              title="Edit display name"
            >
              <Edit3 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Inline Name Edit Form */}
        {isEditingName && onUpdateUserName && (
          <form onSubmit={handleSaveNameEdit} className="flex gap-2 pt-1">
            <input
              type="text"
              value={tempName}
              onChange={e => setTempName(e.target.value)}
              placeholder="Enter display name..."
              aria-label="Display name"
              className="flex-1 px-3 py-1.5 text-xs font-semibold bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
            />
            <button
              type="submit"
              className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              Save
            </button>
          </form>
        )}

        {/* Custom Photo Reset Link */}
        {isCustomPhoto && authUser && (
          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-0.5">
            <span>Custom profile photo active</span>
            <button
              type="button"
              disabled={busyAction === 'photo'}
              onClick={async () => {
                setBusyAction('photo');
                try {
                  await onChangePhoto(null);
                } finally {
                  setBusyAction(null);
                }
              }}
              className="inline-flex items-center gap-1 font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              Reset to Google Photo
            </button>
          </div>
        )}

        {feedbackError && (
          <div className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl px-2.5 py-1.5">
            {feedbackError}
          </div>
        )}

        {verifyNotice && (
          <div className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl px-2.5 py-1.5">
            {verifyNotice}
          </div>
        )}

        {/* VERIFIED-ONLY GOOGLE AI PRO / ULTRA VERIFICATION STRIP */}
        {authUser && !isVerifiedBadge && onSubmitVerification && (
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
            {verificationStatus === 'pending' && !showVerifyForm ? (
              <div className="rounded-xl bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/80 px-2.5 py-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Clock className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold text-blue-900 dark:text-blue-200 truncate">
                      Google AI{' '}
                      {profileRecord?.subscriptionRequestedTier === 'ultra'
                        ? 'Ultra'
                        : 'Pro'}{' '}
                      verification pending
                    </div>
                    <div className="text-[10px] text-blue-700/80 dark:text-blue-300/80 truncate">
                      Badge activates automatically once verified
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowVerifyForm(true)}
                  className="text-[10px] font-bold text-blue-700 dark:text-blue-300 underline shrink-0 cursor-pointer"
                >
                  Update
                </button>
              </div>
            ) : !showVerifyForm ? (
              <div className="space-y-1.5">
                {verificationStatus === 'rejected' && (
                  <div className="rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 px-2.5 py-1.5 flex items-center gap-1.5 text-[11px] text-amber-800 dark:text-amber-200">
                    <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      Previous proof wasn&apos;t approved. Upload a clear
                      one.google.com plan screenshot.
                    </span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setFeedbackError(null);
                    setShowVerifyForm(true);
                  }}
                  className="w-full py-2 px-3 rounded-xl bg-slate-50 dark:bg-slate-800/90 hover:bg-blue-50/80 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-700 dark:text-slate-200 flex items-center justify-between gap-2 transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-1.5 min-w-0">
                    <Sparkles className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                    <span className="truncate">
                      Have Google AI Pro or Ultra? Verify badge
                    </span>
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                </button>
              </div>
            ) : (
              <form
                onSubmit={handleSubmitVerification}
                className="rounded-xl bg-slate-50 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 p-2.5 space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-extrabold text-slate-800 dark:text-white flex items-center gap-1.5">
                    <BadgeCheck className="w-3.5 h-3.5 text-blue-600" />
                    <span>Verify Google AI Subscription</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowVerifyForm(false)}
                    aria-label="Cancel verification"
                    className="p-0.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <p className="text-[10px] leading-relaxed text-slate-600 dark:text-slate-300">
                  Google Sign-In doesn&apos;t expose private billing plans. To
                  earn the verified Pro/Ultra ring, check your active plan on{' '}
                  <a
                    href="https://one.google.com/about/plans"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 font-bold text-blue-600 dark:text-blue-400 underline"
                  >
                    <span>one.google.com</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>{' '}
                  and upload a screenshot showing your email &amp; plan.
                </p>

                {/* Plan Tier Selection for Verification */}
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setRequestedPlan('pro')}
                    className={`py-1.5 px-2 rounded-lg text-[11px] font-extrabold border transition-colors cursor-pointer ${
                      requestedPlan === 'pro'
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    Google AI Pro
                  </button>
                  <button
                    type="button"
                    onClick={() => setRequestedPlan('ultra')}
                    className={`py-1.5 px-2 rounded-lg text-[11px] font-extrabold border transition-colors cursor-pointer ${
                      requestedPlan === 'ultra'
                        ? 'bg-slate-900 text-white border-purple-500'
                        : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    Google AI Ultra
                  </button>
                </div>

                {/* Upload Screenshot Proof */}
                <div className="space-y-1.5">
                  <button
                    type="button"
                    disabled={busyAction === 'proof-read'}
                    onClick={() => proofInputRef.current?.click()}
                    className="w-full py-2 px-2.5 rounded-lg border border-dashed border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 hover:border-blue-400 text-[11px] font-bold text-slate-700 dark:text-slate-200 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5 text-blue-500" />
                    <span>
                      {proofPreviewUrl
                        ? 'Change Plan Screenshot'
                        : 'Upload one.google.com Screenshot'}
                    </span>
                  </button>

                  {proofPreviewUrl && (
                    <div className="relative rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-950/5">
                      <img
                        src={proofPreviewUrl}
                        alt="Google AI subscription proof preview"
                        className="w-full max-h-28 object-cover"
                      />
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={!proofPreviewUrl || busyAction === 'submit-verify'}
                  className="w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-[11px] font-extrabold transition-colors cursor-pointer"
                >
                  {busyAction === 'submit-verify'
                    ? 'Submitting Proof...'
                    : `Submit for ${requestedPlan === 'ultra' ? 'Ultra' : 'Pro'} Verification`}
                </button>
              </form>
            )}
          </div>
        )}

        {/* Super Admin Quick Restore when locked */}
        {authUser && isSuperAdmin && userRole !== 'admin' && onRestoreSuperAdmin && (
          <button
            type="button"
            onClick={onRestoreSuperAdmin}
            className="w-full py-1.5 px-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Crown className="w-3.5 h-3.5" />
            <span>Restore Full Super Admin Access</span>
          </button>
        )}
      </div>

      {/* GOOGLE-STYLE 1-CLICK MULTI-ACCOUNT SWITCHER LIST */}
      <div className="rounded-[20px] bg-white/95 dark:bg-slate-900/95 border border-white dark:border-slate-700/80 overflow-hidden shadow-2xs">
        <button
          type="button"
          onClick={() => setShowMoreAccounts(prev => !prev)}
          aria-expanded={showMoreAccounts}
          className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/70 transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-2 min-w-0">
            <span className="truncate">
              {otherAccounts.length > 0
                ? `Switch account (${otherAccounts.length} ready)`
                : 'Add & switch Google accounts'}
            </span>
          </span>
          {showMoreAccounts ? (
            <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
          )}
        </button>

        {showMoreAccounts && (
          <div className="border-t border-slate-100 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
            {/* Saved Other Google Accounts — 1-Click Instant Switch */}
            {otherAccounts.map(acct => {
              const isLive = liveUidSet.has(acct.uid);
              const isSwitchingThis = busyAction === `switch-${acct.uid}`;
              const acctTier = acct.subscriptionVerified
                ? acct.subscriptionTier
                : 'standard';

              return (
                <div
                  key={acct.uid}
                  className="flex items-center justify-between gap-2 px-3 py-2.5 hover:bg-blue-50/70 dark:hover:bg-slate-800/80 transition-colors group"
                >
                  <button
                    type="button"
                    onClick={async () => {
                      setFeedbackError(null);
                      setBusyAction(`switch-${acct.uid}`);
                      try {
                        await onSwitchAccount(acct.uid);
                      } catch (err: any) {
                        setFeedbackError(
                          err?.message || 'Could not switch account.'
                        );
                      } finally {
                        setBusyAction(null);
                      }
                    }}
                    disabled={busyAction !== null}
                    aria-label={`Switch to ${acct.displayName || acct.email}`}
                    className="flex-1 flex items-center gap-2.5 min-w-0 text-left cursor-pointer disabled:opacity-60"
                  >
                    <div className="relative shrink-0">
                      <UserAvatar
                        photoUrl={acct.photoUrl}
                        name={acct.displayName}
                        email={acct.email}
                        size="sm"
                        highlight={acct.role === 'super_admin' ? 'gold' : 'blue'}
                        subscriptionTier={acctTier}
                      />
                      {isLive && (
                        <span
                          title="Signed in — Instant 1-click switch"
                          className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900"
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                          {acct.displayName || acct.email.split('@')[0]}
                        </span>
                        {acct.subscriptionVerified && (
                          <SubscriptionTierBadge tier={acctTier} size="xs" />
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {acct.email}
                      </div>
                      <div className="text-[10px] font-semibold mt-0.5 flex items-center gap-1">
                        {isSwitchingThis ? (
                          <span className="text-blue-600 dark:text-blue-400">
                            Switching account...
                          </span>
                        ) : isLive ? (
                          <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
                            <Zap className="w-2.5 h-2.5" />
                            <span>Tap for instant switch</span>
                          </span>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-500">
                            Tap to sign in
                          </span>
                        )}
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => onRemoveSavedAccount(acct.uid)}
                    aria-label={`Remove ${acct.email} from account list`}
                    title="Remove from saved list"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors cursor-pointer shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}

            {/* Add Another Account Button */}
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={async () => {
                setFeedbackError(null);
                setBusyAction('add-account');
                try {
                  if (authUser) {
                    await onAddAnotherAccount();
                  } else {
                    await onSignInGoogle();
                  }
                } finally {
                  setBusyAction(null);
                }
              }}
              className="w-full px-3.5 py-2.5 flex items-center gap-3 text-xs font-bold text-slate-800 dark:text-slate-100 hover:bg-blue-50/70 dark:hover:bg-slate-800/80 transition-colors cursor-pointer disabled:opacity-60"
            >
              <span className="w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                {authUser ? (
                  <UserPlus className="w-4 h-4" />
                ) : (
                  <LogIn className="w-4 h-4" />
                )}
              </span>
              <span className="text-left">
                <span className="block">
                  {busyAction === 'add-account'
                    ? 'Opening Google Account Picker...'
                    : authUser
                    ? 'Add another account'
                    : 'Sign in with Google Account'}
                </span>
                {authUser && (
                  <span className="block text-[10px] font-medium text-slate-500 dark:text-slate-400">
                    Added accounts stay signed in for 1-click switching
                  </span>
                )}
              </span>
            </button>

            {/* Sign Out / Sign Out All Row */}
            {authUser && (
              <div className="flex items-center divide-x divide-slate-100 dark:divide-slate-800">
                <button
                  type="button"
                  onClick={onSignOutGoogle}
                  className="flex-1 px-3 py-2.5 flex items-center justify-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-rose-50/70 dark:hover:bg-rose-950/30 hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign out</span>
                </button>
                {savedAccounts.length > 1 && onSignOutAllAccounts && (
                  <button
                    type="button"
                    onClick={onSignOutAllAccounts}
                    className="flex-1 px-3 py-2.5 flex items-center justify-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-rose-50/70 dark:hover:bg-rose-950/30 hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer"
                  >
                    <span>Sign out all</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

interface GoogleAccountPopoverProps extends GoogleAccountCardProps {
  isOpen: boolean;
  onClose: () => void;
  onlineCount: number;
  unreadChatCount: number;
  onOpenChat: () => void;
  onOpenAnalyticsDrawer: () => void;
  onSharePortal?: () => void;
  onOpenTutorial?: () => void;
  onBackToHub?: () => void;
}

export const GoogleAccountPopover: React.FC<GoogleAccountPopoverProps> = ({
  isOpen,
  onClose,
  onlineCount,
  unreadChatCount,
  onOpenChat,
  onOpenAnalyticsDrawer,
  onSharePortal,
  onOpenTutorial,
  onBackToHub,
  ...cardProps
}) => {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 no-print bg-slate-950/45 sm:bg-transparent backdrop-blur-sm sm:backdrop-blur-none flex items-end sm:block justify-center p-2.5 sm:p-0"
      onMouseDown={e => {
        if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
          onClose();
        }
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Google Account Switcher"
        className="lg-modal w-full max-w-[400px] sm:w-[390px] sm:fixed sm:top-[122px] sm:right-5 max-h-[85vh] sm:max-h-[calc(100vh-140px)] overflow-y-auto rounded-[28px] p-3.5 space-y-2.5 text-slate-900 dark:text-slate-100"
      >
        {/* Subtle Mobile Drag Handle */}
        <div className="sm:hidden flex justify-center pt-0.5">
          <span className="w-10 h-1 rounded-full bg-slate-400/50 dark:bg-slate-600" />
        </div>

        {/* Top Bar with Close Button */}
        <div className="flex items-center justify-between px-3 pt-0.5">
          <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 truncate">
            {cardProps.authUser?.email || 'Account & Profile'}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Account Switcher"
            className="w-7 h-7 rounded-full bg-white/50 dark:bg-white/10 hover:bg-white/80 dark:hover:bg-white/20 flex items-center justify-center text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Core Google Account Card + Switcher */}
        <GoogleAccountCard {...cardProps} compact />

        {/* Quick Portal Actions Grid (Profile -> Share, Tutorial, Analytics, All Portals) */}
        <div className="grid grid-cols-2 gap-2 px-1 pb-1">
          {onSharePortal && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onSharePortal();
              }}
              className="px-3 py-2.5 rounded-full lg-btn-primary text-xs font-extrabold text-white flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Share</span>
            </button>
          )}

          {onOpenTutorial && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenTutorial();
              }}
              className="px-3 py-2.5 rounded-full bg-white/65 dark:bg-white/10 border border-white/70 dark:border-white/18 hover:bg-white/85 dark:hover:bg-white/20 text-xs font-extrabold text-slate-800 dark:text-slate-100 flex items-center justify-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
            >
              <BookOpen className="w-3.5 h-3.5 text-blue-600 dark:text-sky-300" />
              <span>App Guide</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenAnalyticsDrawer();
            }}
            className="px-3 py-2.5 rounded-full bg-white/65 dark:bg-white/10 border border-white/70 dark:border-white/18 hover:bg-white/85 dark:hover:bg-white/20 text-xs font-extrabold text-slate-800 dark:text-slate-100 flex items-center justify-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-blue-600 dark:text-sky-300" />
            <span>Analytics</span>
          </button>

          {onBackToHub ? (
            <button
              type="button"
              onClick={() => {
                onClose();
                onBackToHub();
              }}
              className="px-3 py-2.5 rounded-full bg-white/65 dark:bg-white/10 border border-white/70 dark:border-white/18 hover:bg-white/85 dark:hover:bg-white/20 text-xs font-extrabold text-slate-800 dark:text-slate-100 flex items-center justify-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
            >
              <LayoutGrid className="w-3.5 h-3.5 text-slate-700 dark:text-slate-200" />
              <span>All Portals</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenChat();
              }}
              className="px-3 py-2.5 rounded-full bg-white/65 dark:bg-white/10 border border-white/70 dark:border-white/18 hover:bg-white/85 dark:hover:bg-white/20 text-xs font-extrabold text-slate-800 dark:text-slate-100 flex items-center justify-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
            >
              <MessageCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Live Chat</span>
              {unreadChatCount > 0 ? (
                <span className="px-1.5 rounded-full bg-emerald-600 text-white text-[10px] font-black tabular-nums">
                  {unreadChatCount}
                </span>
              ) : onlineCount > 0 ? (
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
              ) : null}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
