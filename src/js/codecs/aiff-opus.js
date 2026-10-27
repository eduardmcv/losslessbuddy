/* ---------- AIFF (big-endian PCM, ID3 chunk for tags + cover) ---------- */
function encAIFF(chans,rate,bits,dither,md){
  const nch=chans.length,len=chans[0].length,B=bits/8,dl=len*nch*B,q=chans.map(c=>quant(c,bits,dither));
  const id3=md&&md.tags?id3v23(md.tags,md.cover):null,id3len=id3?id3.length+(id3.length&1):0;
  const total=12+26+16+dl+(id3?8+id3len:0),buf=new ArrayBuffer(total),dv=new DataView(buf),u8=new Uint8Array(buf);
  const ws=(p,s)=>{for(let i=0;i<s.length;i++)u8[p+i]=s.charCodeAt(i)};
  ws(0,'FORM');dv.setUint32(4,total-8);ws(8,'AIFF');
  ws(12,'COMM');dv.setUint32(16,18);dv.setUint16(20,nch);dv.setUint32(22,len);dv.setUint16(26,bits);
  const e=Math.floor(Math.log2(rate));dv.setUint16(28,16383+e);dv.setUint32(30,Math.floor(rate*2**(31-e))>>>0);dv.setUint32(34,0);
  ws(38,'SSND');dv.setUint32(42,8+dl);dv.setUint32(46,0);dv.setUint32(50,0);
  let p=54;
  for(let i=0;i<len;i++)for(let c=0;c<nch;c++){const v=q[c][i];if(bits===16){dv.setInt16(p,v);p+=2}else{u8[p]=(v>>16)&255;u8[p+1]=(v>>8)&255;u8[p+2]=v&255;p+=3}}
  if(id3){ws(p,'ID3 ');dv.setUint32(p+4,id3.length);u8.set(id3,p+8)}
  return u8;
}

