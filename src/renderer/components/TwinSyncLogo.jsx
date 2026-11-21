import React, { useId } from 'react';

export function TwinSyncLogo({ size = 40, className = '' }) {
  const rawId = useId();
  const uid = `ts-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const bgId = `${uid}-bg`;
  const sheenId = `${uid}-sheen`;
  const glowId = `${uid}-glow`;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 256 256"
      width={size}
      height={size}
      className={className}
      aria-label="TwinSync Pro"
    >
      <defs>
        <linearGradient id={bgId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4F46E5" />
          <stop offset="50%" stopColor="#0EA5E9" />
          <stop offset="100%" stopColor="#10B981" />
        </linearGradient>
        <radialGradient id={sheenId} cx="24%" cy="18%" r="65%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.24" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={glowId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#E0F2FE" stopOpacity="0.45" />
          <stop offset="55%" stopColor="#E0F2FE" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#E0F2FE" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Rounded squircle background */}
      <rect x="12" y="12" width="232" height="232" rx="56" fill={`url(#${bgId})`} />
      <rect x="12" y="12" width="232" height="232" rx="56" fill={`url(#${sheenId})`} />
      <rect
        x="13.5"
        y="13.5"
        width="229"
        height="229"
        rx="54.5"
        fill="none"
        stroke="#FFFFFF"
        strokeOpacity="0.22"
        strokeWidth="3"
      />

      {/* Symmetric glowing twin nodes */}
      <circle cx="100" cy="128" r="26" fill={`url(#${glowId})`} />
      <circle cx="156" cy="128" r="26" fill={`url(#${glowId})`} />

      {/* Mirrored interlocking smooth sync arcs with rounded chevron arrowheads */}
      <g fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="16">
        <path
          d="M 62.32 110.40 A 68 68 0 0 1 193.68 110.40"
          stroke="#FFFFFF"
        />
        <path
          d="M 200.52 90.54 L 193.68 110.40 L 175.31 100.22"
          stroke="#FFFFFF"
        />
        <path
          d="M 193.68 145.60 A 68 68 0 0 1 62.32 145.60"
          stroke="#E0F2FE"
        />
        <path
          d="M 55.48 165.46 L 62.32 145.60 L 80.69 155.78"
          stroke="#E0F2FE"
        />
      </g>

      {/* Crisp twin node cores */}
      <circle cx="100" cy="128" r="12.5" fill="#FFFFFF" />
      <circle cx="156" cy="128" r="12.5" fill="#E0F2FE" />
    </svg>
  );
}

export default TwinSyncLogo;
