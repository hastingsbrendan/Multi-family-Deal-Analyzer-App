import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { SB_BUCKET, sbClient, sbUploadPhoto, sbDeletePhoto } from '../lib/constants';

function PhotoGallery({deal, onUpdate}) {
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const fileRef = useRef();
  const photos = deal.photos || [];

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setUploading(true);
    try {
      const urls = await Promise.all(files.map(f => sbUploadPhoto(deal.id, f)));
      onUpdate({ ...deal, photos: [...photos, ...urls] });
    } catch(err) {
      alert("Photo upload failed: " + err.message + "\n\nMake sure you created the 'deal-photos' storage bucket in Supabase with public access.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleDelete = async (url) => {
    if (!confirm("Remove this photo?")) return;
    onUpdate({ ...deal, photos: photos.filter(p => p !== url) });
    sbDeletePhoto(url).catch(() => {});
  };

  return (
    <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:14,marginBottom:14}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <div style={{fontSize:11,fontWeight:800,letterSpacing:"0.1em",color:"var(--muted)",textTransform:"uppercase"}}>Photos ({photos.length})</div>
        <button onClick={()=>fileRef.current.click()} disabled={uploading} style={{background:"var(--accent)",color:"#fff",border:"none",borderRadius:100,padding:"5px 12px",fontSize:12,fontWeight:700,opacity:uploading?0.6:1}}>
          {uploading?"Uploading…":"📷 Add Photo"}
        </button>
        <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleUpload} style={{display:"none"}}/>
      </div>
      {photos.length === 0 ? (
        <div style={{textAlign:"center",padding:"20px",color:"var(--muted)",fontSize:13,border:"1px dashed var(--border)",borderRadius:8}}>
          No photos yet. Tap Add Photo to attach images from your camera or library.
        </div>
      ) : (
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(100px,1fr))",gap:8}}>
          {photos.map((url, i) => (
            <div key={i} style={{position:"relative",aspectRatio:"1",borderRadius:8,overflow:"hidden",cursor:"pointer"}} onClick={()=>setLightbox(i)}>
              <img src={url} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
              <button onClick={e=>{e.stopPropagation();handleDelete(url);}} style={{position:"absolute",top:4,right:4,background:"rgba(0,0,0,0.6)",border:"none",borderRadius:"50%",width:22,height:22,color:"#fff",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1}}>✕</button>
            </div>
          ))}
        </div>
      )}
      {lightbox !== null && (
        <div onClick={()=>setLightbox(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.92)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <button onClick={e=>{e.stopPropagation();setLightbox(l=>Math.max(0,l-1));}} style={{position:"absolute",left:16,top:"50%",transform:"translateY(-50%)",background:"rgba(255,255,255,0.15)",border:"none",borderRadius:"50%",width:44,height:44,color:"#fff",fontSize:22,display:lightbox===0?"none":"flex",alignItems:"center",justifyContent:"center"}}>‹</button>
          <img src={photos[lightbox]} alt="" style={{maxWidth:"100%",maxHeight:"90vh",objectFit:"contain",borderRadius:8}}/>
          <button onClick={e=>{e.stopPropagation();setLightbox(l=>Math.min(photos.length-1,l+1));}} style={{position:"absolute",right:16,top:"50%",transform:"translateY(-50%)",background:"rgba(255,255,255,0.15)",border:"none",borderRadius:"50%",width:44,height:44,color:"#fff",fontSize:22,display:lightbox===photos.length-1?"none":"flex",alignItems:"center",justifyContent:"center"}}>›</button>
          <button onClick={()=>setLightbox(null)} style={{position:"absolute",top:16,right:16,background:"rgba(255,255,255,0.15)",border:"none",borderRadius:"50%",width:36,height:36,color:"#fff",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
          <div style={{position:"absolute",bottom:16,color:"rgba(255,255,255,0.5)",fontSize:12}}>{lightbox+1} / {photos.length}</div>
        </div>
      )}
    </div>
  );
}

// ─── DEAL SUMMARY TAB ─────────────────────────────────────────────────────────

export default PhotoGallery;
