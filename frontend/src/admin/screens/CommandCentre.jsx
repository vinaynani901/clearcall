import { useEffect, useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../api/adminClient';
import { AdminBadge } from '../components/AdminUI';
import Sparkline, { smoothPath } from '../components/Sparkline';
import CircularGauge from '../components/CircularGauge';
import { timeAgo } from '../../utils/date';

const COLORS = {
  green: '#10b981', blue: '#3b82f6', purple: '#a855f7', orange: '#f59e0b', red: '#ef4444',
};

function formatMoney(n) {
  return `$${Number(n || 0).toLocaleString('en-AU')}`;
}

// ---- Stat card -------------------------------------------------------
function StatCard({ icon, color, label, value, deltaPct, deltaLabel, sub, sparkData, onClick }) {
  return (
    <div className="cc-stat-card" onClick={onClick}>
      <div className="cc-stat-top">
        <div className="cc-stat-icon" style={{ background: color, color }}>{icon}</div>
        {deltaPct !== null && deltaPct !== undefined && (
          <div className={`cc-stat-delta ${deltaPct >= 0 ? 'up' : 'down'}`}>
            {deltaPct >= 0 ? '▲' : '▼'} {Math.abs(deltaPct)}%
          </div>
        )}
      </div>
      <div className="cc-stat-label">{label}</div>
      <div className="cc-stat-value">{value}</div>
      {sub && <div className="cc-stat-sub">{sub}</div>}
      {deltaLabel && !sub && <div className="cc-stat-sub cc-stat-sub-muted">{deltaLabel}</div>}
      <div className="cc-stat-spark"><Sparkline data={sparkData} color={color} /></div>
    </div>
  );
}

// ---- Revenue area chart (12-month, glowing) ---------------------------
function RevenueAreaChart({ trend }) {
  const gradientId = useId();
  if (!trend || trend.length === 0) return null;

  const width = 480;
  const height = 180;
  const padTop = 10;
  const padBottom = 24;
  const values = trend.map((t) => t.mrr);
  const max = Math.max(...values, 1);
  const stepX = width / (trend.length - 1 || 1);
  const points = values.map((v, i) => [i * stepX, padTop + (1 - v / max) * (height - padTop - padBottom)]);
  const linePath = smoothPath(points);
  const areaPath = `${linePath} L ${width},${height - padBottom} L 0,${height - padBottom} Z`;

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
      <path
        d={linePath} fill="none" stroke="#3b82f6" strokeWidth="2.25"
        strokeLinecap="round" strokeLinejoin="round"
        style={{ filter: 'drop-shadow(0 0 6px rgba(59,130,246,0.7))' }}
      />
      {trend.map((t, i) => (
        <text key={t.month} x={i * stepX} y={height - 6} fontSize="9" fill="#64748b" textAnchor={i === 0 ? 'start' : i === trend.length - 1 ? 'end' : 'middle'}>
          {t.label.split(' ')[0]}
        </text>
      ))}
    </svg>
  );
}

// ---- Stylised Australia map with scam-report hotspots ------------------
const AU_OUTLINE = 'M200,20 L230,45 L245,75 L248,100 L232,130 L225,150 L218,168 L205,190 L195,205 L185,228 L165,248 L145,262 L120,268 L95,260 L75,245 L58,222 L45,195 L35,165 L30,130 L33,95 L45,65 L65,40 L90,22 L120,14 L150,12 L180,15 Z';

function ScamMap({ hotspots }) {
  const max = Math.max(1, ...hotspots.map((h) => h.count));
  const colorFor = (intensity) => (intensity === 'high' ? COLORS.red : intensity === 'medium' ? COLORS.orange : COLORS.green);

  return (
    <svg viewBox="0 0 260 290" width="100%" height="220" style={{ display: 'block' }}>
      <path d={AU_OUTLINE} fill="rgba(59,130,246,0.06)" stroke="rgba(59,130,246,0.35)" strokeWidth="1.5" />
      {hotspots.map((h) => {
        const r = 4 + (h.count / max) * 10;
        const color = colorFor(h.intensity);
        return (
          <g key={h.city}>
            <circle cx={h.x} cy={h.y} r={r + 6} fill={color} opacity="0.18">
              <animate attributeName="r" values={`${r + 4};${r + 10};${r + 4}`} dur="2.4s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.22;0.05;0.22" dur="2.4s" repeatCount="indefinite" />
            </circle>
            <circle cx={h.x} cy={h.y} r={r} fill={color} style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
          </g>
        );
      })}
    </svg>
  );
}

