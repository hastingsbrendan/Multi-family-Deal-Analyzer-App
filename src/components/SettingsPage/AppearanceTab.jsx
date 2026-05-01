import React from 'react';

// Appearance tab — dark-mode toggle and a small "for informational purposes only" footer.
function AppearanceTab({ dark, setDark, card }) {
  return (
    <>
      <div style={card}>
        <div style={{fontWeight:700,fontSize:14,marginBottom:14}}>Appearance</div>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div>
            <div style={{fontSize:14,fontWeight:500}}>Dark mode</div>
            <div style={{fontSize:12,color:'var(--muted)',marginTop:2}}>Easy on the eyes for late-night deal analysis</div>
          </div>
          <button onClick={()=>{const nd=!dark;setDark(nd);localStorage.setItem('rh_dark',nd);}}
            style={{background:dark?'var(--accent)':'#cbd5e1',border:'none',borderRadius:20,
              width:46,height:24,position:'relative',cursor:'pointer',transition:'background 0.2s',flexShrink:0}}>
            <div style={{width:16,height:16,background:'#fff',borderRadius:'50%',position:'absolute',
              top:4,left:dark?26:4,transition:'left 0.2s'}}/>
          </button>
        </div>
      </div>
      <div style={{textAlign:'center',marginTop:24,paddingTop:20,borderTop:'1px solid var(--border)'}}>
        <div style={{fontSize:12,color:'var(--muted)',lineHeight:1.6}}>
          For informational purposes only. Not financial, legal, or tax advice.
        </div>
        <div style={{fontSize:12,marginTop:6,display:'flex',gap:16,justifyContent:'center'}}>
          <a href="/legal/tos.html" target="_blank" style={{color:'var(--muted)',textDecoration:'none'}}>Terms of Service</a>
          <a href="/legal/privacy.html" target="_blank" style={{color:'var(--muted)',textDecoration:'none'}}>Privacy Policy</a>
        </div>
      </div>
    </>
  );
}

export default AppearanceTab;
