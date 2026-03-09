import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { iSty, btnSm, srcSty } from './ui/InputRow';
import { sbClient, authSignInWithGoogle, authSignUp, authSignIn, authResetPassword, authUpdatePassword } from '../lib/constants';

function AuthScreen({ onAuth, initialMode }) {
  const [mode, setMode] = useState(initialMode || "login"); // login | signup | forgot | verify | reset
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const hash = window.location.hash;
    const params = new URLSearchParams(window.location.search);
    // Supabase v2 PKCE flow uses ?code= query param (not hash)
    // Legacy implicit flow uses #access_token=...&type=...
    const isRecovery = hash.includes("type=recovery") || params.get("type") === "recovery";
    const isSignup   = hash.includes("type=signup")   || params.get("type") === "signup";
    const hasCode    = params.has("code");

    if (isRecovery) {
      setMode("reset");
    } else if (isSignup || hasCode) {
      // Show verifying spinner — onAuthStateChange in App will fire SIGNED_IN
      // when Supabase exchanges the code/token, which bypasses this screen entirely.
      // 4s fallback in case exchange fails.
      setMode("verifying");
      const fallback = setTimeout(() => {
        window.history.replaceState(null, "", window.location.pathname);
        setMode("verified");
      }, 4000);
      return () => clearTimeout(fallback);
    }
  }, []);

  const clr = () => { setError(""); setMsg(""); };

  const doLogin = async () => {
    if (!email || !password) { setError("Please enter your email and password."); return; }
    setLoading(true); clr();
    const { data, error: e } = await authSignIn(email, password);
    setLoading(false);
    if (e) { setError(e.message); return; }
    if (data.user && !data.user.email_confirmed_at) {
      setError("Please verify your email first — check your inbox."); return;
    }
    onAuth(data.user);
  };

  const doSignup = async () => {
    if (!email || !password) { setError("Please fill in all fields."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirmPw) { setError("Passwords do not match."); return; }
    setLoading(true); clr();
    const { error: e } = await authSignUp(email, password);
    setLoading(false);
    if (e) { setError(e.message); return; }
    setMode("verify");
  };

  const doForgot = async () => {
    if (!email) { setError("Enter your email address."); return; }
    setLoading(true); clr();
    const { error: e } = await authResetPassword(email);
    setLoading(false);
    if (e) { setError(e.message); return; }
    setMsg("Reset link sent — check your email.");
  };

  const doReset = async () => {
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirmPw) { setError("Passwords do not match."); return; }
    setLoading(true); clr();
    const { error: e } = await authUpdatePassword(password);
    setLoading(false);
    if (e) { setError(e.message); return; }
    setMsg("Password updated!");
    window.location.hash = "";
    setTimeout(() => setMode("login"), 1400);
  };

  const iS = { width:"100%", padding:"12px 16px", borderRadius:12, fontSize:15,
    border:"1.5px solid var(--border)", background:"var(--input-bg)", color:"var(--text)", fontFamily:"inherit" };
  const bS = { width:"100%", padding:"14px", borderRadius:100, fontSize:15, fontWeight:700,
    background:"var(--accent)", color:"#fff", border:"none", cursor:"pointer" };
  const lS = { color:"var(--accent)", cursor:"pointer", fontSize:13, fontWeight:600,
    background:"none", border:"none", padding:0, fontFamily:"inherit" };

  return (
    <div style={{minHeight:"100vh", background:"var(--bg)", display:"flex", alignItems:"center",
      justifyContent:"center", padding:16}}>
      <div style={{width:"100%", maxWidth:420, background:"var(--card)", border:"1.5px solid var(--border)",
        borderRadius:22, padding:"44px 40px", boxShadow:"0 24px 64px rgba(0,0,0,0.08)"}}>

        <div style={{display:"flex", alignItems:"center", gap:10, marginBottom:32, justifyContent:"center"}}>
          <div style={{width:44, height:44, background:"var(--accent)", borderRadius:12, display:"flex",
            alignItems:"center", justifyContent:"center", fontSize:22}}>🏠</div>
          <div>
            <div style={{fontFamily:"'Fraunces',serif", fontWeight:900, fontSize:22, letterSpacing:"-0.5px"}}><span>Rent</span><span style={{color:"var(--accent)"}}>Hack</span></div>
            <div style={{fontSize:12, color:"var(--muted)", marginTop:1}}>2–4 unit multifamily</div>
          </div>
        </div>

        {mode === "verify" && (
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:44, marginBottom:12}}>📧</div>
            <div style={{fontWeight:800, fontSize:18, marginBottom:8}}>Check your inbox</div>
            <div style={{color:"var(--muted)", fontSize:14, lineHeight:1.6, marginBottom:20}}>
              We sent a verification link to <strong style={{color:"var(--text)"}}>{email}</strong>.<br/>
              Click it to activate your account.
            </div>
            <button style={lS} onClick={() => setMode("login")}>Back to login</button>
          </div>
        )}

        {mode === "verifying" && (
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:44, marginBottom:12}}>⏳</div>
            <div style={{fontWeight:800, fontSize:18, marginBottom:8}}>Verifying your email…</div>
            <div style={{color:"var(--muted)", fontSize:14, marginBottom:20}}>Just a moment while we activate your account.</div>
          </div>
        )}

        {mode === "verified" && (
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:44, marginBottom:12}}>✅</div>
            <div style={{fontWeight:800, fontSize:18, marginBottom:8}}>Email verified!</div>
            <div style={{color:"var(--muted)", fontSize:14, marginBottom:20}}>Your account is active. Sign in to continue.</div>
            <button style={bS} onClick={() => setMode("login")}>Go to Login</button>
          </div>
        )}

        {mode === "reset" && (
          <div style={{display:"flex", flexDirection:"column", gap:14}}>
            <div style={{fontWeight:800, fontSize:20, marginBottom:2}}>Set new password</div>
            <input type="password" placeholder="New password (min 8 chars)" value={password}
              onChange={e=>{setPassword(e.target.value);clr();}} style={iS} />
            <input type="password" placeholder="Confirm new password" value={confirmPw}
              onChange={e=>{setConfirmPw(e.target.value);clr();}} style={iS}
              onKeyDown={e=>e.key==="Enter"&&doReset()} />
            {error && <div style={{color:"#ef4444",fontSize:13,padding:"8px 10px",background:"#fee2e222",borderRadius:6}}>{error}</div>}
            {msg   && <div style={{color:"#10b981",fontSize:13,fontWeight:600}}>{msg}</div>}
            <button onClick={doReset} disabled={loading} style={{...bS,opacity:loading?.7:1}}>
              {loading ? "Updating…" : "Update Password"}
            </button>
          </div>
        )}

        {mode === "forgot" && (
          <div style={{display:"flex", flexDirection:"column", gap:14}}>
            <div style={{fontWeight:800, fontSize:20, marginBottom:2}}>Reset password</div>
            <div style={{color:"var(--muted)", fontSize:13}}>Enter your email and we'll send a reset link.</div>
            <input type="email" placeholder="you@email.com" value={email}
              onChange={e=>{setEmail(e.target.value);clr();}} style={iS}
              onKeyDown={e=>e.key==="Enter"&&doForgot()} />
            {error && <div style={{color:"#ef4444",fontSize:13,padding:"8px 10px",background:"#fee2e222",borderRadius:6}}>{error}</div>}
            {msg   && <div style={{color:"#10b981",fontSize:13,fontWeight:600}}>{msg}</div>}
            <button onClick={doForgot} disabled={loading} style={{...bS,opacity:loading?.7:1}}>
              {loading ? "Sending…" : "Send Reset Link"}
            </button>
            <div style={{textAlign:"center",marginTop:4}}>
              <button style={lS} onClick={()=>{setMode("login");clr();}}>← Back to login</button>
            </div>
          </div>
        )}

        {mode === "login" && (
          <div style={{display:"flex", flexDirection:"column", gap:14}}>
            <div style={{fontWeight:800, fontSize:20, marginBottom:2}}>Welcome back</div>
            <button onClick={()=>authSignInWithGoogle()} style={{width:"100%",padding:"11px",borderRadius:8,
              fontSize:14,fontWeight:600,background:"#fff",color:"#1f2937",border:"1px solid #d1d5db",
              cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:10,fontFamily:"inherit"}}>
              <svg width="18" height="18" viewBox="0 0 48 48">
                <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 7.9 2.9l5.7-5.7C34.5 6.5 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.9z"/>
                <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19.1 12 24 12c3.1 0 5.8 1.1 7.9 2.9l5.7-5.7C34.5 6.5 29.5 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
                <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.2 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
                <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.3 5.5l6.2 5.2C36.9 36.2 44 31 44 24c0-1.3-.1-2.7-.4-3.9z"/>
              </svg>
              Continue with Google
            </button>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{flex:1,height:1,background:"var(--border)"}}/>
              <span style={{fontSize:12,color:"var(--muted)",whiteSpace:"nowrap"}}>or sign in with email</span>
              <div style={{flex:1,height:1,background:"var(--border)"}}/>
            </div>
            <input type="email" placeholder="Email address" value={email} autoComplete="email"
              onChange={e=>{setEmail(e.target.value);clr();}} style={iS} />
            <input type="password" placeholder="Password" value={password} autoComplete="current-password"
              onChange={e=>{setPassword(e.target.value);clr();}} style={iS}
              onKeyDown={e=>e.key==="Enter"&&doLogin()} />
            {error && <div style={{color:"#ef4444",fontSize:13,padding:"8px 10px",background:"#fee2e222",borderRadius:6}}>{error}</div>}
            <button onClick={doLogin} disabled={loading} style={{...bS,opacity:loading?.7:1}}>
              {loading ? "Signing in…" : "Sign In"}
            </button>
            <div style={{display:"flex", justifyContent:"space-between"}}>
              <button style={lS} onClick={()=>{setMode("forgot");clr();}}>Forgot password?</button>
              <button style={lS} onClick={()=>{setMode("signup");clr();}}>Create account →</button>
            </div>
          </div>
        )}

        {mode === "signup" && (
          <div style={{display:"flex", flexDirection:"column", gap:14}}>
            <div style={{fontWeight:800, fontSize:20, marginBottom:2}}>Create your account</div>
            <button onClick={()=>authSignInWithGoogle()} style={{width:"100%",padding:"11px",borderRadius:8,
              fontSize:14,fontWeight:600,background:"#fff",color:"#1f2937",border:"1px solid #d1d5db",
              cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:10,fontFamily:"inherit"}}>
              <svg width="18" height="18" viewBox="0 0 48 48">
                <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 7.9 2.9l5.7-5.7C34.5 6.5 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.9z"/>
                <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19.1 12 24 12c3.1 0 5.8 1.1 7.9 2.9l5.7-5.7C34.5 6.5 29.5 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
                <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.2 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
                <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.3 5.5l6.2 5.2C36.9 36.2 44 31 44 24c0-1.3-.1-2.7-.4-3.9z"/>
              </svg>
              Continue with Google
            </button>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{flex:1,height:1,background:"var(--border)"}}/>
              <span style={{fontSize:12,color:"var(--muted)",whiteSpace:"nowrap"}}>or sign up with email</span>
              <div style={{flex:1,height:1,background:"var(--border)"}}/>
            </div>
            <input type="email" placeholder="Email address" value={email} autoComplete="email"
              onChange={e=>{setEmail(e.target.value);clr();}} style={iS} />
            <input type="password" placeholder="Password (min 8 characters)" value={password} autoComplete="new-password"
              onChange={e=>{setPassword(e.target.value);clr();}} style={iS} />
            <input type="password" placeholder="Confirm password" value={confirmPw} autoComplete="new-password"
              onChange={e=>{setConfirmPw(e.target.value);clr();}} style={iS}
              onKeyDown={e=>e.key==="Enter"&&doSignup()} />
            {error && <div style={{color:"#ef4444",fontSize:13,padding:"8px 10px",background:"#fee2e222",borderRadius:6}}>{error}</div>}
            <button onClick={doSignup} disabled={loading} style={{...bS,opacity:loading?.7:1}}>
              {loading ? "Creating account…" : "Create Account"}
            </button>
            <div style={{textAlign:"center"}}>
              <button style={lS} onClick={()=>{setMode("login");clr();}}>Already have an account? Sign in</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── PROFILE PAGE ─────────────────────────────────────────────────────────────

export default AuthScreen;
