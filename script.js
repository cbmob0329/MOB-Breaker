// script_part1.js – Rev35c SAFE (AutoStart + all previous fixes)
(function(){
'use strict';

window.$G = {
  STAGE_LEFT: 0,
  STAGE_RIGHT: 2200,
  GROUND_TOP_Y: 437,
  GRAV: 2000, MOVE: 260, JUMP_V: 760, MAX_FALL: 1200,
  FOOT_PAD: 2,
  clamp:(v,min,max)=>Math.max(min,Math.min(max,v)),
  lerp:(a,b,t)=>a+(b-a)*t,
  now:()=>performance.now(),
  rectsOverlap:(a,b)=>Math.abs(a.x-b.x)*2<(a.w+b.w)&&Math.abs(a.y-b.y)*2<(a.h+b.h)
};

const $hpFill = ()=>document.getElementById('hpfill');
const $hpNum  = ()=>document.getElementById('hpnum');
const $time   = ()=>document.getElementById('time');

class Effects{
  constructor(){ this.sparks=[]; this.shakeT=0; this.shakeAmp=0; this.hitstop=0; }
  addSpark(x,y,strong=false){
    this.sparks.push({x,y,t:0,life:0.18,strong});
    if(strong){ this.shake(0.14,8); this.hitstop=Math.max(this.hitstop,0.08); }
    else{ this.shake(0.08,4); this.hitstop=Math.max(this.hitstop,0.05); }
  }
  shake(dur,amp){ this.shakeT=Math.max(this.shakeT,dur); this.shakeAmp=Math.max(this.shakeAmp,amp); }
  getCamOffset(){ if(this.shakeT>0){ const a=this.shakeAmp*this.shakeT; return {x:(Math.random()*2-1)*a,y:(Math.random()*2-1)*a*0.6}; } return {x:0,y:0}; }
  update(dt){
    if(this.hitstop>0)this.hitstop=Math.max(0,this.hitstop-dt);
    if(this.shakeT>0)this.shakeT=Math.max(0,this.shakeT-dt);
    for(const s of this.sparks){ s.t+=dt; }
    this.sparks=this.sparks.filter(s=>s.t<s.life);
  }
  draw(ctx,world){
    for(const s of this.sparks){
      const p=s.t/s.life; ctx.save(); ctx.translate(s.x-world.camX, s.y-world.camY);
      ctx.globalAlpha=1-p; ctx.strokeStyle="#fff"; ctx.lineWidth=s.strong?2:1;
      ctx.beginPath(); ctx.moveTo(-10,0); ctx.lineTo(10,0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0,-6); ctx.lineTo(0,6); ctx.stroke();
      ctx.restore();
    }
  }
}
window.Effects = Effects;

class Assets{
  constructor(){ this.images=new Map(); }
  load(list){ return Promise.all(list.map(src=>new Promise(res=>{ const i=new Image(); i.onload=()=>{this.images.set(src,i);res();}; i.onerror=()=>res(); i.src=src; }))); }
  img(n){ return this.images.get(n); }
}
window.Assets = Assets;

class Input{
  constructor(){
    this.left=0; this.right=0; this.jump=false;
    this.btn={a1:false,a2:false,skill:false,skill2:false,ult:false};
    this.edge={};
    this.skillCharging=false; this.skillChargeT=0;
    this.buffer = { a1:0, a2:0, jump:0, ult:0 };
    this._initKeys(); this._initTouch(); this._initStick();
  }
  _edgeDown(flag){ this.edge[flag]=true; }
  _initKeys(){
    addEventListener('keydown',e=>{
      const k=e.key.toLowerCase();
      if(k==='arrowleft'||k==='a')this.left=1;
      if(k==='arrowright'||k==='d')this.right=1;
      if(k===' '||k==='w'||k==='arrowup'){ this.jump=true; this.buffer.jump=0.15; }
      if(k==='j'){ this.btn.a1=true; this._edgeDown('a1'); this.buffer.a1=0.15; }
      if(k==='k'){ this.btn.a2=true; this._edgeDown('a2'); this.buffer.a2=0.15; }
      if(k==='l'&&!this.btn.skill){this.btn.skill=true;this._edgeDown('skillPress');this.skillCharging=true;this.skillChargeT=0;}
      if(k==='o'){ this._edgeDown('skill2'); this.btn.skill2=true; }
      if(k==='u'&&!this.btn.ult){this.btn.ult=true;this._edgeDown('ult'); this.buffer.ult=0.2; }
    });
    addEventListener('keyup',e=>{
      const k=e.key.toLowerCase();
      if(k==='arrowleft'||k==='a')this.left=0;
      if(k==='arrowright'||k==='d')this.right=0;
      if(k==='j')this.btn.a1=false;
      if(k==='k')this.btn.a2=false;
      if(k==='l'){this.btn.skill=false;this.skillCharging=false;this._edgeDown('skillRelease');}
      if(k==='o')this.btn.skill2=false;
      if(k==='u')this.btn.ult=false;
    });
  }
  _initTouch(){
    const bind=(id,onDown,onUp)=>{
      const el=document.getElementById(id);
      el.addEventListener('pointerdown',e=>{e.preventDefault();onDown?.();});
      el.addEventListener('pointerup',e=>{e.preventDefault();onUp?.();});
      el.addEventListener('pointercancel',e=>{e.preventDefault();onUp?.();});
      el.addEventListener('pointerleave',e=>{e.preventDefault();onUp?.();});
    };
    bind('btnA1',()=>{this.btn.a1=true;this._edgeDown('a1');this.buffer.a1=0.15;},()=>this.btn.a1=false);
    bind('btnA2',()=>{this.btn.a2=true;this._edgeDown('a2');this.buffer.a2=0.15;},()=>this.btn.a2=false);
    bind('btnSK',()=>{this.btn.skill=true;this._edgeDown('skillPress');this.skillCharging=true;this.skillChargeT=0;},()=>{this.btn.skill=false;this.skillCharging=false;this._edgeDown('skillRelease');});
    bind('btnSK2',()=>{this._edgeDown('skill2');this.btn.skill2=true;},()=>this.btn.skill2=false);
    bind('btnULT',()=>{this.btn.ult=true;this._edgeDown('ult'); this.buffer.ult=0.2;},()=>{this.btn.ult=false;});
    bind('btnJMP',()=>{this.jump=true; this.buffer.jump=0.15;},()=>{});
  }
  _initStick(){
    const area=document.getElementById('stickArea');
    const thumb=document.getElementById('stickThumb');
    let active=false, cx=0, cy=0;
    area.addEventListener('pointerdown',e=>{
      active=true; const r=area.getBoundingClientRect(); cx=r.left+r.width/2; cy=r.top+r.height/2;
      area.setPointerCapture(e.pointerId);
    });
    area.addEventListener('pointermove',e=>{
      if(!active)return; const dx=e.clientX-cx, dy=e.clientY-cy;
      const len=Math.hypot(dx,dy), max=50;
      const nx = len>max? dx/len*max : dx;
      const ny = len>max? dy/len*max : dy;
      thumb.style.transform=`translate(${nx}px, ${ny}px)`;
      this.left = nx<-8?1:0; this.right = nx>8?1:0;
    });
    const reset=()=>{active=false;thumb.style.transform='translate(-50%,-50%)'; this.left=0; this.right=0;};
    area.addEventListener('pointerup',reset);
    area.addEventListener('pointercancel',reset);
    area.addEventListener('pointerleave',reset);
  }
  tick(dt){
    for(const k of Object.keys(this.buffer)){
      if(this.buffer[k]>0) this.buffer[k]=Math.max(0,this.buffer[k]-dt);
    }
    if(this.skillCharging) this.skillChargeT = Math.min(1.0, this.skillChargeT + dt);
  }
  consumeBuffered(name){
    if(this.edge[name]){ this.edge[name]=false; return true; }
    const map = { a1:'a1', a2:'a2', jump:'jump', ult:'ult' };
    if(map[name] && this.buffer[map[name]]>0){ this.buffer[map[name]]=0; return true; }
    return false;
  }
  consumeJump(){ const j = this.consumeBuffered('jump'); this.jump=false; return j; }
}
window.Input = Input;

class CharacterBase{
  constructor(w,h){this.w=w;this.h=h;this.x=0;this.y=0;this.vx=0;this.vy=0;this.face=1;this.hp=100;this.maxhp=100;this.dead=false;this.onGround=false;this.invulnT=0;}
  aabb(){return{x:this.x,y:this.y,w:this.w*0.6,h:this.h*0.8};}
  hurt(amount,dir,opt,fx){
    if(this.invulnT>0||this.dead)return false;
    this.hp=Math.max(0,this.hp-amount);
    const baseKb=140+amount*12;
    this.vx=dir*baseKb*(opt?.kbMul||1);
    this.vy=-baseKb*(opt?.kbuMul||1);
    this.invulnT = opt?.inv||0.2;
    if(this.hp<=0)this.dead=true;
    if(fx)fx.addSpark(this.x,this.y-10,amount>=30);
    return true;
  }
  updatePhysics(dt){
    const G=$G;
    this.vy=Math.min(this.vy+G.GRAV*dt,G.MAX_FALL);
    this.x+=this.vx*dt; this.y+=this.vy*dt;
    const top=Math.floor($G.GROUND_TOP_Y);
    if(this.y+this.h/2>=top){this.y=top-this.h/2;this.vy=0;this.onGround=true;}
    else this.onGround=false;
    if(this.invulnT>0)this.invulnT-=dt;
    this.x = $G.clamp(this.x, G.STAGE_LEFT+this.w*0.5, G.STAGE_RIGHT-this.w*0.5);
  }
}
window.CharacterBase = CharacterBase;

class Player extends CharacterBase{
  constructor(a,w,fx,input){super(56,64);this.assets=a;this.world=w;this.effects=fx;this.input=input;this.hp=1000;this.maxhp=1000;this.lives=3;
    this.state='idle'; this.stateT=0; this.comboStep=0; this.a1CD=0; this.skillCD=0; this.ultCD=0;
  }
  _enter(s){ this.state=s; this.stateT=0; }
  update(dt){
    const I=this.input, G=$G;
    let ax=0; if(I.left)ax-=G.MOVE; if(I.right)ax+=G.MOVE;
    if(ax!==0)this.face=(ax>0?1:-1);
    I.tick(dt);
    this.a1CD=Math.max(0,this.a1CD-dt);
    this.skillCD=Math.max(0,this.skillCD-dt);
    this.ultCD=Math.max(0,this.ultCD-dt);
    if(I.skillCharging) this.effects.shake(0.05,1);

    switch(this.state){
      case 'idle':
      case 'run':
        this.vx=ax;
        if(I.consumeJump() && this.onGround){ this.vy=-G.JUMP_V; }
        if(Math.abs(this.vx)>1) this._enter('run'); else this._enter('idle');
        if(I.consumeBuffered('a1') && this.a1CD<=0){ this._startA1(); break; }
        if(I.edge.skillRelease && this.skillCD<=0){
          this._skill1(I.skillChargeT>=1.0);
          I.skillChargeT=0; I.edge.skillRelease=false;
          break;
        }
        if(I.consumeBuffered('ult') && this.ultCD<=0){ this._ultMax(); break; }
      break;
      case 'a1':
        this.stateT+=dt;
        if(this.stateT>=this._a1Dur){
          if(this.onGround && this.input.btn.a1 && this.comboStep<3){ this._startA1(); }
          else{ this._enter('idle'); }
        }
      break;
      case 'skill':
      case 'ult':
        this.stateT+=dt;
        if(this.stateT>=this._actDur) this._enter('idle');
      break;
    }
    this.updatePhysics(dt);
  }
  _startA1(){
    this._enter('a1');
    this.comboStep=(this.state==='a1')? (this.comboStep+1)%3 : 0;
    const pow=[18,22,28][this.comboStep];
    this._a1Dur=[0.10,0.10,0.12][this.comboStep];
    this.a1CD=0.06;
    this._spawnHitbox({ x:this.x+this.face*28, y:this.y-8, w:44, h:26, dmg:pow, kb:1.0, kbu:0.8, strong:pow>=28 });
  }
  _skill1(full){
    this._enter('skill');
    const spins=full?8:4, pow=full?28:20, durPer=0.08;
    this._actDur=spins*durPer+0.10;
    this.skillCD=full?0.6:0.45;
    for(let i=0;i<spins;i++){
      const d=i*durPer;
      this.world.defer(d,()=>this._spawnHitbox({ x:this.x+this.face*(24+4*i), y:this.y-10, w:52, h:32, dmg:pow, kb:1.1, kbu:0.9, strong:true }));
    }
    this.effects.addSpark(this.x,this.y-10,true);
  }
  _ultMax(){
    this._enter('ult');
    this._actDur=0.55; this.ultCD=2.2;
    this._spawnHitbox({ x:this.x+this.face*80, y:this.y-14, w:160, h:44, dmg:120, kb:2.2, kbu:1.4, strong:true, inv:0.25 });
    this.world.defer(0.20,()=>this._spawnHitbox({ x:this.x+this.face*90, y:this.y-14, w:160, h:44, dmg:90, kb:1.8, kbu:1.2, strong:true, inv:0.20 }));
    this.effects.addSpark(this.x,this.y-12,true);
  }
  _spawnHitbox(opt){
    this.world.spawnHitbox({ owner:'player', face:this.face, x:opt.x, y:opt.y, w:opt.w, h:opt.h, dmg:opt.dmg, kbMul:opt.kb, kbuMul:opt.kbu, inv:opt.inv??0.1, strong:!!opt.strong });
  }
  draw(ctx){
    ctx.save();ctx.translate(this.x-this.world.camX,this.y-this.world.camY);
    ctx.fillStyle='#7df'; ctx.fillRect(-10,-32,20,64);
    ctx.restore();
  }
}
window.Player = Player;

class World{
  constructor(a,cv,fx){
    this.assets=a; this.canvas=cv; this.ctx=cv.getContext('2d'); this.effects=fx;
    this.camX=0; this.camY=0;
    this.hitboxes=[]; this.deferTasks=[];
    this.enemies=[]; this.bg='ST1.png';
  }
  setBackground(n){ this.bg=n; }
  defer(delay,fn){ this.deferTasks.push({t:delay,fn}); }
  spawnHitbox(hb){ hb.t=0; hb.life=0.06; this.hitboxes.push(hb); }
  update(dt,player){
    this.deferTasks.forEach(d=>d.t=Math.max(0,d.t-dt));
    const run=this.deferTasks.filter(d=>d.t<=0);
    this.deferTasks=this.deferTasks.filter(d=>d.t>0);
    for(const d of run) d.fn();

    for(const hb of this.hitboxes){ hb.t+=dt; }
    this.hitboxes=this.hitboxes.filter(h=>h.t<h.life);

    for(const hb of this.hitboxes){
      if(hb.owner==='player'){
        for(const e of this.enemies){
          if(e.dead) continue;
          if(overlapHB(hb,e)){
            const ok=e.hurt(hb.dmg, player.face, {kbMul:220*hb.kbMul/100, kbuMul:hb.kbuMul, inv:hb.inv}, this.effects);
            if(ok) this.effects.addSpark(e.x, e.y-10, hb.strong);
          }
        }
      }
    }

    // すり抜け防止：水平分離
    for(const e of this.enemies){
      if(e.dead) continue;
      const A=player.aabb(), B=e.aabb();
      if($G.rectsOverlap(A,B)){
        const dx=(A.x-B.x), overlapX=(A.w+B.w)/2-Math.abs(dx);
        if(overlapX>0){
          const push=overlapX*0.6;
          if(dx>0){ player.x+=push; e.x-=overlapX-push; }
          else     { player.x-=push; e.x+=overlapX-push; }
        }
      }
    }

    const target=$G.clamp(player.x-this.canvas.width/2, $G.STAGE_LEFT, $G.STAGE_RIGHT-this.canvas.width);
    const shake=this.effects.getCamOffset();
    this.camX=Math.floor(target+shake.x);
    this.camY=Math.floor(0+shake.y);
  }
  draw(player){
    const ctx=this.ctx;
    ctx.clearRect(0,0,this.canvas.width,this.canvas.height);
    const img=this.assets.img(this.bg);
    if(img) ctx.drawImage(img,-this.camX,0,this.canvas.width,this.canvas.height);
    for(const e of this.enemies){ e.draw?.(ctx,this); }
    player.draw(ctx);
    this.effects.draw(ctx,this);
  }
}
function overlapHB(hb,enemy){
  const A={x:hb.x,y:hb.y,w:hb.w,h:hb.h}, B=enemy.aabb();
  return $G.rectsOverlap(A,B);
}
window.World = World;

class Game{
  constructor(){
    this.assets=new Assets();
    this.canvas=document.getElementById('game');
    this.effects=new Effects();
    this.input=new Input();
    this._started=false;
  }
  async boot(){
    // 画像が失敗しても続行（onerrorでresolve）
    await this.assets.load(['ST1.png']);
    this.world=new World(this.assets,this.canvas,this.effects);
    this.player=new Player(this.assets,this.world,this.effects,this.input);
    this.world.setBackground('ST1.png');
    this.player.x=200;
    this.player.y=Math.floor($G.GROUND_TOP_Y)-this.player.h/2+$G.FOOT_PAD;

    // SAFE: 自動開始（STARTボタンはオーバーレイを閉じるだけ）
    const startBtn=document.getElementById('startBtn');
    const overlay=document.getElementById('titleOverlay');
    startBtn?.addEventListener('click',()=>overlay?.classList.add('hidden'));

    this.startStage1();
    this._started=true;
    this._loop();
  }
  startStage1(){
    this.world.enemies = window.createEnemies?.(this.world,this.effects,this.assets) ?? [];
    $hpNum().textContent=`${this.player.hp}`;
    $hpFill().style.width=`100%`;
    this.t0=$G.now();
  }
  _loop(){
    if(!this._started) return;
    const t=$G.now(); let dt=this._lastT? (t-this._lastT)/1000:0; this._lastT=t; if(dt>0.05)dt=0.05;

    this.player.update(dt);
    for(const e of this.world.enemies) e.update?.(dt,this.player);
    this.world.update(dt,this.player);
    this.effects.update(dt);

    $hpNum().textContent=`${Math.max(0,Math.floor(this.player.hp))}`;
    const hpP=Math.max(0,Math.min(1,this.player.hp/this.player.maxhp))*100;
    $hpFill().style.width=`${hpP}%`;
    const tm=Math.floor((t-this.t0)/1000); const mm=String(Math.floor(tm/60)).padStart(2,'0'); const ss=String(tm%60).padStart(2,'0');
    $time().textContent=`${mm}:${ss}`;

    requestAnimationFrame(()=>this._loop());
  }
}
window.Game = Game;
})();
// script_part2.js – Rev35c SAFE (Enemies / Stage / Boot)
(function(){
'use strict';
const G = window.$G;

class EnemyBase extends window.CharacterBase{
  constructor(w,h,world,fx,assets,x=600){ super(w,h); this.world=world; this.effects=fx; this.assets=assets; this.x=x; }
  draw(ctx,world){
    ctx.save(); ctx.translate(this.x-world.camX,this.y-world.camY);
    ctx.fillStyle='#f77'; ctx.fillRect(-this.w*0.25,-this.h*0.5,this.w*0.5,this.h);
    ctx.restore();
  }
  update(dt,player){
    const dir = Math.sign(player.x - this.x);
    this.vx = dir * 120;
    if(Math.abs(player.x - this.x)<40) this.vx *= 0.2;
    this.updatePhysics(dt);
  }
}
class WaruMOB   extends EnemyBase{ constructor(w,fx,a,x){ super(52,60,w,fx,a,x); this.hp=100;  this.maxhp=100; } }
class GolemRobo extends EnemyBase{ constructor(w,fx,a,x){ super(60,68,w,fx,a,x); this.hp=800;  this.maxhp=800; } }
class IceRobo   extends EnemyBase{ constructor(w,fx,a,x){ super(64,70,w,fx,a,x); this.hp=1200; this.maxhp=1200;} }
class IceMini   extends EnemyBase{ constructor(w,fx,a,x){ super(40,48,w,fx,a,x); this.hp=300;  this.maxhp=300; } }
class GabKing   extends EnemyBase{ constructor(w,fx,a,x){ super(70,80,w,fx,a,x); this.hp=2000; this.maxhp=2000;} }
class GiantMOB  extends EnemyBase{ constructor(w,fx,a,x){ super(90,100,w,fx,a,x);this.hp=2500; this.maxhp=2500;} }
class Shield    extends EnemyBase{ constructor(w,fx,a,x){ super(60,64,w,fx,a,x); this.hp=600;  this.maxhp=600; } }
class Screw     extends EnemyBase{ constructor(w,fx,a,x){ super(62,68,w,fx,a,x); this.hp=2000; this.maxhp=2000;} }

window.createEnemies = function(world,fx,assets){
  G.GROUND_TOP_Y = 437;
  return [
    new WaruMOB(world,fx,assets,600),
    new GolemRobo(world,fx,assets,900),
    new IceRobo(world,fx,assets,1200),
    new IceMini(world,fx,assets,1350),
    new GabKing(world,fx,assets,1600),
    new GiantMOB(world,fx,assets,1800),
    new Shield(world,fx,assets,1900),
    new Screw(world,fx,assets,2000)
  ];
};

// 起動（SAFE: 自動）
new window.Game().boot();

})();
