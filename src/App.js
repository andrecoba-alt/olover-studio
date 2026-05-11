import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "./supabase";

// ─── Constants ───────────────────────────────────────────────────────────────
const STATUSES = [
  { value: "pendiente", label: "Pendiente", color: "#F0A500", bg: "#FFF8E7" },
  { value: "asignada",  label: "Asignada",  color: "#3A9E8A", bg: "#E8F7F5" },
  { value: "terminada", label: "Terminada", color: "#7B6BE0", bg: "#F2F0FD" },
];
const statusMeta = v => STATUSES.find(s => s.value === v) || STATUSES[0];

const TASK_COLORS = ["#E8623A","#3A6FE8","#7B6BE0","#3A9E8A","#C49A3C","#E06B9A","#4CAF50","#58A6FF","#FF6B6B","#845EC2"];

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
const HOUR_H     = 56; // px per hour block

const getMonday = d => { const x=new Date(d),day=x.getDay(); x.setDate(x.getDate()-day+(day===0?-6:1)); x.setHours(0,0,0,0); return x; };
const addDays   = (d,n) => { const x=new Date(d); x.setDate(x.getDate()+n); return x; };
const fmtDate   = d => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const getDIM    = (y,m) => new Date(y,m+1,0).getDate();
const getFD     = (y,m) => new Date(y,m,1).getDay();
const luminance = h => { const r=parseInt(h.slice(1,3),16)/255,g=parseInt(h.slice(3,5),16)/255,b=parseInt(h.slice(5,7),16)/255; return 0.299*r+0.587*g+0.114*b; };
const textOn    = bg => luminance(bg||"#fff") > 0.5 ? "#1C1C1C" : "#ffffff";
const hourIndex = h => HOURS.indexOf(h);

let _id = Date.now();
const uid = () => `t${_id++}`;

const lbS  = { display:"block", fontSize:9, letterSpacing:1, color:"#aaa", textTransform:"uppercase", marginBottom:5, fontWeight:500 };
const lbS2 = { display:"block", fontSize:10, letterSpacing:1, color:"#aaa", textTransform:"uppercase", marginBottom:8, fontWeight:500 };
const inS  = { width:"100%", border:"none", borderBottom:"2px solid #E8E4DE", padding:"6px 0", fontSize:14, outline:"none", background:"transparent", color:"#1C1C1C", boxSizing:"border-box" };
const iBtnS= { background:"none", border:"none", fontSize:17, cursor:"pointer", color:"#666", padding:"3px 7px", borderRadius:8, lineHeight:1 };

const EMPTY_FORM = { title:"", link:"", status:"pendiente", comments:"", client_id:"", color:"#E8623A", duration:1, assignees:[], reference_links:[] };

