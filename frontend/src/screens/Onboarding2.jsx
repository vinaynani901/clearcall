import OnboardingLayout from '../components/OnboardingLayout';

function Illustration() {
  return (
    <svg width="220" height="180" viewBox="0 0 220 180" fill="none">
      <circle cx="110" cy="90" r="70" fill="#f1f5f9" />
      <rect x="55" y="70" width="110" height="70" rx="12" fill="#1e3a8a" />
      <rect x="68" y="84" width="60" height="10" rx="3" fill="white" opacity="0.85" />
      <rect x="68" y="100" width="40" height="8" rx="3" fill="white" opacity="0.5" />
      <circle cx="150" cy="115" r="24" fill="#10b981" />
      <path d="M140 115l7 7 13-14" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

export default function Onboarding2() {
  return (
    <OnboardingLayout
      step={2}
      illustration={<Illustration />}
      headline="Every Caller is ABN Verified"
      description="Every employer on ClearCall must verify their Australian Business Number before they can contact anyone — no exceptions."
      ctaLabel="Next"
      ctaTo="/onboarding/3"
    />
  );
}
