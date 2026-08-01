import OnboardingLayout from '../components/OnboardingLayout';

function Illustration() {
  return (
    <svg width="220" height="180" viewBox="0 0 220 180" fill="none">
      <circle cx="110" cy="90" r="70" fill="#f1f5f9" />
      <rect x="70" y="55" width="80" height="120" rx="16" fill="#334155" />
      <rect x="78" y="70" width="64" height="90" rx="4" fill="#e2e8f0" />
      <circle cx="110" cy="145" r="6" fill="#94a3b8" />
      <circle cx="152" cy="60" r="26" fill="#ef4444" />
      <path d="M141 49l22 22M163 49l-22 22" stroke="white" strokeWidth="4" strokeLinecap="round" />
      <text x="98" y="105" fontSize="11" fill="#64748b" fontWeight="700">?</text>
    </svg>
  );
}

export default function Onboarding1() {
  return (
    <OnboardingLayout
      step={1}
      illustration={<Illustration />}
      headline="Stop Scam Recruitment Calls"
      description="Scammers impersonate real recruiters and call job seekers with fake job offers. Right now there's no way to know if a recruitment call is genuine — until now."
      ctaLabel="Next"
      ctaTo="/onboarding/2"
    />
  );
}
