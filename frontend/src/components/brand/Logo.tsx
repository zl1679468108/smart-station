import React, { useId } from 'react';

export type LogoVariant = 'mark' | 'full';

interface LogoProps {
  /** mark: 仅图标；full: 图标 + 文案 */
  variant?: LogoVariant;
  /** 图标高度（px），full 模式同时控制整体高度 */
  size?: number;
  className?: string;
  /** full 模式是否显示中文副标题 */
  showSubtitle?: boolean;
  /** 强制标题（默认 Smart Station / 智能快递驿站） */
  title?: string;
  subtitle?: string;
}

/**
 * Smart Station 品牌 Logo
 * 等距包裹立方体 + 驿站定位点，主色 #FF6A00
 */
const Logo: React.FC<LogoProps> = ({
  variant = 'mark',
  size = 28,
  className,
  showSubtitle = false,
  title = 'Smart Station',
  subtitle = '智能快递驿站',
}) => {
  const uid = useId().replace(/:/g, '');
  const topId = `ssLogoTop-${uid}`;
  const leftId = `ssLogoLeft-${uid}`;
  const rightId = `ssLogoRight-${uid}`;

  const mark = (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={variant === 'mark' ? className : 'shrink-0'}
      aria-hidden={variant === 'full' ? true : undefined}
      role={variant === 'mark' ? 'img' : undefined}
      aria-label={variant === 'mark' ? title : undefined}
    >
      <defs>
        <linearGradient id={topId} x1="10" y1="12" x2="54" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFB06A" />
          <stop offset="100%" stopColor="#FF8A33" />
        </linearGradient>
        <linearGradient id={leftId} x1="10" y1="20" x2="32" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FF7A1A" />
          <stop offset="100%" stopColor="#FF6A00" />
        </linearGradient>
        <linearGradient id={rightId} x1="32" y1="24" x2="56" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#F25F00" />
          <stop offset="100%" stopColor="#D14E00" />
        </linearGradient>
      </defs>
      <ellipse cx="32" cy="56.5" rx="16" ry="3.2" fill="#FF6A00" opacity="0.12" />
      <path fill={`url(#${leftId})`} d="M12 22.5L32 34v20L12 42.5V22.5Z" />
      <path fill={`url(#${rightId})`} d="M52 22.5L32 34v20l20-11.5V22.5Z" />
      <path fill={`url(#${topId})`} d="M32 10L52 21.5 32 33 12 21.5 32 10Z" />
      <path
        d="M32 33v21"
        stroke="#FFFFFF"
        strokeOpacity="0.35"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M12 22.5L32 34l20-11.5"
        fill="none"
        stroke="#FFFFFF"
        strokeOpacity="0.28"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        fill="#FFFFFF"
        d="M32 14.2c-3.1 0-5.6 2.4-5.6 5.4 0 3.8 5 8.8 5.3 9.1.2.2.4.2.6 0 .3-.3 5.3-5.3 5.3-9.1 0-3-2.5-5.4-5.6-5.4Zm0 7.6a2.2 2.2 0 1 1 0-4.4 2.2 2.2 0 0 1 0 4.4Z"
      />
    </svg>
  );

  if (variant === 'mark') return mark;

  return (
    <div className={`inline-flex items-center gap-2.5 ${className || ''}`}>
      {mark}
      <div className="min-w-0 leading-tight">
        <div
          className="truncate font-bold text-gray-800"
          style={{ fontSize: Math.max(14, Math.round(size * 0.55)) }}
        >
          {title}
        </div>
        {showSubtitle && (
          <div className="truncate text-xs font-medium text-gray-400">{subtitle}</div>
        )}
      </div>
    </div>
  );
};

export default Logo;
