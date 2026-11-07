window.addEventListener('error',e=>{try{const b=document.getElementById('errbar')||document.body.appendChild(Object.assign(document.createElement('div'),{id:'errbar',style:'position:fixed;top:0;left:0;right:0;z-index:999;background:#B91C1C;color:#fff;font:12px/1.4 monospace;padding:6px 10px;white-space:pre-wrap'}));b.textContent+='⚠ '+(e.message||e)+' @'+(e.lineno||'')+'\n'}catch(_){}});
window.addEventListener('unhandledrejection',e=>{try{const r=e.reason||{};const b=document.getElementById('errbar')||document.body.appendChild(Object.assign(document.createElement('div'),{id:'errbar',style:'position:fixed;top:0;left:0;right:0;z-index:999;background:#B45309;color:#fff;font:12px/1.4 monospace;padding:6px 10px;white-space:pre-wrap'}));b.textContent+='⚠ promise: '+(r.message||r.code||JSON.stringify(r))+'\n'}catch(_){}});
const guard=(name,fn)=>{try{fn()}catch(e){console.error(name,e);window.dispatchEvent(new ErrorEvent('error',{message:name+': '+e.message}))}};
/* ---------- helpers ---------- */
const $=s=>document.querySelector(s);
const REGIONS=['BALI','YOGYAKARTA','JATENG','JATIM','JELUPANG'];
const TZ='Asia/Jakarta';
const fmtRp=n=>n==null||isNaN(n)?'-':'Rp '+Math.round(n).toLocaleString('id-ID');
const parseRp=s=>{s=String(s||'').replace(/[^\d,.-]/g,'');if(!s)return null;if(/,\d{1,2}$/.test(s))s=s.replace(/\./g,'').replace(',','.');else s=s.replace(/[.,]/g,'');const n=parseFloat(s);return isNaN(n)?null:n};
const jkt=iso=>{if(!iso)return '';const d=new Date(iso);return d.toLocaleString('id-ID',{timeZone:TZ,day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'}).replace(',','')};
const jktTime=iso=>iso?new Date(iso).toLocaleTimeString('id-ID',{timeZone:TZ,hour:'2-digit',minute:'2-digit'}):'';
const jktDate=iso=>{const d=iso?new Date(iso):new Date();return d.toLocaleDateString('sv-SE',{timeZone:TZ})};
const fmtTgl=s=>s?s.split('-').reverse().join('/'):'-';
const hours=(a,b)=>(a&&b)?(new Date(b)-new Date(a))/36e5:null;
const fmtH=h=>{if(h==null)return '-';if(h<1)return Math.round(h*60)+' mnt';if(h<24)return h.toFixed(1).replace('.',',')+' jam';const d=Math.floor(h/24),r=Math.round(h%24);return d+' hr '+r+' jam'};
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const toast=m=>{const t=$('#toast');t.textContent=m;t.style.display='block';clearTimeout(t._t);t._t=setTimeout(()=>t.style.display='none',2600)};
const docId=po=>po.replace(/[^A-Za-z0-9_\-.:@+~]/g,'_');
const nowIso=()=>new Date().toISOString();
let ls={};try{ls=JSON.parse(localStorage.getItem('po_ui')||'{}')}catch(e){}
const saveLs=()=>{try{localStorage.setItem('po_ui',JSON.stringify(ls))}catch(e){}};

/* ---------- state ---------- */
/* ================= Supabase data layer ================= */
const CFG=window.APP_CONFIG||{};
if(!CFG.SUPABASE_URL||!CFG.SUPABASE_ANON_KEY){document.addEventListener('DOMContentLoaded',()=>{const m=document.getElementById('loginMsg');if(m)m.innerHTML='<b style="color:var(--bad)">config.js belum diisi.</b> Salin config.example.js → config.js dan isi SUPABASE_URL &amp; SUPABASE_ANON_KEY.'})}
const sb=(window.supabase&&CFG.SUPABASE_URL)?window.supabase.createClient(CFG.SUPABASE_URL,CFG.SUPABASE_ANON_KEY):null;
const BUCKET=CFG.STORAGE_BUCKET||'dokumen';
let db=null,userApi=null,assets=null,sample=null,downloads=true;
const PO_COLS=['id','region','supplier','po_no','tgl','tgl_gudang','po_at','po_by','gr_no','gr_at','gr_by','inv_no','inv_at','inv_by','nominal','inv_dist','gr_return','keterangan','legacy','created','updated','po_nos','gr_nos','po_date','gr_date','inv_date','barang_terima','inv_terima_at','tunggu_inv','tunggu_inv_at','tunggu_inv_selesai','cek'];
function toRow(id,d){const row={id};PO_COLS.forEach(c=>{if(c==='id')return;let v=d[c];if(v===undefined)v=null;if(v==='' && ['po_at','gr_at','inv_at','inv_terima_at','tunggu_inv_at','tunggu_inv_selesai','created','updated','po_date','gr_date','inv_date','barang_terima','tgl','tgl_gudang','nominal'].includes(c))v=null;row[c]=v});row.check_status=d.cek?d.cek.status:null;return row}
function fromRow(r){const d={...r};['po_at','gr_at','inv_at','inv_terima_at','tunggu_inv_at','tunggu_inv_selesai','created','updated'].forEach(c=>{if(d[c])d[c]=new Date(d[c]).toISOString()});['gr_no','inv_no','gr_return','inv_dist','keterangan','supplier','tgl_gudang','barang_terima','po_no'].forEach(c=>{if(d[c]==null)d[c]=''});if(d.nominal!=null)d.nominal=Number(d.nominal);['po_nos','gr_nos'].forEach(c=>{if(!Array.isArray(d[c]))d[c]=d[c]?[].concat(d[c]):[]});return d}
async function sbSave(id,d){const {error}=await sb.from('po').upsert(toRow(id,d));if(error)throw error}
async function sbDelete(id){const {error}=await sb.from('po').delete().eq('id',id);if(error)throw error}
async function loadPos(){const {data,error}=await sb.from('po').select('*').order('created',{ascending:false}).limit(5000);if(error){toast('Gagal memuat PO: '+error.message);return}POS=data.map(fromRow);render()}
async function loadSettings(){const {data}=await sb.from('settings').select('*').eq('id',1).maybeSingle();if(data){SET={target_gr_h:data.target_gr_h,target_inv_h:data.target_inv_h,toleransi:Number(data.toleransi)}}$('#sGr').value=SET.target_gr_h;$('#sInv').value=SET.target_inv_h;$('#sTol').value=SET.toleransi;render()}
async function loadProfiles(){const {data}=await sb.from('profiles').select('id,display_name,email,role');(data||[]).forEach(p=>{names[p.id]=p.display_name||(p.email||'').split('@')[0]||'Petugas';if(p.id===uid)isAdmin=p.role==='admin'})}
const urlCache={};
function burl(id){if(!id)return '';if(id in urlCache)return urlCache[id];urlCache[id]='';sb.storage.from(BUCKET).createSignedUrl(id,3600).then(r=>{urlCache[id]=(r.data&&r.data.signedUrl)||'';render();if($('#mbg').classList.contains('open')&&editing)refreshModalThumbs()}).catch(()=>{});return ''}
function refreshModalThumbs(){document.querySelectorAll('[data-burl]').forEach(el=>{const u=burl(el.dataset.burl);if(u){if(el.tagName==='IMG')el.src=u;else el.href=u}})}
async function uploadDoc(blob,kind,ext){const path=`${jktDate()}/${(editing&&editing.id)||'new'}_${kind}_${Date.now()}.${ext}`;const {error}=await sb.storage.from(BUCKET).upload(path,blob,{contentType:blob.type||(ext==='pdf'?'application/pdf':'image/jpeg'),upsert:false});if(error)throw error;return path}
/* ---- Gemini ---- */
const blobToB64=b=>new Promise((res,rej)=>{const fr=new FileReader();fr.onload=()=>res(String(fr.result).split(',')[1]);fr.onerror=rej;fr.readAsDataURL(b)});
async function geminiJson(prompt,blobs){
  const images=await Promise.all(blobs.map(async b=>({mime:b.type||'image/jpeg',data:await blobToB64(b)})));
  if((CFG.GEMINI_MODE||'edge')==='edge'){
    const {data:{session}}=await sb.auth.getSession();
    const res=await fetch(`${CFG.SUPABASE_URL}/functions/v1/gemini-total`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+(session?session.access_token:CFG.SUPABASE_ANON_KEY),'apikey':CFG.SUPABASE_ANON_KEY},body:JSON.stringify({prompt,images,model:CFG.GEMINI_MODEL})});
    if(!res.ok)throw new Error('edge function '+res.status+': '+(await res.text()).slice(0,200));return await res.json();
  }
  if(!CFG.GEMINI_API_KEY)throw new Error('GEMINI_API_KEY belum diisi di config.js');
  const model=CFG.GEMINI_MODEL||'gemini-2.5-flash';
  const body={contents:[{role:'user',parts:[{text:prompt},...images.map(i=>({inline_data:{mime_type:i.mime,data:i.data}}))]}],generationConfig:{response_mime_type:'application/json',temperature:0}};
  const res=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(CFG.GEMINI_API_KEY)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!res.ok)throw new Error('Gemini '+res.status+': '+(await res.text()).slice(0,200));
  const j=await res.json();const txt=(((j.candidates||[])[0]||{}).content||{}).parts?.map(p=>p.text).join('')||'';
  try{return JSON.parse(txt)}catch(e){const m=txt.match(/\{[\s\S]*\}/);return m?JSON.parse(m[0]):null}
}
sample={json:geminiJson};
let uid=null,canWrite=true,isAdmin=false;
let POS=[],SET={target_gr_h:24,target_inv_h:48,toleransi:0};
const names={};
async function resolveNames(ids){const need=[...new Set(ids.filter(i=>i&&!(i in names)))];if(!need.length||!sb)return;await loadProfiles();need.forEach(i=>{if(!(i in names))names[i]=''})}
const nm=id=>id?(names[id]||'Petugas'):'-';

