// script.js – Rev33 FULL (No Containers / Clean Ground / Skill1 4-8 Spins / All Enemies)
// ================================================================
(function(){
'use strict';

/* ================================
 * Constants & Utils
 * ================================ */
const STAGE_LEFT = 0;
const STAGE_RIGHT = 2200;
const WALL_PAD = 12;

const GRAV=2000, MOVE=260, JUMP_V=760, MAX_FALL=1200;
let GROUND_TOP_Y = 437;   // ST1固定、CS時は360に切り替え
const FOOT_PAD=2;

const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const now=()=>performance.now();
const rectsOverlap=(a,b)=> Math.abs(a.x-b.x)*2 < (a.w+b.w) && Math.abs(a.y-b.y)*2 < (a.h+b.h);

/* ================================
 * Screen Effects
 * ================================ */
class Effects{
  constructor(){ this.sparks=[]; this.shakeT=0; this.shakeAmp=0; this.hitstop=0; }
  addSpark(x,y,strong=false){
    this.sparks.push({x,y,t:0,life:0.18,strong});
    if(strong){ this.shake(0.14,8); this.hitstop=Math.max(this.hitstop,0.08); }
    else{ this.shake(0.08,4); this.hitstop=Math.max(this.hitstop,0.05); }
    if(navigator.vibrate) navigator.vibrate(strong?18:10);
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
      const p=s.t/s.life; const w=s.strong?2:1;
      ctx.save(); ctx.translate(s.x-world.camX, s.y-world.camY); ctx.globalAlpha=1-p; ctx.strokeStyle="#fff"; ctx.lineWidth=w;
      ctx.beginPath(); ctx.moveTo(-10,0); ctx.lineTo(10,0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0,-6); ctx.lineTo(0,6); ctx.stroke();
      ctx.restore();
    }
  }
}

/* ================================
 * Assets
 * ================================ */
class Assets{
  constructor(){ this.images=new Map(); this.missing=new Set(); }
  load(srcs){
    return Promise.all(srcs.map(src=>new Promise((resolve)=>{
      const img=new Image();
      img.onload=()=>{ this.images.set(src,img); resolve(); };
      img.onerror=()=>{ console.warn('Image load failed:',src); this.missing.add(src); resolve(); };
      img.src=src;
    })));
  }
  img(n){ return this.images.get(n); }
  has(n){ return this.images.has(n) && !this.missing.has(n); }
}

/* ================================
 * Input
 * ================================ */
class Input{
  constructor(){
    this.left=0; this.right=0; this.jump=false;
    this.btn={a1:false,a2:false,skill:false,skill2:false,ult:false};
    this.prev={a1:false,a2:false,skill:false,skill2:false,ult:false};
    this.edge={a1:false,a2Press:false,skillPress:false,skillRelease:false,skill2:false,ultPress:false,ultRelease:false};
    this.skillCharging=false; this.skillChargeT=0;
    this.ultCharging=false; this.ultChargeT=0;
    this._initKeyboard(); this._initTouch();
  }
  _initKeyboard(){
    addEventListener('keydown',(e)=>{
      const k=e.key;
      if(k==='ArrowLeft'||k==='a'||k==='A') this.left=1;
      if(k==='ArrowRight'||k==='d'||k==='D') this.right=1;
      if(k===' '||k==='w'||k==='W'||k==='ArrowUp'){ this.jump=true; }
      if(k==='j'||k==='J') this.btn.a1=true;
      if(k==='k'||k==='K'){ if(!this.btn.a2){ this.btn.a2=true; this.edge.a2Press=true; } }
      if(k==='l'||k==='L'){ if(!this.btn.skill){ this.btn.skill=true; this.edge.skillPress=true; this.skillCharging=true; this.skillChargeT=0; } }
      if(k==='o'||k==='O'){ this.edge.skill2=true; this.btn.skill2=true; }
      if(k==='u'||k==='U'){ if(!this.btn.ult){ this.btn.ult=true; this.edge.ultPress=true; this.ultCharging=true; this.ultChargeT=0; } }
    },{passive:false});
    addEventListener('keyup',(e)=>{
      const k=e.key;
      if(k==='ArrowLeft'||k==='a'||k==='A') this.left=(this.right?1:0);
      if(k==='ArrowRight'||k==='d'||k==='D') this.right=(this.left?1:0);
      if(k==='j'||k==='J') this.btn.a1=false;
      if(k==='k'||k==='K') this.btn.a2=false;
      if(k==='l'||k==='L'){ if(this.btn.skill){ this.btn.skill=false; this.edge.skillRelease=true; this.skillCharging=false; } }
      if(k==='o'||k==='O') this.btn.skill2=false;
      if(k==='u'||k==='U'){ if(this.btn.ult){ this.btn.ult=false; this.ultCharging=false; this.edge.ultRelease=true; } }
    },{passive:false});
  }
  _initTouch(){
    const stickArea=document.getElementById('stickArea');
    const thumb=document.getElementById('stickThumb');
    let stickId=-1, origin=null;
    const updateStick=t=>{
      if(!origin) return;
      const dx=t.clientX-origin.x, dy=t.clientY-origin.y;
      const rMax=40, len=Math.hypot(dx,dy);
      const nx=(len>rMax? dx/len*rMax:dx);
      const ny=(len>rMax? dy/len*rMax:dy);
      thumb.style.left=`calc(50% + ${nx}px)`;
      thumb.style.top =`calc(50% + ${ny}px)`;
      this.left =(nx<-8)?1:0;
      this.right=(nx> 8)?1:0;
    };
    const onStart=e=>{
      for(const t of e.changedTouches){
        const r=stickArea.getBoundingClientRect();
        if(t.clientX>=r.left&&t.clientX<=r.right&&t.clientY>=r.top&&t.clientY<=r.bottom){
          stickId=t.identifier; origin={x:r.left+r.width/2,y:r.top+r.height/2}; updateStick(t);
        }
      }
    };
    const onMove=e=>{ for(const t of e.changedTouches){ if(t.identifier===stickId) updateStick(t); } };
    const onEnd =e=>{
      for(const t of e.changedTouches){
        if(t.identifier===stickId){
          stickId=-1; origin=null; thumb.style.left='50%'; thumb.style.top='50%'; this.left=0; this.right=0;
        }
      }
    };
    stickArea.addEventListener('touchstart',e=>{e.preventDefault();onStart(e);},{passive:false});
    stickArea.addEventListener('touchmove', e=>{e.preventDefault();onMove(e); },{passive:false});
    stickArea.addEventListener('touchend', e=>{e.preventDefault();onEnd(e); },{passive:false});
    stickArea.addEventListener('touchcancel',e=>{e.preventDefault();onEnd(e);},{passive:false});
    const bind=(id,onDown,onUp)=>{
      const el=document.getElementById(id);
      el.addEventListener('pointerdown',e=>{e.preventDefault(); onDown(); el.setPointerCapture?.(e.pointerId);});
      el.addEventListener('pointerup',  e=>{e.preventDefault(); onUp();   el.releasePointerCapture?.(e.pointerId);});
      el.addEventListener('pointercancel',()=>{ onUp(); });
      el.addEventListener('touchstart',e=>{e.preventDefault();onDown();},{passive:false});
      el.addEventListener('touchend',  e=>{e.preventDefault();onUp();},{passive:false});
    };
    bind('btnA1', ()=>{ this.btn.a1=true; }, ()=>{ this.btn.a1=false; });
    bind('btnA2', ()=>{ if(!this.btn.a2){ this.btn.a2=true; this.edge.a2Press=true; } }, ()=>{ this.btn.a2=false; });
    bind('btnSK', ()=>{ if(!this.btn.skill){ this.btn.skill=true; this.edge.skillPress=true; this.skillCharging=true; this.skillChargeT=0; } }, ()=>{ if(this.btn.skill){ this.btn.skill=false; this.edge.skillRelease=true; this.skillCharging=false; } });
    bind('btnSK2', ()=>{ this.edge.skill2=true; this.btn.skill2=true; }, ()=>{ this.btn.skill2=false; });
    bind('btnULT', ()=>{ if(!this.btn.ult){ this.btn.ult=true; this.edge.ultPress=true; this.ultCharging=true; this.ultChargeT=0; } },
                   ()=>{ if(this.btn.ult){ this.btn.ult=false; this.ultCharging=false; this.edge.ultRelease=true; } });
    bind('btnJMP', ()=>{ this.jump=true; }, ()=>{ });
  }
  consumeJump(){ const j=this.jump; this.jump=false; return j; }
  beginFrame(){
    this.edge.a1 = this.btn.a1 && !this.prev.a1;
    this.prev.a1=this.btn.a1; this.prev.a2=this.btn.a2; this.prev.skill=this.btn.skill; this.prev.skill2=this.btn.skill2; this.prev.ult=this.btn.ult;
  }
}
/* ================================
 * Character Base
 * ================================ */
class CharacterBase{
  constructor(world,opt){
    Object.assign(this,opt);
    this.vx=0; this.vy=0; this.flip=false;
    this.onGround=false; this.dead=false; this.atkCD=0;
    this.animT=0; this.comboStep=0; this.hpMax=this.hp; this.saT=0;
    this.knockVX=0; this.knockVY=0;
    this._prevX=this.x; this._prevY=this.y;
  }
  aabb(){ return {x:this.x, y:this.y-this.h/2, w:this.w, h:this.h}; }
  hurt(dmg,dir,opts={}){
    if(this.dead)return;
    if(this.saT>0 && !opts.ult){
      // SA中は硬直無視・ノックバック軽減
      dmg*=0.6;
      this.vx += dir*80;
      this.hp -= dmg;
    }else{
      this.hp -= dmg;
      this.vx = dir*350; this.vy=-300;
      this.onGround=false;
    }
    if(opts.ult){ // ULT貫通
      this.vx = dir*800; this.vy=-500;
      this.onGround=false;
    }
    if(this.hp<=0){ this.hp=0; this.dead=true; this.world.effects.addSpark(this.x,this.y,true); }
  }
  updatePhysics(dt){
    this._prevX=this.x; this._prevY=this.y;
    this.vy += GRAV*dt;
    this.vy = Math.min(this.vy,MAX_FALL);
    this.x += this.vx*dt;
    this.y += this.vy*dt;
    // ground
    if(this.y>=GROUND_TOP_Y){
      this.y=GROUND_TOP_Y; this.vy=0; this.onGround=true;
    }
    // stage bounds
    if(this.x<this.w/2+WALL_PAD){this.x=this.w/2+WALL_PAD;this.vx=0;}
    if(this.x>STAGE_RIGHT-this.w/2-WALL_PAD){this.x=STAGE_RIGHT-this.w/2-WALL_PAD;this.vx=0;}
  }
}

/* ================================
 * Player
 * ================================ */
class Player extends CharacterBase{
  constructor(world){
    super(world,{x:240,y:GROUND_TOP_Y,w:40,h:70,hp:1000});
    this.state='idle'; this.atkT=0; this.skillCharge=0; this.skillRot=0;
  }
  update(dt,input){
    if(this.dead)return;
    this.animT+=dt;
    if(this.saT>0)this.saT=Math.max(0,this.saT-dt);
    if(this.state==='hurt'){
      if(this.onGround)this.state='idle';
      return;
    }

    // 移動
    let dir=0;
    if(input.left&&!input.right)dir=-1;
    if(input.right&&!input.left)dir=1;
    this.vx=dir*MOVE;
    if(dir!==0)this.flip=(dir<0);

    // ジャンプ
    if(input.consumeJump() && this.onGround){
      this.vy=-JUMP_V; this.onGround=false;
    }

    // 攻撃①
    if(input.edge.a1 && this.atkT<=0){
      this.state='attack1'; this.atkT=0.4; this.comboStep=1;
      this.world.effects.addSpark(this.x+this.flip?-30:30,this.y);
      this._spawnHit(140,60,100,0.1);
    }
    if(this.state==='attack1'){
      this.atkT-=dt;
      if(this.atkT<=0){this.state='idle';}
    }

    // スキル①（溜め回転）
    if(input.skillCharging){
      this.skillCharge+=dt;
      this.world.effects.shake(0.02,2);
      this.skillRot+=dt*6;
    }
    if(input.edge.skillRelease){
      const charge=this.skillCharge;
      let spins=4; // 溜めなし4回転
      if(charge>1.2)spins=8; // フル溜め高速8回転
      this.skillCharge=0;
      this._doSpinAttack(spins);
    }

    // Skill2
    if(input.edge.skill2){
      this.saT=0.6;
      this.world.effects.addSpark(this.x,this.y,true);
      for(let i=0;i<4;i++){
        setTimeout(()=>this._spawnHit(160,60,80,0.1),i*100);
      }
    }

    // ULT
    if(input.edge.ultRelease){
      this._doULT();
    }

    // 重力など
    super.updatePhysics(dt);
  }
  _doSpinAttack(spins){
    const totalTime=spins*0.1;
    this.state='skillspin'; this.saT=totalTime;
    let hits=spins;
    const doHit=()=>{
      if(hits<=0)return;
      this.world.effects.addSpark(this.x,this.y);
      this._spawnHit(150,80,120,0.1);
      hits--; setTimeout(doHit,100);
    };
    doHit();
    setTimeout(()=>{this.state='idle';},totalTime*1000);
  }
  _doULT(){
    this.saT=1.2;
    this.world.effects.addSpark(this.x,this.y,true);
    for(let i=0;i<8;i++){
      setTimeout(()=>this._spawnHit(260,120,300,0.15,true),i*120);
    }
  }
  _spawnHit(range,knock,damage,life,ult=false){
    const hitbox={x:this.x+(this.flip?-range:range)/2,y:this.y-this.h/2,w:range,h:this.h};
    for(const e of this.world.enemies){
      if(!e.dead && rectsOverlap(hitbox,e.aabb())){
        const dir=this.flip?-1:1;
        e.hurt(damage,dir,{ult});
      }
    }
  }
  draw(ctx,world){
    ctx.save();
    ctx.translate(this.x-world.camX,this.y-world.camY);
    ctx.scale(this.flip?-1:1,1);
    ctx.fillStyle="#6cf";
    ctx.fillRect(-20,-70,40,70);
    ctx.restore();
  }
}

/* ================================
 * Enemy Base
 * ================================ */
class Enemy extends CharacterBase{
  constructor(world,opt){
    super(world,opt);
    this.aiT=0; this.dir=opt.flip?-1:1;
  }
  update(dt){
    if(this.dead)return;
    this.aiT+=dt;
    if(this.atkCD>0)this.atkCD-=dt;
    const pl=this.world.player;
    const distX=pl.x-this.x;
    this.flip=(distX<0);
    // 簡易追跡
    if(Math.abs(distX)>80)this.vx=(distX>0?1:-1)*MOVE*0.4;
    else this.vx=0;
    // 攻撃
    if(Math.abs(distX)<90 && this.atkCD<=0){
      this.atkCD=1.6;
      this._attack(pl);
    }
    super.updatePhysics(dt);
  }
  _attack(pl){
    const range=100;
    const hitbox={x:this.x+(this.flip?-range:range)/2,y:this.y-this.h/2,w:range,h:this.h};
    if(rectsOverlap(hitbox,pl.aabb())){
      pl.hurt(this.atk, this.flip?-1:1);
      this.world.effects.addSpark(pl.x,pl.y);
    }
  }
  draw(ctx,world){
    ctx.save();
    ctx.translate(this.x-world.camX,this.y-world.camY);
    ctx.scale(this.flip?-1:1,1);
    ctx.fillStyle=this.color;
    ctx.fillRect(-this.w/2,-this.h,this.w,this.h);
    ctx.restore();
  }
}

/* ================================
 * Enemy Variants
 * ================================ */
function createEnemyList(world){
  const baseY=GROUND_TOP_Y;
  const enemies=[
    {name:'ワルMOB', color:'#f44', atk:60, w:42, h:70, x:700, y:baseY},
    {name:'ゴレムロボ', color:'#aaa', atk:100, w:60, h:90, x:950, y:baseY},
    {name:'アイスロボ', color:'#9cf', atk:80, w:48, h:80, x:1200, y:baseY},
    {name:'アイスミニロボ', color:'#6cf', atk:40, w:36, h:60, x:1350, y:baseY},
    {name:'MOBガブキング', color:'#f8b400', atk:140, w:90, h:110, x:1600, y:baseY},
    {name:'MOB巨神', color:'#ccf', atk:180, w:110, h:140, x:1850, y:baseY},
    {name:'シールド', color:'#0ff', atk:0, w:50, h:80, x:2000, y:baseY},
    {name:'MOBスクリュー', color:'#fa6', atk:90, w:60, h:70, x:2150, y:baseY}
  ];
  for(const e of enemies){
    world.enemies.push(new Enemy(world,e));
  }
}

/* ================================
 * World / Stage
 * ================================ */
class World{
  constructor(){
    this.player=null;
    this.enemies=[];
    this.effects=new Effects();
    this.camX=0; this.camY=0;
  }
  start(){
    this.player=new Player(this);
    this.enemies=[];
    createEnemyList(this);
  }
  update(dt,input){
    this.effects.update(dt);
    if(this.effects.hitstop>0)return;
    this.player.update(dt,input);
    for(const e of this.enemies)e.update(dt);
    const p=this.player;
    this.camX=clamp(p.x-210,0,STAGE_RIGHT-420);
  }
  draw(ctx){
    ctx.clearRect(0,0,420,480);
    // 背景
    ctx.fillStyle="#111820";
    ctx.fillRect(0,0,420,480);
    // 地面（黒ライン削除→綺麗な床）
    ctx.fillStyle="#1c2530";
    ctx.fillRect(-this.camX,GROUND_TOP_Y,STAGE_RIGHT,480-GROUND_TOP_Y);
    // player & enemies
    this.player.draw(ctx,this);
    for(const e of this.enemies)e.draw(ctx,this);
    // effects
    this.effects.draw(ctx,this);
  }
}

/* ================================
 * Main Game
 * ================================ */
class Game{
  constructor(){
    this.canvas=document.getElementById('game');
    this.ctx=this.canvas.getContext('2d');
    this.world=new World();
    this.input=new Input();
    this.running=false; this.last=0;
  }
  start(){
    this.world.start();
    this.running=true;
    this.last=now();
    requestAnimationFrame(this.loop.bind(this));
  }
  loop(){
    if(!this.running)return;
    const t=now(), dt=(t-this.last)/1000; this.last=t;
    this.input.beginFrame();
    this.world.update(dt,this.input);
    this.world.draw(this.ctx);
    requestAnimationFrame(this.loop.bind(this));
  }
}

/* ================================
 * Boot
 * ================================ */
window.addEventListener('DOMContentLoaded',()=>{
  const game=new Game();
  const startBtn=document.getElementById('startBtn');
  startBtn.addEventListener('click',()=>{
    document.getElementById('titleOverlay').classList.add('hidden');
    game.start();
  });
});
})();
