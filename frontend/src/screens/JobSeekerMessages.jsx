import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import JobSeekerLayout from '../components/JobSeekerLayout';
import { ChatIcon, ArrowRightIcon } from '../components/Icons';
import { api } from '../api/client';
import { timeAgo } from '../utils/date';

function initials(name) {
  return String(name || '?').split(' ').filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
}

export default function JobSeekerMessages() {
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState('agent');
  const [agent, setAgent] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [activeUserId, setActiveUserId] = useState(null);
  const [thread, setThread] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sending, setSending] = useState(false);
  const [showChatOnMobile, setShowChatOnMobile] = useState(false);
  const scrollRef = useRef(null);

  const [adminMessages, setAdminMessages] = useState([]);
  const [adminLoading, setAdminLoading] = useState(true);
  const [openAdminId, setOpenAdminId] = useState(null);

  const loadAdminMessages = () => api.getMessages().then((d) => setAdminMessages(d.messages || [])).catch(() => {}).finally(() => setAdminLoading(false));
  useEffect(() => { loadAdminMessages(); }, []);

  const openAdminMessage = async (m) => {
    setOpenAdminId(m.id);
    if (!m.read) {
      try {
        await api.markMessageRead(m.id);
        setAdminMessages((ms) => ms.map((x) => (x.id === m.id ? { ...x, read: true } : x)));
      } catch { /* non-fatal */ }
    }
  };

  const loadConversations = () => Promise.all([api.listConversations(), api.getMyAgent()])
    .then(([c, a]) => {
      setAgent(a.agent);
      let list = c.conversations || [];
      // If connected to an agent but no messages have been exchanged yet,
      // still show them as a startable conversation.
      if (a.agent && !list.some((x) => x.userId === a.agent.userId)) {
        list = [{ userId: a.agent.userId, name: a.agent.fullName, role: 'agent', lastMessage: null, lastMessageAt: null, unreadCount: 0 }, ...list];
      }
      setConversations(list);
      return list;
    })
    .catch(() => [])
    .finally(() => setLoading(false));

  useEffect(() => {
    loadConversations().then((list) => {
      const withParam = searchParams.get('with');
      if (withParam) {
        openConversation(withParam);
      } else if (list.length === 1) {
        openConversation(list[0].userId);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openConversation = (userId) => {
    setActiveUserId(userId);
    setShowChatOnMobile(true);
    setLoadingThread(true);
    api.getConversation(userId)
      .then((d) => { setThread(d.messages || []); })
      .catch(() => {})
      .finally(() => setLoadingThread(false));
    api.markConversationRead(userId).then(() => {
      setConversations((prev) => prev.map((c) => (c.userId === userId ? { ...c, unreadCount: 0 } : c)));
    }).catch(() => {});
  };

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [thread]);

  // Light polling for the open thread — the spec allows "real time updates
  // can be added later," this is a simple stand-in that keeps the chat
  // feeling current without a websocket.
  useEffect(() => {
    if (!activeUserId) return undefined;
    const timer = setInterval(() => {
      api.getConversation(activeUserId).then((d) => setThread(d.messages || [])).catch(() => {});
    }, 8000);
    return () => clearInterval(timer);
  }, [activeUserId]);

  const send = async () => {
    if (!text.trim() || !activeUserId) return;
    setSending(true);
    try {
      const res = await api.sendChatMessage(activeUserId, text.trim());
      setThread((prev) => [...prev, res.message]);
      setText('');
      loadConversations();
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert(err.message);
    } finally {
      setSending(false);
    }
  };

  const activeConv = conversations.find((c) => c.userId === activeUserId);

  return (
    <JobSeekerLayout active="messages">
      <h1 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 16px' }}>Messages</h1>

      <div className="row" style={{ gap: 8, marginBottom: 16 }}>
        <button className={`btn btn-sm ${tab === 'agent' ? 'btn-primary' : 'btn-outline'}`} style={{ width: 'auto' }} onClick={() => setTab('agent')}>Placement Agent</button>
        <button className={`btn btn-sm ${tab === 'admin' ? 'btn-primary' : 'btn-outline'}`} style={{ width: 'auto' }} onClick={() => setTab('admin')}>ClearCall Team</button>
      </div>

      {tab !== 'agent' ? null : loading ? (
        <div className="card muted small">Loading…</div>
      ) : conversations.length === 0 ? (
        <div className="card jsk-empty-state">
          <ChatIcon size={36} color="#cbd5e1" />
          <div style={{ marginTop: 10 }}>Connect with a placement agent to start messaging.</div>
        </div>
      ) : (
        <div className="jsk-chat-shell">
          <div className={`jsk-chat-list ${showChatOnMobile ? 'jsk-chat-hide-mobile' : ''}`}>
            {conversations.map((c) => (
              <div
                key={c.userId}
                className="jsk-chat-list-item"
                style={{ background: activeUserId === c.userId ? 'var(--grey-100)' : 'transparent' }}
                onClick={() => openConversation(c.userId)}
              >
                <div className="jsk-job-logo" style={{ borderRadius: '50%', flexShrink: 0 }}>{initials(c.name)}</div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="row-between">
                    <span className="bold small">{c.name}</span>
                    {c.lastMessageAt && <span className="muted xs" style={{ flexShrink: 0 }}>{timeAgo(c.lastMessageAt)}</span>}
                  </div>
                  <div className="muted xs" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.lastMessage ? `${c.lastMessageFromMe ? 'You: ' : ''}${c.lastMessage}` : 'Say hello to start the conversation'}
                  </div>
                </div>
                {c.unreadCount > 0 && <span className="badge badge-green" style={{ flexShrink: 0 }}>{c.unreadCount}</span>}
              </div>
            ))}
          </div>

          <div className={`jsk-chat-thread ${showChatOnMobile ? '' : 'jsk-chat-hide-mobile'}`}>
            {!activeUserId ? (
              <div className="jsk-empty-state" style={{ height: '100%' }}>
                <ChatIcon size={32} color="#cbd5e1" />
                <div style={{ marginTop: 10 }}>Select a conversation to start chatting.</div>
              </div>
            ) : (
              <>
                <div className="jsk-chat-thread-header">
                  <button className="jsk-chat-back" onClick={() => setShowChatOnMobile(false)}>
                    <span style={{ transform: 'rotate(180deg)', display: 'inline-flex' }}><ArrowRightIcon size={16} color="#334155" /></span>
                  </button>
                  <div className="jsk-job-logo" style={{ borderRadius: '50%', width: 32, height: 32, fontSize: 12 }}>{initials(activeConv?.name)}</div>
                  <span className="bold small">{activeConv?.name}</span>
                </div>

                <div className="jsk-chat-messages" ref={scrollRef}>
                  {loadingThread ? (
                    <div className="muted small" style={{ textAlign: 'center', marginTop: 20 }}>Loading…</div>
                  ) : thread.length === 0 ? (
                    <div className="muted small" style={{ textAlign: 'center', marginTop: 20 }}>No messages yet. Say hello!</div>
                  ) : (
                    thread.map((m) => (
                      <div key={m.id} className={`jsk-chat-bubble-row ${m.fromMe ? 'me' : ''}`}>
                        <div className={`jsk-chat-bubble ${m.fromMe ? 'jsk-chat-bubble-me' : 'jsk-chat-bubble-them'}`}>
                          {m.content}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="jsk-chat-input-row">
                  <input
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                    placeholder="Type a message…"
                    style={{ flex: 1, padding: '10px 14px', border: '2px solid var(--grey-200)', borderRadius: 20, fontSize: 14 }}
                  />
                  <button className="btn btn-primary btn-sm" style={{ width: 'auto', borderRadius: 20 }} onClick={send} disabled={sending || !text.trim()}>Send</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {tab !== 'admin' ? null : adminLoading ? (
        <div className="card muted small">Loading…</div>
      ) : adminMessages.length === 0 ? (
        <div className="card jsk-empty-state">
          <ChatIcon size={36} color="#cbd5e1" />
          <div style={{ marginTop: 10 }}>No messages yet. Messages from the ClearCall team will show up here.</div>
        </div>
      ) : (
        <div className="stack">
          {adminMessages.map((m) => (
            <div key={m.id} className="card" style={{ cursor: 'pointer', borderLeft: m.read ? undefined : '3px solid var(--green)' }} onClick={() => openAdminMessage(m)}>
              <div className="row-between">
                <span className="bold small">{m.subject}</span>
                <span className="muted xs">{timeAgo(m.createdAt)}</span>
              </div>
              {openAdminId === m.id ? (
                <div className="small" style={{ marginTop: 10, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{m.message}</div>
              ) : (
                <div className="muted xs" style={{ marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.message}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </JobSeekerLayout>
  );
}
