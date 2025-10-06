// script.js – Rev33 FULL Part①
(function(){
'use strict';

/* =======================================================
 * 定数 / 汎用関数
 * ======================================================= */
const STAGE_LEFT = 0;
const STAGE_RIGHT = 2200;
const WALL_PAD = 12;
let GROUND_TOP_Y = 360;

const GRAV = 2000, MOVE = 260, JUMP_V = 760, MAX_FALL = 1200;
const FOOT_PAD = 2;

const clamp = (v,min,max)=>Math.max(min,Math.min(max,v));
const lerp  = (a,b,t)=>a+(b-a)*t;
const now   = ()=>performance.now();
const rectsOverlap=(a,b)=> Math.abs(a.x-b.x)*2<(a.w+b.w) && Math.abs(a.y-b.y)*2<(a.h+b.h);

/* =======================================================
 * エフェクト / 演出
 * ======================================================= */
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
    for(const s of this.sparks)s.t+=dt;
    this.sparks=this.sparks.filter(s=>s.t<s.life);
  }
  draw(ctx,world){
    for(const s of this.sparks){
      const p=s.t/s.life; const w=s.strong?2:1;
      ctx.save(); ctx.translate(s.x-world.camX,s.y-world.camY);
      ctx.globalAlpha=1-p; ctx.strokeStyle="#fff"; ctx.lineWidth=w;
      ctx.beginPath(); ctx.moveTo(-10,0); ctx.lineTo(10,0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0,-6); ctx.lineTo(0,6); ctx.stroke();
      ctx.restore();
    }
  }
}

/* =======================================================
 * アセット管理
 * ======================================================= */
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
  has(n){ return this.images.has(n)&&!this.missing.has(n); }
}

/* =======================================================
 * 入力管理（キー＋タッチ）
 * ======================================================= */
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
    addEventListener('keydown',e=>{
      const k=e.key;
      if(k==='ArrowLeft'||k==='a'||k==='A') this.left=1;
      if(k==='ArrowRight'||k==='d'||k==='D') this.right=1;
      if(k===' '||k==='w'||k==='W'||k==='ArrowUp') this.jump=true;
      if(k==='j'||k==='J') this.btn.a1=true;
      if(k==='k'||k==='K'){ if(!this.btn.a2){ this.btn.a2=true; this.edge.a2Press=true; } }
      if(k==='l'||k==='L'){ if(!this.btn.skill){ this.btn.skill=true; this.edge.skillPress=true; this.skillCharging=true; this.skillChargeT=0; } }
      if(k==='o'||k==='O'){ this.edge.skill2=true; this.btn.skill2=true; }
      if(k==='u'||k==='U'){ if(!this.btn.ult){ this.btn.ult=true; this.edge.ultPress=true; this.ultCharging=true; this.ultChargeT=0; } }
    },{passive:false});
    addEventListener('keyup',e=>{
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
      if(!origin)return;
      const dx=t.clientX-origin.x, dy=t.clientY-origin.y;
      const rMax=40,len=Math.hypot(dx,dy);
      const nx=(len>rMax?dx/len*rMax:dx);
      const ny=(len>rMax?dy/len*rMax:dy);
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
    const onEnd=e=>{
      for(const t of e.changedTouches){
        if(t.identifier===stickId){
          stickId=-1; origin=null; thumb.style.left='50%'; thumb.style.top='50%'; this.left=0; this.right=0;
        }
      }
    };
    stickArea.addEventListener('touchstart',e=>{e.preventDefault();onStart(e);},{passive:false});
    stickArea.addEventListener('touchmove',e=>{e.preventDefault();onMove(e);},{passive:false});
    stickArea.addEventListener('touchend',e=>{e.preventDefault();onEnd(e);},{passive:false});
    stickArea.addEventListener('touchcancel',e=>{e.preventDefault();onEnd(e);},{passive:false});
    const bind=(id,onDown,onUp)=>{
      const el=document.getElementById(id);
      el.addEventListener('pointerdown',e=>{e.preventDefault();onDown();el.setPointerCapture?.(e.pointerId);});
      el.addEventListener('pointerup',e=>{e.preventDefault();onUp();el.releasePointerCapture?.(e.pointerId);});
      el.addEventListener('pointercancel',()=>{onUp();});
      el.addEventListener('touchstart',e=>{e.preventDefault();onDown();},{passive:false});
      el.addEventListener('touchend',e=>{e.preventDefault();onUp();},{passive:false});
    };
    bind('btnA1',()=>{this.btn.a1=true;},()=>{this.btn.a1=false;});
    bind('btnA2',()=>{if(!this.btn.a2){this.btn.a2=true;this.edge.a2Press=true;}},()=>{this.btn.a2=false;});
    bind('btnSK',()=>{if(!this.btn.skill){this.btn.skill=true;this.edge.skillPress=true;this.skillCharging=true;this.skillChargeT=0;}},()=>{if(this.btn.skill){this.btn.skill=false;this.edge.skillRelease=true;this.skillCharging=false;}});
    bind('btnSK2',()=>{this.edge.skill2=true;this.btn.skill2=true;},()=>{this.btn.skill2=false;});
    bind('btnULT',()=>{if(!this.btn.ult){this.btn.ult=true;this.edge.ultPress=true;this.ultCharging=true;this.ultChargeT=0;}},()=>{if(this.btn.ult){this.btn.ult=false;this.ultCharging=false;this.edge.ultRelease=true;}});
    bind('btnJMP',()=>{this.jump=true;},()=>{});
  }
  consumeJump(){const j=this.jump;this.jump=false;return j;}
  beginFrame(){
    this.edge.a1=this.btn.a1&&!this.prev.a1;
    this.prev.a1=this.btn.a1;this.prev.a2=this.btn.a2;this.prev.skill=this.btn.skill;
    this.prev.skill2=this.btn.skill2;this.prev.ult=this.btn.ult;
  }
}

