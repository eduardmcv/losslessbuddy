/* ---------- i18n: Spanish is the source text; other languages map it at render time ---------- */
const LANGS={en:{label:'EN',locale:'en-US',dict:typeof I18N_EN!=='undefined'?I18N_EN:{}},es:{label:'ES',locale:'es-ES',dict:null}};
const I18N_NEUTRAL=new Set(typeof I18N_SAME!=='undefined'?I18N_SAME:[]);
let LANG=(()=>{try{const l=localStorage.getItem('lb-lang');if(LANGS[l])return l}catch(e){}return 'en'})();
const LOC=()=>LANGS[LANG].locale;
function T(s,p){
  const d=LANGS[LANG].dict,has=d&&Object.prototype.hasOwnProperty.call(d,s);let r=has?d[s]:s;
  if(d&&!has&&!I18N_NEUTRAL.has(s)&&/[a-záéíóúñ]/i.test(s))(T.missing||(T.missing=new Set)).add(s);
  return p?r.replace(/\{(\w+)\}/g,(_,k)=>p[k]??''):r;
}
// Static markup: remember each node's source text once, then translate from it on every switch.
const I18N_ATTRS=['aria-label','title','placeholder'],srcText=new WeakMap(),srcAttr=new WeakMap();
function applyStatic(root=document.body){
  const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode:n=>n.parentElement.closest('script,style,svg,[data-dyn]')?NodeFilter.FILTER_REJECT:/\S/.test(n.nodeValue)?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT});
  for(let n;n=w.nextNode();){if(!srcText.has(n))srcText.set(n,n.nodeValue);const src=srcText.get(n),t=src.trim();n.nodeValue=src.replace(t,T(t))}
  root.querySelectorAll(I18N_ATTRS.map(a=>`[${a}]`).join(',')).forEach(el=>{if(el.closest('[data-dyn]'))return;
    let m=srcAttr.get(el);if(!m){m={};I18N_ATTRS.forEach(a=>{if(el.hasAttribute(a))m[a]=el.getAttribute(a)});srcAttr.set(el,m)}
    for(const a in m)el.setAttribute(a,T(m[a]))});
  document.documentElement.lang=LANG;
}
function renderLangSw(){$('#langSw').innerHTML=Object.entries(LANGS).map(([k,v])=>`<button data-lang="${k}" aria-pressed="${k===LANG}">${v.label}</button>`).join('')}
