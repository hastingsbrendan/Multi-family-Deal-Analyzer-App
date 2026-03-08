import React, { useState, useEffect, useRef, useCallback } from 'react';

// ─── Tour step definitions ───────────────────────────────────────────────────
export const TOUR_STEPS = [
  {
    title: 'Welcome to RentHack',
    body: 'This tool helps you underwrite 2–4 unit multifamily properties from first look to closing. Let\'s walk through the app together.',
    icon: '🏠',
    page: 'center',
  },
  {
    title: 'Your Deal Portfolio',
    body: 'This is your command center. Every deal you\'re analyzing lives here — filter by status, sort by returns, and spot your best opportunities.',
    target: 'portfolio-list',
    page: 'portfolio',
    placement: 'bottom',
  },
  {
    title: 'Create a New Deal',
    body: 'Click here to add a new deal. Each deal gets its own assumptions, projections, and analysis.',
    target: 'add-deal',
    page: 'portfolio',
    placement: 'bottom',
  },
  {
    title: 'Deal Summary',
    body: 'Your at-a-glance dashboard. See key metrics like CoC return, cap rate, IRR, equity multiple, and monthly cash flow — all calculated from your inputs.',
    target: 'tab-content',
    page: 'deal',
    tab: 0,
    placement: 'top',
  },
  {
    title: 'Assumptions',
    body: 'Enter the purchase price, financing terms, unit rents, and operating expenses here. Paste a Zillow or Redfin URL to auto-fill property data with Rentcast.',
    target: 'tab-content',
    page: 'deal',
    tab: 1,
    placement: 'top',
  },
  {
    title: 'Advanced Scenarios',
    body: 'Model owner-occupied cash flow (live in one unit), refinance scenarios (cash-out refi at year N), and value-add plays (renovate units to lift rents).',
    target: 'advanced-features',
    page: 'deal',
    tab: 1,
    placement: 'top',
  },
  {
    title: 'Cash Flow Projections',
    body: '10-year projections showing income growth, expenses, debt service, cash flow, and equity accumulation year by year.',
    target: 'tab-content',
    page: 'deal',
    tab: 2,
    placement: 'top',
  },
  {
    title: 'Rent Comps',
    body: 'Compare your rents against market data. Paste a listing URL to pull nearby rental comps and see how your assumptions stack up.',
    target: 'tab-content',
    page: 'deal',
    tab: 3,
    placement: 'top',
  },
  {
    title: 'Showing Notes',
    body: 'Log your property visit — record condition, first impressions, and rehab estimates. Tag photos to specific areas of the property.',
    target: 'tab-content',
    page: 'deal',
    tab: 4,
    placement: 'top',
  },
  {
    title: 'Red Flags',
    body: 'Automatic risk checks flag issues with DSCR, cap rate, and expense ratios against your thresholds. Add manual flags for anything you spot on-site.',
    target: 'tab-content',
    page: 'deal',
    tab: 5,
    placement: 'top',
  },
  {
    title: 'Sensitivity Analysis',
    body: 'See how your returns shift when rent, vacancy, purchase price, interest rate, or appreciation change. Stress-test the deal before you commit.',
    target: 'tab-content',
    page: 'deal',
    tab: 6,
    placement: 'top',
  },
  {
    title: "You're ready to analyze deals!",
    body: 'Start by clicking + Add to create your first deal, or paste a listing URL directly into the Property Lookup panel. Your data syncs automatically across devices.',
    icon: '🚀',
    page: 'center',
  },
];

