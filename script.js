// script.js (2/2)
// Enemies, World/Stage, Game bootstrap (ST1→室内→ボス→クリア)
(function(){
'use strict';

const {
  Effects, Assets, Input, CharacterBase,
  Projectile, EnergyBall, UltBlast, GroundSpike,
  Player,
  config, utils
} = window.__GamePieces__ || {};

const { clamp, lerp, now, rectsOverlap, bounds } = utils;

/* =========================================
 * 小UI: HP
 * ========================================= */
const updateHPUI=(hp,maxhp)=>{
  const fill=document.getElementById('hpfill');
  document.getElementById('hpnum').textContent=hp;
  fill.style.width=Math.max(0,Math.min(100,(hp/maxhp)*100))+'%';
};

/* =========================================
 * Enemy: WaruMOB（雑魚）
 * ========================================= */
class WaruMOB extends CharacterBase{
  constructor(world,effects,assets,x=520){
    super(52,60); this.world=world; this.effects=effects; this.assets=assets;
    this.x=x; this.y=Math.floor(bounds().GROUND_TOP_Y)-this.h/2+bounds().FOOT_PAD; this.face=-1; this.maxhp=100; this.hp=100;
    this.cool=0; this._seq=null; this._idx=0; this._t=0; this.projectiles=[];
    this.brainT=0; this.intent='patrol';
  }
  imgByKey(key){ const a=this.assets; const map={ idle:'teki1.png', walk1:'teki1.png', walk2:'teki2.png', prep1:'teki1.png', prep2:'teki3.png' }; return a.img(map[key]||'teki1.png'); }
  addBullet(){ const img=this.assets.img('teki7.png'); const ox=this.face*28; const oy=-8; this.projectiles.push(new Projectile(this.world,this.x+ox,this.y+oy,this.face,img,10)); }
  aabb(){ return {x:this.x, y:this.y, w:this.w*0.6, h:this.h*0.85}; }
  hurt(amount, dir, opts={}, effects){ opts = {...opts, kbMul:(opts.kbMul??1)*1.25, kbuMul:(opts.kbuMul??1)*1.2}; return super.hurt(amount, dir, opts, effects); }
  update(dt,player){
    if(this.dead){ this.updatePhysics(dt); return; }
    for(const p of this.projectiles) p.update(dt); this.projectiles=this.projectiles.filter(p=>!p.dead);
    if(this.cool>0) this.cool=Math.max(0,this.cool-dt);

    this.brainT-=dt;
    if(this.brainT<=0){
      this.brainT=0.4+Math.random()*0.2;
      const dx=player.x-this.x, adx=Math.abs(dx);
      this.face = dx>=0?1:-1;
      if(adx<110) this.intent = Math.random()<0.55 ? 'backstep' : 'strafe';
      else if(adx<220) this.intent = Math.random()<0.5 ? 'strafe' : 'shoot';
      else this.intent = 'approach';
    }

    if(this.state==='atk'){
      this.updatePhysics(dt); if(this._seq){
        this._t+=dt; const cur=this._seq[this._idx];
        if(cur && this._t>=cur.dur){
          this._idx++; this._t=0;
          if(this._idx===2){ this.addBullet(); }
          if(this._idx>=this._seq.length){ this._seq=null; this.state='idle'; }
        }
      }
      this.animT+=dt; return;
    }

    const dx=player.x-this.x, adx=Math.abs(dx), dir = dx>=0?1:-1;
    let targetVX=0;
    if(this.intent==='approach') targetVX = dir*90;
    else if(this.intent==='backstep') targetVX = -dir*120;
    else if(this.intent==='strafe'){ const s=(Math.sin(performance.now()/300)+1)/2; targetVX = dir*(60 + s*60) * (Math.random()<0.5?1:-1); }
    else if(this.intent==='shoot'){ targetVX = 0; if(this.cool<=0){ this._seq=[{kind:'pose',dur:0.22,key:'prep1'},{kind:'pose',dur:0.26,key:'prep2'}]; this.cool=2.2+Math.random()*0.8; this.state='atk'; this._idx=0; this._t=0; this.vx=0; this.animT=0; return; } }

    if(adx<180 && this.cool<=0 && Math.random()<0.25){ this._seq=[{kind:'pose',dur:0.22,key:'prep1'},{kind:'pose',dur:0.26,key:'prep2'}]; this.cool=2.4+Math.random()*1.0; this.state='atk'; this._idx=0; this._t=0; this.vx=0; this.animT=0; return; }

    this.vx=targetVX;
    this.updatePhysics(dt);
    this.state=!this.onGround?'jump':(Math.abs(this.vx)>1?'run':'idle');
    this.animT+=dt;
  }
  draw(ctx,world){
    ctx.save(); ctx.translate(this.x-world.camX, this.y-world.camY);
    if(this.dead){ ctx.globalAlpha=this.fade; ctx.rotate(this.spinAngle); }
    if(this.spinT>0 && !this.dead){ ctx.rotate(this.spinAngle); }
    if(this.face<0 && !this.dead) ctx.scale(-1,1);
    let img=null;
    if(this.state==='atk' && this._seq){ const cur=this._seq[this._idx]; img=this.imgByKey(cur.key||'prep2'); }
    else if(this.state==='run'){ const f=Math.floor(this.animT*6)%2; img=this.imgByKey(f? 'walk1':'walk2'); }
    else { img=this.imgByKey('idle'); }
    if(img){ const scale=this.h/img.height, w=img.width*scale, h=this.h; ctx.imageSmoothingEnabled=false; ctx.drawImage(img, Math.round(-w/2), Math.round(-h/2), Math.round(w), Math.round(h)); }
    ctx.restore(); this.drawHPBar(ctx,world);
    for(const p of this.projectiles) p.draw(ctx);
  }
}

/* =========================================
 * Enemy: MOB Screw（ボス 2000HP版）
 * ========================================= */
class Screw extends CharacterBase{
  constructor(world,effects,assets,x=220){
    super(62,68);
    this.world=world; this.effects=effects; this.assets=assets;
    this.x=x; this.y=Math.floor(bounds().GROUND_TOP_Y)-this.h/2+bounds().FOOT_PAD; this.face=-1;
    this.maxhp=2000; this.hp=2000;
    this.cool=0; this.state='idle'; this.animT=0; this._seq=null; this._idx=0; this._t=0;
    this.brainT=0;
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
    const proc = Math.random()<0.30;
    if(proc){
      opts={...(opts||{}), kbMul:0.40, kbuMul:0.38};
      const hit = CharacterBase.prototype.hurt.call(this,amount,dir,opts,effects);
      if(hit){ this.state='idle'; }
      return hit;
    }
    return CharacterBase.prototype.hurt.call(this,amount,dir,opts,effects);
  }
  update(dt, player){
    if(this.dead){ this.updatePhysics(dt); return; }
    if(this.cool>0) this.cool=Math.max(0,this.cool-dt);

    if(this._seq){
      this.updatePhysics(dt); this._t+=dt; const cur=this._seq[this._idx];
      if(cur?.fx){ this.x += this.face * cur.fx * dt; }
      if(cur?.hit){
        const hb={x:this.x + this.face*cur.hx, y:this.y, w:cur.hw, h:cur.hh};
        if(player.invulnT<=0 && rectsOverlap(hb, player.aabb())){
          const hit=player.hurt(cur.power, this.face, {lift:cur.lift,kbMul:cur.kbm,kbuMul:cur.kbum}, this.effects);
          if(hit) updateHPUI(player.hp,player.maxhp);
        }
      }
      if(this._t>=cur.dur){ this._idx++; this._t=0; if(this._idx>=this._seq.length){ this._seq=null; this.state='idle'; this.vx=0; } }
      this.animT+=dt; return;
    }

    this.brainT-=dt;
    if(this.brainT<=0){
      this.brainT=0.25+Math.random()*0.1;
      const dx=player.x-this.x, adx=Math.abs(dx); this.face=dx>=0?1:-1;
      if(adx>200) this.intent='dashApproach';
      else if(adx>140) this.intent = Math.random()<0.6 ? 'dashApproach' : 'melee';
      else this.intent = Math.random()<0.5 ? 'melee' : 'skill';
    }

    const dx=player.x-this.x; const adx=Math.abs(dx); this.face=dx>=0?1:-1;

    if(this.cool<=0){
      if(this.intent==='melee' && adx<150){
        if(Math.random()<0.55){
          this.state='atk'; this._seq=[
            {dur:0.10, key:'a1a', fx:140},
            {dur:0.16, key:'a1b', fx:190, hit:true, hx:20, hw:44, hh:36, power:30, lift:0.4, kbm:0.9, kbum:0.9}
          ]; this.cool=0.9+Math.random()*0.5;
        }else{
          this.state='atk'; this._seq=[
            {dur:0.10, key:'a2a', fx:160},
            {dur:0.18, key:'a2b', fx:220, hit:true, hx:22, hw:48, hh:38, power:35, lift:0.6, kbm:1.0, kbum:1.0}
          ]; this.cool=1.2+Math.random()*0.6;
        }
        this._idx=0; this._t=0; this.animT=0; return;
      }
      if(this.intent==='skill' && adx<320){
        this.state='skill';
        this._seq=[
          {dur:0.46, key:'sPrep', fx:0},
          {dur:0.20, key:'s1', fx:540, hit:true, hx:22, hw:56, hh:40, power:50, lift:0.5, kbm:0.95, kbum:0.95},
          {dur:0.14, key:'s2', fx:420, hit:true, hx:20, hw:44, hh:36, power:22, lift:0.3, kbm:0.9, kbum:0.9},
          {dur:0.20, key:'s3', fx:560, hit:true, hx:24, hw:58, hh:42, power:52, lift:1.0, kbm:1.05, kbum:1.05}
        ];
        this.cool=3.6+Math.random()*0.8;
        this._idx=0; this._t=0; this.animT=0; return;
      }
      if(this.intent==='dashApproach' && adx<360 && Math.random()<0.7){
        this.state='ult';
        this._seq=[
          {dur:0.40, key:'uPrep', fx:0},
          {dur:0.24, key:'uDash', fx:620},
          {dur:0.20, key:'uFin',  fx:0, hit:true, hx:26, hw:64, hh:50, power:120, lift:1.4, kbm:1.2, kbum:1.2}
        ];
        this.cool=8.0+Math.random()*3.0;
        this._idx=0; this._t=0; this.animT=0; return;
      }
    }

    if(this.intent==='dashApproach'){ this.vx = (dx>0? bounds().MOVE : -bounds().MOVE); }
    else { this.vx = (Math.sin(performance.now()/300))*40; }
    this.updatePhysics(dt);
    this.state = !this.onGround ? 'jump' : (Math.abs(this.vx)>1? 'run':'idle');
    this.animT+=dt;
  }
  draw(ctx,world){
    ctx.save(); ctx.translate(this.x-world.camX, this.y-world.camY);
    if(this.dead){ ctx.globalAlpha=this.fade; ctx.rotate(this.spinAngle); }
    if(this.spinT>0 && !this.dead){ ctx.rotate(this.spinAngle); }
    if(this.face<0 && !this.dead) ctx.scale(-1,1);
    let img=null;
    if(this._seq){ const cur=this._seq[this._idx]; img=this.img(cur?.key||'idle'); }
    else if(!this.onGround){ img=this.img('jump'); }
    else if(this.state==='run'){ const f=Math.floor(this.animT*6)%2; img=this.img(f?'w1':'w2'); }
    else img=this.img('idle');
    if(img){ const scale=this.h/img.height, w=img.width*scale, h=this.h; ctx.imageSmoothingEnabled=false; ctx.drawImage(img, Math.round(-w/2), Math.round(-h/2), Math.round(w), Math.round(h)); }
    ctx.restore(); this.drawHPBar(ctx,world);
  }
}

/* =========================================
 * World（背景1枚表示 / 非ループ対応・ズーム&バナー）
 * ========================================= */
class World{
  constructor(assets, canvas, effects){
    this.assets=assets; this.effects=effects; this.canvas=canvas;
    this.ctx=canvas.getContext('2d',{alpha:true}); this.ctx.imageSmoothingEnabled=false;
    this.gameW=canvas.width; this.gameH=canvas.height; this.camX=0; this.camY=0; this.time=0; this._timerAcc=0;

    const r=this.canvas.getBoundingClientRect(); this.screenScaleX=r.width/this.gameW; this.screenScaleY=r.height/this.gameH;

    this.bgImg=null; this.bgKind='single'; // 'single' only
    this.zoom=1;
    this._buildBanner();
  }
  _buildBanner(){
    const wrap=document.querySelector('.gamewrap');
    const msg=document.createElement('div');
    msg.style.position='absolute';
    msg.style.left='50%'; msg.style.top='20%';
    msg.style.transform='translate(-50%,-50%)';
    msg.style.padding='12px 16px';
    msg.style.background='rgba(11,15,23,0.85)';
    msg.style.border='1px solid #263147';
    msg.style.borderRadius='12px';
    msg.style.fontWeight='800';
    msg.style.fontSize='20px';
    msg.style.display='none';
    wrap.appendChild(msg);
    this.banner=msg;
  }
  showBanner(text, ms=1000){
    if(!this.banner) return;
    this.banner.textContent=text;
    this.banner.style.display='block';
    setTimeout(()=>{ this.banner.style.display='none'; }, ms);
  }
  setZoomAround(x, y, z=1.0){
    this.zoom = z;
    this._zoomPivot = {x, y};
  }
  resize(){ const r=this.canvas.getBoundingClientRect(); this.screenScaleX=r.width/this.gameW; this.screenScaleY=r.height/this.gameH; }
  setBackground(img){ this.bgImg = this.assets.img(img)||null; }

  updateCam(p){
    // ステージは1画面固定：カメラは原則0固定 + シェイクのみ
    const offs=this.effects.getCamOffset();
    this.camX = 0 + offs.x;
    this.camY = 0 + offs.y;
  }
  updateTimer(dt){
    this._timerAcc+=dt; if(this._timerAcc>=0.2){ this.time+=this._timerAcc; this._timerAcc=0;
      const t=Math.floor(this.time); const mm=String(Math.floor(t/60)).padStart(2,'0'); const ss=String(t%60).padStart(2,'0'); document.getElementById('time').textContent=`${mm}:${ss}`; }
  }
  draw(player, enemies){
    const ctx=this.ctx;
    ctx.save();
    // ★ ズーム（プレイヤー中心）
    if(this.zoom!==1 && this._zoomPivot){
      const px = this._zoomPivot.x - this.camX;
      const py = this._zoomPivot.y - this.camY;
      ctx.translate(px, py); ctx.scale(this.zoom, this.zoom); ctx.translate(-px, -py);
    }

    ctx.clearRect(0,0,this.gameW,this.gameH);
    if(this.bgImg){
      // 高さフィット・中央クロップ
      const scale = this.gameH / this.bgImg.height;
      const dw = Math.round(this.bgImg.width * scale);
      const dh = this.gameH;
      const sx = 0, sy = 0, sw = this.bgImg.width, sh = this.bgImg.height;
      const dx = Math.round((this.gameW - dw)/2);
      ctx.drawImage(this.bgImg, sx, sy, sw, sh, dx, 0, dw, dh);
    } else {
      const g=ctx.createLinearGradient(0,0,0,this.gameH); g.addColorStop(0,'#0a1230'); g.addColorStop(1,'#0a0f18'); ctx.fillStyle=g; ctx.fillRect(0,0,this.gameW,this.gameH);
    }
    // 地面ライン
    ctx.fillStyle='#0b0f17'; const yTop=Math.floor(bounds().GROUND_TOP_Y); ctx.fillRect(0,yTop-1,this.gameW,1);

    if(this._skillBullets){ for(const p of this._skillBullets) p.draw(ctx); }
    for(const e of enemies) e.draw(ctx,this);
    player.draw(ctx,this);
    this.effects.draw(ctx,this);

    ctx.restore();
  }
}

/* =========================================
 * スポーンユーティリティ（安全距離/間隔）
 * ========================================= */
function pickSpawnX(playerX, exists, w=420){
  const safeFromPlayer = 140;
  const minGapBetween  = 70;
  for(let k=0;k<40;k++){
    const x = 60 + Math.random()*(w-120);
    if(Math.abs(x - playerX) < safeFromPlayer) continue;
    let ok=true;
    for(const e of exists){ if(Math.abs(x - e.x) < minGapBetween){ ok=false; break; } }
    if(ok) return x;
  }
  return Math.random()*(w-120)+60;
}

/* =========================================
 * Game（ステージ1：入口→室内→スクリュー→クリア）
 * ========================================= */
class Game{
  constructor(){
    this.assets=new Assets(); this.canvas=document.getElementById('game'); this.input=new Input(); this.effects=new Effects();
    this.player=null; this.enemies=[]; this.world=null; this.lastT=0;
    this.state='st1'; // 'st1', 'room', 'boss', 'clear'
    this.killCount=0; this.targetKills=15; // ST1
    addEventListener('resize',()=>this.world?.resize());
  }
  async start(){
    const imgs=[
      /* 背景 */
      'ST1.png','CS.png',
      /* Player */
      'M1-1.png','M1-2.png','M1-3.png','M1-4.png',
      'K1-1.png','K1-2.png','K1-3.png','K1-4.png','K1-5.png',
      'h1.png','h2.png','h3.png','h4.png',
      'J.png',
      'Y1.png','Y2.png','Y3.png','Y4.png',
      'UL1.PNG','UL2.PNG','UL3.png',
      'kem.png',
      /* Enemies */
      'teki1.png','teki2.png','teki3.png','teki7.png',
      'B1.png','B2.png','B3.png','B4.png','B5.png','B6.png','B7.png','B8.png','B9.png','B10.png','B11.png','B12.png','B13.png','B14.png'
    ];
    await this.assets.load(imgs);
    this.world=new World(this.assets,this.canvas,this.effects);
    // ステージ共通の境界（1画面）
    config.STAGE_LEFT=0; config.STAGE_RIGHT=this.canvas.width; config.GROUND_TOP_Y=437;
    this.world.setBackground('ST1.png');

    this.player=new Player(this.assets,this.world,this.effects);
    updateHPUI(this.player.hp,this.player.maxhp);

    this._spawnWaruPack(3); // 入口：まず3体
    this.lastT=now();
    const loop=()=>{ this._tick(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  _spawnWaruPack(n=3){
    const pack=[];
    for(let i=0;i<n;i++){
      const x=pickSpawnX(this.player.x, pack, this.canvas.width);
      pack.push(new WaruMOB(this.world,this.effects,this.assets,x));
    }
    this.enemies.push(...pack);
  }
  _enterRoom(){
    // 室内へ
    this.state='room'; this.killCount=0; this.targetKills=10;
    this.enemies.length=0;
    this.world.setBackground('CS.png');
    // 左端スポーン
    this.player.x = 60; this.player.y=Math.floor(bounds().GROUND_TOP_Y)-this.player.h/2+bounds().FOOT_PAD;
    // すぐ3体
    this._spawnWaruPack(3);
  }
  _spawnBoss(){
    this.state='boss'; this.enemies.length=0;
    // 落下演出
    this.effects.shake(0.25, 10); // “中”の強さ
    this.world.showBanner('MOBスクリュー登場！', 1000);
    // 天から降って来る
    const boss = new Screw(this.world,this.effects,this.assets, this.canvas.width/2);
    boss.y = -200; boss.vy = 900;
    this.enemies.push(boss);
  }
  _stageClear(){
    this.state='clear';
    this.world.showBanner('ステージクリア!!', 2000);
    // プレイヤーにズーム（2秒）
    this.world.setZoomAround(this.player.x, this.player.y, 1.25);
    setTimeout(()=>{ this.world.setZoomAround(this.player.x, this.player.y, 1.0); location.reload(); }, 2000);
  }

  _tick(){
    const t=now(); let dt=(t-this.lastT)/1000; if(dt>0.05) dt=0.05; this.lastT=t;

    if(this.effects.hitstop>0){
      this.effects.update(dt); this.world.updateCam(this.player); this.world.draw(this.player,this.enemies);
      return;
    }

    // Player
    this.player.update(dt,this.input,this.world,this.enemies);

    // Enemies + 当たり
    for(const e of this.enemies){
      e.update(dt,this.player);

      // 接触・射撃
      if(e instanceof WaruMOB){
        for(const p of e.projectiles){
          if(!p.dead && this.player.invulnT<=0 && rectsOverlap(p.aabb(), this.player.aabb())){
            p.dead=true; const hit=this.player.hurt(p.power, p.dir, {lift:0, kbMul:0.55, kbuMul:0.5}, this.effects);
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
            const tag = (p instanceof UltBlast)? 'ult' : 'skill1';
            const hit=e.hurt(p.power, dir, {lift:0.3,kbMul:0.9,kbuMul:0.9, tag}, this.effects);
            if(hit) this.effects.addSpark(e.x, e.y-10, p.power>=40);
          }
        }
      }
      this.world._skillBullets = this.world._skillBullets.filter(p=>!p.dead && p.life>0);
    }

    // 撃破整理 & キルカウント
    const before=this.enemies.length;
    this.enemies=this.enemies.filter(e=>!(e.dead && e.fade<=0));
    const removed = before - this.enemies.length;
    if(removed>0){
      this.killCount += removed;
      // 次の湧き
      if(this.state==='st1' && this.killCount < this.targetKills && this.enemies.filter(e=>e instanceof WaruMOB).length<3){
        this._spawnWaruPack(Math.min(3, this.targetKills - this.killCount));
      }
      if(this.state==='room' && this.killCount < this.targetKills && this.enemies.filter(e=>e instanceof WaruMOB).length<3){
        this._spawnWaruPack(Math.min(3, this.targetKills - this.killCount));
      }
    }

    // 進行管理
    if(this.state==='st1' && this.killCount>=this.targetKills && this.enemies.length===0){
      this._enterRoom();
    } else if(this.state==='room' && this.killCount>=this.targetKills && this.enemies.length===0){
      this._spawnBoss();
    } else if(this.state==='boss'){
      const bossAlive = this.enemies.some(e=>e instanceof Screw && !e.dead);
      if(!bossAlive && this.enemies.length===0){
        this._stageClear();
      }
    }

    // のめり込み解消（強め）
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
        this.player.x += dirX * overlapX * 0.65;
        e.x           -= dirX * overlapX * 0.35;
        this.player.vx += dirX * 30;
        e.vx          -= dirX * 30;
      }
    }

    this.effects.update(dt); this.world.updateCam(this.player); this.world.updateTimer(dt); this.world.draw(this.player,this.enemies);
  }
}

/* =========================================
 * Boot
 * ========================================= */
new Game().start();

})();
// script.js (2/2)
// Enemies, World/Stage, Game bootstrap (ST1→室内→ボス→クリア)
(function(){
'use strict';

const {
  Effects, Assets, Input, CharacterBase,
  Projectile, EnergyBall, UltBlast, GroundSpike,
  Player,
  config, utils
} = window.__GamePieces__ || {};

const { clamp, lerp, now, rectsOverlap, bounds } = utils;

/* =========================================
 * 小UI: HP
 * ========================================= */
const updateHPUI=(hp,maxhp)=>{
  const fill=document.getElementById('hpfill');
  document.getElementById('hpnum').textContent=hp;
  fill.style.width=Math.max(0,Math.min(100,(hp/maxhp)*100))+'%';
};

/* =========================================
 * Enemy: WaruMOB（雑魚）
 * ========================================= */
class WaruMOB extends CharacterBase{
  constructor(world,effects,assets,x=520){
    super(52,60); this.world=world; this.effects=effects; this.assets=assets;
    this.x=x; this.y=Math.floor(bounds().GROUND_TOP_Y)-this.h/2+bounds().FOOT_PAD; this.face=-1; this.maxhp=100; this.hp=100;
    this.cool=0; this._seq=null; this._idx=0; this._t=0; this.projectiles=[];
    this.brainT=0; this.intent='patrol';
  }
  imgByKey(key){ const a=this.assets; const map={ idle:'teki1.png', walk1:'teki1.png', walk2:'teki2.png', prep1:'teki1.png', prep2:'teki3.png' }; return a.img(map[key]||'teki1.png'); }
  addBullet(){ const img=this.assets.img('teki7.png'); const ox=this.face*28; const oy=-8; this.projectiles.push(new Projectile(this.world,this.x+ox,this.y+oy,this.face,img,10)); }
  aabb(){ return {x:this.x, y:this.y, w:this.w*0.6, h:this.h*0.85}; }
  hurt(amount, dir, opts={}, effects){ opts = {...opts, kbMul:(opts.kbMul??1)*1.25, kbuMul:(opts.kbuMul??1)*1.2}; return super.hurt(amount, dir, opts, effects); }
  update(dt,player){
    if(this.dead){ this.updatePhysics(dt); return; }
    for(const p of this.projectiles) p.update(dt); this.projectiles=this.projectiles.filter(p=>!p.dead);
    if(this.cool>0) this.cool=Math.max(0,this.cool-dt);

    this.brainT-=dt;
    if(this.brainT<=0){
      this.brainT=0.4+Math.random()*0.2;
      const dx=player.x-this.x, adx=Math.abs(dx);
      this.face = dx>=0?1:-1;
      if(adx<110) this.intent = Math.random()<0.55 ? 'backstep' : 'strafe';
      else if(adx<220) this.intent = Math.random()<0.5 ? 'strafe' : 'shoot';
      else this.intent = 'approach';
    }

    if(this.state==='atk'){
      this.updatePhysics(dt); if(this._seq){
        this._t+=dt; const cur=this._seq[this._idx];
        if(cur && this._t>=cur.dur){
          this._idx++; this._t=0;
          if(this._idx===2){ this.addBullet(); }
          if(this._idx>=this._seq.length){ this._seq=null; this.state='idle'; }
        }
      }
      this.animT+=dt; return;
    }

    const dx=player.x-this.x, adx=Math.abs(dx), dir = dx>=0?1:-1;
    let targetVX=0;
    if(this.intent==='approach') targetVX = dir*90;
    else if(this.intent==='backstep') targetVX = -dir*120;
    else if(this.intent==='strafe'){ const s=(Math.sin(performance.now()/300)+1)/2; targetVX = dir*(60 + s*60) * (Math.random()<0.5?1:-1); }
    else if(this.intent==='shoot'){ targetVX = 0; if(this.cool<=0){ this._seq=[{kind:'pose',dur:0.22,key:'prep1'},{kind:'pose',dur:0.26,key:'prep2'}]; this.cool=2.2+Math.random()*0.8; this.state='atk'; this._idx=0; this._t=0; this.vx=0; this.animT=0; return; } }

    if(adx<180 && this.cool<=0 && Math.random()<0.25){ this._seq=[{kind:'pose',dur:0.22,key:'prep1'},{kind:'pose',dur:0.26,key:'prep2'}]; this.cool=2.4+Math.random()*1.0; this.state='atk'; this._idx=0; this._t=0; this.vx=0; this.animT=0; return; }

    this.vx=targetVX;
    this.updatePhysics(dt);
    this.state=!this.onGround?'jump':(Math.abs(this.vx)>1?'run':'idle');
    this.animT+=dt;
  }
  draw(ctx,world){
    ctx.save(); ctx.translate(this.x-world.camX, this.y-world.camY);
    if(this.dead){ ctx.globalAlpha=this.fade; ctx.rotate(this.spinAngle); }
    if(this.spinT>0 && !this.dead){ ctx.rotate(this.spinAngle); }
    if(this.face<0 && !this.dead) ctx.scale(-1,1);
    let img=null;
    if(this.state==='atk' && this._seq){ const cur=this._seq[this._idx]; img=this.imgByKey(cur.key||'prep2'); }
    else if(this.state==='run'){ const f=Math.floor(this.animT*6)%2; img=this.imgByKey(f? 'walk1':'walk2'); }
    else { img=this.imgByKey('idle'); }
    if(img){ const scale=this.h/img.height, w=img.width*scale, h=this.h; ctx.imageSmoothingEnabled=false; ctx.drawImage(img, Math.round(-w/2), Math.round(-h/2), Math.round(w), Math.round(h)); }
    ctx.restore(); this.drawHPBar(ctx,world);
    for(const p of this.projectiles) p.draw(ctx);
  }
}

/* =========================================
 * Enemy: MOB Screw（ボス 2000HP版）
 * ========================================= */
class Screw extends CharacterBase{
  constructor(world,effects,assets,x=220){
    super(62,68);
    this.world=world; this.effects=effects; this.assets=assets;
    this.x=x; this.y=Math.floor(bounds().GROUND_TOP_Y)-this.h/2+bounds().FOOT_PAD; this.face=-1;
    this.maxhp=2000; this.hp=2000;
    this.cool=0; this.state='idle'; this.animT=0; this._seq=null; this._idx=0; this._t=0;
    this.brainT=0;
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
    const proc = Math.random()<0.30;
    if(proc){
      opts={...(opts||{}), kbMul:0.40, kbuMul:0.38};
      const hit = CharacterBase.prototype.hurt.call(this,amount,dir,opts,effects);
      if(hit){ this.state='idle'; }
      return hit;
    }
    return CharacterBase.prototype.hurt.call(this,amount,dir,opts,effects);
  }
  update(dt, player){
    if(this.dead){ this.updatePhysics(dt); return; }
    if(this.cool>0) this.cool=Math.max(0,this.cool-dt);

    if(this._seq){
      this.updatePhysics(dt); this._t+=dt; const cur=this._seq[this._idx];
      if(cur?.fx){ this.x += this.face * cur.fx * dt; }
      if(cur?.hit){
        const hb={x:this.x + this.face*cur.hx, y:this.y, w:cur.hw, h:cur.hh};
        if(player.invulnT<=0 && rectsOverlap(hb, player.aabb())){
          const hit=player.hurt(cur.power, this.face, {lift:cur.lift,kbMul:cur.kbm,kbuMul:cur.kbum}, this.effects);
          if(hit) updateHPUI(player.hp,player.maxhp);
        }
      }
      if(this._t>=cur.dur){ this._idx++; this._t=0; if(this._idx>=this._seq.length){ this._seq=null; this.state='idle'; this.vx=0; } }
      this.animT+=dt; return;
    }

    this.brainT-=dt;
    if(this.brainT<=0){
      this.brainT=0.25+Math.random()*0.1;
      const dx=player.x-this.x, adx=Math.abs(dx); this.face=dx>=0?1:-1;
      if(adx>200) this.intent='dashApproach';
      else if(adx>140) this.intent = Math.random()<0.6 ? 'dashApproach' : 'melee';
      else this.intent = Math.random()<0.5 ? 'melee' : 'skill';
    }

    const dx=player.x-this.x; const adx=Math.abs(dx); this.face=dx>=0?1:-1;

    if(this.cool<=0){
      if(this.intent==='melee' && adx<150){
        if(Math.random()<0.55){
          this.state='atk'; this._seq=[
            {dur:0.10, key:'a1a', fx:140},
            {dur:0.16, key:'a1b', fx:190, hit:true, hx:20, hw:44, hh:36, power:30, lift:0.4, kbm:0.9, kbum:0.9}
          ]; this.cool=0.9+Math.random()*0.5;
        }else{
          this.state='atk'; this._seq=[
            {dur:0.10, key:'a2a', fx:160},
            {dur:0.18, key:'a2b', fx:220, hit:true, hx:22, hw:48, hh:38, power:35, lift:0.6, kbm:1.0, kbum:1.0}
          ]; this.cool=1.2+Math.random()*0.6;
        }
        this._idx=0; this._t=0; this.animT=0; return;
      }
      if(this.intent==='skill' && adx<320){
        this.state='skill';
        this._seq=[
          {dur:0.46, key:'sPrep', fx:0},
          {dur:0.20, key:'s1', fx:540, hit:true, hx:22, hw:56, hh:40, power:50, lift:0.5, kbm:0.95, kbum:0.95},
          {dur:0.14, key:'s2', fx:420, hit:true, hx:20, hw:44, hh:36, power:22, lift:0.3, kbm:0.9, kbum:0.9},
          {dur:0.20, key:'s3', fx:560, hit:true, hx:24, hw:58, hh:42, power:52, lift:1.0, kbm:1.05, kbum:1.05}
        ];
        this.cool=3.6+Math.random()*0.8;
        this._idx=0; this._t=0; this.animT=0; return;
      }
      if(this.intent==='dashApproach' && adx<360 && Math.random()<0.7){
        this.state='ult';
        this._seq=[
          {dur:0.40, key:'uPrep', fx:0},
          {dur:0.24, key:'uDash', fx:620},
          {dur:0.20, key:'uFin',  fx:0, hit:true, hx:26, hw:64, hh:50, power:120, lift:1.4, kbm:1.2, kbum:1.2}
        ];
        this.cool=8.0+Math.random()*3.0;
        this._idx=0; this._t=0; this.animT=0; return;
      }
    }

    if(this.intent==='dashApproach'){ this.vx = (dx>0? bounds().MOVE : -bounds().MOVE); }
    else { this.vx = (Math.sin(performance.now()/300))*40; }
    this.updatePhysics(dt);
    this.state = !this.onGround ? 'jump' : (Math.abs(this.vx)>1? 'run':'idle');
    this.animT+=dt;
  }
  draw(ctx,world){
    ctx.save(); ctx.translate(this.x-world.camX, this.y-world.camY);
    if(this.dead){ ctx.globalAlpha=this.fade; ctx.rotate(this.spinAngle); }
    if(this.spinT>0 && !this.dead){ ctx.rotate(this.spinAngle); }
    if(this.face<0 && !this.dead) ctx.scale(-1,1);
    let img=null;
    if(this._seq){ const cur=this._seq[this._idx]; img=this.img(cur?.key||'idle'); }
    else if(!this.onGround){ img=this.img('jump'); }
    else if(this.state==='run'){ const f=Math.floor(this.animT*6)%2; img=this.img(f?'w1':'w2'); }
    else img=this.img('idle');
    if(img){ const scale=this.h/img.height, w=img.width*scale, h=this.h; ctx.imageSmoothingEnabled=false; ctx.drawImage(img, Math.round(-w/2), Math.round(-h/2), Math.round(w), Math.round(h)); }
    ctx.restore(); this.drawHPBar(ctx,world);
  }
}

/* =========================================
 * World（背景1枚表示 / 非ループ対応・ズーム&バナー）
 * ========================================= */
class World{
  constructor(assets, canvas, effects){
    this.assets=assets; this.effects=effects; this.canvas=canvas;
    this.ctx=canvas.getContext('2d',{alpha:true}); this.ctx.imageSmoothingEnabled=false;
    this.gameW=canvas.width; this.gameH=canvas.height; this.camX=0; this.camY=0; this.time=0; this._timerAcc=0;

    const r=this.canvas.getBoundingClientRect(); this.screenScaleX=r.width/this.gameW; this.screenScaleY=r.height/this.gameH;

    this.bgImg=null; this.bgKind='single'; // 'single' only
    this.zoom=1;
    this._buildBanner();
  }
  _buildBanner(){
    const wrap=document.querySelector('.gamewrap');
    const msg=document.createElement('div');
    msg.style.position='absolute';
    msg.style.left='50%'; msg.style.top='20%';
    msg.style.transform='translate(-50%,-50%)';
    msg.style.padding='12px 16px';
    msg.style.background='rgba(11,15,23,0.85)';
    msg.style.border='1px solid #263147';
    msg.style.borderRadius='12px';
    msg.style.fontWeight='800';
    msg.style.fontSize='20px';
    msg.style.display='none';
    wrap.appendChild(msg);
    this.banner=msg;
  }
  showBanner(text, ms=1000){
    if(!this.banner) return;
    this.banner.textContent=text;
    this.banner.style.display='block';
    setTimeout(()=>{ this.banner.style.display='none'; }, ms);
  }
  setZoomAround(x, y, z=1.0){
    this.zoom = z;
    this._zoomPivot = {x, y};
  }
  resize(){ const r=this.canvas.getBoundingClientRect(); this.screenScaleX=r.width/this.gameW; this.screenScaleY=r.height/this.gameH; }
  setBackground(img){ this.bgImg = this.assets.img(img)||null; }

  updateCam(p){
    // ステージは1画面固定：カメラは原則0固定 + シェイクのみ
    const offs=this.effects.getCamOffset();
    this.camX = 0 + offs.x;
    this.camY = 0 + offs.y;
  }
  updateTimer(dt){
    this._timerAcc+=dt; if(this._timerAcc>=0.2){ this.time+=this._timerAcc; this._timerAcc=0;
      const t=Math.floor(this.time); const mm=String(Math.floor(t/60)).padStart(2,'0'); const ss=String(t%60).padStart(2,'0'); document.getElementById('time').textContent=`${mm}:${ss}`; }
  }
  draw(player, enemies){
    const ctx=this.ctx;
    ctx.save();
    // ★ ズーム（プレイヤー中心）
    if(this.zoom!==1 && this._zoomPivot){
      const px = this._zoomPivot.x - this.camX;
      const py = this._zoomPivot.y - this.camY;
      ctx.translate(px, py); ctx.scale(this.zoom, this.zoom); ctx.translate(-px, -py);
    }

    ctx.clearRect(0,0,this.gameW,this.gameH);
    if(this.bgImg){
      // 高さフィット・中央クロップ
      const scale = this.gameH / this.bgImg.height;
      const dw = Math.round(this.bgImg.width * scale);
      const dh = this.gameH;
      const sx = 0, sy = 0, sw = this.bgImg.width, sh = this.bgImg.height;
      const dx = Math.round((this.gameW - dw)/2);
      ctx.drawImage(this.bgImg, sx, sy, sw, sh, dx, 0, dw, dh);
    } else {
      const g=ctx.createLinearGradient(0,0,0,this.gameH); g.addColorStop(0,'#0a1230'); g.addColorStop(1,'#0a0f18'); ctx.fillStyle=g; ctx.fillRect(0,0,this.gameW,this.gameH);
    }
    // 地面ライン
    ctx.fillStyle='#0b0f17'; const yTop=Math.floor(bounds().GROUND_TOP_Y); ctx.fillRect(0,yTop-1,this.gameW,1);

    if(this._skillBullets){ for(const p of this._skillBullets) p.draw(ctx); }
    for(const e of enemies) e.draw(ctx,this);
    player.draw(ctx,this);
    this.effects.draw(ctx,this);

    ctx.restore();
  }
}

/* =========================================
 * スポーンユーティリティ（安全距離/間隔）
 * ========================================= */
function pickSpawnX(playerX, exists, w=420){
  const safeFromPlayer = 140;
  const minGapBetween  = 70;
  for(let k=0;k<40;k++){
    const x = 60 + Math.random()*(w-120);
    if(Math.abs(x - playerX) < safeFromPlayer) continue;
    let ok=true;
    for(const e of exists){ if(Math.abs(x - e.x) < minGapBetween){ ok=false; break; } }
    if(ok) return x;
  }
  return Math.random()*(w-120)+60;
}

/* =========================================
 * Game（ステージ1：入口→室内→スクリュー→クリア）
 * ========================================= */
class Game{
  constructor(){
    this.assets=new Assets(); this.canvas=document.getElementById('game'); this.input=new Input(); this.effects=new Effects();
    this.player=null; this.enemies=[]; this.world=null; this.lastT=0;
    this.state='st1'; // 'st1', 'room', 'boss', 'clear'
    this.killCount=0; this.targetKills=15; // ST1
    addEventListener('resize',()=>this.world?.resize());
  }
  async start(){
    const imgs=[
      /* 背景 */
      'ST1.png','CS.png',
      /* Player */
      'M1-1.png','M1-2.png','M1-3.png','M1-4.png',
      'K1-1.png','K1-2.png','K1-3.png','K1-4.png','K1-5.png',
      'h1.png','h2.png','h3.png','h4.png',
      'J.png',
      'Y1.png','Y2.png','Y3.png','Y4.png',
      'UL1.PNG','UL2.PNG','UL3.png',
      'kem.png',
      /* Enemies */
      'teki1.png','teki2.png','teki3.png','teki7.png',
      'B1.png','B2.png','B3.png','B4.png','B5.png','B6.png','B7.png','B8.png','B9.png','B10.png','B11.png','B12.png','B13.png','B14.png'
    ];
    await this.assets.load(imgs);
    this.world=new World(this.assets,this.canvas,this.effects);
    // ステージ共通の境界（1画面）
    config.STAGE_LEFT=0; config.STAGE_RIGHT=this.canvas.width; config.GROUND_TOP_Y=437;
    this.world.setBackground('ST1.png');

    this.player=new Player(this.assets,this.world,this.effects);
    updateHPUI(this.player.hp,this.player.maxhp);

    this._spawnWaruPack(3); // 入口：まず3体
    this.lastT=now();
    const loop=()=>{ this._tick(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  _spawnWaruPack(n=3){
    const pack=[];
    for(let i=0;i<n;i++){
      const x=pickSpawnX(this.player.x, pack, this.canvas.width);
      pack.push(new WaruMOB(this.world,this.effects,this.assets,x));
    }
    this.enemies.push(...pack);
  }
  _enterRoom(){
    // 室内へ
    this.state='room'; this.killCount=0; this.targetKills=10;
    this.enemies.length=0;
    this.world.setBackground('CS.png');
    // 左端スポーン
    this.player.x = 60; this.player.y=Math.floor(bounds().GROUND_TOP_Y)-this.player.h/2+bounds().FOOT_PAD;
    // すぐ3体
    this._spawnWaruPack(3);
  }
  _spawnBoss(){
    this.state='boss'; this.enemies.length=0;
    // 落下演出
    this.effects.shake(0.25, 10); // “中”の強さ
    this.world.showBanner('MOBスクリュー登場！', 1000);
    // 天から降って来る
    const boss = new Screw(this.world,this.effects,this.assets, this.canvas.width/2);
    boss.y = -200; boss.vy = 900;
    this.enemies.push(boss);
  }
  _stageClear(){
    this.state='clear';
    this.world.showBanner('ステージクリア!!', 2000);
    // プレイヤーにズーム（2秒）
    this.world.setZoomAround(this.player.x, this.player.y, 1.25);
    setTimeout(()=>{ this.world.setZoomAround(this.player.x, this.player.y, 1.0); location.reload(); }, 2000);
  }

  _tick(){
    const t=now(); let dt=(t-this.lastT)/1000; if(dt>0.05) dt=0.05; this.lastT=t;

    if(this.effects.hitstop>0){
      this.effects.update(dt); this.world.updateCam(this.player); this.world.draw(this.player,this.enemies);
      return;
    }

    // Player
    this.player.update(dt,this.input,this.world,this.enemies);

    // Enemies + 当たり
    for(const e of this.enemies){
      e.update(dt,this.player);

      // 接触・射撃
      if(e instanceof WaruMOB){
        for(const p of e.projectiles){
          if(!p.dead && this.player.invulnT<=0 && rectsOverlap(p.aabb(), this.player.aabb())){
            p.dead=true; const hit=this.player.hurt(p.power, p.dir, {lift:0, kbMul:0.55, kbuMul:0.5}, this.effects);
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
            const tag = (p instanceof UltBlast)? 'ult' : 'skill1';
            const hit=e.hurt(p.power, dir, {lift:0.3,kbMul:0.9,kbuMul:0.9, tag}, this.effects);
            if(hit) this.effects.addSpark(e.x, e.y-10, p.power>=40);
          }
        }
      }
      this.world._skillBullets = this.world._skillBullets.filter(p=>!p.dead && p.life>0);
    }

    // 撃破整理 & キルカウント
    const before=this.enemies.length;
    this.enemies=this.enemies.filter(e=>!(e.dead && e.fade<=0));
    const removed = before - this.enemies.length;
    if(removed>0){
      this.killCount += removed;
      // 次の湧き
      if(this.state==='st1' && this.killCount < this.targetKills && this.enemies.filter(e=>e instanceof WaruMOB).length<3){
        this._spawnWaruPack(Math.min(3, this.targetKills - this.killCount));
      }
      if(this.state==='room' && this.killCount < this.targetKills && this.enemies.filter(e=>e instanceof WaruMOB).length<3){
        this._spawnWaruPack(Math.min(3, this.targetKills - this.killCount));
      }
    }

    // 進行管理
    if(this.state==='st1' && this.killCount>=this.targetKills && this.enemies.length===0){
      this._enterRoom();
    } else if(this.state==='room' && this.killCount>=this.targetKills && this.enemies.length===0){
      this._spawnBoss();
    } else if(this.state==='boss'){
      const bossAlive = this.enemies.some(e=>e instanceof Screw && !e.dead);
      if(!bossAlive && this.enemies.length===0){
        this._stageClear();
      }
    }

    // のめり込み解消（強め）
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
        this.player.x += dirX * overlapX * 0.65;
        e.x           -= dirX * overlapX * 0.35;
        this.player.vx += dirX * 30;
        e.vx          -= dirX * 30;
      }
    }

    this.effects.update(dt); this.world.updateCam(this.player); this.world.updateTimer(dt); this.world.draw(this.player,this.enemies);
  }
}

/* =========================================
 * Boot
 * ========================================= */
new Game().start();

})();
