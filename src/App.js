import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "./supabase";

const STATUSES = [
  { value:"pendiente", label:"Pendiente", color:"#F0A500", bg:"#FFF8E7" },
  { value:"asignada",  label:"Asignada",  color:"#3A9E8A", bg:"#E8F7F5" },
  { value:"revision", label:"Revisión", color:"#FF9800", bg:"#FFF3E0" },
  { value:"terminada", label:"Terminada", color:"#7B6BE0", bg:"#F2F0FD" },
];

const HOURS     = ["8:00 AM","9:00 AM","10:00 AM","11:00 AM","12:00 PM","1:00 PM","2:00 PM","3:00 PM","4:00 PM","5:00 PM"];
const WEEK_DAYS = ["Lun","Mar","Mié","Jue","Vie"];
const MONTHS    = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DAYS_S    = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];
const REC_DAYS  = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];
const today     = new Date();
const HOUR_H    = 56;

const toISO     = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const fromISO   = s => { if(!s)return null; const[y,m,d]=s.split("-"); return new Date(+y,+m-1,+d); };
const getMonday = d => { const x=new Date(d),day=x.getDay(); x.setDate(x.getDate()-day+(day===0?-6:1)); x.setHours(0,0,0,0); return x; };
const addDays   = (d,n) => { const x=new Date(d); x.setDate(x.getDate()+n); return x; };
const getDIM    = (y,m) => new Date(y,m+1,0).getDate();
const getFD     = (y,m) => new Date(y,m,1).getDay();
const lum       = h => { try{const r=parseInt(h.slice(1,3),16)/255,g=parseInt(h.slice(3,5),16)/255,b=parseInt(h.slice(5,7),16)/255;return 0.299*r+0.587*g+0.114*b;}catch{return 0;} };
const textOn    = bg => lum(bg||"#fff")>0.5?"#1C1C1C":"#ffffff";
const http      = url => url&&!url.startsWith("http")?`https://${url}`:url;

const taskOccursOn = (task, iso) => {
  if (!iso) return false;
  if (task.is_recurring && (task.recurrence_days||[]).length>0) {
    const d=fromISO(iso); return d&&task.recurrence_days.includes(REC_DAYS[d.getDay()]);
  }
  if (task.end_date&&task.date) return iso>=task.date&&iso<=task.end_date;
  return task.date===iso;
};

let _n = Date.now();
const uid = () => `t${_n++}`;

const lbS  = { display:"block",fontSize:9,letterSpacing:1,color:"#aaa",textTransform:"uppercase",marginBottom:5,fontWeight:500 };
const inS  = { width:"100%",border:"none",borderBottom:"2px solid #E8E4DE",padding:"6px 0",fontSize:14,outline:"none",background:"transparent",color:"#1C1C1C",boxSizing:"border-box" };
const iBtnS = { background:"none",border:"none",fontSize:17,cursor:"pointer",color:"#666",padding:"3px 7px",borderRadius:8 };
const PRESETS = [
  { name:"OLOVER",   navBg:"#111111", sideBg:"#1C1C1C", topBg:"#ffffff", accent:"#E8623A" },
  { name:"Midnight", navBg:"#0D1117", sideBg:"#161B22", topBg:"#ffffff", accent:"#58A6FF" },
  { name:"Forest",   navBg:"#1A2A1A", sideBg:"#1F331F", topBg:"#ffffff", accent:"#4CAF50" },
  { name:"Slate",    navBg:"#1E2130", sideBg:"#252A40", topBg:"#ffffff", accent:"#7B6BE0" },
  { name:"Rose",     navBg:"#1A0F14", sideBg:"#261520", topBg:"#ffffff", accent:"#E06B9A" },
  { name:"Sand",     navBg:"#2A2318", sideBg:"#332B1E", topBg:"#FDFAF6", accent:"#C49A3C" },
];
const EMPTY = { title:"",link:"",status:"pendiente",comments:"",client_id:"",color:"#E8623A",duration:1,assignees:[],schedules:[],refs:[],is_recurring:false,rec_days:[],date:"",hour:HOURS[0],end_date:"" };

