import { useState, useEffect, useRef, useCallback } from "react";
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

const WEEK_DAYS_FULL = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];
const HOURS      = ["8:00","9:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00"];
const WEEK_DAYS  = ["Lun","Mar","Mié","Jue","Vie"];
const MONTHS     = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DAYS_SHORT = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];
const today      = new Date();
const HOUR_H     = 56;

const getMonday  = d => { const x=new Date(d),day=x.getDay(); x.setDate(x.getDate()-day+(day===0?-6:1)); x.setHours(0,0,0,0); return x; };
const addDays    = (d,n) => { const x=new Date(d); x.setDate(x.getDate()+n); return x; };
const fmtDate    = d => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const fmtDateISO = d => { const x=new Date(d); return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}-${String(x.getDate()).padStart(2,"0")}`; };
const parseISO   = s => { if(!s) return null; const [y,m,d]=s.split("-"); return new Date(y,m-1,d); };
const getDIM     = (y,m) => new Date(y,m+1,0).getDate();
const getFD      = (y,m) => new Date(y,m,1).getDay();
const luminance  = h => { try { const r=parseInt(h.slice(1,3),16)/255,g=parseInt(h.slice(3,5),16)/255,b=parseInt(h.slice(5,7),16)/255; return 0.299*r+0.587*g+0.114*b; } catch(e){ return 0; } };
const textOn     = bg => luminance(bg||"#fff")>0.5?"#1C1C1C":"#ffffff";
const ensureHttp = url => url&&!url.startsWith("http")?`https://${url}`:url;

// Check if a date string (YYYY-M-D) falls within a task range or recurrence
const taskOccursOn = (task, dateStr) => {
  if (!dateStr) return false;
  // Range task
  if (task.end_date && task.date) {
    const d = parseISO(dateStr.includes("-")&&dateStr.split("-").length===3&&dateStr.split("-")[1].length<=2 ? (() => { const [y,m,d]=dateStr.split("-"); return `${y}-${String(parseInt(m)+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`; })() : dateStr);
    const start = parseISO(task.date.includes("-")&&task.date.split("-").length===3&&task.date.split("-")[1].length<=2 ? (() => { const [y,m,dd]=task.date.split("-"); return `${y}-${String(parseInt(m)+1).padStart(2,"0")}-${String(dd).padStart(2,"0")}`; })() : task.date);
    const end   = parseISO(task.end_date);
    if (d&&start&&end) return d>=start&&d<=end;
  }
  // Recurring task
  if (task.is_recurring && task.recurrence_days && task.recurrence_days.length>0) {
    const d = new Date(...dateStr.split("-").map((v,i)=>i===1?parseInt(v):parseInt(v)));
    const dayName = WEEK_DAYS_FULL[d.getDay()];
    return task.recurrence_days.includes(dayName);
  }
  // Normal task
  return task.date === dateStr;
};

let _id = Date.now();
const uid = () => `t${_id++}`;

const lbS  = { display:"block", fontSize:9, letterSpacing:1, color:"#aaa", textTransform:"uppercase", marginBottom:5, fontWeight:500 };
const lbS2 = { display:"block", fontSize:10, letterSpacing:1, color:"#aaa", textTransform:"uppercase", marginBottom:8, fontWeight:500 };
const inS  = { width:"100%", border:"none", borderBottom:"2px solid #E8E4DE", padding:"6px 0", fontSize:14, outline:"none", background:"transparent", color:"#1C1C1C", boxSizing:"border-box" };
const iBtnS= { background:"none", border:"none", fontSize:17, cursor:"pointer", color:"#666", padding:"3px 7px", borderRadius:8, lineHeight:1 };

const EMPTY_FORM = { title:"", link:"", status:"pendiente", comments:"", client_id:"", color:"#E8623A", duration:1, assignees:[], assigneeSchedules:[], reference_links:[], is_recurring:false, recurrence_days:[], end_date:"", date:"", hour:HOURS[0] };

