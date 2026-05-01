import React from 'react';
import Button from '../ui/Button';

// Groups tab — single CTA into the Groups page (deal sharing / co-invest spaces).
function GroupsTab({ onOpenGroups, card }) {
  return (
    <div style={card}>
      <div style={{fontWeight:700,fontSize:14,marginBottom:4}}>Deal Groups</div>
      <div style={{fontSize:13,color:'var(--muted)',marginBottom:20,lineHeight:1.6}}>
        Share deals with partners, co-investors, or clients. Each group has its own deal list and access controls.
      </div>
      <Button variant="primary" size="lg" onClick={onOpenGroups} style={{borderRadius:8,padding:'12px 20px',display:'inline-flex',alignItems:'center',gap:8}}>
        👥 Manage Deal Groups →
      </Button>
    </div>
  );
}

export default GroupsTab;
