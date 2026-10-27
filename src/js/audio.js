/* ---------- header sniffing ---------- */
function sniff(u8,name){
  const s=(i,n)=>String.fromCharCode(...u8.subarray(i,i+n));
  const dv=new DataView(u8.buffer,u8.byteOffset,u8.byteLength);
  const ext=(name.split('.').pop()||'').toUpperCase();
  try{
    if(s(0,4)==='fLaC'){const b=u8;return{fmt:'FLAC',rate:(b[18]<<12)|(b[19]<<4)|(b[20]>>4),ch:((b[20]>>1)&7)+1,bits:(((b[20]&1)<<4)|(b[21]>>4))+1}}
    if(s(0,4)==='RIFF'&&s(8,4)==='WAVE'){let p=12;while(p+8<u8.length){const id=s(p,4),sz=dv.getUint32(p+4,true);if(id==='fmt '){const tag=dv.getUint16(p+8,true);return{fmt:'WAV',ch:dv.getUint16(p+10,true),rate:dv.getUint32(p+12,true),bits:dv.getUint16(p+22,true),float:tag===3}}p+=8+sz+(sz&1)}return{fmt:'WAV'}}
    if(s(0,4)==='FORM'&&/AIF/.test(s(8,4)))return{fmt:'AIFF'};
    if(s(0,4)==='OggS'){const lim=Math.min(u8.length,4096);for(let i=0;i<lim-16;i++){if(s(i,8)==='OpusHead')return{fmt:'Opus',rate:48000,ch:u8[i+9]};if(u8[i]===1&&s(i+1,6)==='vorbis')return{fmt:'Vorbis',ch:u8[i+11],rate:dv.getUint32(i+12,true)}}return{fmt:'OGG'}}
    if(s(4,4)==='ftyp'){for(let i=0;i<u8.length-32;i++){if(u8[i]===0x6d&&s(i,4)==='mp4a')return{fmt:'AAC',ch:dv.getUint16(i+20),rate:dv.getUint16(i+28)};if(u8[i]===0x61&&s(i,4)==='alac')return{fmt:'ALAC',ch:dv.getUint16(i+20),rate:dv.getUint16(i+28)}}return{fmt:'M4A'}}
    let p=0;if(s(0,3)==='ID3'){p=10+((u8[6]&127)<<21|(u8[7]&127)<<14|(u8[8]&127)<<7|(u8[9]&127))}
    for(let i=p;i<Math.min(u8.length-4,p+65536);i++){if(u8[i]===0xFF&&(u8[i+1]&0xE0)===0xE0){const ver=(u8[i+1]>>3)&3,layer=(u8[i+1]>>1)&3,ri=(u8[i+2]>>2)&3;if(layer===1&&ri<3&&ver!==1){const base=[44100,48000,32000][ri];return{fmt:'MP3',rate:ver===3?base:ver===2?base/2:base/4,ch:((u8[i+3]>>6)===3)?1:2}}}}
  }catch(e){}
  return{fmt:ext||'?'};
}

