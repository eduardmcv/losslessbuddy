/* ---------- encoders ---------- */
function encWAV(chans,rate,bits,dither){
  const nch=chans.length,len=chans[0].length,B=bits/8,dl=len*nch*B,buf=new ArrayBuffer(44+dl),dv=new DataView(buf),u8=new Uint8Array(buf);
  const ws=(p,s)=>{for(let i=0;i<s.length;i++)u8[p+i]=s.charCodeAt(i)};
  ws(0,'RIFF');dv.setUint32(4,36+dl,true);ws(8,'WAVE');ws(12,'fmt ');dv.setUint32(16,16,true);dv.setUint16(20,bits===32?3:1,true);dv.setUint16(22,nch,true);
  dv.setUint32(24,rate,true);dv.setUint32(28,rate*nch*B,true);dv.setUint16(32,nch*B,true);dv.setUint16(34,bits,true);ws(36,'data');dv.setUint32(40,dl,true);
  let p=44;
  if(bits===32){for(let i=0;i<len;i++)for(let c=0;c<nch;c++){dv.setFloat32(p,Math.max(-1,Math.min(1,chans[c][i])),true);p+=4}}
  else{const q=chans.map(c=>quant(c,bits,dither));
    for(let i=0;i<len;i++)for(let c=0;c<nch;c++){const v=q[c][i];if(bits===16){dv.setInt16(p,v,true);p+=2}else{u8[p]=v&255;u8[p+1]=(v>>8)&255;u8[p+2]=(v>>16)&255;p+=3}}}
  return u8;
}

class BW{
  constructor(n){this.buf=new Uint8Array(Math.max(1024,n));this.pos=0;this.acc=0;this.nb=0}
  w(v,n){
    if(n>24){this.w(Math.floor(v/65536),n-16);this.w(v%65536,16);return}
    if(this.pos+8>this.buf.length){const b=new Uint8Array(this.buf.length*2);b.set(this.buf);this.buf=b}
    this.acc=(this.acc<<n)|(v&((1<<n)-1));this.nb+=n;
    while(this.nb>=8){this.nb-=8;this.buf[this.pos++]=(this.acc>>>this.nb)&255}
    this.acc&=(1<<this.nb)-1;
  }
  sw(v,n){this.w(v<0?v+2**n:v,n)}
  align(){if(this.nb)this.w(0,8-this.nb)}
}
const CRC8=new Uint8Array(256),CRC16=new Uint16Array(256);
for(let i=0;i<256;i++){let c=i;for(let j=0;j<8;j++)c=c&0x80?((c<<1)^7)&255:(c<<1)&255;CRC8[i]=c;let d=i<<8;for(let j=0;j<8;j++)d=d&0x8000?((d<<1)^0x8005)&0xffff:(d<<1)&0xffff;CRC16[i]=d}
const crc8=(b,s,e)=>{let c=0;for(let i=s;i<e;i++)c=CRC8[c^b[i]];return c};
const crc16=(b,s,e)=>{let c=0;for(let i=s;i<e;i++)c=((c<<8)&0xffff)^CRC16[(c>>8)^b[i]];return c};
function utf8num(n){if(n<0x80)return[n];const len=n<0x800?2:n<0x10000?3:n<0x200000?4:n<0x4000000?5:6,o=[];for(let i=len-1;i>0;i--){o.unshift(0x80|(n&0x3f));n=Math.floor(n/64)}o.unshift(((0xff00>>len)&0xff)|n);return o}

