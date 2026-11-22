'use strict';
/* ============================================================
   Finanças — app pessoal (PWA)
   Dados: guardados no aparelho (localStorage) e, se configurado,
   sincronizados com o seu próprio projeto Supabase.
   ============================================================ */

const MES=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const MESL=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const TIPOS=['Renda','Reembolso','Transferência','Despesa','Investimento','Vale (benefício)'];
const CATS_PADRAO={
 'Renda':['Salário','Comissão','Aluguel recebido','Férias','Restituição IR','Outras entradas'],
 'Reembolso':['Reembolso'],
 'Transferência':['Saldo do mês anterior','Saldo separado','Resgate da reserva'],
 'Despesa':['Moradia','Financiamento','Carro','Cartão de crédito','Alimentação','Saúde','Dívidas e parcelas','Cuidados pessoais','Família e presentes','Lazer e esporte','Oferta e doações','Viagem','Imprevistos','Outros'],
 'Investimento':['Renda fixa','Renda variável','Reserva de emergência'],
 'Vale (benefício)':['Vale alimentação']};
const ENTRADA=new Set(['Renda','Reembolso','Transferência']);
const ORD={'Renda':0,'Vale (benefício)':1,'Reembolso':2,'Transferência':3,'Despesa':4,'Investimento':5};
const CORES={
  floresta:{nome:'Verde floresta',l:['#1f5c46','#e3efe9'],d:['#6cc39b','#1f3229']},
  esmeralda:{nome:'Esmeralda',l:['#0f7a5a','#dcf3ea'],d:['#4fd1a5','#123329']},
  petroleo:{nome:'Azul petróleo',l:['#1b5e78','#e0eef4'],d:['#6cbcd9','#16303a']},
  oliva:{nome:'Oliva',l:['#55621f','#eef1dd'],d:['#b5c46a','#2b2f1a']},
  grafite:{nome:'Grafite',l:['#2f3a36','#e8ebea'],d:['#b9c6c0','#262d2a']},
  vinho:{nome:'Vinho',l:['#7a2342','#f6e3ea'],d:['#e48aa8','#3a1c27']}};

/* ---------- armazenamento local ---------- */
const LS='fin.v1.';
function lsGet(k,def){try{const v=localStorage.getItem(LS+k);return v==null?def:JSON.parse(v);}catch(e){return def;}}
function lsSet(k,v){try{localStorage.setItem(LS+k,JSON.stringify(v));return true;}catch(e){showBanner('O aparelho não deixou salvar os dados. Verifique se o navegador não está no modo anônimo.',true);return false;}}
// docs: { key: {data, t (ms da última alteração), dirty} }
let DOCS=lsGet('docs',{});
let AUTH=lsGet('auth',null);       // {url, key, email, access_token, refresh_token, expires_at, user_id}
let LAST_SYNC=lsGet('lastSync',0);
function saveDocs(){lsSet('docs',DOCS);}

const today=new Date(), HOJE_ANO=today.getFullYear();
const pad=m=>String(m+1).padStart(2,'0');
const monthKey=(y,m)=>`y${y}m${pad(m)}`;
const cfgKey=y=>`y${y}config`;
const ccKey=(y,m)=>`y${y}m${pad(m)}cc`;
function parseKey(k){let r=/^y(\d{4})m(\d\d)$/.exec(k);if(r)return{y:+r[1],m:+r[2]-1};r=/^y(\d{4})m(\d\d)cc$/.exec(k);if(r)return{y:+r[1],m:+r[2]-1,cc:true};r=/^y(\d{4})config$/.exec(k);if(r)return{y:+r[1],cfg:true};if(k==='settings')return{settings:true};if(k==='cartoes')return{cartoes:true};return null;}
const PREVIEW=!!window.__PREVIEW;

const SET_PADRAO={nome:'',cor:'floresta',tema:'sistema',ocultar:false,catsExtra:{},catsOcultas:{}};
function settings(){return Object.assign({},SET_PADRAO,(DOCS.settings||{}).data||{});}
function cats(tipo){const s=settings();const base=(CATS_PADRAO[tipo]||[]).filter(c=>!(s.catsOcultas[tipo]||[]).includes(c));return base.concat((s.catsExtra[tipo]||[]).filter(c=>!base.includes(c)));}

/* anos em memória, montados a partir de DOCS */
const Y={};
let CARTOES=[];
function emptyCC(){return {compras:[],faturas:{}};}
function emptyYear(y){const p=Y[y-1]||Y[y+1];return {cc:Array.from({length:12},emptyCC),months:Array.from({length:12},()=>[]),config:{meta:p?Number(p.config.meta)||0:0,plan:Array(12).fill(0),bancos:p?[...p.config.bancos]:[],patrimonio:{}},keep:false};}
function yr(y){return Y[y]||(Y[y]=emptyYear(y));}
function hydrate(){
  for(const k in Y) delete Y[k];
  CARTOES=((DOCS.cartoes||{}).data||{}).lista||[];
  for(const k in DOCS){const p=parseKey(k);if(!p||p.settings||p.cartoes)continue;const Yy=yr(p.y),d=DOCS[k].data||{};
    if(p.cc){Yy.cc[p.m]={compras:Array.isArray(d.compras)?d.compras:[],faturas:d.faturas||{}};}
    else if(p.cfg){Yy.config={meta:Number(d.meta)||0,plan:d.plan||Array(12).fill(0),bancos:d.bancos||[],patrimonio:d.patrimonio||{}};Yy.keep=true;}
    else Yy.months[p.m]=Array.isArray(d.items)?d.items:[];}
}
function hasData(){return Object.keys(DOCS).some(k=>k!=='settings');}
function anosComDados(){return Object.keys(Y).map(Number).filter(y=>Y[y].keep||Y[y].months.some(a=>a.length)||Y[y].cc.some(c=>c.compras.length)).sort();}

/* gravar uma alteração: atualiza o doc local, marca para sincronizar */
function touch(k){
  const p=parseKey(k); let data;
  if(p.settings) data=(DOCS.settings||{}).data||{};
  else if(p.cartoes) data={lista:CARTOES};
  else if(p.cc){const c=yr(p.y).cc[p.m]; data={ano:p.y,mes:p.m+1,compras:c.compras,faturas:c.faturas};}
  else{const Yy=yr(p.y); data=p.cfg?Yy.config:{ano:p.y,mes:p.m+1,items:Yy.months[p.m]};}
  DOCS[k]={data:JSON.parse(JSON.stringify(data)),t:Date.now(),dirty:true};
  saveDocs(); scheduleSync();
}
function setSetting(patch){DOCS.settings={data:Object.assign(settings(),patch),t:Date.now(),dirty:true};saveDocs();scheduleSync();applyLook();}

/* ---------- estado de tela ---------- */
hydrate();
let ano=(()=>{const a=anosComDados();return a.includes(HOJE_ANO)||!a.length?HOJE_ANO:(a.filter(y=>y<=HOJE_ANO).pop()||a[0]);})();
let S=yr(ano), cur=ano===HOJE_ANO?today.getMonth():0, tab=hasData()?'mes':'ajustes', filtro='todos', charts={};
function setAno(y){ano=y;S=yr(y);cur=y===HOJE_ANO?today.getMonth():0;render();}