/* ---------- demo signal: synthetic loop band-limited at ~15.8 kHz, like an MP3 128 re-saved as FLAC ---------- */
function makeDemo(){
  const sr=44100,dur=10,len=sr*dur,L=new Float32Array(len),R=new Float32Array(len);
  const mtof=m=>440*2**((m-69)/12);
  const chords=[[57,60,64],[53,57,60],[48,52,55],[55,59,62]];
  const TN=16384,tcache=new Map(),table=f=>{if(tcache.has(f))return tcache.get(f);const re=new Float32Array(TN),im=new Float32Array(TN);for(let h=1;h*f<15600;h++)re[h]=1/h**1.15;fft(re,im);const t=new Float32Array(TN+1);for(let i=0;i<TN;i++)t[i]=-im[i];t[TN]=t[0];tcache.set(f,t);return t};
  const bar=2*sr;
  for(let b=0;b<5;b++){
    const ch=chords[b%4],st=b*bar,end=Math.min(len,st+bar);
    ch.forEach((m,ni)=>{
      [m,m+12].forEach((mm,oi)=>{
        const f=mtof(mm),t=table(f);let ph=Math.random();const inc=f/sr;const pan=(ni-1)*.35;
        for(let i=st;i<end;i++){const k=i-st;const env=Math.min(1,k/(sr*.25))*Math.exp(-k/(sr*3))*Math.min(1,(end-i)/(sr*.03));const x=ph*TN,j=x|0,fr=x-j;const v=(t[j]+(t[j+1]-t[j])*fr)*env*(oi?.035:.06);
          L[i]+=v*(1-pan);R[i]+=v*(1+pan);ph+=inc;if(ph>=1)ph-=1}
      });
    });
    const bf=mtof(ch[0]-24);for(let i=st;i<end;i++){const k=(i-st)%(sr/2);const v=Math.sin(2*Math.PI*bf*i/sr)*.22*Math.exp(-k/(sr*.35))*Math.min(1,k/(sr*.004),(sr/2-k)/(sr*.004));L[i]+=v;R[i]+=v}
  }
  for(let beat=0;beat*sr/2<len;beat++){
    const st=beat*sr/2|0;
    for(let k=0;k<sr*.3&&st+k<len;k++){const t=k/sr;const f=45+75*Math.exp(-t*30);const v=Math.sin(2*Math.PI*(45*t+75*(1-Math.exp(-t*30))/30))*.55*Math.exp(-t*9)*Math.min(1,t/.002,(.3-t)/.01);L[st+k]+=v;R[st+k]+=v}
    const hs=st+(sr/4|0);const parts=[];for(let p=0;p<36;p++)parts.push([7000+Math.random()*8700,Math.random()*6.28,Math.random()<.5?-1:1]);
    for(let k=0;k<sr*.07&&hs+k<len;k++){const t=k/sr,e=Math.exp(-t*60)*.012*Math.min(1,t/.0015,(.07-t)/.005);let v=0;for(const[f,ph]of parts)v+=Math.sin(2*Math.PI*f*t+ph);L[hs+k]+=v*e*1.1;R[hs+k]+=v*e*.9}
  }
  // constant 'air' band up to 15.9 kHz, like what survives an MP3 128 lowpass
  for(let q=0;q<36;q++){const f=9500+q*178+Math.random()*60,w=2*Math.PI*f/sr,cw=Math.cos(w),sw=Math.sin(w),amp=.0016*(1-q/60),pan=Math.random()*.6+.7;let c=1,s=0;
    for(let i=0;i<len;i++){const nc=c*cw-s*sw;s=c*sw+s*cw;c=nc;const m=.6+.4*Math.sin(i*1.3e-4+q);L[i]+=s*amp*m*pan;R[i]+=s*amp*m*(2-pan)}}
  // brickwall at 16 kHz in one big FFT (L + iR), the way an MP3 128 encoder leaves it
  {let N=1;while(N<len)N<<=1;const re=new Float32Array(N),im=new Float32Array(N);re.set(L);im.set(R);fft(re,im);
    const kc=Math.round(16000/sr*N);for(let k=kc;k<=N-kc;k++){re[k]=0;im[k]=0}
    for(let k=0;k<N;k++)im[k]=-im[k];fft(re,im);for(let i=0;i<len;i++){L[i]=re[i]/N;R[i]=-im[i]/N}}
  let pk=0;for(let i=0;i<len;i++)pk=Math.max(pk,Math.abs(L[i]),Math.abs(R[i]));
  const g=.89/pk;for(let i=0;i<len;i++){L[i]=L[i]*g+(Math.random()-Math.random())*1.5e-5;R[i]=R[i]*g+(Math.random()-Math.random())*1.5e-5}
  const buf=new AudioBuffer({length:len,numberOfChannels:2,sampleRate:sr});buf.copyToChannel(L,0);buf.copyToChannel(R,1);
  return buf;
}

