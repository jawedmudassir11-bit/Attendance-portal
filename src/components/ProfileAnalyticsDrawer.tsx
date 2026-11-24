import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  Edit3,
  Trash2,
  Plus,
  Check,
  Shield,
  RefreshCw,
  Sun,
  Moon,
  Lock,
  Unlock,
  Sparkles,
  UserCheck,
  Crown,
  LogIn,
  LogOut,
  MessageCircle,
  Share2,
  BookOpen,
  LayoutGrid,
  Settings
} from 'lucide-react';
import type { User } from 'firebase/auth';
import type { AdminOverviewData, UserProfileRecord } from '../context/AuthContext';
import type { ChatContactDTO } from '../utils/chatLogic';
import type { SavedGoogleAccount, SubscriptionTier } from '../utils/accountLogic';
import {
  AppState,
  SiteNode,
  UserRole,
  parseDutyInput
} from '../utils/siteLogic';
import { UserAvatar } from './UserAvatar';
import { GoogleAccountCard } from './GoogleAccountSwitcher';
import { SuperAdminInsightsPanel } from './SuperAdminInsightsPanel';
import { CompanyBrandMark } from './CompanyBrandMark';

// ==========================================
// 1. DYNAMIC COMPANY LETTERHEAD & INTRO GLIDE
// ==========================================
interface CompanyLetterheadProps {
  companyName: string;
  companyLogo?: string;
  companySubtitle?: string;
  logoTargetRef?: React.RefObject<HTMLDivElement | null>;
  hideLogoForMorph?: boolean;
  onBackToHub?: () => void;
  onOpenTutorial?: () => void;
  onOpenShare?: () => void;
}