// ---- Live activity feed dot color lookup --------------------------------
const DOT_COLOR = { green: COLORS.green, blue: COLORS.blue, orange: COLORS.orange, red: COLORS.red, purple: COLORS.purple, yellow: '#eab308' };

export default function CommandCentre() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [activity, setActivity] = useState([]);
  const [hotspots, setHotspots] = useState(null);
  const [verificationQueue, setVerificationQueue] = useState([]);
  const [revenue, setRevenue] = useState(null);
  const [aiInput, setAiInput] = useState('');
  const [now, setNow] = useState(new Date());
  const [lastUpdated, setLastUpdated] = useState(null);

  const loadAll = () => {
    adminApi.commandCentre().then(setData).catch(() => {});
    adminApi.commandCentreActivity(20).then((d) => setActivity(d.events)).catch(() => {});
    adminApi.scamHotspots().then(setHotspots).catch(() => {});
    adminApi.getVerificationQueue().then((d) => setVerificationQueue(d.queue.slice(0, 5))).catch(() => {});
    adminApi.revenue().then(setRevenue).catch(() => {});
    setLastUpdated(new Date());
  };

  useEffect(() => {
    loadAll();
    const t = setInterval(loadAll, 30000);
    const clock = setInterval(() => setNow(new Date()), 30000);
    return () => { clearInterval(t); clearInterval(clock); };
  }, []);

  const riskFor = (entry) => {
    if (entry.flags.length >= 2) return 'HIGH';
    if (entry.flags.length === 1) return 'MEDIUM';
    return 'LOW';
  };
  const riskTone = { HIGH: 'red', MEDIUM: 'orange', LOW: 'green' };

  const sendAiQuick = async () => {
    if (!aiInput.trim()) return;
    navigate('/admin/ai-assistant', { state: { initialMessage: aiInput.trim() } });
  };

  const spark = data?.sparklines;

  return (
    <div className="cc-page">
      <div className="cc-header">
        <div>
          <div className="cc-title">Command Centre</div>
          <div className="cc-subtitle">
            {now.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · {now.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}
          </div>
        </div>
        {lastUpdated && <div className="cc-updated">Last updated {lastUpdated.toLocaleTimeString('en-AU')}</div>}
      </div>

      {/* ---- Stat cards ---- */}
      <div className="cc-stats-grid">
        <StatCard
          icon="📞" color={COLORS.green} label="Verified Calls Today"
          value={data ? data.stats.verifiedCallsToday : '—'}
          deltaPct={spark ? spark.verifiedCalls.changePct : null} deltaLabel="vs yesterday"
          sparkData={spark?.verifiedCalls.series} onClick={() => navigate('/admin/companies')}
        />
        <StatCard
          icon="🏢" color={COLORS.blue} label="Active Companies"
          value={data ? data.stats.activeCompanies : '—'}
          deltaPct={spark ? spark.activeCompanies.changePct : null} deltaLabel="vs last week"
          sparkData={spark?.activeCompanies.series} onClick={() => navigate('/admin/companies')}
        />
        <StatCard
          icon="👤" color={COLORS.purple} label="New Job Seekers (7d)"
          value={spark ? spark.newJobSeekers.total : '—'}
          deltaPct={spark ? spark.newJobSeekers.changePct : null} deltaLabel="vs last week"
          sparkData={spark?.newJobSeekers.series} onClick={() => navigate('/admin/jobseekers')}
        />
        <StatCard
          icon="🛡️" color={COLORS.orange} label="Scam Reports Pending"
          value={data ? data.stats.scamReportsPending : '—'}
          sub={spark && spark.scamReports.newToday > 0 ? `+${spark.scamReports.newToday} new today` : null}
          sparkData={spark?.scamReports.series} onClick={() => navigate('/admin/scam-reports')}
        />
        <StatCard
          icon="💲" color={COLORS.green} label="Revenue This Month"
          value={data ? formatMoney(data.stats.revenueThisMonth) : '—'}
          deltaPct={spark ? spark.revenue.changePct : null} deltaLabel="vs last month"
          sparkData={spark?.revenue.series} onClick={() => navigate('/admin/revenue')}
        />
        <StatCard
          icon="📡" color={COLORS.blue} label="System Uptime"
          value={data ? `${data.healthPct}%` : '—'}
          deltaLabel="no historical data" sparkData={spark?.health.series}
          onClick={() => navigate('/admin/system-health')}
        />
      </div>

      {/* ---- Middle row ---- */}
      <div className="cc-row cc-row-3">
        <div className="cc-panel">
          <div className="cc-panel-header">
            <div className="cc-panel-title">LIVE ACTIVITY FEED</div>
            <div className="cc-live-badge"><span className="cc-live-dot" />LIVE</div>
          </div>
          <div className="cc-activity-list">
            {activity.length === 0 ? (
              <div className="cc-empty">No recent activity.</div>
            ) : activity.map((e, i) => (
              <div key={i} className="cc-activity-row" onClick={() => navigate(e.link)}>
                <span className="cc-activity-dot" style={{ background: DOT_COLOR[e.color], boxShadow: `0 0 6px ${DOT_COLOR[e.color]}` }} />
                <div className="cc-activity-body">
                  <div className="cc-activity-desc">{e.description}</div>
                  <div className="cc-activity-time">{timeAgo(e.timestamp)}</div>
                </div>
              </div>
            ))}
          </div>
          <button className="cc-view-all" onClick={() => navigate('/admin/companies')}>VIEW ALL ACTIVITY →</button>
        </div>

        <div className="cc-panel">
          <div className="cc-panel-header">
            <div className="cc-panel-title">VERIFICATION QUEUE</div>
            {verificationQueue.length > 0 && <AdminBadge tone="orange">{verificationQueue.length}</AdminBadge>}
          </div>
          {verificationQueue.length === 0 ? (
            <div className="cc-empty">Nothing pending review.</div>
          ) : (
            <div className="cc-vq-mini-list">
              {verificationQueue.map((e) => {
                const risk = riskFor(e);
                const agePct = e.abnAgeMonths === null ? 0 : Math.min(100, Math.round((e.abnAgeMonths / 24) * 100));
                const ageColor = e.abnAgeMonths === null ? '#64748b' : e.abnAgeMonths >= 12 ? COLORS.green : e.abnAgeMonths >= 6 ? COLORS.orange : COLORS.red;
                return (
                  <div key={e.id} className={`cc-vq-row ${risk === 'HIGH' ? 'cc-vq-row-danger' : ''}`} onClick={() => navigate('/admin/verification-queue')}>
                    <div className="cc-vq-row-top">
                      <div className="cc-vq-name">{e.companyName}</div>
                      <AdminBadge tone={riskTone[risk]}>{risk}</AdminBadge>
                    </div>
                    <div className="cc-vq-agebar-track">
                      <div className="cc-vq-agebar-fill" style={{ width: `${agePct}%`, background: ageColor }} />
                    </div>
                    <div className="cc-vq-age-label">{e.abnAgeMonths === null ? 'ABN age unknown' : `ABN ${e.abnAgeMonths}mo old`}</div>
                  </div>
                );
              })}
            </div>
          )}
          <button className="cc-view-all" onClick={() => navigate('/admin/companies')}>VIEW ALL COMPANIES →</button>
        </div>

        <div className="cc-panel">
          <div className="cc-panel-header">
            <div className="cc-panel-title">REVENUE OVERVIEW</div>
            <button className="cc-link-btn" onClick={() => navigate('/admin/revenue')}>LAST 12 MONTHS</button>
          </div>
          <div className="cc-mrr-value">{revenue ? formatMoney(revenue.mrr) : '—'}</div>
          {revenue && (
            <div className={`cc-mrr-delta ${revenue.netNewMrrThisMonth >= 0 ? 'up' : 'down'}`}>
              {revenue.netNewMrrThisMonth >= 0 ? '▲' : '▼'} {formatMoney(Math.abs(revenue.netNewMrrThisMonth))} this month
            </div>
          )}
          <RevenueAreaChart trend={revenue?.trend} />
        </div>
      </div>

      {/* ---- Needs Attention ---- */}
      {data && data.needsAttention && data.needsAttention.length > 0 && (
        <div className="cc-row" style={{ gridTemplateColumns: '1fr' }}>
          <div className="cc-panel">
            <div className="cc-panel-header">
              <div className="cc-panel-title">NEEDS ATTENTION</div>
              <AdminBadge tone="orange">{data.needsAttention.length}</AdminBadge>
            </div>
            <div className="cc-activity-list">
              {data.needsAttention.map((a, i) => (
                <div key={i} className="cc-activity-row" onClick={() => navigate(a.link)}>
                  <span className="cc-activity-dot" style={{ background: DOT_COLOR[a.level], boxShadow: `0 0 6px ${DOT_COLOR[a.level]}` }} />
                  <div className="cc-activity-body">
                    <div className="cc-activity-time" style={{ marginTop: 0 }}>{a.category}</div>
                    <div className="cc-activity-desc">{a.label}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ---- Bottom row ---- */}
      <div className="cc-row cc-row-3">
        <div className="cc-panel">
          <div className="cc-panel-header">
            <div className="cc-panel-title">SYSTEM HEALTH MONITOR</div>
          </div>
          <div className="cc-gauge-grid">
            {(data?.systemHealth || []).map((s) => (
              <div key={s.name} className="cc-gauge-item">
                <CircularGauge percent={s.status === 'operational' ? 100 : 0} size={72} strokeWidth={6} />
                <div className="cc-gauge-name">{s.name}</div>
              </div>
            ))}
          </div>
          <div className={`cc-health-footer ${data && data.healthPct === 100 ? 'ok' : 'warn'}`}>
            {data && data.healthPct === 100 ? 'ALL SYSTEMS RUNNING OPTIMALLY' : 'SOME SERVICES NEED ATTENTION'}
          </div>
        </div>

        <div className="cc-panel">
          <div className="cc-panel-header">
            <div className="cc-panel-title">SCAM DETECTION MAP</div>
            <div className="cc-live-badge cc-live-badge-red"><span className="cc-live-dot cc-live-dot-red" />LIVE HOTSPOTS</div>
          </div>
          <div className="cc-map-layout">
            <ScamMap hotspots={hotspots?.hotspots || []} />
            <div className="cc-hotspot-list">
              <div className="cc-hotspot-list-title">TOP HOTSPOT AREAS</div>
              {(hotspots?.top5 || []).length === 0 ? (
                <div className="cc-empty" style={{ padding: '8px 0' }}>No location data yet.</div>
              ) : hotspots.top5.map((h) => (
                <div key={h.city} className="cc-hotspot-row">
                  <span>{h.city}</span>
                  <span className="cc-hotspot-count">{h.count}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="cc-map-legend">
            <span><i style={{ background: COLORS.green }} /> LOW</span>
            <span><i style={{ background: COLORS.orange }} /> MEDIUM</span>
            <span><i style={{ background: COLORS.red }} /> HIGH</span>
          </div>
        </div>

        <div className="cc-panel cc-ai-panel">
          <div className="cc-panel-header">
            <div className="cc-panel-title">AI ASSISTANT</div>
            <div className="cc-ai-badge">CLAUDE AI</div>
          </div>
          <div className="cc-ai-avatar-wrap">
            <div className="cc-ai-avatar">✦
              <span className="cc-ai-ring cc-ai-ring-1" />
              <span className="cc-ai-ring cc-ai-ring-2" />
            </div>
          </div>
          <div className="cc-ai-greeting">I am Claude, your AI assistant. How can I help you today?</div>
          <div className="cc-ai-input-row">
            <input
              value={aiInput}
              onChange={(e) => setAiInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') sendAiQuick(); }}
              placeholder="Ask Claude anything…"
            />
            <button onClick={sendAiQuick} aria-label="Send">➤</button>
          </div>
          <div className="cc-ai-status"><span className="cc-live-dot" />ACTIVE AND LISTENING</div>
        </div>
      </div>
    </div>
  );
}