const RES=new Float64Array(65536);
function residual(x,n,order,out){
  for(let i=order;i<n;i++){let r;
    switch(order){case 0:r=x[i];break;case 1:r=x[i]-x[i-1];break;case 2:r=x[i]-2*x[i-1]+x[i-2];break;case 3:r=x[i]-3*x[i-1]+3*x[i-2]-x[i-3];break;default:r=x[i]-4*x[i-1]+6*x[i-2]-4*x[i-3]+x[i-4]}
    out[i]=r>=0?2*r:-2*r-1}
}
function ricePlan(u,n,order,kmax,pbits){
  let maxP=0;while(maxP<8&&n%(1<<(maxP+1))===0&&(n>>(maxP+1))>order)maxP++;
  let best=null;
  for(let p=0;p<=maxP;p++){
    const parts=1<<p,ps=n>>p,ks=[];let bits=6;
    for(let q=0;q<parts;q++){const a=q===0?order:q*ps,e=(q+1)*ps,cnt=e-a;let s=0;for(let i=a;i<e;i++)s+=u[i];
      let k=s>cnt?Math.floor(Math.log2(s/cnt)):0;let bc=Infinity,bk=0;
      for(let kk=Math.max(0,k-1);kk<=Math.min(kmax,k+1);kk++){const c=cnt*(kk+1)+s/2**kk;if(c<bc){bc=c;bk=kk}}
      ks.push(bk);bits+=pbits+bc}
    if(!best||bits<best.bits)best={p,ks,bits};
  }
  return best;
}
function subframe(bw,x,n,bps){
  let same=true;for(let i=1;i<n;i++)if(x[i]!==x[0]){same=false;break}
  if(same){bw.w(0,8);bw.sw(x[0],bps);return}
  const meth=bps>16?1:0,kmax=meth?30:14,pbits=meth?5:4;
  let best=null;
  for(let o=0;o<=4&&o<n;o++){residual(x,n,o,RES);const pl=ricePlan(RES,n,o,kmax,pbits);const c=8+o*bps+pl.bits;if(!best||c<best.c)best={o,pl,c}}
  if(best.c>=8+n*bps){bw.w(2,8);for(let i=0;i<n;i++)bw.sw(x[i],bps);return}
  const{o,pl}=best;residual(x,n,o,RES);
  bw.w(0,1);bw.w(8|o,6);bw.w(0,1);
  for(let i=0;i<o;i++)bw.sw(x[i],bps);
  bw.w(meth,2);bw.w(pl.p,4);
  const ps=n>>pl.p;
  for(let q=0;q<pl.ks.length;q++){const k=pl.ks[q],a=q===0?o:q*ps,e=(q+1)*ps,p2=2**k;bw.w(k,pbits);
    for(let i=a;i<e;i++){const u=RES[i],qq=Math.floor(u/p2);let z=qq;while(z>=24){bw.w(0,24);z-=24}bw.w(1,z+1);if(k)bw.w(u-qq*p2,k)}}
}
async function encFLAC(chans,rate,bps,dither,prog,blocks=[]){
  const nch=chans.length,len=chans[0].length,BS=4096;
  const q=chans.map(c=>quant(c,bps,dither));
  const bw=new BW(Math.ceil(len*nch*bps/8*.75)+65536);
  [0x66,0x4c,0x61,0x43].forEach(b=>bw.w(b,8));
  bw.w(blocks.length?0:1,1);bw.w(0,7);bw.w(34,24);
  const bs=Math.min(BS,len);bw.w(bs,16);bw.w(bs,16);bw.w(0,24);bw.w(0,24);
  bw.w(rate,20);bw.w(nch-1,3);bw.w(bps-1,5);bw.w(Math.floor(len/2**24),12);bw.w(len%2**24,24);
  for(let i=0;i<16;i++)bw.w(0,8);
  blocks.forEach((bk,i)=>{bw.w(i===blocks.length-1?1:0,1);bw.w(bk.type,7);bw.w(bk.data.length,24);for(let j=0;j<bk.data.length;j++)bw.w(bk.data[j],8)});
  const S2=new Int32Array(BS),M2=new Int32Array(BS);
  const est=(x,n)=>{let s=0;for(let i=2;i<n;i++){const r=x[i]-2*x[i-1]+x[i-2];s+=r<0?-r:r}return s};
  for(let off=0,fi=0;off<len;off+=BS,fi++){
    const n=Math.min(BS,len-off),st=bw.pos;
    bw.w(0xFFF8,16);bw.w(n===BS?12:7,4);bw.w(0,4);
    let assign=nch-1,subs;
    const L=q[0].subarray(off,off+n);
    if(nch===2){
      const R=q[1].subarray(off,off+n),Sd=S2.subarray(0,n),Md=M2.subarray(0,n);
      for(let i=0;i<n;i++){Sd[i]=L[i]-R[i];Md[i]=(L[i]+R[i])>>1}
      const eL=est(L,n),eR=est(R,n),eS=est(Sd,n),eM=est(Md,n);
      const opts=[[eL+eR,1,[[L,bps],[R,bps]]],[eL+eS,8,[[L,bps],[Sd,bps+1]]],[eR+eS,9,[[Sd,bps+1],[R,bps]]],[eM+eS,10,[[Md,bps],[Sd,bps+1]]]];
      opts.sort((a,b)=>a[0]-b[0]);assign=opts[0][1];subs=opts[0][2];
    }else subs=[[L,bps]];
    bw.w(assign,4);bw.w(bps===16?4:6,3);bw.w(0,1);
    for(const b of utf8num(fi))bw.w(b,8);
    if(n!==BS)bw.w(n-1,16);
    bw.w(crc8(bw.buf,st,bw.pos),8);
    for(const[x,b]of subs)subframe(bw,x,n,b);
    bw.align();bw.w(crc16(bw.buf,st,bw.pos),16);
    if(fi%24===23){prog(off/len);await tick()}
  }
  return bw.buf.slice(0,bw.pos);
}

