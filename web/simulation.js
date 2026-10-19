/** Baseline simulation only. All live cameras send directly to the gateway. */
export const CONFIG = Object.freeze({imageBytes:6000, provenanceBytes:40, headerBytes:32,
  loraRate:5500, loraTxW:.12, captureJ:.006, batteryJ:3600, bleRange:150,
  secondsPerTick:60, maxTicks:600});
export function random(seed) {return ()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}
const centers=[[195,175],[570,150],[195,425],[590,425]];
const historicalCenters={A:[100,100],B:[365,150],C:[665,100],D:[105,320],E:[660,335],F:[165,530],G:[475,530]};
const cameraGroup=id=>id.match(/^[A-Za-z]+/)?.[0].toUpperCase()||id;
export class Simulation {
  constructor({seed=42,dataset=null}={}) {
    if(dataset&&dataset.schemaVersion!==2)throw new Error('Rebuild the JRBP index for historical schema version 2');
    this.rng=random(seed);this.dataset=dataset;this.tick=0;this.history=[];this.ledger=[];this.edges=[];
    this.total={energy:0,airtime:0,bytes:0,reports:0};
    this.historical=dataset?.schemaVersion===2;
    this.maxTicks=this.historical?dataset.months.length:CONFIG.maxTicks;
    this.month=null;
    const cameras=dataset?dataset.cameras.slice(0,24):Array.from({length:20},(_,i)=>({id:`${'ABCD'[Math.floor(i/5)]}${i%5+1}`}));
    const groups=[...new Set(cameras.map(c=>cameraGroup(c.id)))].sort();
    this.gateway=this.historical?{x:395,y:340}:{x:395,y:293};
    this.clusters=groups.map((id,i)=>{
      const members=cameras.filter(c=>cameraGroup(c.id)===id);
      const [x,y]=this.historical?(historicalCenters[id]||centers[i%centers.length]):centers[i%centers.length];
      return {id,x,y,members:members.map(c=>c.id),rx:this.historical?(members.length>6?145:96):119,
        ry:this.historical?(members.length>6?145:88):108};
    });
    this.nodes=cameras.map(camera=>{
      const group=this.clusters.find(c=>c.id===cameraGroup(camera.id)),members=group.members.length,index=group.members.indexOf(camera.id);
      let dx=0,dy=0;
      if(members>6){
        const cols=Math.ceil(Math.sqrt(members)),rows=Math.ceil(members/cols);
        const row=Math.floor(index/cols),inRow=Math.min(cols,members-row*cols);
        dx=(index%cols-(inRow-1)/2)*62;dy=(row-(rows-1)/2)*70-12;
      }else if(members>1){
        const angle=index/members*Math.PI*2-Math.PI/2;
        dx=Math.cos(angle)*(this.historical?47:70);dy=Math.sin(angle)*(this.historical?36:65)-8;
      }
      return {id:camera.id,cluster:group.id,x:group.x+dx,y:group.y+dy,
        battery:CONFIG.batteryJ,quality:.65+this.rng()*.33,energy:0,activity:0,latest:null,dead:false,
        bins:new Map((camera.bins||[]).map(b=>[b.month,b])),count:0,totalCount:0,totalEnergy:0};
    });
    this.peakCount=this.historical?Math.max(1,...cameras.flatMap(c=>c.bins.map(b=>b.count))):1;
    this.peakCosts={energy:0,airtime:0};
    if(this.historical)for(const month of dataset.months){
      let energy=0,airtime=0;
      for(const n of this.nodes){const count=n.bins.get(month)?.count||0,cost=this.reportCost(n);energy+=cost.energy*count;airtime+=cost.airtime*count;}
      this.peakCosts.energy=Math.max(this.peakCosts.energy,energy);this.peakCosts.airtime=Math.max(this.peakCosts.airtime,airtime);
    }
  }
  reportCost(node){const bytes=CONFIG.imageBytes+CONFIG.provenanceBytes+CONFIG.headerBytes;
    const airtime=bytes*8/CONFIG.loraRate/node.quality;
    return {bytes,airtime,energy:airtime*CONFIG.loraTxW+CONFIG.captureJ};}
  historicalStep(){
    if(this.tick>=this.maxTicks)return null;
    this.month=this.dataset.months[this.tick++];this.edges=[];
    const metric={tick:this.tick,month:this.month,energy:0,airtime:0,bytes:0,reports:0};
    for(const node of this.nodes){
      const bin=node.bins.get(this.month),count=bin?.count||0,cost=this.reportCost(node);
      node.count=count;node.energy=cost.energy*count;node.activity=count;
      node.totalCount+=count;node.totalEnergy+=node.energy;node.latest=null;
      if(!count)continue;
      // All recorded captures contribute. This multi-year replay accounts for energy;
      // it does not suppress historical data when a hypothetical battery runs out.
      const sample=bin.latest;
      node.latest={species:sample.species,timestamp:sample.timestamp,sourceFile:sample.file,sourceId:sample.id};
      const record={tick:this.tick,month:this.month,node:node.id,reportCount:count,
        location:{x:node.x,y:node.y,simulated:true},radio:'LoRa',destination:'gateway',encoding:'image',
        bytes:count*cost.bytes,expectedAirtimeSeconds:count*cost.airtime,energyJ:node.energy,
        representativeObservation:sample};
      this.ledger.push(record);
      this.edges.push({from:node.id,to:'gateway',radio:'LoRa',bytes:record.bytes,airtime:record.expectedAirtimeSeconds,energy:record.energyJ,count});
      metric.energy+=node.energy;metric.airtime+=record.expectedAirtimeSeconds;metric.bytes+=record.bytes;metric.reports+=count;
    }
    for(const key of Object.keys(this.total))this.total[key]+=metric[key];
    this.history.push(metric);return metric;
  }
  observation(node) {
    const species=['Black-tailed deer','Coyote','Wild turkey','Bobcat','Gray fox','Raccoon','Empty frame'];
    return {id:`synthetic-${this.tick}-${node.id}`,species:species[Math.floor(this.rng()*species.length)],
      timestamp:new Date(Date.UTC(2026,0,1,0,this.tick)).toISOString(),file:null,cycle:0,source:'Synthetic observation'};
  }
  step() {
    if(this.historical)return this.historicalStep();
    if(this.tick>=this.maxTicks)return null;
    this.tick++;this.edges=[];
    const m={tick:this.tick,energy:0,airtime:0,bytes:0,reports:0};
    for(const node of this.nodes){
      node.energy=0;node.activity=0;node.count=0;node.dead=node.battery<=0;
      if(node.dead)continue;
      const event=this.observation(node),bytes=CONFIG.imageBytes+CONFIG.provenanceBytes+CONFIG.headerBytes;
      // Expected retries are represented by 1 / link success probability; not sampled packets.
      const airtime=bytes*8/CONFIG.loraRate/node.quality,energy=airtime*CONFIG.loraTxW+CONFIG.captureJ;
      // Admit complete reports only, so the ledger never records an unpowered transmission.
      if(node.battery<energy){node.dead=true;continue;}
      node.battery-=energy;node.energy=energy;node.activity=1;node.count=1;node.totalCount++;node.totalEnergy+=energy;
      const record={sequence:this.ledger.length+1,tick:this.tick,node:node.id,
        location:{x:node.x,y:node.y,simulated:true},sourceId:event.id,timestamp:event.timestamp,
        sourceFile:event.file,source:event.source,replayCycle:event.cycle,species:event.species,
        radio:'LoRa',destination:'gateway',encoding:'image',bytes,expectedAirtimeSeconds:airtime,energyJ:energy};
      node.latest=record;this.ledger.push(record);
      this.edges.push({from:node.id,to:'gateway',radio:'LoRa',bytes,airtime,energy});
      m.energy+=energy;m.airtime+=airtime;m.bytes+=bytes;m.reports++;
    }
    for(const k of Object.keys(this.total))this.total[k]+=m[k];
    this.history.push(m);return m;
  }
  rolling(window=12){const rows=this.history.slice(-window);if(!rows.length)return null;
    return Object.fromEntries(Object.keys(rows[0]).map(k=>[k,rows.reduce((s,r)=>s+r[k],0)/rows.length]));}
}
