/* ---------- info popovers ---------- */
let popBtn=null;
function openInfo(btn){
  const pop=$('#pop');if(popBtn===btn){closeInfo();return}closeInfo();
  const k=btn.dataset.info,[t,...ps]=k==='cass'?(x=>[fullName(x),x.info+(x.official?'':' (Orientativo: compruébalo con tu equipo o usa el Pack de prueba.)')])(ENTRIES.find(y=>y.id===NS.det)||curEntry()):INFO[k];
  pop.innerHTML=`<b>${t}</b>`+ps.map(p=>`<p>${p}</p>`).join('')+(k==='meter'&&S.an?`<p style="color:#eef2f6">${S.an.v.t}${S.an.v.conf?' · confianza '+S.an.v.conf:''}</p>`+S.an.v.sigs.map(s=>`<p style="color:${s.ok?'#ffb35c':'#aab3be'}">${s.ok?'●':'○'} ${s.label}</p>`).join('')+(S.an.v.est?`<p>Origen estimado: ${S.an.v.est}</p>`:''):'');
  pop.hidden=false;btn.setAttribute('aria-expanded','true');popBtn=btn;
  const r=btn.getBoundingClientRect(),w=pop.offsetWidth,h=pop.offsetHeight;
  let x=Math.min(innerWidth-w-16,Math.max(16,r.left+r.width/2-w/2)),y=r.bottom+10;if(y+h>innerHeight-12)y=Math.max(12,r.top-h-10);
  pop.style.left=x+'px';pop.style.top=y+'px';
}
function closeInfo(){$('#pop').hidden=true;if(popBtn)popBtn.setAttribute('aria-expanded','false');popBtn=null}

/* ---------- analysis ---------- */
async function runAnalysis(){
  const buf=S.src.buffer,chans=[];for(let c=0;c<buf.numberOfChannels;c++)chans.push(buf.getChannelData(c));
  const an=await analyzeAll(chans,buf.sampleRate,S.src);if(S.src.buffer!==buf)return;
  S.an=an;setNeedleKhz(an.cut.full?30:an.cut.hz/1000);restLadder();renderAll();if(S.scopeOpen)drawSpec();
  // FLAC size: encode 10 s from the middle and extrapolate
  try{const fs=buf.sampleRate,n=Math.min(buf.length,fs*10),st=Math.floor((buf.length-n)/2),cl=chans.slice(0,2).map(c=>c.subarray(st,st+n));
    const enc=await encFLAC(cl,fs,16,true,()=>{});S.flacRatio=enc.length/(n*cl.length*2);renderAll()}catch(e){}
}
const SPEC_LUT=(()=>{const st=[[0,[9,9,11]],[.22,[40,18,72]],[.45,[118,30,86]],[.65,[205,78,46]],[.82,[242,158,58]],[1,[252,244,210]]],lut=new Uint8Array(768);
  for(let i=0;i<256;i++){const x=i/255;let j=0;while(j<st.length-2&&x>st[j+1][0])j++;const[t0,c0]=st[j],[t1,c1]=st[j+1],f=(x-t0)/(t1-t0);for(let k=0;k<3;k++)lut[i*3+k]=c0[k]+(c1[k]-c0[k])*f}return lut})();
function drawSpec(){
  if(!S.an)return;const{sp,fs,cut}=S.an,{spec,cols,bins}=sp,cv=$('#spec'),H=300,nyq=fs/2,log=S.scale==='log',fmin=40;
  cv.width=cols;cv.height=H;const ctx=cv.getContext('2d'),img=ctx.createImageData(cols,H),lo=-120,hi=-10;
  const yToF=y=>{const u=(H-1-y)/(H-1);return log?fmin*Math.pow(nyq/fmin,u):u*nyq};
  for(let y=0;y<H;y++){const b=Math.min(bins-1,Math.round(yToF(y)/nyq*(bins-1)));
    for(let x=0;x<cols;x++){let v=(spec[x*bins+b]-lo)/(hi-lo);v=v<0?0:v>1?1:v;const ci=(v*255|0)*3,o=(y*cols+x)*4;img.data[o]=SPEC_LUT[ci];img.data[o+1]=SPEC_LUT[ci+1];img.data[o+2]=SPEC_LUT[ci+2];img.data[o+3]=255}}
  ctx.putImageData(img,0,0);
  const fpos=f=>log?Math.log(f/fmin)/Math.log(nyq/fmin):f/nyq;
  const ticks=log?[100,1000,10000,20000].filter(f=>f<nyq):Array.from({length:Math.floor(nyq/(nyq>30000?10000:5000))+1},(_,i)=>i*(nyq>30000?10000:5000));
  $('#faxis').innerHTML=ticks.map(f=>`<span style="bottom:${fpos(Math.max(f,log?fmin:0))*100}%">${f>=1000?f/1000+'k':f}</span>`).join('');
  const cl=$('#cutline');cl.hidden=cut.full;if(!cut.full){cl.style.bottom=`calc(10px + (100% - 20px) * ${fpos(cut.hz)})`;$('#cutLbl').textContent='CORTE '+num(cut.hz/1000)+' KHZ'}
  $('#scaleSw').setAttribute('aria-checked',S.scale==='log');
  placeRed(playing&&playing.src?playing.cur:S.pos);
}