/* =======================================================
 * キャラクター基底
 * ======================================================= */
class CharacterBase{
  constructor(w,h){
    this.w=w;this.h=h;this.x=0;this.y=0;this.vx=0;this.vy=0;this.face=1;
    this.onGround=false;this.state='idle';this.animT=0;
    this.hp=100;this.maxhp=100;this.dead=false;this.deathT=0;
    this.invulnT=0;this.spinAngle=0;this.spinSpeed=0;this.fade=1;this.hurtT=0;this.maxHurt=0.22;
    this.world=null;this._prevY=0;
  }
  aabb(){return {x:this.x,y:this.y,w:this.w*0.6,h:this.h*0.8};}
  hurt(amount,dir,opts={},effects){
    if(this.invulnT>0||this.dead)return false;
    const strongPower=amount>=40;const strongKbMul=(opts.kbMul||1)>=1.4;const isULT=opts.tag==='ult';
    const isStrong=strongPower||strongKbMul||isULT;
    this.hp=Math.max(0,this.hp-amount);
    const baseKb=140+amount*12;
    const baseKbu=opts.lift?360:(amount>=15?300:210);
    const kbMulIn=(opts.kbMul??1),kbuMulIn=(opts.kbuMul??1);
    const STRONG_X=isStrong?1.75:1.0;const STRONG_Y=isStrong?1.65:1.0;
    this.vx=clamp(dir*baseKb*kbMulIn*STRONG_X,-640,640);
    this.vy=-clamp(baseKbu*kbuMulIn*STRONG_Y,0,620);
    this.x+=dir*(isStrong?4:2);this.face=-dir;
    this.state='hurt';this.hurtT=0;this.animT=0;this.invulnT=0.35;
    if(effects){effects.addSpark(this.x,this.y-10,isStrong||amount>=15);if(isStrong){effects.shake(0.18,10);effects.hitstop=Math.max(effects.hitstop,0.11);}}
    if(this.hp<=0){this.dead=true;this.vx=dir*540;this.vy=-560;this.spinSpeed=18;this.deathT=0;this.fade=1;}
    return true;
  }
  _applyPlatforms(){
    const w=this.world;if(!w||!w.obstacles||this.vy<0)return;
    const a=this.aabb();const prevBottom=this._prevY+this.h/2;
    const curBottom=this.y+this.h/2;
    for(const o of w.obstacles){
      if(!o.oneWay)continue;
      const left=o.x-o.w/2,right=o.x+o.w/2,top=o.yTop;
      const withinX=(a.x>left-8&&a.x<right+8);
      const crossed=prevBottom<=top&&curBottom>=top;
      if(withinX&&crossed){this.y=top-this.h/2+FOOT_PAD;this.vy=0;this.onGround=true;return;}
    }
  }
  updatePhysics(dt){
    this._prevY=this.y;
    this.vy=Math.min(this.vy+GRAV*dt,MAX_FALL);
    this.x+=this.vx*dt;this.y+=this.vy*dt;
    const leftBound=STAGE_LEFT+WALL_PAD+this.w*0.4;
    const rightBound=STAGE_RIGHT-WALL_PAD-this.w*0.4;
    if(this.x<leftBound){this.x=leftBound;this.vx=Math.max(this.vx,0);}
    if(this.x>rightBound){this.x=rightBound;this.vx=Math.min(this.vx,0);}
    const top=Math.floor(GROUND_TOP_Y);
    if(this.y+this.h/2>=top+FOOT_PAD){this.y=top-this.h/2+FOOT_PAD;this.vy=0;this.onGround=true;}
    else this.onGround=false;
    this._applyPlatforms();
    if(this.invulnT>0)this.invulnT=Math.max(0,this.invulnT-dt);
    if(this.state==='hurt'){this.hurtT+=dt;if(this.onGround||this.hurtT>=this.maxHurt)this.state='idle';}
    if(this.dead){this.deathT+=dt;this.spinAngle+=this.spinSpeed*dt;this.fade=clamp(1-this.deathT/1.2,0,1);}
  }
  drawHPBar(ctx,world){
    const w=36,h=4,x=this.x-world.camX,y=this.y-world.camY-this.h/2-10;
    const ratio=Math.max(0,this.hp/this.maxhp);
    ctx.save();ctx.translate(x,y);
    ctx.fillStyle='rgba(10,18,32,.7)';ctx.fillRect(-w/2,-h/2,w,h);
    ctx.strokeStyle='#1a263d';ctx.lineWidth=1;ctx.strokeRect(-w/2,-h/2,w,h);
    ctx.fillStyle='#7dd3fc';ctx.fillRect(-w/2+1,-h/2+1,(w-2)*ratio,h-2);
    ctx.restore();
  }
}

