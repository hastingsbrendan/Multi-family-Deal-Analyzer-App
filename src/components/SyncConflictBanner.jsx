import React from 'react';
import { useIsMobile } from '../lib/hooks';

// BACK-117 — a deal was saved somewhere else (another device, another tab, or a group
// view) after this device loaded it. Nothing is overwritten until the user picks a copy.
// Shows one deal at a time; stays up until answered.
function SyncConflictBanner({ conflicts, deals, onKeepMine, onLoadTheirs }) {
  const isMobile = useIsMobile();
  if (!conflicts?.length) return null;
  const c = conflicts[0];
  const current = (deals || []).find(d => d.id === c.id) || c.mine;
  const name = current?.address?.trim() || 'Untitled deal';
  const deletedThere = !c.theirs;

  const btn = (primary) => ({
    background: primary ? 'var(--accent)' : 'none',
    color: primary ? '#fff' : 'var(--text)',
    border: primary ? 'none' : '1px solid var(--border)',
    borderRadius: 100, padding: '6px 14px', fontSize: 12, fontWeight: 700,
    cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
  });

  return (
    <div role="alertdialog" aria-live="assertive" aria-label="Deal changed elsewhere"
      style={{
        position: 'fixed', bottom: isMobile ? 56 : 64, left: '50%', transform: 'translateX(-50%)',
        zIndex: 9998, width: isMobile ? 'calc(100% - 32px)' : 'auto', maxWidth: 560,
        background: 'var(--card)', border: '1px solid var(--accent2)', borderRadius: 10,
        padding: '12px 16px', boxShadow: 'var(--shadow-lg)',
        display: 'flex', flexDirection: isMobile ? 'column' : 'row',
        alignItems: isMobile ? 'stretch' : 'center', gap: 12,
      }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
          ⚠ “{name}” {deletedThere ? 'was deleted' : 'was changed'} on another device or tab
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
          {deletedThere
            ? 'Keep your copy to restore it, or remove it here too.'
            : 'Your latest edits haven’t been saved yet. Which version should be kept?'}
          {conflicts.length > 1 && ` (1 of ${conflicts.length})`}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: isMobile ? 'flex-end' : 'flex-start' }}>
        <button onClick={() => onLoadTheirs(c.id)} style={btn(false)}>
          {deletedThere ? 'Remove here' : 'Load theirs'}
        </button>
        <button onClick={() => onKeepMine(c.id)} style={btn(true)}>Keep mine</button>
      </div>
    </div>
  );
}

export default SyncConflictBanner;