// ─── App ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [brand, setBrand]     = useState({ name:"OLOVER Studio", logo:null, navBg:"#111111", sidebarBg:"#1C1C1C", topbarBg:"#ffffff", accent:"#E8623A" });
  const [boards, setBoards]   = useState([]);
  const [members, setMembers] = useState([]);
  const [tasks, setTasks]     = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [boardId, setBoardId] = useState("animadores");
  const [sidebarOpen, setSidebarOpen]     = useState(true);
  const [settingsOpen, setSettingsOpen]   = useState(false);
  const [settingsTab, setSettingsTab]     = useState("marca");
  const [filterClient, setFilterClient]   = useState("");
  const [modal, setModal]                 = useState(null);
  const [modalForm, setModalForm]         = useState(EMPTY_FORM);
  const [newClientName, setNewClientName] = useState("");
  const [newTaskName, setNewTaskName]     = useState("");
  const [openGroups, setOpenGroups]       = useState({ pendiente:true, asignada:true, terminada:true });
  const [openClients, setOpenClients]     = useState({});
  const logoRef = useRef();

  const [views, setViews]           = useState({ animadores:"weekly", disenadores:"weekly", proveedores:"weekly" });
  const [weekStarts, setWeekStarts] = useState({ animadores:getMonday(today), disenadores:getMonday(today), proveedores:getMonday(today) });
  const [calYears, setCalYears]     = useState({ animadores:today.getFullYear(), disenadores:today.getFullYear(), proveedores:today.getFullYear() });
  const [calMonths, setCalMonths]   = useState({ animadores:today.getMonth(), disenadores:today.getMonth(), proveedores:today.getMonth() });

  // ── Load ──
  useEffect(() => {
    async function load() {
      const [{ data:br },{ data:bo },{ data:me },{ data:ta },{ data:as },{ data:cl }] = await Promise.all([
        supabase.from("brand").select("*").single(),
        supabase.from("boards").select("*").order("position"),
        supabase.from("members").select("*").order("position"),
        supabase.from("tasks").select("*").order("created_at"),
        supabase.from("task_assignments").select("*"),
        supabase.from("clients").select("*").order("position"),
      ]);
      if (br) setBrand({ name:br.name, logo:br.logo, navBg:br.nav_bg, sidebarBg:br.sidebar_bg, topbarBg:br.topbar_bg, accent:br.accent });
      if (bo) setBoards(bo);
      if (me) setMembers(me);
      if (ta) setTasks(ta);
      if (as) setAssignments(as);
      if (cl) setClients(cl);
      setLoading(false);
    }
    load();

    const reload = (table, setter, query) =>
      supabase.channel(`rt-${table}-${Math.random()}`).on("postgres_changes",{ event:"*", schema:"public", table },() => query().then(({data})=>data&&setter(data))).subscribe();

    const c1 = reload("tasks",            setTasks,       ()=>supabase.from("tasks").select("*").order("created_at"));
    const c2 = reload("task_assignments", setAssignments, ()=>supabase.from("task_assignments").select("*"));
    const c3 = reload("members",          setMembers,     ()=>supabase.from("members").select("*").order("position"));
    const c4 = reload("boards",           setBoards,      ()=>supabase.from("boards").select("*").order("position"));
    const c5 = reload("clients",          setClients,     ()=>supabase.from("clients").select("*").order("position"));
    const c6 = supabase.channel("rt-brand-x").on("postgres_changes",{event:"*",schema:"public",table:"brand"},()=>
      supabase.from("brand").select("*").single().then(({data})=>data&&setBrand({name:data.name,logo:data.logo,navBg:data.nav_bg,sidebarBg:data.sidebar_bg,topbarBg:data.topbar_bg,accent:data.accent}))).subscribe();

    return () => [c1,c2,c3,c4,c5,c6].forEach(c=>supabase.removeChannel(c));
  }, []);

  // ── Derived ──
  const board        = boards.find(b=>b.id===boardId)||boards[0];
  const boardMembers = members.filter(m=>m.board_id===boardId);

  const taskAssignees = useCallback((taskId) => {
    const ids = assignments.filter(a=>a.task_id===taskId).map(a=>a.member_id);
    return members.filter(m=>ids.includes(m.id));
  }, [assignments, members]);

  const memberTasks = useCallback((memberId) => {
    const assignedTaskIds = assignments.filter(a=>a.member_id===memberId).map(a=>a.task_id);
    return tasks.filter(t=>assignedTaskIds.includes(t.id)||(t.member_id===memberId&&assignedTaskIds.length===0));
  }, [assignments, tasks]);

  const allBoardTasks = useCallback(() => {
    const memberIds = boardMembers.map(m=>m.id);
    const assignedTaskIds = assignments.filter(a=>memberIds.includes(a.member_id)).map(a=>a.task_id);
    return tasks.filter(t=>assignedTaskIds.includes(t.id)||memberIds.includes(t.member_id));
  }, [assignments, tasks, boardMembers]);

  const clientOf = id => clients.find(c=>c.id===id);
  const memberOf = id => members.find(m=>m.id===id);

  const view   = views[boardId];
  const wStart = weekStarts[boardId];
  const cYear  = calYears[boardId];
  const cMonth = calMonths[boardId];

  const setView   = v  => setViews(p=>({...p,[boardId]:v}));
  const setWStart = fn => setWeekStarts(p=>({...p,[boardId]:typeof fn==="function"?fn(p[boardId]):fn}));
  const setCYear  = fn => setCalYears(p=>({...p,[boardId]:typeof fn==="function"?fn(p[boardId]):fn}));
  const setCMonth = fn => setCalMonths(p=>({...p,[boardId]:typeof fn==="function"?fn(p[boardId]):fn}));
  const weekDates = WEEK_DAYS.map((_,i)=>addDays(wStart,i));
  const fmtWeekLabel = () => { const e=addDays(wStart,4); return `${wStart.getDate()} – ${e.getDate()} ${MONTHS[e.getMonth()]} ${e.getFullYear()}`; };
  const prevMonth = () => { if(cMonth===0){setCMonth(11);setCYear(y=>y-1);}else setCMonth(m=>m-1); };
  const nextMonth = () => { if(cMonth===11){setCMonth(0);setCYear(y=>y+1);}else setCMonth(m=>m+1); };

  // ── CRUD ──
  const addTask = async (form, memberId, date, hour) => {
    const id = uid();
    const { assignees=[], reference_links=[], ...rest } = form;
    await supabase.from("tasks").insert({
      id, member_id: memberId||assignees[0]||"",
      board_id: boardId,
      title: rest.title||"Sin título",
      status: rest.status||"pendiente",
      link: rest.link||"",
      comments: rest.comments||"",
      client_id: rest.client_id||"",
      color: rest.color||"#E8623A",
      duration: rest.duration||1,
      reference_links: reference_links,
      date: date||null,
      hour: hour||null,
    });
    const allAssignees = [...new Set([...(memberId?[memberId]:[]), ...assignees])];
    if (allAssignees.length > 0) {
      await supabase.from("task_assignments").insert(allAssignees.map(mid=>({ id:uid(), task_id:id, member_id:mid })));
    }
  };

  const updateTask = async (id, patch) => {
    const { assignees, ...rest } = patch;
    const dbPatch = {};
    const fieldMap = { title:"title", status:"status", link:"link", date:"date", hour:"hour", comments:"comments", client_id:"client_id", color:"color", duration:"duration", reference_links:"reference_links", memberId:"member_id" };
    Object.keys(rest).forEach(k=>{ if(fieldMap[k]) dbPatch[fieldMap[k]]=rest[k]; });
    if (Object.keys(dbPatch).length>0) await supabase.from("tasks").update(dbPatch).eq("id",id);
    if (assignees) {
      await supabase.from("task_assignments").delete().eq("task_id",id);
      if (assignees.length>0) await supabase.from("task_assignments").insert(assignees.map(mid=>({id:uid(),task_id:id,member_id:mid})));
    }
  };

  const deleteTask = async id => {
    await supabase.from("task_assignments").delete().eq("task_id",id);
    await supabase.from("tasks").delete().eq("id",id);
  };

  const addMember = async (bId) => {
    const bm = members.filter(m=>m.board_id===bId);
    const colors = ["#E8623A","#3A6FE8","#7B6BE0","#3A9E8A","#C49A3C","#E06B9A"];
    const b = boards.find(x=>x.id===bId);
    await supabase.from("members").insert({ id:uid(), board_id:bId, name:`${b?.label||""} ${bm.length+1}`, color:colors[bm.length%colors.length], position:bm.length });
  };
  const updateMember = async (id,patch) => supabase.from("members").update(patch).eq("id",id);
  const deleteMember = async id => { await supabase.from("task_assignments").delete().eq("member_id",id); await supabase.from("members").delete().eq("id",id); };
  const addClient = async () => {
    if (!newClientName.trim()) return;
    const colors=["#E8623A","#3A6FE8","#7B6BE0","#3A9E8A","#C49A3C","#E06B9A","#4CAF50","#58A6FF"];
    await supabase.from("clients").insert({id:uid(),name:newClientName.trim(),color:colors[clients.length%colors.length],position:clients.length});
    setNewClientName("");
  };
  const updateClient = async (id,patch) => supabase.from("clients").update(patch).eq("id",id);
  const deleteClient = async id => supabase.from("clients").delete().eq("id",id);
  const updateBoard  = async (id,patch) => supabase.from("boards").update(patch).eq("id",id);
  const saveBrand = async b => {
    const {data} = await supabase.from("brand").select("id").single();
    await supabase.from("brand").update({name:b.name,logo:b.logo,nav_bg:b.navBg,sidebar_bg:b.sidebarBg,topbar_bg:b.topbarBg,accent:b.accent}).eq("id",data.id);
  };

  // ── Modal ──
  const openAdd = (memberId,date,hour) => {
    setModal({mode:"add",memberId,date,hour});
    setModalForm({...EMPTY_FORM, assignees:memberId?[memberId]:[], date:date||"", hour:hour||HOURS[0]});
  };
  const openEdit = task => {
    const assigneeIds = assignments.filter(a=>a.task_id===task.id).map(a=>a.member_id);
    setModal({mode:"edit",task});
    setModalForm({
      title:task.title, link:task.link||"", status:task.status||"pendiente",
      comments:task.comments||"", client_id:task.client_id||"",
      color:task.color||"#E8623A", duration:task.duration||1,
      assignees:assigneeIds, reference_links:task.reference_links||[],
      date:task.date||"", hour:task.hour||HOURS[0],
    });
  };
  const saveModal = async () => {
    if (!modalForm.title.trim()) return;
    if (modal.mode==="add") {
      await addTask(modalForm, modal.memberId, modalForm.date, modalForm.hour);
    } else {
      await updateTask(modal.task.id, {
        title:modalForm.title, link:modalForm.link, status:modalForm.status,
        comments:modalForm.comments, client_id:modalForm.client_id,
        color:modalForm.color, duration:modalForm.duration,
        reference_links:modalForm.reference_links, assignees:modalForm.assignees,
        date:modalForm.date, hour:modalForm.hour,
      });
    }
    setModal(null);
  };
  const setField = (k,v) => setModalForm(p=>({...p,[k]:v}));

  // ── Quick add from sidebar ──
  const quickAddTask = async () => {
    if (!newTaskName.trim()) return;
    await addTask({...EMPTY_FORM, title:newTaskName.trim()}, null, null, null);
    setNewTaskName("");
  };

  // ── Drag on calendar ──
  const dragTask = useRef(null);
  const onCalDragStart = (e, task) => { e.stopPropagation(); dragTask.current = { task }; };
  const onCalDrop = async (e, memberId, date, hour) => {
    e.preventDefault();
    if (!dragTask.current) return;
    const t = dragTask.current.task;
    const assigneeIds = assignments.filter(a=>a.task_id===t.id).map(a=>a.member_id);
    const newAssignees = assigneeIds.includes(memberId) ? assigneeIds : [...assigneeIds.filter(id=>{ const m=memberOf(id); return m&&m.board_id!==board?.id; }), memberId];
    await updateTask(t.id, { date, hour, memberId, assignees:newAssignees });
    dragTask.current = null;
  };

  const handleLogoUpload = e => {
    const file=e.target.files[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=ev=>setBrand(p=>({...p,logo:ev.target.result}));
    reader.readAsDataURL(file);
  };

  if (loading) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#F4F2EE",flexDirection:"column",gap:12}}>
      <div style={{width:40,height:40,borderRadius:10,background:"#E8623A",display:"flex",alignItems:"center",justifyContent:"center"}}>
        <span style={{color:"#fff",fontSize:14,fontWeight:700}}>OL</span>
      </div>
      <p style={{fontSize:13,color:"#aaa"}}>Cargando OLOVER Studio...</p>
    </div>
  );

  // ── Sidebar task list ──
  const SidebarTasks = () => {
    const allT = allBoardTasks();
    const filtered = filterClient ? allT.filter(t=>t.client_id===filterClient) : allT;

    return (
      <div style={{flex:1,overflowY:"auto",padding:"0.5rem"}}>
        {/* Quick add */}
        <div style={{display:"flex",gap:6,marginBottom:8}}>
          <input value={newTaskName} onChange={e=>setNewTaskName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&quickAddTask()}
            placeholder="Nueva tarea..." style={{flex:1,background:"#2a2a2a",border:"none",borderRadius:8,color:"#F4F2EE",fontSize:11,padding:"6px 8px",outline:"none"}}/>
          <button onClick={quickAddTask} style={{background:brand.accent,border:"none",borderRadius:8,color:textOn(brand.accent),fontSize:16,cursor:"pointer",width:28,fontWeight:700}}>+</button>
        </div>

        {STATUSES.map(st=>{
          const stTasks = filtered.filter(t=>t.status===st.value);
          const isOpen  = openGroups[st.value];
          // Group by client
          const byClient = {};
          stTasks.forEach(t=>{
            const key = t.client_id||"sin-cliente";
            if (!byClient[key]) byClient[key]=[];
            byClient[key].push(t);
          });

          return (
            <div key={st.value} style={{marginBottom:6}}>
              <button onClick={()=>setOpenGroups(p=>({...p,[st.value]:!p[st.value]}))}
                style={{display:"flex",alignItems:"center",gap:6,background:"none",border:"none",cursor:"pointer",width:"100%",padding:"4px 6px",borderRadius:6}}>
                <span style={{fontSize:8,color:st.color}}>●</span>
                <span style={{fontSize:10,fontWeight:600,color:st.color,textTransform:"uppercase",letterSpacing:1}}>{st.label}</span>
                <span style={{fontSize:10,color:"#555",marginLeft:"auto"}}>{stTasks.length}</span>
                <span style={{fontSize:10,color:"#555"}}>{isOpen?"▾":"▸"}</span>
              </button>
              {isOpen && Object.entries(byClient).map(([cKey,cTasks])=>{
                const cl = cKey==="sin-cliente" ? null : clientOf(cKey);
                const isClientOpen = openClients[`${st.value}-${cKey}`]!==false;
                return (
                  <div key={cKey} style={{marginLeft:8,marginBottom:2}}>
                    <button onClick={()=>setOpenClients(p=>({...p,[`${st.value}-${cKey}`]:!isClientOpen}))}
                      style={{display:"flex",alignItems:"center",gap:5,background:"none",border:"none",cursor:"pointer",width:"100%",padding:"3px 4px",borderRadius:4}}>
                      {cl&&<div style={{width:6,height:6,borderRadius:"50%",background:cl.color,flexShrink:0}}/>}
                      <span style={{fontSize:10,color:cl?cl.color:"#555",fontWeight:500}}>{cl?cl.name:"Sin cliente"}</span>
                      <span style={{fontSize:9,color:"#444",marginLeft:"auto"}}>{cTasks.length} {isClientOpen?"▾":"▸"}</span>
                    </button>
                    {isClientOpen && cTasks.map(t=>{
                      const assignees = taskAssignees(t.id);
                      return (
                        <div key={t.id} onDoubleClick={()=>openEdit(t)}
                          style={{display:"flex",alignItems:"flex-start",gap:5,padding:"5px 6px",margin:"2px 0",background:"#252525",border:`1px solid ${t.color}33`,borderLeft:`3px solid ${t.color||"#444"}`,borderRadius:"0 6px 6px 0",cursor:"pointer"}}>
                          <div style={{flex:1,minWidth:0}}>
                            <p style={{fontSize:11,color:t.status==="terminada"?"#555":"#ddd",margin:0,lineHeight:1.3,textDecoration:t.status==="terminada"?"line-through":"none",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{t.title}</p>
                            {assignees.length>0&&<div style={{display:"flex",gap:2,marginTop:3,flexWrap:"wrap"}}>
                              {assignees.map(m=><span key={m.id} style={{fontSize:9,background:m.color+"33",color:m.color,borderRadius:10,padding:"1px 5px"}}>{m.name}</span>)}
                            </div>}
                            {t.date&&<p style={{fontSize:9,color:"#555",margin:"2px 0 0"}}>{t.date} {t.hour&&`· ${t.hour}`}</p>}
                          </div>
                          <button onClick={e=>{e.stopPropagation();openEdit(t);}} style={{background:"none",border:"none",color:"#555",fontSize:11,cursor:"pointer",padding:0,flexShrink:0}}>✎</button>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          );
        })}
        {filtered.length===0&&<p style={{fontSize:11,color:"#333",textAlign:"center",marginTop:"1.5rem"}}>Sin tareas</p>}
      </div>
    );
  };

  // ── Task block on calendar ──
  const TaskBlock = ({ t, memberId }) => {
    const cl = clientOf(t.client_id);
    const dur = t.duration||1;
    const height = dur*HOUR_H - 4;
    return (
      <div draggable onDragStart={e=>onCalDragStart(e,t)} onDoubleClick={e=>{e.stopPropagation();openEdit(t);}}
        style={{position:"absolute",left:2,right:2,top:2,height,background:t.color||"#E8623A",borderRadius:6,padding:"3px 6px",cursor:"grab",overflow:"hidden",zIndex:2,boxShadow:"0 1px 4px rgba(0,0,0,0.15)"}}>
        <p style={{fontSize:10,fontWeight:600,color:textOn(t.color||"#E8623A"),margin:0,lineHeight:1.3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.title}</p>
        {cl&&<p style={{fontSize:9,color:textOn(t.color||"#E8623A"),opacity:0.8,margin:0}}>{cl.name}</p>}
        {dur>1&&<p style={{fontSize:9,color:textOn(t.color||"#E8623A"),opacity:0.7,margin:0}}>{dur}h</p>}
      </div>
    );
  };

  // ── Settings ──
  const renderSettings = () => (
    <div onClick={()=>setSettingsOpen(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:400}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:20,width:540,maxHeight:"85vh",overflowY:"auto",boxShadow:"0 24px 64px rgba(0,0,0,0.18)",display:"flex",flexDirection:"column"}}>
        <div style={{padding:"1.5rem 1.5rem 1rem",borderBottom:"1px solid #F0EDE8",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div>
            <p style={{fontSize:9,letterSpacing:2,color:"#bbb",textTransform:"uppercase",marginBottom:3}}>Configuración</p>
            <p style={{fontFamily:"'DM Serif Display',serif",fontSize:"1.2rem",color:"#1C1C1C",margin:0}}>Personalizar plataforma</p>
          </div>
          <button onClick={()=>setSettingsOpen(false)} style={{background:"none",border:"1px solid #E8E4DE",borderRadius:10,width:34,height:34,cursor:"pointer",fontSize:16,color:"#999"}}>✕</button>
        </div>
        <div style={{display:"flex",gap:4,padding:"0.75rem 1.5rem",borderBottom:"1px solid #F0EDE8",flexWrap:"wrap"}}>
          {[["marca","Marca"],["colores","Colores"],["tableros","Tableros"],["clientes","Clientes"]].map(([t,l])=>(
            <button key={t} onClick={()=>setSettingsTab(t)} style={{background:settingsTab===t?brand.accent:"#F4F2EE",border:"none",borderRadius:20,padding:"5px 14px",fontSize:11,fontWeight:settingsTab===t?600:400,color:settingsTab===t?"#fff":"#888",cursor:"pointer"}}>{l}</button>
          ))}
        </div>
        <div style={{padding:"1.25rem 1.5rem",flex:1}}>
          {settingsTab==="marca"&&(
            <div style={{display:"flex",flexDirection:"column",gap:"1.5rem"}}>
              <div>
                <label style={lbS2}>Logo</label>
                <div style={{display:"flex",alignItems:"center",gap:"1rem"}}>
                  <div style={{width:72,height:72,borderRadius:14,background:brand.navBg,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",border:"2px dashed #444",cursor:"pointer",flexShrink:0}} onClick={()=>logoRef.current.click()}>
                    {brand.logo?<img src={brand.logo} alt="logo" style={{width:"100%",height:"100%",objectFit:"contain",padding:4}}/>:<span style={{fontSize:22,color:"#666"}}>+</span>}
                  </div>
                  <div>
                    <button onClick={()=>logoRef.current.click()} style={{background:brand.accent,border:"none",borderRadius:8,padding:"7px 14px",fontSize:12,color:textOn(brand.accent),cursor:"pointer",fontWeight:600,display:"block",marginBottom:6}}>{brand.logo?"Cambiar":"Subir logo"}</button>
                    {brand.logo&&<button onClick={()=>setBrand(p=>({...p,logo:null}))} style={{background:"none",border:"1px solid #FFD0C8",borderRadius:8,padding:"5px 12px",fontSize:11,color:"#E8623A",cursor:"pointer"}}>Quitar</button>}
                  </div>
                </div>
                <input ref={logoRef} type="file" accept="image/*" onChange={handleLogoUpload} style={{display:"none"}}/>
              </div>
              <div>
                <label style={lbS2}>Nombre</label>
                <input defaultValue={brand.name} onBlur={e=>setBrand(p=>({...p,name:e.target.value}))} style={{...inS,borderBottomColor:brand.accent}}/>
              </div>
            </div>
          )}
          {settingsTab==="colores"&&(
            <div style={{display:"flex",flexDirection:"column",gap:"1.25rem"}}>
              <div>
                <label style={lbS2}>Paletas</label>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  {PRESETS.map(pr=>(
                    <button key={pr.name} onClick={()=>setBrand(p=>({...p,navBg:pr.navBg,sidebarBg:pr.sidebarBg,topbarBg:pr.topbarBg,accent:pr.accent}))}
                      style={{background:pr.navBg,border:`2px solid ${brand.navBg===pr.navBg&&brand.accent===pr.accent?pr.accent:"transparent"}`,borderRadius:10,padding:"8px 10px",cursor:"pointer",display:"flex",flexDirection:"column",gap:4,alignItems:"center"}}>
                      <div style={{display:"flex",gap:3}}>{[pr.navBg,pr.sidebarBg,pr.accent].map((c,i)=><div key={i} style={{width:14,height:14,borderRadius:4,background:c}}/>)}</div>
                      <span style={{fontSize:10,color:textOn(pr.navBg),fontWeight:500}}>{pr.name}</span>
                    </button>
                  ))}
                </div>
              </div>
              {[["accent","Acento"],["navBg","Nav"],["sidebarBg","Sidebar"],["topbarBg","Topbar"]].map(([key,label])=>(
                <div key={key} style={{display:"flex",alignItems:"center",gap:"1rem"}}>
                  <div style={{position:"relative"}}>
                    <div style={{width:44,height:44,borderRadius:10,background:brand[key],border:"1px solid #E8E4DE",cursor:"pointer"}} onClick={()=>document.getElementById(`pick-${key}`).click()}/>
                    <input id={`pick-${key}`} type="color" value={brand[key]} onChange={e=>setBrand(p=>({...p,[key]:e.target.value}))} style={{position:"absolute",opacity:0,width:44,height:44,top:0,left:0}}/>
                  </div>
                  <span style={{fontSize:13,color:"#1C1C1C"}}>{label}</span>
                  <span style={{marginLeft:"auto",fontSize:11,color:"#bbb",fontFamily:"monospace"}}>{brand[key]}</span>
                </div>
              ))}
            </div>
          )}
          {settingsTab==="tableros"&&(
            <div style={{display:"flex",flexDirection:"column",gap:"1.25rem"}}>
              {boards.map(b=>(
                <div key={b.id} style={{border:"1px solid #F0EDE8",borderRadius:12,padding:"1rem",background:"#FAFAF9"}}>
                  <div style={{display:"flex",alignItems:"center",gap:"0.75rem",marginBottom:"0.75rem"}}>
                    <span style={{fontSize:16,color:b.accent}}>{b.icon}</span>
                    <input key={b.id+b.label} defaultValue={b.label} onBlur={e=>updateBoard(b.id,{label:e.target.value})}
                      style={{flex:1,border:"none",borderBottom:`2px solid ${b.accent}`,fontSize:14,fontWeight:600,outline:"none",background:"transparent",color:"#1C1C1C",padding:"2px 0"}}/>
                    <div style={{position:"relative"}}>
                      <div style={{width:28,height:28,borderRadius:8,background:b.accent,cursor:"pointer",border:"1px solid #E8E4DE"}} onClick={()=>document.getElementById(`pick-board-${b.id}`).click()}/>
                      <input id={`pick-board-${b.id}`} type="color" value={b.accent} onChange={e=>updateBoard(b.id,{accent:e.target.value})} style={{position:"absolute",opacity:0,width:28,height:28,top:0,left:0}}/>
                    </div>
                  </div>
                  {members.filter(m=>m.board_id===b.id).map(m=>(
                    <div key={m.id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                      <div style={{width:22,height:22,borderRadius:"50%",background:m.color,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                        <span style={{color:"#fff",fontSize:9,fontWeight:700}}>{(m.name||"?")[0]}</span>
                      </div>
                      <input key={m.id+m.name} defaultValue={m.name||""} onBlur={e=>updateMember(m.id,{name:e.target.value})}
                        style={{flex:1,border:"none",borderBottom:"1px solid #E8E4DE",fontSize:12,outline:"none",background:"transparent",color:"#555",padding:"2px 0"}}/>
                      <div style={{position:"relative"}}>
                        <div style={{width:20,height:20,borderRadius:6,background:m.color,cursor:"pointer",border:"1px solid #ddd"}} onClick={()=>document.getElementById(`pick-m-${m.id}`).click()}/>
                        <input id={`pick-m-${m.id}`} type="color" value={m.color} onChange={e=>updateMember(m.id,{color:e.target.value})} style={{position:"absolute",opacity:0,width:20,height:20,top:0,left:0}}/>
                      </div>
                      <button onClick={()=>deleteMember(m.id)} style={{background:"none",border:"none",color:"#ccc",fontSize:14,cursor:"pointer"}}>✕</button>
                    </div>
                  ))}
                  <button onClick={()=>addMember(b.id)} style={{display:"flex",alignItems:"center",gap:6,background:"none",border:"1px dashed #ddd",borderRadius:8,padding:"5px 10px",fontSize:11,color:"#aaa",cursor:"pointer",width:"100%",marginTop:4}}>
                    <span style={{fontSize:16}}>+</span> Agregar persona
                  </button>
                </div>
              ))}
            </div>
          )}
          {settingsTab==="clientes"&&(
            <div style={{display:"flex",flexDirection:"column",gap:"0.75rem"}}>
              <label style={lbS2}>Negocios / Clientes</label>
              <div style={{display:"flex",gap:6,marginBottom:8}}>
                <input value={newClientName} onChange={e=>setNewClientName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addClient()}
                  placeholder="Nombre del cliente..." style={{flex:1,border:"none",borderBottom:`2px solid ${brand.accent}`,padding:"6px 0",fontSize:13,outline:"none",background:"transparent",color:"#1C1C1C"}}/>
                <button onClick={addClient} style={{background:brand.accent,border:"none",borderRadius:8,color:textOn(brand.accent),fontSize:16,cursor:"pointer",width:32,fontWeight:700}}>+</button>
              </div>
              {clients.map(c=>(
                <div key={c.id} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",background:"#FAFAF9",border:"1px solid #F0EDE8",borderRadius:10}}>
                  <div style={{width:10,height:10,borderRadius:"50%",background:c.color,flexShrink:0}}/>
                  <input key={c.id+c.name} defaultValue={c.name} onBlur={e=>updateClient(c.id,{name:e.target.value})}
                    style={{flex:1,border:"none",fontSize:13,outline:"none",background:"transparent",color:"#1C1C1C"}}/>
                  <div style={{position:"relative"}}>
                    <div style={{width:20,height:20,borderRadius:6,background:c.color,cursor:"pointer",border:"1px solid #ddd"}} onClick={()=>document.getElementById(`pick-c-${c.id}`).click()}/>
                    <input id={`pick-c-${c.id}`} type="color" value={c.color} onChange={e=>updateClient(c.id,{color:e.target.value})} style={{position:"absolute",opacity:0,width:20,height:20,top:0,left:0}}/>
                  </div>
                  <button onClick={()=>deleteClient(c.id)} style={{background:"none",border:"none",color:"#ccc",fontSize:14,cursor:"pointer"}}>✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{padding:"1rem 1.5rem",borderTop:"1px solid #F0EDE8",display:"flex",justifyContent:"flex-end"}}>
          <button onClick={async()=>{await saveBrand(brand);setSettingsOpen(false);}} style={{background:brand.accent,border:"none",borderRadius:10,padding:"9px 22px",fontSize:13,color:textOn(brand.accent),cursor:"pointer",fontWeight:600}}>Guardar cambios</button>
        </div>
      </div>
    </div>
  );

  // ── Task Modal ──
  const renderModal = () => {
    const isEdit = modal.mode==="edit";
    const refLinks = modalForm.reference_links||[];
    return (
      <div onClick={()=>setModal(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.35)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:300,backdropFilter:"blur(3px)"}}>
        <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:20,padding:"1.75rem",width:500,maxHeight:"92vh",overflowY:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.15)"}}>
          {/* Header */}
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:"1rem"}}>
            <div style={{width:14,height:14,borderRadius:"50%",background:modalForm.color||"#E8623A"}}/>
            <p style={{fontFamily:"'DM Serif Display',serif",fontSize:"1.15rem",color:"#1C1C1C",margin:0,flex:1}}>{isEdit?"Editar tarea":"Nueva tarea"}</p>
            <div style={{position:"relative"}}>
              <div style={{width:28,height:28,borderRadius:8,background:modalForm.color,cursor:"pointer",border:"1px solid #E8E4DE"}} onClick={()=>document.getElementById("pick-task-color").click()}/>
              <input id="pick-task-color" type="color" value={modalForm.color} onChange={e=>setField("color",e.target.value)} style={{position:"absolute",opacity:0,width:28,height:28,top:0,left:0}}/>
            </div>
            <div style={{display:"flex",gap:3}}>
              {TASK_COLORS.map(c=><div key={c} onClick={()=>setField("color",c)} style={{width:16,height:16,borderRadius:"50%",background:c,cursor:"pointer",outline:modalForm.color===c?"2px solid #1C1C1C":"none",outlineOffset:1}}/>)}
            </div>
          </div>

          {/* Título */}
          <label style={lbS}>Nombre de la tarea</label>
          <input autoFocus value={modalForm.title} onChange={e=>setField("title",e.target.value)} placeholder="Nombre de la tarea..."
            style={{...inS,borderBottomColor:modalForm.color,marginBottom:"1.1rem"}}/>

          {/* Cliente */}
          <label style={lbS}>Cliente / Negocio</label>
          <select value={modalForm.client_id} onChange={e=>setField("client_id",e.target.value)}
            style={{width:"100%",border:"none",borderBottom:"2px solid #E8E4DE",padding:"6px 0",fontSize:13,outline:"none",background:"transparent",color:"#1C1C1C",marginBottom:"1.1rem",cursor:"pointer"}}>
            <option value="">— Sin cliente —</option>
            {clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          {/* Asignados */}
          <label style={lbS}>Asignar a</label>
          <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:"1.1rem"}}>
            {members.map(m=>{
              const sel = modalForm.assignees.includes(m.id);
              const brd = boards.find(b=>b.id===m.board_id);
              return (
                <button key={m.id} onClick={()=>setField("assignees",sel?modalForm.assignees.filter(id=>id!==m.id):[...modalForm.assignees,m.id])}
                  style={{display:"flex",alignItems:"center",gap:5,background:sel?m.color:"#F4F2EE",border:`1.5px solid ${sel?m.color:"transparent"}`,borderRadius:20,padding:"4px 10px",cursor:"pointer",transition:"all 0.15s"}}>
                  <div style={{width:16,height:16,borderRadius:"50%",background:sel?"rgba(255,255,255,0.3)":m.color,display:"flex",alignItems:"center",justifyContent:"center"}}>
                    <span style={{color:"#fff",fontSize:8,fontWeight:700}}>{(m.name||"?")[0]}</span>
                  </div>
                  <span style={{fontSize:11,color:sel?textOn(m.color):"#555",fontWeight:sel?600:400}}>{m.name}</span>
                  {brd&&<span style={{fontSize:9,color:sel?textOn(m.color)+"99":"#aaa"}}>({brd.label})</span>}
                </button>
              );
            })}
          </div>

          {/* Fecha y hora */}
          <div style={{display:"flex",gap:12,marginBottom:"1.1rem"}}>
            <div style={{flex:1}}>
              <label style={lbS}>Fecha</label>
              <input type="date" value={modalForm.date||""} onChange={e=>setField("date",e.target.value)}
                style={{...inS,borderBottomColor:"#E8E4DE",fontSize:13}}/>
            </div>
            <div style={{flex:1}}>
              <label style={lbS}>Hora inicio</label>
              <select value={modalForm.hour||HOURS[0]} onChange={e=>setField("hour",e.target.value)}
                style={{width:"100%",border:"none",borderBottom:"2px solid #E8E4DE",padding:"6px 0",fontSize:13,outline:"none",background:"transparent",color:"#1C1C1C",cursor:"pointer"}}>
                {HOURS.map(h=><option key={h} value={h}>{h}</option>)}
              </select>
            </div>
            <div style={{width:80}}>
              <label style={lbS}>Duración (h)</label>
              <select value={modalForm.duration||1} onChange={e=>setField("duration",parseInt(e.target.value))}
                style={{width:"100%",border:"none",borderBottom:"2px solid #E8E4DE",padding:"6px 0",fontSize:13,outline:"none",background:"transparent",color:"#1C1C1C",cursor:"pointer"}}>
                {[1,2,3,4,5,6,7,8].map(h=><option key={h} value={h}>{h}h</option>)}
              </select>
            </div>
          </div>

          {/* Estado */}
          <label style={lbS}>Estado</label>
          <div style={{display:"flex",gap:6,marginBottom:"1.1rem"}}>
            {STATUSES.map(s=>(
              <button key={s.value} onClick={()=>setField("status",s.value)}
                style={{flex:1,background:modalForm.status===s.value?s.bg:"#F4F2EE",border:`1.5px solid ${modalForm.status===s.value?s.color:"transparent"}`,borderRadius:8,padding:"7px 4px",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                <div style={{width:7,height:7,borderRadius:"50%",background:s.color}}/>
                <span style={{fontSize:10,fontWeight:modalForm.status===s.value?600:400,color:modalForm.status===s.value?s.color:"#999"}}>{s.label}</span>
              </button>
            ))}
          </div>

          {/* Comentarios */}
          <label style={lbS}>Instrucciones / Comentarios</label>
          <textarea value={modalForm.comments} onChange={e=>setField("comments",e.target.value)} placeholder="Instrucciones para el equipo..."
            style={{width:"100%",border:"1px solid #E8E4DE",borderRadius:10,padding:"10px 12px",fontSize:13,outline:"none",background:"#FAFAF9",color:"#1C1C1C",resize:"vertical",minHeight:80,fontFamily:"'DM Sans',sans-serif",marginBottom:"1.1rem",boxSizing:"border-box"}}/>

          {/* Links de referencia */}
          <label style={lbS}>Links de referencia</label>
          {refLinks.map((rl,i)=>(
            <div key={i} style={{display:"flex",gap:6,marginBottom:6,alignItems:"center"}}>
              <input value={rl.name||""} onChange={e=>{ const a=[...refLinks]; a[i]={...a[i],name:e.target.value}; setField("reference_links",a); }}
                placeholder="Nombre (ej: Briefing)" style={{width:130,border:"none",borderBottom:"1px solid #E8E4DE",fontSize:12,outline:"none",background:"transparent",color:"#1C1C1C",padding:"4px 0"}}/>
              <input value={rl.url||""} onChange={e=>{ const a=[...refLinks]; a[i]={...a[i],url:e.target.value}; setField("reference_links",a); }}
                placeholder="https://..." style={{flex:1,border:"none",borderBottom:"1px solid #E8E4DE",fontSize:12,outline:"none",background:"transparent",color:"#1C1C1C",padding:"4px 0"}}/>
              <button onClick={()=>setField("reference_links",refLinks.filter((_,j)=>j!==i))} style={{background:"none",border:"none",color:"#ccc",cursor:"pointer",fontSize:14}}>✕</button>
            </div>
          ))}
          <button onClick={()=>setField("reference_links",[...refLinks,{name:"",url:""}])}
            style={{display:"flex",alignItems:"center",gap:5,background:"none",border:"1px dashed #ddd",borderRadius:8,padding:"5px 10px",fontSize:11,color:"#aaa",cursor:"pointer",marginBottom:"1.1rem"}}>
            <span style={{fontSize:16}}>+</span> Agregar link de referencia
          </button>

          {/* Link entregable */}
          <label style={lbS}>Link de entregable <span style={{color:"#bbb",fontWeight:400}}>(opcional)</span></label>
          <div style={{position:"relative",marginBottom:"1.5rem"}}>
            <span style={{position:"absolute",left:0,top:"50%",transform:"translateY(-50%)",fontSize:12,color:"#bbb"}}>🔗</span>
            <input value={modalForm.link} onChange={e=>setField("link",e.target.value)} placeholder="https://..." style={{...inS,paddingLeft:18,borderBottomColor:"#E8E4DE"}}/>
          </div>

          {/* Botones */}
          <div style={{display:"flex",gap:8,justifyContent:"space-between"}}>
            {isEdit&&<button onClick={()=>{deleteTask(modal.task.id);setModal(null);}} style={{background:"none",border:"1px solid #FFD0C8",borderRadius:8,padding:"7px 12px",fontSize:12,cursor:"pointer",color:"#E8623A"}}>Eliminar</button>}
            <div style={{display:"flex",gap:8,marginLeft:"auto"}}>
              <button onClick={()=>setModal(null)} style={{background:"none",border:"1px solid #E8E4DE",borderRadius:8,padding:"7px 12px",fontSize:12,cursor:"pointer",color:"#666"}}>Cancelar</button>
              <button onClick={saveModal} style={{background:modalForm.color,border:"none",borderRadius:8,padding:"7px 16px",fontSize:12,cursor:"pointer",color:textOn(modalForm.color),fontWeight:600}}>{isEdit?"Guardar":"Agregar"}</button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ── Render ──
  return (
    <div style={{display:"flex",height:"100vh",background:"#F4F2EE",fontFamily:"'DM Sans',sans-serif",overflow:"hidden"}}>
      {/* Left nav */}
      <div style={{width:64,background:brand.navBg,display:"flex",flexDirection:"column",alignItems:"center",paddingTop:14,gap:4,zIndex:20,flexShrink:0}}>
        <div style={{width:38,height:38,borderRadius:10,background:brand.logo?"transparent":brand.accent,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:10,overflow:"hidden",flexShrink:0}}>
          {brand.logo?<img src={brand.logo} alt="logo" style={{width:"100%",height:"100%",objectFit:"contain"}}/>:<span style={{color:textOn(brand.accent),fontSize:12,fontWeight:700}}>{brand.name.slice(0,2).toUpperCase()}</span>}
        </div>
        {boards.map(b=>(
          <button key={b.id} onClick={()=>setBoardId(b.id)} title={b.label}
            style={{width:44,height:44,borderRadius:12,border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",background:boardId===b.id?b.accent+"28":"transparent",outline:boardId===b.id?`2px solid ${b.accent}`:"2px solid transparent",transition:"all 0.15s"}}>
            <span style={{fontSize:16,color:boardId===b.id?b.accent:"#555"}}>{b.icon}</span>
          </button>
        ))}
        <div style={{flex:1}}/>
        <button onClick={()=>setSettingsOpen(true)} style={{width:44,height:44,borderRadius:12,border:"none",cursor:"pointer",background:"transparent",color:"#555",fontSize:18,marginBottom:4}}>⚙</button>
        <button onClick={()=>setSidebarOpen(o=>!o)} style={{width:44,height:44,borderRadius:12,border:"none",cursor:"pointer",background:"transparent",color:"#555",fontSize:18,marginBottom:12}}>☰</button>
      </div>

      {/* Sidebar */}
      {sidebarOpen&&board&&(
        <div style={{width:260,background:brand.sidebarBg,display:"flex",flexDirection:"column",zIndex:10,flexShrink:0}}>
          <div style={{padding:"1.1rem 1rem 0.75rem",borderBottom:"1px solid #2a2a2a"}}>
            <p style={{fontSize:9,letterSpacing:3,color:"#444",textTransform:"uppercase",marginBottom:4}}>{brand.name}</p>
            <div style={{display:"flex",alignItems:"center",gap:7}}>
              <span style={{fontSize:15,color:board.accent}}>{board.icon}</span>
              <p style={{fontFamily:"'DM Serif Display',serif",fontSize:"1.05rem",color:"#F4F2EE",margin:0}}>{board.label}</p>
            </div>
          </div>
          <div style={{padding:"0.5rem 1rem",borderBottom:"1px solid #2a2a2a"}}>
            <p style={{fontSize:9,letterSpacing:2,color:"#444",textTransform:"uppercase",marginBottom:6}}>Equipo</p>
            <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
              {boardMembers.map(m=>(
                <div key={m.id} style={{display:"flex",alignItems:"center",gap:4}}>
                  <div style={{width:18,height:18,borderRadius:"50%",background:m.color,display:"flex",alignItems:"center",justifyContent:"center"}}>
                    <span style={{color:"#fff",fontSize:8,fontWeight:700}}>{(m.name||"?")[0]}</span>
                  </div>
                  <span style={{fontSize:11,color:"#bbb"}}>{m.name}</span>
                </div>
              ))}
            </div>
          </div>
          {/* Filter */}
          <div style={{padding:"0.5rem 1rem",borderBottom:"1px solid #2a2a2a"}}>
            <select value={filterClient} onChange={e=>setFilterClient(e.target.value)}
              style={{width:"100%",background:"#2a2a2a",border:"none",borderRadius:8,color:"#bbb",fontSize:11,padding:"5px 8px",outline:"none",cursor:"pointer"}}>
              <option value="">Todos los clientes</option>
              {clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <SidebarTasks/>
          <div style={{padding:"0.5rem 1rem",borderTop:"1px solid #2a2a2a"}}>
            <button onClick={()=>openAdd(null,null,null)} style={{width:"100%",background:brand.accent,border:"none",borderRadius:8,color:textOn(brand.accent),fontSize:12,cursor:"pointer",padding:"7px",fontWeight:600}}>+ Nueva tarea</button>
          </div>
        </div>
      )}

      {/* Main */}
      {board&&(
        <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
          {/* Topbar */}
          <div style={{background:brand.topbarBg,borderBottom:"1px solid #E8E4DE",padding:"0.6rem 1.25rem",display:"flex",alignItems:"center",gap:"0.75rem",flexWrap:"wrap"}}>
            <div style={{display:"flex",gap:6}}>
              {boards.map(b=>(
                <button key={b.id} onClick={()=>setBoardId(b.id)}
                  style={{display:"flex",alignItems:"center",gap:5,background:boardId===b.id?b.accent:"#F4F2EE",border:"none",borderRadius:20,padding:"5px 12px",cursor:"pointer",transition:"all 0.15s"}}>
                  <span style={{fontSize:11,color:boardId===b.id?textOn(b.accent):"#888"}}>{b.icon}</span>
                  <span style={{fontSize:11,fontWeight:boardId===b.id?600:400,color:boardId===b.id?textOn(b.accent):"#888"}}>{b.label}</span>
                </button>
              ))}
            </div>
            <div style={{display:"flex",background:"#F4F2EE",borderRadius:10,padding:3,gap:2}}>
              {[["weekly","Semana"],["monthly","Mes"]].map(([v,l])=>(
                <button key={v} onClick={()=>setView(v)} style={{background:view===v?"#fff":"transparent",border:"none",borderRadius:8,padding:"4px 12px",fontSize:11,fontWeight:view===v?600:400,color:view===v?"#1C1C1C":"#999",cursor:"pointer",boxShadow:view===v?"0 1px 4px rgba(0,0,0,0.08)":"none"}}>{l}</button>
              ))}
            </div>
            {view==="weekly"?(
              <div style={{display:"flex",alignItems:"center",gap:6,marginLeft:"auto"}}>
                <button onClick={()=>setWStart(getMonday(today))} style={{...iBtnS,fontSize:11,padding:"4px 10px",border:"1px solid #E8E4DE",borderRadius:8}}>Hoy</button>
                <button onClick={()=>setWStart(d=>addDays(d,-7))} style={iBtnS}>‹</button>
                <span style={{fontSize:12,fontWeight:500,color:"#1C1C1C",minWidth:190,textAlign:"center"}}>{fmtWeekLabel()}</span>
                <button onClick={()=>setWStart(d=>addDays(d,7))} style={iBtnS}>›</button>
              </div>
            ):(
              <div style={{display:"flex",alignItems:"center",gap:6,marginLeft:"auto"}}>
                <button onClick={prevMonth} style={iBtnS}>‹</button>
                <span style={{fontSize:12,fontWeight:500,color:"#1C1C1C",minWidth:150,textAlign:"center"}}>{MONTHS[cMonth]} {cYear}</span>
                <button onClick={nextMonth} style={iBtnS}>›</button>
              </div>
            )}
            <div style={{display:"flex",gap:5}}>
              {STATUSES.map(s=>(
                <div key={s.value} style={{display:"flex",alignItems:"center",gap:3,background:s.bg,borderRadius:20,padding:"2px 8px"}}>
                  <div style={{width:5,height:5,borderRadius:"50%",background:s.color}}/>
                  <span style={{fontSize:10,color:s.color,fontWeight:500}}>{s.label}</span>
                </div>
              ))}
            </div>
            <button onClick={()=>setSettingsOpen(true)} style={{...iBtnS,background:brand.accent+"18",borderRadius:8,border:`1px solid ${brand.accent}55`,color:brand.accent,fontSize:12,padding:"4px 10px",fontWeight:500}}>⚙ Personalizar</button>
          </div>

          {/* Weekly */}
          {view==="weekly"&&(
            <div style={{flex:1,overflowY:"auto",padding:"1rem"}}>
              {boardMembers.map(m=>{
                const mTasks = memberTasks(m.id).filter(t=>filterClient?t.client_id===filterClient:true);
                const wc = mTasks.filter(t=>weekDates.some(d=>fmtDate(d)===t.date)).length;
                return (
                  <div key={m.id} style={{marginBottom:"1.5rem"}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,padding:"0 4px"}}>
                      <div style={{width:22,height:22,borderRadius:"50%",background:m.color,display:"flex",alignItems:"center",justifyContent:"center"}}>
                        <span style={{color:"#fff",fontSize:9,fontWeight:700}}>{(m.name||"?")[0]}</span>
                      </div>
                      <span style={{fontSize:13,fontWeight:600,color:"#1C1C1C"}}>{m.name}</span>
                      <span style={{fontSize:11,color:"#bbb"}}>{wc} tarea{wc!==1?"s":""} esta semana</span>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"52px repeat(5,1fr)",border:"1px solid #E8E4DE",borderRadius:12,overflow:"hidden",background:"#fff"}}>
                      {/* Header */}
                      <div style={{padding:"5px 6px",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"#FAFAF9",fontSize:10}}/>
                      {weekDates.map((d,i)=>{
                        const isT=fmtDate(d)===fmtDate(today);
                        return <div key={i} style={{padding:"5px 6px",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:isT?m.color+"15":"#FAFAF9",borderLeft:"1px solid #E8E4DE",fontSize:10}}>
                          <span style={{fontSize:9,color:"#bbb"}}>{WEEK_DAYS[i]}</span>
                          <span style={{fontSize:13,color:isT?m.color:"#1C1C1C",fontWeight:isT?700:400}}>{d.getDate()}</span>
                        </div>;
                      })}
                      {/* Hour rows */}
                      {HOURS.map((hour,hi)=>{
                        return <>
                          <div key={hour+"L"} style={{height:HOUR_H,padding:"5px 4px",fontSize:9,color:"#ccc",textAlign:"right",borderTop:"1px solid #F0EDE8",background:"#FAFAF9",display:"flex",alignItems:"flex-start",justifyContent:"flex-end"}}>{hour}</div>
                          {weekDates.map((d,di)=>{
                            const dk=fmtDate(d), ck=`${m.id}-${dk}-${hour}`;
                            const ct=mTasks.filter(t=>t.date===dk&&t.hour===hour);
                            return (
                              <div key={di}
                                onDragOver={e=>e.preventDefault()}
                                onDrop={e=>onCalDrop(e,m.id,dk,hour)}
                                onClick={()=>ct.length===0&&openAdd(m.id,dk,hour)}
                                style={{height:HOUR_H,borderLeft:"1px solid #E8E4DE",borderTop:"1px solid #F0EDE8",position:"relative",cursor:ct.length===0?"pointer":"default",background:"transparent"}}>
                                {ct.map(t=><TaskBlock key={t.id} t={t} memberId={m.id}/>)}
                              </div>
                            );
                          })}
                        </>;
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Monthly */}
          {view==="monthly"&&(
            <div style={{flex:1,overflowY:"auto",padding:"1rem"}}>
              {(()=>{
                const dim=getDIM(cYear,cMonth),fd=getFD(cYear,cMonth);
                const cells=[];
                for(let i=0;i<fd;i++) cells.push(null);
                for(let d=1;d<=dim;d++) cells.push(d);
                while(cells.length%7!==0) cells.push(null);
                const weeks=[];
                for(let i=0;i<cells.length;i+=7) weeks.push(cells.slice(i,i+7));
                const allT = allBoardTasks().filter(t=>filterClient?t.client_id===filterClient:true);
                return (
                  <div style={{minWidth:700}}>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4,marginBottom:4}}>
                      {DAYS_SHORT.map(d=><div key={d} style={{textAlign:"center",fontSize:9,letterSpacing:2,color:"#bbb",textTransform:"uppercase",padding:"4px 0"}}>{d}</div>)}
                    </div>
                    {weeks.map((week,wi)=>(
                      <div key={wi} style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4,marginBottom:4}}>
                        {week.map((day,di)=>{
                          const isT=day&&day===today.getDate()&&cMonth===today.getMonth()&&cYear===today.getFullYear();
                          const dk=day?`${cYear}-${cMonth}-${day}`:null;
                          const dt=day?allT.filter(t=>t.date===dk):[];
                          return (
                            <div key={di}
                              onDragOver={e=>{if(day)e.preventDefault();}}
                              onDrop={e=>{if(day)onCalDrop(e,boardMembers[0]?.id,dk,"8:00");}}
                              style={{background:day?"#fff":"transparent",border:isT?`2px solid ${board.accent}`:day?"1px solid #E8E4DE":"none",borderRadius:10,minHeight:100,padding:5}}>
                              {day&&<>
                                <div style={{fontSize:11,fontWeight:isT?700:400,color:isT?board.accent:"#aaa",marginBottom:3}}>{day}</div>
                                {dt.map(t=>{
                                  const cl=clientOf(t.client_id);
                                  return (
                                    <div key={t.id} draggable onDragStart={e=>onCalDragStart(e,t)} onDoubleClick={()=>openEdit(t)}
                                      style={{background:t.color||"#E8623A",borderRadius:4,padding:"2px 5px",fontSize:9,color:textOn(t.color||"#E8623A"),marginBottom:2,cursor:"pointer",lineHeight:1.3,overflow:"hidden"}}>
                                      <div style={{display:"flex",alignItems:"center",gap:3}}>
                                        <span style={{flex:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",fontWeight:600}}>{t.title}</span>
                                        {t.link&&<span>🔗</span>}
                                      </div>
                                      {cl&&<div style={{fontSize:8,opacity:0.85}}>{cl.name}</div>}
                                    </div>
                                  );
                                })}
                              </>}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                    <div style={{display:"flex",gap:"0.75rem",marginTop:"1rem",justifyContent:"center",flexWrap:"wrap"}}>
                      {boardMembers.map(m=>(
                        <div key={m.id} style={{display:"flex",alignItems:"center",gap:5}}>
                          <div style={{width:7,height:7,borderRadius:"50%",background:m.color}}/>
                          <span style={{fontSize:10,color:"#888"}}>{m.name}</span>
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

      {settingsOpen&&renderSettings()}
      {modal&&renderModal()}
    </div>
  );
}