/* ---------- loading ---------- */
async function loadFile(file){
  if(S.busy)return;stopPlay();
  const ab=await file.arrayBuffer(),info=sniff(new Uint8Array(ab),file.name);let buf;
  try{const ctx=new OfflineAudioContext(1,1,info.rate&&info.rate>=8000&&info.rate<=384000?info.rate:44100);buf=await ctx.decodeAudioData(ab.slice(0))}
  catch(e){toast(`Tu navegador no sabe leer ${info.fmt}. Prueba en Chrome o Safari.`,true);return}
  S.src={name:file.name,size:file.size,fmt:info.fmt,bits:info.bits,float:info.float,rate:buf.sampleRate,ch:buf.numberOfChannels,dur:buf.duration,buffer:buf,raw:ab,demo:false};
  const md=readMeta(new Uint8Array(ab),info.fmt,file.name);S.tags=md.tags;renderTagForm();await setCoverSrc(md.cover?await coverDims(md.cover):null);
  S.an=null;setNeedleKhz(null);resetDial();renderAll();await runAnalysis();
}

/* ---------- label: tags + cover ---------- */
let covURL=null;
const outBase=()=>{const t=S.tags||{},n=[t.artist,t.title].map(x=>(x||'').trim()).filter(Boolean).join(' - ')||baseName(S.src.name);return n.replace(/[\\/:*?"<>|\u0000-\u001f]+/g,'_').replace(/\s+/g,' ').replace(/^[ .]+|[ .]+$/g,'').slice(0,120)||'audio'};
async function setCoverSrc(c){S.coverSrc=c;if(covURL)URL.revokeObjectURL(covURL);covURL=c?URL.createObjectURL(new Blob([c.data],{type:c.mime})):null;await refreshCover()}
async function refreshCover(){
  const mode=S.out.cover,src=S.coverSrc;
  try{S.coverOut=src?await renderCover(src,mode):null}catch(e){S.coverOut=mode==='none'?null:src}
  renderLabel();renderAll();
}
const tagsAllowed=o=>!(o.fmt==='aac'&&o.aacCont==='adts');
const coverAllowed=o=>tagsAllowed(o)&&o.fmt!=='wav';
function renderLabel(){
  const o=S.out,c=S.coverSrc,img=$('#covImg');
  $('#vlabel').style.backgroundImage=covURL?`url(${covURL})`:'';
  img.hidden=!covURL;if(covURL&&img.src!==covURL)img.src=covURL;$('#covNone').hidden=!!covURL;$('#covX').hidden=!(c&&(o.cover==='none'||!coverAllowed(o)));
  $('#segCover').innerHTML=[['keep','Original'],['500','500'],['600','600'],['1000','1000'],['none','Quitar']].map(([v,l])=>`<button class="tk mini" role="radio" data-cov="${v}" aria-checked="${o.cover===v}" ${S.busy?'disabled':''}>${l}</button>`).join('');
  $('#segId3').innerHTML=`<button class="tk mini" role="radio" aria-checked="true" disabled>ID3v2.3</button><button class="tk mini" role="switch" data-id3v1="1" aria-checked="${!!o.id3v1}" ${S.busy?'disabled':''}>+ ID3v1</button>`;
  $('#id3Row').hidden=o.fmt!=='mp3';
  const kb=n=>Math.round(n/1024)+' KB',n=$('#coverNote');let txt='',warn=false;
  if(!tagsAllowed(o))txt='El .aac pelado (ADTS) no admite etiquetas ni carátula. Usa .m4a si las quieres.';
  else if(!c)txt='Sin carátula. Arrastra una imagen a la página o pulsa Cambiar.';
  else{const d=`${c.w}×${c.h} ${c.mime==='image/png'?'PNG':c.mime==='image/jpeg'?'JPEG':'imagen'} · ${kb(c.data.length)}`;
    if(o.fmt==='wav')txt=`Original ${d}. WAV no guarda carátula de forma fiable: se omite.`;
    else if(o.cover==='none')txt=`Original ${d}. No se incluirá carátula.`;
    else if(o.cover==='keep'){txt=`Se incrusta tal cual: ${d}.`;if(c.data.length>200*1024||c.w>1000||c.mime!=='image/jpeg'){warn=true;txt+=` ${c.data.length>200*1024?'Pesa más de 200 KB':c.w>1000?'Mide más de 1000 px':'No es JPEG'}: muchas radios de coche no la muestran o se cuelgan. Usa 500 px.`}}
    else if(S.coverOut)txt=`Original ${d} → JPEG ${S.coverOut.w} px · ${kb(S.coverOut.data.length)}.${c.w<+o.cover?' La imagen es más pequeña: no se amplía.':''}`}
  n.textContent=txt;n.className='jnote'+(warn?' warn':'');
  const tg=S.tags;$('#jtitle').textContent=[tg.artist,tg.title].filter(Boolean).join(' — ')||'Sin título';
}
function renderTagForm(){
  $('#tagForm').innerHTML=TAGF.map(([k,l])=>`<label class="${['title','artist','album','albumArtist'].includes(k)?'wide':''}">${l}<input id="tag-${k}" data-tag="${k}" value="${(S.tags[k]||'').replace(/"/g,'&quot;')}" autocomplete="off" spellcheck="false"></label>`).join('');
  renderLabel();
}
const metaFor=o=>({tags:S.tags,cover:coverAllowed(o)?S.coverOut:null});

/* ---------- playback ---------- */
let AC=null,playing=null;
function ac(){if(!AC)AC=new (window.AudioContext||window.webkitAudioContext)();if(AC.state==='suspended')AC.resume();return AC}
const FADE_IN=.04,FADE_OUT=.25;
let glide=0;
function glideTo(from,to){
  const id=++glide,ms=reduce?0:Math.min(700,250+Math.abs(to-from)/Math.max(1,dur())*600),t0=performance.now();
  const step=now=>{if(id!==glide||playing)return;const k=ms?Math.min(1,(now-t0)/ms):1,e=1-Math.pow(1-k,3);placeRed(from+(to-from)*e);if(k<1)requestAnimationFrame(step)};
  requestAnimationFrame(step);
}
function stopPlay(keep){if(playing){const p0=playing;try{const now=AC.currentTime,g=p0.gain.gain;g.cancelScheduledValues(now);g.setValueAtTime(g.value,now);g.linearRampToValueAtTime(0,now+FADE_OUT);p0.node.stop(now+FADE_OUT+.02)}catch(e){try{p0.node.stop()}catch(_){}}const p=playing;playing=null;if(p.src&&!keep)glideTo(p.cur,S.pos);p.btn.innerHTML=ICON_PLAY;p.btn.classList.remove('on','down')}live=null;document.body.classList.remove('is-playing');restLadder()}
function play(buf,btn,off){
  const was=playing&&playing.btn===btn;stopPlay();if(was)return;off=off||0;
  const c=ac(),n=c.createBufferSource(),sp=c.createChannelSplitter(2),aL=c.createAnalyser(),aR=c.createAnalyser();
  aL.fftSize=aR.fftSize=2048;n.buffer=buf;const gn=c.createGain(),now=c.currentTime;gn.gain.setValueAtTime(0,now);gn.gain.linearRampToValueAtTime(1,now+FADE_IN);n.connect(gn);gn.connect(c.destination);gn.connect(sp);sp.connect(aL,0);sp.connect(aR,buf.numberOfChannels>1?1:0);
  document.body.classList.add('is-playing');
  n.start(now,off);playing={node:n,gain:gn,btn,src:buf===S.src?.buffer,t0:c.currentTime,off,cur:off};live={aL,aR};btn.innerHTML=ICON_STOP;btn.classList.add(btn.classList.contains('tk')?'down':'on');
  n.onended=()=>{if(playing&&playing.node===n)stopPlay()};
}

/* ---------- conversion ---------- */
function setProg(p){const b=$('#convertBtn');b.style.setProperty('--p',p||0);b.classList.toggle('down',p!=null);b.classList.toggle('busy',p!=null);$('#convertTxt').textContent=p==null?'CONVERTIR':Math.round(p*100)+' %';S.prog=p;if(p!=null){const n=Math.round(p*20);$('#d4').textContent=(p<.1?'PROCESANDO ':'REC ')+'▮'.repeat(n)+'·'.repeat(20-n)+' '+Math.round(p*100)+'%'}}
async function convert(){
  if(S.busy||!S.src)return;
  if(packMode())return makePack();
  const o={...S.out},rate=effRate(),f=FMT[o.fmt];
  S.busy=true;closeInfo();renderAll();setProg(.02);await tick();
  try{
    const{chans,note}=await processAudio(S.src.buffer,o,rate);
    const pg=p=>setProg(.1+.9*p);pg(0);await tick();
    const data=await encodeOne(o,chans,rate,pg);
    const name=outBase()+'.'+extOf(o);
    S.queue.unshift({id:Date.now(),name,data,spec:specLine(o,rate,chans.length),note,preset:S.mode==='preset'?fullName(curEntry()):'Ajuste manual'});
    renderOuts();toast(`${name} listo · ${fmtBytes(data.length)}`);
  }catch(e){console.error(e);toast(e.message||'La conversión ha fallado.',true)}
  finally{S.busy=false;setProg(null);renderAll()}
}
async function encodeOne(o,chans,rate,pg){
  const md=metaFor(o);
  if(o.fmt==='wav')return wavInfo(encWAV(chans,rate,o.bits,true),md.tags);
  if(o.fmt==='flac')return encFLAC(chans,rate,o.bits,true,pg,flacBlocks(md.tags,md.cover));
  if(o.fmt==='mp3'){const a=await encMP3(chans,rate,o.kbps,true,pg);return concat([id3v23(md.tags,md.cover),a,o.id3v1?id3v1(md.tags):new Uint8Array(0)])}
  if(o.fmt==='aiff')return encAIFF(chans,rate,o.bits,true,md);
  if(o.fmt==='alac'){const r=await encALAC(chans,rate,o.bits,true,pg);return m4aMux(r.frames,rate,chans.length,null,0,4096,md,{alac:r.cookie,bits:o.bits,durs:r.durs})}
  if(o.fmt==='opus')return encOpus(chans,rate,o.kbps,pg,md,S.src?S.src.rate:rate);
  return encAAC(chans,rate,o.kbps,pg,{mode:o.aacMode,prof:o.aacProf,adts:o.aacCont==='adts',brand:o.aacCont==='m4b'?'M4B ':undefined,meta:tagsAllowed(o)?md:null});
}
const PACK=[
  {n:'AAC-LC_CBR256_44k',d:'AAC-LC 256 kbps fijo, .m4a. El estándar (iTunes).',o:{fmt:'aac',kbps:256,rate:44100},need:'aac'},
  {n:'AAC-LC_VBR256_44k',d:'AAC-LC ~256 kbps variable, .m4a.',o:{fmt:'aac',kbps:256,rate:44100,aacMode:'variable'},need:'aacVbr'},
  {n:'AAC-LC_CBR192_44k_ADTS',d:'AAC-LC 192 kbps fijo como .aac pelado (ADTS).',o:{fmt:'aac',kbps:192,rate:44100,aacCont:'adts'},need:'aacAdts'},
  {n:'HE-AAC_64_44k',d:'HE-AAC 64 kbps, .m4a. Solo equipos que soportan HE.',o:{fmt:'aac',kbps:64,rate:44100,aacProf:'he'},need:'aacHe'},
  {n:'MP3_CBR320_44k',d:'MP3 320 kbps fijo.',o:{fmt:'mp3',kbps:320,rate:44100},need:'mp3'},
  {n:'MP3_CBR192_44k',d:'MP3 192 kbps fijo (por si 320 da problemas).',o:{fmt:'mp3',kbps:192,rate:44100},need:'mp3'},
  {n:'WAV_16bit_44k',d:'WAV 16 bit / 44,1 kHz sin comprimir.',o:{fmt:'wav',bits:16,rate:44100}},
  {n:'FLAC_16bit_44k',d:'FLAC 16 bit / 44,1 kHz sin pérdida.',o:{fmt:'flac',bits:16,rate:44100}}
];
async function makePack(){
  if(S.busy||!S.src)return;
  const src=await srcAt(44100)||S.src.buffer,sr=src.sampleRate,L=Math.min(src.length,30*sr),st=Math.max(0,Math.min(S.pos>0?Math.floor(S.pos*sr):Math.floor(src.length*.25),src.length-L));
  const clip=new AudioBuffer({length:L,numberOfChannels:src.numberOfChannels,sampleRate:sr});
  for(let c=0;c<src.numberOfChannels;c++)clip.copyToChannel(src.getChannelData(c).subarray(st,st+L),c);
  const list=PACK.filter(v=>!v.need||S.eng[v.need]);
  S.busy=true;closeInfo();renderAll();
  const files=[],skipped=PACK.filter(v=>v.need&&!S.eng[v.need]);let readme='PACK DE PRUEBA - Lossless Buddy\r\nCanción: '+S.src.name+' (30 s desde '+fmtTime(st/sr)+')\r\n\r\nCopia los archivos a un USB o SD formateado en FAT32.\r\nReproduce cada uno en el equipo y apunta qué números suenan.\r\nQuédate con el de más calidad que funcione.\r\n\r\n';
  try{
    for(let i=0;i<list.length;i++){
      const v=list[i],o={...BASE,...v.o,cover:S.out.cover,id3v1:true},name=String(i+1).padStart(2,'0')+'_'+v.n+'.'+extOf(o);
      const pg=p=>setProg((i+p)/list.length);pg(0);await tick();
      const{chans}=await processAudio(clip,o,44100);
      try{files.push({name,data:await encodeOne(o,chans,44100,pg)});readme+=name+'\r\n   '+v.d+'\r\n'}
      catch(err){readme+=name+'\r\n   (no se pudo crear en este navegador)\r\n'}
    }
    if(skipped.length)readme+='\r\nNo incluidos (tu navegador no los codifica): '+skipped.map(v=>v.n).join(', ')+'\r\n';
    files.push({name:'LEEME.txt',data:new TextEncoder().encode(readme)});
    const zip=zipMany(files),name='PACK_PRUEBA_'+outBase()+'.zip';
    S.queue.unshift({id:Date.now(),name,data:zip,zip:true,spec:`${files.length-1} versiones de 30 s + LEEME.txt`,note:skipped.length?`Faltan ${skipped.length} variantes que tu navegador no codifica.`:'',preset:'Pack de prueba'});
    renderOuts();toast(`${name} listo · ${fmtBytes(zip.length)}`);
  }catch(err){console.error(err);toast(err.message||'No se pudo crear el pack.',true)}
  finally{S.busy=false;setProg(null);renderAll()}
}
function specLine(o,rate,ch){const f=FMT[o.fmt],aac=o.fmt==='aac';return[aac&&o.aacProf==='he'?'HE-AAC':CODECS.find(c=>c.id===codecOf(o.fmt)).name,f.lossless?(o.bits===32?'32 bit float':o.bits+' bit'):o.kbps+' kbps'+(aac?(o.aacMode==='variable'?' VBR':' CBR'):o.fmt==='mp3'?' CBR':''),'.'+extOf(o),fmtRate(rate),ch===1?'mono':'stereo',o.norm==='lufs'?num(o.lufs,0)+' LUFS':o.norm==='peak'?'pico −1 dBTP':null].filter(Boolean).join(' · ')}
async function download(item,btn){
  let dl=null;try{dl=window.claude?.use?await window.claude.use('downloads'):null}catch(e){}
  if(!dl){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([item.data]));a.download=item.name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),4e3);toast(`Guardado ${item.name}`);return}
  btn.disabled=true;
  const fn=item.zip?item.name:item.name+'.zip';
  try{await dl.save({filename:fn,data:item.zip?item.data:zipOne(item.name,item.data)});toast(`Guardado ${fn}`)}
  catch(e){const c=e&&e.code;toast(c==='declined'?'Descarga cancelada.':c==='rate_limited'?'Ya hay una descarga pendiente de confirmar.':'No se pudo guardar el archivo.',c!=='declined')}
  finally{btn.disabled=false}
}

