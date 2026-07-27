import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle, ArrowLeft, BarChart3, BellRing, Check, CheckCircle2, ChevronRight,
  CircleDollarSign, ClipboardCheck, Copy, Database, FileText, FolderKanban, LayoutDashboard,
  Mail, Menu, Plus, ReceiptText, Search, Settings, ShieldCheck, Trash2, UserPlus, Users, X
} from 'lucide-react'
import { api } from './api'
import { useAuth, useReadOnly } from './auth-context'

type ProjectStatus = 'Needs Attention' | 'Waiting on Vendor' | 'Waiting on Internal Team' | 'Financial Review' | 'Ready to Close' | 'Closed'
type ItemStatus = 'Not Started' | 'Follow-Up Needed' | 'Waiting on Vendor' | 'Waiting on Internal Team' | 'Under Review' | 'Correction Required' | 'Resolved'
type InvoiceStatus = 'Requested' | 'Received' | 'Reviewing' | 'Correction Needed' | 'Approved' | 'Submitted for Payment' | 'Paid'

type Project = {
  id: string; name: string; number: string; teamId: string; department: string; location: string; manager: string; vendor: string;
  budget: number; committed: number; target: string; status: ProjectStatus; nextAction: string; owner: string; due: string; updated: string
}
type Item = { id: string; projectId: string; title: string; type: string; responsible: string; owner: string; amount: number; due: string; priority: 'High'|'Medium'|'Low'; status: ItemStatus; notes: string; followUp: string }
type Invoice = { id: string; projectId: string; vendor: string; number: string; amount: number; po: string; due: string; status: InvoiceStatus; disputed: number; hold: string }
type Activity = { id: string; projectId: string; action: string; detail: string; date: string }
type Store = { projects: Project[]; items: Item[]; invoices: Invoice[]; activities: Activity[] }
type View = 'dashboard'|'projects'|'items'|'invoices'|'followups'|'reports'|'teams'|'settings'

type TeamMember = { teamId: string; userId: string; teamRole: string; name: string; email: string; role: string; accessRole: string }
type TeamInvite = { id: string; email: string; accessRole: string; teamRole?: string; token: string; expiresAt: string }
type Team = { id: string; name: string; description: string; createdAt: string; manageable: boolean; members: TeamMember[]; invites: TeamInvite[] }
type Person = { id: string; name: string; email: string; role: string; accessRole: string }
type TeamsPayload = { teams: Team[]; people: Person[]; workspaceInvites: TeamInvite[]; canCreateTeams: boolean }

const today = new Date()
const date = (offset: number) => { const d = new Date(today); d.setDate(d.getDate()+offset); return d.toISOString().slice(0,10) }
const money = (n:number) => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n)
const prettyDate = (s:string) => s ? new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric'}).format(new Date(`${s}T12:00:00`)) : '—'
const uid = () => crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)
const overdue = (s:string) => Boolean(s && s < date(0))

const nav: {id:View;label:string;icon:typeof LayoutDashboard}[] = [
  {id:'dashboard',label:'Dashboard',icon:LayoutDashboard},{id:'projects',label:'Projects',icon:FolderKanban},{id:'items',label:'Outstanding Items',icon:ClipboardCheck},{id:'invoices',label:'Invoices',icon:ReceiptText},{id:'followups',label:'Follow-Ups',icon:BellRing},{id:'reports',label:'Reports',icon:BarChart3},{id:'teams',label:'Teams',icon:Users},{id:'settings',label:'Settings',icon:Settings}
]
const emptyStore: Store = {projects:[],items:[],invoices:[],activities:[]}
const emptyTeams: TeamsPayload = {teams:[],people:[],workspaceInvites:[],canCreateTeams:false}
const readStore = ():Store=>{try{const value=JSON.parse(localStorage.getItem('closeflow-v1')||'null');return value&&Array.isArray(value.projects)?value:emptyStore}catch{return emptyStore}}
const initials = (name:string)=>name.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]?.toUpperCase()).join('')||'CF'
const accessLabel = (r:string)=>r==='owner'?'Owner':r==='manager'?'Manager':r==='editor'?'Coordinator':'Viewer'
const accessClass = (r:string)=>r==='owner'?'ready-to-close':r==='manager'?'financial-review':r==='viewer'?'waiting-on-internal-team':'under-review'
const projectStatuses: ProjectStatus[] = ['Needs Attention','Waiting on Vendor','Waiting on Internal Team','Financial Review','Ready to Close','Closed']
const itemStatuses: ItemStatus[] = ['Not Started','Follow-Up Needed','Waiting on Vendor','Waiting on Internal Team','Under Review','Correction Required','Resolved']
const invoiceStatuses: InvoiceStatus[] = ['Requested','Received','Reviewing','Correction Needed','Approved','Submitted for Payment','Paid']
const cls = (s:string) => `status ${s.toLowerCase().replaceAll(' ','-').replaceAll('/','-')}`

