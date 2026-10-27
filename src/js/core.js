/* ---------- helpers, format matrix, help texts and app state ---------- */
const $=s=>document.querySelector(s);
const tick=()=>new Promise(r=>setTimeout(r,0));
const ICON_PLAY='<svg viewBox="0 0 20 20" fill="currentColor"><path d="M6 4.5v11l9-5.5z"/></svg>';
const ICON_STOP='<svg viewBox="0 0 20 20" fill="currentColor"><rect x="5" y="5" width="10" height="10" rx="1.5"/></svg>';
const ICON_DL='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M8 2.5v8M4.5 7.5 8 11l3.5-3.5M3 13.5h10"/></svg>';

const FMT={
  wav:{name:'WAV',ext:'wav',lossless:true,depths:[16,24,32]},
  flac:{name:'FLAC',ext:'flac',lossless:true,depths:[16,24]},
  mp3:{name:'MP3',ext:'mp3',lossless:false,rates:[32000,44100,48000]},
  aac:{name:'AAC',ext:'m4a',lossless:false,rates:[44100,48000]},
  aiff:{name:'AIFF',ext:'aiff',lossless:true,depths:[16,24]},
  opus:{name:'Opus',ext:'opus',lossless:false,rates:[48000]},
  alac:{name:'ALAC',ext:'m4a',lossless:true,depths:[16,24]}
};
const CODECS=[{id:'pcm',name:'PCM',def:'wav'},{id:'flac',name:'FLAC',def:'flac'},{id:'alac',name:'ALAC',def:'alac'},{id:'mp3',name:'MP3',def:'mp3'},{id:'aac',name:'AAC',def:'aac'},{id:'opus',name:'OPUS',def:'opus'}];
const codecOf=f=>f==='wav'||f==='aiff'?'pcm':f;
const CONTS={pcm:[{l:'.wav',set:{fmt:'wav'}},{l:'.aiff',set:{fmt:'aiff'}}],flac:[{l:'.flac'}],alac:[{l:'.m4a'}],mp3:[{l:'.mp3'}],
  aac:[{l:'.m4a',set:{aacCont:'m4a'}},{l:'.m4b',set:{aacCont:'m4b'}},{l:'.aac',set:{aacCont:'adts'},need:'aacAdts'}],opus:[{l:'.opus',set:{opusExt:'opus'}},{l:'.ogg',set:{opusExt:'ogg'}}]};