/* ---------- render ---------- */
const canEncode=f=>f==='aac'?!!S.eng.aac:f==='mp3'?!!S.eng.mp3:f==='opus'?!!S.eng.opus:true;
function qualityLine(br){
  const a=S.an,s=S.src;if(!a)return 'CALIDAD REAL: ANALIZANDO…';
  const v=a.v,g=a.g,k=num(a.cut.hz/1000),kc=a.cut.hz/1000,cls=kc<11.5?64:kc<15.5?112:kc<17.3?128:kc<18?160:kc<19.3?192:kc<20.2?256:320;
  if(!isLossless(s.fmt)){
    const fake=br&&!a.cut.full&&br>=cls*1.45;
    return fake?`CALIDAD REAL ≈ ${g.est.toUpperCase()} (INFLADO A ${br} KBPS)`:`CALIDAD REAL: ${s.fmt} ${br?br+' KBPS':''}${a.cut.full?'':' · CORTE '+k+' KHZ'}`;
  }
  if(v.s==='bad')return`CALIDAD REAL ≈ ${g.est.toUpperCase()}`;
  if(v.t==='Hi-res falso')return'CALIDAD REAL ≈ CD 16 BIT / 44,1 KHZ';
  if(v.t==='24 bit falso')return`CALIDAD REAL: 16 BIT / ${fmtRate(s.rate).toUpperCase()}`;
  if(v.s==='doubt')return`CALIDAD REAL: DUDOSA · CORTE ${k} KHZ`;
  return`CALIDAD REAL: SIN PÉRDIDA ${s.float?'32F':(s.bits||16)+' BIT'} / ${fmtRate(s.rate).toUpperCase()}`;
}
function predGain(){
  const o=S.out,a=S.an;if(!o.norm||!a||!isFinite(a.lufs))return null;const tpdb=20*Math.log10(a.tp||1e-9);
  return o.norm==='peak'?-1-tpdb:Math.min(o.lufs-a.lufs,-1-tpdb);
}
function ensureSupported(){
  if(canEncode(S.out.fmt))return;
  const p=ENTRIES.find(x=>x.id===(canEncode('mp3')?'car-generico-radio-usb-antigua':'arch-coleccion-calidad-cd'));S.sel=p.id;locate(p);S.out={...BASE,...p.o};refreshCover();
}
const extOf=o=>o.fmt==='aac'?(o.aacCont==='adts'?'aac':o.aacCont==='m4b'?'m4b':'m4a'):o.fmt==='opus'?(o.opusExt||'opus'):FMT[o.fmt].ext;
function setOut(p){const cv='cover' in p||'fmt' in p||'aacCont' in p;Object.assign(S.out,p);const f=FMT[S.out.fmt];if(f.lossless&&!f.depths.includes(S.out.bits))S.out.bits=16;if(!f.lossless&&!KBPS.includes(S.out.kbps))S.out.kbps=256;if(f.rates&&S.out.rate&&!f.rates.includes(S.out.rate))S.out.rate=0;renderAll();if(cv)refreshCover();else renderLabel()}
function renderAll(){
  const o=S.out,f=FMT[o.fmt],rate=effRate(),s=S.src;
  ['kQ','kRate','kNorm'].forEach(drawKnob);
  const cod=codecOf(o.fmt);
  $('#deck').innerHTML=CODECS.map(c=>{const off=!canEncode(c.def);return`<button class="tk ${off?'off':''}" role="radio" data-codec="${c.id}" aria-checked="${cod===c.id}" ${S.busy||off?'disabled':''} title="${off?'Tu navegador no codifica '+c.name:''}"><b>${c.name}</b></button>`}).join('');
  $('#segBox').innerHTML=CONTS[cod].map((x,i)=>{const on=Object.entries(x.set||{}).every(([k,v])=>(o[k]||BASE[k])===v),dis=S.busy||(x.need&&!S.eng[x.need]);return`<button class="tk s64" role="radio" data-box="${i}" aria-checked="${on}" ${dis?'disabled':''}><b>${x.l}</b></button>`}).join('');
  $('#qTitle').textContent=f.lossless?'Bits':'Calidad';
  $('#segCh').innerHTML=[[0,'STEREO'],[1,'MONO']].map(([v,l])=>`<button class="tk" role="radio" data-mono="${v}" aria-checked="${!!o.mono===!!v}" ${S.busy?'disabled':''}><b>${l}</b></button>`).join('');
  renderNav();
  const aac=o.fmt==='aac',seg=(id,key,opts)=>{$(id).innerHTML=opts.map(([v,l,need])=>{const dis=S.busy||!aac||(need&&!S.eng[need]);return`<button class="tk s64" role="radio" data-adv="${key}" data-v="${v}" aria-checked="${aac?o[key]===v:v===opts[0][0]}" ${dis?'disabled':''}><b>${l}</b></button>`}).join('')};
  seg('#segMode','aacMode',[['constant','CBR'],['variable','VBR','aacVbr']]);
  seg('#segProf','aacProf',[['lc','LC'],['he','HE','aacHe']]);
  $('#aacOpts').hidden=$('#aacOpts2').hidden=!aac;
  // display
  if(s){
    $('#d1').textContent=s.name.toUpperCase();
    const br=s.size&&s.dur?Math.round(s.size*8/s.dur/1000):0;
    $('#d2').textContent=[s.fmt,!isLossless(s.fmt)&&br?br+' KBPS':null,s.float?'32F':s.bits?s.bits+' BIT':null,fmtRate(s.rate),s.ch===1?'MONO':'STEREO',fmtTime(s.dur),s.size?fmtBytes(s.size):null].filter(Boolean).join(' · ').toUpperCase();
    $('#dq').textContent=qualityLine(br);
    const ch=o.mono?1:Math.min(2,s.ch),n=s.dur*rate*ch,cov=coverAllowed(o)&&S.coverOut?S.coverOut.data.length:0;
    const est=(o.fmt==='wav'||o.fmt==='aiff'?n*o.bits/8:o.fmt==='flac'||o.fmt==='alac'?n*2*S.flacRatio*(o.fmt==='alac'?1.03:1)+(o.bits-16)/8*n:s.dur*o.kbps*125)+cov;
    const g=predGain();
    if(packMode())$('#d3').textContent='→ PACK DE PRUEBA · 8 VERSIONES DE 30 S · ZIP';else $('#d3').textContent=`→ ${specLine(o,rate,ch).toUpperCase()} · ${o.fmt==='flac'||o.fmt==='alac'?'≈':''}${fmtBytes(est)}${g!=null?` · ${g>=0?'+':''}${num(g)} DB`:''}`;
  }
  const unavailable=!packMode()&&!canEncode(o.fmt);
  let st='',cls='';
  if(S.busy&&S.prog!=null)st=$('#d4').textContent;
  else if(packMode())st='';
  else if(unavailable){st=o.fmt==='aac'?'ESTE NAVEGADOR NO CODIFICA AAC · USA CHROME (WIN/MAC) O SAFARI':o.fmt==='mp3'?'EL CODIFICADOR MP3 NO HA CARGADO · RECARGA LA PÁGINA':'ESTE NAVEGADOR NO CODIFICA '+f.name.toUpperCase();cls='bad'}
  else if(s&&f.lossless&&S.an&&!isLossless(s.fmt)){st='LA FUENTE YA TIENE PÉRDIDA: '+f.name+' NO RECUPERA CALIDAD'}
  else if(s&&rate>s.rate){st='SUBIR EL MUESTREO A '+fmtRate(rate).toUpperCase()+' NO AÑADE CALIDAD, SOLO TAMAÑO'}
  else if(s&&f.lossless&&s.bits&&o.bits>s.bits&&o.bits!==32){st='PASAR DE '+s.bits+' A '+o.bits+' BIT NO MEJORA NADA, SOLO OCUPA MÁS'}
  else if(!S.an)st='ANALIZANDO…';

  const d4=$('#d4');d4.textContent=st;d4.className='dl st '+cls;
  const vs=S.an?S.an.v.s:null;
  [['#lpReal','good'],['#lpLossy','warn'],['#lpDoubt','doubt'],['#lpFake','bad']].forEach(([id,k])=>{$(id).classList.toggle('lit',vs===k);$(id+' i').classList.toggle('on',vs===k)});
  $('#convertBtn').disabled=S.busy||!s||unavailable;
  $('#loadBtn').disabled=S.busy;$('#loadBtn').classList.toggle('call',!!(s&&s.demo));
  $('#engines').innerHTML=[['WAV',1],['FLAC',1],['MP3',S.eng.mp3],['AAC',S.eng.aac]].map(([n,on])=>`<span class="eng"><i class="led sm ${on?'green on':''}"></i>${n}</span>`).join('');
}
function renderOuts(){
  if(!S.queue.length){$('#outs').innerHTML='<div class="empty">Aquí aparecerán tus archivos. Elige un preset y pulsa Convertir.</div>';return}
  $('#outs').innerHTML=S.queue.map(q=>`<div class="orow">
    ${q.zip?'<span class="key sq" aria-hidden="true" style="cursor:default">ZIP</span>':`<button class="key sq" data-play="${q.id}" aria-label="Escuchar ${q.name}">${ICON_PLAY}</button>`}
    <div><div class="n">${q.name}</div><div class="s">${q.spec} · ${q.preset}</div>${q.note?`<div class="note">${q.note}</div>`:''}</div>
    <div class="sz">${fmtBytes(q.data.length)}</div>
    <button class="key save" data-dl="${q.id}">${ICON_DL}<span>${q.zip?'Guardar pack':'Guardar .zip'}</span></button></div>`).join('');
}