/* ---------- nav ---------- */
guard('nav',()=>{document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>show(b.dataset.v));});
function show(v){document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b.dataset.v===v));document.querySelectorAll('.view').forEach(s=>s.classList.toggle('active',s.id==='v-'+v));ls.view=v;saveLs();render()}
guard('regions',()=>{['#dRegion','#oRegion','#pRegion','#mRegion'].forEach(s=>{const el=$(s);REGIONS.forEach(r=>{const o=document.createElement('option');o.value=r;o.textContent=r;el.appendChild(o)})});});
guard('filters',()=>{['#dPeriode','#dRegion','#oRegion','#oSort','#pRegion','#pStatus','#pDari','#pSampai'].forEach(s=>$(s).addEventListener('change',render));$('#pCari').addEventListener('input',render);});

/* ---------- boot: auth + data ---------- */
let rtChannel=null;
async function afterLogin(session){
  uid=session.user.id;$('#loginBg').classList.remove('open');$('#btnLogout').style.display='';
  await loadProfiles();if(!names[uid]){await sb.from('profiles').upsert({id:uid,email:session.user.email});await loadProfiles()}
  $('#who').textContent='👤 '+(names[uid]||session.user.email)+(isAdmin?' · Admin':'');$('#myName').value=names[uid]||'';$('#myRole').textContent=isAdmin?'Peran: admin (bisa ubah setting & hapus PO)':'Peran: staf';
  await loadSettings();await loadPos();
  if(rtChannel)sb.removeChannel(rtChannel);
  rtChannel=sb.channel('po-live').on('postgres_changes',{event:'*',schema:'public',table:'po'},()=>{clearTimeout(window._rt);window._rt=setTimeout(loadPos,400)}).on('postgres_changes',{event:'*',schema:'public',table:'settings'},loadSettings).subscribe();
}
function showLogin(msg){$('#loginBg').classList.add('open');$('#btnLogout').style.display='none';$('#who').textContent='Belum login';if(msg)$('#loginMsg').textContent=msg}
(async()=>{
  if(!sb){showLogin();return}
  $('#loginForm').addEventListener('submit',async e=>{e.preventDefault();$('#btnLogin').disabled=true;$('#loginMsg').textContent='Memeriksa…';const {error}=await sb.auth.signInWithPassword({email:$('#lEmail').value.trim(),password:$('#lPass').value});$('#btnLogin').disabled=false;$('#loginMsg').textContent=error?('Gagal: '+error.message):''});
  if(CFG.ALLOW_SIGNUP){const b=document.createElement('button');b.type='button';b.className='btn';b.textContent='Daftar akun baru';b.onclick=async()=>{const {error}=await sb.auth.signUp({email:$('#lEmail').value.trim(),password:$('#lPass').value});$('#loginMsg').textContent=error?('Gagal: '+error.message):'Akun dibuat — cek email untuk konfirmasi (jika diaktifkan), lalu masuk.'};$('#loginForm').appendChild(b)}
  $('#btnLogout').onclick=async()=>{await sb.auth.signOut();location.reload()};
  sb.auth.onAuthStateChange((ev,session)=>{if(session&&ev!=='TOKEN_REFRESHED'&&ev!=='USER_UPDATED'){afterLogin(session).catch(e=>toast('Gagal memuat: '+e.message))}else if(!session)showLogin()});
  const {data:{session}}=await sb.auth.getSession();if(session)afterLogin(session).catch(e=>toast('Gagal memuat: '+e.message));else showLogin();
  $('#btnSaveName').onclick=async()=>{const n=$('#myName').value.trim();if(!n)return;const {error}=await sb.from('profiles').update({display_name:n}).eq('id',uid);if(error)return toast('Gagal: '+error.message);names[uid]=n;$('#who').textContent='👤 '+n+(isAdmin?' · Admin':'');toast('Nama tersimpan');render()};
  $('#mTunggu').addEventListener('change',()=>{if($('#mTunggu').checked&&!$('#mTerima').value)$('#mTerima').value=jktDate()});

})();

/* ---------- derived ---------- */
function status(p){if(!p.po_no)return 'nogr';if(!p.gr_no)return 'nogr';if(!p.inv_no)return 'noinv';return 'done'}
const isTunggu=p=>!!p.tunggu_inv&&!p.inv_no;
const invStart=p=>(p.inv_terima_at&&p.gr_at&&p.inv_terima_at>p.gr_at)?p.inv_terima_at:p.gr_at;
function ageFrom(p){ // ISO start of current outstanding stage, fallback date
  const st=status(p);if(st==='nogr')return p.po_at||(p.tgl?p.tgl+'T00:00:00+07:00':null);if(st==='noinv')return p.gr_at||p.po_at||(p.tgl?p.tgl+'T00:00:00+07:00':null);return null}
function inPeriode(p){const per=$('#dPeriode').value,t=p.tgl||jktDate(p.created);const today=jktDate();if(per==='bulan')return t.slice(0,7)===today.slice(0,7);if(per==='all')return true;const d=new Date(today);d.setDate(d.getDate()-parseInt(per));return t>=d.toISOString().slice(0,10)}
const avg=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null;
const pct=(n,d)=>d?Math.round(n/d*100)+'%':'-';
const cekOf=p=>p.cek||null;
const thumb=id=>{const u=burl(id);return id?`<a href="${u||'#'}" target="_blank"><img class="thumb" src="${u}" style="width:30px;height:30px"></a>`:''};
const cekDone=c=>c&&(c.status==='MATCH'||c.status==='SELISIH');
const cekBadge=p=>{const c=cekOf(p);if(!c)return '<span class="b mut">belum dicek</span>';
  const lbl=c.status==='MATCH'?'<span class="b ok">MATCH</span>':c.status==='SELISIH'?'<span class="b bad">SELISIH '+fmtRp(Math.abs(c.selisih))+'</span>':'<span class="b warn">menunggu '+((c.missing&&c.missing.length)?c.missing.join(', '):'dokumen')+'</span>';
  const tot=TOT_SLOTS.map(S=>SLOT_SHORT[S.k]+' '+(c['total_'+S.k]!=null?fmtRp(c['total_'+S.k]):'—')).join(' · ');
  const th=SLOTS.map(S=>{const list=(c[S.k+'_docs']&&c[S.k+'_docs'].length)?c[S.k+'_docs']:(c[S.k+'_asset']?[{asset:c[S.k+'_asset'],pdf:c[S.k+'_pdf']}]:[]);
    return list.map(x=>{const u=burl(x.asset);return `<a href="${u||'#'}" target="_blank" title="${S.label}${x.no?' '+x.no:''}">${x.pdf?'<span class="thumb" style="width:30px;height:30px;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:var(--red)">PDF</span>':'<img class="thumb" src="'+u+'" style="width:30px;height:30px">'}</a>`}).join('')}).join('');
  return lbl+(c.detail?'<div class="sub"'+(c.status==='SELISIH'?' style="color:var(--bad)"':'')+'>'+esc(c.detail)+'</div>':'')+'<div class="sub" style="margin-top:3px">'+tot+'</div><div class="row" style="gap:4px;margin-top:3px">'+th+'</div>'};

