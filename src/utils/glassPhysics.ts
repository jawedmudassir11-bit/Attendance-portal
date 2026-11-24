export type GlassAppearanceMode = 'clear' | 'tinted';

export type WallpaperPresetId =
  | 'liquid_wave'
  | 'golden_gate'
  | 'silk_ribbon'
  | 'midnight_wave'
  | 'custom';

export const WALLPAPER_PRESET_IDS: readonly WallpaperPresetId[] = [
  'liquid_wave',
  'golden_gate',
  'silk_ribbon',
  'midnight_wave',
  'custom'
];

export interface SpringPhysicsConfig {
  type: 'spring';
  stiffness: number;
  damping: number;
  mass: number;
}

/**
 * Authentic Apple Liquid Glass damped spring profiles.
 * Eliminates linear/robotic easing in favor of velocity-preserving spring physics.
 */
export const SPRING_TACTILE: SpringPhysicsConfig = {
  type: 'spring',
  stiffness: 420,
  damping: 32,
  mass: 0.85
};

export const SPRING_CONTAINER: SpringPhysicsConfig = {
  type: 'spring',
  stiffness: 320,
  damping: 28,
  mass: 1.0
};

export const SPRING_SHEET: SpringPhysicsConfig = {
  type: 'spring',
  stiffness: 260,
  damping: 30,
  mass: 1.1
};

export const SPRING_THUMB: SpringPhysicsConfig = {
  type: 'spring',
  stiffness: 460,
  damping: 34,
  mass: 0.8
};

export interface PointerSpecularCoords {
  xPercent: number;
  yPercent: number;
  rimAngleDeg: number;
}

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/**
 * Computes normalized pointer specular coordinates (0..100%) and dynamic
 * Fresnel rim light angle based on pointer position over a glass surface.
 */
export function computePointerSpecular(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number }
): PointerSpecularCoords {
  const safeW = rect.width > 0 ? rect.width : 1;
  const safeH = rect.height > 0 ? rect.height : 1;
  const normX = clampNumber((clientX - rect.left) / safeW, 0, 1);
  const normY = clampNumber((clientY - rect.top) / safeH, 0, 1);

  const dx = normX - 0.5;
  const dy = normY - 0.5;
  const rad = Math.atan2(dy, dx);
  const rimAngleDeg = Math.round(((rad * 180) / Math.PI + 360 + 90) % 360);

  return {
    xPercent: Math.round(normX * 1000) / 10,
    yPercent: Math.round(normY * 1000) / 10,
    rimAngleDeg
  };
}

export interface ScrollHeaderMetrics {
  compactRatio: number;
  isScrolled: boolean;
  rimOpacity: number;
  blurBoostPx: number;
  parallaxY: number;
}

/**
 * Pure scroll-linked interpolation for adaptive floating headers and wallpaper parallax.
 */
export function computeScrollHeaderMetrics(scrollY: number): ScrollHeaderMetrics {
  const safeScroll = Math.max(0, Number.isFinite(scrollY) ? scrollY : 0);
  const compactRatio = clampNumber(safeScroll / 72, 0, 1);
  const isScrolled = safeScroll > 14;
  const rimOpacity = Math.round((0.55 + compactRatio * 0.45) * 100) / 100;
  const blurBoostPx = Math.round(compactRatio * 10);
  const parallaxY = -Math.round(clampNumber(safeScroll * 0.04, 0, 36) * 10) / 10;

  return {
    compactRatio: Math.round(compactRatio * 1000) / 1000,
    isScrolled,
    rimOpacity,
    blurBoostPx,
    parallaxY
  };
}

export function parseGlassAppearanceMode(raw: string | null | undefined): GlassAppearanceMode {
  return raw === 'tinted' ? 'tinted' : 'clear';
}

export function parseWallpaperPreset(raw: string | null | undefined): WallpaperPresetId {
  if (
    raw === 'liquid_wave' ||
    raw === 'golden_gate' ||
    raw === 'silk_ribbon' ||
    raw === 'midnight_wave' ||
    raw === 'custom'
  ) {
    return raw;
  }
  return 'liquid_wave';
}

/**
 * Generates an optical SVG convex-bevel displacement map data URI for real-time
 * SVG <feDisplacementMap> perimeter refraction.
 * - Red channel encodes horizontal X refraction normal
 * - Green channel encodes vertical Y refraction normal
 * - Center remains neutral #808080 (zero warping over text/controls) while the curved
 *   bevel perimeter bends background light smoothly like crystal-clear curved glass.
 */
export function createConvexLensDisplacementMapUri(
  mode: 'card' | 'pill' | 'orb' = 'card'
): string {
  const rx = mode === 'orb' ? 50 : mode === 'pill' ? 42 : 14;
  const inset = mode === 'orb' ? 16 : mode === 'pill' ? 14 : 9;
  const innerW = 100 - inset * 2;
  const innerH = 100 - inset * 2;
  const blurStd = mode === 'orb' ? 4.5 : mode === 'pill' ? 3.2 : 2.6;

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none">`,
    `<defs>`,
    `<linearGradient id="rx" x1="0%" y1="0%" x2="100%" y2="0%">`,
    `<stop offset="0%" stop-color="#ff8080"/>`,
    `<stop offset="22%" stop-color="#808080"/>`,
    `<stop offset="78%" stop-color="#808080"/>`,
    `<stop offset="100%" stop-color="#008080"/>`,
    `</linearGradient>`,
    `<linearGradient id="gy" x1="0%" y1="0%" x2="0%" y2="100%">`,
    `<stop offset="0%" stop-color="#80ff80"/>`,
    `<stop offset="22%" stop-color="#808080"/>`,
    `<stop offset="78%" stop-color="#808080"/>`,
    `<stop offset="100%" stop-color="#800080"/>`,
    `</linearGradient>`,
    `<filter id="soft"><feGaussianBlur stdDeviation="${blurStd}"/></filter>`,
    `</defs>`,
    `<rect width="100" height="100" fill="#808080"/>`,
    `<rect width="100" height="100" rx="${rx}" fill="url(#rx)"/>`,
    `<rect width="100" height="100" rx="${rx}" fill="url(#gy)" style="mix-blend-mode:hard-light" opacity="0.92"/>`,
    `<rect x="${inset}" y="${inset}" width="${innerW}" height="${innerH}" rx="${Math.max(
      4,
      rx - inset
    )}" fill="#808080" filter="url(#soft)"/>`,
    `</svg>`
  ].join('');

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * Extracts a clean, user-friendly error message from raw Firestore structured JSON errors
 * (while keeping structured console logs intact in firebase.ts).
 */
export function formatFirestoreErrorMessage(rawError: string | null | undefined): string {
  if (!rawError || !rawError.trim()) {
    return 'Unable to sync your portals right now. Please try again.';
  }
  const trimmed = rawError.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed) as { error?: string; operationType?: string; path?: string };
      const inner = String(parsed.error || '').trim();
      if (/missing or insufficient permissions/i.test(inner)) {
        return 'Cloud sync permissions need a refresh. Click Retry Sync below or sign out and sign back in with your verified Google account.';
      }
      if (/offline|unavailable|network/i.test(inner)) {
        return 'Network connection looks offline. Reconnect to the internet and tap Retry Sync.';
      }
      if (inner) {
        return inner;
      }
    } catch {
      // Fall through to raw string sanitization
    }
  }
  if (/missing or insufficient permissions/i.test(trimmed)) {
    return 'Cloud sync permissions need a refresh. Click Retry Sync below or sign out and sign back in.';
  }
  return trimmed;
}
