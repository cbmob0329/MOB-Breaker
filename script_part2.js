// script_part2.js – Rev33 FULL (Stable Restore) – Part2
(function(){
'use strict';

/*==========================================================
  依存：script_part1.js がロード済み（window.MOBGAME / emitter 等）
==========================================================*/
const G = window.MOBGAME;
if(!G){ console.error('Part1 (script_part1.js) が先に読み込まれていません。'); return; }
window.__PART2_READY__ = true;

/*==========================================================
  物理・数値（Part1に合わせた値をこちらでも使用）
==========================================================*/
const GRAV = 2000, MAX_FALL = 1200;

/* 現在のステージから地面Yを取得（Part1の World.bgName を参照） */
function groundY(){
  return (G.world.bgName==='CS.png') ? 360 : 437; // メモリの復帰ポイント準拠
}

/* AABB */
function overlap(a,b){
  return Math.abs(a.x-b.x)*2<(a.w+b.w) && Math.abs(a.y-b.y)*2<(a.h+b.h);
}

/*==========================================================
  ヒットボックス（ゲーム共通配列 G.hitboxes に格納）
==========================================================*/
function spawnHitboxFromEnemy(owner, opt){
  // opt: {x,y,w,h,dmg,dir,kb,kbu,life,tag}
  G.hitboxes.push({owner:'enemy', ...opt, _t:0, _from:owner});
}

/*==========================================================
  プロジェクタイル（弾）
==========================================================*/
class Projectile{
  constructor({x,y,vx,vy,w=18,h=12,dmg=120,kb=280,kbu=260,life=2,color='#9cf',owner=null}){
    this.x=x; this.y=y; this.vx=vx; this.vy=vy;
    this.w=w; this.h=h; this.dmg=dmg; this.kb=kb; this.kbu=kbu;
    this.life=life; this.t=0; this.owner=owner;
    this.dead=false; this.color=color;
  }
  aabb(){ return {x:this.x,y:this.y,w:this.w,h:this.h}; }
  update(dt){
    this.t+=dt; if(this.t>this.life) this.dead=true;
    this.x+=this.vx*dt; this.y+=this.vy*dt;
  }
  draw(ctx,world){
    ctx.save(); ctx.translate(this.x-world.camX, this.y-world.camY);
    ctx.fillStyle=this.color; ctx.fillRect(-this.w/2,-this.h/2,this.w,this.h);
    ctx.restore();
  }
}

/*==========================================================
  敵ベース
==========================================================*/
class Enemy{
  constructor({w,h,x,y,hp,speed=0,sa=false,color='#e46'}){
    this.w=w; this.h=h;
    this.x=x; this.y=y; this.vx=0; this.vy=0;
    this.hp=hp; this.maxhp=hp; this.dead=false; this.onGround=false;
    this.face=-1; this.speed=speed;
    this.superArmor=sa; this.invuln=0;
    this.aiT=0; this.cool=0;
    this.color=color;
    this.hitDisabledT=0; // のけぞりなどで移動抑制
  }
  aabb(){ return {x:this.x,y:this.y,w:this.w*0.6,h:this.h*0.8}; }
  center(){ return {x:this.x,y:this.y-this.h*0.1}; }

  physics(dt){
    // 単純地面
    const gy = groundY();
    this.vy = Math.min(this.vy + GRAV*dt, MAX_FALL);
    this.x  += this.vx*dt; this.y += this.vy*dt;

    if(this.y + this.h/2 >= gy){
      this.y = gy - this.h/2;
      this.vy = 0; this.onGround = true;
    }else{
      this.onGround = false;
    }
  }

  hurt(dmg,dir,{kb=300,kbu=240,breakArmor=false,invuln=0.15}={}){
    if(this.dead) return false;
    if(this.invuln>0) return false;
    if(this.superArmor && !breakArmor){
      // SA中は軽減＆ひるみ短縮
      dmg = Math.round(dmg*0.5);
      kb *= 0.4; kbu *= 0.4;
    }
    this.hp = Math.max(0, this.hp - dmg);
    this.vx = dir * kb;
    this.vy = -kbu;
    this.invuln = invuln;
    G.effects.addSpark(this.x, this.y-10, dmg>=40);
    if(this.hp<=0){ this.dead=true; }
    this.hitDisabledT = 0.12;
    return true;
  }

  update(dt){
    if(this.invuln>0) this.invuln=Math.max(0,this.invuln-dt);
    if(this.cool>0)   this.cool=Math.max(0,this.cool-dt);
    if(this.hitDisabledT>0)this.hitDisabledT=Math.max(0,this.hitDisabledT-dt);
    this.aiT += dt;
    // 物理は個別 update の最後で呼ぶこと
  }

  draw(ctx,world){
    ctx.save(); ctx.translate(this.x-world.camX, this.y-world.camY);
    ctx.fillStyle=this.color; ctx.fillRect(-this.w/2,-this.h/2,this.w,this.h);
    // HPバー
    const r=Math.max(0, Math.min(1, this.hp/this.maxhp));
    ctx.fillStyle='#06121f'; ctx.fillRect(-20,-this.h/2-10,40,4);
    ctx.fillStyle='#6cf'; ctx.fillRect(-20,-this.h/2-10,40*r,4);
    ctx.restore();
  }
}

/*==========================================================
  各敵AI
==========================================================*/
class WaruMOB extends Enemy{
  constructor(x){ super({w:52,h:60,x,y:groundY()-30,hp:100,speed:120,color:'#e46'}); }
  step(dt,player){
    const dir = (player.x<this.x)?-1:1; this.face=dir;
    if(this.hitDisabledT<=0) this.vx = dir*this.speed; else this.vx=0;
    // 近距離で軽打
    if(Math.abs(player.x-this.x)<54 && this.cool<=0){
      this.cool=0.6; // 攻撃間隔
      spawnHitboxFromEnemy(this,{
        x:this.x+this.face*24, y:this.y-8, w:28, h:24,
        dmg:60, dir:this.face, kb:240, kbu:180, life:0.08, tag:'WaruPunch'
      });
    }
  }
  update(dt,player){
    super.update(dt);
    this.step(dt,player);
    this.physics(dt);
  }
}

class GolemRobo extends Enemy{
  constructor(x){ super({w:60,h:68,x,y:groundY()-34,hp:800,speed:80,sa:true,color:'#b86'}); }
  step(dt,player){
    const dir=(player.x<this.x)?-1:1; this.face=dir;
    if(this.hitDisabledT<=0) this.vx=dir*this.speed; else this.vx=0;
    if(Math.abs(player.x-this.x)<70 && this.cool<=0){
      this.cool=1.0;
      spawnHitboxFromEnemy(this,{
        x:this.x+this.face*28, y:this.y-6, w:38, h:30,
        dmg:140, dir:this.face, kb:420, kbu:320, life:0.12, tag:'GolemSmash'
      });
      G.effects.addSpark(this.x,this.y-16,true);
    }
  }
  update(dt,player){ super.update(dt); this.step(dt,player); this.physics(dt); }
}

class IceRobo extends Enemy{
  constructor(x){ super({w:64,h:70,x,y:groundY()-35,hp:1200,speed:70,sa:false,color:'#6bd'}); }
  step(dt,player){
    const dir=(player.x<this.x)?-1:1; this.face=dir;
    const dist=Math.abs(player.x-this.x);
    if(this.hitDisabledT<=0){
      if(dist<200) this.vx = -dir*this.speed;
      else if(dist>260) this.vx = dir*this.speed;
      else this.vx=0;
    } else this.vx=0;
    if(this.cool<=0){
      this.cool=1.6;
      // 弾発射
      const vx=dir*260;
      const p=new Projectile({x:this.x+dir*30,y:this.y-16,vx,vy:0,dmg:140,kb:280,kbu:260,life:2,color:'#9cf',owner:this});
      G.enemies.push(p); // 描画兼用
      // 近接扱いのヒットは resolveHits 側で弾AABBとプレイヤー衝突判定
    }
  }
  update(dt,player){ super.update(dt); this.step(dt,player); this.physics(dt); }
}

class IceMini extends Enemy{
  constructor(x){ super({w:40,h:48,x,y:groundY()-24,hp:300,speed:160,color:'#8df'}); }
  step(dt,player){
    const dir=(player.x<this.x)?-1:1; this.face=dir;
    if(this.hitDisabledT<=0) this.vx=dir*this.speed; else this.vx=0;
    if(Math.abs(player.x-this.x)<46 && this.cool<=0){
      this.cool=0.5;
      spawnHitboxFromEnemy(this,{
        x:this.x+this.face*18, y:this.y-8, w:22, h:20,
        dmg:60, dir:this.face, kb:200, kbu:160, life:0.06, tag:'MiniClaw'
      });
    }
  }
  update(dt,player){ super.update(dt); this.step(dt,player); this.physics(dt); }
}

class GabKing extends Enemy{
  constructor(x){ super({w:70,h:80,x,y:groundY()-40,hp:2000,speed:70,sa:true,color:'#d55'}); }
  step(dt,player){
    const dir=(player.x<this.x)?-1:1; this.face=dir;
    if(this.hitDisabledT<=0) this.vx=dir*this.speed; else this.vx=0;
    if(Math.abs(player.x-this.x)<90 && this.cool<=0){
      this.cool=1.2;
      spawnHitboxFromEnemy(this,{
        x:this.x+this.face*30, y:this.y-12, w:40, h:30,
        dmg:180, dir:this.face, kb:460, kbu:320, life:0.12, tag:'Bite'
      });
      G.effects.addSpark(this.x+this.face*20,this.y-8,true);
    }
  }
  update(dt,player){ super.update(dt); this.step(dt,player); this.physics(dt); }
}

class GiantMOB extends Enemy{
  constructor(x){ super({w:90,h:100,x,y:groundY()-50,hp:2500,speed:50,sa:true,color:'#a54'}); }
  step(dt,player){
    const dir=(player.x<this.x)?-1:1; this.face=dir;
    if(this.hitDisabledT<=0) this.vx=dir*this.speed; else this.vx=0;
    if(Math.abs(player.x-this.x)<100 && this.cool<=0){
      this.cool=1.4;
      spawnHitboxFromEnemy(this,{
        x:this.x, y:this.y, w:66, h:30,
        dmg:220, dir:this.face, kb:520, kbu:360, life:0.14, tag:'Stamp'
      });
      G.effects.addSpark(this.x,this.y-10,true);
    }
  }
  update(dt,player){ super.update(dt); this.step(dt,player); this.physics(dt); }
}

class Shield extends Enemy{
  constructor(x){ super({w:60,h:64,x,y:groundY()-32,hp:600,speed:60,sa:false,color:'#7aa'}); this.blockT=0; }
  step(dt,player){
    this.blockT=Math.max(0,this.blockT-dt);
    const dir=(player.x<this.x)?-1:1; this.face=dir;
    if(this.blockT>0) this.vx=0;
    else if(this.hitDisabledT<=0) this.vx=dir*this.speed; else this.vx=0;

    if(Math.abs(player.x-this.x)<70 && this.blockT<=0 && this.cool<=0){
      // ガードポーズ（簡易SA）
      this.blockT=1.5; this.superArmor=true; this.cool=2.2;
      setTimeout(()=>{ this.superArmor=false; }, 1200);
    }
  }
  update(dt,player){ super.update(dt); this.step(dt,player); this.physics(dt); }
}

class Screw extends Enemy{
  constructor(x){ super({w:62,h:68,x,y:groundY()-34,hp:2000,speed:90,sa:false,color:'#fc5'}); this.state='chase'; this.spinT=0; }
  step(dt,player){
    const dir=(player.x<this.x)?-1:1; this.face=dir;

    if(this.state==='chase'){
      if(this.hitDisabledT<=0) this.vx=dir*this.speed; else this.vx=0;
      if(Math.abs(player.x-this.x)<220 && this.cool<=0){
        // 溜め
        this.state='charge'; this.spinT=0.5; this.vx=0;
        G.effects.addSpark(this.x,this.y-18,true);
      }
    }else if(this.state==='charge'){
      this.vx=0;
      this.spinT-=dt;
      if(this.spinT<=0){
        // スピン突進
        this.state='spin'; this.spinT=0.9; this.vx=this.face*540; this.superArmor=true;
      }
    }else if(this.state==='spin'){
      // 進行しつつ回転の攻撃判定をばら撒く
      this.spinT-=dt;
      spawnHitboxFromEnemy(this,{
        x:this.x+this.face*22, y:this.y-6, w:40, h:32,
        dmg:180, dir:this.face, kb:520, kbu:340, life:0.06, tag:'ScrewSpin'
      });
      if(this.spinT<=0){
        this.state='cool'; this.cool=1.4; this.vx=0; this.superArmor=false;
      }
    }else if(this.state==='cool'){
      this.vx=0; if(this.cool<=0) this.state='chase';
    }
  }
  update(dt,player){ super.update(dt); this.step(dt,player); this.physics(dt); }
}

/*==========================================================
  スポーン / ステージ開始
==========================================================*/
function spawnStageEnemies(stageName){
  // 既存の敵と弾をクリア
  G.enemies = G.enemies.filter(e=>e instanceof Projectile && !e.dead); // 念の為：弾のみ残しても良いが今回は全消し
  G.enemies.length = 0;

  // 並び（Rev33準拠）
  const Y = groundY();
  const list = [
    new WaruMOB(600),
    new GolemRobo(900),
    new IceRobo(1200),
    new IceMini(1350),
    new GabKing(1600),
    new GiantMOB(1800),
    new Shield(1900),
    new Screw(2000)
  ];
  // y は各コンストラクタで groundY() 基準にセット済み（ステージ切替直後なのでOK）
  G.enemies.push(...list);
}

/*==========================================================
  当たり判定の解決
==========================================================*/
function resolveHits(dt){
  // 1) 既存ヒットボックスの寿命処理
  for(const hb of G.hitboxes){ hb._t = (hb._t||0) + dt; }
  G.hitboxes = G.hitboxes.filter(hb => (hb.life==null) ? true : hb._t < hb.life);

  // 2) プレイヤー攻撃 → 敵
  const p = G.player;
  for(const hb of G.hitboxes){
    if(hb.owner!=='player') continue;
    const rect = {x:hb.x, y:hb.y, w:hb.w, h:hb.h};
    for(const e of G.enemies){
      if(e.dead || !(e instanceof Enemy)) continue;
      if(overlap(rect, e.aabb())){
        // 過多ヒット抑制（同一hbから連続で同敵に多段ヒットするのを簡易抑制）
        if(!hb._hitSet) hb._hitSet=new Set();
        if(hb._hitSet.has(e)) continue;
        hb._hitSet.add(e);

        e.hurt(hb.dmg, hb.dir||Math.sign(e.x-p.x), {
          kb:hb.kb, kbu:hb.kbu, breakArmor:!!hb.breakArmor, invuln:hb.invuln||0.12
        });
      }
    }
  }

  // 3) 敵攻撃/弾 → プレイヤー
  for(const hb of G.hitboxes){
    if(hb.owner!=='enemy') continue;
    const rect = {x:hb.x, y:hb.y, w:hb.w, h:hb.h};
    if(overlap(rect, p.aabb())){
      // 同HBからの多段抑制
      if(!hb._hitSet) hb._hitSet=new Set();
      if(!hb._hitSet.has(p)){
        hb._hitSet.add(p);
        const dir = hb.dir || Math.sign(p.x - hb.x);
        p.hurt(hb.dmg, dir, {kbMul:(hb.kb||300)/300, kbuMul:(hb.kbu||300)/300, ult:false}, G.effects);
      }
    }
  }

  // 4) 弾丸 → プレイヤー（プロジェクタイルは G.enemies にも入っている）
  for(const e of G.enemies){
    if(!(e instanceof Projectile) || e.dead) continue;
    if(overlap(e.aabb(), p.aabb())){
      const dir = Math.sign(p.x - e.x) || 1;
      p.hurt(e.dmg, dir, {kbMul:(e.kb||300)/300, kbuMul:(e.kbu||300)/300, ult:false}, G.effects);
      e.dead = true;
    }
  }

  // 5) 死体の掃除・弾の掃除
  G.enemies = G.enemies.filter(e=>{
    if(e instanceof Projectile) return !e.dead;
    return !e.dead;
  });
}

/*==========================================================
  毎フレーム更新（敵・弾）
==========================================================*/
function tickAll(dt){
  const player = G.player;
  for(const e of G.enemies){
    if(e instanceof Projectile){ e.update(dt); continue; }
    if(e.update) e.update(dt, player);
  }
}

/*==========================================================
  イベント購読（Part1 の Emitter 経由）
==========================================================*/
G.emitter.on('stageStart', ({stage})=>{
  // ステージ湧き
  spawnStageEnemies(stage);
  // MOBYOKI 初期位置は Part1 側で設定済み
  // 画面のバナー等は必要ならここで
});

G.emitter.on('tick', ({dt})=>{
  tickAll(dt);
});

G.emitter.on('resolveHits', ({dt})=>{
  resolveHits(dt);
});

/*==========================================================
  起動時：もしタイトルで「ST1」が既に選ばれていた場合にも、
  Part2ロード直後に整合を取っておく
==========================================================*/
if(document.getElementById('titleOverlay')?.classList.contains('hidden')){
  // 既にゲームが開始されていたら、現在の背景から推測して即スポーン
  spawnStageEnemies(G.world.bgName==='CS.png'?'CS':'ST1');
}

})();