/* ---------- events ---------- */
document.addEventListener('click',e=>{
  const inf=e.target.closest('span[data-info]');if(inf){e.stopPropagation();openInfo(inf);return}
  const t=e.target.closest('button');
  if(!t||!t.dataset.info){if(!e.target.closest('#pop'))closeInfo()}
  if(!t)return;
  if(t.dataset.info){openInfo(t);return}
  if(t.dataset.mode){if(!S.busy&&S.mode!==t.dataset.mode)setMode(t.dataset.mode);return}
  if(t.dataset.codec){const c=CODECS.find(x=>x.id===t.dataset.codec);if(!S.busy&&codecOf(S.out.fmt)!==c.id)setOut({fmt:c.def});return}
  if(t.dataset.box){const x=CONTS[codecOf(S.out.fmt)][+t.dataset.box];if(!S.busy&&x.set)setOut(x.set);return}
  if(t.dataset.adv){setOut({[t.dataset.adv]:t.dataset.v});return}
  if(t.dataset.mono){setOut({mono:t.dataset.mono==='1'});return}
  if(t.dataset.cov){setOut({cover:t.dataset.cov});return}
  if(t.dataset.id3v1){setOut({id3v1:!S.out.id3v1});return}
  if(t.id==='scaleSw'){S.scale=S.scale==='log'?'lin':'log';drawSpec();return}
  if(t.id==='scopeBtn'){S.scopeOpen=!S.scopeOpen;$('#scope').hidden=!S.scopeOpen;t.setAttribute('aria-expanded',S.scopeOpen);t.textContent=S.scopeOpen?'Ocultar espectrograma':'Ver espectrograma';if(S.scopeOpen)drawSpec();return}
  if(t.id==='coverPick'||t.id==='covBox'){$('#coverIn').click();return}
  if(t.id==='cover'){const c=t;c.classList.add('unscrew');c.setAttribute('aria-expanded','true');setTimeout(()=>{c.classList.add('off');$('#advPanel').inert=false},reduce?0:480);return}
  if(t.id==='closeBay'){const c=$('#cover');$('#advPanel').inert=true;c.classList.add('closing');c.classList.remove('off');c.setAttribute('aria-expanded','false');setTimeout(()=>{c.classList.remove('unscrew');setTimeout(()=>c.classList.remove('closing'),reduce?0:520)},reduce?0:460);c.focus();return}
  if(t.id==='packBtn'){if(e.target.closest('[data-info]'))return;makePack();return}
  if(t.dataset.play){const q=S.queue.find(x=>x.id==t.dataset.play);(async()=>{try{if(!q.buf)q.buf=await ac().decodeAudioData(q.data.buffer.slice(q.data.byteOffset,q.data.byteOffset+q.data.length));play(q.buf,t)}catch(err){toast('El navegador no puede reproducir este formato, pero el archivo está bien.',true)}})();return}
  if(t.dataset.dl){download(S.queue.find(x=>x.id==t.dataset.dl),t);return}
  if(t.id==='swNorm')setOut({norm:!S.out.norm});

  else if(t.id==='playSrc'&&S.src)play(S.src.buffer,t,S.pos||0);
  else if(t.id==='convertBtn')convert();
});
addEventListener('keydown',e=>{if(e.key==='Escape')closeInfo()});
addEventListener('dragstart',e=>{if(e.target.closest&&e.target.closest('.plate'))e.preventDefault()});
addEventListener('scroll',closeInfo,{passive:true});
$('#display').addEventListener('click',()=>{if(!S.busy)$('#fileIn').click()});
$('#fileIn').addEventListener('change',e=>{const f=e.target.files[0];if(f)loadFile(f);e.target.value=''});
async function loadCover(f){try{const c=await coverDims({data:new Uint8Array(await f.arrayBuffer()),mime:f.type||'image/jpeg'});if(!c.w)throw 0;await setCoverSrc(c);toast('Carátula cambiada: '+c.w+'×'+c.h)}catch(e){toast('No se pudo leer esa imagen. Usa JPEG o PNG.',true)}}
$('#coverIn').addEventListener('change',e=>{const f=e.target.files[0];if(f)loadCover(f);e.target.value=''});
$('#tagForm').addEventListener('input',e=>{const k=e.target.dataset.tag;if(k){S.tags[k]=e.target.value;renderLabel()}});
(()=>{const sc=$('#screen');let d=0;const at=x=>{const r=sc.getBoundingClientRect();return Math.max(0,Math.min(1,(x-r.left-10)/(r.width-56)))*dur()};
  sc.addEventListener('pointerdown',e=>{e.preventDefault();sc.setPointerCapture(e.pointerId);d=1;setPos(at(e.clientX),true)});
  sc.addEventListener('pointermove',e=>{if(d)setPos(at(e.clientX),true)});sc.addEventListener('pointerup',()=>d=0);sc.addEventListener('pointercancel',()=>d=0)})();
