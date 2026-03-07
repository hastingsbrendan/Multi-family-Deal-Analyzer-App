import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';

function Section({title,children,action}){return(<div style={{marginBottom:24}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:"2px solid var(--accent)",paddingBottom:6,marginBottom:10,gap:8,flexWrap:"wrap"}}><div style={{fontSize:12,fontWeight:800,letterSpacing:"0.1em",color:"var(--accent)",textTransform:"uppercase"}}>{title}</div>{action}</div>{children}</div>);}

export default Section;