const KBPS=[64,96,128,192,256,320];
const RATES=[0,44100,48000,96000];
const BASE={kbps:256,bits:16,rate:0,mono:false,norm:false,lufs:-14,dither:true,aacMode:'constant',aacProf:'lc',aacCont:'m4a',opusExt:'opus',cover:'keep',id3v1:false};
const INFO={
  meter:['¿Lossless real?','La aguja marca hasta qué frecuencia llega el sonido. Un FLAC o WAV real llega arriba (~22 kHz). Pero un corte solo no basta: grabaciones analógicas y másters antiguos también cortan alto. El veredicto combina varias señales:','REAL = sin indicios. LOSSY = es MP3/AAC y lo dice. DUDA = corte suave o variable, puede ser analógico; no lo borres. FAKE = dice ser lossless y tiene la firma de un códec.'],
  lufs:['Medidas de volumen','LUFS: volumen percibido medio (ITU-R BS.1770-4). Spotify y YouTube igualan a unos −14.','TP (true peak): el pico real entre muestras, en dBTP. Por encima de −1 se enciende el LED: al convertir a MP3/AAC puede distorsionar. DR: cuánto se ha comprimido el máster (más alto = más dinámica; 6 o menos = muy aplastado). LRA: cuánto varía el volumen a lo largo de la canción, en LU.'],
  fmt:['Códec','Cómo se guarda el sonido. Sin pérdida (idéntico al original): PCM (sin comprimir), FLAC y ALAC (el FLAC de Apple; los dos ocupan más o menos la mitad).','Con pérdida (5–10 veces menos): MP3 (lo lee todo), AAC (Apple, el Audi y casi todos los coches modernos) y OPUS (el más eficiente, pero casi ninguna radio lo lee). Debajo eliges el contenedor, que es lo que decide la extensión del archivo.'],
  q:['Calidad','En MP3/AAC son kbps: más kbps = más fiel y más pesado. 256 ya es transparente para casi todo el mundo; 320 es el máximo.','En WAV/FLAC son bits: 16 bit es calidad CD y basta para escuchar; 24 bit solo para editar o archivar. Al bajar a 16 bit se añade solo un ruido inaudible (dither) que evita distorsión en los finales suaves. No tienes que tocar nada.'],
  rate:['Frecuencia de muestreo','Cuántas veces por segundo se mide el sonido. 44,1 kHz es la del CD y cubre todo lo audible. «Orig.» deja la del archivo.','Subirla no mejora nada. Bájala solo si el equipo de destino no acepta la original (el MMI de Audi, por ejemplo, va a 44,1/48).'],
  mono:['Mono','Junta los dos canales en uno. Sirve para voz (podcasts) y reduce el tamaño. Para música déjalo apagado o perderás el estéreo.'],
  norm:['Normalizar','Off: el volumen original intacto. −23: estándar de radio y TV (EBU R128). −16: Apple Music y podcasts. −14: Spotify y YouTube. Pico: solo sube hasta que el pico real toca −1 dBTP, sin cambiar el carácter.','Nunca se pasa de −1 dBTP: si para llegar al objetivo habría que pasarse, se queda un poco por debajo y te dice cuánto. La ganancia que se aplicará sale en la pantalla.'],
  tags:['Etiqueta','Título, artista, álbum y demás datos que ve tu radio o tu móvil. Se leen del archivo original y se escriben en el nuevo: ID3v2.3 en MP3, Vorbis en FLAC y átomos de iTunes en M4A. Las tildes y la ñ se guardan bien (UTF-16).'],
  cover:['Carátula','La carátula incrustada es la causa más común de que un USB no se lea bien en el coche: muchas radios se cuelgan con imágenes grandes o PNG.','500 px sale siempre como JPEG cuadrado, básico (no progresivo) y sin datos EXIF: lo que mejor tragan los equipos. «Original» la deja tal cual. Arrastra cualquier imagen para cambiarla.'],
  id3:['ID3','Las etiquetas del MP3. ID3v2.3 va siempre (la versión que leen todos los equipos; la v2.4 da problemas en radios antiguas). ID3v1 es una versión mínima de los años 90 que algunas radios muy viejas solo saben leer: sin tildes y con 30 letras por campo.'],
  scope:['Espectrograma','Tiempo de izquierda a derecha, frecuencia de abajo arriba, intensidad en color. Un MP3 deja un techo plano y recto en toda la canción (la línea discontinua); una grabación real se difumina hacia arriba y varía con la música.','La escala lineal es la que mejor enseña ese techo. La logarítmica se parece más a cómo oímos.'],
  dial:['Línea de tiempo','La regla es la canción entera y la línea roja marca dónde empieza a sonar al pulsar Escuchar. Gira la rueda de sintonía de la derecha (3 vueltas = canción entera) o pulsa y arrastra sobre la regla.','También marca de dónde se sacan los 30 segundos del Pack de prueba.'],
  mode:['CBR o VBR','CBR (fijo) gasta los mismos kbps en cada segundo. VBR (variable) gasta más en los pasajes complejos y menos en los simples: mejor calidad por MB.','Algunas radios de coche antiguas fallan con VBR: la duración sale mal, el avance rápido salta o no lo leen. Si dudas, CBR. En MP3 aquí siempre es CBR.'],
  prof:['Perfil AAC','AAC-LC es el AAC normal, el que lee todo el mundo. HE-AAC añade un truco para sonar decente a muy pocos kbps (64 o menos), pero muchos equipos antiguos no lo soportan.','Para música a 128 kbps o más: siempre LC.'],
  cont:['Contenedor','La «caja» del archivo: decide la extensión. El mismo audio puede ir en cajas distintas: PCM en .wav o .aiff (la de Apple, que además guarda etiquetas y carátula); AAC en .m4a, .m4b (audiolibros: el iPhone recuerda por dónde ibas) o .aac pelado (sin etiquetas); Opus en .opus u .ogg.','Si tu equipo no ve el archivo, prueba otra caja del mismo códec.'],
  pack:['Pack de prueba','Crea un zip con 8 versiones de 30 segundos de tu canción, numeradas: AAC fijo y variable, .m4a y .aac, HE-AAC, MP3 320 y 192, WAV y FLAC.','Cópialas a un USB o SD en FAT32, pon cada una en el coche y apunta qué números suenan. Te quedas con la de más calidad que funcione. Dentro va un LEEME.txt con la lista.'],
  mode2:['Manual o preset','PRESET: eliges un destino (el Audi, un CDJ, Spotify…) pasando cintas con ◀ ▶, o saltando de categoría con los pilotos. Se ajusta todo solo.','MANUAL: tú eliges códec, contenedor, calidad y demás. Si vienes de una cinta, partes de sus ajustes para retocarlos.'],
};
const S={mode:'preset',sel:'car-audi-a4-b8-mmi-3g',src:null,an:null,out:{...BASE,fmt:'aac',kbps:256,rate:44100,cover:'500'},queue:[],busy:false,eng:{aac:false,mp3:false},tags:{},coverSrc:null,coverOut:null,scale:'lin',scopeOpen:true,flacRatio:.6};

const fmtBytes=b=>b<1048576?(b/1024).toFixed(0)+' KB':(b/1048576).toFixed(b<10485760?2:1)+' MB';
const fmtTime=s=>{s=Math.round(s);return Math.floor(s/60)+':'+String(s%60).padStart(2,'0')};
const fmtRate=r=>(r/1000).toLocaleString('es-ES',{maximumFractionDigits:2})+' kHz';
const num=(v,d=1)=>v.toLocaleString('es-ES',{minimumFractionDigits:d,maximumFractionDigits:d}).replace('-','−');
function toast(msg,err){const t=$('#toast');t.textContent=msg;t.className='toast show'+(err?' err':'');clearTimeout(t._h);t._h=setTimeout(()=>t.className='toast',3800)}
const baseName=n=>n.replace(/\.[^.]+$/,'');
const isLossless=f=>/^(FLAC|WAV|AIFF|ALAC)$/.test(f);
