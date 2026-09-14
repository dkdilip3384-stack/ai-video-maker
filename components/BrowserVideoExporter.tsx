'use client';

import { useState } from 'react';
import type { StoryboardProject } from '../lib/storyboard';
import { synthesizeZVoice, Z_VOICE_LABEL } from '../lib/voice/browserPiper';

type Props = { project: StoryboardProject; assets: File[] };
type LoadedMedia =
  | { kind: 'image'; element: HTMLImageElement; url: string }
  | { kind: 'video'; element: HTMLVideoElement; url: string };

function dimensions(format: string) {
  if (format === '16:9') return { width: 960, height: 540 };
  if (format === '1:1') return { width: 720, height: 720 };
  return { width: 540, height: 960 };
}

function clamp01(v: number) { return Math.max(0, Math.min(1, v)); }
function easeOut(v: number) { const t = clamp01(v); return 1 - Math.pow(1 - t, 3); }
function easeInOut(v: number) { const t = clamp01(v); return t < .5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2; }

function rr(ctx: CanvasRenderingContext2D, x:number,y:number,w:number,h:number,r:number) {
  ctx.beginPath(); ctx.roundRect(x,y,w,h,Math.min(r,w/2,h/2));
}

function wrap(ctx: CanvasRenderingContext2D, text:string, maxWidth:number, maxLines=2) {
  const words = text.split(/\s+/).filter(Boolean); const lines:string[]=[]; let line='';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line=word; if(lines.length>=maxLines) break; }
    else line=test;
  }
  if (line && lines.length<maxLines) lines.push(line);
  return lines;
}

async function loadMedia(files: File[]) {
  const chosen = files.filter(f => f.type.startsWith('image/') || f.type.startsWith('video/')).slice(0, 10);
  const out:LoadedMedia[]=[];
  for (const file of chosen) {
    const url=URL.createObjectURL(file);
    if (file.type.startsWith('video/')) {
      const v=document.createElement('video'); v.src=url; v.muted=true; v.loop=true; v.playsInline=true; v.preload='auto';
      await new Promise<void>(resolve=>{ const done=()=>resolve(); v.onloadeddata=done; v.onerror=done; setTimeout(done,3000); });
      if(v.videoWidth) out.push({kind:'video',element:v,url}); else URL.revokeObjectURL(url);
    } else {
      const img=new Image(); img.decoding='async';
      await new Promise<void>(resolve=>{ img.onload=()=>resolve(); img.onerror=()=>resolve(); img.src=url; });
      if(img.naturalWidth) out.push({kind:'image',element:img,url}); else URL.revokeObjectURL(url);
    }
  }
  return out;
}

function sizeOf(m:LoadedMedia){ return m.kind==='video'?{w:m.element.videoWidth,h:m.element.videoHeight}:{w:m.element.naturalWidth,h:m.element.naturalHeight}; }
function drawCover(ctx:CanvasRenderingContext2D,m:LoadedMedia,x:number,y:number,w:number,h:number,p:number,zoom=.08){
  const s=sizeOf(m); if(!s.w||!s.h)return; const scale=Math.max(w/s.w,h/s.h)*(1.02+easeInOut(p)*zoom);
  const dw=s.w*scale, dh=s.h*scale; const px=(p-.5)*w*.08, py=(.5-p)*h*.04;
  ctx.drawImage(m.element,x+(w-dw)/2+px,y+(h-dh)/2+py,dw,dh);
}