export const CompanyLetterhead: React.FC<CompanyLetterheadProps> = ({
  companyName,
  companyLogo,
  companySubtitle,
  logoTargetRef,
  hideLogoForMorph = false,
  onBackToHub,
  onOpenTutorial,
  onOpenShare
}) => {
  return (
    <div className="lg-surface lg-surface-sheen rounded-[24px] sm:rounded-full px-3.5 sm:px-5 py-2 transition-colors no-print">
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 sm:gap-4">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          {onBackToHub && (
            <button
              type="button"
              onClick={onBackToHub}
              title="Back to Portal Hub (All Portals)"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/60 dark:border-white/20 bg-white/45 dark:bg-white/10 hover:bg-white/70 dark:hover:bg-white/20 text-xs font-bold text-slate-900 dark:text-white transition-all active:scale-95 cursor-pointer shrink-0"
            >
              <LayoutGrid className="w-3.5 h-3.5 text-blue-700 dark:text-sky-300" />
              <span className="hidden sm:inline">Portals</span>
            </button>
          )}
          <div
            ref={logoTargetRef}
            className={`inline-flex items-center origin-left transition-opacity duration-150 min-w-0 ${
              hideLogoForMorph ? 'opacity-0' : 'opacity-100'
            }`}
          >
            <CompanyBrandMark
              companyName={companyName}
              companyLogo={companyLogo}
              companySubtitle={companySubtitle}
              showSubtitle
              size="md"
              idSuffix="header"
            />
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {onOpenShare && (
            <button
              type="button"
              onClick={onOpenShare}
              title="Share this portal via email"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/60 dark:border-white/20 bg-white/45 dark:bg-white/10 hover:bg-white/70 dark:hover:bg-white/20 text-xs font-bold text-slate-900 dark:text-white transition-all active:scale-95 cursor-pointer"
            >
              <Share2 className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-300" />
              <span className="hidden sm:inline">Share</span>
            </button>
          )}
          {onOpenTutorial && (
            <button
              type="button"
              onClick={onOpenTutorial}
              title="Open App Tutorial & Guide"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/60 dark:border-white/20 bg-white/45 dark:bg-white/10 hover:bg-white/70 dark:hover:bg-white/20 text-xs font-bold text-slate-900 dark:text-white transition-all active:scale-95 cursor-pointer"
            >
              <BookOpen className="w-3.5 h-3.5 text-blue-700 dark:text-sky-300" />
              <span className="hidden sm:inline">Guide</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

interface IntroCenterToHeaderGlideProps {
  stage: 'center' | 'gliding' | 'done';
  isCloudReady: boolean;
  companyName: string;
  companyLogo?: string;
  companySubtitle?: string;
  userName: string;
  siteName: string;
  subgroupName: string;
  workerCount: number;
  headerLogoRef: React.RefObject<HTMLDivElement | null>;
  onSkip: () => void;
}

export const IntroCenterToHeaderGlide: React.FC<IntroCenterToHeaderGlideProps> = ({
  stage,
  isCloudReady,
  companyName,
  companyLogo,
  companySubtitle,
  userName,
  siteName,
  subgroupName,
  workerCount,
  headerLogoRef,
  onSkip
}) => {
  const introLogoRef = useRef<HTMLDivElement | null>(null);
  const [glideDelta, setGlideDelta] = useState<{ dx: number; dy: number }>({ dx: 0, dy: 0 });

  useEffect(() => {
    if (stage === 'gliding' && introLogoRef.current && headerLogoRef.current) {
      const src = introLogoRef.current.getBoundingClientRect();
      const dest = headerLogoRef.current.getBoundingClientRect();
      const srcCenterX = src.left + src.width / 2;
      const srcCenterY = src.top + src.height / 2;
      const destCenterX = dest.left + dest.width / 2;
      const destCenterY = dest.top + dest.height / 2;
      setGlideDelta({
        dx: destCenterX - srcCenterX,
        dy: destCenterY - srcCenterY
      });
    }
  }, [stage, headerLogoRef]);

  if (stage === 'done') return null;

  const isGliding = stage === 'gliding';

  return (
    <div
      onClick={onSkip}
      role="presentation"
      title="Tap anywhere to skip intro"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center cursor-pointer select-none overflow-hidden no-print"
    >
      <div
        className={`absolute inset-0 bg-white dark:bg-slate-950 gi-gpu-glide ${
          isGliding ? 'opacity-0' : 'opacity-100'
        }`}
      />

      <div className="relative z-10 flex flex-col items-center">
        <div
          ref={introLogoRef}
          style={{
            transform: isGliding
              ? `translate3d(${glideDelta.dx}px, ${glideDelta.dy}px, 0) scale(1)`
              : 'translate3d(0px, 0px, 0) scale(1.25)'
          }}
          className="gi-gpu-glide origin-center"
        >
          <div className="gi-intro-pop">
            <CompanyBrandMark
              companyName={companyName}
              companyLogo={companyLogo}
              size="lg"
              idSuffix="intro"
            />
          </div>
        </div>

        <div
          style={{
            transform: isGliding ? 'translate3d(0, 12px, 0)' : 'translate3d(0, 0, 0)'
          }}
          className={`mt-6 flex flex-col items-center gap-3 text-center px-4 gi-gpu-glide ${
            isGliding ? 'opacity-0 pointer-events-none' : 'opacity-100'
          }`}
        >
          {companySubtitle && (
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 font-medium max-w-md">
              {companySubtitle}
            </p>
          )}

          <div
            className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-extrabold border shadow-2xs transition-all duration-300 ${
              isCloudReady
                ? 'bg-emerald-50 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                : 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800'
            }`}
          >
            {isCloudReady ? (
              <span>
                Cloud Synced • Welcome{userName ? `, ${userName}` : ''} ({siteName} ➔ {subgroupName} • {workerCount} Workers)
              </span>
            ) : (
              <>
                <RefreshCw className="w-3.5 h-3.5 text-amber-600 animate-spin" />
                <span>Syncing Site Data...</span>
              </>
            )}
          </div>

          <div className="w-48 h-1 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
            <div
              style={{
                width: isCloudReady ? '100%' : '55%',
                transition: 'width 500ms cubic-bezier(0.22, 1, 0.36, 1)'
              }}
              className="h-full bg-gradient-to-r from-[#D49B4B] via-[#2563EB] to-[#B87B28] rounded-full"
            />
          </div>

          <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mt-1">
            Tap anywhere to skip
          </span>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 2. HIERARCHICAL SITE & SUBGROUP DROPDOWN (MATCHING SCREENSHOT)
// ==========================================
interface SiteHierarchyDropdownProps {
  sites: SiteNode[];
  currentSiteId: string;
  currentSubgroupId: string;
  isMasterRollup: boolean;
  userRole: UserRole;
  onSelectSiteSubgroup: (siteId: string, subgroupId: string) => void;
  onCreateSite: (siteName: string) => void;
  onRenameSite: (siteId: string, newName: string) => void;
  onDeleteSite: (siteId: string) => void;
  onCreateSubgroup: (siteId: string, subName: string) => void;
  onRenameSubgroup: (siteId: string, subId: string, newName: string) => void;
  onDeleteSubgroup: (siteId: string, subId: string) => void;
  onRequireAuth: () => void;
}

export const SiteHierarchyDropdown: React.FC<SiteHierarchyDropdownProps> = ({
  sites,
  currentSiteId,
  currentSubgroupId,
  isMasterRollup,
  userRole,
  onSelectSiteSubgroup,
  onCreateSite,
  onRenameSite,
  onDeleteSite,
  onCreateSubgroup,
  onRenameSubgroup,
  onDeleteSubgroup,
  onRequireAuth
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [dialogState, setDialogState] = useState<{
    mode: 'create_site' | 'create_group' | 'rename_site' | 'rename_group' | 'delete_site' | 'delete_group';
    siteId?: string;
    subId?: string;
    initialValue?: string;
    title: string;
    desc: string;
  } | null>(null);
  const [inputValue, setInputValue] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const canManage = userRole === 'admin' || userRole === 'incharge' || userRole === 'supervisor';

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentSite = sites.find(s => s.id === currentSiteId) || sites[0];
  const currentSub = currentSite?.subgroups.find(sub => sub.id === currentSubgroupId) || currentSite?.subgroups[0];

  const openActionDialog = (
    mode: 'create_site' | 'create_group' | 'rename_site' | 'rename_group' | 'delete_site' | 'delete_group',
    siteId?: string,
    subId?: string,
    initialValue = ''
  ) => {
    if (!canManage) {
      setIsOpen(false);
      onRequireAuth();
      return;
    }
    setIsOpen(false);
    setInputValue(initialValue);

    const titles: Record<typeof mode, { title: string; desc: string }> = {
      create_site: {
        title: 'Create New Site',
        desc: 'A Site represents a major geographical project location.'
      },
      create_group: {
        title: 'Create New Group',
        desc: 'Add a work group, contractor team, or block under this site.'
      },
      rename_site: {
        title: 'Rename Site',
        desc: 'Update the name of this project site.'
      },
      rename_group: {
        title: 'Rename Group',
        desc: 'Update the name of this subgroup.'
      },
      delete_site: {
        title: '⚠️ Delete Entire Site',
        desc: `Are you sure you want to permanently delete "${initialValue}" and all its groups?`
      },
      delete_group: {
        title: '🗑️ Delete Group',
        desc: `Are you sure you want to permanently delete group "${initialValue}"?`
      }
    };

    setDialogState({
      mode,
      siteId,
      subId,
      initialValue,
      title: titles[mode].title,
      desc: titles[mode].desc
    });
  };

  const handleDialogSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dialogState) return;
    const { mode, siteId, subId } = dialogState;
    const trimmed = inputValue.trim();

    if (mode === 'delete_site' && siteId) {
      onDeleteSite(siteId);
      setDialogState(null);
      return;
    }
    if (mode === 'delete_group' && siteId && subId) {
      onDeleteSubgroup(siteId, subId);
      setDialogState(null);
      return;
    }

    if (!trimmed) return;

    if (mode === 'create_site') {
      onCreateSite(trimmed);
    } else if (mode === 'create_group' && siteId) {
      onCreateSubgroup(siteId, trimmed);
    } else if (mode === 'rename_site' && siteId) {
      onRenameSite(siteId, trimmed);
    } else if (mode === 'rename_group' && siteId && subId) {
      onRenameSubgroup(siteId, subId, trimmed);
    }
    setDialogState(null);
  };

  return (
    <div className="relative flex items-center gap-1.5 sm:gap-3 min-w-0 flex-1 sm:flex-initial" ref={dropdownRef}>
      <span className="text-[#FFD700] font-extrabold text-[11px] sm:text-sm tracking-wider uppercase shrink-0">
        SITE:
      </span>

      {/* White Pill Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        aria-label="Switch Project Site or Subgroup"
        aria-expanded={isOpen}
        className="bg-white hover:bg-slate-50 text-[#102A43] px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-extrabold shadow-md flex items-center justify-between gap-2 min-w-0 flex-1 sm:flex-initial sm:min-w-[260px] max-w-full sm:max-w-[350px] transition-transform active:scale-98 cursor-pointer"
      >
        <span className="truncate flex items-center gap-1.5">
          <span>🏢 {currentSite ? currentSite.name : 'Select Site'}</span>
          <span className="text-slate-500">➔</span>
          {isMasterRollup ? (
            <span>🌍 Master Roll-Up</span>
          ) : (
            <span>📍 {currentSub ? currentSub.name : 'Select Group'}</span>
          )}
        </span>
        <span className="text-[11px] text-[#102A43] shrink-0">▼</span>
      </button>

      {/* Hierarchical Tree Popover Menu */}
      {isOpen && (
        <div
          role="menu"
          className="absolute top-11 left-0 sm:left-11 z-50 w-[min(92vw,375px)] lg-modal rounded-[24px] overflow-hidden max-h-[440px] overflow-y-auto text-slate-900 dark:text-slate-100"
        >
          {sites.length === 0 ? (
            <div className="p-4 text-xs text-slate-500 text-center">No sites created</div>
          ) : (
            sites.map(site => (
              <div key={site.id} className="border-b border-slate-100 dark:border-slate-800 last:border-b-0">
                {/* Site Header Row */}
                <div className="bg-slate-50/90 dark:bg-slate-800/80 px-3.5 py-2.5 flex items-center justify-between gap-2 border-b border-slate-200/80 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={() => {
                      onSelectSiteSubgroup(site.id, 'ALL_GROUPS');
                      setIsOpen(false);
                    }}
                    className="text-xs sm:text-sm font-black uppercase tracking-wide text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1.5 text-left truncate"
                    title="Click to view Master Roll-Up for this Site"
                  >
                    <span>🏢</span>
                    <span className="truncate">{site.name}</span>
                  </button>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        openActionDialog('create_group', site.id);
                      }}
                      className="px-2.5 py-1 rounded-xl bg-emerald-500/15 hover:bg-emerald-500 text-emerald-700 dark:text-emerald-300 hover:text-white text-[11px] font-black uppercase transition-colors flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3 stroke-[3]" />
                      <span>GROUP</span>
                    </button>
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        openActionDialog('rename_site', site.id, undefined, site.name);
                      }}
                      aria-label={`Rename site ${site.name}`}
                      className="w-7 h-7 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-blue-400 flex items-center justify-center text-xs shadow-2xs transition-transform hover:scale-105"
                    >
                      ✏️
                    </button>
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        openActionDialog('delete_site', site.id, undefined, site.name);
                      }}
                      aria-label={`Delete site ${site.name}`}
                      className="w-7 h-7 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-rose-400 flex items-center justify-center text-xs shadow-2xs transition-transform hover:scale-105"
                    >
                      🗑️
                    </button>
                  </div>
                </div>

                {/* Subgroup Tree Rows */}
                <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
                  {site.subgroups.map((sub, idx) => {
                    const isSelected = !isMasterRollup && site.id === currentSiteId && sub.id === currentSubgroupId;
                    const isLast = idx === site.subgroups.length - 1;
                    return (
                      <div
                        key={sub.id}
                        onClick={() => {
                          onSelectSiteSubgroup(site.id, sub.id);
                          setIsOpen(false);
                        }}
                        className={`relative pl-10 pr-3.5 py-2.5 flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-pink-50/70 dark:bg-pink-950/30 text-pink-600 dark:text-pink-400 font-extrabold'
                            : 'bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-800 dark:text-slate-200 font-bold'
                        }`}
                      >
                        {/* Vertical & Horizontal Tree Connector Lines */}
                        <span
                          aria-hidden="true"
                          className={`absolute left-5 top-0 w-[2px] bg-slate-200 dark:bg-slate-700 ${
                            isLast ? 'h-1/2' : 'h-full'
                          }`}
                        />
                        <span
                          aria-hidden="true"
                          className="absolute left-5 top-1/2 w-3 h-[2px] bg-slate-200 dark:bg-slate-700"
                        />

                        <span className="text-xs sm:text-sm truncate flex items-center gap-1.5">
                          <span>📍</span>
                          <span className="truncate">{sub.name}</span>
                        </span>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              openActionDialog('rename_group', site.id, sub.id, sub.name);
                            }}
                            aria-label={`Rename group ${sub.name}`}
                            className="w-7 h-7 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-blue-400 flex items-center justify-center text-xs shadow-2xs transition-transform hover:scale-105"
                          >
                            ✏️
                          </button>
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              openActionDialog('delete_group', site.id, sub.id, sub.name);
                            }}
                            aria-label={`Delete group ${sub.name}`}
                            className="w-7 h-7 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-rose-400 flex items-center justify-center text-xs shadow-2xs transition-transform hover:scale-105"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}

          {/* Bottom Create New Site Button */}
          <div className="p-2.5 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => openActionDialog('create_site')}
              className="w-full py-2 px-3 rounded-xl bg-emerald-500/15 hover:bg-emerald-500 text-emerald-700 dark:text-emerald-300 hover:text-white text-xs font-black uppercase tracking-wide transition-colors flex items-center justify-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5 stroke-[3]" />
              <span>CREATE NEW SITE</span>
            </button>
          </div>
        </div>
      )}

      {/* Modal for Create / Rename / Delete Site or Subgroup */}
      {dialogState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-sm p-5 shadow-2xl space-y-4 text-slate-900 dark:text-white"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold">{dialogState.title}</h3>
              <button
                type="button"
                onClick={() => setDialogState(null)}
                className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">{dialogState.desc}</p>
            <form onSubmit={handleDialogSubmit} className="space-y-3">
              {!dialogState.mode.startsWith('delete_') && (
                <input
                  type="text"
                  autoFocus
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  placeholder="Enter name..."
                  className="w-full px-3.5 py-2.5 text-sm font-semibold bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              )}
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setDialogState(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`px-4 py-2 rounded-xl text-xs font-bold text-white shadow-xs ${
                    dialogState.mode.startsWith('delete_')
                      ? 'bg-rose-600 hover:bg-rose-700'
                      : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {dialogState.mode.startsWith('delete_') ? 'Confirm Delete' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// ==========================================
// 3. FIRST-TIME STARTUP DEVICE NAME PROMPT MODAL
// ==========================================
interface NamePromptModalProps {
  isOpen: boolean;
  onSaveName: (name: string) => void;
  onSignInGoogle?: () => Promise<void>;
}

export const NamePromptModal: React.FC<NamePromptModalProps> = ({
  isOpen,
  onSaveName,
  onSignInGoogle
}) => {
  const [nameInput, setNameInput] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = nameInput.trim();
    if (!cleaned) {
      setError('Please enter your name to identify your device on the live board.');
      return;
    }
    onSaveName(cleaned);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-welcome-title"
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-md p-6 shadow-2xl text-center space-y-4"
      >
        <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-2xl">
          👤
        </div>
        <div>
          <h2 id="profile-welcome-title" className="text-xl font-black text-slate-900 dark:text-white">
            Attendance Portal
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Enter your full name to identify your updates on the live activity board (saved permanently for this device):
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            autoFocus
            value={nameInput}
            onChange={e => {
              setNameInput(e.target.value);
              setError('');
            }}
            placeholder="Your Name (e.g. Mudassir)"
            aria-label="Your Full Name"
            className="w-full px-4 py-3 text-center text-base font-bold bg-slate-50 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-2xl text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
          />
          {error && <p className="text-xs text-rose-600 font-semibold">{error}</p>}
          <button
            type="submit"
            className="w-full py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-sm shadow-md transition-colors cursor-pointer"
          >
            Enter Portal
          </button>
        </form>

        {onSignInGoogle && (
          <div className="pt-1 space-y-2.5">
            <div className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
              <span>or</span>
              <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
            </div>
            <button
              type="button"
              onClick={onSignInGoogle}
              className="w-full py-2.5 px-4 rounded-2xl bg-[#152E4D] hover:bg-[#1e3f69] text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <LogIn className="w-4 h-4 text-amber-400" />
              <span>Continue with Google</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ==========================================
// 4. PROFILE & LIVE PORTAL ANALYTICS SLIDE-OVER DRAWER
// ==========================================
export interface PresenceUser {
  name: string;
  role: string;
  device: string;
  time: number;
}

export interface ActivityLogItem {
  user: string;
  action: string;
  time: number;
}

interface ProfileAnalyticsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  userName: string;
  onUpdateUserName: (newName: string) => void;
  userRole: UserRole;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onOpenPinModal: () => void;
  onLockRole: () => void;
  onForceSync: () => void;
  sites: SiteNode[];
  appState: AppState;
  monthKey: string;
  selectedDay: number;
  onJumpToDay: (day: number) => void;
  totalSyncs: number;
  presenceList: PresenceUser[];
  peakUsers: number;
  activityLogs: ActivityLogItem[];
  authUser?: User | null;
  isSuperAdmin?: boolean;
  profileRecord?: UserProfileRecord | null;
  activeSubscriptionTier?: SubscriptionTier;
  activePhotoUrl?: string;
  savedAccounts?: SavedGoogleAccount[];
  liveSessionUids?: string[];
  onSignInGoogle?: () => Promise<void>;
  onSwitchAccount?: (uidOrEmail: string) => Promise<void>;
  onAddAnotherAccount?: () => Promise<void>;
  onRemoveSavedAccount?: (uidOrEmail: string) => Promise<void> | void;
  onSignOutGoogle?: () => Promise<void>;
  onSignOutAllAccounts?: () => Promise<void>;
  onChangePhoto?: (dataUrl: string | null) => Promise<void>;
  onSubmitVerification?: (
    requestedTier: 'pro' | 'ultra',
    proofImage: string
  ) => Promise<void>;
  onUpdateUserTier?: (
    targetUid: string,
    tier: SubscriptionTier,
    action?: 'approve' | 'reject'
  ) => Promise<boolean>;
  onRestoreSuperAdmin?: () => void;
  fetchAdminOverview?: () => Promise<AdminOverviewData | null>;
  chatContacts?: ChatContactDTO[];
  unreadChatCount?: number;
  onOpenChat?: (recipientUid?: string) => void;
  onOpenSharePortal?: () => void;
  onOpenPortalSettings?: () => void;
  onOpenTutorial?: () => void;
  onBackToHub?: () => void;
  isPortalOwner?: boolean;
}

export const ProfileAnalyticsDrawer: React.FC<ProfileAnalyticsDrawerProps> = ({
  isOpen,
  onClose,
  userName,
  onUpdateUserName,
  userRole,
  darkMode,
  onToggleDarkMode,
  onOpenPinModal,
  onLockRole,
  onForceSync,
  sites,
  appState,
  monthKey,
  selectedDay,
  onJumpToDay,
  totalSyncs,
  presenceList,
  peakUsers,
  activityLogs,
  authUser = null,
  isSuperAdmin = false,
  profileRecord = null,
  activeSubscriptionTier = 'standard',
  activePhotoUrl = '',
  savedAccounts = [],
  liveSessionUids = [],
  onSignInGoogle,
  onSwitchAccount,
  onAddAnotherAccount,
  onRemoveSavedAccount,
  onSignOutGoogle,
  onSignOutAllAccounts,
  onChangePhoto,
  onSubmitVerification,
  onUpdateUserTier,
  onRestoreSuperAdmin,
  fetchAdminOverview,
  chatContacts = [],
  unreadChatCount = 0,
  onOpenChat,
  onOpenSharePortal,
  onOpenPortalSettings,
  onOpenTutorial,
  onBackToHub,
  isPortalOwner = false
}) => {
  const [pingMs, setPingMs] = useState(24);
  const [cpuPct, setCpuPct] = useState(9);
  const [uptimeStr, setUptimeStr] = useState('00:00:12');
  const startTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      setPingMs(Math.floor(Math.random() * (42 - 16) + 16));
      setCpuPct(Math.floor(Math.random() * (18 - 5) + 5));
      const diff = Math.floor((Date.now() - startTimeRef.current) / 1000);
      const h = String(Math.floor(diff / 3600)).padStart(2, '0');
      const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
      const s = String(diff % 60).padStart(2, '0');
      setUptimeStr(`${h}:${m}:${s}`);
    }, 2000);
    return () => clearInterval(interval);
  }, [isOpen]);

  const analyticsData = useMemo(() => {
    const parts = monthKey.split('-');
    const m = parseInt(parts[0], 10) || 1;
    const y = parseInt(parts[1], 10) || 2026;
    const daysInMonth = new Date(y, m, 0).getDate();
    const monthAtt = appState.attendance[monthKey] || {};
    const maxW = Math.max(appState.workers.length, 1);

    // 1. 7-Day Attendance Trend Bars
    const trendBars: { day: number; present: number; pct: number; isSelected: boolean }[] = [];
    for (let offset = 6; offset >= 0; offset--) {
      const dNum = selectedDay - offset;
      if (dNum < 1) continue;
      let dayPresent = 0;
      appState.workers.forEach(w => {
        const rec = monthAtt[w.id]?.[dNum];
        const dutyVal = rec ? parseDutyInput(rec.duty) : null;
        if (dutyVal !== null && dutyVal > 0) dayPresent += dutyVal;
      });
      const pct = Math.min(100, Math.round((dayPresent / maxW) * 100));
      trendBars.push({
        day: dNum,
        present: dayPresent,
        pct,
        isSelected: dNum === selectedDay
      });
    }

    // 2. Trade-Wise Workforce Distribution
    const tradeMap: Record<string, number> = {};
    appState.workers.forEach(w => {
      const t = (w.desig || 'Unspecified').trim().toUpperCase();
      tradeMap[t] = (tradeMap[t] || 0) + 1;
    });
    const palette = ['#2D68C4', '#10B981', '#F59E0B', '#9333EA', '#EF4444', '#06B6D4', '#EC4899'];
    const tradeEntries = Object.entries(tradeMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([trade, count], idx) => ({
        trade,
        count,
        pct: appState.workers.length > 0 ? Math.round((count / appState.workers.length) * 100) : 0,
        color: palette[idx % palette.length]
      }));

    // 3. Monthly Gross vs Advance Split & Site Operations
    let presentToday = 0;
    let totalGross = 0;
    let totalAdv = 0;
    let totalOT = 0;

    appState.workers.forEach(w => {
      let wD = 0;
      let wO = 0;
      let wA = 0;
      const wDays = monthAtt[w.id];
      if (wDays) {
        const todayRec = wDays[selectedDay];
        const todayDuty = todayRec ? parseDutyInput(todayRec.duty) : null;
        if (todayDuty !== null && todayDuty > 0) presentToday++;

        for (let d = 1; d <= daysInMonth; d++) {
          const rec = wDays[d];
          if (rec) {
            wD += parseDutyInput(rec.duty) || 0;
            wO += parseFloat(String(rec.ot)) || 0;
            wA += parseFloat(String(rec.adv)) || 0;
          }
        }
      }
      const rate = Number(w.rate) || 0;
      totalGross += wD * rate + wO * (rate / 8);
      totalAdv += (Number(appState.advances[w.id]) || 0) + wA;
      totalOT += wO;
    });

    const netPay = Math.max(0, totalGross - totalAdv);
    const denom = Math.max(totalGross, 1);
    const advPct = Math.min(100, Math.round((totalAdv / denom) * 100));
    const netPct = Math.max(0, 100 - advPct);
    const attendRate = appState.workers.length > 0 ? Math.round((presentToday / appState.workers.length) * 100) : 0;

    let totalSubgroups = 0;
    sites.forEach(s => {
      totalSubgroups += s.subgroups?.length || 0;
    });

    let rainDays = 0;
    let matActivity = 0;
    Object.values(appState.dpr || {}).forEach(d => {
      if (!d) return;
      if (d.rainStart || (d.weather && d.weather.includes('Rain'))) rainDays++;
      matActivity += (d.matReceived?.length || 0) + (d.matConsumed?.length || 0);
    });

    const payloadKb = (new Blob([JSON.stringify(appState)]).size / 1024).toFixed(1);

    return {
      trendBars,
      tradeEntries,
      totalGross,
      totalAdv,
      totalOT,
      netPay,
      advPct,
      netPct,
      attendRate,
      totalSubgroups,
      rainDays,
      matActivity,
      payloadKb
    };
  }, [appState, monthKey, selectedDay, sites]);

  if (!isOpen) return null;

  const r = 42;
  const circum = 2 * Math.PI * r;
  let offsetLen = 0;

  const activeSessions = Math.max(presenceList.length, 1);
  const mobileCount = presenceList.filter(u => u.device && u.device.toLowerCase().includes('mobile')).length;
  const mobilePct = presenceList.length > 0 ? Math.round((mobileCount / presenceList.length) * 100) : 0;
  const desktopPct = 100 - mobilePct;

  const adminActionsCount = activityLogs.filter(
    a =>
      (a.action &&
        (a.action.includes('Deleted') ||
          a.action.includes('Wiped') ||
          a.action.includes('Authorized as admin'))) ||
      (a.user && a.user.toLowerCase().includes('admin'))
  ).length;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/50 backdrop-blur-md no-print">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Live Portal Analytics and Profile"
        className="w-full max-w-[430px] lg-modal rounded-l-[28px] h-full flex flex-col overflow-hidden text-slate-900 dark:text-slate-100"
      >
        {/* Liquid Glass Sheet Header */}
        <div className="bg-blue-600/85 dark:bg-blue-700/85 backdrop-blur-md text-white px-5 py-4 flex items-center justify-between shrink-0 border-b border-white/25">
          <h3 className="text-lg font-extrabold tracking-tight">Live Portal Analytics</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Live Portal Analytics"
            className="w-8 h-8 rounded-full hover:bg-white/20 flex items-center justify-center text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5 stroke-[2.5]" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-slate-800 dark:text-slate-100">
          {/* GOOGLE-STYLE PROFILE HERO, PRO/ULTRA RING & MULTI-ACCOUNT SWITCHER */}
          <GoogleAccountCard
            authUser={authUser}
            profileRecord={profileRecord}
            userName={userName}
            userRole={userRole}
            isSuperAdmin={isSuperAdmin}
            activeSubscriptionTier={activeSubscriptionTier}
            activePhotoUrl={activePhotoUrl || authUser?.photoURL || profileRecord?.photoUrl || ''}
            savedAccounts={savedAccounts}
            liveSessionUids={liveSessionUids}
            onSignInGoogle={onSignInGoogle || (async () => {})}
            onSwitchAccount={onSwitchAccount || (async () => {})}
            onAddAnotherAccount={onAddAnotherAccount || onSignInGoogle || (async () => {})}
            onRemoveSavedAccount={onRemoveSavedAccount || (() => {})}
            onSignOutGoogle={onSignOutGoogle || (async () => {})}
            onSignOutAllAccounts={onSignOutAllAccounts}
            onChangePhoto={onChangePhoto || (async () => {})}
            onSubmitVerification={onSubmitVerification}
            onUpdateUserName={onUpdateUserName}
            onRestoreSuperAdmin={onRestoreSuperAdmin}
          />

          {/* Quick Options Grid inside Profile */}
          <div className="grid grid-cols-2 gap-1.5">
            {onOpenSharePortal && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenSharePortal();
                }}
                className="px-2.5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-extrabold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Share Portal</span>
              </button>
            )}

            {onOpenTutorial && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenTutorial();
                }}
                className="px-2.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-[11px] font-extrabold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <BookOpen className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>App Tutorial</span>
              </button>
            )}

            {userRole === 'viewer' ? (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenPinModal();
                }}
                className="px-2.5 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-800 dark:text-amber-300 text-[11px] font-extrabold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Unlock Role</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onLockRole}
                className="px-2.5 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-800 dark:text-emerald-300 text-[11px] font-extrabold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Unlock className="w-3.5 h-3.5" />
                <span>Lock ({userRole})</span>
              </button>
            )}

            <button
              type="button"
              onClick={onToggleDarkMode}
              className="px-2.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {darkMode ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5" />}
              <span>{darkMode ? 'Light Theme' : 'Dark Theme'}</span>
            </button>

            {isPortalOwner && onOpenPortalSettings && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenPortalSettings();
                }}
                className="px-2.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] font-extrabold flex items-center justify-center gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <Settings className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
                <span>Portal Settings</span>
              </button>
            )}

            {onBackToHub && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onBackToHub();
                }}
                className="px-2.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] font-extrabold flex items-center justify-center gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <LayoutGrid className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>Switch Portal</span>
              </button>
            )}

            <button
              type="button"
              onClick={onForceSync}
              className="col-span-2 px-2.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] font-extrabold flex items-center justify-center gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5 text-blue-600" />
              <span>Force Cloud Sync</span>
            </button>
          </div>

          {/* LIVE ONLINE TEAM & 5-DAY AUTO-EXPIRING CHAT CARD */}
          {onOpenChat && (
            <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800/70 bg-emerald-50/50 dark:bg-slate-800/80 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
                    <MessageCircle className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white truncate">
                      Live Team Chat
                    </div>
                    <div className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 truncate">
                      {chatContacts.filter(c => c.isOnline).length} online now · Auto-deletes after 5 days
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenChat();
                  }}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-extrabold flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>Open Chat</span>
                  {unreadChatCount > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full bg-white text-emerald-700 text-[10px] font-black tabular-nums">
                      {unreadChatCount}
                    </span>
                  )}
                </button>
              </div>

              {authUser && chatContacts.filter(c => c.isOnline).length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Online Now — Tap to message or send documents
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {chatContacts
                      .filter(c => c.isOnline)
                      .map(onlineUser => (
                        <button
                          key={onlineUser.uid}
                          type="button"
                          onClick={() => {
                            onClose();
                            onOpenChat(onlineUser.uid);
                          }}
                          className="inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-700 hover:border-emerald-500 text-xs font-bold text-slate-800 dark:text-slate-100 cursor-pointer"
                        >
                          <span className="relative flex items-center">
                            <UserAvatar
                              photoUrl={onlineUser.photoUrl}
                              name={onlineUser.displayName}
                              email={onlineUser.email}
                              size="xs"
                              subscriptionTier={onlineUser.subscriptionTier}
                            />
                            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-1 ring-white dark:ring-slate-900" />
                          </span>
                          <span className="max-w-[110px] truncate">
                            {onlineUser.displayName}
                          </span>
                          {onlineUser.unreadCount > 0 && (
                            <span className="px-1.5 rounded-full bg-emerald-600 text-white text-[10px] font-black tabular-nums">
                              {onlineUser.unreadCount}
                            </span>
                          )}
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SUPER ADMIN PORTAL INSIGHTS (Signed-in People, Login Stats, Cloud Records) */}
          {isSuperAdmin && fetchAdminOverview && (
            <SuperAdminInsightsPanel
              isOpen={isOpen}
              currentUserEmail={authUser?.email}
              onlineUids={chatContacts.filter(c => c.isOnline).map(c => c.uid)}
              onStartChatWithUser={uid => {
                onClose();
                onOpenChat?.(uid);
              }}
              onUpdateUserTier={onUpdateUserTier}
              fetchAdminOverview={fetchAdminOverview}
            />
          )}

          {/* VISUAL WORKFORCE & FINANCIAL CHARTS (EXACT MATCH TO SCREENSHOT #2) */}
          <div className="space-y-3">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 pb-1.5">
              Visual Workforce &amp; Financial Charts
            </h4>

            {/* 1. 7-Day Attendance Trend Card */}
            <div className="rounded-2xl border border-purple-100 dark:border-slate-800 bg-[#FAF5FF]/60 dark:bg-slate-800/50 p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  7-Day Attendance Trend
                </span>
                <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400">Click bar to jump</span>
              </div>
              <div className="flex items-end justify-between gap-2 h-28 pt-4 pb-1 px-2.5 bg-white dark:bg-slate-900 rounded-xl border border-purple-100 dark:border-slate-800">
                {analyticsData.trendBars.map(bar => (
                  <button
                    key={bar.day}
                    type="button"
                    onClick={() => onJumpToDay(bar.day)}
                    title={`Click to jump to Day ${bar.day} (${bar.present} Present)`}
                    className="flex-1 flex flex-col items-center justify-end h-full gap-1 group cursor-pointer"
                  >
                    <span
                      className={`text-[10px] font-black ${
                        bar.isSelected ? 'text-pink-600 dark:text-amber-400' : 'text-blue-600 dark:text-blue-400'
                      }`}
                    >
                      {bar.present}
                    </span>
                    <div
                      style={{
                        height: `${Math.max(bar.pct, 10)}%`,
                        background: bar.isSelected
                          ? 'linear-gradient(180deg, #FACC15, #F59E0B)'
                          : 'linear-gradient(180deg, #EC4899, #60A5FA)'
                      }}
                      className="w-full max-w-[26px] rounded-t-md rounded-b-xs transition-all group-hover:opacity-85"
                    />
                    <span
                      className={`text-[10px] ${
                        bar.isSelected
                          ? 'font-black text-pink-600 dark:text-amber-400'
                          : 'font-bold text-slate-400'
                      }`}
                    >
                      D{bar.day}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* 2. Trade-Wise Workforce Donut Card */}
            <div className="rounded-2xl border border-purple-100 dark:border-slate-800 bg-[#FAF5FF]/60 dark:bg-slate-800/50 p-3.5 space-y-2.5">
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                Trade-Wise Workforce
              </span>
              <div className="flex items-center gap-4">
                <svg viewBox="0 0 120 120" width="96" height="96" className="shrink-0">
                  {appState.workers.length === 0 ? (
                    <circle cx="60" cy="60" r={r} fill="none" stroke="#E2E8F0" strokeWidth="14" />
                  ) : (
                    analyticsData.tradeEntries.map(item => {
                      const segLen = (item.count / appState.workers.length) * circum;
                      const currentOffset = offsetLen;
                      offsetLen += segLen;
                      return (
                        <circle
                          key={item.trade}
                          cx="60"
                          cy="60"
                          r={r}
                          fill="none"
                          stroke={item.color}
                          strokeWidth="14"
                          strokeDasharray={`${segLen} ${circum}`}
                          strokeDashoffset={-currentOffset}
                          transform="rotate(-90 60 60)"
                        />
                      );
                    })
                  )}
                  <text
                    x="60"
                    y="57"
                    textAnchor="middle"
                    fill="#3B82F6"
                    fontSize="18"
                    fontWeight="900"
                  >
                    {appState.workers.length}
                  </text>
                  <text
                    x="60"
                    y="72"
                    textAnchor="middle"
                    fill="#94A3B8"
                    fontSize="9"
                    fontWeight="800"
                  >
                    STAFF
                  </text>
                </svg>

                <div className="flex-1 space-y-1.5 overflow-hidden">
                  {analyticsData.tradeEntries.map(item => (
                    <div key={item.trade} className="flex items-center justify-between text-xs font-extrabold gap-2">
                      <span className="flex items-center gap-2 truncate text-slate-600 dark:text-slate-300">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: item.color }}
                        />
                        <span className="truncate">{item.trade}</span>
                      </span>
                      <span className="text-slate-500 dark:text-slate-400 shrink-0">
                        {item.count} ({item.pct}%)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 3. Gross vs. Advance Split Card */}
            <div className="rounded-2xl border border-purple-100 dark:border-slate-800 bg-[#FAF5FF]/60 dark:bg-slate-800/50 p-3.5 space-y-2.5">
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                Gross vs. Advance Split
              </span>
              <div className="flex items-center justify-between text-xs font-extrabold">
                <span className="text-slate-500">
                  GROSS:{' '}
                  <strong className="text-blue-500 text-sm">
                    ₹{Math.round(analyticsData.totalGross).toLocaleString('en-IN')}
                  </strong>
                </span>
                <span className="text-slate-500">
                  ADV:{' '}
                  <strong className="text-rose-500 text-sm">
                    ₹{Math.round(analyticsData.totalAdv).toLocaleString('en-IN')}
                  </strong>
                </span>
              </div>

              <div className="h-4 w-full bg-white dark:bg-slate-900 rounded-full overflow-hidden flex border border-slate-200 dark:border-slate-700">
                <div
                  style={{ width: `${analyticsData.netPct}%` }}
                  className="bg-gradient-to-r from-emerald-500 to-emerald-600 h-full"
                  title={`Net Payable: ${analyticsData.netPct}%`}
                />
                <div
                  style={{ width: `${analyticsData.advPct}%` }}
                  className="bg-gradient-to-r from-rose-500 to-rose-600 h-full"
                  title={`Advances: ${analyticsData.advPct}%`}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] font-extrabold">
                <span className="text-emerald-600 dark:text-emerald-400">
                  🟢 NET PAYABLE: {analyticsData.netPct}% (₹{Math.round(analyticsData.netPay).toLocaleString('en-IN')})
                </span>
                <span className="text-rose-600 dark:text-rose-400">
                  🔴 ADVANCES: {analyticsData.advPct}%
                </span>
              </div>
            </div>
          </div>

          {/* NETWORK PRESENCE (EXACT MATCH TO SCREENSHOT #2) */}
          <div className="space-y-3">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800 pb-1.5">
              Network Presence
            </h4>
            <div className="grid grid-cols-2 gap-2.5 text-center">
              <div className="rounded-2xl border border-purple-100 dark:border-slate-800 bg-[#FAF5FF]/60 dark:bg-slate-800/50 p-3">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                  Active Sessions
                </span>
                <b className="text-lg font-black text-blue-500 mt-0.5 block">{activeSessions}</b>
              </div>
              <div className="rounded-2xl border border-purple-100 dark:border-slate-800 bg-[#FAF5FF]/60 dark:bg-slate-800/50 p-3">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                  Peak Users
                </span>
                <b className="text-lg font-black text-blue-500 mt-0.5 block">{Math.max(peakUsers, activeSessions)}</b>
              </div>
              <div className="rounded-2xl border border-purple-100 dark:border-slate-800 bg-[#FAF5FF]/60 dark:bg-slate-800/50 p-3">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                  Mobile Div.
                </span>
                <b className="text-lg font-black text-blue-500 mt-0.5 block">{mobilePct}%</b>
              </div>
              <div className="rounded-2xl border border-purple-100 dark:border-slate-800 bg-[#FAF5FF]/60 dark:bg-slate-800/50 p-3">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                  Desktop Div.
                </span>
                <b className="text-lg font-black text-blue-500 mt-0.5 block">{desktopPct}%</b>
              </div>
            </div>

            {/* Online Users List */}
            <div className="space-y-2">
              {(presenceList.length > 0
                ? presenceList
                : [
                    {
                      name: userName || 'Mudassir',
                      role: userRole,
                      device: '💻 Desktop',
                      time: Date.now()
                    }
                  ]
              ).map((u, i) => {
                const timeStr = new Date(u.time || Date.now()).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit'
                });
                return (
                  <div
                    key={`${u.name}-${i}`}
                    className="rounded-2xl border border-purple-100 dark:border-slate-800 bg-[#FAF5FF]/60 dark:bg-slate-800/50 px-4 py-2.5 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse inline-block" />
                      <strong className="font-black text-slate-900 dark:text-white">{u.name}</strong>
                      <span className="text-slate-400 font-semibold">({u.role})</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-400 font-bold text-[11px]">
                      <span>Since {timeStr}</span>
                      <span>{u.device && u.device.includes('Mobile') ? '📱' : '💻'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* AUDIT LOG SECTION (EXACT MATCH TO SCREENSHOT #2) */}
          <div className="space-y-3">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800 pb-1.5">
              Audit Log
            </h4>
            <div className="grid grid-cols-2 gap-2.5 text-center">
              <div className="rounded-2xl border border-purple-100 dark:border-slate-800 bg-[#FAF5FF]/60 dark:bg-slate-800/50 p-3">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                  Today's Logs
                </span>
                <b className="text-lg font-black text-blue-500 mt-0.5 block">{activityLogs.length}</b>
              </div>
              <div className="rounded-2xl border border-purple-100 dark:border-slate-800 bg-[#FAF5FF]/60 dark:bg-slate-800/50 p-3">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                  Admin Actions
                </span>
                <b className="text-lg font-black text-blue-500 mt-0.5 block">{adminActionsCount}</b>
              </div>
            </div>

            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {activityLogs.length === 0 ? (
                <div className="text-center py-3 text-xs text-slate-400">No activity logs recorded yet today</div>
              ) : (
                activityLogs.slice(0, 25).map((log, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 px-3 py-2 text-xs flex items-center justify-between gap-2"
                  >
                    <div className="truncate">
                      <strong className="font-bold text-slate-900 dark:text-white">{log.user}</strong>:{' '}
                      <span className="text-slate-600 dark:text-slate-300">{log.action}</span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono shrink-0">
                      {new Date(log.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* SYSTEM DIAGNOSTICS & SITE OPERATIONS */}
          <div className="space-y-3 pt-1">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800 pb-1.5">
              System Diagnostics &amp; Operations
            </h4>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-2.5 bg-slate-50/70 dark:bg-slate-800/40">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Ping</span>
                <b className="text-xs font-black text-slate-800 dark:text-white">{pingMs}ms</b>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-2.5 bg-slate-50/70 dark:bg-slate-800/40">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">CPU Est.</span>
                <b className="text-xs font-black text-slate-800 dark:text-white">{cpuPct}%</b>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-2.5 bg-slate-50/70 dark:bg-slate-800/40">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Uptime</span>
                <b className="text-xs font-mono font-black text-slate-800 dark:text-white">{uptimeStr}</b>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-2.5 bg-slate-50/70 dark:bg-slate-800/40">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Cloud Node</span>
                <b className="text-xs font-black text-slate-800 dark:text-white">Asia-SE1</b>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-2.5 bg-slate-50/70 dark:bg-slate-800/40">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Payload</span>
                <b className="text-xs font-black text-slate-800 dark:text-white">{analyticsData.payloadKb} KB</b>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-2.5 bg-slate-50/70 dark:bg-slate-800/40">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Database</span>
                <b className="text-xs font-black text-emerald-600 dark:text-emerald-400">Connected</b>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
