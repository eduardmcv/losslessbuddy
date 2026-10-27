/* ---------- tags: read (ID3v2, Vorbis comments, MP4 atoms, RIFF INFO) ---------- */
const TAGF=[['title','Título'],['artist','Artista'],['album','Álbum'],['albumArtist','Artista del álbum'],['track','Pista'],['disc','Disco'],['year','Año'],['genre','Género']];
const emptyTags=()=>({title:'',artist:'',album:'',albumArtist:'',track:'',disc:'',year:'',genre:''});
const be32=(b,p)=>((b[p]<<24)>>>0)+(b[p+1]<<16)+(b[p+2]<<8)+b[p+3];
const le32=(b,p)=>(b[p]|(b[p+1]<<8)|(b[p+2]<<16))+b[p+3]*16777216;
const syncsafe=(b,p)=>(b[p]&127)<<21|(b[p+1]&127)<<14|(b[p+2]&127)<<7|(b[p+3]&127);
const ascii=(b,p,n)=>String.fromCharCode(...b.subarray(p,p+n));
const latin1=b=>{let s='';for(let i=0;i<b.length;i++)s+=String.fromCharCode(b[i]);return s};
const clean=s=>s.replace(/\0+$/,'').replace(/\0/g,' / ').trim();
function decText(b,enc){
  if(enc===0)return clean(latin1(b));
  if(enc===3)return clean(new TextDecoder('utf-8').decode(b));
  if(enc===2)return clean(new TextDecoder('utf-16be').decode(b));
  if(b[0]===0xFE&&b[1]===0xFF)return clean(new TextDecoder('utf-16be').decode(b.subarray(2)));
  return clean(new TextDecoder('utf-16le').decode(b[0]===0xFF&&b[1]===0xFE?b.subarray(2):b));
}
const imgMime=(d,m)=>d[0]===0x89&&d[1]===0x50?'image/png':d[0]===0xFF&&d[1]===0xD8?'image/jpeg':(m||'image/jpeg');
function readID3(u8,o=0){
  if(ascii(u8,o,3)!=='ID3')return null;
  const ver=u8[o+3],flags=u8[o+5],size=syncsafe(u8,o+6),end=Math.min(u8.length,o+10+size),t=emptyTags();let p=o+10,cover=null;
  if(ver<3)return{tags:t,cover,size:10+size};
  if(flags&0x40)p+=ver===4?syncsafe(u8,p):be32(u8,p)+4;
  const map={TIT2:'title',TPE1:'artist',TALB:'album',TPE2:'albumArtist',TRCK:'track',TPOS:'disc',TYER:'year',TDRC:'year',TCON:'genre'};
  while(p+10<=end){
    const id=ascii(u8,p,4);if(!/^[A-Z0-9]{4}$/.test(id))break;
    const fs=ver===4?syncsafe(u8,p+4):be32(u8,p+4);if(fs<=0||p+10+fs>end)break;
    const d=u8.subarray(p+10,p+10+fs);p+=10+fs;
    if(map[id]){let v=decText(d.subarray(1),d[0]);if(id==='TCON')v=v.replace(/^\(\d+\)/,'').trim()||v;if(map[id]==='year')v=v.slice(0,4);if(!t[map[id]])t[map[id]]=v}
    else if(id==='APIC'&&(!cover||d[0]!==undefined)){
      const enc=d[0];let q=1;while(q<d.length&&d[q])q++;const mime=latin1(d.subarray(1,q));q++;const type=d[q++];
      if(enc===1||enc===2){while(q+1<d.length&&(d[q]||d[q+1]))q+=2;q+=2}else{while(q<d.length&&d[q])q++;q++}
      if(!cover||type===3){const data=d.slice(q);cover={data,mime:imgMime(data,mime)}}
    }
  }
  return{tags:t,cover,size:10+size};
}
function vorbisInto(t,b,p,n){
  const map={TITLE:'title',ARTIST:'artist',ALBUM:'album',ALBUMARTIST:'albumArtist','ALBUM ARTIST':'albumArtist',TRACKNUMBER:'track',DISCNUMBER:'disc',DATE:'year',YEAR:'year',GENRE:'genre'};
  const dec=new TextDecoder('utf-8');p+=4+le32(b,p);const cnt=le32(b,p);p+=4;
  for(let i=0;i<cnt&&p<n;i++){const l=le32(b,p);p+=4;const s=dec.decode(b.subarray(p,p+l));p+=l;const k=s.indexOf('=');if(k<0)continue;
    const key=map[s.slice(0,k).toUpperCase()];if(key&&!t[key])t[key]=key==='year'?s.slice(k+1,k+5):s.slice(k+1)}
}
function readFLACmeta(u8){
  const t=emptyTags();let p=4,cover=null;
  while(p+4<=u8.length){const last=u8[p]&0x80,type=u8[p]&0x7f,len=(u8[p+1]<<16)|(u8[p+2]<<8)|u8[p+3];p+=4;
    if(type===4)vorbisInto(t,u8,p,p+len);
    if(type===6){let q=p;const pt=be32(u8,q);q+=4;const ml=be32(u8,q);q+=4;const mime=ascii(u8,q,ml);q+=ml;q+=4+be32(u8,q);q+=16;const dl=be32(u8,q);q+=4;
      if(!cover||pt===3){const data=u8.slice(q,q+dl);cover={data,mime:imgMime(data,mime)}}}
    p+=len;if(last)break}
  return{tags:t,cover};
}
function readMP4meta(u8){
  const t=emptyTags();let cover=null;
  const map={'\xa9nam':'title','\xa9ART':'artist','\xa9alb':'album','aART':'albumArtist','\xa9day':'year','\xa9gen':'genre'};
  const walk=(s,e,depth)=>{
    let p=s;while(p+8<=e){let size=be32(u8,p);const type=ascii(u8,p+4,4);let h=8;if(size===1){size=be32(u8,p+12)+be32(u8,p+8)*4294967296;h=16}else if(size===0)size=e-p;if(size<8)break;
      const end=Math.min(e,p+size);
      if(['moov','udta','ilst'].includes(type))walk(p+h,end,depth+1);
      else if(type==='meta')walk(p+h+4,end,depth+1);
      else if(depth>=3&&end-p>16){
        let q=p+h;while(q+16<=end&&ascii(u8,q+4,4)!=='data')q+=be32(u8,q)||end;
        if(q+16<=end){const dl=be32(u8,q),dt=be32(u8,q+8),d=u8.subarray(q+16,q+dl);
          if(map[type]&&!t[map[type]])t[map[type]]=new TextDecoder().decode(d).slice(0,map[type]==='year'?4:500);
          else if(type==='trkn'&&d.length>=6)t.track=String((d[2]<<8)|d[3])+(((d[4]<<8)|d[5])?'/'+((d[4]<<8)|d[5]):'');
          else if(type==='disk'&&d.length>=6)t.disc=String((d[2]<<8)|d[3])+(((d[4]<<8)|d[5])?'/'+((d[4]<<8)|d[5]):'');
          else if(type==='covr'&&!cover){const data=d.slice();cover={data,mime:dt===14?'image/png':imgMime(data)}}}
      }
      p+=size}
  };
  walk(0,u8.length,0);return{tags:t,cover};
}
function readWAVmeta(u8){
  const t=emptyTags();let p=12,cover=null;const map={INAM:'title',IART:'artist',IPRD:'album',ICRD:'year',IGNR:'genre',ITRK:'track',IPRT:'track'};
  while(p+8<=u8.length){const id=ascii(u8,p,4),sz=le32(u8,p+4);
    if(id==='LIST'&&ascii(u8,p+8,4)==='INFO'){let q=p+12;while(q+8<=p+8+sz){const k=ascii(u8,q,4),l=le32(u8,q+4);if(map[k]&&!t[map[k]])t[map[k]]=clean(new TextDecoder().decode(u8.subarray(q+8,q+8+l)));q+=8+l+(l&1)}}
    if(id==='id3 '||id==='ID3 '){const r=readID3(u8,p+8);if(r){for(const k in r.tags)if(r.tags[k]&&!t[k])t[k]=r.tags[k];cover=r.cover}}
    p+=8+sz+(sz&1)}
  return{tags:t,cover};
}
function readMeta(u8,fmt,name){
  let r=null;
  try{if(fmt==='MP3'||ascii(u8,0,3)==='ID3')r=readID3(u8,0);else if(fmt==='FLAC')r=readFLACmeta(u8);else if(/^(AAC|ALAC|M4A)$/.test(fmt))r=readMP4meta(u8);else if(fmt==='WAV')r=readWAVmeta(u8)}catch(e){console.warn(e)}
  r=r||{tags:emptyTags(),cover:null};
  if(!r.tags.title){const b=baseName(name).replace(/_/g,' '),m=b.match(/^(?:\d+\s*[-.]\s*)?(.+?)\s+-\s+(.+)$/);if(m){r.tags.artist=r.tags.artist||m[1];r.tags.title=m[2]}else r.tags.title=b}
  return r;
}

