import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sun, Moon, Droplets, Layers, Image as ImageIcon, Upload, Check } from 'lucide-react';
import lightWaveWallpaper from '../assets/images/liquid_glass_wave_light_1795440108621.jpg';
import darkWaveWallpaper from '../assets/images/liquid_glass_wave_dark_1795440107396.jpg';
import goldenGateWallpaper from '../assets/images/golden_gate_sunset_1795520758549.jpg';
import silkRibbonWallpaper from '../assets/images/silk_ribbon_wave_1795520733973.jpg';
import {
  SPRING_TACTILE,
  SPRING_CONTAINER,
  SPRING_SHEET,
  SPRING_THUMB,
  computePointerSpecular,
  computeScrollHeaderMetrics,
  createConvexLensDisplacementMapUri,
  type GlassAppearanceMode,
  type ScrollHeaderMetrics,
  type WallpaperPresetId
} from '../utils/glassPhysics';

export interface WallpaperOption {
  id: WallpaperPresetId;
  label: string;
  previewSrc: string;
}

export const CURATED_WALLPAPERS: WallpaperOption[] = [
  {
    id: 'liquid_wave',
    label: 'Liquid Wave',
    previewSrc: lightWaveWallpaper
  },
  {
    id: 'golden_gate',
    label: 'Golden Gate',
    previewSrc: goldenGateWallpaper
  },
  {
    id: 'silk_ribbon',
    label: 'Silk Ribbons',
    previewSrc: silkRibbonWallpaper
  },
  {
    id: 'midnight_wave',
    label: 'Midnight',
    previewSrc: darkWaveWallpaper
  }
];

/**
 * Global hidden SVG Optical Refraction Filters (<feDisplacementMap> + chromatic dispersion)
 * for crystal-clear Liquid Glass perimeter lensing on Chromium/Edge/Chrome.
 * - #lg-refract-clear: cards & panels (crystal-clear interior, refractive beveled perimeter)
 * - #lg-refract-pill: floating pill navbars & buttons (stronger curved meniscus refraction)
 * - #lg-refract-orb: circular crystal-clear glass orbs with spherical chromatic refraction
 */
