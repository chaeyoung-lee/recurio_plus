import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation,CONFIG} from '../web/simulation.js';
test('every camera sends a full image directly to the gateway on every step',()=>{const s=new Simulation();for(let i=0;i<100;i++){const m=s.step();assert.equal(m.reports,s.nodes.length);assert.equal(s.edges.length,s.nodes.length);assert.ok(s.edges.every(e=>e.radio==='LoRa'&&e.to==='gateway'));}assert.equal(s.ledger.length,2000);assert.ok(s.ledger.every(r=>r.encoding==='image'&&r.destination==='gateway'&&r.timestamp&&r.sourceId&&r.location.simulated));});
test('seeded replay is deterministic and energy/airtime reconcile',()=>{const s=new Simulation(),twin=new Simulation();for(let i=0;i<80;i++){const m=s.step();assert.deepEqual(m,twin.step());assert.ok(Math.abs(m.energy-s.nodes.reduce((a,n)=>a+n.energy,0))<1e-9);assert.equal(m.airtime,s.edges.reduce((a,e)=>a+e.airtime,0));}assert.ok(Math.abs(s.total.energy-s.nodes.reduce((a,n)=>a+CONFIG.batteryJ-n.battery,0))<1e-7);assert.equal(s.total.bytes,s.ledger.reduce((a,r)=>a+r.bytes,0));});
test('cannot transmit without enough battery, and run stops at bounded duration',()=>{const s=new Simulation();s.nodes[0].battery=.0001;assert.equal(s.step().reports,19);assert.equal(s.nodes[0].battery,.0001);for(let i=1;i<CONFIG.maxTicks;i++)s.step();assert.equal(s.step(),null);assert.equal(s.tick,CONFIG.maxTicks);});
const historicalFixture={schemaVersion:2,totalImages:10,months:['2010-01','2010-02','2010-03'],cameras:[
 {id:'A',bins:[{month:'2010-01',count:3,latest:{id:'a',timestamp:'2010-01-30T00:00:00',file:'A/a.jpg',species:'Deer'}},{month:'2010-03',count:2,latest:{id:'b',timestamp:'2010-03-01T00:00:00',file:'A/b.jpg',species:'Fox'}}]},
 {id:'B',bins:[{month:'2010-03',count:5,latest:{id:'c',timestamp:'2010-03-02T00:00:00',file:'B/c.jpg',species:'Coyote'}}]}
]};
test('historical playback shares one clock, includes quiet months, and never cycles observations',()=>{
 const s=new Simulation({dataset:historicalFixture});assert.equal(s.maxTicks,3);
 assert.equal(s.step().reports,3);assert.equal(s.month,'2010-01');assert.deepEqual(s.nodes.map(n=>n.count),[3,0]);assert.equal(s.edges.length,1);
 assert.equal(s.step().reports,0);assert.equal(s.month,'2010-02');assert.equal(s.edges.length,0);assert.ok(s.nodes.every(n=>n.latest===null&&n.energy===0));
 assert.equal(s.step().reports,7);assert.equal(s.month,'2010-03');assert.deepEqual(s.nodes.map(n=>n.count),[2,5]);
 assert.equal(s.total.reports,10);assert.equal(s.step(),null);assert.equal(s.ledger.length,3);assert.equal(s.ledger[2].representativeObservation.file,'B/c.jpg');
});
test('historical costs scale with recorded counts and do not truncate years of data for hypothetical batteries',()=>{
 const s=new Simulation({dataset:historicalFixture});s.nodes[0].battery=0;
 const expected=s.reportCost(s.nodes[0]).energy*5+s.reportCost(s.nodes[1]).energy*5;
 for(let i=0;i<3;i++)s.step();assert.ok(Math.abs(s.total.energy-expected)<1e-9);
 assert.equal(s.total.bytes,10*(CONFIG.imageBytes+CONFIG.provenanceBytes+CONFIG.headerBytes));
 assert.equal(s.peakCount,5);assert.equal(s.peakCosts.energy,s.history[2].energy);
 assert.deepEqual(s.nodes.map(n=>n.totalCount),[5,5]);
});
