import { useState, useEffect, useRef } from "react";
import { fetchWorks, saveWork, deleteWork, fetchSettings, saveSettings as saveSettingsToFirebase, incrementVisitorCount, adjustWorkLike } from "./firebase.js";

const STORAGE_KEY = "kids-portfolio-v2";
const SETTINGS_KEY = "kids-portfolio-settings";
const ADMIN_KEY = "kids-portfolio-admin";
const LIKED_KEY = "kids-portfolio-liked-works";
const ADMIN_PASSWORD = "raina2026"; // 👈 원하는 비밀번호로 바꾸세요

function getLikedWorkIds() {
  try {
    const raw = localStorage.getItem(LIKED_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}
function saveLikedWorkIds(set) {
  try { localStorage.setItem(LIKED_KEY, JSON.stringify([...set])); } catch {}
}

// Resize + compress an image so it stays well under Firestore's 1MB document limit.
// Scales down to maxDimension on the longest side and re-encodes as JPEG.
function compressImage(dataUrl, maxDimension = 1280, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

const DEFAULT_SETTINGS = {
  bgColor: "#ffffff",
  raina: { emoji: "", color: "#e8547a", gradient2: "#f472b6" },
  jaina: { emoji: "", color: "#f59e0b", gradient2: "#fbbf24" },
};

function hexToLight(hex) { return hex + "12"; }
function hexToBorder(hex) { return hex + "30"; }
function buildTheme(key, settings) {
  const s = settings[key];
  return {
    name: key.charAt(0).toUpperCase() + key.slice(1),
    emoji: s.emoji, color: s.color,
    light: hexToLight(s.color),
    gradient: `linear-gradient(135deg, ${s.color}, ${s.gradient2})`,
    border: hexToBorder(s.color),
  };
}

const TAGS = ["Photo", "Drawing", "Writing", "Craft", "Other"];
const TAG_COLORS = { Drawing: "#FFD6A5", Writing: "#CAFFBF", Photo: "#A0C4FF", Craft: "#FFC6FF", Other: "#F0F0F0" };
const EMOJI_PRESETS = ["🌸","🌊","⭐","🦋","🐱","🐶","🦊","🐸","🌈","🍀","🎨","🎵","🚀","🏆","💎","🍓","🌻","🦄","🐣","🎀"];
const COLOR_PRESETS = ["#e8547a","#3b82f6","#a78bfa","#10b981","#f97316","#ef4444","#06b6d4","#eab308","#8b5cf6","#ec4899"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS = ["S","M","T","W","T","F","S"];

function formatDate(iso) {
  const d = new Date(iso);
  return `${MONTHS[d.getMonth()].slice(0,3)} ${d.getDate()}, ${d.getFullYear()}`;
}
function toDateKey(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function TagPill({ tag }) {
  return (
    <span style={{
      background: TAG_COLORS[tag] || "#F0F0F0",
      color: "#444", borderRadius: 4, padding: "2px 8px",
      fontSize: 10, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase",
    }}>{tag}</span>
  );
}

// ── Work Card ──────────────────────────────────────────────────
function WorkCard({ work, theme, onClick, onToggleLike, isLiked }) {
  const [hovered, setHovered] = useState(false);
  const likeCount = work.likeCount || 0;

  return (
    <div style={{ breakInside: "avoid", marginBottom: 12 }}>
      <div
        onClick={() => onClick(work)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          cursor: "pointer", borderRadius: 12, overflow: "hidden",
          position: "relative", display:"inline-block", width:"100%",
          background: "#f5f5f5",
          boxShadow: hovered ? "0 16px 40px rgba(0,0,0,0.15)" : "0 2px 8px rgba(0,0,0,0.06)",
          transform: hovered ? "translateY(-3px)" : "translateY(0)",
          transition: "all 0.25s ease",
        }}
      >
        {work.imageUrl
          ? <img src={work.imageUrl} alt={work.title} style={{ width:"100%", height:"auto", display:"block", transition:"transform 0.4s ease", transform: hovered ? "scale(1.04)" : "scale(1)" }}/>
          : <div style={{ width:"100%", aspectRatio:"4/3", background:`linear-gradient(145deg, ${theme.light}, #f9f9f9)`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:36, color: theme.color+"88" }}>✏️</div>
        }

        {/* Overlay */}
        <div style={{
          position:"absolute", inset:0,
          background: `linear-gradient(to top, ${theme.color}ee 0%, ${theme.color}44 50%, transparent 100%)`,
          opacity: hovered ? 1 : 0,
          transition: "opacity 0.25s ease",
          display:"flex", flexDirection:"column", justifyContent:"flex-end", padding:"16px 14px",
        }}>
          <div style={{ color:"#fff", fontWeight:700, fontSize:14, lineHeight:1.3, marginBottom:4 }}>{work.title}</div>
          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
            <TagPill tag={work.tag}/>
            <span style={{ color:"rgba(255,255,255,0.75)", fontSize:11, marginLeft:"auto" }}>{formatDate(work.date)}</span>
          </div>
        </div>

        {/* Always-visible tag dot */}
        <div style={{
          position:"absolute", top:10, right:10,
          width:8, height:8, borderRadius:"50%",
          background: TAG_COLORS[work.tag] || "#ccc",
          opacity: hovered ? 0 : 1,
          transition: "opacity 0.2s",
          boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
        }}/>

        {/* Heart like button */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleLike(work); }}
          style={{
            position:"absolute", bottom:8, right:8,
            width:28, height:28, borderRadius:"50%",
            border:"none", cursor:"pointer",
            background: "rgba(255,255,255,0.9)",
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:14, boxShadow:"0 1px 6px rgba(0,0,0,0.2)",
            transition:"transform 0.15s",
          }}
          onMouseDown={e=>e.currentTarget.style.transform="scale(0.85)"}
          onMouseUp={e=>e.currentTarget.style.transform="scale(1)"}
        >
          {isLiked ? "❤️" : "🤍"}
        </button>
      </div>

      {/* Caption — like a photo footnote */}
      <div style={{ fontSize:11, color:"#aaa", marginTop:5, padding:"0 2px", lineHeight:1.3, display:"flex", justifyContent:"space-between", gap:6 }}>
        <span style={{ whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{work.title}</span>
        {likeCount > 0 && <span style={{ flexShrink:0, color: isLiked ? theme.color : "#ccc" }}>♥ {likeCount}</span>}
      </div>
    </div>
  );
}

// ── Work Detail Modal ──────────────────────────────────────────
function Modal({ work, theme, onClose, onDelete, isAdmin, onToggleLike, isLiked, onPrev, onNext }) {
  const touchStartX = useRef(null);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && onPrev) onPrev();
      else if (e.key === "ArrowRight" && onNext) onNext();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, onPrev, onNext]);

  if (!work) return null;
  const likeCount = work.likeCount || 0;

  const handleTouchStart = (e) => { touchStartX.current = e.touches[0].clientX; };
  const handleTouchEnd = (e) => {
    if (touchStartX.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(delta) > 50) {
      if (delta > 0 && onPrev) onPrev();
      else if (delta < 0 && onNext) onNext();
    }
    touchStartX.current = null;
  };

  const navBtnStyle = {
    position:"absolute", top:12,
    width:30, height:30, borderRadius:"50%", border:"none", cursor:"pointer",
    background:"rgba(0,0,0,0.45)", display:"flex", alignItems:"center", justifyContent:"center",
    fontSize:22, fontWeight:900, color:"#fff", lineHeight:1,
    boxShadow:"0 2px 8px rgba(0,0,0,0.3)", zIndex:1001,
  };

  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000, padding:20, backdropFilter:"blur(4px)" }}>
      <div
        onClick={e=>e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        style={{ background:"#fff", borderRadius:16, maxWidth:720, width:"100%", maxHeight:"92vh", overflowY:"auto", boxShadow:"0 32px 80px rgba(0,0,0,0.25)" }}
      >
        <div style={{ position:"relative" }}>
          {work.imageUrl
            ? <img src={work.imageUrl} alt={work.title} style={{ width:"100%", borderRadius:"16px 16px 0 0", maxHeight:520, objectFit:"cover", display:"block" }}/>
            : <div style={{ height:160, background:`linear-gradient(135deg, ${theme.light}, #f9f9f9)`, borderRadius:"16px 16px 0 0", display:"flex", alignItems:"center", justifyContent:"center", fontSize:48 }}>✏️</div>
          }
          {onPrev && (
            <button onClick={(e)=>{e.stopPropagation(); onPrev();}} style={{ ...navBtnStyle, left:10 }}>‹</button>
          )}
          {onNext && (
            <button onClick={(e)=>{e.stopPropagation(); onNext();}} style={{ ...navBtnStyle, right:10 }}>›</button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onToggleLike(work); }}
            style={{
              position:"absolute", bottom:12, right:12,
              width:42, height:42, borderRadius:"50%",
              border:"none", cursor:"pointer",
              background: "rgba(255,255,255,0.92)",
              display:"flex", alignItems:"center", justifyContent:"center",
              fontSize:20, boxShadow:"0 2px 10px rgba(0,0,0,0.25)",
              transition:"transform 0.15s",
            }}
            onMouseDown={e=>e.currentTarget.style.transform="scale(0.85)"}
            onMouseUp={e=>e.currentTarget.style.transform="scale(1)"}
          >
            {isLiked ? "❤️" : "🤍"}
          </button>
        </div>
        <div style={{ padding:"24px 28px 28px" }}>
          <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12, marginBottom:16 }}>
            <div>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                <TagPill tag={work.tag}/>
                <span style={{ fontSize:12, color:"#aaa" }}>{formatDate(work.date)}</span>
                {likeCount > 0 && <span style={{ fontSize:12, color: theme.color, fontWeight:600 }}>♥ {likeCount}</span>}
              </div>
              <div style={{ fontWeight:700, fontSize:22, color:"#111", lineHeight:1.2, letterSpacing:"-0.3px" }}>{work.title}</div>
            </div>
            <button onClick={onClose} style={{ background:"#f5f5f5", border:"none", borderRadius:8, width:36, height:36, cursor:"pointer", fontSize:16, color:"#888", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
          </div>
          {work.description && (
            <p style={{ fontSize:14, color:"#555", lineHeight:1.7, margin:0, borderTop:"1px solid #f0f0f0", paddingTop:16 }}>{work.description}</p>
          )}
          {isAdmin && (
            <div style={{ marginTop:20, display:"flex", justifyContent:"flex-end" }}>
              <button onClick={()=>{onDelete(work.id);onClose();}} style={{ background:"none", color:"#ccc", border:"1px solid #eee", borderRadius:8, padding:"8px 16px", cursor:"pointer", fontSize:12, fontWeight:500, transition:"all 0.15s" }}
                onMouseEnter={e=>{e.currentTarget.style.color="#e55";e.currentTarget.style.borderColor="#e55";}}
                onMouseLeave={e=>{e.currentTarget.style.color="#ccc";e.currentTarget.style.borderColor="#eee";}}>
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Add Form ───────────────────────────────────────────────────
function AddForm({ childKey, theme, onAdd, onClose, initialDate }) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [title, setTitle] = useState("");
  const [tag, setTag] = useState("Photo");
  const [description, setDescription] = useState("");
  const [previews, setPreviews] = useState([]); // [{id, url}]
  const [compressing, setCompressing] = useState(0); // count of files still processing
  const [workDate, setWorkDate] = useState(initialDate || todayStr);
  const fileRef = useRef();

  const handleFile = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setCompressing(c => c + files.length);
    files.forEach(file => {
      const reader = new FileReader();
      const previewId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      reader.onload = async (ev) => {
        try {
          const compressed = await compressImage(ev.target.result);
          setPreviews(prev => [...prev, { id: previewId, url: compressed }]);
        } catch {
          // Fallback to original if compression fails for some reason
          setPreviews(prev => [...prev, { id: previewId, url: ev.target.result }]);
        } finally {
          setCompressing(c => c - 1);
        }
      };
      reader.readAsDataURL(file);
    });
    // Allow selecting the same files again later if needed
    e.target.value = "";
  };
  const removePreview = (id) => setPreviews(prev => prev.filter(p => p.id !== id));

  const handleSubmit = () => {
    if (!title.trim()) return;
    const dateIso = new Date(workDate + "T12:00:00").toISOString();
    const baseTime = Date.now();
    const uid = () => `${baseTime}-${Math.random().toString(36).slice(2, 8)}`;

    if (previews.length <= 1) {
      onAdd({ id: uid(), title: title.trim(), child: childKey, tag, description: description.trim(), imageUrl: previews[0]?.url || "", date: dateIso });
    } else {
      previews.forEach((p, i) => {
        onAdd({ id: uid(), title: `${title.trim()} ${i+1}`, child: childKey, tag, description: description.trim(), imageUrl: p.url, date: dateIso });
      });
    }
    onClose();
  };

  const inp = { width:"100%", padding:"10px 12px", borderRadius:8, border:"1px solid #e8e8e8", fontSize:14, outline:"none", boxSizing:"border-box", background:"#fafafa", fontFamily:"inherit", color:"#111", transition:"border 0.15s" };

  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000, padding:20, backdropFilter:"blur(4px)" }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:"#fff", borderRadius:16, maxWidth:460, width:"100%", maxHeight:"90vh", overflowY:"auto", boxShadow:"0 32px 80px rgba(0,0,0,0.2)" }}>
        <div style={{ height:4, background:theme.gradient, borderRadius:"16px 16px 0 0" }}/>
        <div style={{ padding:"24px 26px 28px" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:22 }}>
            <div style={{ fontWeight:700, fontSize:16, color:"#111", letterSpacing:"-0.2px" }}>
              New work — <span style={{ color: theme.color }}>{theme.name}</span>
            </div>
            <button onClick={onClose} style={{ background:"none", border:"none", cursor:"pointer", fontSize:18, color:"#ccc" }}>✕</button>
          </div>

          <div style={{ display:"grid", gap:14 }}>
            <div>
              <label style={{ fontSize:11, fontWeight:600, color:"#999", letterSpacing:0.8, textTransform:"uppercase", display:"block", marginBottom:6 }}>
                Title * {previews.length > 1 && <span style={{ color: theme.color, fontWeight:400, textTransform:"none" }}>— will be numbered 1–{previews.length}</span>}
              </label>
              <input style={inp} value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Spring Flower Field"
                onFocus={e=>e.target.style.borderColor=theme.color} onBlur={e=>e.target.style.borderColor="#e8e8e8"}/>
            </div>

            <div>
              <label style={{ fontSize:11, fontWeight:600, color:"#999", letterSpacing:0.8, textTransform:"uppercase", display:"block", marginBottom:6 }}>Date</label>
              <input type="date" style={{...inp, colorScheme:"light"}} value={workDate} onChange={e=>setWorkDate(e.target.value)}
                onFocus={e=>e.target.style.borderColor=theme.color} onBlur={e=>e.target.style.borderColor="#e8e8e8"}/>
            </div>

            <div>
              <label style={{ fontSize:11, fontWeight:600, color:"#999", letterSpacing:0.8, textTransform:"uppercase", display:"block", marginBottom:6 }}>Type</label>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                {TAGS.map(t=>(
                  <button key={t} onClick={()=>setTag(t)} style={{
                    padding:"5px 12px", borderRadius:6, fontSize:12, fontWeight:500, cursor:"pointer",
                    border: `1px solid ${tag===t ? theme.color : "#e8e8e8"}`,
                    background: tag===t ? theme.light : "#fff",
                    color: tag===t ? theme.color : "#888",
                    transition:"all 0.15s",
                  }}>{t}</button>
                ))}
              </div>
            </div>

            <div>
              <label style={{ fontSize:11, fontWeight:600, color:"#999", letterSpacing:0.8, textTransform:"uppercase", display:"block", marginBottom:6 }}>
                Photos {previews.length > 0 && <span style={{ color: theme.color, fontWeight:400, textTransform:"none" }}>— {previews.length} selected</span>}
                {compressing > 0 && <span style={{ color:"#bbb", fontWeight:400, textTransform:"none" }}> · compressing {compressing}…</span>}
              </label>
              <div onClick={()=>fileRef.current.click()} style={{ border:"1.5px dashed #e0e0e0", borderRadius:10, padding: previews.length ? "12px" : "20px", textAlign:"center", cursor:"pointer", background:"#fafafa", transition:"border 0.15s" }}
                onMouseEnter={e=>e.currentTarget.style.borderColor=theme.color} onMouseLeave={e=>e.currentTarget.style.borderColor="#e0e0e0"}>
                {previews.length > 0
                  ? <div style={{ display:"flex", flexWrap:"wrap", gap:8, justifyContent:"center" }}>
                      {previews.map(p => (
                        <div key={p.id} style={{ position:"relative" }} onClick={e=>e.stopPropagation()}>
                          <img src={p.url} alt="preview" style={{ width:64, height:64, borderRadius:6, objectFit:"cover", display:"block" }}/>
                          <button onClick={()=>removePreview(p.id)} style={{ position:"absolute", top:-6, right:-6, width:18, height:18, borderRadius:"50%", background:"#111", color:"#fff", border:"none", fontSize:10, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
                        </div>
                      ))}
                      <div onClick={e=>{e.stopPropagation();fileRef.current.click();}} style={{ width:64, height:64, borderRadius:6, border:"1.5px dashed #ccc", display:"flex", alignItems:"center", justifyContent:"center", color:"#bbb", fontSize:20, cursor:"pointer" }}>+</div>
                    </div>
                  : compressing > 0
                    ? <div style={{ color:"#bbb", fontSize:13 }}>Compressing…</div>
                    : <div style={{ color:"#ccc", fontSize:13 }}>Click to upload — select multiple photos at once</div>
                }
              </div>
              <input ref={fileRef} type="file" accept="image/*" multiple style={{ display:"none" }} onChange={handleFile}/>
            </div>

            <div>
              <label style={{ fontSize:11, fontWeight:600, color:"#999", letterSpacing:0.8, textTransform:"uppercase", display:"block", marginBottom:6 }}>Notes</label>
              <textarea style={{...inp, resize:"vertical", minHeight:70}} value={description} onChange={e=>setDescription(e.target.value)} placeholder="About this work…"
                onFocus={e=>e.target.style.borderColor=theme.color} onBlur={e=>e.target.style.borderColor="#e8e8e8"}/>
            </div>
          </div>

          <div style={{ display:"flex", gap:8, marginTop:22 }}>
            <button onClick={onClose} style={{ flex:1, padding:"11px", borderRadius:8, border:"1px solid #e8e8e8", background:"#fff", color:"#aaa", fontWeight:500, cursor:"pointer", fontSize:13, fontFamily:"inherit" }}>Cancel</button>
            <button onClick={handleSubmit} disabled={!title.trim() || compressing > 0} style={{ flex:2, padding:"11px", borderRadius:8, border:"none", background:(!title.trim()||compressing>0)?"#f0f0f0":theme.gradient, color:(!title.trim()||compressing>0)?"#bbb":"#fff", fontWeight:600, cursor:(!title.trim()||compressing>0)?"not-allowed":"pointer", fontSize:13, fontFamily:"inherit", letterSpacing:0.2 }}>
              {compressing > 0 ? "Compressing…" : previews.length > 1 ? `Save ${previews.length} works` : "Save work"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Calendar ───────────────────────────────────────────────────
function CalendarView({ works, themes, onClose, onAdd, isAdmin, onToggleLike, likedIds }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [addChild, setAddChild] = useState(null);

  const worksByDate = {};
  works.forEach(w => {
    const key = toDateKey(w.date);
    if (!worksByDate[key]) worksByDate[key] = [];
    worksByDate[key].push(w);
  });

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayKey = toDateKey(new Date().toISOString());
  const prevMonth = () => { if(month===0){setYear(y=>y-1);setMonth(11);}else setMonth(m=>m-1); setSelectedDate(null); };
  const nextMonth = () => { if(month===11){setYear(y=>y+1);setMonth(0);}else setMonth(m=>m+1); setSelectedDate(null); };

  const selectedKey = selectedDate ? `${year}-${String(month+1).padStart(2,"0")}-${String(selectedDate).padStart(2,"0")}` : null;
  const selectedWorks = selectedKey ? (worksByDate[selectedKey] || []) : [];
  const selectedWorkIndex = selectedWorks.findIndex(w => w.id === selectedId);
  const selectedWork = selectedWorkIndex >= 0 ? selectedWorks[selectedWorkIndex] : null;
  const goPrev = selectedWorkIndex > 0 ? () => setSelectedId(selectedWorks[selectedWorkIndex - 1].id) : null;
  const goNext = selectedWorkIndex >= 0 && selectedWorkIndex < selectedWorks.length - 1 ? () => setSelectedId(selectedWorks[selectedWorkIndex + 1].id) : null;
  const getTheme = w => w.child==="raina" ? themes.raina : themes.jaina;

  const cells = [];
  for (let i=0;i<firstDay;i++) cells.push(null);
  for (let d=1;d<=daysInMonth;d++) cells.push(d);

  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:900, padding:20, backdropFilter:"blur(4px)" }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:"#fff", borderRadius:16, maxWidth:680, width:"100%", maxHeight:"90vh", overflowY:"auto", boxShadow:"0 32px 80px rgba(0,0,0,0.2)" }}>
        <div style={{ padding:"24px 28px 0" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:24 }}>
            <div style={{ display:"flex", alignItems:"center", gap:16 }}>
              <button onClick={prevMonth} style={{ background:"none", border:"1px solid #eee", borderRadius:8, width:32, height:32, cursor:"pointer", fontSize:16, color:"#888", display:"flex", alignItems:"center", justifyContent:"center" }}>‹</button>
              <div style={{ fontWeight:700, fontSize:17, color:"#111", letterSpacing:"-0.3px", minWidth:160, textAlign:"center" }}>{MONTHS[month]} {year}</div>
              <button onClick={nextMonth} style={{ background:"none", border:"1px solid #eee", borderRadius:8, width:32, height:32, cursor:"pointer", fontSize:16, color:"#888", display:"flex", alignItems:"center", justifyContent:"center" }}>›</button>
            </div>
            <button onClick={onClose} style={{ background:"none", border:"none", cursor:"pointer", fontSize:18, color:"#ccc" }}>✕</button>
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:2, marginBottom:4 }}>
            {DAYS.map((d,i)=><div key={i} style={{ textAlign:"center", fontSize:11, fontWeight:600, color:"#ccc", padding:"6px 0", letterSpacing:0.5 }}>{d}</div>)}
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:2, marginBottom:24 }}>
            {cells.map((day,i)=>{
              if(!day) return <div key={`e${i}`}/>;
              const key=`${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
              const dw=worksByDate[key]||[];
              const isToday=key===todayKey;
              const isSel=day===selectedDate;
              const hasR=dw.some(w=>w.child==="raina");
              const hasJ=dw.some(w=>w.child==="jaina");
              return (
                <div key={day} onClick={()=>setSelectedDate(day===selectedDate?null:day)} style={{
                  borderRadius:8, padding:"8px 4px 6px", textAlign:"center", cursor:"pointer", minHeight:48,
                  background: isSel?"#111": isToday?"#f5f5f5":"transparent",
                  border:`1px solid ${isSel?"#111":isToday?"#ddd":"transparent"}`,
                  transition:"all 0.15s",
                }}>
                  <div style={{ fontSize:13, fontWeight:isSel||isToday?700:400, color:isSel?"#fff":isToday?"#111":"#444", marginBottom:4 }}>{day}</div>
                  <div style={{ display:"flex", justifyContent:"center", gap:2 }}>
                    {hasR&&<div style={{ width:5, height:5, borderRadius:"50%", background:isSel?"rgba(255,255,255,0.7)":themes.raina.color }}/>}
                    {hasJ&&<div style={{ width:5, height:5, borderRadius:"50%", background:isSel?"rgba(255,255,255,0.5)":themes.jaina.color }}/>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {selectedDate && (
          <div style={{ borderTop:"1px solid #f0f0f0", padding:"20px 28px 28px" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16, flexWrap:"wrap", gap:10 }}>
              <div style={{ fontSize:13, fontWeight:600, color:"#111" }}>
                {MONTHS[month]} {selectedDate} · <span style={{ color:"#aaa", fontWeight:400 }}>{selectedWorks.length} work{selectedWorks.length!==1?"s":""}</span>
              </div>
              {isAdmin && (
                <div style={{ display:"flex", gap:6 }}>
                  <button onClick={()=>setAddChild("raina")} style={{ background:themes.raina.light, color:themes.raina.color, border:`1px solid ${themes.raina.border}`, borderRadius:8, padding:"6px 14px", fontSize:12, fontWeight:600, cursor:"pointer" }}>
                    Raina
                  </button>
                  <button onClick={()=>setAddChild("jaina")} style={{ background:themes.jaina.light, color:themes.jaina.color, border:`1px solid ${themes.jaina.border}`, borderRadius:8, padding:"6px 14px", fontSize:12, fontWeight:600, cursor:"pointer" }}>
                    Jaina
                  </button>
                </div>
              )}
            </div>
            {selectedWorks.length===0
              ? <div style={{ textAlign:"center", padding:"32px 0", color:"#ddd", fontSize:13 }}>{isAdmin ? "No works — add one above" : "No works on this day"}</div>
              : <div style={{ columns:"160px", columnGap:10 }}>
                  {selectedWorks.map(w=><WorkCard key={w.id} work={w} theme={getTheme(w)} onClick={wk=>setSelectedId(wk.id)} onToggleLike={onToggleLike} isLiked={likedIds.has(w.id)}/>)}
                </div>
            }
          </div>
        )}
        {!selectedDate && <div style={{ padding:"0 28px 28px", textAlign:"center", color:"#ddd", fontSize:13 }}>Select a date</div>}
      </div>

      {addChild && <AddForm childKey={addChild} theme={addChild==="raina"?themes.raina:themes.jaina} initialDate={selectedKey} onAdd={w=>{onAdd(w);setAddChild(null);}} onClose={()=>setAddChild(null)}/>}
      {selectedWork && <Modal work={selectedWork} theme={getTheme(selectedWork)} onClose={()=>setSelectedId(null)} onDelete={()=>{}} isAdmin={isAdmin} onToggleLike={onToggleLike} isLiked={likedIds.has(selectedWork.id)} onPrev={goPrev} onNext={goNext}/>}
    </div>
  );
}

// ── Settings ───────────────────────────────────────────────────
function SettingsPanel({ settings, onSave, onClose }) {
  const [draft, setDraft] = useState(JSON.parse(JSON.stringify(settings)));
  const setChild = (key,field,value) => setDraft(prev=>({...prev,[key]:{...prev[key],[field]:value}}));

  const ChildSection = ({childKey}) => {
    const s = draft[childKey];
    return (
      <div style={{ paddingBottom:20, marginBottom:20, borderBottom:"1px solid #f0f0f0" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
          <div style={{ width:36, height:36, borderRadius:8, background:`linear-gradient(135deg,${s.color},${s.gradient2})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, fontWeight:700, color:"#fff" }}>{childKey.slice(0,1).toUpperCase()}</div>
          <div style={{ fontWeight:700, fontSize:14, color:"#111" }}>{childKey.charAt(0).toUpperCase()+childKey.slice(1)}</div>
        </div>
        <label style={{ fontSize:11, fontWeight:600, color:"#999", letterSpacing:0.8, textTransform:"uppercase", display:"block", marginBottom:8 }}>Emoji</label>
        <div style={{ display:"flex", flexWrap:"wrap", gap:5, marginBottom:16 }}>
          {EMOJI_PRESETS.map(e=><button key={e} onClick={()=>setChild(childKey,"emoji",e)} style={{ width:34,height:34,borderRadius:7,border:`1.5px solid ${s.emoji===e?s.color:"#eee"}`,background:s.emoji===e?hexToLight(s.color):"#fff",fontSize:16,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>{e}</button>)}
          <input value={EMOJI_PRESETS.includes(s.emoji)?"":s.emoji} onChange={e=>setChild(childKey,"emoji",e.target.value)} placeholder="?" maxLength={2} style={{width:34,height:34,borderRadius:7,border:"1.5px dashed #ddd",textAlign:"center",fontSize:14,outline:"none",fontFamily:"inherit"}}/>
        </div>
        <label style={{ fontSize:11, fontWeight:600, color:"#999", letterSpacing:0.8, textTransform:"uppercase", display:"block", marginBottom:8 }}>Color</label>
        <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginBottom:10 }}>
          {COLOR_PRESETS.map(c=><button key={c} onClick={()=>setChild(childKey,"color",c)} style={{width:26,height:26,borderRadius:"50%",background:c,border:`2.5px solid ${s.color===c?"#111":"transparent"}`,cursor:"pointer"}}/>)}
          <input type="color" value={s.color} onChange={e=>setChild(childKey,"color",e.target.value)} style={{width:26,height:26,borderRadius:"50%",border:"1.5px dashed #ddd",padding:0,cursor:"pointer",background:"none"}}/>
        </div>
        <label style={{ fontSize:11, fontWeight:600, color:"#999", letterSpacing:0.8, textTransform:"uppercase", display:"block", marginBottom:8 }}>Gradient accent</label>
        <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
          {COLOR_PRESETS.map(c=><button key={c} onClick={()=>setChild(childKey,"gradient2",c)} style={{width:26,height:26,borderRadius:"50%",background:c,border:`2.5px solid ${s.gradient2===c?"#111":"transparent"}`,cursor:"pointer"}}/>)}
          <input type="color" value={s.gradient2} onChange={e=>setChild(childKey,"gradient2",e.target.value)} style={{width:26,height:26,borderRadius:"50%",border:"1.5px dashed #ddd",padding:0,cursor:"pointer",background:"none"}}/>
        </div>
      </div>
    );
  };

  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:2000, padding:20, backdropFilter:"blur(4px)" }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:"#fff", borderRadius:16, maxWidth:440, width:"100%", maxHeight:"90vh", overflowY:"auto", boxShadow:"0 32px 80px rgba(0,0,0,0.2)" }}>
        <div style={{ padding:"24px 24px 0" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:22 }}>
            <div style={{ fontWeight:700, fontSize:16, color:"#111", letterSpacing:"-0.2px" }}>Settings</div>
            <button onClick={onClose} style={{ background:"none", border:"none", cursor:"pointer", fontSize:18, color:"#ccc" }}>✕</button>
          </div>
          <div style={{ marginBottom:20, paddingBottom:20, borderBottom:"1px solid #f0f0f0" }}>
            <label style={{ fontSize:11, fontWeight:600, color:"#999", letterSpacing:0.8, textTransform:"uppercase", display:"block", marginBottom:8 }}>Page background</label>
            <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
              {["#ffffff","#fafaf9","#f8f8f5","#fff9f0","#f0f4ff","#f5f0ff","#f0fff8","#fff0f5"].map(c=>(
                <button key={c} onClick={()=>setDraft(p=>({...p,bgColor:c}))} style={{ width:30,height:30,borderRadius:6,background:c,border:`2px solid ${draft.bgColor===c?"#111":"#e8e8e8"}`,cursor:"pointer"}}/>
              ))}
              <input type="color" value={draft.bgColor} onChange={e=>setDraft(p=>({...p,bgColor:e.target.value}))} style={{width:30,height:30,borderRadius:6,border:"1.5px dashed #ddd",padding:0,cursor:"pointer"}}/>
            </div>
          </div>
          <ChildSection childKey="raina"/>
          <ChildSection childKey="jaina"/>
        </div>
        <div style={{ padding:"4px 24px 24px", display:"flex", gap:8 }}>
          <button onClick={onClose} style={{ flex:1, padding:"11px", borderRadius:8, border:"1px solid #eee", background:"#fff", color:"#aaa", fontWeight:500, cursor:"pointer", fontSize:13, fontFamily:"inherit" }}>Cancel</button>
          <button onClick={()=>{onSave(draft);onClose();}} style={{ flex:2, padding:"11px", borderRadius:8, border:"none", background:"#111", color:"#fff", fontWeight:600, cursor:"pointer", fontSize:13, fontFamily:"inherit" }}>Save</button>
        </div>
      </div>
    </div>
  );
}