// ─── Task Modal (outside main component to prevent re-render focus loss) ─────
function TaskModal({ modal, form, setForm, setModal, members, boards, clients, onSave, onDelete, onDuplicate }) {
  const titleRef = useRef();
  const sf = (k,v) => setForm(p=>({...p,[k]:v}));

  useEffect(() => {
    if (titleRef.current) setTimeout(()=>titleRef.current?.focus(),80);
  }, []);

  const toggleA = mid => {
    const sel=form.assignees.includes(mid);
    const newA=sel?form.assignees.filter(id=>id!==mid):[...form.assignees,mid];
    const newS=sel?form.schedules.filter(s=>s.memberId!==mid):[...form.schedules,{memberId:mid,date:form.date||"",hour:form.hour||HOURS[0],endDate:form.end_date||"",endHour:""}];
    setForm(p=>({...p,assignees:newA,schedules:newS}));
  };
  const updSch=(mid,field,val)=>setForm(p=>({...p,schedules:p.schedules.map(s=>s.memberId===mid?{...s,[field]:val}:s)}));
  const mOf = id => members.find(m=>m.id===id);
  const isEdit = modal.mode==="edit";
  const refs = form.refs||[];
  const ttype = form.is_recurring?"rec":form.end_date?"range":"normal";

  return (
    <div onClick={()=>setModal(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.35)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:300,backdropFilter:"blur(3px)"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:20,padding:"1.75rem",width:520,maxHeight:"92vh",overflowY:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.15)"}}>
        {/* Header */}
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:"1rem"}}>
          <div style={{width:14,height:14,borderRadius:"50%",background:form.color}}/>
          <p style={{fontFamily:"'DM Serif Display',serif",fontSize:"1.15rem",color:"#1C1C1C",margin:0,flex:1}}>{isEdit?"Editar tarea":"Nueva tarea"}</p>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <div style={{position:"relative"}}>
              <div style={{width:32,height:32,borderRadius:8,background:form.color,cursor:"pointer",border:"2px solid #E8E4DE"}} onClick={()=>document.getElementById("pk-task").click()}/>
              <input id="pk-task" type="color" value={form.color} onChange={e=>sf("color",e.target.value)} style={{position:"absolute",opacity:0,width:32,height:32,top:0,left:0}}/>
            </div>
            <input value={form.color} onChange={e=>sf("color",e.target.value)} maxLength={7} style={{width:72,border:"1px solid #E8E4DE",borderRadius:6,padding:"4px 6px",fontSize:11,outline:"none",fontFamily:"monospace",color:"#555"}}/>
          </div>
        </div>

        {/* Título — ref asegura foco estable */}
        <label style={lbS}>Nombre</label>
        <input
          ref={titleRef}
          value={form.title}
          onChange={e=>sf("title",e.target.value)}
          placeholder="Nombre de la tarea..."
          style={{...inS,borderBottomColor:form.color,marginBottom:"1.1rem"}}
        />

        {/* Cliente */}
        <label style={lbS}>Cliente</label>
        <select value={form.client_id} onChange={e=>sf("client_id",e.target.value)} style={{width:"100%",border:"none",borderBottom:"2px solid #E8E4DE",padding:"6px 0",fontSize:13,outline:"none",background:"transparent",color:"#1C1C1C",marginBottom:"1.1rem",cursor:"pointer"}}>
          <option value="">— Sin cliente —</option>
          {clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        {/* Asignados */}
        <label style={lbS}>Asignar a</label>
        <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:8}}>
          {members.map(m=>{
            const sel=form.assignees.includes(m.id);
            const brd=boards.find(b=>b.id===m.board_id);
            return (
              <button key={m.id} onClick={()=>toggleA(m.id)} style={{display:"flex",alignItems:"center",gap:5,background:sel?m.color:"#F4F2EE",border:`1.5px solid ${sel?m.color:"transparent"}`,borderRadius:20,padding:"4px 10px",cursor:"pointer"}}>
                <div style={{width:16,height:16,borderRadius:"50%",background:sel?"rgba(255,255,255,0.3)":m.color,display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{color:"#fff",fontSize:8,fontWeight:700}}>{(m.name||"?")[0]}</span></div>
                <span style={{fontSize:11,color:sel?textOn(m.color):"#555",fontWeight:sel?600:400}}>{m.name}</span>
                {brd&&<span style={{fontSize:9,color:sel?textOn(m.color)+"99":"#aaa"}}>({brd.label})</span>}
              </button>
            );
          })}
        </div>

        {/* Horario por persona */}
        {form.schedules.length>0&&!form.is_recurring&&(
          <div style={{background:"#FAFAF9",border:"1px solid #E8E4DE",borderRadius:10,padding:"10px 12px",marginBottom:"1.1rem"}}>
            <p style={{fontSize:9,color:"#aaa",textTransform:"uppercase",letterSpacing:1,margin:"0 0 8px",fontWeight:500}}>Horario por persona</p>
            {form.schedules.map(s=>{const m=mOf(s.memberId);if(!m)return null;
              const isRange=!!form.end_date;
              return(
              <div key={s.memberId} style={{marginBottom:12,padding:8,background:"#fff",borderRadius:8}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
                  <div style={{width:18,height:18,borderRadius:"50%",background:m.color,display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{color:"#fff",fontSize:8,fontWeight:700}}>{m.name[0]}</span></div>
                  <span style={{fontSize:12,color:"#555",fontWeight:600}}>{m.name}</span>
                </div>
                {isRange?(
                  <>
                    <div style={{display:"flex",gap:8,marginBottom:6}}>
                      <div style={{flex:1}}>
                        <label style={{fontSize:9,color:"#999",display:"block",marginBottom:3}}>Fecha inicio</label>
                        <input type="date" value={s.date||""} onChange={e=>updSch(s.memberId,"date",e.target.value)} style={{width:"100%",border:"1px solid #E8E4DE",padding:"4px 6px",fontSize:11,outline:"none",borderRadius:6}}/>
                      </div>
                      <div style={{flex:1}}>
                        <label style={{fontSize:9,color:"#999",display:"block",marginBottom:3}}>Fecha fin</label>
                        <input type="date" value={s.endDate||""} onChange={e=>updSch(s.memberId,"endDate",e.target.value)} style={{width:"100%",border:"1px solid #E8E4DE",padding:"4px 6px",fontSize:11,outline:"none",borderRadius:6}}/>
                      </div>
                    </div>
                    <div style={{display:"flex",gap:8}}>
                      <div style={{flex:1}}>
                        <label style={{fontSize:9,color:"#999",display:"block",marginBottom:3}}>Hora inicio</label>
                        <select value={s.hour||HOURS[0]} onChange={e=>updSch(s.memberId,"hour",e.target.value)} style={{width:"100%",border:"1px solid #E8E4DE",padding:"4px 6px",fontSize:11,outline:"none",borderRadius:6,cursor:"pointer"}}>
                          {HOURS.map(h=><option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>
                      <div style={{flex:1}}>
                        <label style={{fontSize:9,color:"#999",display:"block",marginBottom:3}}>Hora fin</label>
                        <select value={s.endHour||HOURS[HOURS.length-1]} onChange={e=>updSch(s.memberId,"endHour",e.target.value)} style={{width:"100%",border:"1px solid #E8E4DE",padding:"4px 6px",fontSize:11,outline:"none",borderRadius:6,cursor:"pointer"}}>
                          {HOURS.map(h=><option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>
                    </div>
                  </>
                ):(
                  <div style={{display:"flex",gap:8}}>
                    <div style={{flex:1}}>
                      <label style={{fontSize:9,color:"#999",display:"block",marginBottom:3}}>Fecha</label>
                      <input type="date" value={s.date||""} onChange={e=>updSch(s.memberId,"date",e.target.value)} style={{width:"100%",border:"1px solid #E8E4DE",padding:"4px 6px",fontSize:11,outline:"none",borderRadius:6}}/>
                    </div>
                    <div style={{flex:1}}>
                      <label style={{fontSize:9,color:"#999",display:"block",marginBottom:3}}>Hora</label>
                      <select value={s.hour||HOURS[0]} onChange={e=>updSch(s.memberId,"hour",e.target.value)} style={{width:"100%",border:"1px solid #E8E4DE",padding:"4px 6px",fontSize:11,outline:"none",borderRadius:6,cursor:"pointer"}}>
                        {HOURS.map(h=><option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            );})}
          </div>
        )}

        {/* Tipo */}
        <label style={lbS}>Tipo</label>
        <div style={{display:"flex",gap:8,marginBottom:"1.1rem"}}>
          {[["normal","Normal","—"],["rec","Recurrente","↻"],["range","Rango","↔"]].map(([t,l,ic])=>{
            const a=ttype===t;
            return(
              <button key={t} onClick={()=>{if(t==="rec")setForm(p=>({...p,is_recurring:true,end_date:""}));else if(t==="range")setForm(p=>({...p,is_recurring:false,end_date:p.end_date||""}));else setForm(p=>({...p,is_recurring:false,end_date:""}));}}
                style={{flex:1,background:a?"#F4F2EE":"transparent",border:`1.5px solid ${a?form.color:"#E8E4DE"}`,borderRadius:8,padding:"7px 4px",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                <span style={{fontSize:18,fontWeight:300,color:a?form.color:"#bbb"}}>{ic}</span>
                <span style={{fontSize:10,fontWeight:a?600:400,color:a?"#1C1C1C":"#999"}}>{l}</span>
              </button>
            );
          })}
        </div>

        {/* Recurrencia */}
        {form.is_recurring&&(
          <div style={{background:"#F0F7FF",border:"1px solid #B5D4F4",borderRadius:10,padding:"10px 12px",marginBottom:"1.1rem"}}>
            <p style={{fontSize:9,color:"#3A6FE8",textTransform:"uppercase",letterSpacing:1,margin:"0 0 8px",fontWeight:500}}>Días</p>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
              {REC_DAYS.map(d=>{const s=(form.rec_days||[]).includes(d);return(
                <button key={d} onClick={()=>{const ds=form.rec_days||[];sf("rec_days",ds.includes(d)?ds.filter(x=>x!==d):[...ds,d]);}}
                  style={{background:s?form.color:"#fff",border:`1px solid ${s?form.color:"#E8E4DE"}`,borderRadius:20,padding:"3px 10px",fontSize:11,cursor:"pointer",color:s?textOn(form.color):"#666"}}>{d}</button>
              );})}
            </div>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <span style={{fontSize:11,color:"#555"}}>Hora:</span>
              <select value={form.hour||HOURS[0]} onChange={e=>sf("hour",e.target.value)} style={{border:"none",borderBottom:"1px solid #B5D4F4",padding:"3px 0",fontSize:12,outline:"none",background:"transparent",color:"#1C1C1C",cursor:"pointer"}}>
                {HOURS.map(h=><option key={h} value={h}>{h}</option>)}
              </select>
            </div>
          </div>
        )}

        {/* Fechas */}
        {!form.is_recurring&&(
          <div style={{display:"flex",gap:12,marginBottom:"1.1rem"}}>
            <div style={{flex:1}}>
              <label style={lbS}>Fecha inicio</label>
              <input type="date" value={form.date||""} onChange={e=>{const v=e.target.value;setForm(p=>({...p,date:v,schedules:p.schedules.map(s=>({...s,date:v}))}));}} style={{...inS,borderBottomColor:"#E8E4DE",fontSize:13}}/>
            </div>
            <div style={{flex:1}}>
              <label style={lbS}>Fecha fin <span style={{color:"#bbb",fontWeight:400}}>(opcional)</span></label>
              <input type="date" value={form.end_date||""} onChange={e=>sf("end_date",e.target.value)} style={{...inS,borderBottomColor:"#E8E4DE",fontSize:13}}/>
            </div>
            {!form.end_date&&(
              <div style={{flex:1}}>
                <label style={lbS}>Hora</label>
                <select value={form.hour||HOURS[0]} onChange={e=>{const v=e.target.value;setForm(p=>({...p,hour:v,schedules:p.schedules.map(s=>({...s,hour:v}))}));}} style={{width:"100%",border:"none",borderBottom:"2px solid #E8E4DE",padding:"6px 0",fontSize:13,outline:"none",background:"transparent",color:"#1C1C1C",cursor:"pointer"}}>
                  {HOURS.map(h=><option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            )}
          </div>
        )}

        {/* Duración */}
        {!form.end_date&&!form.is_recurring&&(
          <>
            <label style={lbS}>Duración (horas)</label>
            <select value={form.duration||1} onChange={e=>sf("duration",parseInt(e.target.value))} style={{width:"100%",border:"none",borderBottom:"2px solid #E8E4DE",padding:"6px 0",fontSize:13,outline:"none",background:"transparent",color:"#1C1C1C",cursor:"pointer",marginBottom:"1.1rem"}}>
              {[1,2,3,4,5,6,7,8].map(h=><option key={h} value={h}>{h}h</option>)}
            </select>
          </>
        )}

        {/* Estado */}
        <label style={lbS}>Estado</label>
        <div style={{display:"flex",gap:6,marginBottom:"1.1rem"}}>
          {STATUSES.map(s=>(
            <button key={s.value} onClick={()=>sf("status",s.value)} style={{flex:1,background:form.status===s.value?s.bg:"#F4F2EE",border:`1.5px solid ${form.status===s.value?s.color:"transparent"}`,borderRadius:8,padding:"7px 4px",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
              <div style={{width:7,height:7,borderRadius:"50%",background:s.color}}/>
              <span style={{fontSize:10,fontWeight:form.status===s.value?600:400,color:form.status===s.value?s.color:"#999"}}>{s.label}</span>
            </button>
          ))}
        </div>

        {/* Instrucciones */}
        <label style={lbS}>Instrucciones</label>
        <textarea value={form.comments} onChange={e=>sf("comments",e.target.value)} placeholder="Instrucciones para el equipo..." style={{width:"100%",border:"1px solid #E8E4DE",borderRadius:10,padding:"10px 12px",fontSize:13,outline:"none",background:"#FAFAF9",color:"#1C1C1C",resize:"vertical",minHeight:80,fontFamily:"'DM Sans',sans-serif",marginBottom:"1.1rem",boxSizing:"border-box"}}/>

        {/* Links referencia */}
        <label style={lbS}>Links de referencia</label>
        {refs.map((r,i)=>(
          <div key={i} style={{display:"flex",gap:6,marginBottom:6,alignItems:"center"}}>
            <input value={r.name||""} onChange={e=>{const a=[...refs];a[i]={...a[i],name:e.target.value};sf("refs",a);}} placeholder="Nombre" style={{width:120,border:"none",borderBottom:"1px solid #E8E4DE",fontSize:12,outline:"none",background:"transparent",color:"#1C1C1C",padding:"4px 0"}}/>
            <input value={r.url||""} onChange={e=>{const a=[...refs];a[i]={...a[i],url:e.target.value};sf("refs",a);}} placeholder="https://..." style={{flex:1,border:"none",borderBottom:"1px solid #E8E4DE",fontSize:12,outline:"none",background:"transparent",color:"#1C1C1C",padding:"4px 0"}}/>
            {r.url&&<a href={http(r.url)} target="_blank" rel="noreferrer" style={{fontSize:14,color:"#3A6FE8",textDecoration:"none"}}>↗</a>}
            <button onClick={()=>sf("refs",refs.filter((_,j)=>j!==i))} style={{background:"none",border:"none",color:"#ccc",cursor:"pointer",fontSize:14}}>✕</button>
          </div>
        ))}
        <button onClick={()=>sf("refs",[...refs,{name:"",url:""}])} style={{display:"flex",alignItems:"center",gap:5,background:"none",border:"1px dashed #ddd",borderRadius:8,padding:"5px 10px",fontSize:11,color:"#aaa",cursor:"pointer",marginBottom:"1.1rem"}}>
          <span style={{fontSize:16}}>+</span> Agregar link
        </button>

        {/* Link entregable */}
        <label style={lbS}>Link entregable</label>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:"1.5rem"}}>
          <input value={form.link} onChange={e=>sf("link",e.target.value)} placeholder="https://..." style={{...inS,borderBottomColor:"#E8E4DE",flex:1}}/>
          {form.link&&<a href={http(form.link)} target="_blank" rel="noreferrer" style={{fontSize:18,color:"#3A6FE8",textDecoration:"none"}}>↗</a>}
        </div>

        {/* Botones */}
        <div style={{display:"flex",gap:8,justifyContent:"space-between",flexWrap:"wrap"}}>
          <div style={{display:"flex",gap:8}}>
            {isEdit&&<button onClick={onDelete} style={{background:"none",border:"1px solid #FFD0C8",borderRadius:8,padding:"7px 12px",fontSize:12,cursor:"pointer",color:"#E8623A"}}>Eliminar</button>}
            {isEdit&&<button onClick={onDuplicate} style={{background:"none",border:"1px solid #E8E4DE",borderRadius:8,padding:"7px 12px",fontSize:12,cursor:"pointer",color:"#666"}}>Duplicar</button>}
          </div>
          <div style={{display:"flex",gap:8,marginLeft:"auto"}}>
            <button onClick={()=>setModal(null)} style={{background:"none",border:"1px solid #E8E4DE",borderRadius:8,padding:"7px 12px",fontSize:12,cursor:"pointer",color:"#666"}}>Cancelar</button>
            <button onClick={onSave} style={{background:form.color,border:"none",borderRadius:8,padding:"7px 16px",fontSize:12,cursor:"pointer",color:textOn(form.color),fontWeight:600}}>{isEdit?"Guardar":"Agregar"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [brand, setBrand]     = useState({ name:"OLOVER Studio",logo:null,navBg:"#111111",sideBg:"#1C1C1C",topBg:"#ffffff",accent:"#E8623A" });
  const [boards, setBoards]   = useState([]);
  const [members, setMembers] = useState([]);
  const [tasks, setTasks]     = useState([]);
  const [assigns, setAssigns] = useState([]);
  const [clients, setClients] = useState([]);
  const [holidays, setHols]   = useState({});
  const [ready, setReady]     = useState(false);
  const [boardId, setBoardId] = useState("animadores");
  const [sideOpen, setSideOpen] = useState(true);
  const [settOpen, setSettOpen] = useState(false);
  const [settTab, setSettTab]   = useState("marca");
  const [fClient, setFClient]   = useState("");
  const [modal, setModal]       = useState(null);
  const [form, setForm]         = useState(EMPTY);
  const [newClient, setNewClient] = useState("");
  const [quick, setQuick]       = useState("");
  const [openG, setOpenG]       = useState({ pendiente:true,asignada:true,terminada:true });
  const [openC, setOpenC]       = useState({});
  const [views, setViews]       = useState({ animadores:"weekly",disenadores:"weekly",proveedores:"weekly" });
  const [wStarts, setWStarts]   = useState({ animadores:getMonday(today),disenadores:getMonday(today),proveedores:getMonday(today) });
  const [cYears, setCYears]     = useState({ animadores:today.getFullYear(),disenadores:today.getFullYear(),proveedores:today.getFullYear() });
  const [cMonths, setCMonths]   = useState({ animadores:today.getMonth(),disenadores:today.getMonth(),proveedores:today.getMonth() });
  const [memFilter, setMemFilter] = useState({ animadores:"",disenadores:"",proveedores:"" });
  const [showTrash, setShowTrash] = useState(false);
  const [sidebarMemberFilter, setSidebarMemberFilter] = useState("");
  const [resizing, setResizing] = useState(null);
  const [editingLunch, setEditingLunch] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [statuses, setStatuses] = useState([]);
  const logoRef = useRef();
  const dragRef = useRef(null);
  
  // Función para guardar estado en el historial
  const saveToHistory = useCallback((action, data) => {
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push({ action, data, timestamp: Date.now() });
      if (newHistory.length > 10) newHistory.shift();
      return newHistory;
    });
    setHistoryIndex(prev => Math.min(prev + 1, 9));
  }, [historyIndex]);
  
  // Función para deshacer
  const undo = useCallback(async () => {
    if (historyIndex < 0) return;
    const item = history[historyIndex];
    
    switch(item.action) {
      case 'CREATE_TASK':
        await supabase.from("tasks").delete().eq("id", item.data.id);
        break;
      case 'UPDATE_TASK':
        await supabase.from("tasks").update(item.data.oldValues).eq("id", item.data.id);
        break;
      case 'DELETE_TASK':
        await supabase.from("tasks").update({ deleted_at: null }).eq("id", item.data.id);
        break;
      case 'MOVE_TASK':
        await supabase.from("tasks").update({ 
          date: item.data.oldDate, 
          hour: item.data.oldHour 
        }).eq("id", item.data.id);
        break;
    }
    
    setHistoryIndex(prev => prev - 1);
  }, [history, historyIndex]);
  
  // Función para rehacer
  const redo = useCallback(async () => {
    if (historyIndex >= history.length - 1) return;
    const item = history[historyIndex + 1];
    
    switch(item.action) {
      case 'CREATE_TASK':
        await supabase.from("tasks").insert(item.data.task);
        break;
      case 'UPDATE_TASK':
        await supabase.from("tasks").update(item.data.newValues).eq("id", item.data.id);
        break;
      case 'DELETE_TASK':
        await supabase.from("tasks").update({ deleted_at: new Date().toISOString() }).eq("id", item.data.id);
        break;
      case 'MOVE_TASK':
        await supabase.from("tasks").update({ 
          date: item.data.newDate, 
          hour: item.data.newHour 
        }).eq("id", item.data.id);
        break;
    }
    
    setHistoryIndex(prev => prev + 1);
  }, [history, historyIndex]);
  
  // Atajos de teclado para Undo/Redo
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  useEffect(()=>{
    const load=async(y)=>{ try{ const r=await window.fetch(`https://date.nager.at/api/v3/PublicHolidays/${y}/CO`); const d=await r.json(); const m={}; d.forEach(h=>{m[h.date]=h.localName||h.name;}); setHols(p=>({...p,[y]:m})); }catch{} };
    load(today.getFullYear()); load(today.getFullYear()+1);
  },[]);

  useEffect(()=>{
    const handleMouseMove=(e)=>{
      if(!resizing)return;
      const delta=e.clientY-resizing.startY;
      const hoursDelta=Math.round(delta/HOUR_H);
      const newDur=Math.max(1,Math.min(10,resizing.startDur+hoursDelta));
      if(newDur!==resizing.currentDur){
        setResizing(r=>({...r,currentDur:newDur}));
      }
    };

    const handleMouseUp=()=>{
      if(resizing&&resizing.currentDur!==resizing.startDur){
        updateTask(resizing.taskId,{duration:resizing.currentDur});
      }
      setResizing(null);
    };

    if(resizing){
      document.addEventListener("mousemove",handleMouseMove);
      document.addEventListener("mouseup",handleMouseUp);
      return()=>{
        document.removeEventListener("mousemove",handleMouseMove);
        document.removeEventListener("mouseup",handleMouseUp);
      };
    }
  },[resizing]);

  const isHol = d => holidays[d.getFullYear()]?.[toISO(d)]||null;

  useEffect(()=>{
    const load=async()=>{
      const [{data:br},{data:bo},{data:me},{data:ta},{data:as},{data:cl}]=await Promise.all([
        supabase.from("brand").select("*").single(),
        supabase.from("boards").select("*").order("position"),
        supabase.from("members").select("*").order("position"),
        supabase.from("tasks").select("*").order("created_at"),
        supabase.from("task_assignments").select("*"),
        supabase.from("clients").select("*").order("position"),
      ]);
      if(br)setBrand({name:br.name,logo:br.logo,navBg:br.nav_bg,sideBg:br.sidebar_bg,topBg:br.topbar_bg,accent:br.accent});
      if(bo)setBoards(bo); if(me)setMembers(me); if(ta)setTasks(ta); if(as)setAssigns(as); if(cl)setClients(cl);
      setReady(true);
    };
    load();
    const sub=(t,s,q)=>supabase.channel(`rt-${t}-${Math.random()}`).on("postgres_changes",{event:"*",schema:"public",table:t},()=>q().then(({data})=>data&&s(data))).subscribe();
    const c1=sub("tasks",setTasks,()=>supabase.from("tasks").select("*").order("created_at"));
    const c2=sub("task_assignments",setAssigns,()=>supabase.from("task_assignments").select("*"));
    const c3=sub("members",setMembers,()=>supabase.from("members").select("*").order("position"));
    const c4=sub("boards",setBoards,()=>supabase.from("boards").select("*").order("position"));
    const c5=sub("clients",setClients,()=>supabase.from("clients").select("*").order("position"));
    const c6=supabase.channel("rt-brand").on("postgres_changes",{event:"*",schema:"public",table:"brand"},()=>
      supabase.from("brand").select("*").single().then(({data})=>data&&setBrand({name:data.name,logo:data.logo,navBg:data.nav_bg,sideBg:data.sidebar_bg,topBg:data.topbar_bg,accent:data.accent}))).subscribe();
    return()=>[c1,c2,c3,c4,c5,c6].forEach(c=>supabase.removeChannel(c));
  },[]);

  const board  = boards.find(b=>b.id===boardId)||boards[0];
  const bMems  = members.filter(m=>m.board_id===boardId);
  const view   = views[boardId];
  const wStart = wStarts[boardId];
  const cYear  = cYears[boardId];
  const cMonth = cMonths[boardId];
  const mFilter = memFilter[boardId];
  const wDates = WEEK_DAYS.map((_,i)=>addDays(wStart,i));
  const wLabel = ()=>{ const e=addDays(wStart,4); return `${wStart.getDate()} – ${e.getDate()} ${MONTHS[e.getMonth()]} ${e.getFullYear()}`; };

  const setView=v=>setViews(p=>({...p,[boardId]:v}));
  const setWS=fn=>setWStarts(p=>({...p,[boardId]:typeof fn==="function"?fn(p[boardId]):fn}));
  const setMF=v=>setMemFilter(p=>({...p,[boardId]:v}));
  const prevMo=()=>{if(cMonth===0){setCMonths(p=>({...p,[boardId]:11}));setCYears(p=>({...p,[boardId]:p[boardId]-1}));}else setCMonths(p=>({...p,[boardId]:p[boardId]-1}));};
  const nextMo=()=>{if(cMonth===11){setCMonths(p=>({...p,[boardId]:0}));setCYears(p=>({...p,[boardId]:p[boardId]+1}));}else setCMonths(p=>({...p,[boardId]:p[boardId]+1}));};

  const mTasks=useCallback(mid=>{const ids=assigns.filter(a=>a.member_id===mid).map(a=>a.task_id);return tasks.filter(t=>ids.includes(t.id)&&!t.deleted_at);},[assigns,tasks]);
  const bTasks=useCallback(()=>{const mids=bMems.map(m=>m.id);const ids=new Set(assigns.filter(a=>mids.includes(a.member_id)).map(a=>a.task_id));return tasks.filter(t=>ids.has(t.id)&&!t.deleted_at);},[assigns,tasks,bMems]);
  const sTasks=useCallback(()=>{
    const mids=bMems.map(m=>m.id);
    const ids=new Set(assigns.filter(a=>mids.includes(a.member_id)).map(a=>a.task_id));
    const unass=tasks.filter(t=>t.board_id===boardId&&assigns.filter(a=>a.task_id===t.id).length===0&&!t.deleted_at);
    const ass=tasks.filter(t=>ids.has(t.id)&&!t.deleted_at);
    return [...new Map([...unass,...ass].map(t=>[t.id,t])).values()];
  },[assigns,tasks,bMems,boardId]);
  const trashTasks=useCallback(()=>{
    const mids=bMems.map(m=>m.id);
    const ids=new Set(assigns.filter(a=>mids.includes(a.member_id)).map(a=>a.task_id));
    const unass=tasks.filter(t=>t.board_id===boardId&&assigns.filter(a=>a.task_id===t.id).length===0&&t.deleted_at);
    const ass=tasks.filter(t=>ids.has(t.id)&&t.deleted_at);
    return [...new Map([...unass,...ass].map(t=>[t.id,t])).values()];
  },[assigns,tasks,bMems,boardId]);
  const tAss=useCallback(tid=>{const ids=assigns.filter(a=>a.task_id===tid).map(a=>a.member_id);return members.filter(m=>ids.includes(m.id));},[assigns,members]);

  const getMSch=(task,mid)=>{
    if(!task.assignee_schedules || task.assignee_schedules.length===0){
      return {date:task.date,hour:task.hour||HOURS[0],endDate:task.end_date||"",endHour:""};
    }
    
    // Buscar el schedule específico de este miembro
    const memberSchedule=task.assignee_schedules.find(s=>s.memberId===mid);
    
    if(memberSchedule){
      return {
        date:memberSchedule.date||task.date,
        hour:memberSchedule.hour||task.hour||HOURS[0],
        endDate:memberSchedule.endDate||task.end_date||"",
        endHour:memberSchedule.endHour||""
      };
    }
    
    // Si no encontró schedule específico, devolver valores por defecto
    return {date:task.date,hour:task.hour||HOURS[0],endDate:task.end_date||"",endHour:""};
  };
  const cOf=id=>clients.find(c=>c.id===id);

  const addTask=async(f,mid,date,hour)=>{
    const id=uid();
    const allA=[...new Set([...(mid?[mid]:[]),...(f.assignees||[])])];
    const scheds=allA.map(m=>{const s=(f.schedules||[]).find(s=>s.memberId===m);return{memberId:m,date:s?.date||date||"",hour:s?.hour||hour||HOURS[0],endDate:s?.endDate||"",endHour:s?.endHour||""};});
    const taskData={
      id,board_id:boardId,member_id:allA[0]||null,
      title:f.title||"Sin título",status:f.status||"pendiente",
      link:f.link||"",comments:f.comments||"",client_id:f.client_id||"",
      color:f.color||"#FFFFFF",duration:f.duration||1,
      reference_links:f.refs||[],assignee_schedules:scheds,
      date:scheds[0]?.date||date||null,hour:scheds[0]?.hour||hour||HOURS[0],
      is_recurring:f.is_recurring||false,recurrence_days:f.rec_days||[],end_date:f.end_date||null,
    };
    
    await supabase.from("tasks").insert(taskData);
    if(allA.length>0)await supabase.from("task_assignments").insert(allA.map(m=>({id:uid(),task_id:id,member_id:m})));
    
    saveToHistory('CREATE_TASK',{id,task:taskData});
  };

  const quickAdd=async()=>{
    if(!quick.trim())return;
    await supabase.from("tasks").insert({id:uid(),board_id:boardId,title:quick.trim(),status:"pendiente",color:"#E8623A",duration:1,reference_links:[],assignee_schedules:[],is_recurring:false,recurrence_days:[]});
    setQuick("");
  };

  const updateTask=async(id,patch)=>{
    const{assignees,schedules,...rest}=patch;
    const fm={title:"title",status:"status",link:"link",date:"date",hour:"hour",end_date:"end_date",comments:"comments",client_id:"client_id",color:"color",duration:"duration",reference_links:"reference_links",memberId:"member_id",is_recurring:"is_recurring",recurrence_days:"recurrence_days"};
    const db={};Object.keys(rest).forEach(k=>{if(fm[k])db[fm[k]]=rest[k];});
    if(schedules){db.assignee_schedules=schedules;if(schedules[0]?.date){db.date=schedules[0].date;db.hour=schedules[0].hour||HOURS[0];}}
    if(Object.keys(db).length>0)await supabase.from("tasks").update(db).eq("id",id);
    if(assignees!==undefined){await supabase.from("task_assignments").delete().eq("task_id",id);if(assignees.length>0)await supabase.from("task_assignments").insert(assignees.map(m=>({id:uid(),task_id:id,member_id:m})));}
  };

  const delTask=async id=>{
    saveToHistory('DELETE_TASK',{id});
    await supabase.from("tasks").update({deleted_at:new Date().toISOString()}).eq("id",id);
  };
  const restoreTask=async id=>{await supabase.from("tasks").update({deleted_at:null}).eq("id",id);};
  const permDelTask=async id=>{await supabase.from("task_assignments").delete().eq("task_id",id);await supabase.from("tasks").delete().eq("id",id);};
  const dupTask=async task=>{const aids=assigns.filter(a=>a.task_id===task.id).map(a=>a.member_id);const{id:_,created_at,...rest}=task;const id=uid();await supabase.from("tasks").insert({...rest,id,title:`${task.title} (copia)`});if(aids.length>0)await supabase.from("task_assignments").insert(aids.map(m=>({id:uid(),task_id:id,member_id:m})));setModal(null);};
  const addMember=async bid=>{const bm=members.filter(m=>m.board_id===bid);const colors=["#E8623A","#3A6FE8","#7B6BE0","#3A9E8A","#C49A3C","#E06B9A"];const b=boards.find(x=>x.id===bid);await supabase.from("members").insert({id:uid(),board_id:bid,name:`${b?.label||""} ${bm.length+1}`,color:colors[bm.length%colors.length],position:bm.length});};
  const updMember=async(id,p)=>supabase.from("members").update(p).eq("id",id);
  const delMember=async id=>{await supabase.from("task_assignments").delete().eq("member_id",id);await supabase.from("members").delete().eq("id",id);};
  const addClient=async()=>{if(!newClient.trim())return;const colors=["#E8623A","#3A6FE8","#7B6BE0","#3A9E8A","#C49A3C","#E06B9A","#4CAF50","#58A6FF"];await supabase.from("clients").insert({id:uid(),name:newClient.trim(),color:colors[clients.length%colors.length],position:clients.length});setNewClient("");};
  const updClient=async(id,p)=>supabase.from("clients").update(p).eq("id",id);
  const delClient=async id=>supabase.from("clients").delete().eq("id",id);
  const updBoard=async(id,p)=>supabase.from("boards").update(p).eq("id",id);
  const saveBrand=async b=>{const{data}=await supabase.from("brand").select("id").single();await supabase.from("brand").update({name:b.name,logo:b.logo,nav_bg:b.navBg,sidebar_bg:b.sideBg,topbar_bg:b.topBg,accent:b.accent}).eq("id",data.id);};

  const openAdd=(mid,date,hour)=>{
    const d=date||"";const h=hour||HOURS[0];
    setModal({mode:"add",mid,date:d,hour:h});
    setForm({...EMPTY,assignees:mid?[mid]:[],schedules:mid?[{memberId:mid,date:d,hour:h,endDate:"",endHour:""}]:[],date:d,hour:h});
  };

  const openEdit=task=>{
    const aids=assigns.filter(a=>a.task_id===task.id).map(a=>a.member_id);
    const scheds=aids.map(m=>{
      const s=(task.assignee_schedules||[]).find(s=>s.memberId===m);
      return{
        memberId:m,
        date:s?.date||task.date||"",
        hour:s?.hour||task.hour||HOURS[0],
        endDate:s?.endDate||task.end_date||"",
        endHour:s?.endHour||""
      };
    });
    setModal({mode:"edit",task});
    setForm({title:task.title,link:task.link||"",status:task.status||"pendiente",comments:task.comments||"",client_id:task.client_id||"",color:task.color||"#FFFFFF",duration:task.duration||1,assignees:aids,schedules:scheds,refs:task.reference_links||[],date:scheds[0]?.date||task.date||"",hour:scheds[0]?.hour||task.hour||HOURS[0],end_date:task.end_date||"",is_recurring:task.is_recurring||false,rec_days:task.recurrence_days||[]});
  };

  const saveModal=async()=>{
    if(!form.title.trim())return;
    const scheds=form.schedules.map(s=>({
      memberId:s.memberId,
      date:s.date||form.date||null,
      hour:s.hour||form.hour||HOURS[0],
      endDate:s.endDate||null,
      endHour:s.endHour||null
    }));
    if(modal.mode==="add"){await addTask({...form,schedules:scheds},modal.mid,form.date,form.hour);}
    else{await updateTask(modal.task.id,{title:form.title,link:form.link,status:form.status,comments:form.comments,client_id:form.client_id,color:form.color,duration:form.duration,reference_links:form.refs,assignees:form.assignees,schedules:scheds,date:form.is_recurring?null:(scheds[0]?.date||form.date||null),hour:scheds[0]?.hour||form.hour||HOURS[0],end_date:form.end_date||null,is_recurring:form.is_recurring,recurrence_days:form.rec_days});}
    setModal(null);
  };

  const onDragStart=(e,task)=>{e.stopPropagation();dragRef.current=task;};
  const onDrop=async(e,mid,date,hour)=>{
    e.preventDefault();const t=dragRef.current;if(!t)return;
    
    // Guardar estado anterior para Undo
    saveToHistory('MOVE_TASK',{id:t.id,oldDate:t.date,oldHour:t.hour,newDate:date,newHour:hour});
    
    const aids=assigns.filter(a=>a.task_id===t.id).map(a=>a.member_id);
    const bMids=bMems.map(m=>m.id);const cross=aids.filter(id=>!bMids.includes(id));
    const newA=[...cross,mid];
    const newS=newA.map(m=>{if(m===mid)return{memberId:mid,date,hour};const f=(t.assignee_schedules||[]).find(s=>s.memberId===m&&s.date);return f||{memberId:m,date:t.date,hour:t.hour||HOURS[0]};});
    await updateTask(t.id,{date,hour,memberId:mid,assignees:newA,schedules:newS,status:"asignada"});
    dragRef.current=null;
  };

  const handleLogo=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>setBrand(p=>({...p,logo:ev.target.result}));r.readAsDataURL(f);};

  if(!ready)return(
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#F4F2EE",flexDirection:"column",gap:12,fontFamily:"sans-serif"}}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=DM+Serif+Display&display=swap" rel="stylesheet"/>
      <div style={{width:40,height:40,borderRadius:10,background:"#E8623A",display:"flex",alignItems:"center",justifyContent:"center"}}>
        <span style={{color:"#fff",fontSize:14,fontWeight:700}}>OL</span>
      </div>
      <p style={{fontSize:13,color:"#aaa"}}>Cargando...</p>
    </div>
  );

  const SideTasks=()=>{
    if(showTrash){
      const trash=trashTasks();
      const getDaysLeft=t=>{
        if(!t.deleted_at)return 30;
        const del=new Date(t.deleted_at);
        const now=new Date();
        const diff=30-Math.floor((now-del)/(1000*60*60*24));
        return Math.max(0,diff);
      };
      return(
        <div style={{flex:1,overflowY:"auto",padding:"0.5rem"}}>
          <div style={{padding:"8px 10px",background:"#2a2a2a",borderRadius:8,marginBottom:8}}>
            <p style={{fontSize:9,color:"#888",margin:"0 0 4px",textTransform:"uppercase",letterSpacing:1}}>Papelera</p>
            <p style={{fontSize:10,color:"#666",margin:0,lineHeight:1.4}}>Las tareas se eliminan automáticamente después de 30 días</p>
          </div>
          {trash.length===0&&<p style={{fontSize:11,color:"#333",textAlign:"center",marginTop:"1.5rem"}}>La papelera está vacía</p>}
          {trash.map(t=>{
            const ass=tAss(t.id);
            const daysLeft=getDaysLeft(t);
            const cl=cOf(t.client_id);
            return(
              <div key={t.id} style={{padding:"10px 8px",margin:"4px 0",background:"#252525",borderLeft:`3px solid ${t.color||"#444"}`,borderRadius:"0 6px 6px 0"}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
                  <p style={{fontSize:11,color:"#ddd",margin:0,flex:1,lineHeight:1.3}}>{t.title}</p>
                  <span style={{fontSize:9,color:daysLeft<7?"#E8623A":"#888",background:daysLeft<7?"#E8623A22":"#2a2a2a",padding:"2px 6px",borderRadius:10}}>{daysLeft}d</span>
                </div>
                {cl&&<p style={{fontSize:9,color:"#888",margin:"0 0 6px"}}>{cl.name}</p>}
                {ass.length>0&&<div style={{display:"flex",gap:2,marginBottom:6,flexWrap:"wrap"}}>{ass.map(m=><span key={m.id} style={{fontSize:9,background:m.color+"33",color:m.color,borderRadius:10,padding:"1px 5px"}}>{m.name}</span>)}</div>}
                <div style={{display:"flex",gap:4}}>
                  <button onClick={()=>restoreTask(t.id)} style={{flex:1,background:brand.accent,border:"none",borderRadius:6,padding:"5px 8px",fontSize:10,color:textOn(brand.accent),cursor:"pointer",fontWeight:600}}>↺ Restaurar</button>
                  <button onClick={()=>{if(window.confirm("¿Eliminar permanentemente? No se puede deshacer."))permDelTask(t.id);}} style={{background:"#E8623A22",border:"1px solid #E8623A",borderRadius:6,padding:"5px 8px",fontSize:10,color:"#E8623A",cursor:"pointer"}}>✕</button>
                </div>
              </div>
            );
          })}
        </div>
      );
    }
    const all=sTasks();
    let fil=fClient?all.filter(t=>t.client_id===fClient):all;
    
    // Filtrar por persona si hay un filtro activo
    if(sidebarMemberFilter){
      fil=fil.filter(t=>{
        const ass=assigns.filter(a=>a.task_id===t.id).map(a=>a.member_id);
        return ass.includes(sidebarMemberFilter);
      });
    }
    
    return(
      <div style={{flex:1,overflowY:"auto",padding:"0.5rem"}}>
        {/* Filtro por persona */}
        <div style={{marginBottom:12,padding:"8px 10px",background:"#2a2a2a",borderRadius:8}}>
          <label style={{fontSize:9,color:"#888",display:"block",marginBottom:6,textTransform:"uppercase",letterSpacing:1}}>Filtrar por persona</label>
          <select value={sidebarMemberFilter} onChange={e=>setSidebarMemberFilter(e.target.value)} style={{width:"100%",background:"#1a1a1a",border:"1px solid #333",borderRadius:6,padding:"6px 8px",fontSize:11,color:"#ddd",outline:"none",cursor:"pointer"}}>
            <option value="">Todas las personas</option>
            {bMems.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        
        {STATUSES.map(st=>{
          const stT=fil.filter(t=>t.status===st.value);const isO=openG[st.value];
          const byC={};stT.forEach(t=>{const k=t.client_id||"_";if(!byC[k])byC[k]=[];byC[k].push(t);});
          return(
            <div key={st.value} style={{marginBottom:6}}>
              <button onClick={()=>setOpenG(p=>({...p,[st.value]:!p[st.value]}))} style={{display:"flex",alignItems:"center",gap:8,background:st.bg,border:`1px solid ${st.color}33`,cursor:"pointer",width:"100%",padding:"8px 10px",borderRadius:8,transition:"all 0.2s"}}>
                <span style={{fontSize:11,fontWeight:700,color:st.color,textTransform:"uppercase",letterSpacing:1,flex:1,textAlign:"left"}}>{st.label}</span>
                <span style={{fontSize:11,fontWeight:700,color:st.color,background:"#fff",borderRadius:12,padding:"2px 8px",minWidth:28,textAlign:"center"}}>{stT.length}</span>
                <span style={{fontSize:12,color:st.color}}>{isO?"▾":"▸"}</span>
              </button>
              {isO&&Object.entries(byC).map(([ck,cT])=>{
                const cl=ck==="_"?null:cOf(ck);const isOC=openC[`${st.value}-${ck}`]!==false;
                return(
                  <div key={ck} style={{marginLeft:8,marginBottom:2}}>
                    <button onClick={()=>setOpenC(p=>({...p,[`${st.value}-${ck}`]:!isOC}))} style={{display:"flex",alignItems:"center",gap:5,background:"none",border:"none",cursor:"pointer",width:"100%",padding:"3px 4px",borderRadius:4}}>
                      {cl&&<div style={{width:6,height:6,borderRadius:"50%",background:cl.color,flexShrink:0}}/>}
                      <span style={{fontSize:10,color:cl?cl.color:"#555",fontWeight:500}}>{cl?cl.name:"Sin cliente"}</span>
                      <span style={{fontSize:9,color:"#444",marginLeft:"auto"}}>{cT.length} {isOC?"▾":"▸"}</span>
                    </button>
                    {isOC&&cT.map(t=>{
                      const ass=tAss(t.id);
                      return(
                        <div key={t.id} draggable onDragStart={e=>onDragStart(e,t)} onDoubleClick={()=>openEdit(t)} style={{display:"flex",alignItems:"flex-start",gap:5,padding:"5px 6px",margin:"2px 0",background:"#252525",borderLeft:`3px solid ${t.color||"#444"}`,borderRadius:"0 6px 6px 0",cursor:"grab"}}>
                          <div style={{flex:1,minWidth:0}}>
                            <p style={{fontSize:11,color:t.status==="terminada"?"#555":"#ddd",margin:0,lineHeight:1.3,textDecoration:t.status==="terminada"?"line-through":"none",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{t.title}</p>
                            {ass.length>0&&<div style={{display:"flex",gap:2,marginTop:3,flexWrap:"wrap"}}>{ass.map(m=><span key={m.id} style={{fontSize:9,background:m.color+"33",color:m.color,borderRadius:10,padding:"1px 5px"}}>{m.name}</span>)}</div>}
                          </div>
                          <button onClick={e=>{e.stopPropagation();openEdit(t);}} style={{background:"none",border:"none",color:"#555",fontSize:11,cursor:"pointer",padding:0}}>✎</button>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          );
        })}
        {fil.length===0&&<p style={{fontSize:11,color:"#333",textAlign:"center",marginTop:"1.5rem"}}>Sin tareas</p>}
      </div>
    );
  };

  const TBlock=({t,isAllDay,blockDuration})=>{
    const cl=cOf(t.client_id);
    const isResizing=resizing&&resizing.taskId===t.id;
    const dur=blockDuration||(isAllDay?HOURS.length:(isResizing?resizing.currentDur:(t.duration||1)));
    
    const handleResizeStart=(e)=>{
      if(isAllDay||t.end_date)return;
      e.stopPropagation();
      setResizing({taskId:t.id,startY:e.clientY,startDur:t.duration||1,currentDur:t.duration||1});
    };

    return(
      <div draggable={!isResizing && !t.end_date} onDragStart={e=>!isResizing&&!t.end_date&&onDragStart(e,t)} onDoubleClick={e=>{e.stopPropagation();openEdit(t);}}
        style={{position:"absolute",left:2,right:2,top:2,height:dur*HOUR_H-4,background:t.color||"#FFFFFF",borderRadius:6,padding:"3px 6px",cursor:isResizing?"ns-resize":(t.end_date?"pointer":"grab"),overflow:"hidden",zIndex:2,boxShadow:"0 1px 4px rgba(0,0,0,0.15)",border:"1px solid #ddd"}}>
        <p style={{fontSize:10,fontWeight:600,color:textOn(t.color||"#FFFFFF"),margin:0,lineHeight:1.3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.title}{t.is_recurring?" ↻":""}{t.end_date?" ↔":""}</p>
        {cl&&<p style={{fontSize:9,color:textOn(t.color||"#FFFFFF"),opacity:0.8,margin:0}}>{cl.name}</p>}
        {!isAllDay&&!t.end_date&&dur>1&&<p style={{fontSize:9,color:textOn(t.color||"#FFFFFF"),opacity:0.7,margin:0}}>{dur}h</p>}
        {!isAllDay&&!t.end_date&&(
          <div 
            onMouseDown={handleResizeStart}
            style={{position:"absolute",bottom:0,left:0,right:0,height:10,cursor:"ns-resize",background:"transparent",zIndex:10}}
          />
        )}
      </div>
    );
  };

  return(
    <div style={{display:"flex",height:"100vh",background:"#F4F2EE",fontFamily:"'DM Sans',sans-serif",overflow:"hidden"}}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=DM+Serif+Display&display=swap" rel="stylesheet"/>
      <div style={{width:64,background:brand.navBg,display:"flex",flexDirection:"column",alignItems:"center",paddingTop:14,gap:4,zIndex:20,flexShrink:0}}>
        <div style={{width:38,height:38,borderRadius:10,background:brand.logo?"transparent":brand.accent,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:10,overflow:"hidden"}}>
          {brand.logo?<img src={brand.logo} alt="logo" style={{width:"100%",height:"100%",objectFit:"contain"}}/>:<span style={{color:textOn(brand.accent),fontSize:12,fontWeight:700}}>{brand.name.slice(0,2).toUpperCase()}</span>}
        </div>
        {boards.map(b=>(
          <button key={b.id} onClick={()=>setBoardId(b.id)} title={b.label} style={{width:44,height:44,borderRadius:12,border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",background:boardId===b.id?b.accent+"28":"transparent",outline:boardId===b.id?`2px solid ${b.accent}`:"2px solid transparent",transition:"all 0.15s"}}>
            <span style={{fontSize:16,color:boardId===b.id?b.accent:"#555"}}>{b.icon}</span>
          </button>
        ))}
        <div style={{flex:1}}/>
        <button onClick={()=>setSettOpen(true)} style={{width:44,height:44,borderRadius:12,border:"none",cursor:"pointer",background:"transparent",color:"#555",fontSize:18,marginBottom:4}}>⚙</button>
        <button onClick={()=>setSideOpen(o=>!o)} style={{width:44,height:44,borderRadius:12,border:"none",cursor:"pointer",background:"transparent",color:"#555",fontSize:18,marginBottom:12}}>☰</button>
      </div>

      {sideOpen&&board&&(
        <div style={{width:270,background:brand.sideBg,display:"flex",flexDirection:"column",zIndex:10,flexShrink:0}}>
          <div style={{padding:"1.1rem 1rem 0.75rem",borderBottom:"1px solid #2a2a2a"}}>
            <p style={{fontSize:9,letterSpacing:3,color:"#444",textTransform:"uppercase",marginBottom:4}}>{brand.name}</p>
            <div style={{display:"flex",alignItems:"center",gap:7}}>
              <span style={{fontSize:15,color:board.accent}}>{board.icon}</span>
              <p style={{fontFamily:"'DM Serif Display',serif",fontSize:"1.05rem",color:"#F4F2EE",margin:0}}>{board.label}</p>
            </div>
          </div>
          <div style={{padding:"0.5rem 1rem",borderBottom:"1px solid #2a2a2a"}}>
            <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
              {bMems.map(m=>(
                <div key={m.id} style={{display:"flex",alignItems:"center",gap:4}}>
                  <div style={{width:18,height:18,borderRadius:"50%",background:m.color,display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{color:"#fff",fontSize:8,fontWeight:700}}>{(m.name||"?")[0]}</span></div>
                  <span style={{fontSize:11,color:"#bbb"}}>{m.name}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{padding:"0.5rem 1rem",borderBottom:"1px solid #2a2a2a"}}>
            <select value={fClient} onChange={e=>setFClient(e.target.value)} style={{width:"100%",background:"#2a2a2a",border:"none",borderRadius:8,color:"#bbb",fontSize:11,padding:"5px 8px",outline:"none",cursor:"pointer"}}>
              <option value="">Todos los clientes</option>
              {clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <SideTasks/>
          <div style={{padding:"0.5rem 1rem",borderTop:"1px solid #2a2a2a",display:"flex",flexDirection:"column",gap:6}}>
            <button onClick={()=>setShowTrash(t=>!t)} style={{width:"100%",background:showTrash?"#E8623A22":"transparent",border:`1px solid ${showTrash?"#E8623A":brand.accent+"55"}`,borderRadius:8,color:showTrash?"#E8623A":brand.accent,fontSize:11,cursor:"pointer",padding:"6px",fontWeight:500,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
              <span style={{fontSize:14}}>🗑</span>
              {showTrash?"Ver tareas":"Papelera"}
              {!showTrash&&trashTasks().length>0&&<span style={{background:brand.accent,color:textOn(brand.accent),borderRadius:10,padding:"1px 6px",fontSize:9,fontWeight:700}}>{trashTasks().length}</span>}
            </button>
            {!showTrash&&(
              <>
                <div style={{display:"flex",gap:6}}>
                  <input value={quick} onChange={e=>setQuick(e.target.value)} onKeyDown={e=>e.key==="Enter"&&quickAdd()} placeholder="Tarea rápida..." style={{flex:1,background:"#2a2a2a",border:"none",borderRadius:8,color:"#F4F2EE",fontSize:11,padding:"6px 8px",outline:"none"}}/>
                  <button onClick={quickAdd} style={{background:brand.accent,border:"none",borderRadius:8,color:textOn(brand.accent),fontSize:16,cursor:"pointer",width:28,fontWeight:700}}>+</button>
                </div>
                <button onClick={()=>openAdd(null,"","")} style={{width:"100%",background:"transparent",border:`1px solid ${brand.accent}55`,borderRadius:8,color:brand.accent,fontSize:11,cursor:"pointer",padding:"6px",fontWeight:500}}>+ Nueva tarea completa</button>
              </>
            )}
          </div>
        </div>
      )}

      {board&&(
        <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
          <div style={{background:brand.topBg,borderBottom:"1px solid #E8E4DE",padding:"0.6rem 1.25rem",display:"flex",alignItems:"center",gap:"0.75rem",flexWrap:"wrap"}}>
            <div style={{display:"flex",gap:6}}>
              {boards.map(b=>(
                <button key={b.id} onClick={()=>setBoardId(b.id)} style={{display:"flex",alignItems:"center",gap:5,background:boardId===b.id?b.accent:"#F4F2EE",border:"none",borderRadius:20,padding:"5px 12px",cursor:"pointer"}}>
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
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:11,color:"#666",fontWeight:500}}>Ver:</span>
              <select value={mFilter||""} onChange={e=>setMF(e.target.value)} style={{background:"#fff",border:"1px solid #E8E4DE",borderRadius:8,padding:"5px 10px",fontSize:11,outline:"none",cursor:"pointer",color:"#1C1C1C"}}>
                <option value="">Todos</option>
                {bMems.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:4,marginLeft:12,opacity:0.3,pointerEvents:"none"}}>
              <button disabled title="Próximamente" style={{background:"#f5f5f5",border:"1px solid #E8E4DE",borderRadius:8,padding:"6px 10px",fontSize:16,cursor:"not-allowed",color:"#ccc"}}>↶</button>
              <button disabled title="Próximamente" style={{background:"#f5f5f5",border:"1px solid #E8E4DE",borderRadius:8,padding:"6px 10px",fontSize:16,cursor:"not-allowed",color:"#ccc"}}>↷</button>
            </div>
            {view==="weekly"?(
              <div style={{display:"flex",alignItems:"center",gap:6,marginLeft:"auto"}}>
                <button onClick={()=>setWS(getMonday(today))} style={{...iBtnS,fontSize:11,padding:"4px 10px",border:"1px solid #E8E4DE",borderRadius:8}}>Hoy</button>
                <button onClick={()=>setWS(d=>addDays(d,-7))} style={iBtnS}>‹</button>
                <span style={{fontSize:12,fontWeight:500,color:"#1C1C1C",minWidth:190,textAlign:"center"}}>{wLabel()}</span>
                <button onClick={()=>setWS(d=>addDays(d,7))} style={iBtnS}>›</button>
              </div>
            ):(
              <div style={{display:"flex",alignItems:"center",gap:6,marginLeft:"auto"}}>
                <button onClick={prevMo} style={iBtnS}>‹</button>
                <span style={{fontSize:12,fontWeight:500,color:"#1C1C1C",minWidth:150,textAlign:"center"}}>{MONTHS[cMonth]} {cYear}</span>
                <button onClick={nextMo} style={iBtnS}>›</button>
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
            <button onClick={()=>setSettOpen(true)} style={{...iBtnS,background:brand.accent+"18",borderRadius:8,border:`1px solid ${brand.accent}55`,color:brand.accent,fontSize:12,padding:"4px 10px",fontWeight:500}}>⚙ Personalizar</button>
          </div>

          {view==="weekly"&&(
            <div style={{flex:1,overflowY:"auto",padding:"1rem"}}>
              {bMems.filter(m=>!mFilter||m.id===mFilter).map(m=>{
                const mt=mTasks(m.id).filter(t=>fClient?t.client_id===fClient:true);
                const wc=mt.filter(t=>wDates.some(d=>taskOccursOn(t,toISO(d)))).length;
                return(
                  <div key={m.id} style={{marginBottom:"1.5rem"}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,padding:"0 4px"}}>
                      <div style={{width:22,height:22,borderRadius:"50%",background:m.color,display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{color:"#fff",fontSize:9,fontWeight:700}}>{(m.name||"?")[0]}</span></div>
                      <span style={{fontSize:13,fontWeight:600,color:"#1C1C1C"}}>{m.name}</span>
                      <span style={{fontSize:11,color:"#bbb"}}>{wc} tarea{wc!==1?"s":""} esta semana</span>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"52px repeat(5,1fr)",border:"1px solid #E8E4DE",borderRadius:12,overflow:"hidden",background:"#fff"}}>
                      <div style={{padding:"5px 6px",background:"#FAFAF9"}}/>
                      {wDates.map((d,i)=>{
                        const isT=toISO(d)===toISO(today);const hol=isHol(d);
                        return(
                          <div key={i} style={{padding:"5px 6px",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:hol?"#FFF0F5":isT?m.color+"15":"#FAFAF9",borderLeft:"1px solid #E8E4DE"}}>
                            <span style={{fontSize:9,color:hol?"#E06B9A":"#bbb"}}>{WEEK_DAYS[i]}</span>
                            <span style={{fontSize:13,color:hol?"#E06B9A":isT?m.color:"#1C1C1C",fontWeight:isT?700:400}}>{d.getDate()}</span>
                            {hol&&<span style={{fontSize:8}} title={hol}>🇨🇴</span>}
                          </div>
                        );
                      })}
                      {HOURS.map(hour=>(
                        <>
                          <div key={hour+"L"} style={{height:HOUR_H,padding:"5px 4px",fontSize:9,color:"#ccc",textAlign:"right",borderTop:"1px solid #F0EDE8",background:"#FAFAF9",display:"flex",alignItems:"flex-start",justifyContent:"flex-end"}}>{hour}</div>
                          {wDates.map((d,di)=>{
                            const iso=toISO(d);
                            const isLunchHour=m.lunch_start&&m.lunch_end&&hour>=m.lunch_start&&hour<m.lunch_end;
                            
                            // Filtrar tareas que deben mostrarse en esta celda
                            const tasksToRender=[];
                            
                            mt.forEach(t=>{
                              if(!taskOccursOn(t,iso))return;
                              
                              // Tareas tipo Rango con horarios individuales
                              if(t.end_date){
                                const sch=getMSch(t,m.id);
                                
                                console.log("TAREA RANGO:",t.title,"MIEMBRO:",m.name,"SCH:",sch);
                                
                                // Verificar si este miembro tiene horario individual configurado
                                if(sch && sch.date && sch.endDate && sch.endHour){
                                  const startDate=sch.date;
                                  const endDate=sch.endDate;
                                  const startHour=sch.hour||HOURS[0];
                                  const endHour=sch.endHour;
                                  
                                  // Verificar si esta fecha está en el rango de este miembro
                                  if(iso<startDate || iso>endDate)return;
                                  
                                  // Calcular horas para este día específico
                                  let dayStartHour=HOURS[0];
                                  let dayEndHour=HOURS[HOURS.length-1];
                                  
                                  // Primer día: empieza a la hora especificada
                                  if(iso===startDate){
                                    dayStartHour=startHour;
                                  }
                                  
                                  // Último día: termina a la hora especificada
                                  if(iso===endDate){
                                    dayEndHour=endHour;
                                  }
                                  
                                  const startIdx=HOURS.indexOf(dayStartHour);
                                  const endIdx=HOURS.indexOf(dayEndHour);
                                  
                                  if(startIdx===-1 || endIdx===-1)return;
                                  
                                  // Mostrar en la hora de inicio del día
                                  if(hour===dayStartHour){
                                    const duration=endIdx-startIdx+1;
                                    tasksToRender.push({task:t,duration:duration>0?duration:1});
                                  }
                                }else{
                                  // Sin horario individual para este miembro, mostrar todo el día
                                  if(hour===HOURS[0]){
                                    tasksToRender.push({task:t,duration:HOURS.length});
                                  }
                                }
                              }
                              // Tareas normales (no Rango)
                              else{
                                const sch=getMSch(t,m.id);
                                if((sch.hour||HOURS[0])===hour){
                                  tasksToRender.push({task:t,duration:t.duration||1});
                                }
                              }
                            });
                            
                            return(
                              <div key={di} onDragOver={e=>!isLunchHour&&e.preventDefault()} onDrop={e=>!isLunchHour&&onDrop(e,m.id,iso,hour)} onClick={()=>!isLunchHour&&tasksToRender.length===0&&openAdd(m.id,iso,hour)}
                                style={{height:HOUR_H,borderLeft:"1px solid #E8E4DE",borderTop:"1px solid #F0EDE8",position:"relative",cursor:isLunchHour?"not-allowed":(tasksToRender.length===0?"pointer":"default"),background:"transparent"}}>
                                {tasksToRender.map((item,idx)=>{
                                  // Calcular duración visual sumando horas de almuerzo si la tarea las atraviesa
                                  let visualDuration=item.duration;
                                  if(m.lunch_start&&m.lunch_end&&!item.task.end_date){
                                    const taskStartHour=hour;
                                    const taskStartIdx=HOURS.indexOf(taskStartHour);
                                    const taskEndIdx=taskStartIdx+item.duration-1;
                                    const lunchStartIdx=HOURS.indexOf(m.lunch_start);
                                    const lunchEndIdx=HOURS.indexOf(m.lunch_end);
                                    
                                    // Si la tarea atraviesa las horas de almuerzo, sumar esas horas a la duración visual
                                    if(taskStartIdx<lunchEndIdx&&taskEndIdx>=lunchStartIdx){
                                      const lunchHours=lunchEndIdx-lunchStartIdx;
                                      visualDuration=item.duration+lunchHours;
                                    }
                                  }
                                  
                                  return <TBlock key={item.task.id+"-"+idx} t={item.task} isAllDay={false} blockDuration={visualDuration} member={m}/>;
                                })}
                                {isLunchHour&&<div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,opacity:0.6,zIndex:100,background:"repeating-linear-gradient(45deg,#f9f9f9,#f9f9f9 10px,#f0f0f0 10px,#f0f0f0 20px)",pointerEvents:"none"}}>🍽</div>}
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

          {view==="monthly"&&(()=>{
            const dim=getDIM(cYear,cMonth),fd=getFD(cYear,cMonth);
            const cells=[];for(let i=0;i<fd;i++)cells.push(null);for(let d=1;d<=dim;d++)cells.push(d);while(cells.length%7!==0)cells.push(null);
            const weeks=[];for(let i=0;i<cells.length;i+=7)weeks.push(cells.slice(i,i+7));
            const allT=bTasks().filter(t=>fClient?t.client_id===fClient:true);
            return(
              <div style={{flex:1,overflowY:"auto",padding:"1rem"}}>
                <div style={{minWidth:700}}>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4,marginBottom:4}}>
                    {DAYS_S.map(d=><div key={d} style={{textAlign:"center",fontSize:9,letterSpacing:2,color:"#bbb",textTransform:"uppercase",padding:"4px 0"}}>{d}</div>)}
                  </div>
                  {weeks.map((week,wi)=>(
                    <div key={wi} style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4,marginBottom:4}}>
                      {week.map((day,di)=>{
                        const isT=day&&day===today.getDate()&&cMonth===today.getMonth()&&cYear===today.getFullYear();
                        const dateObj=day?new Date(cYear,cMonth,day):null;
                        const hol=dateObj?isHol(dateObj):null;
                        const iso=dateObj?toISO(dateObj):null;
                        const dt=iso?allT.filter(t=>taskOccursOn(t,iso)):[];
                        return(
                          <div key={di} onDragOver={e=>{if(day)e.preventDefault();}} onDrop={e=>{if(iso)onDrop(e,bMems[0]?.id,iso,"8:00");}}
                            style={{background:day?(hol?"#FFF5F5":"#fff"):"transparent",border:isT?`2px solid ${board.accent}`:day?"1px solid #E8E4DE":"none",borderRadius:10,minHeight:100,padding:5}}>
                            {day&&<>
                              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:3}}>
                                <span style={{fontSize:11,fontWeight:isT?700:400,color:isT?board.accent:hol?"#E06B9A":"#aaa"}}>{day}</span>
                                {hol&&<span style={{fontSize:9,color:"#E06B9A"}} title={hol}>🇨🇴</span>}
                              </div>
                              {dt.map(t=>{const cl=cOf(t.client_id);return(
                                <div key={t.id} draggable onDragStart={e=>onDragStart(e,t)} onDoubleClick={()=>openEdit(t)}
                                  style={{background:t.color||"#E8623A",borderRadius:4,padding:"2px 5px",fontSize:9,color:textOn(t.color||"#E8623A"),marginBottom:2,cursor:"pointer",overflow:"hidden"}}>
                                  <div style={{display:"flex",alignItems:"center",gap:3}}>
                                    <span style={{flex:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",fontWeight:600}}>{t.title}</span>
                                    {t.link&&<span>🔗</span>}
                                  </div>
                                  {cl&&<div style={{fontSize:8,opacity:0.85}}>{cl.name}</div>}
                                </div>
                              );})}
                            </>}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                  <div style={{display:"flex",gap:"0.75rem",marginTop:"1rem",justifyContent:"center",flexWrap:"wrap"}}>
                    {bMems.map(m=>(
                      <div key={m.id} style={{display:"flex",alignItems:"center",gap:5}}>
                        <div style={{width:7,height:7,borderRadius:"50%",background:m.color}}/>
                        <span style={{fontSize:10,color:"#888"}}>{m.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Settings inline */}
      {settOpen&&(
        <div onClick={()=>setSettOpen(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:400}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:20,width:540,maxHeight:"85vh",overflowY:"auto",boxShadow:"0 24px 64px rgba(0,0,0,0.18)",display:"flex",flexDirection:"column"}}>
            <div style={{padding:"1.5rem 1.5rem 1rem",borderBottom:"1px solid #F0EDE8",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <p style={{fontFamily:"'DM Serif Display',serif",fontSize:"1.2rem",color:"#1C1C1C",margin:0}}>Personalizar</p>
              <button onClick={()=>setSettOpen(false)} style={{background:"none",border:"1px solid #E8E4DE",borderRadius:10,width:34,height:34,cursor:"pointer",fontSize:16,color:"#999"}}>✕</button>
            </div>
            <div style={{display:"flex",gap:4,padding:"0.75rem 1.5rem",borderBottom:"1px solid #F0EDE8",flexWrap:"wrap"}}>
              {[["marca","Marca"],["colores","Colores"],["tableros","Tableros"],["clientes","Clientes"]].map(([t,l])=>(
                <button key={t} onClick={()=>setSettTab(t)} style={{background:settTab===t?brand.accent:"#F4F2EE",border:"none",borderRadius:20,padding:"5px 14px",fontSize:11,fontWeight:settTab===t?600:400,color:settTab===t?"#fff":"#888",cursor:"pointer"}}>{l}</button>
              ))}
            </div>
            <div style={{padding:"1.25rem 1.5rem",flex:1}}>
              {settTab==="marca"&&(
                <div style={{display:"flex",flexDirection:"column",gap:"1.5rem"}}>
                  <div>
                    <label style={{...lbS,marginBottom:8}}>Logo</label>
                    <div style={{display:"flex",alignItems:"center",gap:"1rem"}}>
                      <div style={{width:72,height:72,borderRadius:14,background:brand.navBg,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",border:"2px dashed #444",cursor:"pointer"}} onClick={()=>logoRef.current.click()}>
                        {brand.logo?<img src={brand.logo} alt="logo" style={{width:"100%",height:"100%",objectFit:"contain",padding:4}}/>:<span style={{fontSize:22,color:"#666"}}>+</span>}
                      </div>
                      <div>
                        <button onClick={()=>logoRef.current.click()} style={{background:brand.accent,border:"none",borderRadius:8,padding:"7px 14px",fontSize:12,color:textOn(brand.accent),cursor:"pointer",fontWeight:600,display:"block",marginBottom:6}}>{brand.logo?"Cambiar":"Subir logo"}</button>
                        {brand.logo&&<button onClick={()=>setBrand(p=>({...p,logo:null}))} style={{background:"none",border:"1px solid #FFD0C8",borderRadius:8,padding:"5px 12px",fontSize:11,color:"#E8623A",cursor:"pointer"}}>Quitar</button>}
                      </div>
                    </div>
                    <input ref={logoRef} type="file" accept="image/*" onChange={handleLogo} style={{display:"none"}}/>
                  </div>
                  <div>
                    <label style={{...lbS,marginBottom:8}}>Nombre</label>
                    <input defaultValue={brand.name} onBlur={e=>setBrand(p=>({...p,name:e.target.value}))} style={{...inS,borderBottomColor:brand.accent}}/>
                  </div>
                </div>
              )}
              {settTab==="colores"&&(
                <div style={{display:"flex",flexDirection:"column",gap:"1.25rem"}}>
                  <div>
                    <label style={{...lbS,marginBottom:8}}>Paletas</label>
                    <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                      {PRESETS.map(pr=>(
                        <button key={pr.name} onClick={()=>setBrand(p=>({...p,navBg:pr.navBg,sideBg:pr.sideBg,topBg:pr.topBg,accent:pr.accent}))}
                          style={{background:pr.navBg,border:`2px solid ${brand.navBg===pr.navBg&&brand.accent===pr.accent?pr.accent:"transparent"}`,borderRadius:10,padding:"8px 10px",cursor:"pointer",display:"flex",flexDirection:"column",gap:4,alignItems:"center"}}>
                          <div style={{display:"flex",gap:3}}>{[pr.navBg,pr.sideBg,pr.accent].map((c,i)=><div key={i} style={{width:14,height:14,borderRadius:4,background:c}}/>)}</div>
                          <span style={{fontSize:10,color:textOn(pr.navBg),fontWeight:500}}>{pr.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  {[["accent","Acento"],["navBg","Nav"],["sideBg","Sidebar"],["topBg","Topbar"]].map(([k,l])=>(
                    <div key={k} style={{display:"flex",alignItems:"center",gap:"1rem"}}>
                      <div style={{position:"relative"}}>
                        <div style={{width:44,height:44,borderRadius:10,background:brand[k],border:"1px solid #E8E4DE",cursor:"pointer"}} onClick={()=>document.getElementById(`pk-${k}`).click()}/>
                        <input id={`pk-${k}`} type="color" value={brand[k]} onChange={e=>setBrand(p=>({...p,[k]:e.target.value}))} style={{position:"absolute",opacity:0,width:44,height:44,top:0,left:0}}/>
                      </div>
                      <span style={{fontSize:13,color:"#1C1C1C"}}>{l}</span>
                      <span style={{marginLeft:"auto",fontSize:11,color:"#bbb",fontFamily:"monospace"}}>{brand[k]}</span>
                    </div>
                  ))}
                </div>
              )}
              {settTab==="tableros"&&(
                <div style={{display:"flex",flexDirection:"column",gap:"1.25rem"}}>
                  {boards.map(b=>(
                    <div key={b.id} style={{border:"1px solid #F0EDE8",borderRadius:12,padding:"1rem",background:"#FAFAF9"}}>
                      <div style={{display:"flex",alignItems:"center",gap:"0.75rem",marginBottom:"0.75rem"}}>
                        <span style={{fontSize:16,color:b.accent}}>{b.icon}</span>
                        <input key={b.id+b.label} defaultValue={b.label} onBlur={e=>updBoard(b.id,{label:e.target.value})} style={{flex:1,border:"none",borderBottom:`2px solid ${b.accent}`,fontSize:14,fontWeight:600,outline:"none",background:"transparent",color:"#1C1C1C",padding:"2px 0"}}/>
                        <div style={{position:"relative"}}>
                          <div style={{width:28,height:28,borderRadius:8,background:b.accent,cursor:"pointer"}} onClick={()=>document.getElementById(`pk-b-${b.id}`).click()}/>
                          <input id={`pk-b-${b.id}`} type="color" value={b.accent} onChange={e=>updBoard(b.id,{accent:e.target.value})} style={{position:"absolute",opacity:0,width:28,height:28,top:0,left:0}}/>
                        </div>
                      </div>
                      {members.filter(m=>m.board_id===b.id).map(m=>(
                        <div key={m.id} style={{border:"1px solid #F0EDE8",borderRadius:10,padding:10,marginBottom:8,background:"#FAFAF9"}}>
                          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                            <div style={{width:22,height:22,borderRadius:"50%",background:m.color,display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{color:"#fff",fontSize:9,fontWeight:700}}>{(m.name||"?")[0]}</span></div>
                            <input key={m.id+m.name} defaultValue={m.name||""} onBlur={e=>updMember(m.id,{name:e.target.value})} style={{flex:1,border:"none",borderBottom:"1px solid #E8E4DE",fontSize:12,outline:"none",background:"transparent",color:"#555",padding:"2px 0"}}/>
                            <div style={{position:"relative"}}>
                              <div style={{width:20,height:20,borderRadius:6,background:m.color,cursor:"pointer"}} onClick={()=>document.getElementById(`pk-m-${m.id}`).click()}/>
                              <input id={`pk-m-${m.id}`} type="color" value={m.color} onChange={e=>updMember(m.id,{color:e.target.value})} style={{position:"absolute",opacity:0,width:20,height:20,top:0,left:0}}/>
                            </div>
                            <button onClick={()=>delMember(m.id)} style={{background:"none",border:"none",color:"#ccc",fontSize:14,cursor:"pointer"}}>✕</button>
                          </div>
                          <div style={{display:"flex",gap:8,alignItems:"center"}}>
                            <span style={{fontSize:10,color:"#999",minWidth:70}}>🍽 Almuerzo:</span>
                            <select value={m.lunch_start||""} onChange={e=>updMember(m.id,{lunch_start:e.target.value})} style={{flex:1,border:"1px solid #E8E4DE",borderRadius:6,padding:"3px 6px",fontSize:11,outline:"none",cursor:"pointer"}}>
                              <option value="">Sin bloqueo</option>
                              {HOURS.map(h=><option key={h} value={h}>{h}</option>)}
                            </select>
                            <span style={{fontSize:10,color:"#999"}}>a</span>
                            <select value={m.lunch_end||""} onChange={e=>updMember(m.id,{lunch_end:e.target.value})} style={{flex:1,border:"1px solid #E8E4DE",borderRadius:6,padding:"3px 6px",fontSize:11,outline:"none",cursor:"pointer"}}>
                              <option value="">-</option>
                              {HOURS.map(h=><option key={h} value={h}>{h}</option>)}
                            </select>
                          </div>
                        </div>
                      ))}
                      <button onClick={()=>addMember(b.id)} style={{display:"flex",alignItems:"center",gap:6,background:"none",border:"1px dashed #ddd",borderRadius:8,padding:"5px 10px",fontSize:11,color:"#aaa",cursor:"pointer",width:"100%",marginTop:4}}>
                        <span style={{fontSize:16}}>+</span> Agregar persona
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {settTab==="clientes"&&(
                <div style={{display:"flex",flexDirection:"column",gap:"0.75rem"}}>
                  <div style={{display:"flex",gap:6,marginBottom:8}}>
                    <input value={newClient} onChange={e=>setNewClient(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addClient()} placeholder="Nombre del cliente..." style={{flex:1,border:"none",borderBottom:`2px solid ${brand.accent}`,padding:"6px 0",fontSize:13,outline:"none",background:"transparent",color:"#1C1C1C"}}/>
                    <button onClick={addClient} style={{background:brand.accent,border:"none",borderRadius:8,color:textOn(brand.accent),fontSize:16,cursor:"pointer",width:32,fontWeight:700}}>+</button>
                  </div>
                  {clients.map(c=>(
                    <div key={c.id} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",background:"#FAFAF9",border:"1px solid #F0EDE8",borderRadius:10}}>
                      <div style={{width:10,height:10,borderRadius:"50%",background:c.color}}/>
                      <input key={c.id+c.name} defaultValue={c.name} onBlur={e=>updClient(c.id,{name:e.target.value})} style={{flex:1,border:"none",fontSize:13,outline:"none",background:"transparent",color:"#1C1C1C"}}/>
                      <div style={{position:"relative"}}>
                        <div style={{width:20,height:20,borderRadius:6,background:c.color,cursor:"pointer"}} onClick={()=>document.getElementById(`pk-c-${c.id}`).click()}/>
                        <input id={`pk-c-${c.id}`} type="color" value={c.color} onChange={e=>updClient(c.id,{color:e.target.value})} style={{position:"absolute",opacity:0,width:20,height:20,top:0,left:0}}/>
                      </div>
                      <button onClick={()=>delClient(c.id)} style={{background:"none",border:"none",color:"#ccc",fontSize:14,cursor:"pointer"}}>✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{padding:"1rem 1.5rem",borderTop:"1px solid #F0EDE8",display:"flex",justifyContent:"flex-end"}}>
              <button onClick={async()=>{await saveBrand(brand);setSettOpen(false);}} style={{background:brand.accent,border:"none",borderRadius:10,padding:"9px 22px",fontSize:13,color:textOn(brand.accent),cursor:"pointer",fontWeight:600}}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      {modal&&(
        <TaskModal
          modal={modal}
          form={form}
          setForm={setForm}
          setModal={setModal}
          members={members}
          boards={boards}
          clients={clients}
          onSave={saveModal}
          onDelete={async()=>{await delTask(modal.task.id);setModal(null);}}
          onDuplicate={()=>dupTask(modal.task)}
        />
      )}
    </div>
  );
}
