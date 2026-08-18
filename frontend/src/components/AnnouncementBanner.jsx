import { useEffect, useState } from 'react';
import { api } from '../api/client';

// Shown at the top of the employer/job seeker/agent home screens. Fetches
// active announcements targeted at the current user's role and lets them
// dismiss each one — dismissals are per-session only (in-memory), so a
// still-active announcement will show again next time they open the app.
export default function AnnouncementBanner() {
  const [announcements, setAnnouncements] = useState([]);
  const [dismissed, setDismissed] = useState([]);

  useEffect(() => {
    api.getActiveAnnouncements().then((d) => setAnnouncements(d.announcements || [])).catch(() => {});
  }, []);

  const visible = announcements.filter((a) => !dismissed.includes(a.id));
  if (visible.length === 0) return null;

  return (
    <div className="stack" style={{ gap: 8, marginBottom: 20 }}>
      {visible.map((a) => (
        <div key={a.id} className="card" style={{ background: 'var(--navy)', color: '#fff', position: 'relative', paddingRight: 36 }}>
          <div style={{ fontWeight: 800, fontSize: 13.5 }}>{a.title}</div>
          <div style={{ fontSize: 12.5, marginTop: 4, opacity: 0.9 }}>{a.body}</div>
          <button
            onClick={() => setDismissed((d) => [...d, a.id])}
            aria-label="Dismiss"
            style={{ position: 'absolute', top: 10, right: 10, background: 'none', border: 'none', color: '#fff', opacity: 0.75, cursor: 'pointer', fontSize: 14 }}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