/* =======================================================
 * Projectile / 弾系
 * ======================================================= */
class Projectile{
  constructor(world,x,y,dir,img,power=10){
    this.world=world;this.x=x;this.y=y;this.dir=dir;this.vx=160*dir;this.vy=0;this.img=img;
    this.power=power;this.life=3.2;this.dead=false;this.w=40;this.h=28;
  }
  aabb(){return {x:this.x,y:this.y,w:this.w*0.9,h:this.h*0.9};}
  update(dt){if(this.dead)return;this.x+=this.vx*dt;this.y+=this.vy*dt;this.life-=dt;if(this.life<=0)this.dead=true;}
  draw(ctx){
    if(this.dead||!this.img)return;const img=this.img;
    const scale=this.h/img.height,w=img.width*scale,h=this.h;
    ctx.save();ctx.translate(this.x-this.world.camX,this.y-this.world.camY);
    if(this.dir<0)ctx.scale(-1,1);
    ctx.imageSmoothingEnabled=false;ctx.drawImage(img,Math.round(-w/2),Math.round(-h/2),Math.round(w),Math.round(h));
    ctx.restore();
  }
}
class EnergyBall extends Projectile{
  constructor(world,x,y,dir,img,basePower=20,chargeSec=0,inc=1){
    super(world,x,y,dir,img,basePower);
    this.chargeSec=clamp(chargeSec,0,2.0);
    this.power=basePower+Math.floor(this.chargeSec/0.1)*inc;
    const sizeMul=1+0.55*(this.chargeSec/2);
    this.w=Math.round(48*sizeMul);this.h=Math.round(36*sizeMul);
    this.vx=(210+70*(this.chargeSec/2))*dir;
    this.life=3.6;
  }
}
class UltBlast extends Projectile{
  constructor(world,x,y,dir,img,chargeSec){
    super(world,x,y,dir,img,300);
    const cs=clamp(chargeSec,0,3.0);
    const sizeMul=lerp(0.35,1.6,clamp(cs/3.0,0,1));
    this.w=Math.round(60*sizeMul);this.h=Math.round(60*sizeMul);
    this.vx=(230+120
(続き)
*this.vx=(230+120*sizeMul)*dir;
    this.life=1.7+0.55*sizeMul;
  }
}
class GroundSpike extends Projectile{
  constructor(world,x,dir,img){
    super(world,x,Math.floor(GROUND_TOP_Y)-8,dir,img,80);
    this.vx=0;this.h=10;this.w=42;this.life=1.0;this.riseT=0;this.maxH=90;
  }
  aabb(){return {x:this.x,y:this.y-this.h/2,w:this.w*0.9,h:this.h};}
  update(dt){
    this.riseT+=dt;this.h=Math.min(this.maxH,10+this.riseT*160);
    this.life-=dt;if(this.life<=0)this.dead=true;
  }
  draw(ctx){
    const img=this.img;if(!img)return;
    const scaleW=this.w/img.width,scaleH=this.h/img.height;
    ctx.save();ctx.translate(this.x-this.world.camX,Math.floor(GROUND_TOP_Y)-this.world.camY);
    ctx.scale(1,-1);
    ctx.imageSmoothingEnabled=false;
    ctx.drawImage(img,Math.round(-img.width*scaleW/2),0,Math.round(img.width*scaleW),Math.round(img.height*scaleH));
    ctx.restore();
  }
}

/* =======================================================
 * プレイヤー
 * ======================================================= */
class Player extends CharacterBase{
  constructor(assets,world,effects){
    super(56,64);
    this.assets=assets;this.world=world;this.effects=effects;
    this.x=100;this.y=Math.floor(GROUND_TOP_Y)-this.h/2+FOOT_PAD;
    this.hp=1000;this.maxhp=1000;this.lives=3;
    this.maxJumps=2;this.jumpsLeft=this.maxJumps;
    this.comboStep=0;this.comboGraceT=0;this.comboGraceMax=0.24;
    this.bufferA1=false;this.a2LockoutT=0;
    this.skillCDT=0;this.skill2CDT=0;this.ultCDT=0;
    this.saT=0;this.isUltCharging=false;
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
  _getFramePath(key,i=0){const v=this.frames[key];return Array.isArray(v)?v[Math.max(0,Math.min(v.length-1,i))]:v;}
  _imgByKey(key,i=0){return this.world.assets.img(this._getFramePath(key,i));}
  _createOverheadGauge(){
    const root=document.createElement('div');root.className='overhead';
    const g=document.createElement('div');g.className='gauge';const i=document.createElement('i');g.appendChild(i);
    const label=document.createElement('span');label.style.fontSize='10px';label.style.color='#b8c7e3';
    root.appendChild(g);root.appendChild(label);
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
  currentHitbox(){
    if(!(this.state==='atk'||this.state==='skill'||this.state==='skill2'||this.state==='ult')||!this._actionSeq)return null;
    const cur=this._actionSeq[this._actionIndex];if(!cur)return null;
    if(this.state==='skill'||this.state==='skill2'||this.state==='ult'){
      const W=86,H=64,x=this.x+this.face*(this.w*0.2);
      return{x,y:this.y,w:W,h:H,power:cur.power||0,dir:this.face,lift:cur.lift||0,kbMul:cur.kbMul||1.6,kbuMul:cur.kbuMul||1.3,tag:cur.tag};
    }
    if(cur.kind==='hit'||cur.kind==='sp'){
      const w=52,h=42,x=this.x+this.face*(this.w*0.3+w*0.5),y=this.y-6;
      return{x,y,w,h,power:cur.power||0,dir:this.face,lift:cur.lift||1,kbMul:cur.kbMul||1,kbuMul:cur.kbuMul||1,tag:cur.tag};
    }
    return null;
  }
  update(dt,input,world,enemies){
    input.beginFrame();this._posOverhead();
    if(this.saT>0)this.saT=Math.max(0,this.saT-dt);
    if(this.state!=='atk'&&this.state!=='skill'&&this.state!=='skill2'&&this.state!=='ult'&&this._actionSeq)this._actionSeq=null;
    if(this.a2LockoutT>0)this.a2LockoutT=Math.max(0,this.a2LockoutT-dt);
    const skBtn=document.getElementById('btnSK'),sk2Btn=document.getElementById('btnSK2'),ultBtn=document.getElementById('btnULT');
    if(this.skillCDT>0){this.skillCDT=Math.max(0,this.skillCDT-dt);skBtn.setAttribute('disabled','');}else skBtn.removeAttribute('disabled');
    if(this.skill2CDT>0){this.skill2CDT=Math.max(0,this.skill2CDT-dt);sk2Btn.setAttribute('disabled','');}else sk2Btn.removeAttribute('disabled');
    if(this.ultCDT>0){this.ultCDT=Math.max(0,this.ultCDT-dt);ultBtn.setAttribute('disabled','');}else ultBtn.removeAttribute('disabled');
    if(this.dead){this.updatePhysics(dt);if(this.fade<=0)this._respawn(world);world.updateTimer(dt);return;}
    if(input.skillCharging&&this.skillCDT<=0){
      input.skillChargeT=Math.min(1.0,input.skillChargeT+dt);
      this._showGauge(true,'● Charge',input.skillChargeT/1.0);
      this.saT=0.08;
    }
    this.isUltCharging=input.ultCharging&&this.ultCDT<=0;
    if(this.isUltCharging){
      input.ultChargeT=Math.min(3,input.ultChargeT+dt);
      this._showGauge(true,'U Charge',input.ultChargeT/3);
      this.saT=0.12;
    }
    if(input.edge.skillRelease&&input.skillChargeT>0&&this.skillCDT<=0){
      this._startSkill1Release(input.skillChargeT);
      input.skillChargeT=0;input.edge.skillRelease=false;
    }
    if(input.edge.ultRelease&&input.ultChargeT>0&&this.ultCDT<=0){
      this._releaseULT(input.ultChargeT);
      input.ultChargeT=0;input.edge.ultRelease=false;
    }
    if(this.state==='atk'||this.state==='skill'||this.state==='skill2'||this.state==='ult'){
      const hb=this.currentHitbox();
      if(hb){
        for(const e of enemies){
          if(!e||e.dead||e.invulnT>0)continue;
          if(rectsOverlap({x:hb.x,y:hb.y,w:hb.w,h:hb.h},e.aabb())){
            const hit=e.hurt(hb.power,hb.dir,{lift:hb.lift,kbMul:hb.kbMul,kbuMul:hb.kbuMul,tag:hb.tag},this.effects);
            if(hit&&rectsOverlap(this.aabb(),e.aabb()))e.x=this.x+hb.dir*(this.w*0.55);
            if(hit&&this.state==='atk'&&this._actionSeq&&this._actionSeq[this._actionIndex]?.tag==='chaseFinisher')
              this.effects.addSpark(e.x,e.y-10,true);
          }
        }
      }
      this._updateAction(dt,world,input);
      world.updateTimer(dt);
      return;
    }
    if(input.edge.a1)this.bufferA1=true;
    if(input.edge.skill2&&this.skill2CDT<=0){input.edge.skill2=false;this.bufferA1=false;this._startSkill2();return;}
    if(input.edge.a2Press&&this.a2LockoutT<=0){input.edge.a2Press=false;this.bufferA1=false;this._startA2();return;}
    if(this.bufferA1&&this.comboStep<3){this.bufferA1=false;this._startA1();return;}
    let ax=0;if(input.left){ax-=MOVE;this.face=-1;}if(input.right){ax+=MOVE;this.face=1;}
    this.vx=ax!==0?(ax>0?MOVE:-MOVE):0;
    if(input.consumeJump()&&this.jumpsLeft>0){this.vy=-JUMP_V;this.onGround=false;this.jumpsLeft--;}
    this.updatePhysics(dt);
    if(this.onGround)this.jumpsLeft=this.maxJumps;
    this.state=!this.onGround?'jump':(Math.abs(this.vx)>1?'run':'idle');
    if(!(input.skillCharging||this.isUltCharging))this._showGauge(false);
    world.updateTimer(dt);
  }
  _startA1(){
    this.state='atk';this.animT=0;this.comboStep=Math.min(this.comboStep+1,3);
    const seq=[{kind:'prep',dur:0.08,frame:'k1prep',fx:80,power:0}];
    let frame='k1a',power=6,fx=140;
    if(this.comboStep===2){frame='k1b';power=9;fx=170;}
    else if(this.comboStep===3){frame='k1c';power=12;fx=200;}
    seq.push({kind:'hit',dur:0.20,frame,fx,power,kbMul:1.0,kbuMul:1.0});
    this._actionSeq=seq;this._actionIndex=0;this._actionTime=0;
  }
  _startSkill1Release(chargeSec){
    this.state='skill';this.animT=0;this.skillCDT=5.0;
    const t=clamp(chargeSec,0,1.0);
    const rounds=2+Math.floor(t/0.33);
    const base=26+Math.floor(t/0.1)*2;
    const kbm=1.6+0.1*(rounds-2);
    const kbum=1.3+0.05*(rounds-2);
    const frames=this.frames.spin;const seq=[];
    for(let r=0;r<rounds;r++){
      for(let i=0;i<frames.length;i++){
        const pow=base*(i===1?1:0.6);const lift=(i===1?1:0);
        seq.push({kind:'sp',dur:0.06,frame:frames[i],fx:80,power:pow,lift,kbMul:kbm,kbuMul:kbum,tag:'skill'});
      }
    }
    this._actionSeq=seq;this._actionIndex=0;this._actionTime=0;
    this._showGauge(false);
  }
  _startSkill2(){
    if(this.skill2CDT>0)return;
    this.state='skill2';this.animT=0;this.skill2CDT=10.0;
    this._skill2SAT=1.6;
    this._actionSeq=[
      {kind:'hit',dur:0.12,frame:'y1',fx:30,power:5,tag:'skill'},
      {kind:'hit',dur:0.12,frame:'y2',fx:30,power:5,tag:'skill'},
      {kind:'hit',dur:0.12,frame:'y3',fx:30,power:5,tag:'skill'},
      {kind:'hit',dur:0.12,frame:'y4',fx:0,power:10,tag:'skill'},
      {kind:'emit',dur:1.00,frame:'y4',fx:0,power:0}
    ];
    this._actionIndex=0;this._actionTime=0;
    const kem=this.world.assets.img('kem.png');
    if(kem){
      const off=68;
      const L=new GroundSpike(this.world,this.x-off,-1,kem);
      const R=new GroundSpike(this.world,this.x+off,1,kem);
      (this.world._skillBullets||(this.world._skillBullets=[])).push(L,R);
      this._activeSpikes=[L,R];
      this.effects.shake(0.12,6);
    }
  }
  _releaseULT(chargeSec){
    if(this.ultCDT>0)return;
    this.state='ult';this.animT=0;
    this._actionSeq=[
      {kind:'pose',dur:0.10,frame:'ul2',fx:40},
      {kind:'post',dur:0.22,frame:'ul2',fx:20}
    ];
    this._actionIndex=0;this._actionTime=0;
    this.ultCDT=3.0;
    const img=this.world.assets.img(this.frames.ul3);
    const ox=this.face*30,oy=-12;
    const blast=new UltBlast(this.world,this.x+ox,this.y+oy,this.face,img,chargeSec);
    (this.world._skillBullets||(this.world._skillBullets=[])).push(blast);
    this.saT=0;
    this._showGauge(false);
    this.effects.addSpark(this.x+ox,this.y-14,true);
  }
  _updateAction(dt){this.vx=0;this.updatePhysics(dt);}
  _respawn(world){
    this.dead=false;this.fade=1;this.spinAngle=0;this.spinSpeed=0;
    this.state='idle';this.comboStep=0;this.comboGraceT=0;this.bufferA1=false;
    this.invulnT=0.6;this.hp=this.maxhp;
    document.getElementById('hpfill').style.width='100%';
    document.getElementById('hpnum').textContent=this.hp;
    this.x=world.camX+80;this.y=Math.floor(GROUND_TOP_Y)-this.h/2+FOOT_PAD;
    this.vx=0;this.vy=0;this.jumpsLeft=this.maxJumps;
  }
}

/* =======================================================
 * World / Stage / Game
 * ======================================================= */
class World{
  constructor(assets,canvas,effects){
    this.assets=assets;this.effects=effects;this.canvas=canvas;
    this.ctx=canvas.getContext('2d',{alpha:true});
    this.ctx.imageSmoothingEnabled=false;
    this.gameW=canvas.width;this.gameH=canvas.height;
    this.camX=0;this.camY=0;this.time=0;this._timerAcc=0;
    const r=canvas.getBoundingClientRect();
    this.screenScaleX=r.width/this.gameW;this.screenScaleY=r.height/this.gameH;
    this.bgImg=null;this.bgScale=1;this.bgDW=0;this.bgDH=0;this.bgSpeed=0.75;
    this.obstacles=[];this.zoom=1.0;
  }
  setBackground(src){
    this.bgImg=this.assets.has(src)?this.assets.img(src):(this.assets.has('MOBA.png')?this.assets.img('MOBA.png'):null);
    if(this.bgImg){this.bgScale=this.gameH/this.bgImg.height;
      this.bgDW=this.bgImg.width*this.bgScale;this.bgDH=this.bgImg.height*this.bgScale;}
  }
  draw(player,enemies){
    const ctx=this.ctx;ctx.save();
    ctx.translate(this.gameW/2,this.gameH/2);
    ctx.scale(this.zoom,this.zoom);
    ctx.translate(-this.gameW/2,-this.gameH/2);
    ctx.clearRect(0,0,this.gameW,this.gameH);
    if(this.bgImg){
      const w=Math.round(this.bgDW),h=Math.round(this.bgDH);
      ctx.drawImage(this.bgImg,-this.camX*this.bgSpeed,0,w,h);
    }
    // 地面線
    ctx.fillStyle='#0b0f17';const yTop=Math.floor(GROUND_TOP_Y);
    ctx.fillRect(0,yTop-1,this.gameW,1);
    player.draw(ctx,this);
    this.effects.draw(ctx,this);
    ctx.restore();
  }
}

/* =======================================================
 * 起動
 * ======================================================= */
class Game{
  constructor(){
    this.assets=new Assets();
    this.canvas=document.getElementById('game');
    this.input=new Input();
    this.effects=new Effects();
    this.player=null;this.enemies=[];this.world=null;this.lastT=0;
    this.state='title';
    document.getElementById('startBtn').addEventListener('click',()=>this.beginStage1());
  }
  async start(){
    const imgs=['MOBA.png','ST1.png','CS.png','contena.png',
      'M1-1.png','M1-2.png','M1-3.png','M1-4.png',
      'K1-1.png','K1-2.png','K1-3.png','K1-4.png','K1-5.png',
      'h1.png','h2.png
(続き)
,'h3.png','h4.png',
      'J.png','Y1.png','Y2.png','Y3.png','Y4.png',
      'UL1.PNG','UL2.PNG','UL3.png','kem.png'
    ];
    await this.assets.load(imgs);
    this.world=new World(this.assets,this.canvas,this.effects);
    this.world.setBackground('ST1.png');
    this.player=new Player(this.assets,this.world,this.effects);
    this.world._skillBullets=[];
    this.loop();
  }
  beginStage1(){
    document.getElementById('titleOverlay').classList.add('hidden');
    this.state='play';
    this.enemies=[];
    GROUND_TOP_Y=437;
    this.world.setBackground('ST1.png');
    this.player.x=100;this.player.y=Math.floor(GROUND_TOP_Y)-this.player.h/2+FOOT_PAD;
  }
  loop(){
    requestAnimationFrame(()=>this.loop());
    const nowT=now();
    if(!this.lastT)this.lastT=nowT;
    let dt=(nowT-this.lastT)/1000;
    if(dt>0.05)dt=0.05;
    this.lastT=nowT;
    if(this.state==='title'){
      this.world.draw(this.player,this.enemies);
      return;
    }
    if(this.effects.hitstop>0){
      this.effects.update(dt);
      this.world.draw(this.player,this.enemies);
      return;
    }
    this.player.update(dt,this.input,this.world,this.enemies);
    this.effects.update(dt);
    this.world.camX=clamp(this.player.x-this.world.gameW/2,STAGE_LEFT,STAGE_RIGHT-this.world.gameW);
    this.world.camY=0;
    this.world.draw(this.player,this.enemies);
  }
}

window.addEventListener('load',()=>{
  const game=new Game();
  game.start();
});

})();
/* =======================================================
 * script.js – Rev33 FULL Part④ (Enemy AI + Stage System)
 * ======================================================= */

(function(){

/* =======================================================
 * 基底：EnemyBase
 * ======================================================= */
class EnemyBase extends CharacterBase {
  constructor(world,effects,assets,x,y,hp=200,img=''){
    super(56,64);
    this.world=world;this.effects=effects;this.assets=assets;
    this.x=x;this.y=y;this.hp=hp;this.maxhp=hp;
    this.face=-1;this.dead=false;this.state='idle';
    this.animT=0;this.attackT=0;this.coolT=0;this.vx=0;this.vy=0;
    this._img=img;this.target=null;this._fireT=0;
  }
  draw(ctx,world){
    if(this.dead&&this.fade<=0)return;
    const img=this.assets.img(this._img);if(!img)return;
    const scale=this.h/img.height;
    const w=img.width*scale,h=this.h;
    ctx.save();ctx.translate(this.x-world.camX,this.y-world.camY);
    ctx.globalAlpha=this.fade;
    if(this.face<0)ctx.scale(-1,1);
    ctx.imageSmoothingEnabled=false;
    ctx.drawImage(img,Math.round(-w/2),Math.round(-h/2),Math.round(w),Math.round(h));
    ctx.restore();
    this.drawHPBar(ctx,world);
  }
  update(dt,player){
    if(this.dead){this.updatePhysics(dt);return;}
    if(!this.target)this.target=player;
    const dx=this.target.x-this.x;
    this.face=(dx>=0)?1:-1;
    this._ai(dt);
    this.updatePhysics(dt);
  }
  _ai(dt){}
}

/* =======================================================
 * ワルMOB – 近接突進型
 * ======================================================= */
class WaruMOB extends EnemyBase{
  constructor(world,effects,assets,x){
    super(world,effects,assets,x,GROUND_TOP_Y-32,160,'warumob.png');
    this.coolT=1.0;this.range=120;
  }
  _ai(dt){
    const t=this.target;if(!t)return;
    const dist=Math.abs(t.x-this.x);
    this.coolT=Math.max(0,this.coolT-dt);
    if(this.coolT<=0&&dist<this.range&&this.onGround){
      this.state='atk';
      this.vx=this.face*280;
      this.coolT=1.4;
      this.effects.addSpark(this.x,this.y-10);
    }else{
      this.vx=this.face*120*(dist>this.range?1:0);
    }
  }
}

/* =======================================================
 * ゴレムロボ – 中距離投石
 * ======================================================= */
class GolemRobo extends EnemyBase{
  constructor(world,effects,assets,x){
    super(world,effects,assets,x,GROUND_TOP_Y-32,320,'golem.png');
    this._fireT=1.8;this.coolT=2.2;
  }
  _ai(dt){
    const t=this.target;if(!t)return;
    this._fireT-=dt;if(this._fireT<=0){
      this._fireT=2.6;
      const img=this.assets.img('stone.png');
      const p=new Projectile(this.world,this.x,this.y-20,this.face,img,35);
      p.vx=220*this.face;p.vy=-200;
      this.world._skillBullets.push(p);
      this.effects.addSpark(this.x,this.y-10);
    }
    const dx=t.x-this.x;
    this.face=(dx>=0)?1:-1;
    this.vx=clamp(dx*0.6,-80,80);
  }
}

/* =======================================================
 * アイスロボ – 遠距離ビーム
 * ======================================================= */
class IceRobo extends EnemyBase{
  constructor(world,effects,assets,x){
    super(world,effects,assets,x,GROUND_TOP_Y-32,260,'icerobo.png');
    this._fireT=1.2;
  }
  _ai(dt){
    const t=this.target;if(!t)return;
    const dx=t.x-this.x;this.face=(dx>=0)?1:-1;
    this._fireT-=dt;
    if(this._fireT<=0){
      this._fireT=1.6;
      const img=this.assets.img('icebeam.png');
      const p=new Projectile(this.world,this.x+this.face*28,this.y-8,this.face,img,25);
      p.vx=420*this.face;
      this.world._skillBullets.push(p);
      this.effects.addSpark(this.x,this.y-10);
    }
    this.vx=0;
  }
}

/* =======================================================
 * アイスミニロボ – 突進型
 * ======================================================= */
class IceMini extends EnemyBase{
  constructor(world,effects,assets,x){
    super(world,effects,assets,x,GROUND_TOP_Y-24,180,'icemin.png');
    this.coolT=1.0;
  }
  _ai(dt){
    const t=this.target;if(!t)return;
    this.coolT-=dt;
    const dist=Math.abs(t.x-this.x);
    if(this.coolT<=0&&dist<200){
      this.vx=this.face*520;
      this.coolT=1.6;
      this.effects.shake(0.08,4);
    }else{
      this.vx=this.face*100;
    }
  }
}

/* =======================================================
 * ガブキング – 中ボス
 * ======================================================= */
class GabKing extends EnemyBase{
  constructor(world,effects,assets,x){
    super(world,effects,assets,x,GROUND_TOP_Y-50,900,'gabking.png');
    this.coolT=1.4;
  }
  _ai(dt){
    const t=this.target;if(!t)return;
    const dx=t.x-this.x;
    this.face=(dx>=0)?1:-1;
    this.coolT-=dt;
    if(this.coolT<=0&&Math.abs(dx)<240){
      this.coolT=2.2;
      const img=this.assets.img('gabfire.png');
      const p=new Projectile(this.world,this.x+this.face*40,this.y-10,this.face,img,60);
      p.vx=280*this.face;
      this.world._skillBullets.push(p);
      this.effects.addSpark(this.x,this.y-20,true);
    }else{
      this.vx=this.face*60;
    }
  }
}

/* =======================================================
 * 巨神 – 重量級ボス
 * ======================================================= */
class Giant extends EnemyBase{
  constructor(world,effects,assets,x){
    super(world,effects,assets,x,GROUND_TOP_Y-64,1500,'giant.png');
    this.coolT=2.6;
  }
  _ai(dt){
    const t=this.target;if(!t)return;
    const dx=t.x-this.x;this.face=(dx>=0)?1:-1;
    this.coolT-=dt;
    if(this.coolT<=0&&Math.abs(dx)<260){
      this.coolT=3.2;
      this.vx=this.face*420;
      this.effects.shake(0.2,8);
      this.effects.addSpark(this.x,this.y-20,true);
    }else{
      this.vx=this.face*80;
    }
  }
}

/* =======================================================
 * シールド – 防御型
 * ======================================================= */
class Shield extends EnemyBase{
  constructor(world,effects,assets,x){
    super(world,effects,assets,x,GROUND_TOP_Y-32,300,'shield.png');
    this.guardT=0;this.coolT=2.0;
  }
  _ai(dt){
    const t=this.target;if(!t)return;
    this.guardT=Math.max(0,this.guardT-dt);
    const dx=t.x-this.x;this.face=(dx>=0)?1:-1;
    if(this.guardT<=0&&Math.random()<0.01){
      this.guardT=1.8;
      this.effects.addSpark(this.x,this.y-14);
    }
    this.vx=this.face*(this.guardT>0?0:80);
  }
  hurt(amount,dir,opts,effects){
    if(this.guardT>0){
      this.effects.addSpark(this.x,this.y-8);
      this.guardT=0.4;
      return false;
    }
    return super.hurt(amount,dir,opts,effects);
  }
}

/* =======================================================
 * スクリュー – 最終ボス
 * ======================================================= */
class Screw extends EnemyBase{
  constructor(world,effects,assets,x){
    super(world,effects,assets,x,GROUND_TOP_Y-64,2000,'screw.png');
    this.coolT=2.0;
  }
  _ai(dt){
    const t=this.target;if(!t)return;
    const dx=t.x-this.x;this.face=(dx>=0)?1:-1;
    this.coolT-=dt;
    if(this.coolT<=0){
      this.coolT=3.5;
      const img=this.assets.img('screwbeam.png');
      const p=new Projectile(this.world,this.x+this.face*40,this.y-10,this.face,img,100);
      p.vx=380*this.face;
      this.world._skillBullets.push(p);
      this.effects.addSpark(this.x,this.y-20,true);
    }
    this.vx=this.face*80;
  }
}

/* =======================================================
 * ステージ管理（Stage1 / Full）
 * ======================================================= */
class Stage1 {
  constructor(game){
    this.g=game;
    this.section=1;
    this.spawned=0;
    this.goalKills=20;
    this.bossSpawned=false;
    this.timer=0;
  }
  start(){
    GROUND_TOP_Y=437;
    this.g.world.setBackground('ST1.png');
    this.spawnWave(3);
  }
  spawnWave(n){
    const min=100,max=2000;
    for(let i=0;i<n;i++){
      const x=min+Math.random()*(max-min);
      const type=Math.floor(Math.random()*3);
      let e=null;
      if(type===0)e=new WaruMOB(this.g.world,this.g.effects,this.g.assets,x);
      else if(type===1)e=new IceMini(this.g.world,this.g.effects,this.g.assets,x);
      else e=new GolemRobo(this.g.world,this.g.effects,this.g.assets,x);
      this.g.enemies.push(e);
    }
  }
  update(dt){
    this.timer+=dt;
    const alive=this.g.enemies.filter(e=>!e.dead);
    if(!this.bossSpawned && alive.length===0){
      if(this.section===1){
        this.section=2;
        GROUND_TOP_Y=360;
        this.g.world.setBackground('CS.png');
        this.spawnWave(4);
      }else if(this.section===2){
        this.spawnBoss();
      }
    }
  }
  spawnBoss(){
    this.bossSpawned=true;
    const bx=1100+Math.random()*400;
    const boss=new Screw(this.g.world,this.g.effects,this.g.assets,bx);
    this.g.enemies.push(boss);
    this.g.effects.addSpark(bx,GROUND_TOP_Y-50,true);
  }
}

/* =======================================================
 * Gameに登録
 * ======================================================= */
if(typeof window!=='undefined'){
  window.WaruMOB=WaruMOB;
  window.GolemRobo=GolemRobo;
  window.IceRobo=IceRobo;
  window.IceMini=IceMini;
  window.GabKing=GabKing;
  window.Giant=Giant;
  window.Shield=Shield;
  window.Screw=Screw;
  window.Stage1=Stage1;
}

})();
