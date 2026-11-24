import React, { useState } from 'react';
import { getCompanyInitials } from '../utils/portalLogic';

interface CompanyBrandMarkProps {
  companyName: string;
  companyLogo?: string;
  companySubtitle?: string;
  size?: 'sm' | 'md' | 'lg';
  showSubtitle?: boolean;
  allowWrap?: boolean;
  idSuffix?: string;
  className?: string;
}

/**
 * Consistent Company Logo + Name mark used across:
 * - Active Portal Letterhead
 * - Portal Hub (Your Portals & Shared Attendance Portals)
 * - Create Portal Wizard live preview & Share modal
 *
 * Uses uploaded company logo when available, or a refined golden-globe
 * monogram emblem matching the platform's signature letterhead aesthetic.
 */
export const CompanyBrandMark: React.FC<CompanyBrandMarkProps> = ({
  companyName,
  companyLogo,
  companySubtitle,
  size = 'md',
  showSubtitle = false,
  allowWrap = false,
  idSuffix = 'brand',
  className = ''
}) => {
  const [imgFailed, setImgFailed] = useState(false);
  const cleanName = (companyName || 'Attendance Portal').trim();
  const initials = getCompanyInitials(cleanName);
  const hasValidLogo = Boolean(companyLogo && companyLogo.trim() && !imgFailed);

  const gradId = `portalGlobeGrad_${idSuffix}`;
  const clipId = `portalGlobeClip_${idSuffix}`;

  const iconBoxClasses =
    size === 'sm'
      ? 'w-9 h-9 rounded-full'
      : size === 'lg'
      ? 'w-14 h-14 rounded-2xl'
      : 'w-11 h-11 sm:w-12 sm:h-12 rounded-2xl';

  const titleClasses =
    size === 'sm'
      ? 'text-sm font-extrabold tracking-tight'
      : size === 'lg'
      ? 'text-xl sm:text-2xl font-extrabold tracking-tight'
      : allowWrap
      ? 'text-base sm:text-lg font-extrabold tracking-tight'
      : 'text-base sm:text-xl font-extrabold tracking-tight';

  const subtitleClasses =
    size === 'sm'
      ? 'text-[11px]'
      : 'text-xs';

  return (
    <div className={`flex items-center gap-3 min-w-0 select-none ${className}`}>
      <div
        className={`${iconBoxClasses} shrink-0 flex items-center justify-center overflow-hidden ${
          hasValidLogo
            ? 'bg-white/85 dark:bg-slate-800/85 border border-white/75 dark:border-white/20 p-1 shadow-xs'
            : 'bg-white/65 dark:bg-slate-900/55 border border-white/75 dark:border-white/20 p-0.5 shadow-xs'
        }`}
      >
        {hasValidLogo ? (
          <img
            src={companyLogo}
            alt={`${cleanName} logo`}
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
            className="w-full h-full object-contain rounded-xl"
          />
        ) : (
          <svg
            viewBox="0 0 100 100"
            width="100%"
            height="100%"
            aria-label={`${cleanName} emblem`}
          >
            <defs>
              <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#E0A955" />
                <stop offset="55%" stopColor="#C1832B" />
                <stop offset="100%" stopColor="#8E5914" />
              </linearGradient>
              <clipPath id={clipId}>
                <circle cx="50" cy="50" r="45" />
              </clipPath>
            </defs>
            <g clipPath={`url(#${clipId})`}>
              <ellipse cx="50" cy="50" rx="34" ry="45" stroke={`url(#${gradId})`} strokeWidth="2.6" fill="none" />
              <ellipse cx="50" cy="50" rx="23" ry="45" stroke={`url(#${gradId})`} strokeWidth="2.5" fill="none" />
              <ellipse cx="50" cy="50" rx="12" ry="45" stroke={`url(#${gradId})`} strokeWidth="2.4" fill="none" />
              <line x1="50" y1="5" x2="50" y2="95" stroke={`url(#${gradId})`} strokeWidth="2.5" />
              <path d="M 5,19 Q 50,26 95,19" stroke={`url(#${gradId})`} strokeWidth="2.5" fill="none" />
              <path d="M 5,30 Q 50,35 95,30" stroke={`url(#${gradId})`} strokeWidth="2.5" fill="none" />
              <path d="M 5,70 Q 50,65 95,70" stroke={`url(#${gradId})`} strokeWidth="2.5" fill="none" />
              <path d="M 5,81 Q 50,74 95,81" stroke={`url(#${gradId})`} strokeWidth="2.5" fill="none" />
              <path d="M 32,6 Q 50,12 68,6 Z" fill={`url(#${gradId})`} />
              <path d="M 32,94 Q 50,88 68,94 Z" fill={`url(#${gradId})`} />
              <rect x="4" y="39" width="92" height="22" fill={`url(#${gradId})`} />
            </g>
            <circle cx="50" cy="50" r="45" stroke={`url(#${gradId})`} strokeWidth="3.5" fill="none" />
            <text
              x="50"
              y="55.5"
              fill="#FFFFFF"
              fontFamily="'Plus Jakarta Sans', Arial, sans-serif"
              fontSize="17"
              fontWeight="800"
              letterSpacing="2.5"
              textAnchor="middle"
            >
              {initials}
            </text>
          </svg>
        )}
      </div>

      <div className="min-w-0">
        <div
          className={`${titleClasses} text-slate-900 dark:text-white leading-snug ${
            allowWrap ? 'line-clamp-2' : 'truncate'
          }`}
          title={cleanName}
        >
          {cleanName}
        </div>
        {showSubtitle && companySubtitle?.trim() && (
          <div
            className={`${subtitleClasses} text-slate-600 dark:text-slate-300 mt-0.5 truncate`}
            title={companySubtitle}
          >
            {companySubtitle}
          </div>
        )}
      </div>
    </div>
  );
};
