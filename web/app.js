import {Simulation,CONFIG} from './simulation.js?v=cluster-spacing';
const $=id=>document.getElementById(id);
const ns='http://www.w3.org/2000/svg';
const svg=(tag,attrs={},parent)=>{const el=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))el.setAttribute(k,v);if(parent)parent.append(el);return el;};
let sourceTouched=false;
let dataset=null,sim=new Simulation(),selected=sim.nodes[0].id,playing=true,speed=4,lastStep=performance.now(),lastFrame=0,initial=null;
const nodeEls=new Map(),linkEls=new Map(),packetEls=new Map();
let gateway=sim.gateway;
const format=(n,d=0)=>n.toLocaleString(undefined,{minimumFractionDigits:d,maximumFractionDigits:d});
function buildMap(){
 gateway=sim.gateway;
 const root=$('network');root.replaceChildren();nodeEls.clear();linkEls.clear();packetEls.clear();
 const defs=svg('defs',{},root),pattern=svg('pattern',{id:'grid',width:20,height:20,patternUnits:'userSpaceOnUse'},defs);svg('circle',{cx:1,cy:1,r:.65,fill:'#eaf0ec'},pattern);svg('rect',{width:800,height:630,fill:'url(#grid)'},root);
 for(const {id,x,y,rx,ry} of sim.clusters){
  svg('ellipse',{cx:x,cy:y,rx,ry,fill:'#f7faf7','fill-opacity':'.6',stroke:'#e6eee7','stroke-dasharray':'4 6'},root);
  const label=svg('text',{x:x-rx*.6,y:y-ry+15,class:'cluster-label'},root);label.textContent=`CLUSTER ${id}`;
 }
 const ranges=svg('g',{id:'ranges',display:$('range').checked?'block':'none'},root);
 for(const n of sim.nodes)svg('circle',{cx:n.x,cy:n.y,r:CONFIG.bleRange,fill:'#5c9c76','fill-opacity':'.012',stroke:'#80b496','stroke-opacity':'.18','stroke-dasharray':'3 7'},ranges);
 const links=svg('g',{},root),packets=svg('g',{},root);
 for(const n of sim.nodes){linkEls.set(n.id,svg('line',{x1:n.x,y1:n.y,x2:gateway.x,y2:gateway.y,class:'link',stroke:'#e2d4bd','stroke-width':1.1},links));packetEls.set(n.id,svg('circle',{r:3,fill:'#cc913c',opacity:0},packets));}
 for(const n of sim.nodes){const g=svg('g',{class:`node${n.id===selected?' selected':''}`,tabindex:0,role:'button','aria-label':`Inspect camera ${n.id}`,transform:`translate(${n.x} ${n.y})`},root);
  const halo=svg('circle',{r:25,fill:'#d7ae68',opacity:0},g);
  svg('circle',{r:16,class:'node-body'},g);svg('rect',{x:-7,y:-4,width:14,height:10,rx:2,fill:'none',stroke:'#658872','stroke-width':1.4},g);svg('circle',{cx:0,cy:1,r:2.6,fill:'none',stroke:'#658872','stroke-width':1.2},g);svg('path',{d:'M-4 -4 L-2 -7 L3 -7 L5 -4',fill:'none',stroke:'#658872','stroke-width':1.2},g);
  const label=svg('text',{y:32,'text-anchor':'middle',class:'node-label'},g);label.textContent=n.id;
  g.addEventListener('click',()=>selectNode(n.id));g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectNode(n.id);}});const countLabel=svg('text',{y:46,'text-anchor':'middle',class:'count-label'},g);nodeEls.set(n.id,{g,halo,countLabel});
 }
 const gw=svg('g',{transform:`translate(${gateway.x} ${gateway.y})`},root);
 svg('circle',{r:44,fill:'#edf5ef','fill-opacity':'.9'},gw);svg('rect',{x:-26,y:-26,width:52,height:52,rx:15,fill:'#2e654b',stroke:'#fff','stroke-width':4},gw);
 svg('path',{d:'M0 13 V-8 M-8 13 H8 M-7 3 H7 M-4 -10 Q0 -15 4 -10 M-10 -14 Q0 -23 10 -14',stroke:'#d6ebdc','stroke-width':2,fill:'none','stroke-linecap':'round'},gw);
 const title=svg('text',{y:60,'text-anchor':'middle',class:'gateway-title'},gw);title.textContent='Central gateway';
 const sub=svg('text',{y:75,'text-anchor':'middle',class:'gateway-subtitle'},gw);sub.textContent='LoRa receiver';
}
function selectNode(id){selected=id;for(const[nid,{g}]of nodeEls)g.classList.toggle('selected',nid===id);renderInspector(true);drawHeatmap();}
let lastImage=null,lastPreviewTime=0;
const monthName=month=>month?new Date(`${month}-01T12:00:00Z`).toLocaleDateString(undefined,{year:'numeric',month:'long',timeZone:'UTC'}):'Before playback';
function heatColor(count){
 if(!count)return '#edf0ed';
 const t=Math.min(1,Math.log1p(count)/Math.log1p(sim.peakCount));
 const colors=[[250,234,168],[238,173,73],[209,101,46],[162,54,67],[89,38,79]];
 const pos=t*(colors.length-1),i=Math.min(colors.length-2,Math.floor(pos)),f=pos-i;
 return `rgb(${colors[i].map((v,k)=>Math.round(v+(colors[i+1][k]-v)*f)).join(',')})`;
}
function renderInspector(force=false){
 const n=sim.nodes.find(n=>n.id===selected);if(!n)return;
 $('nodeName').textContent=`Camera ${n.id}`;$('quality').textContent=`${format(n.quality*100,1)}%`;
 $('batteryLabel').textContent=sim.historical?'Cumulative modeled energy':'Battery remaining';
 $('battery').textContent=sim.historical?`${format(n.totalEnergy/1000,2)} kJ`:`${format(n.battery/CONFIG.batteryJ*100,1)}%`;
 $('batteryTrack').hidden=sim.historical;$('batteryFill').style.width=`${n.battery/CONFIG.batteryJ*100}%`;
 $('nodeCountLabel').textContent=sim.historical?'Images this month':'Reports this step';$('nodeCount').textContent=format(n.count);
 $('observationHeading').textContent=sim.historical?'LATEST SAMPLE IN THIS MONTH':'LATEST OBSERVATION';
 const event=n.latest;$('species').textContent=event?.species||(sim.historical?'No recorded images this month':'Waiting for first frame');
 $('observationTime').textContent=event?event.timestamp.replace('T',' · ').replace('.000Z',' UTC'):'—';
 $('provenance').textContent=event?(sim.historical?`Representative image · source ID ${event.sourceId}`:`${event.source} · ${event.bytes.toLocaleString()} modeled bytes`):(sim.historical?'No records does not establish whether the camera was operating.':'Full image + time, node and provenance');
 const file=event?.sourceFile;
 if(!file){$('preview').hidden=true;lastImage=null;}
 else if(file!==lastImage&&(force||performance.now()-lastPreviewTime>1000)){
  lastImage=file;lastPreviewTime=performance.now();$('preview').hidden=false;$('preview').src=`/api/image?file=${encodeURIComponent(file)}`;
 }else if(file!==lastImage){$('preview').hidden=true;}
 else $('preview').hidden=false;
}
$('preview').addEventListener('error',()=>{$('preview').hidden=true;});
function chart(id,key,color){
 const el=$(id);el.replaceChildren();const rows=sim.historical?sim.history:sim.history.slice(-160);if(!rows.length)return;
 const maximum=sim.historical?(sim.peakCosts[key]||1):(initial?.[key]||1)*1.2;
 const points=rows.map((r,i)=>`${i/(sim.historical?Math.max(1,sim.maxTicks-1):159)*500},${40-r[key]/maximum*32}`).join(' ');
 svg('polyline',{points,fill:'none',stroke:color,'stroke-width':1.7,'stroke-linejoin':'round'},el);
}
function render(){
 const historical=sim.historical,m=historical?sim.history.at(-1):sim.rolling();
 $('timelinePanel').hidden=!historical;$('historyPanel').hidden=!historical;
 $('stepLabel').textContent=historical?`MONTH ${String(sim.tick).padStart(3,'0')}`:`STEP ${String(sim.tick).padStart(3,'0')}`;
 $('stepLimit').textContent=`/ ${sim.maxTicks}`;$('reports').textContent=format(sim.total.reports);
 $('elapsedLabel').textContent=historical?'Historical month':'Simulated elapsed';$('elapsed').textContent=historical?(sim.month||'—'):`${Math.floor(sim.tick/60)} h ${sim.tick%60} min`;
 $('activeCount').textContent=historical?sim.nodes.filter(n=>n.count>0).length:sim.nodes.filter(n=>!n.dead).length;
 $('activeCaption').textContent=historical?'cameras with records this month':'active cameras';
 $('networkSubtitle').textContent=historical?`${monthName(sim.month)} · color = images / camera / month`:`${sim.nodes.length} camera nodes · ${sim.clusters.length} illustrative clusters`;
 $('totalBattery').textContent=historical?format(m?.reports||0):`${format(sim.nodes.reduce((a,n)=>a+n.battery,0)/(sim.nodes.length*CONFIG.batteryJ)*100,1)}%`;
 $('capacityLabel').textContent=historical?'Images this month':'Battery capacity remaining';
 $('totalAirtime').textContent=`${format(sim.total.airtime)} s`;$('totalEnergy').textContent=`${format(sim.total.energy,1)} J`;$('totalBytes').textContent=`${format(sim.total.bytes/1e6,2)} MB`;
 $('airtimeUnit').textContent=historical?'radio s / month':'radio s / step';$('energyUnit').textContent=historical?'J / month':'J / step';
 document.querySelectorAll('.costPeriod').forEach(e=>e.textContent=historical?'Whole network · current calendar month':'Whole network · 12-step average');
 document.querySelectorAll('.baseline-mark').forEach(e=>e.hidden=historical);
 for(const key of ['airtime','energy']){
  const v=m?.[key]||0,ref=historical?sim.peakCosts[key]:initial?.[key],ratio=ref?v/ref:0;
  $(key).textContent=format(v,historical?0:key==='energy'?2:1);$(key+'Bar').style.width=`${Math.min(100,ratio/(historical?1:1.2)*100)}%`;
  $(key+'Relative').textContent=historical?`${format(ratio*100)}% of historical peak`:initial?`${format(ratio*100)}% of initial baseline`:'Waiting for first step';
  chart(key+'Chart',key,key==='energy'?'#5a9170':'#c89549');
 }
 for(const n of sim.nodes){
  const strength=Math.log1p(n.count)/Math.log1p(sim.peakCount),color=heatColor(n.count),line=linkEls.get(n.id),els=nodeEls.get(n.id);
  line.setAttribute('stroke',color);line.setAttribute('stroke-width',n.count?1+strength*4:.7);line.setAttribute('opacity',n.count?.3+strength*.65:.3);
  els.halo.setAttribute('fill',color);els.halo.setAttribute('r',22+strength*17);els.halo.setAttribute('opacity',n.count?.16+strength*.25:0);
  els.g.querySelector('.node-body').style.fill=n.count?color:'#f6f8f6';
  els.g.querySelectorAll('rect,path,circle:not(.node-body)').forEach(e=>{if(e!==els.halo)e.setAttribute('stroke',strength>.5&&n.count?'#fff':'#658872');});
  els.countLabel.textContent=historical?format(n.count):'';packetEls.get(n.id).setAttribute('fill',color);
  els.g.setAttribute('aria-label',`Inspect camera ${n.id}, ${n.count} images ${historical?'this month':'this step'}`);
 }
 if(historical){
  $('historicalDate').textContent=monthName(sim.month);$('monthReports').textContent=format(m?.reports||0);
  const busiest=[...sim.nodes].sort((a,b)=>b.count-a.count)[0];$('busyCamera').textContent=busiest.count?`${busiest.id} · ${format(busiest.count)}`:'No records';
  $('timeCompression').textContent=`${speed} month${speed===1?'':'s'} / second`;$('timeline').max=sim.maxTicks;$('timeline').value=sim.tick;
  $('dateRange').textContent=`${dataset.months[0]} → ${dataset.months.at(-1)}`;
  $('heatScaleLabel').textContent=`0 → ${format(sim.peakCount)} images / month`;
  $('historySummary').textContent=`Full recorded history · ${format(dataset.totalImages)} unique images · ${sim.nodes.length} cameras · ${sim.maxTicks} months. Gray = no records. Full-history colors stay comparable as playback moves.`;
 }
 $('footerMode').textContent=historical?'JRBP recorded counts · 1 frame = 1 calendar month · Modeled radio costs':'Seed 42 · 1 step = 1 simulated minute · Modeled costs';
 for(const option of $('speed').options)option.textContent=`${option.value} ${historical?'months':'steps'}/s`;
 renderInspector();drawHeatmap();
}
let heatGeometry=null;
function drawHeatmap(){
 if(!sim.historical)return;
 const canvas=$('historyHeatmap'),width=canvas.parentElement.clientWidth,height=sim.nodes.length*16+38,dpr=window.devicePixelRatio||1;
 canvas.style.height=`${height}px`;canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
 const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);const left=44,top=28,cw=(width-left-8)/sim.maxTicks,rh=16;
 heatGeometry={left,top,cw,rh};ctx.font='10px system-ui';ctx.textBaseline='middle';
 sim.nodes.forEach((n,row)=>{
  const y=top+row*rh;ctx.fillStyle=n.id===selected?'#285e47':'#7b8980';ctx.fillText(n.id,2,y+6);
  for(let col=0;col<sim.maxTicks;col++){ctx.fillStyle=heatColor(n.bins.get(dataset.months[col])?.count||0);ctx.fillRect(left+col*cw,y,Math.max(.5,cw-.7),rh-2);}
  if(n.id===selected){ctx.strokeStyle='#315d46';ctx.lineWidth=1;ctx.strokeRect(left-2,y-1,width-left-5,rh-1);}
 });
 let previousX=-100;
 dataset.months.forEach((month,col)=>{const x=left+col*cw;if((month.endsWith('-01')||col===0)&&x-previousX>45){ctx.fillStyle='#7d8e81';ctx.fillText(month.slice(0,4),x,12);previousX=x;}});
 if(sim.tick){const x=left+(sim.tick-1)*cw;ctx.strokeStyle='#1b3f30';ctx.lineWidth=2;ctx.strokeRect(x-1,top-3,cw+1,sim.nodes.length*rh+4);ctx.fillStyle='#1b3f30';ctx.beginPath();ctx.moveTo(x+cw/2,top-4);ctx.lineTo(x+cw/2-4,top-10);ctx.lineTo(x+cw/2+4,top-10);ctx.fill();}
}
function heatCell(e){if(!heatGeometry)return null;const rect=$('historyHeatmap').getBoundingClientRect(),{left,top,cw,rh}=heatGeometry;
 const col=Math.floor((e.clientX-rect.left-left)/cw),row=Math.floor((e.clientY-rect.top-top)/rh);
 return col>=0&&col<sim.maxTicks&&row>=0&&row<sim.nodes.length?{col,row,x:e.clientX-rect.left,y:e.clientY-rect.top}:null;
}
$('historyHeatmap').addEventListener('mousemove',e=>{const cell=heatCell(e),tip=$('heatTooltip');tip.hidden=!cell;if(!cell)return;
 const n=sim.nodes[cell.row],month=dataset.months[cell.col];tip.textContent=`${n.id} · ${monthName(month)} · ${format(n.bins.get(month)?.count||0)} images`;
 tip.style.left=`${Math.min(cell.x+12,Math.max(0,$('historyHeatmap').clientWidth-260))}px`;tip.style.top=`${cell.y+20}px`;
});
$('historyHeatmap').addEventListener('mouseleave',()=>{$('heatTooltip').hidden=true;});
$('historyHeatmap').addEventListener('click',e=>{const cell=heatCell(e);if(cell){const id=sim.nodes[cell.row].id;seek(cell.col+1);selectNode(id);}});
function updatePlay(){$('play').textContent=playing?'Ⅱ Pause':sim.tick>=sim.maxTicks?'↺ Replay':'▶ Play';}
function advance(){const m=sim.step();if(m&&!initial)initial=m;if(sim.tick>=sim.maxTicks){playing=false;updatePlay();}render();}
function reset(){sim=new Simulation({dataset:$('source').value==='jrbp'?dataset:null});selected=sim.nodes[0].id;initial=null;lastImage=null;lastStep=performance.now();buildMap();render();updatePlay();}
function seek(tick){playing=false;const id=selected;sim=new Simulation({dataset});initial=null;for(let i=0;i<tick;i++)sim.step();selected=id;lastImage=null;lastStep=performance.now();buildMap();render();renderInspector(true);updatePlay();}
$('timeline').addEventListener('input',()=>seek(Number($('timeline').value)));
$('play').addEventListener('click',()=>{sourceTouched=true;if(sim.tick>=sim.maxTicks){playing=true;reset();}else{playing=!playing;lastStep=performance.now();}updatePlay();if(!playing)renderInspector(true);});
$('step').addEventListener('click',()=>{sourceTouched=true;playing=false;updatePlay();advance();renderInspector(true);});
$('reset').addEventListener('click',()=>{sourceTouched=true;reset();});
$('speed').addEventListener('change',()=>{speed=Number($('speed').value);lastStep=performance.now();render();});
$('source').addEventListener('change',()=>{sourceTouched=true;reset();});
$('range').addEventListener('change',()=>document.getElementById('ranges').setAttribute('display',$('range').checked?'block':'none'));
$('export').addEventListener('click',()=>{
 const blob=new Blob([JSON.stringify({model:'Direct LoRa baseline',aggregation:sim.historical?'Calendar month × camera; representative image only':'Individual synthetic observations',seed:42,config:CONFIG,source:sim.historical?'JRBP full recorded history':'Synthetic',steps:sim.tick,totals:sim.total,history:sim.history,records:sim.ledger},null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`recurio-plus-traffic-${sim.tick}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
function frame(time){
 if(playing&&time-lastStep>=1000/speed){advance();lastStep=time;}
 if(time-lastFrame>=30){for(const[nindex,n]of sim.nodes.entries()){
  const p=packetEls.get(n.id),strength=Math.log1p(n.count)/Math.log1p(sim.peakCount),phase=(time/1800*(.4+strength*1.8)+nindex*.137)%1;
  p.setAttribute('cx',n.x+(gateway.x-n.x)*phase);p.setAttribute('cy',n.y+(gateway.y-n.y)*phase);p.setAttribute('r',2+strength*2);
  p.setAttribute('opacity',playing&&n.count&&!reduceMotion?.85:0);
 }lastFrame=time;}requestAnimationFrame(frame);
}
window.addEventListener('resize',drawHeatmap);
buildMap();render();requestAnimationFrame(frame);
fetch('/data/jrbp.json').then(r=>{if(!r.ok)throw Error('No dataset index');return r.json();}).then(data=>{
 if(data.schemaVersion!==2||!data.cameras?.length)throw Error('Rebuild index for full-history replay');dataset=data;
 const option=$('source').options[1];option.disabled=false;option.textContent=`JRBP history · ${data.months[0].slice(0,4)}–${data.months.at(-1).slice(0,4)}`;
 if(!sourceTouched){$('source').value='jrbp';reset();advance();}
}).catch(()=>{$('source').options[1].textContent='JRBP history · rebuild index';});
