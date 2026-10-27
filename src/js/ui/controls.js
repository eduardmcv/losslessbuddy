/* ---------- needle meter ---------- */
const M={min:10,max:22,ang:50,cx:120,cy:178};
const mPt=(r,v)=>{const a=(-M.ang+2*M.ang*(v-M.min)/(M.max-M.min))*Math.PI/180;return[(M.cx+r*Math.sin(a)).toFixed(2),(M.cy-r*Math.cos(a)).toFixed(2)]};
const mArc=(r,v0,v1)=>{const[a,b]=mPt(r,v0),[c,d]=mPt(r,v1);return`M${a} ${b}A${r} ${r} 0 0 1 ${c} ${d}`};
function buildMeter(){
  let t='';
  for(let v=10;v<=22.001;v+=.5){const maj=Math.abs(v%2)<.01,[x1,y1]=mPt(112,v),[x2,y2]=mPt(maj?124:118,v);t+=`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#2d2d2d" stroke-width="${maj?1.4:.8}"/>`;
    if(maj){const[lx,ly]=mPt(134,v);t+=`<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle" font-size="11" fill="${v<19?'#c9271c':'#2d2d2d'}">${v}</text>`}}
  const[lx,ly]=mPt(93,12.8);
  $('#meterSvg').innerHTML=`<defs>
    <radialGradient id="mf" cx="50%" cy="15%" r="95%"><stop offset="0" stop-color="#f7f6f2"/><stop offset="1" stop-color="#d6d6d6"/></radialGradient>
    <linearGradient id="mg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".45"/><stop offset=".45" stop-color="#ffffff" stop-opacity="0"/></linearGradient></defs>
    <rect width="240" height="150" fill="url(#mf)"/>
    <path d="${mArc(106,10,19)}" stroke="#d8261b" stroke-width="6" fill="none" opacity=".85"/>
    <path d="${mArc(112,10,22)}" stroke="#2d2d2d" stroke-width="1.2" fill="none"/>
    ${t}
    <text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle" font-size="7.5" letter-spacing="1.5" fill="#c9271c" transform="rotate(-27 ${lx} ${ly})">LOSSY</text>
    <text x="120" y="106" text-anchor="middle" font-size="15" fill="#2d2d2d" font-family="Barlow Condensed, sans-serif" font-weight="600">kHz</text>
    <text x="120" y="119" text-anchor="middle" font-size="7.5" letter-spacing="2" fill="#6e6e6e" font-family="Barlow Condensed, sans-serif">CORTE DE AGUDOS</text>
    <g id="needle"><line x1="120" y1="178" x2="120" y2="48" stroke="#d8261b" stroke-width="1.7" stroke-linecap="round"/></g>
    <circle cx="120" cy="178" r="36" fill="#232323"/><circle cx="120" cy="178" r="36" fill="none" stroke="#3e3e3e" stroke-width="1.5"/><circle cx="120" cy="178" r="24" fill="#545454"/><path d="M114 160l12 12M126 160l-12 12" stroke="#2d2d2d" stroke-width="2"/>
    <rect width="240" height="150" fill="url(#mg)"/>
    <rect x="1.5" y="1.5" width="237" height="147" rx="5" fill="none" stroke="rgba(0,0,0,.25)" stroke-width="3"/>`;
}
const needle={cur:0,v:0,target:0};
const setNeedleKhz=k=>{needle.target=k==null?0:Math.max(-.02,Math.min(1.05,(k-M.min)/(M.max-M.min)))};

/* ---------- LED ladder ---------- */
const SEGS=16,LMIN=-36,LMAX=-6;
function buildLadder(){
  ['#lcolL','#lcolR'].forEach(id=>{$(id).innerHTML=Array.from({length:SEGS},(_,i)=>`<i class="seg ${i>=14?'r':i>=12?'a':''}"></i>`).join('')});
  const sc=document.querySelector('.lscale');sc.style.position='relative';sc.style.width='22px';
  sc.innerHTML=[-6,-14,-24,-36].map(v=>`<span style="position:absolute;left:0;bottom:${(v-LMIN)/(LMAX-LMIN)*100}%;transform:translateY(50%)">${String(v).replace('-','−')}</span>`).join('');
}
const ladder={l:-80,r:-80};
function drawLadder(l,r){
  [['#lcolL',l],['#lcolR',r]].forEach(([id,v])=>{const n=Math.round((v-LMIN)/(LMAX-LMIN)*SEGS);[...$(id).children].forEach((s,i)=>s.classList.toggle('on',i<n))});
}

