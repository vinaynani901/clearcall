const express = require('express');
const { askAdminAssistant, isConfigured, currentModel } = require('../../services/aiAssistant');

const router = express.Router();

// GET /api/admin/ai-assistant/status
router.get('/status', (req, res) => {
  res.json({ configured: isConfigured(), model: isConfigured() ? currentModel() : null });
});

// POST /api/admin/ai-assistant/chat — body: { messages: [{ role: 'user'|'assistant', content: string }] }
router.post('/chat', async (req, res) => {
  const { messages } = req.body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array is required' });
  }

  // Normalise into the shape the Anthropic API expects (content as a
  // string is fine for plain user/assistant text turns).
  const formatted = messages.map((m) => ({ role: m.role, content: m.content }));

  try {
    const result = await askAdminAssistant(formatted);
    res.json(result);
  } catch (err) {
    if (err.notConfigured) return res.status(503).json({ error: err.message, notConfigured: true });
    res.status(502).json({ error: err.message });
  }
});

module.exports = router;
