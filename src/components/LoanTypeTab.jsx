import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useIsMobile } from '../lib/hooks';
import {
  LOAN_CATALOG, LOAN_TYPES, QUESTIONS, getQuestionFlow, runRecommendationEngine,
} from '../lib/loanEngine';

// ─── Shared styles ──────────────────────────────────────────────────────────
const card = (extra = '') => ({
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  ...parseStyleString(extra),
});

function parseStyleString(s) {
  if (!s || typeof s !== 'string') return {};
  return {}; // Not used for string parsing; just a helper marker
}

// ─── Score badge ─────────────────────────────────────────────────────────────
function ScoreBadge({ score }) {
  if (score === 0) return <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', background: 'var(--bg2)', borderRadius: 20, padding: '2px 8px' }}>Not Eligible</span>;
  const color = score >= 4 ? 'var(--green)' : score >= 3 ? '#F59E0B' : '#94a3b8';
  const bg    = score >= 4 ? 'rgba(16,185,129,0.1)' : score >= 3 ? 'rgba(245,158,11,0.1)' : 'rgba(148,163,184,0.1)';
  const label = score === 5 ? 'Best Match' : score === 4 ? 'Strong Match' : score === 3 ? 'Possible' : 'Borderline';
  return <span style={{ fontSize: 11, fontWeight: 700, color, background: bg, borderRadius: 20, padding: '2px 8px', border: `1px solid ${color}33` }}>{label}</span>;
}

