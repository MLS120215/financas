'use strict';
/* ============================================================
   Meu Bolso — app pessoal de finanças (PWA)
   Dados: guardados no aparelho (localStorage) e sincronizados com o
   Supabase do app. Cada pessoa entra com a própria conta (e-mail e senha).
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
let AUTH=lsGet('auth',null);       // {email, access_token, refresh_token, expires_at, user_id}
/* Servidor do app. O endereço e a chave PÚBLICA podem ficar no código (são feitos para isso):
   quem protege os dados é o login de cada pessoa + as regras (RLS) da tabela no Supabase. */
const SB_URL='https://qzzobwvyhjncjcpkeini.supabase.co';
const SB_KEY='sb_publishable_KNBSBERGxml7mU3qij7MWg_JaM7DaN2';
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
let S=yr(ano), cur=ano===HOJE_ANO?today.getMonth():0, tab='mes', charts={};
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
/* "Já separei o dinheiro": a compra conta como despesa no mês em que foi feita (o dinheiro já saiu), e não pesa no mês da fatura */
function anoDe(Yy){for(const k in Y)if(Y[k]===Yy)return +k;return ano;}
function separadasNoMes(y,m){const pre=`${y}-${pad(m)}`,out=[];cadaCompra((x,yy,mm)=>{if(x.sep&&x.data&&x.data.slice(0,7)===pre)out.push({...x,_fy:yy,_fm:mm});});return out;}
function ccItems(m,Yy){Yy=Yy||S;const c=Yy.cc[m];const out=[];separadasNoMes(anoDe(Yy),m).forEach(x=>out.push({tipo:'Despesa',cat:x.cat,valor:x.valor,pago:true,_cc:1,_sep:1}));c.compras.forEach(x=>{if(!x.sep)out.push({tipo:'Despesa',cat:x.cat,valor:x.valor,pago:!!(c.faturas[x.cartao]||{}).pago,_cc:1});if(x.terceiro)out.push({tipo:'Reembolso',cat:'Reembolso',valor:x.valor,pago:!!x.recebido,_cc:1});});return out;}
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
  root.style.setProperty('--accent',a); root.style.setProperty('--accent-soft',soft); root.style.setProperty('--c1',a); root.style.setProperty('--brand',c.l[0]);
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
function syncOn(){return !PREVIEW&&!!(AUTH&&AUTH.refresh_token);}
function scheduleSync(){ if(!syncOn()){setStatus('','Neste aparelho');return;} setStatus('busy','Alterações a enviar'); clearTimeout(syncT); syncT=setTimeout(sync,1500); }
async function api(path,opt={}){
  const r=await fetch(SB_URL+path,{...opt,headers:{apikey:SB_KEY,'Content-Type':'application/json',...(opt.headers||{})}});
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
    catch(e){ if(e.status===400||e.status===401){ AUTH=Object.assign({},AUTH,{access_token:null,refresh_token:null}); lsSet('auth',AUTH); LOGIN_MODE='entrar'; showLogin('Sua sessão expirou. Entre de novo com seu e-mail e senha.','err'); } throw e; }
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

/* ============================================================
   Tela de acesso: entrar, cadastrar-se, esqueci minha senha, nova senha
   ============================================================ */
let LOGIN_MODE='entrar', RECOVERY=null, LOGIN_BUSY=false;
if(!document.getElementById('login')){const d=document.createElement('div');d.id='login';d.className='hidden';document.body.prepend(d);} // página antiga em cache
function logado(){return PREVIEW?!!lsGet('previewLogin',false):syncOn();}
function showApp(on){document.querySelector('.wrap').classList.toggle('hidden',!on);document.getElementById('login').classList.toggle('hidden',on);}
function showLogin(msg,kind){showApp(false);renderLogin(msg,kind);}
function renderLogin(msg,kind){
  const m=LOGIN_MODE, el=document.getElementById('login');
  const emailVal=(document.getElementById('lgEmail')||{}).value||(AUTH&&AUTH.email)||lsGet('lastEmail','')||'';
  const T={entrar:['Entrar','Entrar'],cadastro:['Criar sua conta','Cadastrar'],esqueci:['Recuperar senha','Enviar link'],nova:['Criar nova senha','Salvar nova senha']}[m];
  const email=m==='nova'?'':`<label for="lgEmail">E-mail<input class="field" id="lgEmail" type="email" inputmode="email" autocomplete="${m==='cadastro'?'email':'username'}" autocapitalize="off" spellcheck="false" value="${esc(emailVal)}" required></label>`;
  const senha=m==='esqueci'?'':`<label for="lgPass">${m==='nova'?'Nova senha':'Senha'}<div class="pw"><input class="field" id="lgPass" type="password" autocomplete="${m==='entrar'?'current-password':'new-password'}" ${m==='entrar'?'':'minlength="6"'} required><button type="button" class="pwt" data-lg="ver" aria-label="Mostrar senha">Mostrar</button></div></label>`;
  const senha2=m==='cadastro'||m==='nova'?`<label for="lgPass2">Confirme a senha<input class="field" id="lgPass2" type="password" autocomplete="new-password" required></label><div class="note" style="margin-top:-6px">Use pelo menos 6 caracteres.</div>`:'';
  const intro=m==='esqueci'?'<div class="note">Digite o e-mail da sua conta. Vamos enviar um link para você criar uma senha nova.</div>':m==='nova'?'<div class="note">Escolha uma senha nova para a sua conta.</div>':'';
  el.innerHTML=`<div class="lg-card">
    <div class="lg-brand"><img src="icons/icon-192.png" alt="" width="84" height="84"><div class="lg-name">Meu Bolso</div><div class="lg-tag">Renda, gastos, metas e patrimônio, mês a mês</div></div>
    <form class="lg-form" id="lgForm" novalidate>
      <h2>${T[0]}</h2>${intro}${email}${senha}${senha2}
      ${m==='entrar'?'<button type="button" class="lg-link lg-forgot" data-lg="esqueci">Esqueci minha senha</button>':''}
      <div class="lg-msg ${kind||''}" id="lgMsg" role="status">${esc(msg||'')}</div>
      <button class="btn lg-btn" type="submit" ${LOGIN_BUSY?'disabled':''}>${T[1]}</button>
      <div class="lg-alt">${m==='entrar'?'Ainda não tem conta? <button type="button" class="lg-link" data-lg="cadastro">Cadastrar-se</button>'
        :m==='nova'?'':'Já tem conta? <button type="button" class="lg-link" data-lg="entrar">Entrar</button>'}</div>
    </form>
  </div>`;
}
function lgMsg(t,kind){const e=document.getElementById('lgMsg');if(e){e.textContent=t;e.className='lg-msg '+(kind||'');}}
function lgBusy(on,txt){LOGIN_BUSY=on;const b=document.querySelector('#lgForm .lg-btn');if(b){b.disabled=on;if(txt)b.textContent=txt;}}
function traduzErro(e){
  const m=(e&&e.message)||'';
  if(!online()) return 'Sem internet. Conecte-se para entrar.';
  if(e instanceof TypeError||/failed to fetch|load failed|networkerror/i.test(m)) return 'Não foi possível falar com o servidor. Verifique sua internet e tente de novo.';
  if(/invalid login|invalid_credentials/i.test(m)) return 'E-mail ou senha incorretos.';
  if(/not confirmed/i.test(m)) return 'Seu e-mail ainda não foi confirmado. Abra o link que enviamos e tente de novo.';
  if(/already registered|already exists/i.test(m)) return 'Já existe uma conta com esse e-mail. Toque em "Entrar".';
  if(/not authorized/i.test(m)) return 'O servidor do app ainda não está liberado para enviar e-mails para esse endereço.';
  if(/rate limit|too many|security purposes/i.test(m)||e.status===429) return 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.';
  if(/different from the old|same password/i.test(m)) return 'A senha nova precisa ser diferente da anterior.';
  if(/password/i.test(m)&&/(6|short|weak|characters)/i.test(m)) return 'A senha precisa ter pelo menos 6 caracteres.';
  if(/valid email|invalid.*email|email.*invalid/i.test(m)) return 'Esse e-mail não parece válido. Confira e tente de novo.';
  if(e.status===401||/expired|invalid.*token|jwt/i.test(m)) return 'O link expirou ou já foi usado. Peça um novo em "Esqueci minha senha".';
  return 'Não deu certo: '+m;
}
const emailOk=v=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
async function lgSubmit(){
  if(LOGIN_BUSY) return;
  const m=LOGIN_MODE, g=id=>(document.getElementById(id)||{}).value||'';
  const email=g('lgEmail').trim().toLowerCase(), p1=g('lgPass'), p2=g('lgPass2');
  if(m!=='nova'&&!emailOk(email)) return lgMsg('Digite um e-mail válido.','err');
  if(m==='entrar'&&!p1) return lgMsg('Digite a sua senha.','err');
  if((m==='cadastro'||m==='nova')&&p1.length<6) return lgMsg('A senha precisa ter pelo menos 6 caracteres.','err');
  if((m==='cadastro'||m==='nova')&&p1!==p2) return lgMsg('As duas senhas não são iguais.','err');
  if(email) lsSet('lastEmail',email);
  if(PREVIEW){ // prévia: nada vai para a internet
    if(m==='esqueci'){lgMsg('Prévia: no app de verdade, chega um e-mail com o link para criar a senha nova.','ok');return;}
    lsSet('previewLogin',true); lsSet('previewEmail',email||'voce@exemplo.com'); entrarNoApp(); return;
  }
  try{
    if(m==='entrar'){lgBusy(true,'Entrando…');
      const j=await api('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email,password:p1})});
      await depoisDoLogin(j);
    }else if(m==='cadastro'){lgBusy(true,'Criando a conta…');
      const j=await api('/auth/v1/signup',{method:'POST',body:JSON.stringify({email,password:p1})});
      if(j&&j.access_token){await depoisDoLogin(j);showBanner('Conta criada. Bem-vindo ao Meu Bolso!');}
      else{lgBusy(false);LOGIN_MODE='entrar';renderLogin(`Conta criada! Enviamos um link de confirmação para ${email}. Abra o e-mail, toque no link e depois entre aqui.`,'ok');}
    }else if(m==='esqueci'){lgBusy(true,'Enviando…');
      await api('/auth/v1/recover',{method:'POST',body:JSON.stringify({email})});
      lgBusy(false,'Enviar link');lgMsg(`Pronto! Se existir uma conta com ${email}, você vai receber um link para criar uma senha nova. Confira também a caixa de spam.`,'ok');
    }else if(m==='nova'){lgBusy(true,'Salvando…');
      await api('/auth/v1/user',{method:'PUT',headers:{Authorization:'Bearer '+RECOVERY.access_token},body:JSON.stringify({password:p1})});
      const j=RECOVERY; RECOVERY=null; await depoisDoLogin(j);
      showBanner('Senha nova salva. Se você usa o app instalado na tela de início, abra-o e entre com a senha nova.');
    }
  }catch(e){lgBusy(false);renderLogin(traduzErro(e),'err');}
}
/* Depois de entrar: guarda a sessão e cuida para não misturar dados de contas diferentes no mesmo aparelho */
async function depoisDoLogin(j){
  if(!j.user){ j.user=await api('/auth/v1/user',{headers:{Authorization:'Bearer '+j.access_token}}); }
  AUTH=null; setSession(j); LOGIN_BUSY=false;
  const dono=lsGet('owner',null);
  if(dono&&dono!==AUTH.user_id){ DOCS={}; saveDocs(); LAST_SYNC=0; lsSet('lastSync',0); }      // outra conta: começa limpo e baixa os dados dela
  else if(!dono&&hasData()){ Object.keys(DOCS).forEach(k=>{DOCS[k].dirty=true;}); saveDocs(); } // dados de antes do login sobem para a conta
  lsSet('owner',AUTH.user_id);
  entrarNoApp(); await sync();
}
function entrarNoApp(){
  hydrate(); ano=HOJE_ANO; S=yr(ano); cur=today.getMonth(); tab='mes';
  applyLook(); showApp(true); render(); window.scrollTo(0,0);
  if(PREVIEW){setStatus('busy','Prévia: nada vai para a nuvem');showBanner('Prévia para validação. Os dados são de exemplo e ficam só neste navegador.');}
}
async function sair(forcar){
  const txt=document.getElementById('confSairTxt');
  if(!PREVIEW&&!forcar&&Object.values(DOCS).some(d=>d.dirty)){
    if(txt) txt.textContent='Enviando suas últimas alterações…';
    try{await sync();}catch(e){}
    if(Object.values(DOCS).some(d=>d.dirty)){
      const box=document.getElementById('confSair');
      if(box) box.innerHTML='<div>Algumas alterações ainda não foram para a nuvem (sem internet?). Se sair agora, elas se perdem.</div><div class="chips" style="margin-top:8px"><button class="btn" data-act="sairSim">Tentar de novo</button><button class="btn danger" data-act="sairForce">Sair mesmo assim</button><button class="btn ghost" data-act="sairNao">Cancelar</button></div>';
      return;
    }
  }
  if(PREVIEW){lsSet('previewLogin',false);LOGIN_MODE='entrar';showLogin('Você saiu da sua conta.','ok');return;}
  const tk=AUTH&&AUTH.access_token;
  if(tk) fetch(SB_URL+'/auth/v1/logout',{method:'POST',headers:{apikey:SB_KEY,Authorization:'Bearer '+tk}}).catch(()=>{});
  DOCS={}; saveDocs(); AUTH=null; lsSet('auth',null); lsSet('owner',null); LAST_SYNC=0; lsSet('lastSync',0);
  hydrate(); S=yr(ano); setStatus('','');
  LOGIN_MODE='entrar'; showLogin('Você saiu da sua conta.','ok');
}
/* Links que chegam por e-mail (confirmação de conta e senha nova) voltam para o app com os dados depois do # */
function lerLinkDoEmail(){
  const h=location.hash.slice(1); if(!h||!/access_token=|error=/.test(h)) return null;
  const p=new URLSearchParams(h); history.replaceState(null,'',location.pathname+location.search);
  if(p.get('error')||p.get('error_description')){
    const exp=p.get('error_code')==='otp_expired'||/expired/i.test(p.get('error_description')||'');
    return {erro:exp?'Esse link expirou ou já foi usado. Peça um novo.':'Não foi possível validar o link do e-mail. Tente de novo.'};
  }
  return {tipo:p.get('type'),j:{access_token:p.get('access_token'),refresh_token:p.get('refresh_token'),expires_in:+p.get('expires_in')||3600}};
}
document.getElementById('login').addEventListener('submit',e=>{e.preventDefault();lgSubmit();});
document.getElementById('login').addEventListener('click',e=>{
  const b=e.target.closest('[data-lg]'); if(!b) return;
  const a=b.dataset.lg;
  if(a==='ver'){const i=document.getElementById('lgPass'),i2=document.getElementById('lgPass2'),ver=i.type==='password';[i,i2].forEach(x=>{if(x)x.type=ver?'text':'password';});b.textContent=ver?'Ocultar':'Mostrar';b.setAttribute('aria-label',ver?'Ocultar senha':'Mostrar senha');return;}
  LOGIN_MODE=a; renderLogin(''); const f=document.querySelector('#lgForm .field'); f&&f.focus();
});

/* ---------- backup ---------- */
function exportar(){
  const payload={app:'financas',versao:1,exportado:new Date().toISOString(),docs:Object.fromEntries(Object.entries(DOCS).map(([k,v])=>[k,v.data]))};
  const blob=new Blob([JSON.stringify(payload,null,1)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download='meu-bolso-backup-'+new Date().toISOString().slice(0,10)+'.json'; document.body.appendChild(a); a.click();
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
    }catch(e){ showBanner('Esse arquivo não é um backup do app Meu Bolso.',true); }
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
  document.getElementById('h1').textContent='Meu Bolso';
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
document.addEventListener('click',e=>{if(FP&&e.target.isConnected&&!e.target.closest('.fwrap')){FP=null;FSTEP=null;render();}});   // tocar fora fecha
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&FP&&!document.querySelector('.modal')){if(FSTEP){FSTEP=null;}else{FP=null;}render();}});

function catOpts(tipo,sel){const l=cats(tipo);return l.concat(sel&&!l.includes(sel)?[sel]:[]).map(c=>`<option ${c===sel?'selected':''}>${esc(c)}</option>`).join('');}
function tipoOpts(sel){return TIPOS.map(t=>`<option ${t===sel?'selected':''}>${t}</option>`).join('');}
/* ---------- filtros e datas dos lançamentos ---------- */
let CARDFORM=false;   // formulário de novo cartão aberto?
let F={tipo:'',cat:'',valor:'',sit:''};            // aba Mês
let FC={cartao:'',cat:'',valor:'',sit:''};         // compras no cartão
const FAIXAS=[['','Valor'],['0-100','Até R$ 100'],['100-500','R$ 100 a R$ 500'],['500-1000','R$ 500 a R$ 1.000'],['1000-','Acima de R$ 1.000']];
function naFaixa(v,f){if(!f)return true;const [a,b]=f.split('-');v=Math.abs(Number(v)||0);return v>=(+a||0)&&(b===''||v<=+b);}
function tipoOk(f,tipo){return !f||(f==='entradas'?(ENTRADA.has(tipo)||tipo==='Vale (benefício)'):tipo===f);}
function sitOk(f,pago){return !f||(f==='pago'?pago:!pago);}
function compraSitOk(f,x){return !f||(f==='separada'?!!x.sep:f==='avista'?x.total<=1:f==='parcelada'?x.total>1:f==='terceiro'?!!x.terceiro:true);}
function filtrosAtivos(o){return Object.values(o).some(Boolean);}
function diasNoMes(y,m){return new Date(y,m+1,0).getDate();}
function isoDe(y,m,d){return `${y}-${pad(m)}-${String(d).padStart(2,'0')}`;}
function diaDe(x){return x&&typeof x.data==='string'&&/^\d{4}-\d\d-\d\d$/.test(x.data)?+x.data.slice(8,10):0;}
function diaPadrao(){const h=new Date();return (ano===h.getFullYear()&&cur===h.getMonth())?h.getDate():1;}
const ICO_LAPIS='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg>';
const ICO_COFRE='<svg class="ico-cofre" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 8.5c-.6-1-1.5-1.8-2.6-2.3L17 3.5l-3 1.3A9 9 0 0 0 12 4.6c-4.4 0-8 2.9-8 6.6 0 2 1 3.8 2.6 5L7 20h3l.6-1.6c.5.1 1 .1 1.4.1s1 0 1.4-.1L14 20h3l.5-3.6c.9-.7 1.6-1.5 2-2.4H21v-4h-1.5c-.1-.5-.3-1-.5-1.5z"/><circle cx="15.5" cy="10" r=".6" fill="currentColor"/></svg>';
const ICO_LIXO='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6"/></svg>';
/* janela de confirmação do próprio app (o confirm() do navegador é feio e não funciona em todo lugar) */
/* janela com as compras da fatura que já tiveram o dinheiro separado */
function janelaSeparadas(cardId,fy,fm,doMes){
  if(fy==null){fy=ano;fm=cur;}
  const base=doMes?separadasNoMes(ano,cur).filter(x=>x.cartao===cardId&&x._fy===fy&&x._fm===fm):yr(fy).cc[fm].compras.filter(x=>x.cartao===cardId&&x.sep);
  const lista=base.slice().sort((a,b)=>(a.data||'').localeCompare(b.data||''));
  const tot=lista.reduce((a,x)=>a+(Number(x.valor)||0),0);
  const ant=document.activeElement, w=document.createElement('div'); w.className='modal-fundo';
  w.innerHTML=`<div class="modal modal-lista" role="dialog" aria-modal="true" aria-labelledby="sjT">
    <div class="sj-top"><div><h2 id="sjT">Compras com dinheiro separado</h2><div class="note">${doMes?`Feitas em ${MESL[cur].toLowerCase()} · `:''}Fatura ${esc(nomeCartao(cardId))} – ${MESL[fm]}${fy!==ano?'/'+fy:''}</div></div><button class="sj-x" data-r="0" aria-label="Fechar">×</button></div>
    <ul class="sj-lista">${lista.map(x=>{const d=x.data?{m:+x.data.slice(5,7)-1}:null;return `<li><div><b>${esc(x.desc)}</b><div class="note">${x.data?fmtData(x.data):'sem data'} · ${esc(x.cat)}${d&&!doMes?` · separado em ${MESL[d.m].toLowerCase()}`:''}</div></div><span class="sj-v">${brl(x.valor)}</span></li>`;}).join('')}</ul>
    <div class="sj-tot"><span>Total separado (${lista.length} ${lista.length===1?'compra':'compras'})</span><b>${brl(tot)}</b></div>
    <div class="modal-bt"><button class="btn ghost" data-r="0">Fechar</button><button class="btn" data-r="1">Ver na aba Cartões</button></div></div>`;
  const fim=v=>{document.removeEventListener('keydown',tecla,true);w.remove();if(v){if(fy!==ano){ano=fy;S=yr(fy);}cur=fm;tab='cartoes';render();}else ant&&ant.focus&&ant.focus();};
  const tecla=e=>{if(e.key==='Escape'){e.preventDefault();fim(false);}};
  w.addEventListener('click',e=>{const b=e.target.closest('[data-r]');if(b)fim(b.dataset.r==='1');else if(e.target===w)fim(false);});
  document.addEventListener('keydown',tecla,true);
  document.body.appendChild(w); w.querySelector('.sj-x').focus();
}
/* janela para editar um lançamento do mês (data, descrição, tipo, categoria, valor e situação) */
function janelaEditar(i){
  const y=ano, m=cur, it=yr(y).months[m][i]; if(!it) return;
  const l=limMes(), dd=diaDe(it)?it.data:'';
  const ant=document.activeElement, w=document.createElement('div'); w.className='modal-fundo';
  w.innerHTML=`<form class="modal modal-lista modal-edit" role="dialog" aria-modal="true" aria-labelledby="edT" novalidate>
    <div class="sj-top"><div><h2 id="edT">Editar lançamento</h2><div class="note">${MESL[m]} de ${y}</div></div><button type="button" class="sj-x" data-r="0" aria-label="Fechar">×</button></div>
    <div class="ed-grid">
      <label class="ed-full">Descrição<input class="field" id="eDesc" value="${esc(it.desc)}" required></label>
      <label>Data<input class="field" type="date" id="eData" value="${dd}" min="${l.min}" max="${l.max}"></label>
      <label>Valor (R$)<input class="field" id="eVal" inputmode="decimal" autocomplete="off" value="${hide()?'':fmtMoeda(it.valor)}" placeholder="0,00" required></label>
      <label>Tipo<select class="field" id="eTipo">${tipoOpts(it.tipo)}</select></label>
      <label>Categoria<select class="field" id="eCat">${catOpts(it.tipo,it.cat)}</select></label>
      <label class="ed-full ed-chk"><input type="checkbox" id="ePago" ${it.pago?'checked':''}> <span id="ePagoT">${ENTRADA.has(it.tipo)?'Já recebido':'Já pago'}</span></label>
    </div>
    <div class="modal-bt"><button type="button" class="btn ghost" data-r="0">Cancelar</button><button type="submit" class="btn">Salvar</button></div></form>`;
  const fim=()=>{document.removeEventListener('keydown',tecla,true);w.remove();ant&&ant.focus&&ant.isConnected&&ant.focus();};
  const tecla=e=>{if(e.key==='Escape'){e.preventDefault();fim();}};
  const q=id=>w.querySelector('#'+id);
  q('eTipo').addEventListener('change',()=>{const t=q('eTipo').value,c=q('eCat').value;q('eCat').innerHTML=catOpts(t,cats(t).includes(c)?c:(cats(t)[0]||'Outros'));q('ePagoT').textContent=ENTRADA.has(t)?'Já recebido':'Já pago';});
  w.addEventListener('click',e=>{if(e.target.closest('[data-r]')||e.target===w)fim();});
  w.querySelector('form').addEventListener('submit',e=>{e.preventDefault();
    const d=q('eDesc').value.trim(), v=hide()&&!q('eVal').value?it.valor:parseBR(q('eVal').value), dt=q('eData').value;
    if(!d){avisoCampo(q('eDesc'),'Escreva uma descrição (ex.: Mercado).');return;}
    if(!(v>0)){avisoCampo(q('eVal'),'Digite um valor maior que zero, só com números (ex.: 18,50).');return;}
    if(dt&&dt.slice(0,7)!==`${y}-${pad(m)}`){avisoCampo(q('eData'),`Escolha um dia de ${MESL[m]}.`);return;}
    it.desc=d; it.valor=v; it.tipo=q('eTipo').value; it.cat=q('eCat').value; it.pago=q('ePago').checked; if(dt) it.data=dt; else delete it.data;
    touch(monthKey(y,m)); fim(); render();});
  document.addEventListener('keydown',tecla,true);
  document.body.appendChild(w); q('eDesc').focus();
}
/* janela para editar uma compra do cartão (descrição, categoria, valor e dinheiro separado) */
function janelaEditarCompra(id){
  const y=ano, m=cur, x=yr(y).cc[m].compras.find(z=>z.id===id); if(!x) return;
  const k=CARTOES.find(z=>z.id===x.cartao)||{}, parc=x.total>1, podeSep=k.separa&&!parc;
  const ant=document.activeElement, w=document.createElement('div'); w.className='modal-fundo';
  w.innerHTML=`<form class="modal modal-lista modal-edit" role="dialog" aria-modal="true" aria-labelledby="ecT" novalidate>
    <div class="sj-top"><div><h2 id="ecT">Editar compra</h2><div class="note">${esc(k.nome||'Cartão')} · ${x.data?fmtData(x.data):'sem data'}${parc?` · parcela ${x.parcela} de ${x.total}`:''}</div></div><button type="button" class="sj-x" data-r="0" aria-label="Fechar">×</button></div>
    <div class="ed-grid">
      <label class="ed-full">Descrição<input class="field" id="ecDesc" value="${esc(x.desc)}" required></label>
      <label>Categoria<select class="field" id="ecCat">${catOpts('Despesa',x.cat)}</select></label>
      <label>Valor${parc?' da parcela':''} (R$)<input class="field" id="ecVal" inputmode="decimal" autocomplete="off" value="${hide()?'':fmtMoeda(x.valor)}" placeholder="0,00" required></label>
      ${podeSep?`<label class="ed-full ed-chk"><input type="checkbox" id="ecSep" ${x.sep?'checked':''}> Já separei o dinheiro desta compra</label>`:''}
    </div>
    <div class="note">${parc?'A descrição e a categoria mudam em todas as parcelas; o valor muda só nesta parcela. ':''}Para mudar a data ou o cartão, exclua a compra e lance de novo.</div>
    <div class="modal-bt"><button type="button" class="btn ghost" data-r="0">Cancelar</button><button type="submit" class="btn">Salvar</button></div></form>`;
  const fim=()=>{document.removeEventListener('keydown',tecla,true);w.remove();ant&&ant.focus&&ant.isConnected&&ant.focus();};
  const tecla=e=>{if(e.key==='Escape'){e.preventDefault();fim();}};
  const q=i=>w.querySelector('#'+i);
  w.addEventListener('click',e=>{if(e.target.closest('[data-r]')||e.target===w)fim();});
  w.querySelector('form').addEventListener('submit',e=>{e.preventDefault();
    const d=q('ecDesc').value.trim(), v=hide()&&!q('ecVal').value?x.valor:parseBR(q('ecVal').value), c=q('ecCat').value;
    if(!d){avisoCampo(q('ecDesc'),'Escreva uma descrição (ex.: Mercado).');return;}
    if(!(v>0)){avisoCampo(q('ecVal'),'Digite um valor maior que zero, só com números (ex.: 18,50).');return;}
    const keys=new Set([ccKey(y,m)]);
    cadaCompra((z,yy,mm)=>{if(z.grupo===x.grupo&&(z.desc!==d||z.cat!==c)){z.desc=d;z.cat=c;keys.add(ccKey(yy,mm));}});
    x.valor=v; if(podeSep){if(q('ecSep').checked)x.sep=true;else delete x.sep;}
    keys.forEach(touch); fim(); render();});
  document.addEventListener('keydown',tecla,true);
  document.body.appendChild(w); q('ecDesc').focus();
}
/* janela para editar um cartão: nome, fechamento, vencimento, limite e dinheiro separado */
function janelaEditarCartao(id){
  const k=CARTOES.find(z=>z.id===id); if(!k) return;
  const ant=document.activeElement, w=document.createElement('div'); w.className='modal-fundo';
  w.innerHTML=`<form class="modal modal-lista modal-edit" role="dialog" aria-modal="true" aria-labelledby="ekT" novalidate>
    <div class="sj-top"><div><h2 id="ekT">Editar cartão</h2><div class="note">${esc(k.nome)}</div></div><button type="button" class="sj-x" data-r="0" aria-label="Fechar">×</button></div>
    <div class="ed-grid">
      <label class="ed-full">Nome<input class="field" id="ekNome" value="${esc(k.nome)}" required></label>
      <label>Fecha dia<input class="field" id="ekFecha" type="number" inputmode="numeric" min="1" max="31" value="${k.fecha}" required></label>
      <label>Vence dia<input class="field" id="ekVence" type="number" inputmode="numeric" min="1" max="31" value="${k.vence}" required></label>
      <label class="ed-full">Limite do cartão (R$)<input class="field" id="ekLim" inputmode="decimal" autocomplete="off" value="${hide()||!k.limite?'':fmtMoeda(k.limite)}" placeholder="Opcional (ex.: 5.000,00)"></label>
      <label class="sepbox ed-full" for="ekSep"><input type="checkbox" id="ekSep" ${k.separa?'checked':''}><span><b>Separo o dinheiro na hora da compra</b><span class="note">Para cartões com cashback, pontos ou milhas. Liga a caixinha "Já separei o dinheiro desta compra" nas compras à vista deste cartão.</span></span></label>
    </div>
    <div class="note">Mudar o fechamento ou o vencimento vale para as próximas compras. As que já foram lançadas continuam nas faturas onde estão.</div>
    <div class="modal-bt"><button type="button" class="btn ghost" data-r="0">Cancelar</button><button type="submit" class="btn">Salvar</button></div></form>`;
  const fim=()=>{document.removeEventListener('keydown',tecla,true);w.remove();ant&&ant.focus&&ant.isConnected&&ant.focus();};
  const tecla=e=>{if(e.key==='Escape'){e.preventDefault();fim();}};
  const q=i=>w.querySelector('#'+i);
  w.addEventListener('click',e=>{if(e.target.closest('[data-r]')||e.target===w)fim();});
  w.querySelector('form').addEventListener('submit',e=>{e.preventDefault();
    const nome=q('ekNome').value.trim(), fe=+q('ekFecha').value, ve=+q('ekVence').value, lt=q('ekLim').value.trim();
    if(!nome){avisoCampo(q('ekNome'),'Escreva o nome do cartão (ex.: Nubank).');return;}
    if(CARTOES.some(z=>z.id!==id&&z.nome.toLowerCase()===nome.toLowerCase())){avisoCampo(q('ekNome'),'Já existe outro cartão com esse nome.');return;}
    if(!(fe>=1&&fe<=31&&Number.isInteger(fe))){avisoCampo(q('ekFecha'),'Escolha um dia de 1 a 31.');return;}
    if(!(ve>=1&&ve<=31&&Number.isInteger(ve))){avisoCampo(q('ekVence'),'Escolha um dia de 1 a 31.');return;}
    k.nome=nome; k.fecha=fe; k.vence=ve;
    if(!(hide()&&!lt)) k.limite=lt?parseBR(lt)||null:null;
    if(q('ekSep').checked) k.separa=true; else delete k.separa;
    touch('cartoes'); fim(); render();});
  document.addEventListener('keydown',tecla,true);
  document.body.appendChild(w); q('ekNome').focus();
}
function confirmar({titulo,texto,ok='Excluir',unico=false}){
  return new Promise(res=>{
    const ant=document.activeElement, w=document.createElement('div'); w.className='modal-fundo';
    w.innerHTML=`<div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="mdT" aria-describedby="mdX">
      <div class="modal-ico">${ICO_LIXO}</div><h2 id="mdT">${esc(titulo)}</h2><p id="mdX">${texto}</p>
      <div class="modal-bt${unico?' um':''}">${unico?`<button class="btn" data-r="0">${esc(ok)}</button>`:`<button class="btn ghost" data-r="0">Cancelar</button><button class="btn perigo" data-r="1">${esc(ok)}</button>`}</div></div>`;
    const fim=v=>{document.removeEventListener('keydown',tecla,true);w.remove();ant&&ant.focus&&ant.focus();res(v);};
    const tecla=e=>{if(e.key==='Escape'){e.preventDefault();fim(false);}};
    w.addEventListener('click',e=>{const b=e.target.closest('[data-r]');if(b)fim(b.dataset.r==='1');else if(e.target===w)fim(false);});
    document.addEventListener('keydown',tecla,true);
    document.body.appendChild(w); w.querySelector('[data-r="0"]').focus();
  });
}
function limMes(){return {min:isoDe(ano,cur,1),max:isoDe(ano,cur,diasNoMes(ano,cur))};}
const ICO_CAL='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>';
/* data da linha: mostra "25/11" e abre o calendário do aparelho ao tocar */
function campoData(x){const l=limMes(),d=diaDe(x)?x.data:'';
  return `<label class="dt" title="Mudar a data">${d?`${d.slice(8,10)}/${d.slice(5,7)}`:'Sem data'}${ICO_CAL}<input type="date" data-f="data" value="${d}" min="${l.min}" max="${l.max}" aria-label="Data"></label>`;}
function fmtData(iso){return /^\d{4}-\d\d-\d\d$/.test(iso||'')?`${iso.slice(8,10)}/${iso.slice(5,7)}/${iso.slice(0,4)}`:'';}
/* ---------- filtro em caminho: Filtrar → escolher o tipo de filtro → escolher a opção ---------- */
let FP=null, FSTEP=null;   // painel aberto ('mes'|'cc') e passo (null = "Filtrar por"; senão a chave do grupo)
const ICO_FUNIL='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5h18l-7 8.5V19l-4 2v-7.5z"/></svg>';
const ICO_SETA='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
const ICO_VOLTA='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>';
const ICO_OK='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
function contar(lista,fn){const m=new Map();lista.forEach(x=>{[].concat(fn(x)).forEach(k=>m.set(k,(m.get(k)||0)+1));});return m;}
function barraCaminho(id,grupos,o,nVis,nTot,palavra){
  const ativos=grupos.filter(g=>o[g.k]);
  const rot=g=>{const op=g.opts.find(([v])=>v===o[g.k]);return op?op[1]:o[g.k];};
  let painel='';
  if(FP===id){
    const g=grupos.find(x=>x.k===FSTEP);
    painel=!g?`<div class="fmenu" role="menu" aria-label="Filtrar por">
        <div class="fmhead"><b>Filtrar por</b></div>
        ${grupos.map(x=>`<button type="button" class="fmrow" role="menuitem" data-fstep="${x.k}"><span>${x.t}</span><span class="fmval">${o[x.k]?esc(rot(x)):x.todos}</span>${ICO_SETA}</button>`).join('')}
      </div>`
      :`<div class="fmenu" role="menu" aria-label="${g.t}">
        <div class="fmhead"><button type="button" class="fmback" data-fstep="" aria-label="Voltar">${ICO_VOLTA}</button><b>${g.t}</b></div>
        <div class="fmlist">
        <button type="button" class="fmrow fmopt ${!o[g.k]?'on':''}" role="menuitemradio" aria-checked="${!o[g.k]}" data-fset="${id}" data-k="${g.k}" data-v=""><span>${g.todos}</span><span class="fmval">${nTot}</span><span class="fmck">${!o[g.k]?ICO_OK:''}</span></button>
        ${g.opts.map(([v,l,n])=>`<button type="button" class="fmrow fmopt ${o[g.k]===v?'on':''}" role="menuitemradio" aria-checked="${o[g.k]===v}" data-fset="${id}" data-k="${g.k}" data-v="${esc(v)}"><span>${esc(l)}</span><span class="fmval">${n||0}</span><span class="fmck">${o[g.k]===v?ICO_OK:''}</span></button>`).join('')}
        </div></div>`;
  }
  return `<div class="fbar">
    <div class="fwrap"><button type="button" class="fbtn ${ativos.length?'on':''}" data-fp="${id}" aria-expanded="${FP===id}">${ICO_FUNIL}<span>Filtrar</span></button>${painel}</div>
    ${ativos.map(g=>`<button type="button" class="fchip" data-fx="${id}" data-k="${g.k}" title="Tirar este filtro"><span>${g.t}: <b>${esc(rot(g))}</b></span><span class="fx" aria-hidden="true">✕</span></button>`).join('')}
    ${ativos.length?`<span class="note fres">${nVis} de ${nTot} ${palavra}</span>`:''}
  </div>`;
}
function barraFiltrosMes(todos,nVis){
  const cT=contar(todos,x=>[x.tipo].concat(ENTRADA.has(x.tipo)||x.tipo==='Vale (benefício)'?['entradas']:[])), cC=contar(todos,x=>x.cat), cS=contar(todos,x=>x.pago?'pago':'pend');
  const cV=new Map(FAIXAS.slice(1).map(([f])=>[f,todos.filter(x=>naFaixa(x.valor,f)).length]));
  const cats=[...new Set(todos.map(x=>x.cat).filter(Boolean).concat(F.cat?[F.cat]:[]))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
  return barraCaminho('mes',[
    {k:'tipo',t:'Tipo',todos:'Todos os tipos',opts:[['entradas','Entradas (todas)',cT.get('entradas')],...TIPOS.map(t=>[t,t,cT.get(t)])]},
    {k:'cat',t:'Categoria',todos:'Todas as categorias',opts:cats.map(c=>[c,c,cC.get(c)])},
    {k:'valor',t:'Valor',todos:'Qualquer valor',opts:FAIXAS.slice(1).map(([f,l])=>[f,l,cV.get(f)])},
    {k:'sit',t:'Situação',todos:'Todas as situações',opts:[['pago','Pago / recebido',cS.get('pago')],['pend','A pagar / receber',cS.get('pend')]]}],F,nVis,todos.length,'lançamentos');
}
function barraFiltrosCC(compras){
  const cK=contar(compras,x=>x.cartao), cC=contar(compras,x=>x.cat);
  const cV=new Map(FAIXAS.slice(1).map(([f])=>[f,compras.filter(x=>naFaixa(x.valor,f)).length]));
  const cS=new Map(['avista','parcelada','terceiro','separada'].map(k=>[k,compras.filter(x=>compraSitOk(k,x)).length]));
  const cats=[...new Set(compras.map(x=>x.cat).filter(Boolean).concat(FC.cat?[FC.cat]:[]))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
  const grupos=[];
  if(CARTOES.length>1) grupos.push({k:'cartao',t:'Cartão',todos:'Todos os cartões',opts:CARTOES.map(k=>[k.id,k.nome,cK.get(k.id)])});
  grupos.push({k:'cat',t:'Categoria',todos:'Todas as categorias',opts:cats.map(c=>[c,c,cC.get(c)])},
    {k:'valor',t:'Valor',todos:'Qualquer valor',opts:FAIXAS.slice(1).map(([f,l])=>[f,l,cV.get(f)])},
    {k:'sit',t:'Situação',todos:'Todas as compras',opts:[['avista','À vista',cS.get('avista')],['parcelada','Parceladas',cS.get('parcelada')],['terceiro','De outra pessoa',cS.get('terceiro')]].concat(CARTOES.some(k=>k.separa)?[['separada','Com dinheiro separado',cS.get('separada')]]:[])});
  const nVis=compras.filter(x=>(!FC.cartao||x.cartao===FC.cartao)&&(!FC.cat||x.cat===FC.cat)&&naFaixa(x.valor,FC.valor)&&compraSitOk(FC.sit,x)).length;
  return `<section class="card fcard">${barraCaminho('cc',grupos,FC,nVis,compras.length,'compras')}</section>`;
}

function prevMonth(){return cur>0?S.months[cur-1]:(Y[ano-1]?Y[ano-1].months[11]:[]);}

function viewMes(){
  if(!hasData()) return viewBoasVindas();
  const c=calc(cur);
  const todos=S.months[cur].map((x,i)=>({...x,_i:i}));
  const items=todos.filter(x=>tipoOk(F.tipo,x.tipo)&&(!F.cat||x.cat===F.cat)&&naFaixa(x.valor,F.valor)&&sitOk(F.sit,!!x.pago))
    .sort((a,b)=>(diaDe(b)-diaDe(a))||(b._i-a._i));
  const fAtivo=filtrosAtivos(F);
  const ct={}; allItems(cur).forEach(x=>{if(x.tipo==='Despesa')ct[x.cat]=(ct[x.cat]||0)+(Number(x.valor)||0);});
  const cl=Object.entries(ct).sort((a,b)=>b[1]-a[1]); const mx=cl.length?cl[0][1]:1;
  const prevHas=prevMonth().length, prevLbl=cur>0?MESL[cur-1]:'Dezembro de '+(ano-1);
  const rows=items.map(x=>{const dd=diaDe(x)?x.data:'';return `<tr data-i="${x._i}">
      <td class="c-data">${dd?`${dd.slice(8,10)}/${dd.slice(5,7)}`:'<span class="note">Sem data</span>'}</td>
      <td class="c-desc"><span class="tx-desc">${esc(x.desc)}</span>${x.obs?`<div class="note">${esc(x.obs)}</div>`:''}</td>
      <td class="c-cat"><span class="c-tipo">${esc(x.tipo)}</span><span class="c-cn">${esc(x.cat)}</span></td>
      <td class="num c-val">${brl(x.valor).replace('R$ ','')}</td>
      <td><button class="paid ${x.pago?'yes':'no'}" data-act="pago">${x.pago?(ENTRADA.has(x.tipo)?'Recebido':'Pago'):(ENTRADA.has(x.tipo)?'A receber':'A pagar')}</button></td>
      <td><div class="acoes"><button class="del edt" data-act="edit" title="Editar lançamento" aria-label="Editar lançamento ${esc(x.desc)}">${ICO_LAPIS}</button><button class="del" data-act="del" title="Excluir lançamento" aria-label="Excluir lançamento ${esc(x.desc)}">${ICO_LIXO}</button></div></td></tr>`;}).join('');
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
      <h2>Lançamentos de ${MESL[cur]}</h2>
      <form class="add" id="addForm">
        <input id="aDesc" placeholder="Descrição (ex.: Mercado)" required>
        <label class="adia"><span>Data</span><input type="date" id="aData" value="${isoDe(ano,cur,diaPadrao())}" min="${limMes().min}" max="${limMes().max}" aria-label="Data do lançamento" required></label>
        <select id="aTipo">${tipoOpts('Despesa')}</select>
        <select id="aCat">${catOpts('Despesa','Alimentação')}</select>
        <input id="aVal" placeholder="Valor (R$)" inputmode="decimal" autocomplete="off" required>
        <label class="note" style="display:flex;gap:4px;align-items:center"><input type="checkbox" id="aPago" checked> Pago</label>
        <button class="btn" type="submit">Adicionar</button>
      </form>
      ${todos.length?barraFiltrosMes(todos,items.length):''}
      <div class="tbl" id="lanc"><table><thead><tr><th>Data</th><th>Descrição</th><th>Tipo · Categoria</th><th class="num">Valor</th><th>Situação</th><th></th></tr></thead>
      <tbody>${rows||(fAtivo&&todos.length?`<tr><td colspan="6" class="note" style="padding:16px 6px">Nenhum lançamento com esses filtros.</td></tr>`:S.cc[cur].compras.length?'':`<tr><td colspan="6" class="note" style="padding:16px 6px">Nenhum lançamento em ${MESL[cur]} ainda.${prevHas?' Use "Copiar fixos" ao lado para trazer as contas do mês anterior.':''}</td></tr>`)}</tbody></table></div>
      ${blocoFaturasMes()}
    </section>
    <aside style="display:flex;flex-direction:column;gap:16px">
      <section class="card"><div class="row"><h2>Para onde foi o dinheiro</h2>${cl.length?`<div class="seg" role="group" aria-label="Tipo de gráfico"><button class="${grafTipo()==='rosca'?'on':''}" data-graf="rosca" aria-pressed="${grafTipo()==='rosca'}">Rosca</button><button class="${grafTipo()==='barras'?'on':''}" data-graf="barras" aria-pressed="${grafTipo()==='barras'}">Barras</button></div>`:''}</div>
        ${!cl.length?'<div class="note">Sem despesas lançadas.</div>':grafTipo()==='rosca'?rosca(cl):`<div class="bars">${cl.map(([k,v])=>`<div class="bar"><div class="t"><span>${esc(k)}</span><span>${brl(v)}</span></div><div class="track"><div class="fill" style="width:${Math.max(2,v/mx*100)}%"></div></div></div>`).join('')}</div>`}
        ${ct['Cartão de crédito']?'<div class="note">"Cartão de crédito" é uma fatura lançada inteira. Na aba Cartões, cada compra entra na sua categoria.</div>':''}
      </section>
      <section class="card"><h2>Começar o mês</h2>
        <div class="note">Copia as contas fixas e rendas de ${prevLbl} como "a pagar" e "a receber". Faturas de cartão, mercado e gastos avulsos ficam de fora; parcelas avançam sozinhas (11/12 → 12/12).</div>
        <button class="btn ghost" data-act="copiar" ${prevHas?'':'disabled'}>Copiar fixos de ${prevLbl}</button></section>
      ${c.vale?`<section class="card"><h2>Vale alimentação</h2><div class="note">${brl(c.vale)} recebidos em vale. Fica fora do saldo.</div></section>`:''}
    </aside>
  </div></div>`;
}
/* ---------- gráfico de rosca: despesas por categoria ---------- */
function grafTipo(){return lsGet('grafCat','rosca')==='barras'?'barras':'rosca';}
function rosca(cl){
  const MAXF=7, tot=cl.reduce((a,[,v])=>a+v,0);
  let fatias=cl.slice(0,MAXF).map(([k,v],i)=>({k,v,c:`var(--s${i+1})`}));
  if(cl.length>MAXF){const resto=cl.slice(MAXF);fatias.push({k:resto.length===1?resto[0][0]:`Outras (${resto.length})`,v:resto.reduce((a,[,v])=>a+v,0),c:'var(--s-outras)',lista:resto.map(r=>r[0]).join(', ')});}
  const R=92,r=60,C=100, pt=(rad,a)=>[C+rad*Math.sin(a),C-rad*Math.cos(a)];
  let a0=0;
  const paths=fatias.map((f,i)=>{
    const fr=tot?f.v/tot:0, a1=a0+fr*2*Math.PI; let d;
    if(fr>=0.9999){d=`M${C} ${C-R}A${R} ${R} 0 1 1 ${C-0.01} ${C-R}ZM${C} ${C-r}A${r} ${r} 0 1 0 ${C+0.01} ${C-r}Z`;}
    else{const big=a1-a0>Math.PI?1:0,[x0,y0]=pt(R,a0),[x1,y1]=pt(R,a1),[x2,y2]=pt(r,a1),[x3,y3]=pt(r,a0);
      d=`M${x0.toFixed(2)} ${y0.toFixed(2)}A${R} ${R} 0 ${big} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}L${x2.toFixed(2)} ${y2.toFixed(2)}A${r} ${r} 0 ${big} 0 ${x3.toFixed(2)} ${y3.toFixed(2)}Z`;}
    a0=a1;
    return `<path d="${d}" fill="${f.c}" data-fatia="${i}" fill-rule="evenodd"><title>${esc(f.k)}: ${brl(f.v)} (${pct(fr)})</title></path>`;}).join('');
  const leg=fatias.map((f,i)=>`<li data-fatia="${i}"${f.lista?` title="${esc(f.lista)}"`:''}><span class="sq" style="background:${f.c}"></span><span class="nm">${esc(f.k)}</span><span class="vl">${brl(f.v)}</span><span class="pc">${pct(tot?f.v/tot:0)}</span></li>`).join('');
  return `<div class="rosca" data-tot="${esc(brl(tot))}">
    <div class="rosca-g"><svg viewBox="0 0 200 200" role="img" aria-label="Gráfico de rosca das despesas por categoria">${paths}</svg>
      <div class="rosca-c"><span class="rc-l">Despesas do mês</span><b class="rc-v">${brl(tot)}</b></div></div>
    <ul class="rosca-leg">${leg}</ul></div>`;
}
function nomeCartao(id){const c=CARTOES.find(x=>x.id===id);return c?c.nome:'Cartão removido';}
function faturasDoMes(Yy,m){const c=Yy.cc[m];const g={};c.compras.forEach(x=>{(g[x.cartao]=g[x.cartao]||{id:x.cartao,total:0,n:0,sep:0});g[x.cartao].total+=Number(x.valor)||0;if(x.sep)g[x.cartao].sep+=Number(x.valor)||0;g[x.cartao].n++;});return Object.values(g).map(f=>({...f,pago:!!(c.faturas[f.id]||{}).pago,banco:(c.faturas[f.id]||{}).banco}));}
function blocoFaturasMes(){
  const fs0=faturasDoMes(S,cur), terc0=S.cc[cur].compras.filter(x=>x.terceiro), sep0=separadasNoMes(ano,cur);
  if(!fs0.length&&!sep0.length) return '';
  const gs={};sep0.forEach(x=>{const k=x.cartao+'|'+x._fy+'|'+x._fm;(gs[k]=gs[k]||{id:x.cartao,fy:x._fy,fm:x._fm,total:0,n:0});gs[k].total+=Number(x.valor)||0;gs[k].n++;});
  const seps=(!F.tipo||F.tipo==='Despesa')&&!F.cat&&sitOk(F.sit,true)?Object.values(gs).filter(g=>naFaixa(g.total,F.valor)):[];
  const fs=(!F.tipo||F.tipo==='Despesa')&&!F.cat?fs0.filter(f=>naFaixa(f.total,F.valor)&&sitOk(F.sit,f.pago)):[];
  const terc=(!F.tipo||F.tipo==='entradas'||F.tipo==='Reembolso')&&!F.cat?terc0.filter(x=>naFaixa(x.valor,F.valor)&&sitOk(F.sit,!!x.recebido)):[];
  const manual=S.months[cur].some(x=>x.tipo==='Despesa'&&x.cat==='Cartão de crédito');
  const linhasF=fs.map(f=>`<div class="ccrow"><div><b>Fatura ${esc(nomeCartao(f.id))}</b><div class="note">${f.n} ${f.n===1?'compra':'compras'} · Despesa · categorias de cada compra</div>${f.sep?`<button type="button" class="seplink" data-sepver="${esc(f.id)}" aria-haspopup="dialog">${ICO_COFRE} <span>${brl(f.sep)} já separados antes${f.total-f.sep>0.004?` · só ${brl(f.total-f.sep)} pesa neste mês`:' · não pesa neste mês'}</span></button>`:''}</div><div class="ccv">${brl(f.total)}</div><button class="paid ${f.pago?'yes':'no'}" data-act="fatpago" data-card="${esc(f.id)}">${f.pago?'Pago':'A pagar'}</button><button class="chip" data-goto="cartoes">Ver compras</button></div>`).join('');
  const linhasT=terc.map(x=>`<div class="ccrow"><div><b>Reembolso – ${esc(x.quem||'outra pessoa')}</b><div class="note">${esc(x.desc)}${x.total>1?` ${x.parcela}/${x.total}`:''} · no cartão ${esc(nomeCartao(x.cartao))}</div></div><div class="ccv">${brl(x.valor)}</div><button class="paid ${x.recebido?'yes':'no'}" data-act="tercrec" data-id="${esc(x.id)}">${x.recebido?'Recebido':'A receber'}</button><span></span></div>`).join('');
  const linhasS=seps.map(g=>`<div class="ccrow"><div><b>Separado para a fatura ${esc(nomeCartao(g.id))} – ${MESL[g.fm]}${g.fy!==ano?'/'+g.fy:''}</b><button type="button" class="seplink" data-sepmes="${esc(g.id)}|${g.fy}|${g.fm}" aria-haspopup="dialog">${ICO_COFRE} <span>${g.n} ${g.n===1?'compra separada':'compras separadas'} neste mês · já ${g.n===1?'conta':'contam'} nas categorias deste mês</span></button></div><div class="ccv">${brl(g.total)}</div><span class="pill ok sep-pill">${ICO_COFRE} Separado</span><button class="chip" data-gofat="${g.fy}-${g.fm}">Ver compras</button></div>`).join('');
  if(!linhasF&&!linhasT&&!linhasS) return '';
  return `<div class="ccbox"><div class="note" style="font-weight:600;color:var(--ink)">Dos cartões (automático)</div>${linhasS}${linhasF}${linhasT}
    ${manual?'<div class="banner" style="margin-top:8px">Este mês também tem uma fatura lançada à mão na categoria "Cartão de crédito". Se ela é a mesma fatura da aba Cartões, apague a linha manual para não contar duas vezes.</div>':''}</div>`;
}
function viewBoasVindas(){
  return `<div class="welcome">
    <section class="card"><h2>Trazer seus dados</h2><div class="note">Importe um arquivo de backup do app (meu-bolso-backup-….json ou financas-backup-….json). Ele traz todos os lançamentos, metas e patrimônio.</div><button class="btn" data-act="importar">Importar backup</button></section>
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
function addCompra({cartao,data,desc,cat,valor,n,terceiro,quem,sep}){
  const card=CARTOES.find(c=>c.id===cartao); if(!card) return null;
  const f=faturaDe(card,data), grupo=uid(), vals=parcelas(valor,n), keys=new Set();
  vals.forEach((v,i)=>{const t=norm(f.y,f.m+i);yr(t.y).cc[t.m].compras.push({id:uid(),grupo,cartao,data,desc,cat,valor:v,parcela:i+1,total:n,terceiro:!!terceiro,quem:terceiro?quem:'',recebido:false,...(sep&&n===1?{sep:true}:{})});keys.add(ccKey(t.y,t.m));});
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
  const fcAtivo=filtrosAtivos(FC);
  const blocoCartao=k=>{
    if(FC.cartao&&FC.cartao!==k.id) return '';
    const lista0=c.compras.map((x,i)=>({...x,_i:i})).filter(x=>x.cartao===k.id).sort((a,b)=>(b.data||'').localeCompare(a.data||'')||(b._i-a._i));
    const lista=lista0.filter(x=>(!FC.cat||x.cat===FC.cat)&&naFaixa(x.valor,FC.valor)&&compraSitOk(FC.sit,x));
    const f=fs.find(z=>z.id===k.id)||{total:0,n:0,pago:false};
    const fat=c.faturas[k.id]||{}, banco=fat.banco, dif=banco!=null&&banco!==''?Math.round((Number(banco)-f.total)*100)/100:null;
    const venc=`${String(k.vence).padStart(2,'0')}/${pad(cur)}`;
    const rows=lista.map(x=>`<tr data-cc="${esc(x.id)}">
      <td class="c-desc"><span class="tx-desc">${esc(x.desc)}</span><div class="note">${[x.data?fmtData(x.data):'',x.total>1?`Parcela ${x.parcela} de ${x.total}`:'',x.terceiro?`de ${esc(x.quem||'outra pessoa')} (vira reembolso)`:''].filter(Boolean).join(' · ')}${k.separa&&x.total===1?` <button type="button" class="septog ${x.sep?'on':''}" data-act="sepcc" aria-pressed="${x.sep?'true':'false'}" title="${x.sep?'Clique se ainda não separou o dinheiro':'Clique se já separou o dinheiro desta compra'}">${ICO_COFRE} ${x.sep?'Separado':'Não separado'}</button>`:x.sep?` <span class="septog on">${ICO_COFRE} Separado</span>`:''}</div></td>
      <td class="c-cat"><span class="c-cn">${esc(x.cat)}</span></td>
      <td class="num c-val">${brl(x.valor).replace('R$ ','')}</td>
      <td><div class="acoes"><button class="del edt" data-act="editcc" title="Editar compra" aria-label="Editar compra ${esc(x.desc)}">${ICO_LAPIS}</button><button class="del" data-act="delcc" title="${x.total>1?'Excluir a compra e todas as parcelas':'Excluir compra'}" aria-label="Excluir compra ${esc(x.desc)}">${ICO_LIXO}</button></div></td></tr>`).join('');
    return `<section class="card"><div class="row"><div><h2>${esc(k.nome)} · fatura de ${MESL[cur]}</h2><div class="note">Vence em ${venc} · fecha todo dia ${k.fecha}</div></div>
      <div class="row" style="gap:10px"><span style="font-family:var(--display);font-size:22px">${brl(f.total)}</span>${f.n?`<button class="paid ${f.pago?'yes':'no'}" data-act="fatpago" data-card="${esc(k.id)}">${f.pago?'Pago':'A pagar'}</button>`:''}</div></div>
      ${barraLimite(k)}
      ${k.separa&&f.n?`<div class="reserva"><div class="limtop"><span class="note">${ICO_COFRE} Reserva para esta fatura</span><span><b>${brl(f.sep)}</b> <span class="note">de ${brl(f.total)}</span></span></div>
        <div class="limbar"><div class="fill ok" style="width:${f.total?Math.min(100,f.sep/f.total*100):0}%"></div></div>
        <div class="note">${f.total-f.sep>0.004?`Faltam ${brl(f.total-f.sep)} sem separar · essa parte é despesa de ${MESL[cur]}`:'Fatura toda coberta pelo dinheiro separado'}</div></div>`:''}
      ${fcAtivo&&lista0.length?`<div class="note">${lista.length?`Mostrando ${lista.length} de ${lista0.length} ${lista0.length===1?'compra':'compras'} desta fatura.`:'Nenhuma compra desta fatura com esses filtros.'}</div>`:''}
      ${lista.length?`<div class="tbl" id="lanc-cc-${esc(k.id)}"><table><thead><tr><th>Compra</th><th>Categoria</th><th class="num">Valor</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`:lista0.length?'':`<div class="note">Nenhuma compra nesta fatura.</div>`}
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
      ${CARTOES.length&&c.compras.length?barraFiltrosCC(c.compras):''}
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
          <label class="sepbox" id="cfSepBox" for="cfSep" style="grid-column:1/3" hidden><input type="checkbox" id="cfSep"><span><b>Já separei o dinheiro desta compra</b><span class="note">Marque se você já tirou esse valor da conta para pagar a fatura. A compra conta no mês em que foi feita e não pesa no mês da fatura.</span></span></label>
          <div class="note" id="cfPrev" style="grid-column:1/3"></div>
          <button class="btn" type="submit" style="grid-column:1/3">Adicionar compra</button>
        </form></section>`:''}
      ${CARTOES.length?`<section class="card"><h2>Próximas faturas</h2><div class="tbl"><table><thead><tr><th>Mês</th>${CARTOES.map(k=>`<th class="num">${esc(k.nome)}</th>`).join('')}<th class="num">Total</th></tr></thead><tbody>${prox.map(p=>`<tr><td class="mo">${MES[p.t.m]}/${String(p.t.y).slice(2)}</td>${p.vals.map(v=>`<td class="num">${v?brl0(v):'–'}</td>`).join('')}<td class="num"><b>${p.total?brl0(p.total):'–'}</b></td></tr>`).join('')}</tbody></table></div><div class="note">Só parcelas já lançadas. Compras novas entram conforme você lança.</div></section>`:''}
      <section class="card"><h2>Seus cartões</h2>
        ${CARTOES.map(k=>`<div class="cardbox"><div class="ccrow cardrow" style="border:0"><div><b>${esc(k.nome)}</b><div class="note">Fecha dia ${k.fecha} · vence dia ${k.vence} · ${k.limite?'limite '+brl(k.limite):'sem limite cadastrado'}</div>${k.separa?`<div class="note sepnote">${ICO_COFRE} Separo o dinheiro na hora da compra</div>`:''}</div><div class="acoes"><button class="del edt" data-editcard="${esc(k.id)}" title="Editar cartão" aria-label="Editar ${esc(k.nome)}">${ICO_LAPIS}</button><button class="del" data-delcard="${esc(k.id)}" title="Excluir cartão" aria-label="Excluir ${esc(k.nome)}">${ICO_LIXO}</button></div></div>${k.limite?barraLimite(k):''}</div>`).join('')}
        ${!CARDFORM&&CARTOES.length?`<button class="btn ghost addcard" type="button" data-act="abrirCard">+ Adicionar cartão</button>`:`<form id="cardForm" class="form" style="grid-template-columns:2fr 1fr 1fr">
          <div class="note" style="grid-column:1/4;font-weight:600;color:var(--ink)">Novo cartão</div>
          <label for="kNome">Nome<input class="field" id="kNome" placeholder="Ex.: Nubank" required></label>
          <label for="kFecha">Fecha dia<input class="field" id="kFecha" type="number" min="1" max="31" placeholder="3" required></label>
          <label for="kVence">Vence dia<input class="field" id="kVence" type="number" min="1" max="31" placeholder="10" required></label>
          <label for="kLimite" style="grid-column:1/4">Limite do cartão (opcional)<input class="field" id="kLimite" inputmode="decimal" placeholder="Ex.: 5.000,00"></label>
          <label class="sepbox" for="kSep" style="grid-column:1/4"><input type="checkbox" id="kSep"><span><b>Separo o dinheiro na hora da compra</b><span class="note">Para cartões com cashback, pontos ou milhas: você paga no crédito, separa o valor na hora e usa essa reserva para pagar a fatura.</span></span></label>
          <div class="modal-bt${CARTOES.length?'':' um'}" style="grid-column:1/4;margin-top:0">${CARTOES.length?'<button class="btn ghost" type="button" data-act="fecharCard">Cancelar</button>':''}<button class="btn" type="submit">Salvar cartão</button></div>
        </form>`}
        <div class="note" id="cardMsg"></div>
      </section>
    </aside>
  </div></div>`;
}
function previewCompra(){
  const el=document.getElementById('cfPrev'); if(!el) return;
  const card=CARTOES.find(c=>c.id===document.getElementById('cfCartao').value), data=document.getElementById('cfData').value;
  const v=parseBR(document.getElementById('cfValor').value), n=+document.getElementById('cfParc').value||1, quem=document.getElementById('cfQuem').value.trim();
  const sb=document.getElementById('cfSepBox'); if(sb){const ok=!!(card&&card.separa&&n===1);sb.hidden=!ok;if(!ok)document.getElementById('cfSep').checked=false;}
  if(!card||!/^\d{4}-\d\d-\d\d$/.test(data)){el.textContent='';return;}
  const f=faturaDe(card,data);
  el.textContent=`Entra na fatura de ${MESL[f.m]}/${f.y} (vence ${String(card.vence).padStart(2,'0')}/${pad(f.m)})`+(v&&n>1?` · ${n}x de ${brl(parcelas(v,n)[0])}, até ${MES[norm(f.y,f.m+n-1).m]}/${norm(f.y,f.m+n-1).y}`:'')+(quem?` · vira reembolso a receber de ${quem}`:'')+(n===1&&document.getElementById('cfSep')&&document.getElementById('cfSep').checked?` · conta como despesa de ${MESL[+data.slice(5,7)-1]} (dinheiro já separado)`:'')+(card.limite&&v>card.limite-limiteUsado(card.id)?` · Atenção: passa do limite disponível (${brl(card.limite-limiteUsado(card.id))})`:'');
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
  <section class="card"><h2>Sua conta</h2>
    <div class="row"><div><b>${esc((PREVIEW?lsGet('previewEmail',''):(AUTH||{}).email)||'')}</b><div class="note">${PREVIEW?'Prévia: nada vai para a nuvem':LAST_SYNC?'Sincronizado entre seus aparelhos. Última vez: '+new Date(LAST_SYNC).toLocaleString('pt-BR'):'Ainda não sincronizou'}</div></div>
      <div class="chips"><button class="btn ghost" data-act="sync">Sincronizar agora</button><button class="btn danger" data-act="sair">Sair</button></div></div>
    <div class="banner hidden" id="confSair"><div id="confSairTxt">Sair da conta? Seus dados continuam guardados na nuvem e voltam quando você entrar de novo. Neste aparelho, eles são apagados.</div>
      <div class="chips" style="margin-top:8px"><button class="btn danger" data-act="sairSim">Sair</button><button class="btn ghost" data-act="sairNao">Cancelar</button></div></div>
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

/* ---------- campos de valor: só números, com vírgula para os centavos ---------- */
const ehMoeda=el=>!!el&&el.tagName==='INPUT'&&el.getAttribute('inputmode')==='decimal';
function soMoeda(s){
  s=String(s||'').replace(/[^\d.,]/g,'');                       // tira letras, espaços e símbolos
  const i=s.lastIndexOf(',');
  let int=(i>=0?s.slice(0,i):s).replace(/,/g,'');
  const dec=i>=0?s.slice(i+1).replace(/[.,]/g,'').slice(0,2):null; // no máximo 2 casas de centavos
  int=int.replace(/^0+(?=\d)/,'').slice(0,13);
  return dec===null?int:(int||'0')+','+dec;
}
const fmtMoeda=v=>Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const MSG_FALTA={aDesc:'Escreva uma descrição (ex.: Mercado).',cfDesc:'Escreva uma descrição (ex.: Mercado).',aVal:'Digite o valor, só com números (ex.: 18,50).',cfValor:'Digite o valor total, só com números (ex.: 297,00).'};
document.addEventListener('input',e=>{
  const t=e.target; if(t&&t.setCustomValidity) t.setCustomValidity('');
  if(!ehMoeda(t)) return;
  const v=t.value, nv=soMoeda(v); if(v===nv) return;
  const pos=Math.min(soMoeda(v.slice(0,t.selectionStart||v.length)).length,nv.length);
  t.value=nv; try{t.setSelectionRange(pos,pos);}catch(_){}
},true);
document.addEventListener('invalid',e=>{const t=e.target;if(t.validity&&t.validity.valueMissing&&MSG_FALTA[t.id])t.setCustomValidity(MSG_FALTA[t.id]);},true);
document.addEventListener('focusout',e=>{const t=e.target;if(ehMoeda(t)&&!t.readOnly&&['aVal','cfValor','kLimite'].includes(t.id)&&t.value){const n=parseBR(t.value);t.value=n?fmtMoeda(n):'';}},true);
function avisoCampo(el,msg){el.setCustomValidity(msg);el.reportValidity();el.focus();}

document.addEventListener('click',e=>{const l=e.target.closest('label.dt, label.adia');if(!l)return;const i=l.querySelector('input[type=date]');if(i&&e.target!==i&&i.showPicker){try{i.showPicker();e.preventDefault();}catch(_){}}});
const V=document.getElementById('view');
function roscaFoco(el){
  const box=el&&el.closest('.rosca'); if(!box) return;
  const i=el.dataset.fatia, li=box.querySelector(`li[data-fatia="${i}"]`);
  box.classList.toggle('foco',i!=null);
  box.querySelectorAll('[data-fatia]').forEach(x=>x.classList.toggle('on',x.dataset.fatia===i));
  const l=box.querySelector('.rc-l'), v=box.querySelector('.rc-v');
  if(i!=null&&li){l.textContent=li.querySelector('.nm').textContent+' · '+li.querySelector('.pc').textContent;v.textContent=li.querySelector('.vl').textContent;}
}
function roscaLimpa(box){if(!box)return;box.classList.remove('foco');box.querySelectorAll('.on').forEach(x=>x.classList.remove('on'));box.querySelector('.rc-l').textContent='Despesas do mês';box.querySelector('.rc-v').textContent=box.dataset.tot;}
document.addEventListener('pointerover',e=>{const f=e.target.closest&&e.target.closest('.rosca [data-fatia]');if(f)roscaFoco(f);});
document.addEventListener('pointerout',e=>{if(e.pointerType!=='mouse')return;const box=e.target.closest&&e.target.closest('.rosca');if(box&&!box.contains(e.relatedTarget))roscaLimpa(box);});
document.addEventListener('click',e=>{const f=e.target.closest&&e.target.closest('.rosca [data-fatia]');if(f){roscaFoco(f);return;}document.querySelectorAll('.rosca.foco').forEach(roscaLimpa);}); // no celular: toca para destacar, toca fora para voltar
V.addEventListener('click',e=>{
  const fpb=e.target.closest('[data-fp]'); if(fpb){FP=FP===fpb.dataset.fp?null:fpb.dataset.fp;FSTEP=null;render();return;}
  const fst=e.target.closest('[data-fstep]'); if(fst){FSTEP=fst.dataset.fstep||null;render();const r=document.querySelector('.fmenu .fmrow, .fmenu .fmback');r&&r.focus();return;}
  const fse=e.target.closest('[data-fset]'); if(fse){const o=fse.dataset.fset==='mes'?F:FC;o[fse.dataset.k]=fse.dataset.v;FP=null;FSTEP=null;render();return;}
  const fxx=e.target.closest('[data-fx]'); if(fxx){const o=fxx.dataset.fx==='mes'?F:FC;o[fxx.dataset.k]='';render();return;}
  const gb=e.target.closest('[data-graf]'); if(gb){lsSet('grafCat',gb.dataset.graf);render();return;}
  const sv=e.target.closest('[data-sepver]'); if(sv){janelaSeparadas(sv.dataset.sepver);return;}
  const sm=e.target.closest('[data-sepmes]'); if(sm){const [cid,fy,fm]=sm.dataset.sepmes.split('|');janelaSeparadas(cid,+fy,+fm,true);return;}
  const gf=e.target.closest('[data-gofat]'); if(gf){const [fy,fm]=gf.dataset.gofat.split('-').map(Number);ano=fy;S=yr(fy);cur=fm;tab='cartoes';render();return;}
  const g=e.target.closest('[data-goto]'); if(g){tab=g.dataset.goto;render();return;}
  const cor=e.target.closest('[data-cor]'); if(cor){setSetting({cor:cor.dataset.cor});render();return;}
  const dc=e.target.closest('[data-delcat]'); if(dc){const s=settings(),tp=dc.dataset.tipo,c=dc.dataset.delcat;
    const ex=Object.assign({},s.catsExtra), oc=Object.assign({},s.catsOcultas);
    if((ex[tp]||[]).includes(c)) ex[tp]=ex[tp].filter(x=>x!==c); else oc[tp]=[...(oc[tp]||[]),c];
    setSetting({catsExtra:ex,catsOcultas:oc}); render(); return;}
  const ek=e.target.closest('[data-editcard]'); if(ek){janelaEditarCartao(ek.dataset.editcard);return;}
  const dk=e.target.closest('[data-delcard]'); if(dk){const id=dk.dataset.delcard,k=CARTOES.find(z=>z.id===id);if(!k)return;let n=0;cadaCompra(x=>{if(x.cartao===id)n++;});
    if(n){confirmar({titulo:'Não dá para excluir este cartão',texto:`O <b>${esc(k.nome)}</b> tem <b>${n} ${n===1?'compra lançada':'compras lançadas'}</b>. Exclua as compras primeiro e depois o cartão. Assim nenhuma fatura fica sem cartão.`,ok:'Entendi',unico:true});return;}
    confirmar({titulo:'Excluir este cartão?',texto:`O cartão <b>${esc(k.nome)}</b> será excluído. Ele não tem compras lançadas.`,ok:'Excluir'}).then(sim=>{if(sim){CARTOES=CARTOES.filter(z=>z.id!==id);touch('cartoes');render();}});return;}
  const db=e.target.closest('[data-delbank]'); if(db){const b=S.config.bancos[+db.dataset.delbank]; S.config.bancos.splice(+db.dataset.delbank,1); delete S.config.patrimonio[b]; touch(cfgKey(ano)); render(); return;}
  const a=e.target.closest('[data-act]'); if(!a) return;
  const act=a.dataset.act;
  if(act==='abrirCard'){CARDFORM=true;render();const n=document.getElementById('kNome');n&&n.focus();return;}
  if(act==='fecharCard'){CARDFORM=false;render();return;}
  if(act==='importar'){document.getElementById('fileIn').click();return;}
  if(act==='exportar'){exportar();return;}
  if(act==='zero'){yr(HOJE_ANO).keep=true;touch(cfgKey(HOJE_ANO));setAno(HOJE_ANO);return;}
  if(act==='sair'){document.getElementById('confSair').classList.remove('hidden');return;}
  if(act==='sairNao'){document.getElementById('confSair').classList.add('hidden');return;}
  if(act==='sairSim'){sair(false);return;}
  if(act==='sairForce'){sair(true);return;}
  if(act==='limparF'){F={tipo:'',cat:'',valor:'',sit:''};render();return;}
  if(act==='limparFC'){FC={cartao:'',cat:'',valor:'',sit:''};render();return;}
  if(act==='sync'){sync().then(render);return;}
  if(act==='instalar'&&deferredPrompt){deferredPrompt.prompt();deferredPrompt.userChoice.finally(()=>{deferredPrompt=null;render();});return;}
  if(act==='apagar'){document.getElementById('confApagar').classList.remove('hidden');return;}
  if(act==='apagarNao'){document.getElementById('confApagar').classList.add('hidden');return;}
  if(act==='apagarSim'){DOCS={};saveDocs();lsSet('lastSync',0);hydrate();ano=HOJE_ANO;S=yr(ano);applyLook();render();showBanner('Os dados deste aparelho foram apagados.');return;}
  if(act==='fatpago'){const f=S.cc[cur].faturas,id=a.dataset.card;f[id]=Object.assign({},f[id],{pago:!(f[id]||{}).pago});touch(ccKey(ano,cur));render();return;}
  if(act==='sepcc'){const tr=a.closest('tr[data-cc]');const x=tr&&S.cc[cur].compras.find(z=>z.id===tr.dataset.cc);if(x&&x.total===1){if(x.sep)delete x.sep;else x.sep=true;touch(ccKey(ano,cur));}render();return;}
  if(act==='tercrec'){const x=S.cc[cur].compras.find(z=>z.id===a.dataset.id);if(x){x.recebido=!x.recebido;touch(ccKey(ano,cur));}render();return;}
  if(act==='editcc'){const tr=a.closest('tr[data-cc]');if(tr)janelaEditarCompra(tr.dataset.cc);return;}
  if(act==='delcc'){const tr=a.closest('tr[data-cc]');const x=tr&&S.cc[cur].compras.find(z=>z.id===tr.dataset.cc);if(!x)return;
    let tot=0,n=0;cadaCompra(z=>{if(z.grupo===x.grupo){tot+=Number(z.valor)||0;n++;}});
    const txt=x.total>1?`A compra <b>${esc(x.desc)}</b> e todas as suas <b>${n} parcelas</b> (${brl(tot)} no total) serão excluídas de todas as faturas.`:`A compra <b>${esc(x.desc)}</b> (${brl(x.valor)}${x.data?', '+fmtData(x.data):''}) será excluída da fatura.`;
    confirmar({titulo:x.total>1?'Excluir esta compra parcelada?':'Excluir esta compra?',texto:txt+' Isso não pode ser desfeito.',ok:'Excluir'}).then(sim=>{if(sim){apagarGrupo(x.grupo);render();}});return;}
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
      const d=diaDe(x), it={id:uid(),desc,cat:x.cat,tipo:x.tipo,valor:x.valor,pago:false};
      if(d) it.data=isoDe(ano,cur,Math.min(d,diasNoMes(ano,cur)));
      S.months[cur].push(it);});
    touch(monthKey(ano,cur)); render(); return;
  }
  const tr=a.closest('tr[data-i]'); if(!tr) return;
  if(act==='pago'){const it=S.months[cur][+tr.dataset.i]; it.pago=!it.pago;}
  if(act==='edit'){janelaEditar(+tr.dataset.i);return;}
  if(act==='del'){const it=S.months[cur][+tr.dataset.i]; if(!it) return; const m=cur, y=ano;
    confirmar({titulo:'Excluir este lançamento?',texto:`O lançamento <b>${esc(it.desc)}</b> (${brl(it.valor)}${it.data?', '+fmtData(it.data):''}) será excluído. Isso não pode ser desfeito.`,ok:'Excluir'})
      .then(sim=>{if(!sim)return;const arr=yr(y).months[m],i=arr.indexOf(it);if(i>=0){arr.splice(i,1);touch(monthKey(y,m));}render();});
    return;}
  touch(monthKey(ano,cur)); render();
});
V.addEventListener('change',e=>{
  const t=e.target;
  if(t.id==='aTipo'){document.getElementById('aCat').innerHTML=catOpts(t.value);return;}
  if(t.dataset.fl){F[t.dataset.fl]=t.value;t.blur();render();return;}
  if(t.dataset.fc){FC[t.dataset.fc]=t.value;t.blur();render();return;}
  if(t.id==='aData') return;
  if(t.id==='stNome'){setSetting({nome:t.value.trim()});t.blur();render();return;}
  if(t.id==='stTema'){setSetting({tema:t.value});t.blur();render();return;}
  if(t.id==='stOcultar'){setSetting({ocultar:t.checked});render();return;}
  if(t.closest('#ccForm')){previewCompra();return;}
  if(t.dataset.cardsep!=null){const k=CARTOES.find(z=>z.id===t.dataset.cardsep);if(k){k.separa=t.checked;touch('cartoes');}render();return;}
  if(t.closest('#cardForm')) return;
  if(t.dataset.cardlim!=null){const k=CARTOES.find(z=>z.id===t.dataset.cardlim);if(k){k.limite=t.value.trim()===''?null:parseBR(t.value);touch('cartoes');}t.blur();render();return;}
  if(t.dataset.banco!=null){const f=S.cc[cur].faturas,id=t.dataset.banco;f[id]=Object.assign({},f[id],{banco:t.value.trim()===''?null:parseBR(t.value)});touch(ccKey(ano,cur));t.blur();render();return;}
  const trc=t.closest('tr[data-cc]'); if(trc&&t.dataset.ccf){const x=S.cc[cur].compras.find(z=>z.id===trc.dataset.cc); if(!x) return;
    if(t.dataset.ccf==='valor'){const nv=parseBR(t.value);if(!(nv>0)){showBanner('O valor precisa ser um número maior que zero. O valor anterior foi mantido.',true);t.blur();render();return;}x.valor=nv;touch(ccKey(ano,cur));}
    else if(t.dataset.ccf==='desc'&&!t.value.trim()){showBanner('A descrição não pode ficar vazia. A anterior foi mantida.',true);t.blur();render();return;}
    else{const fld=t.dataset.ccf,val=t.value,g=x.grupo,keys=new Set();cadaCompra((z,y,m)=>{if(z.grupo===g){z[fld]=val;keys.add(ccKey(y,m));}});keys.forEach(touch);}
    t.blur();render();return;}
  if(/^sb/.test(t.id)||t.id==='aDesc'||t.id==='aVal'||t.id==='aCat'||t.id==='aPago'||t.id==='bankName'||t.closest('[data-addcat]')) return;
  if(t.id==='metaIn'){S.config.meta=parseBR(t.value);touch(cfgKey(ano));t.blur();render();return;}
  if(t.dataset.plan!=null){S.config.plan[+t.dataset.plan]=parseBR(t.value);touch(cfgKey(ano));t.blur();render();return;}
  if(t.dataset.bank!=null){const b=S.config.bancos[+t.dataset.bank];const arr=S.config.patrimonio[b]=(S.config.patrimonio[b]||Array(12).fill(null));
    arr[+t.dataset.m]=t.value.trim()===''?null:parseBR(t.value);touch(cfgKey(ano));t.blur();render();return;}
  const tr=t.closest('tr[data-i]'); if(!tr||!t.dataset.f) return;
  const it=S.months[cur][+tr.dataset.i], fld=t.dataset.f;
  if(fld==='valor'&&!(parseBR(t.value)>0)){showBanner('O valor precisa ser um número maior que zero. O valor anterior foi mantido.',true);t.blur();render();return;}
  if(fld==='desc'&&!t.value.trim()){showBanner('A descrição não pode ficar vazia. A anterior foi mantida.',true);t.blur();render();return;}
  if(fld==='data'){ if(!t.value) delete it.data;
    else if(t.value.slice(0,7)===`${ano}-${pad(cur)}`) it.data=t.value;
    else {showBanner(`Escolha um dia de ${MESL[cur]}. Para lançar em outro mês, abra esse mês na barra de meses.`,true);t.blur();render();return;} }
  else if(fld==='valor') it.valor=parseBR(t.value);
  else if(fld==='tipo'){it.tipo=t.value; if(!cats(it.tipo).includes(it.cat)) it.cat=cats(it.tipo)[0]||'Outros';}
  else it[fld]=t.value;
  touch(monthKey(ano,cur)); t.blur(); render();
});
V.addEventListener('input',e=>{if(e.target.closest('#ccForm'))previewCompra();});
V.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.matches('input.cell'))e.target.blur();});
V.addEventListener('submit',e=>{
  e.preventDefault(); const fm=e.target;
  if(fm.id==='addForm'){
    const dEl=document.getElementById('aDesc'), vEl=document.getElementById('aVal'), d=dEl.value.trim(), v=parseBR(vEl.value);
    if(!d){avisoCampo(dEl,MSG_FALTA.aDesc);return;}
    if(!(v>0)){avisoCampo(vEl,'Digite um valor maior que zero, só com números (ex.: 18,50).');return;}
    S.months[cur].push({id:uid(),data:(v=>v&&v.slice(0,7)===`${ano}-${pad(cur)}`?v:isoDe(ano,cur,diaPadrao()))(document.getElementById('aData').value),desc:d,tipo:document.getElementById('aTipo').value,cat:document.getElementById('aCat').value,valor:v,pago:document.getElementById('aPago').checked});
    yr(ano).keep=true; touch(monthKey(ano,cur)); document.activeElement&&document.activeElement.blur(); render();
    setTimeout(()=>{const x=document.getElementById('aDesc');x&&x.focus();},0); return;
  }
  if(fm.id==='ccForm'){
    const desc=document.getElementById('cfDesc').value.trim(), valor=parseBR(document.getElementById('cfValor').value), data=document.getElementById('cfData').value;
    if(!desc){avisoCampo(document.getElementById('cfDesc'),MSG_FALTA.cfDesc);return;}
    if(!(valor>0)){avisoCampo(document.getElementById('cfValor'),'Digite um valor maior que zero, só com números (ex.: 297,00).');return;}
    if(!data){avisoCampo(document.getElementById('cfData'),'Escolha a data da compra.');return;}
    const quem=document.getElementById('cfQuem').value.trim();
    const f=addCompra({cartao:document.getElementById('cfCartao').value,data,desc,cat:document.getElementById('cfCat').value,valor,n:+document.getElementById('cfParc').value||1,terceiro:!!quem,quem,sep:!!(document.getElementById('cfSep')||{}).checked});
    document.activeElement&&document.activeElement.blur(); render();
    setTimeout(()=>{const p=document.getElementById('cfPrev');if(p&&f)p.innerHTML=`<b>Lançada na fatura de ${MESL[f.m]}/${f.y}.</b>${f.y!==ano||f.m!==cur?` Para ver, escolha ${MES[f.m]}${f.y!==ano?' de '+f.y:''} na barra de meses.`:''}`;const d=document.getElementById('cfDesc');d&&d.focus();},0); return;
  }
  if(fm.id==='cardForm'){
    const nome=document.getElementById('kNome').value.trim(), fecha=Math.min(31,Math.max(1,+document.getElementById('kFecha').value||0)), vence=Math.min(31,Math.max(1,+document.getElementById('kVence').value||0));
    if(!nome||!fecha||!vence) return;
    if(CARTOES.some(k=>k.nome.toLowerCase()===nome.toLowerCase())){document.getElementById('cardMsg').textContent='Já existe um cartão com esse nome.';return;}
    const limite=parseBR(document.getElementById('kLimite').value)||null;
    CARTOES.push({id:uid(),nome,fecha,vence,limite,...(document.getElementById('kSep').checked?{separa:true}:{})}); touch('cartoes'); CARDFORM=false; document.activeElement&&document.activeElement.blur(); render(); return;
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
applyLook();
(function iniciar(){
  const link=PREVIEW?null:lerLinkDoEmail();
  if(link&&link.erro){LOGIN_MODE='esqueci';showLogin(link.erro,'err');return;}
  if(link&&link.tipo==='recovery'){RECOVERY=link.j;LOGIN_MODE='nova';showLogin('');return;}
  if(link&&link.j){showLogin('Confirmando o seu e-mail…','ok');
    depoisDoLogin(link.j).then(()=>showBanner('E-mail confirmado. Bem-vindo ao Meu Bolso!')).catch(e=>{LOGIN_MODE='entrar';showLogin(traduzErro(e),'err');});return;}
  if(!logado()){LOGIN_MODE='entrar';showLogin('');return;}
  if(!PREVIEW&&!lsGet('owner',null)&&AUTH&&AUTH.user_id) lsSet('owner',AUTH.user_id); // aparelhos que já estavam conectados
  showApp(true); render();
  if(PREVIEW){setStatus('busy','Prévia: nada vai para a nuvem');showBanner('Prévia para validação. Os dados são de exemplo e ficam só neste navegador.');}
  else sync();
})();
