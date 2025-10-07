// game.js — rollback to stable waves (no extra enemies)
(function(){
'use strict';

/* ====== Core refs (from script-core.js) ====== */
const GP = window.__GamePieces__;
if(!GP){ console.error('[game.js] __GamePieces__ not found. Load script-core.js first.'); return; }
const { Effects, Assets, Input, utils:{ now, rectsOverlap }, constants:{ GROUND_TOP_Y } } = GP;

/* ====== Actor refs ====== */
const AX = window.__Actors__ || {};
const Player        = AX.Player;

/* 既存の敵（actors-enemies.js 内） */
const WaruMOB       = AX.WaruMOB;
const IceRobo       = AX.IceRobo;
const IceRoboMini   = AX.IceRoboMini;
const Kozou         = AX.Kozou;
const GabuKing      = AX.GabuKing;
const Screw         = AX.Screw;
const MOBGiant      = AX.MOBGiant;

/* ====== World（script-core.jsのWorldを利用） ====== */
const World = GP.World;

/* ====== UI helpers ====== */
function updateHPUI(hp,maxhp){
  const fill=document.getElementById('hpfill');
  const num =document.getElementById('hpnum');
  if(fill) fill.style.width=Math.max(0,Math.min(100,(hp/maxhp)*100))+'%';
  if(num)  num.textContent=hp;
}

/* ====== Game ====== */
class Game{
  constructor(){
    this.assets=new Assets();
    this.canvas=document.getElementById('game');
    this.input=new Input();
    this.effects=new Effects();
    this.world=null;
    this.player=null;
    this.enemies=[];
    this.enemyOrder=[];
    this.enemyIndex=0;
    this.lastT=0;

    addEventListener('resize', ()=> this.world?.resize?.());
    window.__GameInstance__ = this; // デバッグ用
  }

  async start(){
    /* アセット（復帰ポイント時点の構成） */
    const imgs=[
      // 背景
      'MOBA.png','back1.png',
      // Player
      'M1-1.png','M1-2.png','M1-3.png','M1-4.png',
      'K1-1.png','K1-2.png','K1-3.png','K1-4.png','K1-5.png',
      'h1.png','h2.png','h3.png','h4.png','J.png',
      'Y1.png','Y2.png','Y3.png','Y4.png',
      'UL1.PNG','UL2.PNG','UL3.png',
      'kem.png',
      // 既存・弱
      'teki1.png','teki2.png','teki3.png','teki7.png',
      'IC.png','IC2.png','IC3.png','IC4.png',
      'SL.png','SL2.png','SL3.png','SL4.png','SL5.png','SL6.png','SL7.png','SL8.png',
      // 既存ボス群
      'I1.png','I2.png','I3.png','I4.png','I5.png','I6.png','I7.png','I8.png',
      'P1.png','P2.png','P3.png','P4.png','P5.png','P6.png','P7.png','P10.png',
      't1.png','t2.png','t3.png','t4.png','t5.png','t6.png','t7.png','t8.png','t9.png','t10.png','t11.png',
      'B1.png','B2.png','B3.png','B4.png','B5.png','B6.png','B7.png','B8.png','B9.png','B10.png','B11.png','B12.png','B13.png','B14.png'
    ];
    await this.assets.load(imgs);

    /* World / Player */
    this.world=new World(this.assets,this.canvas,this.effects);
    this.player=new Player(this.assets,this.world,this.effects);
    window.__Actors__.PlayerInstance = this.player;

    updateHPUI(this.player.hp,this.player.maxhp);

    /* ===== 復帰ポイント時のウェーブ順 =====
       1) IceRoboMini ×5
       2) Kozou       ×5
       3) WaruMOB     ×5
       4) 弱5 + GabuKing + Screw
       5) 弱5 + IceRobo
       6) 弱5 + MOBGiant
    */
    const spawnX=680;
    const group=(Ctor,count,baseX,gap)=>()=>{ const arr=[]; for(let i=0;i<count;i++) arr.push(new Ctor(this.world,this.effects,this.assets, baseX+i*gap)); return arr; };

    this.enemyOrder = [
      group(IceRoboMini, 5, spawnX, 48),
      group(Kozou,       5, spawnX, 55),
      group(WaruMOB,     5, spawnX, 60),

      ()=>[
        ...group(IceRoboMini, 5, spawnX, 48)(),
        new GabuKing(this.world,this.effects,this.assets,spawnX+260),
        new Screw(this.world,this.effects,this.assets,spawnX+360)
      ],

      ()=>[
        ...group(Kozou, 5, spawnX, 50)(),
        new IceRobo(this.world,this.effects,this.assets,spawnX+360)
      ],

      ()=>[
        ...group(WaruMOB, 5, spawnX, 60)(),
        new MOBGiant(this.world,this.effects,this.assets,spawnX+420)
      ]
    ];

    this.enemyIndex=0;
    this.enemies = this.enemyOrder[this.enemyIndex]();

    /* ループ */
    this.lastT=now();
    const loop=()=>{
      const t=now(); let dt=(t-this.lastT)/1000; if(dt>0.05) dt=0.05; this.lastT=t;

      // ヒットストップ中は描画のみ
      if(this.effects.hitstop>0){
        this.effects.update(dt);
        this.world.updateCam(this.player);
        this.world.draw(this.player,this.enemies);
        requestAnimationFrame(loop); return;
      }

      window._inputUltT = this.input.ultChargeT || 0;

      /* プレイヤー更新 */
      this.player.update(dt,this.input,this.world,this.enemies);

      /* 敵更新＆接触 */
      for(const e of this.enemies){
        e.update(dt,this.player);

        // WaruMOB：弾
        if(WaruMOB && e instanceof WaruMOB){
          for(const p of (e.projectiles||[])){
            if(!p.dead && this.player.invulnT<=0 && rectsOverlap(p.aabb(), this.player.aabb())){
              p.dead=true;
              const hit=this.player.hurt(p.power, p.dir, {lift:0, kbMul:0.55, kbuMul:0.5}, this.effects);
              if(hit) updateHPUI(this.player.hp,this.player.maxhp);
            }
          }
        }
        // IceRobo：ダッシュ＆玉
        if(IceRobo && e instanceof IceRobo){
          if(e.state==='dash'){
            const hb={x:e.x + e.face*22, y:e.y, w:e.w*0.9, h:e.h*0.9};
            if(this.player.invulnT<=0 && rectsOverlap(hb, this.player.aabb())){
              const hit=this.player.hurt(30, e.face, {lift:1, kbMul:1.1, kbuMul:1.1}, this.effects);
              if(hit) updateHPUI(this.player.hp,this.player.maxhp);
            }
          }
          for(const p of (e.energyOrbs||[])){
            if(!p.dead && this.player.invulnT<=0 && rectsOverlap(p.aabb(), this.player.aabb())){
              p.dead=true;
              const hit=this.player.hurt(p.power, p.dir, {lift:0.2, kbMul:0.8, kbuMul:0.8}, this.effects);
              if(hit) updateHPUI(this.player.hp,this.player.maxhp);
            }
          }
        }
        // Kozou：石
        if(Kozou && e instanceof Kozou){
          for(const p of (e.projectiles||[])){
            if(!p.dead && this.player.invulnT<=0 && rectsOverlap(p.aabb(), this.player.aabb())){
              p.dead=true;
              const hit=this.player.hurt(p.power, p.dir, {lift:0.15, kbMul:0.7, kbuMul:0.7}, this.effects);
              if(hit) updateHPUI(this.player.hp,this.player.maxhp);
            }
          }
        }
        // MOBGiant：ダッシュ＆玉
        if(MOBGiant && e instanceof MOBGiant){
          if(e.state==='dash'){
            const hb={x:e.x + e.face*30, y:e.y, w:e.w*0.96, h:e.h*0.96};
            if(this.player.invulnT<=0 && rectsOverlap(hb, this.player.aabb())){
              const hit=this.player.hurt(44, e.face, {lift:1, kbMul:1.15, kbuMul:1.15}, this.effects);
              if(hit) updateHPUI(this.player.hp,this.player.maxhp);
            }
          }
          for(const p of (e.energyOrbs||[])){
            if(!p.dead && this.player.invulnT<=0 && rectsOverlap(p.aabb(), this.player.aabb())){
              p.dead=true;
              const hit=this.player.hurt(p.power, p.dir, {lift:0.25, kbMul:0.85, kbuMul:0.85}, this.effects);
              if(hit) updateHPUI(this.player.hp,this.player.maxhp);
            }
          }
        }
      }

      /* プレイヤーのスキル弾・スパイク（敵へ） */
      if(this.world._skillBullets){
        for(const p of this.world._skillBullets){
          p.update(dt);
          for(const e of this.enemies){
            if(!p.dead && !e.dead && rectsOverlap(p.aabb(), e.aabb())){
              p.dead=true;
              const dir = (e.x>=p.x)? 1 : -1;
              const hit = e.hurt(p.power, dir, {lift:0.3, kbMul:0.9, kbuMul:0.9}, this.effects);
              if(hit) this.effects.addSpark(e.x, e.y-10, p.power>=40);
            }
          }
        }
        this.world._skillBullets = this.world._skillBullets.filter(p=>!p.dead && p.life>0);
      }

      /* 撃破整理 */
      this.enemies=this.enemies.filter(e=>!(e.dead && e.fade<=0));

      /* 次ウェーブ */
      if(this.enemies.length===0 && this.enemyIndex < this.enemyOrder.length-1){
        this.enemyIndex++;
        this.enemies.push(...this.enemyOrder[this.enemyIndex]());
      }

      /* めり込み解消（簡易） */
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

      this.effects.update(dt);
      this.world.updateCam(this.player);
      this.world.updateTimer(dt);
      this.world.draw(this.player,this.enemies);

      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}

/* ====== Boot ====== */
new Game().start();

})();