/* ---------- animation loop: needle spring + live level ---------- */
let last=performance.now(),live=null;const td=new Float32Array(2048);
const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
function loop(now){
  const dt=Math.min(.05,(now-last)/1000);last=now;
  if(reduce){needle.cur=needle.target}else{const k=70,c=2*Math.sqrt(k)*.5,a=k*(needle.target-needle.cur)-c*needle.v;needle.v+=a*dt;needle.cur+=needle.v*dt;
    if(needle.cur>1.06){needle.cur=1.06;needle.v*=-.3}if(needle.cur<-.04){needle.cur=-.04;needle.v*=-.3}}
  const jit=S.an&&!reduce?(Math.sin(now*.0007)*.6+Math.sin(now*.0016+1.7)*.3+Math.sin(now*.0029+.4)*.1)*.024:0;
  const ng=document.getElementById('needle');if(ng)ng.setAttribute('transform',`rotate(${(-M.ang+2*M.ang*(needle.cur+jit)).toFixed(2)} 120 178)`);
  if(playing&&playing.src&&AC){playing.cur=Math.min(dur(),playing.off+AC.currentTime-playing.t0);placeRed(playing.cur)}
  if(live){
    const lv=a=>{a.getFloatTimeDomainData(td);let s=0;for(let i=0;i<td.length;i++)s+=td[i]*td[i];return 20*Math.log10(Math.sqrt(s/td.length)+1e-9)-0.691+3.01};
    const L=lv(live.aL),R=lv(live.aR);
    ladder.l+=(L-ladder.l)*(L>ladder.l?.35:.07);ladder.r+=(R-ladder.r)*(R>ladder.r?.35:.07);
    drawLadder(ladder.l,ladder.r);$('#lval').textContent=num(Math.max(ladder.l,ladder.r));
  }
  requestAnimationFrame(loop);
}
function restLadder(){const a=S.an,L=a&&isFinite(a.lufs)?a.lufs:-80;ladder.l=ladder.r=L;drawLadder(L,L);$('#lval').textContent=a&&isFinite(a.lufs)?num(a.lufs):'—';
  const tp=a?20*Math.log10(a.tp||1e-9):null;$('#tpVal').textContent=a?num(tp):'—';$('#tpLed').classList.toggle('on',!!a&&tp>-1);
  $('#drVal').textContent=a&&isFinite(a.dr)?Math.round(a.dr):'—';$('#lraVal').textContent=a&&isFinite(a.lra)?num(a.lra):'—'}