function App(){
  const auth = useAuth()
  const [data,setData] = useState<Store>(readStore)
  const [teams,setTeams] = useState<TeamsPayload>(emptyTeams)
  const [view,setView] = useState<View>('dashboard')
  const [selected,setSelected] = useState<string|null>(null)
  const [query,setQuery] = useState('')
  const [filter,setFilter] = useState('All')
  const [modal,setModal] = useState<'project'|'item'|'invoice'|null>(null)
  const [mobile,setMobile] = useState(false)
  const readOnly = useReadOnly()
  useEffect(()=>localStorage.setItem('closeflow-v1',JSON.stringify(data)),[data])

  const loadTeams = useCallback(async()=>{try{setTeams(await api('/api/teams') as TeamsPayload)}catch{/* teams stay empty until the request succeeds */}},[])
  // loadTeams() only calls setState after an awaited fetch, so this is not a synchronous cascade.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(()=>{void loadTeams()},[loadTeams])

  const openItems = data.items.filter(i=>i.status!=='Resolved')
  const overdueItems = openItems.filter(i=>overdue(i.due))
  const project = data.projects.find(p=>p.id===selected)
  const projectName = (id:string)=>data.projects.find(p=>p.id===id)?.name||'Unknown project'
  const teamName = (id:string)=>teams.teams.find(t=>t.id===id)?.name||''
  const filteredProjects = data.projects.filter(p=>(filter==='All'||p.status===filter)&&`${p.name} ${p.number} ${p.vendor}`.toLowerCase().includes(query.toLowerCase()))

  const updateProject=(id:string,patch:Partial<Project>)=>setData(d=>({...d,projects:d.projects.map(p=>p.id===id?{...p,...patch,updated:new Date().toISOString()}:p)}))
  const updateItem=(id:string,patch:Partial<Item>)=>setData(d=>({...d,items:d.items.map(i=>i.id===id?{...i,...patch}:i)}))
  const updateInvoice=(id:string,patch:Partial<Invoice>)=>setData(d=>({...d,invoices:d.invoices.map(i=>i.id===id?{...i,...patch}:i)}))
  const addActivity=(projectId:string,action:string,detail:string)=>setData(d=>({...d,activities:[{id:uid(),projectId,action,detail,date:new Date().toISOString()},...d.activities]}))
  const go=(v:View)=>{setView(v);setSelected(null);setMobile(false)}

  return <div className="app-shell">
    <aside className={`sidebar ${mobile?'open':''}`}>
      <div className="brand"><div className="brand-mark">C</div><div><strong>CloseFlow</strong><span>Project closeout</span></div><button className="icon mobile-close" onClick={()=>setMobile(false)}><X/></button></div>
      <nav>{nav.map(n=>{const Icon=n.icon;return <button key={n.id} className={view===n.id&&!selected?'active':''} onClick={()=>go(n.id)}><Icon/><span>{n.label}</span>{n.id==='followups'&&overdueItems.length>0?<b>{overdueItems.length}</b>:null}</button>})}</nav>
      <div className="sidebar-foot"><div className="avatar">{initials(auth?.name||'')}</div><div><strong>{auth?.name||'CloseFlow'}</strong><span>{auth?.role||'Signed in'}</span></div></div>
    </aside>
    {mobile&&<button className="scrim" onClick={()=>setMobile(false)} aria-label="Close menu"/>}
    <main className="main">
      <header className="topbar"><button className="icon menu" onClick={()=>setMobile(true)}><Menu/></button><div className="global-search"><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search projects, vendors, or numbers"/></div><button className="icon"><BellRing/></button>{!readOnly&&<button className="primary" onClick={()=>setModal('project')}><Plus/>New project</button>}</header>
      <div className="content">
        {project ? <ProjectDetail project={project} data={data} teamName={teamName(project.teamId)} readOnly={readOnly} updateProject={updateProject} updateItem={updateItem} updateInvoice={updateInvoice} addActivity={addActivity} back={()=>setSelected(null)} addItem={()=>setModal('item')} addInvoice={()=>setModal('invoice')}/> :
        view==='dashboard'?<Dashboard data={data} openProject={setSelected} setView={go}/>:
        view==='projects'?<Projects projects={filteredProjects} filter={filter} setFilter={setFilter} openProject={setSelected} add={()=>setModal('project')} readOnly={readOnly}/>:
        view==='items'?<Items items={data.items} projectName={projectName} update={updateItem} add={()=>setModal('item')} readOnly={readOnly}/>:
        view==='invoices'?<Invoices invoices={data.invoices} projectName={projectName} update={updateInvoice} add={()=>setModal('invoice')} readOnly={readOnly}/>:
        view==='followups'?<FollowUps items={openItems} projects={data.projects} update={updateItem} log={addActivity} readOnly={readOnly}/>:
        view==='reports'?<Reports data={data}/>:
        view==='teams'?<TeamsView payload={teams} apply={setTeams} projects={data.projects} openProject={setSelected}/>:
        <SettingsView/>}
      </div>
    </main>
    {modal&&<Modal title={modal==='project'?'Add project':modal==='item'?'Add outstanding item':'Add invoice'} close={()=>setModal(null)}><CreateForm kind={modal} projects={data.projects} teams={teams.teams} selected={selected} defaultOwner={auth?.name||''} save={(payload)=>{setData(d=>modal==='project'?{...d,projects:[payload as Project,...d.projects]}:modal==='item'?{...d,items:[payload as Item,...d.items]}:{...d,invoices:[payload as Invoice,...d.invoices]});setModal(null)}}/></Modal>}
  </div>
}

