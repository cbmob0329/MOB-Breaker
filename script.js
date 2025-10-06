//-----------------------------------------------------
// MOB SIDE ACTION – RevST1 FULL PART①
//-----------------------------------------------------
'use strict';

const GROUND_TOP_Y = 437; // ← ST1赤ライン基準
const STAGE_W = 420;
const STAGE_H = 720;
const ctx = field.getContext('2d');
let world = null;
let gameStarted = false;

//-----------------------------------------------------
// 基本クラス
//-----------------------------------------------------
class Entity {
  constructor(x,y,sprite){
    this.x=x;this.y=y;
    this.sprite=sprite;this.vx=0;this.vy=0;
    this.hp=100;this.alive=true;this.dir=1;
    this.onGround=false;
  }
  update(dt){}
  draw(ctx){
    if(!this.sprite)return;
    ctx.save();
    ctx.translate(this.x,this.y);
    ctx.scale(this.dir,1);
    ctx.drawImage(this.sprite,-this.sprite.width/2,-this.sprite.height);
    ctx.restore();
  }
}

//-----------------------------------------------------
// プレイヤー
//-----------------------------------------------------
class Player extends Entity{
  constructor(x,y){
    super(x,y,loadImg('assets/player.png'));
    this.hpMax=200;this.hp=this.hpMax;
    this.ult=0;this.ultMax=1000;
    this.state='idle';
    this.spinCount=0;
    this.spinSpeed=0;
    this.skillCharge=0;
  }
  update(dt){
    this.vy+=0.9;
    this.y+=this.vy;
    if(this.y>GROUND_TOP_Y){this.y=GROUND_TOP_Y;this.vy=0;this.onGround=true;}
    if(this.ult>this.ultMax)this.ult=this.ultMax;
  }
  attack1(){
    spawnHit(this.x+this.dir*40,this.y-40,40,20,50);
  }
  skill1(){
    // スキル①回転数調整
    let chargeRatio=this.skillCharge/1000;
    if(chargeRatio<1){
      this.spinCount=4;this.spinSpeed=10;
    }else{
      this.spinCount=8;this.spinSpeed=20;
    }
    let dmg=100;
    for(let i=0;i<this.spinCount;i++){
      setTimeout(()=>{
        spawnHit(this.x+this.dir*50,this.y-50,60,30,dmg);
      },i*1000/this.spinSpeed);
    }
    this.skillCharge=0;
  }
}

//-----------------------------------------------------
// 敵キャラ共通
//-----------------------------------------------------
class Enemy extends Entity{
  constructor(x,y,sprite){
    super(x,y,sprite);
    this.atk=10;
    this.cool=0;
  }
  update(dt){
    if(!this.alive)return;
    this.vy+=0.8;
    this.y+=this.vy;
    if(this.y>GROUND_TOP_Y){this.y=GROUND_TOP_Y;this.vy=0;}
    this.cool-=dt;
    if(this.cool<=0){
      this.cool=100+Math.random()*100;
      this.attack();
    }
  }
  attack(){
    spawnHit(this.x+this.dir*30,this.y-40,40,20,this.atk);
  }
}

//-----------------------------------------------------
// 敵一覧生成
//-----------------------------------------------------
class WaruMOB extends Enemy{constructor(x,y){super(x,y,loadImg('assets/warumob.png'));this.atk=15;}}
class GolemRobo extends Enemy{constructor(x,y){super(x,y,loadImg('assets/golemrobo.png'));this.atk=25;}}
class IceRobo extends Enemy{constructor(x,y){super(x,y,loadImg('assets/icerobo.png'));this.atk=18;}}
class IceMiniRobo extends Enemy{constructor(x,y){super(x,y,loadImg('assets/iceminirobo.png'));this.atk=12;}}
class MobGabKing extends Enemy{constructor(x,y){super(x,y,loadImg('assets/mobgabking.png'));this.atk=40;}}
class MobGiant extends Enemy{constructor(x,y){super(x,y,loadImg('assets/mobgiant.png'));this.atk=35;}}
class Shield extends Enemy{constructor(x,y){super(x,y,loadImg('assets/shield.png'));this.atk=8;}}
class MobScrew extends Enemy{constructor(x,y){super(x,y,loadImg('assets/mobscrew.png'));this.atk=20;}}

