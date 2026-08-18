// ClearCall brand mark — a glowing open ring forming a "C". This is the single
// shared logo used everywhere in the app (main app + admin panel); every
// call site just passes size/color so the mark stays visually identical.
let ccLogoUid = 0;
export function ShieldCheck({ size = 64, color = '#ffffff', bg = 'transparent', glow = true }) {
  const r = 22;
  const strokeWidth = 9;
  const circumference = 2 * Math.PI * r;
  const gapDeg = 68;
  const dash = circumference * ((360 - gapDeg) / 360);
  const gap = circumference * (gapDeg / 360);
  const uid = ccLogoUid += 1;
  const gradId = `cc-logo-grad-${uid}`;
  const glowId = `cc-logo-glow-${uid}`;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      {bg !== 'transparent' && <circle cx="32" cy="32" r="32" fill={bg} />}
      <defs>
        <linearGradient id={gradId} x1="10" y1="8" x2="54" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={color} stopOpacity="0.7" />
          <stop offset="100%" stopColor={color} stopOpacity="1" />
        </linearGradient>
        {glow && (
          <filter id={glowId} x="-75%" y="-75%" width="250%" height="250%">
            <feGaussianBlur stdDeviation="2.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        )}
      </defs>
      <circle
        cx="32"
        cy="32"
        r={r}
        stroke={`url(#${gradId})`}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${gap}`}
        filter={glow ? `url(#${glowId})` : undefined}
      />
    </svg>
  );
}

export function WarningTriangle({ size = 56, color = '#ffffff' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M32 6 L60 54 H4 L32 6Z" fill={color} />
      <rect x="29" y="24" width="6" height="16" rx="3" fill="#ef4444" />
      <circle cx="32" cy="46" r="3.5" fill="#ef4444" />
    </svg>
  );
}

export function PhoneIcon({ size = 24, color = '#64748b' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.5 21 3 13.5 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.4 0 .8-.2 1L6.6 10.8Z"
        fill={color}
      />
    </svg>
  );
}

export function HomeIcon({ active, size = 22, color }) {
  const c = color || (active ? '#1e3a8a' : '#94a3b8');
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M4 11.5L12 4l8 7.5V20a1 1 0 01-1 1h-4v-6H9v6H5a1 1 0 01-1-1v-8.5Z"
        fill={active ? c : 'none'} stroke={c} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

export function CallsIcon({ active }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.5 21 3 13.5 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.4 0 .8-.2 1L6.6 10.8Z"
        fill={active ? '#1e3a8a' : 'none'} stroke={active ? '#1e3a8a' : '#94a3b8'} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

export function ProfileIcon({ active, size = 22, color }) {
  const c = color || (active ? '#1e3a8a' : '#94a3b8');
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="8" r="4" fill={active ? c : 'none'} stroke={c} strokeWidth="2" />
      <path d="M4 20c0-4 4-6 8-6s8 2 8 6" stroke={c} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function SettingsIcon({ active }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="3" stroke={active ? '#1e3a8a' : '#94a3b8'} strokeWidth="2" />
      <path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.9 2.9l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.6V21a2 2 0 11-4 0v-.2a1.7 1.7 0 00-1-1.5 1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.9-2.9l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.2a1.7 1.7 0 001.5-1 1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.9-2.9l.1.1a1.7 1.7 0 001.9.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.2a1.7 1.7 0 001 1.6 1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.9 2.9l-.1.1a1.7 1.7 0 00-.3 1.9V9a1.7 1.7 0 001.6 1H21a2 2 0 110 4h-.2a1.7 1.7 0 00-1.4 1Z"
        stroke={active ? '#1e3a8a' : '#94a3b8'} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CandidatesIcon({ active }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="8" cy="8" r="3" stroke={active ? '#1e3a8a' : '#94a3b8'} strokeWidth="2" />
      <circle cx="16" cy="9" r="2.5" stroke={active ? '#1e3a8a' : '#94a3b8'} strokeWidth="2" />
      <path d="M2 20c0-3.3 2.7-6 6-6s6 2.7 6 6M14 20c0-2.6 1.8-4.8 4.2-5.5" stroke={active ? '#1e3a8a' : '#94a3b8'} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function MicIcon({ size = 24, color = '#1e293b', muted = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="9" y="2" width="6" height="12" rx="3" fill={color} />
      <path d="M5 11a7 7 0 0014 0M12 18v3" stroke={color} strokeWidth="2" strokeLinecap="round" fill="none" />
      {muted && <path d="M3 3L21 21" stroke="#ef4444" strokeWidth="2.4" strokeLinecap="round" />}
    </svg>
  );
}

export function TrashIcon({ size = 18, color = '#ef4444' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M4 7h16M9 7V4.5A1.5 1.5 0 0110.5 3h3A1.5 1.5 0 0115 4.5V7M6 7l1 13.5A1.5 1.5 0 008.5 22h7a1.5 1.5 0 001.5-1.5L18 7"
        stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M10 11v6M14 11v6" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function HangUpIcon({ size = 28, color = '#ffffff' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M2.5 12.3c4.6-4 14.4-4 19 0 .5.4.5 1.1.1 1.6l-2.3 2.7c-.4.5-1.1.5-1.6.2l-2.6-1.7a1.1 1.1 0 00-1.2 0c-.9.6-2.2.6-3.8 0a1.1 1.1 0 00-1.2 0l-2.6 1.7c-.5.3-1.2.3-1.6-.2l-2.3-2.7a1.2 1.2 0 01.1-1.6Z"
        fill={color}
      />
    </svg>
  );
}

export function CheckCircle({ size = 96, animate = true }) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" fill="none" className={animate ? 'check-pop' : ''}>
      <circle cx="48" cy="48" r="48" fill="#10b981" />
      <path d="M30 49 L42 61 L67 35" stroke="#ffffff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

export function BellIcon({ size = 20, color = '#334155' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M6 10a6 6 0 0112 0c0 3.2 1 5.2 1.8 6.2.3.4 0 1-.5 1H4.7c-.5 0-.8-.6-.5-1C5 15.2 6 13.2 6 10Z"
        stroke={color} strokeWidth="1.8" strokeLinejoin="round" fill="none" />
      <path d="M9.5 19.5a2.5 2.5 0 005 0" stroke={color} strokeWidth="1.8" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function ChevronDownIcon({ size = 14, color = '#64748b' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M6 9l6 6 6-6" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SearchIcon({ size = 18, color = '#94a3b8' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="11" cy="11" r="7" stroke={color} strokeWidth="2" />
      <path d="M21 21l-4.3-4.3" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function FilterIcon({ size = 18, color = '#64748b' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M4 6h16M7 12h10M10 18h4" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function DotsVerticalIcon({ size = 18, color = '#64748b' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="5" r="1.8" fill={color} />
      <circle cx="12" cy="12" r="1.8" fill={color} />
      <circle cx="12" cy="19" r="1.8" fill={color} />
    </svg>
  );
}

export function DocumentIcon({ size = 20, color = '#64748b' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M7 3h7l5 5v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1Z" stroke={color} strokeWidth="1.8" strokeLinejoin="round" fill="none" />
      <path d="M14 3v5h5" stroke={color} strokeWidth="1.8" strokeLinejoin="round" fill="none" />
      <path d="M9 13h6M9 17h6" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function BriefcaseIcon({ size = 20, color = '#64748b' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="3" y="8" width="18" height="12" rx="2" stroke={color} strokeWidth="1.8" />
      <path d="M8 8V6a2 2 0 012-2h4a2 2 0 012 2v2" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M3 13h18" stroke={color} strokeWidth="1.8" />
    </svg>
  );
}

export function HandshakeIcon({ size = 20, color = '#64748b' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M2 12l4-4 4 3 3-3 4 4-3 4-3-2-2 2z" stroke={color} strokeWidth="1.7" strokeLinejoin="round" fill="none" />
      <path d="M13 12l4 4 3-3-4-4" stroke={color} strokeWidth="1.7" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

export function ActivityIcon({ size = 20, color = '#64748b' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M3 12h4l2 7 4-14 2 7h6" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

export function ChatIcon({ size = 20, color = '#64748b' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M4 5h16a1 1 0 011 1v10a1 1 0 01-1 1H9l-5 4v-4H4a1 1 0 01-1-1V6a1 1 0 011-1Z" stroke={color} strokeWidth="1.8" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

export function HelpIcon({ size = 20, color = '#64748b' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.8" />
      <path d="M9.5 9.2a2.5 2.5 0 114 2c-.9.6-1.5 1.1-1.5 2.3" stroke={color} strokeWidth="1.8" strokeLinecap="round" fill="none" />
      <circle cx="12" cy="17.2" r="1" fill={color} />
    </svg>
  );
}

export function RocketIcon({ size = 24, color = '#ffffff' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M14.5 3.5c2.5 0 4.5 2 4.5 4.5 0 4-3.5 7.5-6 9l-3-3c1.5-2.5 5-6 4.5-10.5Z" fill={color} />
      <path d="M9.5 14 6 15.5 8.5 18 10 14.5" stroke={color} strokeWidth="1.6" strokeLinejoin="round" fill="none" />
      <circle cx="15" cy="9" r="1.5" fill="#1e3a8a" />
      <path d="M8 16c-2 .5-3 2.5-3 4.5 2 0 4-1 4.5-3" stroke={color} strokeWidth="1.4" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function CalendarIcon({ size = 20, color = '#64748b' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="3" y="5" width="18" height="16" rx="2" stroke={color} strokeWidth="1.8" />
      <path d="M3 10h18M8 3v4M16 3v4" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function GiftIcon({ size = 20, color = '#64748b' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="3" y="9" width="18" height="12" rx="1.5" stroke={color} strokeWidth="1.8" />
      <path d="M3 13h18M12 9v12" stroke={color} strokeWidth="1.8" />
      <path d="M12 9C9 9 8 6.5 9.5 5 11 3.5 12 6 12 9ZM12 9c3 0 4-2.5 2.5-4C13 3.5 12 6 12 9Z" stroke={color} strokeWidth="1.6" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

export function StarIcon({ size = 18, color = '#f59e0b' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 3l2.6 5.8 6.2.6-4.7 4.2 1.4 6.2L12 16.9 6.5 19.8l1.4-6.2-4.7-4.2 6.2-.6Z" fill={color} />
    </svg>
  );
}

export function RefreshIcon({ size = 18, color = '#f59e0b' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M4 12a8 8 0 0113.7-5.7L20 8M20 4v4h-4M20 12a8 8 0 01-13.7 5.7L4 16M4 20v-4h4" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

export function BookmarkIcon({ size = 18, color = '#94a3b8', filled = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M6 3h12a1 1 0 011 1v17l-7-4-7 4V4a1 1 0 011-1Z" stroke={color} strokeWidth="1.8" strokeLinejoin="round" fill={filled ? color : 'none'} />
    </svg>
  );
}

export function BuildingIcon({ size = 20, color = '#94a3b8' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="4" y="3" width="16" height="18" rx="1" stroke={color} strokeWidth="1.8" />
      <path d="M8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function ArrowRightIcon({ size = 14, color = '#94a3b8' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M9 6l6 6-6 6" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function DeclineIcon({ size = 20, color = '#ffffff' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M6 6l12 12M18 6L6 18" stroke={color} strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

export function KeyIcon({ size = 18, color = '#64748b' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="8" cy="15" r="4" stroke={color} strokeWidth="2" />
      <path d="M11 12l9-9M17 3l3 3M14 6l2.5 2.5" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function LockIcon({ size = 14, color = '#94a3b8' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="5" y="11" width="14" height="9" rx="2" stroke={color} strokeWidth="2" />
      <path d="M8 11V7a4 4 0 018 0v4" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function CheckTick({ size = 16, color = '#10b981' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M5 13l4 4L19 7" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CrossIcon({ size = 16, color = '#cbd5e1' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M6 6l12 12M18 6L6 18" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function XCircle({ size = 96 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" fill="none" className="check-pop">
      <circle cx="48" cy="48" r="48" fill="#ef4444" />
      <path d="M33 33 L63 63 M63 33 L33 63" stroke="#ffffff" strokeWidth="6" strokeLinecap="round" />
    </svg>
  );
}
