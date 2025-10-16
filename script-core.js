// script-core.js — Core (Utils / Constants / Effects / Assets / Input / Base / Projectiles)
(function(){
'use strict';

/* ================================
 * Utils & Constants
 * ================================ */
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const now=()=>performance.now();
const rectsOverlap=(a,b)=> Math.abs(a.x-b.x)*2 < (a.w+b.w) && Math.abs(a.y-b.y)*2 < (a.h+b.h);

const STAGE_LEFT = 0;
const STAGE_RIGHT = 2200;
const WALL_PAD = 12;

const GRAV=2000, MOVE=260, JUMP_V=760, MAX_FALL=1200;
const GROUND_TOP_Y=360, FOOT_PAD=2;

/* ================================
 * Effects
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
    this.btn={a1:false,a2:false,skill:false,skill2:false,ult:false, ult2:false, p:false, air:false};
    this.prev={a1:false,a2:false,skill:false,skill2:false,ult:false,ult2:false,p:false,air:false};
    this.edge={a1:false,a2Press:false,skillPress:false,skillRelease:false,skill2:false,ultPress:false,ultRelease:false, ult2:false, p:false, air:false};
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
      if(k==='y'||k==='Y'){ if(!this.btn.ult2){ this.btn.ult2=true; this.edge.ult2=true; } }  // ULT2 直接発動
      if(k==='p'||k==='P'){ if(!this.btn.p){ this.btn.p=true; this.edge.p=true; } }
      if(k==='i'||k==='I'){ if(!this.btn.air){ this.btn.air=true; this.edge.air=true; } }
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
      if(k==='y'||k==='Y') this.btn.ult2=false;
      if(k==='p'||k==='P') this.btn.p=false;
      if(k==='i'||k==='I') this.btn.air=false;
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
      if(!el) return;
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
    bind('btnULT2', ()=>{ if(!this.btn.ult2){ this.btn.ult2=true; this.edge.ult2=true; } }, ()=>{ this.btn.ult2=false; });
    bind('btnJMP', ()=>{ this.jump=true; }, ()=>{ /* release */ });

    // 追加：P / AIR（A）
    bind('btnP',   ()=>{ if(!this.btn.p){ this.btn.p=true; this.edge.p=true; } }, ()=>{ this.btn.p=false; });
    bind('btnAIR', ()=>{ if(!this.btn.air){ this.btn.air=true; this.edge.air=true; } }, ()=>{ this.btn.air=false; });
  }
  consumeJump(){ const j=this.jump; this.jump=false; return j; }
  beginFrame(){
    this.edge.a1 = this.btn.a1 && !this.prev.a1;
    this.prev.a1=this.btn.a1; this.prev.a2=this.btn.a2; this.prev.skill=this.btn.skill; this.prev.skill2=this.btn.skill2; this.prev.ult=this.btn.ult; this.prev.ult2=this.btn.ult2;
    this.prev.p=this.btn.p; this.prev.air=this.btn.air;
  }
}

/* ================================
 * Character Base
 * ================================ */
class CharacterBase{
  constructor(w,h){
    this.w=w; this.h=h; this.x=0; this.y=0; this.vx=0; this.vy=0; this.face=1;
    this.onGround=false; this.state='idle'; this.animT=0;
    this.hp=100; this.maxhp=100; this.dead=false; this.deathT=0;
    this.invulnT=0; this.spinAngle=0; this.spinSpeed=0; this.fade=1; this.hurtT=0; this.maxHurt=0.22;
  }
  aabb(){ return {x:this.x, y:this.y, w:this.w*0.6, h:this.h*0.8}; }
  hurt(amount, dir, opts={}, effects){
    if(this.invulnT>0||this.dead) return false;
    this.hp=Math.max(0,this.hp-amount);
    const kbMul = (opts.kbMul??1), kbuMul=(opts.kbuMul??1);
    const baseKb = 140 + amount*12;
    const baseKbu = opts.lift ? 360 : (amount>=15? 300 : 210);
    this.vx = clamp(dir * baseKb * kbMul, -320, 320);
    this.vy = - clamp(baseKbu * kbuMul, 0, 420);
    this.x += dir * 3; this.face = -dir;
    this.state='hurt'; this.hurtT=0; this.animT=0; this.invulnT=0.35;
    if(effects) effects.addSpark(this.x, this.y-10, amount>=15);
    if(this.hp<=0){
      this.dead=true; this.vx = dir * 520; this.vy = -520; this.spinSpeed = 18; this.deathT = 0; this.fade = 1;
    }
    return true;
  }
  updatePhysics(dt){
    this.vy = Math.min(this.vy + GRAV*dt, MAX_FALL);
    this.x += this.vx*dt; this.y += this.vy*dt;

    const leftBound  = STAGE_LEFT  + WALL_PAD + this.w*0.4;
    const rightBound = STAGE_RIGHT - WALL_PAD - this.w*0.4;
    if(this.x < leftBound){ this.x = leftBound; this.vx = Math.max(this.vx, 0); }
    if(this.x > rightBound){ this.x = rightBound; this.vx = Math.min(this.vx, 0); }

    const top=Math.floor(GROUND_TOP_Y);
    if(this.y + this.h/2 >= top + FOOT_PAD){ this.y = top - this.h/2 + FOOT_PAD; this.vy=0; this.onGround=true; }
    else this.onGround=false;

    if(this.invulnT>0) this.invulnT=Math.max(0,this.invulnT-dt);
    if(this.state==='hurt'){
      this.hurtT+=dt; if(this.onGround || this.hurtT>=this.maxHurt){ this.state='idle'; }
    }
    if(this.dead){ this.deathT += dt; this.spinAngle += this.spinSpeed*dt; this.fade = clamp(1 - this.deathT/1.2, 0, 1); }
  }
  drawHPBar(ctx,world){
    const w=36, h=4, x=this.x-world.camX, y=this.y-world.camY - this.h/2 - 10;
    const ratio=Math.max(0,this.hp/this.maxhp);
    ctx.save(); ctx.translate(x,y);
    ctx.fillStyle='rgba(10,18,32,.7)'; ctx.fillRect(-w/2,-h/2,w,h);
    ctx.strokeStyle='#1a263d'; ctx.lineWidth=1; ctx.strokeRect(-w/2,-h/2,w,h);
    ctx.fillStyle='#7dd3fc'; ctx.fillRect(-w/2+1,-h/2+1,(w-2)*ratio,h-2);
    ctx.restore();
  }
}

