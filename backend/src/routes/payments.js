const express = require('express');
const router = express.Router();
const { getStripe, PLANS, isConfigured } = require('../services/stripe');
const db = require('../db');

router.get('/config', (req, res) => {
  res.json({ publishableKey: process.env.STRIPE_PUBLISHABLE_KEY, configured: isConfigured() });
});

router.post('/create-checkout', async (req, res) => {
  if (!isConfigured()) return res.status(503).json({ error: 'Payments not configured' });

  try {
    const { planId, userId, userType } = req.body;
    const plan = PLANS[planId];
    if (!plan) return res.status(400).json({ error: 'Invalid plan' });

    const s = getStripe();
    if (!s) return res.status(503).json({ error: 'Payments not configured' });

    const session = await s.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [{
        price_data: {
          currency: plan.currency,
          product_data: { name: plan.name },
          recurring: { interval: plan.interval },
          unit_amount: plan.amount,
        },
        quantity: 1,
      }],
      success_url: process.env.FRONTEND_URL + '/upgrade/success?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: process.env.FRONTEND_URL + '/pricing',
      metadata: { userId, userType, planId },
    });

    res.json({ url: session.url });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!isConfigured()) return res.status(503).json({ error: 'Not configured' });

  const sig = req.headers['stripe-signature'];
  const s = getStripe();
  if (!s) return res.status(503).json({ error: 'Not configured' });

  try {
    const event = s.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const { userId, userType, planId } = session.metadata;
      const plan = planId.replace('jobseeker_', '').replace('employer_', '');

      if (userType === 'jobseeker') {
        db.prepare('UPDATE users SET plan = ? WHERE id = ?').run(plan, userId);
      } else {
        db.prepare('UPDATE companies SET plan = ? WHERE id = ?').run(plan, userId);
      }
    }

    res.json({ received: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;