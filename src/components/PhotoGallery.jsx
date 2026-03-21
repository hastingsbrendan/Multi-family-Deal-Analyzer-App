import React, { useState, useRef } from 'react';
import { SB_BUCKET, sbClient, sbUploadPhoto, sbDeletePhoto } from '../lib/constants';

const ROOM_TAGS = [
  'Kitchen','Living Room','Bedroom 1','Bedroom 2','Bedroom 3',
  'Bathroom 1','Bathroom 2','Basement','Attic','Mechanical Room','Exterior','Other'
];

// context: null = general, 'unit_0'..'unit_N' = per unit, 'exterior' = exterior
// Photos are stored as objects: { url, tag, context } — backwards-compatible with old string URLs
function normalizePhoto(p) {
  return typeof p === 'string' ? { url: p, tag: '', context: null } : p;
}

function PhotoGallery({ deal, onUpdate, context, contextLabel }) {
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [pendingTag, setPendingTag] = useState(null); // { url, context } waiting for tag
  const [selectedTag, setSelectedTag] = useState('');
  const fileRef = useRef();

  const allPhotos = (deal.photos || []).map(normalizePhoto);

  // When context is provided, show only photos for that context; otherwise show all
  const photos = context
    ? allPhotos.filter(p => p.context === context)
    : allPhotos;

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
    const invalid = files.find(f => !f.type.startsWith('image/') || f.size > MAX_SIZE);
    if (invalid) {
      alert(invalid.size > MAX_SIZE ? `"${invalid.name}" exceeds the 10 MB limit.` : `"${invalid.name}" is not a valid image.`);
      e.target.value = '';
      return;
    }
    setUploading(true);
    try {
      const urls = await Promise.all(files.map(f => sbUploadPhoto(deal.id, f, context)));
      // After upload, prompt for tag on the first new photo
      // Add all photos as untagged first, then open tag picker for each
      const newPhotos = urls.map(url => ({ url, tag: '', context: context || null }));
      onUpdate({ ...deal, photos: [...(deal.photos||[]).map(normalizePhoto), ...newPhotos] });
      if (urls.length === 1) {
        setPendingTag({ url: urls[0], context: context || null });
        setSelectedTag('');
      }
    } catch(err) {
      alert('Photo upload failed: ' + err.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const applyTag = () => {
    if (!pendingTag) return;
    onUpdate({
      ...deal,
      photos: (deal.photos||[]).map(normalizePhoto).map(p =>
        p.url === pendingTag.url ? { ...p, tag: selectedTag } : p
      )
    });
    setPendingTag(null);
    setSelectedTag('');
  };

  const handleTagChange = (url, tag) => {
    onUpdate({
      ...deal,
      photos: (deal.photos||[]).map(normalizePhoto).map(p =>
        p.url === url ? { ...p, tag } : p
      )
    });
  };

  const handleDelete = async (url) => {
    if (!confirm('Remove this photo?')) return;
    onUpdate({ ...deal, photos: (deal.photos||[]).map(normalizePhoto).filter(p => p.url !== url) });
    sbDeletePhoto(url).catch(() => {});
  };

  const lightboxPhotos = photos;

  return (
    <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:14,marginBottom:14}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <div style={{fontSize:11,fontWeight:800,letterSpacing:"0.1em",color:"var(--muted)",textTransform:"uppercase"}}>
          {contextLabel ? `📷 ${contextLabel} Photos (${photos.length})` : `Photos (${photos.length})`}
        </div>
        <button onClick={()=>fileRef.current.click()} disabled={uploading}
          style={{background:"var(--accent)",color:"#fff",border:"none",borderRadius:100,padding:"5px 12px",fontSize:12,fontWeight:700,opacity:uploading?0.6:1,cursor:"pointer"}}>
          {uploading ? "Uploading…" : "📷 Add Photo"}
        </button>
        <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleUpload} style={{display:"none"}}/>
      </div>

      {/* Tag picker modal */}
      {pendingTag && (
        <div style={{background:"var(--bg)",border:"1px solid var(--accent)",borderRadius:8,padding:12,marginBottom:12}}>
          <div style={{fontSize:12,fontWeight:700,color:"var(--text)",marginBottom:8}}>Tag this photo by room</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:10}}>
            {ROOM_TAGS.map(t => (
              <button key={t} onClick={()=>setSelectedTag(t)}
                style={{padding:"4px 10px",borderRadius:100,border:"1px solid var(--border)",fontSize:11,cursor:"pointer",fontWeight:600,
                  background:selectedTag===t?"var(--accent)":"var(--card)",
                  color:selectedTag===t?"#fff":"var(--text)"}}>
                {t}
              </button>
            ))}
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={applyTag} disabled={!selectedTag}
              style={{background:selectedTag?"var(--accent)":"var(--border)",color:selectedTag?"#fff":"var(--muted)",
                border:"none",borderRadius:100,padding:"6px 16px",fontSize:12,fontWeight:700,
                cursor:selectedTag?"pointer":"not-allowed"}}>
              Save Tag
            </button>
            <button onClick={()=>setPendingTag(null)}
              style={{background:"var(--card)",color:"var(--muted)",border:"1px solid var(--border)",
                borderRadius:100,padding:"6px 14px",fontSize:12,cursor:"pointer"}}>
              Skip
            </button>
          </div>
        </div>
      )}

      {photos.length === 0 ? (
        <div style={{textAlign:"center",padding:"20px",color:"var(--muted)",fontSize:13,border:"1px dashed var(--border)",borderRadius:8}}>
          No photos yet. Tap Add Photo to attach images from your camera or library.
        </div>
      ) : (
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(100px,1fr))",gap:8}}>
          {photos.map((photo, i) => (
            <div key={i} style={{position:"relative",borderRadius:8,overflow:"hidden",cursor:"pointer"}}>
              <div style={{aspectRatio:"1"}} onClick={()=>setLightbox(i)}>
                <img src={photo.url} alt={photo.tag||""} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
              </div>
              {/* Room tag badge */}
              <div style={{position:"absolute",bottom:0,left:0,right:0,background:"rgba(0,0,0,0.55)",padding:"3px 5px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <select value={photo.tag||""} onChange={e=>handleTagChange(photo.url, e.target.value)}
                  onClick={e=>e.stopPropagation()}
                  style={{background:"transparent",border:"none",color:"#fff",fontSize:9,fontWeight:700,cursor:"pointer",width:"100%",maxWidth:72,outline:"none"}}>
                  <option value="">Tag…</option>
                  {ROOM_TAGS.map(t=><option key={t} value={t} style={{background:"#1e293b",color:"#fff"}}>{t}</option>)}
                </select>
              </div>
              <button onClick={e=>{e.stopPropagation();handleDelete(photo.url);}}
                style={{position:"absolute",top:4,right:4,background:"rgba(0,0,0,0.6)",border:"none",borderRadius:"50%",width:22,height:22,color:"#fff",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1,cursor:"pointer"}}>✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightbox !== null && (
        <div onClick={()=>setLightbox(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.92)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <button onClick={e=>{e.stopPropagation();setLightbox(l=>Math.max(0,l-1));}}
            style={{position:"absolute",left:16,top:"50%",transform:"translateY(-50%)",background:"rgba(255,255,255,0.15)",border:"none",borderRadius:"50%",width:44,height:44,color:"#fff",fontSize:22,display:lightbox===0?"none":"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>‹</button>
          <div style={{textAlign:"center"}}>
            <img src={lightboxPhotos[lightbox]?.url} alt="" style={{maxWidth:"100%",maxHeight:"80vh",objectFit:"contain",borderRadius:8}}/>
            {lightboxPhotos[lightbox]?.tag && (
              <div style={{color:"rgba(255,255,255,0.7)",fontSize:13,marginTop:8,fontWeight:600}}>
                📍 {lightboxPhotos[lightbox].tag}
              </div>
            )}
          </div>
          <button onClick={e=>{e.stopPropagation();setLightbox(l=>Math.min(lightboxPhotos.length-1,l+1));}}
            style={{position:"absolute",right:16,top:"50%",transform:"translateY(-50%)",background:"rgba(255,255,255,0.15)",border:"none",borderRadius:"50%",width:44,height:44,color:"#fff",fontSize:22,display:lightbox===lightboxPhotos.length-1?"none":"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>›</button>
          <button onClick={()=>setLightbox(null)}
            style={{position:"absolute",top:16,right:16,background:"rgba(255,255,255,0.15)",border:"none",borderRadius:"50%",width:36,height:36,color:"#fff",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>✕</button>
          <div style={{position:"absolute",bottom:16,color:"rgba(255,255,255,0.5)",fontSize:12}}>{lightbox+1} / {lightboxPhotos.length}</div>
        </div>
      )}
    </div>
  );
}

export default PhotoGallery;
