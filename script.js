// script_part2.js – Rev34 FULL (No Ground Line / No Container / Skill1 8Spin)
(function(){
'use strict';

/* ================================
 * 基本設定・ユーティリティ
 * ================================ */
const STAGE_LEFT = 0;
const STAGE_RIGHT = 2200;
let GROUND_TOP_Y = 437;  // 赤帯上端に合わせた地面
const GRAV = 2000, MOVE = 260, JUMP_V = 760, MAX_FALL = 1200;
const FOOT_PAD = 2;
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const now=()=>performance.now();
const rectsOverlap=(a,b)=>Math.abs(a.x-b.x)*2<(a.w+b.w)&&Math.abs(a.y-b.y)*2<(a.h+b.h);

/* ================================
 * エフェクト
 * ================================ */
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

/* ================================
 * アセット管理
 * ================================ */
class Assets{
  constructor(){ this.images=new Map(); }
  load(list){ return Promise.all(list.map(src=>new Promise(res=>{ const i=new Image(); i.onload=()=>{this.images.set(src,i);res();}; i.onerror=()=>res(); i.src=src; }))); }
  img(n){ return this.images.get(n); }
}

/* ================================
 * 入力管理
 * ================================ */
class Input{
  constructor(){
    this.left=0; this.right=0; this.jump=false;
    this.btn={a1:false,a2:false,skill:false,skill2:false,ult:false};
    this.edge={};
    this.skillCharging=false; this.skillChargeT=0;
    this.ultCharging=false; this.ultChargeT=0;
    this._initKeys(); this._initTouch();
  }
  _initKeys(){
    addEventListener('keydown',e=>{
      const k=e.key.toLowerCase();
      if(k==='arrowleft'||k==='a')this.left=1;
      if(k==='arrowright'||k==='d')this.right=1;
      if(k===' '||k==='w'||k==='arrowup')this.jump=true;
      if(k==='j')this.edge.a1=!this.btn.a1; this.btn.a1=true;
      if(k==='k')this.edge.a2=!this.btn.a2; this.btn.a2=true;
      if(k==='l'&&!this.btn.skill){this.btn.skill=true;this.edge.skillPress=true;this.skillCharging=true;this.skillChargeT=0;}
      if(k==='o')this.edge.skill2=true; this.btn.skill2=true;
      if(k==='u'&&!this.btn.ult){this.btn.ult=true;this.edge.ultPress=true;this.ultCharging=true;this.ultChargeT=0;}
    });
    addEventListener('keyup',e=>{
      const k=e.key.toLowerCase();
      if(k==='arrowleft'||k==='a')this.left=0;
      if(k==='arrowright'||k==='d')this.right=0;
      if(k==='j')this.btn.a1=false;
      if(k==='k')this.btn.a2=false;
      if(k==='l'){this.btn.skill=false;this.skillCharging=false;this.edge.skillRelease=true;}
      if(k==='o')this.btn.skill2=false;
      if(k==='u'){this.btn.ult=false;this.ultCharging=false;this.edge.ultRelease=true;}
    });
  }
  _initTouch(){
    const bind=(id,onDown,onUp)=>{
      const el=document.getElementById(id);
      el.addEventListener('pointerdown',e=>{e.preventDefault();onDown();});
      el.addEventListener('pointerup',e=>{e.preventDefault();onUp();});
    };
    bind('btnA1',()=>{this.btn.a1=true;this.edge.a1=true;},()=>this.btn.a1=false);
    bind('btnA2',()=>{this.btn.a2=true;this.edge.a2=true;},()=>this.btn.a2=false);
    bind('btnSK',()=>{this.btn.skill=true;this.edge.skillPress=true;this.skillCharging=true;this.skillChargeT=0;},()=>{this.btn.skill=false;this.skillCharging=false;this.edge.skillRelease=true;});
    bind('btnSK2',()=>{this.edge.skill2=true;this.btn.skill2=true;},()=>this.btn.skill2=false);
    bind('btnULT',()=>{this.btn.ult=true;this.edge.ultPress=true;this.ultCharging=true;this.ultChargeT=0;},()=>{this.btn.ult=false;this.ultCharging=false;this.edge.ultRelease=true;});
    bind('btnJMP',()=>this.jump=true,()=>{});
  }
  consumeJump(){const j=this.jump;this.jump=false;return j;}
}

/* ================================
 * キャラクター基底
 * ================================ */
class CharacterBase{
  constructor(w,h){this.w=w;this.h=h;this.x=0;this.y=0;this.vx=0;this.vy=0;this.face=1;this.hp=100;this.maxhp=100;this.dead=false;this.onGround=false;this.invulnT=0;}
  aabb(){return{x:this.x,y:this.y,w:this.w*0.6,h:this.h*0.8};}
  hurt(amount,dir,opt,fx){
    if(this.invulnT>0||this.dead)return false;
    this.hp=Math.max(0,this.hp-amount);
    const baseKb=140+amount*12;
    this.vx=dir*baseKb*(opt?.kbMul||1);
    this.vy=-baseKb*(opt?.kbuMul||1);
    if(this.hp<=0)this.dead=true;
    if(fx)fx.addSpark(this.x,this.y-10,amount>=30);
    return true;
  }
  updatePhysics(dt){
    this.vy=Math.min(this.vy+GRAV*dt,MAX_FALL);
    this.x+=this.vx*dt;this.y+=this.vy*dt;
    const top=Math.floor(GROUND_TOP_Y);
    if(this.y+this.h/2>=top){this.y=top-this.h/2;this.vy=0;this.onGround=true;}
    else this.onGround=false;
    if(this.invulnT>0)this.invulnT-=dt;
  }
}

/* ================================
 * プレイヤー
 * ================================ */
class Player extends CharacterBase{
  constructor(a,w,fx){super(56,64);this.assets=a;this.world=w;this.effects=fx;this.hp=1000;this.maxhp=1000;this.lives=3;this.skillCDT=0;this.ultCDT=0;}
  update(dt,input){
    if(this.dead){this.updatePhysics(dt);return;}
    // スキル①チャージ
    if(input.skillCharging)this.effects.shake(0.05,1);
    // リリース
    if(input.edge.skillRelease){const c=clamp(input.skillChargeT,0,1);this._skill1(c);input.skillChargeT=0;input.edge.skillRelease=false;}
    if(input.edge.ultRelease){input.ultChargeT=0;input.edge.ultRelease=false;}
    let ax=0;if(input.left)ax-=MOVE;if(input.right)ax+=MOVE;this.vx=ax; 
    if(input.consumeJump()&&this.onGround){this.vy=-JUMP_V;}
    this.updatePhysics(dt);
  }
  _skill1(t){
    const full=t>=1.0; const spinCount=full?8:4;
    const powBase=full?28:20; const list=[];
    for(let i=0;i<spinCount;i++){list.push({dur:0.08,pow:powBase,tag:'skill'});}
    this._seq=list;this._idx=0;this._t=0;this.state='skill';
    this.effects.addSpark(this.x,this.y-10,true);
  }
  draw(ctx){
    ctx.save();ctx.translate(this.x-this.world.camX,this.y-this.world.camY);
    ctx.fillStyle='#7df';ctx.fillRect(-10,-32,20,64);
    ctx.restore();
  }
}

/* ================================
 * 敵キャラ定義（全員）
 * ================================ */
class WaruMOB extends CharacterBase{constructor(w,fx,a,x=520){super(52,60);this.world=w;this.effects=fx;this.assets=a;this.x=x;this.hp=100;this.maxhp=100;}update(dt,p){this.updatePhysics(dt);}}
class GolemRobo extends CharacterBase{constructor(w,fx,a,x=720){super(60,68);this.world=w;this.effects=fx;this.assets=a;this.x=x;this.hp=800;this.maxhp=800;}update(dt,p){this.updatePhysics(dt);}}
class IceRobo extends CharacterBase{constructor(w,fx,a,x=880){super(64,70);this.world=w;this.effects=fx;this.assets=a;this.x=x;this.hp=1200;this.maxhp=1200;}update(dt,p){this.updatePhysics(dt);}}
class IceMini extends CharacterBase{constructor(w,fx,a,x=960){super(40,48);this.world=w;this.effects=fx;this.assets=a;this.x=x;this.hp=300;this.maxhp=300;}update(dt,p){this.updatePhysics(dt);}}
class GabKing extends CharacterBase{constructor(w,fx,a,x=1120){super(70,80);this.world=w;this.effects=fx;this.assets=a;this.x=x;this.hp=2000;this.maxhp=2000;}update(dt,p){this.updatePhysics(dt);}}
class GiantMOB extends CharacterBase{constructor(w,fx,a,x=1280){super(90,100);this.world=w;this.effects=fx;this.assets=a;this.x=x;this.hp=2500;this.maxhp=2500;}update(dt,p){this.updatePhysics(dt);}}
class Shield extends CharacterBase{constructor(w,fx,a,x=1400){super(60,64);this.world=w;this.effects=fx;this.assets=a;this.x=x;this.hp=600;this.maxhp=600;}update(dt,p){this.updatePhysics(dt);}}
class Screw extends CharacterBase{constructor(w,fx,a,x=1560){super(62,68);this.world=w;this.effects=fx;this.assets=a;this.x=x;this.hp=2000;this.maxhp=2000;}update(dt,p){this.updatePhysics(dt);}}

/* ================================
 * ワールド
 * ================================ */
class World{
  constructor(a,cv,fx){this.assets=a;this.canvas=cv;this.ctx=cv.getContext('2d');this.effects=fx;this.camX=0;this.camY=0;}
  draw(p,es){
    const ctx=this.ctx;ctx.clearRect(0,0,this.canvas.width,this.canvas.height);
    if(this.assets.img('ST1.png'))ctx.drawImage(this.assets.img('ST1.png'),-this.camX,0,this.canvas.width,this.canvas.height);
    for(const e of es)e.draw?.(ctx,this);
    p.draw(ctx);
    this.effects.draw(ctx,this);
  }
}

/* ================================
 * ステージ管理
 * ================================ */
class Stage1{
  constructor(g){this.g=g;}
  start(){
    GROUND_TOP_Y=437;
    this.g.world.setBackground?.('ST1.png');
    this.g.player.y=Math.floor(GROUND_TOP_Y)-this.g.player.h/2+FOOT_PAD;
    this.g.enemies=[
      new WaruMOB(this.g.world,this.g.effects,this.g.assets,600),
      new GolemRobo(this.g.world,this.g.effects,this.g.assets,900),
      new IceRobo(this.g.world,this.g.effects,this.g.assets,1200),
      new IceMini(this.g.world,this.g.effects,this.g.assets,1350),
      new GabKing(this.g.world,this.g.effects,this.g.assets,1600),
      new GiantMOB(this.g.world,this.g.effects,this.g.assets,1800),
      new Shield(this.g.world,this.g.effects,this.g.assets,1900),
      new Screw(this.g.world,this.g.effects,this.g.assets,2000)
    ];
  }
  update(dt){}
}

/* ================================
 * ゲーム管理
 * ================================ */
class Game{
  constructor(){
    this.assets=new Assets();
    this.canvas=document.getElementById('game');
    this.effects=new Effects();
    this.input=new Input();
    this.enemies=[];
  }
  async start(){
    const list=['ST1.png'];
    await this.assets.load(list);
    this.world=new World(this.assets,this.canvas,this.effects);
    this.player=new Player(this.assets,this.world,this.effects);
    this.stage=new Stage1(this);
    this.stage.start();
    this.lastT=now();
    requestAnimationFrame(()=>this.loop());
  }
  loop(){
    const t=now();let dt=(t-this.lastT)/1000;this.lastT=t;if(dt>0.05)dt=0.05;
    this.player.update(dt,this.input);
    for(const e of this.enemies)e.update(dt,this.player);
    this.effects.update(dt);
    this.world.draw(this.player,this.enemies);
    requestAnimationFrame(()=>this.loop());
  }
}
new Game().start();
})();
