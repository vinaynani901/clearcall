import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck } from '../components/Icons';
import { StatusBar } from '../components/Shared';

export default function Splash() {
  const navigate = useNavigate();

  useEffect(() => {
    const t = setTimeout(() => navigate('/onboarding/1'), 2500);
    return () => clearTimeout(t);
  }, [navigate]);

  return (
    <>
      <StatusBar dark />
      <div className="screen-centered" style={{ background: 'var(--navy)', flex: 1 }}>
        <ShieldCheck size={88} />
        <div className="brand-title" style={{ marginTop: 20 }}>ClearCall</div>
        <div className="brand-tagline">Know who is calling before you answer</div>
        <div className="dot-loader" style={{ position: 'absolute', bottom: 56 }}>
          <span /><span /><span />
        </div>
      </div>
    </>
  );
}
