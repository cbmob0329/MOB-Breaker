// script_part1.js – Rev33 FULL (Stable Restore) – Part1
(function(){
'use strict';

/* =========================================================
 * 定数・ユーティリティ
 * =======================================================*/
const STAGE_LEFT = 0;
const STAGE_RIGHT = 2200; // 目安の横幅
const ST1_GROUND_Y = 437; // メモリ保存：赤帯上端
const CS_GROUND_Y  = 360; // メモリ保存
let   GROUND_TOP_Y = ST1_GROUND_Y;

const GRAV = 2000, MOVE = 260, JUMP_V = 760, MAX_FALL = 1200;
const FOOT_PAD = 2;
const TAU = Math.PI * 2;

const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const now=()=>performance.now();
const rectsOverlap=(a,b)=>Math.abs(a.x-b.x)*2<(a.w+b.w)&&Math.abs(a.y-b.y)*2<(a.h+b.h);
const lerp=(a,b,t)=>a+(b-a)*t;

/* 小さなイベントバス（Part2が購読可能） */
class Emitter{
  constructor(){this.map=new Map();}
  on(evt,fn){ if(!this.map.has(evt))this.map.set(evt,[]); this.map.get(evt).push(fn); return ()=>this.off(evt,fn); }
  off(evt,fn){ const arr=this.map.get(evt)||[]; const i=arr.indexOf(fn); if(i>=0)arr.splice(i,1); }
  emit(evt,detail){ const arr=this.map.get(evt)||[]; for(const f of arr) try{f(detail);}catch{} }
}

/* =========================================================
 * エフェクト（ヒット火花・画面揺れ・ヒットストップ）
 * =======================================================*/
class Effects{
  constructor(){ this.sparks=[]; this.shakeT=0; this.shakeAmp=0; this.hitstop=0; }
  addSpark(x,y,strong=false){
    this.sparks.push({x,y,t:0,life:0.18,strong});
    if(strong){ this.shake(0.14,8); this.hitstop=Math.max(this.hitstop,0.06); }
    else{ this.shake(0.08,4); this.hitstop=Math.max(this.hitstop,0.04); }
  }
  shake(dur,amp){ this.shakeT=Math.max(this.shakeT,dur); this.shakeAmp=Math.max(this.shakeAmp,amp); }
  camOffset(){ if(this.shakeT>0){ const a=this.shakeAmp*this.shakeT; return {x:(Math.random()*2-1)*a, y:(Math.random()*2-1)*a*0.6}; } return {x:0,y:0}; }
  update(dt){
    if(this.hitstop>0)this.hitstop=Math.max(0,this.hitstop-dt);
    if(this.shakeT>0)this.shakeT=Math.max(0,this.shakeT-dt);
    for(const s of this.sparks)s.t+=dt;
    this.sparks=this.sparks.filter(s=>s.t<s.life);
  }
  draw(ctx,world){
    for(const s of this.sparks){
      const p=s.t/s.life; ctx.save(); ctx.translate(s.x-world.camX, s.y-world.camY);
      ctx.globalAlpha=1-p; ctx.strokeStyle="#fff"; ctx.lineWidth=s.strong?2:1;
      ctx.beginPath(); ctx.moveTo(-10,0); ctx.lineTo(10,0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0,-6); ctx.lineTo(0,6); ctx.stroke();
      ctx.restore();
    }
  }
}

/* =========================================================
 * アセット
 * =======================================================*/
class Assets{
  constructor(){ this.images=new Map(); }
  async load(list){ await Promise.all(list.map(src=>new Promise(res=>{ const i=new Image(); i.onload=()=>{this.images.set(src,i);res();}; i.onerror=()=>res(); i.src=src; }))); }
  img(n){ return this.images.get(n); }
}

/* =========================================================
 * 入力（キー＆タッチ）
 * =======================================================*/
class Input{
  constructor(){
    this.left=0; this.right=0; this.jump=false;
    this.btn={a1:false,a2:false,sk1:false,sk2:false,ult:false};
    this.edge={a1:false,a2:false,sk1Press:false,sk1Release:false,sk2:false,ultPress:false,ultRelease:false};
    this.sk1Charging=false; this.sk1T=0;
    this.ultCharging=false; this.ultT=0;
    this._initKeys(); this._initTouch();
  }
  _initKeys(){
    addEventListener('keydown',e=>{
      const k=e.key.toLowerCase();
      if(k==='arrowleft'||k==='a')this.left=1;
      if(k==='arrowright'||k==='d')this.right=1;
      if(k===' '||k==='w'||k==='arrowup')this.jump=true;
      if(k==='j'){ if(!this.btn.a1) this.edge.a1=true; this.btn.a1=true; }
      if(k==='k'){ if(!this.btn.a2) this.edge.a2=true; this.btn.a2=true; }
      if(k==='l'){ if(!this.btn.sk1){ this.edge.sk1Press=true; this.sk1Charging=true; this.sk1T=0; } this.btn.sk1=true; }
      if(k==='o'){ this.edge.sk2=true; this.btn.sk2=true; }
      if(k==='u'){ if(!this.btn.ult){ this.edge.ultPress=true; this.ultCharging=true; this.ultT=0; } this.btn.ult=true; }
    });
    addEventListener('keyup',e=>{
      const k=e.key.toLowerCase();
      if(k==='arrowleft'||k==='a')this.left=0;
      if(k==='arrowright'||k==='d')this.right=0;
      if(k==='j')this.btn.a1=false;
      if(k==='k')this.btn.a2=false;
      if(k==='l'){ this.btn.sk1=false; this.sk1Charging=false; this.edge.sk1Release=true; }
      if(k==='o')this.btn.sk2=false;
      if(k==='u'){ this.btn.ult=false; this.ultCharging=false; this.edge.ultRelease=true; }
    });
  }
  _initTouch(){
    const bind=(id,down,up)=>{
      const el=document.getElementById(id);
      if(!el) return;
      el.addEventListener('pointerdown',e=>{e.preventDefault();down();});
      el.addEventListener('pointerup',e=>{e.preventDefault();up();});
      el.addEventListener('pointercancel',e=>{e.preventDefault();up();});
      el.addEventListener('pointerleave',e=>{e.preventDefault();});
    };
    bind('btnA1',()=>{ if(!this.btn.a1) this.edge.a1=true; this.btn.a1=true; },()=>{ this.btn.a1=false; });
    bind('btnA2',()=>{ if(!this.btn.a2) this.edge.a2=true; this.btn.a2=true; },()=>{ this.btn.a2=false; });
    bind('btnSK',()=>{ if(!this.btn.sk1){ this.edge.sk1Press=true; this.sk1Charging=true; this.sk1T=0; } this.btn.sk1=true; },()=>{
      this.btn.sk1=false; this.sk1Charging=false; this.edge.sk1Release=true;
    });
    bind('btnSK2',()=>{ this.edge.sk2=true; this.btn.sk2=true; },()=>{ this.btn.sk2=false; });
    bind('btnULT',()=>{ if(!this.btn.ult){ this.edge.ultPress=true; this.ultCharging=true; this.ultT=0; } this.btn.ult=true; },()=>{
      this.btn.ult=false; this.ultCharging=false; this.edge.ultRelease=true;
    });
    bind('btnJMP',()=>{ this.jump=true; },()=>{});
  }
  consumeJump(){ const j=this.jump; this.jump=false; return j; }
  postUpdate(dt){
    if(this.sk1Charging) this.sk1T = Math.min(this.sk1T + dt, 1.0);  // Rev33: 0〜1sチャージ
    if(this.ultCharging) this.ultT = Math.min(this.ultT + dt, 1.2);  // Rev33: 〜1.2s
    // エッジの消費は利用側で都度 false に戻す
  }
}

/* =========================================================
 * エンティティ基底
 * =======================================================*/
class CharacterBase{
  constructor(w,h){
    this.w=w; this.h=h;
    this.x=0; this.y=0; this.vx=0; this.vy=0;
    this.face=1;
    this.hp=100; this.maxhp=100; this.dead=false; this.onGround=false; this.invulnT=0;
    this.superArmor=false;
  }
  aabb(){ return {x:this.x, y:this.y, w:this.w*0.6, h:this.h*0.8}; }
  center(){ return {x:this.x, y:this.y - this.h*0.1}; }
  updatePhysics(dt){
    this.vy = Math.min(this.vy + GRAV*dt, MAX_FALL);
    this.x  += this.vx*dt; this.y += this.vy*dt;
    const top = Math.floor(GROUND_TOP_Y);
    if(this.y + this.h/2 >= top){
      this.y = top - this.h/2;
      this.vy = 0; this.onGround = true;
    }else{
      this.onGround = false;
    }
    if(this.invulnT>0) this.invulnT-=dt;
  }
  hurt(dmg, dir, opts, fx){
    if(this.dead) return false;
    if(this.invulnT>0) return false;
    // ULTのアーマー貫通
    if(this.superArmor && !opts?.breakArmor) return false;

    this.hp = Math.max(0, this.hp - dmg);
    const kb = (opts?.kb ?? (140 + dmg*10));
    const kbu= (opts?.kbu ?? (80  + dmg*6));
    this.vx = dir * kb;
    this.vy = -kbu;
    this.invulnT = opts?.invuln ?? 0.18;
    if(fx) fx.addSpark(this.x, this.y-10, dmg>=30);
    if(this.hp<=0){ this.dead=true; }
    return true;
  }
}

/* =========================================================
 * プレイヤー（Rev33 挙動）
 * =======================================================*/
class Player extends CharacterBase{
  constructor(game){
    super(56,64);
    this.g = game;
    this.hp=1000; this.maxhp=1000;
    this.lives=3;
    this.comboStep=0; this.comboT=0;
    this.state='idle';
    this.cd={ a1:0, a2:0, sk1:0, sk2:0, ult:0 };
  }

  update(dt, input){
    if(this.dead){ this.updatePhysics(dt); return; }

    // 入力→移動
    let ax=0; if(input.left)ax-=MOVE; if(input.right)ax+=MOVE; this.vx=ax;
    if(ax!==0) this.face = Math.sign(ax);
    if(input.consumeJump() && this.onGround){ this.vy=-JUMP_V; }

    // 攻撃入力（優先度：ULT>SK2>SK1>A2>A1）
    if(this.cd.ult<=0 && input.edge.ultRelease){ 
      this._ult(input.ultT); 
      input.edge.ultRelease=false; 
    }
    if(this.cd.sk2<=0 && input.edge.sk2){ 
      this._skill2(); 
      input.edge.sk2=false; 
    }
    if(this.cd.sk1<=0 && input.edge.sk1Release){ 
      this._skill1(input.sk1T);
      input.edge.sk1Release=false;
    }
    if(this.cd.a2<=0 && input.edge.a2){ 
      this._attack2(); 
      input.edge.a2=false; 
    }
    if(this.cd.a1<=0 && input.edge.a1){ 
      this._attack1(); 
      input.edge.a1=false; 
    }

    // クールタイム減衰
    for(const k in this.cd){ if(this.cd[k]>0) this.cd[k]-=dt; }

    // 状態・物理
    this.updatePhysics(dt);

    // コンボタイマー
    if(this.comboT>0){ this.comboT-=dt; if(this.comboT<=0) this.comboStep=0; }
  }

  /* ===== 攻撃定義（Rev33値） ===== */
  _spawnHitbox(box){
    // ゲーム共通のヒットボックス配列へ登録（Part2で敵と衝突判定）
    this.g.hitboxes.push({owner:'player', ...box});
  }

  _attack1(){
    // 近接1：軽撃（早出し）
    this.cd.a1 = 0.20;
    this.comboStep = (this.comboT>0)? (this.comboStep%3)+1 : 1;
    this.comboT = 0.35;

    const dmg = [20,26,32][this.comboStep-1];
    const reach = 38 + 6*(this.comboStep-1);
    const hb = {
      x: this.x + this.face*(this.w*0.2), y:this.y-14,
      w: reach, h:28, dmg, dir:this.face,
      kb: 190 + dmg*6, kbu: 120 + dmg*3,
      life: 0.06, tag:'A1-'+this.comboStep
    };
    this._spawnHitbox(hb);
    this.g.effects.addSpark(this.x+this.face*20, this.y-18, this.comboStep===3);
  }

  _attack2(){
    // 近接2：中撃（横長・のけぞり強）
    this.cd.a2 = 0.35;
    const dmg = 40;
    const hb = {
      x: this.x + this.face*(this.w*0.25), y:this.y-16,
      w: 56, h:30, dmg, dir:this.face,
      kb: 320, kbu: 160, life:0.08, tag:'A2'
    };
    this._spawnHitbox(hb);
    this.g.effects.addSpark(this.x+this.face*26, this.y-20, true);
  }

  _skill1(charge){
    // Rev33：チャージ回転斬り（0〜1s：4回転 / 1s以上：6回転）
    const full = charge>=1.0;
    const spins = full? 6 : 4;
    const dmgBase = full? 34 : 26;
    const kbBase  = full? 360: 260;
    this.cd.sk1 = full? 0.9 : 0.6;

    // 多段ヒットを疑似的に：短寿命ヒットボックスを連続生成
    const step = 0.06;
    for(let i=0;i<spins;i++){
      const t = i*step;
      this.g.queue(t, ()=> {
        const ang = (i/spins)*TAU;
        const radius = 44;
        const cx = this.x + Math.cos(ang)*radius;
        const cy = this.y - 10 + Math.sin(ang)*radius*0.4;
        this._spawnHitbox({
          x: cx + this.face*6, y: cy,
          w: 40, h:32, dmg:dmgBase, dir:this.face,
          kb: kbBase, kbu: 180, life:0.06, tag:'SK1'
        });
        this.g.effects.addSpark(cx, cy, full);
      });
    }
  }

  _skill2(){
    // 突進膝（のけぞり大・キャンセル用）
    this.cd.sk2 = 1.2;
    const dmg = 45;
    const dash = 320 * this.face;
    // 一瞬だけ前方に広い判定
    this._spawnHitbox({
      x: this.x + this.face*(this.w*0.3), y:this.y-18,
      w: 72, h:32, dmg, dir:this.face,
      kb: 400, kbu: 220, life:0.06, tag:'SK2'
    });
    this.vx = dash;
    this.g.effects.addSpark(this.x+this.face*30, this.y-14, true);
  }

  _ult(charge){
    // ULT：前方広範囲ぶっ飛ばし（スーパーアーマー貫通）
    const p = clamp(charge/1.2, 0, 1);
    const dmg = Math.round(120 + 120*p);      // 120〜240
    const kb  = Math.round(600 + 300*p);      // 600〜900
    const kbu = Math.round(320 + 200*p);      // 320〜520
    this.cd.ult = 3.5;

    this._spawnHitbox({
      x: this.x + this.face*(this.w*0.25), y:this.y-26,
      w: 120, h:54, dmg, dir:this.face,
      kb, kbu, life:0.10, tag:'ULT', breakArmor:true, invuln:0.12
    });
    this.g.effects.addSpark(this.x+this.face*40, this.y-20, true);
  }

  draw(ctx){
    ctx.save();
    ctx.translate(this.x - this.g.world.camX, this.y - this.g.world.camY);
    // 体（シンプル表示：Rev33はスプライト未同梱）
    ctx.fillStyle='#7df';
    ctx.fillRect(-10,-32,20,64);
    // 顔向きの簡易表示
    ctx.fillStyle='#123a';
    ctx.fillRect(this.face>0?2:-12,-20,10,8);
    ctx.restore();
  }
}

/* =========================================================
 * ワールド/描画
 * =======================================================*/
class World{
  constructor(game){
    this.g = game;
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d');
    this.camX=0; this.camY=0;
    this.bgName='ST1.png';
    // コンテナ（足場）復活：地面接地（yTop=GROUND_TOP_Y）
    this.containers=[]; // {x,w,hTop}
  }

  setStage(name){
    if(name==='ST1'){ GROUND_TOP_Y = ST1_GROUND_Y; this.bgName='ST1.png'; }
    else if(name==='CS'){ GROUND_TOP_Y = CS_GROUND_Y; this.bgName='CS.png'; }
    this._buildContainers();
  }

  _buildContainers(){
    // 画面下に沿った薄いコンテナをいくつか（地面演出）
    this.containers = [
      {x:120, w:140, hTop:GROUND_TOP_Y},
      {x:380, w:110, hTop:GROUND_TOP_Y},
      {x:680, w:160, hTop:GROUND_TOP_Y},
      {x:980, w:180, hTop:GROUND_TOP_Y},
      {x:1320, w:160, hTop:GROUND_TOP_Y},
      {x:1700, w:220, hTop:GROUND_TOP_Y}
    ];
  }

  drawBackground(){
    const ctx=this.ctx; const img=this.g.assets.img(this.bgName);
    if(img){ ctx.drawImage(img, -this.camX, 0, this.canvas.width, this.canvas.height); }
    else{
      // フォールバック背景
      const grd=ctx.createLinearGradient(0,0,0,this.canvas.height);
      grd.addColorStop(0,'#0a111d'); grd.addColorStop(1,'#081019');
      ctx.fillStyle=grd; ctx.fillRect(0,0,this.canvas.width,this.canvas.height);
    }
  }

  drawGround(){
    const ctx=this.ctx;
    // 地面ライン（視覚用）
    ctx.strokeStyle='#2b3b55aa'; ctx.lineWidth=2;
    const gy = Math.round(GROUND_TOP_Y - this.camY);
    ctx.beginPath(); ctx.moveTo(0,gy); ctx.lineTo(this.canvas.width, gy); ctx.stroke();

    // コンテナ（足場）可視化
    ctx.fillStyle='#0e1726'; ctx.strokeStyle='#1f2f47';
    for(const c of this.containers){
      const sx = Math.round(c.x - this.camX);
      const w  = c.w;
      const sy = Math.round(c.hTop - this.camY);
      ctx.fillRect(sx, sy, w, 8);
      ctx.strokeRect(sx, sy, w, 8);
    }
  }

  drawAll(player, enemies, effects){
    const ctx=this.ctx;
    ctx.clearRect(0,0,this.canvas.width,this.canvas.height);
    this.drawBackground();
    // エネミー
    for(const e of enemies){ if(e.draw) e.draw(ctx,this); }
    // プレイヤー
    player.draw(ctx);
    // ヒットボックス（デバッグ表示）
    if(this.g.debugHit){
      ctx.save(); ctx.translate(-this.camX, -this.camY);
      ctx.strokeStyle='#ff7'; ctx.lineWidth=1.5;
      for(const hb of this.g.hitboxes){
        ctx.strokeRect(hb.x, hb.y - hb.h/2, hb.w, hb.h);
      }
      ctx.restore();
    }
    // 地面/コンテナ
    this.drawGround();
    // VFX
    effects.draw(ctx,this);
  }
}

/* =========================================================
 * HUD/タイトル
 * =======================================================*/
function fmtTime(sec){ sec|=0; const m=String((sec/60)|0).padStart(2,'0'); const s=String(sec%60).padStart(2,'0'); return `${m}:${s}`; }

class HUD{
  constructor(){
    this.hpfill = document.getElementById('hpfill');
    this.hpnum  = document.getElementById('hpnum');
    this.lives  = document.getElementById('lives');
    this.timeEl = document.getElementById('time');
    this.title  = document.getElementById('titleOverlay');
    this.stageTitle = document.getElementById('stageTitle');
    this.stageBtns = Array.from(document.querySelectorAll('.stageBtn'));
    this.startBtn = document.getElementById('startBtn');

    this.stage='ST1';
    this.stageBtns.forEach(b=>{
      b.addEventListener('click',()=>{
        this.stageBtns.forEach(bb=>bb.classList.remove('active'));
        b.classList.add('active');
        this.stage = b.dataset.stage;
        this.stageTitle.textContent = `Stage: ${this.stage}`;
      });
    });
    // 初期選択
    const first = this.stageBtns.find(b=>b.dataset.stage==='ST1');
    if(first) first.classList.add('active');
  }
  bindStart(onStart){
    this.startBtn?.addEventListener('click',()=>{
      this.title?.classList.add('hidden');
      onStart(this.stage);
    });
  }
  showTitle(){ this.title?.classList.remove('hidden'); }
  update(ply, t){
    if(!ply) return;
    const r = clamp(ply.hp / ply.maxhp, 0, 1);
    this.hpfill.style.width = `${Math.round(r*100)}%`;
    this.hpnum.textContent  = `${Math.max(0, ply.hp|0)}`;
    this.lives.textContent  = `${ply.lives}`;
    this.timeEl.textContent = fmtTime(t);
  }
}

/* =========================================================
 * ゲーム本体（Part1：基盤）
 * =======================================================*/
class Game{
  constructor(){
    this.assets = new Assets();
    this.effects = new Effects();
    this.input   = new Input();
    this.hud     = new HUD();
    this.world   = new World(this);
    this.player  = new Player(this);

    this.enemies = [];          // Part2で生成
    this.hitboxes = [];         // プレイヤー&敵の攻撃判定（Part2が解決）
    this.time = 0;
    this.debugHit = false;

    this.emitter = new Emitter();   // Part2が on('spawnEnemy',...), on('resolveHits',...) などで使用
    this._timers = [];              // 遅延キュー
    this.running = false;
  }

  async boot(){
    await this.assets.load(['ST1.png','CS.png'].map(n=>n)); // 無くてもフォールバック描画
    // 初期ステージ
    this.world.setStage('ST1');
    // プレイヤー開始位置を地面上へ
    this.player.x = 80;
    this.player.y = Math.floor(GROUND_TOP_Y) - this.player.h/2 + FOOT_PAD;

    // タイトル→開始
    this.hud.showTitle();
    this.hud.bindStart((stageName)=>{
      this.start(stageName);
    });

    // 便宜：Dキー2回押しでデバッグヒット切替（任意）
    addEventListener('keydown',e=>{
      if(e.key.toLowerCase()==='h' && (e.ctrlKey||e.metaKey)) { this.debugHit=!this.debugHit; }
    });

    // Part2の準備合図
    window.MOBGAME = this;
    window.__PART1_READY__ = true;
  }

  start(stageName){
    // ステージ適用
    this.world.setStage(stageName);
    this.player.x = 80;
    this.player.y = Math.floor(GROUND_TOP_Y) - this.player.h/2 + FOOT_PAD;
    this.time = 0;
    this.running = true;

    // Part2に敵スポーンを依頼（存在すれば）
    if(window.__PART2_READY__){
      this.emitter.emit('stageStart', {stage:stageName});
    }
    // ループ開始
    this.lastT = now();
    requestAnimationFrame(()=>this.loop());
  }

  /* 遅延実行（Skill1多段などに使用） */
  queue(delay, fn){
    this._timers.push({t:delay, fn});
  }
  _updateTimers(dt){
    for(const t of this._timers) t.t -= dt;
    const fire = this._timers.filter(t=>t.t<=0);
    this._timers = this._timers.filter(t=>t.t>0);
    for(const t of fire) try{ t.fn(); }catch{}
  }

  loop(){
    const t = now(); let dt = (t - this.lastT)/1000; this.lastT = t;
    // ヒットストップ簡易適用
    const slow = (this.effects.hitstop>0)? 0.25 : 1;
    dt = Math.min(dt, 0.05) * slow;

    if(this.running){
      this.time += dt;
      this.input.postUpdate(dt);
      this.player.update(dt, this.input);

      // Part2がいれば敵更新＆当たり判定を委譲
      if(window.__PART2_READY__){
        this.emitter.emit('tick', {dt});
        this.emitter.emit('resolveHits', {dt});
      }

      this.effects.update(dt);
      this._updateTimers(dt);
    }

    // カメラ（Part1では簡易：プレイヤー追従）
    this.world.camX = clamp(this.player.x - 160, STAGE_LEFT, STAGE_RIGHT - this.world.canvas.width);
    this.world.camY = 0;

    // 描画
    this.world.drawAll(this.player, this.enemies, this.effects);
    this.hud.update(this.player, this.time);

    requestAnimationFrame(()=>this.loop());
  }
}

/* =========================================================
 * ブート
 * =======================================================*/
new Game().boot();

})();