// ─── Progress bar ─────────────────────────────────────────────────────────────
function ProgressBar({ current, total }) {
  return (
    <div style={{ height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
      <div style={{
        height: '100%', borderRadius: 2,
        background: 'var(--accent)',
        width: `${((current + 1) / total) * 100}%`,
        transition: 'width 0.35s ease',
      }} />
    </div>
  );
}

// ─── Single question card ─────────────────────────────────────────────────────
function QuestionCard({ question, value, onChange, onNext, onBack, stepIndex, totalSteps }) {
  const q = QUESTIONS[question];
  if (!q) return null;

  const [sliderVal, setSliderVal] = useState(value ?? q.default ?? 20);

  // Handle slider submit
  const handleSliderNext = () => { onChange(sliderVal); onNext(); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Progress */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>
            Question {stepIndex + 1} of {totalSteps}
          </span>
          {onBack && stepIndex > 0 && (
            <button onClick={onBack} style={{ fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, padding: '2px 0' }}>
              ← Back
            </button>
          )}
        </div>
        <ProgressBar current={stepIndex} total={totalSteps} />
      </div>

      {/* Question text */}
      <div>
        <h3 style={{ fontSize: 20, fontFamily: "'Fraunces', serif", fontWeight: 900, color: 'var(--text)', marginBottom: 6, lineHeight: 1.2 }}>
          {q.text}
        </h3>
        <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>{q.subtext}</p>
      </div>

      {/* Choice type */}
      {q.type === 'choice' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {q.options.map(opt => {
            const isSelected = value === opt.value;
            return (
              <button
                key={String(opt.value)}
                onClick={() => { onChange(opt.value); setTimeout(onNext, 200); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '14px 18px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                  border: isSelected ? '2px solid var(--accent)' : '2px solid var(--border)',
                  background: isSelected ? 'var(--accent-soft)' : 'var(--card)',
                  transition: 'all 0.15s',
                }}
              >
                <span style={{ fontSize: 22, flexShrink: 0 }}>{opt.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{opt.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{opt.desc}</div>
                </div>
                {isSelected && <span style={{ color: 'var(--accent)', fontSize: 18, flexShrink: 0 }}>✓</span>}
              </button>
            );
          })}
        </div>
      )}

      {/* Slider type */}
      {q.type === 'slider' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ textAlign: 'center' }}>
            <span style={{ fontSize: 52, fontFamily: "'Fraunces', serif", fontWeight: 900, color: 'var(--accent)' }}>
              {sliderVal}
            </span>
            <span style={{ fontSize: 22, color: 'var(--muted)', marginLeft: 4 }}>%</span>
          </div>
          <input
            type="range"
            min={q.min} max={q.max} step={q.step}
            value={sliderVal}
            onChange={e => setSliderVal(Number(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--accent)', cursor: 'pointer' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)' }}>
            <span>{q.min}% (0% down)</span>
            <span>{q.max}%</span>
          </div>
          {sliderVal < 3 && (
            <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#B45309' }}>
              ⚠️ 0% down is only available with a VA loan for eligible veterans — most loans require at least 3.5%
            </div>
          )}
          {sliderVal >= 3 && sliderVal < 5 && (
            <div style={{ background: 'var(--accent-soft)', border: '1px solid rgba(13,148,136,0.25)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--accentdk)' }}>
              ✓ 3.5% meets the FHA minimum — conventional requires 5% for owner-occupied
            </div>
          )}
          {sliderVal >= 5 && sliderVal < 20 && (
            <div style={{ background: 'var(--accent-soft)', border: '1px solid rgba(13,148,136,0.25)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--accentdk)' }}>
              ✓ Qualifies for conventional (5%+ OO) and FHA — you'll pay PMI until 20% equity is reached
            </div>
          )}
          {sliderVal >= 20 && (
            <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--green)' }}>
              ✓ 20%+ avoids PMI on conventional — also opens investor loan options
            </div>
          )}
          <button
            onClick={handleSliderNext}
            style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 10, padding: '14px 24px', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}
          >
            Continue →
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Recommendation result card ───────────────────────────────────────────────
function RecommendationCard({ loanType, scoreData, answers, onProceed, onExplore, onRestart }) {
  const loan = LOAN_CATALOG[loanType];
  if (!loan) return null;
  const { warnings } = scoreData;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
            ✦ Recommended Loan
          </div>
          <h2 style={{ fontSize: 26, fontFamily: "'Fraunces', serif", fontWeight: 900, color: 'var(--text)', lineHeight: 1.1 }}>
            {loan.icon} {loan.name}
          </h2>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 6 }}>{loan.tagline}</p>
        </div>
        <ScoreBadge score={scoreData.score} />
      </div>

      {/* Why this fits */}
      <div style={{ background: 'var(--accent-soft)', border: '1px solid rgba(13,148,136,0.2)', borderRadius: 10, padding: '14px 16px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>Why this fits your situation</div>
        <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>{loan.whoItsFor}</p>
      </div>

      {/* Key numbers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        {[
          { label: 'Min Down Payment', value: (() => {
            if (answers.ownerOccupied) {
              const d = loan.downPaymentOO?.[`${answers.numUnits}unit`];
              return d != null ? `${d}%` : 'N/A';
            } else {
              const d = loan.downPaymentInv?.[`${answers.numUnits}unit`];
              return d != null ? `${d}%` : 'N/A';
            }
          })() },
          { label: 'Rate vs Market', value: loan.ratePremium === 0 ? 'At market' : loan.ratePremium > 0 ? `+${loan.ratePremium}%` : `${loan.ratePremium}%` },
          { label: 'Mortgage Insurance', value: loan.mi?.split(';')[0] || '—' },
        ].map(({ label, value }) => (
          <div key={label} style={{ background: 'var(--bg2)', borderRadius: 8, padding: '12px', textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, fontWeight: 600 }}>{label}</div>
            <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 700 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Pros & Cons */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>Advantages</div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
            {loan.pros.slice(0, 4).map((p, i) => (
              <li key={i} style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.4, paddingLeft: 14, position: 'relative' }}>
                <span style={{ position: 'absolute', left: 0, color: 'var(--green)' }}>+</span>
                {p}
              </li>
            ))}
          </ul>
        </div>
        <div style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>Limitations</div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
            {loan.cons.slice(0, 4).map((c, i) => (
              <li key={i} style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.4, paddingLeft: 14, position: 'relative' }}>
                <span style={{ position: 'absolute', left: 0, color: 'var(--red)' }}>−</span>
                {c}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Borderline warnings */}
      {warnings && warnings.length > 0 && (
        <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#B45309', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>⚠️ Things to watch</div>
          {warnings.map((w, i) => (
            <p key={i} style={{ fontSize: 12, color: '#92400E', lineHeight: 1.5, margin: 0, marginBottom: i < warnings.length - 1 ? 6 : 0 }}>{w}</p>
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 4 }}>
        <button
          onClick={onProceed}
          style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 10, padding: '15px 24px', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}
        >
          ✓ Proceed with {loan.shortName}
        </button>
        <button
          onClick={onExplore}
          style={{ background: 'var(--card)', color: 'var(--accent)', border: '2px solid var(--accent)', borderRadius: 10, padding: '13px 24px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
        >
          Explore All Loan Options →
        </button>
        <button
          onClick={onRestart}
          style={{ background: 'none', color: 'var(--muted)', border: 'none', padding: '8px', fontSize: 12, cursor: 'pointer' }}
        >
          ↺ Start Over
        </button>
      </div>
    </div>
  );
}

// ─── Comparison table ─────────────────────────────────────────────────────────
function ComparisonTable({ scores, recommended, answers, onSelectLoan, onRestart }) {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const isMobile = useIsMobile();

  const categories = [
    { id: 'all', label: 'All Loans' },
    { id: 'oo', label: 'Owner-Occupied' },
    { id: 'investor', label: 'Investor' },
    { id: 'renovation', label: 'Renovation' },
  ];

  const allLoans = Object.entries(LOAN_CATALOG).map(([key, loan]) => ({
    key,
    loan,
    ...scores[key] || { score: 0, warnings: [], reasons: [] },
  }));

  const filtered = allLoans
    .filter(({ key, loan }) => {
      if (selectedCategory === 'oo') return loan.category.includes('Owner-Occupied') || loan.category.includes('OO');
      if (selectedCategory === 'investor') return loan.category.includes('Investor');
      if (selectedCategory === 'renovation') return loan.renovation;
      return true;
    })
    .sort((a, b) => b.score - a.score);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h3 style={{ fontSize: 18, fontFamily: "'Fraunces', serif", fontWeight: 900, color: 'var(--text)' }}>
            All Loan Options
          </h3>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
            Tagged based on your answers. Click any loan to learn more.
          </p>
        </div>
        <button
          onClick={onRestart}
          style={{ fontSize: 12, color: 'var(--accent)', background: 'var(--accent-soft)', border: '1px solid rgba(13,148,136,0.25)', borderRadius: 20, padding: '6px 14px', cursor: 'pointer', fontWeight: 700 }}
        >
          ↺ Start Over
        </button>
      </div>

      {/* Category filter */}
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id)}
            style={{
              padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
              background: selectedCategory === cat.id ? 'var(--accent)' : 'var(--card)',
              color: selectedCategory === cat.id ? '#fff' : 'var(--muted)',
              border: selectedCategory === cat.id ? 'none' : '1px solid var(--border)',
            }}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Loan cards grid */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: 12 }}>
        {filtered.map(({ key, loan, score, warnings, reasons }) => {
          const isRecommended = key === recommended;
          const isIneligible = score === 0;
          return (
            <button
              key={key}
              onClick={() => !isIneligible && onSelectLoan(key)}
              style={{
                textAlign: 'left', padding: 16, borderRadius: 12, cursor: isIneligible ? 'default' : 'pointer',
                border: isRecommended ? '2px solid var(--accent)' : '1px solid var(--border)',
                background: isRecommended ? 'var(--accent-soft)' : isIneligible ? 'var(--bg2)' : 'var(--card)',
                opacity: isIneligible ? 0.55 : 1,
                transition: 'all 0.15s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 20 }}>{loan.icon}</span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{loan.shortName || loan.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{loan.category}</div>
                  </div>
                </div>
                <ScoreBadge score={score} />
              </div>
              <p style={{ fontSize: 12, color: isIneligible ? 'var(--muted)' : 'var(--text)', lineHeight: 1.5, margin: 0 }}>
                {isIneligible
                  ? (reasons[0] || 'Not eligible based on your answers')
                  : loan.tagline
                }
              </p>
              {warnings && warnings.length > 0 && !isIneligible && (
                <div style={{ marginTop: 8, fontSize: 11, color: '#B45309', background: 'rgba(245,158,11,0.08)', borderRadius: 6, padding: '6px 10px' }}>
                  ⚠️ {warnings[0].substring(0, 80)}{warnings[0].length > 80 ? '…' : ''}
                </div>
              )}
              {isRecommended && (
                <div style={{ marginTop: 8, fontSize: 11, fontWeight: 700, color: 'var(--accent)' }}>★ Recommended for you</div>
              )}
            </button>
          );
        })}
      </div>

      {/* Loan detail modal */}
    </div>
  );
}

// ─── Loan detail panel ────────────────────────────────────────────────────────
function LoanDetailPanel({ loanType, scoreData, onProceed, onBack }) {
  const loan = LOAN_CATALOG[loanType];
  if (!loan) return null;
  const { warnings = [] } = scoreData || {};

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Back */}
      <button onClick={onBack} style={{ alignSelf: 'flex-start', fontSize: 13, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>
        ← Back to all loans
      </button>

      {/* Header */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
          {loan.category}
        </div>
        <h2 style={{ fontSize: 24, fontFamily: "'Fraunces', serif", fontWeight: 900, color: 'var(--text)', lineHeight: 1.1 }}>
          {loan.icon} {loan.name}
        </h2>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 6 }}>{loan.tagline}</p>
        {scoreData && <div style={{ marginTop: 10 }}><ScoreBadge score={scoreData.score} /></div>}
      </div>

      {/* Who it's for */}
      <div style={{ background: 'var(--accent-soft)', border: '1px solid rgba(13,148,136,0.2)', borderRadius: 10, padding: '14px 16px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>Best For</div>
        <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6, margin: 0 }}>{loan.whoItsFor}</p>
      </div>

      {/* Key details */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
        {[
          { label: 'Min Credit Score', value: `${loan.minCredit}+` },
          { label: 'Rate Premium', value: loan.ratePremium === 0 ? 'At market' : loan.ratePremium > 0 ? `+${loan.ratePremium}%` : `${loan.ratePremium}% (below market)` },
          { label: 'Assumable', value: loan.assumable ? '✓ Yes' : '✗ No' },
          { label: 'Renovation Eligible', value: loan.renovation ? '✓ Yes' : '✗ No' },
        ].map(({ label, value }) => (
          <div key={label} style={{ background: 'var(--bg2)', borderRadius: 8, padding: '12px 14px' }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, fontWeight: 600 }}>{label}</div>
            <div style={{ fontSize: 14, color: 'var(--text)', fontWeight: 700 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* MI */}
      <div style={{ background: 'var(--bg2)', borderRadius: 10, padding: '12px 14px' }}>
        <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, marginBottom: 4 }}>Mortgage Insurance</div>
        <p style={{ fontSize: 13, color: 'var(--text)', margin: 0 }}>{loan.mi}</p>
      </div>

      {/* Pros & Cons */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>Advantages</div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
            {loan.pros.map((p, i) => (
              <li key={i} style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.4, paddingLeft: 14, position: 'relative' }}>
                <span style={{ position: 'absolute', left: 0, color: 'var(--green)' }}>+</span>{p}
              </li>
            ))}
          </ul>
        </div>
        <div style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>Limitations</div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
            {loan.cons.map((c, i) => (
              <li key={i} style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.4, paddingLeft: 14, position: 'relative' }}>
                <span style={{ position: 'absolute', left: 0, color: 'var(--red)' }}>−</span>{c}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#B45309', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>⚠️ Watch out</div>
          {warnings.map((w, i) => <p key={i} style={{ fontSize: 12, color: '#92400E', lineHeight: 1.5, margin: 0, marginBottom: i < warnings.length - 1 ? 6 : 0 }}>{w}</p>)}
        </div>
      )}

      {/* Renovation details */}
      {loan.renovationDetails && (
        <div style={{ background: 'var(--bg2)', borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, marginBottom: 4 }}>Renovation Details</div>
          <p style={{ fontSize: 13, color: 'var(--text)', margin: 0 }}>{loan.renovationDetails}</p>
        </div>
      )}

      {/* CTA */}
      {scoreData && scoreData.score > 0 && (
        <button
          onClick={() => onProceed(loanType)}
          style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 10, padding: '15px 24px', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}
        >
          ✓ Proceed with {loan.shortName || loan.name}
        </button>
      )}
    </div>
  );
}