function PageHead({eyebrow,title,copy,action}:{eyebrow:string;title:string;copy:string;action?:React.ReactNode}){return <div className="page-head"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{copy}</p></div>{action}</div>}
function Stat({label,value,detail,icon:Icon}:{label:string;value:string;detail:string;icon:typeof AlertTriangle}){return <div className="stat"><div className="stat-icon"><Icon/></div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>}

function Dashboard({data,openProject,setView}:{data:Store;openProject:(id:string)=>void;setView:(v:View)=>void}){
  const open=data.projects.filter(p=>p.status!=='Closed'); const openItems=data.items.filter(i=>i.status!=='Resolved'); const unpaid=data.invoices.filter(i=>i.status!=='Paid');
  const attention=[...open].sort((a,b)=>a.due.localeCompare(b.due)).slice(0,5)
  return <><PageHead eyebrow="Portfolio overview" title="Project closeouts" copy="Keep every outstanding invoice, document, approval, and follow-up moving toward closure." action={<button className="secondary" onClick={()=>setView('followups')}>View follow-ups<ChevronRight/></button>}/>
    <section className="stats-grid"><Stat label="Projects in closeout" value={`${open.length}`} detail={`${data.projects.filter(p=>p.status==='Ready to Close').length} ready to close`} icon={FolderKanban}/><Stat label="Outstanding value" value={money(unpaid.reduce((a,b)=>a+b.amount,0))} detail={`${unpaid.length} invoices not paid`} icon={CircleDollarSign}/><Stat label="Overdue items" value={`${openItems.filter(i=>overdue(i.due)).length}`} detail="Require immediate follow-up" icon={AlertTriangle}/><Stat label="Resolved this workspace" value={`${data.items.filter(i=>i.status==='Resolved').length}`} detail="Closeout items completed" icon={CheckCircle2}/></section>
    <section className="two-col"><div className="panel"><div className="panel-head"><div><span className="eyebrow">Priority queue</span><h2>What needs attention</h2></div><button className="text-btn" onClick={()=>setView('projects')}>All projects<ChevronRight/></button></div><div className="project-list">{attention.map(p=><button className="project-row" key={p.id} onClick={()=>openProject(p.id)}><div className="project-code">{p.number}</div><div className="grow"><strong>{p.name}</strong><span>{p.nextAction}</span></div><div className="row-meta"><span className={cls(p.status)}>{p.status}</span><small className={overdue(p.due)?'danger-text':''}>{prettyDate(p.due)}</small></div><ChevronRight/></button>)}{!attention.length&&<Empty text="No projects yet. Add your first closeout project to begin."/>}</div></div>
    <div className="panel"><div className="panel-head"><div><span className="eyebrow">Workflow health</span><h2>Closeout stages</h2></div></div><div className="stage-list">{projectStatuses.filter(s=>s!=='Closed').map(s=>{const count=data.projects.filter(p=>p.status===s).length;return <div key={s}><div><strong>{s}</strong><span>{count} project{count===1?'':'s'}</span></div><div className="bar"><i style={{width:`${data.projects.length?Math.max(6,count/data.projects.length*100):0}%`}}/></div></div>})}</div></div></section>
  </>
}

function Projects({projects,filter,setFilter,openProject,add,readOnly}:{projects:Project[];filter:string;setFilter:(s:string)=>void;openProject:(id:string)=>void;add:()=>void;readOnly:boolean}){return <><PageHead eyebrow="Closeout portfolio" title="Projects" copy="Review every active project, its current blocker, and the next action required." action={readOnly?undefined:<button className="primary" onClick={add}><Plus/>Add project</button>}/><div className="filter-row"><button className={filter==='All'?'active':''} onClick={()=>setFilter('All')}>All</button>{projectStatuses.map(s=><button key={s} className={filter===s?'active':''} onClick={()=>setFilter(s)}>{s}</button>)}</div><div className="table-card"><table><thead><tr><th>Project</th><th>Status</th><th>Vendor</th><th>Outstanding</th><th>Next action</th><th>Due</th></tr></thead><tbody>{projects.map(p=><tr key={p.id} onClick={()=>openProject(p.id)}><td><strong>{p.name}</strong><span>{p.number} · {p.department}</span></td><td><span className={cls(p.status)}>{p.status}</span></td><td>{p.vendor}</td><td>{money(p.budget-p.committed)}</td><td>{p.nextAction}</td><td className={overdue(p.due)?'danger-text':''}>{prettyDate(p.due)}</td></tr>)}</tbody></table>{!projects.length&&<Empty text="No projects match this view."/>}</div></>}

function Items({items,projectName,update,add,readOnly}:{items:Item[];projectName:(id:string)=>string;update:(id:string,p:Partial<Item>)=>void;add:()=>void;readOnly:boolean}){return <><PageHead eyebrow="Closeout requirements" title="Outstanding items" copy="Track invoices, credits, waivers, approvals, warranties, and every other item blocking closure." action={readOnly?undefined:<button className="primary" onClick={add}><Plus/>Add item</button>}/><div className="table-card"><table><thead><tr><th>Item</th><th>Project</th><th>Responsible party</th><th>Amount</th><th>Due</th><th>Status</th></tr></thead><tbody>{items.map(i=><tr key={i.id}><td><strong>{i.title}</strong><span>{i.type} · {i.priority} priority</span></td><td>{projectName(i.projectId)}</td><td>{i.responsible}</td><td>{i.amount?money(i.amount):'—'}</td><td className={overdue(i.due)&&i.status!=='Resolved'?'danger-text':''}>{prettyDate(i.due)}</td><td>{readOnly?<span className={cls(i.status)}>{i.status}</span>:<select value={i.status} onChange={e=>update(i.id,{status:e.target.value as ItemStatus})}>{itemStatuses.map(s=><option key={s}>{s}</option>)}</select>}</td></tr>)}</tbody></table></div></>}