/* ---------- formatação ---------- */
const hide=()=>settings().ocultar;
const brl=v=>hide()?'R$ •••••':(v<0?'-':'')+'R$ '+Math.abs(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const brl0=v=>hide()?'•••':(v<0?'-':'')+'R$ '+Math.abs(v||0).toLocaleString('pt-BR',{maximumFractionDigits:0});
const pct=v=>(isFinite(v)?(v*100).toLocaleString('pt-BR',{maximumFractionDigits:1}):'0')+'%';
function parseBR(s){if(typeof s==='number')return s;s=String(s||'').replace(/R\$|\s/g,'');if(!s)return 0;if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');else if(/^-?\d{1,3}(\.\d{3})+$/.test(s))s=s.replace(/\./g,'');const n=parseFloat(s);return isFinite(n)?Math.round(n*100)/100:0;}
const fmtIn=v=>v==null||v===''?'':hide()?'•••':Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const uid=()=>(crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2)).replace(/-/g,'').slice(0,12);

/* lançamentos do mês + itens gerados pelas faturas dos cartões (cada compra conta uma vez, na sua categoria) */
function ccItems(m,Yy){const c=(Yy||S).cc[m];const out=[];c.compras.forEach(x=>{out.push({tipo:'Despesa',cat:x.cat,valor:x.valor,pago:!!(c.faturas[x.cartao]||{}).pago,_cc:1});if(x.terceiro)out.push({tipo:'Reembolso',cat:'Reembolso',valor:x.valor,pago:!!x.recebido,_cc:1});});return out;}
function allItems(m,Yy){return (Yy||S).months[m].concat(ccItems(m,Yy));}
function sum(m,fn,Yy){return allItems(m,Yy).reduce((a,x)=>a+(fn(x)?Number(x.valor)||0:0),0);}
function calc(m,Yy){
  const t=tp=>sum(m,x=>x.tipo===tp,Yy);
  const renda=t('Renda'),reemb=t('Reembolso'),transf=t('Transferência'),desp=t('Despesa'),inv=t('Investimento');
  const entr=renda+reemb+transf,greal=desp-reemb;
  return {renda,reemb,transf,desp,inv,entr,greal,sobra:entr-desp-inv,pend:sum(m,x=>x.tipo==='Despesa'&&!x.pago,Yy),
    invPago:sum(m,x=>x.tipo==='Investimento'&&x.pago,Yy),vale:t('Vale (benefício)'),
    recPend:sum(m,x=>ENTRADA.has(x.tipo)&&!x.pago,Yy),taxa:renda?inv/renda:0,n:(Yy||S).months[m].length+(Yy||S).cc[m].compras.length};
}

/* ---------- aparência ---------- */
function applyLook(){
  const s=settings(), root=document.documentElement;
  if(s.tema==='claro') root.setAttribute('data-theme','light'); else if(s.tema==='escuro') root.setAttribute('data-theme','dark'); else root.removeAttribute('data-theme');
  const dark=s.tema==='escuro'||(s.tema==='sistema'&&matchMedia('(prefers-color-scheme: dark)').matches);
  const c=CORES[s.cor]||CORES.floresta, [a,soft]=dark?c.d:c.l;
  root.style.setProperty('--accent',a); root.style.setProperty('--accent-soft',soft); root.style.setProperty('--c1',a);
  const tc=document.querySelector('meta[name="theme-color"]'); if(tc) tc.content=dark?'#111714':c.l[0];
  document.getElementById('eye').innerHTML=s.ocultar
    ?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.1A10 10 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6C3.9 8.4 2 12 2 12s4 7 10 7a9.8 9.8 0 0 0 5.4-1.6"/></svg>'
    :'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  document.getElementById('eye').title=s.ocultar?'Mostrar valores':'Esconder valores';
}

/* ---------- status / avisos ---------- */
function setStatus(c,t){document.getElementById('dot').className='dot '+c;document.getElementById('statusTxt').textContent=t;}
function showBanner(t,err){const b=document.getElementById('banner');b.textContent=t;b.className='banner'+(err?' err':'');}
function hideBanner(){document.getElementById('banner').className='banner hidden';}

/* ============================================================
   Sincronização com Supabase (REST, sem bibliotecas)
   Tabela: fin_docs(user_id, key, data jsonb, updated_at)
   ============================================================ */
let syncT=null, syncing=false, syncAgain=false;
const online=()=>navigator.onLine!==false;
function syncOn(){return !PREVIEW&&!!(AUTH&&AUTH.url&&AUTH.key&&AUTH.refresh_token);}
function scheduleSync(){ if(!syncOn()){setStatus('','Neste aparelho');return;} setStatus('busy','Alterações a enviar'); clearTimeout(syncT); syncT=setTimeout(sync,1500); }
async function api(path,opt={}){
  const r=await fetch(AUTH.url.replace(/\/$/,'')+path,{...opt,headers:{apikey:AUTH.key,'Content-Type':'application/json',...(opt.headers||{})}});
  const txt=await r.text(); let j=null; try{j=txt?JSON.parse(txt):null;}catch(e){}
  if(!r.ok){const msg=(j&&(j.msg||j.message||j.error_description||j.error))||('Erro '+r.status);const e=new Error(msg);e.status=r.status;throw e;}
  return j;
}
async function token(){
  if(AUTH.access_token&&AUTH.expires_at&&Date.now()<AUTH.expires_at-60000) return AUTH.access_token;
  const j=await api('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:AUTH.refresh_token})});
  setSession(j); return AUTH.access_token;
}
function setSession(j){AUTH=Object.assign({},AUTH,{access_token:j.access_token,refresh_token:j.refresh_token,expires_at:Date.now()+(j.expires_in||3600)*1000,user_id:(j.user&&j.user.id)||AUTH.user_id,email:(j.user&&j.user.email)||AUTH.email});lsSet('auth',AUTH);}
async function sync(){
  if(!syncOn()) return;
  if(syncing){syncAgain=true;return;}
  if(!online()){setStatus('err','Sem internet — salvo no aparelho');return;}
  syncing=true; setStatus('busy','Sincronizando…');
  try{
    let tk;
    try{ tk=await token(); }
    catch(e){ if(e.status===400||e.status===401){ AUTH=Object.assign({},AUTH,{access_token:null,refresh_token:null}); lsSet('auth',AUTH); showBanner('Sua sessão expirou. Entre de novo em Ajustes → Sincronização para voltar a sincronizar.',true); } throw e; }
    const H={Authorization:'Bearer '+tk};
    // 1) baixar tudo da nuvem (são poucos documentos por ano)
    const rows=await api('/rest/v1/fin_docs?select=key,data,updated_at',{headers:H});
    let mudou=false;
    for(const r of rows||[]){
      const rt=Date.parse(r.updated_at)||0, loc=DOCS[r.key];
      if(!loc||rt>loc.t){ DOCS[r.key]={data:r.data,t:rt,dirty:false}; mudou=true; }
      else if(loc&&loc.dirty&&rt===loc.t){ loc.dirty=false; }
    }
    // 2) enviar o que mudou aqui
    const sobe=Object.keys(DOCS).filter(k=>DOCS[k].dirty);
    if(sobe.length){
      const body=sobe.map(k=>({user_id:AUTH.user_id,key:k,data:DOCS[k].data,updated_at:new Date(DOCS[k].t).toISOString()}));
      await api('/rest/v1/fin_docs?on_conflict=user_id,key',{method:'POST',headers:{...H,Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(body)});
      sobe.forEach(k=>{DOCS[k].dirty=false;});
    }
    saveDocs(); LAST_SYNC=Date.now(); lsSet('lastSync',LAST_SYNC);
    setStatus('ok','Sincronizado'); hideBanner();
    if(mudou){hydrate();S=yr(ano);render();}
  }catch(e){
    if(e.status===401&&AUTH){ AUTH.access_token=null; lsSet('auth',AUTH); }
    else if(e.status===404){ showBanner('A tabela fin_docs não foi encontrada no Supabase. Rode o script SQL do guia e tente de novo.',true); }
    setStatus('err','Não sincronizou — salvo no aparelho');
  }finally{
    syncing=false; if(syncAgain){syncAgain=false;setTimeout(sync,300);}
  }
}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')sync();});
window.addEventListener('online',()=>sync());
setInterval(()=>{if(document.visibilityState==='visible')sync();},60000);

async function entrar(criar){
  const url=document.getElementById('sbUrl').value.trim(), key=document.getElementById('sbKey').value.trim();
  const email=document.getElementById('sbEmail').value.trim(), senha=document.getElementById('sbPass').value;
  const msg=document.getElementById('sbMsg');
  if(!/^https:\/\/.+/.test(url)||!key){msg.textContent='Preencha o endereço do projeto (começa com https://) e a chave pública.';return;}
  if(!email||senha.length<6){msg.textContent='Preencha o e-mail e uma senha com pelo menos 6 caracteres.';return;}
  AUTH={url,key,email}; msg.textContent=criar?'Criando a conta…':'Entrando…';
  try{
    if(criar){
      const j=await api('/auth/v1/signup',{method:'POST',body:JSON.stringify({email,password:senha})});
      if(!j.access_token){lsSet('auth',AUTH);msg.textContent='Conta criada. Abra o e-mail de confirmação que o Supabase enviou e depois toque em "Entrar".';return;}
      setSession(j);
    }else{
      const j=await api('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email,password:senha})});
      setSession(j);
    }
    // na primeira conexão, tudo que já está no aparelho sobe para a nuvem
    Object.keys(DOCS).forEach(k=>{DOCS[k].dirty=true;}); saveDocs();
    msg.textContent='Conectado. Sincronizando…'; await sync(); render();
  }catch(e){
    lsSet('auth',AUTH);
    msg.textContent=/invalid login/i.test(e.message)?'E-mail ou senha incorretos.':/not confirmed/i.test(e.message)?'Confirme o e-mail pelo link que o Supabase enviou e tente de novo.':'Não deu certo: '+e.message;
  }
}
function sair(){AUTH=AUTH?{url:AUTH.url,key:AUTH.key,email:AUTH.email}:null;lsSet('auth',AUTH);setStatus('','Neste aparelho');render();}

/* ---------- backup ---------- */
function exportar(){
  const payload={app:'financas',versao:1,exportado:new Date().toISOString(),docs:Object.fromEntries(Object.entries(DOCS).map(([k,v])=>[k,v.data]))};
  const blob=new Blob([JSON.stringify(payload,null,1)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download='financas-backup-'+new Date().toISOString().slice(0,10)+'.json'; document.body.appendChild(a); a.click();
  setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1000);
}
function importar(file){
  const rd=new FileReader();
  rd.onload=()=>{
    try{
      const j=JSON.parse(rd.result); if(!j||j.app!=='financas'||!j.docs) throw new Error('formato');
      let n=0; const now=Date.now();
      for(const k in j.docs){ if(!parseKey(k)) continue; DOCS[k]={data:j.docs[k],t:now,dirty:true}; n++; }
      saveDocs(); hydrate();
      const a=anosComDados(); ano=a.includes(HOJE_ANO)?HOJE_ANO:(a[a.length-1]||HOJE_ANO); S=yr(ano); cur=ano===HOJE_ANO?today.getMonth():0;
      applyLook(); tab='mes'; render(); scheduleSync();
      showBanner(`Backup importado: ${n} documentos (${a.join(', ')}).`);
    }catch(e){ showBanner('Esse arquivo não é um backup do app Finanças.',true); }
  };
  rd.readAsText(file);
}

/* ============================================================
   Telas
   ============================================================ */
let pendingRender=false;
function anos(){const ys=new Set(anosComDados());ys.add(HOJE_ANO);ys.add(ano);return [...ys].sort();}
function renderHeader(){
  const s=settings();
  document.getElementById('h1').textContent='Finanças '+ano;
  document.getElementById('hello').textContent=s.nome?`Olá, ${s.nome}. Renda, gastos, metas e patrimônio, mês a mês`:'Renda, gastos, metas e patrimônio, mês a mês';
  const ys=anos(), prox=ys[ys.length-1]+1;
  document.getElementById('years').innerHTML=ys.map(y=>`<button data-y="${y}" class="${y===ano?'on':''}">${y}</button>`).join('')+`<button data-novo="${prox}" class="novo" title="Começar o ano de ${prox}">+ ${prox}</button>`;
  document.getElementById('months').innerHTML=MES.map((n,i)=>{const c=calc(i);return `<button data-m="${i}" class="${i===cur?'on':''} ${c.n&&c.sobra<0?'neg':''}" title="${MESL[i]}">${n}</button>`}).join('');
}
function render(){
  const ae=document.activeElement;
  if(ae&&ae.closest&&ae.closest('#view')&&/INPUT|SELECT/.test(ae.tagName)&&ae.type!=='file'){pendingRender=true;return;}
  pendingRender=false;
  renderHeader();
  document.querySelectorAll('#tabs button').forEach(b=>b.classList.toggle('on',b.dataset.tab===tab));
  document.getElementById('months').classList.toggle('hidden',tab!=='mes'&&tab!=='cartoes');
  document.getElementById('years').classList.toggle('hidden',tab==='ajustes');
  Object.values(charts).forEach(c=>c.destroy()); charts={};
  const v=document.getElementById('view');
  v.innerHTML= tab==='mes'?viewMes(): tab==='cartoes'?viewCartoes(): tab==='ano'?viewAno(): tab==='metas'?viewMetas(): tab==='pat'?viewPat(): viewAjustes();
  if(tab==='cartoes') previewCompra();
  if(tab==='ano') chartAno(); if(tab==='pat') chartPat();
}
document.addEventListener('focusout',()=>setTimeout(()=>{if(pendingRender)render();},0));

function catOpts(tipo,sel){const l=cats(tipo);return l.concat(sel&&!l.includes(sel)?[sel]:[]).map(c=>`<option ${c===sel?'selected':''}>${esc(c)}</option>`).join('');}
function tipoOpts(sel){return TIPOS.map(t=>`<option ${t===sel?'selected':''}>${t}</option>`).join('');}
function prevMonth(){return cur>0?S.months[cur-1]:(Y[ano-1]?Y[ano-1].months[11]:[]);}

function viewMes(){
  if(!hasData()) return viewBoasVindas();
  const c=calc(cur);
  const items=S.months[cur].map((x,i)=>({...x,_i:i})).filter(x=>filtro==='todos'||(filtro==='entradas'?ENTRADA.has(x.tipo)||x.tipo==='Vale (benefício)':x.tipo===(filtro==='despesas'?'Despesa':'Investimento')))
    .sort((a,b)=>(ORD[a.tipo]-ORD[b.tipo])||(a.cat||'').localeCompare(b.cat||'')||a._i-b._i);
  const ct={}; allItems(cur).forEach(x=>{if(x.tipo==='Despesa')ct[x.cat]=(ct[x.cat]||0)+(Number(x.valor)||0);});
  const cl=Object.entries(ct).sort((a,b)=>b[1]-a[1]); const mx=cl.length?cl[0][1]:1;
  const prevHas=prevMonth().length, prevLbl=cur>0?MESL[cur-1]:'Dezembro de '+(ano-1);
  const rows=items.map(x=>`<tr data-i="${x._i}">
      <td style="min-width:200px"><input class="cell" data-f="desc" value="${esc(x.desc)}" aria-label="Descrição">${x.obs?`<div class="note" style="padding:0 6px 3px">${esc(x.obs)}</div>`:''}</td>
      <td style="min-width:150px"><select class="cell" data-f="tipo" aria-label="Tipo">${tipoOpts(x.tipo)}</select></td>
      <td style="min-width:150px"><select class="cell" data-f="cat" aria-label="Categoria">${catOpts(x.tipo,x.cat)}</select></td>
      <td style="min-width:110px"><input class="cell num" data-f="valor" inputmode="decimal" value="${fmtIn(x.valor)}" aria-label="Valor" ${hide()?'readonly':''}></td>
      <td><button class="paid ${x.pago?'yes':'no'}" data-act="pago">${x.pago?(ENTRADA.has(x.tipo)?'Recebido':'Pago'):(ENTRADA.has(x.tipo)?'A receber':'A pagar')}</button></td>
      <td><button class="del" data-act="del" title="Apagar lançamento" aria-label="Apagar">×</button></td></tr>`).join('');
  return `<div style="display:flex;flex-direction:column;gap:16px">
  <div class="kpis">
    <div class="kpi"><span class="l">Renda</span><span class="v">${brl(c.renda)}</span><span class="s">+ ${brl0(c.reemb)} de reembolsos</span></div>
    <div class="kpi"><span class="l">Gasto real</span><span class="v">${brl(c.greal)}</span><span class="s">despesas menos reembolsos</span></div>
    <div class="kpi"><span class="l">Investido</span><span class="v">${brl(c.inv)}</span><span class="s">${pct(c.taxa)} da renda</span></div>
    <div class="kpi hl"><span class="l">Sobra do mês</span><span class="v ${c.sobra<0?'neg':'pos'}">${brl(c.sobra)}</span><span class="s">entradas − despesas − investimentos</span></div>
    <div class="kpi"><span class="l">Ainda a pagar</span><span class="v ${c.pend?'':'pos'}">${brl(c.pend)}</span><span class="s">${c.recPend?brl0(c.recPend)+' ainda a receber':'tudo recebido'}</span></div>
  </div>
  <div class="grid2">
    <section class="card">
      <div class="row"><h2>Lançamentos de ${MESL[cur]}</h2>
        <div class="chips">${[['todos','Todos'],['entradas','Entradas'],['despesas','Despesas'],['inv','Investimentos']].map(([k,l])=>`<button class="chip ${filtro===k?'on':''}" data-filtro="${k}">${l}</button>`).join('')}</div></div>
      <form class="add" id="addForm">
        <input id="aDesc" placeholder="Descrição (ex.: Mercado)" required>
        <select id="aTipo">${tipoOpts('Despesa')}</select>
        <select id="aCat">${catOpts('Despesa','Alimentação')}</select>
        <input id="aVal" placeholder="Valor" inputmode="decimal" required>
        <label class="note" style="display:flex;gap:4px;align-items:center"><input type="checkbox" id="aPago" checked> Pago</label>
        <button class="btn" type="submit">Adicionar</button>
      </form>
      <div class="tbl" id="lanc"><table><thead><tr><th>Descrição</th><th>Tipo</th><th>Categoria</th><th class="num">Valor</th><th>Situação</th><th></th></tr></thead>
      <tbody>${rows||(S.cc[cur].compras.length?'':`<tr><td colspan="6" class="note" style="padding:16px 6px">Nenhum lançamento em ${MESL[cur]} ainda.${prevHas?' Use "Copiar fixos" ao lado para trazer as contas do mês anterior.':''}</td></tr>`)}</tbody></table></div>
      ${filtro==='inv'?'':blocoFaturasMes()}
    </section>
    <aside style="display:flex;flex-direction:column;gap:16px">
      <section class="card"><h2>Para onde foi o dinheiro</h2>
        <div class="bars">${cl.length?cl.map(([k,v])=>`<div class="bar"><div class="t"><span>${esc(k)}</span><span>${brl(v)}</span></div><div class="track"><div class="fill" style="width:${Math.max(2,v/mx*100)}%"></div></div></div>`).join(''):'<div class="note">Sem despesas lançadas.</div>'}</div>
        ${ct['Cartão de crédito']?'<div class="note">"Cartão de crédito" é uma fatura lançada inteira. Na aba Cartões, cada compra entra na sua categoria.</div>':''}
      </section>
      <section class="card"><h2>Começar o mês</h2>
        <div class="note">Copia as contas fixas e rendas de ${prevLbl} como "a pagar" e "a receber". Faturas de cartão, mercado e gastos avulsos ficam de fora; parcelas avançam sozinhas (11/12 → 12/12).</div>
        <button class="btn ghost" data-act="copiar" ${prevHas?'':'disabled'}>Copiar fixos de ${prevLbl}</button></section>
      ${c.vale?`<section class="card"><h2>Vale alimentação</h2><div class="note">${brl(c.vale)} recebidos em vale. Fica fora do saldo.</div></section>`:''}
    </aside>
  </div></div>`;
}
function nomeCartao(id){const c=CARTOES.find(x=>x.id===id);return c?c.nome:'Cartão removido';}
function faturasDoMes(Yy,m){const c=Yy.cc[m];const g={};c.compras.forEach(x=>{(g[x.cartao]=g[x.cartao]||{id:x.cartao,total:0,n:0});g[x.cartao].total+=Number(x.valor)||0;g[x.cartao].n++;});return Object.values(g).map(f=>({...f,pago:!!(c.faturas[f.id]||{}).pago,banco:(c.faturas[f.id]||{}).banco}));}
function blocoFaturasMes(){
  const fs=faturasDoMes(S,cur), terc=S.cc[cur].compras.filter(x=>x.terceiro);
  if(!fs.length) return '';
  const manual=S.months[cur].some(x=>x.tipo==='Despesa'&&x.cat==='Cartão de crédito');
  const linhasF=filtro==='entradas'?'':fs.map(f=>`<div class="ccrow"><div><b>Fatura ${esc(nomeCartao(f.id))}</b><div class="note">${f.n} ${f.n===1?'compra':'compras'} · Despesa · categorias de cada compra</div></div><div class="ccv">${brl(f.total)}</div><button class="paid ${f.pago?'yes':'no'}" data-act="fatpago" data-card="${esc(f.id)}">${f.pago?'Pago':'A pagar'}</button><button class="chip" data-goto="cartoes">Ver compras</button></div>`).join('');
  const linhasT=filtro==='despesas'?'':terc.map(x=>`<div class="ccrow"><div><b>Reembolso – ${esc(x.quem||'outra pessoa')}</b><div class="note">${esc(x.desc)}${x.total>1?` ${x.parcela}/${x.total}`:''} · no cartão ${esc(nomeCartao(x.cartao))}</div></div><div class="ccv">${brl(x.valor)}</div><button class="paid ${x.recebido?'yes':'no'}" data-act="tercrec" data-id="${esc(x.id)}">${x.recebido?'Recebido':'A receber'}</button><span></span></div>`).join('');
  if(!linhasF&&!linhasT) return '';
  return `<div class="ccbox"><div class="note" style="font-weight:600;color:var(--ink)">Dos cartões (automático)</div>${linhasF}${linhasT}
    ${manual?'<div class="banner" style="margin-top:8px">Este mês também tem uma fatura lançada à mão na categoria "Cartão de crédito". Se ela é a mesma fatura da aba Cartões, apague a linha manual para não contar duas vezes.</div>':''}</div>`;
}
function viewBoasVindas(){
  return `<div class="welcome">
    <section class="card"><h2>Trazer seus dados</h2><div class="note">Importe o arquivo de backup (financas-backup-….json). Ele traz todos os lançamentos, metas e patrimônio.</div><button class="btn" data-act="importar">Importar backup</button></section>
    <section class="card"><h2>Sincronizar aparelhos</h2><div class="note">Se você já usa o app em outro aparelho, entre com a mesma conta e os dados descem sozinhos.</div><button class="btn ghost" data-goto="ajustes">Abrir sincronização</button></section>
    <section class="card"><h2>Começar do zero</h2><div class="note">Comece ${HOJE_ANO} com a planilha vazia.</div><button class="btn ghost" data-act="zero">Começar vazio</button></section>
  </div>`;
}

const ROWS_ANO=()=>[
 ['sec','Entradas'],...cats('Renda').map(k=>['cat','Renda',k]),['tot','Total renda',m=>calc(m).renda],
 ['line','Reembolsos',m=>calc(m).reemb],['line','Transferências',m=>calc(m).transf],['tot','Total de entradas',m=>calc(m).entr],
 ['sec','Saídas'],...[...new Set(cats('Despesa').concat(S.months.flat().filter(x=>x.tipo==='Despesa').map(x=>x.cat).concat(S.cc.flatMap(c=>c.compras.map(x=>x.cat)))))].map(k=>['cat','Despesa',k]),['tot','Total de despesas',m=>calc(m).desp],['tot','Investimentos',m=>calc(m).inv],
 ['sec','Resultado'],['res','Sobra do mês',m=>calc(m).sobra],['line','Gasto real (despesas − reembolsos)',m=>calc(m).greal],
 ['line','Sobrou da renda para poupar',m=>calc(m).renda-calc(m).greal],['pct','Taxa de investimento',m=>calc(m).taxa]];
function viewAno(){
  const mm=[...Array(12).keys()], used=mm.filter(m=>calc(m).n);
  const tot=f=>mm.reduce((a,m)=>a+f(m),0);
  const R=tot(m=>calc(m).renda),G=tot(m=>calc(m).greal),I=tot(m=>calc(m).inv),SO=tot(m=>calc(m).sobra);
  const neg=mm.filter(m=>calc(m).n&&calc(m).sobra<0);
  const body=ROWS_ANO().map(r=>{
    if(r[0]==='sec') return `<tr class="sec"><td colspan="15">${r[1]}</td></tr>`;
    let f=r[2],label=r[1];
    if(r[0]==='cat'){const [,tp,k]=r;label=k;f=m=>sum(m,x=>x.tipo===tp&&x.cat===k);}
    const vals=mm.map(f); if(r[0]==='cat'&&vals.every(v=>!v)) return '';
    const t=vals.reduce((a,b)=>a+b,0), avg=used.length?used.reduce((a,m)=>a+vals[m],0)/used.length:0;
    const fm=r[0]==='pct'?pct:brl0, T=r[0]==='pct'?(R?I/R:0):t, A=r[0]==='pct'?T:avg;
    return `<tr class="${r[0]==='tot'||r[0]==='res'?'tot':''}"><td style="white-space:nowrap;${r[0]==='cat'||r[0]==='line'?'padding-left:16px':''}">${esc(label)}</td>${vals.map(v=>`<td class="num ${r[0]==='res'&&v<0?'neg':''}">${v?fm(v):'–'}</td>`).join('')}<td class="num"><b>${fm(T)}</b></td><td class="num">${fm(A)}</td></tr>`;
  }).join('');
  return `<div style="display:flex;flex-direction:column;gap:16px">
  <div class="kpis">
    <div class="kpi"><span class="l">Renda no ano</span><span class="v">${brl0(R)}</span><span class="s">média ${brl0(used.length?R/used.length:0)}/mês</span></div>
    <div class="kpi"><span class="l">Gasto real no ano</span><span class="v">${brl0(G)}</span><span class="s">média ${brl0(used.length?G/used.length:0)}/mês</span></div>
    <div class="kpi"><span class="l">Investido no ano</span><span class="v">${brl0(I)}</span><span class="s">${pct(R?I/R:0)} da renda</span></div>
    <div class="kpi hl"><span class="l">Sobra acumulada</span><span class="v ${SO<0?'neg':'pos'}">${brl0(SO)}</span><span class="s">soma das sobras mensais</span></div>
    <div class="kpi"><span class="l">Meses no vermelho</span><span class="v ${neg.length?'neg':'pos'}">${neg.length}</span><span class="s">${neg.map(m=>MES[m]).join(', ')||'nenhum'}</span></div>
  </div>
  <section class="card"><h2>Renda, gasto real e investimentos por mês</h2><div class="chart"><canvas id="cAno" aria-label="Gráfico de renda, gasto real e investimentos"></canvas></div></section>
  <section class="card"><h2>Resumo mensal de ${ano}</h2><div class="tbl"><table><thead><tr><th></th>${MES.map(m=>`<th class="num">${m}</th>`).join('')}<th class="num">Total</th><th class="num">Média</th></tr></thead><tbody>${body}</tbody></table></div>
  <div class="note">A média considera só os meses com lançamentos.</div></section></div>`;
}
const tok=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
function chartBase(){return {responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{color:tok('--muted'),font:{family:'IBM Plex Sans'},boxWidth:12}},tooltip:{callbacks:{label:c=>c.dataset.label+': '+brl(c.parsed.y)}}},
  scales:{x:{grid:{display:false},ticks:{color:tok('--muted')}},y:{grid:{color:tok('--line')},ticks:{color:tok('--muted'),callback:v=>hide()?'':'R$ '+(v/1000).toLocaleString('pt-BR')+' mil'}}}};}
function chartAno(){ if(!window.Chart) return; const mm=[...Array(12).keys()];
  charts.ano=new Chart(document.getElementById('cAno'),{type:'bar',data:{labels:MES,datasets:[
    {label:'Renda',data:mm.map(m=>calc(m).renda),backgroundColor:tok('--c1'),borderRadius:3},
    {label:'Gasto real',data:mm.map(m=>calc(m).greal),backgroundColor:tok('--c2'),borderRadius:3},
    {label:'Investido',data:mm.map(m=>calc(m).inv),backgroundColor:tok('--c3'),borderRadius:3}]},options:chartBase()});}

function hojeISO(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function norm(y,m){return {y:y+Math.floor(m/12),m:((m%12)+12)%12};}
/* Em qual fatura (mês de vencimento) cai uma compra: compra no dia do fechamento ou depois vai para a próxima */
function faturaDe(card,iso){const y=+iso.slice(0,4),m=+iso.slice(5,7)-1,d=+iso.slice(8,10);const fecha=m+(d>=card.fecha?1:0);return norm(y,card.vence>card.fecha?fecha:fecha+1);}
function parcelas(total,n){const cents=Math.round(total*100),base=Math.floor(cents/n),resto=cents-base*n;return Array.from({length:n},(_,i)=>(base+(i<resto?1:0))/100);}
function addCompra({cartao,data,desc,cat,valor,n,terceiro,quem}){
  const card=CARTOES.find(c=>c.id===cartao); if(!card) return null;
  const f=faturaDe(card,data), grupo=uid(), vals=parcelas(valor,n), keys=new Set();
  vals.forEach((v,i)=>{const t=norm(f.y,f.m+i);yr(t.y).cc[t.m].compras.push({id:uid(),grupo,cartao,data,desc,cat,valor:v,parcela:i+1,total:n,terceiro:!!terceiro,quem:terceiro?quem:'',recebido:false});keys.add(ccKey(t.y,t.m));});
  keys.forEach(touch); return f;
}
function cadaCompra(fn){for(const y in Y){Y[y].cc.forEach((c,m)=>c.compras.forEach(x=>fn(x,+y,m,c)));}}
function apagarGrupo(grupo){const keys=new Set();for(const y in Y){Y[y].cc.forEach((c,m)=>{const n=c.compras.length;c.compras=c.compras.filter(x=>x.grupo!==grupo);if(c.compras.length!==n)keys.add(ccKey(+y,m));});}keys.forEach(touch);}
/* Limite: soma de todas as compras (e parcelas futuras) das faturas ainda não pagas */
function limiteUsado(id){let u=0;cadaCompra((x,y,m,c)=>{if(x.cartao===id&&!(c.faturas[id]||{}).pago)u+=Number(x.valor)||0;});return Math.round(u*100)/100;}
function barraLimite(k){
  if(!k.limite) return `<div class="note">Sem limite cadastrado. Informe o limite em "Seus cartões" para acompanhar quanto ainda pode usar.</div>`;
  const usado=limiteUsado(k.id), disp=Math.round((k.limite-usado)*100)/100, fr=Math.max(0,Math.min(1,disp/k.limite)), cls=fr<0.1?'crit':fr<0.3?'warn':'ok';
  return `<div class="lim" role="group" aria-label="Limite do ${esc(k.nome)}"><div class="limtop"><span class="note">Limite disponível</span><span><b class="${disp<0?'neg':''}">${brl(disp)}</b> <span class="note">de ${brl(k.limite)}</span></span></div>
    <div class="limbar" role="progressbar" aria-valuenow="${Math.round(fr*100)}" aria-valuemin="0" aria-valuemax="100"><div class="fill ${cls}" style="width:${fr*100}%"></div></div>
    <div class="note">${disp<0?`Passou ${brl(-disp)} do limite`:`${brl(usado)} em uso (${pct(usado/k.limite)})`} · libera ao marcar a fatura como paga</div></div>`;
}
function viewCartoes(){
  const c=S.cc[cur], fs=faturasDoMes(S,cur), tot=fs.reduce((a,f)=>a+f.total,0), apagar=fs.filter(f=>!f.pago).reduce((a,f)=>a+f.total,0);
  let futuro=0; cadaCompra((x,y,m)=>{if(y>ano||(y===ano&&m>cur))futuro+=Number(x.valor)||0;});
  const prox=[...Array(6).keys()].map(i=>{const t=norm(ano,cur+1+i),Yy=Y[t.y];const vals=CARTOES.map(k=>Yy?Yy.cc[t.m].compras.filter(x=>x.cartao===k.id).reduce((a,x)=>a+(Number(x.valor)||0),0):0);return {t,vals,total:vals.reduce((a,b)=>a+b,0)};});
  const cardOpts=CARTOES.map(k=>`<option value="${esc(k.id)}">${esc(k.nome)}</option>`).join('');
  const blocoCartao=k=>{
    const lista=c.compras.filter(x=>x.cartao===k.id), f=fs.find(z=>z.id===k.id)||{total:0,n:0,pago:false};
    const fat=c.faturas[k.id]||{}, banco=fat.banco, dif=banco!=null&&banco!==''?Math.round((Number(banco)-f.total)*100)/100:null;
    const venc=`${String(k.vence).padStart(2,'0')}/${pad(cur)}`;
    const rows=lista.map(x=>`<tr data-cc="${esc(x.id)}">
      <td style="min-width:180px"><input class="cell" data-ccf="desc" value="${esc(x.desc)}" aria-label="Descrição">${x.total>1||x.terceiro?`<div class="note" style="padding:0 6px 3px">${x.total>1?`Parcela ${x.parcela} de ${x.total}`:''}${x.total>1&&x.terceiro?' · ':''}${x.terceiro?`de ${esc(x.quem||'outra pessoa')} (vira reembolso)`:''}</div>`:''}</td>
      <td style="min-width:140px"><select class="cell" data-ccf="cat" aria-label="Categoria">${catOpts('Despesa',x.cat)}</select></td>
      <td style="min-width:100px"><input class="cell num" data-ccf="valor" inputmode="decimal" value="${fmtIn(x.valor)}" aria-label="Valor" ${hide()?'readonly':''}></td>
      <td><button class="del" data-act="delcc" title="${x.total>1?'Apagar a compra e todas as parcelas':'Apagar compra'}" aria-label="Apagar">×</button></td></tr>`).join('');
    return `<section class="card"><div class="row"><div><h2>${esc(k.nome)} · fatura de ${MESL[cur]}</h2><div class="note">Vence em ${venc} · fecha todo dia ${k.fecha}</div></div>
      <div class="row" style="gap:10px"><span style="font-family:var(--display);font-size:22px">${brl(f.total)}</span>${f.n?`<button class="paid ${f.pago?'yes':'no'}" data-act="fatpago" data-card="${esc(k.id)}">${f.pago?'Pago':'A pagar'}</button>`:''}</div></div>
      ${barraLimite(k)}
      ${f.n?`<div class="tbl" id="lanc-cc-${esc(k.id)}"><table><thead><tr><th>Compra</th><th>Categoria</th><th class="num">Valor</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`:`<div class="note">Nenhuma compra nesta fatura.</div>`}
      <div class="metaIn"><label for="banco-${esc(k.id)}">Valor que o banco cobrou</label><input id="banco-${esc(k.id)}" data-banco="${esc(k.id)}" inputmode="decimal" placeholder="opcional" value="${fmtIn(banco)}" ${hide()?'readonly':''}>
        ${dif===null?'<span class="note">Digite para conferir com o que foi lançado.</span>':dif===0?'<span class="pill ok">Confere com o banco</span>':dif>0?`<span class="pill part">Faltam ${brl(dif)} em compras</span><button class="btn ghost" data-act="difcc" data-card="${esc(k.id)}" data-dif="${dif}">Lançar diferença como Outros</button>`:`<span class="pill no">Lançado ${brl(-dif)} a mais que o banco</span>`}</div>
    </section>`;
  };
  return `<div style="display:flex;flex-direction:column;gap:16px">
  <div class="kpis k3">
    <div class="kpi hl"><span class="l">Faturas de ${MESL[cur]}</span><span class="v">${brl(tot)}</span><span class="s">${fs.length} ${fs.length===1?'cartão':'cartões'} com compras</span></div>
    <div class="kpi"><span class="l">Ainda a pagar</span><span class="v ${apagar?'':'pos'}">${brl(apagar)}</span><span class="s">faturas não marcadas como pagas</span></div>
    <div class="kpi"><span class="l">Parcelas futuras</span><span class="v">${brl(futuro)}</span><span class="s">já comprometido nos próximos meses</span></div>
  </div>
  <div class="grid2">
    <div style="display:flex;flex-direction:column;gap:16px">
      ${CARTOES.length?CARTOES.map(blocoCartao).join(''):`<section class="card"><h2>Comece cadastrando um cartão</h2><div class="note">Use o card "Seus cartões" ao lado. Você vai precisar do dia em que a fatura fecha e do dia em que ela vence.</div></section>`}
    </div>
    <aside style="display:flex;flex-direction:column;gap:16px">
      ${CARTOES.length?`<section class="card"><h2>Nova compra no cartão</h2>
        <form id="ccForm" class="form" style="grid-template-columns:1fr 1fr">
          <label for="cfData">Data da compra<input class="field" type="date" id="cfData" value="${hojeISO()}" required></label>
          <label for="cfCartao">Cartão<select class="field" id="cfCartao">${cardOpts}</select></label>
          <label for="cfDesc" style="grid-column:1/3">Descrição<input class="field" id="cfDesc" placeholder="Ex.: Mercado, Posto, Farmácia" required></label>
          <label for="cfCat">Categoria<select class="field" id="cfCat">${catOpts('Despesa','Alimentação')}</select></label>
          <label for="cfValor">Valor total<input class="field" id="cfValor" inputmode="decimal" placeholder="0,00" required></label>
          <label for="cfParc">Parcelas<select class="field" id="cfParc">${Array.from({length:24},(_,i)=>`<option value="${i+1}">${i===0?'À vista':(i+1)+'x'}</option>`).join('')}</select></label>
          <label for="cfQuem">De outra pessoa?<input class="field" id="cfQuem" placeholder="Nome, se for"></label>
          <div class="note" id="cfPrev" style="grid-column:1/3"></div>
          <button class="btn" type="submit" style="grid-column:1/3">Adicionar compra</button>
        </form></section>`:''}
      ${CARTOES.length?`<section class="card"><h2>Próximas faturas</h2><div class="tbl"><table><thead><tr><th>Mês</th>${CARTOES.map(k=>`<th class="num">${esc(k.nome)}</th>`).join('')}<th class="num">Total</th></tr></thead><tbody>${prox.map(p=>`<tr><td class="mo">${MES[p.t.m]}/${String(p.t.y).slice(2)}</td>${p.vals.map(v=>`<td class="num">${v?brl0(v):'–'}</td>`).join('')}<td class="num"><b>${p.total?brl0(p.total):'–'}</b></td></tr>`).join('')}</tbody></table></div><div class="note">Só parcelas já lançadas. Compras novas entram conforme você lança.</div></section>`:''}
      <section class="card"><h2>Seus cartões</h2>
        ${CARTOES.map(k=>`<div class="cardbox"><div class="ccrow" style="border:0"><div><b>${esc(k.nome)}</b><div class="note">Fecha dia ${k.fecha} · vence dia ${k.vence}</div></div><label class="note" for="lim-${esc(k.id)}" style="text-align:right">Limite</label><input class="cell num field" id="lim-${esc(k.id)}" data-cardlim="${esc(k.id)}" inputmode="decimal" placeholder="0,00" value="${fmtIn(k.limite)}" style="width:110px" ${hide()?'readonly':''}><button class="del" data-delcard="${esc(k.id)}" title="Remover cartão" aria-label="Remover ${esc(k.nome)}">×</button></div>${k.limite?barraLimite(k):''}</div>`).join('')}
        <form id="cardForm" class="form" style="grid-template-columns:2fr 1fr 1fr">
          <label for="kNome">Nome<input class="field" id="kNome" placeholder="Ex.: Nubank" required></label>
          <label for="kFecha">Fecha dia<input class="field" id="kFecha" type="number" min="1" max="31" placeholder="3" required></label>
          <label for="kVence">Vence dia<input class="field" id="kVence" type="number" min="1" max="31" placeholder="10" required></label>
          <label for="kLimite" style="grid-column:1/4">Limite do cartão (opcional)<input class="field" id="kLimite" inputmode="decimal" placeholder="Ex.: 5.000,00"></label>
          <button class="btn ghost" type="submit" style="grid-column:1/4">Adicionar cartão</button>
        </form>
        <div class="note" id="cardMsg"></div>
      </section>
    </aside>
  </div></div>`;
}
function previewCompra(){
  const el=document.getElementById('cfPrev'); if(!el) return;
  const card=CARTOES.find(c=>c.id===document.getElementById('cfCartao').value), data=document.getElementById('cfData').value;
  const v=parseBR(document.getElementById('cfValor').value), n=+document.getElementById('cfParc').value||1, quem=document.getElementById('cfQuem').value.trim();
  if(!card||!/^\d{4}-\d\d-\d\d$/.test(data)){el.textContent='';return;}
  const f=faturaDe(card,data);
  el.textContent=`Entra na fatura de ${MESL[f.m]}/${f.y} (vence ${String(card.vence).padStart(2,'0')}/${pad(f.m)})`+(v&&n>1?` · ${n}x de ${brl(parcelas(v,n)[0])}, até ${MES[norm(f.y,f.m+n-1).m]}/${norm(f.y,f.m+n-1).y}`:'')+(quem?` · vira reembolso a receber de ${quem}`:'')+(card.limite&&v>card.limite-limiteUsado(card.id)?` · Atenção: passa do limite disponível (${brl(card.limite-limiteUsado(card.id))})`:'');
}
function viewMetas(){
  const C=S.config, meta=Number(C.meta)||0; let acc=0;
  const real=[...Array(12).keys()].map(m=>calc(m).invPago), tot=real.reduce((a,b)=>a+b,0), p=meta?tot/meta:0;
  const rows=real.map((r,m)=>{acc+=r;const pl=Number(C.plan[m])||0;
    const st=r===0?(pl?'<span class="pill no">Não feito</span>':'<span class="note">–</span>'):r>=pl?'<span class="pill ok">Feito</span>':'<span class="pill part">Parcial</span>';
    return `<tr><td class="mo">${MESL[m]}</td><td style="width:150px"><input class="cell num" data-plan="${m}" inputmode="decimal" value="${fmtIn(pl)}" aria-label="Planejado ${MESL[m]}" ${hide()?'readonly':''}></td><td class="num">${r?brl(r):'–'}</td><td class="num">${brl(acc)}</td><td class="num">${pct(meta?acc/meta:0)}</td><td>${st}</td></tr>`;}).join('');
  return `<div style="display:flex;flex-direction:column;gap:16px">
  <section class="card">
    <div class="row"><h2>Meta de investimento ${ano}</h2>
      <label class="metaIn" for="metaIn">Objetivo anual <input id="metaIn" inputmode="decimal" value="${fmtIn(meta)}" ${hide()?'readonly':''}></label></div>
    <div class="row" style="align-items:baseline"><span style="font-family:var(--display);font-size:30px">${brl(tot)}</span><span class="note">${!meta?'Defina o objetivo do ano ao lado':p>=1?`Meta batida: ${brl(tot-meta)} acima do objetivo`:`Faltam ${brl(meta-tot)}`}</span></div>
    <div class="prog" role="progressbar" aria-valuenow="${Math.round(p*100)}" aria-valuemin="0" aria-valuemax="100"><div class="fill" style="width:${Math.min(100,p*100)}%"></div></div>
    <div class="note">${pct(p)} da meta. Conta só investimentos marcados como pagos.</div>
  </section>
  <section class="card"><h2>Mês a mês</h2><div class="tbl"><table><thead><tr><th>Mês</th><th class="num">Planejado</th><th class="num">Realizado</th><th class="num">Acumulado</th><th class="num">% da meta</th><th>Situação</th></tr></thead><tbody>${rows}</tbody></table></div></section></div>`;
}

function totPat(Yy,m){let any=false,s=0;Yy.config.bancos.forEach(b=>{const v=(Yy.config.patrimonio[b]||[])[m];if(v!=null&&v!==''){any=true;s+=Number(v);}});return any?s:null;}
function viewPat(){
  const C=S.config,B=C.bancos,T=[...Array(12).keys()].map(m=>totPat(S,m));
  const last=T.reduce((a,v,i)=>v!=null?i:a,-1), first=T.findIndex(v=>v!=null), decAnt=Y[ano-1]?totPat(Y[ano-1],11):null;
  const head=`<tr><th>Banco</th>${MES.map(m=>`<th class="num">${m}</th>`).join('')}<th></th></tr>`;
  const rows=B.map((b,bi)=>`<tr><td style="white-space:nowrap;font-weight:500">${esc(b)}</td>${MES.map((_,m)=>{const v=(C.patrimonio[b]||[])[m];return `<td style="min-width:96px"><input class="cell num" data-bank="${bi}" data-m="${m}" inputmode="decimal" value="${fmtIn(v)}" aria-label="${esc(b)} ${MES[m]}" ${hide()?'readonly':''}></td>`;}).join('')}<td><button class="del" data-delbank="${bi}" title="Remover banco" aria-label="Remover ${esc(b)}">×</button></td></tr>`).join('');
  const totRow=`<tr class="tot"><td>Total</td>${T.map(v=>`<td class="num">${v!=null?brl0(v):'–'}</td>`).join('')}<td></td></tr>`;
  const varRow=`<tr><td style="white-space:nowrap">Variação no mês</td>${T.map((v,m)=>{const p=m?T[m-1]:decAnt;const d=v!=null&&p!=null?v-p:null;return `<td class="num ${d>0?'pos':d<0?'neg':''}">${d!=null?(d>0?'+':'')+brl0(d):'–'}</td>`;}).join('')}<td></td></tr>`;
  const invRow=`<tr><td style="white-space:nowrap">Investido no mês</td>${MES.map((_,m)=>{const v=calc(m).inv;return `<td class="num">${v?brl0(v):'–'}</td>`;}).join('')}<td></td></tr>`;
  const maior=last>=0?B.slice().sort((a,b)=>((C.patrimonio[b]||[])[last]||0)-((C.patrimonio[a]||[])[last]||0))[0]:null;
  const dif=last>=0&&first>=0?T[last]-T[first]:null;
  return `<div style="display:flex;flex-direction:column;gap:16px">
  <div class="kpis k3">
    <div class="kpi hl"><span class="l">Patrimônio em ${last>=0?MESL[last]:'–'}</span><span class="v">${last>=0?brl(T[last]):'–'}</span><span class="s">soma dos saldos dos bancos</span></div>
    <div class="kpi"><span class="l">Desde ${first>=0?MESL[first]:'–'}</span><span class="v ${dif<0?'neg':'pos'}">${dif!=null?(dif>=0?'+':'')+brl(dif):'–'}</span><span class="s">${dif!=null&&T[first]?pct(dif/T[first])+' de variação':''}</span></div>
    <div class="kpi"><span class="l">Maior saldo</span><span class="v">${maior?esc(maior):'–'}</span><span class="s">${last>=0?'em '+MESL[last]:''}</span></div>
  </div>
  <section class="card"><h2>Evolução do patrimônio</h2><div class="chart"><canvas id="cPat" aria-label="Gráfico da evolução do patrimônio"></canvas></div></section>
  <section class="card"><div class="row"><h2>Saldo de cada banco no fim do mês</h2>
    <form id="bankForm" class="metaIn"><input id="bankName" placeholder="Nome do banco" style="width:160px;text-align:left" aria-label="Novo banco"><button class="btn ghost" type="submit">Adicionar banco</button></form></div>
  <div class="tbl"><table><thead>${head}</thead><tbody>${rows}${totRow}${varRow}${invRow}</tbody></table></div>
  <div class="note">Preencha o saldo no último dia de cada mês. Deixe em branco os meses que ainda não fecharam.</div></section></div>`;
}
function chartPat(){ if(!window.Chart) return;
  const T=MES.map((_,m)=>totPat(S,m)); const ctx=document.getElementById('cPat'); const g=ctx.getContext('2d').createLinearGradient(0,0,0,280);
  const acc=tok('--accent'); g.addColorStop(0,acc+'55'); g.addColorStop(1,acc+'00');
  const o=chartBase(); o.plugins.legend={display:false}; o.plugins.tooltip.callbacks.label=c=>brl(c.parsed.y); o.scales.y.beginAtZero=false;
  const lastI=T.reduce((a,v,i)=>v!=null?i:a,-1);
  charts.pat=new Chart(ctx,{type:'line',data:{labels:MES,datasets:[{data:T,borderColor:acc,backgroundColor:g,fill:true,tension:0,borderWidth:2.5,pointRadius:T.map((_,i)=>i===lastI?5:2.5),pointBackgroundColor:acc}]},options:o});
}

function viewAjustes(){
  const s=settings(), on=syncOn(), A=AUTH||{};
  const catEdit=tp=>`<div><div class="note" style="margin-bottom:6px">${tp==='Despesa'?'Categorias de despesa':'Categorias de renda'}</div>
    <div class="tags">${cats(tp).map(c=>`<span class="tag">${esc(c)}<button data-delcat="${esc(c)}" data-tipo="${tp}" aria-label="Remover ${esc(c)}">×</button></span>`).join('')}</div>
    <form class="metaIn" data-addcat="${tp}" style="margin-top:8px"><input placeholder="Nova categoria" style="width:180px;text-align:left" aria-label="Nova categoria de ${tp}"><button class="btn ghost" type="submit">Adicionar</button></form></div>`;
  return `<div style="display:flex;flex-direction:column;gap:16px">
  <section class="card"><h2>Do seu jeito</h2>
    <div class="form">
      <label for="stNome">Seu nome (aparece na saudação)<input class="field" id="stNome" value="${esc(s.nome)}" placeholder="Ex.: Lucas"></label>
      <label for="stTema">Tema<select class="field" id="stTema">${[['sistema','Igual ao aparelho'],['claro','Claro'],['escuro','Escuro']].map(([k,l])=>`<option value="${k}" ${s.tema===k?'selected':''}>${l}</option>`).join('')}</select></label>
    </div>
    <div><div class="note" style="margin-bottom:6px">Cor do app</div><div class="swatches">${Object.entries(CORES).map(([k,c])=>`<button class="sw ${s.cor===k?'on':''}" data-cor="${k}" title="${c.nome}" aria-label="${c.nome}" style="background:${c.l[0]}"></button>`).join('')}</div></div>
    <label class="note" style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="stOcultar" ${s.ocultar?'checked':''}> Esconder valores ao abrir o app (o ícone de olho no topo faz o mesmo)</label>
  </section>
  <section class="card"><h2>Categorias</h2>${catEdit('Despesa')}${catEdit('Renda')}
    <div class="note">Remover uma categoria só a tira das listas. Lançamentos antigos continuam com ela.</div></section>
  <section class="card"><h2>Sincronização entre aparelhos</h2>
    ${on?`<div class="row"><div><b>Conectado</b> como ${esc(A.email||'')}<div class="note">${LAST_SYNC?'Última sincronização: '+new Date(LAST_SYNC).toLocaleString('pt-BR'):'Ainda não sincronizou'}</div></div>
      <div class="chips"><button class="btn" data-act="sync">Sincronizar agora</button><button class="btn ghost" data-act="sair">Sair</button></div></div>`
    :`<div class="note">Use o seu projeto gratuito do Supabase. O endereço e a chave pública ficam em Project Settings → API. Use a mesma conta em todos os aparelhos.</div>
    <div class="form">
      <label for="sbUrl">Endereço do projeto<input class="field" id="sbUrl" value="${esc(A.url||'')}" placeholder="https://xxxx.supabase.co" autocomplete="off"></label>
      <label for="sbKey">Chave pública (anon)<input class="field" id="sbKey" value="${esc(A.key||'')}" placeholder="eyJhbGciOi…" autocomplete="off"></label>
      <label for="sbEmail">E-mail<input class="field" id="sbEmail" type="email" value="${esc(A.email||'')}" autocomplete="email"></label>
      <label for="sbPass">Senha<input class="field" id="sbPass" type="password" autocomplete="current-password"></label>
    </div>
    <div class="chips"><button class="btn" data-act="entrar">Entrar</button><button class="btn ghost" data-act="criar">Criar conta</button></div>
    <div class="note" id="sbMsg"></div>`}
  </section>
  <section class="card"><h2>Backup</h2>
    <div class="note">Guarde uma cópia de tudo em um arquivo. Serve também para levar os dados para outro aparelho sem sincronização.</div>
    <div class="chips"><button class="btn ghost" data-act="exportar">Exportar backup</button><button class="btn ghost" data-act="importar">Importar backup</button></div>
  </section>
  <section class="card"><h2>Instalar o app</h2>
    <div class="note">iPhone: no Safari, toque em Compartilhar → "Adicionar à Tela de Início". Android: no Chrome, menu ⋮ → "Instalar app". Computador: no Chrome ou Edge, clique no ícone de instalar na barra de endereço.</div>
    ${deferredPrompt?'<button class="btn" data-act="instalar">Instalar agora</button>':''}
  </section>
  <section class="card"><h2>Apagar dados deste aparelho</h2>
    <div class="note">Remove tudo que está guardado neste aparelho. Se a sincronização estiver ligada, os dados continuam na nuvem e voltam quando você entrar de novo.</div>
    <div><button class="btn danger" data-act="apagar">Apagar dados deste aparelho</button></div>
    <div class="note hidden" id="confApagar">Tem certeza? <button class="btn danger" data-act="apagarSim">Sim, apagar</button> <button class="btn ghost" data-act="apagarNao">Cancelar</button></div>
  </section></div>`;
}

/* ============================================================
   Eventos
   ============================================================ */
document.getElementById('months').addEventListener('click',e=>{const b=e.target.closest('button[data-m]');if(b){cur=+b.dataset.m;render();}});
document.getElementById('tabs').addEventListener('click',e=>{const b=e.target.closest('button[data-tab]');if(b){tab=b.dataset.tab;render();}});
document.getElementById('years').addEventListener('click',e=>{
  const b=e.target.closest('button[data-y]'); if(b){setAno(+b.dataset.y);return;}
  const n=e.target.closest('button[data-novo]'); if(n){const y=+n.dataset.novo;yr(y).keep=true;touch(cfgKey(y));setAno(y);}
});
document.getElementById('eye').addEventListener('click',()=>{setSetting({ocultar:!settings().ocultar});render();});
document.getElementById('fileIn').addEventListener('change',e=>{const f=e.target.files[0];if(f)importar(f);e.target.value='';});

const V=document.getElementById('view');
V.addEventListener('click',e=>{
  const f=e.target.closest('[data-filtro]'); if(f){filtro=f.dataset.filtro;render();return;}
  const g=e.target.closest('[data-goto]'); if(g){tab=g.dataset.goto;render();return;}
  const cor=e.target.closest('[data-cor]'); if(cor){setSetting({cor:cor.dataset.cor});render();return;}
  const dc=e.target.closest('[data-delcat]'); if(dc){const s=settings(),tp=dc.dataset.tipo,c=dc.dataset.delcat;
    const ex=Object.assign({},s.catsExtra), oc=Object.assign({},s.catsOcultas);
    if((ex[tp]||[]).includes(c)) ex[tp]=ex[tp].filter(x=>x!==c); else oc[tp]=[...(oc[tp]||[]),c];
    setSetting({catsExtra:ex,catsOcultas:oc}); render(); return;}
  const dk=e.target.closest('[data-delcard]'); if(dk){const id=dk.dataset.delcard;let usado=false;cadaCompra(x=>{if(x.cartao===id)usado=true;});
    if(usado){const m=document.getElementById('cardMsg');if(m)m.textContent='Este cartão tem compras lançadas. Apague as compras antes de remover o cartão.';return;}
    CARTOES=CARTOES.filter(k=>k.id!==id);touch('cartoes');render();return;}
  const db=e.target.closest('[data-delbank]'); if(db){const b=S.config.bancos[+db.dataset.delbank]; S.config.bancos.splice(+db.dataset.delbank,1); delete S.config.patrimonio[b]; touch(cfgKey(ano)); render(); return;}
  const a=e.target.closest('[data-act]'); if(!a) return;
  const act=a.dataset.act;
  if(act==='importar'){document.getElementById('fileIn').click();return;}
  if(act==='exportar'){exportar();return;}
  if(act==='zero'){yr(HOJE_ANO).keep=true;touch(cfgKey(HOJE_ANO));setAno(HOJE_ANO);return;}
  if(act==='entrar'||act==='criar'){entrar(act==='criar');return;}
  if(act==='sair'){sair();return;}
  if(act==='sync'){sync().then(render);return;}
  if(act==='instalar'&&deferredPrompt){deferredPrompt.prompt();deferredPrompt.userChoice.finally(()=>{deferredPrompt=null;render();});return;}
  if(act==='apagar'){document.getElementById('confApagar').classList.remove('hidden');return;}
  if(act==='apagarNao'){document.getElementById('confApagar').classList.add('hidden');return;}
  if(act==='apagarSim'){DOCS={};saveDocs();lsSet('lastSync',0);hydrate();ano=HOJE_ANO;S=yr(ano);applyLook();render();showBanner('Os dados deste aparelho foram apagados.');return;}
  if(act==='fatpago'){const f=S.cc[cur].faturas,id=a.dataset.card;f[id]=Object.assign({},f[id],{pago:!(f[id]||{}).pago});touch(ccKey(ano,cur));render();return;}
  if(act==='tercrec'){const x=S.cc[cur].compras.find(z=>z.id===a.dataset.id);if(x){x.recebido=!x.recebido;touch(ccKey(ano,cur));}render();return;}
  if(act==='delcc'){const tr=a.closest('tr[data-cc]');const x=tr&&S.cc[cur].compras.find(z=>z.id===tr.dataset.cc);if(x)apagarGrupo(x.grupo);render();return;}
  if(act==='difcc'){const v=Number(a.dataset.dif);if(v>0){S.cc[cur].compras.push({id:uid(),grupo:uid(),cartao:a.dataset.card,data:'',desc:'Diferença da fatura',cat:'Outros',valor:v,parcela:1,total:1,terceiro:false,quem:'',recebido:false});touch(ccKey(ano,cur));}render();return;}
  if(act==='copiar'){
    const fixos=prevMonth().filter(x=>{
      if(x.tipo==='Investimento') return true;
      if(['Renda','Reembolso'].includes(x.tipo)) return ['Salário','Aluguel recebido','Reembolso'].includes(x.cat)&&!/nubank|cart[ãa]o|exame|corrida|congresso|whey|pel[íi]cula|col[íi]rio/i.test(x.desc);
      if(x.tipo!=='Despesa') return false;
      return ['Moradia','Financiamento','Dívidas e parcelas','Cuidados pessoais','Oferta e doações'].includes(x.cat)||(x.cat==='Carro'&&/seguro|gasolina/i.test(x.desc))||/\d+\/\d+/.test(x.desc);
    });
    const ja=new Set(S.months[cur].map(x=>x.desc.toLowerCase()));
    fixos.forEach(x=>{ if(ja.has(x.desc.toLowerCase())) return;
      const desc=x.desc.replace(/(\d+)\/(\d+)/,(s,p,q)=>+p<+q?`${+p+1}/${q}`:s); if(/(\d+)\/(\d+)/.test(x.desc)&&desc===x.desc) return;
      S.months[cur].push({id:uid(),desc,cat:x.cat,tipo:x.tipo,valor:x.valor,pago:false});});
    touch(monthKey(ano,cur)); render(); return;
  }
  const tr=a.closest('tr[data-i]'); if(!tr) return;
  if(act==='pago'){const it=S.months[cur][+tr.dataset.i]; it.pago=!it.pago;}
  if(act==='del'){S.months[cur].splice(+tr.dataset.i,1);}
  touch(monthKey(ano,cur)); render();
});
V.addEventListener('change',e=>{
  const t=e.target;
  if(t.id==='aTipo'){document.getElementById('aCat').innerHTML=catOpts(t.value);return;}
  if(t.id==='stNome'){setSetting({nome:t.value.trim()});t.blur();render();return;}
  if(t.id==='stTema'){setSetting({tema:t.value});t.blur();render();return;}
  if(t.id==='stOcultar'){setSetting({ocultar:t.checked});render();return;}
  if(t.closest('#ccForm')){previewCompra();return;}
  if(t.closest('#cardForm')) return;
  if(t.dataset.cardlim!=null){const k=CARTOES.find(z=>z.id===t.dataset.cardlim);if(k){k.limite=t.value.trim()===''?null:parseBR(t.value);touch('cartoes');}t.blur();render();return;}
  if(t.dataset.banco!=null){const f=S.cc[cur].faturas,id=t.dataset.banco;f[id]=Object.assign({},f[id],{banco:t.value.trim()===''?null:parseBR(t.value)});touch(ccKey(ano,cur));t.blur();render();return;}
  const trc=t.closest('tr[data-cc]'); if(trc&&t.dataset.ccf){const x=S.cc[cur].compras.find(z=>z.id===trc.dataset.cc); if(!x) return;
    if(t.dataset.ccf==='valor'){x.valor=parseBR(t.value);touch(ccKey(ano,cur));}
    else{const fld=t.dataset.ccf,val=t.value,g=x.grupo,keys=new Set();cadaCompra((z,y,m)=>{if(z.grupo===g){z[fld]=val;keys.add(ccKey(y,m));}});keys.forEach(touch);}
    t.blur();render();return;}
  if(/^sb/.test(t.id)||t.id==='aDesc'||t.id==='aVal'||t.id==='aCat'||t.id==='aPago'||t.id==='bankName'||t.closest('[data-addcat]')) return;
  if(t.id==='metaIn'){S.config.meta=parseBR(t.value);touch(cfgKey(ano));t.blur();render();return;}
  if(t.dataset.plan!=null){S.config.plan[+t.dataset.plan]=parseBR(t.value);touch(cfgKey(ano));t.blur();render();return;}
  if(t.dataset.bank!=null){const b=S.config.bancos[+t.dataset.bank];const arr=S.config.patrimonio[b]=(S.config.patrimonio[b]||Array(12).fill(null));
    arr[+t.dataset.m]=t.value.trim()===''?null:parseBR(t.value);touch(cfgKey(ano));t.blur();render();return;}
  const tr=t.closest('tr[data-i]'); if(!tr||!t.dataset.f) return;
  const it=S.months[cur][+tr.dataset.i], fld=t.dataset.f;
  if(fld==='valor') it.valor=parseBR(t.value);
  else if(fld==='tipo'){it.tipo=t.value; if(!cats(it.tipo).includes(it.cat)) it.cat=cats(it.tipo)[0]||'Outros';}
  else it[fld]=t.value;
  touch(monthKey(ano,cur)); t.blur(); render();
});
V.addEventListener('input',e=>{if(e.target.closest('#ccForm'))previewCompra();});
V.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.matches('input.cell'))e.target.blur();});
V.addEventListener('submit',e=>{
  e.preventDefault(); const fm=e.target;
  if(fm.id==='addForm'){
    const d=document.getElementById('aDesc').value.trim(), v=parseBR(document.getElementById('aVal').value); if(!d||!v) return;
    S.months[cur].push({id:uid(),desc:d,tipo:document.getElementById('aTipo').value,cat:document.getElementById('aCat').value,valor:v,pago:document.getElementById('aPago').checked});
    yr(ano).keep=true; touch(monthKey(ano,cur)); document.activeElement&&document.activeElement.blur(); render();
    setTimeout(()=>{const x=document.getElementById('aDesc');x&&x.focus();},0); return;
  }
  if(fm.id==='ccForm'){
    const desc=document.getElementById('cfDesc').value.trim(), valor=parseBR(document.getElementById('cfValor').value), data=document.getElementById('cfData').value;
    if(!desc||!valor||!data) return;
    const quem=document.getElementById('cfQuem').value.trim();
    const f=addCompra({cartao:document.getElementById('cfCartao').value,data,desc,cat:document.getElementById('cfCat').value,valor,n:+document.getElementById('cfParc').value||1,terceiro:!!quem,quem});
    document.activeElement&&document.activeElement.blur(); render();
    setTimeout(()=>{const p=document.getElementById('cfPrev');if(p&&f)p.innerHTML=`<b>Lançada na fatura de ${MESL[f.m]}/${f.y}.</b>${f.y!==ano||f.m!==cur?` Para ver, escolha ${MES[f.m]}${f.y!==ano?' de '+f.y:''} na barra de meses.`:''}`;const d=document.getElementById('cfDesc');d&&d.focus();},0); return;
  }
  if(fm.id==='cardForm'){
    const nome=document.getElementById('kNome').value.trim(), fecha=Math.min(31,Math.max(1,+document.getElementById('kFecha').value||0)), vence=Math.min(31,Math.max(1,+document.getElementById('kVence').value||0));
    if(!nome||!fecha||!vence) return;
    if(CARTOES.some(k=>k.nome.toLowerCase()===nome.toLowerCase())){document.getElementById('cardMsg').textContent='Já existe um cartão com esse nome.';return;}
    const limite=parseBR(document.getElementById('kLimite').value)||null;
    CARTOES.push({id:uid(),nome,fecha,vence,limite}); touch('cartoes'); document.activeElement&&document.activeElement.blur(); render(); return;
  }
  if(fm.id==='bankForm'){const n=document.getElementById('bankName').value.trim(); if(!n||S.config.bancos.includes(n)) return;
    S.config.bancos.push(n); S.config.patrimonio[n]=Array(12).fill(null); touch(cfgKey(ano)); document.activeElement.blur(); render(); return;}
  if(fm.dataset.addcat){const tp=fm.dataset.addcat, n=fm.querySelector('input').value.trim(); if(!n) return;
    const s=settings(), ex=Object.assign({},s.catsExtra), oc=Object.assign({},s.catsOcultas);
    if((oc[tp]||[]).includes(n)) oc[tp]=oc[tp].filter(x=>x!==n); else if(!cats(tp).includes(n)) ex[tp]=[...(ex[tp]||[]),n];
    setSetting({catsExtra:ex,catsOcultas:oc}); document.activeElement.blur(); render(); return;}
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{applyLook();render();});

/* ---------- instalação e modo offline ---------- */
let deferredPrompt=null;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;if(tab==='ajustes')render();});
if(!PREVIEW&&'serviceWorker' in navigator){ window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{})); }

/* ---------- início ---------- */
applyLook(); render();
if(PREVIEW){setStatus('busy','Prévia: nada vai para a nuvem');showBanner('Prévia da aba Cartões para validação. Os dados ficam só neste navegador e não afetam o seu app.');}
else if(syncOn()) sync(); else setStatus('','Neste aparelho');