// ── Board (grid only) ─────────────────────────────────────────
function Board({ childKey, theme, works, filter, search, onDelete, isAdmin, onToggleLike, likedIds }) {
  const [selectedId, setSelectedId] = useState(null);

  const filtered = works.filter(w => {
    const matchTag = filter==="All"||w.tag===filter;
    const matchSearch = !search||w.title.toLowerCase().includes(search.toLowerCase())||(w.description||"").toLowerCase().includes(search.toLowerCase());
    return matchTag && matchSearch;
  });

  const selectedIndex = filtered.findIndex(w => w.id === selectedId);
  const selectedWork = selectedIndex >= 0 ? filtered[selectedIndex] : null;
  const goPrev = selectedIndex > 0 ? () => setSelectedId(filtered[selectedIndex - 1].id) : null;
  const goNext = selectedIndex >= 0 && selectedIndex < filtered.length - 1 ? () => setSelectedId(filtered[selectedIndex + 1].id) : null;

  return (
    <div>
      {filtered.length===0
        ? <div style={{ textAlign:"center", padding:"60px 0", color:"#ddd" }}>
            <div style={{ fontSize:13 }}>{works.length===0?"No works yet":"No results"}</div>
          </div>
        : <div style={{ columns:"180px", columnGap:12 }}>
            {filtered.map(work=><WorkCard key={work.id} work={work} theme={theme} onClick={w=>setSelectedId(w.id)} onToggleLike={onToggleLike} isLiked={likedIds.has(work.id)}/>)}
          </div>
      }
      {selectedWork && <Modal work={selectedWork} theme={theme} onClose={()=>setSelectedId(null)} onDelete={onDelete} isAdmin={isAdmin} onToggleLike={onToggleLike} isLiked={likedIds.has(selectedWork.id)} onPrev={goPrev} onNext={goNext}/>}
    </div>
  );
}