export const LiquidGlassSvgFilters: React.FC = () => {
  const cardMapUri = useMemo(() => createConvexLensDisplacementMapUri('card'), []);
  const pillMapUri = useMemo(() => createConvexLensDisplacementMapUri('pill'), []);
  const orbMapUri = useMemo(() => createConvexLensDisplacementMapUri('orb'), []);

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className="fixed w-0 h-0 pointer-events-none overflow-hidden"
    >
      <defs>
        {/* Crystal-Clear Card Perimeter Refraction + Subtle RGB Dispersion */}
        <filter
          id="lg-refract-clear"
          x="0%"
          y="0%"
          width="100%"
          height="100%"
          colorInterpolationFilters="sRGB"
        >
          <feImage
            href={cardMapUri}
            result="cardMap"
            x="0"
            y="0"
            width="100%"
            height="100%"
            preserveAspectRatio="none"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="cardMap"
            scale="24"
            xChannelSelector="R"
            yChannelSelector="G"
            result="dispR"
          />
          <feColorMatrix
            in="dispR"
            type="matrix"
            values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
            result="onlyR"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="cardMap"
            scale="20"
            xChannelSelector="R"
            yChannelSelector="G"
            result="dispG"
          />
          <feColorMatrix
            in="dispG"
            type="matrix"
            values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0"
            result="onlyG"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="cardMap"
            scale="16"
            xChannelSelector="R"
            yChannelSelector="G"
            result="dispB"
          />
          <feColorMatrix
            in="dispB"
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"
            result="onlyB"
          />
          <feBlend in="onlyR" in2="onlyG" mode="screen" result="rg" />
          <feBlend in="rg" in2="onlyB" mode="screen" />
        </filter>

        {/* Pill & Floating Capsule Refraction */}
        <filter
          id="lg-refract-pill"
          x="0%"
          y="0%"
          width="100%"
          height="100%"
          colorInterpolationFilters="sRGB"
        >
          <feImage
            href={pillMapUri}
            result="pillMap"
            x="0"
            y="0"
            width="100%"
            height="100%"
            preserveAspectRatio="none"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="pillMap"
            scale="26"
            xChannelSelector="R"
            yChannelSelector="G"
            result="pR"
          />
          <feColorMatrix
            in="pR"
            type="matrix"
            values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
            result="pOnlyR"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="pillMap"
            scale="21"
            xChannelSelector="R"
            yChannelSelector="G"
            result="pG"
          />
          <feColorMatrix
            in="pG"
            type="matrix"
            values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0"
            result="pOnlyG"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="pillMap"
            scale="16"
            xChannelSelector="R"
            yChannelSelector="G"
            result="pB"
          />
          <feColorMatrix
            in="pB"
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"
            result="pOnlyB"
          />
          <feBlend in="pOnlyR" in2="pOnlyG" mode="screen" result="pRG" />
          <feBlend in="pRG" in2="pOnlyB" mode="screen" />
        </filter>

        {/* Spherical Crystal-Clear Orb Lens Refraction */}
        <filter
          id="lg-refract-orb"
          x="0%"
          y="0%"
          width="100%"
          height="100%"
          colorInterpolationFilters="sRGB"
        >
          <feImage
            href={orbMapUri}
            result="orbMap"
            x="0"
            y="0"
            width="100%"
            height="100%"
            preserveAspectRatio="none"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="orbMap"
            scale="34"
            xChannelSelector="R"
            yChannelSelector="G"
            result="oR"
          />
          <feColorMatrix
            in="oR"
            type="matrix"
            values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
            result="oOnlyR"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="orbMap"
            scale="27"
            xChannelSelector="R"
            yChannelSelector="G"
            result="oG"
          />
          <feColorMatrix
            in="oG"
            type="matrix"
            values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0"
            result="oOnlyG"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="orbMap"
            scale="20"
            xChannelSelector="R"
            yChannelSelector="G"
            result="oB"
          />
          <feColorMatrix
            in="oB"
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"
            result="oOnlyB"
          />
          <feBlend in="oOnlyR" in2="oOnlyG" mode="screen" result="oRG" />
          <feBlend in="oRG" in2="oOnlyB" mode="screen" />
        </filter>
      </defs>
    </svg>
  );
};

interface LiquidGlassWallpaperProps {
  darkMode: boolean;
  glassMode: GlassAppearanceMode;
  wallpaperId?: WallpaperPresetId;
  customWallpaperUrl?: string | null;
}

/**
 * Full-viewport switchable wallpaper canvas (Liquid Wave, Golden Gate Sunset,
 * Silk Ribbons, Midnight Sapphire, or Custom Uploaded Photo) with smooth
 * crossfade and GPU scroll-linked parallax.
 */
