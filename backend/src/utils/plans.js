// AUD monthly pricing — there is no real Stripe/billing integration yet, so
// "revenue" figures across the admin panel (Revenue portal, Command Centre,
// Plan Control's Live Plan Dashboard) are computed from this static price
// list against each company/user's `plan` column. Update these once real
// subscription pricing/billing is wired up.
// enterprise_plus has no fixed price (Contact Us / custom quote) — price is
// `null` rather than a number, which the frontend/admin treat as "show
// Contact Us instead of a dollar figure" wherever PLAN_PRICES is read.
const PLAN_PRICES = { free: 0, starter: 49, growth: 149, enterprise: 499, enterprise_plus: null };
const PLAN_LABELS = { free: 'Free', starter: 'Starter', growth: 'Growth', enterprise: 'Enterprise', enterprise_plus: 'Enterprise Plus' };
const PLANS = ['free', 'starter', 'growth', 'enterprise', 'enterprise_plus'];

// Job seeker side has its own, separate plan tiers on users.plan.
const JOBSEEKER_PLAN_PRICES = { free: 0, premium: 9.99, premium_plus: 19.99 };
const JOBSEEKER_PLAN_LABELS = { free: 'Free', premium: 'Premium', premium_plus: 'Premium Plus' };
const JOBSEEKER_PLANS = ['free', 'premium', 'premium_plus'];

module.exports = {
  PLAN_PRICES, PLAN_LABELS, PLANS,
  JOBSEEKER_PLAN_PRICES, JOBSEEKER_PLAN_LABELS, JOBSEEKER_PLANS,
};
