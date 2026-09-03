let stream,ctx,source,splitter,a1,a2,raf,recorder,chunks=[],timer;
let lastR1=0,lastR2=0, originalBlob=null, ch1Blob=null, ch2Blob=null;
const $=x=>document.getElementById(x);

async function listDevices(){
  const ds=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==="audioinput");
  $("devices").innerHTML="";
  ds.forEach((d,i)=>{const o=document.createElement("option");o.value=d.deviceId;o.textContent=d.label||`Entrée ${i+1}`;$("devices").appendChild(o)});
  return ds;
}

function readStats(an,n){
  const d=new Float32Array(an.fftSize); an.getFloatTimeDomainData(d);
  let s=0,p=0; for(const x of d){s+=x*x;p=Math.max(p,Math.abs(x))}
  const r=Math.sqrt(s/d.length);
  $(`rms${n}`).textContent=r.toFixed(4); $(`peak${n}`).textContent=p.toFixed(4);
  $(`bar${n}`).style.width=Math.min(100,r*500)+"%";
  const c=$(`scope${n}`),g=c.getContext("2d"); g.clearRect(0,0,c.width,c.height); g.beginPath();
  d.forEach((v,i)=>{const x=i/(d.length-1)*c.width,y=(.5-v*.45)*c.height;i?g.lineTo(x,y):g.moveTo(x,y)});
  g.strokeStyle="#eee"; g.stroke();
  return r;
}

function draw(){
  cancelAnimationFrame(raf);
  const loop=()=>{lastR1=readStats(a1,1);lastR2=readStats(a2,2);raf=requestAnimationFrame(loop)}; loop();
}

async function openInput(id){
  if(stream) stream.getTracks().forEach(t=>t.stop());
  if(ctx) await ctx.close();

  const audio={echoCancellation:false,noiseSuppression:false,autoGainControl:false,channelCount:{ideal:2},sampleRate:{ideal:48000}};
  if(id) audio.deviceId={exact:id};
  stream=await navigator.mediaDevices.getUserMedia({audio});
  ctx=new (window.AudioContext||window.webkitAudioContext)({sampleRate:48000}); await ctx.resume();

  source=ctx.createMediaStreamSource(stream);
  splitter=ctx.createChannelSplitter(2);
  a1=ctx.createAnalyser(); a2=ctx.createAnalyser(); a1.fftSize=a2.fftSize=2048;
  source.connect(splitter); splitter.connect(a1,0); splitter.connect(a2,1);

  const t=stream.getAudioTracks()[0], s=t.getSettings(), cap=t.getCapabilities?t.getCapabilities():{};
  $("status").innerHTML=`<span class="ok">Actif :</span> ${t.label}<br>AudioContext ${ctx.sampleRate} Hz — Web Audio canaux: ${source.channelCount}`;
  const ds=await listDevices();
  $("diag").textContent=
`User agent:
${navigator.userAgent}

Track: ${t.label}

Settings:
${JSON.stringify(s,null,2)}

Capabilities:
${JSON.stringify(cap,null,2)}

Web Audio:
sampleRate=${ctx.sampleRate}
source.channelCount=${source.channelCount}
mode=${source.channelCountMode}
interpretation=${source.channelInterpretation}

Entrées:
${ds.map((d,i)=>`${i+1}. ${d.label}`).join("\n")}`;

  ["rec","testDeus","testMic"].forEach(id=>$(id).disabled=false);
  draw();
}

$("start").onclick=()=>openInput().catch(e=>$("status").textContent=`Erreur ${e.name}: ${e.message}`);
$("use").onclick=()=>openInput($("devices").value).catch(e=>$("status").textContent=`Erreur ${e.name}: ${e.message}`);

async function runChannelTest(kind){
  const btn=kind==="deus"?$("testDeus"):$("testMic");
  $("testDeus").disabled=$("testMic").disabled=true;
  $("testResult").textContent=`Test ${kind==="deus"?"DEUS":"micro"} : produis le son maintenant…`;
  const samples=[];
  const start=performance.now();
  await new Promise(resolve=>{
    const grab=()=>{
      samples.push([lastR1,lastR2]);
      if(performance.now()-start<3000) requestAnimationFrame(grab); else resolve();
    }; grab();
  });
  const avg1=samples.reduce((a,v)=>a+v[0],0)/samples.length;
  const avg2=samples.reduce((a,v)=>a+v[1],0)/samples.length;
  const ratio=(Math.max(avg1,avg2)+1e-6)/(Math.min(avg1,avg2)+1e-6);
  const winner=avg1>avg2?1:2;
  $("testResult").textContent=`${kind==="deus"?"DEUS":"Micro"} : canal ${winner} dominant — moyennes C1=${avg1.toFixed(4)}, C2=${avg2.toFixed(4)}, ratio ${ratio.toFixed(1)}×`;
  if(ratio>=2){
    $(`label${winner}`).textContent=kind==="deus"?"DEUS":"MICRO";
  } else {
    $("testResult").textContent+=" — séparation faible, à retester.";
  }
  $("testDeus").disabled=$("testMic").disabled=false;
}
$("testDeus").onclick=()=>runChannelTest("deus");
$("testMic").onclick=()=>runChannelTest("mic");

