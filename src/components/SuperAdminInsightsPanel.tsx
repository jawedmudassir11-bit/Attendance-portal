import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Crown,
  Users,
  Activity,
  RefreshCw,
  Search,
  Database,
  FileSpreadsheet,
  Clock,
  ShieldCheck,
  AlertCircle,
  MessageCircle,
  BadgeCheck,
  Check,
  X,
  Eye
} from 'lucide-react';
import type { AdminOverviewData, UserProfileRecord } from '../context/AuthContext';
import type { SubscriptionTier } from '../utils/accountLogic';
import { SubscriptionTierBadge, UserAvatar } from './UserAvatar';

interface SuperAdminInsightsPanelProps {
  isOpen: boolean;
  currentUserEmail?: string | null;
  onlineUids?: string[];
  onStartChatWithUser?: (uid: string) => void;
  onUpdateUserTier?: (
    targetUid: string,
    tier: SubscriptionTier,
    action?: 'approve' | 'reject'
  ) => Promise<boolean>;
  fetchAdminOverview: () => Promise<AdminOverviewData | null>;
}

function formatRelativeTime(iso: string): string {
  if (!iso) return 'Unknown';
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return 'Unknown';
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(ts).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

function formatShortDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

function formatINR(val: number): string {
  return `₹${Math.round(val || 0).toLocaleString('en-IN')}`;
}

export const SuperAdminInsightsPanel: React.FC<SuperAdminInsightsPanelProps> = ({
  isOpen,
  currentUserEmail,
  onlineUids = [],
  onStartChatWithUser,
  onUpdateUserTier,
  fetchAdminOverview
}) => {
  const onlineUidSet = useMemo(() => new Set(onlineUids), [onlineUids]);
  const [data, setData] = useState<AdminOverviewData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeSection, setActiveSection] = useState<
    'users' | 'snapshots' | 'exports'
  >('users');
  const [updatingTierUid, setUpdatingTierUid] = useState<string | null>(null);
  const [viewingProofUser, setViewingProofUser] =
    useState<UserProfileRecord | null>(null);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchAdminOverview();
      if (result) {
        setData(result);
      }
    } catch (err: any) {
      setError(err?.message || 'Unable to load Super Admin insights');
    } finally {
      setLoading(false);
    }
  }, [fetchAdminOverview]);

  useEffect(() => {
    if (isOpen) {
      loadOverview();
    }
  }, [isOpen, loadOverview]);

  const pendingVerifications = useMemo(
    () =>
      (data?.users || []).filter(
        u => u.subscriptionVerificationStatus === 'pending'
      ),
    [data?.users]
  );

  const filteredUsers = useMemo(() => {
    const list = data?.users || [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      u =>
        u.email.toLowerCase().includes(q) ||
        u.displayName.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q)
    );
  }, [data?.users, searchQuery]);

  const normalizedMe = (currentUserEmail || '').trim().toLowerCase();

  const handleReviewVerification = async (
    acct: UserProfileRecord,
    nextTier: SubscriptionTier,
    action?: 'approve' | 'reject'
  ) => {
    if (!onUpdateUserTier) return;
    setUpdatingTierUid(acct.uid);
    try {
      const ok = await onUpdateUserTier(acct.uid, nextTier, action);
      if (ok) {
        const effectiveVerified =
          action === 'reject'
            ? false
            : nextTier === 'pro' || nextTier === 'ultra';
        const effectiveStatus =
          action === 'reject'
            ? 'rejected'
            : effectiveVerified
            ? 'verified'
            : 'none';
        setData(prev =>
          prev
            ? {
                ...prev,
                users: prev.users.map(u =>
                  u.uid === acct.uid
                    ? {
                        ...u,
                        subscriptionTier: effectiveVerified
                          ? nextTier
                          : 'standard',
                        subscriptionVerified: effectiveVerified,
                        subscriptionVerificationStatus: effectiveStatus,
                        subscriptionRequestedTier: ''
                      }
                    : u
                )
              }
            : prev
        );
        if (viewingProofUser?.uid === acct.uid) {
          setViewingProofUser(null);
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to update verification status');
    } finally {
      setUpdatingTierUid(null);
    }
  };

  return (
    <section
      aria-label="Super Admin Sign-In and Portal Accounts Overview"
      className="rounded-2xl border border-amber-300/80 dark:border-amber-700/60 bg-amber-50/40 dark:bg-slate-800/80 p-3.5 space-y-3"
    >
      {/* Header Row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
            <Crown className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white truncate">
              Super Admin Command Insights
            </h4>
            <p className="text-[10px] font-semibold text-amber-800 dark:text-amber-300 truncate">
              Signed-in accounts, AI badge verification &amp; cloud records
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={loadOverview}
          disabled={loading}
          aria-label="Refresh Super Admin Insights"
          className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:border-amber-400 flex items-center gap-1 shrink-0 cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Error State */}
      {error && (
        <div className="rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 px-3 py-2.5 flex items-center justify-between gap-2 text-xs text-rose-700 dark:text-rose-300">
          <div className="flex items-center gap-1.5 min-w-0">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="truncate">{error}</span>
          </div>
          <button
            type="button"
            onClick={loadOverview}
            className="text-[11px] font-bold underline shrink-0 cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && !data && (
        <div className="grid grid-cols-2 gap-2 animate-pulse">
          {[1, 2, 3, 4].map(n => (
            <div
              key={n}
              className="h-16 rounded-xl bg-white/70 dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-700/60"
            />
          ))}
        </div>
      )}

      {/* Loaded KPIs & Directory */}
      {data && (
        <>
          {/* 4-KPI Summary Grid */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-2.5">
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <span>People Signed In</span>
                <Users className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="text-xl font-black tabular-nums text-slate-900 dark:text-white mt-0.5">
                {data.summary.totalSignedInUsers}
              </div>
              <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                {data.summary.superAdminCount} Super Admin
                {data.summary.superAdminCount === 1 ? '' : 's'}
              </div>
            </div>

            <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-2.5">
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <span>Total Sign-Ins</span>
                <Activity className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="text-xl font-black tabular-nums text-slate-900 dark:text-white mt-0.5">
                {data.summary.totalCumulativeSignIns}
              </div>
              <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                Cumulative sessions
              </div>
            </div>

            <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-2.5">
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <span>Active (24h)</span>
                <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="text-xl font-black tabular-nums text-slate-900 dark:text-white mt-0.5">
                {data.summary.activeLast24h}
              </div>
              <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                {data.summary.activeLast7d} active in 7 days
              </div>
            </div>

            <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-2.5">
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <span>Cloud Records</span>
                <Database className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div className="text-xl font-black tabular-nums text-slate-900 dark:text-white mt-0.5">
                {data.summary.totalSiteSnapshots}
              </div>
              <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                {data.summary.totalBookkeepingExports} monthly export
                {data.summary.totalBookkeepingExports === 1 ? '' : 's'}
              </div>
            </div>
          </div>

          {/* Pending Google AI Pro / Ultra Verification Requests */}
          {pendingVerifications.length > 0 && onUpdateUserTier && (
            <div className="rounded-xl border border-blue-300/80 dark:border-blue-700 bg-blue-50/70 dark:bg-blue-950/40 p-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-blue-800 dark:text-blue-200 flex items-center gap-1.5">
                  <BadgeCheck className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  <span>
                    Pending AI Badge Verifications ({pendingVerifications.length})
                  </span>
                </span>
              </div>
              <div className="space-y-1.5">
                {pendingVerifications.map(reqUser => {
                  const reqPlan =
                    reqUser.subscriptionRequestedTier === 'ultra'
                      ? 'ultra'
                      : 'pro';
                  const isBusy = updatingTierUid === reqUser.uid;
                  return (
                    <div
                      key={reqUser.uid}
                      className="rounded-lg bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-800 p-2 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                            {reqUser.displayName || reqUser.email}
                          </div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                            {reqUser.email} · Requested{' '}
                            <strong className="text-blue-700 dark:text-blue-300">
                              Google AI {reqPlan === 'ultra' ? 'Ultra' : 'Pro'}
                            </strong>
                          </div>
                        </div>
                        {reqUser.subscriptionProofUrl && (
                          <button
                            type="button"
                            onClick={() => setViewingProofUser(reqUser)}
                            className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-[10px] font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1 shrink-0 cursor-pointer"
                          >
                            <Eye className="w-3 h-3" />
                            <span>Proof</span>
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() =>
                            handleReviewVerification(
                              reqUser,
                              reqPlan,
                              'approve'
                            )
                          }
                          className="py-1.5 px-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-[11px] font-extrabold flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <Check className="w-3 h-3" />
                          <span>
                            Verify {reqPlan === 'ultra' ? 'Ultra' : 'Pro'}
                          </span>
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() =>
                            handleReviewVerification(
                              reqUser,
                              'standard',
                              'reject'
                            )
                          }
                          className="py-1.5 px-2 rounded-lg bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 disabled:opacity-50 text-[11px] font-extrabold flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                          <span>Reject</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Sub-navigation Tabs */}
          <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-white/80 dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setActiveSection('users')}
              className={`py-1.5 px-2 rounded-lg text-[11px] font-extrabold transition-colors cursor-pointer ${
                activeSection === 'users'
                  ? 'bg-[#152E4D] text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              People ({data.users.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('snapshots')}
              className={`py-1.5 px-2 rounded-lg text-[11px] font-extrabold transition-colors cursor-pointer ${
                activeSection === 'snapshots'
                  ? 'bg-[#152E4D] text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              Sites ({data.recentSiteSnapshots.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('exports')}
              className={`py-1.5 px-2 rounded-lg text-[11px] font-extrabold transition-colors cursor-pointer ${
                activeSection === 'exports'
                  ? 'bg-[#152E4D] text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              Exports ({data.recentBookkeepingExports.length})
            </button>
          </div>

          {/* TAB 1: Signed-In Users Directory */}
          {activeSection === 'users' && (
            <div className="space-y-2">
              {data.users.length > 3 && (
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search signed-in people or Gmail..."
                    aria-label="Filter signed-in people"
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-400"
                  />
                </div>
              )}

              <div className="max-h-64 overflow-y-auto space-y-1.5 pr-0.5">
                {filteredUsers.length === 0 ? (
                  <div className="text-center py-4 text-xs text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
                    No matching signed-in accounts found.
                  </div>
                ) : (
                  filteredUsers.map(acct => {
                    const isMe = acct.email.toLowerCase() === normalizedMe;
                    const isAcctSuperAdmin = acct.role === 'super_admin';
                    const isAcctOnline = onlineUidSet.has(acct.uid);
                    const verifiedTier = acct.subscriptionVerified
                      ? acct.subscriptionTier
                      : 'standard';

                    return (
                      <div
                        key={acct.uid}
                        className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-2.5 flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="relative shrink-0">
                            <UserAvatar
                              photoUrl={acct.photoUrl}
                              name={acct.displayName}
                              email={acct.email}
                              size="sm"
                              highlight={isAcctSuperAdmin ? 'gold' : 'blue'}
                              subscriptionTier={verifiedTier}
                            />
                            {isAcctOnline && (
                              <span
                                title="Online now"
                                className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900"
                              />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                                {acct.displayName || acct.email.split('@')[0]}
                              </span>
                              {acct.subscriptionVerified && (
                                <SubscriptionTierBadge
                                  tier={verifiedTier}
                                  size="xs"
                                />
                              )}
                              {acct.subscriptionVerificationStatus ===
                                'pending' && (
                                <span className="px-1.5 py-0.2 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 text-[9px] font-bold">
                                  Pending{' '}
                                  {acct.subscriptionRequestedTier === 'ultra'
                                    ? 'Ultra'
                                    : 'Pro'}
                                </span>
                              )}
                              {isMe && (
                                <span className="text-[9px] font-extrabold uppercase text-blue-600 dark:text-blue-400 shrink-0">
                                  (You)
                                </span>
                              )}
                              {isAcctSuperAdmin && (
                                <ShieldCheck
                                  className="w-3.5 h-3.5 text-amber-500 shrink-0"
                                  aria-label="Super Admin"
                                />
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                              {acct.email}
                            </div>
                            <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                              <span>
                                Joined {formatShortDate(acct.createdAt)} ·{' '}
                                <span
                                  className={
                                    isAcctSuperAdmin
                                      ? 'font-bold text-amber-700 dark:text-amber-300'
                                      : ''
                                  }
                                >
                                  {isAcctSuperAdmin ? 'Super Admin' : 'Member'}
                                </span>
                              </span>
                              {onUpdateUserTier && (
                                <select
                                  aria-label={`Verified Google AI Plan for ${acct.email}`}
                                  value={verifiedTier}
                                  disabled={updatingTierUid === acct.uid}
                                  onChange={e =>
                                    handleReviewVerification(
                                      acct,
                                      e.target.value as SubscriptionTier
                                    )
                                  }
                                  className="text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-md px-1.5 py-0.5 cursor-pointer"
                                >
                                  <option value="standard">Standard</option>
                                  <option value="pro">Verified AI Pro</option>
                                  <option value="ultra">
                                    Verified AI Ultra
                                  </option>
                                </select>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-right">
                            <div className="text-xs font-black tabular-nums text-slate-900 dark:text-white">
                              {acct.signInCount}{' '}
                              {acct.signInCount === 1 ? 'login' : 'logins'}
                            </div>
                            <div className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                              {isAcctOnline
                                ? 'Online now'
                                : formatRelativeTime(acct.lastSignInAt)}
                            </div>
                          </div>
                          {!isMe && onStartChatWithUser && (
                            <button
                              type="button"
                              onClick={() => onStartChatWithUser(acct.uid)}
                              title={`Chat with ${acct.displayName || acct.email}`}
                              aria-label={`Chat with ${acct.displayName || acct.email}`}
                              className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                                isAcctOnline
                                  ? 'bg-emerald-500 text-white border-emerald-500 hover:bg-emerald-600'
                                  : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-blue-400'
                              }`}
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* TAB 2: Recent Cloud Site Backups */}
          {activeSection === 'snapshots' && (
            <div className="max-h-64 overflow-y-auto space-y-1.5 pr-0.5">
              {data.recentSiteSnapshots.length === 0 ? (
                <div className="text-center py-4 text-xs text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
                  No cloud site snapshots saved yet.
                </div>
              ) : (
                data.recentSiteSnapshots.map(snap => (
                  <div
                    key={snap.id}
                    className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-2.5 space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                        {snap.siteName} ➔ {snap.subgroupName}
                      </span>
                      <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 shrink-0">
                        {formatRelativeTime(snap.updatedAt)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                      <span className="truncate">{snap.ownerEmail}</span>
                      <span className="tabular-nums font-bold text-slate-700 dark:text-slate-300 shrink-0">
                        {snap.workerCount} workers · {snap.dprCount} DPRs
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 3: Recent Monthly Bookkeeping Exports */}
          {activeSection === 'exports' && (
            <div className="max-h-64 overflow-y-auto space-y-1.5 pr-0.5">
              {data.recentBookkeepingExports.length === 0 ? (
                <div className="text-center py-4 text-xs text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
                  No monthly bookkeeping Excel exports recorded yet.
                </div>
              ) : (
                data.recentBookkeepingExports.map(exp => (
                  <div
                    key={exp.id}
                    className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-2.5 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                          {exp.siteName} ➔ {exp.subgroupName} ({exp.monthKey})
                        </span>
                      </div>
                      <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 shrink-0">
                        {formatRelativeTime(exp.exportedAt)}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-1 text-[10px] tabular-nums">
                      <div>
                        <span className="text-slate-400 block">Labor</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                          {formatINR(exp.totalLaborCost)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Material</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                          {formatINR(exp.totalMaterialValue)}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-slate-400 block">Net Pay</span>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">
                          {formatINR(exp.netPayable)}
                        </span>
                      </div>
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                      Exported by {exp.ownerName} ({exp.ownerEmail}) ·{' '}
                      {exp.workerCount} workers
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}

      {/* Proof Image Review Lightbox Modal */}
      {viewingProofUser && (
        <div
          className="fixed inset-0 z-[60] bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setViewingProofUser(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Subscription Verification Proof"
            onClick={e => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-4 shadow-2xl space-y-3"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h5 className="text-sm font-extrabold text-slate-900 dark:text-white truncate">
                  Google AI Plan Proof
                </h5>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  {viewingProofUser.displayName} ({viewingProofUser.email})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewingProofUser(null)}
                aria-label="Close proof preview"
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {viewingProofUser.subscriptionProofUrl && (
              <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950">
                <img
                  src={viewingProofUser.subscriptionProofUrl}
                  alt={`Google AI subscription proof for ${viewingProofUser.email}`}
                  className="w-full max-h-[55vh] object-contain"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={updatingTierUid === viewingProofUser.uid}
                onClick={() =>
                  handleReviewVerification(
                    viewingProofUser,
                    viewingProofUser.subscriptionRequestedTier === 'ultra'
                      ? 'ultra'
                      : 'pro',
                    'approve'
                  )
                }
                className="py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                <span>
                  Approve{' '}
                  {viewingProofUser.subscriptionRequestedTier === 'ultra'
                    ? 'AI Ultra'
                    : 'AI Pro'}
                </span>
              </button>
              <button
                type="button"
                disabled={updatingTierUid === viewingProofUser.uid}
                onClick={() =>
                  handleReviewVerification(
                    viewingProofUser,
                    'standard',
                    'reject'
                  )
                }
                className="py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>Reject Proof</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
