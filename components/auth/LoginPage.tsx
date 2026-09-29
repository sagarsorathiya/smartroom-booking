import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { AlertCircle } from 'lucide-react';

/* ─── Dot-grid decoration (3 rows x 10 cols, matches design spec) ── */
const DOT_GRID: { x: number; y: number }[] = [];
for (let row = 0; row < 3; row++) {
  for (let col = 0; col < 10; col++) {
    DOT_GRID.push({ x: col * 15 + 4, y: row * 22 + 6 });
  }
}

/* ─── Feature item data ────────────────────────────────────────── */
const FEATURES = [
  {
    title: 'Easy Booking',
    sub: 'Book rooms in seconds',
    bg: 'rgba(139,107,255,0.16)',
    border: 'rgba(139,107,255,0.25)',
    color: '#a78bfa',
    icon: (
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.8" />
        <path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: 'Live Status',
    sub: 'Real-time room availability',
    bg: 'rgba(52,211,153,0.14)',
    border: 'rgba(52,211,153,0.25)',
    color: '#34d399',
    icon: (
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="12" cy="12" r="3" fill="currentColor" />
      </svg>
    ),
  },
  {
    title: 'Smart Insights',
    sub: 'Utilize data for better decisions',
    bg: 'rgba(96,165,250,0.14)',
    border: 'rgba(96,165,250,0.25)',
    color: '#60a5fa',
    icon: (
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none">
        <path d="M5 19V10M12 19V5M19 19v-7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    ),
  },
];

const inputBaseStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  background: '#15132a',
  border: '1px solid #362f52',
  borderRadius: '10px',
  color: 'white',
  fontSize: '15px',
  outline: 'none',
  transition: 'border-color 150ms ease',
};

/* ─── Main component ────────────────────────────────────────────── */
export const LoginPage: React.FC = () => {
  const { login, settings } = useApp();
  const [domainId, setDomainId]         = useState('');
  const [password, setPassword]         = useState('');
  const [error, setError]               = useState('');
  const [loading, setLoading]           = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe]     = useState(false);
  const [domainFocused, setDomainFocused]   = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [buttonHover, setButtonHover]   = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!domainId.trim()) { setError('Domain ID is required'); return; }
    if (!password)        { setError('Password is required');  return; }

    setLoading(true);
    setTimeout(async () => {
      const result = await login(domainId.trim(), password);
      if (result) setError(result);
      setLoading(false);
    }, 400);
  };

  const portalName = settings.portalName || 'ConferenceHub';

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        fontFamily: "'Inter', sans-serif",
        background: '#0b0a14',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* ── LEFT: room photo panel ── */}
      <div
        className="hidden lg:flex"
        style={{
          position: 'relative',
          width: '55%',
          height: '100%',
          flexShrink: 0,
          clipPath: 'polygon(0 0, 100% 0, 92% 100%, 0 100%)',
          overflow: 'hidden',
          flexDirection: 'column',
          backgroundImage:
            'linear-gradient(180deg, rgba(8,6,16,0.1) 0%, rgba(8,6,16,0.5) 60%, rgba(8,6,16,0.94) 100%), url(/assets/conference-room-bg.png)',
          backgroundSize: 'cover',
          backgroundPosition: 'center 35%',
        }}
      >
        <div style={{ position: 'relative', flex: 1, minHeight: 0 }} />

        {/* headline + subtitle */}
        <div style={{ position: 'relative', padding: '0 44px', flexShrink: 0 }}>
          <div
            style={{
              fontSize: 'clamp(24px,3.4vw,36px)',
              fontWeight: 800,
              color: 'white',
              lineHeight: 1.2,
              textShadow: '0 2px 16px rgba(0,0,0,0.4)',
            }}
          >
            Smart rooms. <span style={{ color: '#a78bfa' }}>Seamless meetings.</span>
          </div>
          <div
            style={{
              marginTop: '10px',
              fontSize: 'clamp(13px,1.3vw,16px)',
              color: '#d7d3e6',
              lineHeight: 1.5,
              maxWidth: '420px',
            }}
          >
            One platform to book, manage, and optimize your conference room experience.
          </div>
        </div>

        {/* feature row */}
        <div style={{ position: 'relative', padding: '16px 44px 24px', display: 'flex', gap: '20px', flexWrap: 'wrap', flexShrink: 0 }}>
          {FEATURES.map((f) => (
            <div key={f.title} style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '150px' }}>
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '11px',
                  background: f.bg,
                  border: `1px solid ${f.border}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: f.color,
                }}
              >
                {f.icon}
              </div>
              <div style={{ color: 'white', fontWeight: 700, fontSize: '14px' }}>{f.title}</div>
              <div style={{ color: '#c3bfd6', fontSize: '12px', lineHeight: 1.4 }}>{f.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── RIGHT: form panel ── */}
      <div
        style={{
          position: 'relative',
          flex: 1,
          height: '100%',
          background: '#0b0a14',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* ambient radial glow */}
        <svg style={{ position: 'absolute', inset: 0 }} width="100%" height="100%" preserveAspectRatio="none">
          <defs>
            <radialGradient id="glow1" cx="90%" cy="90%" r="60%">
              <stop offset="0%" stopColor="#5b3df0" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#5b3df0" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width="100%" height="100%" fill="url(#glow1)" />
        </svg>

        {/* dot grid decoration */}
        <svg style={{ position: 'absolute', top: 28, right: 32 }} width="150" height="70" viewBox="0 0 150 70">
          <g fill="#5b3df0" opacity="0.55">
            {DOT_GRID.map((d, i) => (
              <circle key={i} cx={d.x} cy={d.y} r="2.2" />
            ))}
          </g>
        </svg>

        <div
          style={{
            position: 'relative',
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: '0 clamp(48px,6vw,88px)',
            maxWidth: '580px',
            width: '100%',
            margin: '0 auto',
            boxSizing: 'border-box',
            overflowY: 'auto',
          }}
        >
          {/* logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '28px' }}>
            <div
              style={{
                width: '52px',
                height: '52px',
                borderRadius: '14px',
                background: 'linear-gradient(135deg,#8b6bff,#5b3df0)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="5" width="18" height="12" rx="2" stroke="white" strokeWidth="1.8" />
                <path d="M8 20h8" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </div>
            <div>
              <div style={{ color: 'white', fontWeight: 800, fontSize: '22px', lineHeight: 1.1, whiteSpace: 'nowrap' }}>
                {portalName}
              </div>
              <div style={{ color: '#9b82ff', fontWeight: 700, fontSize: '11px', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
                CONFERENCE ROOM SYSTEM
              </div>
            </div>
          </div>

          <div style={{ color: 'white', fontWeight: 800, fontSize: 'clamp(24px,3vw,32px)', marginBottom: '6px' }}>
            Welcome back!
          </div>
          <div style={{ color: '#9d97b8', fontSize: '14px', marginBottom: '24px' }}>
            Sign in to continue to your dashboard
          </div>

          {error && (
            <div
              style={{
                marginBottom: '18px',
                padding: '12px 16px',
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                fontSize: '13px',
                color: '#f87171',
              }}
            >
              <AlertCircle size={15} style={{ flexShrink: 0 }} />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* Domain ID */}
            <label style={{ display: 'block', color: '#8b84ad', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', marginBottom: '8px' }}>
              DOMAIN ID
            </label>
            <div style={{ position: 'relative', marginBottom: '18px' }}>
              <div style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: '#7c5cff', display: 'flex' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Z" stroke="currentColor" strokeWidth="1.8" />
                  <path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </div>
              <input
                type="text"
                value={domainId}
                onChange={e => { setDomainId(e.target.value); setError(''); }}
                onFocus={() => setDomainFocused(true)}
                onBlur={() => setDomainFocused(false)}
                placeholder="e.g. firstname.lastname"
                autoComplete="username"
                autoFocus
                style={{
                  ...inputBaseStyle,
                  padding: '16px 16px 16px 46px',
                  borderColor: domainFocused ? '#7c5cff' : '#362f52',
                }}
              />
            </div>

            {/* Password */}
            <label style={{ display: 'block', color: '#8b84ad', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', marginBottom: '8px' }}>
              PASSWORD
            </label>
            <div style={{ position: 'relative', marginBottom: '14px' }}>
              <div style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: '#7c5cff', display: 'flex' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <rect x="5" y="10" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.8" />
                  <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.8" />
                </svg>
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => { setPassword(e.target.value); setError(''); }}
                onFocus={() => setPasswordFocused(true)}
                onBlur={() => setPasswordFocused(false)}
                placeholder="Enter your password"
                autoComplete="current-password"
                style={{
                  ...inputBaseStyle,
                  padding: '16px 46px 16px 46px',
                  borderColor: passwordFocused ? '#7c5cff' : '#362f52',
                }}
              />
              <div
                role="button"
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword(p => !p)}
                style={{ position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)', color: '#7c5cff', cursor: 'pointer', display: 'flex' }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" stroke="currentColor" strokeWidth="1.8" />
                  <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
                </svg>
              </div>
            </div>

            {/* Remember me */}
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px', cursor: 'pointer', userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={() => setRememberMe(r => !r)}
                style={{ width: '16px', height: '16px', accentColor: '#7c5cff' }}
              />
              <span style={{ color: '#c9c5db', fontSize: '14px' }}>Remember me</span>
            </label>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              onMouseEnter={() => setButtonHover(true)}
              onMouseLeave={() => setButtonHover(false)}
              style={{
                width: '100%',
                background: 'linear-gradient(90deg,#7c5cff,#5b3df0)',
                border: 'none',
                borderRadius: '10px',
                padding: '16px',
                color: 'white',
                fontWeight: 700,
                fontSize: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                cursor: loading ? 'default' : 'pointer',
                opacity: loading ? 0.7 : 1,
                filter: buttonHover && !loading ? 'brightness(1.08)' : 'none',
                transition: 'filter 150ms ease',
              }}
            >
              {loading ? (
                <>
                  <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Signing in…
                </>
              ) : (
                <>
                  Sign In
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M5 12h14M13 6l6 6-6 6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </>
              )}
            </button>
          </form>
        </div>

        {/* footer row */}
        <div
          style={{
            position: 'relative',
            display: 'flex',
            justifyContent: 'space-between',
            padding: '16px clamp(48px,6vw,88px) 20px',
            borderTop: '1px solid #211f33',
            flexWrap: 'wrap',
            gap: '16px',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ color: '#7c5cff' }}>
              <path d="M12 2l8 3.5v6c0 5-3.4 8.9-8 10.5-4.6-1.6-8-5.5-8-10.5v-6L12 2Z" stroke="currentColor" strokeWidth="1.6" />
              <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div>
              <div style={{ color: 'white', fontSize: '13px', fontWeight: 600 }}>Secure Access</div>
              <div style={{ color: '#8b84ad', fontSize: '12px' }}>Your connection is protected</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ color: '#7c5cff' }}>
              <path d="M4 18v-1a4 4 0 0 1 4-4h1M20 18v-1a4 4 0 0 0-4-4h-1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <rect x="3" y="9" width="4" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
              <rect x="17" y="9" width="4" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
              <path d="M8 9a4 4 0 0 1 8 0" stroke="currentColor" strokeWidth="1.6" />
            </svg>
            <div>
              <div style={{ color: 'white', fontSize: '13px', fontWeight: 600 }}>Need help?</div>
              <div style={{ color: '#8b6bff', fontSize: '12px', fontWeight: 600 }}>Contact IT Team</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