function wavBlobFromChannel(audioBuffer, channelIndex){
  const samples=audioBuffer.getChannelData(channelIndex);
  const rate=audioBuffer.sampleRate, bytes=44+samples.length*2;
  const ab=new ArrayBuffer(bytes), v=new DataView(ab);
  const w=(o,s)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i))};
  w(0,"RIFF"); v.setUint32(4,36+samples.length*2,true); w(8,"WAVE"); w(12,"fmt ");
  v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,1,true);
  v.setUint32(24,rate,true); v.setUint32(28,rate*2,true); v.setUint16(32,2,true); v.setUint16(34,16,true);
  w(36,"data"); v.setUint32(40,samples.length*2,true);
  let o=44; for(let i=0;i<samples.length;i++){let s=Math.max(-1,Math.min(1,samples[i]));v.setInt16(o,s<0?s*0x8000:s*0x7fff,true);o+=2}
  return new Blob([ab],{type:"audio/wav"});
}

async function prepareExports(blob){
  originalBlob=blob;
  const originalURL=URL.createObjectURL(blob);
  $("downloadOriginal").href=originalURL;
  try{
    const ab=await blob.arrayBuffer();
    const decodeCtx=new (window.AudioContext||window.webkitAudioContext)();
    const audioBuffer=await decodeCtx.decodeAudioData(ab.slice(0));
    ch1Blob=wavBlobFromChannel(audioBuffer,0);
    ch2Blob=wavBlobFromChannel(audioBuffer,Math.min(1,audioBuffer.numberOfChannels-1));
    $("downloadCh1").href=URL.createObjectURL(ch1Blob);
    $("downloadCh2").href=URL.createObjectURL(ch2Blob);
    $("exports").style.display="block";
    $("recstatus").textContent+=` — décodé ${audioBuffer.numberOfChannels} canal(aux)`;
    await decodeCtx.close();
  }catch(e){
    $("exports").style.display="block";
    $("downloadCh1").style.display=$("downloadCh2").style.display="none";
    $("recstatus").textContent+=` — export WAV impossible: ${e.name}`;
  }
}

$("rec").onclick=()=>{
  try{
    chunks=[];
    const candidates=["audio/mp4;codecs=mp4a.40.2","audio/mp4","audio/webm;codecs=opus","audio/webm"];
    const mime=candidates.find(x=>MediaRecorder.isTypeSupported(x)), opts=mime?{mimeType:mime}:{};
    recorder=new MediaRecorder(stream,opts);
    recorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data)};
    recorder.onerror=e=>$("recstatus").textContent="Erreur MediaRecorder: "+(e.error?.message||e.error?.name||"inconnue");
    recorder.onstop=async()=>{
      clearTimeout(timer);
      const type=recorder.mimeType||chunks[0]?.type||"audio/mp4";
      const b=new Blob(chunks,{type});
      $("play").src=URL.createObjectURL(b);
      $("recstatus").textContent=`OK — ${Math.round(b.size/1024)} Ko — ${type}`;
      $("rec").disabled=false;$("stop").disabled=true;
      await prepareExports(b);
    };
    recorder.start(250);
    $("recstatus").textContent="Enregistrement…";
    $("exports").style.display="none";
    $("rec").disabled=true;$("stop").disabled=false;
    timer=setTimeout(()=>recorder.state!=="inactive"&&recorder.stop(),10000);
  }catch(e){$("recstatus").textContent=`Erreur ${e.name}: ${e.message}`}
};

$("stop").onclick=()=>recorder&&recorder.state!=="inactive"&&recorder.stop();

$("shareOriginal").onclick=async()=>{
  if(!originalBlob)return;
  const file=new File([originalBlob],"detector-ai-test.m4a",{type:originalBlob.type||"audio/mp4"});
  try{
    if(navigator.canShare?.({files:[file]})){
      await navigator.share({title:"Detector AI Audio Test",files:[file]});
    }else{
      $("recstatus").textContent+=" — partage fichier non disponible, utilise Télécharger l’original.";
    }
  }catch(e){
    if(e.name!=="AbortError")$("recstatus").textContent+=` — partage: ${e.name}`;
  }
};
