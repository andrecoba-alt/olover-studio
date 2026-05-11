import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase";

const STATUSES = [
  { value: "pendiente", label: "Pendiente", color: "#F0A500", bg: "#FFF8E7" },
  { value: "asignada",  label: "Asignada",  color: "#3A9E8A", bg: "#E8F7F5" },
  { value: "terminada", label: "Terminada", color: "#7B6BE0", bg: "#F2F0FD" },
];
const statusMeta = v => STATUSES.find(s => s.value === v) || STATUSES[0];

const PRESETS = [
  { name:"OLOVER",   navBg:"#111111", sidebarBg:"#1C1C1C", topbarBg:"#ffffff", accent:"#E8623A" },
  { name:"Midnight", navBg:"#0D1117", sidebarBg:"#161B22", topbarBg:"#ffffff", accent:"#58A6FF" },
  { name:"Forest",   navBg:"#1A2A1A", sidebarBg:"#1F331F", topbarBg:"#ffffff", accent:"#4CAF50" },
  { name:"Slate",    navBg:"#1E2130", sidebarBg:"#252A40", topbarBg:"#ffffff", accent:"#7B6BE0" },
  { name:"Rose",     navBg:"#1A0F14", sidebarBg:"#261520", topbarBg:"#ffffff", accent:"#E06B9A" },
  { name:"Sand",     navBg:"#2A2318", sidebarBg:"#332B1E", topbarBg:"#FDFAF6", accent:"#C49A3C" },
];

const HOURS      = ["8:00","9:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00"];
const WEEK_DAYS  = ["Lun","Mar","Mié","Jue","Vie"];
const MONTHS     = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DAYS_SHORT = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];
const today      = new Date();

const getMonday = d => { const x=new Date(d),day=x.getDay(); x.setDate(x.getDate()-day+(day===0?-6:1)); x.setHours(0,0,0,0); return x; };
const addDays   = (d,n) => { const x=new Date(d); x.setDate(x.getDate()+n); return x; };
const fmtDate   = d => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const getDIM    = (y,m) => new Date(y,m+1,0).getDate();
const getFD     = (y,m) => new Date(y,m,1).getDay();
const luminance = h => { const r=parseInt(h.slice(1,3),16)/255,g=parseInt(h.slice(3,5),16)/255,b=parseInt(h.slice(5,7),16)/255; return 0.299*r+0.587*g+0.114*b; };
const textOn    = bg => luminance(bg) > 0.5 ? "#1C1C1C" : "#ffffff";

let _id = Date.now();
const uid = () => `t${_id++}`;