// ─── Quiz modal ───────────────────────────────────────────────────────────────
function QuizModal({ deal, onComplete, onClose }) {
  const [answers, setAnswers] = useState({
    numUnits: deal?.assumptions?.numUnits || 2,
    purchasePrice: deal?.assumptions?.purchasePrice || 450000,
    monthlyRent: (() => {
      if (!deal?.assumptions?.units) return 0;
      return deal.assumptions.units
        .slice(0, deal.assumptions.numUnits || 2)
        .reduce((s, u) => s + (+(u.rent || u.listedRent) || 0), 0);
    })(),
  });
  const [stepIndex, setStepIndex] = useState(0);

  const questionFlow = useMemo(() => getQuestionFlow(answers, deal), [answers]);
  const totalSteps = questionFlow.length;
  const currentQuestion = questionFlow[stepIndex];

  const handleAnswer = useCallback((val) => {
    setAnswers(prev => ({ ...prev, [currentQuestion]: val }));
  }, [currentQuestion]);

  const handleNext = useCallback(() => {
    if (stepIndex < totalSteps - 1) {
      setStepIndex(i => i + 1);
    } else {
      onComplete(answers);
    }
  }, [stepIndex, totalSteps, answers, onComplete]);

  const handleBack = useCallback(() => {
    if (stepIndex > 0) setStepIndex(i => i - 1);
  }, [stepIndex]);

  // If we've answered all questions and trigger completion
  useEffect(() => {
    if (stepIndex >= totalSteps && totalSteps > 0) {
      onComplete(answers);
    }
  }, [stepIndex, totalSteps]);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }}>
      <div style={{
        background: 'var(--card)', borderRadius: 16, padding: 28,
        width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        position: 'relative',
      }}>
        {/* Close */}
        <button onClick={onClose} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', fontSize: 20, color: 'var(--muted)', cursor: 'pointer', lineHeight: 1 }}>×</button>

        {/* Pre-populated context callout */}
        {(answers.numUnits || answers.purchasePrice) && (
          <div style={{ background: 'var(--bg2)', borderRadius: 8, padding: '10px 14px', marginBottom: 20, fontSize: 12, color: 'var(--muted)' }}>
            <span style={{ fontWeight: 700, color: 'var(--text)' }}>📋 Pulled from your deal: </span>
            {answers.numUnits}-unit property · {answers.purchasePrice ? `$${answers.purchasePrice.toLocaleString()}` : ''}
            {answers.monthlyRent > 0 ? ` · $${answers.monthlyRent.toLocaleString()}/mo rent` : ''}
          </div>
        )}

        <QuestionCard
          question={currentQuestion}
          value={answers[currentQuestion]}
          onChange={handleAnswer}
          onNext={handleNext}
          onBack={handleBack}
          stepIndex={stepIndex}
          totalSteps={totalSteps}
        />
      </div>
    </div>
  );
}