export const LiquidGlassWallpaper: React.FC<LiquidGlassWallpaperProps> = ({
  darkMode,
  glassMode,
  wallpaperId = 'liquid_wave',
  customWallpaperUrl = null
}) => {
  const layerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let rafId = 0;
    const handleScroll = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        const { parallaxY } = computeScrollHeaderMetrics(window.scrollY);
        if (layerRef.current) {
          layerRef.current.style.transform = `translate3d(0, ${parallaxY}px, 0) scale(1.05)`;
        }
      });
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, []);

  const resolvedActiveId: WallpaperPresetId =
    wallpaperId === 'custom' && customWallpaperUrl
      ? 'custom'
      : wallpaperId === 'liquid_wave' && darkMode
      ? 'midnight_wave'
      : wallpaperId;

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 -z-10 overflow-hidden pointer-events-none select-none no-print"
    >
      <div
        ref={layerRef}
        style={{ transform: 'translate3d(0, 0px, 0) scale(1.05)' }}
        className="absolute inset-0 will-change-transform"
      >
        <img
          src={lightWaveWallpaper}
          alt=""
          className={`absolute inset-0 w-full h-full object-cover object-center transition-opacity duration-700 ease-out ${
            resolvedActiveId === 'liquid_wave' ? 'opacity-100' : 'opacity-0'
          }`}
        />

        <img
          src={darkWaveWallpaper}
          alt=""
          className={`absolute inset-0 w-full h-full object-cover object-center transition-opacity duration-700 ease-out ${
            resolvedActiveId === 'midnight_wave' ? 'opacity-100' : 'opacity-0'
          }`}
        />

        <img
          src={goldenGateWallpaper}
          alt=""
          className={`absolute inset-0 w-full h-full object-cover object-center transition-opacity duration-700 ease-out ${
            resolvedActiveId === 'golden_gate' ? 'opacity-100' : 'opacity-0'
          }`}
        />

        <img
          src={silkRibbonWallpaper}
          alt=""
          className={`absolute inset-0 w-full h-full object-cover object-center transition-opacity duration-700 ease-out ${
            resolvedActiveId === 'silk_ribbon' ? 'opacity-100' : 'opacity-0'
          }`}
        />

        {customWallpaperUrl && (
          <img
            src={customWallpaperUrl}
            alt=""
            className={`absolute inset-0 w-full h-full object-cover object-center transition-opacity duration-700 ease-out ${
              resolvedActiveId === 'custom' ? 'opacity-100' : 'opacity-0'
            }`}
          />
        )}
      </div>

      {/* Minimal atmospheric tint only when Dark Mode or Tinted readability mode needs subtle contrast */}
      <div
        className={`absolute inset-0 transition-opacity duration-500 ${
          darkMode
            ? glassMode === 'tinted'
              ? 'bg-gradient-to-b from-slate-950/48 via-slate-950/24 to-slate-950/52'
              : resolvedActiveId === 'midnight_wave'
              ? 'bg-transparent'
              : 'bg-slate-950/26'
            : glassMode === 'tinted'
            ? 'bg-gradient-to-b from-slate-950/12 via-white/8 to-slate-950/14'
            : 'bg-gradient-to-b from-slate-950/8 via-transparent to-slate-950/10'
        }`}
      />
    </div>
  );
};

/**
 * Scroll-linked adaptive header hook (passive scroll listener + RAF throttle).
 */
export function useScrollHeader(): ScrollHeaderMetrics {
  const [metrics, setMetrics] = useState<ScrollHeaderMetrics>(() =>
    computeScrollHeaderMetrics(0)
  );

  useEffect(() => {
    let rafId = 0;
    const onScroll = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        const next = computeScrollHeaderMetrics(window.scrollY);
        setMetrics(prev =>
          prev.isScrolled === next.isScrolled &&
          Math.abs(prev.compactRatio - next.compactRatio) < 0.04
            ? prev
            : next
        );
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, []);

  return metrics;
}

/**
 * Attaches zero-re-render pointer-tracked specular sheen CSS variables (--lg-mx, --lg-my)
 * onto any glass surface.
 */
export function handleGlassPointerMove(e: React.PointerEvent<HTMLElement>): void {
  const target = e.currentTarget;
  const rect = target.getBoundingClientRect();
  const { xPercent, yPercent } = computePointerSpecular(e.clientX, e.clientY, rect);
  target.style.setProperty('--lg-mx', `${xPercent}%`);
  target.style.setProperty('--lg-my', `${yPercent}%`);
}

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
  elevated?: boolean;
  sheen?: boolean;
  children: React.ReactNode;
}

export const GlassCard: React.FC<GlassCardProps> = ({
  interactive = false,
  elevated = false,
  sheen = true,
  className = '',
  children,
  onPointerMove,
  ...rest
}) => {
  return (
    <div
      onPointerMove={e => {
        if (sheen) handleGlassPointerMove(e);
        onPointerMove?.(e);
      }}
      className={`lg-surface ${elevated ? 'lg-surface-elevated' : ''} ${
        sheen ? 'lg-surface-sheen' : ''
      } ${interactive ? 'lg-surface-interactive' : ''} rounded-[26px] ${className}`}
      {...rest}
    >
      <span aria-hidden="true" className="lg-edge-lens" />
      <div className="relative z-10 h-full">{children}</div>
    </div>
  );
};

