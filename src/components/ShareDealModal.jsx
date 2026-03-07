import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { iSty, btnSm, srcSty } from './ui/InputRow';
import { sbClient } from '../lib/constants';
import { sbGetMyGroups, sbShareDealToGroup } from '../lib/calc';

function ShareDealModal({ deal, user, onClose, onShared }) {
  const [groups, setGroups]   = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [sharing, setSharing] = React.useState(false);
  const [selected, setSelected] = React.useState(null);
  const [msg, setMsg]         = React.useState(null);

  React.useEffect(() => {
    sbGetMyGroups()
      .then(g => {
        setGroups(g.filter(gr => gr.status === 'active' && gr.role !== 'Viewer'));
      })
      .catch(e => {
        setMsg('Could not load groups: ' + e.message);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleShare = async () => {
    if (!selected) return;
    setSharing(true);
    try {
      await sbShareDealToGroup(deal, selected.id);
      onShared(selected.name);
    } catch(e) {
      setMsg('Failed to share: ' + e.message);
      setSharing(false);
    }
  };

  const overlay = {position:'fixed',inset:0,background:'rgba(0,0,0,0.65)',display:'flex',
    alignItems:'center',justifyContent:'center',zIndex:2000,padding:16};
  const box = {background:'var(--card)',border:'1px solid var(--border)',borderRadius:14,
    padding:28,maxWidth:400,width:'100%'};
  const btnPrimary = {background:'var(--accent)',color:'#fff',border:'none',borderRadius:8,
    padding:'10px 20px',fontSize:14,fontWeight:700,cursor:'pointer'};
  const btnGhost = {background:'none',border:'1px solid var(--border)',borderRadius:8,
    padding:'9px 16px',fontSize:13,color:'var(--muted)',cursor:'pointer'};

  return (
    <div style={overlay} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={box}>
        <div style={{fontWeight:800,fontSize:17,marginBottom:4}}>Share Deal</div>
        <div style={{fontSize:13,color:'var(--muted)',marginBottom:18}}>
          {deal.address || 'Untitled Deal'}
        </div>

        {msg && <div style={{background:'#fee2e2',color:'#991b1b',borderRadius:8,
          padding:'8px 12px',marginBottom:12,fontSize:13}}>{msg}</div>}

        {loading ? (
          <div style={{color:'var(--muted)',padding:'20px 0',textAlign:'center'}}>Loading groups…</div>
        ) : groups.length === 0 ? (
          <div style={{textAlign:'center',padding:'20px 0'}}>
            <div style={{fontSize:32,marginBottom:10}}>👥</div>
            <div style={{fontWeight:600,marginBottom:6}}>No groups yet</div>
            <div style={{fontSize:13,color:'var(--muted)'}}>
              Create a group first via the profile menu → Deal Groups.
            </div>
          </div>
        ) : (
          <div style={{marginBottom:18}}>
            <div style={{fontSize:12,fontWeight:700,color:'var(--muted)',textTransform:'uppercase',
              letterSpacing:'0.06em',marginBottom:10}}>Share to Group</div>
            {groups.map(g => (
              <div key={g.id}
                onClick={()=>setSelected(g)}
                style={{display:'flex',alignItems:'center',gap:12,padding:'12px 14px',
                  borderRadius:8,marginBottom:6,cursor:'pointer',
                  border:`2px solid ${selected?.id===g.id ? 'var(--accent)' : 'var(--border)'}`,
                  background: selected?.id===g.id ? 'var(--accent)11' : 'var(--bg)'}}>
                <div style={{width:36,height:36,borderRadius:'50%',background:'var(--accent, #0D9488)',
                  display:'flex',alignItems:'center',justifyContent:'center',
                  fontSize:16,color:'#fff',flexShrink:0}}>
                  {g.name[0].toUpperCase()}
                </div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700,fontSize:14}}>{g.name}</div>
                  <div style={{fontSize:12,color:'var(--muted)'}}>{g.role}</div>
                </div>
                {selected?.id===g.id && <span style={{color:'var(--accent)',fontSize:18}}>✓</span>}
              </div>
            ))}
          </div>
        )}

        <div style={{display:'flex',gap:10}}>
          <button onClick={handleShare}
            disabled={!selected||sharing||groups.length===0}
            style={{...btnPrimary, opacity:(!selected||sharing)?0.5:1}}>
            {sharing ? 'Sharing…' : 'Share Deal'}
          </button>
          <button onClick={onClose} style={btnGhost}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

export default ShareDealModal;