/* ---------- render ---------- */
function render(){renderCounts();const v=ls.view||'dash';if(v==='dash')renderDash();else if(v==='out')renderOut();else if(v==='po')renderPo();}
function renderCounts(){const o=POS.filter(p=>status(p)!=='done').length;$('#pillOut').textContent=o;$('#pillOut').title=POS.filter(isTunggu).length+' di antaranya menunggu invoice distributor';$('#pillCek').textContent=POS.filter(p=>p.cek&&p.cek.status==='SELISIH').length;}

function kpiRows(list){
  const gr=list.filter(p=>p.po_at&&p.gr_at).map(p=>hours(p.po_at,p.gr_at));
  const inv=list.filter(p=>invStart(p)&&p.inv_at).map(p=>hours(invStart(p),p.inv_at));
  const tot=list.filter(p=>p.po_at&&p.inv_at).map(p=>hours(p.po_at,p.inv_at));
  return {n:list.length,nogr:list.filter(p=>status(p)==='nogr'&&!isTunggu(p)).length,noinv:list.filter(p=>status(p)==='noinv').length,tunggu:list.filter(isTunggu).length,
    gr:avg(gr),grN:gr.length,grOk:gr.filter(h=>h<=SET.target_gr_h).length,inv:avg(inv),invN:inv.length,invOk:inv.filter(h=>h<=SET.target_inv_h).length,tot:avg(tot)}
}
function renderDash(){
  const reg=$('#dRegion').value;const list=POS.filter(p=>inPeriode(p)&&(!reg||p.region===reg));
  const k=kpiRows(list);const ceks=list.filter(p=>cekDone(p.cek)).map(p=>({...p.cek,region:p.region}));
  const mt=ceks.filter(c=>c.status==='MATCH').length,sl=ceks.length-mt;
  $('#tiles').innerHTML=[
    ['Total PO',k.n,'','',''],['Belum GR',k.nogr,'outstanding','red'],['Belum Invoice',k.noinv-k.tunggu,'outstanding tim','warn'],['Menunggu inv. distributor',k.tunggu,'barang sudah di gudang','blue'],
    ['Rata² PO → GR',fmtH(k.gr),k.grN+' PO terukur · target ≤'+SET.target_gr_h+' jam',k.gr!=null&&k.gr<=SET.target_gr_h?'ok':''],
    ['Tepat target GR',pct(k.grOk,k.grN),k.grOk+' dari '+k.grN,'ok'],
    ['Rata² GR → Invoice',fmtH(k.inv),k.invN+' PO terukur · target ≤'+SET.target_inv_h+' jam',k.inv!=null&&k.inv<=SET.target_inv_h?'ok':''],
    ['Tepat target Invoice',pct(k.invOk,k.invN),k.invOk+' dari '+k.invN,'ok'],
    ['Rata² PO → Invoice',fmtH(k.tot),'end-to-end',''],
    ['Cek 3 dokumen MATCH',mt,ceks.length+' lengkap dicek','ok'],['Cek 3 dokumen SELISIH',sl,'perlu tindak lanjut',sl?'red':'']
  ].map(t=>`<div class="tile ${t[3]||''}"><div class="l">${t[0]}</div><div class="v">${t[1]}</div><div class="s">${t[2]||''}</div></div>`).join('');
  const hdr='<tr><th>Region</th><th>PO</th><th>Belum GR</th><th>Belum Inv</th><th>Tunggu inv. dist.</th><th>Rata² PO→GR</th><th>Tepat target</th><th>Rata² GR→Inv</th><th>Tepat target</th><th>PO→Inv</th></tr>';
  $('#tRegion').innerHTML=hdr+REGIONS.filter(r=>!reg||r===reg).map(r=>{const x=kpiRows(list.filter(p=>p.region===r));return `<tr><td><b>${r}</b></td><td>${x.n}</td><td>${x.nogr?'<span class="b red">'+x.nogr+'</span>':0}</td><td>${(x.noinv-x.tunggu)?'<span class="b warn">'+(x.noinv-x.tunggu)+'</span>':0}</td><td>${x.tunggu?'<span class="b blue">'+x.tunggu+'</span>':0}</td><td>${fmtH(x.gr)}</td><td>${pct(x.grOk,x.grN)}</td><td>${fmtH(x.inv)}</td><td>${pct(x.invOk,x.invN)}</td><td>${fmtH(x.tot)}</td></tr>`}).join('');
  const users={};list.forEach(p=>{if(p.po_by){(users[p.po_by]??={po:0,gr:[],inv:[]}).po++}if(p.gr_by){const u=users[p.gr_by]??={po:0,gr:[],inv:[]};if(p.po_at&&p.gr_at)u.gr.push(hours(p.po_at,p.gr_at));else u.grX=(u.grX||0)+1}if(p.inv_by){const u=users[p.inv_by]??={po:0,gr:[],inv:[]};if(invStart(p)&&p.inv_at)u.inv.push(hours(invStart(p),p.inv_at));else u.invX=(u.invX||0)+1}});
  const ur=Object.entries(users);
  $('#tUser').innerHTML='<tr><th>Petugas</th><th>Input PO</th><th>Isi GR</th><th>Rata² PO→GR</th><th>Tepat target</th><th>Isi Invoice</th><th>Rata² GR→Inv</th><th>Tepat target</th></tr>'+(ur.length?ur.map(([id,u])=>`<tr><td><b>${esc(nm(id))}</b></td><td>${u.po}</td><td>${u.gr.length+(u.grX||0)}</td><td>${fmtH(avg(u.gr))}</td><td>${pct(u.gr.filter(h=>h<=SET.target_gr_h).length,u.gr.length)}</td><td>${u.inv.length+(u.invX||0)}</td><td>${fmtH(avg(u.inv))}</td><td>${pct(u.inv.filter(h=>h<=SET.target_inv_h).length,u.inv.length)}</td></tr>`).join(''):'<tr><td colspan="8" class="empty">Belum ada input lewat sistem ini pada periode terpilih</td></tr>');
  $('#tCekSum').innerHTML='<tr><th>Region</th><th>Dicek</th><th>MATCH</th><th>SELISIH</th><th>Total selisih</th><th>Cek belum lengkap</th></tr>'+REGIONS.filter(r=>!reg||r===reg).map(r=>{const c=ceks.filter(x=>x.region===r);const m=c.filter(x=>x.status==='MATCH').length;const s=c.filter(x=>x.status!=='MATCH');const nb=list.filter(p=>p.region===r&&!cekDone(p.cek)).length;return `<tr><td><b>${r}</b></td><td>${c.length}</td><td>${m}</td><td>${s.length?'<span class="b bad">'+s.length+'</span>':0}</td><td>${fmtRp(s.reduce((a,x)=>a+Math.abs(x.selisih||0),0))}</td><td>${nb}</td></tr>`}).join('');
}

function outRow(p,stage){
  const start=ageFrom(p);const h=start?(Date.now()-new Date(start))/36e5:null;const tgt=stage==='nogr'?SET.target_gr_h:SET.target_inv_h;
  const over=h!=null&&h>tgt;
  return `<tr><td><span class="b mut">${p.region}</span></td><td>${esc(p.supplier)}</td><td class="mono">${esc((p.po_nos&&p.po_nos.length?p.po_nos:[p.po_no]).join(' + '))}<div class="sub">${p.po_at?jkt(p.po_at):fmtTgl(p.tgl)+' (import)'}</div></td>
  ${stage==='noinv'?`<td class="mono">${esc(p.gr_no)}<div class="sub">${p.gr_at?jkt(p.gr_at):'tanpa jam'}</div></td>`:''}
  <td><span class="b ${over?'bad':'ok'}">${fmtH(h)}</span>${over?'<div class="sub">lewat target '+tgt+' jam</div>':''}</td>
  <td>${esc(p.keterangan||'')}</td><td><button class="btn sm p" data-edit="${p.id}" data-focus="${stage==='nogr'?'mGr':'mInv'}">${stage==='nogr'?'Isi GR':'Isi Invoice'}</button></td></tr>`}