function drawPhone(ctx:CanvasRenderingContext2D,m:LoadedMedia,cx:number,cy:number,pw:number,ph:number,p:number,index:number){
  const enter=easeOut(Math.min(1,p*4)); const exit=easeInOut(Math.max(0,(p-.86)/.14)); const dir=index%2?1:-1;
  ctx.save(); ctx.translate(cx+dir*(1-enter)*pw*.8,cy); ctx.rotate(dir*((1-enter)*.10-p*.018)); ctx.scale(.78+enter*.22-exit*.06,.78+enter*.22-exit*.06);
  ctx.shadowColor='rgba(0,0,0,.55)';ctx.shadowBlur=pw*.12;ctx.shadowOffsetY=pw*.05;ctx.fillStyle='#05070d';rr(ctx,-pw/2,-ph/2,pw,ph,pw*.11);ctx.fill();ctx.shadowColor='transparent';
  const b=pw*.034,sx=-pw/2+b,sy=-ph/2+b,sw=pw-b*2,sh=ph-b*2;ctx.save();rr(ctx,sx,sy,sw,sh,pw*.08);ctx.clip();ctx.fillStyle='#111622';ctx.fillRect(sx,sy,sw,sh);drawCover(ctx,m,sx,sy,sw,sh,p,.12);ctx.restore();
  ctx.fillStyle='rgba(255,255,255,.9)';rr(ctx,-pw*.13,-ph/2+pw*.05,pw*.26,pw*.035,pw*.02);ctx.fill();
  if(p>.18&&p<.84){const t=(p*3.4)%1, pulse=1-t,px=pw*(index%2?.14:-.12),py=ph*(index%3===0?.08:-.06);ctx.strokeStyle=`rgba(135,154,255,${.8*pulse})`;ctx.lineWidth=Math.max(2,pw*.012);ctx.beginPath();ctx.arc(px,py,pw*(.035+t*.11),0,Math.PI*2);ctx.stroke();ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(px,py,pw*.02,0,Math.PI*2);ctx.fill();}
  ctx.restore();
}

