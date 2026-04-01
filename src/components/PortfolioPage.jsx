import React, { useState, useMemo, useCallback } from 'react';
import InputRow, { iSty, Tip } from './ui/InputRow';
import { FMT_PCT, FMT_USD, FMT_X, STATUS_COLORS, STATUS_OPTIONS } from '../lib/constants';
import { useIsMobile } from '../lib/hooks';
import { calcDeal } from '../lib/calc';
import DSCRBadge from './ui/DSCRBadge';
import PortfolioMap from './PortfolioMap';
import UndoToast from './ui/UndoToast';

// ─── Traffic-light helpers ────────────────────────────────────────────────────
const cocColor = v => (v == null ? 'var(--muted)' : v >= 0.06 ? 'var(--green)' : v >= 0.03 ? 'var(--accent2)' : 'var(--red)');
const irrColor = v => (v == null ? 'var(--muted)' : v >= 0.12 ? 'var(--green)' : v >= 0.08 ? 'var(--accent2)' : 'var(--red)');
const capColor = v => (v == null ? 'var(--muted)' : v >= 0.05 ? 'var(--green)' : v >= 0.04 ? 'var(--accent2)' : 'var(--red)');

// ─── DealCard ─────────────────────────────────────────────────────────────────
function DealCard({ d, r, onSelect, onDelete, onShareDeal }) {
  const a = d.assumptions;
  const ooEnabled = r.ooEnabled;

  // Hero metric: effective mortgage for OO deals, monthly CF otherwise
  let heroLabel, heroValue, heroColor, heroSub;
  if (ooEnabled && r.monthlyPayment) {
    const pAndI  = r.monthlyPayment || 0;
    const taxMo  = (r.baseExpBreakdown?.propertyTax || 0) / 12;
    const insMo  = (r.baseExpBreakdown?.insurance   || 0) / 12;
    const piti   = pAndI + taxMo + insMo;
    const vac    = (+a.vacancyRate || 0) / 100;
    const ooUnit = r.ooUnit ?? 0;
    const egiExOO = a.units.slice(0, a.numUnits).reduce((s, u, i) =>
      i === ooUnit ? s : s + (+(u.rent || u.listedRent) || 0) * (1 - vac), 0);
    heroLabel = 'Your monthly housing cost';
    heroValue = piti - egiExOO;
    heroColor = 'var(--accent)';
    heroSub   = 'After tenant rent offsets your mortgage';
  } else {
    const cf = r.years?.[0]?.monthlyCashFlow ?? 0;
    heroLabel = 'Monthly cash flow · Yr 1';
    heroValue = cf;
    heroColor = cf >= 0 ? 'var(--green)' : 'var(--red)';
    heroSub   = cf >= 0 ? 'Positive cash flow from day one' : 'Negative in Yr 1';
  }

  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={() => onSelect(d.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'var(--card)',
        border: `1px solid ${hovered ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 14, padding: 16, cursor: 'pointer',
        boxShadow: hovered ? '0 2px 12px rgba(13,148,136,0.1)' : 'none',
        transition: 'border-color 0.15s, box-shadow 0.15s',
        display: 'flex', flexDirection: 'column', gap: 12,
        opacity: d.status === 'Pass' ? 0.72 : 1,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--text)', lineHeight: 1.3, marginBottom: 2 }}>
            {d.address || <em style={{ color: 'var(--muted)' }}>Untitled</em>}
            {d._isSample && (
              <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: 'var(--accent-soft)', color: 'var(--accent)', letterSpacing: '0.06em', textTransform: 'uppercase', marginLeft: 6 }}>Sample</span>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{a.numUnits}-unit · {FMT_USD(+a.purchasePrice)}</div>
        </div>
        <span style={{ background: STATUS_COLORS[d.status] + '22', color: STATUS_COLORS[d.status], borderRadius: 4, padding: '2px 8px', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{d.status}</span>
      </div>

      {/* Hero metric */}
      <div style={{ background: 'var(--accent-soft)', borderRadius: 10, padding: '10px 12px', borderLeft: '3px solid var(--accent)' }}>
        <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 4 }}>{heroLabel}</div>
        <div style={{ fontSize: 26, fontWeight: 900, color: heroColor, letterSpacing: '-1px', lineHeight: 1 }}>
          {ooEnabled ? '' : (heroValue >= 0 ? '+' : '-')}
          {FMT_USD(Math.abs(heroValue))}
          <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--muted)' }}>/mo</span>
        </div>
        <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>{heroSub}</div>
      </div>

      {/* Metrics grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        {[
          { label: 'CoC', tip: 'Cash-on-Cash Return — your first-year cash income as a % of cash invested', val: FMT_PCT(r.cocReturn), color: cocColor(r.cocReturn) },
          { label: 'IRR', tip: 'Internal Rate of Return — annualized return including appreciation and equity over the hold period', val: FMT_PCT(r.irr), color: irrColor(r.irr) },
          { label: 'Cap Rate', tip: 'Cap Rate — annual NOI divided by purchase price, measures income yield', val: FMT_PCT(r.capRate), color: capColor(r.capRate) },
        ].map(({ label, tip, val, color }) => (
          <div key={label} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', marginBottom: 2, display:'flex', alignItems:'center', justifyContent:'center', gap:2 }}>{label}<Tip text={tip}/></div>
            <div style={{ fontSize: 14, fontWeight: 700, color }}>{val}</div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTop: '1px solid var(--border-faint)' }}>
        {(r.dscr != null && r.dscr > 0) ? <DSCRBadge dscr={r.dscr} /> : <span style={{ fontSize: 11, color: 'var(--muted)', display:'flex', alignItems:'center', gap:2 }}>DSCR —<Tip text="Debt Service Coverage Ratio — NOI divided by annual mortgage payment. Lenders require ≥1.25x"/></span>}
        <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
          {onShareDeal && <button onClick={() => onShareDeal(d)} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 16, padding: '2px 4px', cursor: 'pointer' }} title="Share">👥</button>}
          <button onClick={() => onDelete(d.id)} style={{ background: 'none', border: 'none', color: 'var(--red)', fontSize: 16, padding: '2px 4px', cursor: 'pointer' }} title="Delete">✕</button>
        </div>
      </div>
    </div>
  );
}

// ─── ViewToggle ───────────────────────────────────────────────────────────────
function ViewToggle({ view, setView }) {
  const btn = (v, icon, title) => (
    <button onClick={() => setView(v)} title={title} style={{
      background: view === v ? 'var(--accent-soft)' : 'none',
      border: 'none', borderRadius: 6, padding: '6px 10px',
      fontSize: 15, cursor: 'pointer', lineHeight: 1,
      color: view === v ? 'var(--accent)' : 'var(--muted)',
    }}>{icon}</button>
  );
  return (
    <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      {btn('cards', '⊞', 'Card view')}
      {btn('table', '☰', 'Table view')}
    </div>
  );
}

// ─── PortfolioPage ────────────────────────────────────────────────────────────
function PortfolioPage({ deals, onSelect, onAdd, onDelete, onExport, onReorder, dark, setDark, filterState, onTour, activeGroup, onExitGroup, onShareDeal, onOpenGroups }) {
  const [filter, setFilter] = filterState;
  const [viewMode, setViewMode] = useState('cards');
  const [dragIdx, setDragIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const [toast, setToast] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const isMobile = useIsMobile();

  const resultsByDealId = useMemo(() => {
    const map = {};
    (deals || []).forEach(d => { map[d.id] = calcDeal(d); });
    return map;
  }, [deals]);

  const filtered = useMemo(() =>
    (filter === 'All' ? deals : (deals || []).filter(d => d.status === filter))
      .slice().sort((a, b) => (a.status === 'Pass' ? 1 : 0) - (b.status === 'Pass' ? 1 : 0)),
  [deals, filter]);

  const handleDragStart = (e, i) => { setDragIdx(i); e.dataTransfer.effectAllowed = 'move'; };
  const handleDragOver  = (e, i) => { e.preventDefault(); setDragOverIdx(i); };
  const handleDrop      = (e, i) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === i) { setDragIdx(null); setDragOverIdx(null); return; }
    const fromId = filtered[dragIdx].id, toId = filtered[i].id;
    const fi = deals.findIndex(d => d.id === fromId), ti = deals.findIndex(d => d.id === toId);
    const next = [...deals]; const [moved] = next.splice(fi, 1); next.splice(ti, 0, moved);
    onReorder(next); setDragIdx(null); setDragOverIdx(null);
  };
  const handleDragEnd = () => { setDragIdx(null); setDragOverIdx(null); };

  const moveItem = (i, dir) => {
    const ti = i + dir; if (ti < 0 || ti >= filtered.length) return;
    const fi = deals.findIndex(d => d.id === filtered[i].id), to = deals.findIndex(d => d.id === filtered[ti].id);
    const next = [...deals]; const [moved] = next.splice(fi, 1); next.splice(to, 0, moved);
    onReorder(next);
  };

  const handleDelete = id => {
    setConfirmDeleteId(id);
  };
  const confirmDelete = () => {
    if (!confirmDeleteId) return;
    const snapshot = [...deals];
    const deal = deals.find(d => d.id === confirmDeleteId);
    onDelete(confirmDeleteId);
    setToast({ message: `"${deal?.address || 'Deal'}" deleted`, snapshot });
    setConfirmDeleteId(null);
  };

  const fmtShowing = d => {
    if (!d.showingDate) return '—';
    const s = d.showingDate.replace(/(\d{4})-(\d{2})-(\d{2})/, '$2/$3/$1').replace(/^0/, '');
    if (!d.showingTime) return s;
    const dt = new Date(d.showingDate + 'T' + d.showingTime);
    return s + ' · ' + dt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  };

  const groupBanner = activeGroup && (
    <div style={{ background: 'var(--accentlt)', border: '1px solid rgba(13,148,136,0.25)', borderRadius: isMobile ? 14 : 10, padding: isMobile ? '12px 16px' : '12px 18px', marginBottom: isMobile ? 12 : 16, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 16 }}>👥</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: isMobile ? 13 : 14, color: 'var(--accentdk)' }}>{activeGroup.name}</div>
        <div style={{ fontSize: 11, color: 'var(--accent)' }}>{activeGroup.role} · {isMobile ? 'Group Portfolio' : 'Shared Group Portfolio'}</div>
      </div>
      <button onClick={onExitGroup} style={{ background: 'none', border: '1px solid rgba(13,148,136,0.35)', borderRadius: 6, padding: '4px 10px', fontSize: 11, color: 'var(--accent)', cursor: 'pointer', fontWeight: 700 }}>← My Deals</button>
    </div>
  );

  const filterBar = (
    <div style={{ display: 'flex', gap: 6, marginBottom: 14, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none' }}>
      {['All', ...STATUS_OPTIONS].map(s => (
        <button key={s} onClick={() => setFilter(s)} style={{
          background: filter === s ? (s === 'All' ? 'var(--accent)' : STATUS_COLORS[s]) : 'var(--card)',
          color: filter === s ? '#fff' : 'var(--muted)',
          border: `1px solid ${s === 'All' ? 'var(--border)' : (STATUS_COLORS[s] || 'var(--border)')}`,
          borderRadius: 20, padding: '5px 14px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0, cursor: 'pointer',
        }}>{s}</button>
      ))}
    </div>
  );

  const emptyState = (
    <div data-tour="portfolio-list" style={{ textAlign: 'center', padding: isMobile ? '60px 20px' : '80px 20px', color: 'var(--muted)' }}>
      {(deals || []).length === 0
        ? <><div style={{ fontSize: 48, marginBottom: isMobile ? 12 : 16 }}>🏘</div><div style={{ fontSize: isMobile ? 14 : 16 }}>No deals yet. Tap <strong style={{ color: 'var(--text)' }}>+ {isMobile ? 'Add' : 'New Deal'}</strong> to get started.</div></>
        : 'No deals match this filter.'
      }
    </div>
  );

  // ── MOBILE layout ─────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div style={{ paddingBottom: 80 }}>
        {groupBanner}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div>
            <div style={{ fontFamily: "'Fraunces',serif", fontSize: 24, fontWeight: 900, color: 'var(--text)', letterSpacing: '-1px' }}><span>Rent</span><span style={{ color: 'var(--accent)' }}>Hack</span></div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 1 }}>2–4 unit multifamily</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => onTour && onTour()} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', color: 'var(--muted)', fontSize: 13, cursor: 'pointer' }}>🗺️</button>
            <button onClick={onAdd} data-tour="add-deal" style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 100, padding: '8px 16px', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>+ Add</button>
          </div>
        </div>
        {filterBar}
        <PortfolioMap deals={filtered} onSelect={onSelect} />
        {filtered.length === 0 ? emptyState : (
          <div data-tour="portfolio-list" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map((d, i) => (
              <div key={d.id} style={{ position: 'relative' }}>
                <DealCard d={d} r={resultsByDealId[d.id] || {}} onSelect={onSelect} onDelete={handleDelete} onShareDeal={onShareDeal} />
                <div style={{ position: 'absolute', top: 14, right: 48, display: 'flex', gap: 3 }} onClick={e => e.stopPropagation()}>
                  <button onClick={() => moveItem(i, -1)} disabled={i === 0} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 4, width: 24, height: 24, fontSize: 11, color: i === 0 ? 'var(--border)' : 'var(--muted)', cursor: i === 0 ? 'default' : 'pointer' }}>↑</button>
                  <button onClick={() => moveItem(i, 1)} disabled={i === filtered.length - 1} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 4, width: 24, height: 24, fontSize: 11, color: i === filtered.length - 1 ? 'var(--border)' : 'var(--muted)', cursor: i === filtered.length - 1 ? 'default' : 'pointer' }}>↓</button>
                </div>
              </div>
            ))}
          </div>
        )}
        {confirmDeleteId && (
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
            <div style={{background:"var(--card)",borderRadius:14,padding:"24px 24px",maxWidth:340,width:"100%",boxShadow:"0 8px 32px rgba(0,0,0,0.25)"}}>
              <div style={{fontSize:16,fontWeight:800,color:"var(--text)",marginBottom:8}}>Delete this deal?</div>
              <div style={{fontSize:13,color:"var(--muted)",marginBottom:20}}>This action can be undone immediately after.</div>
              <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
                <button onClick={()=>setConfirmDeleteId(null)} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:8,padding:"8px 18px",fontSize:13,fontWeight:700,cursor:"pointer",color:"var(--text)"}}>Cancel</button>
                <button onClick={confirmDelete} style={{background:"var(--red)",border:"none",borderRadius:8,padding:"8px 18px",fontSize:13,fontWeight:700,cursor:"pointer",color:"#fff"}}>Delete</button>
              </div>
            </div>
          </div>
        )}
        {toast && <UndoToast message={toast.message} onUndo={() => { onReorder(toast.snapshot); setToast(null); }} onDismiss={() => setToast(null)} />}
      </div>
    );
  }

  // ── DESKTOP layout ────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', paddingBottom: 40 }}>
      {groupBanner}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <div style={{ fontFamily: "'Fraunces',serif", fontSize: 28, fontWeight: 900, color: 'var(--text)', letterSpacing: '-0.5px' }}><span>Rent</span><span style={{ color: 'var(--accent)' }}>Hack</span></div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>{(deals || []).length} deal{(deals || []).length !== 1 ? 's' : ''} · multifamily analyzer</div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <ViewToggle view={viewMode} setView={setViewMode} />
          <button onClick={() => onTour && onTour()} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 14px', color: 'var(--muted)', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>🗺️ Tour</button>
          <button onClick={() => onOpenGroups && onOpenGroups()} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 14px', color: 'var(--muted)', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>👥 Groups</button>
          <button onClick={onExport} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 16px', color: 'var(--text)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>⬇ Excel</button>
          <button onClick={onAdd} data-tour="add-deal" style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 100, padding: '8px 18px', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>+ New Deal</button>
        </div>
      </div>

      {filterBar}
      <PortfolioMap deals={filtered} onSelect={onSelect} />

      {filtered.length === 0 ? emptyState : viewMode === 'cards' ? (
        // ── Card grid ──────────────────────────────────────────────────────────
        <div data-tour="portfolio-list" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
          {filtered.map(d => (
            <DealCard key={d.id} d={d} r={resultsByDealId[d.id] || {}} onSelect={onSelect} onDelete={handleDelete} onShareDeal={onShareDeal} />
          ))}
        </div>
      ) : (
        // ── Table view ─────────────────────────────────────────────────────────
        <div data-tour="portfolio-list" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['', 'Address', 'Status', 'Showing', 'Price', 'Cash In', 'NOI Yr1', 'CoC Yr1', 'Cap Rate', 'IRR 10yr', 'EqMult', 'DSCR', ''].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: 'var(--muted)', fontWeight: 700, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', borderBottom: '2px solid var(--border)', whiteSpace: 'nowrap', background: 'var(--table-head)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((d, i) => {
                const r = resultsByDealId[d.id] || {};
                const isDragging = dragIdx === i, isOver = dragOverIdx === i && dragIdx !== i;
                return (
                  <tr key={d.id} draggable
                    onDragStart={e => handleDragStart(e, i)} onDragOver={e => handleDragOver(e, i)}
                    onDrop={e => handleDrop(e, i)} onDragEnd={handleDragEnd}
                    onClick={() => onSelect(d.id)}
                    style={{ cursor: 'pointer', borderBottom: '1px solid var(--border-faint)', opacity: isDragging ? 0.4 : 1, background: isOver ? 'var(--accent-soft)' : 'transparent', transition: 'background 0.1s' }}
                    onMouseEnter={e => { if (!isDragging) e.currentTarget.style.background = 'var(--row-hover)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = isOver ? 'var(--accent-soft)' : 'transparent'; }}
                  >
                    <td onClick={e => e.stopPropagation()} style={{ padding: '8px 6px 8px 12px', color: 'var(--muted)', cursor: 'grab', fontSize: 16, userSelect: 'none' }} title="Drag to reorder">⠿</td>
                    <td style={{ padding: '12px', fontWeight: 700, color: 'var(--text)' }}>
                      {d.address || <span style={{ color: 'var(--muted)', fontStyle: 'italic' }}>Untitled</span>}
                      {d._isSample && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: 'var(--accent-soft)', color: 'var(--accent)', marginLeft: 6 }}>Sample</span>}
                    </td>
                    <td style={{ padding: '12px' }}><span style={{ background: STATUS_COLORS[d.status] + '22', color: STATUS_COLORS[d.status], borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>{d.status}</span></td>
                    <td style={{ padding: '12px', color: 'var(--text)', fontSize: 11, whiteSpace: 'nowrap' }}>{fmtShowing(d)}</td>
                    <td style={{ padding: '12px', color: 'var(--text)' }}>{FMT_USD(+d.assumptions.purchasePrice)}</td>
                    <td style={{ padding: '12px', color: 'var(--text)' }}>{FMT_USD(r.totalCash)}</td>
                    <td style={{ padding: '12px', color: 'var(--text)' }}>{FMT_USD(r.noi)}</td>
                    <td style={{ padding: '12px', fontWeight: 700, color: cocColor(r.cocReturn) }}>{FMT_PCT(r.cocReturn)}</td>
                    <td style={{ padding: '12px', color: capColor(r.capRate) }}>{FMT_PCT(r.capRate)}</td>
                    <td style={{ padding: '12px', fontWeight: 700, color: irrColor(r.irr) }}>{FMT_PCT(r.irr)}</td>
                    <td style={{ padding: '12px', color: 'var(--text)' }}>{FMT_X(r.equityMultiple)}</td>
                    <td style={{ padding: '12px' }}>{(r.dscr != null && r.dscr > 0) ? <DSCRBadge dscr={r.dscr} /> : '—'}</td>
                    <td style={{ padding: '12px' }}>
                      <button onClick={e => { e.stopPropagation(); setConfirmDeleteId(d.id); }} style={{ background: 'none', border: 'none', color: 'var(--red)', fontSize: 16, padding: 0, cursor: 'pointer' }}>✕</button>
                      {onShareDeal && <button onClick={e => { e.stopPropagation(); onShareDeal(d); }} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 14, padding: '0 2px', cursor: 'pointer' }}>👥</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {confirmDeleteId && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{background:"var(--card)",borderRadius:14,padding:"24px 24px",maxWidth:340,width:"100%",boxShadow:"0 8px 32px rgba(0,0,0,0.25)"}}>
            <div style={{fontSize:16,fontWeight:800,color:"var(--text)",marginBottom:8}}>Delete this deal?</div>
            <div style={{fontSize:13,color:"var(--muted)",marginBottom:20}}>This action can be undone immediately after.</div>
            <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
              <button onClick={()=>setConfirmDeleteId(null)} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:8,padding:"8px 18px",fontSize:13,fontWeight:700,cursor:"pointer",color:"var(--text)"}}>Cancel</button>
              <button onClick={confirmDelete} style={{background:"var(--red)",border:"none",borderRadius:8,padding:"8px 18px",fontSize:13,fontWeight:700,cursor:"pointer",color:"#fff"}}>Delete</button>
            </div>
          </div>
        </div>
      )}
      {toast && <UndoToast message={toast.message} onUndo={() => { onReorder(toast.snapshot); setToast(null); }} onDismiss={() => setToast(null)} />}
    </div>
  );
}

export default PortfolioPage;
