// actors-extra.js — 新規5敵キャラ追加（プレイアブル想定で共通設計）
// 依存: script-core.js（__GamePieces__） / 既存の actors-*.js と共存

(function(){
'use strict';

const {
  Effects, Assets, Input, CharacterBase,
  Projectile,
  constants:{ MOVE, JUMP_V, GROUND_TOP_Y, FOOT_PAD },
  utils:{ clamp, lerp, rectsOverlap }
} = window.__GamePieces__ || {};

// ===== 安全ガード =====
if(!CharacterBase){
  console.warn('[actors-extra] __GamePieces__ が未初期化です。script-core.js の読込順を確認してください。');
  return;
}

/* ------------------------------------------------
 * 共通：ヒットノックバック係数（ミニSA/超軽量など）
 * ------------------------------------------------ */
function applyMiniSA(baseOpts, chance){
  // chance (0..1) 確率で“ミニスーパーアーマー”：KBとKBUを大幅軽減
  if(Math.random() < chance){
    const o = {...(baseOpts||{})};
    o.kbMul  = (o.kbMul ?? 1) * 0.15;
    o.kbuMul = (o.kbuMul?? 1) * 0.12;
    return o;
  }
  return baseOpts;
}

/* ------------------------------------------------
 * Projectile: Nebu 大弾 / 小弾（GD.png）
 * ------------------------------------------------ */
class NebuBullet extends Projectile{
  constructor(world,x,y,dir,img,{power=50, big=true, speed=240, life=2.2}={}){
    super(world,x,y,dir,img,power);
    this.vx = speed*dir;
    this.life = life;
    if(big){ this.w=54; this.h=40; } else { this.w=26; this.h=20; }
  }
}

/* =================================================
 * MOBネビュ（射撃・乱射・超ジャンプULT） HP800
 * ミニSA：30%の確率
 * ================================================= */
class MobNebu extends CharacterBase{
  constructor(world,effects,assets,x=1100){
    super(64,72);
    this.world=world; this.effects=effects; this.assets=assets;
    this.x=x; this.y=Math.floor(GROUND_TOP_Y)-this.h/2+FOOT_PAD; this.face=-1;
    this.maxhp=800; this.hp=800;
    this.cool=0; this.state='idle'; this.animT=0;
    this.bullets=[];
    this.modeSwapT=0; this.slowWalk=70; // ゆっくり目
  }
  aabb(){ return {x:this.x, y:this.y, w:this.w*0.68, h:this.h*0.95}; }
  img(key){
    const map={
      idle:'MN.png',
      w1:'MN1.png', w2:'MN2.png', w3:'MN3.png',
      aim1:'MN4.png', aim2:'MN5.png', aim3:'MN6.png',
      jitter:'MN7.png', jump:'MN8.png',
      ultUp:'MN9.png', ultFall:'MN10.png', ultDash:'MN11.png',
      bullet:'GD.png'
    };
    return this.assets.img(map[key]||'MN.png');
  }
  // ミニSA 30%
  hurt(amount, dir, opts={}, effects){
    const o = applyMiniSA(opts, 0.30);
    return super.hurt(amount, dir, o, effects);
  }
  addShot(big=true, power=50, speed=260){
    const img=this.img('bullet');
    const ox=this.face*28, oy=-10;
    this.bullets.push(new NebuBullet(this.world,this.x+ox,this.y+oy,this.face,img,{power, big, speed}));
  }

  update(dt, player){
    if(this.dead){ this.updatePhysics(dt); return; }
    if(this.cool>0) this.cool=Math.max(0,this.cool-dt);

    // 弾更新 & 当たり
    for(const b of this.bullets){
      b.update(dt);
      if(!b.dead && player.invulnT<=0 && rectsOverlap(b.aabb(), player.aabb())){
        b.dead=true;
        const kb = b.power>=50 ? {lift:1.0,kbMul:1.25,kbuMul:1.25} : {lift:0.2,kbMul:0.7,kbuMul:0.7};
        const hit = player.hurt(b.power, b.dir, kb, this.effects);
        if(hit){
          const fill=document.getElementById('hpfill');
          const num=document.getElementById('hpnum');
          if(fill&&num){ num.textContent=player.hp; fill.style.width=Math.max(0,Math.min(100,(player.hp/player.maxhp)*100))+'%'; }
        }
      }
    }
    this.bullets=this.bullets.filter(b=>!b.dead);

    // 攻撃中進行
    if(this.state==='atk' || this.state==='skill' || this.state==='ult'){
      this.updatePhysics(dt);
      this.animT += dt;
      return;
    }

    // 行動選択
    const dx=player.x - this.x; const adx=Math.abs(dx); this.face = dx>=0 ? 1 : -1;

    // 遅歩き
    if(adx>180){ this.vx = (dx>0? this.slowWalk : -this.slowWalk); }
    else this.vx = 0;

    // 攻撃頻度：普通（距離に応じて）
    if(this.cool<=0){
      if(adx<260 && Math.random()<0.45){
        // 攻撃①：ライフル射撃（大弾）
        this.state='atk'; this.animT=0; this.vx=0; this.cool=1.4;
        this._seq=[
          {dur:0.16, key:'aim1'},
          {dur:0.18, key:'aim2'},
          {dur:0.12, key:'aim3', fire:true}
        ]; this._idx=0; return;
      }
      if(adx<360 && Math.random()<0.30){
        // スキル①：乱射（小弾左右各10発）
        this.state='skill'; this.animT=0; this.vx=0; this.cool=3.5;
        this._skillT=0; this._sprayCount=0; this._sprayDir=1; // 交互
        return;
      }
      if(adx>=260 && Math.random()<0.20){
        // ULT：超ハイジャンプ→高速落下→突進
        this.state='ult'; this.animT=0; this.vx=0; this.cool=6.5;
        this._ultPhase='up'; this.vy = -JUMP_V*1.6; // 超ハイジャンプ
        return;
      }
    }

    this.updatePhysics(dt);
    this.state = this.onGround ? (Math.abs(this.vx)>1? 'run':'idle') : 'jump';
    this.animT += dt;
  }

  draw(ctx,world){
    // シーケンス駆動
    if(this.state==='atk' && this._seq){
      const cur=this._seq[this._idx];
      if(cur){
        cur._t=(cur._t||0)+1/60;
        if(cur.fire && !cur._fired){ this.addShot(true,50,260); cur._fired=true; this.effects.addSpark(this.x+this.face*24, this.y-16, false); }
        if(cur._t>=cur.dur){ this._idx++; if(this._idx>=this._seq.length){ this._seq=null; this.state='idle'; } }
      }
    }
    if(this.state==='skill'){
      // MN8.pngでジャンプ→MN7.pngで震えながら少し跳ねる＆乱射
      this._skillT += 1/60;
      if(this._skillT<0.16 && this.onGround){ this.vy = -JUMP_V*0.7; }
      // 震えながら小ジャンプ
      if(this.onGround && Math.random()<0.2){ this.vy = -JUMP_V*0.25; }
      // 射出：左右交互で合計20発（左右10ずつ）
      if(this._sprayCount<20 && (this._skillT>0.05)){
        this._skillT = 0;
        const dir = (this._sprayCount%2===0)? 1 : -1;
        const img=this.img('bullet');
        const ox = dir*26;
        this.bullets.push(new NebuBullet(this.world,this.x+ox,this.y-12,dir,img,{power:5,big:false,speed:300,life:1.3}));
        this._sprayCount++;
      }
      if(this._sprayCount>=20){ this.state='idle'; }
      this.updatePhysics(1/60);
      this.animT += 1/60;
    }
    if(this.state==='ult'){
      // フェーズ：up -> fall -> dash
      if(this._ultPhase==='up'){
        if(this.vy>=0){ this._ultPhase='fall'; }
      } else if(this._ultPhase==='fall'){
        // 高速落下へ
        this.vy = Math.min(this.vy + 2000*(1/60), 1600);
        if(this.onGround){ this._ultPhase='dash'; this.vx = this.face*560; this.effects.shake(0.16,8); }
      } else if(this._ultPhase==='dash'){
        // 突進の当たり判定
        const hb={x:this.x + this.face*28, y:this.y, w:70, h:50};
        const p = window.__Actors__?.PlayerInstance; // （オプション）グローバル参照があれば使う
        // ここでは Game 側で当たりをとっている想定なので描画のみ
      }
      this.updatePhysics(1/60);
      this.animT += 1/60;
    }

    // 描画
    const img = (()=>{
      if(this.state==='atk' && this._seq){
        const cur=this._seq[this._idx]; if(!cur) return this.img('idle');
        if(cur.key==='aim1') return this.img('aim1');
        if(cur.key==='aim2') return this.img('aim2');
        return this.img('aim3');
      }
      if(this.state==='skill'){
        return (this._skillT<0.16)? this.img('jump') : this.img('jitter');
      }
      if(this.state==='ult'){
        if(this._ultPhase==='up') return this.img('ultUp');
        if(this._ultPhase==='fall') return this.img('ultFall');
        return this.img('ultDash');
      }
      if(!this.onGround) return this.img('w2');
      if(this.state==='run'){ const f=Math.floor(this.animT*6)%3; return [this.img('w1'), this.img('w2'), this.img('w3')][f]; }
      return this.img('idle');
    })();

    const ctx2=world.ctx; ctx2.save(); ctx2.translate(this.x-world.camX, this.y-world.camY);
    if(this.face<0) ctx2.scale(-1,1);
    if(img){
      const scale=this.h/img.height, w=img.width*scale, h=this.h;
      ctx2.imageSmoothingEnabled=false; ctx2.drawImage(img, Math.round(-w/2), Math.round(-h/2), Math.round(w), Math.round(h));
    }
    ctx2.restore(); this.drawHPBar(ctx2,world);

    // 弾
    for(const b of this.bullets) b.draw(world.ctx);
  }
}

/* =================================================
 * グレMOB HP100 近接（弱KB）
 * ================================================= */
class GreyMob extends CharacterBase{
  constructor(world,effects,assets,x=800){
    super(48,54);
    this.world=world; this.effects=effects; this.assets=assets;
    this.x=x; this.y=Math.floor(GROUND_TOP_Y)-this.h/2+FOOT_PAD; this.face=-1;
    this.maxhp=100; this.hp=100;
    this.cool=0; this.state='idle'; this.animT=0;
  }
  img(key){ const map={ idle:'tek1.png', w1:'tek1.png', w2:'tek2.png', atk:'tek3.png' }; return this.assets.img(map[key]||'tek1.png'); }
  update(dt,player){
    if(this.dead){ this.updatePhysics(dt); return; }
    if(this.cool>0) this.cool=Math.max(0,this.cool-dt);

    const dx=player.x-this.x, adx=Math.abs(dx); this.face=dx>=0?1:-1;
    if(adx>120){ this.vx=(dx>0? 90:-90); } else this.vx=0;

    if(this.cool<=0 && adx<140){
      this.state='atk'; this.animT=0; this.vx=this.face*200; this.cool=1.0;
    }

    if(this.state==='atk'){
      this.updatePhysics(dt);
      // 近接ヒット
      const hb={x:this.x + this.face*16, y:this.y, w:36, h:28};
      if(player.invulnT<=0 && rectsOverlap(hb, player.aabb())){
        const hit=player.hurt(10, this.face, {lift:0.2,kbMul:0.8,kbuMul:0.8}, this.effects);
        if(hit){ const fill=document.getElementById('hpfill'); const num=document.getElementById('hpnum'); if(fill&&num){ num.textContent=player.hp; fill.style.width=Math.max(0,Math.min(100,(player.hp/player.maxhp)*100))+'%'; } }
      }
      if(this.animT>0.3){ this.state='idle'; this.vx=0; }
      this.animT+=dt; return;
    }

    this.updatePhysics(dt);
    this.state=this.onGround? (Math.abs(this.vx)>1?'run':'idle') : 'jump';
    this.animT+=dt;
  }
  draw(ctx,world){
    ctx.save(); ctx.translate(this.x-world.camX, this.y-world.camY); if(this.face<0) ctx.scale(-1,1);
    let img=null;
    if(this.state==='atk') img=this.img('atk');
    else if(!this.onGround) img=this.img('w2');
    else img=(Math.floor(this.animT*6)%2? this.img('w1'):this.img('w2'));
    if(img){ const sc=this.h/img.height, w=img.width*sc, h=this.h; ctx.imageSmoothingEnabled=false; ctx.drawImage(img, Math.round(-w/2), Math.round(-h/2), Math.round(w), Math.round(h)); }
    ctx.restore(); this.drawHPBar(ctx,world);
  }
}

/* =================================================
 * MOBファイター HP200 10%ミニSA 突進＆スキル（CT5s）
 * ================================================= */
class MobFighter extends CharacterBase{
  constructor(world,effects,assets,x=1000){
    super(56,62);
    this.world=world; this.effects=effects; this.assets=assets;
    this.x=x; this.y=Math.floor(GROUND_TOP_Y)-this.h/2+FOOT_PAD; this.face=-1;
    this.maxhp=200; this.hp=200;
    this.cool=0; this.state='idle'; this.animT=0; this.skillCD=0;
  }
  aabb(){ return {x:this.x, y:this.y, w:this.w*0.7, h:this.h*0.95}; }
  img(key){ const m={ idle:'EN1-1.png', w1:'EN1-2.png', w2:'EN1-3.png', dash:'EN1-4.png', fin:'EN1-5.png', skill:'EN1-6.png' }; return this.assets.img(m[key]||'EN1-1.png'); }
  hurt(a,d,o,e){ return super.hurt(a,d,applyMiniSA(o,0.10),e); }
  update(dt,player){
    if(this.dead){ this.updatePhysics(dt); return; }
    if(this.cool>0) this.cool=Math.max(0,this.cool-dt);
    if(this.skillCD>0) this.skillCD=Math.max(0,this.skillCD-dt);

    const dx=player.x-this.x, adx=Math.abs(dx); this.face=dx>=0?1:-1;
    if(adx>130){ this.vx = (dx>0? MOVE : -MOVE); } else this.vx=0;

    // スキル優先（CT5s）
    if(this.skillCD<=0 && adx<260 && Math.random()<0.25){
      this.state='skill'; this.animT=0; this.vx=0; this.cool=1.4; this.skillCD=5.0;
      this._phase='charge'; this._t=0; return;
    }

    if(this.cool<=0 && adx<180){
      this.state='atk'; this.animT=0; this.vx=this.face*360; this.cool=1.1;
    }

    if(this.state==='atk'){
      this.updatePhysics(dt);
      const hb={x:this.x + this.face*20, y:this.y, w:48, h:36};
      if(player.invulnT<=0 && rectsOverlap(hb, player.aabb())){
        const hit=player.hurt(30, this.face, {lift:0.5,kbMul:1.0,kbuMul:1.0}, this.effects);
        if(hit){ const fill=document.getElementById('hpfill'); const num=document.getElementById('hpnum'); if(fill&&num){ num.textContent=player.hp; fill.style.width=Math.max(0,Math.min(100,(player.hp/player.maxhp)*100))+'%'; } }
      }
      if(this.animT>0.32){ this.state='idle'; this.vx=0; }
      this.animT+=dt; return;
    }

    if(this.state==='skill'){
      this._t += dt;
      if(this._phase==='charge'){
        this.vx=0; // EN1-4で2秒震える
        if(this._t>=2.0){ this._phase='jump'; this._t=0; this.vy=-JUMP_V*0.6; }
      }else if(this._phase==='jump'){
        if(this.onGround){ this._phase='strike'; this._t=0; }
      }else if(this._phase==='strike'){
        // EN1-6: 小ジャンプしながら当たり
        const hb={x:this.x + this.face*24, y:this.y, w:56, h:42};
        if(player.invulnT<=0 && rectsOverlap(hb, player.aabb())){
          const hit=player.hurt(50, this.face, {lift:0.9,kbMul:1.1,kbuMul:1.1}, this.effects);
          if(hit){ const fill=document.getElementById('hpfill'); const num=document.getElementById('hpnum'); if(fill&&num){ num.textContent=player.hp; fill.style.width=Math.max(0,Math.min(100,(player.hp/player.maxhp)*100))+'%'; } }
        }
        if(this._t>=0.28){ this.state='idle'; }
      }
      this.updatePhysics(dt); return;
    }

    this.updatePhysics(dt);
    this.state=this.onGround? (Math.abs(this.vx)>1?'run':'idle') : 'jump';
    this.animT+=dt;
  }
  draw(ctx,world){
    ctx.save(); ctx.translate(this.x-world.camX, this.y-world.camY); if(this.face<0) ctx.scale(-1,1);
    let img=null;
    if(this.state==='atk') img=this.img('dash');
    else if(this.state==='skill'){
      if(this._phase==='charge') img=this.img('dash');
      else if(this._phase==='jump') img=this.img('skill');
      else img=this.img('skill');
    }
    else if(!this.onGround) img=this.img('w2');
    else img=(Math.floor(this.animT*6)%2? this.img('w1'):this.img('w2'));
    if(img){ const sc=this.h/img.height, w=img.width*sc, h=this.h; ctx.imageSmoothingEnabled=false; ctx.drawImage(img, Math.round(-w/2), Math.round(-h/2), Math.round(w), Math.round(h)); }
    ctx.restore(); this.drawHPBar(ctx,world);
  }
}

/* =================================================
 * MOBヒャド HP350 10%ミニSA 遅足
 * ================================================= */
class MobHyado extends CharacterBase{
  constructor(world,effects,assets,x=1200){
    super(56,60);
    this.world=world; this.effects=effects; this.assets=assets;
    this.x=x; this.y=Math.floor(GROUND_TOP_Y)-this.h/2+FOOT_PAD; this.face=-1;
    this.maxhp=350; this.hp=350;
    this.cool=0; this.state='idle'; this.animT=0; this.skillCD=0;
    this.walk=70; // 遅め
  }
  img(k){ const m={ idle:'MY.png', w1:'MY1.png', w2:'MY2.png', atk1:'MY3.png', atk2:'MY4.png', s1:'MY5.png', s2:'MY6.png', s3:'MY7.png' }; return this.assets.img(m[k]||'MY.png'); }
  hurt(a,d,o,e){ return super.hurt(a,d,applyMiniSA(o,0.10),e); }
  update(dt,player){
    if(this.dead){ this.updatePhysics(dt); return; }
    if(this.cool>0) this.cool=Math.max(0,this.cool-dt);
    if(this.skillCD>0) this.skillCD=Math.max(0,this.skillCD-dt);

    const dx=player.x-this.x, adx=Math.abs(dx); this.face=dx>=0?1:-1;
    if(adx>130){ this.vx=(dx>0? this.walk : -this.walk); } else this.vx=0;

    // スキル（CT5s）
    if(this.skillCD<=0 && adx<260 && Math.random()<0.25){
      this.state='skill'; this.animT=0; this.vx=0; this.cool=1.4; this.skillCD=5.0;
      this._seq=[{dur:2.0,key:'s1'},{dur:0.18,key:'s2',hit:true,power:38,kb:{lift:0.9,kbMul:1.1,kbuMul:1.1}},{dur:0.18,key:'s3'}]; this._idx=0; return;
    }

    if(this.cool<=0 && adx<180){
      this.state='atk'; this.animT=0; this.vx=0; this.vy=-JUMP_V*0.45; this.cool=1.2;
    }

    if(this.state==='atk'){
      this.updatePhysics(dt);
      // 小ジャンプ中に当たり
      const hb={x:this.x + this.face*18, y:this.y, w:44, h:34};
      if(player.invulnT<=0 && rectsOverlap(hb, player.aabb())){
        const hit=player.hurt(33, this.face, {lift:0.6,kbMul:1.0,kbuMul:1.0}, this.effects);
        if(hit){ const fill=document.getElementById('hpfill'); const num=document.getElementById('hpnum'); if(fill&&num){ num.textContent=player.hp; fill.style.width=Math.max(0,Math.min(100,(player.hp/player.maxhp)*100))+'%'; } }
      }
      if(this.onGround && this.animT>0.3){ this.state='idle'; }
      this.animT+=dt; return;
    }

    if(this.state==='skill'){
      const cur=this._seq[this._idx];
      if(cur){
        cur._t=(cur._t||0)+dt;
        if(cur.hit){
          const hb={x:this.x + this.face*20, y:this.y, w:50, h:40};
          if(player.invulnT<=0 && rectsOverlap(hb, player.aabb())){
            const hit=player.hurt(cur.power, this.face, cur.kb, this.effects);
            if(hit){ const fill=document.getElementById('hpfill'); const num=document.getElementById('hpnum'); if(fill&&num){ num.textContent=player.hp; fill.style.width=Math.max(0,Math.min(100,(player.hp/player.maxhp)*100))+'%'; } }
          }
        }
        if(cur._t>=cur.dur){ this._idx++; if(this._idx>=this._seq.length){ this.state='idle'; this._seq=null; } }
      }
      this.updatePhysics(dt); return;
    }

    this.updatePhysics(dt);
    this.state=this.onGround? (Math.abs(this.vx)>1?'run':'idle') : 'jump';
    this.animT+=dt;
  }
  draw(ctx,world){
    ctx.save(); ctx.translate(this.x-world.camX, this.y-world.camY); if(this.face<0) ctx.scale(-1,1);
    let img=null;
    if(this.state==='atk') img=this.img('atk2');
    else if(this.state==='skill'){
      const cur=this._seq?.[this._idx]; img=this.img(cur?.key||'s1');
    }
    else if(!this.onGround) img=this.img('w2');
    else img=(Math.floor(this.animT*6)%2? this.img('w1'):this.img('w2'));
    if(img){ const sc=this.h/img.height, w=img.width*sc, h=this.h; ctx.imageSmoothingEnabled=false; ctx.drawImage(img, Math.round(-w/2), Math.round(-h/2), Math.round(w), Math.round(h)); }
    ctx.restore(); this.drawHPBar(ctx,world);
  }
}

/* =================================================
 * MOB段ボール HP50 超軽量（超吹っ飛ぶ）
 * ================================================= */
class MobCardboard extends CharacterBase{
  constructor(world,effects,assets,x=900){
    super(48,52);
    this.world=world; this.effects=effects; this.assets=assets;
    this.x=x; this.y=Math.floor(GROUND_TOP_Y)-this.h/2+FOOT_PAD; this.face=-1;
    this.maxhp=50; this.hp=50;
    this.cool=0; this.state='idle'; this.animT=0; this.walk=60;
  }
  img(k){ const m={ idle:'C1.png', w1:'C2.png', w2:'C3.png', atk:'C4.png' }; return this.assets.img(m[k]||'C1.png'); }
  // “超吹っ飛ぶ”＝被弾時にKBを大幅に増幅
  hurt(a,d,o,e){
    const kbMul = (o?.kbMul??1) * 2.4;
    const kbuMul= (o?.kbuMul??1) * 2.2;
    return super.hurt(a,d,{...(o||{}), kbMul, kbuMul}, e);
  }
  update(dt,player){
    if(this.dead){ this.updatePhysics(dt); return; }
    if(this.cool>0) this.cool=Math.max(0,this.cool-dt);

    const dx=player.x-this.x, adx=Math.abs(dx); this.face=dx>=0?1:-1;
    if(adx>140){ this.vx=(dx>0? this.walk : -this.walk); } else this.vx=0;

    if(this.cool<=0 && adx<160){
      this.state='atk'; this.animT=0; this.vx=this.face*160; this.cool=1.0;
    }

    if(this.state==='atk'){
      this.updatePhysics(dt);
      const hb={x:this.x + this.face*12, y:this.y, w:34, h:26};
      if(player.invulnT<=0 && rectsOverlap(hb, player.aabb())){
        const hit=player.hurt(20, this.face, {lift:0.2,kbMul:0.8,kbuMul:0.8}, this.effects);
        if(hit){ const fill=document.getElementById('hpfill'); const num=document.getElementById('hpnum'); if(fill&&num){ num.textContent=player.hp; fill.style.width=Math.max(0,Math.min(100,(player.hp/player.maxhp)*100))+'%'; } }
      }
      if(this.animT>0.24){ this.state='idle'; this.vx=0; }
      this.animT+=dt; return;
    }

    this.updatePhysics(dt);
    this.state=this.onGround? (Math.abs(this.vx)>1?'run':'idle') : 'jump';
    this.animT+=dt;
  }
  draw(ctx,world){
    ctx.save(); ctx.translate(this.x-world.camX, this.y-world.camY); if(this.face<0) ctx.scale(-1,1);
    let img=null;
    if(this.state==='atk') img=this.img('atk');
    else if(!this.onGround) img=this.img('w2');
    else img=(Math.floor(this.animT*6)%2? this.img('w1'):this.img('w2'));
    if(img){ const sc=this.h/img.height, w=img.width*sc, h=this.h; ctx.imageSmoothingEnabled=false; ctx.drawImage(img, Math.round(-w/2), Math.round(-h/2), Math.round(w), Math.round(h)); }
    ctx.restore(); this.drawHPBar(ctx,world);
  }
}

/* ------------------------------------------------
 * エクスポート
 * ------------------------------------------------ */
window.__Actors__ = Object.assign({}, window.__Actors__||{}, {
  MobNebu, GreyMob, MobFighter, MobHyado, MobCardboard
});

/* ------------------------------------------------
 * 便利：デバッグスポーン（既存ウェーブを壊さず試せる）
 * 例）spawnNebu(); spawnGrey(5); など
 * ------------------------------------------------ */
window.spawnNebu      = (x)=> { const G=window.__GameInstance__; if(!G) return; G.enemies.push(new MobNebu(G.world,G.effects,G.assets,x|| (G.world.camX+300))); };
window.spawnGrey      = (n=1)=> { const G=window.__GameInstance__; if(!G) return; for(let i=0;i<n;i++) G.enemies.push(new GreyMob(G.world,G.effects,G.assets,G.world.camX+260+i*40)); };
window.spawnFighter   = (n=1)=> { const G=window.__GameInstance__; if(!G) return; for(let i=0;i<n;i++) G.enemies.push(new MobFighter(G.world,G.effects,G.assets,G.world.camX+260+i*46)); };
window.spawnHyado     = (n=1)=> { const G=window.__GameInstance__; if(!G) return; for(let i=0;i<n;i++) G.enemies.push(new MobHyado(G.world,G.effects,G.assets,G.world.camX+280+i*46)); };
window.spawnCardboard = (n=1)=> { const G=window.__GameInstance__; if(!G) return; for(let i=0;i<n;i++) G.enemies.push(new MobCardboard(G.world,G.effects,G.assets,G.world.camX+220+i*36)); };

})();
