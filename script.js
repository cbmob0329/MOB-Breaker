'use strict';
const $ = sel => document.querySelector(sel);
const rand = (a,b)=>a+Math.random()*(b-a);
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));

const GROUND_TOP_Y=314, FOOT_PAD=2; // 赤線に合わせた床位置

class Game {
  constructor() {
    this.cv=$('#cv'); this.ctx=this.cv.getContext('2d');
    this.state='title'; this.last=0; this.keys={};
    this.assets=new Assets();
    this.world=new World(this,this.assets);
    this.player=null; this.effects=new Effects(this.ctx);
    this._init();
  }
  async _init(){
    await this.assets.loadAll();
    this.resize();
    this.startLoop();
    this.panel=$('#panel'); this.startBtn=$('#startBtn');
    this.startBtn.addEventListener('click',()=>{
      if(this.state==='play') return;
      this.panel.style.display='none';
      this.beginStage1();
    });
  }
  resize(){ this.cv.width=420; this.cv.height=720; }
  startLoop(t=0){ this.last=t; requestAnimationFrame(this.loop.bind(this)); }
  loop(t){
    const dt=(t-this.last)/1000; this.last=t;
    this.update(dt); this.draw();
    requestAnimationFrame(this.loop.bind(this));
  }
  update(dt){
    if(this.state!=='play') return;
    this.world.update(dt); this.effects.update(dt);
  }
  draw(){
    this.ctx.clearRect(0,0,this.cv.width,this.cv.height);
    if(this.state==='play'){
      this.world.draw(this.ctx);
      this.effects.draw(this.ctx);
    }
  }
  beginStage1(){
    this.state='play';
    this.world.setBackground('ST1.png',{loopX:true});
    this.world.setObstacles([]);
    this.world.loadStage1();
  }
}

class Assets {
  constructor(){
    this.list=['ST1.png','CS.png','player.png','Waru.png','IceRobo.png','golem.png'];
    this.imgs={};
  }
  async loadAll(){
    for(const n of this.list){
      const i=new Image(); i.src='assets/'+n;
      await new Promise(r=>{i.onload=r;});
      this.imgs[n]=i;
    }
  }
  img(n){return this.imgs[n];}
}

class World {
  constructor(g,assets){
    this.g=g; this.assets=assets;
    this.bgImg=null; this.bgLoopX=true; this.bgScale=1;
    this.gameW=420; this.gameH=720;
    this.obstacles=[];
    this.camX=0;
  }
  setBackground(src,opt={}){
    this.bgImg=this.assets.img(src);
    this.bgLoopX = opt.loopX ?? true;
  }
  setObstacles(a){this.obstacles=a;}
  loadStage1(){
    this.player=new Player(this.g,100,GROUND_TOP_Y);
    this.enemy=new IceRobo(this.g,600,GROUND_TOP_Y);
  }
  update(dt){
    this.player.update(dt);
    this.enemy.update(dt);
    this.camX=this.player.x-150;
  }
  draw(ctx){
    if(this.bgImg){
      const w=this.bgImg.width, h=this.bgImg.height;
      const scale=this.gameH/h;
      const dw=w*scale, dh=h*scale;
      const offX= -this.camX*0.5;
      if(this.bgLoopX){
        for(let x=offX%dw-dw; x<this.gameW; x+=dw)
          ctx.drawImage(this.bgImg,x,0,dw,dh);
      }else{
        ctx.drawImage(this.bgImg,0,0,dw,dh);
      }
    }
    this.player.draw(ctx,this.camX);
    this.enemy.draw(ctx,this.camX);
  }
}

class CharacterBase{
  constructor(g,x,y,img){
    this.g=g; this.x=x; this.y=y; this.vx=0; this.vy=0;
    this.img=g.assets.img(img);
    this.w=64; this.h=64;
  }
  draw(ctx,camX){
    ctx.drawImage(this.img,this.x-camX-32,this.y-this.h,64,64);
  }
}

class Player extends CharacterBase{
  constructor(g,x,y){
    super(g,x,y,'player.png');
    this.hp=200; this.comboStep=0;
  }
  update(dt){
    if(this.y<GROUND_TOP_Y) this.vy+=800*dt;
    this.y+=this.vy*dt;
    if(this.y>GROUND_TOP_Y){ this.y=GROUND_TOP_Y; this.vy=0; }
  }
  draw(ctx,camX){ super.draw(ctx,camX); }
}

class IceRobo extends CharacterBase{
  constructor(g,x,y){
    super(g,x,y,'IceRobo.png');
  }
  update(dt){}
}

class Effects{
  constructor(ctx){this.ctx=ctx;this.list=[];}
  update(dt){}
  draw(ctx){}
}

window.onload=()=>new Game();