//-----------------------------------------------------
// 世界
//-----------------------------------------------------
class World{
  constructor(){
    this.player=new Player(STAGE_W/2,GROUND_TOP_Y);
    this.enemies=[];
    this.time=0;
    this.spawnIndex=0;
  }
  update(dt){
    this.player.update(dt);
    this.enemies.forEach(e=>e.update(dt));
  }
  draw(ctx){
    ctx.clearRect(0,0,STAGE_W,STAGE_H);
    this.drawBG(ctx);
    this.player.draw(ctx);
    this.enemies.forEach(e=>e.draw(ctx));
  }
  drawBG(ctx){
    const bg=loadImg('assets/ST11 (2).png');
    ctx.drawImage(bg,0,0,STAGE_W,STAGE_H);
    // 地面ライン消し：黒線なし
  }
  spawnAllEnemies(){
    this.enemies=[
      new WaruMOB(60,GROUND_TOP_Y),
      new GolemRobo(120,GROUND_TOP_Y),
      new IceRobo(200,GROUND_TOP_Y),
      new IceMiniRobo(280,GROUND_TOP_Y),
      new MobGabKing(340,GROUND_TOP_Y),
      new MobGiant(400,GROUND_TOP_Y),
      new Shield(160,GROUND_TOP_Y),
      new MobScrew(220,GROUND_TOP_Y),
    ];
  }
}

//-----------------------------------------------------
// 補助関数
//-----------------------------------------------------
function loadImg(src){let i=new Image();i.src=src;return i;}
function spawnHit(x,y,w,h,dmg){
  // 当たり確認だけ
  if(!world)return;
  for(const e of world.enemies){
    if(e.alive && Math.abs(e.x-x)<w && Math.abs(e.y-y)<h){
      e.hp-=dmg;
      if(e.hp<=0)e.alive=false;
    }
  }
}
//-----------------------------------------------------
// MOB SIDE ACTION – RevST1 FULL PART②
//-----------------------------------------------------
'use strict';

