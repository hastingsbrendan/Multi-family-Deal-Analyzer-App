import React from 'react';

function MetricCard({label,value,sub,highlight}){return(<div style={{background:highlight?"var(--accent-soft)":"var(--card)",border:highlight?"1.5px solid var(--accent)":"1px solid var(--border)",borderRadius:14,padding:"14px 16px",flex:"1 1 130px",minWidth:0,transition:"box-shadow 0.2s"}}><div style={{fontSize:10,color:"var(--muted)",fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:4}}>{label}</div><div style={{fontFamily:"'Fraunces',serif",fontSize:22,fontWeight:900,color:highlight?"var(--accent)":"var(--text)",lineHeight:1,letterSpacing:"-0.5px"}}>{value}</div>{sub&&<div style={{fontSize:11,color:"var(--muted)",marginTop:4}}>{sub}</div>}</div>);}

export default MetricCard;
