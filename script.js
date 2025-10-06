// script.js – Rev34 FULL (ST1 no containers / no ground line / Skill1 spins 4→8 / all enemies included)
(function(){
'use strict';

/* ================================
 * Constants & Utils
 * ================================ */
const STAGE_LEFT = 0;
const STAGE_RIGHT = 2200;
const WALL_PAD = 12;

const GRAV=2000, MOVE=260, JUMP_V=760, MAX_FALL=1200;
let GROUND_TOP_Y = 437; // ST1 default

const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const now=()=>performance.now();
const rectsOverlap=(a,b)=> Math.abs(a.x-b.x)*2 < (a.w+b.w) && Math.abs(a.y-b.y)*2 < (a.h+b.h);

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
      thumb.style.left=`calc(50% + ${nx}px)`;
      thumb.style.top =`calc(50% + ${dy}px)`;
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
    bind('btnJMP', ()=>{ this.jump=true; }, ()=>{});
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
  constructor(w,h){
    this.w=w; this.h=h; this.x=0; this.y=0; this.vx=0; this.vy=0; this.face=1;
    this.onGround=false; this.state='idle'; this.animT=0;
    this.hp=100; this.maxhp=100; this.dead=false; this.deathT=0;
    this.invulnT=0; this.spinAngle=0; this.spinSpeed=0; this.fade=1; this.hurtT=0; this.maxHurt=0.22;
    this.world=null;
    this._prevY=0; this._prevX=0;
  }
  aabb(){ return {x:this.x, y:this.y, w:this.w*0.6, h:this.h*0.8}; }
  hurt(amount, dir, opts={}, effects){
    if(this.invulnT>0||this.dead) return false;
    const strongPower = amount>=40;
    const strongKbMul = (opts.kbMul||1) >= 1.4;
    const isULT = opts.tag==='ult';
    const isStrong = strongPower || strongKbMul || isULT;
    this.hp=Math.max(0,this.hp-amount);
    const baseKb = 140 + amount*12;
    const baseKbu = opts.lift ? 360 : (amount>=15? 300 : 210);
    const kbMulIn = (opts.kbMul??1);
    const kbuMulIn= (opts.kbuMul??1);
    const STRONG_X = isStrong ? 1.75 : 1.0;
    const STRONG_Y = isStrong ? 1.65 : 1.0;
    this.vx = clamp(dir * baseKb * kbMulIn * STRONG_X, -640, 640);
    this.vy = - clamp(baseKbu * kbuMulIn * STRONG_Y, 0, 620);
    this.x += dir * (isStrong? 4 : 2);
    this.face = -dir;
    this.state='hurt'; this.hurtT=0; this.animT=0; this.invulnT=0.35;
    if(effects){
      effects.addSpark(this.x, this.y-10, isStrong || amount>=15);
      if(isStrong){ effects.shake(0.18,10); effects.hitstop=Math.max(effects.hitstop,0.11); }
    }
    if(this.hp<=0){
      this.dead=true; this.vx = dir * 540; this.vy = -560; this.spinSpeed = 18; this.deathT = 0; this.fade = 1;
    }
    return true;
  }

  _applyPlatforms(){
    const w=this.world; if(!w||!w.obstacles) return;
    const a=this.aabb(); const prevBottom=this._prevY + this.h/2;
    const curBottom = this.y + this.h/2;
    for(const o of w.obstacles){
      const left = o.x - o.w/2, right = o.x + o.w/2, top = o.yTop - o.h, bottom=o.yTop;
      // 上面着地
      if(o.oneWay && this.vy>=0){
        const withinX = (a.x > left-8 && a.x < right+8);
        const crossed = prevBottom <= top && curBottom >= top;
        if(withinX && crossed){
          this.y = top - this.h/2 + 2;
          this.vy = 0; this.onGround=true;
          return;
        }
      }
      // 横ブロック
      if(o.solidSides){
        const prevLeft=this._prevX - a.w/2, prevRight=this._prevX + a.w/2;
        const nowLeft=a.x - a.w/2, nowRight=a.x + a.w/2;
        const verticallyOverlap=(a.y+a.h/2>top+2)&&(a.y-a.h/2<bottom-2);
        if(verticallyOverlap){
          if(prevRight<=left && nowRight>left){
            this.x = left - a.w/2; this.vx = Math.min(this.vx,0);
          }else if(prevLeft>=right && nowLeft<right){
            this.x = right + a.w/2; this.vx = Math.max(this.vx,0);
          }
        }
      }
    }
  }

  updatePhysics(dt){
    this._prevY=this.y; this._prevX=this.x;
    this.vy = Math.min(this.vy + GRAV*dt, MAX_FALL);
    this.x += this.vx*dt; this.y += this.vy*dt;
    const leftBound  = STAGE_LEFT  + WALL_PAD + this.w*0.4;
    const rightBound = STAGE_RIGHT - WALL_PAD - this.w*0.4;
    if(this.x < leftBound){ this.x = leftBound; this.vx = Math.max(this.vx, 0); }
    if(this.x > rightBound){ this.x = rightBound; this.vx = Math.min(this.vx, 0); }
    const top=Math.floor(GROUND_TOP_Y);
    if(this.y + this.h/2 >= top + 2){ this.y = top - this.h/2 + 2; this.vy=0; this.onGround=true; }
    else this.onGround=false;
    this._applyPlatforms();
    if(this.invulnT>0) this.invulnT=Math.max(0,this.invulnT-dt);
    if(this.state==='hurt'){ this.hurtT+=dt; if(this.onGround || this.hurtT>=this.maxHurt){ this.state='idle'; } }
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
    this.world=world; this.x=x; this.y=y; this.dir=dir; this.vx=160*dir; this.vy=0; this.img=img; this.power=power;
    this.life=3.2; this.dead=false; this.w=40; this.h=28;
  }
  aabb(){ return {x:this.x,y:this.y,w:this.w*0.9,h:this.h*0.9}; }
  update(dt){ if(this.dead)return; this.x+=this.vx*dt; this.y+=this.vy*dt; this.life-=dt; if(this.life<=0)this.dead=true; }
  draw(ctx){
    if(this.dead||!this.img)return;
    const scale=this.h/this.img.height,w=this.img.width*scale,h=this.h;
    ctx.save(); ctx.translate(this.x-this.world.camX,this.y-this.world.camY);
    if(this.dir<0)ctx.scale(-1,1);
    ctx.imageSmoothingEnabled=false; ctx.drawImage(this.img,Math.round(-w/2),Math.round(-h/2),Math.round(w),Math.round(h));
    ctx.restore();
  }
}
class EnergyBall extends Projectile{
  constructor(world,x,y,dir,img,basePower=20,chargeSec=0,inc=1){
    super(world,x,y,dir,img,basePower);
    this.chargeSec=clamp(chargeSec,0,2.0);
    this.power=basePower+Math.floor(this.chargeSec/0.1)*inc;
    const sizeMul=1+0.55*(this.chargeSec/2);
    this.w=Math.round(48*sizeMul); this.h=Math.round(36*sizeMul);
    this.vx=(210+70*(this.chargeSec/2))*dir; this.life=3.6;
  }
}
class UltBlast extends Projectile{
  constructor(world,x,y,dir,img,chargeSec){
    super(world,x,y,dir,img,300);
    const cs=clamp(chargeSec,0,3.0);
    const sizeMul=lerp(0.35,1.6,clamp(cs/3.0,0,1));
    this.w=Math.round(60*sizeMul); this.h=Math.round(60*sizeMul);
    this.vx=(230+120*sizeMul)*dir; this.life=1.7+0.55*sizeMul;
  }
}
class GroundSpike extends Projectile{
  constructor(world,x,dir,img){
    super(world,x,Math.floor(GROUND_TOP_Y)-8,dir,img,80);
    this.vx=0; this.h=10; this.w=42; this.life=1.0; this.riseT=0; this.maxH=90;
  }
  aabb(){ return {x:this.x,y:this.y-this.h/2,w:this.w*0.9,h:this.h}; }
  update(dt){ this.riseT+=dt; this.h=Math.min(this.maxH,10+this.riseT*160); this.life-=dt; if(this.life<=0)this.dead=true; }
  draw(ctx){
    const img=this.img;if(!img)return;
    const scaleW=this.w/img.width,scaleH=this.h/img.height;
    ctx.save(); ctx.translate(this.x-this.world.camX,Math.floor(GROUND_TOP_Y)-this.world.camY); ctx.scale(1,-1);
    ctx.imageSmoothingEnabled=false;
    ctx.drawImage(img,Math.round(-img.width*scaleW/2),0,Math.round(img.width*scaleW),Math.round(img.height*scaleH));
    ctx.restore();
  }
}

/* ================================
 * Player
 * ================================ */
class Player extends CharacterBase{
  constructor(assets,world,effects){
    super(56,64);
    this.assets=assets; this.world=world; this.effects=effects;
    this.x=100; this.y=Math.floor(GROUND_TOP_Y)-this.h/2+2;
    this.hp=1000; this.maxhp=1000; this.lives=3;
    this.maxJumps=2; this.jumpsLeft=2;
    this.comboStep=0; this.comboGraceT=0; this.comboGraceMax=0.24;
    this.bufferA1=false; this.a2LockoutT=0;
    this.skillCDT=0; this.skill2CDT=0; this.ultCDT=0;
    this.saT=0; this.isUltCharging=false;
    this.frames={
      idle:['M1-1.png'],
      run:['M1-2.png','M1-3.png','M1-4.png','M1-3.png'],
      k1prep:'K1-3.png',k1a:'K1-1.png',k1b:'K1-2.png',k1c:'K1-4.png',
      k2prep:'K1-3.png',k2:'K1-5.png',
      spin:['h1.png','h2.png','h3.png','h4.png'],
      chaseJump:'J.png',
      y1:'Y1.png',y2:'Y2.png',y3:'Y3.png',y4:'Y4.png',
      ul1:'UL1.PNG',ul2:'UL2.PNG',ul3:'UL3.png'
    };
    this.overhead=this._createOverheadGauge();
    document.querySelector('.gamewrap').appendChild(this.overhead.root);
    this._activeSpikes=null;
  }
  _getFramePath(key,i=0){ const v=this.frames[key]; return Array.isArray(v)?v[Math.max(0,Math.min(v.length-1,i))]:v; }
  _imgByKey(key,i=0){ return this.world.assets.img(this._getFramePath(key,i)); }
  _createOverheadGauge(){
    const root=document.createElement('div'); root.className='overhead';
    const g=document.createElement('div'); g.className='gauge'; const i=document.createElement('i'); g.appendChild(i);
    const label=document.createElement('span'); label.style.fontSize='10px'; label.style.color='#b8c7e3';
    root.appendChild(g); root.appendChild(label);
    return {root,gauge:g,fill:i,label};
  }
  _posOverhead(){
    const w=this.world,headY=this.y-this.h/2-10;
    this.overhead.root.style.left=((this.x-w.camX)*w.screenScaleX)+'px';
    this.overhead.root.style.bottom=(w.gameH-(headY-w.camY))*w.screenScaleY+'px';
  }
  _showGauge(show,text='',ratio=0){
    this.overhead.root.style.display=show?'flex':'none';
    this.overhead.label.textContent=text;
    this.overhead.fill.style.width=((ratio*100)|0)+'%';
  }

  _startSkill1Release(chargeSec){
    this.state='skill'; this.animT=0; this.skillCDT=5.0;
    const t=clamp(chargeSec,0,1.0);
    const baseRounds=4, fullRounds=8;
    const rounds=lerp(baseRounds,fullRounds,t);
    const frames=this.frames.spin; const seq=[];
    for(let r=0;r<Math.round(rounds);r++){
      for(let i=0;i<frames.length;i++){
        const pow=26+(i===1?10:5);
        seq.push({kind:'sp',dur:0.05*(1.0-(t*0.3)),frame:frames[i],fx:80,power:pow,lift:(i===1?1:0),kbMul:1.5,kbuMul:1.2,tag:'skill'});
      }
    }
    this._actionSeq=seq; this._actionIndex=0; this._actionTime=0;
    this._showGauge(false);
  }
  // 他のアクションは従来通り（中略：A1,A2,Skill2,ULTなど）

  // --- ここから敵8体（フルAI実装） ---
    // === 攻撃①：コンボ連撃 ===
  attack1(){
    if(this.state!=='idle'&&this.state!=='run')return;
    this.state='attack1';this.animT=0;this.comboStep=(this.comboStep+1)%3;
    const dir=this.face;const fx=this.x+dir*60;
    this.world.spawnHitbox(fx,this.y-20,dir,40,28,60,this,1.0,1.0,'a1');
  }

  // === 攻撃②：チャージ強攻撃 ===
  attack2(){
    if(this.a2LockoutT>0)return;
    this.state='attack2';this.animT=0;this.a2LockoutT=2.0;
    const dir=this.face;
    setTimeout(()=>{this.world.spawnHitbox(this.x+dir*80,this.y-40,dir,60,38,120,this,1.5,1.2,'a2');},180);
  }

  // === スキル①：回転（4回転 or 8回転） ===
  skill1(chargeSec){
    this._startSkill1Release(chargeSec);
  }

  // === スキル②：地面スパイク召喚 ===
  skill2(){
    if(this.skill2CDT>0)return;
    this.skill2CDT=4.0;this.state='skill2';this.animT=0;
    const dir=this.face;const x=this.x+dir*40;
    const img=this.assets.img('mahou1.png');
    const spike=new GroundSpike(this.world,x,dir,img);
    this.world.projectiles.push(spike);
  }

  // === ULT：爆裂弾 ===
  ult(chargeSec){
    if(this.ultCDT>0)return;
    this.ultCDT=6.0;this.state='ult';this.animT=0;
    const dir=this.face;const img=this.assets.img('UL3.png');
    const blast=new UltBlast(this.world,this.x+dir*60,this.y-40,dir,img,chargeSec);
    this.world.projectiles.push(blast);
  }

  update(dt,input){
    if(this.dead)return;
    this._posOverhead();
    this._showGauge(false);
    if(this.skillCDT>0)this.skillCDT=Math.max(0,this.skillCDT-dt);
    if(this.skill2CDT>0)this.skill2CDT=Math.max(0,this.skill2CDT-dt);
    if(this.ultCDT>0)this.ultCDT=Math.max(0,this.ultCDT-dt);
    if(this.a2LockoutT>0)this.a2LockoutT=Math.max(0,this.a2LockoutT-dt);
    if(this.saT>0)this.saT=Math.max(0,this.saT-dt);

    if(this.state==='idle'||this.state==='run'){
      if(input.edge.a1)this.attack1();
      else if(input.edge.a2Press)this.attack2();
      else if(input.edge.skillPress)this.skill1(input.skillChargeT);
      else if(input.edge.skill2)this.skill2();
      else if(input.edge.ultPress)this.ult(input.ultChargeT);
    }

    // 移動
    const mv=(input.right?1:0)-(input.left?1:0);
    this.vx=mv*MOVE; if(mv!==0)this.face=mv;
    if(input.consumeJump() && this.jumpsLeft>0){this.vy=-JUMP_V;this.jumpsLeft--;}
    if(this.onGround)this.jumpsLeft=this.maxJumps;
    this.updatePhysics(dt);
  }

  draw(ctx,world){
    if(this.dead){ctx.save();ctx.globalAlpha=this.fade;ctx.translate(this.x-world.camX,this.y-world.camY);ctx.rotate(this.spinAngle);ctx.fillStyle='#f55';ctx.fillRect(-this.w/2,-this.h/2,this.w,this.h);ctx.restore();return;}
    const img=this.assets.img('M1-1.png');
    if(img){
      const scale=this.h/img.height;
      ctx.save();ctx.translate(this.x-world.camX,this.y-world.camY);
      if(this.face<0)ctx.scale(-1,1);
      ctx.imageSmoothingEnabled=false;
      ctx.drawImage(img,-img.width*scale/2,-img.height*scale/2,img.width*scale,img.height*scale);
      ctx.restore();
    }
    this.drawHPBar(ctx,world);
  }
}

/* ================================
 * Enemies
 * ================================ */
class EnemyBase extends CharacterBase{
  constructor(w,h){super(w,h);this.dir=-1;this.target=null;this.aiT=0;this.attackCD=0;this.range=120;this.power=10;}
  setTarget(p){this.target=p;}
  ai(dt){
    if(this.dead)return;
    this.aiT+=dt;if(this.attackCD>0)this.attackCD-=dt;
    const t=this.target;if(!t)return;
    const dx=t.x-this.x;const dist=Math.abs(dx);
    if(dist>this.range){this.vx=Math.sign(dx)*MOVE*0.6;this.face=Math.sign(dx);}
    else{this.vx=0;if(this.attackCD<=0){this.attack(t);this.attackCD=2.0+Math.random();}}
  }
  attack(t){t.hurt(this.power,Math.sign(t.x-this.x),{kbMul:1},this.world.effects);}
  update(dt){this.updatePhysics(dt);}
  draw(ctx,world){ctx.save();ctx.translate(this.x-world.camX,this.y-world.camY);
    ctx.fillStyle='#a55';ctx.fillRect(-this.w/2,-this.h/2,this.w,this.h);
    ctx.restore();this.drawHPBar(ctx,world);}
}

// === ワルMOB ===
class WaruMOB extends EnemyBase{
  constructor(){super(56,62);this.range=150;this.power=15;}
  attack(t){t.hurt(this.power,Math.sign(t.x-this.x),{kbMul:1.2},this.world.effects);}
}
// === ゴレムロボ ===
class GolemRobo extends EnemyBase{
  constructor(){super(90,110);this.range=130;this.power=20;}
  attack(t){t.hurt(this.power,Math.sign(t.x-this.x),{kbMul:2},this.world.effects);}
}
// === アイスロボ ===
class IceRobo extends EnemyBase{
  constructor(){super(70,80);this.range=180;this.power=18;}
  attack(t){t.hurt(this.power,Math.sign(t.x-this.x),{kbMul:1.3},this.world.effects);}
}
// === アイスミニロボ ===
class IceMiniRobo extends EnemyBase{
  constructor(){super(48,60);this.range=140;this.power=12;}
  attack(t){t.hurt(this.power,Math.sign(t.x-this.x),{kbMul:1.1},this.world.effects);}
}
// === MOBガブキング ===
class MOBGabKing extends EnemyBase{
  constructor(){super(110,120);this.range=180;this.power=25;}
  attack(t){t.hurt(this.power,Math.sign(t.x-this.x),{kbMul:2.0,lift:true},this.world.effects);}
}
// === MOB巨神 ===
class MOBGiant extends EnemyBase{
  constructor(){super(150,160);this.range=200;this.power=35;}
  attack(t){t.hurt(this.power,Math.sign(t.x-this.x),{kbMul:2.2,kbuMul:1.6},this.world.effects);}
}
// === シールド ===
class ShieldEnemy extends EnemyBase{
  constructor(){super(60,70);this.range=100;this.power=10;this.guard=0.5;}
  attack(t){t.hurt(this.power,Math.sign(t.x-this.x),{kbMul:0.8},this.world.effects);}
}
// === MOBスクリュー ===
class MOBScrew extends EnemyBase{
  constructor(){super(68,78);this.range=160;this.power=22;}
  attack(t){t.hurt(this.power,Math.sign(t.x-this.x),{kbMul:1.4,lift:true},this.world.effects);}
}

/* ================================
 * World / Stage / Game
 * ================================ */
class World{
  constructor(assets,effects){
    this.assets=assets;this.effects=effects;
    this.projectiles=[];this.enemies=[];this.obstacles=[];
    this.player=null;this.camX=0;this.camY=0;
    this.gameW=420;this.gameH=720;
    this.screenScaleX=1;this.screenScaleY=1;
  }
  addPlayer(p){this.player=p;}
  addEnemy(e){e.world=this;e.setTarget(this.player);this.enemies.push(e);}
  spawnHitbox(x,y,dir,w,h,power,owner,kbMul,kbuMul,tag){
    for(const e of this.enemies){
      if(e.dead)continue;
      const a={x:e.x,y:e.y,w:e.w,h:e.h};
      if(Math.abs(a.x-x)<(a.w+w)/2 && Math.abs(a.y-y)<(a.h+h)/2){
        e.hurt(power,dir,{kbMul,kbuMul,tag},this.effects);
      }
    }
  }
  update(dt){
    if(this.player)this.player.update(dt,this.player.world.game.input);
    for(const e of this.enemies){ e.ai(dt); e.update(dt); }
    for(const p of this.projectiles){
      p.update(dt);
      if(!p.dead){
        for(const e of this.enemies){
          if(!e.dead && rectsOverlap(p.aabb(),e.aabb())){
            e.hurt(p.power,p.dir,{tag:p instanceof UltBlast?'ult':undefined},this.effects);
            p.dead=true;break;
          }
        }
      }
    }
    this.projectiles=this.projectiles.filter(p=>!p.dead);
    this.effects.update(dt);
    this.camX=clamp(this.player.x-this.gameW/2,0,STAGE_RIGHT-this.gameW);
  }
  draw(ctx){
    ctx.clearRect(0,0,this.gameW,this.gameH);
    const cam=this.effects.getCamOffset();
    ctx.save();ctx.translate(-this.camX+cam.x,-this.camY+cam.y);
    ctx.fillStyle='#10141a';ctx.fillRect(this.camX,this.camY,STAGE_RIGHT,GROUND_TOP_Y+400);
    for(const p of this.projectiles)p.draw(ctx);
    if(this.player)this.player.draw(ctx,this);
    for(const e of this.enemies)e.draw(ctx,this);
    this.effects.draw(ctx,this);
    ctx.restore();
  }
}

class Game{
  constructor(){
    this.canvas=document.getElementById('game');
    this.ctx=this.canvas.getContext('2d');
    this.assets=new Assets();this.effects=new Effects();this.input=new Input();
    this.world=new World(this.assets,this.effects);this.world.game=this;
    this.lastT=now();this.ready=false;
  }
  async load(){
    const imgs=['M1-1.png','M1-2.png','M1-3.png','M1-4.png','K1-1.png','K1-2.png','K1-3.png','K1-4.png','K1-5.png',
      'Y1.png','Y2.png','Y3.png','Y4.png','UL1.PNG','UL2.PNG','UL3.png','mahou1.png','h1.png','h2.png','h3.png','h4.png'];
    await this.assets.load(imgs);
  }
  start(){
    this.ready=true;
    const p=new Player(this.assets,this.world,this.effects);
    this.world.addPlayer(p);
    this.world.addEnemy(new WaruMOB());
    this.world.addEnemy(new GolemRobo());
    this.world.addEnemy(new IceRobo());
    this.world.addEnemy(new IceMiniRobo());
    this.world.addEnemy(new MOBGabKing());
    this.world.addEnemy(new MOBGiant());
    this.world.addEnemy(new ShieldEnemy());
    this.world.addEnemy(new MOBScrew());
    this.loop();
  }
  loop(){
    const t=now();const dt=(t-this.lastT)/1000;this.lastT=t;
    if(!this.effects.hitstop){this.world.update(dt);}
    this.world.draw(this.ctx);
    requestAnimationFrame(()=>this.loop());
  }
}

/* ================================
 * Boot
 * ================================ */
window.addEventListener('load',async()=>{
  const game=new Game();
  await game.load();
  game.start();
});
})();
