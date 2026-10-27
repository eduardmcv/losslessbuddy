/* ---------- preset browser (LCD menu) ---------- */
const NS={c:0,b:0,m:0,col:2,q:'',hi:0,req:false};
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const catName=id=>NAVCATS.find(c=>c[0]===id)[1];
const fullName=e=>fold(e.name).startsWith(fold(e.brand))?e.name:e.brand+' '+e.name;
const curEntry=()=>ENTRIES.find(e=>e.id===S.sel)||ENTRIES[0];
const packMode=()=>S.mode==='preset'&&curEntry().pack;
function entrySpec(e){
  if(e.pack)return'8 VERSIONES · 30 S · ZIP';
  const o={...BASE,...e.o},f=FMT[o.fmt],cod=CODECS.find(c=>c.id===codecOf(o.fmt)).name;
  if(!canEncode(o.fmt))return cod+' · NO DISPONIBLE EN ESTE NAVEGADOR';
  return[f.lossless?`${cod} ${o.bits===32?'32F':o.bits+' BIT'}`:`${cod} ${o.kbps}`,'.'+extOf(o),o.rate?fmtRate(o.rate):'FREC. ORIGINAL',o.mono?'MONO':null,o.norm==='lufs'?num(o.lufs,0)+' LUFS':null].filter(Boolean).join(' · ').toUpperCase();
}
const results=()=>{const ws=fold(NS.q).split(/\s+/).filter(Boolean);return ENTRIES.filter(e=>ws.every(w=>e.hay.includes(w)))};
function locate(e){NS.c=NAV.findIndex(c=>c.id===e.cat);const cat=NAV[NS.c];NS.b=cat.brands.findIndex(b=>b.name===e.brand);NS.m=cat.brands[NS.b].items.indexOf(e)}
function applyEntry(e){
  S.sel=e.id;S.out={...BASE,...e.o};locate(e);renderAll();refreshCover();
}
function renderNav(){
  const box=$('#navBody');let focusE=null;
  $('#navCount').textContent=ENTRIES.length+' PRESETS';
  if(NS.req){
    box.className='navbody';
    if(!$('#reqIn'))box.innerHTML=`<div class="nreq"><label for="reqIn">¿QUÉ EQUIPO O DESTINO FALTA?</label><input id="reqIn" maxlength="140" placeholder="MARCA, MODELO Y AÑO" autocomplete="off"><div class="nrow"><button class="nbtn" id="reqSend">ENVIAR</button><button class="nbtn" id="reqCancel">CANCELAR</button></div><p id="reqMsg">LO REVISAMOS Y LO AÑADIMOS A LA LISTA.</p></div>`;
    $('#navDet').innerHTML='';return;
  }
  if(NS.q.trim()){
    const rs=results();NS.hi=Math.max(0,Math.min(NS.hi,rs.length-1));focusE=rs[NS.hi];
    box.className='navbody flat';
    box.innerHTML=rs.length?`<ul class="ncol" role="listbox" aria-label="Resultados">${rs.map((e,i)=>`<li role="option" aria-selected="${e.id===S.sel}" class="${e.id===S.sel?'hi sel':''} ${i===NS.hi?'cur':''}" data-eid="${e.id}"><span class="np">${esc(catName(e.cat))} › ${esc(e.brand)}</span><span class="nn">${esc(e.name)}</span><span class="ny">${esc(e.years)}</span></li>`).join('')}</ul>`
      :`<div class="nempty">NADA PARA «${esc(NS.q.toUpperCase())}».<br>PULSA ＋ PEDIR Y LO AÑADIMOS.</div>`;
  }else{
    const cat=NAV[NS.c],br=cat.brands[NS.b]||cat.brands[0];focusE=NS.m>=0?br.items[NS.m]:null;
    const li=(cls,attr,html)=>`<li role="option" class="${cls}" ${attr}>${html}</li>`;
    const back=t=>`<li class="back" data-back="1">‹ ${esc(t)}</li>`;
    box.className='navbody cols col'+NS.col;
    box.innerHTML=
      `<ul class="ncol ${NS.col===0?'act':''}" role="listbox" aria-label="Categoría">${NAV.map((c,i)=>li(i===NS.c?(NS.col===0?'cur':'on'):'',`data-nc="${i}" aria-selected="${i===NS.c}"`,`<span class="nn">${esc(c.name.toUpperCase())}</span><span class="na">▸</span>`)).join('')}</ul>`+
      `<ul class="ncol ${NS.col===1?'act':''}" role="listbox" aria-label="Marca">${back(cat.name.toUpperCase())}${cat.brands.map((b,i)=>li(i===NS.b?(NS.col===1?'cur':'on'):'',`data-nb="${i}" aria-selected="${i===NS.b}"`,`<span class="nn">${esc(b.name.toUpperCase())}</span><span class="na">▸</span>`)).join('')}</ul>`+
      `<ul class="ncol ${NS.col===2?'act':''}" role="listbox" aria-label="Modelo">${back(br.name.toUpperCase())}${br.items.map((e,i)=>li(`${e.id===S.sel?'hi sel':''} ${i===NS.m&&NS.col===2?'cur':''}`,`data-eid="${e.id}" aria-selected="${e.id===S.sel}"`,`<span class="nn">${esc(e.name)}</span><span class="ny">${esc(e.years)}</span>`)).join('')}</ul>`;
  }
  const e=focusE||curEntry();NS.det=e&&e.id;
  $('#navDet').innerHTML=e?`<span class="dn">${e.id===S.sel?'● ':''}${esc(fullName(e))}</span><span class="ds">${esc(entrySpec(e))}</span><em class="${e.official?'ok':''}" title="${e.official?'Según especificaciones del fabricante o del servicio':'Basado en lo habitual de esa plataforma: compruébalo con tu equipo o usa el Pack de prueba'}">${e.official?'VERIFICADO':'ORIENTATIVO'}</em><button class="info" data-info="cass" aria-label="Más sobre este preset">i</button>`:'';
  box.querySelectorAll('.cur,.hi').forEach(h=>{const ul=h.parentElement,r=h.getBoundingClientRect(),p=ul.getBoundingClientRect();if(r.top<p.top)ul.scrollTop+=r.top-p.top;else if(r.bottom>p.bottom)ul.scrollTop+=r.bottom-p.bottom});
}
function navMove(d){
  if(NS.q.trim()){NS.hi+=d;renderNav();return}
  const cat=NAV[NS.c];
  if(NS.col===0){NS.c=(NS.c+d+NAV.length)%NAV.length;NS.b=0;NS.m=-1}
  else if(NS.col===1){NS.b=(NS.b+d+cat.brands.length)%cat.brands.length;NS.m=-1}
  else{const its=cat.brands[NS.b].items;NS.m=NS.m<0?(d>0?0:its.length-1):(NS.m+d+its.length)%its.length}
  renderNav();
}
function navEnter(){
  if(NS.q.trim()){const e=results()[NS.hi];if(e)applyEntry(e);return}
  if(NS.col<2){NS.col++;renderNav();return}
  const e=NS.m>=0&&NAV[NS.c].brands[NS.b].items[NS.m];if(e)applyEntry(e);
}
function bindNav(){
  const nav=$('#nav'),q=$('#navQ');
  q.addEventListener('input',()=>{NS.q=q.value;NS.hi=0;NS.req=false;renderNav()});
  nav.addEventListener('click',e=>{
    const t=e.target.closest('li,button');if(!t||S.busy)return;
    if(t.dataset.back){NS.col=Math.max(0,NS.col-1);renderNav();return}
    if(t.dataset.nc){NS.c=+t.dataset.nc;const bi=NAV[NS.c].brands.findIndex(b=>b.items.some(e=>e.id===S.sel));NS.b=Math.max(0,bi);NS.m=-1;NS.col=1;renderNav();return}
    if(t.dataset.nb){NS.b=+t.dataset.nb;NS.m=NAV[NS.c].brands[NS.b].items.findIndex(e=>e.id===S.sel);NS.col=2;renderNav();return}
    if(t.dataset.eid){applyEntry(ENTRIES.find(x=>x.id===t.dataset.eid));return}
    if(t.id==='reqBtn'){NS.req=!NS.req;renderNav();if(NS.req)setTimeout(()=>$('#reqIn')&&$('#reqIn').focus(),0);return}
    if(t.id==='reqCancel'){NS.req=false;renderNav();return}
    if(t.id==='reqSend')sendRequest();
  });
  nav.addEventListener('keydown',e=>{
    if(e.target.id==='reqIn'){if(e.key==='Enter')sendRequest();if(e.key==='Escape'){NS.req=false;renderNav();nav.focus()}return}
    const inQ=e.target===q;
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();navMove(e.key==='ArrowDown'?1:-1);return}
    if(e.key==='Enter'){e.preventDefault();navEnter();return}
    if(e.key==='Escape'){q.value='';NS.q='';renderNav();nav.focus();return}
    if(inQ)return;
    if(e.key==='ArrowRight'){e.preventDefault();navEnter();return}
    if(e.key==='ArrowLeft'||e.key==='Backspace'){e.preventDefault();NS.col=Math.max(0,NS.col-1);renderNav();return}
    if(e.key.length===1&&!e.metaKey&&!e.ctrlKey){q.focus()}
  });
}
async function sendRequest(){
  const inp=$('#reqIn'),msg=$('#reqMsg'),txt=(inp.value||'').trim();if(!txt){inp.focus();return}
  msg.textContent='ENVIANDO…';
  let db=null;try{db=window.claude?.use?await window.claude.use('db'):null}catch(e){}
  if(!db){window.open('https://github.com/eduardmcv/losslessbuddy/issues/new?labels=preset&title='+encodeURIComponent('Preset: '+txt.slice(0,140)),'_blank','noopener');msg.textContent='SE HA ABIERTO GITHUB PARA ENVIAR LA PETICIÓN.';return}
  try{await db.collection('requests').add({text:txt.slice(0,140),at:Date.now()});inp.value='';msg.textContent='ANOTADO: «'+txt.toUpperCase().slice(0,40)+'». GRACIAS.'}
  catch(e){msg.textContent=e&&e.code==='invalid_argument'?'SOLO EL PROPIETARIO PUEDE GUARDAR PETICIONES EN ESTA VERSIÓN.':'NO SE PUDO GUARDAR. INTÉNTALO MÁS TARDE.'}
}
function crt(on){const n=$('#nav');n.classList.remove('crt-on','crt-off');void n.offsetWidth;n.classList.toggle('crt-dark',!on);if(!reduce)n.classList.add(on?'crt-on':'crt-off')}
function setMode(m){
  S.mode=m;const c=$('#navCover'),pre=m==='preset',T=reduce?0:720,O=reduce?0:420,mk=[...$('#modeSw').children];
  mk.forEach(b=>{b.setAttribute('aria-checked',b.dataset.mode===m);b.disabled=true});$('#manualBox').inert=pre;c.inert=!pre;
  if(pre){c.classList.add('closing');c.classList.remove('off');
    setTimeout(()=>{c.classList.remove('closing');$('#stage').dataset.mode='preset';applyEntry(curEntry());crt(true);mk.forEach(b=>b.disabled=false)},T)}
  else{crt(false);renderAll();
    setTimeout(()=>{c.classList.add('off');setTimeout(()=>{$('#stage').dataset.mode='manual';mk.forEach(b=>b.disabled=false)},T)},O)}
}
