import { useState } from 'react';
import { StatusBar, TopHeader } from '../components/Shared';

const FAQS = [
  { q: 'How does verification work?', a: 'Every employer must verify their Australian Business Number (ABN) against the government business register, and confirm their work email, before they can make any calls.' },
  { q: 'What if I receive an unverified call?', a: 'You will see a red warning screen instead of the usual verified screen. Proceed with caution, and decline and report it if anything feels suspicious.' },
  { q: 'How do I report a suspicious call?', a: 'Open Call History, find the call, and tap Report. Choose a reason and add any details — our team reviews every report.' },
  { q: 'Is my number private?', a: 'Yes. Job seekers never share a number to receive calls. Employers can hide their number by default in Call Display Settings — it stays hidden from receivers unless the employer chooses otherwise.' },
  { q: 'Can I use ClearCall for any profession?', a: 'Yes. ClearCall works for any organisation calling about a job or professional role — schools, hospitals, construction companies, government departments, and more.' },
  { q: 'How do I add a second work profile?', a: 'Go to Settings > My Work Profiles > Add Another Work Profile. Each profile needs its own ABN verification.' },
];

export default function HelpSupport() {
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState('');

  const filtered = FAQS.filter((f) => f.q.toLowerCase().includes(search.toLowerCase()));

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2000);
  };

  return (
    <>
      <StatusBar />
      <div className="screen">
        <TopHeader title="Help and Support" />

        <div className="field">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search FAQs…" />
        </div>

        <div className="stack mb-24">
          {filtered.map((f, i) => (
            <details key={i} className="card">
              <summary style={{ fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>{f.q}</summary>
              <p className="muted small" style={{ marginTop: 10, marginBottom: 0 }}>{f.a}</p>
            </details>
          ))}
        </div>

        <div className="stack">
          <button className="btn btn-outline" onClick={() => showToast('Contact Support — coming soon')}>Contact Support</button>
          <button className="btn btn-grey" onClick={() => showToast('Live Chat — coming soon')}>Live Chat</button>
        </div>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