function renderOut(){
  const reg=$('#oRegion').value,sort=$('#oSort').value;
  let list=POS.filter(p=>!reg||p.region===reg);
  const key=p=>new Date(ageFrom(p)||0).getTime();
  list.sort((a,b)=>sort==='age'?key(a)-key(b):key(b)-key(a));
  const a=list.filter(p=>status(p)==='nogr'&&!isTunggu(p)),b=list.filter(p=>status(p)==='noinv'&&!isTunggu(p)),tg=list.filter(isTunggu).sort((x,y)=>{const kx=new Date(x.tunggu_inv_at||0),ky=new Date(y.tunggu_inv_at||0);return sort==='age'?kx-ky:ky-kx});
  $('#cntNoGR').textContent=a.length;$('#cntNoInv').textContent=b.length;$('#cntTunggu').textContent=tg.length;
  $('#tTunggu').innerHTML='<tr><th>Region</th><th>Supplier</th><th>No PO</th><th>No GR</th><th>Barang diterima</th><th>Menunggu sejak</th><th>Lama menunggu</th><th>Ket</th><th></th></tr>'+(tg.length?tg.map(p=>{const h=p.tunggu_inv_at?(Date.now()-new Date(p.tunggu_inv_at))/36e5:null;return `<tr><td><span class="b mut">${p.region}</span></td><td>${esc(p.supplier)}</td><td class="mono">${p.po_no?esc((p.po_nos&&p.po_nos.length?p.po_nos:[p.po_no]).join(' + ')):'<span class="b blue">PO belum dibuat</span>'}</td><td class="mono">${esc((p.gr_nos&&p.gr_nos.length?p.gr_nos:(p.gr_no?[p.gr_no]:[])).join(' + ')||'—')}</td><td>${fmtTgl(p.barang_terima)}</td><td>${jkt(p.tunggu_inv_at)}</td><td><span class="b blue">${fmtH(h)}</span></td><td class="sub">${esc(p.keterangan||'')}</td><td><button class="btn sm p" data-edit="${p.id}" data-focus="mInvTerima">Invoice datang</button></td></tr>`}).join(''):'<tr><td colspan="9" class="empty">Tidak ada PO yang menunggu invoice distributor</td></tr>');$('#oInfo').textContent='Diperbarui live · '+new Date().toLocaleTimeString('id-ID',{timeZone:TZ});
  $('#tNoGR').innerHTML='<tr><th>Region</th><th>Supplier</th><th>No PO · jam input</th><th>Umur</th><th>Ket</th><th></th></tr>'+(a.length?a.map(p=>outRow(p,'nogr')).join(''):'<tr><td colspan="6" class="empty">Tidak ada — semua PO sudah GR 🎉</td></tr>');
  $('#tNoInv').innerHTML='<tr><th>Region</th><th>Supplier</th><th>No PO · jam input</th><th>No GR · jam</th><th>Umur</th><th>Ket</th><th></th></tr>'+(b.length?b.map(p=>outRow(p,'noinv')).join(''):'<tr><td colspan="7" class="empty">Tidak ada — semua GR sudah di-invoice 🎉</td></tr>');
}

function filteredPo(){
  const reg=$('#pRegion').value,st=$('#pStatus').value,q=$('#pCari').value.trim().toLowerCase(),d1=$('#pDari').value,d2=$('#pSampai').value;
  const stOk=p=>!st||(st==='tunggu'?isTunggu(p):st==='selisih'?p.cek&&p.cek.status==='SELISIH':st==='match'?p.cek&&p.cek.status==='MATCH':st==='belumcek'?!cekDone(p.cek):(status(p)===st&&(st==='done'||!isTunggu(p))));
  return POS.filter(p=>(!reg||p.region===reg)&&stOk(p)&&(!q||[p.po_no,p.gr_no,p.inv_no,p.supplier,p.inv_dist,p.keterangan,(p.po_nos||[]).join(' '),(p.gr_nos||[]).join(' ')].join(' ').toLowerCase().includes(q))&&(!d1||(p.tgl||'')>=d1)&&(!d2||(p.tgl||'')<=d2));
}
function renderPo(){
  const list=filteredPo();$('#pInfo').textContent=list.length+' PO ditampilkan dari '+POS.length;
  const cell=(no,at,by,legacy,noLbl,extra)=>no?`<span class="mono">${esc(no)}</span>${(extra||[]).map(x=>'<br><span class="mono">'+esc(x)+'</span>').join('')}${(extra||[]).length?'<div class="sub">'+((extra.length+1))+' dokumen</div>':''}<div class="sub">${at?'⏱ '+jkt(at)+' · '+esc(nm(by)):(legacy?'import, tanpa jam':'')}</div>`:'<span class="b '+(noLbl?'blue':'mut')+'">'+(noLbl||'—')+'</span>';
  const extras=(p,f)=>((p[f]||[]).slice(1));
  $('#tPo').innerHTML='<tr><th>Tgl</th><th>Region</th><th>Supplier</th><th>No PO</th><th>No GR</th><th>PO→GR</th><th>No Invoice</th><th>GR→Inv</th><th>Nominal</th><th>Dokumen &amp; cek total</th><th>Ket</th><th></th></tr>'+
  (list.length?list.map(p=>`<tr><td>${fmtTgl(p.tgl)}</td><td><span class="b mut">${p.region}</span></td><td>${esc(p.supplier)}</td><td>${cell(p.po_no,p.po_at,p.po_by,p.legacy,p.po_no?'':'PO belum dibuat',extras(p,'po_nos'))}${p.po_date?'<div class="sub">tgl dok. '+fmtTgl(p.po_date)+'</div>':''}</td><td>${cell(p.gr_no,p.gr_at,p.gr_by,p.legacy,'',extras(p,'gr_nos'))}${p.gr_date?'<div class="sub">tgl dok. '+fmtTgl(p.gr_date)+'</div>':''}</td><td>${fmtH(hours(p.po_at,p.gr_at))}</td><td>${cell(p.inv_no,p.inv_at,p.inv_by,p.legacy)}${p.inv_date?'<div class="sub">tgl dok. '+fmtTgl(p.inv_date)+'</div>':''}${p.inv_dist?'<div class="sub">Dist: '+esc(p.inv_dist)+'</div>':''}</td><td>${fmtH(hours(invStart(p),p.inv_at))}${p.inv_terima_at&&p.inv_at?'<div class="sub">sejak inv. distributor '+fmtTgl(p.inv_terima_at.slice(0,10))+'</div>':''}</td><td>${fmtRp(p.nominal)}</td><td>${cekBadge(p)}</td><td class="sub">${isTunggu(p)?'<span class="b blue">📦 menunggu inv. distributor</span><br>':''}${esc(p.keterangan||'')}${p.gr_return?'<br>Ret: '+esc(p.gr_return):''}</td><td style="white-space:nowrap">${status(p)==='nogr'?`<button class="btn sm p" data-edit="${p.id}" data-focus="mGr">Isi GR</button>`:status(p)==='noinv'?`<button class="btn sm p" data-edit="${p.id}" data-focus="mInv">Isi Inv</button>`:''} <button class="btn sm" data-edit="${p.id}">Edit</button></td></tr>`).join(''):'<tr><td colspan="12" class="empty">Belum ada data. Klik <b>+ PO Baru</b> atau import dari Excel.</td></tr>');
  const sups=[...new Set(POS.map(p=>p.supplier).filter(Boolean))].sort();$('#supList').innerHTML=sups.map(s=>`<option value="${esc(s)}">`).join('');
}
document.body.addEventListener('click',e=>{const b=e.target.closest('[data-edit]');if(b){openModal(POS.find(p=>p.id===b.dataset.edit),b.dataset.focus)}});