function lufs(chans,fs){
  const hop=Math.round(fs*.1),nseg=Math.floor(chans[0].length/hop);if(nseg<4)return -Infinity;
  const seg=new Float64Array(nseg);
  for(const x of chans){
    // stage 1: high shelf, stage 2: RLB high-pass
    let K=Math.tan(Math.PI*1681.974450955533/fs),Q=0.7071752369554196,Vh=10**(3.999843853973347/20),Vb=Vh**0.4996667741545416,a0=1+K/Q+K*K;
    const b0=(Vh+Vb*K/Q+K*K)/a0,b1=2*(K*K-Vh)/a0,b2=(Vh-Vb*K/Q+K*K)/a0,a1=2*(K*K-1)/a0,a2=(1-K/Q+K*K)/a0;
    K=Math.tan(Math.PI*38.13547087602444/fs);Q=0.5003270373238773;const d=1+K/Q+K*K,c1=2*(K*K-1)/d,c2=(1-K/Q+K*K)/d;
    let x1=0,x2=0,y1=0,y2=0,w1=0,w2=0;
    for(let s=0;s<nseg;s++){let acc=0;const e=(s+1)*hop;
      for(let i=s*hop;i<e;i++){const xi=x[i];const y=b0*xi+b1*x1+b2*x2-a1*y1-a2*y2;x2=x1;x1=xi;
        const w=y-2*y1+y2-c1*w1-c2*w2;y2=y1;y1=y;w2=w1;w1=w;acc+=w*w}
      seg[s]+=acc}
  }
  const blocks=[];for(let s=0;s+3<nseg;s++){blocks.push((seg[s]+seg[s+1]+seg[s+2]+seg[s+3])/(4*hop))}
  const L=p=>-0.691+10*Math.log10(p);
  const abs=blocks.filter(p=>L(p)>-70);if(!abs.length)return -Infinity;
  const rel=L(abs.reduce((a,b)=>a+b,0)/abs.length)-10;
  const g=abs.filter(p=>L(p)>rel);return L(g.reduce((a,b)=>a+b,0)/g.length);
}
const peakOf=chans=>{let p=0;for(const c of chans)for(let i=0;i<c.length;i++){const v=c[i]<0?-c[i]:c[i];if(v>p)p=v}return p};
function fft(re,im){
  const n=re.length;
  for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){let t=re[i];re[i]=re[j];re[j]=t;t=im[i];im[i]=im[j];im[j]=t}}
  for(let len=2;len<=n;len<<=1){const ang=-2*Math.PI/len,wr=Math.cos(ang),wi=Math.sin(ang),h=len>>1;
    for(let i=0;i<n;i+=len){let cr=1,ci=0;for(let k=0;k<h;k++){const a=i+k,b=a+h;const tr=re[b]*cr-im[b]*ci,ti=re[b]*ci+im[b]*cr;re[b]=re[a]-tr;im[b]=im[a]-ti;re[a]+=tr;im[a]+=ti;const nr=cr*wr-ci*wi;ci=cr*wi+ci*wr;cr=nr}}}
}
function findCutoff(db,fs,N){
  const bins=db.length,hz=fs/N,W=4,sm=new Float32Array(bins);
  for(let i=0;i<bins;i++){let s=0,n=0;for(let j=Math.max(0,i-W);j<=Math.min(bins-1,i+W);j++){s+=db[j];n++}sm[i]=s/n}
  let ref=-200;for(let i=Math.ceil(200/hz);i<Math.min(bins,6000/hz);i++)ref=Math.max(ref,sm[i]);
  const topN=Math.max(4,Math.round(bins*.02)),tail=Array.from(sm.subarray(bins-topN-2,bins-2)).sort((a,b)=>a-b),floor=tail[tail.length>>1];
  const thr=ref-85;void floor;
  let ci=bins-1;for(let i=bins-3;i>0;i--){if(sm[i]>thr){ci=i;break}}
  const nyq=fs/2,d=Math.max(2,Math.round(500/hz));
  // Dither or noise-shaped requantisation leaves a faint floor above a lossy lowpass, so
  // "last bin above threshold" lands at Nyquist. Look for the wall itself: the steepest
  // drop above 10 kHz, with nothing past it ever coming back near the level below it.
  const g=Math.max(1,Math.round(150/hz)),end=bins-2,avg=(a,b)=>{let s=0;for(let i=a;i<b;i++)s+=sm[i];return s/(b-a)};
  let best=0,bi=-1;
  for(let i=Math.round(10000/hz);i<Math.min(end-d,Math.round((nyq-400)/hz));i++){const dr=avg(i-d,i-g)-avg(i+g,i+d);if(dr>best){best=dr;bi=i}}
  if(bi>0&&best>=18){let top=-300;for(let i=bi+d;i<end;i++)top=Math.max(top,sm[i]);if(top<avg(bi-d,bi-g)-12)ci=Math.min(ci,bi)}
  const cutHz=ci*hz;
  let mx=-300;for(let i=Math.max(0,ci-2*d);i<=ci;i++)mx=Math.max(mx,sm[i]);const drop=mx-sm[Math.min(bins-1,ci+d)];
  const full=cutHz>=nyq*.96||(fs<=48000&&cutHz>=21000);
  return{hz:cutHz,sharp:!full&&drop>22,full,drop};
}
/* ---------- processing ---------- */
function effRate(){
  const o=S.out,sr=S.src?S.src.rate:44100,f=FMT[o.fmt];let r=o.rate||sr;
  if(f.rates&&!f.rates.includes(r)){const fam=r%11025===0?44100:48000;r=f.rates.includes(fam)?fam:f.rates.reduce((a,b)=>Math.abs(b-r)<Math.abs(a-r)?b:a)}
  return r;
}
/* Resampling. AudioBufferSourceNode interpolates linearly in Chromium, which folds
   images back under Nyquist and fills the empty band above a lossy cutoff (a
   FLAC made from an MP3 would then read as real lossless). Re-decoding the
   original bytes at the target rate uses the decoder's windowed-sinc resampler. */
