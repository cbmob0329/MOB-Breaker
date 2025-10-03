// script.js (Part 1/2) — Core, Player, shared systems
(function(){
'use strict';

/* ================================
 * Constants & Utils
 * ================================ */
const STAGE_LEFT = 0;
const STAGE_RIGHT = 2200;
const WALL_PAD = 12;

const GRAV=2000, MOVE=260, JUMP_V=760, MAX_FALL=1200;
const GROUND_TOP_Y=360, FOOT_PAD=2;

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
 * Character Base — ★ 強ヒットぶっ飛び共通化
 * ================================ */
class CharacterBase{
  constructor(w,h){
    this.w=w; this.h=h; this.x=0; this.y=0; this.vx=0; this.vy=0; this.face=1;
    this.onGround=false; this.state='idle'; this.animT=0;
    this.hp=100; this.maxhp=100; this.dead=false; this.deathT=0;
    this.invulnT=0; this.spinAngle=0; this.spinSpeed=0; this.fade=1; this.hurtT=0; this.maxHurt=0.22;
  }
  aabb(){ return {x:this.x, y:this.y, w:this.w*0.6, h:this.h*0.8}; }

  /**
   * ★ ぶっ飛び超強化ルール
   * - 強ヒット判定: 威力>=40 もしくは opts.kbMul>=1.4、もしくは opts.tag==='ult'
   * - 強ヒット時はKBに追加倍率を乗算、ヒットストップ/シェイク強化
   */
  hurt(amount, dir, opts={}, effects){
    if(this.invulnT>0||this.dead) return false;

    // 強ヒット判定
    const strongPower = amount>=40;
    const strongKbMul = (opts.kbMul||1) >= 1.4;
    const isULT = opts.tag==='ult';
    const isStrong = strongPower || strongKbMul || isULT;

    this.hp=Math.max(0,this.hp-amount);

    // 基本KB
    const baseKb = 140 + amount*12;
    const baseKbu = opts.lift ? 360 : (amount>=15? 300 : 210);

    // 既存KB倍率
    const kbMulIn = (opts.kbMul??1);
    const kbuMulIn= (opts.kbuMul??1);

    // ★ 強ヒット追加倍率（超爽快）
    // 横: 最大2.2倍、縦: 最大2.0倍まで伸ばす
    const STRONG_X = isStrong ? 1.75 : 1.0;
    const STRONG_Y = isStrong ? 1.65 : 1.0;

    // 最終KB
    this.vx = clamp(dir * baseKb * kbMulIn * STRONG_X, -640, 640);
    this.vy = - clamp(baseKbu * kbuMulIn * STRONG_Y, 0, 620);

    this.x += dir * (isStrong? 4 : 2);
    this.face = -dir;

    this.state='hurt'; this.hurtT=0; this.animT=0; this.invulnT=0.35;

    // ★ 強ヒット時の演出強化
    if(effects){
      effects.addSpark(this.x, this.y-10, isStrong || amount>=15);
      if(isStrong){ effects.shake(0.18,10); effects.hitstop=Math.max(effects.hitstop,0.11); }
    }

    if(this.hp<=0){
      this.dead=true; this.vx = dir * 540; this.vy = -560; this.spinSpeed = 18; this.deathT = 0; this.fade = 1;
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
      return {x, y:this.y, w:W, h:H, power:cur.power||0, dir:this.face, lift:cur.lift||0, kbMul:cur.kbMul||1.6, kbuMul:cur.kbuMul||1.3, tag:cur.tag};
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

    if(this.dead){ this.updatePhysics(dt); if(this.fade<=0){ this._respawn(world); } world.updateTimer(dt); return; }

    // ● スキル1チャージ
    if(input.skillCharging && this.skillCDT<=0){
      input.skillChargeT=Math.min(1.0, input.skillChargeT+dt);
      this._showGauge(true,'● Charge', input.skillChargeT/1.0);
      this.saT = 0.08;
    }
    // ULT：溜めながら移動可
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

    // 実行中（ultChargeは含めない）
    if(this.state==='atk'||this.state==='skill'||this.state==='skill2'||this.state==='ult'){
      const hb=this.currentHitbox();
      if(hb){
        for(const e of enemies){
          if(!e || e.dead || e.invulnT>0) continue;
          if(rectsOverlap({x:hb.x,y:hb.y,w:hb.w,h:hb.h}, e.aabb())){
            const hit = e.hurt(hb.power, hb.dir, {lift:hb.lift, kbMul:hb.kbMul, kbuMul:hb.kbuMul, tag:hb.tag}, this.effects);
            if(hit && rectsOverlap(this.aabb(), e.aabb())){ e.x = this.x + hb.dir * (this.w*0.55); }
            if(hit && this.state==='atk' && this._actionSeq && this._actionSeq[this._actionIndex]?.tag==='chaseFinisher'){
              this.effects.addSpark(e.x, e.y-10, true);
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
    this.updatePhysics(dt);
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
    const base   = 26 + Math.floor(t/0.1)*2;
    const kbm  = 1.6 + 0.1*(rounds-2);
    const kbum = 1.3 + 0.05*(rounds-2);
    const frames=this.frames.spin; const seq=[];
    for(let r=0;r<rounds;r++){
      for(let i=0;i<frames.length;i++){
        const pow = base*(i===1?1:0.6); const lift=(i===1?1:0);
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

    this.ultCDT=3.0; // CT 3秒

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

    this.vx = 0; this.updatePhysics(dt);

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
  Projectile, EnergyBall, UltBlast, GroundSpike,
  Player,
  constants:{ STAGE_LEFT, STAGE_RIGHT, WALL_PAD, GRAV, MOVE, JUMP_V, MAX_FALL, GROUND_TOP_Y, FOOT_PAD },
  utils:{ clamp, lerp, now, rectsOverlap }
};

})();
// script.js (Part 2/2) — Enemies, World, Game bootstrap
(function(){
'use strict';

const {
  Effects, Assets, Input, CharacterBase,
  Projectile, EnergyBall, UltBlast, GroundSpike,
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
 * Enemy: WaruMOB（攻撃頻度 DOWN、AI選択追加）
 * ========================================= */
class WaruMOB extends CharacterBase{
  constructor(world,effects,assets,x=520){
    super(52,60); this.world=world; this.effects=effects; this.assets=assets;
    this.x=x; this.y=Math.floor(GROUND_TOP_Y)-this.h/2+FOOT_PAD; this.face=-1; this.maxhp=100; this.hp=100;
    this.cool=0; this._seq=null; this._idx=0; this._t=0; this.projectiles=[];
    this.brainT=0; this.intent='patrol';
  }
  imgByKey(key){ const a=this.assets; const map={ idle:'teki1.png', walk1:'teki1.png', walk2:'teki2.png', prep1:'teki1.png', prep2:'teki3.png' }; return a.img(map[key]||'teki1.png'); }
  addBullet(){ const img=this.assets.img('teki7.png'); const ox=this.face*28; const oy=-8; this.projectiles.push(new Projectile(this.world,this.x+ox,this.y+oy,this.face,img,10)); }
  aabb(){ return {x:this.x, y:this.y, w:this.w*0.6, h:this.h*0.85}; }

  // ★ 軽量敵：通常ヒットでもやや吹っ飛ぶ（4強以外）
  hurt(amount, dir, opts={}, effects){
    opts = {...opts, kbMul:(opts.kbMul??1)*1.25, kbuMul:(opts.kbuMul??1)*1.2};
    return super.hurt(amount, dir, opts, effects);
  }

  update(dt,player){
    if(this.dead){ this.updatePhysics(dt); return; }
    // プロジェクタイル更新
    for(const p of this.projectiles) p.update(dt);
    this.projectiles=this.projectiles.filter(p=>!p.dead);

    // 攻撃頻度 DOWN：クール長め＆抽選低く
    if(this.cool>0) this.cool=Math.max(0,this.cool-dt);

    // ブレイン更新（0.4秒ごと）
    this.brainT-=dt;
    if(this.brainT<=0){
      this.brainT=0.4+Math.random()*0.2;
      const dx=player.x-this.x, adx=Math.abs(dx);
      this.face = dx>=0?1:-1;

      if(adx<110) this.intent = Math.random()<0.55 ? 'backstep' : 'strafe';
      else if(adx<220) this.intent = Math.random()<0.5 ? 'strafe' : 'shoot';
      else this.intent = 'approach';
    }

    // 実行中のモーション処理
    if(this.state==='atk'){
      this.updatePhysics(dt); if(this._seq){
        this._t+=dt; const cur=this._seq[this._idx];
        if(cur && this._t>=cur.dur){
          this._idx++; this._t=0;
          if(this._idx===2){ this.addBullet(); }
          if(this._idx>=this._seq.length){ this._seq=null; this.state='idle'; }
        }
      }
      this.animT+=dt; return;
    }

    // 行動決定
    const dx=player.x-this.x, adx=Math.abs(dx);
    const dir = dx>=0?1:-1;

    let targetVX=0;
    if(this.intent==='approach'){
      targetVX = dir*90;
    }else if(this.intent==='backstep'){
      targetVX = -dir*120;
    }else if(this.intent==='strafe'){
      // 円運動気味に
      const s = (Math.sin(performance.now()/300)+1)/2; // 0..1
      targetVX = dir*(60 + s*60) * (Math.random()<0.5?1:-1);
    }else if(this.intent==='shoot'){
      targetVX = 0;
      if(this.cool<=0){
        this._seq=[ {kind:'pose',dur:0.22,key:'prep1'}, {kind:'pose',dur:0.26,key:'prep2'} ];
        this.cool=2.2 + Math.random()*0.8; // ★ 前より長い
        this.state='atk'; this._idx=0; this._t=0; this.vx=0; this.animT=0;
        return;
      }
    }

    // 近距離ならランダムで射撃へ切替
    if(adx<180 && this.cool<=0 && Math.random()<0.25){
      this._seq=[ {kind:'pose',dur:0.22,key:'prep1'}, {kind:'pose',dur:0.26,key:'prep2'} ];
      this.cool=2.4 + Math.random()*1.0;
      this.state='atk'; this._idx=0; this._t=0; this.vx=0; this.animT=0;
      return;
    }

    // 物理
    this.vx = targetVX;
    this.updatePhysics(dt);
    this.state = !this.onGround ? 'jump' : (Math.abs(this.vx)>1?'run':'idle');
    this.animT+=dt;
  }
  draw(ctx,world){
    ctx.save(); ctx.translate(this.x-world.camX, this.y-world.camY);
    if(this.dead){ ctx.globalAlpha=this.fade; ctx.rotate(this.spinAngle); }
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
 * Enemy: IceRobo（中ボス）
 * ========================================= */
class IceRobo extends CharacterBase{
  constructor(world,effects,assets,x=900){
    super(64,70); this.world=world; this.effects=effects; this.assets=assets;
    this.x=x; this.y=Math.floor(GROUND_TOP_Y)-this.h/2+FOOT_PAD; this.face=-1;
    this.maxhp=1200; this.hp=1200; this.superArmor=false; this.cool=0; this.recoverT=0;
    this.modeJump=false; this.modeSwapT=0; this._seq=null; this._idx=0; this._t=0; this.chargeT=0; this.energyOrbs=[];
  }
  aabb(){ return {x:this.x, y:this.y, w:this.w*0.65, h:this.h*0.9}; }
  hurt(amount, dir, opts={}, effects){
    if(this.invulnT>0||this.dead) return false;
    this.hp=Math.max(0,this.hp-amount);
    const kbMul = this.superArmor ? 0.15 : (opts.kbMul||1);
    const kbuMul= this.superArmor ? 0.10 : (opts.kbuMul||1);
    const baseKb = 140 + amount*12;
    const baseKbu = opts.lift ? 360 : (amount>=15? 300 : 210);
    this.vx = clamp(dir * baseKb * kbMul, -220, 220);
    this.vy = - clamp(baseKbu * kbuMul, 0, 380);
    this.x += dir * 2; this.face = -dir;
    if(!this.superArmor){ this.state='hurt'; this.hurtT=0; this.invulnT=0.25; }
    if(effects) effects.addSpark(this.x, this.y-10, amount>=20);
    if(this.hp<=0){ this.dead=true; this.vx = dir * 540; this.vy = -560; this.spinSpeed = 18; this.deathT = 0; this.fade = 1; }
    return true;
  }
  img(key){ const map={ idle:'I1.png', walk1:'I1.png', walk2:'I2.png', jump1:'I1.png', jump2:'I2.png', jump3:'I3.png', charge:'I4.png', release:'I5.png', dashPrep:'I6.png', dashAtk:'I7.png', orb:'I8.png' }; return this.assets.img(map[key]||'I1.png'); }
  addEnergyBall(chargeSec){ const img=this.img('orb'); const ox=this.face*30, oy=-10; this.energyOrbs.push(new EnergyBall(this.world,this.x+ox,this.y+oy,this.face,img,20,chargeSec,1)); }
  update(dt, player){
    if(this.dead){ this.updatePhysics(dt); return; }
    if(this.cool>0) this.cool=Math.max(0,this.cool-dt);
    if(this.recoverT>0){ this.recoverT=Math.max(0,this.recoverT-dt); }
    for(const p of this.energyOrbs) p.update(dt); this.energyOrbs=this.energyOrbs.filter(p=>!p.dead);

    if(this.state==='charge'){
      this.superArmor = true; this.vx = 0; this.updatePhysics(dt);
      this._t += dt; this.chargeT = Math.min(2.0, this.chargeT + dt); this.animT += dt;
      const adx = Math.abs(player.x - this.x);
      if(adx < 180 && this.chargeT > 0.25){ this.releaseEnergy(); }
      else if(this.chargeT >= 2.0){ this.releaseEnergy(); }
      return;
    }
    if(this.state==='dash'){
      this.updatePhysics(dt); this._t += dt;
      if(this._t>=0.35){ this.state='idle'; this.superArmor=false; this.vx=0; this.cool=2.0; }
      this.animT += dt; return;
    }
    if(this.state==='atk' || this.state==='recover'){ this.updatePhysics(dt); this.animT += dt; if(this.state==='recover' && this.recoverT<=0){ this.state='idle'; } return; }
    if(this.state==='hurt'){ this.updatePhysics(dt); if(this.onGround) this.state='idle'; this.animT += dt; return; }

    const dx = player.x - this.x; const adx = Math.abs(dx); this.face = dx>=0? 1 : -1;
    this.modeSwapT -= dt; if(this.modeSwapT<=0 && this.onGround){ this.modeSwapT = 2.0 + Math.random()*1.6; this.modeJump = !this.modeJump; }
    const desireCharge = (adx>=140 && adx<=520);
    if(this.cool<=0 && this.recoverT<=0 && desireCharge){
      if(this.onGround || Math.random()<0.3){ this.state='charge'; this._t=0; this.chargeT=0; this.vx=0; this.superArmor=true; this.cool=2.8; return; }
    }
    if(this.cool<=0 && this.recoverT<=0 && adx<260){
      this.state='atk'; this.superArmor=true; this.vx=0;
      this._seq=[{key:'dashPrep', dur:0.24, vibrate:true},{key:'dashAtk', dur:0.32}];
      this._idx=0; this._t=0; this.animT=0; this.cool=2.2; return;
    }
    const walk=90, run=MOVE;
    if(adx>140){ const sp = this.modeJump? run : walk; this.vx = (dx>0? sp : -sp); if(this.modeJump && this.onGround){ this.vy = -JUMP_V*0.8; } }
    else { this.vx = 0; }
    this.updatePhysics(dt);
    this.state = !this.onGround ? 'jump' : (Math.abs(this.vx)>1?'run':'idle');
    this.animT += dt;
  }
  releaseEnergy(){ this.addEnergyBall(this.chargeT); this.state='recover'; this.recoverT=0.7; this.superArmor=false; }
  draw(ctx,world){
    if(this.state==='atk' && this._seq){
      this._t+=1/60; const cur=this._seq[this._idx];
      if(cur){ cur._t=(cur._t||0)+1/60; if(cur._t>=cur.dur){ this._idx++; if(this._idx>=this._seq.length){ this.state='dash'; this._t=0; this.vx = (this.face>0? 520 : -520); this._seq=null; } } }
    }
    ctx.save(); ctx.translate(this.x-world.camX, this.y-world.camY);
    if(this.dead){ ctx.globalAlpha=this.fade; ctx.rotate(this.spinAngle); }
    if(this.face<0 && !this.dead) ctx.scale(-1,1);
    let img=null, ox=0;
    if(this.state==='charge'){ img=this.img('charge'); ox=Math.sin(performance.now()/25)*1.5; }
    else if(this.state==='dash' || (this.state==='atk' && this._seq && this._seq[this._idx] && this._seq[this._idx].key==='dashAtk')){ img=this.img('dashAtk'); }
    else if(this.state==='atk' && this._seq){ const cur=this._seq[this._idx]; img=this.img(cur.key||'dashPrep'); ox=Math.sin(performance.now()/25)*2; }
    else if(this.state==='recover'){ img=this.img('release'); }
    else if(this.state==='run'){ const f=Math.floor(this.animT*6)%2; img=this.img(f? 'walk1':'walk2'); }
    else if(this.state==='jump'){ const f=Math.floor(this.animT*8)%3; img=this.img(['jump1','jump2','jump3'][f]); }
    else { img=this.img('idle'); }
    if(img){ const scale=this.h/img.height, w=img.width*scale, h=this.h; ctx.imageSmoothingEnabled=false; ctx.drawImage(img, Math.round(-w/2+ox), Math.round(-h/2), Math.round(w), Math.round(h)); }
    if(this.state==='charge'){
      const orb=this.img('orb'); const t=this.chargeT;
      const mul = 0.6 + 0.8*(t/2); const hh=32*mul, ww=44*mul; const oxh = this.face*26, oyh=-14;
      if(orb){ ctx.save(); ctx.translate(oxh, oyh); if(this.face<0) ctx.scale(-1,1); ctx.globalAlpha=0.9; ctx.drawImage(orb, Math.round(-ww/2), Math.round(-hh/2), Math.round(ww), Math.round(hh)); ctx.restore(); }
    }
    ctx.restore();
    this.drawHPBar(ctx,world);
    for(const p of this.energyOrbs) p.draw(ctx);
  }
}

/* =========================================
 * Enemy: IceRoboMini（雑魚・5体同時）
 * ========================================= */
class IceRoboMini extends CharacterBase{
  constructor(world, effects, assets, x=1200){
    super(40,44); this.world=world; this.effects=effects; this.assets=assets;
    this.x=x; this.y=Math.floor(GROUND_TOP_Y)-this.h/2+FOOT_PAD; this.face=-1;
    this.maxhp=50; this.hp=50; this.cool=0; this.state='idle'; this.animT=0; this.hopT=0; this.superArmor=false;
    this._lastImg=null;
  }
  img(key){ const map={ idle:'IC.png', move:'IC2.png', atk1:'IC3.png', sp:'IC4.png' }; return this.assets.img(map[key]||'IC.png'); }
  aabb(){ return {x:this.x, y:this.y, w:this.w*0.65, h:this.h*0.9}; }
  // 軽量：吹っ飛びUP
  hurt(amount, dir, opts={}, effects){ opts={...(opts||{}), kbMul:(opts.kbMul??1)*1.35, kbuMul:(opts.kbuMul??1)*1.25}; return super.hurt(amount, dir, opts, effects); }
  update(dt, player){
    if(this.dead){ this.updatePhysics(dt); return; }
    if(this.cool>0) this.cool=Math.max(0,this.cool-dt);
    if(this.state==='sp'){
      this.superArmor=true; this.hopT+=dt; const period=0.24, bounces=5;
      const bi=Math.floor(this.hopT/period); const dir = (bi%2===0)? this.face : -this.face;
      this.vx = dir * 240; if(this.onGround) this.vy = -JUMP_V*0.45;
      this.updatePhysics(dt);
      if(this.hopT>=period*bounces){ this.state='idle'; this.vx=0; this.superArmor=false; this.hopT=0; this.cool=1.6; }
      if(rectsOverlap(this.aabb(), player.aabb()) && player.invulnT<=0){
        const hit = player.hurt(7, (player.x>=this.x?1:-1), {lift:0.3,kbMul:0.9,kbuMul:0.9}, this.effects); if(hit) updateHPUI(player.hp,player.maxhp);
      }
      this.animT+=dt; return;
    }
    if(this.state==='atk'){
      this.hopT+=dt; const dur=0.32; this.vx = this.face * 140; this.updatePhysics(dt);
      if(this.hopT>dur*0.5 && this.hopT<=dur*0.75){
        const hb={x:this.x + this.face*18, y:this.y, w:36, h:28};
        if(player.invulnT<=0 && rectsOverlap(hb, player.aabb())){ const hit=player.hurt(5, this.face, {lift:0.2,kbMul:0.8,kbuMul:0.8}, this.effects); if(hit) updateHPUI(player.hp,player.maxhp); }
      }
      if(this.hopT>=dur){ this.state='idle'; this.hopT=0; this.vx=0; this.cool=0.9; }
      this.animT+=dt; return;
    }
    const dx=player.x-this.x; const adx=Math.abs(dx); this.face=dx>=0?1:-1;
    // 軽いオービット移動
    const swirl = Math.sin(performance.now()/350)*60;
    this.vx = (dx>0? 70 : -70) + (this.face>0?swirl:-swirl)*0.2;
    this.hopT+=dt;
    if(this.onGround && this.hopT>0.35){ this.vy=-JUMP_V*0.35; this.hopT=0; }
    if(this.cool<=0){
      if(adx<120 && Math.random()<0.6){ this.state='atk'; this.hopT=0; this.animT=0; }
      else if(adx<220 && Math.random()<0.35){ this.state='sp'; this.hopT=0; this.animT=0; }
    }
    this.updatePhysics(dt);
    this.state = (this.state==='idle'||this.state==='run') ? (this.onGround? 'run':'jump') : this.state;
    this.animT+=dt;
  }
  draw(ctx,world){
    ctx.save(); ctx.translate(this.x-world.camX, this.y-world.camY); if(this.face<0) ctx.scale(-1,1);
    let img=null; if(this.state==='sp') img=this.img('sp');
    else if(this.state==='atk'){ img=this.hopT<0.16? this.img('idle'): this.img('atk1'); }
    else if(!this.onGround) img=this.img('move'); else img=this.img('move');
    if(!img) img=this._lastImg;
    if(img){
      const scale=this.h/img.height, w=img.width*scale, h=this.h;
      ctx.imageSmoothingEnabled=false; ctx.drawImage(img, Math.round(-w/2), Math.round(-h/2), Math.round(w), Math.round(h));
      this._lastImg=img;
    }
    ctx.restore(); this.drawHPBar(ctx,world);
  }
}

/* =========================================
 * Enemy: Kozou（雑魚・5体同時）
 * ========================================= */
class KozouStone extends Projectile{
  constructor(world,x,y,dir,img){ super(world,x,y,dir,img,5); this.vx = 120*dir; this.vy = -360; this.w = 24; this.h = 24; this.gravity = 900; }
  update(dt){
    if(this.dead) return; this.vy += this.gravity*dt; this.x += this.vx*dt; this.y += this.vy*dt;
    const ground = Math.floor(GROUND_TOP_Y); if(this.y + this.h/2 >= ground+FOOT_PAD){ this.dead=true; }
  }
}
class Kozou extends CharacterBase{
  constructor(world,effects,assets,x=1400){
    super(50,58); this.world=world; this.effects=effects; this.assets=assets;
    this.x=x; this.y=Math.floor(GROUND_TOP_Y)-this.h/2+FOOT_PAD; this.face=-1;
    this.maxhp=100; this.hp=100; this.cool=0; this.state='idle'; this.animT=0; this.projectiles=[];
    this.guard=false; this.guardHits=0; this._thrown=false;
    this.brainT=0;
  }
  img(key){ const map={ idle:'SL.png', w1:'SL2.png', w2:'SL3.png', prep:'SL4.png', throw:'SL5.png', guard:'SL6.png', counter:'SL7.png', stone:'SL8.png'}; return this.assets.img(map[key]||'SL.png'); }
  aabb(){ return {x:this.x, y:this.y, w:this.w*0.65, h:this.h*0.9}; }
  // 軽量：吹っ飛びUP
  hurt(amount, dir, opts={}, effects){
    if(this.guard){ amount = Math.ceil(amount*0.5); this.guardHits = Math.min(3, this.guardHits+1); if(this.guardHits>=3 && this.state!=='counter'){ this.state='counter'; this.animT=0; this.vx=0; } }
    opts = {...opts, kbMul:(opts.kbMul??1)*1.25, kbuMul:(opts.kbuMul??1)*1.2};
    return super.hurt(amount, dir, opts, effects);
  }
  update(dt,player){
    if(this.dead){ this.updatePhysics(dt); return; }
    if(this.cool>0) this.cool=Math.max(0,this.cool-dt);
    for(const p of this.projectiles) p.update(dt); this.projectiles=this.projectiles.filter(p=>!p.dead);

    if(this.state==='counter'){
      this.updatePhysics(dt); this.animT+=dt; const dur=0.28; const mid=0.14;
      if(this.animT<dur){ this.vx=this.face*120; }
      if(this.animT>mid){
        const hb={x:this.x + this.face*18, y:this.y, w:36, h:30};
        if(player.invulnT<=0 && rectsOverlap(hb, player.aabb())){ const hit=player.hurt(8, this.face, {lift:0.3,kbMul:0.9,kbuMul:0.9}, this.effects); if(hit) updateHPUI(player.hp,player.maxhp); }
      }
      if(this.animT>=dur){ this.state='idle'; this.vx=0; this.cool=1.2; this.guard=false; this.guardHits=0; }
      return;
    }
    if(this.state==='throw'){
      this.updatePhysics(dt); this.animT+=dt;
      if(this.animT>0.22 && !this._thrown){ this._thrown=true; const img=this.img('stone'); const ox=this.face*14, oy=-18;
        this.projectiles.push(new KozouStone(this.world, this.x+ox, this.y+oy, this.face, img)); }
      if(this.animT>0.4){ this.state='idle'; this.vx=0; this.cool=1.4; this._thrown=false; }
      return;
    }
    if(this.guard){ this.vx=0; this.updatePhysics(dt); this.animT+=dt;
      const dx=player.x-this.x; const adx=Math.abs(dx); this.face=dx>=0?1:-1; if(adx<120){ this.vx = (dx>0? -80 : 80); } return; }

    // ブレイン
    this.brainT-=dt;
    if(this.brainT<=0){
      this.brainT=0.45+Math.random()*0.2;
      const dx=player.x-this.x, adx=Math.abs(dx); this.face=dx>=0?1:-1;
      if(adx>180) this.intent='approach';
      else if(adx>120) this.intent='strafe';
      else this.intent = Math.random()<0.5?'guard':'throw';
    }

    const dx=player.x-this.x; const adx=Math.abs(dx); this.face=dx>=0?1:-1;

    if(this.intent==='throw' && this.cool<=0){
      this.state='throw'; this.animT=0; this.vx=0; return;
    }
    if(this.intent==='guard' && !this.guard){
      this.guard=true; this.state='idle'; this.animT=0; this.vx=0;
    }

    // 移動
    if(this.intent==='approach') this.vx = (dx>0? 70 : -70);
    else if(this.intent==='strafe'){
      const swirl=Math.sin(performance.now()/320)*60;
      this.vx = (dx>0? 50 : -50) + (this.face>0?swirl:-swirl)*0.4;
    }

    if(this.cool<=0 && adx>120 && Math.random()<0.15){ this.state='throw'; this.animT=0; this.vx=0; }

    this.updatePhysics(dt);
    this.state = this.onGround ? (Math.abs(this.vx)>1?'run':'idle') : 'jump';
    this.animT+=dt;
  }
  draw(ctx,world){
    ctx.save(); ctx.translate(this.x-world.camX, this.y-world.camY); if(this.face<0) ctx.scale(-1,1);
    let img=null;
    if(this.state==='throw'){ img=this.animT<0.2? this.img('prep'): this.img('throw'); }
    else if(this.state==='counter'){ img=this.img('counter'); }
    else if(this.guard){ img=this.img('guard'); }
    else if(this.state==='run'){ const f=Math.floor(this.animT*6)%2; img=this.img(f?'w1':'w2'); }
    else { img=this.img('idle'); }
    if(img){ const scale=this.h/img.height, w=img.width*scale, h=this.h; ctx.imageSmoothingEnabled=false; ctx.drawImage(img, Math.round(-w/2), Math.round(-h/2), Math.round(w), Math.round(h)); }
    ctx.restore(); this.drawHPBar(ctx,world);
    for(const p of this.projectiles) p.draw(ctx);
  }
}

/* =========================================
 * Enemy: GabuKing（ボス）
 * ========================================= */
class GabuUltShot extends Projectile{
  constructor(world,x,y,dir,img){ super(world,x,y,dir,img,130); this.w=60; this.h=60; this.vx=260*dir; this.life=2.0; }
}
class GabuKing extends CharacterBase{
  constructor(world,effects,assets,x=1200){
    super(80,90);
    this.world=world; this.effects=effects; this.assets=assets;
    this.x=x; this.y=Math.floor(GROUND_TOP_Y)-this.h/2+FOOT_PAD; this.face=-1;
    this.maxhp=500; this.hp=500; this.cool=0; this.state='idle'; this.animT=0; this._seq=null; this._idx=0; this._t=0;
    this.superArmor=false; this.bullets=[];
  }
  img(key){
    const map={
      idle:'t1.png', w1:'t2.png', w2:'t3.png',
      atk1a:'t4.png', atk1b:'t5.png',
      prep:'t6.png',
      fin8:'t8.png', fin9:'t9.png',
      hold:'t10.png', pose:'t7.png', shot:'t11.png'
    };
    return this.assets.img(map[key]||'t1.png');
  }
  aabb(){ return {x:this.x, y:this.y, w:this.w*0.7, h:this.h*0.95}; }
  hurt(amount, dir, opts={}, effects){
    const proc = Math.random()<0.50; // 50%でミドルSA
    if(proc){
      opts={...(opts||{}), kbMul:0.25, kbuMul:0.22};
      const hit = CharacterBase.prototype.hurt.call(this,amount,dir,opts,effects);
      if(hit){ this.state='idle'; }
      return hit;
    }
    return CharacterBase.prototype.hurt.call(this,amount,dir,opts,effects);
  }
  addUltShot(){
    const img=this.img('shot'); const ox=this.face*38, oy=-18;
    this.bullets.push(new GabuUltShot(this.world, this.x+ox, this.y+oy, this.face, img));
  }
  update(dt, player){
    if(this.dead){ this.updatePhysics(dt); return; }
    if(this.cool>0) this.cool=Math.max(0,this.cool-dt);

    for(const b of this.bullets){
      b.update(dt);
      if(!b.dead && player.invulnT<=0 && rectsOverlap(b.aabb(), player.aabb())){
        b.dead=true; const hit=player.hurt(b.power, b.dir, {lift:1.3, kbMul:1.2, kbuMul:1.2}, this.effects); if(hit) updateHPUI(player.hp,player.maxhp);
      }
    }
    this.bullets=this.bullets.filter(b=>!b.dead);

    if(this._seq){
      this.updatePhysics(dt); this._t+=dt; const cur=this._seq[this._idx];
      if(cur?.fx){ this.x += this.face * cur.fx * dt; }
      if(cur?.hit){
        const hb={x:this.x + this.face*cur.hx, y:this.y, w:cur.hw, h:cur.hh};
        if(player.invulnT<=0 && rectsOverlap(hb, player.aabb())){
          const hit=player.hurt(cur.power, this.face, {lift:cur.lift,kbMul:cur.kbm,kbuMul:cur.kbum}, this.effects);
          if(hit) updateHPUI(player.hp,player.maxhp);
        }
      }
      if(cur?.fire && !cur._fired){ this.addUltShot(); cur._fired=true; }
      if(this._t>=cur.dur){ this._idx++; this._t=0;
        if(this._idx>=this._seq.length){ this._seq=null; this.state='idle'; this.superArmor=false; this.vx=0; } }
      this.animT+=dt; return;
    }

    const dx=player.x-this.x, adx=Math.abs(dx); this.face=dx>=0?1:-1;
    // 中距離なら溜め攻撃or突進、遠距離なら接近、近距離は2段
    const slow=80;
    if(adx>220) this.vx = (dx>0? slow : -slow);
    else this.vx=0;

    if(this.cool<=0){
      if(adx<140 && Math.random()<0.55){
        this.state='atk';
        this._seq=[
          {dur:0.08, key:'atk1a', fx:160, hit:false},
          {dur:0.12, key:'atk1b', fx:200, hit:true, hx:26, hw:48, hh:40, power:30, lift:0.6, kbm:1.0, kbum:1.0},
          {dur:0.06, key:'atk1a', fx:140},
          {dur:0.12, key:'atk1b', fx:200, hit:true, hx:26, hw:48, hh:40, power:30, lift:0.6, kbm:1.0, kbum:1.0}
        ];
        this.cool=1.6; this._idx=0; this._t=0; return;
      }
      if(adx<320 && Math.random()<0.35){
        this.state='skill'; this.superArmor=true;
        this._seq=[
          {dur:0.50, key:'prep', fx:0},
          {dur:0.30, key:'prep', fx:520, hit:true, hx:28, hw:70, hh:46, power:70, lift:0.9, kbm:1.2, kbum:1.1}
        ];
        this.cool=3.0; this._idx=0; this._t=0; return;
      }
      if(adx<340 && Math.random()<0.30){
        this.state='skill'; this.superArmor=true;
        this._seq=[
          {dur:0.50, key:'prep', fx:0},
          {dur:0.28, key:'prep', fx:540, hit:true, hx:28, hw:74, hh:48, power:100, lift:1.2, kbm:1.2, kbum:1.2},
          {dur:0.12, key:'fin8', fx:60, hit:false},
          {dur:0.18, key:'fin9', fx:80, hit:false}
        ];
        this.cool=4.2; this._idx=0; this._t=0; return;
      }
      if(adx<420 && Math.random()<0.22){
        this.state='ult'; this.superArmor=true;
        this._seq=[
          {dur:0.50, key:'hold', fx:0},
          {dur:0.18, key:'pose', fx:0, hit:true, hx:24, hw:56, hh:50, power:50, lift:0.6, kbm:1.0, kbum:1.0},
          {dur:0.30, key:'pose', fx:0, fire:true}
        ];
        this.cool=8.0; this._idx=0; this._t=0; return;
      }
    }

    this.updatePhysics(dt);
    this.state = !this.onGround ? 'jump' : (Math.abs(this.vx)>1?'run':'idle');
    this.animT+=dt;
  }
  draw(ctx,world){
    ctx.save(); ctx.translate(this.x-world.camX, this.y-world.camY); if(this.face<0) ctx.scale(-1,1);
    let img=null;
    if(this._seq){ const cur=this._seq[this._idx]; img=this.img(cur?.key||'idle'); }
    else if(this.state==='run'){ const f=Math.floor(this.animT*6)%2; img=this.img(f?'w1':'w2'); }
    else img=this.img('idle');
    if(img){ const scale=this.h/img.height, w=img.width*scale, h=this.h; ctx.imageSmoothingEnabled=false; ctx.drawImage(img, Math.round(-w/2), Math.round(-h/2), Math.round(w), Math.round(h)); }
    ctx.restore(); this.drawHPBar(ctx,world);
    for(const b of this.bullets) b.draw(world.ctx);
  }
}

/* =========================================
 * Enemy: Screw（攻撃しない問題 → 行動積極化）
 *  - 思考頻度↑、突進/2段/スキル/ULTの抽選上げ
 *  - 距離に応じてダッシュ接近 or ハイジャンプ or 横振り
 * ========================================= */
class Screw extends CharacterBase{
  constructor(world,effects,assets,x=1500){
    super(62,68);
    this.world=world; this.effects=effects; this.assets=assets;
    this.x=x; this.y=Math.floor(GROUND_TOP_Y)-this.h/2+FOOT_PAD; this.face=-1;
    this.maxhp=500; this.hp=500;
    this.cool=0; this.state='idle'; this.animT=0; this._seq=null; this._idx=0; this._t=0;
    this.jumpModeT=0; this.highJump=false;
    this.brainT=0;
  }
  img(key){
    const map={
      idle:'B1.png', w1:'B2.png', w2:'B3.png',
      jump:'B3.png', high:'B4.png',
      a1a:'B5.png', a1b:'B6.png',
      a2a:'B5.png', a2b:'B7.png',
      sPrep:'B8.png', s1:'B9.png', s2:'B10.png', s3:'B11.png',
      uPrep:'B12.png', uDash:'B13.png', uFin:'B14.png'
    };
    return this.assets.img(map[key]||'B1.png');
  }
  aabb(){ return {x:this.x, y:this.y, w:this.w*0.68, h:this.h*0.92}; }
  hurt(amount, dir, opts={}, effects){
    const proc = Math.random()<0.30;
    if(proc){
      opts={...(opts||{}), kbMul:0.40, kbuMul:0.38};
      const hit = CharacterBase.prototype.hurt.call(this,amount,dir,opts,effects);
      if(hit){ this.state='idle'; }
      return hit;
    }
    return CharacterBase.prototype.hurt.call(this,amount,dir,opts,effects);
  }
  update(dt, player){
    if(this.dead){ this.updatePhysics(dt); return; }
    if(this.cool>0) this.cool=Math.max(0,this.cool-dt);

    // 実行中
    if(this._seq){
      this.updatePhysics(dt); this._t+=dt; const cur=this._seq[this._idx];
      if(cur?.fx){ this.x += this.face * cur.fx * dt; }
      if(cur?.hit){
        const hb={x:this.x + this.face*cur.hx, y:this.y, w:cur.hw, h:cur.hh};
        if(player.invulnT<=0 && rectsOverlap(hb, player.aabb())){
          const hit=player.hurt(cur.power, this.face, {lift:cur.lift,kbMul:cur.kbm,kbuMul:cur.kbum}, this.effects);
          if(hit) updateHPUI(player.hp,player.maxhp);
        }
      }
      if(this._t>=cur.dur){ this._idx++; this._t=0;
        if(this._idx>=this._seq.length){ this._seq=null; this.state='idle'; this.vx=0; } }
      this.animT+=dt; return;
    }

    // 思考を速める
    this.brainT-=dt;
    if(this.brainT<=0){
      this.brainT=0.25+Math.random()*0.1;
      const dx=player.x-this.x, adx=Math.abs(dx); this.face=dx>=0?1:-1;

      // 行動選択
      if(adx>280) this.intent='dashApproach';
      else if(adx>160) this.intent = Math.random()<0.6 ? 'dashApproach' : 'highHop';
      else this.intent = Math.random()<0.5 ? 'melee' : 'skill';
    }

    const dx=player.x-this.x; const adx=Math.abs(dx); this.face=dx>=0?1:-1;

    if(this.cool<=0){
      if(this.intent==='melee' && adx<150){
        // 2択：軽コンボ or 重コンボ
        if(Math.random()<0.55){
          this.state='atk'; this._seq=[
            {dur:0.10, key:'a1a', fx:140},
            {dur:0.16, key:'a1b', fx:190, hit:true, hx:20, hw:44, hh:36, power:30, lift:0.4, kbm:0.9, kbum:0.9}
          ];
          this.cool=0.9+Math.random()*0.5;
        }else{
          this.state='atk'; this._seq=[
            {dur:0.10, key:'a2a', fx:160},
            {dur:0.18, key:'a2b', fx:220, hit:true, hx:22, hw:48, hh:38, power:35, lift:0.6, kbm:1.0, kbum:1.0}
          ];
          this.cool=1.2+Math.random()*0.6;
        }
        this._idx=0; this._t=0; this.animT=0; return;
      }
      if(this.intent==='skill' && adx<330){
        this.state='skill';
        this._seq=[
          {dur:0.46, key:'sPrep', fx:0},
          {dur:0.20, key:'s1', fx:540, hit:true, hx:22, hw:56, hh:40, power:50, lift:0.5, kbm:0.95, kbum:0.95},
          {dur:0.14, key:'s2', fx:420, hit:true, hx:20, hw:44, hh:36, power:22, lift:0.3, kbm:0.9, kbum:0.9},
          {dur:0.20, key:'s3', fx:560, hit:true, hx:24, hw:58, hh:42, power:52, lift:1.0, kbm:1.05, kbum:1.05}
        ];
        this.cool=3.6+Math.random()*0.8;
        this._idx=0; this._t=0; this.animT=0; return;
      }
      if(this.intent==='dashApproach' && adx<360 && Math.random()<0.7){
        this.state='ult';
        this._seq=[
          {dur:0.40, key:'uPrep', fx:0},
          {dur:0.24, key:'uDash', fx:620},
          {dur:0.20, key:'uFin',  fx:0, hit:true, hx:26, hw:64, hh:50, power:120, lift:1.4, kbm:1.2, kbum:1.2}
        ];
        this.cool=8.0+Math.random()*3.0;
        this._idx=0; this._t=0; this.animT=0; return;
      }
    }

    // 接近/離脱移動
    if(this.intent==='dashApproach'){
      const run = MOVE*1.05;
      this.vx = (dx>0? run : -run);
    }else if(this.intent==='highHop'){
      this.vx = (dx>0? MOVE*0.7 : -MOVE*0.7);
      if(this.onGround && Math.random()<0.4) this.vy = -JUMP_V*0.9;
    }else{
      // 待機ドリフト
      this.vx = (Math.sin(performance.now()/300))*40;
    }
    this.updatePhysics(dt);
    if(!this.onGround) this.state = this.highJump? 'jump':'jump';
    else this.state = Math.abs(this.vx)>1? 'run':'idle';
    this.animT+=dt;
  }
  draw(ctx,world){
    ctx.save(); ctx.translate(this.x-world.camX, this.y-world.camY); if(this.face<0) ctx.scale(-1,1);
    let img=null;
    if(this._seq){ const cur=this._seq[this._idx]; img=this.img(cur?.key||'idle'); }
    else if(!this.onGround){ img=this.img(this.highJump? 'high':'jump'); }
    else if(this.state==='run'){ const f=Math.floor(this.animT*6)%2; img=this.img(f?'w1':'w2'); }
    else img=this.img('idle');
    if(img){ const scale=this.h/img.height, w=img.width*scale, h=this.h; ctx.imageSmoothingEnabled=false; ctx.drawImage(img, Math.round(-w/2), Math.round(-h/2), Math.round(w), Math.round(h)); }
    ctx.restore(); this.drawHPBar(ctx,world);
  }
}

/* =========================================
 * Enemy: MOB Giant（ボス）
 * ========================================= */
class MOBGiant extends CharacterBase{
  constructor(world,effects,assets,x=1650){
    super(100,120);
    this.world=world; this.effects=effects; this.assets=assets;
    this.x=x; this.y=Math.floor(GROUND_TOP_Y)-this.h/2+FOOT_PAD; this.face=-1;
    this.maxhp=2800; this.hp=2800;
    this.superArmor=false;
    this.cool=0; this.recoverT=0; this.modeJump=false; this.modeSwapT=0;
    this.chargeT=0; this.energyOrbs=[]; this.postLagT=0;
    this.lowFreqBias=0.0;
  }
  aabb(){ return {x:this.x, y:this.y, w:this.w*0.7, h:this.h*0.96}; }
  img(key){
    const map={ idle:'P1.png', w1:'P1.png', w2:'P2.png', j1:'P1.png', j2:'P2.png', j3:'P3.png',
      dashPrep:'P4.png', dashAtk:'P5.png', charge:'P6.png', release:'P7.png', orb:'P10.png' };
    return this.assets.img(map[key]||'P1.png');
  }
  hurt(amount, dir, opts={}, effects){
    if(this.invulnT>0||this.dead) return false;
    const stateSA = this.superArmor;
    const halfSA = Math.random()<0.65;
    const activeSA = stateSA || halfSA;
    this.hp=Math.max(0,this.hp-amount);
    const kbMul = activeSA ? 0.12 : (opts.kbMul||1);
    const kbuMul= activeSA ? 0.10 : (opts.kbuMul||1);
    const baseKb = 140 + amount*12;
    const baseKbu = opts.lift ? 360 : (amount>=15? 300 : 210);
    this.vx = clamp(dir * baseKb * kbMul, -220, 220);
    this.vy = - clamp(baseKbu * kbuMul, 0, 340);
    this.x += dir * 1.5; this.face = -dir;
    if(!activeSA){ this.state='hurt'; this.hurtT=0; this.invulnT=0.20; }
    if(effects) effects.addSpark(this.x, this.y-12, amount>=25);
    if(this.hp<=0){ this.dead=true; this.vx = dir * 540; this.vy = -540; this.spinSpeed = 16; this.deathT = 0; this.fade = 1; }
    return true;
  }
  addEnergyPair(chargeSec){
    const img=this.img('orb'); const ox=this.face*40, oy=-20;
    this.energyOrbs.push(new EnergyBall(this.world,this.x+ox,this.y+oy, this.face,  img, 36, chargeSec, 2));
    this.energyOrbs.push(new EnergyBall(this.world,this.x-ox,this.y+oy,-this.face, img, 36, chargeSec, 2));
  }
  update(dt, player){
    if(this.dead){ this.updatePhysics(dt); return; }
    if(this.cool>0) this.cool=Math.max(0,this.cool-dt);
    if(this.recoverT>0){ this.recoverT=Math.max(0,this.recoverT-dt); }
    if(this.postLagT>0){ this.postLagT=Math.max(0,this.postLagT-dt); }
    for(const p of this.energyOrbs) p.update(dt); this.energyOrbs=this.energyOrbs.filter(p=>!p.dead);

    if(this.state==='charge'){
      this.superArmor = true; this.vx=0; this.updatePhysics(dt);
      this.chargeT=Math.min(2.2, this.chargeT + dt);
      const adx=Math.abs(player.x - this.x);
      if(adx<220 && this.chargeT>0.3){ this.releaseEnergy(); }
      else if(this.chargeT>=2.2){ this.releaseEnergy(); }
      this.animT+=dt; return;
    }
    if(this.state==='dash'){
      this.updatePhysics(dt); this.animT+=dt;
      if(this.animT>=0.42){ this.state='idle'; this.superArmor=false; this.vx=0; this.cool=2.6 + this.lowFreqBias; }
      return;
    }
    if(this.state==='post'){
      this.updatePhysics(dt); this.animT+=dt;
      if(this.postLagT<=0){ this.state='idle'; }
      return;
    }
    if(this.state==='hurt'){ this.updatePhysics(dt); if(this.onGround) this.state='idle'; this.animT+=dt; return; }

    const dx = player.x - this.x; const adx = Math.abs(dx); this.face = dx>=0?1:-1;
    this.modeSwapT -= dt;
    if(this.modeSwapT<=0 && this.onGround){
      this.modeSwapT = 2.4 + Math.random()*2.0;
      this.modeJump = !this.modeJump;
    }
    this.lowFreqBias = clamp(this.lowFreqBias + (Math.random()*0.2-0.1), 0.0, 1.2);

    const desireCharge = (adx>=220 && adx<=620);
    if(this.cool<=0 && this.recoverT<=0 && this.postLagT<=0 && desireCharge){
      if(this.onGround || Math.random()<0.45){
        this.state='charge'; this.chargeT=0; this.superArmor=true; this.vx=0;
        this.cool = 2.8 + this.lowFreqBias; this.animT=0;
        return;
      }
    }
    if(this.cool<=0 && this.recoverT<=0 && adx<260){
      this.state='dash'; this.animT=0; this.superArmor=true;
      this.vx = (this.face>0? 560 : -560);
      this.cool = 2.4 + this.lowFreqBias;
      return;
    }

    const walk=78, run=220;
    if(adx>150){
      const sp = this.modeJump? run : walk;
      this.vx = (dx>0? sp : -sp);
      if(this.modeJump && this.onGround){ this.vy = -JUMP_V*1.0; }
    } else { this.vx=0; }

    this.updatePhysics(dt);
    if(!this.onGround) this.state='jump';
    else this.state = Math.abs(this.vx)>1? 'run':'idle';
    this.animT+=dt;
  }
  releaseEnergy(){ this.addEnergyPair(this.chargeT); this.state='post'; this.postLagT=1.0; this.superArmor=false; this.animT=0; }
  draw(ctx,world){
    ctx.save(); ctx.translate(this.x-world.camX, this.y-world.camY);
    if(this.dead){ ctx.globalAlpha=this.fade; ctx.rotate(this.spinAngle); }
    if(this.face<0 && !this.dead) ctx.scale(-1,1);
    let img=null, ox=0;
    if(this.state==='charge'){ img=this.img('charge'); ox=Math.sin(performance.now()/25)*2; }
    else if(this.state==='dash'){ img=this.img('dashAtk'); }
    else if(this.state==='post'){ img=this.img('release'); }
    else if(this.state==='run'){ const f=Math.floor(this.animT*6)%2; img=this.img(f?'w1':'w2'); }
    else if(this.state==='jump'){ const f=Math.floor(this.animT*8)%3; img=this.img(['j1','j2','j3'][f]); }
    else { img=this.img('idle'); }
    if(img){ const scale=this.h/img.height, w=img.width*scale, h=this.h; ctx.imageSmoothingEnabled=false; ctx.drawImage(img, Math.round(-w/2+ox), Math.round(-h/2), Math.round(w), Math.round(h)); }
    if(this.state==='charge'){
      const orb=this.img('orb'); const t=this.chargeT;
      const mul = 0.7 + 1.0*(t/2.2);
      const hh=38*mul, ww=54*mul; const oxh = this.face*34, oyh=-22;
      if(orb){ ctx.save(); ctx.translate(oxh, oyh); if(this.face<0) ctx.scale(-1,1); ctx.globalAlpha=0.95; ctx.drawImage(orb, Math.round(-ww/2), Math.round(-hh/2), Math.round(ww), Math.round(hh)); ctx.restore(); }
    }
    ctx.restore();
    this.drawHPBar(ctx,world);
    for(const p of this.energyOrbs) p.draw(ctx);
  }
}

/* =========================================
 * World
 * ========================================= */
class World{
  constructor(assets, canvas, effects){
    this.assets=assets; this.effects=effects; this.canvas=canvas;
    this.ctx=canvas.getContext('2d',{alpha:true}); this.ctx.imageSmoothingEnabled=false;
    this.gameW=canvas.width; this.gameH=canvas.height; this.camX=0; this.camY=0; this.time=0; this._timerAcc=0;
    const r=this.canvas.getBoundingClientRect(); this.screenScaleX=r.width/this.gameW; this.screenScaleY=r.height/this.gameH;

    this.bgImg = this.assets.has('MOBA.png') ? this.assets.img('MOBA.png')
               : (this.assets.has('back1.png') ? this.assets.img('back1.png') : null);
    if(this.bgImg){ this.bgScale = this.gameH / this.bgImg.height; this.bgDW = this.bgImg.width*this.bgScale; this.bgDH = this.bgImg.height*this.bgScale; }
    this.bgSpeed=1.0;
  }
  resize(){ const r=this.canvas.getBoundingClientRect(); this.screenScaleX=r.width/this.gameW; this.screenScaleY=r.height/this.gameH; }
  updateCam(p){ const offs=this.effects.getCamOffset(); const target=clamp(p.x - this.gameW*0.35 + offs.x, 0, Math.max(0, STAGE_RIGHT - this.gameW)); this.camX=lerp(this.camX,target,0.12); this.camY=offs.y; }
  updateTimer(dt){
    this._timerAcc+=dt; if(this._timerAcc>=0.2){ this.time+=this._timerAcc; this._timerAcc=0;
      const t=Math.floor(this.time); const mm=String(Math.floor(t/60)).padStart(2,'0'); const ss=String(t%60).padStart(2,'0'); document.getElementById('time').textContent=`${mm}:${ss}`; }
  }
  draw(player, enemies){
    const ctx=this.ctx; ctx.clearRect(0,0,this.gameW,this.gameH);
    if(this.bgImg){
      const w=Math.round(this.bgDW), h=Math.round(this.bgDH); const step=Math.max(1, w - 1);
      const startX = Math.floor((this.camX*this.bgSpeed - this.gameW*0.2)/step)*step;
      const endX = this.camX*this.bgSpeed + this.gameW*1.2 + w;
      for(let x=startX; x<=endX; x+=step){ ctx.drawImage(this.bgImg, 0,0,this.bgImg.width,this.bgImg.height, Math.round(x - this.camX*this.bgSpeed), 0, w, h); }
    } else {
      const g=ctx.createLinearGradient(0,0,0,this.gameH); g.addColorStop(0,'#0a1230'); g.addColorStop(1,'#0a0f18'); ctx.fillStyle=g; ctx.fillRect(0,0,this.gameW,this.gameH);
    }
    ctx.fillStyle='#0b0f17'; const yTop=Math.floor(GROUND_TOP_Y); ctx.fillRect(0,yTop-1,this.gameW,1);

    if(this._skillBullets){ for(const p of this._skillBullets) p.draw(ctx); }
    for(const e of enemies) e.draw(ctx,this);
    player.draw(ctx,this);
    this.effects.draw(ctx,this);
  }
}

/* =========================================
 * Spawner（非密集スポーン＆弱キャラ5体）
 * ========================================= */
function spawnGroup(factory, count, baseX, spacing=70, jitter=20){
  const arr=[];
  const startX = baseX - ((count-1)*spacing)/2;
  for(let i=0;i<count;i++){
    const x = startX + i*spacing + (Math.random()*2-1)*jitter;
    arr.push(factory(x));
  }
  // 初期軽い反発（密集ほぐし）
  for(let i=0;i<arr.length;i++){
    for(let j=i+1;j<arr.length;j++){
      if(!arr[i] || !arr[j]) continue;
      const a=arr[i].aabb(), b=arr[j].aabb();
      if(rectsOverlap(a,b)){
        const dx = (arr[j].x - arr[i].x) || (Math.random()<0.5?1:-1);
        const push = 18 * Math.sign(dx);
        arr[i].x -= push; arr[j].x += push;
      }
    }
  }
  return arr;
}

/* =========================================
 * Game
 * ========================================= */
class Game{
  constructor(){
    this.assets=new Assets(); this.canvas=document.getElementById('game'); this.input=new Input(); this.effects=new Effects();
    this.player=null; this.enemies=[]; this.world=null; this.lastT=0;
    this.waveIndex=0;
    addEventListener('resize',()=>this.world?.resize());
  }
  async start(){
    const imgs=[
      /* 背景 */
      'MOBA.png','back1.png',
      /* Player */
      'M1-1.png','M1-2.png','M1-3.png','M1-4.png',
      'K1-1.png','K1-2.png','K1-3.png','K1-4.png','K1-5.png',
      'h1.png','h2.png','h3.png','h4.png',
      'J.png',
      'Y1.png','Y2.png','Y3.png','Y4.png',
      'UL1.PNG','UL2.PNG','UL3.png',
      'kem.png',
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

    // 初期Wave
    this._startWave(0);

    this.lastT=now();
    const loop=()=>{ this._tick(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  _startWave(i){
    const spawnX = 720 + i*60;
    this.enemies.length=0;

    // 弱キャラの5体同時
    const minis = spawnGroup((x)=> new IceRoboMini(this.world,this.effects,this.assets,x), 5, spawnX-100, 68, 16);
    const kozous = spawnGroup((x)=> new Kozou(this.world,this.effects,this.assets,x), 5, spawnX+200, 74, 20);
    const waru = spawnGroup((x)=> new WaruMOB(this.world,this.effects,this.assets,x), 5, spawnX+420, 76, 18);

    // 中ボス/ボスは単体
    const gabu = new GabuKing(this.world,this.effects,this.assets,spawnX+680);
    const screw = new Screw(this.world,this.effects,this.assets,spawnX+820);
    const irobo = new IceRobo(this.world,this.effects,this.assets,spawnX+980);
    const giant = new MOBGiant(this.world,this.effects,this.assets,spawnX+1120);

    this.enemies.push(...minis, ...kozous, ...waru, gabu, screw, irobo, giant);
  }

  _tick(){
    const t=now(); let dt=(t-this.lastT)/1000; if(dt>0.05) dt=0.05; this.lastT=t;

    if(this.effects.hitstop>0){
      this.effects.update(dt); this.world.updateCam(this.player); this.world.draw(this.player,this.enemies);
      return;
    }

    const input=this.input;
    window._inputUltT = input.ultChargeT || 0;

    // Player
    this.player.update(dt,this.input,this.world,this.enemies);

    // Enemies
    for(const e of this.enemies){
      e.update(dt,this.player);

      // 接触/弾当たり
      if(e instanceof WaruMOB){
        for(const p of e.projectiles){
          if(!p.dead && this.player.invulnT<=0 && rectsOverlap(p.aabb(), this.player.aabb())){
            p.dead=true; const hit=this.player.hurt(p.power, p.dir, {lift:0, kbMul:0.55, kbuMul:0.5}, this.effects);
            if(hit) updateHPUI(this.player.hp,this.player.maxhp);
          }
        }
      }
      if(e instanceof IceRobo){
        if(e.state==='dash'){
          const hb = {x:e.x + e.face*22, y:e.y, w:e.w*0.9, h:e.h*0.9};
          if(this.player.invulnT<=0 && rectsOverlap(hb, this.player.aabb())){
            const hit=this.player.hurt(30, e.face, {lift:1, kbMul:1.1, kbuMul:1.1}, this.effects);
            if(hit) updateHPUI(this.player.hp,this.player.maxhp);
          }
        }
        for(const p of e.energyOrbs){
          if(!p.dead && this.player.invulnT<=0 && rectsOverlap(p.aabb(), this.player.aabb())){
            p.dead=true; const hit=this.player.hurt(p.power, p.dir, {lift:0.2, kbMul:0.8, kbuMul:0.8}, this.effects);
            if(hit) updateHPUI(this.player.hp,this.player.maxhp);
          }
        }
      }
      if(e instanceof Kozou){
        for(const p of e.projectiles){
          if(!p.dead && this.player.invulnT<=0 && rectsOverlap(p.aabb(), this.player.aabb())){
            p.dead=true; const hit=this.player.hurt(p.power, p.dir, {lift:0.15, kbMul:0.7, kbuMul:0.7}, this.effects);
            if(hit) updateHPUI(this.player.hp,this.player.maxhp);
          }
        }
      }
      if(e instanceof MOBGiant){
        if(e.state==='dash'){
          const hb = {x:e.x + e.face*30, y:e.y, w: e.w*0.96, h: e.h*0.96};
          if(this.player.invulnT<=0 && rectsOverlap(hb, this.player.aabb())){
            const hit=this.player.hurt(44, e.face, {lift:1, kbMul:1.15, kbuMul:1.15}, this.effects);
            if(hit) updateHPUI(this.player.hp,this.player.maxhp);
          }
        }
        for(const p of e.energyOrbs){
          if(!p.dead && this.player.invulnT<=0 && rectsOverlap(p.aabb(), this.player.aabb())){
            p.dead=true; const hit=this.player.hurt(p.power, p.dir, {lift:0.25, kbMul:0.85, kbuMul:0.85}, this.effects);
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
            // ULTはタグ付けで更に強ヒット扱い（パート1の共通強化が効く）
            const tag = (p instanceof UltBlast)? 'ult' : 'skill';
            const hit=e.hurt(p.power, dir, {lift:0.3,kbMul:0.9,kbuMul:0.9, tag}, this.effects);
            if(hit) this.effects.addSpark(e.x, e.y-10, p.power>=40);
          }
        }
      }
      this.world._skillBullets = this.world._skillBullets.filter(p=>!p.dead && p.life>0);
    }

    // 撃破整理
    this.enemies=this.enemies.filter(e=>!(e.dead && e.fade<=0));

    // 次Wave（すべて倒したら次）
    if(this.enemies.length===0){
      this.waveIndex++;
      this._startWave(this.waveIndex);
    }

    // のめり込み解消
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
        this.player.y += dirY * overlapY * 0.9;
        e.y         -= dirY * overlapY * 0.1;
        if(dirY<0){ this.player.vy = Math.max(this.player.vy, 0); } else { this.player.vy = Math.min(this.player.vy, 0); }
      } else {
        const dirX = dx>=0? 1 : -1;
        this.player.x += dirX * overlapX * 0.6;
        e.x           -= dirX * overlapX * 0.4;
        this.player.vx += dirX * 20;
        e.vx          -= dirX * 20;
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