/* ---------- Opus in Ogg ---------- */
const OGGCRC=(()=>{const t=new Uint32Array(256);for(let i=0;i<256;i++){let r=i<<24;for(let k=0;k<8;k++)r=r&0x80000000?((r<<1)^0x04C11DB7)>>>0:(r<<1)>>>0;t[i]=r>>>0}return t})();
function oggMux(groups,serial){
  // groups: arrays of packets [{data:Uint8Array, gran:Number}]; each group starts on a fresh page
  const pages=[];let seq=0;
  const page=(segs,body,gran,flags)=>{
    const h=new Uint8Array(27+segs.length),dv=new DataView(h.buffer);
    h.set([0x4f,0x67,0x67,0x53,0,flags]);const g=gran<0?[0xffffffff,0xffffffff]:[gran%4294967296,Math.floor(gran/4294967296)];
    dv.setUint32(6,g[0]>>>0,true);dv.setUint32(10,g[1]>>>0,true);dv.setUint32(14,serial,true);dv.setUint32(18,seq++,true);h[26]=segs.length;h.set(segs,27);
    const pg=concat([h,body]);let c=0;for(let i=0;i<pg.length;i++)c=(OGGCRC[((c>>>24)^pg[i])&255]^(c<<8))>>>0;new DataView(pg.buffer).setUint32(22,c,true);pages.push(pg);
  };
  for(const g of groups){
    let segs=[],parts=[],gran=-1,startCont=false,bytes=0;
    const flush=next=>{if(segs.length)page(segs,concat(parts),gran,(startCont?1:0)|(seq===0?2:0));segs=[];parts=[];gran=-1;bytes=0;startCont=next};
    for(const pk of g){
      let off=0,left=pk.data.length;
      while(true){
        if(segs.length===255||(bytes>8000&&off===0))flush(off>0);
        const n=Math.min(255,left);segs.push(n);parts.push(pk.data.subarray(off,off+n));bytes+=n;off+=n;left-=n;
        if(n<255){gran=pk.gran;break}
        if(left===0){if(segs.length===255)flush(true);segs.push(0);gran=pk.gran;break}
      }
    }
    flush(false);
  }
  const last=pages[pages.length-1];last[5]|=4;let c=0;new DataView(last.buffer).setUint32(22,0,true);for(let i=0;i<last.length;i++)c=(OGGCRC[((c>>>24)^last[i])&255]^(c<<8))>>>0;new DataView(last.buffer).setUint32(22,c,true);
  return concat(pages);
}
async function encOpus(chans,rate,kbps,prog,md,srcRate){
  const ch=chans.length,len=chans[0].length;
  const cfg={codec:'opus',sampleRate:rate,numberOfChannels:ch,bitrate:kbps*1000};
  let ok=false;try{ok='AudioEncoder' in window&&(await AudioEncoder.isConfigSupported(cfg)).supported}catch(e){}
  if(!ok)throw new Error(T('Este navegador no codifica Opus. Prueba con Chrome, Edge o Firefox actualizados.'));
  const pk=[];let err=null,pre=312;
  const enc=new AudioEncoder({output:(c,m)=>{const b=new Uint8Array(c.byteLength);c.copyTo(b);pk.push({data:b,dur:Math.round((c.duration||20000)*rate/1e6)});
    const d=m&&m.decoderConfig&&m.decoderConfig.description;if(d&&!pk.head){const u=d instanceof ArrayBuffer?new Uint8Array(d):new Uint8Array(d.buffer,d.byteOffset,d.byteLength);if(u.length>=12&&String.fromCharCode(...u.subarray(0,8))==='OpusHead')pre=u[10]|(u[11]<<8);pk.head=1}},error:e=>err=e});
  enc.configure(cfg);
  const F=rate>>1;
  for(let off=0;off<len;off+=F){
    const n=Math.min(F,len-off),data=new Float32Array(n*ch);for(let c=0;c<ch;c++)data.set(chans[c].subarray(off,off+n),c*n);
    enc.encode(new AudioData({format:'f32-planar',sampleRate:rate,numberOfFrames:n,numberOfChannels:ch,timestamp:Math.round(off*1e6/rate),data}));
    if(err)throw err;if(enc.encodeQueueSize>6||((off/F)%10===9)){prog(off/len);await tick()}
  }
  await enc.flush();enc.close();if(err)throw err;
  const head=new Uint8Array(19),hv=new DataView(head.buffer);head.set([...'OpusHead'].map(c=>c.charCodeAt(0)));head[8]=1;head[9]=ch;hv.setUint16(10,pre,true);hv.setUint32(12,srcRate||rate,true);hv.setInt16(16,0,true);head[18]=0;
  const t=(md&&md.tags)||{},kv=[['TITLE',t.title],['ARTIST',t.artist],['ALBUM',t.album],['ALBUMARTIST',t.albumArtist],['TRACKNUMBER',splitNum(t.track)[0]||''],['DATE',t.year],['GENRE',t.genre]].filter(x=>x[1]).map(([k,v])=>k+'='+v);
  if(md&&md.cover){const pic=flacBlocks({},md.cover).find(b=>b.type===6);if(pic){let s='';for(let i=0;i<pic.data.length;i+=32768)s+=String.fromCharCode(...pic.data.subarray(i,i+32768));kv.push('METADATA_BLOCK_PICTURE='+btoa(s))}}
  const le=v=>new Uint8Array([v&255,(v>>8)&255,(v>>16)&255,(v>>>24)&255]),vend=enc8('Lossless Buddy'),parts=[enc8('OpusTags'),le(vend.length),vend,le(kv.length)];
  for(const s of kv){const b=enc8(s);parts.push(le(b.length),b)}
  let gran=pre;const audio=pk.map((p,i)=>{gran+=p.dur;return{data:p.data,gran:i===pk.length-1?pre+len:gran}});
  return oggMux([[{data:head,gran:0}],[{data:concat(parts),gran:0}],audio],(Math.random()*4294967295)>>>0);
}
