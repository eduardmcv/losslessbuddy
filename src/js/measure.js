/* ---------- measurement: BS.1770-4 loudness, LRA, true peak, DR (no DOM) ---------- */
function kSegments(chans,fs){
  const hop=Math.round(fs*.1),nseg=Math.floor(chans[0].length/hop),seg=new Float64Array(nseg);
  for(const x of chans){
    let K=Math.tan(Math.PI*1681.974450955533/fs),Q=0.7071752369554196,Vh=10**(3.999843853973347/20),Vb=Vh**0.4996667741545416,a0=1+K/Q+K*K;
    const b0=(Vh+Vb*K/Q+K*K)/a0,b1=2*(K*K-Vh)/a0,b2=(Vh-Vb*K/Q+K*K)/a0,a1=2*(K*K-1)/a0,a2=(1-K/Q+K*K)/a0;
    K=Math.tan(Math.PI*38.13547087602444/fs);Q=0.5003270373238773;const d=1+K/Q+K*K,c1=2*(K*K-1)/d,c2=(1-K/Q+K*K)/d;
    let x1=0,x2=0,y1=0,y2=0,w1=0,w2=0;
    for(let s=0;s<nseg;s++){let acc=0;const e=(s+1)*hop;
      for(let i=s*hop;i<e;i++){const xi=x[i];const y=b0*xi+b1*x1+b2*x2-a1*y1-a2*y2;x2=x1;x1=xi;
        const w=y-2*y1+y2-c1*w1-c2*w2;y2=y1;y1=y;w2=w1;w1=w;acc+=w*w}
      seg[s]+=acc}
  }
  return{seg,hop};
}
const LK=p=>-0.691+10*Math.log10(p);
function loudnessStats(chans,fs){
  const{seg,hop}=kSegments(chans,fs),n=seg.length;
  const blocks=(len)=>{const out=[];let acc=0;for(let s=0;s<n;s++){acc+=seg[s];if(s>=len)acc-=seg[s-len];if(s>=len-1)out.push(acc/(len*hop))}return out};
  // integrated: 400 ms blocks, 75 % overlap
  const m=blocks(4).filter(p=>LK(p)>-70);let I=-Infinity;
  if(m.length){const rel=LK(m.reduce((a,b)=>a+b,0)/m.length)-10,g=m.filter(p=>LK(p)>rel);I=LK(g.reduce((a,b)=>a+b,0)/g.length)}
  // LRA: 3 s short-term, gated −70 LUFS absolute and −20 LU relative, P95 − P10
  const st=blocks(30).filter(p=>LK(p)>-70);let LRA=NaN;
  if(st.length>2){const rel=LK(st.reduce((a,b)=>a+b,0)/st.length)-20,v=st.map(LK).filter(l=>l>rel).sort((a,b)=>a-b);
    if(v.length>2){const q=f=>v[Math.min(v.length-1,Math.max(0,Math.round(f*(v.length-1))))];LRA=q(.95)-q(.10)}}
  return{I,LRA};
}
function truePeak(chans,fs){
  const F=fs<=48000?4:fs<=96000?2:1,T=12,L=T*F,c=(L-1)/2,h=new Float32Array(L);
  for(let n=0;n<L;n++){const t=(n-c)/F,s=t===0?1:Math.sin(Math.PI*t)/(Math.PI*t),w=.42-.5*Math.cos(2*Math.PI*(n+.5)/L)+.08*Math.cos(4*Math.PI*(n+.5)/L);h[n]=s*w}
  for(let p=0;p<F;p++){let s=0;for(let j=0;j<T;j++)s+=h[j*F+p];for(let j=0;j<T;j++)h[j*F+p]/=s}
  let sp=0;for(const x of chans)for(let i=0;i<x.length;i++){const a=x[i]<0?-x[i]:x[i];if(a>sp)sp=a}
  if(F===1)return sp;
  let tp=sp;const th=sp*.5;
  for(const x of chans){
    for(let i=T;i<x.length;i++){
      const a=x[i-T/2]<0?-x[i-T/2]:x[i-T/2];if(a<th)continue;
      for(let p=0;p<F;p++){let y=0;for(let j=0;j<T;j++)y+=x[i-j]*h[j*F+p];if(y<0)y=-y;if(y>tp)tp=y}
    }
  }
  return tp;
}
function dynRange(chans,fs){
  const len=chans[0].length,nch=chans.length,bl=fs*3,nb=Math.max(1,Math.floor(len/bl)),rms=[],pks=[];
  for(let b=0;b<nb;b++){let s=0,p=0;const e=Math.min(len,(b+1)*bl);for(const c of chans)for(let i=b*bl;i<e;i++){s+=c[i]*c[i];const a=c[i]<0?-c[i]:c[i];if(a>p)p=a}rms.push(Math.sqrt(2*s/((e-b*bl)*nch)));pks.push(p)}
  rms.sort((a,b)=>b-a);pks.sort((a,b)=>b-a);const top=rms.slice(0,Math.max(1,Math.round(nb*.2)));
  const r=Math.sqrt(top.reduce((a,v)=>a+v*v,0)/top.length);return 20*Math.log10((pks[1]??pks[0])/(r||1e-9));
}