// ── Admin Login ────────────────────────────────────────────────
function LoginModal({ onSuccess, onClose }) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState(false);

  const handleSubmit = () => {
    if (pw === ADMIN_PASSWORD) {
      onSuccess();
    } else {
      setError(true);
      setPw("");
    }
  };

  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:3000, padding:20, backdropFilter:"blur(4px)" }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:"#fff", borderRadius:16, maxWidth:340, width:"100%", boxShadow:"0 32px 80px rgba(0,0,0,0.25)", padding:"28px 26px" }}>
        <div style={{ fontWeight:700, fontSize:16, color:"#111", marginBottom:6 }}>Admin Login</div>
        <div style={{ fontSize:12, color:"#aaa", marginBottom:18 }}>Enter the password to add or delete works.</div>
        <input
          type="password"
          value={pw}
          autoFocus
          onChange={e=>{ setPw(e.target.value); setError(false); }}
          onKeyDown={e=>{ if(e.key==="Enter") handleSubmit(); }}
          placeholder="Password"
          style={{ width:"100%", padding:"10px 12px", borderRadius:8, border:`1.5px solid ${error?"#ef4444":"#e8e8e8"}`, fontSize:14, outline:"none", boxSizing:"border-box", fontFamily:"inherit", marginBottom: error ? 6 : 18 }}
        />
        {error && <div style={{ fontSize:12, color:"#ef4444", marginBottom:12 }}>Incorrect password</div>}
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={onClose} style={{ flex:1, padding:"10px", borderRadius:8, border:"1px solid #eee", background:"#fff", color:"#aaa", fontWeight:500, cursor:"pointer", fontSize:13, fontFamily:"inherit" }}>Cancel</button>
          <button onClick={handleSubmit} style={{ flex:2, padding:"10px", borderRadius:8, border:"none", background:"#111", color:"#fff", fontWeight:600, cursor:"pointer", fontSize:13, fontFamily:"inherit" }}>Unlock</button>
        </div>
      </div>
    </div>
  );
}