/* ---------- knobs ---------- */
const KN={kQ:{},kRate:{},kNorm:{}};
function knobState(id){
  const o=S.out,f=FMT[o.fmt];
  if(id==='kQ')return f.lossless?{opts:f.depths.map(v=>({v,l:v===32?'32F':v+''})),cur:o.bits,span:f.depths.length===2?80:130,label:'Bits'}
    :{opts:KBPS.map(v=>({v,l:v+''})),cur:o.kbps,span:150,label:'kbps'};
  if(id==='kNorm')return{opts:[{v:'off',l:'Off'},{v:-23,l:'−23'},{v:-16,l:'−16'},{v:-14,l:'−14'},{v:'peak',l:'Pico'}],cur:!o.norm?'off':o.norm==='peak'?'peak':o.lufs,span:170,label:'Normalizar'};
  const list=f.rates?(f.rates.length===1?f.rates:[0,...f.rates.filter(r=>r>=44100)]):RATES,sr=S.src?S.src.rate:0;
  return{opts:list.map(v=>({v,l:v?(v/1000).toLocaleString('es-ES'):'Orig '+(sr?(sr/1000).toLocaleString('es-ES'):'')})),cur:o.rate,span:list.length===3?100:150,label:'Muestreo'};
}
function drawKnob(id){
  const el=$('#'+id),{opts,cur,span,label}=knobState(id),big=!!KN[id].big,s=big?118:76,m=big?40:34,c=s/2+m,n=opts.length;
  const ang=i=>n===1?0:-span/2+span*i/(n-1);
  let idx=opts.findIndex(x=>x.v===cur);if(idx<0)idx=0;
  const sig=opts.map(x=>x.l+x.off).join();
  if(el._sig!==sig){
    el._sig=sig;const rl=s/2+(big?34:24),rd=s/2+(big?23:12);
    el.innerHTML=(big?'<div class="kring"></div>':'')+'<div class="kwell"></div>'+
      opts.map((x,i)=>{const a=ang(i)*Math.PI/180;return`<i class="kdot" style="left:${c+rd*Math.sin(a)}px;top:${c-rd*Math.cos(a)}px"></i><button class="kopt" data-i="${i}" style="left:${c+rl*Math.sin(a)}px;top:${c-rl*Math.cos(a)}px;transform:translate(${Math.sin(a)<-.5?'-100%':Math.sin(a)>.5?'0':'-50%'},-50%);${x.off?'text-decoration:line-through':''}">${x.l}</button>`}).join('')+
      `<div class="kn" role="slider" tabindex="0" aria-label="${label}" aria-valuemin="0" aria-valuemax="${n-1}"><div class="rot"><i class="ptr"></i></div></div>`;
  }
  el._idx=idx;el._n=n;
  el.querySelector('.rot').style.transform=`rotate(${ang(idx)}deg)`;
  const kn=el.querySelector('.kn');kn.setAttribute('aria-valuenow',idx);kn.setAttribute('aria-valuetext',opts[idx].l);
  el.querySelectorAll('.kopt').forEach((b,i)=>b.setAttribute('aria-current',i===idx));
  el.querySelectorAll('.kdot').forEach((d,i)=>d.classList.toggle('on',i===idx));
}
function setKnob(id,i){
  const{opts}=knobState(id);i=Math.max(0,Math.min(opts.length-1,i));const v=opts[i].v,f=FMT[S.out.fmt];
  if(id==='kQ')setOut(f.lossless?{bits:v}:{kbps:v});else if(id==='kNorm')setOut(v==='off'?{norm:false}:v==='peak'?{norm:'peak'}:{norm:'lufs',lufs:v});else setOut({rate:v});
}
function bindKnob(id){
  const el=$('#'+id);let drag=null;
  el.addEventListener('click',e=>{const b=e.target.closest('.kopt');if(b&&!S.busy)setKnob(id,+b.dataset.i)});
  el.addEventListener('pointerdown',e=>{const kn=e.target.closest('.kn');if(!kn||S.busy)return;e.preventDefault();kn.focus({preventScroll:true});kn.setPointerCapture(e.pointerId);drag={x:e.clientX,y:e.clientY,i:el._idx,moved:false}});
  el.addEventListener('pointermove',e=>{if(!drag)return;const d=(drag.y-e.clientY)+(e.clientX-drag.x);if(Math.abs(d)>4)drag.moved=true;const i=drag.i+Math.round(d/28);if(i!==el._idx&&i>=0&&i<el._n)setKnob(id,i)});
  el.addEventListener('pointerup',()=>{if(drag&&!drag.moved)setKnob(id,(el._idx+1)%el._n);drag=null});
  el.addEventListener('pointercancel',()=>drag=null);
  el.addEventListener('wheel',e=>{if(!e.target.closest('.kn')||S.busy)return;e.preventDefault();setKnob(id,el._idx+(e.deltaY<0?1:-1))},{passive:false});
  el.addEventListener('keydown',e=>{if(!e.target.closest('.kn')||S.busy)return;const d={ArrowUp:1,ArrowRight:1,ArrowDown:-1,ArrowLeft:-1}[e.key];if(d){e.preventDefault();setKnob(id,el._idx+d)}});
}

