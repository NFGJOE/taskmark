/* eslint-disable */
import { useState, useEffect, useRef } from "react";

const EMAILJS_SERVICE_ID  = "YOUR_SERVICE_ID";
const EMAILJS_TEMPLATE_ID = "YOUR_TEMPLATE_ID";
const EMAILJS_PUBLIC_KEY  = "YOUR_PUBLIC_KEY";

const SUBJECTS = ["Math","Science","English","History","Art","Music","PE","Other"];
const SUB_CLR = {
  Math:"#f97316", Science:"#22d3ee", English:"#a78bfa",
  History:"#fb923c", Art:"#f472b6", Music:"#34d399", PE:"#facc15", Other:"#94a3b8"
};

function daysUntil(d) {
  if (!d) return 9999;
  const n = new Date(); n.setHours(0,0,0,0);
  const result = Math.round((new Date(d + "T00:00:00") - n) / 86400000);
  return isNaN(result) ? 9999 : result;
}
function fmtDate(d) {
  if (!d) return "";
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" });
}
function priClr(p) { return p==="High"?"#ef4444":p==="Medium"?"#f59e0b":"#22c55e"; }
function gradeColor(g) {
  if (g === null || g === undefined || g === "") return "#64748b";
  const n = Number(g);
  if (n >= 90) return "#22c55e";
  if (n >= 80) return "#84cc16";
  if (n >= 70) return "#f59e0b";
  if (n >= 60) return "#f97316";
  return "#ef4444";
}
function gradeLetter(g) {
  if (g === null || g === undefined || g === "") return "–";
  const n = Number(g);
  if (n >= 90) return "A";
  if (n >= 80) return "B";
  if (n >= 70) return "C";
  if (n >= 60) return "D";
  return "F";
}

function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(",")[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

function usePersist(key, init) {
  const [v, setV] = useState(() => {
    try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : init; } catch { return init; }
  });
  const set = (x) => {
    const n = typeof x === "function" ? x(v) : x;
    setV(n);
    try { localStorage.setItem(key, JSON.stringify(n)); } catch {}
  };
  return [v, set];
}

function monthKey() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0");
}
function dayKey() { return new Date().toISOString().split("T")[0]; }

const FREE_LIMITS  = { assignments:2, notes:2, aiMessages:5 };
const PRO_LIMITS   = { assignments:999, notes:999, aiMessages:999 };

function getUsage() {
  try { return JSON.parse(localStorage.getItem("tm_usage") || "{}"); } catch { return {}; }
}
function saveUsage(u) { try { localStorage.setItem("tm_usage", JSON.stringify(u)); } catch {} }

function isPro() {
  try { return JSON.parse(localStorage.getItem("tm_pro") || "false"); } catch { return false; }
}

function checkLimit(type) {
  if (isPro()) return { count:0, limit:Infinity, remaining:Infinity, allowed:true };
  const u = getUsage();
  const key = type === "aiMessages" ? dayKey() : monthKey();
  const count = (u[type]?.[key]) || 0;
  const limit = FREE_LIMITS[type];
  return { count, limit, remaining: limit - count, allowed: count < limit };
}

function incrementUsage(type) {
  if (isPro()) return;
  const u = getUsage();
  const key = type === "aiMessages" ? dayKey() : monthKey();
  if (!u[type]) u[type] = {};
  u[type][key] = (u[type][key] || 0) + 1;
  saveUsage(u);
}

async function askClaude(messages, system) {
  // Validate every message before sending — catch bad format early
  const cleanMessages = messages.map((m, i) => {
    const role = m.role === "assistant" ? "assistant" : "user";
    let content = m.content;
    // If content is not a string and not an array, force it to string
    if (typeof content !== "string" && !Array.isArray(content)) {
      content = String(content ?? "");
    }
    // If it's an array, make sure every block has type and text/source
    if (Array.isArray(content)) {
      content = content.filter(b => b && b.type);
      if (content.length === 0) content = "(empty)";
    }
    // Empty string guard
    if (content === "") content = "(empty)";
    return { role, content };
  });

  // API requires alternating user/assistant starting with user
  // Strip any leading assistant messages
  while (cleanMessages.length > 0 && cleanMessages[0].role === "assistant") {
    cleanMessages.shift();
  }

  const body = {
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: cleanMessages,
  };
  // Only add system if it's a non-empty string
  if (system && typeof system === "string" && system.trim()) {
    body.system = system.trim();
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify(body),
  });

  let json;
  try { json = await response.json(); } catch { throw new Error("Could not read server response."); }
  if (!response.ok) {
    const msg = json?.error?.message || JSON.stringify(json?.error) || ("HTTP " + response.status);
    throw new Error(msg);
  }
  if (!json.content || !Array.isArray(json.content) || json.content.length === 0) {
    throw new Error("AI returned an empty response.");
  }
  const text = json.content.filter(b => b.type === "text").map(b => b.text).join("").trim();
  if (!text) throw new Error("AI returned no text content.");
  return text;
}

// ─── Credit Card helpers ──────────────────────────────────────────────────────
function fmtCardNum(v) {
  return v.replace(/\D/g,"").slice(0,16).replace(/(.{4})/g,"$1 ").trim();
}
function fmtExpiry(v) {
  const d = v.replace(/\D/g,"").slice(0,4);
  return d.length > 2 ? d.slice(0,2) + "/" + d.slice(2) : d;
}
function fmtCVC(v) { return v.replace(/\D/g,"").slice(0,4); }
function cardBrand(n) {
  const c = n.replace(/\s/g,"");
  if (/^4/.test(c)) return "VISA";
  if (/^5[1-5]/.test(c)) return "MC";
  if (/^3[47]/.test(c)) return "AMEX";
  if (/^6(?:011|5)/.test(c)) return "DISC";
  return "";
}
function luhn(n) {
  const d = n.replace(/\D/g,"");
  let s = 0, alt = false;
  for (let i = d.length-1; i >= 0; i--) {
    let x = parseInt(d[i]);
    if (alt) { x *= 2; if (x > 9) x -= 9; }
    s += x; alt = !alt;
  }
  return s % 10 === 0;
}

