import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  Plus,
  ArrowRight,
  Share2,
  Settings,
  Trash2,
  BookOpen,
  LogOut,
  Users,
  Database,
  Mail,
  Loader2,
  AlertTriangle,
  RefreshCw
} from 'lucide-react';
import type { AttendancePortalRecord } from '../utils/portalLogic';
import {
  SPRING_TACTILE,
  SPRING_CONTAINER,
  formatFirestoreErrorMessage,
  type GlassAppearanceMode,
  type WallpaperPresetId
} from '../utils/glassPhysics';
import { CompanyBrandMark } from './CompanyBrandMark';
import { UserAvatar } from './UserAvatar';
import { PWAInstallButton } from './PwaAndOfflineBar';
import {
  GlassCard,
  GlassAppearanceToggle,
  handleGlassPointerMove,
  useScrollHeader
} from './LiquidGlass';

interface PortalHubScreenProps {
  userName: string;
  userEmail: string;
  userPhotoUrl?: string;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  glassMode: GlassAppearanceMode;
  onToggleGlassMode: () => void;
  wallpaperId?: WallpaperPresetId;
  onSelectWallpaper?: (id: WallpaperPresetId) => void;
  customWallpaperUrl?: string | null;
  onUploadCustomWallpaper?: (dataUrl: string) => void;
  ownedPortals: AttendancePortalRecord[];
  sharedPortals: AttendancePortalRecord[];
  loadingPortals: boolean;
  portalsError?: string | null;
  onRetrySync?: () => void;
  onCreatePortal: () => void;
  onOpenPortal: (portal: AttendancePortalRecord) => void;
  onSharePortal: (portal: AttendancePortalRecord) => void;
  onEditPortal: (portal: AttendancePortalRecord) => void;
  onDeletePortal: (portal: AttendancePortalRecord) => Promise<void>;
  onOpenTutorial: () => void;
  onSignOut: () => Promise<void>;
}