function Invoices({invoices,projectName,update,add,readOnly}:{invoices:Invoice[];projectName:(id:string)=>string;update:(id:string,p:Partial<Invoice>)=>void;add:()=>void;readOnly:boolean}){return <><PageHead eyebrow="Financial closeout" title="Invoices" copy="Follow each final invoice from request through approval and payment." action={readOnly?undefined:<button className="primary" onClick={add}><Plus/>Add invoice</button>}/><div className="table-card"><table><thead><tr><th>Invoice</th><th>Project</th><th>Vendor</th><th>PO</th><th>Amount</th><th>Due</th><th>Status</th></tr></thead><tbody>{invoices.map(i=><tr key={i.id}><td><strong>{i.number}</strong>{i.hold&&<span>{i.hold}</span>}</td><td>{projectName(i.projectId)}</td><td>{i.vendor}</td><td>{i.po}</td><td>{money(i.amount)}</td><td>{prettyDate(i.due)}</td><td>{readOnly?<span className={cls(i.status)}>{i.status}</span>:<select value={i.status} onChange={e=>update(i.id,{status:e.target.value as InvoiceStatus})}>{invoiceStatuses.map(s=><option key={s}>{s}</option>)}</select>}</td></tr>)}</tbody></table></div></>}

function FollowUps({items,projects,update,log,readOnly}:{items:Item[];projects:Project[];update:(id:string,p:Partial<Item>)=>void;log:(pid:string,a:string,d:string)=>void;readOnly:boolean}){const sorted=[...items].sort((a,b)=>a.due.localeCompare(b.due));return <><PageHead eyebrow="Daily action list" title="Follow-ups" copy="Focus on the small number of actions that will move old projects closer to closure."/><div className="follow-grid">{sorted.map(i=>{const p=projects.find(p=>p.id===i.projectId);return <div className={`follow-card ${overdue(i.due)?'late':''}`} key={i.id}><div className="follow-top"><span className={cls(i.status)}>{i.status}</span><span className="priority">{i.priority}</span></div><h3>{i.title}</h3><p>{p?.name} · {p?.number}</p><dl><div><dt>Waiting on</dt><dd>{i.responsible}</dd></div><div><dt>Owner</dt><dd>{i.owner}</dd></div><div><dt>Due</dt><dd className={overdue(i.due)?'danger-text':''}>{prettyDate(i.due)}</dd></div></dl>{!readOnly&&<button className="secondary full" onClick={()=>{update(i.id,{followUp:date(0)});log(i.projectId,'Follow-up logged',`Followed up on ${i.title}.`)}}>Log follow-up</button>}</div>})}</div></>}

function Reports({data}:{data:Store}){const byStatus=projectStatuses.map(status=>({status,count:data.projects.filter(p=>p.status===status).length}));const vendors=Object.entries(data.items.filter(i=>i.status!=='Resolved').reduce<Record<string,number>>((a,i)=>({...a,[i.responsible]:(a[i.responsible]||0)+1}),{})).sort((a,b)=>b[1]-a[1]);return <><PageHead eyebrow="Operational reporting" title="Reports" copy="See where closeout work is aging, which parties are holding items, and how much remains unresolved."/><section className="report-grid"><div className="panel"><h2>Projects by stage</h2><div className="report-bars">{byStatus.map(r=><div key={r.status}><span>{r.status}</span><div className="bar"><i style={{width:`${data.projects.length?r.count/data.projects.length*100:0}%`}}/></div><strong>{r.count}</strong></div>)}</div></div><div className="panel"><h2>Outstanding by party</h2><div className="rank-list">{vendors.map(([name,count],n)=><div key={name}><b>{n+1}</b><span>{name}</span><strong>{count} item{count===1?'':'s'}</strong></div>)}{!vendors.length&&<Empty text="Nothing outstanding."/>}</div></div><div className="panel span-2"><h2>Financial summary</h2><div className="financial-grid"><div><span>Total project budget</span><strong>{money(data.projects.reduce((a,b)=>a+b.budget,0))}</strong></div><div><span>Current commitments</span><strong>{money(data.projects.reduce((a,b)=>a+b.committed,0))}</strong></div><div><span>Unpaid invoices</span><strong>{money(data.invoices.filter(i=>i.status!=='Paid').reduce((a,b)=>a+b.amount,0))}</strong></div><div><span>Disputed amount</span><strong>{money(data.invoices.reduce((a,b)=>a+b.disputed,0))}</strong></div></div></div></section></>}

