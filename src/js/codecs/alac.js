/* ---------- ALAC (Apple Lossless) in M4A: first-order prediction + adaptive Golomb ---------- */
async function encALAC(chans,rate,bits,dither,prog){
  const nch=chans.length,len=chans[0].length,FL=4096,q=chans.map(c=>quant(c,bits,dither)),frames=[],durs=[],bps=bits+nch-1,sh=32-bps;
  const lg=x=>x>0?31-Math.clz32(x):0;
  const scalar=(bw,x,k,nb)=>{
    const m=(1<<k)-1,qq=Math.floor(x/m);
    if(qq>8){bw.w(0x1ff,9);bw.w(x,nb);return}
    bw.w(((1<<qq)-1)*2,qq+1);
    if(k===1)return;
    const r=x-qq*m;if(r===0)bw.w(0,k-1);else bw.w(r+1,k);
  };
  const rice=(bw,r,n)=>{
    let hist=10,mod=0;
    for(let i=0;i<n;){
      const v=r[i],x=v>=0?2*v:-2*v-1;
      scalar(bw,x-mod,Math.min(lg((hist>>>9)+3),14),bps);mod=0;
      hist=x>0xffff?0xffff:hist+x*40-Math.floor(hist*40/512);
      i++;
      if(hist<128&&i<n){let z=0;while(i+z<n&&r[i+z]===0)z++;
        scalar(bw,z,Math.min(7-lg(hist)+((hist+16)>>6),14),16);i+=z;mod=1;hist=0}
    }
    return true;
  };
  const res=new Int32Array(FL);
  for(let off=0;off<len;off+=FL){
    const n=Math.min(FL,len-off),partial=n!==FL;
    const hdr=(bw,comp)=>{bw.w(nch===2?1:0,3);bw.w(0,4);bw.w(0,12);bw.w(partial?1:0,1);bw.w(0,2);bw.w(comp?0:1,1);if(partial)bw.w(n,32)};
    let chs;
    if(nch===2){const L=q[0].subarray(off,off+n),R=q[1].subarray(off,off+n),u=new Int32Array(n),v=new Int32Array(n);for(let i=0;i<n;i++){v[i]=L[i]-R[i];u[i]=R[i]+(v[i]>>1)}chs=[u,v]}
    else chs=[q[0].subarray(off,off+n)];
    let bw=new BW(n*nch*4+256),ok=true;
    hdr(bw,true);bw.w(nch===2?1:0,8);bw.w(nch===2?1:0,8);
    for(let c=0;c<nch;c++){bw.w(0,4);bw.w(9,4);bw.w(4,3);bw.w(31,5);for(let j=0;j<31;j++)bw.w(0,16)}
    for(let c=0;c<nch&&ok;c++){const x=chs[c];res[0]=x[0];for(let i=1;i<n;i++)res[i]=((x[i]-x[i-1])<<sh)>>sh;ok=rice(bw,res,n)}
    const raw=Math.ceil((26+(partial?32:0)+n*nch*bits+3)/8);
    if(ok){bw.w(7,3);bw.align()}
    if(!ok||bw.pos>raw){bw=new BW(raw+16);hdr(bw,false);for(let i=0;i<n;i++)for(let c=0;c<nch;c++)bw.sw(q[c][off+i],bits);bw.w(7,3);bw.align()}
    frames.push(bw.buf.slice(0,bw.pos));durs.push(n);
    if(frames.length%24===23){prog(off/len);await tick()}
  }
  const ck=new Uint8Array(24),dv=new DataView(ck.buffer);
  dv.setUint32(0,FL);ck[4]=0;ck[5]=bits;ck[6]=40;ck[7]=10;ck[8]=14;ck[9]=nch;dv.setUint16(10,255);dv.setUint32(12,0);dv.setUint32(16,0);dv.setUint32(20,rate);
  return{frames,durs,cookie:ck};
}
