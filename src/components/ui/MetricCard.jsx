import React from 'react';

function MetricCard({label,value,sub,highlight}){return(<div style={{background:highlight?"var(--accent-soft)":"var(--card)",border:highlight?"1.5px solid var(--accent)":"1px solid var(--border)",borderRadius:14,padding:"14px 16px",flex:"1 1 130px",minWidth:0,transition:"box-shadow 0.2s"}}><div style={{fontSize:10,color:"var(--muted)",fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:4}}>{label}</div><div style={{fontFamily:"'Fraunces',serif",fontSize:22,fontWeight:900,color:highlight?"var(--accent)":"var(--text)",lineHeight:1,letterSpacing:"-0.5px"}}>{value}</div>{sub&&<div style={{fontSize:11,color:"var(--muted)",marginTop:4}}>{sub}</div>}</div>);}

const iSty={width:"100%",background:"var(--input-bg)",border:"1.5px solid var(--border)",borderRadius:10,padding:"9px 12px",color:"var(--text)",fontSize:14,WebkitAppearance:"none",appearance:"none"};
const srcSty={...iSty,color:"var(--muted)",fontSize:12,borderRadius:10};
const btnSm={background:"var(--accent)",color:"#fff",border:"none",borderRadius:100,width:30,height:30,cursor:"pointer",fontSize:15,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0};

export default MetricCard;