/* ---------- modal PO ---------- */
let editing=null;
guard('btnNew',()=>{$('#btnNew').onclick=()=>openModal(null);});
$('#mBatal').onclick=()=>$('#mbg').classList.remove('open');
$('#mbg').addEventListener('click',e=>{if(e.target.id==='mbg')$('#mbg').classList.remove('open')});
function openModal(p,focus){
  editing=p||null;$('#mTitle').textContent=p?('Edit '+(p.po_no||'(PO belum dibuat) · '+p.supplier)):'PO Baru';
  $('#mRegion').value=p?p.region:(ls.region||REGIONS[0]);$('#mTglGudang').value=p?(p.tgl_gudang||''):jktDate();
  $('#mSup').value=p?p.supplier:'';$('#mPo').readOnly=false;
  setNums('#mPo',p?(p.po_nos&&p.po_nos.length?p.po_nos:(p.po_no?[p.po_no]:[])):[]);
  setNums('#mGr',p?(p.gr_nos&&p.gr_nos.length?p.gr_nos:(p.gr_no?[p.gr_no]:[])):[]);
  $('#mInv').value=p?p.inv_no||'':'';
  $('#mNom').value=p&&p.nominal!=null?Math.round(p.nominal).toLocaleString('id-ID'):'';$('#mRet').value=p?p.gr_return||'':'';$('#mDist').value=p?p.inv_dist||'':'';$('#mKet').value=p?p.keterangan||'':'';
  const st=(el,at,by)=>el.innerHTML=at?`⏱ <b>${jkt(at)}</b> · ${esc(nm(by))}`:(p&&p.legacy?'import Excel — tanpa jam':'jam terekam otomatis saat diisi');
  st($('#stPo'),p?.po_at,p?.po_by);st($('#stGr'),p?.gr_at,p?.gr_by);st($('#stInv'),p?.inv_at,p?.inv_by);
  $('#mTunggu').checked=!!(p&&p.tunggu_inv);$('#mTerima').value=p?(p.barang_terima||''):'';$('#mInvTerima').value=p&&p.inv_terima_at?p.inv_terima_at.slice(0,10):'';
  $('#stTunggu').innerHTML=p&&p.tunggu_inv_at?('⏱ ditandai menunggu sejak <b>'+jkt(p.tunggu_inv_at)+'</b>'+(p.tunggu_inv_selesai?' · selesai '+jkt(p.tunggu_inv_selesai):'')):'';
  $('#mHapus').style.display=p&&isAdmin?'':'none';
  resetCek();const c=p&&p.cek;if(c){$('#cNote').value=c.note||'';
    TOT_SLOTS.forEach(S=>{const tv=c['total_'+S.k];if(tv!=null)$('#'+S.tot).value=Math.round(tv).toLocaleString('id-ID')});
    loadSavedDocs(c);calcRes()}
  else if(p&&p.nominal){$('#totE').value=Math.round(p.nominal).toLocaleString('id-ID')}
  $('#mbg').classList.add('open');setTimeout(()=>$('#'+(focus||(p?'mGr':'mSup'))).focus(),50);
}
$('#mNom').addEventListener('blur',()=>{const n=parseRp($('#mNom').value);$('#mNom').value=n==null?'':Math.round(n).toLocaleString('id-ID')});
$('#mSimpan').onclick=async()=>{
  const region=$('#mRegion').value,sup=$('#mSup').value.trim(),poNos=numList('#mPo'),grNos=numList('#mGr'),inv=$('#mInv').value.trim().toUpperCase();
  const po=poNos[0]||'',gr=grNos[0]||'';
  const tgChk=$('#mTunggu').checked;const pd=parsedDates;
  if(!sup)return toast('Supplier wajib diisi');
  if(!po&&!tgChk)return toast('No PO wajib diisi — kecuali centang "barang diterima, menunggu invoice distributor"');
  const now=nowIso();ls.region=region;saveLs();
  let d=editing?{...editing}:{created:now,tgl:jktDate(now),po_at:po?now:null,po_by:po?uid:null,legacy:false};delete d.id;
  if(editing&&po&&!editing.po_no){d.po_at=now;d.po_by=uid}
  if(pd.po)d.po_date=pd.po;if(pd.gr)d.gr_date=pd.gr;if(pd.esb)d.inv_date=pd.esb;
  const oldId=editing?editing.id:null;const newId=po?docId(po):(oldId||('TMP-'+Date.now()));
  if(newId!==oldId&&POS.some(p=>p.id===newId))return toast('No PO sudah ada di tracking');
  Object.assign(d,{region,supplier:sup,po_no:po,po_nos:poNos,gr_nos:grNos,tgl_gudang:$('#mTglGudang').value||'',gr_no:gr,inv_no:inv,nominal:parseRp($('#mNom').value),gr_return:$('#mRet').value.trim(),inv_dist:$('#mDist').value.trim(),keterangan:$('#mKet').value.trim(),updated:now});
  const tg=$('#mTunggu').checked,invT=$('#mInvTerima').value;d.barang_terima=$('#mTerima').value||'';
  if(invT){d.inv_terima_at=invT+'T'+(editing&&editing.inv_terima_at&&editing.inv_terima_at.startsWith(invT)?editing.inv_terima_at.slice(11):new Date(now).toLocaleTimeString('en-GB',{timeZone:TZ,hour12:false})+'+07:00');d.inv_terima_at=new Date(d.inv_terima_at).toISOString()}else d.inv_terima_at=null;
  const wasT=!!(editing&&editing.tunggu_inv);const nowT=tg&&!inv&&!invT;
  d.tunggu_inv=nowT;if(nowT&&!wasT){d.tunggu_inv_at=now;d.tunggu_inv_selesai=null}if(!nowT&&wasT){d.tunggu_inv_selesai=now}
  if(gr&&!(editing&&editing.gr_no)){d.gr_at=now;d.gr_by=uid}if(!gr){d.gr_at=null;d.gr_by=null}
  if(inv&&!(editing&&editing.inv_no)){d.inv_at=now;d.inv_by=uid}if(!inv){d.inv_at=null;d.inv_by=null}
  $('#mSimpan').disabled=true;
  const t=totals(),note=$('#cNote').value.trim();const old=editing&&editing.cek||{};let anyChanged=false,uploadErr=false;
  for(const S of SLOTS){for(const e of docs[S.k]){if(e.saved||!e.file)continue;
    try{const usePdf=e.isPdf&&e.file.size<=20*1024*1024;e.asset=await uploadDoc(usePdf?e.file:e.pages[0],S.k,usePdf?'pdf':'jpg');e.pdf=usePdf;e.saved=true;e.at=now;e.by=uid;anyChanged=true}
    catch(err){uploadErr=true;console.warn(err)}}}
  if(uploadErr)toast('Sebagian lampiran gagal diupload — total tetap disimpan');
  let r=null;const anyDoc=SLOTS.some(S=>docs[S.k].length);
  const any=anyDoc||TOT_SLOTS.some(S=>t[S.k]!=null)||note;
  if(any){const e=evalCek(t);const cek={note,status:e.status,selisih:e.selisih,detail:e.detail||'',missing:e.missing};
    SLOTS.forEach(S=>{const list=docs[S.k].filter(x=>x.asset);
      cek[S.k+'_docs']=list.map(x=>({name:x.name||null,no:x.no||null,total:x.total!=null?x.total:null,asset:x.asset,pdf:!!x.pdf,at:x.at||old[S.k+'_at']||now,by:x.by||old[S.k+'_by']||uid,npages:x.npages||1}));
      const tv=S.tot?t[S.k]:null;const first=list[0]||null;
      if(tv!==(old['total_'+S.k]??null))anyChanged=true;
      cek['total_'+S.k]=tv;cek[S.k+'_asset']=first?first.asset:null;cek[S.k+'_pdf']=first?!!first.pdf:false;
      cek[S.k+'_at']=first?first.at:(tv!=null?(old[S.k+'_at']||now):null);cek[S.k+'_by']=first?first.by:(tv!=null?(old[S.k+'_by']||uid):null)});
    cek.at=(anyChanged||!old.at)?now:old.at;cek.by=(anyChanged||!old.by)?uid:old.by;d.cek=cek;r=e.status;if(d.nominal==null&&t.esb!=null)d.nominal=t.esb;
  }else d.cek=null;
  try{await sbSave(newId,d);if(oldId&&oldId!==newId)await sbDelete(oldId);$('#mbg').classList.remove('open');toast('Tersimpan ✓ '+jktTime(now)+(r?' · '+r:''));loadPos()}catch(e){toast('Gagal simpan: '+(e.message||e.code))}
  $('#mSimpan').disabled=false;
};
$('#mHapus').onclick=async()=>{if(!editing)return;if($('#mHapus').dataset.c!=='1'){$('#mHapus').dataset.c='1';$('#mHapus').textContent='Klik lagi untuk hapus';return}
  try{await sbDelete(editing.id);$('#mbg').classList.remove('open');toast('Dihapus');loadPos()}catch(e){toast('Gagal: '+(e.message||e.code))}$('#mHapus').dataset.c='';$('#mHapus').textContent='Hapus'};

/* ---------- CSV export ---------- */
$('#btnCsv').onclick=async()=>{
  const list=filteredPo();const H=['Tanggal','Region','Supplier','No PO','Jam PO','Petugas PO','No GR','Jam GR','Petugas GR','PO->GR (jam)','No Invoice','Jam Invoice','Petugas Invoice','GR->Inv (jam)','Nominal','No Inv Distributor','GR Return','Tgl dok PO','Tgl dok GR','Tgl dok Invoice','Keterangan','Barang diterima gudang','Invoice distributor diterima','Status tunggu','Total PO (dok)','Total Fisik','Total ESB','Status Cek','Selisih','Detail selisih'];
  const q=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
  const rows=list.map(p=>{const c=cekOf(p);return [p.tgl,p.region,p.supplier,(p.po_nos&&p.po_nos.length?p.po_nos:[p.po_no]).filter(Boolean).join(' + '),jkt(p.po_at),nm(p.po_by),(p.gr_nos&&p.gr_nos.length?p.gr_nos:[p.gr_no]).filter(Boolean).join(' + '),jkt(p.gr_at),p.gr_by?nm(p.gr_by):'',hours(p.po_at,p.gr_at)?.toFixed(2)||'',p.inv_no,jkt(p.inv_at),p.inv_by?nm(p.inv_by):'',hours(invStart(p),p.inv_at)?.toFixed(2)||'',p.nominal??'',p.inv_dist,p.gr_return,p.po_date||'',p.gr_date||'',p.inv_date||'',p.keterangan,p.barang_terima||'',p.inv_terima_at?p.inv_terima_at.slice(0,10):'',isTunggu(p)?'MENUNGGU INVOICE DISTRIBUTOR':'',c?c.total_po??'':'',c?c.total_fisik??'':'',c?c.total_esb??'':'',c?c.status:'',c&&c.selisih!=null?c.selisih:'',c?c.detail||'':''].map(q).join(';')});
  const csv='﻿'+H.join(';')+'\n'+rows.join('\n');const fn='PO_Tracking_'+jktDate()+'.csv';
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download=fn;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1000);
};

