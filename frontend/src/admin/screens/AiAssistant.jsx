import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { adminApi } from '../api/adminClient';
import { AdminBadge, AdminErrorBanner } from '../components/AdminUI';

const SUGGESTIONS = [
  'How many companies are pending approval?',
  "What's our estimated MRR right now?",
  'Any urgent scam reports I should look at?',
  'Are there any open support tickets?',
];

export default function AiAssistant() {
  const location = useLocation();
  const [status, setStatus] = useState(null);
  const [messages, setMessages] = useState([]); // { role, content, toolCalls? }
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    adminApi.getAiAssistantStatus().then(setStatus).catch(() => setStatus({ configured: false }));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Hand-off from the Command Centre's mini AI widget — auto-send whatever
  // the admin typed there once the full chat is ready.
  useEffect(() => {
    const initial = location.state?.initialMessage;
    if (initial && status?.configured) {
      send(initial);
      window.history.replaceState({}, '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const send = async (text) => {
    const content = (text ?? input).trim();
    if (!content || sending) return;
    setError('');
    const nextMessages = [...messages, { role: 'user', content }];
    setMessages(nextMessages);
    setInput('');
    setSending(true);
    try {
      const data = await adminApi.sendAiAssistantMessage(nextMessages.map((m) => ({ role: m.role, content: m.content })));
      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply, toolCalls: data.toolCalls }]);
    } catch (err) {
      setError(err.message);
      // Keep the user's message in the thread (nextMessages already has it)
      // but don't add a broken assistant reply on top of it.
      setMessages(nextMessages);
    } finally {
      setSending(false);
    }
  };

  if (status && !status.configured) {
    return (
      <div>
        <div className="admin-page-header">
          <div>
            <div className="admin-page-title">AI Assistant</div>
          </div>
        </div>
        <div className="admin-card" style={{ textAlign: 'center', padding: 48 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🤖</div>
          <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 8 }}>Not configured yet</div>
          <div style={{ fontSize: 13.5, color: 'var(--a-grey-500)', maxWidth: 440, margin: '0 auto', lineHeight: 1.6 }}>
            The AI Assistant needs an Anthropic API key to run. Add <code>ANTHROPIC_API_KEY</code> to the backend's environment variables (and optionally <code>ANTHROPIC_MODEL</code> to choose a model), then restart the server.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">AI Assistant</div>
          <div className="admin-page-subtitle">
            Ask questions about real platform data — it looks things up live rather than guessing.
            {status?.model && <span> Model: {status.model}</span>}
          </div>
        </div>
      </div>

      <AdminErrorBanner message={error} />

      <div className="admin-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ maxHeight: 480, minHeight: 240, overflowY: 'auto', padding: 20 }}>
          {messages.length === 0 ? (
            <div>
              <div className="admin-table-empty" style={{ padding: '12px 0 20px' }}>Ask anything about companies, revenue, reports, or support tickets.</div>
              <div className="admin-row" style={{ gap: 8, flexWrap: 'wrap' }}>
                {SUGGESTIONS.map((s) => (
                  <button key={s} className="admin-btn admin-btn-outline admin-btn-sm" onClick={() => send(s)}>{s}</button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) => (
              <div key={i} style={{ marginBottom: 16, display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{ maxWidth: '80%' }}>
                  <div
                    style={{
                      background: m.role === 'user' ? 'var(--a-navy)' : 'var(--a-grey-100)',
                      color: m.role === 'user' ? '#fff' : 'var(--a-grey-700)',
                      padding: '10px 14px',
                      borderRadius: 12,
                      fontSize: 13.5,
                      lineHeight: 1.5,
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {m.content}
                  </div>
                  {m.toolCalls && m.toolCalls.length > 0 && (
                    <div className="admin-row" style={{ gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                      {m.toolCalls.map((tc, j) => (
                        <AdminBadge key={j} tone="navy">🔍 {tc.name.replace(/_/g, ' ')}</AdminBadge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          {sending && <div className="muted small" style={{ fontSize: 12.5, color: 'var(--a-grey-400)' }}>Thinking…</div>}
          <div ref={bottomRef} />
        </div>

        <div className="admin-row" style={{ gap: 10, padding: 16, borderTop: '1px solid var(--a-grey-200)' }}>
          <input
            style={{ flex: 1, padding: '10px 12px', border: '1.5px solid var(--a-grey-200)', borderRadius: 8, fontSize: 13.5 }}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Ask about companies, revenue, reports, tickets…"
            disabled={sending}
          />
          <button className="admin-btn admin-btn-primary" onClick={() => send()} disabled={sending || !input.trim()}>Send</button>
        </div>
      </div>
    </div>
  );
}