/* ---------- tuner dial ---------- */
const DPAD=14;
const dur=()=>S.src?S.src.dur:0;
function drawDial(){
  const cv=$('#dialCv'),r=cv.getBoundingClientRect(),dpr=devicePixelRatio||1,w=r.width,hh=r.height;if(!w)return;
  cv.width=w*dpr;cv.height=hh*dpr;const c=cv.getContext('2d');c.scale(dpr,dpr);
  const g=c.createLinearGradient(0,0,0,hh);g.addColorStop(0,'#f2f0e8');g.addColorStop(1,'#dedbd0');c.fillStyle=g;c.fillRect(0,0,w,hh);
  const d=dur();if(!d)return;
  const span=w-DPAD*2,steps=[1,2,5,10,15,30,60,120,300,600];let maj=steps.find(s=>d/s<=span/64)||900;
  const minor=maj/(maj%3===0&&maj>=15?6:5);
  c.strokeStyle='#2d2d2d';c.fillStyle='#2d2d2d';c.textAlign='center';c.font='600 11px "Barlow Condensed", sans-serif';
  c.lineWidth=1;c.beginPath();c.moveTo(DPAD,hh-12.5);c.lineTo(w-DPAD,hh-12.5);c.stroke();
  for(let s=0;s<=d+1e-6;s+=minor){const x=Math.round(DPAD+s/d*span)+.5,isM=Math.abs(s/maj-Math.round(s/maj))<1e-6;
    c.beginPath();c.moveTo(x,hh-12.5);c.lineTo(x,hh-12.5-(isM?16:7));c.lineWidth=isM?1.3:.8;c.stroke();
    if(isM)c.fillText(fmtTime(s),x,15)}
  const xe=Math.round(DPAD+span)+.5;c.beginPath();c.moveTo(xe,hh-12.5);c.lineTo(xe,hh-12.5-16);c.stroke();
  c.fillStyle='#c9271c';c.font='600 9px "Barlow Condensed", sans-serif';c.textAlign='right';c.fillText('FIN',w-DPAD-4,hh-2);
}
function placeRed(sec){
  const d=dur(),w=$('#dial').clientWidth;$('#red').style.left=(DPAD+(d?Math.min(1,sec/d):0)*(w-DPAD*2))+'px';
  setTune(dur()?sec/dur()*TURN:0);
  if(S.scopeOpen){const sc=$('#screen').clientWidth-56;$('#playhead').style.left=(10+(d?Math.min(1,sec/d):0)*sc)+'px'}
}
let seekT=null;
function setPos(sec,fromUser){glide++;
  S.pos=Math.max(0,Math.min(dur(),sec));placeRed(S.pos);$('#wheel').setAttribute('aria-valuetext',fmtTime(S.pos)+' de '+fmtTime(dur()));
  if(fromUser&&playing&&playing.src){clearTimeout(seekT);seekT=setTimeout(()=>{if(playing&&playing.src){const b=playing.btn;stopPlay(true);play(S.src.buffer,b,S.pos)}},140)}
}
function bindDial(){
  const dial=$('#dial'),wh=$('#wheel');let dd=null,wd=null;
  const at=x=>{const r=dial.getBoundingClientRect();return((x-r.left-DPAD)/(r.width-DPAD*2))*dur()};
  dial.addEventListener('pointerdown',e=>{e.preventDefault();dial.setPointerCapture(e.pointerId);dd=1;setPos(at(e.clientX),true)});
  dial.addEventListener('pointermove',e=>{if(dd)setPos(at(e.clientX),true)});
  dial.addEventListener('pointerup',()=>dd=null);dial.addEventListener('pointercancel',()=>dd=null);
  const ang=e=>{const r=wh.getBoundingClientRect(),x=e.clientX-r.left-r.width/2,y=e.clientY-r.top-r.height/2;return{a:Math.atan2(x,-y)*180/Math.PI,d:Math.hypot(x,y)}};
  wh.addEventListener('pointerdown',e=>{e.preventDefault();wh.focus({preventScroll:true});wh.setPointerCapture(e.pointerId);wd=ang(e)});
  wh.addEventListener('pointermove',e=>{if(!wd)return;const n=ang(e);if(n.d<6)return;let da=n.a-wd.a;if(da>180)da-=360;if(da<-180)da+=360;wd=n;setPos(S.pos+da/TURN*dur(),true)});
  wh.addEventListener('pointerup',()=>wd=null);wh.addEventListener('pointercancel',()=>wd=null);
  wh.addEventListener('wheel',e=>{e.preventDefault();const d=Math.abs(e.deltaX)>Math.abs(e.deltaY)?e.deltaX:-e.deltaY;setPos(S.pos+d*.2/TURN*dur(),true)},{passive:false});
  wh.addEventListener('keydown',e=>{const k={ArrowUp:1,ArrowRight:1,ArrowDown:-1,ArrowLeft:-1,PageUp:10,PageDown:-10}[e.key];if(k){e.preventDefault();setPos(S.pos+k,true)}else if(e.key==='Home'){e.preventDefault();setPos(0,true)}});
  const ro=new ResizeObserver(()=>{drawDial();placeRed(S.pos)});ro.observe(dial);
  document.fonts&&document.fonts.ready.then(()=>{drawDial();placeRed(S.pos)});
}
function resetDial(){S.pos=0;drawDial();placeRed(0)}

const TURN=1080;
function setTune(deg){$('#tuneRot').style.transform=`rotate(${deg}deg)`;$('#tuneRing').style.transform=`rotate(${deg}deg)`}
