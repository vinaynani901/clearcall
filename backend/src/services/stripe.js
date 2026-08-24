const Stripe = require('stripe');

const PLANS = {
  jobseeker_premium: { name: 'Career Seekers Premium', amount: 999, currency: 'aud', interval: 'month' },
  jobseeker_premium_plus: { name: 'Career Seekers Premium Plus', amount: 1999, currency: 'aud', interval: 'month' },
  employer_starter: { name: 'Career Connector Starter', amount: 4900, currency: 'aud', interval: 'month' },
  employer_growth: { name: 'Career Connector Growth', amount: 14900, currency: 'aud', interval: 'month' },
  employer_enterprise: { name: 'Career Connector Enterprise', amount: 49900, currency: 'aud', interval: 'month' },
};

function isConfigured() {
  return !!process.env.STRIPE_SECRET_KEY && !process.env.STRIPE_SECRET_KEY.includes('your_stripe');
}

function getStripe() {
  if (!isConfigured()) return null;
  return Stripe(process.env.STRIPE_SECRET_KEY);
}

module.exports = { getStripe, PLANS, isConfigured };