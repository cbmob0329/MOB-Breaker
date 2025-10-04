(function(){
'use strict';

/* ================================
 * Consts & Utils
 * ================================ */
const CONST = {
  CANVAS_W:420, CANVAS_H:480,
  GRAV:2000, MOVE:260, JUMP_V:760, MAX_FALL:1200,
  WALL_PAD:12
};
const U = {
  clamp:(v,min,max)=>Math.max(min,Math.min(max,v)),
  lerp:(a,b,t)=>a+(b-a)*t,
  now:()=>performance.now(),
  rectsOverlap:(a,b)=> Math.abs(a.x-b.x)*2 < (a.w+b.w) && Math.abs(a.y-b.y)*2 < (a.h+b.h)
};

/* ================================
 * Effects / Assets / Input
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
  update(dt){ if(this.hitstop>0)this.hitstop=Math.max(0,this.hitstop-dt); if(this.shakeT>0)this.shakeT=Math.max(0,this.shakeT-dt);
    for(const s of this.sparks){ s.t+=dt; } this.sparks=this.sparks.filter(s=>s.t<s.life); }
  draw(ctx,world){ for(const s of this.sparks){ const p=s.t/s.life; const w=s.strong?2:1;
    ctx.save(); ctx.translate(s.x-world.camX, s.y-world.camY); ctx.globalAlpha=1-p; ctx.strokeStyle="#fff"; ctx.lineWidth=w;
    ctx.beginPath(); ctx.moveTo(-10,0); ctx.lineTo(10,0); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0,-6); ctx.lineTo(0,6); ctx.stroke(); ctx.restore();}}
}

class Assets{
  constructor(){ this.images=new Map(); this.missing=new Set(); }
  load(srcs){ return Promise.all(srcs.map(src=>new Promise((resolve)=>{
    const img=new Image(); img.onload=()=>{ this.images.set(src,img); resolve(); };
    img.onerror=()=>{ console.warn('Image load failed:',src); this.missing.add(src); resolve(); };
    img.src=src; }))); }
  img(n){ return this.images.get(n); }
  has(n){ return this.images.has(n) && !this.missing.has(n); }
}

class Input{
  constructor(){
    this.left=0; this.right=0; this.jump=false;
    this.btn={a1:false,a2:false,skill:false,skill2:false,ult:false};
    this.prev={a1:false,a2:false,skill:false};
    this.edge={a1:false,a2Press:false,skillPress:false,skillRelease:false};
    this.skillCharging=false; this.skillChargeT=0;
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
    },{passive:false});
    addEventListener('keyup',(e)=>{
      const k=e.key;
      if(k==='ArrowLeft'||k==='a'||k==='A') this.left=(this.right?1:0);
      if(k==='ArrowRight'||k==='d'||k==='D') this.right=(this.left?1:0);
      if(k==='j'||k==='J') this.btn.a1=false;
      if(k==='k'||k==='K') this.btn.a2=false;
      if(k==='l'||k==='L'){ if(this.btn.skill){ this.btn.skill=false; this.edge.skillRelease=true; this.skillCharging=false; } }
    },{passive:false});
  }
  _initTouch(){
    const stickArea=document.getElementById('stickArea');
    const thumb=document.getElementById('stickThumb');
    let stickId=-1, origin=null;
    const updateStick=t=>{
      if(!origin) return;
      const dx=t.clientX-origin.x, rMax=40, len=Math.hypot(dx,0);
      const nx=(len>rMax? dx/len*rMax:dx);
      thumb.style.left=`calc(50% + ${nx}px)`;
      this.left =(nx<-8)?1:0; this.right=(nx> 8)?1:0;
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
    const onEnd =e=>{ for(const t of e.changedTouches){ if(t.identifier===stickId){ stickId=-1; origin=null; thumb.style.left='50%'; this.left=0; this.right=0; } } };
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
    bind('btnJMP', ()=>{ this.jump=true; }, ()=>{ /* release */ });
  }
  consumeJump(){ const j=this.jump; this.jump=false; return j; }
  beginFrame(){
    this.edge.a1 = this.btn.a1 && !this.prev.a1;
    this.prev.a1=this.btn.a1; this.prev.a2=this.btn.a2; this.prev.skill=this.btn.skill;
  }
}

/* ================================
 * Character / Projectile / World
 * ================================ */