let dragN=0;
const hasFiles=e=>!!e.dataTransfer&&[...e.dataTransfer.types].includes('Files');
addEventListener('dragenter',e=>{if(!hasFiles(e))return;e.preventDefault();dragN++;document.body.classList.add('dragging')});
addEventListener('dragleave',e=>{if(!hasFiles(e))return;if(--dragN<=0){dragN=0;document.body.classList.remove('dragging')}});
addEventListener('dragover',e=>e.preventDefault());
addEventListener('drop',e=>{e.preventDefault();dragN=0;document.body.classList.remove('dragging');const f=e.dataTransfer&&e.dataTransfer.files[0];if(!f)return;if(/^image\//.test(f.type))loadCover(f);else loadFile(f)});

/* ---------- light / dark ---------- */
function effDark(){const r=document.documentElement,s=r.dataset.skin;if(s)return s==='dark';const th=r.getAttribute('data-theme');if(th==='dark'||th==='light')return th==='dark';return matchMedia('(prefers-color-scheme: dark)').matches}
function syncTheme(){$('#themeBtn').setAttribute('aria-checked',effDark())}
$('#themeBtn').addEventListener('click',()=>{const n=effDark()?'light':'dark';document.documentElement.dataset.skin=n;try{localStorage.setItem('lb-skin',n)}catch(e){}syncTheme()});
try{const s=localStorage.getItem('lb-skin');if(s==='light'||s==='dark')document.documentElement.dataset.skin=s}catch(e){}
syncTheme();try{matchMedia('(prefers-color-scheme: dark)').addEventListener('change',syncTheme)}catch(e){}
new MutationObserver(syncTheme).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});

async function previewBytes(){
  const el=$('#previewData');if(!el)return null;const b=el.textContent.trim();
  if(b){const s=atob(b),u=new Uint8Array(s.length);for(let i=0;i<s.length;i++)u[i]=s.charCodeAt(i);return u}
  try{const r=await fetch(el.dataset.src);if(r.ok)return new Uint8Array(await r.arrayBuffer())}catch(e){}
  return null;
}
(async function boot(){
  $('#playSrc').innerHTML=ICON_PLAY;
  buildMeter();buildLadder();Object.keys(KN).forEach(bindKnob);
  S.eng.mp3=typeof lamejs!=='undefined';
  const buf=makeDemo();
  S.src={name:'demo_sospechoso.flac',size:0,fmt:'FLAC',bits:16,rate:44100,ch:2,dur:buf.duration,buffer:buf,demo:true};
  try{const w=encWAV([0,1].map(c=>buf.getChannelData(c)),buf.sampleRate,32,false);S.src.raw=w.buffer.slice(w.byteOffset,w.byteOffset+w.byteLength)}catch(e){}
  S.tags={...emptyTags(),title:'Demo sospechoso',artist:'Lossless Buddy',album:'Muestras de prueba',track:'1/1',year:'2026',genre:'Electronic'};
  bindDial();bindNav();locate(curEntry());$('#manualBox').inert=true;resetDial();renderTagForm();renderAll();renderOuts();restLadder();requestAnimationFrame(loop);setTimeout(()=>crt(S.mode==='preset'),reduce?0:400);
  try{if('AudioEncoder' in window){const r=await AudioEncoder.isConfigSupported({codec:'mp4a.40.2',sampleRate:44100,numberOfChannels:2,bitrate:256000});S.eng.aac=!!r.supported;
    const chk=async c=>{try{return(await AudioEncoder.isConfigSupported({codec:'mp4a.40.2',sampleRate:44100,numberOfChannels:2,bitrate:256000,...c})).supported}catch(e){return false}};
    if(S.eng.aac){S.eng.aacVbr=await chk({bitrateMode:'variable'});S.eng.aacAdts=await chk({aac:{format:'adts'}});S.eng.aacHe=await chk({codec:'mp4a.40.5',bitrate:64000})}
    try{S.eng.opus=!!(await AudioEncoder.isConfigSupported({codec:'opus',sampleRate:48000,numberOfChannels:2,bitrate:128000})).supported}catch(e){}}}catch(e){}
  if(typeof createAacModule!=='undefined'&&typeof WebAssembly==='object'){S.eng.aac=true;S.eng.aacAdts=true}
  ensureSupported();renderAll();
  const pv=await previewBytes();
  if(pv){await loadFile(new File([pv],'Musinova - Jungle Breakbeat.flac'));if(S.src){S.src.demo=true;renderAll()}return}
  try{const cv=document.createElement('canvas');cv.width=cv.height=1400;const x=cv.getContext('2d'),g=x.createLinearGradient(0,0,1400,1400);g.addColorStop(0,'#ff7a45');g.addColorStop(.55,'#c8432f');g.addColorStop(1,'#2b1a4a');x.fillStyle=g;x.fillRect(0,0,1400,1400);
    x.strokeStyle='rgba(255,255,255,.85)';x.lineWidth=18;for(let i=0;i<9;i++){x.beginPath();x.arc(700,700,90+i*60,0,7);x.globalAlpha=1-i*.1;x.stroke()}x.globalAlpha=1;
    x.fillStyle='#fff';x.font='bold 120px sans-serif';x.textAlign='center';x.fillText('LOSSLESS',700,1230);
    const b=await new Promise(r=>cv.toBlob(r,'image/png'));await setCoverSrc(await coverDims({data:new Uint8Array(await b.arrayBuffer()),mime:'image/png'}))}catch(e){}
  await runAnalysis();
})();
