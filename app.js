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
const APP_VERSION='2026-11-14e';
const CFG=window.APP_CONFIG||{};
/* AUTH_MODE: 'supabase' (email+password) | 'access' (Cloudflare Access, tanpa form login)
   STORAGE_BACKEND: 'supabase' (bucket dokumen) | 'r2' (Cloudflare R2 lewat Worker) */
const AUTH_MODE=CFG.AUTH_MODE||'supabase';
const STORE=CFG.STORAGE_BACKEND||(AUTH_MODE==='access'?'r2':'supabase');
if(AUTH_MODE==='supabase'&&(!CFG.SUPABASE_URL||!CFG.SUPABASE_ANON_KEY)){document.addEventListener('DOMContentLoaded',()=>{const m=document.getElementById('loginMsg');if(m)m.innerHTML='<b style="color:var(--bad)">config.js belum diisi.</b> Salin config.example.js → config.js dan isi SUPABASE_URL &amp; SUPABASE_ANON_KEY.'})}
/* Pustaka Supabase hanya dimuat kalau salah satu bagian masih memakai Supabase.
   Setelah pindah penuh ke Cloudflare, halaman tidak memuat kode Supabase sama sekali. */
const SB_JS=CFG.SUPABASE_JS||'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
const needSb=()=>(AUTH_MODE==='supabase'||(CFG.DATA_BACKEND||'supabase')==='supabase'||STORE==='supabase');
let sb=null;
async function initSb(){
  if(sb||!needSb())return sb;
  if(!CFG.SUPABASE_URL)return null;
  if(!window.supabase){try{await loadScript(SB_JS)}catch(e){console.warn(e)}}
  if(window.supabase)sb=window.supabase.createClient(CFG.SUPABASE_URL,CFG.SUPABASE_ANON_KEY);
  return sb;
}
const BUCKET=CFG.STORAGE_BUCKET||'dokumen';
let db=null,userApi=null,assets=null,sample=null,downloads=true;
const PO_COLS=['id','region','supplier','po_no','tgl','tgl_gudang','po_at','po_by','gr_no','gr_at','gr_by','inv_no','inv_at','inv_by','nominal','inv_dist','gr_return','keterangan','legacy','created','updated','po_nos','gr_nos','po_date','gr_date','inv_date','barang_terima','inv_terima_at','tunggu_inv','tunggu_inv_at','tunggu_inv_selesai','cek'];
function toRow(id,d){const row={id};PO_COLS.forEach(c=>{if(c==='id')return;let v=d[c];if(v===undefined)v=null;if(v==='' && ['po_at','gr_at','inv_at','inv_terima_at','tunggu_inv_at','tunggu_inv_selesai','created','updated','po_date','gr_date','inv_date','barang_terima','tgl','tgl_gudang','nominal'].includes(c))v=null;row[c]=v});row.check_status=d.cek?d.cek.status:null;return row}
function fromRow(r){const d={...r};['po_at','gr_at','inv_at','inv_terima_at','tunggu_inv_at','tunggu_inv_selesai','created','updated'].forEach(c=>{if(d[c])d[c]=new Date(d[c]).toISOString()});['gr_no','inv_no','gr_return','inv_dist','keterangan','supplier','tgl_gudang','barang_terima','po_no'].forEach(c=>{if(d[c]==null)d[c]=''});if(d.nominal!=null)d.nominal=Number(d.nominal);['po_nos','gr_nos'].forEach(c=>{if(!Array.isArray(d[c]))d[c]=d[c]?[].concat(d[c]):[]});return d}
/* ===== Lapisan data: 'supabase' (asal) atau 'd1' (Cloudflare) =====
   Ganti DATA_BACKEND di config.js untuk berpindah; login tetap Supabase Auth. */
const BACKEND=(CFG.DATA_BACKEND||'supabase');
const API=(CFG.API_URL||'').replace(/\/+$/,'');
/* Di mode Access, browser mengirim cookie Access otomatis → tidak perlu header Authorization.
   Di mode Supabase, token login dilampirkan seperti sebelumnya. */
async function authHeaders(){
  if(AUTH_MODE==='access')return {};
  if(!sb)throw new Error('Supabase belum siap');
  const {data:{session}}=await sb.auth.getSession();
  if(!session)throw new Error('sesi login habis — keluar lalu masuk lagi');
  return {Authorization:'Bearer '+session.access_token};
}
async function apiFetch(path,opt){
  if(!API)throw new Error('API_URL belum diisi di config.js');
  const res=await fetch(API+path,{credentials:'include',...(opt||{}),headers:{'Content-Type':'application/json',...(await authHeaders()),...((opt||{}).headers||{})}});
  let j=null;try{j=await res.json()}catch(e){}
  if(!res.ok)throw new Error((j&&j.error)||('API '+res.status));
  return j||{};
}
const DATA={
  async listPo(){ if(BACKEND==='d1'){const j=await apiFetch('/po?limit=5000');return {data:j.data||[],error:null}}
    return await sb.from('po').select('*').order('created',{ascending:false}).limit(5000); },
  async savePo(id,d){ if(BACKEND==='d1'){await apiFetch('/po',{method:'POST',body:JSON.stringify({row:toRow(id,d)})});return}
    const {error}=await sb.from('po').upsert(toRow(id,d));if(error)throw error; },
  async deletePo(id){ if(BACKEND==='d1'){await apiFetch('/po/delete',{method:'POST',body:JSON.stringify({id})});return}
    const {error}=await sb.from('po').delete().eq('id',id);if(error)throw error; },
  async getSettings(){ if(BACKEND==='d1'){const j=await apiFetch('/settings');return {data:j.data}}
    return await sb.from('settings').select('*').eq('id',1).maybeSingle(); },
  async saveSettings(row){ if(BACKEND==='d1'){await apiFetch('/settings',{method:'POST',body:JSON.stringify({row})});return {error:null}}
    return await sb.from('settings').upsert({id:1,...row}); },
  async listProfiles(){ if(BACKEND==='d1'){const j=await apiFetch('/profiles');return {data:j.data||[]}}
    return await sb.from('profiles').select('id,email,display_name,role,app_version,last_seen'); },
  async updateProfile(row){ if(BACKEND==='d1'){await apiFetch('/profile',{method:'POST',body:JSON.stringify({row})});return {error:null}}
    return await sb.from('profiles').update(row).eq('id',uid); },
  async insertLog(row){ if(BACKEND==='d1'){await apiFetch('/log',{method:'POST',body:JSON.stringify({row})});return}
    await sb.from('app_log').insert(row); },
  async listLog(kind){ if(BACKEND==='d1'){const j=await apiFetch('/log'+(kind?'?kind='+encodeURIComponent(kind):''));return {data:j.data||[]}}
    let q=sb.from('app_log').select('*').order('at',{ascending:false}).limit(200);if(kind)q=q.eq('kind',kind);return await q; },
  async cleanLog(){ if(BACKEND==='d1'){await apiFetch('/log/clean',{method:'POST',body:'{}'});return {error:null}}
    return await sb.from('app_log').delete().lt('at',new Date(Date.now()-30*864e5).toISOString()); },
};
async function sbSave(id,d){await DATA.savePo(id,d)}
async function sbDelete(id){await DATA.deletePo(id)}
let muatGagal=0;
async function loadPos(percobaan){
  const n=percobaan||0;
  let res;
  try{res=await DATA.listPo()}
  catch(e){res={error:{message:e.message||'Failed to fetch'}}}
  const {data,error}=res;
  if(error){
    const jaringan=/Failed to fetch|NetworkError|Load failed|network/i.test(error.message||'');
    if(jaringan&&n<3){$('#who').textContent='Koneksi terputus — mencoba lagi ('+(n+1)+'/3)…';
      setTimeout(()=>loadPos(n+1),1200*(n+1));return}
    muatGagal++;
    if(muatGagal<=2)logFail('muat',error.message);   // jangan banjiri log
    toast(jaringan?'Koneksi internet terputus — data belum termuat, coba muat ulang halaman':('Gagal memuat PO: '+error.message));
    $('#who').textContent=jaringan?'⚠ Koneksi terputus':'⚠ Gagal memuat data';
    return;
  }
  muatGagal=0;if(uid&&names[uid])$('#who').textContent='👤 '+names[uid]+(isAdmin?' · Admin':'');
  POS=data.map(fromRow);render();
}
window.addEventListener('online',()=>{toast('Koneksi kembali — memuat ulang data');loadPos()});
async function loadSettings(){let data=null;try{data=(await DATA.getSettings()).data}catch(e){console.warn(e)}if(data){SET={target_gr_h:data.target_gr_h,target_inv_h:data.target_inv_h,toleransi:Number(data.toleransi),label_total:data.label_total||'',ai_auto:data.ai_auto!==false};$('#sLabel').value=SET.label_total;$('#sAiAuto').checked=SET.ai_auto}$('#sGr').value=SET.target_gr_h;$('#sInv').value=SET.target_inv_h;$('#sTol').value=SET.toleransi;render()}
async function loadProfiles(){let data=null;try{data=(await DATA.listProfiles()).data}catch(e){console.warn(e)}(data||[]).forEach(p=>{names[p.id]=p.display_name||(p.email||'').split('@')[0]||'Petugas';if(p.id===uid)isAdmin=p.role==='admin'})}
const urlCache={};const urlAntri=new Set();let urlTimer=null;
function burl(id){if(!id)return '';
  // R2 + Access: URL langsung — cookie Access yang menjaganya, tanpa tanda tangan.
  // R2 + login Supabase: tautan harus ditandatangani dulu (lewat flushUrls),
  // karena <img src> tidak bisa mengirim header token.
  if(STORE==='r2'&&AUTH_MODE==='access')return API+'/file/'+id.split('/').map(encodeURIComponent).join('/');
  if(id in urlCache)return urlCache[id];
  urlAntri.add(id);if(!urlTimer)urlTimer=setTimeout(flushUrls,80);return ''}
