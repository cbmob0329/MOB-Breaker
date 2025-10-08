// actors.js — Enemies & Player placeholder (part 1/2)
(function(){
'use strict';

const {
  Effects, Assets, Input, CharacterBase,
  Projectile, EnergyBall, UltBlast, GroundSpike,
  constants:{ STAGE_LEFT, STAGE_RIGHT, WALL_PAD, GRAV, MOVE, JUMP_V, MAX_FALL, GROUND_TOP_Y, FOOT_PAD },
  utils:{ clamp, lerp, now, rectsOverlap }
} = window.__GamePieces__;

/* =========================================================
 * 小ユーティリティ（AI共通の“距離ベース”土台とバックステップ）
 * ========================================================= */
function distX(a,b){ return Math.abs(a.x - b.x); }
function faceTo(self, target){ self.face = (target.x>=self.x)? 1 : -1; }
function clampToStage(ch){ // 画面外押し出しで“消えた風”に見えるのを防ぐ
  const left  = STAGE_LEFT + WALL_PAD + ch.w*0.4;
  const right = STAGE_RIGHT - WALL_PAD - ch.w*0.4;
  if(ch.x < left){ ch.x = left; if(ch.vx<0) ch.vx = 0; }
  if(ch.x > right){ ch.x = right; if(ch.vx>0) ch.vx = 0; }
  const top=Math.floor(GROUND_TOP_Y);
  if(ch.y + ch.h/2 >= top + FOOT_PAD){ ch.y = top - ch.h/2 + FOOT_PAD; if(ch.vy>0) ch.vy = 0; ch.onGround=true; }
}

function startBackstep(self, speed=300, dur=0.24){
  self.state='back'; self._backT=0; self._backDur=dur;
  self.vx = -self.face * speed;
}
function tickBackstep(self, dt){
  if(self.state!=='back') return false;
  self._backT += dt;
  if(self._backT>=self._backDur){
    self.state='idle'; self.vx=0; return false;
  }
  return true;
}

/* =========================================================
 * Player（プレースホルダ：actors-player.js で上書きされます）
 * ========================================================= */
class Player extends CharacterBase{
  constructor(assets, world, effects){
    super(56,64);
    this.world=world; this.effects=effects; this.assets=assets;
    this.x=100; this.y=Math.floor(GROUND_TOP_Y)-this.h/2+FOOT_PAD;
    this.maxhp=1000; this.hp=1000; this.lives=3;
  }
  imgByKey(){ return this.assets.img('M1-1.png'); }
  draw(ctx,world){
    ctx.save(); ctx.translate(this.x-world.camX, this.y-world.camY);
    const img=this.imgByKey(); if(img){
      const scale=this.h/img.height, w=img.width*scale, h=this.h;
      ctx.imageSmoothingEnabled=false; ctx.drawImage(img, Math.round(-w/2), Math.round(-h/2), Math.round(w), Math.round(h));
    }
    ctx.restore();
  }
}

/* =========================================================
 * IceRoboMini（弱・5体向け）— 消える対策＋クランプ強化
 * ========================================================= */
class IceRoboMini extends CharacterBase{
  constructor(world, effects, assets, x=1200){
    super(40,44);
    this.world=world; this.effects=effects; this.assets=assets;
    this.x=x; this.y=Math.floor(GROUND_TOP_Y)-this.h/2+FOOT_PAD; this.face=-1;
    this.maxhp=60; this.hp=60; this.cool=0; this.state='idle'; this.animT=0; this.hopT=0; this.superArmor=false;
    this.idleT=0;
  }
  img(key){ const map={ idle:'IC.png', move:'IC2.png', atk1:'IC3.png', sp:'IC4.png' }; return this.assets.img(map[key]||'IC.png') || this.assets.img('IC.png'); }
  aabb(){ return {x:this.x, y:this.y, w:this.w*0.65, h:this.h*0.9}; }
  // 弱キャラ：吹っ飛び強化
  hurt(amount, dir, opts={}, effects){
    const boomy = { kbMul: (opts.kbMul||1)*1.9, kbuMul:(opts.kbuMul||1)*1.7, lift:opts.lift };
    return super.hurt(amount, dir, boomy, effects);
  }
  update(dt, player){
    if(this.dead){ this.updatePhysics(dt); return; }
    if(this.cool>0) this.cool=Math.max(0,this.cool-dt);
    this.idleT += dt;

    // sp（連続ホップ・SA）
    if(this.state==='sp'){
      this.superArmor=true; this.hopT+=dt;
      const period=0.24, bounces=5;
      const bi=Math.floor(this.hopT/period);
      const dir = (bi%2===0)? this.face : -this.face;
      this.vx = dir * 240; if(this.onGround) this.vy = -JUMP_V*0.45;
      this.updatePhysics(dt); clampToStage(this);
      if(this.hopT>=period*bounces){ this.state='idle'; this.vx=0; this.superArmor=false; this.hopT=0; this.cool=1.3; this.idleT=0; }
      // 触れたらちょいダメ
      if(rectsOverlap(this.aabb(), player.aabb()) && player.invulnT<=0){
        player.hurt(7, (player.x>=this.x?1:-1), {lift:0.3,kbMul:0.9,kbuMul:0.9}, this.effects);
      }
      this.animT+=dt; return;
    }

    // 通常攻撃（かすり体当たり）
    if(this.state==='atk'){
      this.hopT+=dt; const dur=0.32;
      this.vx = this.face * 140; this.updatePhysics(dt); clampToStage(this);
      if(this.hopT>dur*0.5 && this.hopT<=dur*0.75){
        const hb={x:this.x + this.face*18, y:this.y, w:36, h:28};
        if(player.invulnT<=0 && rectsOverlap(hb, player.aabb())){
          player.hurt(5, this.face, {lift:0.2,kbMul:0.8,kbuMul:0.8}, this.effects);
        }
      }
      if(this.hopT>=dur){ this.state='idle'; this.hopT=0; this.vx=0; this.cool=0.9; this.idleT=0; }
      this.animT+=dt; return;
    }

    // AI：距離ベース
    const dx=player.x-this.x; const adx=Math.abs(dx); faceTo(this, player);
    // 1.2秒以上行動なしなら強制アクション
    if(this.cool<=0 && (this.idleT>=1.2 || (adx<120 && Math.random()<0.45))){
      this.state = (adx<120? 'atk' : 'sp'); this.hopT=0; this.animT=0; this.idleT=0;
    }
    // 低速徘徊＋たまに小ジャンプ
    this.vx = (dx>0? 70 : -70);
    this.hopT+=dt;
    if(this.onGround && this.hopT>0.35){ this.vy=-JUMP_V*0.35; this.hopT=0; }

    this.updatePhysics(dt); clampToStage(this);
    this.state = (this.state==='idle'||this.state==='run') ? (this.onGround? 'run':'jump') : this.state;
    this.animT+=dt;
  }
  draw(ctx,world){
    ctx.save(); ctx.translate(this.x-world.camX, this.y-world.camY); if(this.face<0) ctx.scale(-1,1);
    let img=null; if(this.state==='sp') img=this.img('sp');
    else if(this.state==='atk'){ img=this.hopT<0.16? this.img('idle'): this.img('atk1'); }
    else if(!this.onGround) img=this.img('move'); else img=this.img('move');
    if(!img) img=this.img('idle');
    const scale=this.h/img.height, w=img.width*scale, h=this.h;
    ctx.imageSmoothingEnabled=false; ctx.drawImage(img, Math.round(-w/2), Math.round(-h/2), Math.round(w), Math.round(h));
    ctx.restore(); this.drawHPBar(ctx,world);
  }
}

/* =========================================================
 * Kozou（投擲・ガード持ち＝“モブシールド”修正）
 * ========================================================= */
class KozouStone extends Projectile{
  constructor(world,x,y,dir,img){ super(world,x,y,dir,img,6); this.vx = 140*dir; this.vy = -380; this.w = 22; this.h = 22; this.gravity = 900; }
  update(dt){
    if(this.dead) return; this.vy += this.gravity*dt; this.x += this.vx*dt; this.y += this.vy*dt;
    const ground = Math.floor(GROUND_TOP_Y); if(this.y + this.h/2 >= ground+FOOT_PAD){ this.dead=true; }
  }
}
class Kozou extends CharacterBase{
  constructor(world,effects,assets,x=1400){
    super(50,58);
    this.world=world; this.effects=effects; this.assets=assets;
    this.x=x; this.y=Math.floor(GROUND_TOP_Y)-this.h/2+FOOT_PAD; this.face=-1;
    this.maxhp=90; this.hp=90; this.cool=0; this.state='idle'; this.animT=0; this.projectiles=[];
    this.guard=false; this.guardHits=0; this._thrown=false;
    this.idleT=0; this.forceActT=0;
  }
  img(key){ const map={ idle:'SL.png', w1:'SL2.png', w2:'SL3.png', prep:'SL4.png', throw:'SL5.png', guard:'SL6.png', counter:'SL7.png', stone:'SL8.png'}; return this.assets.img(map[key]||'SL.png') || this.assets.img('SL.png'); }
  aabb(){ return {x:this.x, y:this.y, w:this.w*0.65, h:this.h*0.9}; }
  // 弱キャラ：吹っ飛び強化
  hurt(amount, dir, opts={}, effects){
    const kbm=(opts.kbMul||1)*1.85, kbum=(opts.kbuMul||1)*1.65;
    return super.hurt(amount, dir, {...opts, kbMul:kbm, kbuMul:kbum}, effects);
  }
  update(dt,player){
    if(this.dead){ this.updatePhysics(dt); return; }
    if(this.cool>0) this.cool=Math.max(0,this.cool-dt);
    for(const p of this.projectiles) p.update(dt); this.projectiles=this.projectiles.filter(p=>!p.dead);
    this.idleT += dt; this.forceActT += dt;

    // 反撃
    if(this.state==='counter'){
      this.updatePhysics(dt); this.animT+=dt; const dur=0.28; const mid=0.14;
      if(this.animT<dur){ this.vx=this.face*200; }   // ちょい強化
      if(this.animT>mid){
        const hb={x:this.x + this.face*18, y:this.y, w:36, h:30};
        if(player.invulnT<=0 && rectsOverlap(hb, player.aabb())){
          player.hurt(8, this.face, {lift:0.3,kbMul:0.95,kbuMul:0.95}, this.effects);
        }
      }
      if(this.animT>=dur){ this.state='idle'; this.vx=0; this.cool=0.9; this.guard=false; this.guardHits=0; this.idleT=0; this.forceActT=0; }
      return;
    }
    // 投擲
    if(this.state==='throw'){
      this.updatePhysics(dt); this.animT+=dt;
      if(this.animT>0.18 && !this._thrown){ this._thrown=true; const img=this.img('stone'); const ox=this.face*14, oy=-18;
        this.projectiles.push(new KozouStone(this.world, this.x+ox, this.y+oy, this.face, img)); }
      if(this.animT>0.4){ this.state='idle'; this.vx=0; this.cool=1.2; this._thrown=false; this.idleT=0; this.forceActT=0; }
      return;
    }
    // ガード
    if(this.guard){
      this.vx=0; this.updatePhysics(dt); this.animT+=dt; faceTo(this,player);
      if(distX(this,player)<120){ this.vx=(player.x>this.x? -90: 90); }
      // ★長時間ガードし続ける問題→強制遷移
      if(this.forceActT>=1.4){ this.guard=false; this.state='throw'; this.animT=0; this.vx=0; this.cool=0.8; this.forceActT=0; }
      return;
    }

    // AI：距離ベース＋強制アクション
    const dx=player.x-this.x; const adx=Math.abs(dx); faceTo(this,player);
    if(this.cool<=0){
      if(this.forceActT>=1.2){ // ★攻撃しない問題の最終保険
        if(adx>120){ this.state='throw'; this.animT=0; this.vx=0; }
        else { this.guard=true; this.state='idle'; this.animT=0; this.vx=0; }
        this.idleT=0; this.forceActT=0; return;
      }
      if(adx>120 && Math.random()<0.55){ this.state='throw'; this.animT=0; this.vx=0; this.idleT=0; this.forceActT=0; return; }
      if(Math.random()<0.30){ this.guard=true; this.state='idle'; this.animT=0; this.vx=0; this.idleT=0; this.forceActT=0; return; }
    }

    // 徘徊
    this.vx = (dx>0? 70 : -70);
    this.updatePhysics(dt);
    this.state = this.onGround ? (Math.abs(this.vx)>1?'run':'idle') : 'jump';
    this.animT+=dt;
  }
  hurtGuarded(amount, dir, opts, effects){
    if(this.guard){
      amount = Math.ceil(amount*0.5);
      this.guardHits = Math.min(3, this.guardHits+1);
      if(this.guardHits>=3 && this.state!=='counter'){ this.state='counter'; this.animT=0; this.vx=0; }
    }
    return super.hurt(amount, dir, opts, effects);
  }
  draw(ctx,world){
    ctx.save(); ctx.translate(this.x-world.camX, this.y-world.camY); if(this.face<0) ctx.scale(-1,1);
    let img=null;
    if(this.state==='throw'){ img=this.animT<0.2? this.img('prep'): this.img('throw'); }
    else if(this.state==='counter'){ img=this.img('counter'); }
    else if(this.guard){ img=this.img('guard'); }
    else if(this.state==='run'){ const f=Math.floor(this.animT*6)%2; img=this.img(f?'w1':'w2'); }
    else { img=this.img('idle'); }
    if(!img) img=this.img('idle');
    const scale=this.h/img.height, w=img.width*scale, h=this.h;
    ctx.imageSmoothingEnabled=false; ctx.drawImage(img, Math.round(-w/2), Math.round(-h/2), Math.round(w), Math.round(h));
    ctx.restore(); this.drawHPBar(ctx,world);
    for(const p of this.projectiles) p.draw(ctx);
  }
}

/* =========================================================
 * GureMOB（グレ）
 * ========================================================= */
class GureMOB extends CharacterBase{
  constructor(world,effects,assets,x=1050){
    super(50,58);
    this.world=world; this.effects=effects; this.assets=assets;
    this.x=x; this.y=Math.floor(GROUND_TOP_Y)-this.h/2+FOOT_PAD; this.face=-1;
    this.maxhp=100; this.hp=100; this.cool=0; this.state='idle'; this.animT=0;
    this.idleT=0;
  }
  img(key){ const map={ idle:'tek1.png', w1:'tek1.png', w2:'tek2.png', atk:'tek3.png'}; return this.assets.img(map[key]||'tek1.png') || this.assets.img('tek1.png'); }
  update(dt, player){
    if(this.dead){ this.updatePhysics(dt); return; }
    if(this.cool>0) this.cool=Math.max(0,this.cool-dt);
    this.idleT += dt;

    if(this.state==='atk'){
      this.updatePhysics(dt); this.animT+=dt;
      if(this.animT>0.1 && this.animT<0.22){
        const hb={x:this.x + this.face*18, y:this.y, w:38, h:30};
        if(player.invulnT<=0 && rectsOverlap(hb, player.aabb())){
          player.hurt(10, this.face, {lift:0.1,kbMul:0.8,kbuMul:0.8}, this.effects);
        }
      }
      if(this.animT>=0.34){ this.state='idle'; this.cool=0.9; this.animT=0; this.vx=0; this.idleT=0; }
      return;
    }

    // 距離ベース：近づきすぎたら下がる
    const dx=player.x-this.x; const adx=Math.abs(dx); faceTo(this,player);
    if(this.cool<=0 && (this.idleT>=1.2 || (adx<120 && Math.random()<0.5))){
      this.state='atk'; this.animT=0; this.vx=0; return;
    }
    if(adx<110){ this.vx = (dx>0? -120: 120); }
    else if(adx>200){ this.vx = (dx>0? 110: -110); }
    else this.vx = (dx>0? 40: -40);

    this.updatePhysics(dt);
    this.state = this.onGround ? (Math.abs(this.vx)>1?'run':'idle') : 'jump';
    this.animT+=dt;
  }
  draw(ctx,world){
    ctx.save(); ctx.translate(this.x-world.camX, this.y-world.camY); if(this.face<0) ctx.scale(-1,1);
    let img=null;
    if(this.state==='run'){ const f=Math.floor(this.animT*6)%2; img=this.img(f?'w1':'w2'); }
    else if(this.state==='atk'){ img=this.img('atk'); }
    else img=this.img('idle');
    if(!img) img=this.img('tek1.png');
    const scale=this.h/img.height, w=img.width*scale, h=this.h;
    ctx.imageSmoothingEnabled=false; ctx.drawImage(img, Math.round(-w/2), Math.round(-h/2), Math.round(w), Math.round(h));
    ctx.restore(); this.drawHPBar(ctx,world);
  }
}

/* =========================================================
 * Danball（段ボール）
 * ========================================================= */
class Danball extends CharacterBase{
  constructor(world,effects,assets,x=980){
    super(46,50);
    this.world=world; this.effects=effects; this.assets=assets;
    this.x=x; this.y=Math.floor(GROUND_TOP_Y)-this.h/2+FOOT_PAD; this.face=-1;
    this.maxhp=50; this.hp=50; this.cool=0; this.state='idle'; this.animT=0; this.idleT=0;
  }
  img(key){ const map={ idle:'C1.png', w1:'C2.png', w2:'C3.png', atk:'C4.png'}; return this.assets.img(map[key]||'C1.png') || this.assets.img('C1.png'); }
  // 超軽量：吹っ飛び超強
  hurt(amount, dir, opts={}, effects){
    const kbm=(opts.kbMul||1)*2.2, kbum=(opts.kbuMul||1)*2.0;
    return super.hurt(amount, dir, {...opts, kbMul:kbm, kbuMul:kbum}, effects);
  }
  update(dt, player){
    if(this.dead){ this.updatePhysics(dt); return; }
    if(this.cool>0) this.cool=Math.max(0,this.cool-dt);
    this.idleT += dt;

    if(this.state==='atk'){
      this.updatePhysics(dt); this.animT+=dt;
      if(this.animT>0.12 && this.animT<0.22){
        const hb={x:this.x + this.face*16, y:this.y, w:34, h:28};
        if(player.invulnT<=0 && rectsOverlap(hb, player.aabb())){
          player.hurt(20, this.face, {lift:0.1,kbMul:0.7,kbuMul:0.7}, this.effects);
        }
      }
      if(this.animT>=0.32){ this.state='idle'; this.cool=1.0; this.animT=0; this.vx=0; this.idleT=0; }
      return;
    }

    const dx=player.x-this.x; const adx=Math.abs(dx); faceTo(this,player);
    if(this.cool<=0 && (this.idleT>=1.0 || (adx<120 && Math.random()<0.5))){
      this.state='atk'; this.animT=0; this.vx=0; return;
    }
    // 遅い
    if(adx<110){ this.vx = (dx>0? -90: 90); }
    else if(adx>220){ this.vx = (dx>0? 90: -90); }
    else this.vx = (dx>0? 40: -40);

    this.updatePhysics(dt);
    this.state = this.onGround ? (Math.abs(this.vx)>1?'run':'idle') : 'jump';
    this.animT+=dt;
  }
  draw(ctx,world){
    ctx.save(); ctx.translate(this.x-world.camX, this.y-world.camY); if(this.face<0) ctx.scale(-1,1);
    let img=null;
    if(this.state==='run'){ const f=Math.floor(this.animT*6)%2; img=this.img(f?'w1':'w2'); }
    else if(this.state==='atk'){ img=this.img('atk'); }
    else img=this.img('idle');
    if(!img) img=this.img('C1.png');
    const scale=this.h/img.height, w=img.width*scale, h=this.h;
    ctx.imageSmoothingEnabled=false; ctx.drawImage(img, Math.round(-w/2), Math.round(-h/2), Math.round(w), Math.round(h));
    ctx.restore(); this.drawHPBar(ctx,world);
  }
}

/* =========================================================
 * MOBFighter（KB強化＋バックステップ）
 * ========================================================= */
class MOBFighter extends CharacterBase{
  constructor(world,effects,assets,x=1150){
    super(54,62);
    this.world=world; this.effects=effects; this.assets=assets;
    this.x=x; this.y=Math.floor(GROUND_TOP_Y)-this.h/2+FOOT_PAD; this.face=-1;
    this.maxhp=200; this.hp=200; this.cool=0; this.state='idle'; this.animT=0; this.idleT=0;
    this.superArmor=false; this.saChance=0.10; // ミニマムSA
  }
  img(key){ const map={ idle:'EN1-1.png', w1:'EN1-2.png', w2:'EN1-3.png', dash:'EN1-4.png', atk:'EN1-5.png', skill:'EN1-6.png' }; return this.assets.img(map[key]||'EN1-1.png') || this.assets.img('EN1-1.png'); }
  // 被弾：たまにSA
  hurt(amount, dir, opts={}, effects){
    const sa = (Math.random()<this.saChance);
    const kbm = sa? 0.35 : (opts.kbMul||1);
    const kbum= sa? 0.30 : (opts.kbuMul||1);
    return super.hurt(amount, dir, {...opts, kbMul:kbm, kbuMul:kbum}, effects);
  }
  update(dt, player){
    if(this.dead){ this.updatePhysics(dt); return; }
    if(this.cool>0) this.cool=Math.max(0,this.cool-dt);
    this.idleT += dt;

    // バックステップ進行
    if(tickBackstep(this, dt)){ this.updatePhysics(dt); return; }

    // 突進攻撃
    if(this.state==='atk'){
      this.updatePhysics(dt); this.animT+=dt;
      if(this.animT<0.20){ this.vx = this.face*200; }
      if(this.animT>0.14 && this.animT<0.28){
        const hb={x:this.x + this.face*22, y:this.y, w:44, h:34};
        if(player.invulnT<=0 && rectsOverlap(hb, player.aabb())){
          player.hurt(30, this.face, {lift:0.3,kbMul:1.35,kbuMul:1.10}, this.effects); // ★KB強化
        }
      }
      if(this.animT>=0.36){
        this.state='idle'; this.vx=0; this.cool=0.9; this.animT=0; this.idleT=0;
        if(Math.random()<0.30) startBackstep(this, 300, 0.26); // ★攻撃後バクステ
      }
      return;
    }
    // スキル（溜め→小ジャンプ突進）
    if(this.state==='skill'){
      this.updatePhysics(dt); this.animT+=dt;
      if(this.animT<2.0){ // 震え
        const ox=Math.sin(performance.now()/25)*1.5; this._ox=ox; this.vx=0;
      }else if(this.animT<2.0+0.30){
        if(this.onGround){ this.vy = -JUMP_V*0.6; this.vx = this.face*260; }
        // 当たり
        const hb={x:this.x + this.face*26, y:this.y, w:50, h:36};
        if(player.invulnT<=0 && rectsOverlap(hb, player.aabb())){
          player.hurt(50, this.face, {lift:0.6,kbMul:1.45,kbuMul:1.20}, this.effects); // ★強
        }
      }else{
        this.state='idle'; this.cool=5.0; this._ox=0; this.vx=0; this.animT=0; this.idleT=0;
        if(Math.random()<0.35) startBackstep(this, 320, 0.26);
      }
      return;
    }

    // AI：距離ベース
    const dx=player.x-this.x; const adx=Math.abs(dx); faceTo(this,player);
    if(this.cool<=0 && this.idleT>=1.0){
      if(adx<130 && Math.random()<0.6){ this.state='atk'; this.animT=0; return; }
      if(adx<220 && Math.random()<0.4){ this.state='skill'; this.animT=0; return; }
    }
    // 距離調整
    if(adx<110){ this.vx=(dx>0? -160: 160); if(Math.random()<0.05) startBackstep(this,300,0.22); }
    else if(adx>240){ this.vx=(dx>0? 160: -160); }
    else this.vx=(dx>0? 70: -70);

    this.updatePhysics(dt);
    this.state = !this.onGround ? 'jump' : (Math.abs(this.vx)>1?'run':'idle');
    this.animT+=dt;
  }
  draw(ctx,world){
    ctx.save(); ctx.translate(this.x-world.camX, this.y-world.camY); if(this.face<0) ctx.scale(-1,1);
    let img=null;
    if(this.state==='atk' || this.state==='skill'){ img = (this.state==='atk'? this.img('atk') : (this.animT<2.0? this.img('dash'): this.img('skill'))); }
    else if(this.state==='run'){ const f=Math.floor(this.animT*6)%2; img=this.img(f?'w1':'w2'); }
    else img=this.img('idle');
    if(!img) img=this.img('EN1-1.png');
    const ox=this._ox||0;
    const scale=this.h/img.height, w=img.width*scale, h=this.h;
    ctx.imageSmoothingEnabled=false; ctx.drawImage(img, Math.round(-w/2+ox), Math.round(-h/2), Math.round(w), Math.round(h));
    ctx.restore(); this.drawHPBar(ctx,world);
  }
}

/* =========================================================
 * MOBHyado（KB強化＋バックステップ）
 * ========================================================= */
class MOBHyado extends CharacterBase{
  constructor(world,effects,assets,x=1220){
    super(56,62);
    this.world=world; this.effects=effects; this.assets=assets;
    this.x=x; this.y=Math.floor(GROUND_TOP_Y)-this.h/2+FOOT_PAD; this.face=-1;
    this.maxhp=350; this.hp=350; this.cool=0; this.state='idle'; this.animT=0; this.idleT=0;
    this.saChance=0.10; // ミニマムSA
  }
  img(key){ const map={ idle:'MY.png', w1:'MY1.png', w2:'MY2.png', atk1:'MY3.png', atk2:'MY4.png', s1:'MY5.png', s2:'MY6.png', s3:'MY7.png'}; return this.assets.img(map[key]||'MY.png') || this.assets.img('MY.png'); }
  hurt(amount, dir, opts={}, effects){
    const sa=(Math.random()<this.saChance);
    const kbm = sa? 0.4 : (opts.kbMul||1);
    const kbum= sa? 0.35: (opts.kbuMul||1);
    return super.hurt(amount, dir, {...opts, kbMul:kbm, kbuMul:kbum}, effects);
  }
  update(dt,player){
    if(this.dead){ this.updatePhysics(dt); return; }
    if(this.cool>0) this.cool=Math.max(0,this.cool-dt);
    this.idleT += dt;

    // バックステップ進行
    if(tickBackstep(this, dt)){ this.updatePhysics(dt); return; }

    // 小ジャンプ攻撃
    if(this.state==='atk'){
      this.updatePhysics(dt); this.animT+=dt;
      if(this.animT<0.18){
        if(this.onGround) this.vy = -JUMP_V*0.45;
        this.vx = this.face*140;
      }
      if(this.animT>0.14 && this.animT<0.32){
        const hb={x:this.x + this.face*22, y:this.y, w:44, h:32};
        if(player.invulnT<=0 && rectsOverlap(hb, player.aabb())){
          player.hurt(33, this.face, {lift:0.4,kbMul:1.35,kbuMul:1.10}, this.effects); // ★KB強化
        }
      }
      if(this.animT>=0.40){
        this.state='idle'; this.vx=0; this.cool=1.2; this.animT=0; this.idleT=0;
        if(Math.random()<0.30) startBackstep(this, 300, 0.26);
      }
      return;
    }
    // スキル（震え→連撃）
    if(this.state==='skill'){
      this.updatePhysics(dt); this.animT+=dt;
      if(this.animT<2.0){ const ox=Math.sin(performance.now()/25)*1.6; this._ox=ox; this.vx=0; }
      else if(this.animT<2.0+0.24){
        this.vx = this.face*300;
        const hb={x:this.x + this.face*24, y:this.y, w:52, h:36};
        if(player.invulnT<=0 && rectsOverlap(hb, player.aabb())){
          player.hurt(38, this.face, {lift:0.6,kbMul:1.50,kbuMul:1.20}, this.effects); // ★強め
        }
      }else{
        this.state='idle'; this.cool=5.0; this._ox=0; this.vx=0; this.animT=0; this.idleT=0;
        if(Math.random()<0.35) startBackstep(this, 320, 0.26);
      }
      return;
    }

    // AI：距離ベース
    const dx=player.x-this.x; const adx=Math.abs(dx); faceTo(this,player);
    if(this.cool<=0 && this.idleT>=1.0){
      if(adx<150 && Math.random()<0.55){ this.state='atk'; this.animT=0; return; }
      if(adx<260 && Math.random()<0.40){ this.state='skill'; this.animT=0; return; }
    }
    // 距離取り＆接近
    if(adx<130){ this.vx=(dx>0? -150: 150); if(Math.random()<0.06) startBackstep(this,320,0.22); }
    else if(adx>260){ this.vx=(dx>0? 150: -150); }
    else this.vx=(dx>0? 70: -70);

    this.updatePhysics(dt);
    this.state = !this.onGround ? 'jump' : (Math.abs(this.vx)>1?'run':'idle');
    this.animT+=dt;
  }
  draw(ctx,world){
    ctx.save(); ctx.translate(this.x-world.camX, this.y-world.camY); if(this.face<0) ctx.scale(-1,1);
    let img=null;
    if(this.state==='atk'){ img = (this.animT<0.18? this.img('atk1'): this.img('atk2')); }
    else if(this.state==='skill'){ img = (this.animT<2.0? this.img('s1'): (this.animT<2.2? this.img('s2'): this.img('s3'))); }
    else if(this.state==='run'){ const f=Math.floor(this.animT*6)%2; img=this.img(f?'w1':'w2'); }
    else img=this.img('idle');
    if(!img) img=this.img('MY.png');
    const ox=this._ox||0;
    const scale=this.h/img.height, w=img.width*scale, h=this.h;
    ctx.imageSmoothingEnabled=false; ctx.drawImage(img, Math.round(-w/2+ox), Math.round(-h/2), Math.round(w), Math.round(h));
    ctx.restore(); this.drawHPBar(ctx,world);
  }
}

/* =========================================================
 * ここまで part 1/2
 * ========================================================= */
window.__Actors__ = Object.assign({}, window.__Actors__||{}, {
  Player, // placeholder（actors-player.js が上書き）
  IceRoboMini, Kozou, KozouStone, GureMOB, Danball, MOBFighter, MOBHyado
});

})();
// actors.js — More Enemies (part 2/2)
(function(){
'use strict';

const {
  Effects, Assets, Input, CharacterBase,
  Projectile, EnergyBall, UltBlast, GroundSpike,
  constants:{ STAGE_LEFT, STAGE_RIGHT, WALL_PAD, GRAV, MOVE, JUMP_V, MAX_FALL, GROUND_TOP_Y, FOOT_PAD },
  utils:{ clamp, lerp, now, rectsOverlap }
} = window.__GamePieces__;

/* ===== helpers (part2でも使用) ===== */
function distX(a,b){ return Math.abs(a.x - b.x); }
function faceTo(self, target){ self.face = (target.x>=self.x)? 1 : -1; }
function clampToStage(ch){
  const left  = STAGE_LEFT + WALL_PAD + ch.w*0.4;
  const right = STAGE_RIGHT - WALL_PAD - ch.w*0.4;
  if(ch.x < left){ ch.x = left; if(ch.vx<0) ch.vx = 0; }
  if(ch.x > right){ ch.x = right; if(ch.vx>0) ch.vx = 0; }
  const top=Math.floor(GROUND_TOP_Y);
  if(ch.y + ch.h/2 >= top + FOOT_PAD){ ch.y = top - ch.h/2 + FOOT_PAD; if(ch.vy>0) ch.vy = 0; ch.onGround=true; }
}
function startBackstep(self, speed=320, dur=0.26){ self.state='back'; self._backT=0; self._backDur=dur; self.vx = -self.face * speed; }
function tickBackstep(self, dt){ if(self.state!=='back') return false; self._backT+=dt; if(self._backT>=self._backDur){ self.state='idle'; self.vx=0; return false; } return true; }

/* =========================================================
 * Gardi（ガーディ）— ローカル揺れ＋後退強化
 * ========================================================= */
class Gardi extends CharacterBase{
  constructor(world,effects,assets,x=1300){
    super(56,64);
    this.world=world; this.effects=effects; this.assets=assets;
    this.x=x; this.y=Math.floor(GROUND_TOP_Y)-this.h/2+FOOT_PAD; this.face=-1;
    this.maxhp=400; this.hp=400; this.cool=0; this.state='idle'; this.animT=0; this.idleT=0;
    this.saChance=0.20; this._shakeT=0; this._ox=0;
  }
  img(key){ const m={ idle:'th1.png', w1:'th1.png', w2:'th2.png', a1:'th3.png', a2:'th4.png', s1:'th5.png', s2:'th6.png', s3:'th7.png', s4:'th8.png', s5:'th9.png'}; return this.assets.img(m[key]||'th1.png')||this.assets.img('th1.png'); }
  hurt(a,d,o={},fx){ const sa=(Math.random()<this.saChance); const kbm=sa?0.4:(o.kbMul||1); const kbum=sa?0.35:(o.kbuMul||1); return super.hurt(a,d,{...o,kbMul:kbm,kbuMul:kbum},fx); }
  update(dt,player){
    if(this.dead){ this.updatePhysics(dt); return; }
    if(this.cool>0)this.cool=Math.max(0,this.cool-dt); this.idleT+=dt;
    if(tickBackstep(this,dt)){ this.updatePhysics(dt); return; }

    // 攻撃
    if(this.state==='atk'){
      this.updatePhysics(dt); this.animT+=dt;
      if(this.animT>0.10 && this.animT<0.24){
        const hb={x:this.x+this.face*22,y:this.y,w:46,h:36};
        if(player.invulnT<=0 && rectsOverlap(hb,player.aabb())) player.hurt(30,this.face,{lift:0.4,kbMul:1.15,kbuMul:1.05},this.effects);
      }
      if(this.animT>=0.36){ this.state='idle'; this.cool=1.2; this.animT=0; this.vx=0; this.idleT=0; if(Math.random()<0.35) startBackstep(this,340,0.26); }
      return;
    }
    // スキル（ローカル揺れ2秒→フィニッシュ）
    if(this.state==='skill'){
      this.updatePhysics(dt); this.animT+=dt;
      if(this.animT<0.26){} // 溜め
      else if(this.animT<2.26){ this._shakeT = 2.26-this.animT; } // ★ローカルのみ
      else if(this.animT<2.26+0.24){
        const hb={x:this.x+this.face*26,y:this.y,w:52,h:40};
        if(player.invulnT<=0 && rectsOverlap(hb,player.aabb())) player.hurt(40,this.face,{lift:0.6,kbMul:1.35,kbuMul:1.15},this.effects);
      }else{ this.state='idle'; this.cool=5.0; this.animT=0; this._ox=0; this.idleT=0; if(Math.random()<0.45) startBackstep(this,340,0.28); }
      return;
    }
    // AI
    const dx=player.x-this.x, adx=Math.abs(dx); faceTo(this,player);
    if(this.cool<=0 && this.idleT>=1.0){
      if(adx<140 && Math.random()<0.55){ this.state='atk'; this.animT=0; return; }
      if(adx<260 && Math.random()<0.40){ this.state='skill'; this.animT=0; return; }
    }
    if(adx<120){ this.vx=(dx>0?-150:150); if(Math.random()<0.08) startBackstep(this,340,0.24); }
    else if(adx>260){ this.vx=(dx>0?140:-140); }
    else this.vx=(dx>0?60:-60);
    this.updatePhysics(dt);
    this.state = !this.onGround?'jump':(Math.abs(this.vx)>1?'run':'idle');
    this.animT+=dt;
  }
  draw(ctx,world){
    ctx.save(); ctx.translate(this.x-world.camX,this.y-world.camY); if(this.face<0) ctx.scale(-1,1);
    let img=null;
    if(this.state==='atk'){ img = (this.animT<0.18? this.img('a1'): this.img('a2')); }
    else if(this.state==='skill'){
      if(this.animT<0.26) img=this.img('s1');
      else if(this.animT<2.26) img=this.img('s3');
      else if(this.animT<2.5) img=this.img('s4');
      else img=this.img('s5');
    } else if(this.state==='run'){ const f=Math.floor(this.animT*6)%2; img=this.img(f?'w1':'w2'); } else img=this.img('idle');
    // ローカル揺れ
    const ox=(this._shakeT>0)? Math.sin(performance.now()/16)*2.2 : 0;
    const scale=this.h/img.height, w=img.width*scale, h=this.h;
    ctx.imageSmoothingEnabled=false; ctx.drawImage(img,Math.round(-w/2+ox),Math.round(-h/2),Math.round(w),Math.round(h));
    ctx.restore(); this.drawHPBar(ctx,world);
  }
}

/* =========================================================
 * GardiElite — 数値強化＋バクステ多め
 * ========================================================= */
class GardiElite extends CharacterBase{
  constructor(world,effects,assets,x=1350){
    super(58,66);
    this.world=world; this.effects=effects; this.assets=assets;
    this.x=x; this.y=Math.floor(GROUND_TOP_Y)-this.h/2+FOOT_PAD; this.face=-1;
    this.maxhp=600; this.hp=600; this.cool=0; this.state='idle'; this.animT=0; this.idleT=0;
    this.saChance=0.50; this._shakeT=0;
  }
  img(key){ const m={ idle:'thb1.png', w1:'thb1.png', w2:'thb2.png', a1:'thb3.png', a2:'thb4.png', s1:'thb5.png', s2:'thb6.png', s3:'thb7.png', s4:'thb8.png', s5:'thb9.png'}; return this.assets.img(m[key]||'thb1.png')||this.assets.img('thb1.png'); }
  hurt(a,d,o={},fx){ const sa=(Math.random()<this.saChance); const kbm=sa?0.32:(o.kbMul||1); const kbum=sa?0.28:(o.kbuMul||1); return super.hurt(a,d,{...o,kbMul:kbm,kbuMul:kbum},fx); }
  update(dt,player){
    if(this.dead){ this.updatePhysics(dt); return; }
    if(this.cool>0)this.cool=Math.max(0,this.cool-dt); this.idleT+=dt;
    if(tickBackstep(this,dt)){ this.updatePhysics(dt); return; }

    if(this.state==='atk'){
      this.updatePhysics(dt); this.animT+=dt;
      if(this.animT>0.12 && this.animT<0.26){
        const hb={x:this.x+this.face*24,y:this.y,w:50,h:38};
        if(player.invulnT<=0 && rectsOverlap(hb,player.aabb())) player.hurt(30,this.face,{lift:0.4,kbMul:1.2,kbuMul:1.1},this.effects);
      }
      if(this.animT>=0.36){ this.state='idle'; this.cool=1.0; this.animT=0; this.vx=0; this.idleT=0; if(Math.random()<0.45) startBackstep(this,360,0.28); }
      return;
    }
    if(this.state==='skill'){
      this.updatePhysics(dt); this.animT+=dt;
      if(this.animT<0.26){} else if(this.animT<2.26){ this._shakeT=2.26-this.animT; }
      else if(this.animT<2.26+0.24){
        const hb={x:this.x+this.face*28,y:this.y,w:56,h:42};
        if(player.invulnT<=0 && rectsOverlap(hb,player.aabb())) player.hurt(40,this.face,{lift:0.6,kbMul:1.4,kbuMul:1.2},this.effects);
      } else { this.state='idle'; this.cool=5.0; this.animT=0; this._shakeT=0; this.idleT=0; if(Math.random()<0.55) startBackstep(this,360,0.30); }
      return;
    }
    const dx=player.x-this.x, adx=Math.abs(dx); faceTo(this,player);
    if(this.cool<=0 && this.idleT>=0.9){
      if(adx<150 && Math.random()<0.6){ this.state='atk'; this.animT=0; return; }
      if(adx<280 && Math.random()<0.45){ this.state='skill'; this.animT=0; return; }
    }
    if(adx<130){ this.vx=(dx>0?-170:170); if(Math.random()<0.1) startBackstep(this,360,0.26); }
    else if(adx>280){ this.vx=(dx>0?160:-160); }
    else this.vx=(dx>0?70:-70);
    this.updatePhysics(dt);
    this.state = !this.onGround?'jump':(Math.abs(this.vx)>1?'run':'idle');
    this.animT+=dt;
  }
  draw(ctx,world){
    ctx.save(); ctx.translate(this.x-world.camX,this.y-world.camY); if(this.face<0) ctx.scale(-1,1);
    let img=null;
    if(this.state==='atk'){ img = (this.animT<0.18? this.img('a1'): this.img('a2')); }
    else if(this.state==='skill'){ img = (this.animT<0.26? this.img('s1') : (this.animT<2.26? this.img('s3') : (this.animT<2.5? this.img('s4'): this.img('s5')))); }
    else if(this.state==='run'){ const f=Math.floor(this.animT*6)%2; img=this.img(f?'w1':'w2'); } else img=this.img('idle');
    const ox=(this._shakeT>0)? Math.sin(performance.now()/16)*2.4 : 0;
    const scale=this.h/img.height, w=img.width*scale, h=this.h; ctx.imageSmoothingEnabled=false;
    ctx.drawImage(img,Math.round(-w/2+ox),Math.round(-h/2),Math.round(w),Math.round(h));
    ctx.restore(); this.drawHPBar(ctx,world);
  }
}

/* =========================================================
 * Nebyu（ネビュ）— 弾小型化＋tag付与
 * ========================================================= */
class NebyuBullet extends Projectile{
  constructor(world,x,y,dir,img,power=50,tag='nebyu'){
    super(world,x,y,dir,img,power);
    this.tag=tag;
    this.w = 44; this.h = 32;               // 小さめ
    this.vx = 260*dir;
    this.life = 2.2;
  }
}
class Nebyu extends CharacterBase{
  constructor(world,effects,assets,x=1250){
    super(60,66);
    this.world=world; this.effects=effects; this.assets=assets;
    this.x=x; this.y=Math.floor(GROUND_TOP_Y)-this.h/2+FOOT_PAD; this.face=-1;
    this.maxhp=800; this.hp=800; this.cool=0; this.state='idle'; this.animT=0; this.idleT=0;
    this.projectiles=[];
  }
  img(key){ const m={ idle:'MN.png', w1:'MN1.png', w2:'MN2.png', w3:'MN3.png', prep1:'MN4.png', prep2:'MN5.png', prep3:'MN.6', jump:'MN8.png', shake:'MN7.png', u1:'MN9.png', u2:'MN10.png', u3:'MN11.png', bullet:'GD.png' }; return this.assets.img(m[key])||this.assets.img('MN.png'); }
  update(dt,player){
    if(this.dead){ this.updatePhysics(dt); return; }
    if(this.cool>0)this.cool=Math.max(0,this.cool-dt);
    for(const b of this.projectiles) b.update(dt); this.projectiles=this.projectiles.filter(p=>!p.dead);
    this.idleT+=dt;
    if(tickBackstep(this,dt)){ this.updatePhysics(dt); return; }

    // 攻撃（ライフル発射）
    if(this.state==='atk'){
      this.updatePhysics(dt); this.animT+=dt;
      if(this.animT>0.20 && !this._fired){ this._fired=true;
        const img=this.img('bullet'); const ox=this.face*28, oy=-12;
        this.projectiles.push(new NebyuBullet(this.world,this.x+ox,this.y+oy,this.face,img,50,'nebyu'));
      }
      if(this.animT>=0.42){ this.state='idle'; this.cool=1.4; this.animT=0; this._fired=false; this.idleT=0; if(Math.random()<0.35) startBackstep(this,360,0.28); }
      return;
    }
    // スキル（ジャンプ→震え→左右乱射）
    if(this.state==='skill'){
      this.updatePhysics(dt); this.animT+=dt;
      if(this.animT<0.12){ if(this.onGround) this.vy=-JUMP_V*0.7; }
      else if(this.animT<0.12+0.70){
        this._ox=Math.sin(performance.now()/16)*2.0;
        // 乱射（左右）
        if(!this._sprayDone){
          const img=this.img('bullet'); const oy=-16;
          for(let i=0;i<10;i++){
            this.projectiles.push(new NebyuBullet(this.world,this.x-6,this.y+oy,-1,img,5,'nebyu'));
            this.projectiles.push(new NebyuBullet(this.world,this.x+6,this.y+oy, 1,img,5,'nebyu'));
          }
          this._sprayDone=true;
        }
      } else { this.state='idle'; this.cool=4.0; this.animT=0; this._ox=0; this._sprayDone=false; this.idleT=0; if(Math.random()<0.45) startBackstep(this,360,0.30); }
      return;
    }
    // ULT（超ハイジャンプ→高速落下→突進）
    if(this.state==='ult'){
      this.updatePhysics(dt); this.animT+=dt;
      if(this.animT<0.12){ if(this.onGround) this.vy=-JUMP_V*1.5; }
      else if(this.animT<0.12+0.30){ /* 上昇中表示だけ */ }
      else if(this.animT<0.12+0.30+0.18){ this.vy = 980; } // 高速落下
      else if(this.animT<0.12+0.30+0.18+0.32){
        this.vx = this.face*560;
        const hb={x:this.x+this.face*28,y:this.y,w:64,h:48};
        const p=player; if(p.invulnT<=0 && rectsOverlap(hb,p.aabb())) p.hurt(120,this.face,{lift:1.2,kbMul:1.4,kbuMul:1.3},this.effects);
      } else { this.state='idle'; this.cool=8.0; this.vx=0; this.animT=0; this.idleT=0; }
      clampToStage(this); return;
    }

    // AI
    const dx=player.x-this.x, adx=Math.abs(dx); faceTo(this,player);
    if(this.cool<=0 && this.idleT>=1.0){
      if(adx<180 && Math.random()<0.55){ this.state='atk'; this.animT=0; return; }
      if(adx<340 && Math.random()<0.35){ this.state='skill'; this.animT=0; return; }
      if(adx>320 && Math.random()<0.25){ this.state='ult'; this.animT=0; return; }
    }
    // ゆっくり距離調整
    if(adx<160){ this.vx=(dx>0?-120:120); if(Math.random()<0.1) startBackstep(this,360,0.26); }
    else if(adx>300){ this.vx=(dx>0?120:-120); }
    else this.vx=(dx>0?60:-60);
    this.updatePhysics(dt); this.animT+=dt;
  }
  draw(ctx,world){
    ctx.save(); ctx.translate(this.x-world.camX,this.y-world.camY); if(this.face<0) ctx.scale(-1,1);
    let img=null;
    if(this.state==='atk'){ img = (this.animT<0.16? this.img('prep1') : (this.animT<0.28? this.img('prep2') : (this.img('prep3')||this.img('prep2')))); }
    else if(this.state==='skill'){ img = (this.animT<0.12? this.img('jump'): this.img('shake')); }
    else if(this.state==='ult'){
      if(this.animT<0.12) img=this.img('u1'); else if(this.animT<0.60) img=this.img('u2'); else img=this.img('u3');
    } else if(this.state==='run'){ const f=Math.floor(this.animT*6)%3; img=[this.img('w1'),this.img('w2'),this.img('w3')][f]||this.img('w1'); }
    else img=this.img('idle');
    if(!img) img=this.img('idle');
    const ox=this._ox||0; const scale=this.h/img.height, w=img.width*scale, h=this.h;
    ctx.imageSmoothingEnabled=false; ctx.drawImage(img,Math.round(-w/2+ox),Math.round(-h/2),Math.round(w),Math.round(h));
    ctx.restore(); this.drawHPBar(ctx,world);
    for(const p of this.projectiles) p.draw(ctx);
  }
}

/* =========================================================
 * GabuKing — 技/ULTのCT管理と離脱行動
 * ========================================================= */
class GabuUltShot extends Projectile{
  constructor(world,x,y,dir,img){ super(world,x,y,dir,img,130); this.w=60; this.h=60; this.vx=260*dir; this.life=2.0; }
}
class GabuKing extends CharacterBase{
  constructor(world,effects,assets,x=1200){
    super(80,90);
    this.world=world; this.effects=effects; this.assets=assets;
    this.x=x; this.y=Math.floor(GROUND_TOP_Y)-this.h/2+FOOT_PAD; this.face=-1;
    this.maxhp=520; this.hp=520; this.cool=0; this.state='idle'; this.animT=0; this._seq=null; this._idx=0; this._t=0;
    this.superArmor=false;
    this.bullets=[];
    this.idleT=0;
    this.skillCD=0; this.ultCD=0; // ★CT
  }
  img(key){ const m={ idle:'t1.png', w1:'t2.png', w2:'t3.png', atk1a:'t4.png', atk1b:'t5.png', prep:'t6.png', fin8:'t8.png', fin9:'t9.png', hold:'t10.png', pose:'t7.png', shot:'t11.png' }; return this.assets.img(m[key]||'t1.png'); }
  aabb(){ return {x:this.x,y:this.y,w:this.w*0.7,h:this.h*0.95}; }
  addUltShot(){ const img=this.img('shot'); const ox=this.face*38, oy=-18; this.bullets.push(new GabuUltShot(this.world,this.x+ox,this.y+oy,this.face,img)); }
  update(dt,player){
    if(this.dead){ this.updatePhysics(dt); return; }
    this.idleT += dt;
    if(this.cool>0)this.cool=Math.max(0,this.cool-dt);
    if(this.skillCD>0)this.skillCD=Math.max(0,this.skillCD-dt);
    if(this.ultCD>0)this.ultCD=Math.max(0,this.ultCD-dt);

    for(const b of this.bullets) b.update(dt); this.bullets=this.bullets.filter(b=>!b.dead);

    // 進行中
    if(this._seq){
      this.updatePhysics(dt); this._t+=dt; const cur=this._seq[this._idx];
      if(cur?.fx) this.x += this.face*cur.fx*dt;
      if(cur?.hit){
        const hb={x:this.x+this.face*cur.hx,y:this.y,w:cur.hw,h:cur.hh};
        if(player.invulnT<=0 && rectsOverlap(hb, player.aabb())){
          player.hurt(cur.power,this.face,{lift:cur.lift,kbMul:cur.kbm,kbuMul:cur.kbum},this.effects);
        }
      }
      if(cur?.fire && !cur._fired){ this.addUltShot(); cur._fired=true; }
      if(this._t>=cur.dur){ this._idx++; this._t=0; if(this._idx>=this._seq.length){ this._seq=null; this.state='idle'; this.superArmor=false; this.vx=0; if(Math.random()<0.40){ this.vx = -this.face*380; this.state='back'; this._backT=0; this._backDur=0.28; } } }
      this.animT+=dt; return;
    }

    // バックステップ中
    if(tickBackstep(this,dt)){ this.updatePhysics(dt); return; }

    // AI：距離＆CT
    const dx=player.x-this.x, adx=Math.abs(dx); this.face = dx>=0?1:-1;
    if(this.cool<=0){
      // 近接
      if(adx<140 && Math.random()<0.55){
        this.state='atk';
        this._seq=[
          {dur:0.08,key:'atk1a',fx:170,hit:false},
          {dur:0.12,key:'atk1b',fx:220,hit:true,hx:26,hw:48,hh:40,power:34,lift:0.6,kbm:1.25,kbum:1.15}, // ★KB強化
          {dur:0.06,key:'atk1a',fx:150},
          {dur:0.12,key:'atk1b',fx:220,hit:true,hx:26,hw:48,hh:40,power:34,lift:0.6,kbm:1.25,kbum:1.15}
        ];
        this._idx=0; this._t=0; this.cool=1.4; this.idleT=0; return;
      }
      // 技（CT 5s）
      if(this.skillCD<=0 && adx<320 && Math.random()<0.50){
        this.state='skill'; this.superArmor=true;
        this._seq=[
          {dur:0.45,key:'prep',fx:0},
          {dur:0.30,key:'prep',fx:520,hit:true,hx:28,hw:70,hh:46,power:72,lift:0.9,kbm:1.2,kbum:1.1}
        ];
        this.skillCD=5.0; this._idx=0; this._t=0; this.cool=2.0; this.idleT=0; return;
      }
      // ULT（CT 10s）
      if(this.ultCD<=0 && adx<420 && Math.random()<0.30){
        this.state='ult'; this.superArmor=true;
        this._seq=[
          {dur:0.50,key:'hold',fx:0},
          {dur:0.18,key:'pose',fx:0,hit:true,hx:24,hw:56,hh:50,power:50,lift:0.6,kbm:1.0,kbum:1.0},
          {dur:0.30,key:'pose',fx:0,fire:true}
        ];
        this.ultCD=10.0; this._idx=0; this._t=0; this.cool=2.0; this.idleT=0; return;
      }
    }
    // 距離調整：遠→接近、中→様子見、近→少し離脱
    if(adx>240){ this.vx=(dx>0?150:-150); }
    else if(adx<140){ this.vx=(dx>0?-140:140); if(Math.random()<0.12) startBackstep(this,380,0.26); }
    else this.vx=(dx>0?70:-70);

    this.updatePhysics(dt);
    this.state = !this.onGround?'jump':(Math.abs(this.vx)>1?'run':'idle');
    this.animT+=dt;
  }
  draw(ctx,world){
    ctx.save(); ctx.translate(this.x-world.camX,this.y-world.camY); if(this.face<0) ctx.scale(-1,1);
    let img=null;
    if(this._seq){ const cur=this._seq[this._idx]; img=this.img(cur?.key||'idle'); }
    else if(this.state==='run'){ const f=Math.floor(this.animT*6)%2; img=this.img(f?'w1':'w2'); }
    else img=this.img('idle');
    const scale=this.h/img.height, w=img.width*scale, h=this.h; ctx.imageSmoothingEnabled=false;
    ctx.drawImage(img,Math.round(-w/2),Math.round(-h/2),Math.round(w),Math.round(h));
    ctx.restore(); this.drawHPBar(ctx,world);
    for(const b of this.bullets) b.draw(world.ctx||ctx);
  }
}

/* =========================================================
 * Screw — モード切替（高速走行／ホップ／大ジャンプ）
 * ========================================================= */
class Screw extends CharacterBase{
  constructor(world,effects,assets,x=1500){
    super(62,68);
    this.world=world; this.effects=effects; this.assets=assets;
    this.x=x; this.y=Math.floor(GROUND_TOP_Y)-this.h/2+FOOT_PAD; this.face=-1;
    this.maxhp=520; this.hp=520;
    this.cool=0; this.state='idle'; this.animT=0; this._seq=null; this._idx=0; this._t=0;
    this.mode='run'; this.modeT=0;
    this.idleT=0;
  }
  img(key){ const m={ idle:'B1.png', w1:'B2.png', w2:'B3.png', jump:'B3.png', high:'B4.png', a1a:'B5.png', a1b:'B6.png', a2a:'B5.png', a2b:'B7.png', sPrep:'B8.png', s1:'B9.png', s2:'B10.png', s3:'B11.png', uPrep:'B12.png', uDash:'B13.png', uFin:'B14.png' }; return this.assets.img(m[key]||'B1.png'); }
  aabb(){ return {x:this.x,y:this.y,w:this.w*0.68,h:this.h*0.92}; }
  update(dt,player){
    if(this.dead){ this.updatePhysics(dt); return; }
    if(this.cool>0)this.cool=Math.max(0,this.cool-dt);
    this.idleT+=dt; this.modeT-=dt; if(this.modeT<=0){ // モード切替
      const modes=['run','hop','high']; this.mode = modes[Math.floor(Math.random()*modes.length)];
      this.modeT = 1.2 + Math.random()*1.4;
    }
    // 進行中
    if(this._seq){
      this.updatePhysics(dt); this._t+=dt; const cur=this._seq[this._idx];
      if(cur?.fx) this.x += this.face*cur.fx*dt;
      if(cur?.hit){
        const hb={x:this.x+this.face*cur.hx,y:this.y,w:cur.hw,h:cur.hh};
        if(player.invulnT<=0 && rectsOverlap(hb, player.aabb())) player.hurt(cur.power,this.face,{lift:cur.lift,kbMul:cur.kbm,kbuMul:cur.kbum},this.effects);
      }
      if(this._t>=cur.dur){ this._idx++; this._t=0; if(this._idx>=this._seq.length){ this._seq=null; this.state='idle'; this.vx=0; } }
      this.animT+=dt; return;
    }
    // AI
    const dx=player.x-this.x, adx=Math.abs(dx); this.face = dx>=0?1:-1;

    // 攻撃抽選（近：A1 / 準近：A2 / 中：スキル連撃 / 遠：突進ウルト）
    if(this.cool<=0 && this.idleT>=1.0){
      if(adx<120){
        this.state='atk'; this._seq=[{dur:0.10,key:'a1a',fx:150},{dur:0.18,key:'a1b',fx:200,hit:true,hx:20,hw:46,hh:36,power:34,lift:0.45,kbm:1.15,kbum:1.05}]; this.cool=1.0; this._idx=0; this._t=0; this.idleT=0; return;
      } else if(adx<180){
        this.state='atk'; this._seq=[{dur:0.10,key:'a2a',fx:160},{dur:0.20,key:'a2b',fx:220,hit:true,hx:22,hw:50,hh:38,power:38,lift:0.6,kbm:1.2,kbum:1.1}]; this.cool=1.2; this._idx=0; this._t=0; this.idleT=0; return;
      } else if(adx<320){
        this.state='skill'; this._seq=[{dur:0.45,key:'sPrep',fx:0},{dur:0.22,key:'s1',fx:520,hit:true,hx:22,hw:56,hh:40,power:54,lift:0.5,kbm:1.0,kbum:0.95},{dur:0.14,key:'s2',fx:380,hit:true,hx:20,hw:44,hh:36,power:24,lift:0.3,kbm:0.95,kbum:0.9},{dur:0.22,key:'s3',fx:520,hit:true,hx:24,hw:58,hh:42,power:54,lift:1.0,kbm:1.1,kbum:1.05}]; this.cool=3.5; this._idx=0; this._t=0; this.idleT=0; return;
      } else if(adx<380){
        this.state='ult'; this._seq=[{dur:0.45,key:'uPrep',fx:0},{dur:0.26,key:'uDash',fx:620},{dur:0.22,key:'uFin',fx:0,hit:true,hx:26,hw:64,hh:50,power:122,lift:1.4,kbm:1.25,kbum:1.2}]; this.cool=10.0; this._idx=0; this._t=0; this.idleT=0; return;
      }
    }
    // 距離調整＋モード移動
    if(this.mode==='run'){
      if(adx>200) this.vx=(dx>0? 520: -520)*0.4; else this.vx=(dx>0? 220: -220)*0.4;
    } else if(this.mode==='hop'){
      this.vx=(dx>0? 220: -220)*0.35; if(this.onGround && Math.random()<0.25) this.vy=-JUMP_V*0.6;
    } else { // high
      this.vx=(dx>0? 260: -260)*0.38; if(this.onGround && Math.random()<0.35) this.vy=-JUMP_V*1.0;
    }
    if(adx<130) this.vx *= -1; // 近すぎたら距離取り
    this.updatePhysics(dt);
    this.state = !this.onGround?'jump':(Math.abs(this.vx)>1?'run':'idle');
    this.animT+=dt;
  }
  draw(ctx,world){
    ctx.save(); ctx.translate(this.x-world.camX,this.y-world.camY); if(this.face<0) ctx.scale(-1,1);
    let img=null;
    if(this._seq){ const cur=this._seq[this._idx]; img=this.img(cur?.key||'idle'); }
    else if(!this.onGround){ img=this.img(this.mode==='high'?'high':'jump'); }
    else if(this.state==='run'){ const f=Math.floor(this.animT*6)%2; img=this.img(f?'w1':'w2'); }
    else img=this.img('idle');
    const scale=this.h/img.height, w=img.width*scale, h=this.h; ctx.imageSmoothingEnabled=false;
    ctx.drawImage(img,Math.round(-w/2),Math.round(-h/2),Math.round(w),Math.round(h));
    ctx.restore(); this.drawHPBar(ctx,world);
  }
}

/* =========================================================
 * MOBVR — 変身＆高速突進、消える対策
 * ========================================================= */
class MOBVR extends CharacterBase{
  constructor(world,effects,assets,x=1600){
    super(66,72);
    this.world=world; this.effects=effects; this.assets=assets;
    this.x=x; this.y=Math.floor(GROUND_TOP_Y)-this.h/2+FOOT_PAD; this.face=-1;
    this.maxhp=1600; this.hp=1600; this.cool=0; this.state='idle'; this.animT=0; this.idleT=0;
    this.transformed=false; this.recoverT=0; this.skillCD=0;
  }
  img(key){
    const m={ idle:'VR.png', w1:'VR1.png', w2:'VR2.png', a1:'VR3.png', a2:'VR4.png', s1:'VR5.png', s2:'VR6.png', tpose:'VR7.png', // after
      idle2:'VR8.png', w12:'VR.9', w22:'VR.10', a12:'VR.11', a22:'VR12.png', s12:'VR13.png', s22:'VR14.png', s32:'VR15.png', shot2:'VR16.png' };
    return this.assets.img(m[key]) || this.assets.img('VR.png') || this.assets.img('VR8.png');
  }
  aabb(){ return {x:this.x,y:this.y,w:this.w*0.7,h:this.h*0.95}; }
  update(dt,player){
    if(this.dead){ this.updatePhysics(dt); return; }
    if(this.cool>0)this.cool=Math.max(0,this.cool-dt);
    if(this.recoverT>0)this.recoverT=Math.max(0,this.recoverT-dt);
    if(this.skillCD>0)this.skillCD=Math.max(0,this.skillCD-dt);
    this.idleT+=dt;

    // 変身条件
    if(!this.transformed && this.hp<=this.maxhp*0.6 && this.state!=='transform'){
      this.state='transform'; this.animT=0; this.vx=0; return;
    }

    if(this.state==='transform'){
      this.updatePhysics(dt); this.animT+=dt;
      if(this.animT<0.10){ if(this.onGround) this.vy=-JUMP_V*1.8; }           // ★超高く
      else if(this.animT<3.10){ this._ox=Math.sin(performance.now()/14)*2.2; } // 3秒高速震え
      else { this.transformed=true; this.state='idle'; this._ox=0; this.animT=0; }
      return;
    }

    // 行動進行
    if(this.state==='atk'){
      this.updatePhysics(dt); this.animT+=dt;
      const dashV = this.transformed? 640 : 520;
      if(this.animT<0.30){ this.vx = this.face*dashV; }
      if(this.animT>0.12 && this.animT<0.30){
        const hb={x:this.x+this.face*26,y:this.y,w:52,h:40};
        if(player.invulnT<=0 && rectsOverlap(hb,player.aabb())) player.hurt(30,this.face,{lift:0.4,kbMul:1.2,kbuMul:1.05},this.effects);
      }
      if(this.animT>=0.34){ this.state='idle'; this.animT=0; this.vx=0; this.cool=1.2; this.idleT=0; if(Math.random()<0.35){ this.vx=-this.face*360; this.state='back'; this._backT=0; this._backDur=0.26; } }
      return;
    }
    if(this.state==='skill'){
      this.updatePhysics(dt); this.animT+=dt;
      if(!this.transformed){
        // 前形態：s1震え→s2突進
        if(this.animT<3.0){ this._ox=Math.sin(performance.now()/16)*2.0; }
        else if(this.animT<3.0+0.30){
          this.vx=this.face*520;
          const hb={x:this.x+this.face*28,y:this.y,w:56,h:42};
          if(player.invulnT<=0 && rectsOverlap(hb,player.aabb())) player.hurt(40,this.face,{lift:0.6,kbMul:1.35,kbuMul:1.15},this.effects);
        } else { this.state='idle'; this.cool=2.0; this.skillCD=3.0; this._ox=0; this.animT=0; this.idleT=0; }
      } else {
        // 後形態：s12→s22→s32で溜め→shot2発射
        if(this.animT<0.24){} else if(this.animT<0.48){} else if(this.animT<0.72){} else if(this.animT<0.96){
          // 発射タイミング
          if(!this._fired){ this._fired=true; /* 発射は game.js 側でUltBlast等でも可。ここは演出のみ */ }
        } else { this.state='idle'; this.cool=2.4; this.skillCD=5.0; this._fired=false; this.animT=0; this.idleT=0; }
      }
      return;
    }

    if(tickBackstep(this,dt)){ this.updatePhysics(dt); return; }

    // AI
    const dx=player.x-this.x, adx=Math.abs(dx); this.face = dx>=0?1:-1;
    if(this.cool<=0 && this.idleT>=1.0){
      if(adx<180 && Math.random()<0.6){ this.state='atk'; this.animT=0; return; }
      if(this.skillCD<=0 && ((this.transformed && adx<380) || (!this.transformed && adx<340)) && Math.random()<0.5){ this.state='skill'; this.animT=0; return; }
    }
    // 距離調整：遠は接近、近は離脱
    if(adx>280){ this.vx=(dx>0? 200:-200); }
    else if(adx<160){ this.vx=(dx>0? -200:200); if(Math.random()<0.10) startBackstep(this,360,0.24); }
    else this.vx=(dx>0? 90:-90);

    this.updatePhysics(dt); this.animT+=dt;
  }
  draw(ctx,world){
    ctx.save(); ctx.translate(this.x-world.camX,this.y-world.camY); if(this.face<0) ctx.scale(-1,1);
    let img=null, ox=this._ox||0;
    if(this.state==='transform'){ img=this.img('tpose'); }
    else if(!this.transformed){
      if(this.state==='atk') img=this.img('a2'); else if(this.state==='skill') img=(this.animT<3.0? this.img('s1'): this.img('s2'));
      else if(this.state==='run'){ const f=Math.floor(this.animT*6)%2; img=this.img(f?'w1':'w2'); } else img=this.img('idle');
    } else {
      if(this.state==='atk') img=this.img('a22'); else if(this.state==='skill'){ img = (this.animT<0.24? this.img('s12'): (this.animT<0.48? this.img('s22'): (this.animT<0.72? this.img('s32'): this.img('shot2')))); }
      else if(this.state==='run'){ const f=Math.floor(this.animT*6)%2; img=(this.assets.img('VR.9')||this.assets.img('VR9.png')||this.img('idle2')); if(f&& (this.assets.img('VR.10')||this.assets.img('VR10.png'))) img=(this.assets.img('VR.10')||this.assets.img('VR10.png')); }
      else img=this.img('idle2');
    }
    if(!img) img=this.img('idle')||this.img('idle2');
    const scale=this.h/img.height, w=img.width*scale, h=this.h; ctx.imageSmoothingEnabled=false;
    ctx.drawImage(img,Math.round(-w/2+ox),Math.round(-h/2),Math.round(w),Math.round(h));
    ctx.restore(); this.drawHPBar(ctx,world);
  }
}

/* =========================================================
 * WaruMOB / IceRobo / MOBGiant — 距離調整＆強制行動を微強化
 * ========================================================= */
class WaruMOB extends CharacterBase{
  constructor(world,effects,assets,x=520){
    super(52,60);
    this.world=world; this.effects=effects; this.assets=assets;
    this.x=x; this.y=Math.floor(GROUND_TOP_Y)-this.h/2+FOOT_PAD; this.face=-1;
    this.maxhp=120; this.hp=120; this.cool=0; this._seq=null; this._idx=0; this._t=0; this.projectiles=[];
    this.forceActT=0;
  }
  imgByKey(k){ const a=this.assets; const map={ idle:'teki1.png', walk1:'teki1.png', walk2:'teki2.png', prep1:'teki1.png', prep2:'teki3.png' }; return a.img(map[k]||'teki1.png'); }
  addBullet(){ const img=this.assets.img('teki7.png'); const ox=this.face*28; const oy=-8; this.projectiles.push(new Projectile(this.world,this.x+ox,this.y+oy,this.face,img,10)); }
  // 吹っ飛び強化
  hurt(amount,dir,opts={},fx){ const boomy={kbMul:(opts.kbMul||1)*1.85,kbuMul:(opts.kbuMul||1)*1.65,lift:opts.lift}; return super.hurt(amount,dir,boomy,fx); }
  update(dt,player){
    if(this.dead){ this.updatePhysics(dt); return; }
    if(this.cool>0)this.cool=Math.max(0,this.cool-dt);
    this.forceActT+=dt;
    for(const p of this.projectiles) p.update(dt); this.projectiles=this.projectiles.filter(p=>!p.dead);
    if(this.state==='atk'){
      this.updatePhysics(dt);
      if(this._seq){ this._t+=dt; const cur=this._seq[this._idx];
        if(cur && this._t>=cur.dur){ this._idx++; this._t=0; if(this._idx===2){ this.addBullet(); }
          if(this._idx>=this._seq.length){ this._seq=null; this.state='idle'; } } }
      this.animT+=dt; return;
    }
    const dx=player.x - this.x; const adx=Math.abs(dx); this.face=dx>=0?1:-1;
    const fire=240;
    if((this.cool<=0 && adx<=fire) || this.forceActT>=1.4){
      this._seq=[{kind:'pose',dur:0.16,key:'prep1'},{kind:'pose',dur:0.22,key:'prep2'}];
      this.cool=1.2; this.state='atk'; this._idx=0; this._t=0; this.vx=0; this.forceActT=0; this.updatePhysics(dt); this.animT+=dt; return;
    }
    // 距離調整（近すぎると下がる）
    if(adx<120){ this.vx=(dx>0?-120:120); }
    else if(adx>fire){ this.vx=(dx>0?120:-120); }
    else this.vx=0;
    this.updatePhysics(dt);
    this.state = !this.onGround?'jump':(Math.abs(this.vx)>1?'run':'idle');
    this.animT+=dt;
  }
  draw(ctx,world){
    ctx.save(); ctx.translate(this.x-world.camX, this.y-world.camY);
    if(this.face<0 && !this.dead) ctx.scale(-1,1);
    let img=null;
    if(this.state==='atk' && this._seq){ const cur=this._seq[this._idx]; img=this.imgByKey(cur.key||'prep2'); }
    else if(this.state==='run'){ const f=Math.floor(this.animT*6)%2; img=this.imgByKey(f?'walk1':'walk2'); }
    else { img=this.imgByKey('idle'); }
    const scale=this.h/img.height, w=img.width*scale, h=this.h; ctx.imageSmoothingEnabled=false;
    ctx.drawImage(img, Math.round(-w/2), Math.round(-h/2), Math.round(w), Math.round(h));
    ctx.restore(); this.drawHPBar(ctx,world);
    for(const p of this.projectiles) p.draw(ctx);
  }
}

class IceRobo extends CharacterBase{
  constructor(world,effects,assets,x=900){
    super(64,70);
    this.world=world; this.effects=effects; this.assets=assets;
    this.x=x; this.y=Math.floor(GROUND_TOP_Y)-this.h/2+FOOT_PAD; this.face=-1;
    this.maxhp=1200; this.hp=1200; this.superArmor=false; this.cool=0; this.recoverT=0;
    this.modeJump=false; this.modeSwapT=0; this._seq=null; this._idx=0; this._t=0; this.chargeT=0; this.energyOrbs=[];
    this.forceActT=0;
  }
  aabb(){ return {x:this.x,y:this.y,w:this.w*0.65,h:this.h*0.9}; }
  img(key){ const map={ idle:'I1.png', walk1:'I1.png', walk2:'I2.png', jump1:'I1.png', jump2:'I2.png', jump3:'I3.png', charge:'I4.png', release:'I5.png', dashPrep:'I6.png', dashAtk:'I7.png', orb:'I8.png' }; return this.assets.img(map[key]||'I1.png'); }
  addEnergyBall(t){ const img=this.img('orb'); const ox=this.face*30, oy=-10; this.energyOrbs.push(new EnergyBall(this.world,this.x+ox,this.y+oy,this.face,img,20,t,1)); }
  hurt(amount,dir,opts={},fx){ const skillish=(opts.kbMul||1)>=1.5; const kbMul=this.superArmor?(skillish?0.6:0.15):(opts.kbMul||1); const kbuMul=this.superArmor?(skillish?0.5:0.10):(opts.kbuMul||1); return super.hurt(amount,dir,{...opts,kbMul,kbuMul},fx); }
  update(dt,player){
    if(this.dead){ this.updatePhysics(dt); return; }
    if(this.cool>0)this.cool=Math.max(0,this.cool-dt);
    if(this.recoverT>0){ this.recoverT=Math.max(0,this.recoverT-dt); }
    this.forceActT += dt;
    for(const p of this.energyOrbs) p.update(dt); this.energyOrbs=this.energyOrbs.filter(p=>!p.dead);

    // charge
    if(this.state==='charge'){
      this.superArmor=true; this.vx=0; this.updatePhysics(dt); this._t+=dt; this.chargeT=Math.min(2.0,this.chargeT+dt); this.animT+=dt;
      const adx=Math.abs(player.x-this.x);
      if(adx<180 && this.chargeT>0.25) this.releaseEnergy();
      else if(this.chargeT>=2.0) this.releaseEnergy();
      return;
    }
    // dash
    if(this.state==='dash'){
      this.updatePhysics(dt); this._t+=dt;
      if(this._t>=0.35){ this.state='idle'; this.superArmor=false; this.vx=0; this.cool=2.0; }
      this.animT+=dt; return;
    }
    if(this.state==='atk' || this.state==='recover'){ this.updatePhysics(dt); this.animT+=dt; if(this.state==='recover' && this.recoverT<=0){ this.state='idle'; } return; }
    if(this.state==='hurt'){ this.updatePhysics(dt); if(this.onGround) this.state='idle'; this.animT += dt; return; }

    const dx=player.x - this.x; const adx=Math.abs(dx); this.face=dx>=0?1:-1;
    // 強制行動を少し早め
    if(this.forceActT>=1.3){
      if(adx<260){ this.state='atk'; this.superArmor=true; this.vx=0; this._seq=[{key:'dashPrep',dur:0.22},{key:'dashAtk',dur:0.30}]; this._idx=0; this._t=0; this.animT=0; this.cool=1.6; this.forceActT=0; return; }
      this.state='charge'; this._t=0; this.chargeT=0; this.vx=0; this.superArmor=true; this.cool=1.6; this.forceActT=0; return;
    }
    if(this.cool<=0 && this.recoverT<=0 && adx>=140 && adx<=520){
      this.state='charge'; this._t=0; this.chargeT=0; this.vx=0; this.superArmor=true; this.cool=2.0; this.forceActT=0; return;
    }
    if(this.cool<=0 && this.recoverT<=0 && adx<260){
      this.state='atk'; this.superArmor=true; this.vx=0; this._seq=[{key:'dashPrep',dur:0.24},{key:'dashAtk',dur:0.32}]; this._idx=0; this._t=0; this.animT=0; this.cool=2.0; this.forceActT=0; return;
    }
    // 移動
    const walk=90, run=MOVE;
    if(adx>140){ const sp=(Math.random()<0.5? run : walk); this.vx=(dx>0? sp: -sp); if(Math.random()<0.2 && this.onGround) this.vy=-JUMP_V*0.8; }
    else this.vx=0;
    this.updatePhysics(dt);
    this.state = !this.onGround?'jump':(Math.abs(this.vx)>1?'run':'idle'); this.animT+=dt;
  }
  releaseEnergy(){ this.addEnergyBall(this.chargeT); this.state='recover'; this.recoverT=0.7; this.superArmor=false; }
  draw(ctx,world){
    if(this.state==='atk' && this._seq){ this._t+=1/60; const cur=this._seq[this._idx]; if(cur){ cur._t=(cur._t||0)+1/60; if(cur._t>=cur.dur){ this._idx++; if(this._idx>=this._seq.length){ this.state='dash'; this._t=0; this.vx=(this.face>0?560:-560); this._seq=null; } } } }
    ctx.save(); ctx.translate(this.x-world.camX,this.y-world.camY); if(this.face<0 && !this.dead) ctx.scale(-1,1);
    let img=null, ox=0;
    if(this.state==='charge'){ img=this.img('charge'); ox=Math.sin(performance.now()/25)*1.5; }
    else if(this.state==='dash' || (this.state==='atk' && this._seq && this._seq[this._idx] && this._seq[this._idx].key==='dashAtk')) img=this.img('dashAtk');
    else if(this.state==='atk' && this._seq){ const cur=this._seq[this._idx]; img=this.img(cur.key||'dashPrep'); ox=Math.sin(performance.now()/25)*2; }
    else if(this.state==='recover'){ img=this.img('release'); }
    else if(this.state==='run'){ const f=Math.floor(this.animT*6)%2; img=this.img(f?'walk1':'walk2'); }
    else if(this.state==='jump'){ const f=Math.floor(this.animT*8)%3; img=this.img(['jump1','jump2','jump3'][f]); }
    else img=this.img('idle');
    const scale=this.h/img.height, w=img.width*scale, h=this.h; ctx.imageSmoothingEnabled=false;
    ctx.drawImage(img,Math.round(-w/2+ox),Math.round(-h/2),Math.round(w),Math.round(h));
    if(this.state==='charge'){ const orb=this.img('orb'); const t=this.chargeT; const mul=0.6+0.8*(t/2); const hh=32*mul, ww=44*mul; const oxh=this.face*26, oyh=-14;
      if(orb){ ctx.save(); ctx.translate(oxh,oyh); if(this.face<0) ctx.scale(-1,1); ctx.globalAlpha=0.9; ctx.drawImage(orb,Math.round(-ww/2),Math.round(-hh/2),Math.round(ww),Math.round(hh)); ctx.restore(); }
    }
    ctx.restore(); this.drawHPBar(ctx,world);
    for(const p of this.energyOrbs) p.draw(ctx);
  }
}

class MOBGiant extends CharacterBase{
  constructor(world,effects,assets,x=1650){
    super(100,120);
    this.world=world; this.effects=effects; this.assets=assets;
    this.x=x; this.y=Math.floor(GROUND_TOP_Y)-this.h/2+FOOT_PAD; this.face=-1;
    this.maxhp=2800; this.hp=2800; this.superArmor=false; this.cool=0; this.recoverT=0; this.modeJump=false; this.modeSwapT=0;
    this.chargeT=0; this.energyOrbs=[]; this.postLagT=0; this.lowFreqBias=0.0; this.idleT=0;
  }
  aabb(){ return {x:this.x,y:this.y,w:this.w*0.7,h:this.h*0.96}; }
  img(key){ const map={ idle:'P1.png', w1:'P1.png', w2:'P2.png', j1:'P1.png', j2:'P2.png', j3:'P3.png', dashPrep:'P4.png', dashAtk:'P5.png', charge:'P6.png', release:'P7.png', orb:'P10.png' }; return this.assets.img(map[key]||'P1.png'); }
  hurt(a,d,o={},fx){ const stateSA=this.superArmor; const skillish=(o.kbMul||1)>=1.5; const activeSA=stateSA||Math.random()<0.65; const kbMul=activeSA?(skillish?0.65:0.12):(o.kbMul||1); const kbuMul=activeSA?(skillish?0.60:0.10):(o.kbuMul||1); return super.hurt(a,d,{...o,kbMul,kbuMul},fx); }
  addEnergyPair(t){ const img=this.img('orb'); const ox=this.face*40, oy=-20; this.energyOrbs.push(new EnergyBall(this.world,this.x+ox,this.y+oy,this.face,img,36,t,2)); this.energyOrbs.push(new EnergyBall(this.world,this.x-ox,this.y+oy,-this.face,img,36,t,2)); }
  update(dt,player){
    if(this.dead){ this.updatePhysics(dt); return; }
    if(this.cool>0)this.cool=Math.max(0,this.cool-dt);
    if(this.recoverT>0)this.recoverT=Math.max(0,this.recoverT-dt);
    if(this.postLagT>0)this.postLagT=Math.max(0,this.postLagT-dt);
    for(const p of this.energyOrbs) p.update(dt); this.energyOrbs=this.energyOrbs.filter(p=>!p.dead);
    this.idleT+=dt;
    if(this.state==='charge'){
      this.superArmor=true; this.vx=0; this.updatePhysics(dt);
      this.chargeT=Math.min(2.2,this.chargeT+dt);
      const adx=Math.abs(player.x-this.x);
      if(adx<220 && this.chargeT>0.3) this.releaseEnergy();
      else if(this.chargeT>=2.2) this.releaseEnergy();
      this.animT+=dt; return;
    }
    if(this.state==='dash'){
      this.updatePhysics(dt); this.animT+=dt;
      if(this.animT>=0.42){ this.state='idle'; this.superArmor=false; this.vx=0; this.cool=2.0+this.lowFreqBias; }
      return;
    }
    if(this.state==='post'){ this.updatePhysics(dt); this.animT+=dt; if(this.postLagT<=0){ this.state='idle'; } return; }
    if(this.state==='hurt'){ this.updatePhysics(dt); if(this.onGround) this.state='idle'; this.animT+=dt; return; }

    const dx=player.x-this.x, adx=Math.abs(dx); this.face=dx>=0?1:-1;
    this.modeSwapT-=dt; if(this.modeSwapT<=0 && this.onGround){ this.modeSwapT = 2.4 + Math.random()*2.0; this.modeJump = !this.modeJump; }
    this.lowFreqBias = clamp(this.lowFreqBias + (Math.random()*0.2-0.1), 0.0, 1.2);
    if(this.idleT>=1.6){
      if(adx<260){ this.state='dash'; this.animT=0; this.superArmor=true; this.vx=(this.face>0?560:-560); this.cool=1.8+this.lowFreqBias; this.idleT=0; return; }
      this.state='charge'; this.chargeT=0; this.superArmor=true; this.vx=0; this.cool=1.8+this.lowFreqBias; this.animT=0; this.idleT=0; return;
    }
    const desireCharge = (adx>=220 && adx<=620);
    if(this.cool<=0 && this.recoverT<=0 && this.postLagT<=0 && desireCharge){
      if(this.onGround || Math.random()<0.45){ this.state='charge'; this.chargeT=0; this.superArmor=true; this.vx=0; this.cool=2.6+this.lowFreqBias; this.animT=0; this.idleT=0; return; }
    }
    if(this.cool<=0 && this.recoverT<=0 && adx<260){
      this.state='dash'; this.animT=0; this.superArmor=true; this.vx=(this.face>0?560:-560); this.cool=2.2+this.lowFreqBias; this.idleT=0; return;
    }
    const walk=78, run=220;
    if(adx>150){ const sp=this.modeJump? run:walk; this.vx=(dx>0? sp:-sp); if(this.modeJump && this.onGround){ this.vy=-JUMP_V*1.0; } }
    else this.vx=0;
    this.updatePhysics(dt);
    if(!this.onGround) this.state='jump'; else this.state=Math.abs(this.vx)>1? 'run':'idle';
    this.animT+=dt;
  }
  releaseEnergy(){ this.addEnergyPair(this.chargeT); this.state='post'; this.postLagT=1.0; this.superArmor=false; this.animT=0; }
  draw(ctx,world){
    ctx.save(); ctx.translate(this.x-world.camX,this.y-world.camY); if(this.face<0 && !this.dead) ctx.scale(-1,1);
    let img=null, ox=0;
    if(this.state==='charge'){ img=this.img('charge'); ox=Math.sin(performance.now()/25)*2; }
    else if(this.state==='dash'){ img=this.img('dashAtk'); }
    else if(this.state==='post'){ img=this.img('release'); }
    else if(this.state==='run'){ const f=Math.floor(this.animT*6)%2; img=this.img(f?'w1':'w2'); }
    else if(this.state==='jump'){ const f=Math.floor(this.animT*8)%3; img=this.img(['j1','j2','j3'][f]); }
    else img=this.img('idle');
    const scale=this.h/img.height, w=img.width*scale, h=this.h; ctx.imageSmoothingEnabled=false;
    ctx.drawImage(img,Math.round(-w/2+ox),Math.round(-h/2),Math.round(w),Math.round(h));
    if(this.state==='charge'){ const orb=this.img('orb'); const t=this.chargeT; const mul=0.7+1.0*(t/2.2); const hh=38*mul, ww=54*mul; const oxh=this.face*34, oyh=-22;
      if(orb){ ctx.save(); ctx.translate(oxh,oyh); if(this.face<0) ctx.scale(-1,1); ctx.globalAlpha=0.95; ctx.drawImage(orb,Math.round(-ww/2),Math.round(-hh/2),Math.round(ww),Math.round(hh)); ctx.restore(); }
    }
    ctx.restore(); this.drawHPBar(ctx,world);
    for(const p of this.energyOrbs) p.draw(ctx);
  }
}

/* =========================================================
 * Export (part2 追加分)
 * ========================================================= */
window.__Actors__ = Object.assign({}, window.__Actors__||{}, {
  Gardi, GardiElite, Nebyu, NebyuBullet, GabuKing, Screw, MOBVR, WaruMOB, IceRobo, MOBGiant
});

})();