// ─── Upgrade Modal ────────────────────────────────────────────────────────────
function UpgradeModal({ reason, onClose, onUpgrade }) {
  const [step,    setStep]    = useState("plan"); // "plan" | "card" | "success"
  const [plan,    setPlan]    = useState("annual");
  const [processing, setProcessing] = useState(false);
  const [promoCode,  setPromoCode]  = useState("");
  const [promoState, setPromoState] = useState("idle"); // "idle" | "valid" | "invalid"

  // Card form state
  const [cardNum,  setCardNum]  = useState("");
  const [expiry,   setExpiry]   = useState("");
  const [cvc,      setCvc]      = useState("");
  const [name,     setName]     = useState("");
  const [zip,      setZip]      = useState("");
  const [errors,   setErrors]   = useState({});
  const [cardFlip, setCardFlip] = useState(false);

  const monthly = 2;
  const annual  = 20;
  const annualMonthly = (annual/12).toFixed(2);
  const savings = (monthly*12) - annual;
  const price   = plan==="annual" ? annual : monthly;
  const brand   = cardBrand(cardNum);

  const reasonText = {
    assignments: "You've used your 2 free assignments this month.",
    notes:       "You've used your 2 free notes this month.",
    aiMessages:  "You've used all 5 free AI messages today.",
  }[reason] || "You've reached your free plan limit.";

  const PERKS = [
    {icon:"📋",text:"Unlimited assignments"},
    {icon:"📝",text:"Unlimited notes"},
    {icon:"🤖",text:"Unlimited AI messages"},
    {icon:"📸",text:"Unlimited file uploads"},
  ];

  const BRAND_CLR = { VISA:"#1a1f71", MC:"#eb001b", AMEX:"#2e77bc", DISC:"#ff6600" };
  const BRAND_LBL = { VISA:"VISA", MC:"MC", AMEX:"AMEX", DISC:"DISC" };

  // masked card display
  const maskedNum = cardNum.replace(/\s/g,"").padEnd(16,"•").match(/.{1,4}/g).join(" ");
  const maskedCVC = cvc ? "•".repeat(cvc.length) : "•••";

  function validate() {
    const e = {};
    const raw = cardNum.replace(/\s/g,"");
    if (!name.trim())               e.name    = "Name is required";
    if (raw.length < 13)            e.cardNum = "Enter a valid card number";
    else if (!luhn(raw))            e.cardNum = "Card number is invalid";
    const [mm,yy] = (expiry+"/").split("/");
    const nowY = new Date().getFullYear()%100, nowM = new Date().getMonth()+1;
    if (!mm||!yy||+mm<1||+mm>12)   e.expiry  = "Enter a valid date (MM/YY)";
    else if (+yy < nowY || (+yy===nowY && +mm < nowM)) e.expiry = "Card has expired";
    if (cvc.length < 3)             e.cvc     = "Enter CVC";
    if (!zip.trim())                e.zip     = "Billing zip required";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function applyPromo() {
    if (promoCode.trim().toUpperCase() === "STUDY") {
      setPromoState("valid");
      // Activate pro immediately — no card needed
      setTimeout(() => {
        try { localStorage.setItem("tm_pro","true"); } catch {}
        setStep("success");
      }, 800);
    } else {
      setPromoState("invalid");
    }
  }

  function handlePay() {
    if (!validate()) return;
    setProcessing(true);
    // Simulated payment — wire to Stripe in production
    setTimeout(() => {
      try { localStorage.setItem("tm_pro","true"); } catch {}
      setProcessing(false);
      setStep("success");
    }, 1800);
  }

  function handleSuccess() { onUpgrade(); }

  const inStyle = {
    width:"100%", background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.12)",
    borderRadius:10, color:"#e2e8f0", padding:"11px 14px", fontSize:14,
    fontFamily:"'Outfit',sans-serif", outline:"none", boxSizing:"border-box", transition:"border-color .2s",
  };
  const errStyle = { fontSize:11, color:"#f87171", marginTop:4 };
  function iStyle(field) { return { ...inStyle, borderColor: errors[field]?"#ef4444":"rgba(255,255,255,0.12)" }; }

  return (
    <div style={{ position:"fixed", inset:0, zIndex:500, background:"rgba(2,4,12,0.93)", backdropFilter:"blur(20px)", display:"flex", alignItems:"center", justifyContent:"center", padding:20, overflowY:"auto" }}>
      <div style={{ position:"absolute", width:560, height:560, borderRadius:"50%", background:"radial-gradient(circle,rgba(99,102,241,0.16) 0%,transparent 65%)", top:"-10%", left:"5%", pointerEvents:"none" }}/>
      <div style={{ position:"absolute", width:400, height:400, borderRadius:"50%", background:"radial-gradient(circle,rgba(250,204,21,0.09) 0%,transparent 65%)", bottom:"0%", right:"0%", pointerEvents:"none" }}/>

      <div style={{ background:"linear-gradient(160deg,#0c0f22,#111827)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:28, width:"100%", maxWidth:480, overflow:"hidden", animation:"popIn .4s cubic-bezier(0.34,1.56,0.64,1)", position:"relative", boxShadow:"0 48px 120px rgba(0,0,0,0.85)" }}>
        <div style={{ position:"absolute", top:0, left:"5%", right:"5%", height:2, background:"linear-gradient(90deg,transparent,#facc15,#f97316,transparent)", borderRadius:2 }}/>

        {/* Close button */}
        {step !== "success" && (
          <button onClick={onClose} style={{ position:"absolute", top:16, right:16, zIndex:10, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", color:"#475569", width:32, height:32, borderRadius:8, cursor:"pointer", fontSize:16, display:"flex", alignItems:"center", justifyContent:"center", transition:"all .18s" }}
            onMouseOver={e=>{e.currentTarget.style.color="#e2e8f0";e.currentTarget.style.background="rgba(255,255,255,0.12)";}}
            onMouseOut={e=>{e.currentTarget.style.color="#475569";e.currentTarget.style.background="rgba(255,255,255,0.06)";}}>✕</button>
        )}

        {/* ── STEP 1: Plan select ───────────────────────────────────────── */}
        {step==="plan" && (
          <div style={{ padding:"32px 32px 28px" }}>
            <div style={{ textAlign:"center", marginBottom:24 }}>
              <div style={{ width:64, height:64, borderRadius:20, margin:"0 auto 14px", background:"linear-gradient(135deg,#f59e0b,#f97316)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:32, boxShadow:"0 10px 36px rgba(245,158,11,0.5)" }}>👑</div>
              <div style={{ fontSize:11, fontWeight:800, letterSpacing:2, color:"#f59e0b", marginBottom:6, textTransform:"uppercase" }}>Upgrade to Pro</div>
              <h2 style={{ fontSize:24, fontWeight:900, letterSpacing:-0.5, marginBottom:6, background:"linear-gradient(135deg,#fef3c7,#fcd34d)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>Unlock Everything</h2>
              <p style={{ fontSize:13, color:"#64748b", lineHeight:1.6 }}>{reasonText}</p>
            </div>

            {/* Perks */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:7, marginBottom:22 }}>
              {PERKS.map(p=>(
                <div key={p.text} style={{ display:"flex", alignItems:"center", gap:8, background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:9, padding:"8px 11px" }}>
                  <span style={{ fontSize:15 }}>{p.icon}</span>
                  <span style={{ fontSize:12, color:"#94a3b8", fontWeight:600 }}>{p.text}</span>
                </div>
              ))}
            </div>

            {/* Plan cards */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:20 }}>
              {/* Monthly */}
              <div onClick={()=>setPlan("monthly")} style={{ border:"2px solid "+(plan==="monthly"?"#6366f1":"rgba(255,255,255,0.08)"), borderRadius:16, padding:"16px 14px", cursor:"pointer", background:plan==="monthly"?"rgba(99,102,241,0.12)":"rgba(255,255,255,0.03)", transition:"all .2s", position:"relative" }}>
                <div style={{ fontSize:11, fontWeight:800, color:plan==="monthly"?"#818cf8":"#475569", letterSpacing:.5, marginBottom:6, textTransform:"uppercase" }}>Monthly</div>
                <div style={{ display:"flex", alignItems:"baseline", gap:3, marginBottom:3 }}>
                  <span style={{ fontSize:28, fontWeight:900, color:plan==="monthly"?"#e2e8f0":"#64748b" }}>${monthly}</span>
                  <span style={{ fontSize:12, color:"#475569" }}>/mo</span>
                </div>
                <div style={{ fontSize:11, color:"#334155" }}>Billed monthly</div>
                {plan==="monthly"&&<div style={{ position:"absolute",top:10,right:10,width:18,height:18,borderRadius:"50%",background:"#6366f1",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:"#fff" }}>✓</div>}
              </div>
              {/* Annual */}
              <div onClick={()=>setPlan("annual")} style={{ border:"2px solid "+(plan==="annual"?"#f59e0b":"rgba(255,255,255,0.08)"), borderRadius:16, padding:"16px 14px", cursor:"pointer", background:plan==="annual"?"rgba(245,158,11,0.1)":"rgba(255,255,255,0.03)", transition:"all .2s", position:"relative" }}>
                <div style={{ position:"absolute",top:-11,left:"50%",transform:"translateX(-50%)",background:"linear-gradient(135deg,#f59e0b,#f97316)",borderRadius:20,padding:"3px 10px",fontSize:9,fontWeight:800,color:"#fff",letterSpacing:.5,whiteSpace:"nowrap" }}>BEST VALUE</div>
                <div style={{ fontSize:11, fontWeight:800, color:plan==="annual"?"#fcd34d":"#475569", letterSpacing:.5, marginBottom:6, textTransform:"uppercase" }}>Annual</div>
                <div style={{ display:"flex", alignItems:"baseline", gap:3, marginBottom:3 }}>
                  <span style={{ fontSize:28, fontWeight:900, color:plan==="annual"?"#fef3c7":"#64748b" }}>${annual}</span>
                  <span style={{ fontSize:12, color:"#475569" }}>/yr</span>
                </div>
                <div style={{ fontSize:11, color:plan==="annual"?"#f59e0b":"#334155", fontWeight:plan==="annual"?700:400 }}>${annualMonthly}/mo · Save ${savings}</div>
                {plan==="annual"&&<div style={{ position:"absolute",top:10,right:10,width:18,height:18,borderRadius:"50%",background:"#f59e0b",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:"#fff" }}>✓</div>}
              </div>
            </div>

            {/* Promo code */}
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:11, fontWeight:700, color:"#475569", marginBottom:7, letterSpacing:.6, textTransform:"uppercase" }}>Have a promo code?</div>
              <div style={{ display:"flex", gap:8 }}>
                <input
                  value={promoCode}
                  onChange={e=>{ setPromoCode(e.target.value.toUpperCase()); setPromoState("idle"); }}
                  onKeyDown={e=>e.key==="Enter"&&applyPromo()}
                  placeholder="Enter code"
                  maxLength={20}
                  style={{ flex:1, background:"rgba(255,255,255,0.06)", border:"1px solid "+(promoState==="valid"?"#22c55e":promoState==="invalid"?"#ef4444":"rgba(255,255,255,0.12)"), borderRadius:10, color:"#e2e8f0", padding:"11px 14px", fontSize:14, fontFamily:"'Outfit',sans-serif", outline:"none", letterSpacing:2, textTransform:"uppercase", transition:"border-color .2s" }}
                  onFocus={e=>{ if(promoState==="idle") e.target.style.borderColor="#6366f1"; }}
                  onBlur={e=>{ if(promoState==="idle") e.target.style.borderColor="rgba(255,255,255,0.12)"; }}
                />
                <button onClick={applyPromo} disabled={!promoCode.trim()||promoState==="valid"}
                  style={{ padding:"11px 18px", borderRadius:10, border:"none", cursor:!promoCode.trim()||promoState==="valid"?"not-allowed":"pointer", fontFamily:"inherit", fontSize:13, fontWeight:800, color:"#fff", background:promoState==="valid"?"linear-gradient(135deg,#22c55e,#16a34a)":"linear-gradient(135deg,#6366f1,#4f46e5)", opacity:!promoCode.trim()&&promoState!=="valid"?0.45:1, transition:"all .18s", whiteSpace:"nowrap" }}>
                  {promoState==="valid" ? "✓ Applied!" : "Apply"}
                </button>
              </div>
              {promoState==="valid" && (
                <div style={{ marginTop:7, fontSize:12, color:"#22c55e", fontWeight:700, display:"flex", alignItems:"center", gap:6 }}>
                  <span style={{ width:16, height:16, borderRadius:"50%", background:"#22c55e", display:"inline-flex", alignItems:"center", justifyContent:"center", fontSize:9, color:"#fff", flexShrink:0 }}>✓</span>
                  🎉 Promo applied! Activating your free Pro access…
                </div>
              )}
              {promoState==="invalid" && (
                <div style={{ marginTop:7, fontSize:12, color:"#f87171", fontWeight:600 }}>
                  ⚠ Invalid promo code. Please check and try again.
                </div>
              )}
            </div>

            {promoState !== "valid" && (
            <button onClick={()=>setStep("card")}
              style={{ width:"100%", padding:"14px", borderRadius:13, border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:16, fontWeight:800, color:"#fff", transition:"all .2s",
                background:plan==="annual"?"linear-gradient(135deg,#f59e0b,#f97316)":"linear-gradient(135deg,#4f46e5,#7c3aed)",
                boxShadow:plan==="annual"?"0 8px 32px rgba(245,158,11,0.45)":"0 8px 32px rgba(99,102,241,0.45)" }}>
              Continue to Payment →
            </button>
            )}
            <div style={{ textAlign:"center", marginTop:10, fontSize:11, color:"#1e293b" }}>Cancel anytime · Instant access · Secure checkout 🔒</div>
          </div>
        )}

        {/* ── STEP 2: Card form ─────────────────────────────────────────── */}
        {step==="card" && (
          <div style={{ padding:"28px 32px 32px" }}>
            {/* Back + header */}
            <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:22 }}>
              <button onClick={()=>setStep("plan")} style={{ background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", color:"#94a3b8", borderRadius:8, padding:"6px 12px", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit", transition:"all .18s" }}
                onMouseOver={e=>e.currentTarget.style.color="#e2e8f0"}
                onMouseOut={e=>e.currentTarget.style.color="#94a3b8"}>← Back</button>
              <div>
                <div style={{ fontWeight:900, fontSize:17, letterSpacing:-0.3 }}>Payment Details</div>
                <div style={{ fontSize:12, color:"#64748b" }}>
                  {plan==="annual"?`Annual Plan — $${annual}/yr`:`Monthly Plan — $${monthly}/mo`}
                  <span style={{ marginLeft:8, background:plan==="annual"?"rgba(245,158,11,0.15)":"rgba(99,102,241,0.15)", color:plan==="annual"?"#f59e0b":"#818cf8", borderRadius:5, padding:"1px 7px", fontSize:10, fontWeight:800 }}>
                    {plan==="annual"?"BEST VALUE":"MONTHLY"}
                  </span>
                </div>
              </div>
            </div>

            {/* Card preview */}
            <div style={{ position:"relative", height:110, marginBottom:22, perspective:800 }}>
              <div style={{ position:"absolute", inset:0, borderRadius:16, padding:"18px 22px", background:"linear-gradient(135deg,"+(plan==="annual"?"#92400e,#78350f":"#1e1b4b,#2e1065")+")", border:"1px solid rgba(255,255,255,0.12)", boxShadow:"0 8px 32px rgba(0,0,0,0.5)", display:"flex", flexDirection:"column", justifyContent:"space-between", overflow:"hidden" }}>
                {/* Card shimmer */}
                <div style={{ position:"absolute", top:"-40%", left:"-20%", width:"80%", height:"200%", background:"rgba(255,255,255,0.04)", transform:"rotate(25deg)", pointerEvents:"none" }}/>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                  <div style={{ fontSize:11, fontWeight:700, color:"rgba(255,255,255,0.5)", letterSpacing:1 }}>
                    {plan==="annual"?"STUDYBUDDY ANNUAL":"STUDYBUDDY MONTHLY"}
                  </div>
                  {brand ? (
                    <div style={{ background:BRAND_CLR[brand]||"#334155", borderRadius:6, padding:"3px 8px", fontSize:11, fontWeight:900, color:"#fff", letterSpacing:.5 }}>{BRAND_LBL[brand]}</div>
                  ) : (
                    <div style={{ width:36, height:26, borderRadius:5, background:"rgba(255,255,255,0.1)", border:"1px solid rgba(255,255,255,0.15)" }}/>
                  )}
                </div>
                <div>
                  <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:15, color:"#fff", letterSpacing:3, marginBottom:6 }}>{maskedNum}</div>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end" }}>
                    <div>
                      <div style={{ fontSize:9, color:"rgba(255,255,255,0.4)", letterSpacing:.5, marginBottom:2 }}>CARD HOLDER</div>
                      <div style={{ fontSize:12, color:"#fff", fontWeight:700, letterSpacing:.5, minWidth:80 }}>{name||"YOUR NAME"}</div>
                    </div>
                    <div style={{ textAlign:"right" }}>
                      <div style={{ fontSize:9, color:"rgba(255,255,255,0.4)", letterSpacing:.5, marginBottom:2 }}>EXPIRES</div>
                      <div style={{ fontSize:12, color:"#fff", fontFamily:"'JetBrains Mono',monospace" }}>{expiry||"MM/YY"}</div>
                    </div>
                    {cardFlip && (
                      <div style={{ textAlign:"right" }}>
                        <div style={{ fontSize:9, color:"rgba(255,255,255,0.4)", letterSpacing:.5, marginBottom:2 }}>CVC</div>
                        <div style={{ fontSize:12, color:"#fff", fontFamily:"'JetBrains Mono',monospace" }}>{maskedCVC}</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Form fields */}
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              {/* Card number */}
              <div>
                <label style={{ display:"block", fontSize:11, fontWeight:700, color:"#475569", marginBottom:6, letterSpacing:.6, textTransform:"uppercase" }}>Card Number</label>
                <div style={{ position:"relative" }}>
                  <input value={cardNum} onChange={e=>setCardNum(fmtCardNum(e.target.value))} placeholder="1234 5678 9012 3456"
                    style={{ ...iStyle("cardNum"), paddingRight:60, fontFamily:"'JetBrains Mono',monospace", letterSpacing:2 }}
                    onFocus={e=>{e.target.style.borderColor="#6366f1";setCardFlip(false);}}
                    onBlur={e=>e.target.style.borderColor=errors.cardNum?"#ef4444":"rgba(255,255,255,0.12)"}/>
                  {brand && <div style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", background:BRAND_CLR[brand], borderRadius:5, padding:"2px 7px", fontSize:11, fontWeight:900, color:"#fff" }}>{BRAND_LBL[brand]}</div>}
                </div>
                {errors.cardNum && <div style={errStyle}>⚠ {errors.cardNum}</div>}
              </div>

              {/* Name */}
              <div>
                <label style={{ display:"block", fontSize:11, fontWeight:700, color:"#475569", marginBottom:6, letterSpacing:.6, textTransform:"uppercase" }}>Name on Card</label>
                <input value={name} onChange={e=>setName(e.target.value)} placeholder="Alex Johnson"
                  style={iStyle("name")} onFocus={e=>{e.target.style.borderColor="#6366f1";setCardFlip(false);}} onBlur={e=>e.target.style.borderColor=errors.name?"#ef4444":"rgba(255,255,255,0.12)"}/>
                {errors.name && <div style={errStyle}>⚠ {errors.name}</div>}
              </div>

              {/* Expiry + CVC + ZIP */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
                <div>
                  <label style={{ display:"block", fontSize:11, fontWeight:700, color:"#475569", marginBottom:6, letterSpacing:.6, textTransform:"uppercase" }}>Expiry</label>
                  <input value={expiry} onChange={e=>setExpiry(fmtExpiry(e.target.value))} placeholder="MM/YY"
                    style={{ ...iStyle("expiry"), fontFamily:"'JetBrains Mono',monospace", textAlign:"center" }}
                    onFocus={e=>{e.target.style.borderColor="#6366f1";setCardFlip(false);}} onBlur={e=>e.target.style.borderColor=errors.expiry?"#ef4444":"rgba(255,255,255,0.12)"}/>
                  {errors.expiry && <div style={errStyle}>⚠ {errors.expiry}</div>}
                </div>
                <div>
                  <label style={{ display:"block", fontSize:11, fontWeight:700, color:"#475569", marginBottom:6, letterSpacing:.6, textTransform:"uppercase" }}>CVC</label>
                  <input value={cvc} onChange={e=>setCvc(fmtCVC(e.target.value))} placeholder="•••"
                    style={{ ...iStyle("cvc"), fontFamily:"'JetBrains Mono',monospace", textAlign:"center" }}
                    onFocus={e=>{e.target.style.borderColor="#6366f1";setCardFlip(true);}} onBlur={e=>{e.target.style.borderColor=errors.cvc?"#ef4444":"rgba(255,255,255,0.12)";setCardFlip(false);}}/>
                  {errors.cvc && <div style={errStyle}>⚠ {errors.cvc}</div>}
                </div>
                <div>
                  <label style={{ display:"block", fontSize:11, fontWeight:700, color:"#475569", marginBottom:6, letterSpacing:.6, textTransform:"uppercase" }}>ZIP</label>
                  <input value={zip} onChange={e=>setZip(e.target.value.slice(0,10))} placeholder="10001"
                    style={{ ...iStyle("zip"), fontFamily:"'JetBrains Mono',monospace", textAlign:"center" }}
                    onFocus={e=>e.target.style.borderColor="#6366f1"} onBlur={e=>e.target.style.borderColor=errors.zip?"#ef4444":"rgba(255,255,255,0.12)"}/>
                  {errors.zip && <div style={errStyle}>⚠ {errors.zip}</div>}
                </div>
              </div>
            </div>

            {/* Pay button */}
            <button onClick={handlePay} disabled={processing}
              style={{ marginTop:20, width:"100%", padding:"15px", borderRadius:13, border:"none", cursor:processing?"wait":"pointer", fontFamily:"inherit", fontSize:16, fontWeight:800, color:"#fff", transition:"all .2s",
                background:plan==="annual"?"linear-gradient(135deg,#f59e0b,#f97316)":"linear-gradient(135deg,#4f46e5,#7c3aed)",
                boxShadow:plan==="annual"?"0 8px 32px rgba(245,158,11,0.45)":"0 8px 32px rgba(99,102,241,0.45)",
                opacity:processing?0.75:1 }}>
              {processing
                ? <span style={{ display:"flex",alignItems:"center",justifyContent:"center",gap:10 }}><span style={{ display:"inline-block",width:16,height:16,border:"2px solid rgba(255,255,255,0.4)",borderTopColor:"#fff",borderRadius:"50%",animation:"spin .7s linear infinite" }}/>Processing payment…</span>
                : `🔒 Pay $${price} ${plan==="annual"?"/ year":"/ month"}`}
            </button>

            {/* Security badges */}
            <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:16, marginTop:14 }}>
              {["🔒 SSL Encrypted","🛡 Secure Payment","↩ Cancel Anytime"].map(b=>(
                <div key={b} style={{ fontSize:10, color:"#1e293b", fontWeight:600 }}>{b}</div>
              ))}
            </div>
          </div>
        )}

        {/* ── STEP 3: Success ───────────────────────────────────────────── */}
        {step==="success" && (
          <div style={{ padding:"48px 32px", textAlign:"center" }}>
            <div style={{ width:80, height:80, borderRadius:"50%", margin:"0 auto 20px", background:"linear-gradient(135deg,#22c55e,#16a34a)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:40, boxShadow:"0 12px 40px rgba(34,197,94,0.5), 0 0 0 12px rgba(34,197,94,0.1)", animation:"popIn .5s cubic-bezier(0.34,1.56,0.64,1)" }}>
              ✓
            </div>
            <div style={{ fontSize:11, fontWeight:800, letterSpacing:2, color:"#22c55e", marginBottom:8, textTransform:"uppercase" }}>Payment Successful</div>
            <h2 style={{ fontSize:26, fontWeight:900, letterSpacing:-0.5, marginBottom:10, background:"linear-gradient(135deg,#f1f5f9,#94a3b8)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>
              Welcome to Pro! 🎉
            </h2>
            <p style={{ fontSize:13, color:"#64748b", lineHeight:1.7, marginBottom:8 }}>
              Your {plan==="annual"?"annual":"monthly"} Pro subscription is now active.<br/>
              You have <strong style={{ color:"#e2e8f0" }}>unlimited</strong> access to everything.
            </p>
            <div style={{ background:"rgba(245,158,11,0.1)", border:"1px solid rgba(245,158,11,0.25)", borderRadius:12, padding:"12px 20px", fontSize:13, color:"#fcd34d", fontWeight:700, marginBottom:24 }}>
              👑 {plan==="annual"?`$${annual}/year · saves you $${savings}`:`$${monthly}/month`}
            </div>
            <button onClick={handleSuccess}
              style={{ width:"100%", padding:"14px", borderRadius:13, border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:16, fontWeight:800, color:"#fff", background:"linear-gradient(135deg,#f59e0b,#f97316)", boxShadow:"0 8px 32px rgba(245,158,11,0.45)", transition:"all .2s" }}
              onMouseOver={e=>e.currentTarget.style.transform="translateY(-2px)"}
              onMouseOut={e=>e.currentTarget.style.transform="translateY(0)"}>
              Start Using Pro →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Onboarding ───────────────────────────────────────────────────────────────
function OnboardingModal({ onComplete }) {
  const [step, setStep]       = useState(0);
  const [name, setName]       = useState("");
  const [email, setEmail]     = useState("");
  const [err, setErr]         = useState("");
  const [loading, setLoading] = useState(false);

  function handleSignup() {
    if (!name.trim()) return setErr("Please enter your name.");
    if (!/\S+@\S+\.\S+/.test(email)) return setErr("Please enter a valid email.");
    setErr(""); setLoading(true);
    setTimeout(() => { setLoading(false); onComplete({ name: name.trim(), email: email.trim() }); }, 600);
  }

  return (
    <div style={{ position:"fixed", inset:0, zIndex:1000, background:"rgba(4,6,16,0.95)", backdropFilter:"blur(16px)", display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ position:"absolute", width:500, height:500, borderRadius:"50%", background:"radial-gradient(circle,rgba(99,102,241,0.13) 0%,transparent 70%)", top:"0%", left:"10%", pointerEvents:"none" }}/>
      <div style={{ position:"absolute", width:380, height:380, borderRadius:"50%", background:"radial-gradient(circle,rgba(34,211,238,0.07) 0%,transparent 70%)", bottom:"5%", right:"5%", pointerEvents:"none" }}/>
      <div style={{ background:"linear-gradient(145deg,#0d1128,#111827)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:24, padding:"40px 36px", width:"100%", maxWidth:440, boxShadow:"0 40px 120px rgba(0,0,0,0.8)", animation:"popIn .4s cubic-bezier(0.34,1.56,0.64,1)", position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute", top:0, left:"8%", right:"8%", height:2, background:"linear-gradient(90deg,transparent,#6366f1,#22d3ee,transparent)" }}/>

        {step === 0 ? (
          <div style={{ textAlign:"center" }}>
            <div style={{ width:74, height:74, borderRadius:22, margin:"0 auto 20px", background:"linear-gradient(135deg,#4f46e5,#22d3ee)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:36, boxShadow:"0 12px 40px rgba(99,102,241,0.45)" }}>📚</div>
            <h1 style={{ fontSize:28, fontWeight:900, letterSpacing:-0.6, marginBottom:10, background:"linear-gradient(135deg,#f1f5f9,#94a3b8)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>Welcome to TaskMark</h1>
            <p style={{ color:"#64748b", fontSize:14, lineHeight:1.7, marginBottom:24 }}>Your AI-powered homework tracker and personal study tutor.</p>
            <div style={{ background:"rgba(99,102,241,0.08)", border:"1px solid rgba(99,102,241,0.2)", borderRadius:14, padding:"14px 16px", marginBottom:24, textAlign:"left" }}>
              <div style={{ fontSize:12, fontWeight:800, color:"#818cf8", marginBottom:10, letterSpacing:.5 }}>📋 FREE PLAN</div>
              {[{icon:"📋",text:"2 assignments / month"},{icon:"📝",text:"2 notes / month"},{icon:"🤖",text:"5 AI messages / day"},{icon:"📧",text:"Email reminders"}].map(f=>(
                <div key={f.text} style={{ display:"flex", alignItems:"center", gap:8, fontSize:13, color:"#94a3b8", marginBottom:5 }}><span>{f.icon}</span><span>{f.text}</span></div>
              ))}
            </div>
            <button onClick={()=>setStep(1)} style={{ width:"100%", padding:"14px", borderRadius:12, border:"none", cursor:"pointer", background:"linear-gradient(135deg,#4f46e5,#7c3aed)", color:"#fff", fontSize:16, fontWeight:800, fontFamily:"inherit", boxShadow:"0 8px 32px rgba(99,102,241,0.45)", transition:"transform .2s" }}
              onMouseOver={e=>e.currentTarget.style.transform="translateY(-2px)"}
              onMouseOut={e=>e.currentTarget.style.transform="translateY(0)"}>
              Get Started →
            </button>
          </div>
        ) : (
          <div>
            <button onClick={()=>setStep(0)} style={{ background:"none", border:"none", color:"#475569", cursor:"pointer", fontSize:13, marginBottom:16, fontFamily:"inherit" }}>← Back</button>
            <h2 style={{ fontSize:23, fontWeight:900, letterSpacing:-0.5, marginBottom:6 }}>Create your account</h2>
            <p style={{ color:"#64748b", fontSize:13, marginBottom:22, lineHeight:1.6 }}>We'll email you <strong style={{ color:"#94a3b8" }}>1 day before</strong> any assignment is due. 📧</p>
            <div style={{ marginBottom:14 }}>
              <label style={{ display:"block", fontSize:11, fontWeight:700, color:"#475569", marginBottom:7, letterSpacing:.7, textTransform:"uppercase" }}>Your Name</label>
              <input placeholder="e.g. Alex Johnson" value={name} autoFocus onChange={e=>{ setName(e.target.value); setErr(""); }} onKeyDown={e=>e.key==="Enter"&&handleSignup()}
                style={{ width:"100%", background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.11)", borderRadius:11, color:"#e2e8f0", padding:"12px 16px", fontSize:14, fontFamily:"inherit", outline:"none", boxSizing:"border-box" }}
                onFocus={e=>e.target.style.borderColor="#6366f1"} onBlur={e=>e.target.style.borderColor="rgba(255,255,255,0.11)"}/>
            </div>
            <div style={{ marginBottom:20 }}>
              <label style={{ display:"block", fontSize:11, fontWeight:700, color:"#475569", marginBottom:7, letterSpacing:.7, textTransform:"uppercase" }}>Email Address</label>
              <input type="email" placeholder="you@example.com" value={email} onChange={e=>{ setEmail(e.target.value); setErr(""); }} onKeyDown={e=>e.key==="Enter"&&handleSignup()}
                style={{ width:"100%", background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.11)", borderRadius:11, color:"#e2e8f0", padding:"12px 16px", fontSize:14, fontFamily:"inherit", outline:"none", boxSizing:"border-box" }}
                onFocus={e=>e.target.style.borderColor="#6366f1"} onBlur={e=>e.target.style.borderColor="rgba(255,255,255,0.11)"}/>
            </div>
            {err && <div style={{ background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.28)", borderRadius:9, padding:"10px 14px", fontSize:13, color:"#f87171", marginBottom:16 }}>⚠️ {err}</div>}
            <button onClick={handleSignup} disabled={loading} style={{ width:"100%", padding:"14px", borderRadius:12, border:"none", cursor:loading?"wait":"pointer", background:loading?"rgba(99,102,241,0.3)":"linear-gradient(135deg,#4f46e5,#7c3aed)", color:"#fff", fontSize:16, fontWeight:800, fontFamily:"inherit", transition:"all .2s" }}>
              {loading ? "Setting up…" : "Start Studying 🚀"}
            </button>
            <p style={{ textAlign:"center", fontSize:11, color:"#1e293b", marginTop:14 }}>We only use your email for reminders. No spam, ever.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Usage pill ─────────────────────────────────────────────────────────────────
function UsagePill({ type, label, period }) {
  const pro = isPro();
  if (pro) return (
    <div style={{ display:"flex", alignItems:"center", gap:5, background:"rgba(245,158,11,0.12)", border:"1px solid rgba(245,158,11,0.3)", borderRadius:10, padding:"5px 10px" }}>
      <span style={{ fontSize:11 }}>👑</span>
      <span style={{ fontSize:11, fontWeight:700, color:"#fcd34d" }}>Pro</span>
    </div>
  );
  const { count, limit } = checkLimit(type);
  const pct = count / limit;
  const clr = pct >= 1 ? "#ef4444" : pct >= 0.5 ? "#f59e0b" : "#22c55e";
  return (
    <div style={{ display:"flex", alignItems:"center", gap:6, background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:10, padding:"5px 11px" }}>
      <span style={{ fontSize:11 }}>{label}</span>
      <div style={{ width:28, height:4, borderRadius:2, background:"rgba(255,255,255,0.1)", overflow:"hidden" }}>
        <div style={{ width:(pct*100)+"%", height:"100%", background:clr, borderRadius:2 }}/>
      </div>
      <span style={{ fontSize:11, fontWeight:700, color:clr }}>{limit-count}/{limit}</span>
      <span style={{ fontSize:10, color:"#334155" }}>{period}</span>
    </div>
  );
}

// ─── AI Chat ──────────────────────────────────────────────────────────────────
function ChatAssistant({ user, assignments, onLimitHit }) {
  const makeGreeting = () => "Hey " + (user?.name||"there") + "! I'm your TaskMark AI tutor 🎓\n\nAsk me **any question** — math, science, history, English, you name it. You can also **upload a photo or PDF** of your homework and I'll help!\n\nWhat are you working on?";

  const [msgs,       setMsgs]       = useState([{ id:0, role:"assistant", text:makeGreeting() }]);
  const [input,      setInput]      = useState("");
  const [loading,    setLoading]    = useState(false);
  const [attachment, setAttachment] = useState(null);
  const [dragOver,   setDragOver]   = useState(false);
  const [aiUsage,    setAiUsage]    = useState(() => checkLimit("aiMessages"));

  const historyRef = useRef([]);
  const bottomRef  = useRef(null);
  const inputRef   = useRef(null);
  const fileRef    = useRef(null);

  const pendingStr = assignments.filter(a=>!a.completed).map(a=>a.title+" ("+a.subject+", due "+fmtDate(a.dueDate)+")").join(", ");
  const SYSTEM = "You are TaskMark, a friendly, encouraging AI tutor for students. Help them understand concepts and solve problems step by step. Be warm, clear, and supportive. Use bullet points and numbered steps when helpful." +
    (pendingStr ? " Student's pending assignments: "+pendingStr+"." : "") + " Student's name: " + (user?.name||"there") + ".";

  const SUGGESTIONS = [
    "Help me understand photosynthesis 🌱",
    "How do I solve quadratic equations? 📐",
    "Explain the causes of World War II 🌍",
    "Help me write a strong thesis statement ✍️",
    "What is Newton's third law? ⚡",
    "How do I find the area of a circle? 🔵",
  ];

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:"smooth" }); }, [msgs, loading]);

  // refresh usage when pro status may have changed
  useEffect(() => { setAiUsage(checkLimit("aiMessages")); }, []);

  async function handleFile(file) {
    if (!file) return;
    const isImage = file.type.startsWith("image/");
    const isPDF   = file.type === "application/pdf";
    if (!isImage && !isPDF) return alert("Please upload an image (JPG, PNG) or PDF.");
    if (file.size > 10*1024*1024) return alert("File too large — please keep under 10MB.");
    const base64 = await fileToBase64(file);
    const previewUrl = isImage ? URL.createObjectURL(file) : null;
    setAttachment({ name:file.name, type:file.type, base64, previewUrl, isImage, isPDF });
  }

  function removeAttachment() {
    if (attachment?.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    setAttachment(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function sendMessage(override) {
    const text = (override !== undefined ? override : input).trim();
    if ((!text && !attachment) || loading) return;

    const usage = checkLimit("aiMessages");
    if (!usage.allowed) { onLimitHit("aiMessages"); return; }

    setInput("");
    const savedAtt = attachment;
    const displayText = text || "Please look at this file and help me with it.";
    const userMsg = {
      id: Date.now(), role:"user", text: displayText,
      attachmentMeta: savedAtt ? { name:savedAtt.name, previewUrl:savedAtt.previewUrl, isImage:savedAtt.isImage, isPDF:savedAtt.isPDF } : null,
    };
    setMsgs(m => [...m, userMsg]);
    setAttachment(null);
    if (fileRef.current) fileRef.current.value = "";
    setLoading(true);

    try {
      // Build the message for this turn
      let userContent;
      if (savedAtt) {
        const blocks = [];
        if (savedAtt.isImage) {
          blocks.push({ type:"image", source:{ type:"base64", media_type: savedAtt.type, data: savedAtt.base64 } });
        } else if (savedAtt.isPDF) {
          blocks.push({ type:"document", source:{ type:"base64", media_type:"application/pdf", data: savedAtt.base64 } });
        }
        blocks.push({ type:"text", text: text || "Please analyze this file and help me understand it." });
        userContent = blocks;
      } else {
        userContent = text; // plain string — always valid
      }

      // Build messages: history (plain strings only) + current message
      // Ensure history strictly alternates user/assistant
      const safeHistory = [];
      for (const h of historyRef.current) {
        safeHistory.push({
          role: h.role === "assistant" ? "assistant" : "user",
          content: typeof h.content === "string" ? h.content : String(h.content),
        });
      }

      const apiMessages = [...safeHistory, { role: "user", content: userContent }];
      const reply = await askClaude(apiMessages, SYSTEM);

      // Save to history as plain strings
      historyRef.current = [
        ...historyRef.current,
        { role: "user",      content: text || "(file)" },
        { role: "assistant", content: reply },
      ];
      if (historyRef.current.length > 40) historyRef.current = historyRef.current.slice(-40);

      incrementUsage("aiMessages");
      setAiUsage(checkLimit("aiMessages"));
      setMsgs(m => [...m, { id:Date.now(), role:"assistant", text:reply }]);
    } catch(e) {
      setMsgs(m => [...m, { id:Date.now(), role:"assistant", text:"❌ " + e.message }]);
    }

    if (savedAtt && savedAtt.previewUrl) URL.revokeObjectURL(savedAtt.previewUrl);
    setLoading(false);
    setTimeout(() => inputRef.current && inputRef.current.focus(), 50);
  }


  function clearChat() {
    setMsgs([{ id:Date.now(), role:"assistant", text:makeGreeting() }]);
    historyRef.current = [];
    removeAttachment();
  }

  function handleKey(e) { if (e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); sendMessage(); } }

  function renderText(text) {
    return text.split("\n").map((line,i)=>{
      if (!line.trim()) return <div key={i} style={{ height:5 }}/>;
      const html = line.replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>").replace(/\*(.+?)\*/g,"<em>$1</em>");
      if (/^[•\-] /.test(line)) return <div key={i} style={{ display:"flex",gap:8,marginTop:4,paddingLeft:4 }}><span style={{ color:"#818cf8",flexShrink:0 }}>•</span><span dangerouslySetInnerHTML={{ __html:html.replace(/^[•\-] /,"") }}/></div>;
      if (/^\d+\. /.test(line)) { const n=line.match(/^(\d+)/)[1]; return <div key={i} style={{ display:"flex",gap:8,marginTop:4,paddingLeft:4 }}><span style={{ color:"#818cf8",flexShrink:0,minWidth:18,fontWeight:700 }}>{n}.</span><span dangerouslySetInnerHTML={{ __html:html.replace(/^\d+\. /,"") }}/></div>; }
      return <div key={i} style={{ marginTop:i>0?2:0 }} dangerouslySetInnerHTML={{ __html:html }}/>;
    });
  }

  const atLimit = !aiUsage.allowed;

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"calc(100vh - 230px)", minHeight:480 }}>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12, flexShrink:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ width:42, height:42, borderRadius:13, background:"linear-gradient(135deg,#4f46e5,#22d3ee)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:21, boxShadow:"0 6px 24px rgba(99,102,241,0.4)" }}>🤖</div>
          <div>
            <div style={{ fontWeight:800, fontSize:16 }}>AI Tutor</div>
            <div style={{ fontSize:11, color:atLimit?"#ef4444":"#22c55e", fontWeight:600, display:"flex", alignItems:"center", gap:5 }}>
              <span style={{ width:6, height:6, borderRadius:"50%", background:atLimit?"#ef4444":"#22c55e", display:"inline-block" }}/>
              {isPro() ? "Pro · Unlimited messages" : atLimit ? "Daily limit reached" : aiUsage.remaining + " messages left today"}
            </div>
          </div>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          {!isPro() && (
            <div style={{ background:atLimit?"rgba(239,68,68,0.1)":"rgba(99,102,241,0.1)", border:"1px solid "+(atLimit?"rgba(239,68,68,0.3)":"rgba(99,102,241,0.25)"), borderRadius:10, padding:"5px 12px", fontSize:12, fontWeight:700, color:atLimit?"#f87171":"#a5b4fc" }}>
              🤖 {aiUsage.remaining}/{aiUsage.limit} today
            </div>
          )}
          <div style={{ fontSize:11, color:"#475569", background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:8, padding:"5px 10px" }}>📎 JPG · PNG · PDF</div>
          <button onClick={clearChat} style={{ background:"transparent", border:"1px solid rgba(255,255,255,0.1)", color:"#64748b", borderRadius:8, padding:"6px 12px", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"inherit", transition:"all .18s" }}
            onMouseOver={e=>{e.currentTarget.style.color="#e2e8f0";e.currentTarget.style.borderColor="rgba(255,255,255,0.25)";}}
            onMouseOut={e=>{e.currentTarget.style.color="#64748b";e.currentTarget.style.borderColor="rgba(255,255,255,0.1)";}}>🗑 Clear</button>
        </div>
      </div>

      {/* Suggestions */}
      {msgs.length<=1&&(
        <div style={{ marginBottom:14, flexShrink:0 }}>
          <div style={{ fontSize:10, fontWeight:800, color:"#334155", letterSpacing:1.5, marginBottom:9 }}>QUICK QUESTIONS</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:7 }}>
            {SUGGESTIONS.map(s=>(
              <button key={s} onClick={()=>sendMessage(s)} style={{ background:"rgba(99,102,241,0.08)", border:"1px solid rgba(99,102,241,0.2)", color:"#a5b4fc", borderRadius:20, padding:"7px 14px", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"inherit", transition:"all .18s" }}
                onMouseOver={e=>{e.currentTarget.style.background="rgba(99,102,241,0.18)";e.currentTarget.style.borderColor="rgba(99,102,241,0.45)";}}
                onMouseOut={e=>{e.currentTarget.style.background="rgba(99,102,241,0.08)";e.currentTarget.style.borderColor="rgba(99,102,241,0.2)";}}>
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      <div style={{ flex:1, overflowY:"auto", display:"flex", flexDirection:"column", gap:14, paddingRight:4, paddingBottom:4, position:"relative" }}
        onDragOver={e=>{e.preventDefault();setDragOver(true);}}
        onDragLeave={()=>setDragOver(false)}
        onDrop={e=>{e.preventDefault();setDragOver(false);if(e.dataTransfer.files[0])handleFile(e.dataTransfer.files[0]);}}>
        {dragOver&&<div style={{ position:"absolute",inset:0,zIndex:10,background:"rgba(99,102,241,0.12)",border:"2px dashed #6366f1",borderRadius:14,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8,pointerEvents:"none" }}><div style={{ fontSize:40 }}>📂</div><div style={{ fontWeight:800,color:"#818cf8",fontSize:16 }}>Drop file here!</div></div>}
        {msgs.map(msg=>{
          const isAI=msg.role==="assistant";
          return (
            <div key={msg.id} style={{ display:"flex",gap:10,alignItems:"flex-start",justifyContent:isAI?"flex-start":"flex-end",animation:"fadeUp .22s ease" }}>
              {isAI&&<div style={{ width:34,height:34,borderRadius:10,background:"linear-gradient(135deg,#4f46e5,#7c3aed)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,flexShrink:0,marginTop:2 }}>🤖</div>}
              <div style={{ maxWidth:"76%",display:"flex",flexDirection:"column",gap:8,alignItems:isAI?"flex-start":"flex-end" }}>
                {msg.attachmentMeta&&(
                  <div style={{ background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:12,padding:"10px 14px",display:"flex",alignItems:"center",gap:10,maxWidth:260 }}>
                    {msg.attachmentMeta.isImage&&msg.attachmentMeta.previewUrl?<img src={msg.attachmentMeta.previewUrl} alt="upload" style={{ width:72,height:54,objectFit:"cover",borderRadius:7 }}/>:<div style={{ width:40,height:40,background:"rgba(239,68,68,0.15)",border:"1px solid rgba(239,68,68,0.28)",borderRadius:9,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0 }}>📄</div>}
                    <div><div style={{ fontSize:12,fontWeight:700,color:"#e2e8f0",lineHeight:1.3 }}>{msg.attachmentMeta.name}</div><div style={{ fontSize:11,color:"#64748b",marginTop:2 }}>{msg.attachmentMeta.isPDF?"PDF":"Image"}</div></div>
                  </div>
                )}
                {msg.text&&<div style={{ padding:"13px 17px",borderRadius:isAI?"4px 18px 18px 18px":"18px 4px 18px 18px",background:isAI?"rgba(255,255,255,0.05)":"linear-gradient(135deg,#4f46e5,#6d28d9)",border:isAI?"1px solid rgba(255,255,255,0.08)":"none",fontSize:14,lineHeight:1.7,color:isAI?"#cbd5e1":"#fff",boxShadow:isAI?"none":"0 6px 24px rgba(99,102,241,0.35)" }}>{isAI?renderText(msg.text):msg.text}</div>}
              </div>
              {!isAI&&<div style={{ width:34,height:34,borderRadius:10,background:"linear-gradient(135deg,#7c3aed,#4f46e5)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,fontWeight:800,color:"#fff",flexShrink:0,marginTop:2 }}>{user?.name?.[0]?.toUpperCase()||"Y"}</div>}
            </div>
          );
        })}
        {loading&&<div style={{ display:"flex",gap:10,alignItems:"flex-start" }}><div style={{ width:34,height:34,borderRadius:10,background:"linear-gradient(135deg,#4f46e5,#7c3aed)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,flexShrink:0 }}>🤖</div><div style={{ padding:"14px 18px",borderRadius:"4px 18px 18px 18px",background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.08)",display:"flex",gap:5,alignItems:"center" }}>{[0,1,2].map(i=><div key={i} style={{ width:7,height:7,borderRadius:"50%",background:"#6366f1",animation:"bounce .8s ease infinite",animationDelay:i*.15+"s" }}/>)}</div></div>}
        <div ref={bottomRef}/>
      </div>

      {/* Attachment preview */}
      {attachment&&<div style={{ flexShrink:0,margin:"8px 0 4px",display:"flex",alignItems:"center",gap:12,background:"rgba(99,102,241,0.1)",border:"1px solid rgba(99,102,241,0.25)",borderRadius:12,padding:"10px 14px" }}>
        {attachment.isImage&&attachment.previewUrl?<img src={attachment.previewUrl} alt="preview" style={{ width:50,height:38,objectFit:"cover",borderRadius:7 }}/>:<div style={{ width:38,height:38,background:"rgba(239,68,68,0.15)",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0 }}>📄</div>}
        <div style={{ flex:1 }}><div style={{ fontSize:12,fontWeight:700,color:"#c4b5fd" }}>{attachment.name}</div><div style={{ fontSize:11,color:"#64748b" }}>{attachment.isPDF?"PDF":"Image"} · Ready to send</div></div>
        <button onClick={removeAttachment} style={{ background:"transparent",border:"none",color:"#64748b",cursor:"pointer",fontSize:20,padding:"2px 6px",lineHeight:1,transition:"color .18s" }} onMouseOver={e=>e.currentTarget.style.color="#f87171"} onMouseOut={e=>e.currentTarget.style.color="#64748b"}>×</button>
      </div>}

      {/* Limit banner */}
      {atLimit&&!isPro()&&<div style={{ flexShrink:0,marginTop:8,background:"rgba(239,68,68,0.08)",border:"1px solid rgba(239,68,68,0.25)",borderRadius:12,padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12 }}>
        <div style={{ fontSize:13,color:"#f87171",fontWeight:600 }}>🚫 Daily limit reached (5/5)</div>
        <button onClick={()=>onLimitHit("aiMessages")} style={{ background:"linear-gradient(135deg,#f59e0b,#f97316)",border:"none",borderRadius:9,padding:"8px 16px",fontSize:12,fontWeight:800,color:"#fff",cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap" }}>👑 Upgrade</button>
      </div>}

      {/* Input */}
      {(!atLimit||isPro())&&<div style={{ flexShrink:0,marginTop:8 }}>
        <div style={{ display:"flex",gap:10,alignItems:"flex-end",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:16,padding:"10px 10px 10px 14px",transition:"border-color .2s" }}
          onFocusCapture={e=>e.currentTarget.style.borderColor="rgba(99,102,241,0.5)"}
          onBlurCapture={e=>e.currentTarget.style.borderColor="rgba(255,255,255,0.09)"}>
          <input ref={fileRef} type="file" accept="image/*,.pdf" onChange={e=>{ if(e.target.files[0]) handleFile(e.target.files[0]); }} style={{ display:"none" }}/>
          <button onClick={()=>fileRef.current?.click()} style={{ width:36,height:36,borderRadius:10,border:"1px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.05)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,flexShrink:0,transition:"all .18s",color:"#64748b" }}
            onMouseOver={e=>{e.currentTarget.style.background="rgba(99,102,241,0.2)";e.currentTarget.style.color="#a5b4fc";e.currentTarget.style.borderColor="rgba(99,102,241,0.45)";}}
            onMouseOut={e=>{e.currentTarget.style.background="rgba(255,255,255,0.05)";e.currentTarget.style.color="#64748b";e.currentTarget.style.borderColor="rgba(255,255,255,0.1)";}}>📎</button>
          <textarea ref={inputRef} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={handleKey}
            placeholder={attachment?"Ask a question about this file…":"Ask me anything, or attach a photo/PDF of your homework…"}
            rows={1} style={{ flex:1,background:"transparent",border:"none",outline:"none",color:"#e2e8f0",fontSize:14,fontFamily:"inherit",resize:"none",lineHeight:1.6,maxHeight:120,overflowY:"auto",padding:"3px 0" }}
            onInput={e=>{ e.target.style.height="auto"; e.target.style.height=Math.min(e.target.scrollHeight,120)+"px"; }}/>
          <button onClick={()=>sendMessage()} disabled={(!input.trim()&&!attachment)||loading}
            style={{ width:38,height:38,borderRadius:11,border:"none",cursor:(!input.trim()&&!attachment)||loading?"not-allowed":"pointer",background:(!input.trim()&&!attachment)||loading?"rgba(99,102,241,0.15)":"linear-gradient(135deg,#4f46e5,#7c3aed)",color:(!input.trim()&&!attachment)||loading?"#334155":"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:700,transition:"all .18s",flexShrink:0,boxShadow:(!input.trim()&&!attachment)||loading?"none":"0 4px 16px rgba(99,102,241,0.45)" }}>↑</button>
        </div>
        <div style={{ textAlign:"center",fontSize:11,color:"#1e293b",marginTop:6 }}>📎 Attach image or PDF · Enter to send · Shift+Enter for new line</div>
      </div>}
    </div>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toasts({ list }) {
  return (
    <div style={{ position:"fixed", top:20, right:20, zIndex:999, display:"flex", flexDirection:"column", gap:8 }}>
      {list.map(t=><div key={t.id} style={{ background:t.type==="err"?"#450a0a":t.type==="warn"?"#431407":"#052e16", border:"1px solid "+(t.type==="err"?"#dc2626":t.type==="warn"?"#ea580c":"#16a34a"), borderRadius:12, padding:"12px 18px", fontSize:13, color:"#e2e8f0", boxShadow:"0 8px 32px rgba(0,0,0,0.5)", maxWidth:340, animation:"toastIn .3s ease", lineHeight:1.5 }}>{t.msg}</div>)}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

// ─── Grades Tab ───────────────────────────────────────────────────────────────
function GradesTab({ assignments }) {
  const [filterSub, setFilterSub] = useState("All");

  const graded = assignments.filter(a => a.grade !== null && a.grade !== undefined && a.grade !== "");

  // Overall GPA (avg of all graded)
  const overallAvg = graded.length
    ? Math.round((graded.reduce((s,a) => s + Number(a.grade), 0) / graded.length) * 10) / 10
    : null;

  // Per-subject stats
  const subjectStats = SUBJECTS.map(sub => {
    const items = graded.filter(a => a.subject === sub);
    if (!items.length) return null;
    const avg = Math.round((items.reduce((s,a) => s+Number(a.grade),0)/items.length)*10)/10;
    const best = Math.max(...items.map(a=>Number(a.grade)));
    const worst = Math.min(...items.map(a=>Number(a.grade)));
    return { sub, avg, best, worst, count: items.length, items, color: SUB_CLR[sub]||"#94a3b8" };
  }).filter(Boolean).sort((a,b) => b.avg - a.avg);

  const filtered = filterSub === "All"
    ? graded.slice().sort((a,b) => new Date(b.dueDate||0) - new Date(a.dueDate||0))
    : graded.filter(a=>a.subject===filterSub).sort((a,b) => new Date(b.dueDate||0)-new Date(a.dueDate||0));

  const ungraded = assignments.filter(a => !a.completed && (a.grade===null||a.grade===undefined||a.grade===""));

  return (
    <div>
      {/* Header stats row */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))", gap:12, marginBottom:24 }}>
        {/* Overall GPA card */}
        <div style={{ background:"linear-gradient(135deg,rgba(99,102,241,0.15),rgba(124,58,237,0.08))", border:"1px solid rgba(99,102,241,0.25)", borderRadius:16, padding:"18px 20px", gridColumn:"span 1" }}>
          <div style={{ fontSize:10,fontWeight:800,color:"#818cf8",letterSpacing:1.5,textTransform:"uppercase",marginBottom:8 }}>Overall Average</div>
          {overallAvg !== null ? (
            <>
              <div style={{ fontSize:42,fontWeight:900,color:gradeColor(overallAvg),lineHeight:1,marginBottom:4 }}>{gradeLetter(overallAvg)}</div>
              <div style={{ fontSize:16,fontWeight:700,color:"#94a3b8" }}>{overallAvg}%</div>
              <div style={{ fontSize:11,color:"#475569",marginTop:4 }}>{graded.length} assignment{graded.length!==1?"s":""} graded</div>
            </>
          ) : (
            <div style={{ fontSize:13,color:"#475569",marginTop:4 }}>No grades yet</div>
          )}
        </div>

        {/* Subject averages */}
        {subjectStats.slice(0,5).map(s => (
          <div key={s.sub} style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:16, padding:"16px 18px", borderTop:"3px solid "+s.color }}>
            <div style={{ fontSize:10,fontWeight:800,color:s.color,letterSpacing:1,textTransform:"uppercase",marginBottom:6 }}>{s.sub}</div>
            <div style={{ fontSize:32,fontWeight:900,color:gradeColor(s.avg),lineHeight:1,marginBottom:2 }}>{gradeLetter(s.avg)}</div>
            <div style={{ fontSize:14,fontWeight:700,color:"#94a3b8" }}>{s.avg}%</div>
            <div style={{ fontSize:10,color:"#334155",marginTop:4 }}>{s.count} grade{s.count!==1?"s":""}</div>
          </div>
        ))}
      </div>

      {/* Subject breakdown bars */}
      {subjectStats.length > 0 && (
        <div style={{ background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:16,padding:"20px 22px",marginBottom:24 }}>
          <div style={{ fontSize:12,fontWeight:800,color:"#334155",letterSpacing:1.5,textTransform:"uppercase",marginBottom:16 }}>Subject Breakdown</div>
          <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
            {subjectStats.map(s => (
              <div key={s.sub}>
                <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5 }}>
                  <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                    <div style={{ width:10,height:10,borderRadius:3,background:s.color }}/>
                    <span style={{ fontSize:13,fontWeight:700,color:"#e2e8f0" }}>{s.sub}</span>
                    <span style={{ fontSize:11,color:"#475569" }}>{s.count} grade{s.count!==1?"s":""}</span>
                  </div>
                  <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                    <span style={{ fontSize:11,color:"#475569" }}>Low: <strong style={{ color:gradeColor(s.worst) }}>{s.worst}%</strong></span>
                    <span style={{ fontSize:11,color:"#475569" }}>High: <strong style={{ color:gradeColor(s.best) }}>{s.best}%</strong></span>
                    <span style={{ fontSize:14,fontWeight:900,color:gradeColor(s.avg),minWidth:40,textAlign:"right" }}>{gradeLetter(s.avg)} {s.avg}%</span>
                  </div>
                </div>
                <div style={{ height:8,borderRadius:4,background:"rgba(255,255,255,0.06)",overflow:"hidden" }}>
                  <div style={{ height:"100%",width:s.avg+"%",background:`linear-gradient(90deg,${s.color}99,${gradeColor(s.avg)})`,borderRadius:4,transition:"width .6s ease" }}/>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter + assignment list */}
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8 }}>
        <div style={{ fontSize:14,fontWeight:700,color:"#475569" }}>
          {filtered.length > 0 ? `${filtered.length} graded assignment${filtered.length!==1?"s":""}` : "No graded assignments yet"}
        </div>
        <div style={{ display:"flex",gap:6,flexWrap:"wrap" }}>
          {["All",...SUBJECTS.filter(s=>graded.some(a=>a.subject===s))].map(s=>{
            const c=SUB_CLR[s]||"#818cf8", active=filterSub===s;
            return <button key={s} onClick={()=>setFilterSub(s)} style={{ borderRadius:20,padding:"5px 14px",fontSize:12,fontWeight:700,cursor:"pointer",border:"1px solid "+(active?c+"99":"transparent"),background:active?c+"1a":"transparent",color:active?c:"#475569",fontFamily:"inherit",transition:"all .18s" }}>{s}</button>;
          })}
        </div>
      </div>

      {filtered.length === 0 && graded.length === 0 && (
        <div style={{ textAlign:"center",padding:"52px 20px" }}>
          <div style={{ fontSize:52,marginBottom:14 }}>📊</div>
          <div style={{ fontSize:19,fontWeight:800,marginBottom:8 }}>No grades logged yet</div>
          <div style={{ fontSize:14,color:"#475569",lineHeight:1.6 }}>Go to the Assignments tab and click<br/><strong style={{ color:"#818cf8" }}>+ Log Grade</strong> on any assignment to get started.</div>
        </div>
      )}

      <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
        {filtered.map(a => {
          const sc=SUB_CLR[a.subject]||"#94a3b8", g=Number(a.grade);
          return (
            <div key={a.id} style={{ display:"flex",alignItems:"center",gap:14,padding:"14px 18px",borderRadius:14,border:"1px solid rgba(255,255,255,0.065)",background:"rgba(255,255,255,0.03)",borderLeft:"3px solid "+sc }}>
              {/* Grade badge */}
              <div style={{ width:52,height:52,borderRadius:14,background:gradeColor(g)+"18",border:"1px solid "+gradeColor(g)+"44",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
                <div style={{ fontSize:18,fontWeight:900,color:gradeColor(g),lineHeight:1 }}>{gradeLetter(g)}</div>
                <div style={{ fontSize:10,fontWeight:700,color:gradeColor(g)+"cc" }}>{g}%</div>
              </div>
              {/* Info */}
              <div style={{ flex:1,minWidth:0 }}>
                <div style={{ fontWeight:800,fontSize:15,marginBottom:3 }}>{a.title}</div>
                <div style={{ display:"flex",gap:8,alignItems:"center",flexWrap:"wrap" }}>
                  <span style={{ fontSize:11,fontWeight:700,color:sc }}>{a.subject}</span>
                  <span style={{ fontSize:11,color:"#334155" }}>{a.dueDate?`Due ${fmtDate(a.dueDate)}`:""}</span>
                  <span style={{ fontSize:11,fontWeight:700,color:priClr(a.priority),background:priClr(a.priority)+"18",borderRadius:20,padding:"1px 8px",border:"1px solid "+priClr(a.priority)+"33" }}>{a.priority}</span>
                </div>
              </div>
              {/* Grade bar */}
              <div style={{ width:90,flexShrink:0 }}>
                <div style={{ height:6,borderRadius:3,background:"rgba(255,255,255,0.06)",overflow:"hidden",marginBottom:4 }}>
                  <div style={{ height:"100%",width:g+"%",background:gradeColor(g),borderRadius:3,transition:"width .5s ease" }}/>
                </div>
                <div style={{ fontSize:10,color:"#475569",textAlign:"right" }}>{g}/100</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Ungraded reminder */}
      {ungraded.length > 0 && (
        <div style={{ marginTop:24,background:"rgba(245,158,11,0.06)",border:"1px solid rgba(245,158,11,0.18)",borderRadius:14,padding:"14px 18px",display:"flex",alignItems:"center",gap:12 }}>
          <span style={{ fontSize:20 }}>{"⏳"}</span>
          <div>
            <div style={{ fontSize:13,fontWeight:700,color:"#fcd34d",marginBottom:2 }}>{ungraded.length} assignment{ungraded.length!==1?"s":""} still need a grade</div>
            <div style={{ fontSize:12,color:"#78350f" }}>Go to Assignments tab and tap <strong>+ Log Grade</strong> on each one.</div>
          </div>
        </div>
      )}
    </div>
  );
}

function printStudyGuide(note, aiContent, mode) {
  const title = mode === "summary" ? "AI Summary" : "Study Guide";
  const subjectColor = {
    Math:"#f97316", Science:"#22d3ee", English:"#a78bfa", History:"#fb923c",
    Art:"#f472b6", Music:"#34d399", PE:"#facc15", Other:"#94a3b8"
  }[note.subject] || "#6366f1";

  const htmlContent = aiContent
    .split("\n")
    .map(line => {
      if (!line.trim()) return "<br/>";
      line = line.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\*(.+?)\*/g, "<em>$1</em>");
      if (/^[•\-] /.test(line)) return "<li>" + line.replace(/^[•\-] /, "") + "</li>";
      if (/^\d+\.\s/.test(line)) return "<li>" + line.replace(/^\d+\.\s/, "") + "</li>";
      if (/^## /.test(line)) return "<h3>" + line.replace(/^## /, "") + "</h3>";
      if (/^# /.test(line))  return "<h2>" + line.replace(/^# /, "")  + "</h2>";
      return "<p>" + line + "</p>";
    })
    .join("\n");

  const date = new Date().toLocaleDateString("en-US", { month:"long", day:"numeric", year:"numeric" });
  const typeBadge = mode === "guide" ? "📖 Study Guide" : "✨ AI Summary";
  const typeColor = mode === "guide" ? "#0891b2" : "#6366f1";

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<title>${title} — ${note.title}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Georgia,serif;color:#1e293b;background:#fff;padding:48px 60px;max-width:860px;margin:0 auto;line-height:1.75;font-size:14px}
.header{border-bottom:3px solid ${subjectColor};padding-bottom:20px;margin-bottom:28px}
.brand{font-size:10px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#94a3b8;margin-bottom:10px}
.title{font-size:26px;font-weight:900;color:#0f172a;margin-bottom:10px;letter-spacing:-0.5px}
.meta{display:flex;gap:14px;align-items:center;flex-wrap:wrap}
.badge{display:inline-block;background:${subjectColor}22;border:1px solid ${subjectColor}55;color:${subjectColor};border-radius:20px;padding:3px 12px;font-size:11px;font-weight:700}
.type-badge{display:inline-block;background:${typeColor}22;border:1px solid ${typeColor}55;color:${typeColor};border-radius:20px;padding:3px 12px;font-size:11px;font-weight:700}
.date{font-size:11px;color:#94a3b8}
h2{font-size:18px;font-weight:900;color:#0f172a;margin:24px 0 8px;padding-bottom:5px;border-bottom:1px solid #e2e8f0}
h3{font-size:15px;font-weight:800;color:#334155;margin:18px 0 6px}
p{margin-bottom:7px;color:#334155}
li{margin-left:22px;margin-bottom:5px;color:#334155}
strong{color:#0f172a;font-weight:700}
.footer{margin-top:36px;padding-top:14px;border-top:1px solid #e2e8f0;font-size:10px;color:#94a3b8;display:flex;justify-content:space-between}
.no-print{text-align:center;margin-bottom:24px;padding:14px;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0}
.print-btn{background:#0f172a;color:#fff;border:none;border-radius:8px;padding:10px 24px;font-size:13px;font-weight:700;cursor:pointer;margin-right:10px}
.pdf-btn{background:#dc2626;color:#fff;border:none;border-radius:8px;padding:10px 24px;font-size:13px;font-weight:700;cursor:pointer}
@media print{.no-print{display:none}body{padding:24px 32px}@page{margin:0.75in}}
</style></head><body>
<div class="no-print">
  <button class="print-btn" onclick="window.print()">🖨️ Print</button>
  <button class="pdf-btn" onclick="window.print()">📄 Save as PDF &nbsp;(choose &ldquo;Save as PDF&rdquo; in the print dialog)</button>
</div>
<div class="header">
  <div class="brand">TaskMark &middot; AI ${title}</div>
  <div class="title">${note.title}</div>
  <div class="meta">
    <span class="badge">${note.subject}</span>
    <span class="type-badge">${typeBadge}</span>
    <span class="date">Generated ${date}</span>
  </div>
</div>
<div class="content">${htmlContent}</div>
<div class="footer">
  <span>TaskMark &middot; AI-powered study assistant</span>
  <span>Generated on ${date}</span>
</div>
</body></html>`;

  // Use a hidden iframe injected into the current document — no popup blocked
  let iframe = document.getElementById("tm-print-frame");
  if (!iframe) {
    iframe = document.createElement("iframe");
    iframe.id = "tm-print-frame";
    iframe.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;border:none;z-index:99999;background:#fff";
    document.body.appendChild(iframe);
  }

  const doc = iframe.contentDocument || iframe.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();

  // Add close button overlay so user can get back
  const closeBtn = document.createElement("button");
  closeBtn.innerText = "✕ Close Preview";
  closeBtn.style.cssText = "position:fixed;top:16px;right:16px;z-index:100000;background:#1e293b;color:#fff;border:none;border-radius:8px;padding:8px 16px;font-size:13px;font-weight:700;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,0.4)";
  closeBtn.onclick = () => { iframe.style.display="none"; closeBtn.remove(); };
  document.body.appendChild(closeBtn);
  iframe.style.display = "block";
}

export default function App() {
  // Migrate old assignments that lack reminderDays
  useEffect(() => {
    try {
      const raw = localStorage.getItem("tm_assign1");
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          const migrated = arr.map(a => ({ reminderDays:1, customDays:"", ...a }));
          localStorage.setItem("tm_assign1", JSON.stringify(migrated));
        }
      }
    } catch(e) {}
  // eslint-disable-next-line
  }, []);

  const [user,        setUser]        = usePersist("tm_user1", null);
  const [assignments, setAssignments] = usePersist("tm_assign1", []);
  const [notes,       setNotes]       = usePersist("tm_notes1", []);
  const [tab,         setTab]         = useState("assignments");
  const [toasts,      setToasts]      = useState([]);
  const [showAdd,     setShowAdd]     = useState(false);
  const [showNote,    setShowNote]    = useState(false);
  const [selNote,     setSelNote]     = useState(null);
  const [aiRes,       setAiRes]       = useState(null);
  const [aiLoad,      setAiLoad]      = useState(false);
  const [aiMode,      setAiMode]      = useState(null);
  const [filterSub,   setFilterSub]   = useState("All");
  const [upgradeReason, setUpgradeReason] = useState(null); // null | "assignments" | "notes" | "aiMessages"
  const [showGradeFor, setShowGradeFor] = useState(null); // assignment id
  const [gradeInput,   setGradeInput]   = useState("");
  const [proStatus,   setProStatus]   = useState(isPro());
  const [, forceUpdate] = useState(0);
  const firedRef = useRef(new Set());

  const blankA = { title:"", subject:"Math", dueDate:"", priority:"Medium", notes:"", reminderDays:1, customDays:"" };
  const [aForm, setAForm] = useState(blankA);
  const [nForm, setNForm] = useState({ title:"", subject:"Math", content:"" });

  function showUpgrade(reason) { setUpgradeReason(reason); }
  function handleUpgraded() {
    setProStatus(true);
    setUpgradeReason(null);
    forceUpdate(n=>n+1);
    toast("🎉 Welcome to Pro! You now have unlimited access to everything.", "ok");
  }

  useEffect(() => {
    if (!user) return;
    const check = async () => {
      for (const a of assignments) {
        if (a.completed) continue;
        const remind = (a.reminderDays && a.reminderDays !== "custom") ? Number(a.reminderDays) : 1;
        const key = a.id + "-r" + remind;
        if (daysUntil(a.dueDate) === remind && !firedRef.current.has(key)) {
          firedRef.current.add(key);
          try { await fetch("https://api.emailjs.com/api/v1.0/email/send", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ service_id:EMAILJS_SERVICE_ID, template_id:EMAILJS_TEMPLATE_ID, user_id:EMAILJS_PUBLIC_KEY, template_params:{ to_email:user.email, to_name:user.name, assignment_title:a.title, subject:a.subject, due_date:fmtDate(a.dueDate), priority:a.priority, days_before: remind } }) }); } catch {}
        }
      }
    };
    check();
    const t = setInterval(check, 30*60*1000);
    return () => clearInterval(t);
  }, [assignments, user]);

  function toast(msg, type) {
    const id = Date.now();
    setToasts(t=>[...t,{id,msg,type:type||"ok"}]);
    setTimeout(()=>setToasts(t=>t.filter(x=>x.id!==id)),5000);
  }

  function addAssignment() {
    const usage = checkLimit("assignments");
    if (!usage.allowed) { showUpgrade("assignments"); return; }
    if (!aForm.title.trim()) return toast("Please enter a title.", "err");
    if (!aForm.dueDate) return toast("Please enter a due date.", "err");
    // resolve custom days
    let remind = aForm.reminderDays;
    if (remind === "custom") {
      const c = parseInt(aForm.customDays, 10);
      if (!c || c < 1 || c > 365) return toast("Please enter a valid number of days (1–365).", "err");
      remind = c;
    }
    incrementUsage("assignments");
    forceUpdate(n=>n+1);
    setAssignments(p=>[...p,{...aForm, reminderDays: remind, id:Date.now(), completed:false, createdAt:new Date().toISOString()}]);
    setAForm(blankA); setShowAdd(false);
    toast("Assignment added! Reminder email scheduled " + remind + " day" + (remind!==1?"s":"") + " before due date. 📧");
  }

  function toggleDone(id) { setAssignments(p=>p.map(a=>a.id===id?{...a,completed:!a.completed}:a)); }
  function delAssign(id)  { setAssignments(p=>p.filter(a=>a.id!==id)); toast("Assignment removed."); }

  function addNote() {
    const usage = checkLimit("notes");
    if (!usage.allowed) { showUpgrade("notes"); return; }
    if (!nForm.title.trim()||!nForm.content.trim()) return toast("Title and content required.", "err");
    incrementUsage("notes");
    forceUpdate(n=>n+1);
    setNotes(p=>[...p,{...nForm,id:Date.now(),createdAt:new Date().toISOString()}]);
    setNForm({title:"",subject:"Math",content:""}); setShowNote(false); toast("Note saved!");
  }
  function delNote(id) { setNotes(p=>p.filter(n=>n.id!==id)); setSelNote(null); toast("Note deleted."); }

  async function runAI(note, mode) {
    const usage = checkLimit("aiMessages");
    if (!usage.allowed) { showUpgrade("aiMessages"); return; }
    setAiLoad(true); setAiMode(mode); setAiRes(null);
    const prompt = mode==="summary"
      ? "Summarize these student notes clearly with bullet points:\n\n"+note.content
      : "Create a study guide from these notes. Include Key Concepts, Definitions, Important Facts, and Practice Q&A:\n\n"+note.content;
    try {
      const reply = await askClaude([{ role:"user", content:prompt }], "You are a helpful study assistant for students. Be clear and concise.");
      incrementUsage("aiMessages");
      forceUpdate(n=>n+1);
      setAiRes(reply);
    } catch(e) { setAiRes("Error: "+e.message); }
    setAiLoad(false);
  }

  const assignUsage = checkLimit("assignments");
  const noteUsage   = checkLimit("notes");

  const pending = assignments.filter(a=>!a.completed&&(filterSub==="All"||a.subject===filterSub)).sort((a,b)=>new Date(a.dueDate)-new Date(b.dueDate));
  const done    = assignments.filter(a=> a.completed&&(filterSub==="All"||a.subject===filterSub));

  const css = `
    *{box-sizing:border-box;margin:0;padding:0}
    @keyframes popIn{from{opacity:0;transform:scale(.86) translateY(22px)}to{opacity:1;transform:scale(1) translateY(0)}}
    @keyframes toastIn{from{transform:translateX(60px);opacity:0}to{transform:translateX(0);opacity:1}}
    @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
    @keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
    @keyframes spin{to{transform:rotate(360deg)}}
    @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
    .fade-up{animation:fadeUp .28s ease both}
    .card{background:rgba(255,255,255,0.032);border:1px solid rgba(255,255,255,0.065);border-radius:14px;transition:all .2s}
    .card:hover{background:rgba(255,255,255,0.055);border-color:rgba(255,255,255,0.11)}
    .btn-p{display:inline-flex;align-items:center;justify-content:center;gap:6px;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;padding:11px 22px;font-size:14px;font-weight:700;border:none;border-radius:10px;cursor:pointer;font-family:inherit;transition:all .18s;box-shadow:0 4px 20px rgba(99,102,241,.3)}
    .btn-p:hover{transform:translateY(-1px);box-shadow:0 8px 28px rgba(99,102,241,.5)}
    .btn-p:disabled{opacity:.45;cursor:not-allowed;transform:none;box-shadow:none}
    .btn-g{display:inline-flex;align-items:center;justify-content:center;background:transparent;border:1px solid rgba(255,255,255,.1);color:#94a3b8;padding:9px 18px;font-size:13px;font-weight:600;border-radius:10px;cursor:pointer;font-family:inherit;transition:all .18s}
    .btn-g:hover{border-color:rgba(255,255,255,.28);color:#e2e8f0}
    .btn-d{display:inline-flex;align-items:center;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.22);color:#f87171;padding:6px 12px;font-size:12px;font-weight:600;border-radius:8px;cursor:pointer;font-family:inherit;transition:all .18s}
    .btn-d:hover{background:rgba(239,68,68,.22)}
    .btn-upgrade{display:inline-flex;align-items:center;justify-content:center;gap:6px;background:linear-gradient(135deg,#f59e0b,#f97316);color:#fff;padding:9px 18px;font-size:13px;font-weight:800;border:none;border-radius:10px;cursor:pointer;font-family:inherit;transition:all .18s;box-shadow:0 4px 20px rgba(245,158,11,.35)}
    .btn-upgrade:hover{transform:translateY(-1px);box-shadow:0 8px 28px rgba(245,158,11,.55)}
    input,textarea,select{background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.09);border-radius:10px;color:#e2e8f0;padding:11px 14px;font-family:inherit;font-size:14px;width:100%;outline:none;transition:border-color .2s,background .2s}
    input:focus,textarea:focus,select:focus{border-color:#6366f1;background:rgba(255,255,255,.08)}
    select option{background:#111827}
    textarea{resize:vertical;min-height:90px}
    .chip{border-radius:20px;padding:5px 14px;font-size:12px;font-weight:700;cursor:pointer;border:1px solid transparent;background:transparent;color:#475569;font-family:inherit;transition:all .18s}
    .chip:hover{color:#94a3b8}
    .overlay{position:fixed;inset:0;background:rgba(0,0,0,.78);backdrop-filter:blur(12px);z-index:200;display:flex;align-items:center;justify-content:center;padding:20px}
    .modal{background:#0b0e1c;border:1px solid rgba(255,255,255,.09);border-radius:20px;padding:28px;width:100%;max-width:480px;max-height:90vh;overflow-y:auto;animation:popIn .3s ease}
    .lbl{display:block;font-size:11px;font-weight:700;color:#475569;margin-bottom:7px;letter-spacing:.7px;text-transform:uppercase}
    .field{margin-bottom:16px}
    .tab-btn{background:transparent;border:none;cursor:pointer;font-family:inherit;font-weight:700;font-size:14px;padding:9px 18px;border-radius:9px;color:#475569;transition:all .2s;display:flex;align-items:center;gap:7px;white-space:nowrap}
    .tab-btn.active{background:rgba(99,102,241,.15);color:#818cf8}
    .tab-btn:hover{color:#94a3b8}
    .arow{display:flex;align-items:flex-start;gap:14px;padding:14px 18px;border-radius:14px;border:1px solid rgba(255,255,255,.065);background:rgba(255,255,255,.03);margin-bottom:10px;border-left-width:3px;transition:all .2s}
    .arow:hover{background:rgba(255,255,255,.055)}
    .chk{width:22px;height:22px;border-radius:50%;border:2px solid #4f46e5;cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center;transition:all .18s;margin-top:2px;background:transparent}
    .chk.done{background:#4f46e5;border-color:#4f46e5}
    ::-webkit-scrollbar{width:4px}
    ::-webkit-scrollbar-thumb{background:rgba(255,255,255,.08);border-radius:4px}
  `;

  return (
    <div style={{ minHeight:"100vh", background:"#07090f", fontFamily:"'Outfit',sans-serif", color:"#e2e8f0" }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"/>
      <style>{css}</style>

      <Toasts list={toasts}/>
      {!user && <OnboardingModal onComplete={u=>setUser(u)}/>}
      {upgradeReason && <UpgradeModal reason={upgradeReason} onClose={()=>setUpgradeReason(null)} onUpgrade={handleUpgraded}/>}

      <header style={{ borderBottom:"1px solid rgba(255,255,255,.055)", padding:"14px 24px", display:"flex", alignItems:"center", justifyContent:"space-between", maxWidth:1080, margin:"0 auto", flexWrap:"wrap", gap:10 }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ width:38, height:38, borderRadius:11, background:"linear-gradient(135deg,#4f46e5,#22d3ee)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:19 }}>📚</div>
          <div>
            <div style={{ fontWeight:900, fontSize:18, letterSpacing:-0.4, display:"flex", alignItems:"center", gap:8 }}>
              TaskMark
              {proStatus && <span style={{ background:"linear-gradient(135deg,#f59e0b,#f97316)", borderRadius:8, padding:"2px 8px", fontSize:10, fontWeight:800, color:"#fff", letterSpacing:.5 }}>PRO</span>}
            </div>
            <div style={{ fontSize:10, color:"#334155", fontFamily:"'JetBrains Mono',monospace" }}>AI HOMEWORK TRACKER</div>
          </div>
        </div>
        {user && (
          <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
            {!proStatus && <>
              <UsagePill type="assignments" label="📋" period="/mo"/>
              <UsagePill type="notes"       label="📝" period="/mo"/>
              <button className="btn-upgrade" onClick={()=>showUpgrade("assignments")} style={{ padding:"6px 14px", fontSize:12 }}>👑 Upgrade</button>
            </>}
            {proStatus && <UsagePill type="assignments" label="📋" period=""/>}
            <div style={{ display:"flex", alignItems:"center", gap:8, background:"rgba(255,255,255,.04)", border:"1px solid rgba(255,255,255,.08)", borderRadius:20, padding:"5px 12px 5px 7px" }}>
              <div style={{ width:26, height:26, borderRadius:"50%", background:"linear-gradient(135deg,#4f46e5,#7c3aed)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:800, color:"#fff" }}>{user.name[0].toUpperCase()}</div>
              <div>
                <div style={{ fontSize:12, fontWeight:700, color:"#e2e8f0", lineHeight:1 }}>{user.name}</div>
                <div style={{ fontSize:10, color:"#475569", marginTop:2 }}>{user.email}</div>
              </div>
            </div>
            <button className="btn-g" style={{ fontSize:11, padding:"5px 11px" }} onClick={()=>{ if(window.confirm("Sign out?")){ setUser(null); setAssignments([]); setNotes([]); }}}>Sign out</button>
          </div>
        )}
      </header>

      <main style={{ maxWidth:1080, margin:"0 auto", padding:"20px 24px 60px" }}>
        {user && (
          <div style={{ background:"linear-gradient(135deg,rgba(79,70,229,.13),rgba(124,58,237,.07))", border:"1px solid rgba(99,102,241,.18)", borderRadius:14, padding:"14px 20px", marginBottom:18, display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:10 }}>
            <div>
              <div style={{ fontWeight:800, fontSize:16, marginBottom:2 }}>👋 Hey {user.name}! {proStatus&&<span style={{ fontSize:13, color:"#f59e0b" }}>· Pro member 👑</span>}</div>
              <div style={{ fontSize:12, color:"#94a3b8" }}>Reminders → <strong style={{ color:"#c4b5fd" }}>{user.email}</strong> · 1 day before each due date</div>
            </div>
            <div style={{ display:"flex", gap:10 }}>
              {[{label:"Today",val:assignments.filter(a=>!a.completed&&daysUntil(a.dueDate)===0).length,clr:"#ef4444"},{label:"Pending",val:assignments.filter(a=>!a.completed).length,clr:"#818cf8"},{label:"Done",val:assignments.filter(a=>a.completed).length,clr:"#22c55e"}].map(s=>(
                <div key={s.label} style={{ textAlign:"center", background:"rgba(0,0,0,.2)", borderRadius:10, padding:"8px 14px" }}>
                  <div style={{ fontSize:20, fontWeight:900, color:s.clr }}>{s.val}</div>
                  <div style={{ fontSize:10, color:"#475569", fontWeight:700 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display:"flex", gap:4, marginBottom:20, background:"rgba(255,255,255,.025)", borderRadius:12, padding:4, width:"fit-content", overflowX:"auto" }}>
          {[{id:"assignments",label:"📋 Assignments"},{id:"grades",label:"📊 Grades"},{id:"tutor",label:"🤖 AI Tutor",badge:"📸"},{id:"notes",label:"📝 Notes"}].map(t=>(
            <button key={t.id} className={"tab-btn"+(tab===t.id?" active":"")} onClick={()=>setTab(t.id)}>
              {t.label}
              {t.badge&&<span style={{ background:"rgba(34,211,238,0.12)", border:"1px solid rgba(34,211,238,0.25)", color:"#22d3ee", borderRadius:6, padding:"1px 7px", fontSize:9, fontWeight:800 }}>{t.badge} FILES</span>}
            </button>
          ))}
        </div>

        {/* Assignments */}
        {tab==="assignments"&&(
          <div className="fade-up">
            {!proStatus&&<div style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:12, padding:"10px 16px", marginBottom:14, display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:8 }}>
              <div style={{ fontSize:12, color:"#64748b" }}>Monthly assignments: <strong style={{ color:assignUsage.remaining===0?"#ef4444":assignUsage.remaining===1?"#f59e0b":"#22c55e" }}>{assignUsage.count}/{assignUsage.limit} used</strong></div>
              <div style={{ display:"flex", gap:6 }}>{Array.from({length:assignUsage.limit}).map((_,i)=><div key={i} style={{ width:24,height:8,borderRadius:4,background:i<assignUsage.count?"#6366f1":"rgba(255,255,255,0.1)" }}/>)}</div>
              {assignUsage.remaining===0 ? <button className="btn-upgrade" style={{ fontSize:11,padding:"5px 12px" }} onClick={()=>showUpgrade("assignments")}>👑 Upgrade for unlimited</button> : <div style={{ fontSize:11,color:"#334155" }}>Resets next month</div>}
            </div>}

            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14, flexWrap:"wrap", gap:10 }}>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                {["All",...SUBJECTS].map(s=>{ const active=filterSub===s,c=SUB_CLR[s]||"#818cf8"; return <button key={s} className="chip" onClick={()=>setFilterSub(s)} style={{ borderColor:active?c+"99":"transparent", background:active?c+"1a":"transparent", color:active?c:"#475569" }}>{s}</button>; })}
              </div>
              <button className={assignUsage.allowed||proStatus?"btn-p":"btn-upgrade"} onClick={()=>setShowAdd(true)}>
                {!assignUsage.allowed&&!proStatus?"👑 Upgrade to Add":"+ Add Assignment"}
              </button>
            </div>

            {pending.length===0&&done.length===0&&<div className="card" style={{ padding:52,textAlign:"center" }}><div style={{ fontSize:52,marginBottom:12 }}>🎉</div><div style={{ fontSize:19,fontWeight:800,marginBottom:6 }}>No assignments yet!</div><div style={{ fontSize:14,color:"#475569" }}>Add one and we'll email <strong style={{ color:"#818cf8" }}>{user?.email}</strong> a reminder the day before.</div></div>}

            {pending.length>0&&<><div style={{ fontSize:10,fontWeight:800,color:"#334155",letterSpacing:1.5,marginBottom:10 }}>UPCOMING</div>
              {pending.map(a=>{ const days=daysUntil(a.dueDate),sc=SUB_CLR[a.subject]||"#94a3b8",dc=days<0?"#ef4444":days<=1?"#f59e0b":days<=3?"#fcd34d":"#475569",dl=days<0?(Math.abs(days)+"d overdue"):days===0?"Due today!":days===1?"Due tomorrow!":(days+" days left"); return (
                <div key={a.id} className="arow" style={{ borderLeftColor:sc }}>
                  <div className={"chk"+(a.completed?" done":"")} onClick={()=>toggleDone(a.id)}>{a.completed&&<span style={{ color:"#fff",fontSize:13 }}>✓</span>}</div>
                  <div style={{ flex:1,minWidth:0 }}><div style={{ fontWeight:800,fontSize:15,marginBottom:4 }}>{a.title}</div>{a.notes&&<div style={{ fontSize:12,color:"#475569",marginBottom:6,lineHeight:1.5 }}>{a.notes}</div>}<div style={{ display:"flex",gap:8,alignItems:"center",flexWrap:"wrap" }}><span style={{ fontSize:11,fontWeight:700,color:sc,fontFamily:"'JetBrains Mono',monospace" }}>{a.subject}</span><span style={{ fontSize:11,fontWeight:700,color:priClr(a.priority),background:priClr(a.priority)+"18",borderRadius:20,padding:"2px 9px",border:"1px solid "+priClr(a.priority)+"33" }}>{a.priority}</span></div></div>
                  <div style={{ textAlign:"right",flexShrink:0 }}>
                    <div style={{ color:dc,fontWeight:800,fontSize:13,marginBottom:3 }}>{dl}</div>
                    <div style={{ color:"#334155",fontSize:11,marginBottom:8 }}>{fmtDate(a.dueDate)}</div>
                    {a.grade!==undefined&&a.grade!==""&&a.grade!==null?(
                      <div style={{ display:"flex",gap:6,alignItems:"center",justifyContent:"flex-end",marginBottom:6 }}>
                        <span style={{ background:gradeColor(a.grade)+"22",border:"1px solid "+gradeColor(a.grade)+"55",color:gradeColor(a.grade),borderRadius:8,padding:"3px 10px",fontSize:13,fontWeight:900 }}>{gradeLetter(a.grade)} · {a.grade}%</span>
                        <button onClick={()=>{setShowGradeFor(a.id);setGradeInput(String(a.grade));}} style={{ background:"transparent",border:"1px solid rgba(255,255,255,0.1)",color:"#64748b",borderRadius:6,padding:"3px 8px",fontSize:11,cursor:"pointer",fontFamily:"inherit" }}>edit</button>
                      </div>
                    ):(
                      <button onClick={()=>{setShowGradeFor(a.id);setGradeInput("");}} style={{ background:"rgba(99,102,241,0.1)",border:"1px solid rgba(99,102,241,0.25)",color:"#a5b4fc",borderRadius:8,padding:"5px 12px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",marginBottom:6,display:"block",width:"100%" }}>+ Log Grade</button>
                    )}
                    <button className="btn-d" onClick={()=>delAssign(a.id)}>✕ Remove</button>
                  </div>
                </div>
              );})}
            </>}
            {done.length>0&&<><div style={{ fontSize:10,fontWeight:800,color:"#1e293b",letterSpacing:1.5,margin:"22px 0 10px" }}>COMPLETED</div>
              {done.map(a=><div key={a.id} className="arow" style={{ opacity:.4,borderLeftColor:"#1e293b" }}><div className="chk done" onClick={()=>toggleDone(a.id)}><span style={{ color:"#fff",fontSize:13 }}>✓</span></div><div style={{ flex:1 }}><span style={{ fontWeight:700,textDecoration:"line-through",color:"#334155" }}>{a.title}</span></div><button className="btn-d" onClick={()=>delAssign(a.id)}>✕</button></div>)}
            </>}
          </div>
        )}

        {tab==="tutor"&&<div className="fade-up"><ChatAssistant user={user} assignments={assignments} onLimitHit={showUpgrade}/></div>}

        {/* Notes */}
        {tab==="grades"&&(
          <div className="fade-up">
            <GradesTab assignments={assignments}/>
          </div>
        )}

        {tab==="notes"&&(
          <div className="fade-up">
            {!proStatus&&<div style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:12, padding:"10px 16px", marginBottom:14, display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:8 }}>
              <div style={{ fontSize:12, color:"#64748b" }}>Monthly notes: <strong style={{ color:noteUsage.remaining===0?"#ef4444":noteUsage.remaining===1?"#f59e0b":"#22c55e" }}>{noteUsage.count}/{noteUsage.limit} used</strong></div>
              <div style={{ display:"flex", gap:6 }}>{Array.from({length:noteUsage.limit}).map((_,i)=><div key={i} style={{ width:24,height:8,borderRadius:4,background:i<noteUsage.count?"#6366f1":"rgba(255,255,255,0.1)" }}/>)}</div>
              {noteUsage.remaining===0 ? <button className="btn-upgrade" style={{ fontSize:11,padding:"5px 12px" }} onClick={()=>showUpgrade("notes")}>👑 Upgrade for unlimited</button> : <div style={{ fontSize:11,color:"#334155" }}>Resets next month</div>}
            </div>}

            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
              <div style={{ fontSize:14,color:"#475569" }}>{notes.length} notes · tap any to use AI</div>
              <button className={noteUsage.allowed||proStatus?"btn-p":"btn-upgrade"} onClick={()=>setShowNote(true)}>
                {!noteUsage.allowed&&!proStatus?"👑 Upgrade to Add":"+ Add Note"}
              </button>
            </div>

            {notes.length===0?<div className="card" style={{ padding:52,textAlign:"center" }}><div style={{ fontSize:52,marginBottom:12 }}>📝</div><div style={{ fontSize:19,fontWeight:800,marginBottom:6 }}>No notes yet</div><div style={{ fontSize:14,color:"#475569" }}>Add your class notes and let AI summarize or create a study guide!</div></div>:(
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(265px,1fr))", gap:14 }}>
                {notes.slice().sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).map(n=>{ const c=SUB_CLR[n.subject]||"#94a3b8"; return (
                  <div key={n.id} className="card" style={{ padding:18,cursor:"pointer",borderLeft:"3px solid "+c }} onClick={()=>{ setSelNote(n);setAiRes(null);setAiMode(null); }}>
                    <div style={{ fontWeight:800,fontSize:15,marginBottom:6 }}>{n.title}</div>
                    <div style={{ fontSize:12,color:"#475569",lineHeight:1.65,marginBottom:10,display:"-webkit-box",WebkitLineClamp:3,WebkitBoxOrient:"vertical",overflow:"hidden" }}>{n.content}</div>
                    <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10 }}><span style={{ fontSize:11,color:c,fontWeight:700 }}>{n.subject}</span><span style={{ fontSize:11,color:"#1e293b" }}>{fmtDate(n.createdAt?.split("T")[0])}</span></div>
                    <div style={{ background:"rgba(99,102,241,.1)",borderRadius:8,padding:"5px 10px",fontSize:11,color:"#818cf8",fontWeight:700 }}>✨ Tap to summarize or make study guide</div>
                  </div>
                );})}
              </div>
            )}
          </div>
        )}
      </main>

      {showAdd&&<div className="overlay" onClick={e=>e.target===e.currentTarget&&setShowAdd(false)}><div className="modal">
        <h2 style={{ fontWeight:900,fontSize:22,marginBottom:6 }}>Add Assignment</h2>
        <p style={{ fontSize:13,color:"#475569",marginBottom:20 }}>
          Reminder → <strong style={{ color:"#818cf8" }}>{user?.email}</strong>
          {!proStatus&&<span style={{ color:assignUsage.remaining===0?"#ef4444":"#22c55e" }}> · {assignUsage.remaining} left this month</span>}
        </p>

        <div className="field"><label className="lbl">Title *</label><input placeholder="e.g. Chapter 5 Essay" value={aForm.title} onChange={e=>setAForm(p=>({...p,title:e.target.value}))}/></div>

        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
          <div className="field"><label className="lbl">Subject</label><select value={aForm.subject} onChange={e=>setAForm(p=>({...p,subject:e.target.value}))}>{SUBJECTS.map(s=><option key={s}>{s}</option>)}</select></div>
          <div className="field"><label className="lbl">Priority</label><select value={aForm.priority} onChange={e=>setAForm(p=>({...p,priority:e.target.value}))}><option>High</option><option>Medium</option><option>Low</option></select></div>
        </div>

        <div className="field"><label className="lbl">Due Date *</label><input type="date" value={aForm.dueDate} onChange={e=>setAForm(p=>({...p,dueDate:e.target.value}))}/></div>

        {/* Reminder timing */}
        <div className="field">
          <label className="lbl">📧 Send Reminder Email</label>
          <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom: aForm.reminderDays==="custom"?10:0 }}>
            {[
              {val:1, label:"1 day before"},
              {val:2, label:"2 days before"},
              {val:3, label:"3 days before"},
              {val:5, label:"5 days before"},
              {val:"custom", label:"Custom"},
            ].map(opt=>(
              <button key={opt.val} onClick={()=>setAForm(p=>({...p, reminderDays:opt.val, customDays:""}))}
                style={{ padding:"8px 14px", borderRadius:20, border:"1.5px solid "+(aForm.reminderDays===opt.val?"#6366f1":"rgba(255,255,255,0.1)"), background:aForm.reminderDays===opt.val?"rgba(99,102,241,0.18)":"rgba(255,255,255,0.04)", color:aForm.reminderDays===opt.val?"#a5b4fc":"#64748b", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit", transition:"all .18s" }}>
                {opt.label}
              </button>
            ))}
          </div>
          {aForm.reminderDays==="custom" && (
            <div style={{ display:"flex", alignItems:"center", gap:10, marginTop:8 }}>
              <input
                type="number" min="1" max="365"
                placeholder="Enter number of days..."
                value={aForm.customDays}
                onChange={e=>setAForm(p=>({...p,customDays:e.target.value}))}
                style={{ flex:1 }}
              />
              <span style={{ fontSize:13, color:"#64748b", whiteSpace:"nowrap" }}>days before</span>
            </div>
          )}
        </div>

        <div className="field"><label className="lbl">Notes (optional)</label><textarea placeholder="Any extra details..." value={aForm.notes} onChange={e=>setAForm(p=>({...p,notes:e.target.value}))} style={{ minHeight:60 }}/></div>

        <div style={{ display:"flex",gap:10,justifyContent:"flex-end" }}>
          <button className="btn-g" onClick={()=>setShowAdd(false)}>Cancel</button>
          <button className="btn-p" onClick={addAssignment}>Add &amp; Schedule Reminder 📧</button>
        </div>
      </div></div>}

      {showNote&&<div className="overlay" onClick={e=>e.target===e.currentTarget&&setShowNote(false)}><div className="modal">
        <h2 style={{ fontWeight:900,fontSize:22,marginBottom:6 }}>New Note</h2>
        {!proStatus&&<p style={{ fontSize:13,color:"#475569",marginBottom:20 }}><strong style={{ color:noteUsage.remaining===0?"#ef4444":"#22c55e" }}>{noteUsage.remaining} notes left this month</strong></p>}
        <div className="field"><label className="lbl">Title *</label><input placeholder="e.g. Biology — Cells" value={nForm.title} onChange={e=>setNForm(p=>({...p,title:e.target.value}))}/></div>
        <div className="field"><label className="lbl">Subject</label><select value={nForm.subject} onChange={e=>setNForm(p=>({...p,subject:e.target.value}))}>{SUBJECTS.map(s=><option key={s}>{s}</option>)}</select></div>
        <div className="field"><label className="lbl">Content *</label><textarea placeholder="Paste or type your class notes here..." value={nForm.content} onChange={e=>setNForm(p=>({...p,content:e.target.value}))} style={{ minHeight:150 }}/></div>
        <div style={{ display:"flex",gap:10,justifyContent:"flex-end" }}>
          <button className="btn-g" onClick={()=>setShowNote(false)}>Cancel</button>
          <button className="btn-p" onClick={addNote}>Save Note</button>
        </div>
      </div></div>}

      {showGradeFor&&(()=>{
        const ga = assignments.find(a=>a.id===showGradeFor);
        if (!ga) return null;
        const sc = SUB_CLR[ga.subject]||"#94a3b8";
        const saveGrade = () => {
          const v = gradeInput.trim();
          if (v==="") {
            setAssignments(p=>p.map(a=>a.id===showGradeFor?{...a,grade:null}:a));
          } else {
            const n = parseFloat(v);
            if (isNaN(n)||n<0||n>100) { alert("Please enter a number between 0 and 100."); return; }
            setAssignments(p=>p.map(a=>a.id===showGradeFor?{...a,grade:n}:a));
          }
          setShowGradeFor(null); setGradeInput("");
          toast("Grade saved! 📊");
        }
        return (
          <div className="overlay" onClick={e=>e.target===e.currentTarget&&(setShowGradeFor(null),setGradeInput(""))}>
            <div className="modal" style={{ maxWidth:400 }}>
              <div style={{ display:"flex",alignItems:"center",gap:12,marginBottom:20 }}>
                <div style={{ width:42,height:42,borderRadius:12,background:sc+"22",border:"1px solid "+sc+"44",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22 }}>📊</div>
                <div>
                  <div style={{ fontWeight:900,fontSize:17,marginBottom:2 }}>Log Grade</div>
                  <div style={{ fontSize:12,color:"#64748b" }}>{ga.title}</div>
                </div>
              </div>
              <div style={{ background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:12,padding:"12px 16px",marginBottom:20,display:"flex",gap:16,alignItems:"center" }}>
                <div><div style={{ fontSize:10,color:"#475569",fontWeight:700,letterSpacing:.6,textTransform:"uppercase",marginBottom:3 }}>Subject</div><div style={{ fontSize:13,color:sc,fontWeight:700 }}>{ga.subject}</div></div>
                <div><div style={{ fontSize:10,color:"#475569",fontWeight:700,letterSpacing:.6,textTransform:"uppercase",marginBottom:3 }}>Due</div><div style={{ fontSize:13,color:"#94a3b8" }}>{fmtDate(ga.dueDate)}</div></div>
                <div><div style={{ fontSize:10,color:"#475569",fontWeight:700,letterSpacing:.6,textTransform:"uppercase",marginBottom:3 }}>Priority</div><div style={{ fontSize:13,color:priClr(ga.priority),fontWeight:700 }}>{ga.priority}</div></div>
              </div>

              {/* Grade input */}
              <div className="field">
                <label className="lbl">Grade (0–100) *</label>
                <div style={{ position:"relative" }}>
                  <input
                    type="number" min="0" max="100" step="0.1"
                    placeholder="e.g. 87"
                    value={gradeInput}
                    autoFocus
                    onChange={e=>setGradeInput(e.target.value)}
                    onKeyDown={e=>e.key==="Enter"&&saveGrade()}
                    style={{ paddingRight:80, fontFamily:"'JetBrains Mono',monospace", fontSize:18, fontWeight:700 }}
                  />
                  {gradeInput.trim()&&!isNaN(parseFloat(gradeInput))&&(
                    <div style={{ position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",display:"flex",alignItems:"center",gap:8 }}>
                      <span style={{ fontSize:13,fontWeight:800,color:gradeColor(parseFloat(gradeInput)) }}>{gradeLetter(parseFloat(gradeInput))}</span>
                      <span style={{ fontSize:11,color:gradeColor(parseFloat(gradeInput)),fontWeight:700,background:gradeColor(parseFloat(gradeInput))+"22",borderRadius:6,padding:"2px 7px" }}>{parseFloat(gradeInput)}%</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Grade scale reference */}
              <div style={{ display:"flex",gap:6,marginBottom:20,flexWrap:"wrap" }}>
                {[{l:"A",r:"90–100",c:"#22c55e"},{l:"B",r:"80–89",c:"#84cc16"},{l:"C",r:"70–79",c:"#f59e0b"},{l:"D",r:"60–69",c:"#f97316"},{l:"F",r:"0–59",c:"#ef4444"}].map(g=>(
                  <div key={g.l} style={{ flex:1,textAlign:"center",background:g.c+"11",border:"1px solid "+g.c+"33",borderRadius:8,padding:"5px 0" }}>
                    <div style={{ fontSize:14,fontWeight:900,color:g.c }}>{g.l}</div>
                    <div style={{ fontSize:9,color:"#475569",fontWeight:600 }}>{g.r}</div>
                  </div>
                ))}
              </div>

              <div style={{ display:"flex",gap:10,justifyContent:"flex-end" }}>
                <button className="btn-g" onClick={()=>{setShowGradeFor(null);setGradeInput("");}}>Cancel</button>
                {ga.grade!==null&&ga.grade!==undefined&&<button className="btn-d" onClick={()=>{setAssignments(p=>p.map(a=>a.id===showGradeFor?{...a,grade:null}:a));setShowGradeFor(null);setGradeInput("");toast("Grade removed.");}}>Remove Grade</button>}
                <button className="btn-p" onClick={saveGrade}>Save Grade 📊</button>
              </div>
            </div>
          </div>
        );
      })()}



      {selNote&&<div className="overlay" onClick={e=>e.target===e.currentTarget&&(setSelNote(null),setAiRes(null))}><div className="modal" style={{ maxWidth:600 }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14 }}>
          <div><h2 style={{ fontWeight:900,fontSize:20 }}>{selNote.title}</h2><span style={{ fontSize:12,color:SUB_CLR[selNote.subject]||"#94a3b8",fontWeight:700 }}>{selNote.subject}</span></div>
          <button className="btn-g" style={{ padding:"5px 10px",fontSize:18 }} onClick={()=>{setSelNote(null);setAiRes(null);}}>×</button>
        </div>
        <div style={{ background:"rgba(255,255,255,.03)",borderRadius:10,padding:14,fontSize:13,lineHeight:1.75,color:"#94a3b8",maxHeight:180,overflowY:"auto",marginBottom:16,whiteSpace:"pre-wrap" }}>{selNote.content}</div>
        <div style={{ display:"flex",gap:10,marginBottom:16 }}>
          <button className="btn-p" style={{ flex:1 }} onClick={()=>runAI(selNote,"summary")} disabled={aiLoad}>✨ Summarize</button>
          <button className="btn-p" style={{ flex:1,background:"linear-gradient(135deg,#0891b2,#0e7490)" }} onClick={()=>runAI(selNote,"guide")} disabled={aiLoad}>📖 Study Guide</button>
          <button className="btn-d" onClick={()=>delNote(selNote.id)}>🗑</button>
        </div>
        {aiLoad&&<div style={{ textAlign:"center",padding:28,color:"#818cf8" }}><div style={{ fontSize:32,display:"inline-block",animation:"spin 1.2s linear infinite" }}>✦</div><div style={{ marginTop:10,fontWeight:700 }}>Claude is {aiMode==="summary"?"summarizing":"building your study guide"}…</div></div>}
        {aiRes&&!aiLoad&&<div style={{ background:aiMode==="summary"?"rgba(99,102,241,.08)":"rgba(8,145,178,.08)",border:"1px solid "+(aiMode==="summary"?"rgba(99,102,241,.22)":"rgba(8,145,178,.22)"),borderRadius:12,padding:16 }}>
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:8 }}>
            <div style={{ fontSize:10,fontWeight:800,letterSpacing:1.5,color:aiMode==="summary"?"#818cf8":"#22d3ee" }}>{aiMode==="summary"?"✨ AI SUMMARY":"📖 STUDY GUIDE"}</div>
            {aiMode==="guide"&&(
              <div style={{ display:"flex",gap:8 }}>
                <button
                  onClick={()=>printStudyGuide(selNote,aiRes,"guide")}
                  style={{ display:"flex",alignItems:"center",gap:6,background:"rgba(8,145,178,0.15)",border:"1px solid rgba(8,145,178,0.35)",color:"#22d3ee",borderRadius:8,padding:"6px 14px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",transition:"all .18s" }}
                  onMouseOver={e=>{e.currentTarget.style.background="rgba(8,145,178,0.28)";}}
                  onMouseOut={e=>{e.currentTarget.style.background="rgba(8,145,178,0.15)";}}
                >
                  <span>🖨️</span> Print
                </button>
                <button
                  onClick={()=>printStudyGuide(selNote,aiRes,"guide")}
                  style={{ display:"flex",alignItems:"center",gap:6,background:"rgba(239,68,68,0.12)",border:"1px solid rgba(239,68,68,0.3)",color:"#f87171",borderRadius:8,padding:"6px 14px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",transition:"all .18s" }}
                  onMouseOver={e=>{e.currentTarget.style.background="rgba(239,68,68,0.22)";}}
                  onMouseOut={e=>{e.currentTarget.style.background="rgba(239,68,68,0.12)";}}
                >
                  <span>📄</span> Save as PDF
                </button>
              </div>
            )}
            {aiMode==="summary"&&(
              <button
                onClick={()=>printStudyGuide(selNote,aiRes,"summary")}
                style={{ display:"flex",alignItems:"center",gap:6,background:"rgba(99,102,241,0.15)",border:"1px solid rgba(99,102,241,0.35)",color:"#a5b4fc",borderRadius:8,padding:"6px 14px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",transition:"all .18s" }}
                onMouseOver={e=>{e.currentTarget.style.background="rgba(99,102,241,0.28)";}}
                onMouseOut={e=>{e.currentTarget.style.background="rgba(99,102,241,0.15)";}}
              >
                <span>🖨️</span> Print / Save PDF
              </button>
            )}
          </div>
          <div style={{ fontSize:13,lineHeight:1.8,color:"#cbd5e1",maxHeight:290,overflowY:"auto",whiteSpace:"pre-wrap" }}>{aiRes}</div>
        </div>}
      </div></div>}
    </div>
  );
}