const SLOTS=[{k:'po',drop:'dropP',file:'fileP',tot:'totP',ai:'aiP',num:'mPo',multi:true,label:'Dokumen PO',icon:'🧾',desc:'dokumen Purchase Order (PO) dari sistem ESB',hint:'PDF PO dari ESB · bisa lebih dari 1 (barang susulan)'},
 {k:'gr',drop:'dropG',file:'fileG',tot:null,ai:'aiG',num:'mGr',multi:true,label:'Dokumen GR',icon:'📦',desc:'dokumen Goods Receipt dari sistem ESB',hint:'PDF Goods Receipt · bisa lebih dari 1 · arsip saja'},
 {k:'fisik',drop:'dropF',file:'fileF',tot:'totF',ai:'aiF',num:null,multi:false,label:'Invoice / Surat Jalan FISIK',icon:'📄',desc:'invoice atau surat jalan fisik dari distributor/supplier (foto/scan)',hint:'foto atau PDF dari distributor'},
 {k:'esb',drop:'dropE',file:'fileE',tot:'totE',ai:'aiE',num:'mInv',multi:false,label:'Invoice ESB',icon:'🖥️',desc:'purchase invoice di sistem ESB',hint:'PDF Purchase Invoice dari ESB'}];
const TOT_SLOTS=SLOTS.filter(S=>S.tot);
const SLOT_SHORT={po:'PO',gr:'GR',fisik:'Fisik',esb:'ESB'};
const slotOf=k=>SLOTS.find(S=>S.k===k);

/* ---- daftar dokumen per slot: {saved,name,no,total,file,pages,isPdf,asset,pdf,at,by} ---- */
const docs={};SLOTS.forEach(S=>docs[S.k]=[]);
const NUMG={mPo:'grpPo',mGr:'grpGr'};
function numInputs(sel){const id=sel.replace('#','');const g=NUMG[id]?$('#'+NUMG[id]):null;return g?[...g.querySelectorAll('input')]:[$(sel)]}
function numList(sel){const out=[];numInputs(sel).forEach(el=>el.value.split(/[\s,;+]+/).forEach(x=>{const v=x.trim().toUpperCase();if(v&&!out.includes(v))out.push(v)}));return out}
function setNums(sel,arr){arr=[...new Set(arr.filter(Boolean))];const id=sel.replace('#','');const g=NUMG[id]?$('#'+NUMG[id]):null;
  if(!g){$(sel).value=arr.join(', ');return}
  let inputs=[...g.querySelectorAll('input')];
  while(inputs.length<arr.length){const n=document.createElement('input');n.className='mono';n.placeholder=(id==='mPo'?'PO':'GR')+'… dokumen '+(inputs.length+1);g.appendChild(n);inputs=[...g.querySelectorAll('input')]}
  inputs.forEach((el,i)=>el.value=arr[i]||'');
  while(inputs.length>2&&!inputs[inputs.length-1].value){inputs[inputs.length-1].remove();inputs=[...g.querySelectorAll('input')]}}
function addNum(sel,no){if(!no)return false;const cur=numList(sel);if(cur.includes(no))return false;cur.push(no);setNums(sel,cur);return true}

SLOTS.forEach(S=>{const d=$('#'+S.drop),f=$('#'+S.file);
  if(S.multi)f.setAttribute('multiple','');
  d.onclick=e=>{if(e.target.closest('[data-del]'))return;f.click()};
  f.onclick=e=>e.stopPropagation();
  d.ondragover=e=>{e.preventDefault()};
  d.ondrop=e=>{e.preventDefault();if(e.dataTransfer.files.length)takeFiles(e.dataTransfer.files,S)};
  f.onchange=()=>{if(f.files.length)takeFiles(f.files,S);f.value=''};
  if(!S.tot)return;const t=$('#'+S.tot);t.addEventListener('input',calcRes);t.addEventListener('blur',()=>{const n=parseRp(t.value);t.value=n==null?'':Math.round(n).toLocaleString('id-ID');calcRes()})});

document.addEventListener('click',e=>{const b=e.target.closest('[data-del]');if(!b)return;e.stopPropagation();const [k,i]=b.dataset.del.split(':');docs[k].splice(+i,1);const S=slotOf(k);renderDrop(S);recalcSlot(S,true)});

const MAX_PAGES=8;
async function takeFiles(fileList,S){
  const d=$('#'+S.drop);const files=[...fileList];
  d.innerHTML='⏳ memproses '+files.length+' file…';
  if(!S.multi)docs[S.k]=[];
  for(const file of files){
    try{
      const {pages,total}=await toImages(file);
      const entry={saved:false,name:file.name,file,pages,isPdf:file.type==='application/pdf',size:file.size,npages:total,no:null,total:null,parsed:null};
      if(entry.isPdf){try{const txt=await pdfText(file);entry.parsed=parseEsb(txt);entry.txt=txt}catch(err){console.warn('parse',err)}}
      docs[S.k].push(entry);
    }catch(e){toast('Gagal membaca '+file.name+': '+e.message)}
  }
  renderDrop(S);recalcSlot(S);
}
function renderDrop(S){
  const d=$('#'+S.drop),list=docs[S.k];
  if(!list.length){d.className='drop';d.innerHTML=S.icon+' <b>'+S.label+'</b><br><span class="sub">'+S.hint+'</span>';return}
  d.className='drop has';
  const rows=list.map((e,i)=>{
    const u=e.saved?(e.pdf?null:burl(e.asset)):(e.pages?URL.createObjectURL(e.pages[0]):null);
    const thumbHtml=e.saved&&e.pdf?'<span class="filepdf">PDF</span>':(u?`<img class="thumb" ${e.saved?'data-burl="'+e.asset+'"':''} src="${u}">`:'<span class="filepdf">DOC</span>');
    const meta=[e.no?'<b>'+esc(e.no)+'</b>':'',e.total!=null?fmtRp(e.total):'',e.npages>1?e.npages+' hal.':'',e.saved?'tersimpan':''].filter(Boolean).join(' · ');
    const link=e.saved?`<a href="${burl(e.asset)||'#'}" data-burl="${e.asset}" target="_blank" onclick="event.stopPropagation()">buka</a>`:'';
    return `<div class="filerow">${thumbHtml}<div class="fileinfo"><div class="filename">${esc(e.name||('dokumen '+(i+1)))}</div><div class="sub">${meta} ${link}</div></div><button type="button" class="xdel" data-del="${S.k}:${i}" title="hapus dokumen">×</button></div>`;
  }).join('');
  d.innerHTML=`<div class="drophead">${S.icon} <b>${S.label}</b> <span class="b mut">${list.length} dokumen</span></div>${rows}<div class="sub" style="margin-top:6px">${S.multi?'klik untuk menambah dokumen lagi':'klik untuk mengganti dokumen'}</div>`;
}
/* kumpulkan hasil parse semua dokumen di satu slot → isi nomor, total, supplier, tanggal */
function recalcSlot(S,silent){
  const list=docs[S.k];const got=[],warn=[];
  if(S.num&&S.multi)setNums('#'+S.num,[]);
  list.forEach(e=>{
    const r=e.parsed;
    if(r){
      if(S.k==='po'){e.no=r.po_no;e.total=r.total;
        if(r.type&&r.type!=='po')warn.push(esc(e.name)+': terbaca sebagai dokumen '+(SLOT_SHORT[r.type]||r.type));
        if(r.supplier)$('#mSup').value=r.supplier;
        if(r.region)$('#mRegion').value=r.region;
        if(r.date&&(!parsedDates.po||r.date<parsedDates.po)){parsedDates.po=r.date;$('#mTglGudang').value=r.date}
      }else if(S.k==='gr'){e.no=r.gr_no;
        if(r.type&&r.type!=='gr')warn.push(esc(e.name)+': terbaca sebagai dokumen '+(SLOT_SHORT[r.type]||r.type));
        if(r.po_no)addNum('#mPo',r.po_no);
        if(!$('#mSup').value.trim()&&r.supplier)$('#mSup').value=r.supplier;
        if(r.date&&(!parsedDates.gr||r.date>parsedDates.gr)){parsedDates.gr=r.date;$('#mTerima').value=r.date}
      }else if(S.k==='esb'){e.no=r.inv_no;e.total=r.total;
        if(r.type&&r.type!=='esb')warn.push(esc(e.name)+': terbaca sebagai dokumen '+(SLOT_SHORT[r.type]||r.type));
        if(r.gr_no)addNum('#mGr',r.gr_no);
        if(r.po_no)addNum('#mPo',r.po_no);
        if(!$('#mSup').value.trim()&&r.supplier)$('#mSup').value=r.supplier;
        if(r.inv_dist)$('#mDist').value=r.inv_dist;
        if(r.date)parsedDates.esb=r.date;
      }else if(S.k==='fisik'){if(e.total==null&&r.total!=null)e.total=r.total}
    }
    if(S.num&&e.no)addNum('#'+S.num,e.no);
  });
  // nomor invoice ESB: hanya satu
  if(S.k==='esb'&&list.length&&list[0].no)$('#mInv').value=list[0].no;
  // total slot = jumlah total semua dokumen (PO bisa 2 dokumen untuk 1 invoice)
  if(S.tot){const vals=list.map(e=>e.total).filter(v=>v!=null);
    if(vals.length){const sum=vals.reduce((a,b)=>a+b,0);$('#'+S.tot).value=Math.round(sum).toLocaleString('id-ID');
      if(vals.length>1)got.push('total '+vals.length+' dokumen = '+fmtRp(sum));else got.push('total '+fmtRp(sum));}
  }
  // nominal invoice baris ini mengikuti total Invoice ESB
  if(S.k==='esb'){const t=parseRp($('#totE').value);if(t!=null)$('#mNom').value=Math.round(t).toLocaleString('id-ID')}
  const nos=list.map(e=>e.no).filter(Boolean);
  if(nos.length)got.unshift(nos.join(' + '));
  if(S.k==='po'&&parsedDates.po)got.push('tgl PO '+fmtTgl(parsedDates.po));
  if(S.k==='gr'&&parsedDates.gr)got.push('tgl GR '+fmtTgl(parsedDates.gr));
  if(S.k==='esb'&&parsedDates.esb)got.push('tgl invoice '+fmtTgl(parsedDates.esb));
  const noText=list.some(e=>!e.saved&&!e.parsed);
  if(!silent)$('#'+S.ai).innerHTML=(got.length?'✓ otomatis: '+esc(got.join(' · ')):(noText?'PDF tanpa teks / foto — pakai tombol AI atau isi manual':''))+(warn.length?'<div class="warnx">⚠ '+warn.join(' · ')+'</div>':'');
  calcRes();
}