async function encMP3(chans,rate,kbps,dither,prog){
  if(typeof lamejs==='undefined')throw new Error(T('El codificador MP3 no se ha cargado. Recarga la página.'));
  const enc=new lamejs.Mp3Encoder(chans.length,rate,kbps),parts=[],len=chans[0].length,B=1152*32;
  const q=chans.map(c=>{const i32=quant(c,16,dither),o=new Int16Array(len);o.set(i32);return o});
  for(let off=0,k=0;off<len;off+=B,k++){
    const out=chans.length>1?enc.encodeBuffer(q[0].subarray(off,off+B),q[1].subarray(off,off+B)):enc.encodeBuffer(q[0].subarray(off,off+B));
    if(out.length)parts.push(new Uint8Array(out.buffer,out.byteOffset,out.length).slice());
    if(k%8===7){prog(off/len);await tick()}
  }
  const f=enc.flush();if(f.length)parts.push(new Uint8Array(f.buffer,f.byteOffset,f.length).slice());
  return concat(parts);
}
async function encAAC(chans,rate,kbps,prog,opt={}){
  const ch=chans.length,len=chans[0].length;
  const cfg={codec:opt.prof==='he'?'mp4a.40.5':'mp4a.40.2',sampleRate:rate,numberOfChannels:ch,bitrate:kbps*1000,bitrateMode:opt.mode==='variable'?'variable':'constant'};
  if(opt.adts)cfg.aac={format:'adts'};
  let ok=false;try{ok='AudioEncoder' in window&&(await AudioEncoder.isConfigSupported(cfg)).supported}catch(e){}
  if(!ok&&opt.prof!=='he'&&opt.mode!=='variable'&&typeof createAacModule!=='undefined'){
    const{frames,asc}=await encAACwasm(chans,rate,kbps,prog);
    return opt.adts?concat(frames.map(f=>adtsFrame(f,asc))):m4aMux(frames,rate,ch,asc,kbps,1024,opt.meta,{brand:opt.brand});
  }
  if(!ok)throw new Error(T('Este navegador no codifica {c} a {kbps} kbps / {r}. Prueba otra combinación o Chrome/Edge en Windows o macOS.',{c:(opt.prof==='he'?'HE-AAC':'AAC')+(opt.mode==='variable'?' VBR':'')+(opt.adts?' (.aac)':''),kbps,r:fmtRate(rate)}));
  let asc=null;
  const parts=[];let err=null;
  const enc=new AudioEncoder({output:(c,m)=>{const b=new Uint8Array(c.byteLength);c.copyTo(b);parts.push(b);const d=m&&m.decoderConfig&&m.decoderConfig.description;if(!asc&&d)asc=d instanceof ArrayBuffer?new Uint8Array(d.slice(0)):new Uint8Array(d.buffer.slice(d.byteOffset,d.byteOffset+d.byteLength))},error:x=>err=x});
  enc.configure(cfg);
  const F=rate>>1;
  for(let off=0;off<len;off+=F){
    const n=Math.min(F,len-off),data=new Float32Array(n*ch);
    for(let c=0;c<ch;c++)data.set(chans[c].subarray(off,off+n),c*n);
    enc.encode(new AudioData({format:'f32-planar',sampleRate:rate,numberOfFrames:n,numberOfChannels:ch,timestamp:Math.round(off*1e6/rate),data}));
    if(err)throw err;
    if(enc.encodeQueueSize>6||((off/F)%10===9)){prog(off/len);await tick()}
  }
  await enc.flush();enc.close();if(err)throw err;
  if(opt.adts)return concat(parts);
  return m4aMux(parts,rate,ch,asc,kbps,opt.prof==='he'?2048:1024,opt.meta,{brand:opt.brand});
}
/* AAC-LC fallback: FFmpeg's encoder in WebAssembly (src/vendor), for browsers
   whose WebCodecs has no AAC encoder (Firefox, Brave, Chrome on Linux). CBR only. */