async function srcAt(rate){
  const s=S.src;if(!s)return null;if(s.buffer.sampleRate===rate)return s.buffer;
  s.byRate=s.byRate||{};
  if(!s.byRate[rate]&&s.raw){try{s.byRate[rate]=await new OfflineAudioContext(1,1,rate).decodeAudioData(s.raw.slice(0))}catch(e){}}
  return s.byRate[rate]||null;
}
async function processAudio(buf,o,rate){
  let b=buf;
  const hq=rate!==buf.sampleRate&&S.src&&buf===S.src.buffer?await srcAt(rate):null;
  if(hq)b=hq;
  else if(rate!==buf.sampleRate){const oc=new OfflineAudioContext(buf.numberOfChannels,Math.ceil(buf.length*rate/buf.sampleRate),rate);const s=oc.createBufferSource();s.buffer=buf;s.connect(oc.destination);s.start();b=await oc.startRendering()}
  let chans=[];for(let c=0;c<Math.min(2,b.numberOfChannels);c++)chans.push(b.getChannelData(c).slice());
  if(o.mono&&chans.length>1){const m=new Float32Array(chans[0].length);for(let i=0;i<m.length;i++)m[i]=(chans[0][i]+chans[1][i])*.5;chans=[m]}
  let note='';
  if(o.norm){const L=lufs(chans,rate),tp=truePeak(chans,rate),ceil=10**(-1/20);let gdb=null;
    if(o.norm==='peak')gdb=20*Math.log10(ceil/(tp||1e-9));
    else if(isFinite(L)){gdb=o.lufs-L;if(tp*10**(gdb/20)>ceil){const g2=20*Math.log10(ceil/tp);note=`Ganancia limitada a ${g2>=0?'+':''}${num(g2)} dB por el techo de −1 dBTP (queda en ${num(L+g2)} LUFS)`;gdb=g2}}
    if(gdb!=null){if(!note)note=`Ganancia aplicada: ${gdb>=0?'+':''}${num(gdb)} dB`;const g=10**(gdb/20);for(const c of chans)for(let i=0;i<c.length;i++)c[i]*=g}}
  return{chans,note};
}
function quant(c,bits,dither){
  const sc=2**(bits-1),mx=sc-1,mn=-sc,o=new Int32Array(c.length),d=dither&&bits<=16;
  for(let i=0;i<c.length;i++){let v=c[i]*sc;if(d)v+=Math.random()-Math.random();v=Math.round(v);o[i]=v>mx?mx:v<mn?mn:v}
  return o;
}
