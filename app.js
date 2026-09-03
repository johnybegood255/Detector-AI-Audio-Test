let stream,ctx,analyser,src,raf,recorder,chunks=[];
const $=id=>document.getElementById(id);
async function list(){
 const ds=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==="audioinput");
 $("devices").innerHTML="";
 ds.forEach((d,i)=>{let o=document.createElement("option");o.value=d.deviceId;o.textContent=d.label||`Entrée audio ${i+1}`;$("devices").appendChild(o)});
 $("diag").textContent=`User agent:\n${navigator.userAgent}\n\nEntrées audio:\n`+ds.map((d,i)=>`${i+1}. ${d.label||"(sans nom)"}\n   id: ${d.deviceId}`).join("\n");
}
async function open(deviceId){
 if(stream) stream.getTracks().forEach(t=>t.stop());
 const audio=deviceId?{deviceId:{exact:deviceId},echoCancellation:false,noiseSuppression:false,autoGainControl:false}:{echoCancellation:false,noiseSuppression:false,autoGainControl:false};
 stream=await navigator.mediaDevices.getUserMedia({audio});
 const track=stream.getAudioTracks()[0], s=track.getSettings();
 $("status").innerHTML=`<span class="ok">Actif :</span> ${track.label||"entrée sans nom"}<br>Canaux: ${s.channelCount??"?"} — fréquence: ${s.sampleRate??"?"} Hz`;
 ctx=new (window.AudioContext||window.webkitAudioContext)();
 analyser=ctx.createAnalyser(); analyser.fftSize=2048;
 src=ctx.createMediaStreamSource(stream); src.connect(analyser);
 $("rec").disabled=false; draw();
}
$("start").onclick=async()=>{try{await open();await list()}catch(e){$("status").textContent="Erreur : "+e.message}};
$("use").onclick=async()=>{try{await open($("devices").value)}catch(e){$("status").textContent="Erreur : "+e.message}};
$("threshold").oninput=e=>$("thr").textContent=e.target.value;
function draw(){
 cancelAnimationFrame(raf); const a=new Float32Array(analyser.fftSize), c=$("scope"),g=c.getContext("2d");
 const loop=()=>{analyser.getFloatTimeDomainData(a);let sum=0,pk=0;for(let x of a){sum+=x*x;pk=Math.max(pk,Math.abs(x))}
 let rms=Math.sqrt(sum/a.length);$("rms").textContent=rms.toFixed(4);$("peak").textContent=pk.toFixed(4);
 $("bar").style.width=Math.min(100,rms*500)+"%";
 let th=+$("threshold").value;$("detect").textContent=rms>th?"⚡ Signal audio détecté":"Aucun signal détecté.";
 g.clearRect(0,0,c.width,c.height);g.beginPath();for(let i=0;i<a.length;i++){let x=i/(a.length-1)*c.width,y=(.5-a[i]*.45)*c.height;i?g.lineTo(x,y):g.moveTo(x,y)}g.strokeStyle="#eee";g.stroke();
 raf=requestAnimationFrame(loop)};loop()
}
$("rec").onclick=()=>{
 chunks=[];let mime=MediaRecorder.isTypeSupported("audio/mp4")?"audio/mp4":"audio/webm";
 recorder=new MediaRecorder(stream,{mimeType:mime});recorder.ondataavailable=e=>chunks.push(e.data);
 recorder.onstop=()=>{$("play").src=URL.createObjectURL(new Blob(chunks,{type:mime}));$("rec").textContent="Enregistrer 10 s"};
 recorder.start();$("rec").textContent="Enregistrement…";setTimeout(()=>recorder.stop(),10000)
};
if("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