// ─── Spotlight overlay + tooltip ─────────────────────────────────────────────
function GuidedTour({ step, onNext, onBack, onClose }) {
  const total = TOUR_STEPS.length;
  const s = TOUR_STEPS[step];
  const isLast = step === total - 1;
  const isFirst = step === 0;
  const isCentered = s.page === 'center';

  const [rect, setRect] = useState(null);
  const rafRef = useRef(null);

  const measure = useCallback(() => {
    if (isCentered || !s.target) { setRect(null); return; }
    const el = document.querySelector(`[data-tour="${s.target}"]`);
    if (el) {
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      // Scroll element into view if needed
      if (r.top < 0 || r.bottom > window.innerHeight) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } else {
      setRect(null);
    }
  }, [step, isCentered, s.target]);

  // Measure on step change with a small delay for lazy-loaded tabs
  useEffect(() => {
    const t1 = setTimeout(measure, 80);
    const t2 = setTimeout(measure, 300);  // re-measure after lazy load
    window.addEventListener('resize', measure);
    return () => { clearTimeout(t1); clearTimeout(t2); window.removeEventListener('resize', measure); };
  }, [measure]);

  // ─── Centered modal (welcome / finish) ─────────────────────────────────
  if (isCentered) {
    return (
      <div style={{position:'fixed',inset:0,zIndex:2000,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',transition:'opacity 0.3s'}} />
        <div style={{
          position:'relative', zIndex:1, background:'var(--card)', border:'1px solid var(--border)',
          borderRadius:18, padding:'36px 32px', maxWidth:460, width:'100%',
          boxShadow:'0 24px 64px rgba(0,0,0,0.5)', animation:'tourFadeIn 0.3s ease',
        }}>
          <button onClick={onClose} style={{position:'absolute',top:14,right:16,background:'none',
            border:'none',color:'var(--muted)',fontSize:20,cursor:'pointer',lineHeight:1}}>✕</button>
          <ProgressBar step={step} total={total} onJump={() => {}} />
          <div style={{textAlign:'center',marginBottom:28}}>
            <div style={{fontSize:48,marginBottom:16,lineHeight:1}}>{s.icon}</div>
            <div style={{fontWeight:800,fontSize:19,marginBottom:10,lineHeight:1.3}}>{s.title}</div>
            <div style={{color:'var(--muted)',fontSize:15,lineHeight:1.7}}>{s.body}</div>
          </div>
          <NavButtons step={step} total={total} isFirst={isFirst} isLast={isLast} onNext={onNext} onBack={onBack} onClose={onClose} />
        </div>
      </div>
    );
  }

  // ─── Spotlight mode ────────────────────────────────────────────────────
  const pad = 10; // padding around highlighted element
  const spotStyle = rect ? {
    position: 'fixed',
    top: rect.top - pad,
    left: rect.left - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
    borderRadius: 12,
    boxShadow: '0 0 0 9999px rgba(0,0,0,0.65)',
    zIndex: 2000,
    pointerEvents: 'none',
    transition: 'all 0.35s ease',
  } : null;

  // Tooltip position: above or below the spotlight, clamped to viewport
  const TOOLTIP_H = 220;
  const TOOLTIP_W = 380;
  const MARGIN = 16;
  const tooltipStyle = {};
  if (rect) {
    const spaceAbove = rect.top - pad - 12;
    const spaceBelow = window.innerHeight - (rect.top + rect.height + pad + 12);
    const preferAbove = s.placement === 'top' || (!s.placement && rect.top > window.innerHeight / 2);
    const above = preferAbove ? (spaceAbove >= TOOLTIP_H || spaceAbove >= spaceBelow) : (spaceBelow < TOOLTIP_H && spaceAbove > spaceBelow);
    const leftPos = Math.max(MARGIN, Math.min(rect.left, window.innerWidth - TOOLTIP_W - MARGIN));
    tooltipStyle.position = 'fixed';
    tooltipStyle.left = leftPos;
    if (above) {
      const rawBottom = window.innerHeight - rect.top + pad + 12;
      tooltipStyle.bottom = Math.min(rawBottom, window.innerHeight - TOOLTIP_H - MARGIN);
    } else {
      const rawTop = rect.top + rect.height + pad + 12;
      tooltipStyle.top = Math.min(rawTop, window.innerHeight - TOOLTIP_H - MARGIN);
    }
  } else {
    // Fallback: center the tooltip
    tooltipStyle.position = 'fixed';
    tooltipStyle.top = '50%';
    tooltipStyle.left = '50%';
    tooltipStyle.transform = 'translate(-50%, -50%)';
  }

  return (
    <>
      {/* Click-catching backdrop (outside the spotlight) */}
      <div style={{position:'fixed',inset:0,zIndex:1999}} onClick={onClose} />

      {/* Spotlight hole */}
      {spotStyle && <div style={spotStyle} />}

      {/* Tooltip card */}
      <div style={{
        ...tooltipStyle,
        zIndex: 2001,
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        padding: '24px 22px',
        maxWidth: 380,
        width: 'calc(100vw - 32px)',
        boxShadow: '0 16px 48px rgba(0,0,0,0.4)',
        animation: 'tourFadeIn 0.25s ease',
      }}>
        <button onClick={onClose} style={{position:'absolute',top:10,right:12,background:'none',
          border:'none',color:'var(--muted)',fontSize:18,cursor:'pointer',lineHeight:1}}>✕</button>
        <ProgressBar step={step} total={total} onJump={() => {}} />
        <div style={{fontWeight:800,fontSize:16,marginBottom:6,lineHeight:1.3,paddingRight:24}}>{s.title}</div>
        <div style={{color:'var(--muted)',fontSize:13,lineHeight:1.7,marginBottom:18}}>{s.body}</div>
        <NavButtons step={step} total={total} isFirst={isFirst} isLast={isLast} onNext={onNext} onBack={onBack} onClose={onClose} />
      </div>

      {/* Keyframe animation (injected once) */}
      <style>{`@keyframes tourFadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ProgressBar({ step, total }) {
  return (
    <div style={{display:'flex',gap:4,marginBottom:20}}>
      {Array.from({ length: total }, (_, i) => (
        <div key={i} style={{
          height: 3, flex: 1, borderRadius: 2,
          background: i <= step ? 'var(--accent)' : 'var(--border)',
          transition: 'background 0.25s',
        }} />
      ))}
    </div>
  );
}

function NavButtons({ step, total, isFirst, isLast, onNext, onBack, onClose }) {
  return (
    <div style={{display:'flex',gap:10,alignItems:'center',justifyContent:'space-between'}}>
      <button onClick={onBack} disabled={isFirst}
        style={{background:'none',border:'1px solid var(--border)',borderRadius:8,
          padding:'9px 16px',fontSize:13,cursor:isFirst?'not-allowed':'pointer',
          color:'var(--muted)',opacity:isFirst?0.4:1,fontFamily:'inherit'}}>
        ← Back
      </button>
      <span style={{fontSize:11,color:'var(--muted)'}}>{step + 1} / {total}</span>
      {isLast
        ? <button onClick={onClose} style={{background:'var(--accent)',color:'#fff',border:'none',
            borderRadius:8,padding:'9px 20px',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>
            Get Started →
          </button>
        : <button onClick={onNext} style={{background:'var(--accent)',color:'#fff',border:'none',
            borderRadius:8,padding:'9px 20px',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>
            Next →
          </button>
      }
    </div>
  );
}

export default GuidedTour;
