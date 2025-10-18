// game.js — World / Game / Boot（新プレイヤー資産＋新ボタン連携）
(function(){
'use strict';

const {
  Effects, Assets, Input, CharacterBase,
  Projectile, EnergyBall, UltBlast, GroundSpike,
  constants:{ STAGE_LEFT, STAGE_RIGHT, WALL_PAD, GRAV, MOVE, JUMP_V, MAX_FALL, GROUND_TOP_Y, FOOT_PAD },
  utils:{ clamp, lerp, now, rectsOverlap }
} = window.__GamePieces__;

const {
  // Player は actors-player.js で定義
  WaruMOB, Kozou, MOBGiant, GabuKing, Screw, IceRobo
} = window.__Actors__;

/* ================================
 * World
 * ================================ */
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

const updateHPUI=(hp,maxhp)=>{ const fill=document.getElementById('hpfill'); document.getElementById('hpnum').textContent=hp; fill.style.width=Math.max(0,Math.min(100,(hp/maxhp)*100))+'%'; };

/* ================================
 * Game
 * ================================ */
class Game{
  constructor(){
    this.assets=new Assets(); this.canvas=document.getElementById('game'); this.input=new Input(); this.effects=new Effects();
    this.player=null; this.enemies=[]; this.world=null; this.lastT=0;
    this.enemyOrder=[]; this.enemyIndex=0;
    addEventListener('resize',()=>this.world?.resize());
  }
  async start(){
    const imgs=[
      // 背景
      'MOBA.png','back1.png',
      // Player基礎
      'M1-1.png','M1-2.png','M1-3.png','M1-4.png',
      'K1-1.png','K1-2.png','K1-3.png','K1-4.png','K1-5.png',
      'h1.png','h2.png','h3.png','h4.png',
      'J.png',
      'Y1.png','Y2.png','Y3.png','Y4.png',
      'UL1.PNG','UL2.PNG','UL3.png',
      'kem.png',

      // === 新プレイヤー用 追加画像 ===
      'tms1.png','tmsA.png','tms2.png','tms3.png','tms4.png','tms5.png','tms6.png',
      'dr1.png','dr2.png','dr3.png','dr4.png','dr5.png','dr6.png','dr7.png','dr8.png',
      'air1.png','air2.png','air3.png','airA.png','air4.png','air5.png',
      'PK1.png','PK2.png','PK3.png','PK4.png','PK5.png','PK6.png','PK7.png','PK8.png',

      // 既存敵/弱
      'teki1.png','teki2.png','teki3.png','teki7.png',
      'SL.png','SL2.png','SL3.png','SL4.png','SL5.png','SL6.png','SL7.png','SL8.png',

      // ボス群
      'I1.png','I2.png','I3.png','I4.png','I5.png','I6.png','I7.png','I8.png',
      'P1.png','P2.png','P3.png','P4.png','P5.png','P6.png','P7.png','P10.png',
      't1.png','t2.png','t3.png','t4.png','t5.png','t6.png','t7.png','t8.png','t9.png','t10.png','t11.png',
      'B1.png','B2.png','B3.png','B4.png','B5.png','B6.png','B7.png','B8.png','B9.png','B10.png','B11.png','B12.png','B13.png','B14.png'
    ];
    await this.assets.load(imgs);
    this.world=new World(this.assets,this.canvas,this.effects);

    // Player は actors-player.js の最新版
    this.player=new window.__Actors__.Player(this.assets,this.world,this.effects);

    // ==== 新ボタン（A / P / U2）ブリッジ ====
    // script-core.js を変更せず edge.* を発火させる
    const bindEdge=(id, edgeKey)=>{
      const el=document.getElementById(id);
      if(!el) return;
      const down=()=>{ this.input.edge[edgeKey]=true; this.input.btn[edgeKey]=true; };
      const up  =()=>{ this.input.btn[edgeKey]=false; };
      el.addEventListener('pointerdown',e=>{e.preventDefault();down();el.setPointerCapture?.(e.pointerId);});
      el.addEventListener('pointerup',  e=>{e.preventDefault();up();el.releasePointerCapture?.(e.pointerId);});
      el.addEventListener('pointercancel',()=>{up();});
      el.addEventListener('touchstart',e=>{e.preventDefault();down();},{passive:false});
      el.addEventListener('touchend',  e=>{e.preventDefault();up();},{passive:false});
    };
    // edge.air / edge.p / edge.ult2 を追加的に使う
    if(!this.input.edge.air) this.input.edge.air=false;
    if(!this.input.edge.p)   this.input.edge.p=false;
    if(!this.input.edge.ult2)this.input.edge.ult2=false;
    if(!this.input.btn.air)  this.input.btn.air=false;
    if(!this.input.btn.p)    this.input.btn.p=false;
    if(!this.input.btn.ult2) this.input.btn.ult2=false;
    bindEdge('btnAIR','air');
    bindEdge('btnP','p');
    bindEdge('btnULT2','ult2');

    // ==== 出現順（弱い→強いを各1体ずつ） ====
    const spawnX = 680;
    this.enemyOrder = [
      ()=>[ new Kozou(this.world,this.effects,this.assets,spawnX) ],
      ()=>[ new WaruMOB(this.world,this.effects,this.assets,spawnX+40) ],
      ()=>[ new GabuKing(this.world,this.effects,this.assets,spawnX+160) ],
      ()=>[ new Screw(this.world,this.effects,this.assets,spawnX+240) ],
      ()=>[ new IceRobo(this.world,this.effects,this.assets,spawnX+320) ],
      ()=>[ new MOBGiant(this.world,this.effects,this.assets,spawnX+420) ],
    ];

    this.enemyIndex = 0;
    this.enemies = this.enemyOrder[this.enemyIndex]();

    updateHPUI(this.player.hp,this.player.maxhp);
    this.lastT=now();

    const loop=()=>{
      const t=now(); let dt=(t-this.lastT)/1000; if(dt>0.05) dt=0.05; this.lastT=t;

      if(this.effects.hitstop>0){ this.effects.update(dt); this.world.updateCam(this.player); this.world.draw(this.player,this.enemies); requestAnimationFrame(loop); return; }

      const input=this.input;
      window._inputUltT = input.ultChargeT || 0;

      this.player.update(dt,this.input,this.world,this.enemies);

      // 敵更新 & 当たり
      for(const e of this.enemies){
        e.update(dt,this.player);

        // WaruMOB の弾
        if(e.constructor && e.constructor.name==='WaruMOB'){
          for(const p of e.projectiles){
            if(!p.dead && this.player.invulnT<=0 && rectsOverlap(p.aabb(), this.player.aabb())){
              p.dead=true; const hit=this.player.hurt(p.power, p.dir, {lift:0, kbMul:0.55, kbuMul:0.5}, this.effects);
              if(hit) updateHPUI(this.player.hp,this.player.maxhp);
            }
          }
        }

        // Kozou の石
        if(e.constructor && e.constructor.name==='Kozou'){
          for(const p of e.projectiles){
            if(!p.dead && this.player.invulnT<=0 && rectsOverlap(p.aabb(), this.player.aabb())){
              p.dead=true; const hit=this.player.hurt(p.power, p.dir, {lift:0.15, kbMul:0.7, kbuMul:0.7}, this.effects);
              if(hit) updateHPUI(this.player.hp,this.player.maxhp);
            }
          }
        }

        // GabuKing の弾（保険）
        if(e.constructor && e.constructor.name==='GabuKing'){
          for(const b of e.bullets){
            if(!b.dead && this.player.invulnT<=0 && rectsOverlap(b.aabb(), this.player.aabb())){
              b.dead=true; const hit=this.player.hurt(b.power, b.dir, {lift:1.3, kbMul:1.2, kbuMul:1.2}, this.effects);
              if(hit) updateHPUI(this.player.hp,this.player.maxhp);
            }
          }
        }

        // IceRobo のダッシュ & 玉
        if(e.constructor && e.constructor.name==='IceRobo'){
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

        // 巨神のダッシュ & 玉
        if(e.constructor && e.constructor.name==='MOBGiant'){
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
              const hit=e.hurt(p.power, dir, {lift:0.3,kbMul:0.9,kbuMul:0.9}, this.effects);
              if(hit) this.effects.addSpark(e.x, e.y-10, p.power>=40);
            }
          }
        }
        this.world._skillBullets = this.world._skillBullets.filter(p=>!p.dead && p.life>0);
      }

      // 撃破整理
      this.enemies=this.enemies.filter(e=>!(e.dead && e.fade<=0));

      // 次ウェーブ（1体ずつ）
      if(this.enemies.length===0 && this.enemyIndex < this.enemyOrder.length-1){
        this.enemyIndex++;
        this.enemies.push(...this.enemyOrder[this.enemyIndex]());
      }

      // めり込み解消
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

      this.effects.update(dt); this.world.updateCam(this.player); this.world.updateTimer(dt); this.world.draw(this.player, this.enemies);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}

/* ================================
 * Boot
 * ================================ */
new Game().start();

})();