class CharacterBase{
  constructor(w,h){
    this.w=w; this.h=h; this.x=0; this.y=0; this.vx=0; this.vy=0; this.face=1;
    this.onGround=false; this.state='idle'; this.animT=0;
    this.hp=100; this.maxhp=100; this.dead=false; this.deathT=0;
    this.invulnT=0; this.spinAngle=0; this.spinSpeed=0; this.spinT=0; this.fade=1; this.hurtT=0;
  }
  aabb(){ return {x:this.x, y:this.y, w:this.w*0.6, h:this.h*0.85}; }
  hurt(amount, dir, opts={}, effects){
    if(this.invulnT>0||this.dead) return false;
    const isStrong = amount>=40 || (opts.kbMul??1)>=1.4 || opts.tag==='ult';
    this.hp=Math.max(0,this.hp-amount);
    const baseKb = 140 + amount*12;
    const baseKbu = opts.lift ? 360 : (amount>=15? 300 : 210);
    const STRONG_X = isStrong ? 1.75 : 1.0;
    const STRONG_Y = isStrong ? 1.65 : 1.0;
    const kbMul=(opts.kbMul??1)*STRONG_X;
    const kbuMul=(opts.kbuMul??1)*STRONG_Y;
    this.vx = U.clamp(dir * baseKb * kbMul, -640, 640);
    this.vy = - U.clamp(baseKbu * kbuMul, 0, 620);
    this.x += dir * (isStrong?4:2);
    this.face = -dir;
    this.state='hurt'; this.hurtT=0; this.invulnT=0.35;

    if(isStrong){ this.spinT = 0.35; this.spinSpeed = 14 * (dir>0?1:-1); }
    if(effects){ effects.addSpark(this.x, this.y-10, isStrong || amount>=15); if(isStrong){ effects.shake(0.18,10); effects.hitstop=Math.max(effects.hitstop,0.11);} }
    if(this.hp<=0){ this.dead=true; this.vx = dir * 540; this.vy = -560; this.spinSpeed = 18; this.deathT = 0; this.fade = 1; }
    return true;
  }
  updatePhysics(dt, world){
    this.vy = Math.min(this.vy + CONST.GRAV*dt, CONST.MAX_FALL);
    this.x += this.vx*dt; this.y += this.vy*dt;
    if(this.spinT>0){ this.spinT=Math.max(0,this.spinT-dt); this.spinAngle += this.spinSpeed*dt; }
    if(this.invulnT>0) this.invulnT=Math.max(0,this.invulnT-dt);
    world.resolveCollisions(this);
    if(this.state==='hurt'){ this.hurtT+=dt; if(this.onGround || this.hurtT>=0.22){ this.state='idle'; } }
    if(this.dead){ this.deathT += dt; this.spinAngle += this.spinSpeed*dt; this.fade = U.clamp(1 - this.deathT/1.2, 0, 1); }
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

class Projectile{
  constructor(world,x,y,dir,img,power=10){ this.world=world; this.x=x; this.y=y; this.dir=dir; this.vx=160*dir; this.vy=0; this.img=img; this.power=power; this.life=3.0; this.dead=false; this.w=40; this.h=28; }
  aabb(){ return {x:this.x, y:this.y, w:this.w*0.9, h:this.h*0.9}; }
  update(dt){ if(this.dead) return; this.x+=this.vx*dt; this.y+=this.vy*dt; this.life-=dt; if(this.life<=0) this.dead=true; }
  draw(ctx){ if(this.dead||!this.img) return; const img=this.img; const scale=this.h/img.height, w=img.width*scale, h=this.h;
    ctx.save(); ctx.translate(this.x-this.world.camX,this.y-this.world.camY); if(this.dir<0) ctx.scale(-1,1);
    ctx.imageSmoothingEnabled=false; ctx.drawImage(img, Math.round(-w/2), Math.round(-h/2), Math.round(w), Math.round(h)); ctx.restore(); }
}

class World{
  constructor(assets, canvas, effects){
    this.assets=assets; this.effects=effects; this.canvas=canvas;
    this.ctx=canvas.getContext('2d',{alpha:true}); this.ctx.imageSmoothingEnabled=false;
    this.gameW=CONST.CANVAS_W; this.gameH=CONST.CANVAS_H;
    this.camX=0; this.camY=0; this.time=0; this._timerAcc=0;
    this.stage = { left:0, right:2000, groundY:440, loop:true, bg:null, obstacles:[] };
    const r=this.canvas.getBoundingClientRect(); this.screenScaleX=r.width/this.gameW; this.screenScaleY=r.height/this.gameH;
  }
  resize(){ const r=this.canvas.getBoundingClientRect(); this.screenScaleX=r.width/this.gameW; this.screenScaleY=r.height/this.gameH; }
  setStage(cfg){
    this.stage = {...this.stage, ...cfg};
    if(cfg.bgName){ this.stage.bg = this.assets.img(cfg.bgName) || null; }
  }
  updateCam(target){
    const offs=this.effects.getCamOffset();
    const maxX = Math.max(0, this.stage.right - this.gameW);
    const t = U.clamp(target.x - this.gameW*0.35 + offs.x, 0, maxX);
    this.camX = U.lerp(this.camX, t, 0.12);
    this.camY = offs.y;
  }
  updateTimer(dt){
    this._timerAcc+=dt; if(this._timerAcc>=0.2){ this.time+=this._timerAcc; this._timerAcc=0;
      const t=Math.floor(this.time); const mm=String(Math.floor(t/60)).padStart(2,'0'); const ss=String(t%60).padStart(2,'0'); document.getElementById('time').textContent=`${mm}:${ss}`; }
  }
  resolveCollisions(actor){
    const s=this.stage;
    const leftBound  = s.left + CONST.WALL_PAD + actor.w*0.4;
    const rightBound = s.right - CONST.WALL_PAD - actor.w*0.4;
    if(actor.x < leftBound){ actor.x = leftBound; actor.vx = Math.max(actor.vx, 0); }
    if(actor.x > rightBound){ actor.x = rightBound; actor.vx = Math.min(actor.vx, 0); }

    const top=Math.floor(s.groundY);
    if(actor.y + actor.h/2 >= top){ actor.y = top - actor.h/2; actor.vy=0; actor.onGround=true; }
    else actor.onGround=false;

    for(const o of s.obstacles){
      const a={x:actor.x,y:actor.y,w:actor.w*0.6,h:actor.h*0.85};
      const b={x:o.x,y:o.y,w:o.w,h:o.h};
      if(!U.rectsOverlap(a,b)) continue;
      const dx = (a.x - b.x), dy = (a.y - b.y);
      const ox = (a.w + b.w)/2 - Math.abs(dx);
      const oy = (a.h + b.h)/2 - Math.abs(dy);
      if(oy < ox){
        const dirY = dy>=0? 1 : -1;
        actor.y += dirY * oy;
        if(dirY<0){ actor.vy = Math.max(actor.vy, 0); } else { actor.vy = Math.min(actor.vy, 0); actor.onGround=true; }
      }else{
        const dirX = dx>=0? 1 : -1;
        actor.x += dirX * ox;
        actor.vx += dirX * 10;
      }
    }
  }
  draw(player, enemies){
    const ctx=this.ctx; ctx.clearRect(0,0,this.gameW,this.gameH);
    const s=this.stage;

    // 背景（画像がなくても動く）
    if(s.bg){
      const scale = this.gameH / s.bg.height;
      const w = Math.round(s.bg.width*scale), h = Math.round(s.bg.height*scale);
      if(s.loop){
        const step=Math.max(1, w - 1);
        const startX = Math.floor((this.camX*1.0 - this.gameW*0.2)/step)*step;
        const endX = this.camX*1.0 + this.gameW*1.2 + w;
        for(let x=startX; x<=endX; x+=step){
          ctx.drawImage(s.bg, 0,0,s.bg.width,s.bg.height, Math.round(x - this.camX*1.0), 0, w, h);
        }
      }else{
        ctx.drawImage(s.bg, 0,0,s.bg.width,s.bg.height, Math.round(s.left - this.camX), 0, w, h);
      }
    }else{
      const g=ctx.createLinearGradient(0,0,0,this.gameH); g.addColorStop(0,'#0a1230'); g.addColorStop(1,'#0a0f18'); ctx.fillStyle=g; ctx.fillRect(0,0,this.gameW,this.gameH);
    }

    // 地面ライン（黄土色の境目付近：可視補助）
    ctx.fillStyle='#0b0f17'; const yTop=Math.floor(s.groundY); ctx.fillRect(0,yTop-1,this.gameW,1);

    // コンテナ
    for(const o of s.obstacles){
      if(o.img){
        const img=this.assets.img(o.img);
        if(img){
          const scaleH=o.h/img.height, w=img.width*scaleH, h=o.h;
          ctx.save(); ctx.translate(o.x-this.camX, o.y-this.camY);
          ctx.imageSmoothingEnabled=false; ctx.drawImage(img, Math.round(-w/2), Math.round(-h/2), Math.round(w), Math.round(h));
          ctx.restore();
        }else{
          ctx.fillStyle='#23314a'; ctx.fillRect(Math.round(o.x-this.camX-o.w/2), Math.round(o.y-o.h/2), Math.round(o.w), Math.round(o.h));
        }
      }
    }

    for(const e of enemies) e.draw(ctx,this);
    player.draw(ctx,this);
    this.effects.draw(ctx,this);
  }
}

/* ================================
 * Player / Enemies (Waru, Boss Screw)
 * ================================ */
class Player extends CharacterBase{
  constructor(assets, world, effects){
    super(56,64);
    this.assets=assets; this.world=world; this.effects=effects;
    this.x=100; this.y=world.stage.groundY - this.h/2; this.hp=1000; this.maxhp=1000; this.lives=3;
    this.maxJumps=2; this.jumpsLeft=this.maxJumps;
    this.comboStep=0; this.bufferA1=false; this.a2LockoutT=0;
    this.skillCDT=0;

    this.frames={
      idle:'M1-1.png',
      run:['M1-2.png','M1-3.png','M1-4.png','M1-3.png'],
      k1prep:'K1-3.png', k1a:'K1-1.png', k1b:'K1-2.png', k1c:'K1-4.png',
      spin:['h1.png','h2.png','h3.png','h4.png']
    };
    this.overhead=this._createOverheadGauge();
    document.querySelector('.gamewrap').appendChild(this.overhead.root);
  }
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
  imgByKey(key,i=0){ const v=this.frames[key]; const name=Array.isArray(v)? v[Math.max(0,Math.min(v.length-1,i))] : v; return this.world.assets.img(name); }

  currentHitbox(){
    if(!(this.state==='atk'||this.state==='skill') || !this._actionSeq) return null;
    const cur=this._actionSeq[this._actionIndex]; if(!cur) return null;
    if(cur.kind==='hit' || cur.kind==='sp'){
      const w=52, h=42, x=this.x + this.face*(this.w*0.3 + w*0.5), y=this.y - 6;
      return {x,y,w,h, power:cur.power||0, dir:this.face, lift:cur.lift||1, kbMul:cur.kbMul||1, kbuMul:cur.kbuMul||1, tag:cur.tag};
    }
    return null;
  }

  update(dt,input,world,enemies){
    input.beginFrame(); this._posOverhead();
    if(this.dead){ this.updatePhysics(dt,world); if(this.fade<=0){ this._respawn(world); } world.updateTimer(dt); return; }

    // スキル1チャージ
    if(input.skillCharging && this.skillCDT<=0){
      input.skillChargeT=Math.min(1.0, input.skillChargeT+dt);
      this._showGauge(true,'● Charge', input.skillChargeT/1.0);
    }
    if(input.edge.skillRelease && input.skillChargeT>0 && this.skillCDT<=0){
      this._startSkill1Release(input.skillChargeT);
      input.skillChargeT=0; input.edge.skillRelease=false;
    }

    if(this.state==='atk'||this.state==='skill'){
      const hb=this.currentHitbox();
      if(hb){
        for(const e of enemies){
          if(!e || e.dead || e.invulnT>0) continue;
          if(U.rectsOverlap({x:hb.x,y:hb.y,w:hb.w,h:hb.h}, e.aabb())){
            const hit = e.hurt(hb.power, hb.dir, {lift:hb.lift, kbMul:hb.kbMul, kbuMul:hb.kbuMul, tag:hb.tag}, this.effects);
            if(hit){
              // すり抜け防止：押し戻し
              const push = 14; const dir = hb.dir;
              this.x -= dir * push * 0.35;
              e.x     += dir * push * 0.65;
            }
          }
        }
      }
      this._updateAction(dt,world,input); world.updateTimer(dt); return;
    }

    if(input.edge.a1) this.bufferA1=true;
    if(input.edge.a2Press && this.a2LockoutT<=0){ input.edge.a2Press=false; this.bufferA1=false; this._startA2(); return; }
    if(this.bufferA1){ this.bufferA1=false; this._startA1(); return; }

    let ax=0; if(input.left){ ax-=CONST.MOVE; this.face=-1; } if(input.right){ ax+=CONST.MOVE; this.face=1; }
    this.vx = ax!==0 ? (ax>0?CONST.MOVE:-CONST.MOVE) : 0;
    if(input.consumeJump() && this.jumpsLeft>0){ this.vy=-CONST.JUMP_V; this.onGround=false; this.jumpsLeft--; }
    this.updatePhysics(dt,world);
    if(this.onGround) this.jumpsLeft=this.maxJumps;
    this.state = !this.onGround ? 'jump' : (Math.abs(this.vx)>1?'run':'idle');

    if(!input.skillCharging) this._showGauge(false);
    world.updateTimer(dt);
  }

  _startA1(){
    this.state='atk'; this.animT=0;
    const seq=[ {kind:'prep',dur:0.08,frame:'k1prep',fx:80,power:0} ];
    let frame='k1a', power=8, fx=140;
    this.comboStep=(this.comboStep%3)+1;
    if(this.comboStep===2){ frame='k1b'; power=12; fx=170; }
    else if(this.comboStep===3){ frame='k1c'; power=16; fx=200; }
    seq.push({kind:'hit',dur:0.20,frame,fx,power, kbMul:1.0, kbuMul:1.0});
    this._actionSeq=seq; this._actionIndex=0; this._actionTime=0;
  }
  _startA2(){
    this.state='atk'; this.animT=0;
    this._actionSeq=[
      {kind:'prep',dur:0.10,frame:'k1prep',fx:90,power:0},
      {kind:'hit', dur:0.22,frame:'k1c',fx:220,power:22, lift:1.0, kbMul:1.15, kbuMul:1.2}
    ];
    this._actionIndex=0; this._actionTime=0; this.a2LockoutT = 0.35;
  }
  _startSkill1Release(chargeSec){
    // ダメージ＆ぶっ飛び強化＋強ヒット回転
    this.state='skill'; this.animT=0; this.skillCDT=4.5;
    const t=U.clamp(chargeSec,0,1.0);
    const rounds = 2 + Math.floor(t/0.33);
    const base   = 34 + Math.floor(t/0.1)*3;
    const kbm  = 1.85 + 0.12*(rounds-2);
    const kbum = 1.45 + 0.08*(rounds-2);
    const frames=this.frames.spin; const seq=[];
    for(let r=0;r<rounds;r++){
      for(let i=0;i<frames.length;i++){
        const pow = base*(i===1?1:0.65); const lift=(i===1?1:0);
        seq.push({kind:'sp',dur:0.06,frame:'spin',fi:i,fx:80,power:pow,lift, kbMul:kbm, kbuMul:kbum, tag:'skill'});
      }
    }
    this._actionSeq=seq; this._actionIndex=0; this._actionTime=0;
    this._showGauge(false);
  }
  _updateAction(dt,world,input){
    const cur=this._actionSeq?.[this._actionIndex];
    if(cur?.fx){ this.x += this.face * cur.fx * dt; }
    this.vx = 0; this.updatePhysics(dt,world);
    if(this._actionSeq){
      this._actionTime+=dt;
      if(this._actionTime>=cur.dur){
        this._actionIndex++; this._actionTime=0;
        if(this._actionIndex>=this._actionSeq.length){ this.state='idle'; this._actionSeq=null; }
      }
    }
    this.animT+=dt;
  }
  _respawn(world){
    this.dead=false; this.fade=1; this.spinAngle=0; this.spinSpeed=0;
    this.state='idle'; this.comboStep=0; this.bufferA1=false; this.invulnT=0.6; this.hp=this.maxhp; updateHPUI(this.hp,this.maxhp);
    this.x=world.camX+80; this.y=world.stage.groundY - this.h/2; this.vx=0; this.vy=0; this.jumpsLeft=this.maxJumps;
  }
  draw(ctx,world){
    ctx.save(); ctx.translate(this.x-world.camX, this.y-world.camY);
    if(this.spinT>0 || this.dead){ ctx.rotate(this.spinAngle); }
    if(this.face<0) ctx.scale(-1,1);
    let img=null;
    if(this.state==='run'){ const i=Math.floor(this.animT*8)%this.frames.run.length; img=this.imgByKey('run',i); }
    else if(this.state==='jump'){ img=this.imgByKey('run',0); }
    else if(this.state==='atk' && this._actionSeq){ const cur=this._actionSeq[this._actionIndex]; img=this.imgByKey(cur.frame); }
    else if(this.state==='skill' && this._actionSeq){ const cur=this._actionSeq[this._actionIndex]; const i=cur.fi??0; const name=this.frames.spin[Math.max(0,Math.min(this.frames.spin.length-1,i))]; img=this.world.assets.img(name); }
    else img=this.imgByKey('idle',0);
    if(img){
      const scale=this.h/img.height, w=img.width*scale, h=this.h;
      ctx.imageSmoothingEnabled=false; ctx.drawImage(img, Math.round(-w/2), Math.round(-h/2), Math.round(w), Math.round(h));
    }
    ctx.restore();
  }
}

class WaruMOB extends CharacterBase{
  constructor(world,effects,assets,x=520){
    super(52,60); this.world=world; this.effects=effects; this.assets=assets;
    this.x=x; this.y=world.stage.groundY - this.h/2; this.face=-1; this.maxhp=100; this.hp=100;
    this.cool=0; this._seq=null; this._idx=0; this._t=0; this.projectiles=[];
    this.brainT=0; this.intent='patrol';
  }
  imgByKey(key){ const a=this.assets; const map={ idle:'teki1.png', walk1:'teki1.png', walk2:'teki2.png', prep1:'teki1.png', prep2:'teki3.png' }; return a.img(map[key]||'teki1.png'); }
  addBullet(){ const img=this.assets.img('teki7.png'); const ox=this.face*28; const oy=-8; this.projectiles.push(new Projectile(this.world,this.x+ox,this.y+oy,this.face,img,10)); }
  aabb(){ return {x:this.x, y:this.y, w:this.w*0.6, h:this.h*0.85}; }
  hurt(amount, dir, opts={}, effects){ opts = {...opts, kbMul:(opts.kbMul??1)*1.25, kbuMul:(opts.kbuMul??1)*1.2}; return super.hurt(amount, dir, opts, effects); }
  update(dt,player){
    if(this.dead){ this.updatePhysics(dt,this.world); return; }
    for(const p of this.projectiles) p.update(dt);
    this.projectiles=this.projectiles.filter(p=>!p.dead);
    if(this.cool>0) this.cool=Math.max(0,this.cool-dt);

    if(this.state==='atk'){
      this.updatePhysics(dt,this.world);
      if(this._seq){ this._t+=dt; const cur=this._seq[this._idx];
        if(cur && this._t>=cur.dur){ this._idx++; this._t=0; if(this._idx===2){ this.addBullet(); }
          if(this._idx>=this._seq.length){ this._seq=null; this.state='idle'; } } }
      this.animT+=dt; return;
    }

    this.brainT-=dt;
    if(this.brainT<=0){
      this.brainT=0.4+Math.random()*0.2;
      const dx=player.x-this.x, adx=Math.abs(dx);
      this.face = dx>=0?1:-1;
      if(adx<110) this.intent = Math.random()<0.55 ? 'backstep' : 'strafe';
      else if(adx<220) this.intent = Math.random()<0.5 ? 'strafe' : 'shoot';
      else this.intent = 'approach';
    }

    const dx=player.x-this.x, adx=Math.abs(dx), dir = dx>=0?1:-1;
    let targetVX=0;
    if(this.intent==='approach'){ targetVX = dir*90; }
    else if(this.intent==='backstep'){ targetVX = -dir*120; }
    else if(this.intent==='strafe'){ const s=(Math.sin(performance.now()/300)+1)/2; targetVX = dir*(60+s*60)*(Math.random()<0.5?1:-1); }
    else if(this.intent==='shoot'){ targetVX = 0; if(this.cool<=0){ this._seq=[ {kind:'pose',dur:0.22,key:'prep1'}, {kind:'pose',dur:0.26,key:'prep2'} ]; this.cool=2.2 + Math.random()*0.8; this.state='atk'; this._idx=0; this._t=0; this.vx=0; this.animT=0; return; } }

    if(adx<180 && this.cool<=0 && Math.random()<0.25){ this._seq=[ {kind:'pose',dur:0.22,key:'prep1'}, {kind:'pose',dur:0.26,key:'prep2'} ]; this.cool=2.4 + Math.random()*1.0; this.state='atk'; this._idx=0; this._t=0; this.vx=0; this.animT=0; return; }

    this.vx = targetVX; this.updatePhysics(dt,this.world);
    this.state = !this.onGround ? 'jump' : (Math.abs(this.vx)>1?'run':'idle'); this.animT+=dt;
  }
  draw(ctx,world){
    ctx.save(); ctx.translate(this.x-world.camX, this.y-world.camY);
    if(this.spinT>0 || this.dead){ ctx.rotate(this.spinAngle); }
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

class Screw extends CharacterBase{
  constructor(world,effects,assets,x=1400){
    super(62,68);
    this.world=world; this.effects=effects; this.assets=assets;
    this.x=x; this.y=world.stage.groundY - this.h/2 - 220; // 天から
    this.face=-1; this.maxhp=2000; this.hp=2000;
    this.cool=0; this.state='idle'; this.animT=0; this._seq=null; this._idx=0; this._t=0;
  }
  img(key){
    const map={ idle:'B1.png', w1:'B2.png', w2:'B3.png', a1a:'B5.png', a1b:'B6.png', sPrep:'B8.png', s1:'B9.png', uPrep:'B12.png', uDash:'B13.png', uFin:'B14.png' };
    return this.assets.img(map[key]||'B1.png');
  }
  aabb(){ return {x:this.x, y:this.y, w:this.w*0.68, h:this.h*0.92}; }
  update(dt, player){
    if(this.dead){ this.updatePhysics(dt,this.world); return; }
    if(this.cool>0) this.cool=Math.max(0,this.cool-dt);

    if(this._seq){
      this.updatePhysics(dt,this.world); this._t+=dt; const cur=this._seq[this._idx];
      if(cur?.fx){ this.x += this.face * cur.fx * dt; }
      if(cur?.hit){
        const hb={x:this.x + this.face*cur.hx, y:this.y, w:cur.hw, h:cur.hh};
        if(player.invulnT<=0 && U.rectsOverlap(hb, player.aabb())){
          const hit=player.hurt(cur.power, this.face, {lift:cur.lift,kbMul:cur.kbm,kbuMul:cur.kbum}, this.effects);
          if(hit) updateHPUI(player.hp,player.maxhp);
        }
      }
      if(this._t>=cur.dur){ this._idx++; this._t=0;
        if(this._idx>=this._seq.length){ this._seq=null; this.state='idle'; this.vx=0; } }
      this.animT+=dt; return;
    }

    const dx=player.x-this.x, adx=Math.abs(dx); this.face=dx>=0?1:-1;
    if(this.cool<=0){
      if(adx<140){
        this.state='atk'; this._seq=[
          {dur:0.10, key:'a1a', fx:140},
          {dur:0.16, key:'a1b', fx:190, hit:true, hx:22, hw:46, hh:36, power:36, lift:0.6, kbm:1.0, kbum:1.0}
        ]; this.cool=1.0; this._idx=0; this._t=0; return;
      }
      if(adx<320 && Math.random()<0.45){
        this.state='skill';
        this._seq=[
          {dur:0.46, key:'sPrep', fx:0},
          {dur:0.22, key:'s1', fx:560, hit:true, hx:22, hw:56, hh:40, power:64, lift:1.0, kbm:1.1, kbum:1.1}
        ];
        this.cool=3.0; this._idx=0; this._t=0; return;
      }
      if(adx<360 && Math.random()<0.30){
        this.state='ult';
        this._seq=[
          {dur:0.40, key:'uPrep', fx:0},
          {dur:0.24, key:'uDash', fx:620},
          {dur:0.20, key:'uFin',  fx:0, hit:true, hx:26, hw:64, hh:50, power:120, lift:1.4, kbm:1.2, kbum:1.2}
        ];
        this.cool=7.0; this._idx=0; this._t=0; return;
      }
    }
    this.vx = (dx>0? CONST.MOVE : -CONST.MOVE);
    this.updatePhysics(dt,this.world);
    this.state = !this.onGround ? 'jump' : (Math.abs(this.vx)>1?'run':'idle');
    this.animT+=dt;
  }
  draw(ctx,world){
    ctx.save(); ctx.translate(this.x-world.camX, this.y-world.camY); if(this.face<0) ctx.scale(-1,1);
    if(this.spinT>0 || this.dead){ ctx.rotate(this.spinAngle); }
    let img=null;
    if(this._seq){ const cur=this._seq[this._idx]; img=this.img(cur?.key||'idle'); }
    else if(this.state==='run'){ const f=Math.floor(this.animT*6)%2; img=this.img(f?'w1':'w2'); }
    else img=this.img('idle');
    if(img){ const scale=this.h/img.height, w=img.width*scale, h=this.h; ctx.imageSmoothingEnabled=false; ctx.drawImage(img, Math.round(-w/2), Math.round(-h/2), Math.round(w), Math.round(h)); }
    ctx.restore(); this.drawHPBar(ctx,world);
  }
}

/* ================================
 * Stage Manager
 * ================================ */
function updateHPUI(hp,maxhp){
  const fill=document.getElementById('hpfill');
  document.getElementById('hpnum').textContent=hp;
  fill.style.width=Math.max(0,Math.min(100,(hp/maxhp)*100))+'%';
}

class StageManager{
  constructor(world,effects,assets){
    this.world=world; this.effects=effects; this.assets=assets;
    this.player=null; this.enemies=[];
    this.kills=0; this.started=false; this.phase='entrance'; this.boss=null;
  }
  createPlayer(){
    this.player = new Player(this.assets, this.world, this.effects);
    updateHPUI(this.player.hp, this.player.maxhp);
    return this.player;
  }
  setEntrance(){
    const groundY = 452; // ★黄土色の地面に合わせて下げる
    const left = 0, right = 2200;
    this.world.setStage({
      left, right, groundY,
      bgName:'ST1.png', loop:true,
      obstacles: [
        {x:420,  y:groundY-24, w:120, h:48, img:'contena.png'},
        {x:760,  y:groundY-24, w:120, h:48, img:'contena.png'},
        {x:1120, y:groundY-24, w:120, h:48, img:'contena.png'}
      ]
    });
    this.kills=0; this.phase='entrance'; this.boss=null; this.enemies.length=0;
  }
  setIndoor(){
    const groundY = 452;
    const left = 0, right = 1000; // 狭い室内
    this.world.setStage({ left, right, groundY, bgName:'CS.png', loop:false, obstacles: [] });
    this.kills=0; this.phase='indoor'; this.boss=null; this.enemies.length=0;
    this.player.x = 80; this.player.y = groundY - this.player.h/2; this.world.camX=0;
  }
  spawnWaru(n=3){
    const s=this.world.stage;
    for(let i=0;i<n;i++){
      const x = U.clamp( (Math.random()*(s.right-s.left-240))+120 , s.left+120, s.right-120);
      this.enemies.push(new WaruMOB(this.world,this.effects,this.assets,x));
    }
  }
  banner(text, ms=1000, shake=false){
    const el=document.getElementById('banner');
    el.textContent=text; el.classList.add('show');
    if(shake) this.effects.shake(0.35,12);
    setTimeout(()=>{ el.classList.remove('show'); }, ms);
  }

  update(dt,input){
    if(!this.started) return;
    const p=this.player;

    if(this.phase==='entrance'){
      const alive = this.enemies.filter(e=>!e.dead).length;
      if(alive<3 && this.kills<15){ this.spawnWaru(3-alive); }
      if(this.kills>=15 && alive===0){
        this.banner('室内へ', 1200);
        this.setIndoor();
      }
    }else if(this.phase==='indoor'){
      const alive = this.enemies.filter(e=>!e.dead).length;
      if(this.kills<10 && alive<3){ this.spawnWaru(Math.min(3-alive, 3)); }
      if(this.kills>=10 && !this.boss){
        this.banner('MOBスクリュー登場！', 1000, true);
        this.boss = new Screw(this.world,this.effects,this.assets, 600);
        this.enemies.push(this.boss);
      }
      if(this.boss && (this.boss.dead && this.boss.fade<=0)){
        this.boss=null; this.banner('ステージクリア!!', 2000, false);
        setTimeout(()=>{ this.stopToTitle(); }, 2000);
      }
    }

    p.update(dt,input,this.world,this.enemies);

    for(const e of this.enemies){
      e.update(dt,p);
      if(e.projectiles){
        for(const b of e.projectiles){
          if(!b.dead && p.invulnT<=0 && U.rectsOverlap(b.aabb(), p.aabb())){
            b.dead=true; const hit=p.hurt(b.power, b.dir, {lift:0, kbMul:0.55, kbuMul:0.5}, this.effects);
            if(hit) updateHPUI(p.hp,p.maxhp);
          }
        }
      }
      // すり抜け軽減：のめり込み解消
      if(!e.dead && !p.dead){
        const a=p.aabb(), b=e.aabb(); if(!U.rectsOverlap(a,b)) continue;
        const dx = (p.x - e.x); const dy = (p.y - e.y);
        const overlapX = (a.w + b.w)/2 - Math.abs(dx);
        const overlapY = (a.h + b.h)/2 - Math.abs(dy);
        if(overlapY < overlapX){
          const dirY = dy>=0? 1 : -1;
          p.y += dirY * overlapY * 0.9; e.y -= dirY * overlapY * 0.1;
          if(dirY<0){ p.vy = Math.max(p.vy, 0); } else { p.vy = Math.min(p.vy, 0); }
        } else {
          const dirX = dx>=0? 1 : -1;
          p.x += dirX * overlapX * 0.6; e.x -= dirX * overlapX * 0.4;
          p.vx += dirX * 20; e.vx -= dirX * 20;
        }
      }
    }

    for(const e of this.enemies){
      if(e.dead && !e._counted){ e._counted=true; this.kills++; }
    }
    this.enemies=this.enemies.filter(e=>!(e.dead && e.fade<=0));

    this.effects.update(dt); this.world.updateCam(p); this.world.updateTimer(dt); this.world.draw(p,this.enemies);
  }

  startFromTitle(){
    this.started=true; this.effects.hitstop=0; this.world.time=0;
    this.setEntrance();
    if(!this.player) this.createPlayer();
    document.getElementById('titleOverlay').classList.remove('show');
  }
  stopToTitle(){
    this.started=false;
    document.getElementById('titleOverlay').classList.add('show');
    this.enemies.length=0; this.kills=0; this.boss=null; this.phase='entrance';
    this.world.time=0; document.getElementById('time').textContent='00:00';
  }
}

/* ================================
 * Boot
 * ================================ */
const canvas = document.getElementById('game');
const assets = new Assets();
const effects = new Effects();
const input = new Input();
const world = new World(assets, canvas, effects);

const imgs=[
  // 背景／障害物
  'ST1.png','CS.png','contena.png',
  // Player
  'M1-1.png','M1-2.png','M1-3.png','M1-4.png',
  'K1-1.png','K1-2.png','K1-3.png','K1-4.png',
  'h1.png','h2.png','h3.png','h4.png',
  // Enemies minimal
  'teki1.png','teki2.png','teki3.png','teki7.png',
  'B1.png','B2.png','B3.png','B5.png','B6.png','B8.png','B9.png','B12.png','B13.png','B14.png'
];

assets.load(imgs).then(()=>{
  const stage = new StageManager(world, effects, assets);
  stage.createPlayer();

  document.getElementById('btnStart').addEventListener('click', ()=>{ stage.startFromTitle(); });

  let lastT = U.now();
  const loop=()=>{ const t=U.now(); let dt=(t-lastT)/1000; if(dt>0.05) dt=0.05; lastT=t;
    if(effects.hitstop>0){ effects.update(dt); world.updateCam(stage.player); world.draw(stage.player, stage.enemies); }
    else{ stage.update(dt, input); }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  updateHPUI(stage.player.hp, stage.player.maxhp);
});

function updateHPUI(hp,maxhp){
  const fill=document.getElementById('hpfill');
  document.getElementById('hpnum').textContent=hp;
  fill.style.width=Math.max(0,Math.min(100,(hp/maxhp)*100))+'%';
}

})();