(function(){
  const canvas = document.getElementById('field');
  const ctx = canvas.getContext('2d');
  let last = performance.now();
  let raf = 0;

  // HUD refs
  const btnStart = document.getElementById('btnStart');
  const hpFill   = document.getElementById('hpFill');
  const ultFill  = document.getElementById('ultFill');

  const btnA1  = document.getElementById('btnA1');
  const btnA2  = document.getElementById('btnA2');
  const btnSK1 = document.getElementById('btnSK1');
  const btnSK2 = document.getElementById('btnSK2');
  const btnULT = document.getElementById('btnULT');

  // ---------------------------------------------------
  // Controls
  // ---------------------------------------------------
  const keys = new Set();
  let holdingSkill1 = false;

  addEventListener('keydown', e=>{
    if(!gameStarted) return;
    keys.add(e.key);
    if(e.key==='j' || e.key==='J'){ world.player.attack1(); }
    if(e.key==='k' || e.key==='K'){ doAttack2(); }
    if(e.key==='l' || e.key==='L'){ startSkill1(); }
    if(e.key==='u' || e.key==='U'){ doULT(); }
  });
  addEventListener('keyup', e=>{
    if(!gameStarted) return;
    keys.delete(e.key);
    if(e.key==='l' || e.key==='L'){ releaseSkill1(); }
  });

  function bindPress(el, onDown, onUp){
    el.addEventListener('pointerdown', e=>{ e.preventDefault(); onDown?.(); el.setPointerCapture?.(e.pointerId); });
    el.addEventListener('pointerup',   e=>{ e.preventDefault(); onUp?.(); el.releasePointerCapture?.(e.pointerId); });
    el.addEventListener('pointercancel', ()=> onUp?.());
    el.addEventListener('touchstart', e=>{ e.preventDefault(); onDown?.(); }, {passive:false});
    el.addEventListener('touchend',   e=>{ e.preventDefault(); onUp?.();   }, {passive:false});
  }

  bindPress(btnA1, ()=>world?.player.attack1());
  bindPress(btnA2, ()=>doAttack2());
  bindPress(btnSK1, ()=>startSkill1(), ()=>releaseSkill1());
  bindPress(btnSK2, ()=>doSkill2());
  bindPress(btnULT, ()=>doULT());

  function startSkill1(){
    if(!world) return;
    holdingSkill1 = true;
  }
  function releaseSkill1(){
    if(!world) return;
    if(!holdingSkill1) return;
    holdingSkill1 = false;
    world.player.skill1();
  }

  // ---------------------------------------------------
  // Actions
  // ---------------------------------------------------
  function doAttack2(){
    if(!world) return;
    // シンプルに前方へ強めの打撃
    spawnHit(world.player.x + world.player.dir*60, world.player.y-50, 70, 30, 150);
  }
  function doSkill2(){
    if(!world) return;
    // 足元に小爆発×3
    for(let i=0;i<3;i++){
      setTimeout(()=>{
        spawnHit(world.player.x + world.player.dir*(30+i*10), world.player.y-20, 60, 26, 120);
      }, i*90);
    }
  }
  function doULT(){
    if(!world) return;
    // 広範囲の強攻撃
    spawnHit(world.player.x + world.player.dir*80, world.player.y-60, 120, 60, 350);
    world.player.ult = Math.max(0, world.player.ult-400);
  }

  // ---------------------------------------------------
  // Start
  // ---------------------------------------------------
  btnStart.addEventListener('click', ()=>{
    if(gameStarted) return;
    world = new World();
    world.spawnAllEnemies();
    gameStarted = true;
    btnStart.style.display='none';
    last = performance.now();
    tick();
  });

  // ---------------------------------------------------
  // Loop
  // ---------------------------------------------------
  function tick(){
    raf = requestAnimationFrame(tick);
    const now = performance.now();
    let dt = (now - last) / 16.6667; // ~frames
    if(dt>3) dt=3;
    last = now;

    // Input (左右移動・ジャンプ)
    if(world){
      const p = world.player;
      let ax = 0;
      if(keys.has('ArrowLeft') || keys.has('a') || keys.has('A')){ ax -= 2; p.dir = -1; }
      if(keys.has('ArrowRight')|| keys.has('d') || keys.has('D')){ ax += 2; p.dir =  1; }
      p.vx = ax*2;
      p.x += p.vx;

      if((keys.has(' ') || keys.has('w') || keys.has('W') || keys.has('ArrowUp')) && p.onGround){
        p.vy = -14; p.onGround=false;
      }
      // 画面端制限
      if(p.x<20) p.x=20;
      if(p.x>STAGE_W-20) p.x=STAGE_W-20;

      // Skill1 溜め
      if(holdingSkill1) p.skillCharge = Math.min(1000, p.skillCharge + 18);

      world.update(dt);
      draw();
      updateHUD();
    }
  }

  // ---------------------------------------------------
  // Render & HUD
  // ---------------------------------------------------
  function draw(){
    ctx.save();
    // 背景内で黒い地面ラインは描かず、画像だけ描画
    world.draw(ctx);
    ctx.restore();
  }

  function updateHUD(){
    const p = world.player;
    hpFill.style.width = Math.max(0, Math.min(1, p.hp/p.hpMax))*100 + '%';
    ultFill.style.width = Math.max(0, Math.min(1, p.ult/p.ultMax))*100 + '%';
  }

  // ---------------------------------------------------
  // Cleanup
  // ---------------------------------------------------
  addEventListener('visibilitychange', ()=>{
    if(document.hidden){ cancelAnimationFrame(raf); }
    else if(gameStarted){ last=performance.now(); tick(); }
  });
})();
