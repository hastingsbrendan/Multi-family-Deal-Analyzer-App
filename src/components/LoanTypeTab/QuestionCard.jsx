import React, { useState } from 'react';
import { QUESTIONS } from '../../lib/loanEngine';
import ProgressBar from '../ui/ProgressBar';

function QuestionCard({ question, value, onChange, onNext, onBack, stepIndex, totalSteps, purchasePrice }) {
  const q = QUESTIONS[question];
  if (!q) return null;

  const [sliderVal, setSliderVal] = useState(value ?? q.default ?? 20);

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

      {/* Slider type (legacy fallback) */}
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

export default QuestionCard;