export const PortalHubScreen: React.FC<PortalHubScreenProps> = ({
  userName,
  userEmail,
  userPhotoUrl,
  darkMode,
  onToggleDarkMode,
  glassMode,
  onToggleGlassMode,
  wallpaperId = 'liquid_wave',
  onSelectWallpaper,
  customWallpaperUrl = null,
  onUploadCustomWallpaper,
  ownedPortals,
  sharedPortals,
  loadingPortals,
  portalsError,
  onRetrySync,
  onCreatePortal,
  onOpenPortal,
  onSharePortal,
  onEditPortal,
  onDeletePortal,
  onOpenTutorial,
  onSignOut
}) => {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { isScrolled } = useScrollHeader();

  const handleConfirmDelete = async (portal: AttendancePortalRecord) => {
    setDeletingId(portal.id);
    try {
      await onDeletePortal(portal);
      setConfirmDeleteId(null);
    } finally {
      setDeletingId(null);
    }
  };

  const friendlyError = portalsError ? formatFirestoreErrorMessage(portalsError) : null;

  return (
    <div className="min-h-screen text-slate-900 dark:text-slate-100 pb-14">
      {/* Detached Floating Crystal-Clear Liquid Glass Pill Top Navigation Bar */}
      <header
        className={`sticky top-0 z-30 px-3 sm:px-6 transition-all duration-300 ${
          isScrolled ? 'pt-2 pb-1' : 'pt-3.5 sm:pt-5 pb-2'
        }`}
      >
        <div
          onPointerMove={handleGlassPointerMove}
          className={`max-w-6xl mx-auto lg-pill lg-surface-sheen px-3.5 sm:px-5 flex items-center justify-between gap-2 sm:gap-3 transition-all duration-300 ${
            isScrolled ? 'h-13 sm:h-14' : 'h-14 sm:h-16'
          }`}
        >
          <CompanyBrandMark
            companyName="Attendance Portal"
            size="sm"
            idSuffix="hub_nav"
          />

          <div className="flex items-center gap-1.5 sm:gap-2">
            <PWAInstallButton />

            <motion.button
              type="button"
              whileTap={{ scale: 0.95 }}
              transition={SPRING_TACTILE}
              onClick={onOpenTutorial}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-slate-900 dark:text-white bg-white/40 dark:bg-white/12 hover:bg-white/60 dark:hover:bg-white/20 border border-white/65 dark:border-white/20 transition-colors cursor-pointer shrink-0"
            >
              <BookOpen className="w-3.5 h-3.5 text-blue-700 dark:text-sky-300" />
              <span className="hidden sm:inline">App Guide</span>
            </motion.button>

            <GlassAppearanceToggle
              darkMode={darkMode}
              onToggleDarkMode={onToggleDarkMode}
              glassMode={glassMode}
              onToggleGlassMode={onToggleGlassMode}
              wallpaperId={wallpaperId}
              onSelectWallpaper={onSelectWallpaper}
              customWallpaperUrl={customWallpaperUrl}
              onUploadCustomWallpaper={onUploadCustomWallpaper}
              compact
              idPrefix="hub_header"
            />

            <div className="hidden md:flex items-center gap-2.5 pl-2.5 border-l border-slate-900/15 dark:border-white/15">
              <UserAvatar
                photoUrl={userPhotoUrl}
                name={userName}
                email={userEmail}
                size="xs"
                highlight="blue"
              />
              <div className="min-w-0 max-w-[160px]">
                <div className="text-xs font-extrabold text-slate-950 dark:text-white truncate lg-glass-text-halo">
                  {userName || userEmail.split('@')[0]}
                </div>
                <div className="text-[11px] font-medium text-slate-800 dark:text-slate-200 truncate">
                  {userEmail}
                </div>
              </div>
            </div>

            <motion.button
              type="button"
              whileTap={{ scale: 0.95 }}
              transition={SPRING_TACTILE}
              onClick={onSignOut}
              title="Sign out of Google account"
              aria-label="Sign out"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-slate-900 dark:text-slate-100 hover:text-rose-700 dark:hover:text-rose-300 bg-white/35 dark:bg-white/10 hover:bg-rose-500/20 border border-white/55 dark:border-white/18 transition-colors cursor-pointer shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Sign Out</span>
            </motion.button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-5 sm:pt-8 space-y-9">
        {/* Welcome & Floating Liquid Glass Primary CTA */}
        <section className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="space-y-1.5">
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white lg-hero-text">
              Portal Hub
            </h1>
            <p className="text-sm text-white/95 dark:text-slate-200 font-medium lg-hero-text">
              Signed in as <span className="font-bold text-white">{userEmail}</span>. Open one of your portals or create a new workspace.
            </p>
          </div>

          <motion.button
            type="button"
            onClick={onCreatePortal}
            onPointerMove={handleGlassPointerMove}
            whileHover={{ scale: 1.025, y: -1 }}
            whileTap={{ scale: 0.96 }}
            transition={SPRING_TACTILE}
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full lg-btn-glass lg-surface-sheen text-slate-950 dark:text-white text-sm font-extrabold cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4 stroke-[2.6]" />
            <span>Create an Attendance Portal</span>
          </motion.button>
        </section>

        {/* Clean, Human-Readable Cloud Sync Error Banner (No Raw JSON Dump) */}
        {friendlyError && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={SPRING_CONTAINER}
            role="alert"
            className="lg-surface rounded-[22px] p-4 border border-amber-300/70 dark:border-amber-500/40 bg-amber-100/75 dark:bg-amber-950/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-950 dark:text-amber-100"
          >
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700 dark:text-amber-300" />
              <div>
                <strong className="font-bold">Could not sync portal list:</strong>{' '}
                <span>{friendlyError}</span>
              </div>
            </div>
            {onRetrySync && (
              <motion.button
                type="button"
                whileTap={{ scale: 0.95 }}
                transition={SPRING_TACTILE}
                onClick={onRetrySync}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-full bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shrink-0 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry Sync</span>
              </motion.button>
            )}
          </motion.div>
        )}

        {/* SECTION 1: YOUR ATTENDANCE PORTALS + CREATE PORTAL */}
        <section aria-labelledby="owned-portals-heading" className="space-y-4">
          <div className="flex items-end justify-between border-b border-white/35 dark:border-white/15 pb-3">
            <div>
              <h2
                id="owned-portals-heading"
                className="text-lg font-extrabold text-white lg-hero-text"
              >
                Your Attendance Portals
              </h2>
              <p className="text-xs text-white/90 dark:text-slate-300 mt-0.5 lg-hero-text">
                Portals created and owned by your account
              </p>
            </div>
            <span className="px-3 py-1 rounded-full lg-pill text-xs font-mono font-bold text-slate-900 dark:text-white tabular-nums">
              {ownedPortals.length} {ownedPortals.length === 1 ? 'portal' : 'portals'}
            </span>
          </div>

          {loadingPortals ? (
            <GlassCard className="p-10 flex items-center justify-center gap-2.5 text-sm font-semibold text-slate-800 dark:text-slate-200">
              <Loader2 className="w-4 h-4 animate-spin text-blue-600 dark:text-sky-400" />
              <span>Loading your portals...</span>
            </GlassCard>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {ownedPortals.map(portal => {
                const isConfirmingDelete = confirmDeleteId === portal.id;
                const isDeleting = deletingId === portal.id;

                return (
                  <GlassCard
                    key={portal.id}
                    interactive
                    elevated
                    className="rounded-[26px] p-5 flex flex-col justify-between gap-4"
                  >
                    <div className="space-y-3.5">
                      <CompanyBrandMark
                        companyName={portal.companyName}
                        companyLogo={portal.companyLogo}
                        companySubtitle={portal.companySubtitle}
                        showSubtitle
                        allowWrap
                        size="md"
                        idSuffix={`own_${portal.id}`}
                      />

                      <div className="pt-3 border-t border-slate-900/10 dark:border-white/12 space-y-1.5 text-xs text-slate-700 dark:text-slate-300 font-medium">
                        <div className="flex items-center gap-2">
                          <Database className="w-3.5 h-3.5 text-blue-700 dark:text-sky-300 shrink-0" />
                          <span className="font-mono truncate" title={portal.rtdbUrl}>
                            {portal.rtdbProjectId || 'Realtime DB Linked'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Users className="w-3.5 h-3.5 text-blue-700 dark:text-sky-300 shrink-0" />
                          <span className="tabular-nums">
                            {portal.sharedWithEmails.length === 0
                              ? 'Private (not shared yet)'
                              : `Shared with ${portal.sharedWithEmails.length} ${
                                  portal.sharedWithEmails.length === 1 ? 'person' : 'people'
                                }`}
                          </span>
                        </div>
                      </div>
                    </div>

                    {isConfirmingDelete ? (
                      <div className="p-3.5 rounded-2xl bg-rose-500/15 dark:bg-rose-950/60 border border-rose-400/40 space-y-2.5">
                        <p className="text-xs text-rose-900 dark:text-rose-200 font-semibold">
                          Remove this portal from your hub? Your Firebase Realtime Database data itself is not deleted.
                        </p>
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            disabled={isDeleting}
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-3 py-1.5 rounded-full text-xs font-bold text-slate-700 dark:text-slate-200 bg-white/60 dark:bg-white/10 hover:bg-white/80 cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={isDeleting}
                            onClick={() => handleConfirmDelete(portal)}
                            className="px-3.5 py-1.5 rounded-full text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white cursor-pointer disabled:opacity-60"
                          >
                            {isDeleting ? 'Removing...' : 'Confirm Remove'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-2 pt-1">
                        <motion.button
                          type="button"
                          whileTap={{ scale: 0.96 }}
                          transition={SPRING_TACTILE}
                          onClick={() => onOpenPortal(portal)}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full lg-btn-primary text-white text-xs font-bold transition-all cursor-pointer"
                        >
                          <span>Open Portal</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </motion.button>

                        <motion.button
                          type="button"
                          whileTap={{ scale: 0.92 }}
                          transition={SPRING_TACTILE}
                          onClick={() => onSharePortal(portal)}
                          title="Share portal via email"
                          aria-label={`Share ${portal.companyName}`}
                          className="w-9 h-9 rounded-full bg-white/55 dark:bg-white/10 hover:bg-white/80 dark:hover:bg-white/20 border border-white/65 dark:border-white/18 text-slate-800 dark:text-slate-100 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                        >
                          <Share2 className="w-4 h-4" />
                        </motion.button>

                        <motion.button
                          type="button"
                          whileTap={{ scale: 0.92 }}
                          transition={SPRING_TACTILE}
                          onClick={() => onEditPortal(portal)}
                          title="Edit company branding, passwords, or Firebase URL"
                          aria-label={`Edit settings for ${portal.companyName}`}
                          className="w-9 h-9 rounded-full bg-white/55 dark:bg-white/10 hover:bg-white/80 dark:hover:bg-white/20 border border-white/65 dark:border-white/18 text-slate-800 dark:text-slate-100 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                        >
                          <Settings className="w-4 h-4" />
                        </motion.button>

                        <motion.button
                          type="button"
                          whileTap={{ scale: 0.92 }}
                          transition={SPRING_TACTILE}
                          onClick={() => setConfirmDeleteId(portal.id)}
                          title="Remove portal"
                          aria-label={`Remove ${portal.companyName}`}
                          className="w-9 h-9 rounded-full bg-white/45 dark:bg-white/10 hover:bg-rose-500/20 border border-white/60 dark:border-white/15 text-slate-600 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-300 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </motion.button>
                      </div>
                    )}
                  </GlassCard>
                );
              })}

              {/* Dashed Frosted Liquid Glass Create Portal Card (Matches User Mockup) */}
              <motion.button
                type="button"
                onClick={onCreatePortal}
                onPointerMove={handleGlassPointerMove}
                whileHover={{ y: -2, scale: 1.01 }}
                whileTap={{ scale: 0.97 }}
                transition={SPRING_TACTILE}
                className="min-h-[200px] rounded-[26px] lg-surface lg-surface-sheen border-2 border-dashed border-white/75 dark:border-white/28 p-6 flex flex-col items-center justify-center text-center gap-3 cursor-pointer group"
              >
                <div className="relative z-10 w-12 h-12 rounded-2xl bg-white/65 dark:bg-white/14 group-hover:bg-blue-600 group-hover:text-white text-slate-800 dark:text-white border border-white/75 dark:border-white/22 shadow-sm flex items-center justify-center transition-colors">
                  <Plus className="w-5 h-5 stroke-[2.4]" />
                </div>
                <div className="relative z-10 space-y-1">
                  <div className="text-sm font-extrabold text-slate-900 dark:text-white">
                    Create an Attendance Portal
                  </div>
                  <p className="text-xs text-slate-700 dark:text-slate-300 max-w-[240px] leading-relaxed font-medium">
                    Add your company logo &amp; name, set role passwords, and link Firebase without touching code.
                  </p>
                </div>
              </motion.button>
            </div>
          )}
        </section>

        {/* SECTION 2: SHARED ATTENDANCE PORTALS */}
        <section aria-labelledby="shared-portals-heading" className="space-y-4">
          <div className="flex items-end justify-between border-b border-white/35 dark:border-white/15 pb-3">
            <div>
              <h2
                id="shared-portals-heading"
                className="text-lg font-extrabold text-white lg-hero-text"
              >
                Shared Attendance Portals
              </h2>
              <p className="text-xs text-white/90 dark:text-slate-300 mt-0.5 lg-hero-text">
                Portals shared by other users with{' '}
                <span className="font-mono font-bold text-white">{userEmail}</span>
              </p>
            </div>
            <span className="px-3 py-1 rounded-full lg-pill text-xs font-mono font-bold text-slate-900 dark:text-white tabular-nums">
              {sharedPortals.length} shared
            </span>
          </div>

          {loadingPortals ? (
            <GlassCard className="p-6 text-xs font-semibold text-slate-800 dark:text-slate-200">
              Checking portals shared with your email...
            </GlassCard>
          ) : sharedPortals.length === 0 ? (
            <GlassCard className="rounded-[26px] p-9 text-center">
              <div className="space-y-2.5">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-white/55 dark:bg-white/12 border border-white/70 dark:border-white/20 flex items-center justify-center text-slate-800 dark:text-sky-200 shadow-xs">
                  <Mail className="w-5 h-5" />
                </div>
                <div className="text-sm font-extrabold text-slate-900 dark:text-white">
                  No Shared Attendance Portals Yet
                </div>
                <p className="text-xs text-slate-700 dark:text-slate-300 max-w-md mx-auto leading-relaxed font-medium">
                  When another portal owner shares their workspace with{' '}
                  <span className="font-mono font-bold text-slate-900 dark:text-white">{userEmail}</span> via{' '}
                  <strong>Profile &rarr; Share</strong>, their portal will automatically appear here with their company logo and name.
                </p>
              </div>
            </GlassCard>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {sharedPortals.map(portal => (
                <GlassCard
                  key={portal.id}
                  interactive
                  elevated
                  className="rounded-[26px] p-5 flex flex-col justify-between gap-4"
                >
                  <div className="space-y-3.5">
                    <CompanyBrandMark
                      companyName={portal.companyName}
                      companyLogo={portal.companyLogo}
                      companySubtitle={portal.companySubtitle}
                      showSubtitle
                      allowWrap
                      size="md"
                      idSuffix={`shr_${portal.id}`}
                    />

                    <div className="pt-3 border-t border-slate-900/10 dark:border-white/12 space-y-1.5 text-xs text-slate-700 dark:text-slate-300 font-medium">
                      <div className="flex items-center gap-2">
                        <Mail className="w-3.5 h-3.5 text-blue-700 dark:text-sky-300 shrink-0" />
                        <span className="truncate" title={portal.ownerEmail}>
                          Shared by <strong className="font-bold text-slate-900 dark:text-white">{portal.ownerEmail}</strong>
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Database className="w-3.5 h-3.5 text-blue-700 dark:text-sky-300 shrink-0" />
                        <span className="font-mono truncate">{portal.rtdbProjectId || 'Realtime DB Linked'}</span>
                      </div>
                    </div>
                  </div>

                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.96 }}
                    transition={SPRING_TACTILE}
                    onClick={() => onOpenPortal(portal)}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full lg-btn-primary text-white text-xs font-bold transition-all cursor-pointer"
                  >
                    <span>Open Shared Portal</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </motion.button>
                </GlassCard>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};