export default function BrowserVideoExporter({project,assets}:Props){
  const [exporting,setExporting]=useState(false);
  const [status,setStatus]=useState('');

  async function exportVideo(){
    if(exporting)return;
    if(typeof MediaRecorder==='undefined'){setStatus('Chrome browser-ல் try பண்ணுங்க.');return;}
    if(!assets.length){setStatus('Logo / screenshots / screen recording add பண்ணுங்க.');return;}

    setExporting(true);
    setStatus('Visual assets prepare ஆகுது…');
    let media:LoadedMedia[]=[];
    let audioContext:AudioContext|null=null;
    let voiceSource:AudioBufferSourceNode|null=null;

    try{
      const {width,height}=dimensions(project.format);
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
      const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas unavailable.');
      media=await loadMedia(assets);if(!media.length)throw new Error('Selected visual assets could not be loaded.');
      await Promise.all(media.filter(m=>m.kind==='video').map(async m=>{try{await m.element.play();}catch{}}));

      const canvasStream=canvas.captureStream(30);
      const outputStream=new MediaStream(canvasStream.getVideoTracks());

      const narrationScript=project.scenes
        .map(scene=>scene.narration.trim())
        .filter(Boolean)
        .join(' ... ');

      setStatus(`${Z_VOICE_LABEL} prepare ஆகுது… first time model download ஆகலாம்.`);
      audioContext=new AudioContext();
      await audioContext.resume();
      const voiceBlob=await synthesizeZVoice(narrationScript, progress=>{
        const pct=progress.total?Math.round(progress.loaded*100/progress.total):0;
        setStatus(pct?`Z Voice model download… ${pct}%`:'Z Voice model download ஆகுது…');
      });
      const voiceBuffer=await audioContext.decodeAudioData(await voiceBlob.arrayBuffer());
      const destination=audioContext.createMediaStreamDestination();
      const gain=audioContext.createGain();
      gain.gain.value=1.18;
      voiceSource=audioContext.createBufferSource();
      voiceSource.buffer=voiceBuffer;
      voiceSource.connect(gain);
      gain.connect(destination);
      destination.stream.getAudioTracks().forEach(track=>outputStream.addTrack(track));

      const mime=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(t=>MediaRecorder.isTypeSupported(t))||'';
      const recorder=new MediaRecorder(outputStream,mime?{mimeType:mime,videoBitsPerSecond:7_000_000,audioBitsPerSecond:160_000}:undefined);
      const chunks:BlobPart[]=[];
      recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
      const done=new Promise<void>((resolve,reject)=>{recorder.onstop=()=>resolve();recorder.onerror=()=>reject(new Error('Export failed.'));});

      recorder.start(500);
      voiceSource.start(0);
      const totalMs=Math.max(1000,project.totalDuration*1000),start=performance.now();

      await new Promise<void>(resolve=>{const render=()=>{
        const elapsed=Math.min(totalMs,performance.now()-start),sec=elapsed/1000;
        let cursor=0,scene=project.scenes[project.scenes.length-1],sp=1;
        for(const s of project.scenes){if(sec<cursor+s.duration){scene=s;sp=clamp01((sec-cursor)/Math.max(.1,s.duration));break;}cursor+=s.duration;}
        const overall=elapsed/totalMs,current=media[(scene.order-1)%media.length],next=media[scene.order%media.length],tr=easeInOut(Math.max(0,(sp-.87)/.13));
        ctx.fillStyle='#070b16';ctx.fillRect(0,0,width,height);
        ctx.save();ctx.globalAlpha=.34*(1-tr);ctx.filter=`blur(${Math.max(12,width*.03)}px) saturate(1.2)`;drawCover(ctx,current,-width*.08,-height*.08,width*1.16,height*1.16,sp,.15);ctx.restore();
        if(tr&&next){ctx.save();ctx.globalAlpha=.30*tr;ctx.filter=`blur(${Math.max(12,width*.03)}px)`;drawCover(ctx,next,-width*.08,-height*.08,width*1.16,height*1.16,tr,.10);ctx.restore();}
        const grad=ctx.createLinearGradient(0,0,0,height);grad.addColorStop(0,'rgba(5,8,18,.12)');grad.addColorStop(.58,'rgba(5,8,18,.04)');grad.addColorStop(1,'rgba(5,8,18,.82)');ctx.fillStyle=grad;ctx.fillRect(0,0,width,height);
        const portrait=height>=width,pw=portrait?width*.56:height*.34,ph=pw*2.02,cx=portrait?width*.52:width*.66,cy=portrait?height*.43:height*.52;drawPhone(ctx,current,cx,cy,pw,ph,sp,scene.order);
        const enter=easeOut(Math.min(1,sp*5)),exit=easeInOut(Math.max(0,(sp-.83)/.17)),alpha=enter*(1-exit),margin=width*.07,ty=portrait?height*.77:height*.46;
        ctx.save();ctx.globalAlpha=alpha;ctx.translate((1-enter)*-width*.07,0);ctx.fillStyle='rgba(186,196,255,.95)';ctx.font=`700 ${Math.max(13,Math.round(width*.028))}px Arial`;ctx.fillText(`0${scene.order} / 0${project.scenes.length}`,margin,ty-width*.05);ctx.fillStyle='#fff';ctx.font=`800 ${Math.max(27,Math.round(width*(portrait?.073:.052)))}px Arial`;const lines=wrap(ctx,scene.onScreenText||scene.title,portrait?width*.86:width*.42,2);lines.forEach((l,i)=>ctx.fillText(l,margin,ty+i*width*.082));ctx.restore();
        ctx.fillStyle='rgba(255,255,255,.16)';ctx.fillRect(margin,height-height*.032,width-margin*2,Math.max(4,height*.0045));ctx.fillStyle='#aebaff';ctx.fillRect(margin,height-height*.032,(width-margin*2)*overall,Math.max(4,height*.0045));
        setStatus(`Professional promo render… ${Math.round(overall*100)}% • Z Voice included`);
        if(elapsed>=totalMs){resolve();return;}requestAnimationFrame(render);
      };requestAnimationFrame(render);});

      try{voiceSource.stop();}catch{}
      recorder.stop();
      await done;
      const blob=new Blob(chunks,{type:mime||'video/webm'});
      const url=URL.createObjectURL(blob);
      const anchor=document.createElement('a');anchor.href=url;anchor.download=`ai-promo-z-voice-${Date.now()}.webm`;anchor.click();
      setTimeout(()=>URL.revokeObjectURL(url),30000);
      setStatus('Promo exported successfully • automatic Tamil Z Voice included.');
    }catch(e){
      setStatus(e instanceof Error?`Export error: ${e.message}`:'Export failed.');
    }finally{
      media.forEach(m=>URL.revokeObjectURL(m.url));
      if(audioContext)audioContext.close().catch(()=>{});
      setExporting(false);
    }
  }

  return <div className="browserExportBox">
    <div>
      <strong>Professional app promo + Auto Z Voice</strong>
      <p>Phone motion, UI zoom/pan, tap highlight, clean transitions. Narration தானாக உருவாகி bold Tamil male Z Voice-ல் final videoக்குள் வரும்.</p>
      <small>First export மட்டும் voice model download ஆகும்; பிறகு browser cache-ல் reuse ஆகும்.</small>
    </div>
    <button className="secondary" type="button" disabled={exporting} onClick={exportVideo}>{exporting?'Rendering + Voice…':'Export Promo with Auto Z Voice'}</button>
    {status&&<div className="generationStatus">{status}</div>}
  </div>;
}
