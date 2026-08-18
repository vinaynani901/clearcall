import { useNavigate } from 'react-router-dom';
import { StatusBar } from '../components/Shared';
import { ShieldCheck } from '../components/Icons';
import AuthShell from '../components/AuthShell';

export default function SignupSelect() {
  const navigate = useNavigate();
  return (
    <AuthShell>
      <StatusBar />
      <div className="screen">
        <div className="screen-centered" style={{ marginBottom: 12 }}>
          <ShieldCheck size={56} color="#1e3a8a" />
          <div className="brand-title dark" style={{ marginTop: 12 }}>ClearCall</div>
          <div className="brand-tagline dark">Know who is calling before you answer</div>
        </div>

        <div className="stack" style={{ marginTop: 24, gap: 16, flex: 1 }}>
          <div className="select-card" onClick={() => navigate('/signup/jobseeker')}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>🧑‍💼</div>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>I am a Job Seeker</div>
            <div className="muted small">I want to know when employer calls are genuine</div>
          </div>

          <div className="select-card" onClick={() => navigate('/signup/employer')}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>🏢</div>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>I am an Employer</div>
            <div className="muted small">I want to call candidates as a verified organisation</div>
          </div>
        </div>

        <div className="center" style={{ paddingTop: 4 }}>
          <span className="small muted">Recruitment agency? </span>
          <button className="link small" onClick={() => navigate('/signup/agent')}>Sign up here</button>
        </div>

        <div className="center mt-auto" style={{ paddingTop: 20 }}>
          <span className="small muted">Already have an account? </span>
          <button className="link small" onClick={() => navigate('/login/jobseeker')}>Log In</button>
        </div>
      </div>
    </AuthShell>
  );
}