// ── App ────────────────────────────────────────────────────────
export default function App() {
  const [works, setWorks] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [activeChild, setActiveChild] = useState("raina");
  const [filters, setFilters] = useState({ raina: "All", jaina: "All" });
  const [searches, setSearches] = useState({ raina: "", jaina: "" });
  const [showAdd, setShowAdd] = useState(null); // "raina" | "jaina" | null
  const [filterOpen, setFilterOpen] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [visitorCount, setVisitorCount] = useState(null);
  const [likedIds, setLikedIds] = useState(() => getLikedWorkIds());

  useEffect(()=>{
    (async () => {
      try {
        const [remoteWorks, remoteSettings] = await Promise.all([fetchWorks(), fetchSettings()]);
        // Sort newest first, same as before
        setWorks(remoteWorks.sort((a,b)=> new Date(b.date) - new Date(a.date)));
        if (remoteSettings) setSettings(remoteSettings);
      } catch (e) {
        console.error("Failed to load from Firebase:", e);
      }
      try{const v=localStorage.getItem(ADMIN_KEY);if(v==="true")setIsAdmin(true);}catch{}
      setLoaded(true);
      // Count this visit (increments once per page load)
      try {
        const count = await incrementVisitorCount();
        setVisitorCount(count);
      } catch (e) {
        console.error("Failed to count visit:", e);
      }
    })();
  },[]);

  const handleAdd = (work) => {
    setWorks(prev => [work, ...prev]); // optimistic: show immediately
    saveWork(work).catch(e => console.error("Failed to save work:", e));
  };
  const handleDelete = async (id) => {
    setWorks(prev => prev.filter(w => w.id !== id));
    try { await deleteWork(id); } catch (e) { console.error("Failed to delete work:", e); }
  };
  const handleSaveSettings = async (s) => {
    setSettings(s);
    try { await saveSettingsToFirebase(s); } catch (e) { console.error("Failed to save settings:", e); }
  };
  const handleLoginSuccess = () => { setIsAdmin(true); try{localStorage.setItem(ADMIN_KEY,"true");}catch{}; setShowLogin(false); };
  const handleLogout = () => { setIsAdmin(false); try{localStorage.removeItem(ADMIN_KEY);}catch{}; };

  const handleToggleLike = async (work) => {
    const alreadyLiked = likedIds.has(work.id);
    const delta = alreadyLiked ? -1 : 1;

    // Optimistic UI update
    setLikedIds(prev => {
      const next = new Set(prev);
      if (alreadyLiked) next.delete(work.id); else next.add(work.id);
      saveLikedWorkIds(next);
      return next;
    });
    setWorks(prev => prev.map(w => w.id === work.id ? { ...w, likeCount: Math.max(0, (w.likeCount || 0) + delta) } : w));

    try {
      await adjustWorkLike(work.id, delta);
    } catch (e) {
      console.error("Failed to update like:", e);
    }
  };

  const rainaWorks = works.filter(w=>w.child==="raina");
  const jainaWorks = works.filter(w=>w.child==="jaina");
  const rainaTheme = buildTheme("raina", settings);
  const jainaTheme = buildTheme("jaina", settings);

  const activeWorks = activeChild==="raina" ? rainaWorks : jainaWorks;
  const activeTheme = activeChild==="raina" ? rainaTheme : jainaTheme;

  return (
    <div style={{ minHeight:"100vh", background:settings.bgColor, fontFamily:"'Pretendard','Inter',sans-serif", display:"flex", flexDirection:"column" }}>

      {/* Top bar */}
      <header style={{ borderBottom:"1px solid #f0f0f0", padding:"0 32px", background:settings.bgColor, position:"sticky", top:0, zIndex:100 }}>
        <div style={{ maxWidth:1200, margin:"0 auto", display:"flex", alignItems:"center", height:56, gap:16 }}>
          <div style={{ fontWeight:800, fontSize:16, color:"#111", letterSpacing:"-0.5px" }}>
            <span>Raina</span>
            <span style={{ color:"#ddd", margin:"0 6px", fontWeight:300 }}>&</span>
            <span>Jaina</span>
          </div>
          {visitorCount !== null && (
            <span style={{ fontSize:11, color:"#ccc", fontWeight:500, display:"flex", alignItems:"center", gap:4 }}>
              <span style={{ fontSize:10 }}>👁</span>{visitorCount.toLocaleString()}
            </span>
          )}
          <div style={{ flex:1 }}/>
          <button onClick={()=>setShowCalendar(true)} style={{ background:"none", border:"1px solid #eee", borderRadius:8, padding:"7px 14px", fontSize:12, fontWeight:500, color:"#888", cursor:"pointer", fontFamily:"inherit", transition:"all 0.15s" }}
            onMouseEnter={e=>{e.currentTarget.style.borderColor="#111";e.currentTarget.style.color="#111";}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor="#eee";e.currentTarget.style.color="#888";}}>
            Calendar
          </button>
          {isAdmin && (
            <button onClick={()=>setShowSettings(true)} style={{ background:"none", border:"1px solid #eee", borderRadius:8, padding:"7px 14px", fontSize:12, fontWeight:500, color:"#888", cursor:"pointer", fontFamily:"inherit", transition:"all 0.15s" }}
              onMouseEnter={e=>{e.currentTarget.style.borderColor="#111";e.currentTarget.style.color="#111";}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor="#eee";e.currentTarget.style.color="#888";}}>
              Settings
            </button>
          )}
          {isAdmin
            ? <button onClick={handleLogout} style={{ background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:8, padding:"7px 14px", fontSize:12, fontWeight:600, color:"#16a34a", cursor:"pointer", fontFamily:"inherit" }}>
                ✓ Admin
              </button>
            : <button onClick={()=>setShowLogin(true)} style={{ background:"none", border:"1px solid #eee", borderRadius:8, padding:"7px 14px", fontSize:12, fontWeight:500, color:"#888", cursor:"pointer", fontFamily:"inherit", transition:"all 0.15s" }}
                onMouseEnter={e=>{e.currentTarget.style.borderColor="#111";e.currentTarget.style.color="#111";}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor="#eee";e.currentTarget.style.color="#888";}}>
                Admin Login
              </button>
          }
        </div>
      </header>

      {/* Main layout */}
      <div style={{ flex:1, maxWidth:1200, margin:"0 auto", width:"100%", display:"grid", gridTemplateColumns:"260px 1fr", minHeight:0, padding:"0 32px" }}>

        {/* Sidebar */}
        <aside style={{ borderRight:"1px solid #f0f0f0", padding:"32px 28px 32px 0", position:"sticky", top:56, height:"calc(100vh - 56px)", overflowY:"auto", display:"flex", flexDirection:"column" }}>
          <div style={{ fontSize:10, fontWeight:600, color:"#ccc", letterSpacing:1.2, textTransform:"uppercase", marginBottom:20 }}>Portfolio</div>

          {[["raina", rainaWorks, rainaTheme], ["jaina", jainaWorks, jainaTheme]].map(([key, ws, theme]) => {
            const isActive = activeChild===key;
            return (
              <div key={key} style={{ marginBottom: isActive ? 16 : 6 }}>
                {/* Child selector */}
                <div onClick={()=>setActiveChild(key)} style={{ padding:"12px 14px", borderRadius:10, cursor:"pointer", background: isActive ? theme.light : "transparent", transition:"all 0.2s" }}
                  onMouseEnter={e=>{ if(!isActive) e.currentTarget.style.background="#fafafa"; }}
                  onMouseLeave={e=>{ if(!isActive) e.currentTarget.style.background="transparent"; }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <div style={{ width:34, height:34, borderRadius:8, background:"#fff", border:"1.5px solid #111", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:700, color: theme.color, transition:"all 0.2s" }}>{theme.name.slice(0,1)}</div>
                    <div>
                      <div style={{ fontWeight:700, fontSize:14, color:"#111", letterSpacing:"-0.2px" }}>{theme.name}</div>
                      <div style={{ fontSize:11, color:"#ccc" }}>{ws.length} work{ws.length!==1?"s":""}</div>
                    </div>
                    {isActive && <div style={{ marginLeft:"auto", width:5, height:5, borderRadius:"50%", background:theme.color }}/>}
                  </div>
                </div>

                {/* Controls — only shown for active child */}
                {isActive && (
                  <div style={{ padding:"8px 14px 0", display:"flex", flexDirection:"column", gap:10 }}>
                    {/* Add button + Search in one row */}
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      {isAdmin && (
                        <button onClick={()=>setShowAdd(key)} style={{ width:34, height:34, borderRadius:8, border:`1px solid ${theme.color}`, background:theme.light, color:theme.color, fontWeight:700, fontSize:16, cursor:"pointer", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", transition:"all 0.15s" }}
                          onMouseEnter={e=>{e.currentTarget.style.background=theme.gradient;e.currentTarget.style.color="#fff";e.currentTarget.style.borderColor="transparent";}}
                          onMouseLeave={e=>{e.currentTarget.style.background=theme.light;e.currentTarget.style.color=theme.color;e.currentTarget.style.borderColor=theme.color;}}>
                          +
                        </button>
                      )}
                      <input
                        value={searches[key]}
                        onChange={e=>setSearches(p=>({...p,[key]:e.target.value}))}
                        placeholder="Search…"
                        style={{ width:52, padding:"6px 0", border:"none", borderBottom:`1px solid #e0e0e0`, fontSize:12, outline:"none", fontFamily:"inherit", color:"#444", background:"transparent", transition:"border 0.15s", flexShrink:0 }}
                        onFocus={e=>{e.target.style.borderBottomColor=theme.color; e.target.style.width="120px";}}
                        onBlur={e=>{e.target.style.borderBottomColor="#e0e0e0"; if(!e.target.value) e.target.style.width="52px";}}
                      />
                    </div>

                    {/* Tag filters — collapsible */}
                    <div>
                      <button onClick={()=>setFilterOpen(o=>!o)} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", width:"100%", padding:"6px 10px", borderRadius:6, border:"none", background:"transparent", cursor:"pointer", fontFamily:"inherit" }}>
                        <span style={{ fontSize:11, fontWeight:600, color:"#bbb", letterSpacing:0.6, textTransform:"uppercase" }}>Filter</span>
                        <span style={{ fontSize:11, color:"#ccc", transform: filterOpen ? "rotate(180deg)" : "rotate(0deg)", transition:"transform 0.2s", display:"inline-block" }}>▾</span>
                      </button>
                      {filterOpen && (
                        <div style={{ display:"flex", flexDirection:"column", gap:1, marginTop:2 }}>
                          {["All",...TAGS].map(t=>(
                            <button key={t} onClick={()=>setFilters(p=>({...p,[key]:t}))} style={{
                              padding:"6px 10px", borderRadius:6, fontSize:12, textAlign:"left",
                              border:"none", cursor:"pointer", fontFamily:"inherit", transition:"all 0.15s",
                              background: filters[key]===t ? theme.light : "transparent",
                              color: "#111",
                              fontWeight: filters[key]===t ? 600 : 400,
                            }}>
                              {filters[key]===t ? "▸ " : "  "}{t}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          <div style={{ marginTop:"auto", paddingTop:20, borderTop:"1px solid #f0f0f0" }}>
            <div style={{ fontSize:11, color:"#ddd", lineHeight:1.8 }}>
              <div>{rainaWorks.length + jainaWorks.length} total works</div>
              <div>{[...new Set(works.map(w=>toDateKey(w.date)))].length} days active</div>
            </div>
          </div>
        </aside>

        {/* Content — pure grid */}
        <main style={{ padding:"32px 0 60px 32px", minHeight:0 }}>
          {!loaded
            ? <div style={{ textAlign:"center", padding:80, color:"#ddd", fontSize:13 }}>Loading…</div>
            : <Board
                childKey={activeChild}
                theme={activeTheme}
                works={activeWorks}
                filter={filters[activeChild]}
                search={searches[activeChild]}
                onDelete={handleDelete}
                isAdmin={isAdmin}
                onToggleLike={handleToggleLike}
                likedIds={likedIds}
              />
          }
        </main>
      </div>

      {showAdd && isAdmin && <AddForm childKey={showAdd} theme={showAdd==="raina"?rainaTheme:jainaTheme} onAdd={w=>{handleAdd(w);setShowAdd(null);}} onClose={()=>setShowAdd(null)}/>}
      {showCalendar && <CalendarView works={works} themes={{raina:rainaTheme,jaina:jainaTheme}} onClose={()=>setShowCalendar(false)} onAdd={handleAdd} isAdmin={isAdmin} onToggleLike={handleToggleLike} likedIds={likedIds}/>}
      {showSettings && <SettingsPanel settings={settings} onSave={handleSaveSettings} onClose={()=>setShowSettings(false)}/>}
      {showLogin && <LoginModal onSuccess={handleLoginSuccess} onClose={()=>setShowLogin(false)}/>}
    </div>
  );
}