async function flushUrls(){
  urlTimer=null;const paths=[...urlAntri];urlAntri.clear();if(!paths.length)return;
  for(let i=0;i<paths.length;i+=80){
    const batch=paths.slice(i,i+80);
    try{
      if(STORE==='r2'){
        const j=await apiFetch('/file/urls',{method:'POST',body:JSON.stringify({paths:batch})});
        const m=j.data||{};batch.forEach(p=>urlCache[p]=m[p]||'');
      }else{
        const {data}=await sb.storage.from(BUCKET).createSignedUrls(batch,3600);
        (data||[]).forEach(d=>{if(d&&d.path)urlCache[d.path]=d.signedUrl||''});
        batch.forEach(p=>{if(!(p in urlCache))urlCache[p]=''});
      }
    }catch(e){batch.forEach(p=>urlCache[p]='')}
  }
  render();if($('#mbg').classList.contains('open')&&editing)refreshModalThumbs();
}
function refreshModalThumbs(){document.querySelectorAll('[data-burl]').forEach(el=>{const u=burl(el.dataset.burl);if(u){if(el.tagName==='IMG')el.src=u;else el.href=u}})}
const MAXB=20*1024*1024;
const uaShort=()=>{const u=navigator.userAgent;const dev=/iPhone|iPad/.test(u)?'iOS':/Android/.test(u)?'Android':/Mac/.test(u)?'Mac':/Windows/.test(u)?'Win':'?';const br=(u.match(/(Chrome|CriOS|Firefox|Edg|Safari)\/[\d.]+/)||['?'])[0];return dev+' '+br};
async function logFail(kind,message,extra){try{if(!uid)return;await DATA.insertLog({user_id:uid,email:(names[uid]||''),kind,message:String(message||'').slice(0,400),app_version:APP_VERSION,ua:uaShort(),...(extra||{})})}catch(e){}}
function uploadErrMsg(error){const m=((error&&error.message)||'')+' '+((error&&(error.statusCode||error.status))||'');
  if(/exceeded the maximum allowed size|Payload too large|413/i.test(m))return 'file melebihi batas 20 MB di server';
  if(/row-level security|Unauthorized|not authorized|403/i.test(m))return 'tidak punya izin upload (policy storage) — jalankan ulang schema.sql';
  if(/jwt|expired|invalid token|401/i.test(m))return 'sesi login habis — keluar lalu masuk lagi';
  if(/quota|storage limit|insufficient|over.?limit/i.test(m))return 'kuota penyimpanan Supabase penuh';
  if(/Bucket not found|404/i.test(m))return "bucket 'dokumen' tidak ditemukan di Supabase";
  if(/Failed to fetch|NetworkError|network/i.test(m))return 'koneksi internet terputus saat upload';
  return (error&&error.message)||'gagal upload';}
async function uploadDoc(blob,kind,ext){
  if(!blob)throw new Error('file kosong');
  if(blob.size>MAXB)throw new Error('ukuran '+(blob.size/1048576).toFixed(1)+' MB melebihi batas 20 MB');
  if(AUTH_MODE!=='access'){
    let sess=null;try{sess=(await sb.auth.getSession()).data.session}catch(e){}
    if(!sess)throw new Error('sesi login habis — keluar lalu masuk lagi');
  }
  const base=`${jktDate()}/${(editing&&editing.id)||'new'}_${kind}_${Date.now()}`;
  let last=null;
  for(let att=0;att<2;att++){
    const path=base+(att?'_r'+att:'')+'.'+ext;
    const type=blob.type||(ext==='pdf'?'application/pdf':'image/jpeg');
    let error=null;
    if(STORE==='r2'){
      try{
        const res=await fetch(API+'/file?path='+encodeURIComponent(path),{method:'POST',credentials:'include',headers:{'X-File-Type':type,...(await authHeaders())},body:blob});
        if(!res.ok){const j=await res.json().catch(()=>null);error={message:(j&&j.error)||('R2 '+res.status),statusCode:res.status}}
      }catch(e){error={message:e.message||'gagal upload'}}
    }else{
      error=(await sb.storage.from(BUCKET).upload(path,blob,{contentType:type,upsert:false})).error;
    }
    if(!error)return path;
    last=error;const msg=uploadErrMsg(error);
    if(!/koneksi internet terputus|gagal upload/.test(msg))throw new Error(msg);
    await new Promise(r=>setTimeout(r,900));
  }
  throw new Error(uploadErrMsg(last));}
