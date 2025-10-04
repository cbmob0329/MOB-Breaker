// script.js  —— Rev: Stage1 + Container climb + Skill1 buff + No-clip fix
(function(){
'use strict';

/* ================================
 * Constants & Utils
 * ================================ */
const STAGE_LEFT = 0;
const STAGE_RIGHT = 2200;   // 端は見えない壁（描画はしない）
const WALL_PAD = 12;

const GRAV=2000, MOVE=260, JUMP_V=760, MAX_FALL=1200;
// ★ 赤ライン準拠：背景画像(480px高)に合わせた地面Y
const GROUND_TOP_Y=437, FOOT_PAD=2;

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
    bind('btnJMP', ()=>{ this.jump=true; }, ()=>{ /* release */ });
  }
  consumeJump(){ const j=this.jump; this.jump=false; return j; }
  beginFrame(){
    this.edge.a1 = this.btn.a1 && !this.prev.a1;
    this.prev.a1=this.btn.a1; this.prev.a2=this.btn.a2; this.prev.skill=this.btn.skill; this.prev.skill2=this.btn.skill2; this.prev.ult=this.btn.ult;
  }
}

/* ================================
 * Character Base — 強ヒットぶっ飛び＋スピン
 * ================================ */
let __UID=1;
class CharacterBase{
  constructor(w,h){
    this.uid=__UID++;
    this.w=w; this.h=h; this.x=0; this.y=0; this.vx=0; this.vy=0; this.face=1;
    this.onGround=false; this.state='idle'; this.animT=0;
    this.hp=100; this.maxhp=100; this.dead=false; this.deathT=0;
    this.invulnT=0; this.spinAngle=0; this.spinSpeed=0; this.fade=1; this.hurtT=0; this.maxHurt=0.22;
    this._prevX=0; this._prevY=0;
  }
  aabb(){ return {x:this.x, y:this.y, w:this.w*0.6, h:this.h*0.8}; }

  hurt(amount, dir, opts={}, effects){
    if(this.invulnT>0||this.dead) return false;

    // 強ヒット判定
    const strongPower = amount>=40;
    const strongKbMul = (opts.kbMul||1) >= 1.4;
    const isULT = opts.tag==='ult';
    const isStrong = strongPower || strongKbMul || isULT;

    this.hp=Math.max(0,this.hp-amount);

    // ノックバック
    const baseKb = 140 + amount*12;
    const baseKbu = opts.lift ? 360 : (amount>=15? 300 : 210);

    const kbMulIn = (opts.kbMul??1);
    const kbuMulIn= (opts.kbuMul??1);

    // 追加倍率
    const STRONG_X = isStrong ? 1.75 : 1.0;
    const STRONG_Y = isStrong ? 1.65 : 1.0;

    this.vx = clamp(dir * baseKb * kbMulIn * STRONG_X, -640, 640);
    this.vy = - clamp(baseKbu * kbuMulIn * STRONG_Y, 0, 620);

    this.x += dir * (isStrong? 4 : 2);
    this.face = -dir;

    this.state='hurt'; this.hurtT=0; this.animT=0; this.invulnT=0.35;

    // スキル①等で回転演出
    if(opts.tag==='skill'){ this.spinSpeed = Math.max(this.spinSpeed, 12 + amount*0.12); }

    if(effects){
      effects.addSpark(this.x, this.y-10, isStrong || amount>=15);
      if(isStrong){ effects.shake(0.18,10); effects.hitstop=Math.max(effects.hitstop,0.11); }
    }

    if(this.hp<=0){
      this.dead=true; this.vx = dir * 540; this.vy = -560; this.spinSpeed = 18; this.deathT = 0; this.fade = 1;
    }
    return true;
  }