const chS  = { padding:"5px 6px", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", background:"#FAFAF9", fontSize:10 };
const iBtnS= { background:"none", border:"none", fontSize:17, cursor:"pointer", color:"#666", padding:"3px 7px", borderRadius:8, lineHeight:1 };
const lbS  = { display:"block", fontSize:9, letterSpacing:1, color:"#aaa", textTransform:"uppercase", marginBottom:5, fontWeight:500 };
const lbS2 = { display:"block", fontSize:10, letterSpacing:1, color:"#aaa", textTransform:"uppercase", marginBottom:8, fontWeight:500 };
const inS  = { width:"100%", border:"none", borderBottom:"2px solid #E8E4DE", padding:"6px 0", fontSize:14, outline:"none", background:"transparent", color:"#1C1C1C", boxSizing:"border-box" };

export default function App() {
  const [brand, setBrand]           = useState({ name:"OLOVER Studio", logo:null, navBg:"#111111", sidebarBg:"#1C1C1C", topbarBg:"#ffffff", accent:"#E8623A" });
  const [boards, setBoards]         = useState([]);
  const [members, setMembers]       = useState([]);
  const [tasks, setTasks]           = useState([]);
  const [backlog, setBacklog]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [boardId, setBoardId]       = useState("animadores");
  const [sidebarOpen, setSidebarOpen]   = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab]   = useState("marca");
  const [editingName, setEditingName]   = useState(null);
  const [newBacklog, setNewBacklog]     = useState("");
  const [dragging, setDragging]         = useState(null);
  const [dragOver, setDragOver]         = useState(null);
  const [modal, setModal]               = useState(null);
  const [modalForm, setModalForm]       = useState({ title:"", link:"", status:"pendiente" });
  const logoRef = useRef();

  const mkState = () => ({ animadores:"weekly", disenadores:"weekly", proveedores:"weekly" });
  const [views, setViews]           = useState(mkState);
  const [weekStarts, setWeekStarts] = useState({ animadores:getMonday(today), disenadores:getMonday(today), proveedores:getMonday(today) });
  const [calYears, setCalYears]     = useState({ animadores:today.getFullYear(), disenadores:today.getFullYear(), proveedores:today.getFullYear() });
  const [calMonths, setCalMonths]   = useState({ animadores:today.getMonth(), disenadores:today.getMonth(), proveedores:today.getMonth() });

  // ── Load data from Supabase ──
  useEffect(() => {
    async function load() {
      const [{ data: br }, { data: bo }, { data: me }, { data: ta }, { data: bk }] = await Promise.all([
        supabase.from("brand").select("*").single(),
        supabase.from("boards").select("*").order("position"),
        supabase.from("members").select("*").order("position"),
        supabase.from("tasks").select("*").order("created_at"),
        supabase.from("backlog").select("*").order("created_at"),
      ]);
      if (br) setBrand({ name:br.name, logo:br.logo, navBg:br.nav_bg, sidebarBg:br.sidebar_bg, topbarBg:br.topbar_bg, accent:br.accent });
      if (bo) setBoards(bo);
      if (me) setMembers(me);
      if (ta) setTasks(ta);
      if (bk) setBacklog(bk);
      setLoading(false);
    }
    load();

    // Realtime subscriptions
    const ch = supabase.channel("realtime-all")
      .on("postgres_changes", { event:"*", schema:"public", table:"tasks" },   () => supabase.from("tasks").select("*").order("created_at").then(({data}) => data && setTasks(data)))
      .on("postgres_changes", { event:"*", schema:"public", table:"backlog" }, () => supabase.from("backlog").select("*").order("created_at").then(({data}) => data && setBacklog(data)))
      .on("postgres_changes", { event:"*", schema:"public", table:"members" }, () => supabase.from("members").select("*").order("position").then(({data}) => data && setMembers(data)))
      .on("postgres_changes", { event:"*", schema:"public", table:"boards" },  () => supabase.from("boards").select("*").order("position").then(({data}) => data && setBoards(data)))
      .on("postgres_changes", { event:"*", schema:"public", table:"brand" },   () => supabase.from("brand").select("*").single().then(({data}) => data && setBrand({ name:data.name, logo:data.logo, navBg:data.nav_bg, sidebarBg:data.sidebar_bg, topbarBg:data.topbar_bg, accent:data.accent })))
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  const board       = boards.find(b => b.id === boardId) || boards[0];
  const boardMembers= members.filter(m => m.board_id === boardId);
  const boardTasks  = tasks.filter(t => t.board_id === boardId);
  const boardBacklog= backlog.filter(b => b.board_id === boardId);
  const memberOf    = id => members.find(m => m.id === id) || boardMembers[0];

  const view   = views[boardId];
  const wStart = weekStarts[boardId];
  const cYear  = calYears[boardId];
  const cMonth = calMonths[boardId];

  const setView   = v  => setViews(p => ({ ...p, [boardId]: v }));
  const setWStart = fn => setWeekStarts(p => ({ ...p, [boardId]: typeof fn==="function"?fn(p[boardId]):fn }));
  const setCYear  = fn => setCalYears(p  => ({ ...p, [boardId]: typeof fn==="function"?fn(p[boardId]):fn }));
  const setCMonth = fn => setCalMonths(p => ({ ...p, [boardId]: typeof fn==="function"?fn(p[boardId]):fn }));

  const weekDates    = WEEK_DAYS.map((_,i) => addDays(wStart, i));
  const fmtWeekLabel = () => { const e=addDays(wStart,4); return `${wStart.getDate()} – ${e.getDate()} ${MONTHS[e.getMonth()]} ${e.getFullYear()}`; };
  const prevMonth = () => { if(cMonth===0){setCMonth(11);setCYear(y=>y-1);}else setCMonth(m=>m-1); };
  const nextMonth = () => { if(cMonth===11){setCMonth(0);setCYear(y=>y+1);}else setCMonth(m=>m+1); };

  // ── CRUD tasks ──
  const addTask = async (title, memberId, date, hour, link, status) => {
    const id = uid();
    await supabase.from("tasks").insert({ id, board_id:boardId, member_id:memberId, title, date, hour, link:link||"", status:status||"pendiente" });
  };
  const updateTask = async (id, patch) => {
    const dbPatch = {};
    if (patch.title    !== undefined) dbPatch.title     = patch.title;
    if (patch.status   !== undefined) dbPatch.status    = patch.status;
    if (patch.link     !== undefined) dbPatch.link      = patch.link;
    if (patch.date     !== undefined) dbPatch.date      = patch.date;
    if (patch.hour     !== undefined) dbPatch.hour      = patch.hour;
    if (patch.memberId !== undefined) dbPatch.member_id = patch.memberId;
    await supabase.from("tasks").update(dbPatch).eq("id", id);
  };
  const deleteTask = async id => { await supabase.from("tasks").delete().eq("id", id); };

  // ── CRUD backlog ──
  const addBacklogItem = async () => {
    if (!newBacklog.trim()) return;
    await supabase.from("backlog").insert({ id:uid(), board_id:boardId, title:newBacklog.trim() });
    setNewBacklog("");
  };
  const deleteBacklogItem = async id => { await supabase.from("backlog").delete().eq("id", id); };

  // ── CRUD members ──
  const addMember = async (boardId) => {
    const bMembers = members.filter(m => m.board_id === boardId);
    const colors = ["#E8623A","#3A6FE8","#7B6BE0","#3A9E8A","#C49A3C","#E06B9A","#4CAF50","#58A6FF"];
    const color  = colors[bMembers.length % colors.length];
    const board  = boards.find(b => b.id === boardId);
    const name   = `${board.label.slice(0,-1)} ${bMembers.length + 1}`;
    const id     = uid();
    await supabase.from("members").insert({ id, board_id:boardId, name, color, position:bMembers.length });
  };
  const updateMember = async (id, patch) => { await supabase.from("members").update(patch).eq("id", id); };
  const deleteMember = async id => {
    await supabase.from("tasks").delete().eq("member_id", id);
    await supabase.from("members").delete().eq("id", id);
  };

  // ── CRUD brand ──
  const saveBrand = async (newBrand) => {
    await supabase.from("brand").update({ name:newBrand.name, logo:newBrand.logo, nav_bg:newBrand.navBg, sidebar_bg:newBrand.sidebarBg, topbar_bg:newBrand.topbarBg, accent:newBrand.accent }).eq("id", (await supabase.from("brand").select("id").single()).data.id);
  };

  // ── CRUD boards ──
  const updateBoard = async (id, patch) => { await supabase.from("boards").update(patch).eq("id", id); };

  // ── Modal ──
  const openAdd  = (memberId, date, hour) => { setModal({ mode:"add", memberId, date, hour }); setModalForm({ title:"", link:"", status:"pendiente" }); };
  const openEdit = task => { setModal({ mode:"edit", task }); setModalForm({ title:task.title, link:task.link||"", status:task.status||"pendiente" }); };
  const saveModal = async () => {
    if (!modalForm.title.trim()) return;
    if (modal.mode === "add") await addTask(modalForm.title.trim(), modal.memberId, modal.date, modal.hour, modalForm.link.trim(), modalForm.status);
    else await updateTask(modal.task.id, { title:modalForm.title.trim(), link:modalForm.link.trim(), status:modalForm.status });
    setModal(null);
  };
  const setField = (k,v) => setModalForm(p => ({ ...p, [k]:v }));

  // ── Drag ──
  const onDragStartBacklog = item => setDragging({ source:"backlog", id:item.id, title:item.title });
  const onDragStartTask    = task => setDragging({ source:"board", id:task.id });
  const onDropCell = async (memberId, date, hour) => {
    if (!dragging) return;
    if (dragging.source === "backlog") { await addTask(dragging.title, memberId, date, hour); await deleteBacklogItem(dragging.id); }
    else await updateTask(dragging.id, { memberId, date, hour });
    setDragging(null); setDragOver(null);
  };
  const onDropMonthCell = async (memberId, dateKey) => {
    if (!dragging) return;
    if (dragging.source === "backlog") { await addTask(dragging.title, memberId, dateKey, "8:00"); await deleteBacklogItem(dragging.id); }
    else await updateTask(dragging.id, { memberId, date:dateKey });
    setDragging(null); setDragOver(null);
  };

  // ── Logo ──
  const handleLogoUpload = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setBrand(p => ({ ...p, logo:ev.target.result }));
    reader.readAsDataURL(file);
  };

  if (loading) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", background:"#F4F2EE", flexDirection:"column", gap:12 }}>
      <div style={{ width:40, height:40, borderRadius:10, background:"#E8623A", display:"flex", alignItems:"center", justifyContent:"center" }}>
        <span style={{ color:"#fff", fontSize:14, fontWeight:700 }}>OL</span>
      </div>
      <p style={{ fontSize:13, color:"#aaa" }}>Cargando OLOVER Studio...</p>
    </div>
  );

  // ── Settings ──
  const renderSettings = () => (
    <div onClick={() => setSettingsOpen(false)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:400 }}>
      <div onClick={e => e.stopPropagation()} style={{ background:"#fff", borderRadius:20, width:520, maxHeight:"82vh", overflowY:"auto", boxShadow:"0 24px 64px rgba(0,0,0,0.18)", display:"flex", flexDirection:"column" }}>
        <div style={{ padding:"1.5rem 1.5rem 1rem", borderBottom:"1px solid #F0EDE8", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div>
            <p style={{ fontSize:9, letterSpacing:2, color:"#bbb", textTransform:"uppercase", marginBottom:3 }}>Configuración</p>
            <p style={{ fontFamily:"'DM Serif Display',serif", fontSize:"1.2rem", color:"#1C1C1C", margin:0 }}>Personalizar plataforma</p>
          </div>
          <button onClick={() => setSettingsOpen(false)} style={{ background:"none", border:"1px solid #E8E4DE", borderRadius:10, width:34, height:34, cursor:"pointer", fontSize:16, color:"#999" }}>✕</button>
        </div>
        <div style={{ display:"flex", gap:4, padding:"0.75rem 1.5rem", borderBottom:"1px solid #F0EDE8" }}>
          {[["marca","Marca"],["colores","Colores"],["tableros","Tableros"]].map(([t,l]) => (
            <button key={t} onClick={() => setSettingsTab(t)} style={{ background:settingsTab===t?brand.accent:"#F4F2EE", border:"none", borderRadius:20, padding:"5px 14px", fontSize:11, fontWeight:settingsTab===t?600:400, color:settingsTab===t?"#fff":"#888", cursor:"pointer" }}>{l}</button>
          ))}
        </div>
        <div style={{ padding:"1.25rem 1.5rem", flex:1 }}>
          {settingsTab === "marca" && (
            <div style={{ display:"flex", flexDirection:"column", gap:"1.5rem" }}>
              <div>
                <label style={lbS2}>Logo de la empresa</label>
                <div style={{ display:"flex", alignItems:"center", gap:"1rem" }}>
                  <div style={{ width:72, height:72, borderRadius:14, background:brand.navBg, display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden", border:"2px dashed #444", cursor:"pointer", flexShrink:0 }} onClick={() => logoRef.current.click()}>
                    {brand.logo ? <img src={brand.logo} alt="logo" style={{ width:"100%", height:"100%", objectFit:"contain", padding:4 }} /> : <span style={{ fontSize:22, color:"#666" }}>+</span>}
                  </div>
                  <div>
                    <button onClick={() => logoRef.current.click()} style={{ background:brand.accent, border:"none", borderRadius:8, padding:"7px 14px", fontSize:12, color:textOn(brand.accent), cursor:"pointer", fontWeight:600, display:"block", marginBottom:6 }}>{brand.logo?"Cambiar logo":"Subir logo"}</button>
                    {brand.logo && <button onClick={() => setBrand(p => ({ ...p, logo:null }))} style={{ background:"none", border:"1px solid #FFD0C8", borderRadius:8, padding:"5px 12px", fontSize:11, color:"#E8623A", cursor:"pointer" }}>Quitar logo</button>}
                    <p style={{ fontSize:10, color:"#bbb", marginTop:6 }}>PNG o SVG recomendado.</p>
                  </div>
                </div>
                <input ref={logoRef} type="file" accept="image/*" onChange={handleLogoUpload} style={{ display:"none" }} />
              </div>
              <div>
                <label style={lbS2}>Nombre del estudio</label>
                <input value={brand.name} onChange={e => setBrand(p => ({ ...p, name:e.target.value }))} style={{ ...inS, borderBottomColor:brand.accent }} />
              </div>
            </div>
          )}
          {settingsTab === "colores" && (
            <div style={{ display:"flex", flexDirection:"column", gap:"1.25rem" }}>
              <div>
                <label style={lbS2}>Paletas predefinidas</label>
                <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                  {PRESETS.map(pr => (
                    <button key={pr.name} onClick={() => setBrand(p => ({ ...p, navBg:pr.navBg, sidebarBg:pr.sidebarBg, topbarBg:pr.topbarBg, accent:pr.accent }))}
                      style={{ background:pr.navBg, border:`2px solid ${brand.navBg===pr.navBg&&brand.accent===pr.accent?pr.accent:"transparent"}`, borderRadius:10, padding:"8px 10px", cursor:"pointer", display:"flex", flexDirection:"column", gap:4, alignItems:"center" }}>
                      <div style={{ display:"flex", gap:3 }}>
                        {[pr.navBg, pr.sidebarBg, pr.accent].map((c,i) => <div key={i} style={{ width:14, height:14, borderRadius:4, background:c }} />)}
                      </div>
                      <span style={{ fontSize:10, color:textOn(pr.navBg), fontWeight:500 }}>{pr.name}</span>
                    </button>
                  ))}
                </div>
              </div>
              {[["accent","Color de acento","Botones y resaltados"],["navBg","Barra de navegación","Fondo lateral izquierdo"],["sidebarBg","Panel lateral","Fondo panel pendientes"],["topbarBg","Barra superior","Fondo encabezado"]].map(([key,label,desc]) => (
                <div key={key} style={{ display:"flex", alignItems:"center", gap:"1rem" }}>
                  <div style={{ position:"relative" }}>
                    <div style={{ width:44, height:44, borderRadius:10, background:brand[key], border:"1px solid #E8E4DE", cursor:"pointer" }} onClick={() => document.getElementById(`pick-${key}`).click()} />
                    <input id={`pick-${key}`} type="color" value={brand[key]} onChange={e => setBrand(p => ({ ...p, [key]:e.target.value }))} style={{ position:"absolute", opacity:0, width:44, height:44, top:0, left:0, cursor:"pointer" }} />
                  </div>
                  <div>
                    <p style={{ fontSize:13, fontWeight:500, color:"#1C1C1C", margin:"0 0 2px" }}>{label}</p>
                    <p style={{ fontSize:11, color:"#bbb", margin:0 }}>{desc}</p>
                  </div>
                  <span style={{ marginLeft:"auto", fontSize:11, color:"#bbb", fontFamily:"monospace" }}>{brand[key]}</span>
                </div>
              ))}
              <div>
                <label style={lbS2}>Vista previa</label>
                <div style={{ borderRadius:12, overflow:"hidden", border:"1px solid #E8E4DE", display:"flex", height:56 }}>
                  <div style={{ width:44, background:brand.navBg, display:"flex", alignItems:"center", justifyContent:"center" }}><div style={{ width:20, height:20, borderRadius:6, background:brand.accent }} /></div>
                  <div style={{ width:100, background:brand.sidebarBg, display:"flex", alignItems:"center", paddingLeft:10 }}><span style={{ fontSize:10, color:"#555" }}>Panel</span></div>
                  <div style={{ flex:1, background:brand.topbarBg, display:"flex", alignItems:"center", paddingLeft:12 }}><div style={{ background:brand.accent, borderRadius:20, padding:"3px 10px" }}><span style={{ fontSize:10, color:textOn(brand.accent), fontWeight:600 }}>Tablero</span></div></div>
                </div>
              </div>
            </div>
          )}
          {settingsTab === "tableros" && (
            <div style={{ display:"flex", flexDirection:"column", gap:"1.25rem" }}>
              {boards.map(b => (
                <div key={b.id} style={{ border:"1px solid #F0EDE8", borderRadius:12, padding:"1rem", background:"#FAFAF9" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:"0.75rem", marginBottom:"0.75rem" }}>
                    <span style={{ fontSize:16, color:b.accent }}>{b.icon}</span>
                    <input value={b.label} onChange={e => updateBoard(b.id, { label:e.target.value })}
                      style={{ flex:1, border:"none", borderBottom:`2px solid ${b.accent}`, fontSize:14, fontWeight:600, outline:"none", background:"transparent", color:"#1C1C1C", padding:"2px 0" }} />
                    <div style={{ position:"relative" }}>
                      <div style={{ width:28, height:28, borderRadius:8, background:b.accent, cursor:"pointer", border:"1px solid #E8E4DE" }} onClick={() => document.getElementById(`pick-board-${b.id}`).click()} />
                      <input id={`pick-board-${b.id}`} type="color" value={b.accent} onChange={e => updateBoard(b.id, { accent:e.target.value })} style={{ position:"absolute", opacity:0, width:28, height:28, top:0, left:0, cursor:"pointer" }} />
                    </div>
                  </div>
                  {members.filter(m => m.board_id === b.id).map(m => (
                    <div key={m.id} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                      <div style={{ width:22, height:22, borderRadius:"50%", background:m.color, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                        <span style={{ color:"#fff", fontSize:9, fontWeight:700 }}>{(m.name||"?")[0]}</span>
                      </div>
                      <input value={m.name||""} onChange={e => updateMember(m.id, { name:e.target.value })}
                        style={{ flex:1, border:"none", borderBottom:"1px solid #E8E4DE", fontSize:12, outline:"none", background:"transparent", color:"#555", padding:"2px 0" }} />
                      <div style={{ position:"relative" }}>
                        <div style={{ width:20, height:20, borderRadius:6, background:m.color, cursor:"pointer", border:"1px solid #ddd" }} onClick={() => document.getElementById(`pick-m-${m.id}`).click()} />
                        <input id={`pick-m-${m.id}`} type="color" value={m.color} onChange={e => updateMember(m.id, { color:e.target.value })} style={{ position:"absolute", opacity:0, width:20, height:20, top:0, left:0, cursor:"pointer" }} />
                      </div>
                      <button onClick={() => deleteMember(m.id)} style={{ background:"none", border:"none", color:"#ccc", fontSize:14, cursor:"pointer", lineHeight:1, padding:"0 2px" }}>✕</button>
                    </div>
                  ))}
                  <button onClick={() => addMember(b.id)} style={{ display:"flex", alignItems:"center", gap:6, background:"none", border:"1px dashed #ddd", borderRadius:8, padding:"5px 10px", fontSize:11, color:"#aaa", cursor:"pointer", width:"100%", marginTop:4 }}>
                    <span style={{ fontSize:16, lineHeight:1 }}>+</span> Agregar persona
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ padding:"1rem 1.5rem", borderTop:"1px solid #F0EDE8", display:"flex", justifyContent:"flex-end" }}>
          <button onClick={async () => { await saveBrand(brand); setSettingsOpen(false); }}
            style={{ background:brand.accent, border:"none", borderRadius:10, padding:"9px 22px", fontSize:13, color:textOn(brand.accent), cursor:"pointer", fontWeight:600 }}>
            Guardar cambios
          </button>
        </div>
      </div>
    </div>
  );

  const TaskChip = ({ t }) => {
    const sm = statusMeta(t.status);
    const m  = memberOf(t.member_id);
    return (
      <div draggable onDragStart={e => { e.stopPropagation(); onDragStartTask(t); }}
        style={{ background:sm.bg, borderLeft:`2px solid ${sm.color}`, borderRadius:"0 4px 4px 0", padding:"2px 4px", marginBottom:2, cursor:"grab", display:"flex", alignItems:"center", gap:3 }}>
        <span style={{ fontSize:8, color:sm.color }}>●</span>
        <span onClick={e => { e.stopPropagation(); openEdit(t); }} style={{ flex:1, fontSize:10, lineHeight:1.3, color:t.status==="terminada"?"#aaa":"#1C1C1C", textDecoration:t.status==="terminada"?"line-through":"none", cursor:"pointer" }}>{t.title}</span>
        {t.link && <a href={t.link} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ fontSize:10, color:sm.color, textDecoration:"none" }}>🔗</a>}
        <span onClick={e => { e.stopPropagation(); deleteTask(t.id); }} style={{ color:"#ddd", fontSize:9, cursor:"pointer" }}>✕</span>
      </div>
    );
  };

  return (
    <div style={{ display:"flex", height:"100vh", background:"#F4F2EE", fontFamily:"'DM Sans',sans-serif", overflow:"hidden" }}>
      {/* Left nav */}
      <div style={{ width:64, background:brand.navBg, display:"flex", flexDirection:"column", alignItems:"center", paddingTop:14, gap:4, zIndex:20, flexShrink:0 }}>
        <div style={{ width:38, height:38, borderRadius:10, background:brand.logo?"transparent":brand.accent, display:"flex", alignItems:"center", justifyContent:"center", marginBottom:10, overflow:"hidden", flexShrink:0 }}>
          {brand.logo ? <img src={brand.logo} alt="logo" style={{ width:"100%", height:"100%", objectFit:"contain" }} /> : <span style={{ color:textOn(brand.accent), fontSize:12, fontWeight:700 }}>{brand.name.slice(0,2).toUpperCase()}</span>}
        </div>
        {boards.map(b => (
          <button key={b.id} onClick={() => setBoardId(b.id)} title={b.label}
            style={{ width:44, height:44, borderRadius:12, border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", background:boardId===b.id?b.accent+"28":"transparent", outline:boardId===b.id?`2px solid ${b.accent}`:"2px solid transparent", transition:"all 0.15s" }}>
            <span style={{ fontSize:16, color:boardId===b.id?b.accent:"#555" }}>{b.icon}</span>
          </button>
        ))}
        <div style={{ flex:1 }} />
        <button onClick={() => setSettingsOpen(true)} style={{ width:44, height:44, borderRadius:12, border:"none", cursor:"pointer", background:"transparent", color:"#555", fontSize:18, marginBottom:4 }}>⚙</button>
        <button onClick={() => setSidebarOpen(o => !o)} style={{ width:44, height:44, borderRadius:12, border:"none", cursor:"pointer", background:"transparent", color:"#555", fontSize:18, marginBottom:12 }}>☰</button>
      </div>

      {/* Sidebar */}
      {sidebarOpen && board && (
        <div style={{ width:230, background:brand.sidebarBg, display:"flex", flexDirection:"column", zIndex:10, flexShrink:0 }}>
          <div style={{ padding:"1.1rem 1rem 0.75rem", borderBottom:"1px solid #2a2a2a" }}>
            <p style={{ fontSize:9, letterSpacing:3, color:"#444", textTransform:"uppercase", marginBottom:4 }}>{brand.name}</p>
            <div style={{ display:"flex", alignItems:"center", gap:7 }}>
              <span style={{ fontSize:15, color:board.accent }}>{board.icon}</span>
              <p style={{ fontFamily:"'DM Serif Display',serif", fontSize:"1.05rem", color:"#F4F2EE", margin:0 }}>{board.label}</p>
            </div>
          </div>
          <div style={{ padding:"0.75rem 1rem", borderBottom:"1px solid #2a2a2a" }}>
            <p style={{ fontSize:9, letterSpacing:2, color:"#444", textTransform:"uppercase", marginBottom:8 }}>Equipo</p>
            {boardMembers.map(m => (
              <div key={m.id} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                <div style={{ width:22, height:22, borderRadius:"50%", background:m.color, display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <span style={{ color:"#fff", fontSize:9, fontWeight:700 }}>{(m.name||"?")[0]}</span>
                </div>
                {editingName === m.id
                  ? <input autoFocus value={m.name} onChange={e => updateMember(m.id, { name:e.target.value })} onBlur={() => setEditingName(null)} onKeyDown={e => e.key==="Enter"&&setEditingName(null)}
                      style={{ flex:1, background:"transparent", border:"none", borderBottom:`1px solid ${m.color}`, color:"#ddd", fontSize:12, outline:"none" }} />
                  : <span onClick={() => setEditingName(m.id)} style={{ flex:1, fontSize:12, color:"#bbb", cursor:"pointer" }}>{m.name}</span>
                }
              </div>
            ))}
          </div>
          <div style={{ padding:"0.75rem 1rem", borderBottom:"1px solid #2a2a2a" }}>
            <p style={{ fontSize:9, letterSpacing:2, color:"#444", textTransform:"uppercase", marginBottom:8 }}>Pendientes</p>
            <div style={{ display:"flex", gap:6 }}>
              <input value={newBacklog} onChange={e => setNewBacklog(e.target.value)} onKeyDown={e => e.key==="Enter"&&addBacklogItem()} placeholder="Nueva tarea..."
                style={{ flex:1, background:"#2a2a2a", border:"none", borderRadius:8, color:"#F4F2EE", fontSize:11, padding:"6px 8px", outline:"none" }} />
              <button onClick={addBacklogItem} style={{ background:brand.accent, border:"none", borderRadius:8, color:textOn(brand.accent), fontSize:16, cursor:"pointer", width:28, fontWeight:700 }}>+</button>
            </div>
          </div>
          <div style={{ flex:1, overflowY:"auto", padding:"0.5rem" }}>
            {boardBacklog.length===0 && <p style={{ fontSize:11, color:"#333", textAlign:"center", marginTop:"1.5rem" }}>Sin pendientes</p>}
            {boardBacklog.map(item => (
              <div key={item.id} draggable onDragStart={() => onDragStartBacklog(item)}
                style={{ background:"#252525", border:"1px solid #2e2e2e", borderRadius:8, padding:"7px 9px", marginBottom:4, cursor:"grab", display:"flex", alignItems:"center", gap:7, fontSize:11, color:"#ccc" }}>
                <span style={{ fontSize:9, color:"#444" }}>⠿</span>
                <span style={{ flex:1, lineHeight:1.3 }}>{item.title}</span>
                <span onClick={() => deleteBacklogItem(item.id)} style={{ color:"#444", fontSize:9, cursor:"pointer" }}>✕</span>
              </div>
            ))}
          </div>
          <div style={{ padding:"0.75rem 1rem", borderTop:"1px solid #2a2a2a" }}>
            <p style={{ fontSize:10, color:"#333", margin:0 }}>Arrastra al tablero ↗</p>
          </div>
        </div>
      )}

      {/* Main */}
      {board && (
        <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
          {/* Topbar */}
          <div style={{ background:brand.topbarBg, borderBottom:"1px solid #E8E4DE", padding:"0.6rem 1.25rem", display:"flex", alignItems:"center", gap:"0.75rem", flexWrap:"wrap" }}>
            <div style={{ display:"flex", gap:6 }}>
              {boards.map(b => (
                <button key={b.id} onClick={() => setBoardId(b.id)}
                  style={{ display:"flex", alignItems:"center", gap:5, background:boardId===b.id?b.accent:"#F4F2EE", border:"none", borderRadius:20, padding:"5px 12px", cursor:"pointer", transition:"all 0.15s" }}>
                  <span style={{ fontSize:11, color:boardId===b.id?textOn(b.accent):"#888" }}>{b.icon}</span>
                  <span style={{ fontSize:11, fontWeight:boardId===b.id?600:400, color:boardId===b.id?textOn(b.accent):"#888" }}>{b.label}</span>
                </button>
              ))}
            </div>
            <div style={{ display:"flex", background:"#F4F2EE", borderRadius:10, padding:3, gap:2, marginLeft:8 }}>
              {[["weekly","Semana"],["monthly","Mes"]].map(([v,l]) => (
                <button key={v} onClick={() => setView(v)} style={{ background:view===v?"#fff":"transparent", border:"none", borderRadius:8, padding:"4px 12px", fontSize:11, fontWeight:view===v?600:400, color:view===v?"#1C1C1C":"#999", cursor:"pointer", boxShadow:view===v?"0 1px 4px rgba(0,0,0,0.08)":"none" }}>{l}</button>
              ))}
            </div>
            {view==="weekly" ? (
              <div style={{ display:"flex", alignItems:"center", gap:6, marginLeft:"auto" }}>
                <button onClick={() => setWStart(getMonday(today))} style={{ ...iBtnS, fontSize:11, padding:"4px 10px", border:"1px solid #E8E4DE", borderRadius:8 }}>Hoy</button>
                <button onClick={() => setWStart(d => addDays(d,-7))} style={iBtnS}>‹</button>
                <span style={{ fontSize:12, fontWeight:500, color:"#1C1C1C", minWidth:190, textAlign:"center" }}>{fmtWeekLabel()}</span>
                <button onClick={() => setWStart(d => addDays(d,7))} style={iBtnS}>›</button>
              </div>
            ) : (
              <div style={{ display:"flex", alignItems:"center", gap:6, marginLeft:"auto" }}>
                <button onClick={prevMonth} style={iBtnS}>‹</button>
                <span style={{ fontSize:12, fontWeight:500, color:"#1C1C1C", minWidth:150, textAlign:"center" }}>{MONTHS[cMonth]} {cYear}</span>
                <button onClick={nextMonth} style={iBtnS}>›</button>
              </div>
            )}
            <div style={{ display:"flex", gap:5 }}>
              {STATUSES.map(s => (
                <div key={s.value} style={{ display:"flex", alignItems:"center", gap:3, background:s.bg, borderRadius:20, padding:"2px 8px" }}>
                  <div style={{ width:5, height:5, borderRadius:"50%", background:s.color }} />
                  <span style={{ fontSize:10, color:s.color, fontWeight:500 }}>{s.label}</span>
                </div>
              ))}
            </div>
            <button onClick={() => setSettingsOpen(true)} style={{ ...iBtnS, background:brand.accent+"18", borderRadius:8, border:`1px solid ${brand.accent}55`, color:brand.accent, fontSize:12, padding:"4px 10px", fontWeight:500 }}>⚙ Personalizar</button>
          </div>

          {/* Weekly */}
          {view==="weekly" && (
            <div style={{ flex:1, overflowY:"auto", padding:"1rem" }}>
              {boardMembers.map(m => {
                const mTasks = boardTasks.filter(t => t.member_id === m.id);
                const wc = mTasks.filter(t => weekDates.some(d => fmtDate(d)===t.date)).length;
                return (
                  <div key={m.id} style={{ marginBottom:"1.5rem" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6, padding:"0 4px" }}>
                      <div style={{ width:22, height:22, borderRadius:"50%", background:m.color, display:"flex", alignItems:"center", justifyContent:"center" }}>
                        <span style={{ color:"#fff", fontSize:9, fontWeight:700 }}>{(m.name||"?")[0]}</span>
                      </div>
                      <span style={{ fontSize:13, fontWeight:600, color:"#1C1C1C" }}>{m.name}</span>
                      <span style={{ fontSize:11, color:"#bbb" }}>{wc} tarea{wc!==1?"s":""} esta semana</span>
                    </div>
                    <div style={{ display:"grid", gridTemplateColumns:"52px repeat(5,1fr)", border:"1px solid #E8E4DE", borderRadius:12, overflow:"hidden", background:"#fff" }}>
                      <div style={chS} />
                      {weekDates.map((d,i) => {
                        const isT = fmtDate(d)===fmtDate(today);
                        return <div key={i} style={{ ...chS, background:isT?m.color+"15":"#FAFAF9", borderLeft:"1px solid #E8E4DE" }}>
                          <span style={{ fontSize:9, color:"#bbb" }}>{WEEK_DAYS[i]}</span>
                          <span style={{ fontSize:13, color:isT?m.color:"#1C1C1C", fontWeight:isT?700:400 }}>{d.getDate()}</span>
                        </div>;
                      })}
                      {HOURS.map(hour => (
                        <>
                          <div key={hour+"L"} style={{ padding:"5px 4px", fontSize:9, color:"#ccc", textAlign:"right", borderTop:"1px solid #F0EDE8", background:"#FAFAF9", display:"flex", alignItems:"flex-start", justifyContent:"flex-end" }}>{hour}</div>
                          {weekDates.map((d,di) => {
                            const dk = fmtDate(d);
                            const ck = `${m.id}-${dk}-${hour}`;
                            const ct = mTasks.filter(t => t.date===dk&&t.hour===hour);
                            const isOver = dragOver===ck;
                            return (
                              <div key={di} onDragOver={e=>{e.preventDefault();setDragOver(ck);}} onDragLeave={()=>setDragOver(null)} onDrop={()=>onDropCell(m.id,dk,hour)}
                                onClick={()=>ct.length===0&&openAdd(m.id,dk,hour)}
                                style={{ borderLeft:"1px solid #E8E4DE", borderTop:"1px solid #F0EDE8", minHeight:34, padding:"3px 3px", background:isOver?m.color+"15":"transparent", transition:"background 0.1s", cursor:ct.length===0?"pointer":"default" }}>
                                {ct.map(t => <TaskChip key={t.id} t={t} />)}
                                {ct.length===0&&isOver&&<div style={{ fontSize:9, color:m.color, opacity:0.7 }}>Soltar</div>}
                              </div>
                            );
                          })}
                        </>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Monthly */}
          {view==="monthly" && (
            <div style={{ flex:1, overflowY:"auto", padding:"1rem" }}>
              {(() => {
                const dim=getDIM(cYear,cMonth), fd=getFD(cYear,cMonth);
                const cells=[];
                for(let i=0;i<fd;i++) cells.push(null);
                for(let d=1;d<=dim;d++) cells.push(d);
                while(cells.length%7!==0) cells.push(null);
                const weeks=[];
                for(let i=0;i<cells.length;i+=7) weeks.push(cells.slice(i,i+7));
                return (
                  <div style={{ minWidth:700 }}>
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:4, marginBottom:4 }}>
                      {DAYS_SHORT.map(d => <div key={d} style={{ textAlign:"center", fontSize:9, letterSpacing:2, color:"#bbb", textTransform:"uppercase", padding:"4px 0" }}>{d}</div>)}
                    </div>
                    {weeks.map((week,wi) => (
                      <div key={wi} style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:4, marginBottom:4 }}>
                        {week.map((day,di) => {
                          const isT = day&&day===today.getDate()&&cMonth===today.getMonth()&&cYear===today.getFullYear();
                          const dk  = day?`${cYear}-${cMonth}-${day}`:null;
                          const dt  = day?boardTasks.filter(t=>t.date===dk):[];
                          const ck  = `month-${dk}`;
                          const isOver = dragOver===ck;
                          return (
                            <div key={di} onDragOver={e=>{if(day){e.preventDefault();setDragOver(ck);}}} onDragLeave={()=>setDragOver(null)}
                              onDrop={()=>{if(day)onDropMonthCell(boardMembers[0]?.id,dk);}}
                              style={{ background:day?(isOver?"#F0EDE8":"#fff"):"transparent", border:isT?`2px solid ${board.accent}`:day?"1px solid #E8E4DE":"none", borderRadius:10, minHeight:100, padding:5 }}>
                              {day && <>
                                <div style={{ fontSize:11, fontWeight:isT?700:400, color:isT?board.accent:"#aaa", marginBottom:3 }}>{day}</div>
                                {boardMembers.map(m => dt.filter(t=>t.member_id===m.id).map(t => {
                                  const sm=statusMeta(t.status);
                                  return (
                                    <div key={t.id} draggable onDragStart={e=>{e.stopPropagation();onDragStartTask(t);}} onClick={()=>openEdit(t)}
                                      style={{ background:sm.bg, borderLeft:`2px solid ${sm.color}`, borderRadius:"0 4px 4px 0", padding:"2px 4px", fontSize:9, color:t.status==="terminada"?"#aaa":"#1C1C1C", textDecoration:t.status==="terminada"?"line-through":"none", marginBottom:2, cursor:"pointer", lineHeight:1.3, display:"flex", alignItems:"center", gap:3, overflow:"hidden" }}>
                                      <div style={{ width:5, height:5, borderRadius:"50%", background:m.color, flexShrink:0 }} />
                                      <span style={{ flex:1, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{t.title}</span>
                                      {t.link&&<span style={{ fontSize:8 }}>🔗</span>}
                                    </div>
                                  );
                                }))}
                              </>}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                    <div style={{ display:"flex", gap:"0.75rem", marginTop:"1rem", justifyContent:"center", flexWrap:"wrap" }}>
                      {boardMembers.map(m => (
                        <div key={m.id} style={{ display:"flex", alignItems:"center", gap:5 }}>
                          <div style={{ width:7, height:7, borderRadius:"50%", background:m.color }} />
                          <span style={{ fontSize:10, color:"#888" }}>{m.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {settingsOpen && renderSettings()}

      {/* Task modal */}
      {modal && (() => {
        const m = memberOf(modal.mode==="edit" ? modal.task.member_id : modal.memberId);
        if (!m) return null;
        return (
          <div onClick={() => setModal(null)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.35)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:300, backdropFilter:"blur(3px)" }}>
            <div onClick={e => e.stopPropagation()} style={{ background:"#fff", borderRadius:16, padding:"1.75rem", width:380, boxShadow:"0 20px 60px rgba(0,0,0,0.15)" }}>
              <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:"0.75rem" }}>
                <div style={{ width:20, height:20, borderRadius:"50%", background:m.color, display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <span style={{ color:"#fff", fontSize:8, fontWeight:700 }}>{(m.name||"?")[0]}</span>
                </div>
                <p style={{ fontSize:11, color:"#999", margin:0 }}>{m.name}{modal.mode==="add"&&modal.hour?` · ${modal.hour}`:""}</p>
                <div style={{ marginLeft:"auto", background:board.accent+"18", borderRadius:20, padding:"2px 8px" }}>
                  <span style={{ fontSize:10, color:board.accent }}>{board.label}</span>
                </div>
              </div>
              <p style={{ fontFamily:"'DM Serif Display',serif", fontSize:"1.15rem", color:"#1C1C1C", marginBottom:"1.1rem" }}>{modal.mode==="add"?"Nueva tarea":"Editar tarea"}</p>
              <label style={lbS}>Nombre de la tarea</label>
              <input autoFocus value={modalForm.title} onChange={e=>setField("title",e.target.value)} onKeyDown={e=>e.key==="Enter"&&saveModal()} placeholder="Nombre de la tarea..."
                style={{ ...inS, borderBottomColor:m.color, marginBottom:"1.1rem" }} />
              <label style={lbS}>Estado</label>
              <div style={{ display:"flex", gap:6, marginBottom:"1.1rem" }}>
                {STATUSES.map(s => (
                  <button key={s.value} onClick={() => setField("status",s.value)}
                    style={{ flex:1, background:modalForm.status===s.value?s.bg:"#F4F2EE", border:`1.5px solid ${modalForm.status===s.value?s.color:"transparent"}`, borderRadius:8, padding:"7px 4px", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
                    <div style={{ width:7, height:7, borderRadius:"50%", background:s.color }} />
                    <span style={{ fontSize:10, fontWeight:modalForm.status===s.value?600:400, color:modalForm.status===s.value?s.color:"#999" }}>{s.label}</span>
                  </button>
                ))}
              </div>
              <label style={lbS}>Link de entregable <span style={{ color:"#bbb", fontWeight:400 }}>(opcional)</span></label>
              <div style={{ position:"relative", marginBottom:"1.5rem" }}>
                <span style={{ position:"absolute", left:0, top:"50%", transform:"translateY(-50%)", fontSize:12, color:"#bbb" }}>🔗</span>
                <input value={modalForm.link} onChange={e=>setField("link",e.target.value)} placeholder="https://..." style={{ ...inS, paddingLeft:18, borderBottomColor:"#E8E4DE" }} />
              </div>
              <div style={{ display:"flex", gap:8, justifyContent:"space-between" }}>
                {modal.mode==="edit" && <button onClick={() => { deleteTask(modal.task.id); setModal(null); }} style={{ background:"none", border:"1px solid #FFD0C8", borderRadius:8, padding:"7px 12px", fontSize:12, cursor:"pointer", color:"#E8623A" }}>Eliminar</button>}
                <div style={{ display:"flex", gap:8, marginLeft:"auto" }}>
                  <button onClick={() => setModal(null)} style={{ background:"none", border:"1px solid #E8E4DE", borderRadius:8, padding:"7px 12px", fontSize:12, cursor:"pointer", color:"#666" }}>Cancelar</button>
                  <button onClick={saveModal} style={{ background:m.color, border:"none", borderRadius:8, padding:"7px 16px", fontSize:12, cursor:"pointer", color:"#fff", fontWeight:600 }}>{modal.mode==="add"?"Agregar":"Guardar"}</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
