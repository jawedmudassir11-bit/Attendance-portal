import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Loader2, AlertCircle } from 'lucide-react';
import {
  GlassCard,
  GlassAppearanceToggle,
  handleGlassPointerMove
} from './LiquidGlass';
import { PWAInstallButton } from './PwaAndOfflineBar';
import {
  SPRING_SHEET,
  SPRING_TACTILE,
  type GlassAppearanceMode,
  type WallpaperPresetId
} from '../utils/glassPhysics';

interface StartAuthScreenProps {
  onSignInWithGoogle: () => Promise<void>;
  isAuthLoading?: boolean;
  darkMode?: boolean;
  onToggleDarkMode?: () => void;
  glassMode?: GlassAppearanceMode;
  onToggleGlassMode?: () => void;
  wallpaperId?: WallpaperPresetId;
  onSelectWallpaper?: (id: WallpaperPresetId) => void;
  customWallpaperUrl?: string | null;
  onUploadCustomWallpaper?: (dataUrl: string) => void;
}

/**
 * Crystal-clear optical Liquid Glass login screen over the switchable wallpaper canvas,
 * featuring real SVG perimeter refraction, spherical crystal glass brand orb,
 * wallpaper switcher, PWA install button, and Google Sign-In flow.
 */
export const StartAuthScreen: React.FC<StartAuthScreenProps> = ({
  onSignInWithGoogle,
  isAuthLoading = false,
  darkMode = false,
  onToggleDarkMode,
  glassMode = 'clear',
  onToggleGlassMode,
  wallpaperId = 'liquid_wave',
  onSelectWallpaper,
  customWallpaperUrl = null,
  onUploadCustomWallpaper
}) => {
  const [signingIn, setSigningIn] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleGoogleClick = async () => {
    setErrorMsg(null);
    setSigningIn(true);
    try {
      await onSignInWithGoogle();
    } catch (err: any) {
      setErrorMsg(
        err?.message || 'Google Sign-In could not be completed. Please try again.'
      );
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen relative flex flex-col items-center justify-center px-4 py-16">
      {/* Floating Crystal-Clear Top Control Pill (Appearance + Wallpaper + PWA Install) */}
      <div className="fixed top-4 right-4 left-4 sm:left-auto z-20 flex justify-end">
        <div
          onPointerMove={handleGlassPointerMove}
          className="lg-pill lg-surface-sheen px-2.5 py-1.5 flex items-center gap-2 max-w-full"
        >
          <PWAInstallButton />
          {onToggleDarkMode && onToggleGlassMode && (
            <GlassAppearanceToggle
              darkMode={darkMode}
              onToggleDarkMode={onToggleDarkMode}
              glassMode={glassMode}
              onToggleGlassMode={onToggleGlassMode}
              wallpaperId={wallpaperId}
              onSelectWallpaper={onSelectWallpaper}
              customWallpaperUrl={customWallpaperUrl}
              onUploadCustomWallpaper={onUploadCustomWallpaper}
              idPrefix="start_auth"
            />
          )}
        </div>
      </div>

      {/* Centerpiece Crystal-Clear Refractive Liquid Glass Auth Card */}
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={SPRING_SHEET}
        className="w-full max-w-[430px]"
      >
        <GlassCard
          elevated
          className="rounded-[36px] p-8 sm:p-10"
        >
          <div className="space-y-7">
            {/* Spherical Crystal-Clear Optical Orb Brand Mark */}
            <div className="flex flex-col items-center text-center space-y-4">
              <motion.div
                whileHover={{ scale: 1.05 }}
                transition={SPRING_TACTILE}
                onPointerMove={handleGlassPointerMove}
                className="lg-orb lg-surface-sheen w-24 h-24 flex items-center justify-center"
              >
                <svg
                  className="w-12 h-12 drop-shadow-[0_4px_12px_rgba(8,24,62,0.35)]"
                  viewBox="0 0 64 64"
                  aria-hidden="true"
                >
                  <defs>
                    <linearGradient id="authOrbGold" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#FFF7D6" />
                      <stop offset="50%" stopColor="#F5C76B" />
                      <stop offset="100%" stopColor="#D99B2E" />
                    </linearGradient>
                  </defs>
                  <circle
                    cx="32"
                    cy="32"
                    r="27"
                    fill="rgba(11, 27, 43, 0.42)"
                    stroke="rgba(255,255,255,0.85)"
                    strokeWidth="2"
                  />
                  <path
                    d="M17 44 L26 20 L35 44 M20 37 H32"
                    fill="none"
                    stroke="url(#authOrbGold)"
                    strokeWidth="3.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M39 44 V20 H46 C50 20 52 22.5 52 26.5 C52 30.5 50 33 46 33 H39"
                    fill="none"
                    stroke="#FFFFFF"
                    strokeWidth="3.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </motion.div>

              <div className="space-y-1.5">
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white lg-hero-text">
                  Attendance Portal
                </h1>
                <p className="text-xs sm:text-sm text-white/95 leading-relaxed max-w-xs mx-auto font-medium lg-hero-text">
                  Manage your company&apos;s site attendance, daily progress reports, stock, and payroll in one workspace.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <motion.button
                type="button"
                disabled={signingIn || isAuthLoading}
                onClick={handleGoogleClick}
                onPointerMove={handleGlassPointerMove}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.96 }}
                transition={SPRING_TACTILE}
                className="w-full h-14 px-6 rounded-full lg-btn-glass lg-surface-sheen text-slate-950 dark:text-white font-extrabold text-sm flex items-center justify-center gap-3 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {signingIn || isAuthLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin text-blue-600 dark:text-sky-300" />
                ) : (
                  <span className="w-7 h-7 rounded-full bg-white/90 shadow-xs flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      />
                    </svg>
                  </span>
                )}
                <span className="lg-glass-text-halo">
                  {isAuthLoading
                    ? 'Checking session...'
                    : signingIn
                    ? 'Signing in with Google...'
                    : 'Login using Google'}
                </span>
              </motion.button>

              {errorMsg && (
                <div
                  role="alert"
                  className="flex items-start gap-2 p-3.5 rounded-2xl bg-rose-500/20 backdrop-blur-md border border-rose-300/60 text-xs text-white font-semibold lg-hero-text"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-200" />
                  <span>{errorMsg}</span>
                </div>
              )}
            </div>
          </div>
        </GlassCard>
      </motion.div>
    </div>
  );
};
