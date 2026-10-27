/* ---------- minimal M4A (MP4) muxer for AAC frames ---------- */
function m4aMux(frames,rate,ch,asc,kbps,flen=1024,meta=null,mo={}){
  const u32=v=>[(v>>>24)&255,(v>>>16)&255,(v>>>8)&255,v&255],u16=v=>[(v>>8)&255,v&255],str=s=>[...s].map(c=>c.charCodeAt(0));
  const flat=parts=>{const out=[];for(const p of parts){if(p instanceof Uint8Array)for(let i=0;i<p.length;i++)out.push(p[i]);else if(Array.isArray(p))for(let i=0;i<p.length;i++)out.push(p[i]);else out.push(p)}return out};
  const box=(type,...parts)=>{const body=flat(parts),o=[...u32(body.length+8),...str(type)];for(let i=0;i<body.length;i++)o.push(body[i]);return o};
  const full=(type,vf,...parts)=>box(type,u32(vf),...parts);
  if(!asc||!asc.length){const fi=[96000,88200,64000,48000,44100,32000,24000,22050,16000,12000,11025,8000].indexOf(rate);const v=(2<<11)|((fi<0?4:fi)<<7)|(ch<<3);asc=new Uint8Array([v>>8,v&255])}
  const n=frames.length,samples=mo.durs?mo.durs.reduce((a,b)=>a+b,0):n*flen,ms=Math.round(samples*1000/rate);
  const desc=(tag,body)=>[tag,body.length,...body];
  const esds=full('esds',0,desc(3,[...u16(1),0,...desc(4,[0x40,0x15,0,0x18,0,...u32(kbps*1000),...u32(kbps*1000),...desc(5,[...asc])]),...desc(6,[2])]));
  const mp4a=mo.alac?box('alac',[0,0,0,0,0,0],u16(1),u32(0),u32(0),u16(ch),u16(mo.bits||16),u16(0),u16(0),u32(rate<65536?(rate<<16)>>>0:0),full('alac',0,mo.alac)):box('mp4a',[0,0,0,0,0,0],u16(1),u32(0),u32(0),u16(ch),u16(16),u16(0),u16(0),u32(rate<<16>>>0),esds);
  const matrix=[...u32(0x10000),...u32(0),...u32(0),...u32(0),...u32(0x10000),...u32(0),...u32(0),...u32(0),...u32(0x40000000)];
  const moov=off=>box('moov',
    full('mvhd',0,u32(0),u32(0),u32(1000),u32(ms),u32(0x10000),u16(0x100),u16(0),u32(0),u32(0),matrix,u32(0),u32(0),u32(0),u32(0),u32(0),u32(0),u32(2)),
    box('trak',
      full('tkhd',7,u32(0),u32(0),u32(1),u32(0),u32(ms),u32(0),u32(0),u16(0),u16(0),u16(0x100),u16(0),matrix,u32(0),u32(0)),
      box('mdia',
        full('mdhd',0,u32(0),u32(0),u32(rate),u32(samples),u16(0x55c4),u16(0)),
        full('hdlr',0,u32(0),str('soun'),u32(0),u32(0),u32(0),str('SoundHandler'),0),
        box('minf',
          full('smhd',0,u16(0),u16(0)),
          box('dinf',full('dref',0,u32(1),full('url ',1))),
          box('stbl',
            full('stsd',0,u32(1),mp4a),
            (()=>{if(!mo.durs)return full('stts',0,u32(1),u32(n),u32(flen));const runs=[];for(const d of mo.durs){const l=runs[runs.length-1];if(l&&l[1]===d)l[0]++;else runs.push([1,d])}return full('stts',0,u32(runs.length),runs.flatMap(([c,d])=>[...u32(c),...u32(d)]))})(),
            full('stsc',0,u32(1),u32(1),u32(n),u32(1)),
            full('stsz',0,u32(0),u32(n),(()=>{const a=[];for(const f of frames)a.push(...u32(f.length));return a})()),
            full('stco',0,u32(1),u32(off)))))),udta);
  let udta=[];
  if(meta){const tg=meta.tags||{},items=[],txt=(n,v)=>{if(v)items.push(box(n,box('data',u32(1),u32(0),Array.from(new TextEncoder().encode(String(v))))))};
    txt('\xa9nam',tg.title);txt('\xa9ART',tg.artist);txt('\xa9alb',tg.album);txt('aART',tg.albumArtist);txt('\xa9day',tg.year);txt('\xa9gen',tg.genre);txt('\xa9too','Lossless Buddy');
    const[tn,tt]=splitNum(tg.track),[dn,dt]=splitNum(tg.disc);
    if(tn)items.push(box('trkn',box('data',u32(0),u32(0),[0,0,...u16(tn),...u16(tt),0,0])));
    if(dn)items.push(box('disk',box('data',u32(0),u32(0),[0,0,...u16(dn),...u16(dt)])));
    if(meta.cover)items.push(box('covr',box('data',u32(meta.cover.mime==='image/png'?14:13),u32(0),meta.cover.data)));
    if(items.length)udta=box('udta',full('meta',0,full('hdlr',0,u32(0),str('mdir'),str('appl'),u32(0),u32(0),0),box('ilst',...items)));}
  const ftyp=box('ftyp',str(mo.brand||'M4A '),u32(0),str(mo.brand||'M4A '),str('mp42'),str('isom'));
  const mdatLen=frames.reduce((a,f)=>a+f.length,0);
  const mv=moov(ftyp.length+moov(0).length+8);
  const out=new Uint8Array(ftyp.length+mv.length+8+mdatLen);let p=0;
  out.set(ftyp,p);p+=ftyp.length;out.set(mv,p);p+=mv.length;out.set([...u32(mdatLen+8),...str('mdat')],p);p+=8;
  for(const f of frames){out.set(f,p);p+=f.length}
  return out;
}
