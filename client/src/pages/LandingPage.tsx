import React, { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icons } from '../components/Icons.tsx';

export default function LandingPage() {
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Convert vertical mouse wheel scrolling to horizontal scrolling
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (scrollRef.current) {
      if (e.deltaY !== 0) {
        e.preventDefault();
        scrollRef.current.scrollBy({
          left: e.deltaY,
          behavior: 'auto'
        });
      }
    }
  };

  return (
    <div 
      ref={scrollRef}
      onWheel={handleWheel}
      className="landing-page horizontal-scroll-container" 
      style={{ 
        display: 'flex', 
        width: '100vw', 
        height: 'calc(100vh - var(--header-height))', 
        overflowX: 'auto', 
        overflowY: 'hidden',
        scrollSnapType: 'x mandatory',
        scrollBehavior: 'smooth',
      }}
    >
      
      {/* ── PANEL 1: HERO SECTION ── */}
      <section 
        className="horizontal-panel"
        style={{ 
          minWidth: '100vw', 
          height: '100%', 
          display: 'flex', 
          flexDirection: 'column',
          textAlign: 'center', 
          padding: '20px', 
          position: 'relative',
          scrollSnapAlign: 'start',
          scrollSnapStop: 'always',
          overflowY: 'auto'
        }}
      >
        {/* Background glow effects */}
        <div style={{ position: 'absolute', top: '10%', left: '50%', transform: 'translateX(-50%)', width: '80vmin', height: '80vmin', background: 'radial-gradient(circle, rgba(124,58,237,0.15) 0%, rgba(0,0,0,0) 70%)', pointerEvents: 'none', zIndex: 0 }} />
        
        <div style={{ margin: 'auto', position: 'relative', zIndex: 1, maxWidth: 800, width: '100%', padding: '40px 0' }}>
          <div style={{ 
            display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 16px', 
            borderRadius: 'var(--radius-full)', background: 'rgba(0, 212, 255, 0.1)', 
            border: '1px solid rgba(0, 212, 255, 0.2)', color: 'var(--accent)', 
            fontSize: '0.8rem', fontWeight: 600, marginBottom: 24 
          }}>
            <Icons.sparkles size={16} /> 
            <span>Pioneering AI Trading Intelligence</span>
          </div>

          <h1 style={{ fontSize: 'clamp(2.5rem, 5vw, 4rem)', fontFamily: 'var(--font-display)', fontWeight: 800, lineHeight: 1.1, marginBottom: 24, letterSpacing: '-0.02em' }}>
            Trade. Predict. <br />
            <span style={{ background: 'linear-gradient(135deg, var(--accent) 0%, var(--purple) 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Train the Future.
            </span>
          </h1>

          <p style={{ fontSize: 'clamp(1rem, 2vw, 1.2rem)', color: 'var(--text-secondary)', marginBottom: 40, lineHeight: 1.6, maxWidth: 640, margin: '0 auto 40px auto' }}>
            Trondex isn't just a prediction market. Every real-time decision you make feeds directly into our advanced AI model. The more natural human data we receive, the smarter our autonomous trading engine becomes.
          </p>

          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" style={{ padding: '16px 32px', fontSize: '1.1rem' }} onClick={() => navigate('/trade')}>
              Launch Trading Terminal <Icons.arrowUp size={18} style={{ transform: 'rotate(45deg)' }} />
            </button>
            <button 
              className="btn btn-ghost pulse-btn" 
              style={{ padding: '16px 32px', fontSize: '1.1rem', background: 'rgba(255,255,255,0.05)' }} 
              onClick={() => {
                const container = document.querySelector('.horizontal-scroll-container');
                if (container) {
                  container.scrollBy({ left: window.innerWidth, behavior: 'smooth' });
                }
              }}
            >
              Scroll to Explore <Icons.arrowDown size={18} style={{ transform: 'rotate(-90deg)' }} />
            </button>
          </div>
        </div>
      </section>

      {/* ── PANEL 2: HOW IT WORKS (AI TRAINING) ── */}
      <section 
        className="horizontal-panel"
        style={{ 
          minWidth: '100vw', 
          height: '100%', 
          display: 'flex', 
          flexDirection: 'column',
          padding: '20px', 
          background: 'rgba(0,0,0,0.3)',
          borderLeft: '1px solid var(--border)', 
          borderRight: '1px solid var(--border)',
          scrollSnapAlign: 'start',
          scrollSnapStop: 'always',
          overflowY: 'auto'
        }}
      >
        <div style={{ margin: 'auto', maxWidth: 1000, width: '100%', padding: '40px 0' }}>
          <div style={{ textAlign: 'center', marginBottom: '8vh' }}>
            <h2 style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.8rem)', fontFamily: 'var(--font-display)', marginBottom: 16 }}>
              Human Intuition meets <span style={{ color: 'var(--purple)' }}>Machine Learning</span>
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 'clamp(0.9rem, 1.5vw, 1.1rem)', maxWidth: 600, margin: '0 auto' }}>
              Unlike massive simulated datasets, real human emotion and risk-taking behavior are impossible to fake. That's why your daily trades are invaluable.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '3vw' }}>
            {/* Feature 1 */}
            <div className="glass-card" style={{ padding: 'clamp(20px, 3vw, 40px)', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, right: 0, width: 150, height: 150, background: 'radial-gradient(circle, rgba(124,58,237,0.2) 0%, rgba(0,0,0,0) 70%)', pointerEvents: 'none' }} />
              <div style={{ width: 48, height: 48, borderRadius: 'var(--radius-md)', background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--purple)', marginBottom: 20 }}>
                <Icons.trendingUp size={24} />
              </div>
              <h3 style={{ fontSize: '1.3rem', marginBottom: 12 }}>1. You Predict & Trade</h3>
              <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, fontSize: '0.95rem' }}>
                Execute fixed-window predictions on TRX/USDT using real capital. Benefit from a 3% fixed daily reward when your market intuition is correct.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="glass-card" style={{ padding: 'clamp(20px, 3vw, 40px)', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, right: 0, width: 150, height: 150, background: 'radial-gradient(circle, rgba(0,212,255,0.2) 0%, rgba(0,0,0,0) 70%)', pointerEvents: 'none' }} />
              <div style={{ width: 48, height: 48, borderRadius: 'var(--radius-md)', background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', marginBottom: 20 }}>
                <Icons.brain size={24} />
              </div>
              <h3 style={{ fontSize: '1.3rem', marginBottom: 12 }}>2. Real-World AI Training</h3>
              <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, fontSize: '0.95rem' }}>
                Your order flow, sizing, and timing are instantly fed into the Trondex Alpha Engine. The AI learns directly from aggregated crowd sentiment.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="glass-card" style={{ padding: 'clamp(20px, 3vw, 40px)', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, right: 0, width: 150, height: 150, background: 'radial-gradient(circle, rgba(0,229,160,0.2) 0%, rgba(0,0,0,0) 70%)', pointerEvents: 'none' }} />
              <div style={{ width: 48, height: 48, borderRadius: 'var(--radius-md)', background: 'rgba(0,229,160,0.1)', border: '1px solid rgba(0,229,160,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--green)', marginBottom: 20 }}>
                <Icons.coins size={24} />
              </div>
              <h3 style={{ fontSize: '1.3rem', marginBottom: 12 }}>3. Ecosystem Rewards</h3>
              <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, fontSize: '0.95rem' }}>
                As the AI matures and becomes profitable in live markets, early contributors of human data share in the network's generated value.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── PANEL 3: AIRDROP / TGE SECTION ── */}
      <section 
        id="airdrop-section" 
        className="horizontal-panel"
        style={{ 
          minWidth: '100vw', 
          height: '100%', 
          display: 'flex', 
          flexDirection: 'column',
          padding: '20px',
          scrollSnapAlign: 'start',
          scrollSnapStop: 'always',
          overflowY: 'auto'
        }}
      >
        <div className="glass-card pulse-glow-border" style={{ margin: 'auto', maxWidth: 800, width: '100%', padding: 'clamp(30px, 5vw, 60px)', textAlign: 'center', background: 'linear-gradient(180deg, rgba(7,11,20,0) 0%, rgba(124,58,237,0.08) 100%)', border: '1px solid rgba(124,58,237,0.3)' }}>
          <div style={{ width: 80, height: 80, borderRadius: 'var(--radius-full)', background: 'rgba(124,58,237,0.15)', color: 'var(--purple)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 30px auto', boxShadow: '0 0 30px rgba(124,58,237,0.3)' }}>
            <Icons.gift size={40} />
          </div>
          <h2 style={{ fontSize: 'clamp(2rem, 4vw, 3rem)', fontFamily: 'var(--font-display)', marginBottom: 20 }}>
            The Trondex Airdrop (<span style={{ color: 'var(--accent)' }}>$TROD</span>)
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 'clamp(1rem, 2vw, 1.2rem)', lineHeight: 1.7, marginBottom: 40 }}>
            Data is the new oil, and AI is the engine. By consistently trading on Trondex, you're not just earning daily performance rewards—you're actively building up your <strong style={{color: 'var(--text-primary)'}}>Data Contribution Score</strong>. 
            <br/><br/>
            When Trondex launches its native Token Generation Event (TGE), portions of the genesis supply will be retroactively airdropped to users who provided the highest quality and most frequent market predictions during our data-harvesting phase.
          </p>
          <button className="btn btn-primary" style={{ padding: '16px 36px', fontSize: '1.2rem', boxShadow: '0 8px 30px rgba(0, 212, 255, 0.4)' }} onClick={() => navigate('/')}>
            Start Trading & Earning Score
          </button>
        </div>
      </section>

    </div>
  );
}