function ProjectDetail({project,data,teamName,readOnly,updateProject,updateItem,updateInvoice,addActivity,back,addItem,addInvoice}:{project:Project;data:Store;teamName:string;readOnly:boolean;updateProject:(id:string,p:Partial<Project>)=>void;updateItem:(id:string,p:Partial<Item>)=>void;updateInvoice:(id:string,p:Partial<Invoice>)=>void;addActivity:(pid:string,a:string,d:string)=>void;back:()=>void;addItem:()=>void;addInvoice:()=>void}){
  const items=data.items.filter(i=>i.projectId===project.id), invoices=data.invoices.filter(i=>i.projectId===project.id), activities=data.activities.filter(a=>a.projectId===project.id).sort((a,b)=>b.date.localeCompare(a.date)); const resolved=items.filter(i=>i.status==='Resolved').length; const progress=items.length?Math.round(resolved/items.length*100):100
  return <><button className="back" onClick={back}><ArrowLeft/>Back to projects</button><div className="project-hero"><div><span className="eyebrow">Project {project.number}</span><h1>{project.name}</h1><p>{project.location} · {project.department}</p></div><div className="hero-actions">{readOnly?<span className={cls(project.status)}>{project.status}</span>:<><select value={project.status} onChange={e=>updateProject(project.id,{status:e.target.value as ProjectStatus})}>{projectStatuses.map(s=><option key={s}>{s}</option>)}</select><button className="secondary" onClick={()=>{addActivity(project.id,'Follow-up logged',project.nextAction);updateProject(project.id,{updated:new Date().toISOString()})}}>Log follow-up</button></>}</div></div>
  <div className="progress-panel"><div><strong>{progress}% complete</strong><span>{resolved} of {items.length} requirements resolved</span></div><div className="progress"><i style={{width:`${progress}%`}}/></div></div>
  <section className="detail-grid"><div className="panel span-2"><div className="panel-head"><div><span className="eyebrow">Primary action</span><h2>What happens next</h2></div></div><div className="next-action"><div className="next-num">01</div><div><strong>{project.nextAction}</strong><span>Owner: {project.owner} · Due {prettyDate(project.due)}</span></div>{!readOnly&&<button className="primary" onClick={()=>{addActivity(project.id,'Action completed',project.nextAction);updateProject(project.id,{status:'Ready to Close',nextAction:'Complete final closeout verification',due:date(1)})}}>Complete action</button>}</div></div>
  <div className="panel"><h2>Project information</h2><dl className="info-list"><div><dt>Team</dt><dd>{teamName||'Unassigned'}</dd></div><div><dt>Project manager</dt><dd>{project.manager}</dd></div><div><dt>Primary vendor</dt><dd>{project.vendor}</dd></div><div><dt>Target closeout</dt><dd>{prettyDate(project.target)}</dd></div><div><dt>Original budget</dt><dd>{money(project.budget)}</dd></div><div><dt>Committed</dt><dd>{money(project.committed)}</dd></div><div><dt>Uncommitted</dt><dd>{money(project.budget-project.committed)}</dd></div></dl></div></section>
  <section className="panel section-gap"><div className="panel-head"><div><span className="eyebrow">Requirements</span><h2>Outstanding items</h2></div>{!readOnly&&<button className="secondary" onClick={addItem}><Plus/>Add item</button>}</div><div className="table-wrap"><table><thead><tr><th>Item</th><th>Responsible</th><th>Amount</th><th>Due</th><th>Status</th></tr></thead><tbody>{items.map(i=><tr key={i.id}><td><strong>{i.title}</strong><span>{i.type}</span></td><td>{i.responsible}</td><td>{i.amount?money(i.amount):'—'}</td><td className={overdue(i.due)&&i.status!=='Resolved'?'danger-text':''}>{prettyDate(i.due)}</td><td>{readOnly?<span className={cls(i.status)}>{i.status}</span>:<select value={i.status} onChange={e=>updateItem(i.id,{status:e.target.value as ItemStatus})}>{itemStatuses.map(s=><option key={s}>{s}</option>)}</select>}</td></tr>)}</tbody></table></div></section>
  <section className="detail-grid section-gap"><div className="panel span-2"><div className="panel-head"><div><span className="eyebrow">Financial</span><h2>Invoices</h2></div>{!readOnly&&<button className="secondary" onClick={addInvoice}><Plus/>Add invoice</button>}</div>{invoices.map(i=><div className="invoice-row" key={i.id}><div className="invoice-icon"><FileText/></div><div className="grow"><strong>{i.number}</strong><span>{i.vendor} · {i.po}</span></div><strong>{money(i.amount)}</strong>{readOnly?<span className={cls(i.status)}>{i.status}</span>:<select value={i.status} onChange={e=>updateInvoice(i.id,{status:e.target.value as InvoiceStatus})}>{invoiceStatuses.map(s=><option key={s}>{s}</option>)}</select>}</div>)}{!invoices.length&&<Empty text="No invoices have been added."/>}</div><div className="panel"><h2>Activity</h2><div className="activity-list">{activities.map(a=><div key={a.id}><i/><div><strong>{a.action}</strong><p>{a.detail}</p><span>{new Date(a.date).toLocaleDateString()}</span></div></div>)}{!activities.length&&<Empty text="No activity recorded."/>}</div></div></section></>
}

