// game.js — World / Game / Boot (FULL, Melee AI engage-band patch + IceRobo draw hotfix)
(function(){
'use strict';

const {
  Effects, Assets, Input, CharacterBase,
  Projectile, EnergyBall, UltBlast, GroundSpike,
  constants:{ STAGE_LEFT, STAGE_RIGHT, WALL_PAD, GRAV, MOVE, JUMP_V, MAX_FALL, GROUND_TOP_Y, FOOT_PAD },
  utils:{ clamp, lerp, now, rectsOverlap }
} = window.__GamePieces__;

const {
  Player,
  WaruMOB, IceRobo, Kozou, MOBGiant,
  GabuKing, Screw, Gardi, GardiElite, Nebyu, MOBVR
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

    this._skillBullets=[];
  }
  resize(){ const r=this.canvas.getBoundingClientRect(); this.screenScaleX=r.width/this.gameW; this.screenScaleY=r.height/this.gameH; }
  updateCam(p){
    const offs=this.effects.getCamOffset();
    const target=clamp(p.x - this.gameW*0.35 + offs.x, 0, Math.max(0, STAGE_RIGHT - this.gameW));
    this.camX=lerp(this.camX,target,0.12);
    this.camY=offs.y;
  }
  updateTimer(dt){
    this._timerAcc+=dt;
    if(this._timerAcc>=0.2){
      this.time+=this._timerAcc; this._timerAcc=0;
      const t=Math.floor(this.time);
      const mm=String(Math.floor(t/60)).padStart(2,'0');
      const ss=String(t%60).padStart(2,'0');
      const el=document.getElementById('time'); if(el) el.textContent=`${mm}:${ss}`;
    }
  }
  draw(player, enemies){
    const ctx=this.ctx;
    ctx.clearRect(0,0,this.gameW,this.gameH);
    if(this.bgImg){
      const w=Math.round(this.bgDW), h=Math.round(this.bgDH);
      const step=Math.max(1, w - 1);
      const startX = Math.floor((this.camX*this.bgSpeed - this.gameW*0.2)/step)*step;
      const endX = this.camX*this.bgSpeed + this.gameW*1.2 + w;
      for(let x=startX; x<=endX; x+=step){
        ctx.drawImage(this.bgImg, 0,0,this.bgImg.width,this.bgImg.height, Math.round(x - this.camX*this.bgSpeed), 0, w, h);
      }
    } else {
      const g=ctx.createLinearGradient(0,0,0,this.gameH);
      g.addColorStop(0,'#0a1230'); g.addColorStop(1,'#0a0f18');
      ctx.fillStyle=g; ctx.fillRect(0,0,this.gameW,this.gameH);
    }
    ctx.fillStyle='#0b0f17'; const yTop=Math.floor(GROUND_TOP_Y); ctx.fillRect(0,yTop-1,this.gameW,1);

    if(this._skillBullets){ for(const p of this._skillBullets) p.draw(ctx); }
    for(const e of enemies) e.draw(ctx,this);
    player.draw(ctx,this);
    this.effects.draw(ctx,this);
  }
}

const updateHPUI=(hp,maxhp)=>{
  const fill=document.getElementById('hpfill');
  const num =document.getElementById('hpnum');
  if(!fill||!num) return;
  num.textContent=hp;
  fill.style.width=Math.max(0,Math.min(100,(hp/maxhp)*100))+'%';
};

/* ================================
 * IceRobo draw() hotfix（描画で状態を進めない）
 * ================================ */
(function patchIceRoboDraw(){
  if(!IceRobo) return;
  IceRobo.prototype.draw = function(ctx,world){
    ctx.save(); ctx.translate(this.x-world.camX, this.y-world.camY);
    if(this.dead){ ctx.globalAlpha=this.fade; ctx.rotate(this.spinAngle); }
    if(this.face<0 && !this.dead) ctx.scale(-1,1);
    const pick=(k)=>this.assets.img(({ idle:'I1.png', walk1:'I1.png', walk2:'I2.png', jump1:'I1.png', jump2:'I2.png', jump3:'I3.png', charge:'I4.png', release:'I5.png', dashPrep:'I6.png', dashAtk:'I7.png', orb:'I8.png' })[k]||'I1.png');
    let imgEl=null, ox=0;
    if(this.state==='charge'){ imgEl=pick('charge'); ox=Math.sin(performance.now()/25)*1.5; }
    else if(this.state==='dash' || (this.state==='atk' && this._seq && this._seq[this._idx] && this._seq[this._idx].key==='dashAtk')){ imgEl=pick('dashAtk'); }
    else if(this.state==='atk' && this._seq){ const cur=this._seq[this._idx]; imgEl=pick(cur?.key||'dashPrep'); ox=Math.sin(performance.now()/25)*2; }
    else if(this.state==='recover'){ imgEl=pick('release'); }
    else if(this.state==='run'){ const f=Math.floor(this.animT*6)%2; imgEl=pick(f? 'walk1':'walk2'); }
    else if(this.state==='jump'){ const f=Math.floor(this.animT*8)%3; imgEl=pick(['jump1','jump2','jump3'][f]); }
    else { imgEl=pick('idle'); }
    if(imgEl){
      const scale=this.h/imgEl.height, w=imgEl.width*scale, h=this.h;
      ctx.imageSmoothingEnabled=false; ctx.drawImage(imgEl, Math.round(-w/2+ox), Math.round(-h/2), Math.round(w), Math.round(h));
    }
    if(this.state==='charge'){
      const orb=pick('orb'); const t=this.chargeT;
      const mul = 0.6 + 0.8*(t/2); const hh=32*mul, ww=44*mul; const oxh = this.face*26, oyh=-14;
      if(orb){ ctx.save(); ctx.translate(oxh, oyh); if(this.face<0) ctx.scale(-1,1); ctx.globalAlpha=0.9; ctx.drawImage(orb, Math.round(-ww/2), Math.round(-hh/2), Math.round(ww), Math.round(hh)); ctx.restore(); }
    }
    ctx.restore();
    this.drawHPBar(ctx,world);
    for(const p of this.energyOrbs) p.draw(ctx);
  };
})();

/* ================================
 * Melee Engage-Band Patch
 * 「0 or 100」ではなく“間合い帯”で寄る/離れる/維持
 * 適用先：Gardi / GardiElite / Screw / GabuKing / MOBVR / MOBGiant
 * ================================ */
(function patchMeleeAI(){
  // 共通ヘルパ：間合いバンドに基づくVX・小行動生成
  function steerToEngage(self, player, cfg, dt){
    const dx = player.x - self.x;
    const adx = Math.abs(dx);
    const dir = dx>=0? 1 : -1;
    self.face = dir;

    // 近距離で“揺さぶり”を入れて単調にならないように
    self._aiT = (self._aiT||0) + dt;

    // 状態の既存制御が優先（攻撃/スキル/ult/ダッシュ中は触らない）
    if(['atk','skill','ult','dash','charge','recover','post','hurt'].includes(self.state)) return;

    // 超遠距離 → 走って接近
    if(adx > cfg.engageFar){
      self.vx = dir * cfg.run;
      return;
    }
    // 少し遠い → じわじわ接近
    if(adx > cfg.engageNear){
      // ときどき小ジャンプを混ぜる
      self.vx = dir * cfg.walk;
      if(self.onGround && Math.random() < cfg.smallHopRate){ self.vy = -JUMP_V * cfg.smallHopV; }
      return;
    }
    // 近距離帯（ここでインファイト維持）
    // ときどき微後退→再接近、軽い横揺さぶり
    if(adx <= cfg.engageNear){
      // ほんの少し引いて間合いを作る（後退）
      if(!self._backstepT && Math.random()<cfg.backstepRate){
        self._backstepT = cfg.backstepDur; // 後退時間
      }
      if(self._backstepT){
        self._backstepT = Math.max(0, self._backstepT - dt);
        self.vx = -dir * cfg.backstepSpd;
        // ミニジャンプ混ぜて“下がる”感じ
        if(self.onGround && Math.random()<0.15){ self.vy = -JUMP_V * 0.35; }
      } else {
        // じり寄り（ゼロにしない）
        self.vx = dir * cfg.stickSpd;
        // 左右ブレ
        if(Math.sin(self._aiT*cfg.lateralOsc) > 0.7) self.vx *= 1.15;
      }
    }
  }

  // キャラごとの味付け（スピードや帯）
  const PRESETS = {
    slow:   { walk:90,  run:220, stickSpd:65, engageNear:110, engageFar:260, smallHopRate:0.12, smallHopV:0.35, backstepRate:0.18, backstepDur:0.22, backstepSpd:180, lateralOsc:2.4 },
    mid:    { walk:120, run:300, stickSpd:85, engageNear:120, engageFar:300, smallHopRate:0.16, smallHopV:0.42, backstepRate:0.20, backstepDur:0.24, backstepSpd:210, lateralOsc:2.8 },
    fast:   { walk:150, run:360, stickSpd:110,engageNear:130, engageFar:340, smallHopRate:0.18, smallHopV:0.48, backstepRate:0.22, backstepDur:0.26, backstepSpd:240, lateralOsc:3.2 }
  };

  // パッチ共通ロジック
  function wrapUpdate(Ctor, picker){
    if(!Ctor || !Ctor.prototype || !Ctor.prototype.update) return;
    const orig = Ctor.prototype.update;
    Ctor.prototype.update = function(dt, player){
      // 既存updateの前に“消失保険”
      if(this.x < STAGE_LEFT - 200)  this.x = STAGE_LEFT + 40;
      if(this.x > STAGE_RIGHT + 200) this.x = STAGE_RIGHT - 40;

      // まず元のupdate実行（攻撃選択や弾の処理を壊さない）
      orig.call(this, dt, player);

      // 元updateで攻撃中/特殊中ならスキップ
      if(['atk','skill','ult','dash','charge','recover','post','hurt'].includes(this.state)) return;

      // ここでステアのみ上書き（vx/vyの“寄り”を補正）
      const cfg = picker(this);
      steerToEngage(this, player, cfg, dt);

      // 通常状態のstate再設定（描画切替のため）
      if(this.onGround) this.state = (Math.abs(this.vx)>1? 'run':'idle');
      else this.state = 'jump';
    };
  }

  // 各キャラにプリセットを割当
  wrapUpdate(Gardi,       ()=>PRESETS.slow);
  wrapUpdate(GardiElite,  ()=>PRESETS.slow);
  wrapUpdate(Screw,       ()=>PRESETS.fast);
  wrapUpdate(GabuKing,    ()=>PRESETS.mid);
  wrapUpdate(MOBGiant,    ()=>PRESETS.mid);
  wrapUpdate(MOBVR,       (self)=>{
    // 変身後は少し早め
    const evolved = (self._evolved===true || self.state==='evolved');
    return evolved ? PRESETS.fast : PRESETS.mid;
  });

})();

/* ================================
 * Game
 * ================================ */
class Game{
  constructor(){
    this.assets=new Assets();
    this.canvas=document.getElementById('game');
    this.input=new Input();
    this.effects=new Effects();
    this.player=null; this.enemies=[]; this.world=null; this.lastT=0;
    this.enemyOrder=[]; this.enemyIndex=0;
    addEventListener('resize',()=>this.world?.resize());
  }

  async start(){
    const imgs=[
      // 背景
      'MOBA.png','back1.png',

      // Player
      'M1-1.png','M1-2.png','M1-3.png','M1-4.png',
      'K1-1.png','K1-2.png','K1-3.png','K1-4.png','K1-5.png',
      'h1.png','h2.png','h3.png','h4.png','J.png',
      'Y1.png','Y2.png','Y3.png','Y4.png',
      'UL1.PNG','UL2.PNG','UL3.png','kem.png',

      // 既存弱〜中
      'teki1.png','teki2.png','teki3.png','teki7.png',
      'SL.png','SL2.png','SL3.png','SL4.png','SL5.png','SL6.png','SL7.png','SL8.png',

      // ボス群
      'I1.png','I2.png','I3.png','I4.png','I5.png','I6.png','I7.png','I8.png',
      'P1.png','P2.png','P3.png','P4.png','P5.png','P6.png','P7.png','P10.png',
      't1.png','t2.png','t3.png','t4.png','t5.png','t6.png','t7.png','t8.png','t9.png','t10.png','t11.png',
      'B1.png','B2.png','B3.png','B4.png','B5.png','B6.png','B7.png','B8.png','B9.png','B10.png','B11.png','B12.png','B13.png','B14.png',

      // 追加：Gardi / GardiElite
      'th1.png','th2.png','th3.png','th4.png','th5.png','th6.png','th7.png','th8.png','th9.png',
      'thb1.png','thb2.png','thb3.png','thb4.png','thb5.png','thb6.png','thb7.png','thb8.png','thb9.png',

      // 追加：Nebyu
      'MN.png','MN1.png','MN2.png','MN3.png','MN4.png','MN5.png','MN.6','MN7.png','MN8.png','MN9.png','MN10.png','MN11.png','GD.png',

      // 追加：VR
      'VR.png','VR1.png','VR2.png','VR3.png','VR4.png','VR5.png','VR6.png','VR7.png',
      'VR8.png','VR.9','VR.10','VR.11','VR12.png','VR13.png','VR14.png','VR15.png','VR16.png'
    ];
    await this.assets.load(imgs);

    this.world=new World(this.assets,this.canvas,this.effects);
    this.player=new Player(this.assets,this.world,this.effects);

    const spawnX = 760;

    // 弱→強、1体ずつ
    this.enemyOrder = [
      ()=>[ new WaruMOB(this.world,this.effects,this.assets,spawnX) ],
      ()=>[ new Kozou(this.world,this.effects,this.assets,spawnX) ],
      ()=>[ new Gardi(this.world,this.effects,this.assets,spawnX) ],
      ()=>[ new GardiElite(this.world,this.effects,this.assets,spawnX) ],
      ()=>[ new Screw(this.world,this.effects,this.assets,spawnX) ],
      ()=>[ new GabuKing(this.world,this.effects,this.assets,spawnX) ],
      ()=>[ new Nebyu(this.world,this.effects,this.assets,spawnX) ],
      ()=>[ new IceRobo(this.world,this.effects,this.assets,spawnX) ],
      ()=>[ new MOBVR(this.world,this.effects,this.assets,spawnX) ],
      ()=>[ new MOBGiant(this.world,this.effects,this.assets,spawnX) ]
    ];

    this.enemyIndex = 0;
    this.enemies = this.enemyOrder[this.enemyIndex]();

    const updateHP = ()=>updateHPUI(this.player.hp,this.player.maxhp);
    updateHP();
    this.lastT=now();

    const loop=()=>{
      const t=now(); let dt=(t-this.lastT)/1000; if(dt>0.05) dt=0.05; this.lastT=t;

      if(this.effects.hitstop>0){
        this.effects.update(dt);
        this.world.updateCam(this.player);
        this.world.draw(this.player,this.enemies);
        requestAnimationFrame(loop);
        return;
      }

      const input=this.input;
      window._inputUltT = input.ultChargeT || 0;

      // プレイヤーの画面外保険
      if(this.player.x < STAGE_LEFT - 200)  this.player.x = STAGE_LEFT + 40;
      if(this.player.x > STAGE_RIGHT + 200) this.player.x = STAGE_RIGHT - 40;

      this.player.update(dt,this.input,this.world,this.enemies);

      // 敵更新＆当たり
      for(const e of this.enemies){
        if(!e) continue;

        // 消失保険
        if(e.x < STAGE_LEFT - 200)  e.x = STAGE_LEFT + 40;
        if(e.x > STAGE_RIGHT + 200) e.x = STAGE_RIGHT - 40;

        e.update(dt,this.player);

        // WaruMOB: 弾
        if(e.constructor && e.constructor.name==='WaruMOB' && e.projectiles){
          for(const p of e.projectiles){
            if(!p.dead && this.player.invulnT<=0 && rectsOverlap(p.aabb(), this.player.aabb())){
              p.dead=true;
              const hit=this.player.hurt(p.power, p.dir, {lift:0, kbMul:0.55, kbuMul:0.5}, this.effects);
              if(hit) updateHP();
            }
          }
        }

        // Kozou: 石
        if(e.constructor && e.constructor.name==='Kozou' && e.projectiles){
          for(const p of e.projectiles){
            if(!p.dead && this.player.invulnT<=0 && rectsOverlap(p.aabb(), this.player.aabb())){
              p.dead=true;
              const hit=this.player.hurt(p.power, p.dir, {lift:0.15, kbMul:0.7, kbuMul:0.7}, this.effects);
              if(hit) updateHP();
            }
          }
        }

        // IceRobo: ダッシュ & 玉
        if(e.constructor && e.constructor.name==='IceRobo'){
          if(e.state==='dash'){
            const hb = {x:e.x + e.face*22, y:e.y, w:e.w*0.9, h:e.h*0.9};
            if(this.player.invulnT<=0 && rectsOverlap(hb, this.player.aabb())){
              const hit=this.player.hurt(30, e.face, {lift:1, kbMul:1.1, kbuMul:1.1}, this.effects);
              if(hit) updateHP();
            }
          }
          for(const p of e.energyOrbs||[]){
            if(!p.dead && this.player.invulnT<=0 && rectsOverlap(p.aabb(), this.player.aabb())){
              p.dead=true;
              const hit=this.player.hurt(p.power, p.dir, {lift:0.2, kbMul:0.8, kbuMul:0.8}, this.effects);
              if(hit) updateHP();
            }
          }
        }

        // GabuKing: 弾（保険）
        if(e.constructor && e.constructor.name==='GabuKing' && e.bullets){
          for(const b of e.bullets){
            if(!b.dead && this.player.invulnT<=0 && rectsOverlap(b.aabb(), this.player.aabb())){
              b.dead=true;
              const hit=this.player.hurt(b.power, b.dir, {lift:1.3, kbMul:1.2, kbuMul:1.2}, this.effects);
              if(hit) updateHP();
            }
          }
        }

        // MOBGiant: ダッシュ & 玉
        if(e.constructor && e.constructor.name==='MOBGiant'){
          if(e.state==='dash'){
            const hb = {x:e.x + e.face*30, y:e.y, w: e.w*0.96, h: e.h*0.96};
            if(this.player.invulnT<=0 && rectsOverlap(hb, this.player.aabb())){
              const hit=this.player.hurt(44, e.face, {lift:1, kbMul:1.15, kbuMul:1.15}, this.effects);
              if(hit) updateHP();
            }
          }
          for(const p of e.energyOrbs||[]){
            if(!p.dead && this.player.invulnT<=0 && rectsOverlap(p.aabb(), this.player.aabb())){
              p.dead=true;
              const hit=this.player.hurt(p.power, p.dir, {lift:0.25, kbMul:0.85, kbuMul:0.85}, this.effects);
              if(hit) updateHP();
            }
          }
        }

        // Nebyu: 弾（ヒットでハイジャンプ＋バクステ）
        if(e.constructor && e.constructor.name==='Nebyu' && e.projectiles){
          for(const p of e.projectiles){
            if(!p.dead && this.player.invulnT<=0 && rectsOverlap(p.aabb(), this.player.aabb())){
              p.dead=true;
              const dir = p.dir;
              const hit=this.player.hurt(p.power, dir, {lift:0.9, kbMul:1.15, kbuMul:1.25}, this.effects);
              this.player.vy = -JUMP_V*1.2;
              this.player.vx = -dir * 360;
              if(hit) updateHP();
            }
          }
        }
      }

      // プレイヤー発射物
      if(this.world._skillBullets){
        for(const p of this.world._skillBullets){
          p.update(dt);
          for(const e of this.enemies){
            if(!e || e.dead) continue;
            if(!p.dead && rectsOverlap(p.aabb(), e.aabb())){
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

      this.effects.update(dt);
      this.world.updateCam(this.player);
      this.world.updateTimer(dt);
      this.world.draw(this.player, this.enemies);
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
