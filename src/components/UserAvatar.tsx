import React, { useState, useEffect } from 'react';
import { Pencil, Sparkles } from 'lucide-react';
import { getUserInitials, sanitizeAvatarUrl } from '../utils/siteLogic';
import type { SubscriptionTier } from '../utils/accountLogic';

interface UserAvatarProps {
  photoUrl?: string | null;
  name?: string | null;
  email?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  highlight?: 'gold' | 'blue' | 'neutral';
  subscriptionTier?: SubscriptionTier;
  showEditBadge?: boolean;
  onEditClick?: () => void;
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<UserAvatarProps['size']>, string> = {
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-8 h-8 text-xs',
  md: 'w-11 h-11 text-sm',
  lg: 'w-14 h-14 text-base',
  xl: 'w-16 h-16 text-lg'
};

const RING_PADDING_CLASSES: Record<
  NonNullable<UserAvatarProps['size']>,
  { outer: string; spacer: string }
> = {
  xs: { outer: 'p-[2px]', spacer: 'p-[1px]' },
  sm: { outer: 'p-[2px]', spacer: 'p-[1.5px]' },
  md: { outer: 'p-[2.5px]', spacer: 'p-[2px]' },
  lg: { outer: 'p-[3px]', spacer: 'p-[2px]' },
  xl: { outer: 'p-[3px]', spacer: 'p-[2.5px]' }
};

const RING_CLASSES: Record<NonNullable<UserAvatarProps['highlight']>, string> = {
  gold: 'ring-2 ring-amber-400',
  blue: 'ring-2 ring-blue-400/70',
  neutral: 'ring-1 ring-white/25 dark:ring-slate-700'
};

export const SubscriptionTierBadge: React.FC<{
  tier?: SubscriptionTier;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}> = ({ tier = 'standard', size = 'md', className = '' }) => {
  if (tier !== 'pro' && tier !== 'ultra') return null;

  const sizeClass =
    size === 'xs'
      ? 'px-1.5 py-[1px] text-[9px] leading-tight'
      : size === 'sm'
      ? 'px-2.5 py-[2px] text-[11px] leading-tight'
      : 'px-3.5 py-0.5 text-[13px] leading-tight';

  if (tier === 'ultra') {
    return (
      <span
        className={`google-ai-pill-ultra inline-flex items-center gap-1 rounded-full font-bold tracking-tight select-none ${sizeClass} ${className}`}
      >
        <Sparkles className={size === 'xs' ? 'w-2.5 h-2.5 text-sky-300' : 'w-3 h-3 text-sky-300'} />
        <span>Ultra</span>
      </span>
    );
  }

  return (
    <span
      className={`google-ai-pill-pro inline-flex items-center rounded-full font-semibold tracking-tight select-none ${sizeClass} ${className}`}
    >
      Pro
    </span>
  );
};

export const UserAvatar: React.FC<UserAvatarProps> = ({
  photoUrl,
  name,
  email,
  size = 'sm',
  highlight = 'neutral',
  subscriptionTier = 'standard',
  showEditBadge = false,
  onEditClick,
  className = ''
}) => {
  const safeSrc = sanitizeAvatarUrl(photoUrl);
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [safeSrc]);

  const initials = getUserInitials(name, email);
  const sizeClass = SIZE_CLASSES[size];
  const hasAiRing = subscriptionTier === 'pro' || subscriptionTier === 'ultra';

  const coreAvatar =
    safeSrc && !imgFailed ? (
      <img
        src={safeSrc}
        alt={name || email || 'User profile'}
        referrerPolicy="no-referrer"
        onError={() => setImgFailed(true)}
        className={`${sizeClass} rounded-full object-cover shrink-0 bg-slate-800 block`}
      />
    ) : (
      <div
        aria-hidden="true"
        className={`${sizeClass} rounded-full bg-[#152E4D] dark:bg-blue-900 text-white font-extrabold flex items-center justify-center shrink-0 select-none`}
      >
        {initials}
      </div>
    );

  const ringWrapper = hasAiRing ? (
    <span
      className={`inline-flex items-center justify-center rounded-full shrink-0 ${
        subscriptionTier === 'ultra' ? 'google-ai-ring-ultra' : 'google-ai-ring-pro'
      } ${RING_PADDING_CLASSES[size].outer} ${className}`}
    >
      <span
        className={`inline-flex items-center justify-center rounded-full bg-white dark:bg-slate-900 ${RING_PADDING_CLASSES[size].spacer}`}
      >
        {coreAvatar}
      </span>
    </span>
  ) : (
    <span
      className={`inline-flex items-center justify-center rounded-full shrink-0 ${RING_CLASSES[highlight]} ${className}`}
    >
      {coreAvatar}
    </span>
  );

  if (!showEditBadge) {
    return ringWrapper;
  }

  return (
    <span className="relative inline-flex shrink-0">
      {ringWrapper}
      <button
        type="button"
        onClick={onEditClick}
        aria-label="Change profile picture"
        title="Change profile picture"
        className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-[#F1F5F9] hover:bg-white text-slate-800 border border-slate-200 shadow-sm flex items-center justify-center transition-transform hover:scale-105 cursor-pointer"
      >
        <Pencil className="w-3 h-3 stroke-[2.4]" />
      </button>
    </span>
  );
};