interface GlassAppearanceToggleProps {
  darkMode: boolean;
  onToggleDarkMode: () => void;
  glassMode: GlassAppearanceMode;
  onToggleGlassMode: () => void;
  wallpaperId?: WallpaperPresetId;
  onSelectWallpaper?: (id: WallpaperPresetId) => void;
  customWallpaperUrl?: string | null;
  onUploadCustomWallpaper?: (dataUrl: string) => void;
  compact?: boolean;
  idPrefix?: string;
}

/**
 * Inspired by Apple's crystal-clear Liquid Glass capsule toggle:
 * - Light / Dark mode pill with gliding refractive glass thumb
 * - Clear / Tinted (iOS 27 optical mode) toggle
 * - Wallpaper Switcher popover (Liquid Wave, Golden Gate, Silk Ribbons, Midnight, or Custom Upload)
 */
export const GlassAppearanceToggle: React.FC<GlassAppearanceToggleProps> = ({
  darkMode,
  onToggleDarkMode,
  glassMode,
  onToggleGlassMode,
  wallpaperId = 'liquid_wave',
  onSelectWallpaper,
  customWallpaperUrl = null,
  onUploadCustomWallpaper,
  compact = false,
  idPrefix = 'glass_toggle'
}) => {
  const [isWallpaperOpen, setIsWallpaperOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isWallpaperOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsWallpaperOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsWallpaperOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleKey);
    };
  }, [isWallpaperOpen]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onUploadCustomWallpaper) return;
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onUploadCustomWallpaper(reader.result);
        setIsWallpaperOpen(false);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div className="inline-flex items-center gap-1.5 shrink-0" ref={popoverRef}>
      {/* Light / Dark Mode Pill Toggle */}
      <div
        role="group"
        aria-label="Color appearance"
        className="relative inline-flex items-center p-0.5 rounded-full bg-white/20 dark:bg-slate-950/45 border border-white/55 dark:border-white/20 shadow-inner backdrop-blur-sm"
      >
        <button
          type="button"
          onClick={() => {
            if (darkMode) onToggleDarkMode();
          }}
          aria-label="Light Mode"
          aria-pressed={!darkMode}
          title="Light Mode"
          className={`relative z-10 flex items-center justify-center rounded-full transition-colors cursor-pointer ${
            compact ? 'w-7 h-7' : 'w-8 h-7'
          } ${!darkMode ? 'text-slate-950' : 'text-slate-200/80 hover:text-white'}`}
        >
          {!darkMode && (
            <motion.span
              layoutId={`${idPrefix}_theme_thumb`}
              transition={SPRING_THUMB}
              className="absolute inset-0 rounded-full lg-pill-thumb -z-10"
            />
          )}
          <Sun className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={() => {
            if (!darkMode) onToggleDarkMode();
          }}
          aria-label="Dark Mode"
          aria-pressed={darkMode}
          title="Dark Mode"
          className={`relative z-10 flex items-center justify-center rounded-full transition-colors cursor-pointer ${
            compact ? 'w-7 h-7' : 'w-8 h-7'
          } ${darkMode ? 'text-sky-200' : 'text-slate-800/85 hover:text-slate-950'}`}
        >
          {darkMode && (
            <motion.span
              layoutId={`${idPrefix}_theme_thumb`}
              transition={SPRING_THUMB}
              className="absolute inset-0 rounded-full lg-pill-thumb -z-10"
            />
          )}
          <Moon className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Clear / Tinted Liquid Glass Mode Switch */}
      <button
        type="button"
        onClick={onToggleGlassMode}
        aria-label={
          glassMode === 'clear'
            ? 'Switch Liquid Glass to Tinted mode for stronger text contrast'
            : 'Switch Liquid Glass to Clear refractive mode'
        }
        aria-pressed={glassMode === 'tinted'}
        title={
          glassMode === 'clear'
            ? 'Glass: Crystal Clear Refraction (Tap for Tinted)'
            : 'Glass: Tinted Frosted (Tap for Crystal Clear)'
        }
        className={`relative inline-flex items-center gap-1 rounded-full border border-white/55 dark:border-white/20 bg-white/20 dark:bg-slate-950/45 text-[11px] font-bold transition-all active:scale-95 cursor-pointer ${
          compact ? 'px-2 h-8' : 'px-2.5 h-8'
        } text-slate-900 dark:text-slate-100 hover:bg-white/35 dark:hover:bg-white/15`}
      >
        {glassMode === 'clear' ? (
          <Droplets className="w-3.5 h-3.5 text-sky-600 dark:text-sky-300 shrink-0" />
        ) : (
          <Layers className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-300 shrink-0" />
        )}
        {!compact && <span>{glassMode === 'clear' ? 'Clear' : 'Tinted'}</span>}
      </button>

      {/* Switchable Wallpaper Picker */}
      {onSelectWallpaper && (
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsWallpaperOpen(prev => !prev)}
            aria-label="Switch Wallpaper"
            aria-expanded={isWallpaperOpen}
            title="Switch Liquid Glass Wallpaper"
            className={`relative inline-flex items-center gap-1 rounded-full border border-white/55 dark:border-white/20 bg-white/20 dark:bg-slate-950/45 text-[11px] font-bold transition-all active:scale-95 cursor-pointer ${
              compact ? 'px-2 h-8' : 'px-2.5 h-8'
            } text-slate-900 dark:text-slate-100 hover:bg-white/35 dark:hover:bg-white/15`}
          >
            <ImageIcon className="w-3.5 h-3.5 text-blue-700 dark:text-sky-300 shrink-0" />
            {!compact && <span>Wallpaper</span>}
          </button>

          <AnimatePresence>
            {isWallpaperOpen && (
              <motion.div
                role="dialog"
                aria-label="Choose Wallpaper"
                initial={{ opacity: 0, scale: 0.92, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.94, y: 6 }}
                transition={SPRING_CONTAINER}
                className="absolute right-0 mt-2.5 w-72 lg-modal rounded-[24px] p-3.5 z-50 text-slate-900 dark:text-slate-100"
              >
                <div className="flex items-center justify-between mb-2.5 px-0.5">
                  <span className="text-xs font-extrabold tracking-tight">
                    Choose Wallpaper
                  </span>
                  <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                    Live Refraction
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {CURATED_WALLPAPERS.map(wp => {
                    const isSelected = wallpaperId === wp.id;
                    return (
                      <button
                        key={wp.id}
                        type="button"
                        onClick={() => {
                          onSelectWallpaper(wp.id);
                          setIsWallpaperOpen(false);
                        }}
                        className={`group relative rounded-2xl overflow-hidden aspect-[16/10] border-2 transition-all cursor-pointer text-left ${
                          isSelected
                            ? 'border-blue-500 ring-2 ring-blue-400/40 scale-[1.01]'
                            : 'border-white/60 dark:border-white/15 hover:border-blue-400/70'
                        }`}
                      >
                        <img
                          src={wp.previewSrc}
                          alt={wp.label}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/80 via-slate-950/35 to-transparent px-2 py-1.5 flex items-center justify-between">
                          <span className="text-[11px] font-bold text-white drop-shadow">
                            {wp.label}
                          </span>
                          {isSelected && (
                            <span className="w-4 h-4 rounded-full bg-blue-500 text-white flex items-center justify-center">
                              <Check className="w-2.5 h-2.5 stroke-[3]" />
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {onUploadCustomWallpaper && (
                  <div className="mt-2.5 pt-2.5 border-t border-slate-900/10 dark:border-white/12 flex items-center gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-full text-xs font-bold bg-slate-900/8 dark:bg-white/10 hover:bg-slate-900/14 dark:hover:bg-white/18 text-slate-800 dark:text-white transition-colors cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Upload Custom Photo</span>
                    </button>
                    {customWallpaperUrl && (
                      <button
                        type="button"
                        onClick={() => {
                          onSelectWallpaper('custom');
                          setIsWallpaperOpen(false);
                        }}
                        className={`px-2.5 py-2 rounded-full text-[11px] font-bold cursor-pointer ${
                          wallpaperId === 'custom'
                            ? 'bg-blue-600 text-white'
                            : 'bg-white/60 dark:bg-white/10 text-slate-700 dark:text-slate-200'
                        }`}
                      >
                        Custom
                      </button>
                    )}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};

export interface PillNavItem<T extends string> {
  id: T;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface GlassPillNavProps<T extends string> {
  items: PillNavItem<T>[];
  activeId: T;
  onSelect: (id: T) => void;
  layoutId: string;
  ariaLabel: string;
  className?: string;
  variant?: 'desktop' | 'mobile';
}

/**
 * Detached floating Liquid Glass pill navigation bar with velocity-preserving
 * gliding refractive thumb (FLIP shared-element layoutId + SPRING_TACTILE).
 */
export function GlassPillNav<T extends string>({
  items,
  activeId,
  onSelect,
  layoutId,
  ariaLabel,
  className = '',
  variant = 'desktop'
}: GlassPillNavProps<T>) {
  if (variant === 'mobile') {
    return (
      <nav
        aria-label={ariaLabel}
        className={`lg-pill p-1.5 grid grid-cols-4 gap-1 no-print ${className}`}
      >
        {items.map(item => {
          const Icon = item.icon;
          const active = activeId === item.id;
          return (
            <motion.button
              key={item.id}
              type="button"
              whileTap={{ scale: 0.94 }}
              transition={SPRING_TACTILE}
              onClick={() => onSelect(item.id)}
              className={`relative z-10 flex flex-col items-center justify-center gap-0.5 py-2 px-1 rounded-full text-[11px] font-bold transition-colors cursor-pointer ${
                active
                  ? 'text-blue-800 dark:text-white'
                  : 'text-slate-900 dark:text-slate-200'
              }`}
            >
              {active && (
                <motion.span
                  layoutId={layoutId}
                  transition={SPRING_TACTILE}
                  className="absolute inset-0 rounded-full lg-pill-thumb -z-10"
                />
              )}
              <Icon className="w-4 h-4" />
              <span className="truncate max-w-full leading-none">{item.label}</span>
            </motion.button>
          );
        })}
      </nav>
    );
  }

  return (
    <nav
      aria-label={ariaLabel}
      onPointerMove={handleGlassPointerMove}
      className={`lg-pill lg-surface-sheen p-1.5 inline-flex items-center gap-1 no-print ${className}`}
    >
      {items.map(item => {
        const Icon = item.icon;
        const active = activeId === item.id;
        return (
          <motion.button
            key={item.id}
            type="button"
            whileTap={{ scale: 0.96 }}
            transition={SPRING_TACTILE}
            onClick={() => onSelect(item.id)}
            className={`relative z-10 flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
              active
                ? 'text-slate-950 dark:text-white'
                : 'text-slate-900 dark:text-slate-100 hover:text-slate-950 dark:hover:text-white'
            }`}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                transition={SPRING_TACTILE}
                className="absolute inset-0 rounded-full lg-pill-thumb -z-10"
              />
            )}
            <Icon className="w-4 h-4 shrink-0" />
            <span>{item.label}</span>
          </motion.button>
        );
      })}
    </nav>
  );
}

interface GlassModalProps {
  isOpen: boolean;
  onClose: () => void;
  labelledBy?: string;
  ariaLabel?: string;
  maxWidthClass?: string;
  className?: string;
  children: React.ReactNode;
}

/**
 * Elastic Liquid Glass Modal / Sheet with damped spring expansion (SPRING_SHEET),
 * ambient backdrop blur, and Escape-to-close support.
 */
export const GlassModal: React.FC<GlassModalProps> = ({
  isOpen,
  onClose,
  labelledBy,
  ariaLabel,
  maxWidthClass = 'max-w-lg',
  className = '',
  children
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          onMouseDown={e => {
            if (e.target === e.currentTarget) onClose();
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/48 backdrop-blur-md p-3 sm:p-4 overflow-y-auto no-print"
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy}
            aria-label={ariaLabel}
            initial={{ opacity: 0, scale: 0.92, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 12 }}
            transition={SPRING_SHEET}
            className={`lg-modal rounded-[28px] w-full ${maxWidthClass} overflow-hidden my-auto flex flex-col max-h-[92vh] text-slate-900 dark:text-slate-100 ${className}`}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
