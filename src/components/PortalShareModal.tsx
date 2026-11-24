import React, { useEffect, useState } from 'react';
import {
  X,
  Mail,
  CheckCircle2,
  AlertCircle,
  UserPlus,
  Trash2,
  Loader2,
  ShieldCheck
} from 'lucide-react';
import {
  validateShareRecipientEmail,
  type AttendancePortalRecord,
  type EmailVerificationResult
} from '../utils/portalLogic';
import { CompanyBrandMark } from './CompanyBrandMark';
import { GlassModal } from './LiquidGlass';

interface PortalShareModalProps {
  isOpen: boolean;
  portal: AttendancePortalRecord | null;
  currentUserUid?: string;
  currentUserEmail?: string;
  onClose: () => void;
  onShareWithEmail: (portal: AttendancePortalRecord, recipientEmail: string) => Promise<void>;
  onRevokeEmail: (portal: AttendancePortalRecord, recipientEmail: string) => Promise<void>;
}

/**
 * Profile -> Share Portal Modal:
 * 1) Enter recipient email address (e.g., colleague@gmail.com)
 * 2) Verify email format, spelling/typo detection, and duplicates
 * 3) Confirm & grant access so the portal appears under their "Shared Attendance Portals"
 */
export const PortalShareModal: React.FC<PortalShareModalProps> = ({
  isOpen,
  portal,
  currentUserUid,
  currentUserEmail,
  onClose,
  onShareWithEmail,
  onRevokeEmail
}) => {
  const [emailInput, setEmailInput] = useState('');
  const [verification, setVerification] = useState<EmailVerificationResult | null>(null);
  const [verifiedReadyEmail, setVerifiedReadyEmail] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setEmailInput('');
    setVerification(null);
    setVerifiedReadyEmail(null);
    setBusyAction(null);
    setStatusMessage(null);
  }, [isOpen, portal?.id]);

  if (!isOpen || !portal) return null;

  const isOwner = Boolean(
    (currentUserUid && portal.ownerUid === currentUserUid) ||
      (currentUserEmail &&
        portal.ownerEmail.toLowerCase() === currentUserEmail.trim().toLowerCase())
  );

  const handleVerifyEmail = (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);
    const result = validateShareRecipientEmail(emailInput, {
      ownerEmail: portal.ownerEmail,
      existingSharedEmails: portal.sharedWithEmails
    });
    setVerification(result);
    if (result.valid) {
      setVerifiedReadyEmail(result.normalizedEmail);
    } else {
      setVerifiedReadyEmail(null);
    }
  };

  const handleConfirmShare = async () => {
    if (!verifiedReadyEmail) return;
    setBusyAction('share');
    setStatusMessage(null);
    try {
      await onShareWithEmail(portal, verifiedReadyEmail);
      setStatusMessage({
        type: 'success',
        text: `Portal shared with ${verifiedReadyEmail}. It will now appear in their Shared Attendance Portals when they sign in with Google.`
      });
      setEmailInput('');
      setVerification(null);
      setVerifiedReadyEmail(null);
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err?.message || 'Could not share portal right now. Please try again.'
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleRevoke = async (recipientEmail: string) => {
    setBusyAction(`revoke:${recipientEmail}`);
    setStatusMessage(null);
    try {
      await onRevokeEmail(portal, recipientEmail);
      setStatusMessage({
        type: 'success',
        text: `Removed access for ${recipientEmail}.`
      });
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err?.message || 'Could not remove access right now.'
      });
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <GlassModal
      isOpen={isOpen && Boolean(portal)}
      onClose={onClose}
      labelledBy="share-portal-title"
      maxWidthClass="max-w-lg"
    >
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-900/10 dark:border-white/12 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 id="share-portal-title" className="text-base font-extrabold text-slate-900 dark:text-white">
            Share Attendance Portal
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-300">
            Grant access by verified Google email address
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close share portal dialog"
          className="p-2 rounded-full text-slate-500 hover:text-slate-900 dark:hover:text-white bg-white/45 dark:bg-white/10 hover:bg-white/75 dark:hover:bg-white/20 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Portal Summary Card */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
            <CompanyBrandMark
              companyName={portal.companyName}
              companyLogo={portal.companyLogo}
              companySubtitle={portal.companySubtitle}
              showSubtitle
              size="sm"
              idSuffix={`share_${portal.id}`}
            />
          </div>

          {isOwner ? (
            <div className="space-y-3">
              <form onSubmit={handleVerifyEmail} className="space-y-2">
                <label
                  htmlFor="share-recipient-email"
                  className="block text-xs font-bold text-slate-700 dark:text-slate-200"
                >
                  Recipient Email Address
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="share-recipient-email"
                      type="email"
                      value={emailInput}
                      onChange={e => {
                        setEmailInput(e.target.value);
                        setVerification(null);
                        setVerifiedReadyEmail(null);
                        setStatusMessage(null);
                      }}
                      placeholder="colleague@gmail.com"
                      className="w-full pl-9 pr-3 py-2.5 rounded-full text-sm lg-input text-slate-900 dark:text-white"
                    />
                  </div>
                  <button
                    type="submit"
                    className="px-4 py-2.5 rounded-full lg-btn-primary text-white text-xs font-bold transition-all cursor-pointer shrink-0"
                  >
                    Verify Email
                  </button>
                </div>
              </form>

              {/* Validation Error / Typo Suggestion */}
              {verification && !verification.valid && (
                <div
                  role="alert"
                  className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-900 dark:text-amber-200 space-y-2"
                >
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                    <span>{verification.error}</span>
                  </div>
                  {verification.suggestion && (
                    <button
                      type="button"
                      onClick={() => {
                        const fixed = verification.suggestion!;
                        setEmailInput(fixed);
                        const recheck = validateShareRecipientEmail(fixed, {
                          ownerEmail: portal.ownerEmail,
                          existingSharedEmails: portal.sharedWithEmails
                        });
                        setVerification(recheck);
                        setVerifiedReadyEmail(recheck.valid ? recheck.normalizedEmail : null);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold cursor-pointer"
                    >
                      Use {verification.suggestion}
                    </button>
                  )}
                </div>
              )}

              {/* Verified Confirmation Box */}
              {verifiedReadyEmail && (
                <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 space-y-3">
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    <div className="text-xs text-emerald-900 dark:text-emerald-200 space-y-1">
                      <div className="font-bold">
                        Email verified — ready to share
                      </div>
                      <p className="leading-relaxed">
                        Please confirm that <strong className="font-mono">{verifiedReadyEmail}</strong> is the exact email address. When they sign in with Google using this email, <strong>{portal.companyName}</strong> will appear in their <strong>Shared Attendance Portals</strong> section.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setVerifiedReadyEmail(null);
                        setVerification(null);
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 cursor-pointer"
                    >
                      Edit Email
                    </button>
                    <button
                      type="button"
                      disabled={busyAction === 'share'}
                      onClick={handleConfirmShare}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs cursor-pointer disabled:opacity-60"
                    >
                      {busyAction === 'share' ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <UserPlus className="w-3.5 h-3.5" />
                      )}
                      <span>{busyAction === 'share' ? 'Sharing...' : 'Confirm & Share Portal'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-300">
              <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
              <span>
                This portal is owned by <strong className="font-mono">{portal.ownerEmail}</strong>. Only the portal owner can invite or revoke shared emails.
              </span>
            </div>
          )}

          {statusMessage && (
            <div
              role="status"
              className={`p-3 rounded-xl border text-xs font-medium flex items-start gap-2 ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                  : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
              }`}
            >
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              )}
              <span>{statusMessage.text}</span>
            </div>
          )}

          {/* People With Access */}
          <div className="space-y-2.5 pt-2 border-t border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                People with Access
              </h3>
              <span className="text-[11px] font-mono text-slate-500 tabular-nums">
                {portal.sharedWithEmails.length + 1} total
              </span>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              {/* Owner row */}
              <div className="px-3.5 py-2.5 bg-white dark:bg-slate-900 flex items-center justify-between gap-2 text-xs">
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900 dark:text-white truncate">
                    {portal.ownerName || portal.ownerEmail}
                  </div>
                  <div className="text-[11px] font-mono text-slate-500 truncate">
                    {portal.ownerEmail}
                  </div>
                </div>
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 shrink-0">
                  Owner
                </span>
              </div>

              {/* Shared users */}
              {portal.sharedWithEmails.length === 0 ? (
                <div className="px-3.5 py-4 text-center text-xs text-slate-500 dark:text-slate-400 bg-slate-50/60 dark:bg-slate-950/30">
                  No additional team members have been added yet.
                </div>
              ) : (
                portal.sharedWithEmails.map(email => {
                  const isRevoking = busyAction === `revoke:${email}`;
                  return (
                    <div
                      key={email}
                      className="px-3.5 py-2.5 bg-white dark:bg-slate-900 flex items-center justify-between gap-2 text-xs"
                    >
                      <span className="font-mono text-slate-800 dark:text-slate-200 truncate">
                        {email}
                      </span>
                      {isOwner ? (
                        <button
                          type="button"
                          disabled={isRevoking}
                          onClick={() => handleRevoke(email)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                        >
                          {isRevoking ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Trash2 className="w-3 h-3" />
                          )}
                          <span>Revoke</span>
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-400 shrink-0">Shared</span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-white/30 dark:bg-slate-950/35 border-t border-slate-900/10 dark:border-white/12 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-full text-xs font-bold bg-white/60 dark:bg-white/12 hover:bg-white/85 dark:hover:bg-white/20 text-slate-900 dark:text-white border border-white/60 dark:border-white/18 cursor-pointer"
          >
            Done
          </button>
        </div>
    </GlassModal>
  );
};