function Modal({title,close,children}:{title:string;close:()=>void;children:React.ReactNode}){return <div className="modal-wrap"><button className="modal-scrim" onClick={close}/><div className="modal"><div className="modal-head"><h2>{title}</h2><button className="icon" onClick={close}><X/></button></div>{children}</div></div>}
function CreateForm({kind,projects,teams,selected,defaultOwner,save}:{kind:'project'|'item'|'invoice';projects:Project[];teams:Team[];selected:string|null;defaultOwner:string;save:(v:Project|Item|Invoice)=>void}){const [form,setForm]=useState<Record<string,string>>({projectId:selected||projects[0]?.id||'',due:date(7),status:kind==='project'?'Needs Attention':kind==='item'?'Not Started':'Requested'});const set=(k:string,v:string)=>setForm(f=>({...f,[k]:v}));const submit=(e:React.FormEvent)=>{e.preventDefault();if(kind==='project')save({id:uid(),name:form.name||'Untitled project',number:form.number||'TBD',teamId:form.teamId||'',department:form.department||'',location:form.location||'',manager:form.manager||defaultOwner,vendor:form.vendor||'',budget:Number(form.budget||0),committed:Number(form.committed||0),target:form.due,status:form.status as ProjectStatus,nextAction:form.nextAction||'Review project closeout requirements',owner:form.owner||defaultOwner,due:form.due,updated:new Date().toISOString()});else if(kind==='item')save({id:uid(),projectId:form.projectId,title:form.title||'Untitled item',type:form.type||'Other',responsible:form.responsible||'',owner:form.owner||defaultOwner,amount:Number(form.amount||0),due:form.due,priority:(form.priority||'Medium') as Item['priority'],status:form.status as ItemStatus,notes:form.notes||'',followUp:''});else save({id:uid(),projectId:form.projectId,vendor:form.vendor||'',number:form.number||'Pending',amount:Number(form.amount||0),po:form.po||'',due:form.due,status:form.status as InvoiceStatus,disputed:0,hold:''})};return <form className="form" onSubmit={submit}>{kind!=='project'&&<label>Project<select value={form.projectId} onChange={e=>set('projectId',e.target.value)}>{projects.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select></label>}{kind==='project'?<><label>Project name<input required onChange={e=>set('name',e.target.value)}/></label><div className="form-row"><label>Project number<input onChange={e=>set('number',e.target.value)}/></label><label>Department<input onChange={e=>set('department',e.target.value)}/></label></div><div className="form-row"><label>Team<select value={form.teamId||''} onChange={e=>set('teamId',e.target.value)}><option value="">Unassigned</option>{teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label><label>Location<input onChange={e=>set('location',e.target.value)}/></label></div><div className="form-row"><label>Project manager<input defaultValue={defaultOwner} onChange={e=>set('manager',e.target.value)}/></label><label>Vendor<input onChange={e=>set('vendor',e.target.value)}/></label></div><div className="form-row"><label>Budget<input type="number" onChange={e=>set('budget',e.target.value)}/></label><label>Committed<input type="number" onChange={e=>set('committed',e.target.value)}/></label></div><label>Next action<input onChange={e=>set('nextAction',e.target.value)}/></label></>:kind==='item'?<><label>Item title<input required onChange={e=>set('title',e.target.value)}/></label><div className="form-row"><label>Type<select onChange={e=>set('type',e.target.value)}><option>Final Invoice</option><option>Retainage</option><option>Change Order</option><option>Purchase Order</option><option>Credit / Refund</option><option>Lien Waiver</option><option>Permit Closure</option><option>Warranty Document</option><option>Final Approval</option><option>Other</option></select></label><label>Priority<select onChange={e=>set('priority',e.target.value)}><option>Medium</option><option>High</option><option>Low</option></select></label></div><label>Responsible party<input onChange={e=>set('responsible',e.target.value)}/></label><label>Amount<input type="number" onChange={e=>set('amount',e.target.value)}/></label><label>Notes<textarea rows={3} onChange={e=>set('notes',e.target.value)}/></label></>:<><div className="form-row"><label>Vendor<input required onChange={e=>set('vendor',e.target.value)}/></label><label>Invoice number<input onChange={e=>set('number',e.target.value)}/></label></div><div className="form-row"><label>PO number<input onChange={e=>set('po',e.target.value)}/></label><label>Amount<input type="number" onChange={e=>set('amount',e.target.value)}/></label></div></>}<div className="form-row"><label>Due date<input type="date" value={form.due} onChange={e=>set('due',e.target.value)}/></label><label>Status<select value={form.status} onChange={e=>set('status',e.target.value)}>{(kind==='project'?projectStatuses:kind==='item'?itemStatuses:invoiceStatuses).map(s=><option key={s}>{s}</option>)}</select></label></div><button className="primary full" type="submit">Create {kind}</button></form>}
function SettingsView(){const auth=useAuth();return <><PageHead eyebrow="Workspace" title="Settings" copy="Review how this CloseFlow workspace is configured and where its records are stored."/>
  <div className="settings-card"><div><h2>Workspace</h2><p>{auth?.workspaceName||'CloseFlow Workspace'} — you are signed in as {auth?.name} ({accessLabel(auth?.accessRole||'viewer')}).</p></div><span>{accessLabel(auth?.accessRole||'viewer')}</span></div>
  <div className="settings-card"><div><h2>Neon Postgres</h2><p>Projects, closeout items, invoices, budgets, teams, and activity are stored in the connected Neon Postgres database.</p></div><span><Database style={{width:12,verticalAlign:'-2px',marginRight:5}}/>Connected</span></div>
  <div className="settings-card"><div><h2>People and teams</h2><p>Workspace access is managed from the Teams page. Invite people by email and they join with the access level chosen for them.</p></div><span>Teams</span></div></>}

function TeamsView({payload,apply,projects,openProject}:{payload:TeamsPayload;apply:(p:TeamsPayload)=>void;projects:Project[];openProject:(id:string)=>void}){
  const [error,setError] = useState('')
  const [busy,setBusy] = useState(false)
  const [creating,setCreating] = useState(false)
  const [draft,setDraft] = useState({name:'',description:''})
  const run = async(body:Record<string,unknown>)=>{
    setError('');setBusy(true)
    try{apply(await api('/api/teams',{method:'POST',body:JSON.stringify(body)}) as TeamsPayload);return true}
    catch(failure){setError((failure as Error).message);return false}
    finally{setBusy(false)}
  }
  const createTeam = async(event:React.FormEvent)=>{
    event.preventDefault()
    if(await run({action:'createTeam',...draft})){setDraft({name:'',description:''});setCreating(false)}
  }
  const unassigned = projects.filter(p=>!p.teamId||!payload.teams.some(t=>t.id===p.teamId))
  return <><PageHead eyebrow="Workspace access" title="Teams" copy="Group the people who close projects together, invite new members by email, and give each team the projects it owns." action={payload.canCreateTeams?<button className="primary" onClick={()=>setCreating(value=>!value)}><Plus/>New team</button>:undefined}/>
    {error&&<div className="auth-error" role="alert"><AlertTriangle/>{error}</div>}
    {creating&&<div className="panel" style={{marginBottom:14}}><form className="form" onSubmit={createTeam}><div className="form-row"><label>Team name<input required value={draft.name} onChange={e=>setDraft(d=>({...d,name:e.target.value}))} placeholder="e.g. Facilities Closeout"/></label><label>Description<input value={draft.description} onChange={e=>setDraft(d=>({...d,description:e.target.value}))} placeholder="What this team is responsible for"/></label></div><button className="primary full" type="submit" disabled={busy}>{busy?'Creating…':'Create team'}</button></form></div>}
    <div className="team-grid">{payload.teams.map(team=><TeamCard key={team.id} team={team} people={payload.people} projects={projects.filter(p=>p.teamId===team.id)} canDelete={payload.canCreateTeams} busy={busy} run={run} openProject={openProject}/>)}</div>
    {!payload.teams.length&&!creating&&<div className="panel"><Empty text={payload.canCreateTeams?'No teams yet. Create the first team to start inviting people.':'You are not part of a team yet. Ask an owner or manager to invite you.'}/></div>}
    <section className="panel section-gap"><div className="panel-head"><div><span className="eyebrow"><Users style={{width:13,verticalAlign:'-2px',marginRight:5}}/>Everyone</span><h2>Workspace people</h2></div></div>
      <div className="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Title</th><th>Teams</th><th>Access</th></tr></thead><tbody>{payload.people.map(person=>{const memberOf=payload.teams.filter(t=>t.members.some(m=>m.userId===person.id));return <tr key={person.id}><td><strong>{person.name}</strong></td><td>{person.email}</td><td>{person.role}</td><td>{memberOf.length?memberOf.map(t=>t.name).join(', '):<span style={{color:'#999'}}>No team</span>}</td><td><span className={`status ${accessClass(person.accessRole)}`}>{person.accessRole==='owner'?<ShieldCheck style={{width:11,verticalAlign:'-1px',marginRight:4}}/>:null}{accessLabel(person.accessRole)}</span></td></tr>})}</tbody></table></div>
      {payload.canCreateTeams&&<div style={{marginTop:16}}><InviteForm label="Invite to the workspace without a team" teamId="" busy={busy} run={run}/></div>}
      {payload.workspaceInvites.map(invite=><InviteRow key={invite.id} invite={invite} busy={busy} run={run}/>)}
    </section>
    {unassigned.length>0&&<section className="panel section-gap"><div className="panel-head"><div><span className="eyebrow">Unassigned</span><h2>Projects without a team</h2></div></div><div className="project-list">{unassigned.map(p=><button className="project-row" key={p.id} onClick={()=>openProject(p.id)}><div className="project-code">{p.number}</div><div className="grow"><strong>{p.name}</strong><span>{p.nextAction}</span></div><ChevronRight/></button>)}</div></section>}
  </>
}

function TeamCard({team,people,projects,canDelete,busy,run,openProject}:{team:Team;people:Person[];projects:Project[];canDelete:boolean;busy:boolean;run:(body:Record<string,unknown>)=>Promise<boolean>;openProject:(id:string)=>void}){
  const [editing,setEditing] = useState(false)
  const [draft,setDraft] = useState({name:team.name,description:team.description})
  const [addUser,setAddUser] = useState('')
  const available = people.filter(person=>!team.members.some(member=>member.userId===person.id))
  const save = async(event:React.FormEvent)=>{event.preventDefault();if(await run({action:'updateTeam',teamId:team.id,...draft}))setEditing(false)}
  return <div className="panel team-card">
    <div className="panel-head"><div><span className="eyebrow">{team.members.length} member{team.members.length===1?'':'s'} · {projects.length} project{projects.length===1?'':'s'}</span><h2>{team.name}</h2>{team.description&&<p className="team-note">{team.description}</p>}</div>
      {team.manageable&&<div className="team-head-actions"><button className="text-btn" onClick={()=>{setDraft({name:team.name,description:team.description});setEditing(value=>!value)}}>Edit</button>{canDelete&&<button className="icon danger" title="Delete team" onClick={()=>{if(confirm(`Delete ${team.name}? Its members keep their workspace access.`))void run({action:'deleteTeam',teamId:team.id})}}><Trash2/></button>}</div>}</div>
    {editing&&<form className="form team-edit" onSubmit={save}><div className="form-row"><label>Team name<input required value={draft.name} onChange={e=>setDraft(d=>({...d,name:e.target.value}))}/></label><label>Description<input value={draft.description} onChange={e=>setDraft(d=>({...d,description:e.target.value}))}/></label></div><button className="secondary" type="submit" disabled={busy}>Save team</button></form>}
    <div className="member-list">{team.members.map(member=><div className="member-row" key={member.userId}>
      <div className="avatar small">{initials(member.name)}</div>
      <div className="grow"><strong>{member.name}</strong><span>{member.email} · {accessLabel(member.accessRole)}</span></div>
      {team.manageable
        ? <><select value={member.teamRole} disabled={busy} onChange={e=>void run({action:'setTeamRole',teamId:team.id,userId:member.userId,teamRole:e.target.value})}><option value="member">Member</option><option value="lead">Team lead</option></select>
          <button className="icon danger" title="Remove from team" onClick={()=>void run({action:'removeMember',teamId:team.id,userId:member.userId})}><X/></button></>
        : <span className="status under-review">{member.teamRole==='lead'?'Team lead':'Member'}</span>}
    </div>)}{!team.members.length&&<Empty text="No members yet."/>}</div>
    {team.invites.map(invite=><InviteRow key={invite.id} invite={invite} busy={busy} run={run}/>)}
    {team.manageable&&<>
      {available.length>0&&<div className="member-add"><select value={addUser} onChange={e=>setAddUser(e.target.value)}><option value="">Add someone already in the workspace…</option>{available.map(person=><option key={person.id} value={person.id}>{person.name}</option>)}</select><button className="secondary" disabled={!addUser||busy} onClick={()=>{void run({action:'addMember',teamId:team.id,userId:addUser,teamRole:'member'});setAddUser('')}}><UserPlus/>Add</button></div>}
      <InviteForm label={`Invite someone new to ${team.name}`} teamId={team.id} busy={busy} run={run}/>
    </>}
    {projects.length>0&&<div className="team-projects">{projects.slice(0,5).map(p=><button key={p.id} onClick={()=>openProject(p.id)}><span className={cls(p.status)}>{p.status}</span><strong>{p.name}</strong><ChevronRight/></button>)}</div>}
  </div>
}

function InviteForm({label,teamId,busy,run}:{label:string;teamId:string;busy:boolean;run:(body:Record<string,unknown>)=>Promise<boolean>}){
  const [form,setForm] = useState({email:'',accessRole:'editor',teamRole:'member'})
  const submit = async(event:React.FormEvent)=>{
    event.preventDefault()
    if(await run({action:'invite',teamId,...form})) setForm({email:'',accessRole:'editor',teamRole:'member'})
  }
  return <form className="invite-form" onSubmit={submit}>
    <label><Mail/><input required type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} placeholder={label}/></label>
    <select value={form.accessRole} onChange={e=>setForm(f=>({...f,accessRole:e.target.value}))}><option value="editor">Coordinator — can edit</option><option value="viewer">Viewer — read only</option><option value="manager">Manager — manages teams</option></select>
    {teamId&&<select value={form.teamRole} onChange={e=>setForm(f=>({...f,teamRole:e.target.value}))}><option value="member">Member</option><option value="lead">Team lead</option></select>}
    <button className="primary" type="submit" disabled={busy}><UserPlus/>Invite</button>
  </form>
}

function InviteRow({invite,busy,run}:{invite:TeamInvite;busy:boolean;run:(body:Record<string,unknown>)=>Promise<boolean>}){
  const [copied,setCopied] = useState(false)
  const link = `${window.location.origin}/?invite=${invite.token}`
  const copy = async()=>{
    try{await navigator.clipboard.writeText(link);setCopied(true);window.setTimeout(()=>setCopied(false),2000)}catch{prompt('Copy this invitation link',link)}
  }
  return <div className="invite-row">
    <Mail/>
    <div className="grow"><strong>{invite.email}</strong><span>Invited as {accessLabel(invite.accessRole)}{invite.teamRole==='lead'?' · team lead':''} · expires {prettyDate(invite.expiresAt.slice(0,10))}</span></div>
    <button className="secondary" onClick={copy}>{copied?<Check/>:<Copy/>}{copied?'Copied':'Copy link'}</button>
    <button className="icon danger" title="Revoke invitation" disabled={busy} onClick={()=>void run({action:'revokeInvite',inviteId:invite.id})}><X/></button>
  </div>
}

function Empty({text}:{text:string}){return <div className="empty"><ClipboardCheck/><p>{text}</p></div>}

export default App