  updatePhysics(dt, world){
    this._prevX=this.x; this._prevY=this.y;

    this.vy = Math.min(this.vy + GRAV*dt, MAX_FALL);
    this.x += this.vx*dt; this.y += this.vy*dt;

    const leftBound  = STAGE_LEFT  + WALL_PAD + this.w*0.4;
    const rightBound = STAGE_RIGHT - WALL_PAD - this.w*0.4;
    if(this.x < leftBound){ this.x = leftBound; this.vx = Math.max(this.vx, 0); }
    if(this.x > rightBound){ this.x = rightBound; this.vx = Math.min(this.vx, 0); }

    // 地面
    const top=Math.floor(GROUND_TOP_Y);
    if(this.y + this.h/2 >= top + FOOT_PAD){ this.y = top - this.h/2 + FOOT_PAD; this.vy=0; this.onGround=true; }
    else this.onGround=false;

    // ★ 障害物コリジョン
    if(world && world.obstacles?.length){ world.resolveCollisions(this); }

    if(this.invulnT>0) this.invulnT=Math.max(0,this.invulnT-dt);
    if(this.state==='hurt'){
      this.hurtT+=dt; if(this.onGround || this.hurtT>=this.maxHurt){ this.state='idle'; }
    }

    // スピン更新（非死亡時も回転）
    if(this.spinSpeed>0){
      this.spinAngle += this.spinSpeed*dt;
      this.spinSpeed  = Math.max(0, this.spinSpeed - dt*8);
      if(this.onGround && !this.dead) this.spinSpeed=0;
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
 * Container Obstacle（側面ストップ＋AIスロット）
 * ================================ */
class Obstacle{
  constructor(world, img, x, w=160, h=80){
    this.world=world; this.img=img; this.x=x; this.w=w; this.h=h;
    // 地面に設置（底面=地面）
    this.y=Math.floor(GROUND_TOP_Y)-h/2+FOOT_PAD;
    // 登攀管理
    this.maxOcc=2;
    this.occupants=new Set();
    this.resv=new Map(); // uid -> expiry
    this.lastClimbStart=0;
    this.stepZone=20;
  }
  rect(){ return {x:this.x, y:this.y, w:this.w, h:this.h}; }
  draw(ctx){
    if(!this.img) return;
    const scaleH=this.h/this.img.height, w=this.img.width*scaleH, h=this.h;
    ctx.save(); ctx.translate(this.x-this.world.camX, this.y-this.world.camY);
    ctx.imageSmoothingEnabled=false; ctx.drawImage(this.img, Math.round(-w/2), Math.round(-h/2), Math.round(w), Math.round(h));
    ctx.restore();
  }
  cleanup(){
    const t=now()/1000;
    for(const [uid,exp] of [...this.resv]){ if(t>exp) this.resv.delete(uid); }
  }
  hasFreeSlot(){ this.cleanup(); return (this.occupants.size + this.resv.size) < this.maxOcc; }
  reserve(uid, ttl=3){ this.cleanup(); if(this.hasFreeSlot()){ this.resv.set(uid, now()/1000 + ttl); return true; } return false; }
  startClimb(uid){ this.resv.delete(uid); this.lastClimbStart=now()/1000; }
  enter(uid){ this.occupants.add(uid); }
  leave(uid){ this.occupants.delete(uid); this.resv.delete(uid); }
  edgeLeft(){ return this.x - this.w/2; }
  edgeRight(){ return this.x + this.w/2; }
  top(){ return this.y - this.h/2; }
}

/* ================================
 * Player
 * ================================ */
class Player extends CharacterBase{
  constructor(assets, world, effects){
    super(56,64);
    this.assets=assets; this.world=world; this.effects=effects;
    this.x=100; this.y=Math.floor(GROUND_TOP_Y)-this.h/2+FOOT_PAD;
    this.hp=1000; this.maxhp=1000; this.lives=3;

    this.maxJumps=2; this.jumpsLeft=this.maxJumps;

    this.comboStep=0; this.comboGraceT=0; this.comboGraceMax=0.24;
    this.bufferA1=false; this.a2LockoutT=0;
    this.skillCDT=0; this.skill2CDT=0; this.ultCDT=0;

    this.saT=0;
    this.isUltCharging=false;

    this.frames={
      idle:['M1-1.png'],
      run:['M1-2.png','M1-3.png','M1-4.png','M1-3.png'],
      k1prep:'K1-3.png', k1a:'K1-1.png', k1b:'K1-2.png', k1c:'K1-4.png',
      k2prep:'K1-3.png', k2:'K1-5.png',
      spin:['h1.png','h2.png','h3.png','h4.png'],
      chaseJump:'J.png',
      y1:'Y1.png', y2:'Y2.png', y3:'Y3.png', y4:'Y4.png',
      ul1:'UL1.PNG', ul2:'UL2.PNG', ul3:'UL3.png'
    };
    this.overhead=this._createOverheadGauge();
    document.querySelector('.gamewrap').appendChild(this.overhead.root);

    this._activeSpikes=null;
  }
  _getFramePath(key, i=0){ const v=this.frames[key]; return Array.isArray(v)? v[Math.max(0,Math.min(v.length-1,i))] : v; }
  _imgByKey(key,i=0){ return this.world.assets.img(this._getFramePath(key,i)); }
  _createOverheadGauge(){
    const root=document.createElement('div'); root.className='overhead';
    const g=document.createElement('div'); g.className='gauge'; const i=document.createElement('i'); g.appendChild(i);
    const label=document.createElement('span'); label.style.fontSize='10px'; label.style.color='#b8c7e3';
    root.appendChild(g); root.appendChild(label);
    return {root, gauge:g, fill:i, label};
  }
  _posOverhead(){
    const w=this.world, headY=this.y-this.h/2-10;
    this.overhead.root.style.left=((this.x-w.camX)*w.screenScaleX)+'px';
    this.overhead.root.style.bottom=(w.gameH-(headY-w.camY))*w.screenScaleY+'px';
  }
  _showGauge(show, text='', ratio=0){
    this.overhead.root.style.display=show?'flex':'none';
    this.overhead.label.textContent=text;
    this.overhead.fill.style.width=((ratio*100)|0)+'%';
  }
  currentHitbox(){
    if(!(this.state==='atk'||this.state==='skill'||this.state==='skill2'||this.state==='ult') || !this._actionSeq) return null;
    const cur=this._actionSeq[this._actionIndex]; if(!cur) return null;
    if(this.state==='skill' || this.state==='skill2' || this.state==='ult'){
      const W=86,H=64; const x=this.x + this.face*(this.w*0.2);
      return {x, y:this.y, w:W, h:H, power:cur.power||0, dir:this.face, lift:cur.lift||0, kbMul:cur.kbMul||1.9, kbuMul:cur.kbuMul||1.6, tag:cur.tag};
    }
    if(cur.kind==='hit' || cur.kind==='sp'){
      const w=52, h=42, x=this.x + this.face*(this.w*0.3 + w*0.5), y=this.y - 6;
      return {x,y,w,h, power:cur.power||0, dir:this.face, lift:cur.lift||1, kbMul:cur.kbMul||1, kbuMul:cur.kbuMul||1, tag:cur.tag};
    }
    return null;
  }
  update(dt,input,world,enemies){
    input.beginFrame(); this._posOverhead();
    if(this.saT>0) this.saT=Math.max(0,this.saT-dt);

    if(this.state!=='atk' && this.state!=='skill' && this.state!=='skill2' && this.state!=='ult' && this._actionSeq){ this._actionSeq=null; }
    if(this.a2LockoutT>0) this.a2LockoutT=Math.max(0,this.a2LockoutT-dt);

    const skBtn=document.getElementById('btnSK'); const sk2Btn=document.getElementById('btnSK2'); const ultBtn=document.getElementById('btnULT');
    if(this.skillCDT>0){ this.skillCDT=Math.max(0,this.skillCDT-dt); skBtn.setAttribute('disabled',''); } else skBtn.removeAttribute('disabled');
    if(this.skill2CDT>0){ this.skill2CDT=Math.max(0,this.skill2CDT-dt); sk2Btn.setAttribute('disabled',''); } else sk2Btn.removeAttribute('disabled');
    if(this.ultCDT>0){ this.ultCDT=Math.max(0,this.ultCDT-dt); ultBtn.setAttribute('disabled',''); } else ultBtn.removeAttribute('disabled');

    if(this.dead){ this.updatePhysics(dt,world); if(this.fade<=0){ this._respawn(world); } world.updateTimer(dt); return; }

    // ● スキル1チャージ
    if(input.skillCharging && this.skillCDT<=0){
      input.skillChargeT=Math.min(1.0, input.skillChargeT+dt);
      this._showGauge(true,'● Charge', input.skillChargeT/1.0);
      this.saT = 0.08;
    }
    // ULT
    this.isUltCharging = input.ultCharging && this.ultCDT<=0;
    if(this.isUltCharging){
      input.ultChargeT = Math.min(3, input.ultChargeT + dt);
      this._showGauge(true,'U Charge', input.ultChargeT/3);
      this.saT = 0.12;
    }

    // リリース
    if(input.edge.skillRelease && input.skillChargeT>0 && this.skillCDT<=0){
      this._startSkill1Release(input.skillChargeT);
      input.skillChargeT=0; input.edge.skillRelease=false;
    }
    if(input.edge.ultRelease && input.ultChargeT>0 && this.ultCDT<=0){
      this._releaseULT(input.ultChargeT);
      input.ultChargeT=0; input.edge.ultRelease=false;
    }

    // 実行中
    if(this.state==='atk'||this.state==='skill'||this.state==='skill2'||this.state==='ult'){
      const hb=this.currentHitbox();
      if(hb){
        for(const e of enemies){
          if(!e || e.dead || e.invulnT>0) continue;
          if(rectsOverlap({x:hb.x,y:hb.y,w:hb.w,h:hb.h}, e.aabb())){
            const hit = e.hurt(hb.power, hb.dir, {lift:hb.lift, kbMul:hb.kbMul, kbuMul:hb.kbuMul, tag:hb.tag}, this.effects);
            if(hit){
              // ★ すり抜け対策：即時押し戻し＆前進抑制
              const push = 10;
              e.x += hb.dir * push;
              this.x -= hb.dir * 6;
              this.vx *= 0.2;
            }
          }
        }
      }
      this._updateAction(dt,world,input);
      world.updateTimer(dt);
      return;
    }

    // 入力
    if(input.edge.a1) this.bufferA1=true;

    // 起動優先
    if(input.edge.skill2 && this.skill2CDT<=0){ input.edge.skill2=false; this.bufferA1=false; this._startSkill2(); return; }
    if(input.edge.a2Press && this.a2LockoutT<=0){ input.edge.a2Press=false; this.bufferA1=false; this._startA2(); return; }
    if(this.bufferA1 && this.comboStep<3){ this.bufferA1=false; this._startA1(); return; }

    // 移動/ジャンプ
    let ax=0; if(input.left){ ax-=MOVE; this.face=-1; } if(input.right){ ax+=MOVE; this.face=1; }
    this.vx = ax!==0 ? (ax>0?MOVE:-MOVE) : 0;
    if(input.consumeJump() && this.jumpsLeft>0){ this.vy=-JUMP_V; this.onGround=false; this.jumpsLeft--; }
    this.updatePhysics(dt,world);
    if(this.onGround) this.jumpsLeft=this.maxJumps;
    this.state = !this.onGround ? 'jump' : (Math.abs(this.vx)>1?'run':'idle');

    if(!(input.skillCharging||this.isUltCharging)) this._showGauge(false);
    world.updateTimer(dt);
  }

  _startA1(){
    this.state='atk'; this.animT=0; this.comboStep=Math.min(this.comboStep+1,3);
    const seq=[ {kind:'prep',dur:0.08,frame:'k1prep',fx:80,power:0} ];
    let frame='k1a', power=6, fx=140;
    if(this.comboStep===2){ frame='k1b'; power=9; fx=170; }
    else if(this.comboStep===3){ frame='k1c'; power=12; fx=200; }
    seq.push({kind:'hit',dur:0.20,frame,fx,power, kbMul:1.0, kbuMul:1.0});
    this._actionSeq=seq; this._actionIndex=0; this._actionTime=0;
  }
  _startA2(){
    this.state='atk'; this.animT=0;
    this._actionSeq=[
      {kind:'prep',dur:0.10,frame:'k2prep',fx:90,power:0},
      {kind:'hit', dur:0.22,frame:'k2',fx:220,power:18, lift:1.0, kbMul:1.15, kbuMul:1.2, after:'enableChase'}
    ];
    this._actionIndex=0; this._actionTime=0; this.a2LockoutT = 0.35;
    this._chaseWindowT = 0; this._chaseEnabled=false; this._chaseConsumed=false;
  }
  _startA2Chase(){
    this.state='atk'; this.animT=0;
    const seq=[
      {kind:'pose',dur:0.12,frame:'chaseJump',fx:260,power:0},
      {kind:'hit', dur:0.24,frame:'k1c',fx:280,power:50, lift:1.0, kbMul:1.2, kbuMul:1.2, tag:'chaseFinisher'}
    ];
    this._actionSeq=seq; this._actionIndex=0; this._actionTime=0;
    this._chaseEnabled=false; this._chaseConsumed=true;
    this.a2LockoutT=0.6;
  }
  _startSkill1Release(chargeSec){
    this.state='skill'; this.animT=0; this.skillCDT=5.0;
    const t=clamp(chargeSec,0,1.0);
    const rounds = 2 + Math.floor(t/0.33);
    const base   = 34 + Math.floor(t/0.1)*3;  // ★ 火力UP
    const kbm  = 1.9 + 0.12*(rounds-2);       // ★ KB強化
    const kbum = 1.6 + 0.06*(rounds-2);
    const frames=this.frames.spin; const seq=[];
    for(let r=0;r<rounds;r++){
      for(let i=0;i<frames.length;i++){
        // i===1 を強めに（逓増感）
        const pow = base*(i===1?1.15:0.65);
        const lift=(i===1?1:0);
        seq.push({kind:'sp',dur:0.06,frame:frames[i],fx:80,power:pow,lift, kbMul:kbm, kbuMul:kbum, tag:'skill'});
      }
    }
    this._actionSeq=seq; this._actionIndex=0; this._actionTime=0;
    this._showGauge(false);
  }
  _startSkill2(){
    if(this.skill2CDT>0) return;
    this.state='skill2'; this.animT=0; this.skill2CDT=10.0;
    this._skill2SAT = 1.6;
    this._actionSeq=[
      {kind:'hit', dur:0.12, frame:'y1', fx:30, power:5,  tag:'skill'},
      {kind:'hit', dur:0.12, frame:'y2', fx:30, power:5,  tag:'skill'},
      {kind:'hit', dur:0.12, frame:'y3', fx:30, power:5,  tag:'skill'},
      {kind:'hit', dur:0.12, frame:'y4', fx:0,  power:10, tag:'skill'},
      {kind:'emit',dur:1.00,  frame:'y4', fx:0,  power:0}
    ];
    this._actionIndex=0; this._actionTime=0;

    const kem=this.world.assets.img('kem.png');
    if(kem){
      const off=68;
      const L=new GroundSpike(this.world, this.x - off, -1, kem);
      const R=new GroundSpike(this.world, this.x + off,  1, kem);
      (this.world._skillBullets||(this.world._skillBullets=[])).push(L,R);
      this._activeSpikes=[L,R];
      this.effects.shake(0.12,6);
    }
  }
  _releaseULT(chargeSec){
    if(this.ultCDT>0) return;
    this.state='ult'; this.animT=0;
    this._actionSeq=[
      {kind:'pose',dur:0.10,frame:'ul2',fx:40},
      {kind:'post',dur:0.22,frame:'ul2',fx:20}
    ];
    this._actionIndex=0; this._actionTime=0;

    this.ultCDT=3.0;

    const img=this.world.assets.img(this.frames.ul3);
    const ox=this.face*30, oy=-12;
    const blast=new UltBlast(this.world, this.x+ox, this.y+oy, this.face, img, chargeSec);
    (this.world._skillBullets||(this.world._skillBullets=[])).push(blast);
    this.saT=0;
    this._showGauge(false);
    this.effects.addSpark(this.x+ox, this.y-14, true);
  }
  _updateAction(dt,world,input){
    const cur=this._actionSeq?.[this._actionIndex];

    if(this.state==='skill2'){
      this._skill2SAT = Math.max(0, this._skill2SAT - dt);
      this.saT = Math.max(this.saT, 0.08);
    }

    if(cur?.fx){ this.x += this.face * cur.fx * dt; }

    if(this._actionSeq && this.state==='atk' && cur?.after==='enableChase'){
      this._chaseWindowT = (this._chaseWindowT||0) + dt;
      if(this._chaseWindowT>0.18 && !this._chaseEnabled){ this._chaseEnabled=true; }
      if(this._chaseEnabled && input.edge.a2Press && !this._chaseConsumed){
        input.edge.a2Press=false; this._startA2Chase(); return;
      }
    }

    if((this.state==='skill2' && (cur.frame==='y4' || cur.kind==='emit')) || this.state==='ult'){
      const ox=Math.sin(performance.now()/25)*2; this._shakeOX = ox;
    } else this._shakeOX=0;

    this.vx = 0; this.updatePhysics(dt,world);

    if(this._actionSeq){
      this._actionTime+=dt;
      if(this._actionTime>=cur.dur){
        this._actionIndex++; this._actionTime=0;
        if(this._actionIndex>=this._actionSeq.length){
          if(this.state==='atk' && this.comboStep>0){ this.comboGraceT=this.comboGraceMax; if(this.comboStep>=3){ this.comboStep=0; this.bufferA1=false; } }
          if(this.state==='skill2'){ this._activeSpikes=null; }
          this.state='idle'; this._actionSeq=null;
        }
      }
    }
    this.animT+=dt;
  }
  _respawn(world){
    this.dead=false; this.fade=1; this.spinAngle=0; this.spinSpeed=0;
    this.state='idle'; this.comboStep=0; this.comboGraceT=0; this.bufferA1=false;
    this.invulnT=0.6; this.hp=this.maxhp;
    document.getElementById('hpfill').style.width='100%'; document.getElementById('hpnum').textContent=this.hp;
    this.x=world.camX+80; this.y=Math.floor(GROUND_TOP_Y)-this.h/2+FOOT_PAD; this.vx=0; this.vy=0;
    this.jumpsLeft=this.maxJumps; this.saT=0; this._activeSpikes=null; this.isUltCharging=false;
  }
  draw(ctx,world){
    ctx.save(); ctx.translate(this.x-world.camX, this.y-world.camY);
    if(this.dead){ ctx.globalAlpha=this.fade; ctx.rotate(this.spinAngle); }
    if(this.face<0 && !this.dead) ctx.scale(-1,1);

    let img=null, ox=this._shakeOX||0;
    if(this.state==='idle'){ img=this._imgByKey('idle',0); }
    else if(this.state==='run'){
      const speed=Math.abs(this.vx);
      const rate = lerp(6, 11, clamp(speed/MOVE, 0, 1));
      const i=Math.floor(this.animT*rate)%this.frames.run.length;
      img=this._imgByKey('run',i);
    }
    else if(this.state==='jump'){ img=this._imgByKey('run',0); }
    else if((this.state==='atk'||this.state==='skill'||this.state==='skill2'||this.state==='ult') && this._actionSeq){
      const cur=this._actionSeq[this._actionIndex]; const key=cur.frame; img=this.world.assets.img(this.frames[key]?this._getFramePath(key,0):key);
    } else img=this._imgByKey('idle',0);

    if(img){
      const scale=this.h/img.height, w=img.width*scale, h=this.h;
      ctx.imageSmoothingEnabled=false; ctx.drawImage(img, Math.round(-w/2+ox), Math.round(-h/2), Math.round(w), Math.round(h));
    }

    if(this.isUltCharging){
      const holder=this.world.assets.img(this.frames.ul1);
      if(holder){
        const scale=this.h/holder.height, w=holder.width*scale, h=this.h;
        ctx.save(); if(this.face<0) ctx.scale(-1,1);
        ctx.globalAlpha=0.95; ctx.drawImage(holder, Math.round(-w/2), Math.round(-h/2), Math.round(w), Math.round(h));
        ctx.restore();
      }
      const ul3=this.world.assets.img(this.frames.ul3);
      if(ul3){
        const t=Math.min(3, (window._inputUltT||0));
        const mul = lerp(0.35, 1.6, clamp(t/3.0,0,1));
        const hh=60*mul, ww=60*mul; const oxh = this.face*26, oyh=-14;
        ctx.save(); ctx.translate(oxh, oyh); if(this.face<0) ctx.scale(-1,1); ctx.globalAlpha=0.95; ctx.drawImage(ul3, Math.round(-ww/2), Math.round(-hh/2), Math.round(ww), Math.round(hh)); ctx.restore();
      }
    }
    ctx.restore();
  }
}

/* ================================
 * Export core pieces for Part 2
 * ================================ */
window.__GamePieces__ = {
  Effects, Assets, Input, CharacterBase,
  Projectile, EnergyBall, UltBlast, GroundSpike, Obstacle,
  Player,
  constants:{ STAGE_LEFT, STAGE_RIGHT, WALL_PAD, GRAV, MOVE, JUMP_V, MAX_FALL, GROUND_TOP_Y, FOOT_PAD },
  utils:{ clamp, lerp, now, rectsOverlap }
};

})();
// ===== Part 2 =====
(function(){
'use strict';

const {
  Effects, Assets, Input, CharacterBase,
  Projectile, EnergyBall, UltBlast, GroundSpike, Obstacle,
  Player,
  constants, utils
} = window.__GamePieces__ || {};

const { STAGE_LEFT, STAGE_RIGHT, WALL_PAD, GRAV, MOVE, JUMP_V, MAX_FALL, GROUND_TOP_Y, FOOT_PAD } = constants;
const { clamp, lerp, now, rectsOverlap } = utils;

/* =========================================
 * Small helper for UI HP
 * ========================================= */
const updateHPUI=(hp,maxhp)=>{
  const fill=document.getElementById('hpfill');
  document.getElementById('hpnum').textContent=hp;
  fill.style.width=Math.max(0,Math.min(100,(hp/maxhp)*100))+'%';
};

/* =========================================
 * Enemy: WaruMOB（側面登攀対応）
 * ========================================= */
class WaruMOB extends CharacterBase{
  constructor(world,effects,assets,x=520){
    super(52,60); this.world=world; this.effects=effects; this.assets=assets;
    this.x=x; this.y=Math.floor(GROUND_TOP_Y)-this.h/2+FOOT_PAD; this.face=-1; this.maxhp=100; this.hp=100;
    this.cool=0; this._seq=null; this._idx=0; this._t=0; this.projectiles=[];
    this.brainT=0; this.intent='patrol';

    // 登攀
    this.role='ground';
    this.climbResvUntil=0;
    this.onContainer=false; this.onTTL=0;
    this.nextTry=0;
  }
  imgByKey(key){ const a=this.assets; const map={ idle:'teki1.png', walk1:'teki1.png', walk2:'teki2.png', prep1:'teki1.png', prep2:'teki3.png' }; return a.img(map[key]||'teki1.png'); }
  addBullet(){ const img=this.assets.img('teki7.png'); const ox=this.face*28; const oy=-8; this.projectiles.push(new Projectile(this.world,this.x+ox,this.y+oy,this.face,img,10)); }
  aabb(){ return {x:this.x, y:this.y, w:this.w*0.6, h:this.h*0.85}; }

  // 軽量：通常でもやや吹っ飛ぶ
  hurt(amount, dir, opts={}, effects){
    opts = {...opts, kbMul:(opts.kbMul??1)*1.25, kbuMul:(opts.kbuMul??1)*1.2};
    const hit = super.hurt(amount, dir, opts, effects);
    if(hit && this.onContainer){ // 落下優先（密集抑制）
      this.onTTL = Math.min(this.onTTL, 0.3);
    }
    return hit;
  }

  _tryReserve(container){
    const t=now()/1000;
    if(t<this.nextTry) return false;
    if((t - container.lastClimbStart) < 1.2) return false; // 同時登攀インターバル
    if(container.reserve(this.uid,3)){ this.climbResvUntil = now()/1000 + 3; this.nextTry = t + 6; return true; }
    return false;
  }

  update(dt,player){
    if(this.dead){ this.updatePhysics(dt,this.world); return; }
    // プロジェクタイル更新
    for(const p of this.projectiles) p.update(dt);
    this.projectiles=this.projectiles.filter(p=>!p.dead);

    if(this.cool>0) this.cool=Math.max(0,this.cool-dt);

    // 登攀/滞在ロジック
    const container=this.world.container;
    if(container){
      // 上にいる
      if(this.onContainer){
        this.onTTL -= dt;
        // 間隔維持
        const want = (this.uid % 2 === 0)? -1 : 1;
        this.vx = want * 40;
        if(this.onTTL<=0){
          // 降りる
          container.leave(this.uid);
          this.onContainer=false; this.vx = (this.face)*80; // ちょい歩く
        }
        this.updatePhysics(dt,this.world);
        this.state = !this.onGround ? 'jump' : (Math.abs(this.vx)>1?'run':'idle');
        this.animT+=dt;
        return;
      }

      // 予約が有効＆ステップゾーンに入ったらジャンプ
      const inStepL = (this.x > container.edgeLeft()-this.w/2-2)  && (this.x < container.edgeLeft()+container.stepZone);
      const inStepR = (this.x < container.edgeRight()+this.w/2+2) && (this.x > container.edgeRight()-container.stepZone);
      const t=now()/1000;

      // 近いなら予約を試みる
      const adx = Math.abs(this.x - container.x);
      if(adx<260 && t<this.climbResvUntil){
        // ステップへ移動
        if(inStepL || inStepR){
          // 登る
          container.startClimb(this.uid);
          this.vy = -JUMP_V*0.55;
          // 上に着地できたら occupy
          // 判定は物理後
        }else{
          const aim = inStepL ? container.edgeLeft() : (inStepR ? container.edgeRight() : (this.x<container.x? container.edgeLeft()-6 : container.edgeRight()+6));
          this.vx = (this.x<aim? MOVE*0.7 : -MOVE*0.7);
        }
      }else if(adx<260 && container.hasFreeSlot()){
        this._tryReserve(container);
      }
    }

    // 実行中のモーション処理
    if(this.state==='atk'){
      this.updatePhysics(dt,this.world); if(this._seq){
        this._t+=dt; const cur=this._seq[this._idx];
        if(cur && this._t>=cur.dur){
          this._idx++; this._t=0;
          if(this._idx===2){ this.addBullet(); }
          if(this._idx>=this._seq.length){ this._seq=null; this.state='idle'; }
        }
      }
      this.animT+=dt; return;
    }

    // 物理
    // 予約移動中は vx をそのまま、そうでなければ通常AI
    if(!(container && now()/1000<this.climbResvUntil)){
      // ブレイン更新
      this.brainT-=dt;
      if(this.brainT<=0){
        this.brainT=0.4+Math.random()*0.2;
        const dx=player.x-this.x, adx=Math.abs(dx);
        this.face = dx>=0?1:-1;

        if(adx<110) this.intent = Math.random()<0.55 ? 'backstep' : 'strafe';
        else if(adx<220) this.intent = Math.random()<0.5 ? 'strafe' : 'shoot';
        else this.intent = 'approach';
      }

      const dx=player.x-this.x, adx=Math.abs(dx);
      const dir = dx>=0?1:-1;

      let targetVX=0;
      if(this.intent==='approach'){
        targetVX = dir*90;
      }else if(this.intent==='backstep'){
        targetVX = -dir*120;
      }else if(this.intent==='strafe'){
        const s = (Math.sin(performance.now()/300)+1)/2;
        targetVX = dir*(60 + s*60) * (Math.random()<0.5?1:-1);
      }else if(this.intent==='shoot'){
        targetVX = 0;
        if(this.cool<=0){
          this._seq=[ {kind:'pose',dur:0.22,key:'prep1'}, {kind:'pose',dur:0.26,key:'prep2'} ];
          this.cool=2.2 + Math.random()*0.8;
          this.state='atk'; this._idx=0; this._t=0; this.vx=0; this.animT=0;
          return;
        }
      }

      if(adx<180 && this.cool<=0 && Math.random()<0.25){
        this._seq=[ {kind:'pose',dur:0.22,key:'prep1'}, {kind:'pose',dur:0.26,key:'prep2'} ];
        this.cool=2.4 + Math.random()*1.0;
        this.state='atk'; this._idx=0; this._t=0; this.vx=0; this.animT=0;
        return;
      }
      this.vx = targetVX;
    }

    this.updatePhysics(dt,this.world);

    // コンテナ上に着いたか？
    if(container && !this.onContainer){
      const top=container.top();
      if(this.y + this.h/2 >= top-1 && this._prevY + this.h/2 <= top-4 &&
         this.x > container.edgeLeft()-this.w*0.3 && this.x < container.edgeRight()+this.w*0.3){
        // 上面にスナップ
        this.y = top - this.h/2 + FOOT_PAD;
        this.vy=0; this.onGround=true;
        container.enter(this.uid);
        this.onContainer=true;
        this.onTTL = 4 + Math.random()*3;
      }
    }

    this.state = !this.onGround ? 'jump' : (Math.abs(this.vx)>1?'run':'idle');
    this.animT+=dt;
  }
  draw(ctx,world){
    ctx.save(); ctx.translate(this.x-world.camX, this.y-world.camY);
    if(this.dead){ ctx.globalAlpha=this.fade; ctx.rotate(this.spinAngle); }
    else if(this.spinSpeed>0){ ctx.rotate(this.spinAngle*0.7); }
    if(this.face<0 && !this.dead) ctx.scale(-1,1);
    let img=null;
    if(this.state==='atk' && this._seq){ const cur=this._seq[this._idx]; img=this.imgByKey(cur.key||'prep2'); }
    else if(this.state==='run'){ const f=Math.floor(this.animT*6)%2; img=this.imgByKey(f? 'walk1':'walk2'); }
    else { img=this.imgByKey('idle'); }
    if(img){ const scale=this.h/img.height, w=img.width*scale, h=this.h; ctx.imageSmoothingEnabled=false; ctx.drawImage(img, Math.round(-w/2), Math.round(-h/2), Math.round(w), Math.round(h)); }
    ctx.restore(); this.drawHPBar(ctx,world);
    for(const p of this.projectiles) p.draw(ctx);
  }
}

/* =========================================
 * （他の敵は従来通り。スピン描画だけ追加）
 * IceRobo / IceRoboMini / Kozou / GabuKing / Screw / MOBGiant
 *  —— 既存クラスの draw() 内で、死亡でなくても spinSpeed>0 のとき回転させる
 *  —— それ以外のAI/数値は以前のまま
 * ========================================= */
// ここから先の各クラスは、元コードから draw の回転だけ追加（ctx.rotate(this.spinAngle*0.7) 等）。
// 既存の長い実装はそのまま活かし、updatePhysics 呼び出しを updatePhysics(dt,this.world) に変更。
// （※文字数の都合で既存本文は省略せずにお使いの元ファイルから流用してください。
//   変更点は draw() 冒頭に `else if(this.spinSpeed>0){ ctx.rotate(this.spinAngle*0.7); }` を入れること、
//   そして updatePhysics の呼び出しに `this.world` を渡すことのみです。）


/* =========================================
 * World（背景切替・ズーム・障害物）
 * ========================================= */
class World{
  constructor(assets, canvas, effects){
    this.assets=assets; this.effects=effects; this.canvas=canvas;
    this.ctx=canvas.getContext('2d',{alpha:true}); this.ctx.imageSmoothingEnabled=false;
    this.gameW=canvas.width; this.gameH=canvas.height; this.camX=0; this.camY=0; this.time=0; this._timerAcc=0;
    const r=this.canvas.getBoundingClientRect(); this.screenScaleX=r.width/this.gameW; this.screenScaleY=r.height/this.gameH;

    this.bgImg=null; this.bgScale=1; this.bgDW=0; this.bgDH=0;
    this.bgMode='tile'; // 'tile' | 'single'
    this.bgSpeed=1.0;

    this.zoom=1.0; this._zoomTarget=1.0;

    this.obstacles=[];   // ★ コンテナ等
    this.container=null; // 入口で使う1台
  }
  setBackground(name, mode='tile'){
    this.bgImg = this.assets.img(name) || null;
    this.bgMode = mode;
    if(this.bgImg){ this.bgScale = this.gameH / this.bgImg.height; this.bgDW = this.bgImg.width*this.bgScale; this.bgDH = this.bgImg.height*this.bgScale; }
  }
  setZoom(z){ this._zoomTarget = clamp(z, 0.7, 1.6); }
  resize(){ const r=this.canvas.getBoundingClientRect(); this.screenScaleX=r.width/this.gameW; this.screenScaleY=r.height/this.gameH; }
  updateCam(p){ const offs=this.effects.getCamOffset(); const target=clamp(p.x - this.gameW*0.35 + offs.x, 0, Math.max(0, STAGE_RIGHT - this.gameW)); this.camX=lerp(this.camX,target,0.12); this.camY=offs.y; this.zoom=lerp(this.zoom,this._zoomTarget,0.08); }
  updateTimer(dt){
    this._timerAcc+=dt; if(this._timerAcc>=0.2){ this.time+=this._timerAcc; this._timerAcc=0;
      const t=Math.floor(this.time); const mm=String(Math.floor(t/60)).padStart(2,'0'); const ss=String(t%60).padStart(2,'0'); document.getElementById('time').textContent=`${mm}:${ss}`; }
  }
  resolveCollisions(obj){
    for(const o of this.obstacles){
      const a=obj.aabb(), b=o.rect();
      if(!rectsOverlap(a,b)) continue;
      // オーバーラップ量
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const overlapX = (a.w + b.w)/2 - Math.abs(dx);
      const overlapY = (a.h + b.h)/2 - Math.abs(dy);

      // 上面優先（角ハマり防止）
      const comingFromAbove = (obj._prevY + obj.h/2) <= (o.top()+4);
      if(comingFromAbove && overlapY <= overlapX){
        obj.y = o.top() - obj.h/2 + FOOT_PAD; obj.vy=0; obj.onGround=true;
        continue;
      }
      // 側面ストップ＋軽い滑り
      if(overlapX < overlapY){
        const dirX = dx>=0? 1 : -1;
        obj.x += dirX * overlapX * 1.01;
        obj.vx = 0.0;
      }else{
        const dirY = dy>=0? 1 : -1;
        obj.y += dirY * overlapY * 1.01;
        if(dirY<0) obj.vy = Math.max(obj.vy,0); else obj.vy = Math.min(obj.vy,0);
      }
    }
  }
  draw(player, enemies){
    const ctx=this.ctx;
    ctx.save();

    // ズーム
    if(this.zoom!==1.0){
      ctx.translate(this.gameW/2, this.gameH/2);
      ctx.scale(this.zoom, this.zoom);
      ctx.translate(-this.gameW/2, -this.gameH/2);
    }

    ctx.clearRect(0,0,this.gameW,this.gameH);
    if(this.bgImg){
      if(this.bgMode==='single'){
        const w=Math.round(this.bgDW), h=Math.round(this.bgDH);
        const x=Math.round((this.gameW - w)/2 - this.camX*0.0); // シングルはカメラに追従しない
        ctx.drawImage(this.bgImg, 0,0,this.bgImg.width,this.bgImg.height, x, 0, w, h);
      }else{
        const w=Math.round(this.bgDW), h=Math.round(this.bgDH); const step=Math.max(1, w - 1);
        const startX = Math.floor((this.camX*this.bgSpeed - this.gameW*0.2)/step)*step;
        const endX = this.camX*this.bgSpeed + this.gameW*1.2 + w;
        for(let x=startX; x<=endX; x+=step){ ctx.drawImage(this.bgImg, 0,0,this.bgImg.width,this.bgImg.height, Math.round(x - this.camX*this.bgSpeed), 0, w, h); }
      }
    } else {
      const g=ctx.createLinearGradient(0,0,0,this.gameH); g.addColorStop(0,'#0a1230'); g.addColorStop(1,'#0a0f18'); ctx.fillStyle=g; ctx.fillRect(0,0,this.gameW,this.gameH);
    }
    ctx.fillStyle='#0b0f17'; const yTop=Math.floor(GROUND_TOP_Y); ctx.fillRect(0,yTop-1,this.gameW,1);

    // 障害物
    for(const ob of this.obstacles) ob.draw(ctx);

    if(this._skillBullets){ for(const p of this._skillBullets) p.draw(ctx); }
    for(const e of enemies) e.draw(ctx,this);
    player.draw(ctx,this);
    this.effects.draw(ctx,this);

    // バナー
    if(this._banner && this._banner.t>0){
      this._banner.t -= 1/60;
      const a = Math.min(1, this._banner.t < 0.2 ? this._banner.t/0.2 : 1);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle='rgba(0,0,0,.35)';
      ctx.fillRect(this.gameW*0.1, this.gameH*0.18, this.gameW*0.8, 72);
      ctx.fillStyle='#e9eef7';
      ctx.font='bold 28px system-ui, -apple-system, Segoe UI, Roboto, Inter, Arial, sans-serif';
      ctx.textAlign='center';
      ctx.fillText(this._banner.text, this.gameW/2, this.gameH*0.18 + 46);
      ctx.restore();
    }

    ctx.restore();
  }
  showBanner(text, sec=1.0){ this._banner = {text, t:sec}; }
}

/* =========================================
 * Spawner helpers
 * ========================================= */
function randRange(a,b){ return a + Math.random()*(b-a); }
function randSpawnX(playerX){
  let x=randRange(180, STAGE_RIGHT-180);
  if(Math.abs(x-playerX)<180) x = playerX + (Math.random()<0.5?-1:1)*randRange(200,380);
  return clamp(x, 120, STAGE_RIGHT-120);
}

/* =========================================
 * Game（Stage1進行）
 * ========================================= */
class Game{
  constructor(){
    this.assets=new Assets(); this.canvas=document.getElementById('game'); this.input=new Input(); this.effects=new Effects();
    this.player=null; this.enemies=[]; this.world=null; this.lastT=0;

    // Stage state
    this.phase='entry'; // 'entry' -> 'indoor' -> 'boss' -> 'clear' -> 'title'
    this.kills=0; this.killsIndoor=0;
    this.spawnCD=0;

    addEventListener('resize',()=>this.world?.resize());
  }
  async start(){
    const imgs=[
      /* 背景 */
      'ST1.png','CS.png','MOBA.png','back1.png',
      /* Player */
      'M1-1.png','M1-2.png','M1-3.png','M1-4.png',
      'K1-1.png','K1-2.png','K1-3.png','K1-4.png','K1-5.png',
      'h1.png','h2.png','h3.png','h4.png',
      'J.png',
      'Y1.png','Y2.png','Y3.png','Y4.png',
      'UL1.PNG','UL2.PNG','UL3.png',
      'kem.png',
      /* Obstacle */
      'contena.png',
      /* Enemies */
      'teki1.png','teki2.png','teki3.png','teki7.png',
      'I1.png','I2.png','I3.png','I4.png','I5.png','I6.png','I7.png','I8.png',
      'IC.png','IC2.png','IC3.png','IC4.png',
      'SL.png','SL2.png','SL3.png','SL4.png','SL5.png','SL6.png','SL7.png','SL8.png',
      'P1.png','P2.png','P3.png','P4.png','P5.png','P6.png','P7.png','P10.png',
      't1.png','t2.png','t3.png','t4.png','t5.png','t6.png','t7.png','t8.png','t9.png','t10.png','t11.png',
      'B1.png','B2.png','B3.png','B4.png','B5.png','B6.png','B7.png','B8.png','B9.png','B10.png','B11.png','B12.png','B13.png','B14.png'
    ];
    await this.assets.load(imgs);
    this.world=new World(this.assets,this.canvas,this.effects);
    this.player=new Player(this.assets,this.world,this.effects);
    updateHPUI(this.player.hp,this.player.maxhp);

    // ステージ1：入口セットアップ
    this.world.setBackground(this.assets.has('ST1.png')?'ST1.png':'MOBA.png','tile');
    // コンテナを地面に設置（中央ちょい右）
    const contImg=this.assets.img('contena.png');
    this.world.container = new Obstacle(this.world, contImg, 720, 180, 90);
    this.world.obstacles = [this.world.container];

    this.lastT=now();
    const loop=()=>{ this._tick(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  _spawnWaruGroup(n=3){
    for(let i=0;i<n;i++){
      const x = randSpawnX(this.player.x + (i-1)*60);
      this.enemies.push(new WaruMOB(this.world,this.effects,this.assets,x));
    }
  }

  _enterIndoor(){
    this.phase='indoor';
    this.killsIndoor=0;
    this.world.setBackground(this.assets.has('CS.png')?'CS.png':'back1.png','single');
    // 室内は障害物なし
    this.world.obstacles=[]; this.world.container=null;
    // プレイヤーを左端へ
    this.player.x = STAGE_LEFT + 80; this.player.y = Math.floor(GROUND_TOP_Y)-this.player.h/2+FOOT_PAD; this.world.setZoom(1.0);
    this.world.showBanner('室内へ…', 1.0);
  }

  _spawnBoss(){
    this.phase='boss';
    const boss = new Screw(this.world,this.effects,this.assets, this.player.x+360);
    boss.maxhp=2000; boss.hp=2000;
    boss.y = -200; // 天から落とす
    this.enemies.push(boss);
    this.effects.shake(0.25,12);
    this.world.showBanner('MOBスクリュー登場！', 1.0);
  }

  _clearStage(){
    this.phase='clear';
    this.world.setZoom(1.35);
    this.world.showBanner('ステージクリア!!', 2.0);
    this._titleTimer = 2.0;
  }

  _titleScreen(){
    this.phase='title';
    this.enemies.length=0;
    this.world.setBackground(this.assets.has('ST1.png')?'ST1.png':'MOBA.png','single');
    this.world.showBanner('MOB SIDE ACTION', 3.0);
    this.world.setZoom(1.0);
  }

  _tick(){
    const t=now(); let dt=(t-this.lastT)/1000; if(dt>0.05) dt=0.05; this.lastT=t;

    if(this.effects.hitstop>0){
      this.effects.update(dt); this.world.updateCam(this.player); this.world.draw(this.player,this.enemies);
      return;
    }

    const input=this.input;
    window._inputUltT = input.ultChargeT || 0;

    // ステージ進行
    if(this.phase==='entry'){
      if(this.enemies.filter(e=>e instanceof WaruMOB && !e.dead).length<3 && this.kills<15){
        if(this.spawnCD<=0){ this._spawnWaruGroup(3); this.spawnCD=2.2; }
      }
      if(this.kills>=15 && this.enemies.length===0){
        this._enterIndoor();
      }
    }else if(this.phase==='indoor'){
      if(this.enemies.filter(e=>e instanceof WaruMOB && !e.dead).length<3 && this.killsIndoor<10){
        if(this.spawnCD<=0){ this._spawnWaruGroup(3); this.spawnCD=2.0; }
      }
      if(this.killsIndoor>=10 && !this.enemies.some(e=>e instanceof Screw)){
        this._spawnBoss();
      }
      // 以降はボスフェーズへ自然遷移
    }else if(this.phase==='clear'){
      if((this._titleTimer-=dt)<=0) this._titleScreen();
    }

    this.spawnCD = Math.max(0, this.spawnCD-dt);

    // Player
    this.player.update(dt,this.input,this.world,this.enemies);

    // Enemies
    for(const e of this.enemies){
      e.update(dt,this.player);

      // 接触/弾当たり（元コードの各分岐そのまま）
      if(e.projectiles){
        for(const p of e.projectiles){
          if(!p.dead && this.player.invulnT<=0 && rectsOverlap(p.aabb(), this.player.aabb())){
            p.dead=true; const hit=this.player.hurt(p.power, p.dir, {lift:0.1, kbMul:0.6, kbuMul:0.55}, this.effects);
            if(hit) updateHPUI(this.player.hp,this.player.maxhp);
          }
        }
      }
    }

    // プレイヤーの弾・スパイク（敵へ）
    if(this.world._skillBullets){
      for(const p of this.world._skillBullets){
        p.update(dt);
        for(const e of this.enemies){
          if(!p.dead && !e.dead && rectsOverlap(p.aabb(), e.aabb())){
            p.dead=true;
            const dir = (e.x>=p.x)? 1 : -1;
            const tag = (p instanceof UltBlast)? 'ult' : 'skill';
            const hit=e.hurt(p.power, dir, {lift:0.3,kbMul:0.9,kbuMul:0.9, tag}, this.effects);
            if(hit) this.effects.addSpark(e.x, e.y-10, p.power>=40);
          }
        }
      }
      this.world._skillBullets = this.world._skillBullets.filter(p=>!p.dead && p.life>0);
    }

    // 撃破カウント & 整理
    for(const e of this.enemies){ if(e.dead && !e._counted){ e._counted=true;
      if(e instanceof WaruMOB){
        if(this.phase==='entry') this.kills++;
        else if(this.phase==='indoor') this.killsIndoor++;
      }
      if(this.phase==='boss' && e instanceof Screw){
        this._clearStage();
      }
      // コンテナ上の占有解除
      if(this.world.container) this.world.container.leave(e.uid);
    }}
    this.enemies=this.enemies.filter(e=>!(e.dead && e.fade<=0));

    // のめり込み解消（強化版）
    for(const e of this.enemies){
      if(e.dead || this.player.dead) continue;
      const a=this.player.aabb(), b=e.aabb();
      if(!rectsOverlap(a,b)) continue;
      const dx = (this.player.x - e.x);
      const dy = (this.player.y - e.y);
      const overlapX = (a.w + b.w)/2 - Math.abs(dx);
      const overlapY = (a.h + b.h)/2 - Math.abs(dy);
      if(overlapY < overlapX){
        const dirY = dy>=0? 1 : -1;
        this.player.y += dirY * overlapY * 0.95;
        e.y         -= dirY * overlapY * 0.05;
        if(dirY<0){ this.player.vy = Math.max(this.player.vy, 0); } else { this.player.vy = Math.min(this.player.vy, 0); }
      } else {
        const dirX = dx>=0? 1 : -1;
        this.player.x += dirX * overlapX * 0.7;
        e.x           -= dirX * overlapX * 0.3;
        this.player.vx += dirX * 24;
        e.vx          -= dirX * 24;
      }
    }

    this.effects.update(dt); this.world.updateCam(this.player); this.world.updateTimer(dt); this.world.draw(this.player,this.enemies);
  }
}

/* =========================================
 * Boot
 * ========================================= */
new Game().start();

})();