/* ================================
 * Projectiles
 * ================================ */
class Projectile{
  constructor(world,x,y,dir,img,power=10){
    this.world=world; this.x=x; this.y=y; this.dir=dir; this.vx=160*dir; this.vy=0; this.img=img; this.power=power; this.life=3.2; this.dead=false; this.w=40; this.h=28;
  }
  aabb(){ return {x:this.x, y:this.y, w:this.w*0.9, h:this.h*0.9}; }
  update(dt){ if(this.dead) return; this.x+=this.vx*dt; this.y+=this.vy*dt; this.life-=dt; if(this.life<=0) this.dead=true; }
  draw(ctx){
    if(this.dead||!this.img) return; const img=this.img;
    const scale=this.h/img.height, w=img.width*scale, h=this.h;
    ctx.save(); ctx.translate(this.x-this.world.camX,this.y-this.world.camY); if(this.dir<0) ctx.scale(-1,1);
    ctx.imageSmoothingEnabled=false; ctx.drawImage(img, Math.round(-w/2), Math.round(-h/2), Math.round(w), Math.round(h));
    ctx.restore();
  }
}
class EnergyBall extends Projectile{
  constructor(world,x,y,dir,img,basePower=20,chargeSec=0, incrementPerTenth=1){
    super(world,x,y,dir,img,basePower);
    const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
    this.chargeSec = clamp(chargeSec,0,2.0);
    this.power = basePower + Math.floor(this.chargeSec / 0.1) * incrementPerTenth;
    const sizeMul = 1 + 0.55*(this.chargeSec/2);
    this.w = Math.round(48*sizeMul); this.h = Math.round(36*sizeMul);
    this.vx = (210 + 70*(this.chargeSec/2)) * dir;
    this.life = 3.6;
  }
}
class UltBlast extends Projectile{
  constructor(world,x,y,dir,img,chargeSec){
    super(world,x,y,dir,img,300);
    const lerp=(a,b,t)=>a+(b-a)*t; const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
    const cs = clamp(chargeSec,0,3.0);
    const sizeMul = lerp(0.35, 1.6, clamp(cs/3.0,0,1));
    this.w = Math.round(60*sizeMul);
    this.h = Math.round(60*sizeMul);
    this.vx = (230 + 120*sizeMul) * dir;
    this.life = 1.7 + 0.55*sizeMul;
  }
}
class GroundSpike extends Projectile{
  constructor(world,x,dir,img){
    super(world,x,Math.floor(GROUND_TOP_Y)-8,dir,img,80);
    this.vx = 0; this.h = 10; this.w = 42; this.life = 1.0; this.riseT=0; this.maxH=90;
  }
  aabb(){ return {x:this.x, y:this.y - this.h/2, w:this.w*0.9, h:this.h}; }
  update(dt){
    this.riseT += dt; this.h = Math.min(this.maxH, 10 + this.riseT*160);
    this.life -= dt; if(this.life<=0) this.dead=true;
  }
  draw(ctx){
    const img=this.img; if(!img) return;
    const scaleW=this.w/img.width, scaleH=this.h/img.height;
    ctx.save(); ctx.translate(this.x-this.world.camX, Math.floor(GROUND_TOP_Y)-this.world.camY); ctx.scale(1,-1);
    ctx.imageSmoothingEnabled=false; ctx.drawImage(img, Math.round(-img.width*scaleW/2), 0, Math.round(img.width*scaleW), Math.round(img.height*scaleH));
    ctx.restore();
  }
}

/* ================================
 * Export shared pieces
 * ================================ */
window.__GamePieces__ = {
  Effects, Assets, Input, CharacterBase,
  Projectile, EnergyBall, UltBlast, GroundSpike,
  constants:{ STAGE_LEFT, STAGE_RIGHT, WALL_PAD, GRAV, MOVE, JUMP_V, MAX_FALL, GROUND_TOP_Y, FOOT_PAD },
  utils:{ clamp, lerp, now, rectsOverlap }
};

})();