/* ---- Gemini ---- */
const blobToB64=b=>new Promise((res,rej)=>{const fr=new FileReader();fr.onload=()=>res(String(fr.result).split(',')[1]);fr.onerror=rej;fr.readAsDataURL(b)});
async function geminiJson(prompt,blobs){
  const images=await Promise.all(blobs.map(async b=>({mime:b.type||'image/jpeg',data:await blobToB64(b)})));
  const mode=CFG.GEMINI_MODE||'edge';
  /* Batas waktu. Tanpa ini petugas bisa menunggu 2-3 menit sebelum error:
     Supabase Edge Function baru dihentikan sendiri di sekitar 150 detik
     (WORKER_RESOURCE_LIMIT / status 546). Lebih baik berhenti lebih awal
     dan langsung menyarankan tombol "Baca tanpa AI". */
  const BATAS=(Number(CFG.AI_TIMEOUT_S)||45)*1000;
  const ac=new AbortController();
  const jam=setTimeout(()=>ac.abort(),BATAS);
  const habis=()=>{const e=new Error('AI tidak menjawab dalam '+Math.round(BATAS/1000)+' detik');e.code='TIMEOUT';return e};
  if(mode==='worker'){
    if(!CFG.GEMINI_URL)throw new Error('GEMINI_URL belum diisi di config.js');
    let res;
    try{res=await fetch(CFG.GEMINI_URL,{method:'POST',credentials:'include',signal:ac.signal,headers:{'Content-Type':'application/json',...(await authHeaders())},body:JSON.stringify({prompt,images,model:CFG.GEMINI_MODEL})})}
    catch(e){throw (e.name==='AbortError')?habis():e}
    finally{clearTimeout(jam)}
    const out=await res.json().catch(()=>null);
    if(!res.ok)throw new Error('worker '+res.status+': '+((out&&out.error)||'').slice(0,200));
    return out;
  }
  if(mode==='edge'){
    const {data:{session}}=await sb.auth.getSession();
    let res;
    try{res=await fetch(`${CFG.SUPABASE_URL}/functions/v1/gemini-total`,{method:'POST',signal:ac.signal,headers:{'Content-Type':'application/json','Authorization':'Bearer '+(session?session.access_token:CFG.SUPABASE_ANON_KEY),'apikey':CFG.SUPABASE_ANON_KEY},body:JSON.stringify({prompt,images,model:CFG.GEMINI_MODEL})})}
    catch(e){throw (e.name==='AbortError')?habis():e}
    finally{clearTimeout(jam)}
    if(!res.ok)throw new Error('edge function '+res.status+': '+(await res.text()).slice(0,200));return await res.json();
  }
  if(!CFG.GEMINI_API_KEY)throw new Error('GEMINI_API_KEY belum diisi di config.js');
  const model=CFG.GEMINI_MODEL||'gemini-2.5-flash';
  const body={contents:[{role:'user',parts:[{text:prompt},...images.map(i=>({inline_data:{mime_type:i.mime,data:i.data}}))]}],generationConfig:{response_mime_type:'application/json',temperature:0}};
  let res;
  try{res=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(CFG.GEMINI_API_KEY)}`,{method:'POST',signal:ac.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})}
  catch(e){throw (e.name==='AbortError')?habis():e}
  finally{clearTimeout(jam)}
  if(!res.ok)throw new Error('Gemini '+res.status+': '+(await res.text()).slice(0,200));
  const j=await res.json();const txt=(((j.candidates||[])[0]||{}).content||{}).parts?.map(p=>p.text).join('')||'';
  try{return JSON.parse(txt)}catch(e){const m=txt.match(/\{[\s\S]*\}/);return m?JSON.parse(m[0]):null}
}
sample=((CFG.GEMINI_MODE||'edge')==='off')?null:{json:geminiJson};
let aiOff=false;   // true bila kuota Gemini habis → berhenti memanggil AI sampai halaman dimuat ulang
let uid=null,canWrite=true,isAdmin=false;
let POS=[],SET={target_gr_h:24,target_inv_h:48,toleransi:0,label_total:'',ai_auto:true};
const names={};
async function resolveNames(ids){const need=[...new Set(ids.filter(i=>i&&!(i in names)))];if(!need.length)return;await loadProfiles();need.forEach(i=>{if(!(i in names))names[i]=''})}
const nm=id=>id?(names[id]||'Petugas'):'-';

/* ---------- nav ---------- */
guard('nav',()=>{document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>show(b.dataset.v));});
function show(v){document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b.dataset.v===v));document.querySelectorAll('.view').forEach(s=>s.classList.toggle('active',s.id==='v-'+v));ls.view=v;saveLs();render()}
guard('regions',()=>{['#dRegion','#oRegion','#pRegion','#mRegion'].forEach(s=>{const el=$(s);REGIONS.forEach(r=>{const o=document.createElement('option');o.value=r;o.textContent=r;el.appendChild(o)})});});
guard('filters',()=>{['#dPeriode','#dRegion','#oRegion','#oSort','#pRegion','#pStatus','#pDari','#pSampai'].forEach(s=>$(s).addEventListener('change',()=>{poShown=150;render()}));$('#pCari').addEventListener('input',()=>{poShown=150;render()});});

/* ---------- boot: auth + data ---------- */
let rtChannel=null;
async function afterLogin(U){
  uid=U.id;$('#loginBg').classList.remove('open');$('#btnLogout').style.display='';
  await loadProfiles();
  if(!names[uid]){try{if(BACKEND==='supabase')await sb.from('profiles').upsert({id:uid,email:U.email});else await DATA.updateProfile({display_name:(U.email||'').split('@')[0]})}catch(e){console.warn(e)};await loadProfiles()}
  $('#who').textContent='👤 '+(names[uid]||U.email)+(isAdmin?' · Admin':'');$('#myName').value=names[uid]||'';$('#myRole').textContent=isAdmin?'Peran: admin (bisa ubah setting & hapus PO)':'Peran: staf';
  try{await DATA.updateProfile({last_seen:new Date().toISOString(),app_version:APP_VERSION,ua:uaShort()})}catch(e){console.warn(e)}
  if(isAdmin){$('#cardLog').style.display='';$('#cardUsers').style.display='';loadUsers()}
  await loadSettings();await loadPos();
  if(BACKEND==='supabase'){
    if(rtChannel)sb.removeChannel(rtChannel);
    rtChannel=sb.channel('po-live').on('postgres_changes',{event:'*',schema:'public',table:'po'},()=>{clearTimeout(window._rt);window._rt=setTimeout(loadPos,400)}).on('postgres_changes',{event:'*',schema:'public',table:'settings'},loadSettings).subscribe();
  }else{
    if(window._poll)clearInterval(window._poll);
    window._poll=setInterval(()=>{if(!document.hidden&&!$('#mbg').classList.contains('open'))loadPos()},30000);
    window.addEventListener('focus',()=>{if(!$('#mbg').classList.contains('open'))loadPos()});
  }
}
function showLogin(msg){$('#loginBg').classList.add('open');$('#btnLogout').style.display='none';$('#who').textContent='Belum login';if(msg)$('#loginMsg').textContent=msg}
(async()=>{
  if(AUTH_MODE==='access'){
    // Cloudflare Access sudah memeriksa identitas sebelum halaman terbuka.
    $('#loginBg').classList.remove('open');
    $('#btnLogout').onclick=()=>{location.href='/cdn-cgi/access/logout'};
    try{
      const me=(await apiFetch('/me')).data;
      if(me&&me.role)isAdmin=me.role==='admin';
      await afterLogin({id:me.id,email:me.email});
    }catch(e){
      $('#who').textContent='Gagal membaca identitas';
      toast('Gagal memuat: '+(e.message||e));
    }
    $('#btnSaveName').onclick=async()=>{const n=$('#myName').value.trim();if(!n)return;try{const r=await DATA.updateProfile({display_name:n});if(r&&r.error)throw r.error}catch(e){return toast('Gagal: '+(e.message||e))}names[uid]=n;$('#who').textContent='👤 '+n+(isAdmin?' · Admin':'');toast('Nama tersimpan');render()};
    $('#mTunggu').addEventListener('change',()=>{if($('#mTunggu').checked&&!$('#mTerima').value)$('#mTerima').value=jktDate()});
    return;
  }
  await initSb();
  if(!sb){showLogin('Supabase tidak termuat — periksa config.js atau koneksi.');return}
  $('#loginForm').addEventListener('submit',async e=>{e.preventDefault();$('#btnLogin').disabled=true;$('#loginMsg').textContent='Memeriksa…';const {error}=await sb.auth.signInWithPassword({email:$('#lEmail').value.trim(),password:$('#lPass').value});$('#btnLogin').disabled=false;$('#loginMsg').textContent=error?('Gagal: '+error.message):''});
  if(CFG.ALLOW_SIGNUP){const b=document.createElement('button');b.type='button';b.className='btn';b.textContent='Daftar akun baru';b.onclick=async()=>{const {error}=await sb.auth.signUp({email:$('#lEmail').value.trim(),password:$('#lPass').value});$('#loginMsg').textContent=error?('Gagal: '+error.message):'Akun dibuat — cek email untuk konfirmasi (jika diaktifkan), lalu masuk.'};$('#loginForm').appendChild(b)}
  $('#btnLogout').onclick=async()=>{await sb.auth.signOut();location.reload()};
  const U=s=>({id:s.user.id,email:s.user.email});
  sb.auth.onAuthStateChange((ev,session)=>{if(session&&ev!=='TOKEN_REFRESHED'&&ev!=='USER_UPDATED'){afterLogin(U(session)).catch(e=>toast('Gagal memuat: '+e.message))}else if(!session)showLogin()});
  const {data:{session}}=await sb.auth.getSession();if(session)afterLogin(U(session)).catch(e=>toast('Gagal memuat: '+e.message));else showLogin();
  $('#btnSaveName').onclick=async()=>{const n=$('#myName').value.trim();if(!n)return;try{const r=await DATA.updateProfile({display_name:n});if(r&&r.error)throw r.error}catch(e){return toast('Gagal: '+(e.message||e))}names[uid]=n;$('#who').textContent='👤 '+n+(isAdmin?' · Admin':'');toast('Nama tersimpan');render()};
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
let poShown=150;
function renderPo(){
  const all=filteredPo();const list=all.slice(0,poShown);
  $('#pInfo').innerHTML=list.length+' dari '+all.length+' PO ditampilkan (total '+POS.length+' baris)'+
    (all.length>list.length?' · <button class="btn sm" id="btnMore">Tampilkan 150 berikutnya</button>':'');
  const cell=(no,at,by,legacy,noLbl,extra)=>no?`<span class="mono">${esc(no)}</span>${(extra||[]).map(x=>'<br><span class="mono">'+esc(x)+'</span>').join('')}${(extra||[]).length?'<div class="sub">'+((extra.length+1))+' dokumen</div>':''}<div class="sub">${at?'⏱ '+jkt(at)+' · '+esc(nm(by)):(legacy?'import, tanpa jam':'')}</div>`:'<span class="b '+(noLbl?'blue':'mut')+'">'+(noLbl||'—')+'</span>';
  const extras=(p,f)=>((p[f]||[]).slice(1));
  $('#tPo').innerHTML='<tr><th>Tgl</th><th>Region</th><th>Supplier</th><th>No PO</th><th>No GR</th><th>PO→GR</th><th>No Invoice</th><th>GR→Inv</th><th>Nominal</th><th>Dokumen &amp; cek total</th><th>Ket</th><th></th></tr>'+
  (list.length?list.map(p=>`<tr><td>${fmtTgl(p.tgl)}</td><td><span class="b mut">${p.region}</span></td><td>${esc(p.supplier)}</td><td>${cell(p.po_no,p.po_at,p.po_by,p.legacy,p.po_no?'':'PO belum dibuat',extras(p,'po_nos'))}${p.po_date?'<div class="sub">tgl dok. '+fmtTgl(p.po_date)+'</div>':''}</td><td>${cell(p.gr_no,p.gr_at,p.gr_by,p.legacy,'',extras(p,'gr_nos'))}${p.gr_date?'<div class="sub">tgl dok. '+fmtTgl(p.gr_date)+'</div>':''}</td><td>${fmtH(hours(p.po_at,p.gr_at))}</td><td>${cell(p.inv_no,p.inv_at,p.inv_by,p.legacy)}${p.inv_date?'<div class="sub">tgl dok. '+fmtTgl(p.inv_date)+'</div>':''}${p.inv_dist?'<div class="sub">Dist: '+esc(p.inv_dist)+'</div>':''}</td><td>${fmtH(hours(invStart(p),p.inv_at))}${p.inv_terima_at&&p.inv_at?'<div class="sub">sejak inv. distributor '+fmtTgl(p.inv_terima_at.slice(0,10))+'</div>':''}</td><td>${fmtRp(p.nominal)}</td><td>${cekBadge(p)}</td><td class="sub">${isTunggu(p)?'<span class="b blue">📦 menunggu inv. distributor</span><br>':''}${esc(p.keterangan||'')}${p.gr_return?'<br>Ret: '+esc(p.gr_return):''}</td><td style="white-space:nowrap">${status(p)==='nogr'?`<button class="btn sm p" data-edit="${p.id}" data-focus="mGr">Isi GR</button>`:status(p)==='noinv'?`<button class="btn sm p" data-edit="${p.id}" data-focus="mInv">Isi Inv</button>`:''} <button class="btn sm" data-edit="${p.id}">Edit</button></td></tr>`).join(''):'<tr><td colspan="12" class="empty">Belum ada data. Klik <b>+ PO Baru</b> atau import dari Excel.</td></tr>');
  const bm=$('#btnMore');if(bm)bm.onclick=()=>{poShown+=150;renderPo()};
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
  $('#mHapus').style.display=p?'':'none';$('#mHapus').dataset.c='';$('#mHapus').textContent='Hapus PO ini';
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
  const upErrs=[];
  for(const S of SLOTS){for(const e of docs[S.k]){if(e.saved||!e.file)continue;
    const hasPage=e.pages&&e.pages.length;
    const asOrig=e.isPdf?e.file.size<=MAXB:!hasPage;
    const blob=asOrig?e.file:e.pages[0];
    const ext=asOrig?((e.name.split('.').pop()||'').toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,5)||(e.isPdf?'pdf':'bin')):'jpg';
    try{e.asset=await uploadDoc(blob,S.k,ext);e.pdf=e.isPdf;e.saved=true;e.at=now;e.by=uid;anyChanged=true;e.upErr=null}
    catch(err){uploadErr=true;e.upErr=err.message||'gagal';upErrs.push(e.name+': '+e.upErr);console.warn('upload',e.name,err);
      logFail('upload',e.upErr,{po_id:(editing&&editing.id)||po||null,file_name:(e.name||'').slice(0,120),file_size:e.file?e.file.size:null})}}}
  if(uploadErr){SLOTS.forEach(S=>renderDrop(S));toast('Lampiran gagal diupload → '+upErrs[0]);}
  let r=null;const anyDoc=SLOTS.some(S=>docs[S.k].length);
  const any=anyDoc||TOT_SLOTS.some(S=>t[S.k]!=null)||note;
  if(any){const e=evalCek(t);const cek={note,status:e.status,selisih:e.selisih,detail:e.detail||'',missing:e.missing};
    SLOTS.forEach(S=>{const list=docs[S.k].filter(x=>x.asset);
      cek[S.k+'_docs']=list.map(x=>({name:x.name||null,no:x.no||null,total:x.total!=null?x.total:null,src:x.src||null,label:x.aiLabel||null,asset:x.asset,pdf:!!x.pdf,at:x.at||old[S.k+'_at']||now,by:x.by||old[S.k+'_by']||uid,npages:x.npages||1}));
      const tv=S.tot?t[S.k]:null;const first=list[0]||null;
      if(tv!==(old['total_'+S.k]??null))anyChanged=true;
      cek['total_'+S.k]=tv;cek[S.k+'_asset']=first?first.asset:null;cek[S.k+'_pdf']=first?!!first.pdf:false;
      cek[S.k+'_at']=first?first.at:(tv!=null?(old[S.k+'_at']||now):null);cek[S.k+'_by']=first?first.by:(tv!=null?(old[S.k+'_by']||uid):null)});
    cek.at=(anyChanged||!old.at)?now:old.at;cek.by=(anyChanged||!old.by)?uid:old.by;d.cek=cek;r=e.status;if(d.nominal==null&&t.esb!=null)d.nominal=t.esb;
  }else d.cek=null;
  try{await sbSave(newId,d);if(oldId&&oldId!==newId)await sbDelete(oldId);$('#mbg').classList.remove('open');toast('Tersimpan ✓ '+jktTime(now)+(r?' · '+r:'')+(uploadErr?' · ⚠ '+upErrs.length+' lampiran GAGAL diupload, buka lagi barisnya untuk ulangi':''));loadPos()}catch(e){toast('Gagal simpan: '+(e.message||e.code));logFail('simpan',e.message||e.code,{po_id:newId})}
  $('#mSimpan').disabled=false;
};
$('#mHapus').onclick=async()=>{if(!editing)return;
  if($('#mHapus').dataset.c!=='1'){$('#mHapus').dataset.c='1';$('#mHapus').textContent='⚠ Klik lagi: hapus '+(editing.po_no||'baris ini')+' permanen';setTimeout(()=>{if($('#mHapus').dataset.c==='1'){$('#mHapus').dataset.c='';$('#mHapus').textContent='Hapus PO ini'}},6000);return}
  try{const no=editing.po_no||editing.id;await sbDelete(editing.id);$('#mbg').classList.remove('open');toast('Dihapus: '+no);loadPos()}catch(e){toast('Gagal menghapus: '+(e.message||e.code))}$('#mHapus').dataset.c='';$('#mHapus').textContent='Hapus'};

/* ---------- Export CSV / Excel ---------- */
function exportRows(){
  const list=filteredPo();
  const nums=(p,f,single)=>{const arr=(p[f]&&p[f].length)?p[f]:(p[single]?[p[single]]:[]);return arr.filter(Boolean)};
  const maxPo=Math.max(2,...list.map(p=>nums(p,'po_nos','po_no').length),2);
  const maxGr=Math.max(2,...list.map(p=>nums(p,'gr_nos','gr_no').length),2);
  const H=['Tanggal','Region','Supplier'];
  for(let i=0;i<maxPo;i++)H.push('No PO '+(i+1));
  H.push('Jam PO','Petugas PO');
  for(let i=0;i<maxGr;i++)H.push('No GR '+(i+1));
  H.push('Jam GR','Petugas GR','PO->GR (jam)','No Invoice','Jam Invoice','Petugas Invoice','GR->Inv (jam)','Nominal','No Inv Distributor','GR Return','Tgl dok PO','Tgl dok GR','Tgl dok Invoice','Keterangan','Barang diterima gudang','Invoice distributor diterima','Status tunggu','Total PO (dok)','Total Fisik','Total ESB','Status Cek','Selisih','Detail selisih');
  const n=v=>(v==null||v==='')?'':Number(v);
  const rows=list.map(p=>{const c=cekOf(p);const po=nums(p,'po_nos','po_no'),gr=nums(p,'gr_nos','gr_no');
    const r=[p.tgl||'',p.region||'',p.supplier||''];
    for(let i=0;i<maxPo;i++)r.push(po[i]||'');
    r.push(jkt(p.po_at),p.po_by?nm(p.po_by):'');
    for(let i=0;i<maxGr;i++)r.push(gr[i]||'');
    r.push(jkt(p.gr_at),p.gr_by?nm(p.gr_by):'',n(hours(p.po_at,p.gr_at)?.toFixed(2)),p.inv_no||'',jkt(p.inv_at),p.inv_by?nm(p.inv_by):'',n(hours(invStart(p),p.inv_at)?.toFixed(2)),n(p.nominal),p.inv_dist||'',p.gr_return||'',p.po_date||'',p.gr_date||'',p.inv_date||'',p.keterangan||'',p.barang_terima||'',p.inv_terima_at?p.inv_terima_at.slice(0,10):'',isTunggu(p)?'MENUNGGU INVOICE DISTRIBUTOR':'',n(c&&c.total_po),n(c&&c.total_fisik),n(c&&c.total_esb),c?c.status:'',n(c&&c.selisih),c?c.detail||'':'');
    return r});
  return {H,rows,list};
}
$('#btnCsv').onclick=async()=>{
  const fmt=$('#expFmt')?$('#expFmt').value:'csv';
  const {H,rows,list}=exportRows();
  if(!list.length)return toast('Tidak ada data untuk diexport');
  const fn='PO_Tracking_'+jktDate();
  if(fmt==='xlsx'){
    try{
      await loadXlsx();
      const ws=XLSX.utils.aoa_to_sheet([H,...rows]);
      ws['!cols']=H.map(h=>({wch:/Supplier|Keterangan|Detail/.test(h)?28:/No PO|No GR|No Invoice|Jam|Petugas/.test(h)?18:14}));
      ws['!freeze']={xSplit:0,ySplit:1};
      const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'PO Tracking');
      XLSX.writeFile(wb,fn+'.xlsx');toast('Excel diunduh ('+rows.length+' baris)');return;
    }catch(e){toast('Gagal membuat Excel ('+e.message+') — diunduh sebagai CSV')}
  }
  const q=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
  const csv='﻿'+[H,...rows].map(r=>r.map(q).join(';')).join('\n');
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download=fn+'.csv';document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1000);
  toast('CSV diunduh ('+rows.length+' baris)');
};

const SLOTS=[{k:'po',drop:'dropP',file:'fileP',tot:'totP',ai:'aiP',num:'mPo',multi:true,label:'Dokumen PO',icon:'🧾',desc:'dokumen Purchase Order (PO) dari sistem ESB',hint:'PDF PO dari ESB · bisa lebih dari 1 (barang susulan)'},
 {k:'gr',drop:'dropG',file:'fileG',tot:null,ai:'aiG',num:'mGr',multi:true,label:'Dokumen GR',icon:'📦',desc:'dokumen Goods Receipt dari sistem ESB',hint:'PDF Goods Receipt · bisa lebih dari 1 · arsip saja'},
 {k:'fisik',drop:'dropF',file:'fileF',tot:'totF',ai:'aiF',num:null,multi:true,ai_auto:true,label:'Invoice / Surat Jalan FISIK',icon:'📄',desc:'nota / kwitansi / faktur / struk dari distributor',hint:'foto, scan atau PDF · total dibaca otomatis'},
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

document.addEventListener('click',e=>{const p=e.target.closest('[data-pick]');
  if(p){e.stopPropagation();const [k,i,ci]=p.dataset.pick.split(':');const S=slotOf(k),ent=docs[k][+i];const c=ent.cands[+ci];
    ent.total=c.v;ent.src='teks';ent.manual=true;ent.aiLabel=c.label;renderDrop(S);recalcSlot(S,true);toast('Total diambil dari: '+c.label);return}
  const b=e.target.closest('[data-del]');if(!b)return;e.stopPropagation();const [k,i]=b.dataset.del.split(':');docs[k].splice(+i,1);const S=slotOf(k);renderDrop(S);recalcSlot(S,true)});

const LIB=(CFG.LIB_BASE||'https://cdnjs.cloudflare.com/ajax/libs/');
function loadScript(src){return new Promise((res,rej)=>{const s=document.createElement('script');s.src=src;s.onload=res;s.onerror=()=>rej(new Error('gagal memuat '+src));document.head.appendChild(s)})}
let pdfSiap=null;
async function ensurePdfJs(){
  if(window.pdfjsLib)return true;
  if(pdfSiap)return pdfSiap;
  pdfSiap=(async()=>{try{
    await loadScript(LIB+'pdf.js/2.16.105/pdf.min.js');
    try{pdfjsLib.GlobalWorkerOptions.workerSrc=LIB+'pdf.js/2.16.105/pdf.worker.min.js'}catch(e){}
    return true;
  }catch(e){console.warn(e);return false}})();
  return pdfSiap;
}
async function loadXlsx(){if(window.XLSX)return;await loadScript(LIB+'xlsx/0.18.5/xlsx.full.min.js')}
const MAX_PAGES=8;
async function takeFiles(fileList,S){
  const d=$('#'+S.drop);const files=[...fileList];
  d.innerHTML='⏳ memproses '+files.length+' file…';
  if(!S.multi)docs[S.k]=[];
  for(const file of files){
    if(file.size>MAXB){toast(file.name+' terlalu besar ('+(file.size/1048576).toFixed(1)+' MB) — maksimal 20 MB');continue}
    let r={pages:[],total:1,why:'tidak terbaca'};
    try{r=await toImages(file)}catch(e){r={pages:[],total:1,why:e.message||'tidak terbaca'}}
    const entry={saved:false,name:file.name,file,pages:r.pages,noPreview:!r.pages.length,why:r.why||'',isPdf:file.type==='application/pdf'||/\.pdf$/i.test(file.name),size:file.size,npages:r.total,no:null,total:null,parsed:null};
    if(entry.isPdf&&(window.pdfjsLib||await ensurePdfJs())){try{const txt=await pdfText(file);entry.parsed=parseEsb(txt);entry.txt=txt;entry.cands=allCandidates(txt).slice(0,6);entry.txtOk=!!(entry.parsed&&entry.parsed.total!=null)}catch(err){console.warn('parse',err);logFail('muat','gagal baca teks PDF: '+(err.message||''),{file_name:(file.name||'').slice(0,120)})}}
    docs[S.k].push(entry);
  }
  renderDrop(S);recalcSlot(S);
  if(S.tot&&SET.ai_auto!==false&&sample&&!aiOff){
    const need=docs[S.k].filter(e=>!e.saved&&e.pages&&e.pages.length&&e.total==null&&!e.aiTried&&!e.txtOk);
    for(const e of need){if(!S.ai_auto&&e.parsed&&e.parsed.type)continue;e.aiTried=true;await aiRead(S,e)}}
  else if(S.tot){const sisa=docs[S.k].filter(e=>!e.saved&&e.total==null);
    if(sisa.length)$('#'+S.ai).innerHTML='<span class="sub">Total belum terbaca dari teks — klik <b>Baca dengan AI</b> atau pilih/ketik angkanya.</span>'}
}
function renderDrop(S){
  const d=$('#'+S.drop),list=docs[S.k];
  if(!list.length){d.className='drop';d.innerHTML=S.icon+' <b>'+S.label+'</b><br><span class="sub">'+S.hint+'</span>';return}
  d.className='drop has';
  const rows=list.map((e,i)=>{
    const u=e.saved?(e.pdf?null:burl(e.asset)):(e.pages?URL.createObjectURL(e.pages[0]):null);
    const thumbHtml=(e.saved&&e.pdf)||(!e.saved&&e.isPdf)?'<span class="filepdf">PDF</span>':(u?`<img class="thumb" ${e.saved?'data-burl="'+e.asset+'"':''} src="${u}">`:'<span class="filepdf">FILE</span>');
    const meta=e.reading?'<span class="sub">⏳ AI membaca total…</span>':[e.no?'<b>'+esc(e.no)+'</b>':'',(!S.tot?'':(e.total!=null?fmtRp(e.total)+(e.src==='AI'?' <span class="sub">(AI'+(e.conf&&e.conf!=='tinggi'?', '+esc(e.conf):'')+')</span>':e.src==='teks'?' <span class="sub">(dari teks'+(e.aiLabel?': '+esc(e.aiLabel):'')+')</span>':''):'<span class="warnx">total belum terbaca</span>')),e.npages>1?e.npages+' hal.':'',e.saved?'tersimpan':''].filter(Boolean).join(' · ');
    const link=e.saved?`<a href="${burl(e.asset)||'#'}" data-burl="${e.asset}" target="_blank" onclick="event.stopPropagation()">buka</a>`:'';
    const chips=(S.tot&&!e.saved&&e.cands&&e.cands.length)?'<div class="chips">Pilih angka dari dokumen: '+e.cands.map((c,ci)=>`<button type="button" class="chip${e.total!=null&&Math.abs(c.v-e.total)<0.5?' on':''}" data-pick="${S.k}:${i}:${ci}" title="${esc(c.label)}">${fmtRp(c.v)}</button>`).join('')+'</div>':'';
    const note=e.upErr?'<div class="warnx">⚠ gagal diupload: '+esc(e.upErr)+'</div>':e.noPreview?'<div class="warnx">tetap akan diupload · pratinjau &amp; baca otomatis tidak tersedia: '+esc(e.why||'')+' — isi total manual</div>':'';
    return `<div class="filerow">${thumbHtml}<div class="fileinfo"><div class="filename">${esc(e.name||('dokumen '+(i+1)))}</div><div class="sub">${meta} ${link}</div>${note}${chips}</div><button type="button" class="xdel" data-del="${S.k}:${i}" title="hapus dokumen">×</button></div>`;
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
      if(S.k==='po'){e.no=r.po_no;if(!e.manual)e.total=r.total;
        if(r.type&&r.type!=='po')warn.push(esc(e.name)+': terbaca sebagai dokumen '+(SLOT_SHORT[r.type]||r.type));
        if(r.supplier)$('#mSup').value=r.supplier;
        if(r.region)$('#mRegion').value=r.region;
        if(r.date&&(!parsedDates.po||r.date<parsedDates.po)){parsedDates.po=r.date;$('#mTglGudang').value=r.date}
      }else if(S.k==='gr'){e.no=r.gr_no;
        if(r.type&&r.type!=='gr')warn.push(esc(e.name)+': terbaca sebagai dokumen '+(SLOT_SHORT[r.type]||r.type));
        if(r.po_no)addNum('#mPo',r.po_no);
        if(!$('#mSup').value.trim()&&r.supplier)$('#mSup').value=r.supplier;
        if(r.date&&(!parsedDates.gr||r.date>parsedDates.gr)){parsedDates.gr=r.date;$('#mTerima').value=r.date}
      }else if(S.k==='esb'){e.no=r.inv_no;if(!e.manual)e.total=r.total;
        if(r.type&&r.type!=='esb')warn.push(esc(e.name)+': terbaca sebagai dokumen '+(SLOT_SHORT[r.type]||r.type));
        if(r.gr_no)addNum('#mGr',r.gr_no);
        if(r.po_no)addNum('#mPo',r.po_no);
        if(!$('#mSup').value.trim()&&r.supplier)$('#mSup').value=r.supplier;
        if(r.inv_dist)$('#mDist').value=r.inv_dist;
        if(r.date)parsedDates.esb=r.date;
      }else if(S.k==='fisik'){if(e.total==null&&r.total!=null){e.total=r.total;e.src='teks';e.aiLabel=r.total_label||''}}
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

const AI_MAX_PAGES=3, AI_MAX_PX=1400, AI_Q=0.82;
async function shrinkForAI(blob){
  try{
    const bmp=await createImageBitmap(blob);
    const sc=Math.min(1,AI_MAX_PX/Math.max(bmp.width,bmp.height));
    if(sc>=1&&blob.size<700*1024)return blob;
    const c=document.createElement('canvas');c.width=Math.round(bmp.width*sc);c.height=Math.round(bmp.height*sc);
    c.getContext('2d').drawImage(bmp,0,0,c.width,c.height);
    const out=await new Promise(r=>c.toBlob(r,'image/jpeg',AI_Q));
    return (out&&out.size<blob.size)?out:blob;
  }catch(e){return blob}
}
async function pagesForAI(pages){
  const take=pages.slice(0,AI_MAX_PAGES);
  const out=[];for(const p of take)out.push(await shrinkForAI(p));
  return out;
}
async function canvasToJpeg(src){const bmp={width:src.naturalWidth||src.width,height:src.naturalHeight||src.height};const max=2000,sc=Math.min(1,max/Math.max(bmp.width,bmp.height));const c=document.createElement('canvas');c.width=Math.round(bmp.width*sc);c.height=Math.round(bmp.height*sc);c.getContext('2d').drawImage(src,0,0,c.width,c.height);return await new Promise(r=>c.toBlob(r,'image/jpeg',0.9))}
async function toImages(file){
  const isPdf=file.type==='application/pdf'||/\.pdf$/i.test(file.name);
  if(isPdf){
    if(!window.pdfjsLib)await ensurePdfJs();
    if(!window.pdfjsLib)return {pages:[],total:1,why:'pustaka pembaca PDF gagal dimuat (jaringan memblokir CDN?)'};
    try{
      const pdf=await pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise;const pages=[];
      for(let i=1;i<=Math.min(pdf.numPages,MAX_PAGES);i++){const page=await pdf.getPage(i);const vp=page.getViewport({scale:2});const c=document.createElement('canvas');c.width=vp.width;c.height=vp.height;await page.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;pages.push(await canvasToJpeg(c))}
      return {pages,total:pdf.numPages};
    }catch(e){return {pages:[],total:1,why:'PDF tidak bisa dibuka ('+(e.message||'')+')'}}
  }
  try{return {pages:[await canvasToJpeg(await createImageBitmap(file))],total:1}}catch(e){}
  try{const url=URL.createObjectURL(file);
    const im=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>rej(new Error('format gambar tidak didukung browser ini'));i.src=url});
    const b=await canvasToJpeg(im);URL.revokeObjectURL(url);return {pages:[b],total:1};
  }catch(e){return {pages:[],total:1,why:(e.message||'gambar tidak terbaca')+' (mis. foto HEIC dari iPhone)'}}
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
  if(r.total==null){const x=extractTotal(t);if(x.total!=null){r.total=x.total;r.total_label=x.label}}
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

/* ====== Pembacaan total TANPA AI: aturan if/else atas teks dokumen ====== */
function parseMoney(str){
  let s=String(str||'').replace(/\s/g,'').replace(/rp\.?/ig,'');
  if(!/\d/.test(s))return null;
  const lastDot=s.lastIndexOf('.'),lastCom=s.lastIndexOf(',');
  let dec=-1;
  if(lastDot>lastCom&&/\.\d{1,2}$/.test(s))dec=lastDot;
  else if(lastCom>lastDot&&/,\d{1,2}$/.test(s))dec=lastCom;
  const intPart=(dec>=0?s.slice(0,dec):s).replace(/[^\d]/g,'');
  const frac=dec>=0?s.slice(dec+1).replace(/[^\d]/g,''):'';
  if(!intPart)return null;
  const n=parseFloat(intPart+(frac?'.'+frac:''));
  return isNaN(n)?null:n;
}
// label yang BUKAN nilai tagihan akhir
const NOT_TOTAL=/sub\s*total|total\s*(?:qty|item|barang|dus|karton|pcs|botol|lembar|kuantitas|diskon|discount|potongan|sum|pajak|ppn)|diskon|discount|potongan|dpp|ppn|pajak|embalase|uang\s*muka|sisa|kembali|kembalian|tunai|qty|kts|jumlah\s*(?:barang|dus|karton|pcs|botol|item)/i;
const TOTAL_RULES=[
  {w:100,re:/total\s*(?:yang\s*)?(?:harus\s*)?di\s*?bayar\s*:?\s*(?:rp\.?)?\s*([\d][\d.,]{3,})/ig},
  {w:100,re:/total\s*tagihan\s*:?\s*(?:rp\.?)?\s*([\d][\d.,]{3,})/ig},
  {w:98 ,re:/jumlah\s*(?:yang\s*)?(?:harus\s*)?di\s*?bayar\s*:?\s*(?:rp\.?)?\s*([\d][\d.,]{3,})/ig},
  {w:95 ,re:/grand\s*total\s*:?\s*(?:rp\.?)?\s*([\d][\d.,]{3,})/ig},
  {w:95 ,re:/invoice\s*total\s*:?\s*(?:rp\.?)?\s*([\d][\d.,]{3,})/ig},
  {w:90 ,re:/total\s*(?:invoice|faktur|nota|akhir|keseluruhan|net)\s*:?\s*(?:rp\.?)?\s*([\d][\d.,]{3,})/ig},
  {w:60 ,re:/(?:^|[^a-z])total\s*:?\s*(?:rp\.?)?\s*([\d][\d.,]{3,})/ig},
  {w:45 ,re:/(?:^|[^a-z])jumlah\s*:?\s*(?:rp\.?)?\s*([\d][\d.,]{3,})/ig},
  {w:35 ,re:/nilai\s*(?:invoice|faktur|tagihan)?\s*:?\s*(?:rp\.?)?\s*([\d][\d.,]{3,})/ig},
];
function customRules(){
  const raw=(SET.label_total||'').split(/[,;\n]+/).map(x=>x.trim()).filter(Boolean);
  return raw.map(lbl=>({w:90,re:new RegExp(lbl.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/\s+/g,'\\s*')+'\\s*:?\\s*(?:rp\\.?)?\\s*([\\d][\\d.,]{3,})','ig')}));
}
function allCandidates(text){
  if(!text)return [];
  const t=String(text).replace(/\u00a0/g,' ').replace(/\s+/g,' ');
  const out=[];
  [...TOTAL_RULES,...customRules()].forEach(rule=>{rule.re.lastIndex=0;let m;
    while((m=rule.re.exec(t))!==null){
      const numStr=String(m[1]);const label=m[0].slice(0,m[0].length-numStr.length).trim();
      const pre=t.slice(Math.max(0,m.index-5),m.index);
      if(NOT_TOTAL.test(label)||/sub\s*$/i.test(pre))continue;
      const v=parseMoney(numStr);if(v==null||v<1000)continue;
      out.push({v,w:rule.w,i:m.index,label:label.replace(/^[^A-Za-z]+/,'')||'Total'});
    }});
  const re=/([\d]{1,3}(?:[.,]\d{3}){1,}(?:[.,]\d{1,2})?)/g;let m2;
  while((m2=re.exec(t))!==null){const v=parseMoney(m2[1]);if(v==null||v<10000)continue;
    if(!out.some(o=>Math.abs(o.v-v)<0.5))out.push({v,w:5,i:m2.index,label:'angka di dokumen'});}
  out.sort((a,b)=>b.w-a.w||b.i-a.i);
  const seen=new Set();return out.filter(o=>{const k=Math.round(o.v*100);if(seen.has(k))return false;seen.add(k);return true});
}
function extractTotal(text){
  if(!text)return {total:null,label:null};
  const t=String(text).replace(/ /g,' ').replace(/\s+/g,' ');
  const cands=[];
  [...TOTAL_RULES,...customRules()].forEach(rule=>{
    rule.re.lastIndex=0;let m;
    while((m=rule.re.exec(t))!==null){
      const numStr=String(m[1]);
      const label=m[0].slice(0,m[0].length-numStr.length).trim();   // hanya labelnya, bukan teks sebelumnya
      const pre=t.slice(Math.max(0,m.index-5),m.index);
      if(NOT_TOTAL.test(label)||/sub\s*$/i.test(pre))continue;
      const v=parseMoney(numStr);
      if(v==null||v<1000)continue;           // angka kecil = jumlah barang, bukan uang
      cands.push({v,w:rule.w,i:m.index,label:label.replace(/^[^A-Za-z]+/,'')||'Total'});
    }
  });
  if(!cands.length)return {total:null,label:null};
  cands.sort((a,b)=>b.w-a.w||b.i-a.i);
  return {total:cands[0].v,label:cands[0].label||'Total'};
}

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
const AI_PROMPT_FISIK=`Kamu membaca dokumen tagihan dari distributor/supplier di Indonesia. Bentuknya bisa: invoice cetak (dot matrix), faktur penjualan, nota tulis tangan, kwitansi, struk toko grosir, atau surat jalan. Dokumen bisa terdiri dari beberapa halaman/gambar berurutan.

TUGAS: temukan NILAI AKHIR YANG HARUS DIBAYAR dalam Rupiah.

ATURAN:
- Ambil angka yang berlabel: "Total", "TOTAL", "Total :", "Grand Total", "Jumlah", "Jumlah Total", "Total Harus Dibayar", "TOTAL HARUS DIBAYAR", "Total Tagihan", "Total Bayar", "Nilai Invoice". Biasanya angka terbesar dan paling bawah.
- Jika ada potongan/diskon, ambil nilai SESUDAH diskon. Contoh urutan pada struk: "TOTAL SUM" lalu "TOTAL DISKON" lalu "TOTAL HARUS DIBAYAR" -> ambil TOTAL HARUS DIBAYAR.
- Jika ada DPP/Subtotal lalu PPN dan/atau embalase lalu "Total", ambil "Total" paling akhir (yang sudah termasuk PPN), bukan DPP atau subtotal.
- Pada nota tulis tangan, total biasanya di baris paling bawah kolom kanan, sering digarisbawahi atau ditulis lebih besar. Baca angka tulisan tangan dengan hati-hati.
- Jika ada tulisan terbilang (mis. "Delapan Juta Delapan Ratus Ribu Rupiah"), pakai untuk memastikan angka yang kamu baca benar.
- ABAIKAN angka yang merupakan jumlah barang, bukan uang: kolom Qty/Kts/Jumlah/Satuan, "339 Dos", "TOTAL 372", jumlah karton/dus/botol, nomor dokumen, nomor rekening, NPWP, dan tanggal.
- Jika dokumen hanya surat jalan tanpa nilai rupiah sama sekali, balas total null dan note "surat jalan tanpa nilai rupiah".
- Format angka Indonesia: titik = pemisah ribuan, koma = desimal. Balas angka murni tanpa titik/koma, contoh: 40796000.

Balas HANYA JSON:
{"total": number|null, "label": string|null, "doc_no": string|null, "supplier": string|null, "tanggal": string|null, "confidence": "tinggi"|"sedang"|"rendah", "note": string}
"label" = tulisan persis yang ada di dokumen untuk angka itu, misal "Total :" atau "TOTAL HARUS DIBAYAR".`;

const AI_PROMPT_ESB=`Kamu membaca ${'${desc}'}. Dokumen bisa terdiri dari beberapa halaman (gambar berurutan); total akhir biasanya ada di halaman terakhir. Temukan TOTAL AKHIR / GRAND TOTAL dokumen ini (setelah diskon dan PPN bila ada; bukan subtotal, bukan DPP, bukan total per halaman). Angka dalam Rupiah, balas angka murni tanpa titik/koma.
Balas HANYA JSON: {"total": number|null, "label": string|null, "doc_no": string|null, "supplier": string|null, "confidence": "tinggi"|"sedang"|"rendah", "note": string}`;

async function aiRead(S,e){
  if(!sample){$('#'+S.ai).innerHTML='<span class="warnx">Pembacaan AI tidak aktif — isi total manual</span>';return false}
  if(aiOff){$('#'+S.ai).innerHTML='<span class="warnx">Kuota AI habis — isi total manual</span>';return false}
  e.reading=true;renderDrop(S);
  const prompt=S.k==='fisik'?AI_PROMPT_FISIK:AI_PROMPT_ESB.replace('${desc}',S.desc);
  try{
    const imgs=await pagesForAI(e.pages);
    const r=await sample.json(prompt,imgs);
    e.reading=false;
    if(r&&r.total!=null&&!isNaN(Number(r.total))){
      e.total=Number(r.total);e.src='AI';e.manual=true;e.aiLabel=r.label||'';e.conf=r.confidence||'';
      if(!e.no&&r.doc_no)e.no=String(r.doc_no).toUpperCase();
      if(S.k==='fisik'&&r.doc_no&&!$('#mDist').value.trim())$('#mDist').value=String(r.doc_no);
      if(S.k==='fisik'&&r.supplier&&!$('#mSup').value.trim())$('#mSup').value=r.supplier;
      renderDrop(S);recalcSlot(S,true);
      $('#'+S.ai).innerHTML='✓ AI: '+esc(e.name)+' → <b>'+fmtRp(e.total)+'</b>'+(r.label?' <span class="sub">('+esc(r.label)+')</span>':'')+(r.confidence&&r.confidence!=='tinggi'?' <span class="warnx">· keyakinan '+esc(r.confidence)+', mohon dicek</span>':' <span class="sub">· cek sekali lagi dengan dokumennya</span>');
      return true;
    }
    renderDrop(S);
    $('#'+S.ai).innerHTML='<span class="warnx">AI tidak menemukan total di '+esc(e.name)+(r&&r.note?' ('+esc(r.note)+')':'')+' — isi manual</span>';
    return false;
  }catch(err){e.reading=false;const msg=String(err.message||err.code||'');
    const kuota=/429|quota|rate.?limit|RESOURCE_EXHAUSTED/i.test(msg);
    const berat=/WORKER_RESOURCE_LIMIT|546|compute resources/i.test(msg);
    const lambat=err.code==='TIMEOUT'||/AbortError|tidak menjawab dalam/i.test(msg);
    if(kuota)aiOff=true;
    renderDrop(S);
    logFail('ai',kuota?('kuota Gemini habis (429)'):msg,{file_name:(e.name||'').slice(0,120),file_size:e.file?e.file.size:null});
    if(kuota){$('#'+S.ai).innerHTML='<span class="warnx">Kuota Gemini habis hari ini — isi total manual. (Dokumen PDF yang ada teksnya tetap terbaca otomatis tanpa AI.)</span>';return false}
    if(berat||lambat){
      // Sebelum menyerah: kalau dokumennya punya teks, baca pakai logika saja.
      if(e.txt){
        const p=parseEsb(e.txt);
        if(p.total!=null){
          e.parsed=p;e.total=p.total;e.src='teks';e.manual=false;e.aiLabel=p.total_label||'';
          e.cands=allCandidates(e.txt).slice(0,6);
          renderDrop(S);recalcSlot(S,true);
          $('#'+S.ai).innerHTML='✓ Dibaca tanpa AI: <b>'+fmtRp(e.total)+'</b>'+(p.total_label?' <span class="sub">('+esc(p.total_label)+')</span>':'')+' <span class="sub">· AI '+(lambat?'terlalu lama':'kehabisan sumber daya')+', jadi dipakai pembacaan teks</span>';
          return true;
        }
      }
      $('#'+S.ai).innerHTML='<span class="warnx">'+(lambat
        ? 'AI terlalu lama menjawab dan dihentikan. Tekan <b>Baca tanpa AI</b>, atau pilih/ketik angka totalnya.'
        : 'Server pembaca AI kehabisan sumber daya (dokumen terlalu berat). Coba foto ulang lebih kecil, atau pilih/ketik angkanya.')+'</span>';
      return false;
    }
    $('#'+S.ai).innerHTML='<span class="warnx">AI gagal ('+esc(err.code||err.message||'')+') — isi total manual</span>';return false}
}
$('#btnText').onclick=()=>{
  let n=0,gagal=0;
  SLOTS.forEach(S=>{if(!S.tot)return;let ubah=false;
    docs[S.k].forEach(e=>{if(e.saved||!e.txt)return;
      const p=parseEsb(e.txt);e.parsed=p;e.cands=allCandidates(e.txt).slice(0,6);
      if(p.total!=null){e.total=p.total;e.src='teks';e.manual=false;e.aiLabel=p.total_label||'';n++;ubah=true}
      else if(e.total==null)gagal++;});
    if(ubah||docs[S.k].length){renderDrop(S);recalcSlot(S,true)}});
  toast(n?(n+' total terbaca dari teks dokumen'):(gagal?'Tidak ada total yang bisa dibaca dari teks — dokumen ini kemungkinan hasil scan/foto':'Tidak ada dokumen baru untuk dibaca'));
};
$('#btnAI').onclick=async()=>{
  const jobs=[];SLOTS.forEach(S=>docs[S.k].forEach(e=>{if(!e.saved&&e.pages&&e.pages.length&&S.tot)jobs.push([S,e])}));
  if(!jobs.length)return toast('Tidak ada dokumen baru untuk dibaca AI');
  if(!sample)return toast('AI dimatikan di config.js (GEMINI_MODE: "off")');
  aiOff=false;$('#btnAI').disabled=true;
  for(const [S,e] of jobs){e.aiTried=true;await aiRead(S,e)}
  try{const k='ai_count_'+jktDate();const n=(+localStorage.getItem(k)||0)+jobs.length;localStorage.setItem(k,n);$('#aiCount').textContent='AI dipakai '+n+'× hari ini (perangkat ini)'}catch(e){}
  $('#btnAI').disabled=false;
};
try{const k='ai_count_'+jktDate();const n=+localStorage.getItem(k)||0;if(n)document.addEventListener('DOMContentLoaded',()=>{$('#aiCount').textContent='AI dipakai '+n+'× hari ini (perangkat ini)'})}catch(e){}
function resetCek(){parsedDates={};SLOTS.forEach(S=>{docs[S.k]=[];if(S.tot)$('#'+S.tot).value='';$('#'+S.ai).textContent='';renderDrop(S)});$('#cNote').value='';calcRes()}
function loadSavedDocs(c){SLOTS.forEach(S=>{const arr=(c&&c[S.k+'_docs'])||[];
  if(arr.length)docs[S.k]=arr.map(x=>({saved:true,name:x.name||S.label,no:x.no||null,total:x.total!=null?Number(x.total):null,asset:x.asset,pdf:!!x.pdf,at:x.at,by:x.by,npages:x.npages||1,src:x.src||null,aiLabel:x.label||null}));
  else if(c&&c[S.k+'_asset'])docs[S.k]=[{saved:true,name:S.label,no:null,total:(c['total_'+S.k]!=null?Number(c['total_'+S.k]):null),asset:c[S.k+'_asset'],pdf:!!c[S.k+'_pdf'],at:c[S.k+'_at'],by:c[S.k+'_by'],npages:1}];
  renderDrop(S)})}

/* ---------- settings ---------- */
$('#btnSaveSet').onclick=async()=>{try{const r=await DATA.saveSettings({target_gr_h:+$('#sGr').value||24,target_inv_h:+$('#sInv').value||48,toleransi:+$('#sTol').value||0,label_total:$('#sLabel').value.trim(),ai_auto:$('#sAiAuto').checked,updated:nowIso()});if(r&&r.error)throw r.error}catch(e){return toast('Gagal: '+(e.message||e)+' (hanya admin)')}toast('Setting tersimpan');loadSettings()};

/* ---------- panel admin: log kegagalan & versi pengguna ---------- */
async function loadLog(){
  const kind=$('#logKind').value;let data=null,error=null;
  try{data=(await DATA.listLog(kind)).data}catch(e){error=e}
  const T=$('#tLog');
  if(error){T.innerHTML='<tr><td class="empty">Gagal memuat log: '+esc(error.message)+' — sudah jalankan UPDATE_SQL_log.sql?</td></tr>';return}
  $('#logInfo').textContent=(data||[]).length+' kejadian terakhir';
  T.innerHTML='<tr><th>Waktu</th><th>Petugas</th><th>Jenis</th><th>File</th><th>Ukuran</th><th>Pesan</th><th>Versi</th><th>Perangkat</th></tr>'+
    ((data&&data.length)?data.map(r=>`<tr><td>${jkt(r.at)}</td><td>${esc(r.email||'')}</td><td><span class="b ${r.kind==='upload'?'bad':'warn'}">${esc(r.kind||'')}</span></td><td class="sub">${esc(r.file_name||'')}${r.po_id?'<br>'+esc(r.po_id):''}</td><td>${r.file_size?(r.file_size/1048576).toFixed(2)+' MB':'-'}</td><td class="sub">${esc(r.message||'')}</td><td class="sub">${esc(r.app_version||'')}</td><td class="sub">${esc(r.ua||'')}</td></tr>`).join(''):'<tr><td colspan="8" class="empty">Tidak ada kegagalan tercatat 🎉</td></tr>');
}
async function loadUsers(){
  let data=null,error=null;try{data=(await DATA.listProfiles()).data;(data||[]).sort((a,b)=>String(b.last_seen||'').localeCompare(String(a.last_seen||'')))}catch(e){error=e}
  const T=$('#tUsers');if(error){T.innerHTML='<tr><td class="empty">'+esc(error.message||error)+'</td></tr>';return}
  T.innerHTML='<tr><th>Petugas</th><th>Email</th><th>Peran</th><th>Versi aplikasi</th><th>Terakhir membuka</th></tr>'+
    (data||[]).map(r=>{const lama=r.app_version&&r.app_version!==APP_VERSION;return `<tr><td><b>${esc(r.display_name||'')}</b></td><td class="sub">${esc(r.email||'')}</td><td>${esc(r.role||'')}</td><td>${r.app_version?(lama?'<span class="b bad">'+esc(r.app_version)+' — versi lama</span>':'<span class="b ok">'+esc(r.app_version)+'</span>'):'<span class="b mut">belum tercatat</span>'}</td><td>${r.last_seen?jkt(r.last_seen):'-'}</td></tr>`}).join('');
}
$('#btnLog').onclick=loadLog;$('#logKind').addEventListener('change',loadLog);$('#btnUsers').onclick=loadUsers;
$('#btnLogClear').onclick=async()=>{try{const r=await DATA.cleanLog();if(r&&r.error)throw r.error;toast('Log lebih dari 30 hari dihapus')}catch(e){toast('Gagal: '+(e.message||e))}loadLog()};

/* ---------- diagnostik upload ---------- */
$('#diagVer').textContent='versi aplikasi '+APP_VERSION;
$('#btnDiag').onclick=async()=>{
  const out=$('#diagOut');out.style.display='';$('#btnDiag').disabled=true;const L=[];
  const put=(k,v)=>{L.push(k.padEnd(22,' ')+': '+v);out.textContent=L.join('\n')};
  const ua=navigator.userAgent;
  put('Waktu',new Date().toLocaleString('id-ID',{timeZone:TZ}));
  put('Versi aplikasi',APP_VERSION);
  put('Sumber data',BACKEND==='d1'?('Cloudflare D1 — '+(API||'(API_URL kosong)')):'Supabase Postgres');
  put('Perangkat',/iPhone|iPad/.test(ua)?'iPhone/iPad':/Android/.test(ua)?'Android':/Mac/.test(ua)?'Mac':/Windows/.test(ua)?'Windows':'lain');
  put('Browser',(ua.match(/(Chrome|CriOS|Firefox|Safari|Edg)\/[\d.]+/)||['tidak dikenal'])[0]);
  put('Online',navigator.onLine?'ya':'TIDAK');
  put('pdf.js (baca PDF)',window.pdfjsLib?'termuat':'dimuat saat ada PDF (hemat)');
  put('xlsx (export Excel)',window.XLSX?'termuat':'dimuat saat export (hemat)');
  put('Sumber pustaka',LIB.startsWith('http')?'CDN':'lokal (hosting sendiri)');
  put('Pembacaan AI',sample?('aktif, mode '+(CFG.GEMINI_MODE||'edge')+(CFG.GEMINI_MODE==='worker'?' → '+(CFG.GEMINI_URL||'(URL kosong)'):'')):'TIDAK AKTIF');
  put('Penyimpanan dokumen',STORE==='r2'?'Cloudflare R2':'Supabase Storage');
  put('Cara login',AUTH_MODE==='access'?'Cloudflare Access':'Supabase (email + sandi)');
  let sess=null;
  if(AUTH_MODE==='access'){
    try{const me=(await apiFetch('/me')).data;put('Identitas','aktif — '+me.email+' (via '+(me.via||'access')+')')}
    catch(e){put('Identitas','GAGAL — '+(e.message||e)+' · muat ulang halaman untuk login Access')}
  }else{
    if(!sb){put('Supabase','TIDAK TERHUBUNG — config.js belum benar');$('#btnDiag').disabled=false;$('#btnDiagCopy').style.display='';return}
    try{sess=(await sb.auth.getSession()).data.session}catch(e){}
    put('Sesi login',sess?('aktif — '+sess.user.email):'TIDAK ADA — silakan keluar lalu masuk lagi');
    if(sess&&sess.expires_at)put('Sesi berlaku s/d',new Date(sess.expires_at*1000).toLocaleString('id-ID',{timeZone:TZ}));
  }
  put('Peran',isAdmin?'admin':'staf');
  try{const t0=Date.now();const r=await DATA.listPo();put('Baca database',(r&&r.error)?('GAGAL — '+r.error.message):('ok ('+(Date.now()-t0)+' ms, '+((r.data||[]).length)+' baris)'))}catch(e){put('Baca database','GAGAL — '+(e.message||e))}
  // uji upload file kecil
  try{const blob=new Blob(['uji upload '+new Date().toISOString()],{type:'text/plain'});
    const path='_diagnostik/'+((uid||'anon').slice(0,8))+'_'+Date.now()+'.txt';
    const t0=Date.now();
    if(STORE==='r2'){
      const res=await fetch(API+'/file?path='+encodeURIComponent(path),{method:'POST',credentials:'include',headers:{'X-File-Type':'text/plain',...(await authHeaders())},body:blob});
      if(!res.ok){const j=await res.json().catch(()=>null);put('Uji upload','GAGAL — R2 '+res.status+' '+((j&&j.error)||''))}
      else put('Uji upload','BERHASIL ('+(Date.now()-t0)+' ms, R2)');
    }else{
      const {error}=await sb.storage.from(BUCKET).upload(path,blob,{contentType:'text/plain',upsert:false});
      if(error)put('Uji upload','GAGAL — '+uploadErrMsg(error)+' ['+(error.message||'')+']');
      else{put('Uji upload','BERHASIL ('+(Date.now()-t0)+' ms)');try{await sb.storage.from(BUCKET).remove([path])}catch(e){}}
    }
  }catch(e){put('Uji upload','GAGAL — '+(e.message||e))}
  put('Catatan','bila Uji upload BERHASIL tetapi dokumen tetap gagal, kirim juga nama & ukuran file yang gagal');
  $('#btnDiag').disabled=false;$('#btnDiagCopy').style.display='';
};
$('#btnDiagCopy').onclick=async()=>{try{await navigator.clipboard.writeText($('#diagOut').textContent);toast('Hasil diagnostik disalin — tempel di WhatsApp ke admin')}catch(e){toast('Tidak bisa menyalin — screenshot saja')}};

/* ---------- import xlsx ---------- */
let XL=null;$('#impFile').onchange=()=>{$('#btnImport').disabled=!$('#impFile').files[0]};
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
