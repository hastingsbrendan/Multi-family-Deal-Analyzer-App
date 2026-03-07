import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { iSty } from './ui/InputRow';
import { FMT_PCT, FMT_USD, FMT_X, STATUS_COLORS, STATUS_OPTIONS } from '../lib/constants';;
import { useIsMobile } from '../lib/hooks';
import { calcDeal } from '../lib/calc';
import { exportPortfolioCSV, dlFile } from '../lib/export';
import DSCRBadge from './ui/DSCRBadge';
import PortfolioMap from './PortfolioMap';
import UndoToast from './ui/UndoToast';

function PortfolioPage({deals, onSelect, onAdd, onDelete, onExport, onReorder, dark, setDark, filterState, onTour, activeGroup, onExitGroup, onShareDeal, onOpenGroups}) {
  const [filter, setFilter] = filterState; // lifted state so it persists across navigation
  const [dragIdx, setDragIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const [toast, setToast] = useState(null); // { message, deals }
  const isMobile = useIsMobile();
  const filtered = (filter==="All" ? deals : (deals||[]).filter(d=>d.status===filter))
    .slice().sort((a,b) => {
      const aPass = a.status==="Pass" ? 1 : 0;
      const bPass = b.status==="Pass" ? 1 : 0;
      return aPass - bPass;
    });

  const handleDragStart=(e,i)=>{setDragIdx(i);e.dataTransfer.effectAllowed="move";};
  const handleDragOver=(e,i)=>{e.preventDefault();setDragOverIdx(i);};
  const handleDrop=(e,i)=>{e.preventDefault();if(dragIdx===null||dragIdx===i){setDragIdx(null);setDragOverIdx(null);return;}const fromId=filtered[dragIdx].id;const toId=filtered[i].id;const fromFull=deals.findIndex(d=>d.id===fromId);const toFull=deals.findIndex(d=>d.id===toId);const next=[...deals];const[moved]=next.splice(fromFull,1);next.splice(toFull,0,moved);onReorder(next);setDragIdx(null);setDragOverIdx(null);};
  const handleDragEnd=()=>{setDragIdx(null);setDragOverIdx(null);};
  const moveItem=(i,dir)=>{const toIdx=i+dir;if(toIdx<0||toIdx>=filtered.length)return;const fromId=filtered[i].id;const toId=filtered[toIdx].id;const fromFull=deals.findIndex(d=>d.id===fromId);const toFull=deals.findIndex(d=>d.id===toId);const next=[...deals];const[moved]=next.splice(fromFull,1);next.splice(toFull,0,moved);onReorder(next);};

  // Soft delete with undo
  const handleDelete = (id) => {
    const snapshot = [...deals];
    const deal = deals.find(d=>d.id===id);
    onDelete(id);
    setToast({ message: `"${deal.address||'Deal'}" deleted`, snapshot });
  };

  const fmtShowing=(d)=>{if(!d.showingDate)return"—";const dateStr=d.showingDate.replace(/(\d{4})-(\d{2})-(\d{2})/,"$2/$3/$1").replace(/^0/,"");if(!d.showingTime)return dateStr;const dt=new Date(d.showingDate+"T"+d.showingTime);return dateStr+" · "+dt.toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});};

  const filterBar = (
    <div style={{display:"flex",gap:6,marginBottom:14,overflowX:"auto",paddingBottom:4,scrollbarWidth:"none"}}>
      {["All",...STATUS_OPTIONS].map(s=>(<button key={s} onClick={()=>setFilter(s)} style={{background:filter===s?(s==="All"?"var(--accent)":STATUS_COLORS[s]):"var(--card)",color:filter===s?"#fff":"var(--muted)",border:`1px solid ${s==="All"?"var(--border)":(STATUS_COLORS[s]||"var(--border)")}`,borderRadius:20,padding:"5px 14px",fontSize:11,fontWeight:700,whiteSpace:"nowrap",flexShrink:0}}>{s}</button>))}
    </div>
  );

  if(isMobile){return(<div style={{paddingBottom:80}}>
    {activeGroup&&<div style={{background:"var(--accentlt, #CCFBF1)",border:"1px solid rgba(13,148,136,0.25)",borderRadius:14,padding:"12px 16px",marginBottom:12,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
      <span style={{fontSize:16}}>👥</span>
      <div style={{flex:1}}>
        <div style={{fontWeight:700,fontSize:13,color:"var(--accentdk, #0F766E)"}}>{activeGroup.name}</div>
        <div style={{fontSize:11,color:"var(--accent, #0D9488)"}}>{activeGroup.role} · Group Portfolio</div>
      </div>
      <button onClick={onExitGroup} style={{background:"none",border:"1px solid rgba(13,148,136,0.35)",borderRadius:6,padding:"4px 10px",fontSize:11,color:"var(--accent, #0D9488)",cursor:"pointer",fontWeight:700}}>← My Deals</button>
    </div>}
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
      <div><div style={{fontFamily:"'Fraunces',serif",fontSize:24,fontWeight:900,color:"var(--text)",letterSpacing:"-1px"}}><span>Rent</span><span style={{color:"var(--accent)"}}>Hack</span></div><div style={{fontSize:12,color:"var(--muted)",marginTop:1}}>2–4 unit multifamily</div></div>
      <div style={{display:"flex",gap:8}}>
        <button onClick={()=>onTour&&onTour()} style={{background:"none",border:"1px solid var(--border)",borderRadius:8,padding:"8px 14px",color:"var(--muted)",fontSize:13,cursor:"pointer",fontWeight:600,display:"flex",alignItems:"center",gap:6}}>🗺️ Take a Tour</button>
        <button onClick={()=>window._openGroups&&window._openGroups()} style={{background:"none",border:"1px solid var(--border)",borderRadius:8,padding:"8px 14px",color:"var(--muted)",fontSize:13,cursor:"pointer",fontWeight:600,display:"flex",alignItems:"center",gap:6}}>👥 Groups</button>
        <button onClick={onAdd} style={{background:"var(--accent)",color:"#fff",border:"none",borderRadius:100,padding:"8px 16px",fontSize:13,fontWeight:800}}>+ Add</button>
      </div>
    </div>
    {filterBar}
    <PortfolioMap deals={filtered} onSelect={onSelect}/>
    {filtered.length===0?(<div style={{textAlign:"center",padding:"60px 20px",color:"var(--muted)"}}>{(deals||[]).length===0?<><div style={{fontSize:48,marginBottom:12}}>🏘</div><div>No deals yet. Tap <strong style={{color:"var(--text)"}}>+ Add</strong> to start.</div></>:"No deals match this filter."}</div>):(
      filtered.map((d,i)=>{const r=calcDeal(d);return(<div key={d.id} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:12,padding:14,marginBottom:10}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10,gap:8}}>
          <div style={{flex:1,minWidth:0}} onClick={()=>onSelect(d.id)}>
            <div style={{fontWeight:800,fontSize:14,color:"var(--text)",marginBottom:3}}>{d.address||<em style={{color:"var(--muted)"}}>Untitled</em>}</div>
            <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
              <span style={{background:STATUS_COLORS[d.status]+"22",color:STATUS_COLORS[d.status],borderRadius:4,padding:"1px 7px",fontSize:10,fontWeight:700}}>{d.status}</span>
              {d.showingDate&&<span style={{fontSize:10,color:"var(--muted)"}}>📅 {fmtShowing(d)}</span>}
              {d.photos?.length>0&&<span style={{fontSize:10,color:"var(--muted)"}}>📷 {d.photos.length}</span>}
            </div>
          </div>
          <div style={{display:"flex",gap:4,flexShrink:0}}>
            <button onClick={()=>moveItem(i,-1)} disabled={i===0} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:4,width:28,height:28,fontSize:12,color:i===0?"var(--border)":"var(--text)",display:"flex",alignItems:"center",justifyContent:"center"}}>↑</button>
            <button onClick={()=>moveItem(i,1)} disabled={i===filtered.length-1} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:4,width:28,height:28,fontSize:12,color:i===filtered.length-1?"var(--border)":"var(--text)",display:"flex",alignItems:"center",justifyContent:"center"}}>↓</button>
            <button onClick={()=>onSelect(d.id)} style={{background:"var(--accent)",border:"none",borderRadius:4,padding:"5px 10px",fontSize:11,color:"#fff",fontWeight:700}}>Open →</button>
            <button onClick={e=>{e.stopPropagation();handleDelete(d.id);}} style={{background:"none",border:"none",color:"#ef4444",fontSize:18,padding:"0 4px",display:"flex",alignItems:"center"}}>✕</button>
            {onShareDeal&&<button onClick={e=>{e.stopPropagation();onShareDeal(d);}} style={{background:"none",border:"none",color:"#0D9488",fontSize:16,padding:"0 4px",display:"flex",alignItems:"center"}} title="Share deal">👥</button>}
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}} onClick={()=>onSelect(d.id)}>
          {[["Price",FMT_USD(+d.assumptions.purchasePrice),false],["CoC (Yr1)",FMT_PCT(r.cocReturn),true],["IRR (10yr)",FMT_PCT(r.irr),true],["NOI (Yr1)",FMT_USD(r.noi),false],["Cap Rate",FMT_PCT(r.capRate),false],["Cash In",FMT_USD(r.totalCash),false]].map(([lbl,val,accent])=>(<div key={lbl}><div style={{fontSize:9,color:"var(--muted)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:1}}>{lbl}</div><div style={{fontSize:13,fontWeight:700,color:accent?"var(--accent)":"var(--text)"}}>{val}</div></div>))}
        </div>
      </div>);}))
    }
    {toast&&<UndoToast message={toast.message} onUndo={()=>{onReorder(toast.snapshot);setToast(null);}} onDismiss={()=>setToast(null)}/>}
  </div>);}

  // Desktop table layout
  return(<div style={{maxWidth:1100,margin:"0 auto",paddingBottom:40}}>
    {activeGroup&&<div style={{background:"var(--accentlt, #CCFBF1)",border:"1px solid rgba(13,148,136,0.25)",borderRadius:10,padding:"12px 18px",marginBottom:16,display:"flex",alignItems:"center",gap:12}}>
      <span style={{fontSize:18}}>👥</span>
      <div style={{flex:1}}>
        <div style={{fontWeight:700,fontSize:14,color:"var(--accentdk, #0F766E)"}}>{activeGroup.name}</div>
        <div style={{fontSize:12,color:"var(--accent, #0D9488)"}}>{activeGroup.role} · Shared Group Portfolio</div>
      </div>
      <button onClick={onExitGroup} style={{background:"none",border:"1px solid rgba(13,148,136,0.35)",borderRadius:7,padding:"6px 14px",fontSize:12,color:"var(--accent, #0D9488)",cursor:"pointer",fontWeight:700}}>← Back to My Deals</button>
    </div>}
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:28}}>
      <div><div style={{fontSize:28,fontWeight:800,color:"var(--text)",letterSpacing:"-0.02em"}}><span>Rent</span><span style={{color:"var(--accent)"}}>Hack</span></div><div style={{fontSize:13,color:"var(--muted)"}}>2–4 Unit Multifamily · 10-Year Hold</div></div>
      <div style={{display:"flex",gap:10}}>
        <button onClick={()=>onTour&&onTour()} style={{background:"none",border:"1px solid var(--border)",borderRadius:8,padding:"8px 14px",color:"var(--muted)",fontSize:13,cursor:"pointer",fontWeight:600,display:"flex",alignItems:"center",gap:6}}>🗺️ Take a Tour</button>
        <button onClick={()=>onOpenGroups&&onOpenGroups()} style={{background:"none",border:"1px solid var(--border)",borderRadius:8,padding:"8px 14px",color:"var(--muted)",fontSize:13,cursor:"pointer",fontWeight:600,display:"flex",alignItems:"center",gap:6}}>👥 Groups</button>
        <button onClick={onExport} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:8,padding:"8px 16px",color:"var(--text)",fontSize:13,fontWeight:700}}>⬇ Export</button>
        <button onClick={onAdd} style={{background:"var(--accent)",color:"#fff",border:"none",borderRadius:100,padding:"8px 18px",fontSize:13,fontWeight:800}}>+ New Deal</button>
      </div>
    </div>
    {filterBar}
    <PortfolioMap deals={filtered} onSelect={onSelect}/>
    {filtered.length===0?(<div style={{textAlign:"center",padding:"80px 20px",color:"var(--muted)"}}>{(deals||[]).length===0?<><div style={{fontSize:48,marginBottom:16}}>🏘</div><div style={{fontSize:16}}>No deals yet. Click <strong style={{color:"var(--text)"}}>+ New Deal</strong> to get started.</div></>:"No deals match this filter."}</div>):(
      <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
        <thead><tr>{["","Address","Status","Showing","Price","Cash In","NOI Yr1","CoC Yr1","Cap Rate","IRR 10yr","EqMult","DSCR",""].map(h=>(<th key={h} style={{padding:"10px 12px",textAlign:"left",color:"var(--muted)",fontWeight:700,fontSize:11,letterSpacing:"0.06em",textTransform:"uppercase",borderBottom:"2px solid var(--border)",whiteSpace:"nowrap",background:"var(--table-head)"}}>{h}</th>))}</tr></thead>
        <tbody>{filtered.map((d,i)=>{const r=calcDeal(d);const isDragging=dragIdx===i;const isOver=dragOverIdx===i&&dragIdx!==i;return(<tr key={d.id} draggable onDragStart={e=>handleDragStart(e,i)} onDragOver={e=>handleDragOver(e,i)} onDrop={e=>handleDrop(e,i)} onDragEnd={handleDragEnd} onClick={()=>onSelect(d.id)} style={{cursor:"pointer",borderBottom:"1px solid var(--border-faint)",opacity:isDragging?0.4:1,background:isOver?"var(--accent-soft)":"transparent",transition:"background 0.1s"}} onMouseEnter={e=>{if(!isDragging)e.currentTarget.style.background="var(--row-hover)";}} onMouseLeave={e=>{e.currentTarget.style.background=isOver?"var(--accent-soft)":"transparent";}}>
          <td onClick={e=>e.stopPropagation()} style={{padding:"8px 6px 8px 12px",color:"var(--muted)",cursor:"grab",fontSize:16,userSelect:"none"}} title="Drag to reorder">⠿</td>
          <td style={{padding:"12px",fontWeight:700,color:"var(--text)"}}>{d.address||<span style={{color:"var(--muted)",fontStyle:"italic"}}>Untitled</span>}</td>
          <td style={{padding:"12px"}}><span style={{background:STATUS_COLORS[d.status]+"22",color:STATUS_COLORS[d.status],borderRadius:4,padding:"2px 8px",fontSize:11,fontWeight:700}}>{d.status}</span></td>
          <td style={{padding:"12px",color:"var(--text)",fontSize:11,whiteSpace:"nowrap"}}>{fmtShowing(d)}</td>
          <td style={{padding:"12px",color:"var(--text)"}}>{FMT_USD(+d.assumptions.purchasePrice)}</td>
          <td style={{padding:"12px",color:"var(--text)"}}>{FMT_USD(r.totalCash)}</td>
          <td style={{padding:"12px",color:"var(--text)"}}>{FMT_USD(r.noi)}</td>
          <td style={{padding:"12px",color:"var(--accent)",fontWeight:700}}>{FMT_PCT(r.cocReturn)}</td>
          <td style={{padding:"12px",color:"var(--text)"}}>{FMT_PCT(r.capRate)}</td>
          <td style={{padding:"12px",color:"var(--accent)",fontWeight:700}}>{FMT_PCT(r.irr)}</td>
          <td style={{padding:"12px",color:"var(--text)"}}>{FMT_X(r.equityMultiple)}</td>
          <td style={{padding:"12px"}}><DSCRBadge dscr={r.dscr}/></td>
          <td style={{padding:"12px"}}><button onClick={e=>{e.stopPropagation();handleDelete(d.id);}} style={{background:"none",border:"none",color:"#ef4444",fontSize:16,padding:0}}>✕</button>
      {onShareDeal&&<button onClick={e=>{e.stopPropagation();onShareDeal(d);}} style={{background:"none",border:"none",color:"#0D9488",fontSize:14,padding:"0 2px",cursor:"pointer"}} title="Share deal">👥</button>}</td>
        </tr>);})}
        </tbody>
      </table></div>
    )}
    {toast&&<UndoToast message={toast.message} onUndo={()=>{onReorder(toast.snapshot);setToast(null);}} onDismiss={()=>setToast(null)}/>}
  </div>);
}

// ─── APP ROOT ─────────────────────────────────────────────────────────────────

// ─── AUTH SCREEN ──────────────────────────────────────────────────────────────

export default PortfolioPage;