// ─── Selected loan banner ─────────────────────────────────────────────────────
function SelectedLoanBanner({ loanType, onClear }) {
  const loan = LOAN_CATALOG[loanType];
  if (!loan) return null;
  return (
    <div style={{
      background: 'var(--accent-soft)', border: '1px solid rgba(13,148,136,0.3)',
      borderRadius: 10, padding: '12px 16px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 20 }}>{loan.icon}</span>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: 0.8 }}>Selected Loan Type</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{loan.name}</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--accentdk)', background: 'var(--accentlt)', borderRadius: 20, padding: '3px 10px', fontWeight: 700 }}>✓ Active</span>
        <button onClick={onClear} style={{ fontSize: 11, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>Change</button>
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
const LS_KEY = 'rh_loan_quiz_v1';

function LoanTypeTab({ deal }) {
  const isMobile = useIsMobile();

  // Persisted state
  const [savedState, setSavedState] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { return {}; }
  });

  const persist = (update) => {
    const next = { ...savedState, ...update };
    setSavedState(next);
    try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch {}
  };

  const {
    quizAnswers,
    engineResult,
    selectedLoan,
    view = 'start', // 'start' | 'result' | 'explore' | 'detail'
    detailLoan,
  } = savedState;

  const [showQuiz, setShowQuiz] = useState(!quizAnswers);

  const handleQuizComplete = useCallback((answers) => {
    const result = runRecommendationEngine(answers, deal);
    persist({ quizAnswers: answers, engineResult: result, view: 'result' });
    setShowQuiz(false);
  }, [deal]);

  const handleProceed = useCallback((loanType) => {
    persist({ selectedLoan: loanType, view: 'result' });
    // Scroll to top of tab
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleExplore = () => persist({ view: 'explore' });
  const handleRestart = () => { persist({ quizAnswers: null, engineResult: null, selectedLoan: null, view: 'start' }); setShowQuiz(true); };
  const handleDetailLoan = (loanType) => persist({ detailLoan: loanType, view: 'detail' });
  const handleBackFromDetail = () => persist({ view: 'explore' });

  // Determine content area
  const renderContent = () => {
    if (!quizAnswers && !showQuiz) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, padding: '60px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 48 }}>🏦</div>
          <div>
            <h2 style={{ fontSize: 22, fontFamily: "'Fraunces', serif", fontWeight: 900, color: 'var(--text)', marginBottom: 8 }}>
              Find the Right Loan
            </h2>
            <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6, maxWidth: 360 }}>
              Answer a few quick questions and we'll recommend the best loan type for your situation — just like a loan officer would.
            </p>
          </div>
          <button
            onClick={() => setShowQuiz(true)}
            style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 10, padding: '14px 28px', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}
          >
            Get My Recommendation →
          </button>
        </div>
      );
    }

    if (view === 'result' && engineResult) {
      const { recommended, scores } = engineResult;
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {selectedLoan && <SelectedLoanBanner loanType={selectedLoan} onClear={() => persist({ selectedLoan: null })} />}
          <RecommendationCard
            loanType={recommended}
            scoreData={scores[recommended]}
            answers={quizAnswers}
            onProceed={() => handleProceed(recommended)}
            onExplore={handleExplore}
            onRestart={handleRestart}
          />
        </div>
      );
    }

    if (view === 'explore' && engineResult) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {selectedLoan && <SelectedLoanBanner loanType={selectedLoan} onClear={() => persist({ selectedLoan: null })} />}
          {/* Back to recommendation */}
          <button
            onClick={() => persist({ view: 'result' })}
            style={{ alignSelf: 'flex-start', fontSize: 13, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}
          >
            ← Back to My Recommendation
          </button>
          <ComparisonTable
            scores={engineResult.scores}
            recommended={engineResult.recommended}
            answers={quizAnswers}
            onSelectLoan={handleDetailLoan}
            onRestart={handleRestart}
          />
        </div>
      );
    }

    if (view === 'detail' && detailLoan && engineResult) {
      return (
        <LoanDetailPanel
          loanType={detailLoan}
          scoreData={engineResult.scores[detailLoan]}
          onProceed={handleProceed}
          onBack={handleBackFromDetail}
        />
      );
    }

    return null;
  };

  return (
    <div style={{ padding: isMobile ? '16px 0' : '20px 0' }}>
      {/* Tab header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h2 style={{ fontSize: isMobile ? 18 : 20, fontFamily: "'Fraunces', serif", fontWeight: 900, color: 'var(--text)' }}>
              Loan Type Finder
            </h2>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
              Personalized loan recommendations based on your situation
            </p>
          </div>
          {quizAnswers && (
            <button
              onClick={handleRestart}
              style={{ fontSize: 12, color: 'var(--muted)', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 20, padding: '6px 14px', cursor: 'pointer', fontWeight: 600 }}
            >
              ↺ Start Over
            </button>
          )}
        </div>

        {/* Show the deal context pulled */}
        {deal?.assumptions && quizAnswers && (
          <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[
              { label: deal.assumptions.numUnits + '-unit property', icon: '🏘️' },
              { label: deal.assumptions.purchasePrice ? '$' + Number(deal.assumptions.purchasePrice).toLocaleString() : null, icon: '💰' },
              { label: quizAnswers.ownerOccupied ? 'Owner-Occupied' : 'Investor', icon: quizAnswers.ownerOccupied ? '🏠' : '📈' },
            ].filter(t => t.label).map(tag => (
              <span key={tag.label} style={{ fontSize: 11, color: 'var(--muted)', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 20, padding: '3px 10px', fontWeight: 600 }}>
                {tag.icon} {tag.label}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Main content */}
      {renderContent()}

      {/* Quiz modal */}
      {showQuiz && (
        <QuizModal
          deal={deal}
          onComplete={handleQuizComplete}
          onClose={() => {
            setShowQuiz(false);
            if (!quizAnswers) persist({ view: 'start' });
          }}
        />
      )}
    </div>
  );
}

export default LoanTypeTab;