/* ---------- spectrum + fake detection ---------- */
async function spectrum(chans,fs){
  const len=chans[0].length,nch=chans.length,N=4096,bins=N/2,cols=Math.max(1,Math.min(600,Math.floor(len/(N/2))));
  const win=new Float32Array(N);let ws=0;for(let i=0;i<N;i++){win[i]=.5-.5*Math.cos(2*Math.PI*i/(N-1));ws+=win[i]}
  const spec=new Float32Array(cols*bins),avg=new Float64Array(bins),re=new Float32Array(N),im=new Float32Array(N);
  for(let c=0;c<cols;c++){
    const st=cols>1?Math.floor(c*(len-N)/(cols-1)):0;
    for(let i=0;i<N;i++){let v=0;const k=st+i;if(k<len&&k>=0){for(let ch=0;ch<nch;ch++)v+=chans[ch][k];v/=nch}re[i]=v*win[i];im[i]=0}
    fft(re,im);
    for(let b=0;b<bins;b++){const p=(re[b]*re[b]+im[b]*im[b])*4/(ws*ws);avg[b]+=p;spec[c*bins+b]=10*Math.log10(p+1e-16)}
    if(c%60===59)await tick();
  }
  const avgDb=new Float32Array(bins);for(let b=0;b<bins;b++)avgDb[b]=10*Math.log10(avg[b]/cols+1e-16);
  return{spec,cols,bins,N,avgDb};
}
const median=a=>{const s=Array.from(a).sort((x,y)=>x-y);return s.length?s[s.length>>1]:0};
function fakeSignals(sp,fs,src){
  const{spec,cols,bins,N,avgDb}=sp,hz=fs/N,cut=findCutoff(avgDb,fs,N);
  // constancy: cutoff per time segment (only segments with real signal)
  const nSeg=Math.min(12,cols),segCuts=[];
  const loud=c=>{let s=0,n=0;for(let b=Math.round(1000/hz);b<Math.round(6000/hz);b++){s+=spec[c*bins+b];n++}return s/n};
  const frameRef=new Float32Array(cols);for(let c=0;c<cols;c++)frameRef[c]=loud(c);const refMed=median(frameRef);
  for(let s=0;s<nSeg;s++){
    const a=Math.floor(s*cols/nSeg),e=Math.floor((s+1)*cols/nSeg),p=new Float64Array(bins);let n=0;
    for(let c=a;c<e;c++){if(frameRef[c]<refMed-15)continue;n++;for(let b=0;b<bins;b++)p[b]+=10**(spec[c*bins+b]/10)}
    if(n<2)continue;const db=new Float32Array(bins);for(let b=0;b<bins;b++)db[b]=10*Math.log10(p[b]/n+1e-16);
    const k=findCutoff(db,fs,N);if(!k.full)segCuts.push(k.hz);
  }
  let segStd=Infinity;if(segCuts.length>=3){const m=segCuts.reduce((a,b)=>a+b,0)/segCuts.length;segStd=Math.sqrt(segCuts.reduce((a,b)=>a+(b-m)**2,0)/segCuts.length)}
  // holes: 500 Hz bands between 11 kHz and the cutoff that drop out in loud frames
  let holes=0;const lo=11000,hi=Math.min(cut.hz-300,20000);
  if(!cut.full&&hi-lo>=1500){
    const nb=Math.floor((hi-lo)/500),E=[];let cells=0,h=0;
    for(let b=0;b<nb;b++){const b0=Math.round((lo+b*500)/hz),b1=Math.round((lo+(b+1)*500)/hz),col=new Float32Array(cols);
      for(let c=0;c<cols;c++){let s=0;for(let k=b0;k<b1;k++)s+=spec[c*bins+k];col[c]=s/(b1-b0)}E.push(col)}
    for(let b=0;b<nb;b++){const m=median(E[b].filter((_,c)=>frameRef[c]>=refMed-6));for(let c=0;c<cols;c++){if(frameRef[c]<refMed-6)continue;cells++;if(E[b][c]<m-30)h++}}
    holes=cells?h/cells:0;
  }
  // 24 bit whose low 8 bits are always zero
  let fake24=false;
  if(src.bits===24){fake24=true;const x=sp.chans0;for(let i=0;i<x.length&&fake24;i+=7){const v=x[i]*32768;if(Math.abs(v-Math.round(v))>1e-3)fake24=false}}
  const k=cut.hz/1000;
  const est=k<11.5?'MP3 ≤ 64 kbps':k<15.5?'MP3 96–112 kbps':k<17.3?'MP3 128 kbps':k<18?'MP3 160 kbps':k<19.3?'MP3 192 kbps':k<20?'MP3 224–256 / AAC 256':'MP3 320 kbps';
  return{cut,drop:cut.drop,wall:cut.drop>25,wallStrong:cut.drop>40,constant:segStd<400,segStd,segN:segCuts.length,holes,holesSig:holes>.04,hires:fs>=88200&&cut.hz<30000,fake24,est};
}
function judge(g,src,fs){
  const k=g.cut.hz/1000,ll=isLossless(src.fmt),sigs=[
    {ok:!g.cut.full,label:g.cut.full?T('Contenido hasta Nyquist ({k} kHz)',{k:num(fs/2000)}):T('Corte de agudos a {k} kHz',{k:num(k)})},
    {ok:g.wall,label:g.wall?T('Corte en pared: cae {db} dB en {w} kHz',{db:Math.round(g.drop),w:num(.5)}):T('Sin caída en pared')},
    {ok:g.constant,label:T(g.segN>=3?(g.constant?'El corte es constante en toda la pista':'El corte varía con la música'):'No hay tramos suficientes para medir constancia')},
    {ok:g.holesSig,label:g.holesSig?T('Huecos en bandas altas ({p} %)',{p:Math.round(g.holes*100)}):T('Sin huecos en bandas altas')}];
  if(fs>50000)sigs.push({ok:g.hires,label:T(g.hires?'Nada por encima de 24 kHz en un archivo hi-res':'Contenido real por encima de 24 kHz')});
  if(src.bits===24)sigs.push({ok:g.fake24,label:T(g.fake24?'Los 8 bits bajos están vacíos: origen 16 bit':'Usa los 24 bits')});
  if(!ll)return{s:'warn',t:T('Con pérdida'),d:T('{fmt} · corte a {k} kHz',{fmt:src.fmt,k:num(k)}),sigs,conf:null};
  if(g.cut.full)return g.fake24?{s:'doubt',id:'fake24',t:T('24 bit falso'),d:T('Es un 16 bit rellenado con ceros'),sigs,conf:'alta'}:{s:'good',t:T('Lossless real'),d:T('Contenido hasta Nyquist, sin corte'),sigs,conf:null};
  if(g.hires&&g.wall)return{s:'doubt',id:'hires',t:T('Hi-res falso'),d:T('Upsample de 44,1/48 kHz: no es MP3, pero tampoco hi-res'),sigs,conf:'alta'};
  if(g.wall&&(g.constant||g.holesSig)){const sc=(g.wallStrong?2:1)+(g.constant?1:0)+(g.holesSig?1:0);
    return{s:'bad',t:'Fake',d:T('Hecho desde {est}',{est:g.est}),sigs,conf:sc>=3?'alta':sc===2?'media':'baja',est:g.est}}
  if(k<19.5)return{s:'doubt',t:T('Sospechoso'),d:T(g.wall?'Corte a {k} kHz pero variable: puede ser analógico o un máster antiguo':'Corte a {k} kHz con caída suave: puede ser analógico o un máster antiguo',{k:num(k)}),sigs,conf:'baja'};
  return{s:'good',t:T('Lossless real'),d:T('Agudos hasta {k} kHz sin firma de códec',{k:num(k)}),sigs,conf:null};
}
async function analyzeAll(chans,fs,src){
  const sp=await spectrum(chans,fs);sp.chans0=chans[0];
  const g=fakeSignals(sp,fs,src);delete sp.chans0;await tick();
  const{I,LRA}=loudnessStats(chans,fs);await tick();
  const tp=truePeak(chans,fs);await tick();
  let peak=0,clips=0;for(const c of chans){let run=0;for(let i=0;i<c.length;i++){const a=c[i]<0?-c[i]:c[i];if(a>peak)peak=a;if(a>=.9999){run++;if(run===3)clips++}else run=0}}
  return{fs,sp,g,cut:g.cut,v:judge(g,src,fs),lufs:I,lra:LRA,tp,peak,clips,dr:dynRange(chans,fs)};
}