let aacWasm=null;
function aacWasmModule(){
  return aacWasm=aacWasm||createAacModule().then(m=>{const f=(n,r,a)=>m.cwrap(n,r,a),N='number';return{m,
    init:f('init_encoder',N,[N,N,N]),frameSize:f('get_encoder_frame_size',N,[N]),xd:f('get_encoder_extradata',N,[N]),xdSize:f('get_encoder_extradata_size',N,[N]),
    input:f('get_encode_input_ptr',N,[N,N]),send:f('send_frame',N,[N,N]),receive:f('receive_packet',N,[N]),data:f('get_encoded_data',N,[N]),
    flush:f('flush_encoder_start',null,[N]),reset:f('reset_encoder',null,[N])}});
}
async function encAACwasm(chans,rate,kbps,prog){
  const A=await aacWasmModule(),ch=chans.length,len=chans[0].length,ctx=A.init(ch,rate,kbps*1000);
  if(!ctx)throw new Error(T('El codificador AAC no admite {kbps} kbps a {r}.',{kbps,r:fmtRate(rate)}));
  const F=A.frameSize(ctx),xp=A.xd(ctx),asc=A.m.HEAPU8.slice(xp,xp+A.xdSize(ctx)),frames=[],buf=new Float32Array(F*ch),bytes=new Uint8Array(buf.buffer);
  const drain=()=>{let n;while((n=A.receive(ctx))>0){const p=A.data(ctx);frames.push(A.m.HEAPU8.slice(p,p+n))}};
  for(let off=0,k=0;off<len;off+=F,k++){
    const n=Math.min(F,len-off);if(n<F)buf.fill(0);
    for(let c=0;c<ch;c++){const x=chans[c];for(let i=0;i<n;i++)buf[i*ch+c]=x[off+i]}
    A.m.HEAPU8.set(bytes,A.input(ctx,bytes.length));
    if(A.send(ctx,BigInt(off))<0)throw new Error(T('El codificador AAC ha fallado.'));
    drain();if(k%300===299){prog(off/len);await tick()}
  }
  A.flush(ctx);drain();A.reset(ctx);
  return{frames,asc};
}
function adtsFrame(f,asc){
  const prof=(asc[0]>>3)-1,sf=((asc[0]&7)<<1)|(asc[1]>>7),chc=(asc[1]>>3)&15,L=f.length+7,o=new Uint8Array(L);
  o.set([0xff,0xf1,(prof<<6)|(sf<<2)|(chc>>2),((chc&3)<<6)|(L>>11),(L>>3)&255,((L&7)<<5)|31,0xfc]);o.set(f,7);return o;
}
function concat(parts){const n=parts.reduce((a,p)=>a+p.length,0),o=new Uint8Array(n);let p=0;for(const x of parts){o.set(x,p);p+=x.length}return o}
