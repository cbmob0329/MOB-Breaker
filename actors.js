// actors.js — Enemies only（Playerはactors-player.jsで上書き/定義）
(function(){
'use strict';

const {
  Effects, Assets, Input, CharacterBase,
  Projectile, EnergyBall, UltBlast, GroundSpike,
  constants:{ STAGE_LEFT, STAGE_RIGHT, WALL_PAD, GRAV, MOVE, JUMP_V, MAX_FALL, GROUND_TOP_Y, FOOT_PAD },
  utils:{ clamp, lerp, now, rectsOverlap }
} = window.__GamePieces__;

/* ============ 共通：回転吹っ飛び（演出フック） ============ */
/* ヒット側（プレイヤー）で e._twirlT = 0.45 付与済み。
   各敵は update(dt)で減衰し、drawで軽く回転させる */
function applyTwirlDecay(self, dt){ if(self._twirlT>0) self._twirlT = Math.max(0, self._twirlT - dt); }
function withTwirlDraw(ctx, self, drawFn){
  ctx.save();
  ctx.translate(self.x - self.world.camX, self.y - self.world.camY);
  if(self.dead){ ctx.globalAlpha=self.fade; ctx.rotate(self.spinAngle); }
  if(self.face<0 && !self.dead) ctx.scale(-1,1);
  // twirl：軽くブルンと回る（演出）
  if(self._twirlT>0){
    const amp = 0.35 * (self._twirlT/0.45);
    ctx.rotate(Math.sin(performance.now()/60)*amp);
  }
  drawFn(ctx);
  ctx.restore();
  self.drawHPBar(ctx, self.world);
}

/* ================================
 * Enemy: Basic ranged mob (WaruMOB)
 * ================================ */
class WaruMOB extends CharacterBase{
  constructor(world,effects,assets,x=520){
    super(52,60);
    this.world=world; this.effects=effects; this.assets=assets;
    this.x=x; this.y=Math.floor(GROUND_TOP_Y)-this.h/2+FOOT_PAD; this.face=-1;
    this.maxhp=120; this.hp=120;
    this.cool=0; this._seq=null; this._idx=0; this._t=0; this.projectiles=[];
    this.forceActT=0;
  }
  imgByKey(key){ const a=this.assets; const map={ idle:'teki1.png', walk1:'teki1.png', walk2:'teki2.png', prep1:'teki1.png', prep2:'teki3.png' }; return a.img(map[key]||'teki1.png'); }
  addBullet(){ const img=this.assets.img('teki7.png'); const ox=this.face*28; const oy=-8; this.projectiles.push(new Projectile(this.world,this.x+ox,this.y+oy,this.face,img,10)); }

  // 弱キャラは吹っ飛び強化
  hurt(amount, dir, opts={}, effects){
    const boomy = { kbMul: (opts.kbMul||1)*1.85, kbuMul:(opts.kbuMul||1)*1.65, lift:opts.lift };
    return super.hurt(amount, dir, boomy, effects);
  }

  update(dt,player){
    if(this.dead){ this.updatePhysics(dt); return; }
    if(this.cool>0) this.cool=Math.max(0,this.cool-dt);
    this.forceActT += dt;
    applyTwirlDecay(this, dt);

    for(const p of this.projectiles) p.update(dt); this.projectiles=this.projectiles.filter(p=>!p.dead);

    // 攻撃中
    if(this.state==='atk'){
      this.updatePhysics(dt);
      if(this._seq){ this._t+=dt; const cur=this._seq[this._idx];
        if(cur && this._t>=cur.dur){ this._idx++; this._t=0; if(this._idx===2){ this.addBullet(); }
          if(this._idx>=this._seq.length){ this._seq=null; this.state='idle'; } } }
      this.animT+=dt; return;
    }

    const dx=player.x - this.x; const adx=Math.abs(dx); this.face=dx>=0?1:-1;
    const near=110, mid=170, far=240, fire=220; const patrol=70, backSp=100;

    // 強制射撃
    if((this.cool<=0 && adx<=fire) || this.forceActT>=1.6){
      this._seq=[ {kind:'pose',dur:0.16,key:'prep1'}, {kind:'pose',dur:0.22,key:'prep2'} ];
      this.cool=1.3; this.state='atk'; this._idx=0; this._t=0; this.vx=0; this.forceActT=0;
      this.updatePhysics(dt); this.animT+=dt; return;
    }

    if(this.cool>0){
      if(adx<near){ this.vx = (dx>0? -backSp : backSp); } // 近すぎはちょい下がる
      else if(adx>far){ this.vx = (dx>0? patrol : -patrol); }
      else if(adx>mid){ this.vx = (dx>0? patrol : -patrol); }
      else { this.vx = 0; }
    } else {
      if(adx>fire){ this.vx = (dx>0? patrol : -patrol); } else { this.vx = 0; }
    }
    this.updatePhysics(dt);
    this.state = !this.onGround ? 'jump' : (Math.abs(this.vx)>1?'run':'idle');
    this.animT+=dt;
  }
  draw(ctx){
    const self=this;
    withTwirlDraw(ctx,self,(ctx)=>{
      let img=null;
      if(self.state==='atk' && self._seq){ const cur=self._seq[self._idx]; img=self.imgByKey(cur.key||'prep2'); }
      else if(self.state==='run'){ const f=Math.floor(self.animT*6)%2; img=self.imgByKey(f? 'walk1':'walk2'); }
      else { img=self.imgByKey('idle'); }
      if(img){ const scale=self.h/img.height, w=img.width*scale, h=self.h; ctx.imageSmoothingEnabled=false; ctx.drawImage(img, Math.round(-w/2), Math.round(-h/2), Math.round(w), Math.round(h)); }
    });
    for(const p of this.projectiles) p.draw(this.world.ctx||ctx);
  }
}

/* ================================
 * Enemy: Kozou (weak thrower)
 * ================================ */
class KozouStone extends Projectile{
  constructor(world,x,y,dir,img){ super(world,x,y,dir,img,6); this.vx = 140*dir; this.vy = -380; this.w = 22; this.h = 22; this.gravity = 900; }
  update(dt){
    if(this.dead) return; this.vy += this.gravity*dt; this.x += this.vx*dt; this.y += this.vy*dt;
    const ground = Math.floor(GROUND_TOP_Y); if(this.y + this.h/2 >= ground+FOOT_PAD){ this.dead=true; }
  }
}
class Kozou extends CharacterBase{
  constructor(world,effects,assets,x=900){
    super(50,58); this.world=world; this.effects=effects; this.assets=assets;
    this.x=x; this.y=Math.floor(GROUND_TOP_Y)-this.h/2+FOOT_PAD; this.face=-1;
    this.maxhp=90; this.hp=90; this.cool=0; this.state='idle'; this.animT=0; this.projectiles=[];
    this.guard=false; this.guardHits=0; this._thrown=false; this.idleT=0;
  }
  img(key){ const map={ idle:'SL.png', w1:'SL2.png', w2:'SL3.png', prep:'SL4.png', throw:'SL5.png', guard:'SL6.png', counter:'SL7.png', stone:'SL8.png'}; return this.assets.img(map[key]||'SL.png'); }
  aabb(){ return {x:this.x, y:this.y, w:this.w*0.65, h:this.h*0.9}; }
  hurt(amount, dir, opts={}, effects){
    const kbm=(opts.kbMul||1)*1.85, kbum=(opts.kbuMul||1)*1.65;
    return super.hurt(amount, dir, {...opts, kbMul:kbm, kbuMul:kbum}, effects);
  }
  update(dt,player){
    if(this.dead){ this.updatePhysics(dt); return; }
    if(this.cool>0) this.cool=Math.max(0,this.cool-dt);
    for(const p of this.projectiles) p.update(dt); this.projectiles=this.projectiles.filter(p=>!p.dead);
    this.idleT += dt; applyTwirlDecay(this, dt);

    if(this.state==='counter'){
      this.updatePhysics(dt); this.animT+=dt; const dur=0.28; const mid=0.14;
      if(this.animT<dur){ this.vx=this.face*120; }
      if(this.animT>mid){
        const hb={x:this.x + this.face*18, y:this.y, w:36, h:30};
        if(player.invulnT<=0 && rectsOverlap(hb, player.aabb())){
          const hit=player.hurt(8, this.face, {lift:0.3,kbMul:0.9,kbuMul:0.9}, this.effects);
          if(hit){ const fill=document.getElementById('hpfill'); const num=document.getElementById('hpnum'); if(fill&&num){ num.textContent=player.hp; fill.style.width=Math.max(0,Math.min(100,(player.hp/player.maxhp)*100))+'%'; } }
        }
      }
      if(this.animT>=dur){ this.state='idle'; this.vx=0; this.cool=1.0; this.guard=false; this.guardHits=0; this.idleT=0; }
      return;
    }
    if(this.state==='throw'){
      this.updatePhysics(dt); this.animT+=dt;
      if(this.animT>0.18 && !this._thrown){ this._thrown=true; const img=this.img('stone'); const ox=this.face*14, oy=-18;
        this.projectiles.push(new KozouStone(this.world, this.x+ox, this.y+oy, this.face, img)); }
      if(this.animT>0.4){ this.state='idle'; this.vx=0; this.cool=1.2; this._thrown=false; this.idleT=0; }
      return;
    }
    if(this.guard){ this.vx=0; this.updatePhysics(dt); this.animT+=dt;
      const dx=player.x-this.x; const adx=Math.abs(dx); this.face=dx>=0?1:-1; if(adx<120){ this.vx = (dx>0? -80 : 80); } return; }

    const dx=player.x-this.x; const adx=Math.abs(dx); this.face=dx>=0?1:-1;
    if(adx>140){ this.vx = (dx>0? 70 : -70); } else this.vx=0;

    if(this.cool<=0){
      if(this.idleT>=1.2){ if(adx>120){ this.state='throw'; this.animT=0; this.vx=0; } else { this.guard=true; this.state='idle'; this.animT=0; this.vx=0; } this.idleT=0; return; }
      if(adx>120 && Math.random()<0.55){ this.state='throw'; this.animT=0; this.vx=0; this.idleT=0; }
      else if(Math.random()<0.30){ this.guard=true; this.state='idle'; this.animT=0; this.vx=0; this.idleT=0; }
    }

    this.updatePhysics(dt);
    this.state = this.onGround ? (Math.abs(this.vx)>1?'run':'idle') : 'jump';
    this.animT+=dt;
  }
  hurtGuarded(amount, dir, opts, effects){
    if(this.guard){ amount = Math.ceil(amount*0.5); this.guardHits = Math.min(3, this.guardHits+1); if(this.guardHits>=3 && this.state!=='counter'){ this.state='counter'; this.animT=0; this.vx=0; } }
    return super.hurt(amount, dir, opts, effects);
  }
  draw(ctx){
    const self=this;
    withTwirlDraw(ctx,self,(ctx)=>{
      let img=null;
      if(self.state==='throw'){ img=self.animT<0.2? self.img('prep'): self.img('throw'); }
      else if(self.state==='counter'){ img=self.img('counter'); }
      else if(self.guard){ img=self.img('guard'); }
      else if(self.state==='run'){ const f=Math.floor(self.animT*6)%2; img=self.img(f?'w1':'w2'); }
      else { img=self.img('idle'); }
      if(img){ const scale=self.h/img.height, w=img.width*scale, h=self.h; ctx.imageSmoothingEnabled=false; ctx.drawImage(img, Math.round(-w/2), Math.round(-h/2), Math.round(w), Math.round(h)); }
    });
    for(const p of this.projectiles) p.draw(this.world.ctx||ctx);
  }
}

/* ================================
 * Enemy: GabuKing (boss)
 * ================================ */
class GabuUltShot extends Projectile{
  constructor(world,x,y,dir,img){
    super(world,x,y,dir,img,130);
    this.w=60; this.h=60; this.vx=260*dir; this.life=2.0;
  }
}
class GabuKing extends CharacterBase{
  constructor(world,effects,assets,x=1200){
    super(80,90);
    this.world=world; this.effects=effects; this.assets=assets;
    this.x=x; this.y=Math.floor(GROUND_TOP_Y)-this.h/2+FOOT_PAD; this.face=-1;
    this.maxhp=520; this.hp=520;
    this.cool=0; this.state='idle'; this.animT=0; this._seq=null; this._idx=0; this._t=0;
    this.superArmor=false;
    this.bullets=[];
    this.idleT=0;
  }
  img(key){
    const map={ idle:'t1.png', w1:'t2.png', w2:'t3.png', atk1a:'t4.png', atk1b:'t5.png', prep:'t6.png', fin8:'t8.png', fin9:'t9.png', hold:'t10.png', pose:'t7.png', shot:'t11.png' };
    return this.assets.img(map[key]||'t1.png');
  }
  aabb(){ return {x:this.x, y:this.y, w:this.w*0.7, h:this.h*0.95}; }
  hurt(amount, dir, opts={}, effects){
    const skillish = (opts.kbMul||1) >= 1.5;
    const kbm = skillish? Math.max(1.1, opts.kbMul||1) : (opts.kbMul||1);
    const kbum= skillish? Math.max(1.0, opts.kbuMul||1) : (opts.kbuMul||1);
    return super.hurt(amount, dir, {...opts, kbMul:kbm, kbuMul:kbum}, effects);
  }
  addUltShot(){
    const img=this.img('shot');
    const ox=this.face*38, oy=-18;
    this.bullets.push(new GabuUltShot(this.world, this.x+ox, this.y+oy, this.face, img));
  }
  update(dt, player){
    if(this.dead){ this.updatePhysics(dt); return; }
    if(this.cool>0) this.cool=Math.max(0,this.cool-dt);
    this.idleT += dt; applyTwirlDecay(this, dt);

    // 弾
    for(const b of this.bullets){
      b.update(dt);
      if(!b.dead && player.invulnT<=0 && rectsOverlap(b.aabb(), player.aabb())){
        b.dead=true; const hit=player.hurt(b.power, b.dir, {lift:1.3, kbMul:1.2, kbuMul:1.2}, this.effects);
        if(hit){ const fill=document.getElementById('hpfill'); const num=document.getElementById('hpnum'); if(fill&&num){ num.textContent=player.hp; fill.style.width=Math.max(0,Math.min(100,(player.hp/player.maxhp)*100))+'%'; } }
      }
    }
    this.bullets=this.bullets.filter(b=>!b.dead);

    if(this._seq){
      this.updatePhysics(dt); this._t+=dt; const cur=this._seq[this._idx];
      if(cur?.fx){ this.x += this.face * cur.fx * dt; }
      if(cur?.hit){
        const hb={x:this.x + this.face*cur.hx, y:this.y, w:cur.hw, h:cur.hh};
        if(player.invulnT<=0 && rectsOverlap(hb, player.aabb())){
          const hit=player.hurt(cur.power, this.face, {lift:cur.lift,kbMul:cur.kbm,kbuMul:cur.kbum}, this.effects);
          if(hit){ const fill=document.getElementById('hpfill'); const num=document.getElementById('hpnum'); if(fill&&num){ num.textContent=player.hp; fill.style.width=Math.max(0,Math.min(100,(player.hp/player.maxhp)*100))+'%'; } }
        }
      }
      if(cur?.fire && !cur._fired){ this.addUltShot(); cur._fired=true; }
      if(this._t>=cur.dur){ this._idx++; this._t=0; if(this._idx>=this._seq.length){ this._seq=null; this.state='idle'; this.superArmor=false; this.vx=0; } }
      this.animT+=dt; return;
    }

    const dx=player.x-this.x, adx=Math.abs(dx); this.face=dx>=0?1:-1;
    const slow=80;
    if(adx>180){ this.vx = (dx>0? slow : -slow); }
    else this.vx=0;

    // 近接／スキル／ULTの使い分け（少し積極的に技を使う）
    if(this.cool<=0){
      if(adx<140){
        // 近接
        this.state='atk';
        this._seq=[
          {dur:0.08, key:'atk1a', fx:160, hit:false},
          {dur:0.12, key:'atk1b', fx:200, hit:true, hx:26, hw:48, hh:40, power:36, lift:0.7, kbm:1.1, kbum:1.05}
        ];
        this.cool=1.4; this._idx=0; this._t=0; this.idleT=0; return;
      }
      if(adx<320 && Math.random()<0.7){
        // スキル（突進打撃）
        this.state='skill'; this.superArmor=true;
        this._seq=[
          {dur:0.45, key:'prep', fx:0},
          {dur:0.30, key:'prep', fx:520, hit:true, hx:28, hw:70, hh:46, power:72, lift:0.9, kbm:1.25, kbum:1.15}
        ];
        this.cool=5.0; this._idx=0; this._t=0; this.idleT=0; return;
      }
      // ULT：弾（離れていても実施）
      this.state='ult'; this.superArmor=true;
      this._seq=[
        {dur:0.40, key:'hold', fx:0},
        {dur:0.16, key:'pose', fx:0, hit:true, hx:24, hw:56, hh:50, power:40, lift:0.5, kbm:1.0, kbum:1.0},
        {dur:0.30, key:'pose', fx:0, fire:true}
      ];
      this.cool=10.0; this._idx=0; this._t=0; this.idleT=0; return;
    }

    this.updatePhysics(dt);
    this.state = !this.onGround ? 'jump' : (Math.abs(this.vx)>1?'run':'idle');
    this.animT+=dt;
  }
  draw(ctx){
    const self=this;
    withTwirlDraw(ctx,self,(ctx)=>{
      let img=null;
      if(self._seq){ const cur=self._seq[self._idx]; img=self.img(cur?.key||'idle'); }
      else if(self.state==='run'){ const f=Math.floor(self.animT*6)%2; img=self.img(f?'w1':'w2'); }
      else img=self.img('idle');
      if(img){ const scale=self.h/img.height, w=img.width*scale, h=self.h; ctx.imageSmoothingEnabled=false; ctx.drawImage(img, Math.round(-w/2), Math.round(-h/2), Math.round(w), Math.round(h)); }
    });
    for(const b of this.bullets) b.draw(this.world.ctx||ctx);
  }
}

/* ================================
 * Enemy: Screw (boss)
 * ================================ */
class Screw extends CharacterBase{
  constructor(world,effects,assets,x=1500){
    super(62,68);
    this.world=world; this.effects=effects; this.assets=assets;
    this.x=x; this.y=Math.floor(GROUND_TOP_Y)-this.h/2+FOOT_PAD; this.face=-1;
    this.maxhp=520; this.hp=520;
    this.cool=0; this.state='idle'; this.animT=0; this._seq=null; this._idx=0; this._t=0;
    this.jumpModeT=0; this.highJump=false;
    this.idleT=0;
    this.forceGap=1.2;
  }
  img(key){
    const map={
      idle:'B1.png', w1:'B2.png', w2:'B3.png',
      jump:'B3.png', high:'B4.png',
      a1a:'B5.png', a1b:'B6.png',
      a2a:'B5.png', a2b:'B7.png',
      sPrep:'B8.png', s1:'B9.png', s2:'B10.png', s3:'B11.png',
      uPrep:'B12.png', uDash:'B13.png', uFin:'B14.png'
    };
    return this.assets.img(map[key]||'B1.png');
  }
  aabb(){ return {x:this.x, y:this.y, w:this.w*0.68, h:this.h*0.92}; }
  hurt(amount, dir, opts={}, effects){
    const skillish = (opts.kbMul||1) >= 1.5;
    const kbm = skillish? Math.max(1.1, opts.kbMul||1) : (opts.kbMul||1);
    const kbum= skillish? Math.max(1.0, opts.kbuMul||1) : (opts.kbuMul||1);
    return super.hurt(amount, dir, {...opts, kbMul:kbm, kbuMul:kbum}, effects);
  }
  _startSeq(seq, cd){ this.state = (seq[0].key?.startsWith('u')?'ult': (seq[0].key?.startsWith('s')?'skill':'atk')); this._seq=seq; this._idx=0; this._t=0; this.cool=cd; this.idleT=0; }
  update(dt, player){
    if(this.dead){ this.updatePhysics(dt); return; }
    if(this.cool>0) this.cool=Math.max(0,this.cool-dt);
    applyTwirlDecay(this, dt);

    // 進行中
    if(this._seq){
      this.updatePhysics(dt); this._t+=dt; const cur=this._seq[this._idx];
      if(cur?.fx){ this.x += this.face * cur.fx * dt; }
      if(cur?.hit){
        const hb={x:this.x + this.face*cur.hx, y:this.y, w:cur.hw, h:cur.hh};
        if(player.invulnT<=0 && rectsOverlap(hb, player.aabb())){
          const hit=player.hurt(cur.power, this.face, {lift:cur.lift,kbMul:cur.kbm,kbuMul:cur.kbum}, this.effects);
          if(hit){ const fill=document.getElementById('hpfill'); const num=document.getElementById('hpnum'); if(fill&&num){ num.textContent=player.hp; fill.style.width=Math.max(0,Math.min(100,(player.hp/player.maxhp)*100))+'%'; } }
        }
      }
      if(this._t>=cur.dur){ this._idx++; this._t=0; if(this._idx>=this._seq.length){ this._seq=null; this.state='idle'; this.vx=0; } }
      this.animT+=dt; return;
    }

    // 基本移動
    const dx=player.x-this.x, adx=Math.abs(dx); this.face=dx>=0?1:-1;
    this.idleT += dt;

    this.jumpModeT -= dt;
    if(this.jumpModeT<=0){ this.jumpModeT = 1.6 + Math.random()*1.0; this.highJump = Math.random()<0.45; }
    const slow=90, fast=MOVE;
    if(adx>140){ this.vx = (dx>0? (this.highJump? fast : slow) : -(this.highJump? fast : slow)); }
    else this.vx = 0;

    if(this.onGround){
      if(this.highJump && Math.random()<0.35){ this.vy = -JUMP_V*0.9; }
      else if(Math.random()<0.18){ this.vy = -JUMP_V*0.5; }
    }

    // 攻撃選択（距離 + 強制）
    const canAct = (this.cool<=0) || (this.idleT>=this.forceGap);
    if(canAct){
      let chose=false;
      if(adx<120){
        this._startSeq([
          {dur:0.10, key:'a1a', fx:120},
          {dur:0.18, key:'a1b', fx:180, hit:true, hx:20, hw:46, hh:36, power:36, lift:0.5, kbm:1.1, kbum:1.05}
        ], 1.1); chose=true;
      } else if(adx<180){
        this._startSeq([
          {dur:0.10, key:'a2a', fx:130},
          {dur:0.20, key:'a2b', fx:200, hit:true, hx:22, hw:50, hh:38, power:40, lift:0.7, kbm:1.1, kbum:1.05}
        ], 1.3); chose=true;
      } else if(adx<320){
        this._startSeq([
          {dur:0.45, key:'sPrep', fx:0},
          {dur:0.22, key:'s1', fx:520, hit:true, hx:22, hw:56, hh:40, power:52, lift:0.5, kbm:1.05, kbum:1.0},
          {dur:0.14, key:'s2', fx:380, hit:true, hx:20, hw:44, hh:36, power:24, lift:0.3, kbm:0.95, kbum:0.95},
          {dur:0.22, key:'s3', fx:520, hit:true, hx:24, hw:58, hh:42, power:56, lift:1.0, kbm:1.1, kbum:1.1}
        ], 3.8); chose=true;
      } else if(adx<420){
        this._startSeq([
          {dur:0.45, key:'uPrep', fx:0},
          {dur:0.26, key:'uDash', fx:620},
          {dur:0.22, key:'uFin',  fx:0, hit:true, hx:26, hw:64, hh:50, power:120, lift:1.4, kbm:1.25, kbum:1.2}
        ], 10.0); chose=true;
      }
      if(chose){ return; } else { this.idleT = 0; }
    }

    this.updatePhysics(dt);
    if(!this.onGround) this.state = this.highJump? 'jump':'jump';
    else this.state = Math.abs(this.vx)>1? 'run':'idle';
    this.animT+=dt;
  }
  draw(ctx){
    const self=this;
    withTwirlDraw(ctx,self,(ctx)=>{
      let img=null;
      if(self._seq){ const cur=self._seq[self._idx]; img=self.img(cur?.key||'idle'); }
      else if(!self.onGround){ img=self.img(self.highJump? 'high':'jump'); }
      else if(self.state==='run'){ const f=Math.floor(self.animT*6)%2; img=self.img(f?'w1':'w2'); }
      else img=self.img('idle');
      if(img){ const scale=self.h/img.height, w=img.width*scale, h=self.h; ctx.imageSmoothingEnabled=false; ctx.drawImage(img, Math.round(-w/2), Math.round(-h/2), Math.round(w), Math.round(h)); }
    });
  }
}

/* ================================
 * Enemy: IceRobo (boss-ish)
 * ================================ */
class IceRobo extends CharacterBase{
  constructor(world,effects,assets,x=900){
    super(64,70);
    this.world=world; this.effects=effects; this.assets=assets;
    this.x=x; this.y=Math.floor(GROUND_TOP_Y)-this.h/2+FOOT_PAD; this.face=-1;
    this.maxhp=1200; this.hp=1200; this.superArmor=false; this.cool=0; this.recoverT=0;
    this.modeJump=false; this.modeSwapT=0; this._seq=null; this._idx=0; this._t=0; this.chargeT=0; this.energyOrbs=[];
    this.forceActT=0;
  }
  aabb(){ return {x:this.x, y:this.y, w:this.w*0.65, h:this.h*0.9}; }
  img(key){ const map={ idle:'I1.png', walk1:'I1.png', walk2:'I2.png', jump1:'I1.png', jump2:'I2.png', jump3:'I3.png', charge:'I4.png', release:'I5.png', dashPrep:'I6.png', dashAtk:'I7.png', orb:'I8.png' }; return this.assets.img(map[key]||'I1.png'); }
  addEnergyBall(chargeSec){ const img=this.img('orb'); const ox=this.face*30, oy=-10; this.energyOrbs.push(new EnergyBall(this.world,this.x+ox,this.y+oy,this.face,img,20,chargeSec,1)); }
  hurt(amount, dir, opts={}, effects){
    const skillish = (opts.kbMul||1) >= 1.5;
    const kbMul = this.superArmor ? (skillish? 0.6 : 0.15) : (opts.kbMul||1);
    const kbuMul= this.superArmor ? (skillish? 0.5 : 0.10) : (opts.kbuMul||1);
    const o = {...opts, kbMul, kbuMul};
    return super.hurt(amount, dir, o, effects);
  }
  update(dt, player){
    if(this.dead){ this.updatePhysics(dt); return; }
    if(this.cool>0) this.cool=Math.max(0,this.cool-dt);
    if(this.recoverT>0){ this.recoverT=Math.max(0,this.recoverT-dt); }
    this.forceActT += dt; applyTwirlDecay(this, dt);

    for(const p of this.energyOrbs) p.update(dt); this.energyOrbs=this.energyOrbs.filter(p=>!p.dead);

    // チャージ
    if(this.state==='charge'){
      this.superArmor = true; this.vx = 0; this.updatePhysics(dt);
      this._t += dt; this.chargeT = Math.min(2.0, this.chargeT + dt); this.animT += dt;
      const adx = Math.abs(player.x - this.x);
      if(adx < 180 && this.chargeT > 0.25){ this.releaseEnergy(); }
      else if(this.chargeT >= 2.0){ this.releaseEnergy(); }
      return;
    }
    // ダッシュ
    if(this.state==='dash'){
      this.updatePhysics(dt); this._t += dt;
      if(this._t>=0.35){ this.state='idle'; this.superArmor=false; this.vx=0; this.cool=2.0; }
      this.animT += dt; return;
    }
    if(this.state==='atk' || this.state==='recover'){ this.updatePhysics(dt); this.animT += dt; if(this.state==='recover' && this.recoverT<=0){ this.state='idle'; } return; }
    if(this.state==='hurt'){ this.updatePhysics(dt); if(this.onGround) this.state='idle'; this.animT += dt; return; }

    const dx = player.x - this.x; const adx = Math.abs(dx); this.face = dx>=0? 1 : -1;
    this.modeSwapT -= dt; if(this.modeSwapT<=0 && this.onGround){ this.modeSwapT = 2.0 + Math.random()*1.6; this.modeJump = !this.modeJump; }
    const desireCharge = (adx>=140 && adx<=520);

    if(this.forceActT>=1.4){
      if(adx<260){ this.state='atk'; this.superArmor=true; this.vx=0; this._seq=[{key:'dashPrep', dur:0.22, vibrate:true},{key:'dashAtk', dur:0.30}]; this._idx=0; this._t=0; this.animT=0; this.cool=1.6; this.forceActT=0; return; }
      this.state='charge'; this._t=0; this.chargeT=0; this.vx=0; this.superArmor=true; this.cool=1.6; this.forceActT=0; return;
    }

    if(this.cool<=0 && this.recoverT<=0 && desireCharge){
      if(this.onGround || Math.random()<0.3){ this.state='charge'; this._t=0; this.chargeT=0; this.vx=0; this.superArmor=true; this.cool=2.2; this.forceActT=0; return; }
    }
    if(this.cool<=0 && this.recoverT<=0 && adx<260){
      this.state='atk'; this.superArmor=true; this.vx=0;
      this._seq=[{key:'dashPrep', dur:0.24, vibrate:true},{key:'dashAtk', dur:0.32}];
      this._idx=0; this._t=0; this.animT=0; this.cool=2.2; this.forceActT=0; return;
    }

    const walk=90, run=MOVE;
    if(adx>140){ const sp = this.modeJump? run : walk; this.vx = (dx>0? sp : -sp); if(this.modeJump && this.onGround){ this.vy = -JUMP_V*0.8; } }
    else { this.vx = 0; }
    this.updatePhysics(dt);
    this.state = !this.onGround ? 'jump' : (Math.abs(this.vx)>1?'run':'idle');
    this.animT += dt;
  }
  releaseEnergy(){ this.addEnergyBall(this.chargeT); this.state='recover'; this.recoverT=0.7; this.superArmor=false; }
  draw(ctx){
    const self=this;
    withTwirlDraw(ctx,self,(ctx)=>{
      let img=null, ox=0;
      if(self.state==='charge'){ img=self.img('charge'); ox=Math.sin(performance.now()/25)*1.5; }
      else if(self.state==='dash' || (self.state==='atk' && self._seq && self._seq[self._idx] && self._seq[self._idx].key==='dashAtk')){ img=self.img('dashAtk'); }
      else if(self.state==='atk' && self._seq){ const cur=self._seq[self._idx]; img=self.img(cur.key||'dashPrep'); ox=Math.sin(performance.now()/25)*2; }
      else if(self.state==='recover'){ img=self.img('release'); }
      else if(self.state==='run'){ const f=Math.floor(self.animT*6)%2; img=self.img(f? 'walk1':'walk2'); }
      else if(self.state==='jump'){ const f=Math.floor(self.animT*8)%3; img=self.img(['jump1','jump2','jump3'][f]); }
      else { img=self.img('idle'); }
      if(img){ const scale=self.h/img.height, w=img.width*scale, h=self.h; ctx.imageSmoothingEnabled=false; ctx.drawImage(img, Math.round(-w/2+ox), Math.round(-h/2), Math.round(w), Math.round(h)); }
      if(self.state==='charge'){
        const orb=self.img('orb'); const t=self.chargeT;
        const mul = 0.6 + 0.8*(t/2); const hh=32*mul, ww=44*mul; const oxh = self.face*26, oyh=-14;
        if(orb){ ctx.save(); ctx.translate(oxh, oyh); if(self.face<0) ctx.scale(-1,1); ctx.globalAlpha=0.9; ctx.drawImage(orb, Math.round(-ww/2), Math.round(-hh/2), Math.round(ww), Math.round(hh)); ctx.restore(); }
      }
    });
    for(const p of this.energyOrbs) p.draw(this.world.ctx||ctx);
  }
}

/* ================================
 * Enemy: MOBGiant (boss)
 * ================================ */
class MOBGiant extends CharacterBase{
  constructor(world,effects,assets,x=1650){
    super(100,120);
    this.world=world; this.effects=effects; this.assets=assets;
    this.x=x; this.y=Math.floor(GROUND_TOP_Y)-this.h/2+FOOT_PAD; this.face=-1;
    this.maxhp=2800; this.hp=2800;
    this.superArmor=false;
    this.cool=0; this.recoverT=0; this.modeJump=false; this.modeSwapT=0;
    this.chargeT=0; this.energyOrbs=[]; this.postLagT=0;
    this.lowFreqBias=0.0; this.idleT=0;
  }
  aabb(){ return {x:this.x, y:this.y, w:this.w*0.7, h:this.h*0.96}; }
  img(key){
    const map={ idle:'P1.png', w1:'P1.png', w2:'P2.png', j1:'P1.png', j2:'P2.png', j3:'P3.png',
      dashPrep:'P4.png', dashAtk:'P5.png', charge:'P6.png', release:'P7.png', orb:'P10.png' };
    return this.assets.img(map[key]||'P1.png');
  }
  hurt(amount, dir, opts={}, effects){
    const stateSA = this.superArmor;
    const skillish = (opts.kbMul||1) >= 1.5;
    const activeSA = stateSA || Math.random()<0.65;
    const kbMul = activeSA ? (skillish? 0.65 : 0.12) : (opts.kbMul||1);
    const kbuMul= activeSA ? (skillish? 0.60 : 0.10) : (opts.kbuMul||1);
    return super.hurt(amount, dir, {...opts, kbMul, kbuMul}, effects);
  }
  addEnergyPair(chargeSec){
    const img=this.img('orb');
    const ox=this.face*40, oy=-20;
    this.energyOrbs.push(new EnergyBall(this.world,this.x+ox,this.y+oy, this.face,  img, 36, chargeSec, 2));
    this.energyOrbs.push(new EnergyBall(this.world,this.x-ox,this.y+oy,-this.face, img, 36, chargeSec, 2));
  }
  update(dt, player){
    if(this.dead){ this.updatePhysics(dt); return; }
    if(this.cool>0) this.cool=Math.max(0,this.cool-dt);
    if(this.recoverT>0){ this.recoverT=Math.max(0,this.recoverT-dt); }
    if(this.postLagT>0){ this.postLagT=Math.max(0,this.postLagT-dt); }
    for(const p of this.energyOrbs) p.update(dt); this.energyOrbs=this.energyOrbs.filter(p=>!p.dead);
    this.idleT += dt; applyTwirlDecay(this, dt);

    if(this.state==='charge'){
      this.superArmor = true; this.vx=0; this.updatePhysics(dt);
      this.chargeT=Math.min(2.2, this.chargeT + dt);
      const adx=Math.abs(player.x - this.x);
      if(adx<220 && this.chargeT>0.3){ this.releaseEnergy(); }
      else if(this.chargeT>=2.2){ this.releaseEnergy(); }
      this.animT+=dt; return;
    }
    if(this.state==='dash'){
      this.updatePhysics(dt); this.animT+=dt;
      if(this.animT>=0.42){ this.state='idle'; this.superArmor=false; this.vx=0; this.cool=2.3 + this.lowFreqBias; }
      return;
    }
    if(this.state==='post'){
      this.updatePhysics(dt); this.animT+=dt;
      if(this.postLagT<=0){ this.state='idle'; }
      return;
    }
    if(this.state==='hurt'){ this.updatePhysics(dt); if(this.onGround) this.state='idle'; this.animT+=dt; return; }

    const dx = player.x - this.x; const adx = Math.abs(dx); this.face = dx>=0?1:-1;
    this.modeSwapT -= dt;
    if(this.modeSwapT<=0 && this.onGround){
      this.modeSwapT = 2.4 + Math.random()*2.0;
      this.modeJump = !this.modeJump;
    }
    this.lowFreqBias = clamp(this.lowFreqBias + (Math.random()*0.2-0.1), 0.0, 1.2);

    if(this.idleT>=1.6){
      if(adx<260){ this.state='dash'; this.animT=0; this.superArmor=true; this.vx = (this.face>0? 560 : -560); this.cool=1.8 + this.lowFreqBias; this.idleT=0; return; }
      this.state='charge'; this.chargeT=0; this.superArmor=true; this.vx=0; this.cool=1.8 + this.lowFreqBias; this.animT=0; this.idleT=0; return;
    }

    const desireCharge = (adx>=220 && adx<=620);
    if(this.cool<=0 && this.recoverT<=0 && this.postLagT<=0 && desireCharge){
      if(this.onGround || Math.random()<0.45){
        this.state='charge'; this.chargeT=0; this.superArmor=true; this.vx=0;
        this.cool = 2.8 + this.lowFreqBias; this.animT=0; this.idleT=0; return;
      }
    }
    if(this.cool<=0 && this.recoverT<=0 && adx<260){
      this.state='dash'; this.animT=0; this.superArmor=true;
      this.vx = (this.face>0? 560 : -560);
      this.cool = 2.4 + this.lowFreqBias; this.idleT=0; return;
    }

    const walk=78, run=220;
    if(adx>150){
      const sp = this.modeJump? run : walk;
      this.vx = (dx>0? sp : -sp);
      if(this.modeJump && this.onGround){ this.vy = -JUMP_V*1.0; }
    } else { this.vx=0; }

    this.updatePhysics(dt);
    if(!this.onGround) this.state='jump';
    else this.state = Math.abs(this.vx)>1? 'run':'idle';
    this.animT+=dt;
  }
  releaseEnergy(){
    this.addEnergyPair(this.chargeT);
    this.state='post'; this.postLagT=1.0;
    this.superArmor=false; this.animT=0;
  }
  draw(ctx){
    const self=this;
    withTwirlDraw(ctx,self,(ctx)=>{
      let img=null, ox=0;
      if(self.state==='charge'){ img=self.img('charge'); ox=Math.sin(performance.now()/25)*2; }
      else if(self.state==='dash'){ img=self.img('dashAtk'); }
      else if(self.state==='post'){ img=self.img('release'); }
      else if(self.state==='run'){ const f=Math.floor(self.animT*6)%2; img=self.img(f?'w1':'w2'); }
      else if(self.state==='jump'){
        const f=Math.floor(self.animT*8)%3; img=self.img(['j1','j2','j3'][f]);
      } else { img=self.img('idle'); }
      if(img){ const scale=self.h/img.height, w=img.width*scale, h=self.h; ctx.imageSmoothingEnabled=false; ctx.drawImage(img, Math.round(-w/2+ox), Math.round(-h/2), Math.round(w), Math.round(h)); }
      if(self.state==='charge'){
        const orb=self.img('orb'); const t=self.chargeT;
        const mul = 0.7 + 1.0*(t/2.2);
        const hh=38*mul, ww=54*mul; const oxh = self.face*34, oyh=-22;
        if(orb){ ctx.save(); ctx.translate(oxh, oyh); if(self.face<0) ctx.scale(-1,1); ctx.globalAlpha=0.95; ctx.drawImage(orb, Math.round(-ww/2), Math.round(-hh/2), Math.round(ww), Math.round(hh)); ctx.restore(); }
      }
    });
    for(const p of this.energyOrbs) p.draw(this.world.ctx||ctx);
  }
}

/* ================================
 * Export
 * ================================ */
window.__Actors__ = Object.assign({}, window.__Actors__||{}, {
  WaruMOB, Kozou, MOBGiant, GabuKing, Screw, IceRobo,
  // optional classes
  KozouStone, GabuUltShot
});

})();