export default function App() {
  const [brand, setBrand]     = useState({ name:"OLOVER Studio", logo:null, navBg:"#111111", sidebarBg:"#1C1C1C", topbarBg:"#ffffff", accent:"#E8623A" });
  const [boards, setBoards]   = useState([]);
  const [members, setMembers] = useState([]);
  const [tasks, setTasks]     = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [clients, setClients] = useState([]);
  const [holidays, setHolidays] = useState({});
  const [loading, setLoading] = useState(true);
  const [boardId, setBoardId] = useState("animadores");
  const [sidebarOpen, setSidebarOpen]   = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab]   = useState("marca");
  const [filterClient, setFilterClient] = useState("");
  const [modal, setModal]               = useState(null);
  const [modalForm, setModalForm]       = useState(EMPTY_FORM);
  const [newClientName, setNewClientName] = useState("");
  const [openGroups, setOpenGroups]     = useState({ pendiente:true, asignada:true, terminada:true });
  const [openClients, setOpenClients]   = useState({});
  const logoRef  = useRef();
  const titleRef = useRef();

  const [views, setViews]           = useState({ animadores:"weekly", disenadores:"weekly", proveedores:"weekly" });
  const [weekStarts, setWeekStarts] = useState({ animadores:getMonday(today), disenadores:getMonday(today), proveedores:getMonday(today) });
  const [calYears, setCalYears]     = useState({ animadores:today.getFullYear(), disenadores:today.getFullYear(), proveedores:today.getFullYear() });
  const [calMonths, setCalMonths]   = useState({ animadores:today.getMonth(), disenadores:today.getMonth(), proveedores:today.getMonth() });

  // ── Fetch Colombian holidays ──
  const fetchHolidays = useCallback(async (year) => {
    if (holidays[year]) return;
    try {
      const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/CO`);
      const data = await res.json();
      const map = {};
      data.forEach(h => { map[h.date] = h.localName||h.name; });
      setHolidays(p => ({ ...p, [year]: map }));
    } catch(e) { console.log("No se pudieron cargar festivos"); }
  }, [holidays]);

  useEffect(() => {
    fetchHolidays(today.getFullYear());
    fetchHolidays(today.getFullYear()+1);
  }, []);

  const isHoliday = (dateObj) => {
    const iso = fmtDateISO(dateObj);
    const yr = dateObj.getFullYear();
    return holidays[yr]?.[iso] || null;
  };

  // ── Load data ──
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
      supabase.channel(`rt-${table}-${Math.random()}`).on("postgres_changes",{event:"*",schema:"public",table},()=>query().then(({data})=>data&&setter(data))).subscribe();

    const c1 = reload("tasks",            setTasks,       ()=>supabase.from("tasks").select("*").order("created_at"));
    const c2 = reload("task_assignments", setAssignments, ()=>supabase.from("task_assignments").select("*"));
    const c3 = reload("members",          setMembers,     ()=>supabase.from("members").select("*").order("position"));
    const c4 = reload("boards",           setBoards,      ()=>supabase.from("boards").select("*").order("position"));
    const c5 = reload("clients",          setClients,     ()=>supabase.from("clients").select("*").order("position"));
    const c6 = supabase.channel("rt-brand-x").on("postgres_changes",{event:"*",schema:"public",table:"brand"},()=>
      supabase.from("brand").select("*").single().then(({data})=>data&&setBrand({name:data.name,logo:data.logo,navBg:data.nav_bg,sidebarBg:data.sidebar_bg,topbarBg:data.topbar_bg,accent:data.accent}))).subscribe();
    return () => [c1,c2,c3,c4,c5,c6].forEach(c=>supabase.removeChannel(c));
  }, []);

  useEffect(() => {
    if (modal && titleRef.current) setTimeout(() => titleRef.current?.focus(), 50);
  }, [modal]);

  // ── Derived ──
  const board        = boards.find(b=>b.id===boardId)||boards[0];
  const boardMembers = members.filter(m=>m.board_id===boardId);

  const taskAssignees = useCallback((taskId) => {
    const ids = assignments.filter(a=>a.task_id===taskId).map(a=>a.member_id);
    return members.filter(m=>ids.includes(m.id));
  }, [assignments, members]);

  const memberTasks = useCallback((memberId) => {
    const ids = assignments.filter(a=>a.member_id===memberId).map(a=>a.task_id);
    return tasks.filter(t=>ids.includes(t.id));
  }, [assignments, tasks]);

  const allBoardTasks = useCallback(() => {
    const memberIds = boardMembers.map(m=>m.id);
    const ids = [...new Set(assignments.filter(a=>memberIds.includes(a.member_id)).map(a=>a.task_id))];
    return tasks.filter(t=>ids.includes(t.id));
  }, [assignments, tasks, boardMembers]);

  const getMemberSchedule = (task, memberId) => {
    const s = (task.assignee_schedules||[]).find(s=>s.memberId===memberId);
    return s || { date:task.date, hour:task.hour };
  };

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
  const weekDates    = WEEK_DAYS.map((_,i)=>addDays(wStart,i));
  const fmtWeekLabel = () => { const e=addDays(wStart,4); return `${wStart.getDate()} – ${e.getDate()} ${MONTHS[e.getMonth()]} ${e.getFullYear()}`; };
  const prevMonth = () => { if(cMonth===0){setCMonth(11);setCYear(y=>y-1);}else setCMonth(m=>m-1); };
  const nextMonth = () => { if(cMonth===11){setCMonth(0);setCYear(y=>y+1);}else setCMonth(m=>m+1); };

  // ── CRUD ──
  const addTask = async (form, memberId, date, hour) => {
    const id = uid();
    const { assignees=[], assigneeSchedules=[], reference_links=[], ...rest } = form;
    const allAssignees = [...new Set([...(memberId?[memberId]:[]), ...assignees])];
    const schedules = allAssignees.map(mid => {
      const found = assigneeSchedules.find(s=>s.memberId===mid);
      return { memberId:mid, date:found?.date||date||null, hour:found?.hour||hour||HOURS[0] };
    });
    await supabase.from("tasks").insert({
      id, member_id:allAssignees[0]||"", board_id:boardId,
      title:rest.title||"Sin título", status:rest.status||"pendiente",
      link:rest.link||"", comments:rest.comments||"",
      client_id:rest.client_id||"", color:rest.color||"#E8623A",
      duration:rest.duration||1, reference_links,
      date:schedules[0]?.date||date||null,
      hour:schedules[0]?.hour||hour||HOURS[0],
      assignee_schedules:schedules,
      is_recurring:rest.is_recurring||false,
      recurrence_days:rest.recurrence_days||[],
      end_date:rest.end_date||null,
    });
    if (allAssignees.length>0) {
      await supabase.from("task_assignments").insert(allAssignees.map(mid=>({id:uid(),task_id:id,member_id:mid})));
    }
  };

  const updateTask = async (id, patch) => {
    const { assignees, assigneeSchedules, ...rest } = patch;
    const fm = { title:"title", status:"status", link:"link", date:"date", hour:"hour", end_date:"end_date", comments:"comments", client_id:"client_id", color:"color", duration:"duration", reference_links:"reference_links", memberId:"member_id", assignee_schedules:"assignee_schedules", is_recurring:"is_recurring", recurrence_days:"recurrence_days" };
    const db = {};
    Object.keys(rest).forEach(k=>{ if(fm[k]) db[fm[k]]=rest[k]; });
    if (assigneeSchedules) db.assignee_schedules = assigneeSchedules;
    if (Object.keys(db).length>0) await supabase.from("tasks").update(db).eq("id",id);
    if (assignees) {
      await supabase.from("task_assignments").delete().eq("task_id",id);
      if (assignees.length>0) await supabase.from("task_assignments").insert(assignees.map(mid=>({id:uid(),task_id:id,member_id:mid})));
    }
  };

  const deleteTask = async id => {
    await supabase.from("task_assignments").delete().eq("task_id",id);
    await supabase.from("tasks").delete().eq("id",id);
  };

  const duplicateTask = async (task) => {
    const id = uid();
    const assigneeIds = assignments.filter(a=>a.task_id===task.id).map(a=>a.member_id);
    const { id:_id2, created_at, ...rest } = task;
    await supabase.from("tasks").insert({ ...rest, id, title:`${task.title} (copia)` });
    if (assigneeIds.length>0) await supabase.from("task_assignments").insert(assigneeIds.map(mid=>({id:uid(),task_id:id,member_id:mid})));
    setModal(null);
  };

  const addMember = async (bId) => {
    const bm=members.filter(m=>m.board_id===bId);
    const colors=["#E8623A","#3A6FE8","#7B6BE0","#3A9E8A","#C49A3C","#E06B9A"];
    const b=boards.find(x=>x.id===bId);
    await supabase.from("members").insert({id:uid(),board_id:bId,name:`${b?.label||""} ${bm.length+1}`,color:colors[bm.length%colors.length],position:bm.length});
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
    const {data}=await supabase.from("brand").select("id").single();
    await supabase.from("brand").update({name:b.name,logo:b.logo,nav_bg:b.navBg,sidebar_bg:b.sidebarBg,topbar_bg:b.topbarBg,accent:b.accent}).eq("id",data.id);
  };

  // ── Modal ──
  const openAdd = (memberId, date, hour) => {
    setModal({mode:"add",memberId,date,hour});
    const schedules = memberId?[{memberId,date:date||"",hour:hour||HOURS[0]}]:[];
    setModalForm({...EMPTY_FORM,assignees:memberId?[memberId]:[],assigneeSchedules:schedules,date:date||"",hour:hour||HOURS[0]});
  };

  const openEdit = task => {
    const assigneeIds = assignments.filter(a=>a.task_id===task.id).map(a=>a.member_id);
    const schedules = assigneeIds.map(mid => {
      const found=(task.assignee_schedules||[]).find(s=>s.memberId===mid);
      return {memberId:mid,date:found?.date||task.date||"",hour:found?.hour||task.hour||HOURS[0]};
    });
    setModal({mode:"edit",task});
    setModalForm({
      title:task.title, link:task.link||"", status:task.status||"pendiente",
      comments:task.comments||"", client_id:task.client_id||"",
      color:task.color||"#E8623A", duration:task.duration||1,
      assignees:assigneeIds, assigneeSchedules:schedules,
      reference_links:task.reference_links||[],
      date:task.date||"", hour:task.hour||HOURS[0],
      end_date:task.end_date||"",
      is_recurring:task.is_recurring||false,
      recurrence_days:task.recurrence_days||[],
    });
  };

  const saveModal = async () => {
    if (!modalForm.title.trim()) return;
    if (modal.mode==="add") await addTask(modalForm, modal.memberId, modalForm.date, modalForm.hour);
    else await updateTask(modal.task.id, {
      title:modalForm.title, link:modalForm.link, status:modalForm.status,
      comments:modalForm.comments, client_id:modalForm.client_id,
      color:modalForm.color, duration:modalForm.duration,
      reference_links:modalForm.reference_links, assignees:modalForm.assignees,
      assigneeSchedules:modalForm.assigneeSchedules,
      date:modalForm.is_recurring?null:(modalForm.assigneeSchedules[0]?.date||modalForm.date),
      hour:modalForm.assigneeSchedules[0]?.hour||modalForm.hour,
      end_date:modalForm.end_date||null,
      is_recurring:modalForm.is_recurring,
      recurrence_days:modalForm.recurrence_days,
    });
    setModal(null);
  };

  const setField = (k,v) => setModalForm(p=>({...p,[k]:v}));

  const toggleAssignee = (mid) => {
    const sel = modalForm.assignees.includes(mid);
    const newA = sel?modalForm.assignees.filter(id=>id!==mid):[...modalForm.assignees,mid];
    const newS = sel?modalForm.assigneeSchedules.filter(s=>s.memberId!==mid):[...modalForm.assigneeSchedules,{memberId:mid,date:modalForm.date||"",hour:modalForm.hour||HOURS[0]}];
    setModalForm(p=>({...p,assignees:newA,assigneeSchedules:newS}));
  };

  const updateAssigneeSchedule = (mid,field,value) => {
    setModalForm(p=>({...p,assigneeSchedules:p.assigneeSchedules.map(s=>s.memberId===mid?{...s,[field]:value}:s)}));
  };

  const toggleRecurrenceDay = (day) => {
    const days = modalForm.recurrence_days||[];
    const newDays = days.includes(day)?days.filter(d=>d!==day):[...days,day];
    setField("recurrence_days",newDays);
  };

  // ── Drag ──
  const dragTask = useRef(null);
  const onCalDragStart = (e,task) => { e.stopPropagation(); dragTask.current={task}; };
  const onCalDrop = async (e,memberId,date,hour) => {
    e.preventDefault();
    if (!dragTask.current) return;
    const t = dragTask.current.task;
    const assigneeIds = assignments.filter(a=>a.task_id===t.id).map(a=>a.member_id);
    const newAssignees = assigneeIds.includes(memberId)?assigneeIds:[...assigneeIds.filter(id=>{const m=memberOf(id);return m&&m.board_id!==board?.id;}),memberId];
    const newSchedules = newAssignees.map(mid=>{
      if (mid===memberId) return {memberId,date,hour};
      const found=(t.assignee_schedules||[]).find(s=>s.memberId===mid);
      return found||{memberId:mid,date:t.date,hour:t.hour};
    });
    await updateTask(t.id,{date,hour,memberId,assignees:newAssignees,assigneeSchedules:newSchedules});
    dragTask.current=null;
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

  // ── Sidebar Tasks ──
  const SidebarTasks = () => {
    const allT = allBoardTasks();
    const filtered = filterClient?allT.filter(t=>t.client_id===filterClient):allT;
    return (
      <div style={{flex:1,overflowY:"auto",padding:"0.5rem"}}>
        {STATUSES.map(st=>{
          const stTasks=filtered.filter(t=>t.status===st.value);
          const isOpen=openGroups[st.value];
          const byClient={};
          stTasks.forEach(t=>{ const k=t.client_id||"sin-cliente"; if(!byClient[k]) byClient[k]=[]; byClient[k].push(t); });
          return (
            <div key={st.value} style={{marginBottom:6}}>
              <button onClick={()=>setOpenGroups(p=>({...p,[st.value]:!p[st.value]}))}
                style={{display:"flex",alignItems:"center",gap:6,background:"none",border:"none",cursor:"pointer",width:"100%",padding:"4px 6px",borderRadius:6}}>
                <span style={{fontSize:8,color:st.color}}>●</span>
                <span style={{fontSize:10,fontWeight:600,color:st.color,textTransform:"uppercase",letterSpacing:1}}>{st.label}</span>
                <span style={{fontSize:10,color:"#555",marginLeft:"auto"}}>{stTasks.length}</span>
                <span style={{fontSize:10,color:"#555"}}>{isOpen?"▾":"▸"}</span>
              </button>
              {isOpen&&Object.entries(byClient).map(([cKey,cTasks])=>{
                const cl=cKey==="sin-cliente"?null:clientOf(cKey);
                const isClientOpen=openClients[`${st.value}-${cKey}`]!==false;
                return (
                  <div key={cKey} style={{marginLeft:8,marginBottom:2}}>
                    <button onClick={()=>setOpenClients(p=>({...p,[`${st.value}-${cKey}`]:!isClientOpen}))}
                      style={{display:"flex",alignItems:"center",gap:5,background:"none",border:"none",cursor:"pointer",width:"100%",padding:"3px 4px",borderRadius:4}}>
                      {cl&&<div style={{width:6,height:6,borderRadius:"50%",background:cl.color,flexShrink:0}}/>}
                      <span style={{fontSize:10,color:cl?cl.color:"#555",fontWeight:500}}>{cl?cl.name:"Sin cliente"}</span>
                      <span style={{fontSize:9,color:"#444",marginLeft:"auto"}}>{cTasks.length} {isClientOpen?"▾":"▸"}</span>
                    </button>
                    {isClientOpen&&cTasks.map(t=>{
                      const assignees=taskAssignees(t.id);
                      return (
                        <div key={t.id} onDoubleClick={()=>openEdit(t)}
                          style={{display:"flex",alignItems:"flex-start",gap:5,padding:"5px 6px",margin:"2px 0",background:"#252525",border:`1px solid ${t.color}33`,borderLeft:`3px solid ${t.color||"#444"}`,borderRadius:"0 6px 6px 0",cursor:"pointer"}}>
                          <div style={{flex:1,minWidth:0}}>
                            <p style={{fontSize:11,color:t.status==="terminada"?"#555":"#ddd",margin:0,lineHeight:1.3,textDecoration:t.status==="terminada"?"line-through":"none",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{t.title}</p>
                            {t.is_recurring&&<span style={{fontSize:9,color:"#58A6FF",background:"#58A6FF22",borderRadius:10,padding:"1px 5px"}}>🔁 Recurrente</span>}
                            {t.end_date&&<span style={{fontSize:9,color:"#C49A3C",background:"#C49A3C22",borderRadius:10,padding:"1px 5px",marginLeft:3}}>📅 Rango</span>}
                            {assignees.length>0&&<div style={{display:"flex",gap:2,marginTop:3,flexWrap:"wrap"}}>
                              {assignees.map(m=><span key={m.id} style={{fontSize:9,background:m.color+"33",color:m.color,borderRadius:10,padding:"1px 5px"}}>{m.name}</span>)}
                            </div>}
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

  // ── Task Block ──
  const TaskBlock = ({ t, memberId }) => {
    const cl=clientOf(t.client_id);
    const dur=t.duration||1;
    const height=dur*HOUR_H-4;
    const isRecurring=t.is_recurring;
    const isRange=!!t.end_date;
    return (
      <div draggable onDragStart={e=>onCalDragStart(e,t)} onDoubleClick={e=>{e.stopPropagation();openEdit(t);}}
        style={{position:"absolute",left:2,right:2,top:2,height,background:t.color||"#E8623A",borderRadius:6,padding:"3px 6px",cursor:"grab",overflow:"hidden",zIndex:2,boxShadow:"0 1px 4px rgba(0,0,0,0.15)"}}>
        <p style={{fontSize:10,fontWeight:600,color:textOn(t.color||"#E8623A"),margin:0,lineHeight:1.3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.title}{isRecurring?" 🔁":""}{isRange?" 📅":""}</p>
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
    const isEdit=modal.mode==="edit";
    const refLinks=modalForm.reference_links||[];
    return (
      <div onClick={()=>setModal(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.35)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:300,backdropFilter:"blur(3px)"}}>
        <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:20,padding:"1.75rem",width:520,maxHeight:"92vh",overflowY:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.15)"}}>
          {/* Header + color */}
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:"1rem"}}>
            <div style={{width:14,height:14,borderRadius:"50%",background:modalForm.color,flexShrink:0}}/>
            <p style={{fontFamily:"'DM Serif Display',serif",fontSize:"1.15rem",color:"#1C1C1C",margin:0,flex:1}}>{isEdit?"Editar tarea":"Nueva tarea"}</p>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:10,color:"#aaa"}}>Color</span>
              <div style={{position:"relative"}}>
                <div style={{width:32,height:32,borderRadius:8,background:modalForm.color,cursor:"pointer",border:"2px solid #E8E4DE"}} onClick={()=>document.getElementById("pick-task-color").click()}/>
                <input id="pick-task-color" type="color" value={modalForm.color} onChange={e=>setField("color",e.target.value)} style={{position:"absolute",opacity:0,width:32,height:32,top:0,left:0}}/>
              </div>
              <input value={modalForm.color} onChange={e=>setField("color",e.target.value)} maxLength={7}
                style={{width:72,border:"1px solid #E8E4DE",borderRadius:6,padding:"4px 6px",fontSize:11,outline:"none",fontFamily:"monospace",color:"#555"}}/>
            </div>
          </div>

          {/* Título */}
          <label style={lbS}>Nombre de la tarea</label>
          <input ref={titleRef} value={modalForm.title} onChange={e=>setField("title",e.target.value)}
            placeholder="Nombre de la tarea..." style={{...inS,borderBottomColor:modalForm.color,marginBottom:"1.1rem"}}/>

          {/* Cliente */}
          <label style={lbS}>Cliente / Negocio</label>
          <select value={modalForm.client_id} onChange={e=>setField("client_id",e.target.value)}
            style={{width:"100%",border:"none",borderBottom:"2px solid #E8E4DE",padding:"6px 0",fontSize:13,outline:"none",background:"transparent",color:"#1C1C1C",marginBottom:"1.1rem",cursor:"pointer"}}>
            <option value="">— Sin cliente —</option>
            {clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          {/* Asignados */}
          <label style={lbS}>Asignar a</label>
          <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:8}}>
            {members.map(m=>{
              const sel=modalForm.assignees.includes(m.id);
              const brd=boards.find(b=>b.id===m.board_id);
              return (
                <button key={m.id} onClick={()=>toggleAssignee(m.id)}
                  style={{display:"flex",alignItems:"center",gap:5,background:sel?m.color:"#F4F2EE",border:`1.5px solid ${sel?m.color:"transparent"}`,borderRadius:20,padding:"4px 10px",cursor:"pointer"}}>
                  <div style={{width:16,height:16,borderRadius:"50%",background:sel?"rgba(255,255,255,0.3)":m.color,display:"flex",alignItems:"center",justifyContent:"center"}}>
                    <span style={{color:"#fff",fontSize:8,fontWeight:700}}>{(m.name||"?")[0]}</span>
                  </div>
                  <span style={{fontSize:11,color:sel?textOn(m.color):"#555",fontWeight:sel?600:400}}>{m.name}</span>
                  {brd&&<span style={{fontSize:9,color:sel?textOn(m.color)+"99":"#aaa"}}>({brd.label})</span>}
                </button>
              );
            })}
          </div>

          {/* Horario por asignado */}
          {modalForm.assigneeSchedules.length>0&&!modalForm.is_recurring&&(
            <div style={{background:"#FAFAF9",border:"1px solid #E8E4DE",borderRadius:10,padding:"10px 12px",marginBottom:"1.1rem"}}>
              <p style={{fontSize:9,letterSpacing:1,color:"#aaa",textTransform:"uppercase",margin:"0 0 8px",fontWeight:500}}>Horario por persona</p>
              {modalForm.assigneeSchedules.map(s=>{
                const m=memberOf(s.memberId); if(!m) return null;
                return (
                  <div key={s.memberId} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                    <div style={{width:18,height:18,borderRadius:"50%",background:m.color,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                      <span style={{color:"#fff",fontSize:8,fontWeight:700}}>{m.name[0]}</span>
                    </div>
                    <span style={{fontSize:11,color:"#555",width:60,flexShrink:0}}>{m.name}</span>
                    <input type="date" value={s.date||""} onChange={e=>updateAssigneeSchedule(s.memberId,"date",e.target.value)}
                      style={{flex:1,border:"none",borderBottom:"1px solid #E8E4DE",padding:"3px 0",fontSize:11,outline:"none",background:"transparent",color:"#1C1C1C"}}/>
                    <select value={s.hour||HOURS[0]} onChange={e=>updateAssigneeSchedule(s.memberId,"hour",e.target.value)}
                      style={{border:"none",borderBottom:"1px solid #E8E4DE",padding:"3px 0",fontSize:11,outline:"none",background:"transparent",color:"#1C1C1C",cursor:"pointer"}}>
                      {HOURS.map(h=><option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                );
              })}
            </div>
          )}

          {/* Tipo de tarea */}
          <label style={lbS}>Tipo de tarea</label>
          <div style={{display:"flex",gap:8,marginBottom:"1.1rem"}}>
            {[["normal","Normal","📌"],["recurring","Recurrente","🔁"],["range","Rango de fechas","📅"]].map(([type,label,icon])=>{
              const active = type==="recurring"?modalForm.is_recurring:type==="range"?!!modalForm.end_date&&!modalForm.is_recurring:!modalForm.is_recurring&&!modalForm.end_date;
              return (
                <button key={type} onClick={()=>{
                  if(type==="recurring") setModalForm(p=>({...p,is_recurring:true,end_date:""}));
                  else if(type==="range") setModalForm(p=>({...p,is_recurring:false,end_date:p.end_date||""}));
                  else setModalForm(p=>({...p,is_recurring:false,end_date:""}));
                }}
                  style={{flex:1,background:active?"#F4F2EE":"transparent",border:`1.5px solid ${active?modalForm.color:"#E8E4DE"}`,borderRadius:8,padding:"7px 4px",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                  <span style={{fontSize:14}}>{icon}</span>
                  <span style={{fontSize:10,fontWeight:active?600:400,color:active?"#1C1C1C":"#999"}}>{label}</span>
                </button>
              );
            })}
          </div>

          {/* Recurrencia */}
          {modalForm.is_recurring&&(
            <div style={{background:"#F0F7FF",border:"1px solid #B5D4F4",borderRadius:10,padding:"10px 12px",marginBottom:"1.1rem"}}>
              <p style={{fontSize:9,letterSpacing:1,color:"#3A6FE8",textTransform:"uppercase",margin:"0 0 8px",fontWeight:500}}>Días de repetición</p>
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
                {WEEK_DAYS_FULL.map(day=>{
                  const sel=(modalForm.recurrence_days||[]).includes(day);
                  return <button key={day} onClick={()=>toggleRecurrenceDay(day)}
                    style={{background:sel?modalForm.color:"#fff",border:`1px solid ${sel?modalForm.color:"#E8E4DE"}`,borderRadius:20,padding:"3px 10px",fontSize:11,cursor:"pointer",color:sel?textOn(modalForm.color):"#666"}}>{day}</button>;
                })}
              </div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <label style={{fontSize:11,color:"#555"}}>Hora:</label>
                <select value={modalForm.hour||HOURS[0]} onChange={e=>setField("hour",e.target.value)}
                  style={{border:"none",borderBottom:"1px solid #B5D4F4",padding:"3px 0",fontSize:12,outline:"none",background:"transparent",color:"#1C1C1C",cursor:"pointer"}}>
                  {HOURS.map(h=><option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* Rango de fechas */}
          {!modalForm.is_recurring&&(
            <div style={{display:"flex",gap:12,marginBottom:"1.1rem"}}>
              <div style={{flex:1}}>
                <label style={lbS}>Fecha inicio</label>
                <input type="date" value={modalForm.date||""} onChange={e=>setField("date",e.target.value)}
                  style={{...inS,borderBottomColor:"#E8E4DE",fontSize:13}}/>
              </div>
              {modalForm.end_date!==undefined&&(
                <div style={{flex:1}}>
                  <label style={lbS}>Fecha fin {!modalForm.end_date&&<span style={{color:"#bbb"}}>(opcional)</span>}</label>
                  <input type="date" value={modalForm.end_date||""} onChange={e=>setField("end_date",e.target.value)}
                    style={{...inS,borderBottomColor:modalForm.end_date?"#E8E4DE":"#E8E4DE",fontSize:13}}/>
                </div>
              )}
              {!modalForm.end_date&&(
                <div style={{flex:1}}>
                  <label style={lbS}>Hora inicio</label>
                  <select value={modalForm.hour||HOURS[0]} onChange={e=>setField("hour",e.target.value)}
                    style={{width:"100%",border:"none",borderBottom:"2px solid #E8E4DE",padding:"6px 0",fontSize:13,outline:"none",background:"transparent",color:"#1C1C1C",cursor:"pointer"}}>
                    {HOURS.map(h=><option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Duración */}
          {!modalForm.end_date&&!modalForm.is_recurring&&(
            <>
              <label style={lbS}>Duración (horas)</label>
              <select value={modalForm.duration||1} onChange={e=>setField("duration",parseInt(e.target.value))}
                style={{width:"100%",border:"none",borderBottom:"2px solid #E8E4DE",padding:"6px 0",fontSize:13,outline:"none",background:"transparent",color:"#1C1C1C",cursor:"pointer",marginBottom:"1.1rem"}}>
                {[1,2,3,4,5,6,7,8].map(h=><option key={h} value={h}>{h}h</option>)}
              </select>
            </>
          )}

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
                placeholder="Nombre" style={{width:120,border:"none",borderBottom:"1px solid #E8E4DE",fontSize:12,outline:"none",background:"transparent",color:"#1C1C1C",padding:"4px 0"}}/>
              <input value={rl.url||""} onChange={e=>{ const a=[...refLinks]; a[i]={...a[i],url:e.target.value}; setField("reference_links",a); }}
                placeholder="https://..." style={{flex:1,border:"none",borderBottom:"1px solid #E8E4DE",fontSize:12,outline:"none",background:"transparent",color:"#1C1C1C",padding:"4px 0"}}/>
              {rl.url&&<a href={ensureHttp(rl.url)} target="_blank" rel="noreferrer" style={{fontSize:14,color:"#3A6FE8",textDecoration:"none",flexShrink:0}}>↗</a>}
              <button onClick={()=>setField("reference_links",refLinks.filter((_,j)=>j!==i))} style={{background:"none",border:"none",color:"#ccc",cursor:"pointer",fontSize:14}}>✕</button>
            </div>
          ))}
          <button onClick={()=>setField("reference_links",[...refLinks,{name:"",url:""}])}
            style={{display:"flex",alignItems:"center",gap:5,background:"none",border:"1px dashed #ddd",borderRadius:8,padding:"5px 10px",fontSize:11,color:"#aaa",cursor:"pointer",marginBottom:"1.1rem"}}>
            <span style={{fontSize:16}}>+</span> Agregar link de referencia
          </button>

          {/* Link entregable */}
          <label style={lbS}>Link de entregable <span style={{color:"#bbb",fontWeight:400}}>(opcional)</span></label>
          <div style={{position:"relative",marginBottom:"1.5rem",display:"flex",alignItems:"center",gap:8}}>
            <input value={modalForm.link} onChange={e=>setField("link",e.target.value)} placeholder="https://..."
              style={{...inS,borderBottomColor:"#E8E4DE",flex:1}}/>
            {modalForm.link&&<a href={ensureHttp(modalForm.link)} target="_blank" rel="noreferrer" style={{fontSize:18,color:"#3A6FE8",textDecoration:"none",flexShrink:0}}>↗</a>}
          </div>

          {/* Botones */}
          <div style={{display:"flex",gap:8,justifyContent:"space-between",flexWrap:"wrap"}}>
            <div style={{display:"flex",gap:8}}>
              {isEdit&&<button onClick={()=>{deleteTask(modal.task.id);setModal(null);}} style={{background:"none",border:"1px solid #FFD0C8",borderRadius:8,padding:"7px 12px",fontSize:12,cursor:"pointer",color:"#E8623A"}}>Eliminar</button>}
              {isEdit&&<button onClick={()=>duplicateTask(modal.task)} style={{background:"none",border:"1px solid #E8E4DE",borderRadius:8,padding:"7px 12px",fontSize:12,cursor:"pointer",color:"#666"}}>Duplicar</button>}
            </div>
            <div style={{display:"flex",gap:8,marginLeft:"auto"}}>
              <button onClick={()=>setModal(null)} style={{background:"none",border:"1px solid #E8E4DE",borderRadius:8,padding:"7px 12px",fontSize:12,cursor:"pointer",color:"#666"}}>Cancelar</button>
              <button onClick={saveModal} style={{background:modalForm.color,border:"none",borderRadius:8,padding:"7px 16px",fontSize:12,cursor:"pointer",color:textOn(modalForm.color),fontWeight:600}}>{isEdit?"Guardar":"Agregar"}</button>
            </div>
          </div>
        </div>
      </div>
    );
  };

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
        <div style={{width:270,background:brand.sidebarBg,display:"flex",flexDirection:"column",zIndex:10,flexShrink:0}}>
          <div style={{padding:"1.1rem 1rem 0.75rem",borderBottom:"1px solid #2a2a2a"}}>
            <p style={{fontSize:9,letterSpacing:3,color:"#444",textTransform:"uppercase",marginBottom:4}}>{brand.name}</p>
            <div style={{display:"flex",alignItems:"center",gap:7}}>
              <span style={{fontSize:15,color:board.accent}}>{board.icon}</span>
              <p style={{fontFamily:"'DM Serif Display',serif",fontSize:"1.05rem",color:"#F4F2EE",margin:0}}>{board.label}</p>
            </div>
          </div>
          <div style={{padding:"0.5rem 1rem",borderBottom:"1px solid #2a2a2a"}}>
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
                const mTasks=memberTasks(m.id).filter(t=>filterClient?t.client_id===filterClient:true);
                const wc=mTasks.filter(t=>weekDates.some(d=>taskOccursOn(t,fmtDate(d)))).length;
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
                      <div style={{padding:"5px 6px",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"#FAFAF9",fontSize:10}}/>
                      {weekDates.map((d,i)=>{
                        const isT=fmtDate(d)===fmtDate(today);
                        const hol=isHoliday(d);
                        return (
                          <div key={i} style={{padding:"5px 6px",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:hol?"#FFF0F0":isT?m.color+"15":"#FAFAF9",borderLeft:"1px solid #E8E4DE",fontSize:10}}>
                            <span style={{fontSize:9,color:hol?"#E06B9A":"#bbb"}}>{WEEK_DAYS[i]}</span>
                            <span style={{fontSize:13,color:hol?"#E06B9A":isT?m.color:"#1C1C1C",fontWeight:isT?700:400}}>{d.getDate()}</span>
                            {hol&&<span style={{fontSize:7,color:"#E06B9A",textAlign:"center",lineHeight:1.1,maxWidth:50,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={hol}>🇨🇴</span>}
                          </div>
                        );
                      })}
                      {HOURS.map(hour=>(
                        <>
                          <div key={hour+"L"} style={{height:HOUR_H,padding:"5px 4px",fontSize:9,color:"#ccc",textAlign:"right",borderTop:"1px solid #F0EDE8",background:"#FAFAF9",display:"flex",alignItems:"flex-start",justifyContent:"flex-end"}}>{hour}</div>
                          {weekDates.map((d,di)=>{
                            const dk=fmtDate(d);
                            const ck=`${m.id}-${dk}-${hour}`;
                            const ct=mTasks.filter(t=>{
                              if (t.is_recurring) {
                                const dayName=WEEK_DAYS_FULL[d.getDay()];
                                return (t.recurrence_days||[]).includes(dayName)&&(t.hour||HOURS[0])===hour;
                              }
                              const sch=getMemberSchedule(t,m.id);
                              if (t.end_date&&t.date) return taskOccursOn(t,dk)&&(t.hour||HOURS[0])===hour;
                              return sch.date===dk&&sch.hour===hour;
                            });
                            return (
                              <div key={di}
                                onDragOver={e=>e.preventDefault()}
                                onDrop={e=>onCalDrop(e,m.id,dk,hour)}
                                onClick={()=>ct.length===0&&openAdd(m.id,dk,hour)}
                                style={{height:HOUR_H,borderLeft:"1px solid #E8E4DE",borderTop:"1px solid #F0EDE8",position:"relative",cursor:ct.length===0?"pointer":"default"}}>
                                {ct.map(t=><TaskBlock key={t.id} t={t} memberId={m.id}/>)}
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
                const allT=allBoardTasks().filter(t=>filterClient?t.client_id===filterClient:true);
                return (
                  <div style={{minWidth:700}}>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4,marginBottom:4}}>
                      {DAYS_SHORT.map(d=><div key={d} style={{textAlign:"center",fontSize:9,letterSpacing:2,color:"#bbb",textTransform:"uppercase",padding:"4px 0"}}>{d}</div>)}
                    </div>
                    {weeks.map((week,wi)=>(
                      <div key={wi} style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4,marginBottom:4}}>
                        {week.map((day,di)=>{
                          const isT=day&&day===today.getDate()&&cMonth===today.getMonth()&&cYear===today.getFullYear();
                          const dateObj=day?new Date(cYear,cMonth,day):null;
                          const hol=dateObj?isHoliday(dateObj):null;
                          const dk=day?fmtDate(new Date(cYear,cMonth,day)):null;
                          const dt=day?allT.filter(t=>taskOccursOn(t,dk)):[];
                          return (
                            <div key={di}
                              onDragOver={e=>{if(day)e.preventDefault();}}
                              onDrop={e=>{if(day)onCalDrop(e,boardMembers[0]?.id,dk,"8:00");}}
                              style={{background:day?(hol?"#FFF5F5":"#fff"):"transparent",border:isT?`2px solid ${board.accent}`:day?"1px solid #E8E4DE":"none",borderRadius:10,minHeight:100,padding:5}}>
                              {day&&<>
                                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:3}}>
                                  <span style={{fontSize:11,fontWeight:isT?700:400,color:isT?board.accent:hol?"#E06B9A":"#aaa"}}>{day}</span>
                                  {hol&&<span style={{fontSize:9,color:"#E06B9A"}} title={hol}>🇨🇴</span>}
                                </div>
                                {dt.map(t=>{
                                  const cl=clientOf(t.client_id);
                                  return (
                                    <div key={t.id} draggable onDragStart={e=>onCalDragStart(e,t)} onDoubleClick={()=>openEdit(t)}
                                      style={{background:t.color||"#E8623A",borderRadius:4,padding:"2px 5px",fontSize:9,color:textOn(t.color||"#E8623A"),marginBottom:2,cursor:"pointer",lineHeight:1.3,overflow:"hidden"}}>
                                      <div style={{display:"flex",alignItems:"center",gap:3}}>
                                        <span style={{flex:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",fontWeight:600}}>{t.title}{t.is_recurring?" 🔁":""}{t.end_date?" 📅":""}</span>
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