async function canvasToJpeg(bmp){const max=2000,sc=Math.min(1,max/Math.max(bmp.width,bmp.height));const c=document.createElement('canvas');c.width=Math.round(bmp.width*sc);c.height=Math.round(bmp.height*sc);c.getContext('2d').drawImage(bmp,0,0,c.width,c.height);return await new Promise(r=>c.toBlob(r,'image/jpeg',0.9))}
async function toImages(file){
  if(file.type==='application/pdf'){
    if(!window.pdfjsLib)throw new Error('pdf.js tidak tersedia');
    const pdf=await pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise;const pages=[];
    for(let i=1;i<=Math.min(pdf.numPages,MAX_PAGES);i++){const page=await pdf.getPage(i);const vp=page.getViewport({scale:2});const c=document.createElement('canvas');c.width=vp.width;c.height=vp.height;await page.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;pages.push(await canvasToJpeg(c))}
    return {pages,total:pdf.numPages};
  }
  return {pages:[await canvasToJpeg(await createImageBitmap(file))],total:1};
}
async function pdfText(file){const pdf=await pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise;let text='';for(let i=1;i<=Math.min(pdf.numPages,MAX_PAGES);i++){const c=await (await pdf.getPage(i)).getTextContent();text+=c.items.map(it=>it.str).join(' ')+'\n'}return text}
function parseEsb(text){
  const t=text.replace(/\s+/g,' ');
  const num=s=>{if(!s)return null;s=s.trim();if(/,\d{1,2}$/.test(s))s=s.replace(/\./g,'').replace(',','.');else s=s.replace(/[.,]/g,'');const n=parseFloat(s);return isNaN(n)?null:n};
  const r={type:null,po_no:null,gr_no:null,inv_no:null,total:null,supplier:null,region:null,inv_dist:null,date:null};
  if(/Purchase Invoice/i.test(t)&&/\bVI\d{10,}/.test(t))r.type='esb';else if(/Goods Receipt/i.test(t)&&/\bGR\d{10,}/.test(t))r.type='gr';else if(/Purchase Order/i.test(t)&&/\bPO\d{10,}/.test(t))r.type='po';
  const m=(re)=>{const x=t.match(re);return x?x[1].trim():null};
  r.po_no=m(/\b(PO\d{10,})\b/);r.gr_no=m(/\b(GR\d{10,})\b/);r.inv_no=m(/\b(VI\d{10,})\b/);
  if(r.type==='po')r.total=num(m(/Grand Total\s*:?\s*([\d.]+,\d{2})/i));
  if(r.type==='esb')r.total=num(m(/Invoice Total\s*:?\s*([\d.]+,\d{2})/i));
  if(!r.type){const all=[...t.matchAll(/(?:Grand Total|Total Tagihan|Jumlah(?: yang harus dibayar)?|Total)\s*:?\s*(?:Rp\.?)?\s*([\d.]{4,}(?:,\d{2})?)/gi)];if(all.length)r.total=num(all[all.length-1][1])}
  r.supplier=m(/(?:Supplier|Source)\s*:\s*((?:JKT|BLI|JOG|JTM|JTG|PT\.?|CV\.?)[^:]*?)\s+(?:Purchase Date|Invoice Due|Currency|Delivery Number|Cost Center|Branch|Address|Invoice Date|Reference Date)\b/i)
    ||m(/\b((?:JKT|BLI|JOG|JTM|JTG)\s*-\s*[A-Z0-9][A-Z0-9 .,()&'-]{3,}?)(?=\s+(?:Purchase|Invoice|Currency|Delivery|Reference|Branch|Cost|Address)\b)/);
  if(r.supplier)r.supplier=r.supplier.replace(/\s+(?:Invoice Due Date.*|Purchase Date.*)$/i,'').trim();
  const br=m(/WAREHOUSE\s+(JELUPANG|BALI|JOGJA|YOGYAKARTA|JATENG|JATIM|SEMARANG|SURABAYA|JAKARTA)/i);
  if(br){const b=br.toUpperCase();r.region=b==='JOGJA'?'YOGYAKARTA':b==='SEMARANG'?'JATENG':b==='SURABAYA'?'JATIM':b==='JAKARTA'?'JELUPANG':b}
  if(r.type==='esb'){r.inv_dist=m(/Supplier Invoice\s*(?:Number)?\s*:\s*([A-Z0-9][A-Z0-9\/._-]{2,})/i);if(r.inv_dist&&/^Number$/i.test(r.inv_dist))r.inv_dist=null;}
  const dd=m(/(?:Purchase Date|GR Date|Invoice Date)\s*:\s*(\d{2}\/[A-Za-z]{3}\/\d{4})/);
  if(dd){const MO={jan:'01',feb:'02',mar:'03',apr:'04',may:'05',mei:'05',jun:'06',jul:'07',aug:'08',agu:'08',sep:'09',oct:'10',okt:'10',nov:'11',dec:'12',des:'12'};const [d_,mo,y]=dd.split('/');r.date=MO[mo.toLowerCase()]?y+'-'+MO[mo.toLowerCase()]+'-'+d_:null}
  return r;
}
let parsedDates={};
function totals(){const t={};TOT_SLOTS.forEach(S=>t[S.k]=parseRp($('#'+S.tot).value));return t}
function evalCek(t){const tol=SET.toleransi||0;const have=TOT_SLOTS.filter(S=>t[S.k]!=null);const missing=TOT_SLOTS.filter(S=>t[S.k]==null).map(S=>SLOT_SHORT[S.k]);
  const pairs=[['po','fisik'],['fisik','esb'],['po','esb']];const bad=[],good=[];
  pairs.forEach(([x,y])=>{if(t[x]!=null&&t[y]!=null){const dlt=Math.abs(t[x]-t[y]);(dlt>tol?bad:good).push(dlt>tol?SLOT_SHORT[x]+'≠'+SLOT_SHORT[y]+' '+fmtRp(dlt):SLOT_SHORT[x]+'='+SLOT_SHORT[y])}});
  const vals=have.map(S=>t[S.k]);const spread=vals.length>1?Math.max(...vals)-Math.min(...vals):null;
  if(have.length<2)return {status:'MENUNGGU',missing,selisih:null,detail:'',ok:null};
  if(bad.length)return {status:'SELISIH',missing,selisih:spread,detail:bad.join(' · ')+(missing.length?' · menunggu '+missing.join(', '):''),ok:false};
  if(missing.length)return {status:'MENUNGGU',missing,selisih:spread,detail:good.join(' · ')+' ✓ · menunggu '+missing.join(', '),ok:true};
  return {status:'MATCH',missing:[],selisih:spread,detail:good.join(' · '),ok:true}}
function calcRes(){const t=totals(),r=$('#cRes'),e=evalCek(t);const have=TOT_SLOTS.filter(S=>t[S.k]!=null);const line=have.map(S=>SLOT_SHORT[S.k]+' '+fmtRp(t[S.k])).join(' · ');
  if(e.status==='MENUNGGU'&&have.length<2){r.className='res '+(have.length?'warn':'mut');r.textContent=have.length?'⏳ '+line+' — menunggu '+e.missing.join(', ')+' untuk dibandingkan (boleh Simpan)':'Upload dokumen — nomor & total terisi otomatis dari PDF ESB; boleh disimpan sebagian';return e}
  if(e.status==='MENUNGGU'){r.className='res warn';r.innerHTML='✅ '+e.detail+' <span class="sub" style="font-weight:400">(boleh Simpan)</span><div class="sub" style="font-weight:400;margin-top:4px">'+line+'</div>';return e}
  r.className='res '+(e.ok?'ok':'bad');r.innerHTML=(e.ok?'✅ MATCH — PO = Fisik = ESB = '+fmtRp(t.esb):'❌ SELISIH — '+e.detail)+'<div class="sub" style="font-weight:400;margin-top:4px">'+line+'</div>';return e}
$('#btnAI').onclick=async()=>{
  const jobs=[];SLOTS.forEach(S=>docs[S.k].forEach((e,i)=>{if(!e.saved&&e.total==null&&(S.k==='fisik'||!e.parsed||e.parsed.total==null))jobs.push([S,e,i])}));
  if(!jobs.length)return toast('Tidak ada dokumen yang perlu dibaca AI (total sudah terisi otomatis)');
  $('#btnAI').disabled=true;
  for(const [S,e] of jobs){$('#'+S.ai).textContent='⏳ AI membaca '+e.name+'…';
    try{const r=await sample.json(`Kamu membaca ${S.desc}. Dokumen bisa terdiri dari beberapa halaman (gambar berurutan); total akhir biasanya ada di halaman terakhir. Temukan TOTAL AKHIR / GRAND TOTAL dokumen ini (setelah diskon dan PPN bila ada; bukan subtotal, bukan DPP, bukan total per halaman). Angka dalam Rupiah. Balas HANYA JSON: {"total": number|null, "doc_no": string|null, "supplier": string|null, "ppn": boolean|null, "note": string}. Jika ada beberapa kandidat, pilih yang berlabel Total/Grand Total/Total Tagihan/Jumlah yang harus dibayar.`,e.pages);
      if(r&&r.total!=null){e.total=r.total;if(!e.no&&r.doc_no)e.no=String(r.doc_no).toUpperCase();$('#'+S.ai).textContent='AI: '+e.name+' → '+fmtRp(r.total)+(r.ppn?' (termasuk PPN)':'')}
      else $('#'+S.ai).textContent='AI tidak menemukan total di '+e.name+' — isi manual';
    }catch(err){$('#'+S.ai).textContent='AI gagal ('+(err.code||err.message)+') — isi manual'}
    renderDrop(S);recalcSlot(S,true);
  }
  $('#btnAI').disabled=false;
};
function resetCek(){parsedDates={};SLOTS.forEach(S=>{docs[S.k]=[];if(S.tot)$('#'+S.tot).value='';$('#'+S.ai).textContent='';renderDrop(S)});$('#cNote').value='';calcRes()}
function loadSavedDocs(c){SLOTS.forEach(S=>{const arr=(c&&c[S.k+'_docs'])||[];
  if(arr.length)docs[S.k]=arr.map(x=>({saved:true,name:x.name||S.label,no:x.no||null,total:x.total!=null?Number(x.total):null,asset:x.asset,pdf:!!x.pdf,at:x.at,by:x.by,npages:x.npages||1}));
  else if(c&&c[S.k+'_asset'])docs[S.k]=[{saved:true,name:S.label,no:null,total:(c['total_'+S.k]!=null?Number(c['total_'+S.k]):null),asset:c[S.k+'_asset'],pdf:!!c[S.k+'_pdf'],at:c[S.k+'_at'],by:c[S.k+'_by'],npages:1}];
  renderDrop(S)})}

/* ---------- settings ---------- */
$('#btnSaveSet').onclick=async()=>{const {error}=await sb.from('settings').upsert({id:1,target_gr_h:+$('#sGr').value||24,target_inv_h:+$('#sInv').value||48,toleransi:+$('#sTol').value||0,updated:nowIso()});if(error)return toast('Gagal: '+error.message+' (hanya admin)');toast('Setting tersimpan');loadSettings()};

/* ---------- import xlsx ---------- */
let XL=null;$('#impFile').onchange=()=>{$('#btnImport').disabled=!$('#impFile').files[0]};
async function loadXlsx(){if(window.XLSX)return;await new Promise((res,rej)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';s.onload=res;s.onerror=rej;document.head.appendChild(s)})}
$('#btnImport').onclick=async()=>{
  const file=$('#impFile').files[0];if(!file)return;const from=$('#impDari').value||'2026-11-01';$('#btnImport').disabled=true;const log=m=>$('#impLog').textContent=m;
  try{log('Membaca file…');await loadXlsx();const wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true});
    const recs=[];const dstr=v=>{if(v instanceof Date)return v.toLocaleDateString('sv-SE');const m=String(v||'').match(/(\d{4})-(\d{2})-(\d{2})/);return m?m[0]:''};const S=v=>v==null?'':String(v).trim();
    for(const name of wb.SheetNames){const region=REGIONS.find(r=>name.toUpperCase().includes(r));if(!region)continue;const rows=XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,defval:null});const hdr=(rows[0]||[]).map(S);const ix=n=>hdr.findIndex(h=>h.toLowerCase().startsWith(n));
      const iInv=ix('no. invoice'),iRet=ix('no. gr return'),iKet=ix('keterangan'),iDist=ix('nomor inv');
      for(const r of rows.slice(1)){const po=S(r[4]).toUpperCase();if(!po.startsWith('PO'))continue;let tgl=dstr(r[1])||dstr(r[2]);if(!tgl){const m=po.match(/(\d{4})(\d{2})(\d{2})/);tgl=m?`${m[1]}-${m[2]}-${m[3]}`:''}if(!tgl||tgl<from)continue;
        let ket=iKet>=0?S(r[iKet]):'',nominal=null;if(ket&&/^[\d.,]+$/.test(ket)){nominal=parseRp(ket);ket=''}
        recs.push({region,tgl,tgl_gudang:dstr(r[2]),supplier:S(r[3]),po_no:po,gr_no:S(r[5]).toUpperCase(),inv_no:iInv>=0?S(r[iInv]).toUpperCase():'',gr_return:iRet>=0?S(r[iRet]):'',nominal,inv_dist:iDist>=0?S(r[iDist]):'',keterangan:ket})}}
    const existing=new Set(POS.map(p=>p.id));const todo=recs.filter(r=>!existing.has(docId(r.po_no)));log(`${recs.length} baris sejak ${from}, ${todo.length} baru akan diimport…`);let n=0;
    for(const r of todo){const ts=r.tgl+'T00:00:00+07:00';await sbSave(docId(r.po_no),{...r,created:new Date(ts).toISOString(),po_at:null,po_by:null,gr_at:null,gr_by:null,inv_at:null,inv_by:null,legacy:true,updated:nowIso()});n++;$('#impBar').style.width=Math.round(n/todo.length*100)+'%';if(n%10===0)log(`Import ${n}/${todo.length}…`)}
    log(`Selesai: ${n} PO diimport, ${recs.length-todo.length} dilewati (sudah ada).`);loadPos();
  }catch(e){log('Gagal import: '+(e.code||e.message))}
  $('#btnImport').disabled=false;
};
guard('init',()=>{show(ls.view&&document.getElementById('v-'+ls.view)?ls.view:'dash')});