/* ---------- cover: square baseline JPEG, no EXIF ---------- */
async function coverDims(c){try{const bm=await createImageBitmap(new Blob([c.data],{type:c.mime}));c.w=bm.width;c.h=bm.height;bm.close&&bm.close()}catch(e){c.w=c.h=0}return c}
async function renderCover(c,mode){
  if(!c||mode==='none')return null;
  if(mode==='keep')return c;
  const bm=await createImageBitmap(new Blob([c.data],{type:c.mime})),side=Math.min(bm.width,bm.height),s=Math.min(+mode,side);
  const cv=document.createElement('canvas');cv.width=cv.height=s;const x=cv.getContext('2d');x.fillStyle='#000';x.fillRect(0,0,s,s);
  x.imageSmoothingQuality='high';x.drawImage(bm,(bm.width-side)/2,(bm.height-side)/2,side,side,0,0,s,s);bm.close&&bm.close();
  const blob=await new Promise(r=>cv.toBlob(r,'image/jpeg',.88));return{data:new Uint8Array(await blob.arrayBuffer()),mime:'image/jpeg',w:s,h:s};
}

/* ---------- tags: write ---------- */
const enc8=s=>new TextEncoder().encode(s);
function splitNum(v){const m=String(v||'').match(/^\s*(\d+)\s*(?:\/\s*(\d+))?/);return m?[+m[1],+(m[2]||0)]:[0,0]}
function id3v23(t,cover){
  const parts=[],u32=v=>[(v>>>24)&255,(v>>>16)&255,(v>>>8)&255,v&255];
  const frame=(id,body)=>{parts.push(new Uint8Array([...[...id].map(c=>c.charCodeAt(0)),...u32(body.length),0,0]),body)};
  const text=(id,v)=>{if(!v)return;const b=new Uint8Array(3+v.length*2);b[0]=1;b[1]=0xFF;b[2]=0xFE;for(let i=0;i<v.length;i++){const c=v.charCodeAt(i);b[3+i*2]=c&255;b[4+i*2]=c>>8}frame(id,b)};
  text('TIT2',t.title);text('TPE1',t.artist);text('TALB',t.album);text('TPE2',t.albumArtist);text('TRCK',t.track);text('TPOS',t.disc);text('TYER',(t.year||'').slice(0,4));text('TCON',t.genre);
  text('TSSE','Lossless Buddy');
  if(cover){const head=new Uint8Array([0,...[...cover.mime].map(c=>c.charCodeAt(0)),0,3,0]),b=new Uint8Array(head.length+cover.data.length);b.set(head);b.set(cover.data,head.length);frame('APIC',b)}
  const body=concat(parts),size=body.length+256,hd=new Uint8Array([0x49,0x44,0x33,3,0,0,(size>>21)&127,(size>>14)&127,(size>>7)&127,size&127]);
  return concat([hd,body,new Uint8Array(256)]);
}
function id3v1(t){
  const b=new Uint8Array(128),put=(s,p,n)=>{s=(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'');for(let i=0;i<Math.min(n,s.length);i++){const c=s.charCodeAt(i);b[p+i]=c<256?c:63}};
  put('TAG',0,3);put(t.title,3,30);put(t.artist,33,30);put(t.album,63,30);put((t.year||'').slice(0,4),93,4);b[125]=0;b[126]=splitNum(t.track)[0]&255;b[127]=255;return b;
}
function flacBlocks(t,cover){
  const le=v=>[v&255,(v>>8)&255,(v>>16)&255,(v>>>24)&255],be=v=>[(v>>>24)&255,(v>>16)&255,(v>>8)&255,v&255];
  const kv=[['TITLE',t.title],['ARTIST',t.artist],['ALBUM',t.album],['ALBUMARTIST',t.albumArtist],['TRACKNUMBER',splitNum(t.track)[0]||''],['DISCNUMBER',splitNum(t.disc)[0]||''],['DATE',t.year],['GENRE',t.genre]].filter(x=>x[1]);
  const vendor=enc8('Lossless Buddy'),parts=[new Uint8Array(le(vendor.length)),vendor,new Uint8Array(le(kv.length))];
  for(const[k,v]of kv){const s=enc8(k+'='+v);parts.push(new Uint8Array(le(s.length)),s)}
  const blocks=[{type:4,data:concat(parts)}];
  if(cover){const m=enc8(cover.mime);blocks.push({type:6,data:concat([new Uint8Array([...be(3),...be(m.length)]),m,new Uint8Array([...be(0),...be(cover.w||0),...be(cover.h||0),...be(24),...be(0),...be(cover.data.length)]),cover.data])})}
  return blocks;
}
function wavInfo(u8,t){
  const items=[['INAM',t.title],['IART',t.artist],['IPRD',t.album],['ICRD',t.year],['IGNR',t.genre],['ITRK',t.track],['ISFT','Lossless Buddy']].filter(x=>x[1]);
  if(!items.length)return u8;
  const parts=[enc8('INFO')];for(const[k,v]of items){const s=enc8(v+'\0'),pad=s.length&1;parts.push(enc8(k),new Uint8Array([s.length&255,(s.length>>8)&255,(s.length>>16)&255,0]),s,new Uint8Array(pad))}
  const body=concat(parts),hd=new Uint8Array(8);hd.set(enc8('LIST'));new DataView(hd.buffer).setUint32(4,body.length,true);
  const out=concat([u8,hd,body]);new DataView(out.buffer).setUint32(4,out.length-8,true);return out;
}
