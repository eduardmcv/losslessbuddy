/* ---------- zip (store): the multi-file test pack, and hosts that only allow .zip downloads ---------- */
const CRC32=(()=>{const t=new Uint32Array(256);for(let i=0;i<256;i++){let c=i;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[i]=c>>>0}return t})();
function crc32(d){let c=0xFFFFFFFF;for(let i=0;i<d.length;i++)c=CRC32[(c^d[i])&255]^(c>>>8);return(c^0xFFFFFFFF)>>>0}
function zipMany(files){
  const d=new Date(),time=(d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1),date=((d.getFullYear()-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate();
  const W=(dv,list)=>list.forEach(([o,v,s])=>s===4?dv.setUint32(o,v,true):dv.setUint16(o,v,true));
  const loc=[],cen=[];let off=0;
  for(const f of files){
    const nm=new TextEncoder().encode(f.name),crc=crc32(f.data),n=f.data.length;
    const lh=new DataView(new ArrayBuffer(30));W(lh,[[0,0x04034b50,4],[4,20,2],[6,0x0800,2],[8,0,2],[10,time,2],[12,date,2],[14,crc,4],[18,n,4],[22,n,4],[26,nm.length,2],[28,0,2]]);
    const cd=new DataView(new ArrayBuffer(46));W(cd,[[0,0x02014b50,4],[4,20,2],[6,20,2],[8,0x0800,2],[10,0,2],[12,time,2],[14,date,2],[16,crc,4],[20,n,4],[24,n,4],[28,nm.length,2],[30,0,2],[32,0,2],[34,0,2],[36,0,2],[38,0,4],[42,off,4]]);
    loc.push(new Uint8Array(lh.buffer),nm,f.data);cen.push(new Uint8Array(cd.buffer),nm);off+=30+nm.length+n;
  }
  const cs=cen.reduce((a,x)=>a+x.length,0),eo=new DataView(new ArrayBuffer(22));
  W(eo,[[0,0x06054b50,4],[4,0,2],[6,0,2],[8,files.length,2],[10,files.length,2],[12,cs,4],[16,off,4],[20,0,2]]);
  return concat([...loc,...cen,new Uint8Array(eo.buffer)]);
}
const zipOne=(name,data)=>zipMany([{name,data}]);
