import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

class Vector {
  constructor(x=0,y=0) { this.set(x,y); }
  set(x,y) { this.x=x;this.y=y;return this; }
  copy() { return new Vector(this.x,this.y); }
  add(v) { this.x+=v.x;this.y+=v.y;return this; }
  mult(n) { this.x*=n;this.y*=n;return this; }
  mag() { return Math.hypot(this.x,this.y); }
  setMag(n) { const m=this.mag(); return m ? this.mult(n/m):this; }
  limit(n) { return this.mag()>n ? this.setMag(n):this; }
  heading() { return Math.atan2(this.y,this.x); }
  static sub(a,b) { return new Vector(a.x-b.x,a.y-b.y); }
  static dist(a,b) { return Math.hypot(a.x-b.x,a.y-b.y); }
  static random2D() { return new Vector(1,0); }
}

function load() {
  const drawing=[];
  const context=vm.createContext({
    createVector:(x,y)=>new Vector(x,y),p5:{Vector},width:1000,height:700,
    random:(a=1,b)=>b===undefined?a*0.5:(a+b)/2,color:(...args)=>args,
    setInterval:()=>assert.fail('Aucun timer par cible'),
    push(){},pop(){},fill(){},noStroke(){},noFill(){},strokeWeight(){},rect(){},
    stroke:c=>drawing.push(['stroke',c]),circle:(...args)=>drawing.push(['circle',...args])
  });
  for(const file of ['vehicle.js','population.js','target.js','targetFutante.js','seekVehicle.js','scenarios.js']) {
    vm.runInContext(readFileSync(new URL(`../${file}`,import.meta.url),'utf8'),context);
  }
  return {...vm.runInContext('({Vehicle,Target,TargetFutante,SeekVehicle,SeekScenarios,SeekPopulation})',context),drawing};
}

test('cible fuyante : vrai héritage Target/Vehicle et valeurs initiales',()=>{
  const {Vehicle,Target,TargetFutante}=load(); const target=new TargetFutante(0,0);
  assert.ok(target instanceof Target && target instanceof Vehicle);
  assert.equal(target.detectionRadius,200);assert.equal(target.exitDistance,300);
  assert.equal(target.maxFleeDuration,2.5);assert.equal(target.state,'normal');
});

test('détection inclusive : choisir le prédateur le plus proche et booster les limites',()=>{
  const {Vehicle,TargetFutante}=load(); const target=new TargetFutante(0,0);target.vel.set(0,0);
  const far=new Vehicle(201,0);target.update([far],0);assert.equal(target.state,'normal');
  const boundary=new Vehicle(200,0);const near=new Vehicle(150,0);
  target.update([far,boundary,near],0);
  assert.equal(target.state,'fleeing');assert.equal(target.threat,near);
  assert.equal(target.maxSpeed,8);assert.equal(target.maxForce,0.4);
});

test('fuite réutilise la vraie méthode héritée et intègre la locomotion une fois',()=>{
  const {Vehicle,TargetFutante}=load();const target=new TargetFutante(0,0);
  const threat=new Vehicle(150,0);target.vel.set(0,0);
  const reference=new Vehicle(0,0);reference.maxSpeed=8;reference.maxForce=0.4;
  const force=reference.flee(threat.pos);reference.applyForce(force);reference.update();
  target.update([threat],0);
  assert.equal(target.vel.x,reference.vel.x);assert.equal(target.pos.x,reference.pos.x);
  assert.ok(target.vel.x<0);assert.equal(target.acc.mag(),0);
  assert.equal(threat.pos.x,150);
});

test('quitter 200 px ne suffit pas : la fuite continue à 250 px et cesse à 300 px',()=>{
  const {Vehicle,TargetFutante}=load();const target=new TargetFutante(0,0);target.vel.set(0,0);
  const threat=new Vehicle(150,0);target.update([threat],0);
  threat.pos.set(target.pos.x+250,target.pos.y);target.update([threat],100);
  assert.equal(target.state,'fleeing');assert.equal(target.detected,false);
  threat.pos.set(target.pos.x+300,target.pos.y);target.update([threat],100);
  assert.equal(target.state,'normal');assert.equal(target.maxSpeed,4);assert.equal(target.maxForce,0.1);
});

test('durée exacte, endurance et épuisement sans réarmement immédiat',()=>{
  const {Vehicle,TargetFutante}=load();const target=new TargetFutante(0,0);target.vel.set(0,0);
  const threat=new Vehicle(150,0);target.update([threat],1250);
  assert.equal(target.state,'fleeing');assert.equal(target.endurance,0.5);
  threat.pos.set(target.pos.x+150,0);target.update([threat],1249);
  assert.equal(target.state,'fleeing');
  threat.pos.set(target.pos.x+150,0);target.update([threat],1);
  assert.equal(target.state,'exhausted');assert.equal(target.endurance,0);
  assert.equal(target.maxSpeed,4);assert.equal(target.maxForce,0.1);
  target.update([threat],100);assert.equal(target.state,'exhausted');
  threat.pos.set(target.pos.x+250,target.pos.y);target.update([threat],100);
  assert.equal(target.state,'exhausted');
  threat.pos.set(target.pos.x+300,target.pos.y);target.update([threat],0);
  assert.equal(target.state,'normal');assert.equal(target.endurance,1);
});

test('la menace la plus proche peut changer et disparaître pendant la fuite',()=>{
  const {Vehicle,TargetFutante}=load();const target=new TargetFutante(0,0);target.vel.set(0,0);
  const first=new Vehicle(150,0);target.update([first],0);
  const second=new Vehicle(target.pos.x+80,0);target.update([first,second],20);
  assert.equal(target.threat,second);
  target.update([],20);assert.equal(target.state,'normal');assert.equal(target.threat,null);
});

