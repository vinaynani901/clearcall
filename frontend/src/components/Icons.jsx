export function ShieldCheck({ size = 64, color = '#ffffff', bg = 'transparent' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      {bg !== 'transparent' && <circle cx="32" cy="32" r="32" fill={bg} />}
      <path
        d="M32 6 L54 14 V30 C54 44 45 54 32 58 C19 54 10 44 10 30 V14 L32 6Z"
        fill={color}
        stroke={color}
        strokeWidth="1"
      />
      <path
        d="M22 32 L29 39 L43 24"
        stroke={bg !== 'transparent' ? bg : '#1e3a8a'}
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
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

export function HomeIcon({ active }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M4 11.5L12 4l8 7.5V20a1 1 0 01-1 1h-4v-6H9v6H5a1 1 0 01-1-1v-8.5Z"
        fill={active ? '#1e3a8a' : 'none'} stroke={active ? '#1e3a8a' : '#94a3b8'} strokeWidth="2" strokeLinejoin="round" />
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

export function ProfileIcon({ active }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="8" r="4" fill={active ? '#1e3a8a' : 'none'} stroke={active ? '#1e3a8a' : '#94a3b8'} strokeWidth="2" />
      <path d="M4 20c0-4 4-6 8-6s8 2 8 6" stroke={active ? '#1e3a8a' : '#94a3b8'} strokeWidth="2" strokeLinecap="round" />
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

export function CheckCircle({ size = 96, animate = true }) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" fill="none" className={animate ? 'check-pop' : ''}>
      <circle cx="48" cy="48" r="48" fill="#10b981" />
      <path d="M30 49 L42 61 L67 35" stroke="#ffffff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
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