test('paramètres en direct : durée, distances cohérentes, invalides et restauration',()=>{
  const {Vehicle,TargetFutante}=load();const target=new TargetFutante(0,0);
  target.setFleeSettings({detectionRadius:400,exitDistance:300,maxFleeDuration:1});
  assert.equal(target.exitDistance,401);
  target.setFleeSettings({detectionRadius:NaN,maxFleeDuration:Infinity});
  assert.equal(target.detectionRadius,400);assert.equal(target.maxFleeDuration,1);
  target.maxSpeed=3;target.maxForce=0.2;target.vel.set(0,0);
  const threat=new Vehicle(150,0);target.update([threat],500);
  assert.equal(target.endurance,0.5);target.setFleeSettings({maxFleeDuration:0.5});
  target.update([threat],0);assert.equal(target.state,'exhausted');
  assert.equal(target.maxSpeed,3);assert.equal(target.maxForce,0.2);
});

test('debug : aucun cercle hors debug, jaune hors détection, rouge dedans',()=>{
  const {Vehicle,TargetFutante,drawing}=load();const target=new TargetFutante(0,0);
  target.show(false);assert.equal(drawing.filter(item=>item[0]==='circle').length,1);
  drawing.length=0;target.show(true);assert.ok(drawing.some(item=>item[1]==='yellow'));
  assert.ok(drawing.some(item=>item[0]==='circle' && item[3]===400));
  target.update([new Vehicle(100,0)],0);drawing.length=0;target.show(true);
  assert.ok(drawing.some(item=>item[1]==='red'));
});

test('scénarios : scénario 1 initial, remise à zéro de la fuite aux transitions',()=>{
  const {Target,TargetFutante,SeekScenarios,Vehicle}=load();
  const normal=new Target(0,0), fleeing=new TargetFutante(0,0);
  const scene=new SeekScenarios(normal,fleeing);assert.equal(scene.target,normal);
  scene.setMode('flee');assert.equal(scene.target,fleeing);
  scene.update([new Vehicle(100,0)],100);assert.equal(fleeing.state,'fleeing');
  scene.setMode('normal');assert.equal(scene.target,normal);assert.equal(fleeing.state,'normal');
  assert.equal(fleeing.maxSpeed,4);assert.equal(fleeing.acc.mag(),0);
  scene.setMode('flee');assert.equal(fleeing.endurance,1);
  assert.throws(()=>scene.setMode('unknown'),{name:'RangeError'});
});

test('comportement normal : apparence varie sans timer, forces/vitesses bornées',()=>{
  const {Target}=load();const target=new Target(100,100);
  for(let index=0;index<100;index++) {
    target.update(20);assert.ok(target.vel.mag()<=target.maxSpeed+1e-10);
    assert.equal(target.acc.mag(),0);
  }
  assert.equal(target.r,35);
  target.update(Infinity);assert.ok(Number.isFinite(target.pos.x));
});

test('réapparition sur cible normale ou fuyante : même véhicule et somme des rayons',()=>{
  const {Target,TargetFutante,SeekPopulation,Vehicle}=load();
  for(const target of [new Target(400,300),new TargetFutante(400,300)]) {
    const vehicle=new Vehicle(400,300);vehicle.maxSpeed=7;
    SeekPopulation.step(vehicle,target,1000,700,()=>0.05);
    assert.equal(vehicle.maxSpeed,7);assert.equal(vehicle.vel.mag(),0);
    assert.equal(SeekPopulation.hasArrived(vehicle,target),false);
  }
});

test('slider de population lit la cible active après changement de scénario',()=>{
  const {Vehicle,SeekPopulation}=load();let active={pos:new Vector(10,10),r:20};
  const events={};const slider={value:'1',addEventListener:(name,fn)=>events[name]=fn};
  const vehicles=[];
  SeekPopulation.bindSlider(slider,{},vehicles,()=>active,()=>({width:1000,height:700}),
    (x,y)=>new Vehicle(x,y),()=>0.5);
  active={pos:new Vector(500,350),r:100};slider.value='2';events.input();
  assert.equal(SeekPopulation.hasArrived(vehicles[1],active),false);
});

test('plusieurs cibles : compteur borné et cible la plus proche sélectionnée',()=>{
  const {Target,TargetFutante,SeekScenarios,SeekPopulation,Vehicle}=load();
  const normal=[new Target(0,0),new Target(300,0),new Target(800,0)];
  const fleeing=[new TargetFutante(0,0),new TargetFutante(300,0),new TargetFutante(800,0)];
  const scene=new SeekScenarios(normal,fleeing);
  assert.equal(scene.targets.length,3); assert.equal(scene.target,normal[0]);
  const vehicle=new Vehicle(280,0);
  assert.equal(SeekPopulation.nearestTarget(vehicle,scene.targets),normal[1]);
  scene.setTargetCount(4,1000,700); assert.equal(scene.normalTargets.length,4); assert.equal(scene.fleeingTargets.length,4);
  assert.throws(()=>scene.setTargetCount(31,1000,700),{name:'RangeError'});
});

test('les paramètres de fuite restent synchronisés sur toutes les cibles',()=>{
  const {Target,TargetFutante,SeekScenarios}=load();
  const scene=new SeekScenarios([new Target(0,0)],[new TargetFutante(0,0),new TargetFutante(100,0)]);
  scene.setTargetCount(2,500,500);
  scene.fleeingTargets.forEach(t=>t.setFleeSettings({detectionRadius:250,maxFleeDuration:4}));
  assert.deepEqual(scene.fleeingTargets.map(t=>[t.detectionRadius,t.maxFleeDuration]),[[250,4],[250,4]]);
});
