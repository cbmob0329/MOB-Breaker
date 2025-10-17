/* =========================
MOB SIDE ACTION – Rev33 (Skills2-4 + ULT2) – 2025-10-17
- スキル②（◎）：その場高速回転 スーパーアーマー / 非SA敵は回転吹っ飛び
  シーケンス: tms1 → tmsA → tms2 → tms3 → tms4 → tmsA → tms5 → tms6（これを3ループ）
  全ヒット威力10・強ぶっ飛び・ハイジャンプ / tms6のみ威力20・超ぶっ飛び
- スキル③（P）：高速回転（入りdr1-4 → ループdr5-8×4） 全ヒット威力15・弱ぶっ飛び
- スキル④（A）：高速技（発動中スーパーアーマー）
  シーケンス: [air1,2,3,airA,4,5] を合計5サイクル（最後air1始動1回＋途中3サイクル+締め1サイクル=合計30枚超）
  全ヒット威力30・超ぶっ飛び / 非SA敵は回転しながら吹っ飛ぶ
- ULT②：PK1(威力20) → PK2(少し震えて前進) → PK3(威力30少し前進) → PK4 → PK5(威力50) → PK6 → PK7(威力80・超ぶっ飛び)
          → PK8(1秒硬直)
- バーチャルパッドを少し小さくしつつ、ボタンは円形で押しやすく
========================= */

// ------------ 基本設定 ------------
const CANVAS_W = 540, CANVAS_H = 960;
const GROUND_Y = 820;           // 地面ライン
const GRAVITY = 0.7;
const MOVE_ACC = 0.5;
const MOVE_MAX = 6.0;
const FRICTION = 0.85;

const ctx = document.getElementById('game').getContext('2d');
ctx.imageSmoothingEnabled = false;

// ------------ ロード ------------
const IMG = {};
function loadImage(name){
  return new Promise(res=>{
    const img = new Image();
    img.src = name; img.onload=()=>res(img); img.onerror=()=>res(null);
  });
}
async function loadAll(){
  const toLoad = new Set();
  // プレイヤー基本
  (window.ASSETS.player.idle||[]).forEach(a=>toLoad.add(a));
  (window.ASSETS.player.run||[]).forEach(a=>toLoad.add(a));
  (window.ASSETS.player.jump||[]).forEach(a=>toLoad.add(a));
  // skills
  (window.ASSETS.skill2||[]).forEach(a=>toLoad.add(a));
  (window.ASSETS.skill3_in||[]).forEach(a=>toLoad.add(a));
  (window.ASSETS.skill3_loop||[]).forEach(a=>toLoad.add(a));
  (window.ASSETS.skill4_seq||[]).forEach(a=>toLoad.add(a));
  (window.ASSETS.ult2||[]).forEach(a=>toLoad.add(a));
  // enemies
  (window.ASSETS.enemies.mob||[]).forEach(a=>toLoad.add(a));
  (window.ASSETS.enemies.golem||[]).forEach(a=>toLoad.add(a));

  for(const file of toLoad){
    IMG[file] = await loadImage(file);
  }
}

// ------------ 入力 ------------
const keys = new Set();
window.addEventListener('keydown', e=>{ keys.add(e.key); });
window.addEventListener('keyup',   e=>{ keys.delete(e.key); });

// 仮想パッド
const padL = document.getElementById('padL');
const stick = document.getElementById('stick');
let vxInput = 0;
function padPos(e, base){
  const rect = base.getBoundingClientRect();
  const isTouch = e.touches && e.touches[0];
  const px = (isTouch? e.touches[0].clientX : e.clientX) - rect.left;
  const py = (isTouch? e.touches[0].clientY : e.clientY) - rect.top;
  return {x:px,y:py,w:rect.width,h:rect.height};
}
function bindPad(){
  let active=false;
  const center = ()=>({x:padL.clientWidth/2, y:padL.clientHeight/2});
  const updateStick=(dx,dy)=>{
    const r=padL.clientWidth/2 - 8;
    const len=Math.hypot(dx,dy)||1;
    const nx = dx/len, ny=dy/len;
    const mag = Math.min(r, len);
    stick.style.transform=`translate(${nx*mag}px,${ny*mag}px)`;
    vxInput = Math.abs(nx*mag) < 12 ? 0 : nx*(mag/r);
  };
  const reset=()=>{
    stick.style.transform='translate(0px,0px)';
    vxInput=0;
  };
  const onStart = e=>{ active=true; const p=padPos(e,padL); const c=center(); updateStick(p.x-c.x, p.y-c.y); };
  const onMove  = e=>{ if(!active)return; const p=padPos(e,padL); const c=center(); updateStick(p.x-c.x, p.y-c.y); };
  const onEnd   = ()=>{ active=false; reset(); };
  padL.addEventListener('pointerdown', onStart);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onEnd);
  // touch
  padL.addEventListener('touchstart', onStart, {passive:false});
  window.addEventListener('touchmove', onMove, {passive:false});
  window.addEventListener('touchend', onEnd, {passive:false});
}
bindPad();

// ボタン
const btnSkill2 = document.getElementById('btnSkill2');
const btnSkill3 = document.getElementById('btnSkill3');
const btnSkill4 = document.getElementById('btnSkill4');
const btnULT2   = document.getElementById('btnULT2');

// ------------ ユーティリティ ------------
function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }

class Sprite {
  constructor(frames=[], fps=12, loop=true){
    this.frames = frames;
    this.fps = fps;
    this.loop = loop;
    this.t = 0;
    this.done = false;
  }
  reset(){ this.t=0; this.done=false; }
  advance(dt){
    if(this.done) return;
    this.t += dt;
    if(!this.loop && this.t > this.frames.length/this.fps){
      this.t = this.frames.length/this.fps;
      this.done = true;
    }
  }
  frame(){
    let idx = Math.floor(this.t * this.fps);
    if(this.loop){
      idx = this.frames.length? idx % this.frames.length : 0;
    }else{
      idx = clamp(idx,0,Math.max(0,this.frames.length-1));
    }
    return this.frames[idx] ? IMG[this.frames[idx]] : null;
  }
}

class Entity {
  constructor(x,y){
    this.x=x; this.y=y;
    this.vx=0; this.vy=0;
    this.w=64; this.h=72;
    this.dir=1;
    this.grounded=false;
    this.dead=false;
    this.spin=0; // 吹っ飛び回転角
    this.hasSuperArmor=false;
    this.hp=100;
    this.type='enemy';
    this.knockTimer=0;
  }
  aabb(){ return {x:this.x-this.w/2, y:this.y-this.h, w:this.w, h:this.h}; }
  hit(dmg, kx, ky, spin, launch){
    this.hp -= dmg;
    // SA持ちならのけ反り軽減・回転なし
    if(this.hasSuperArmor){
      this.vx += kx*0.3;
      this.vy += ky*0.3;
      this.knockTimer = 8;
    }else{
      this.vx += kx;
      this.vy += ky + (launch? -10 : 0); // ハイジャンプ効果
      this.spin = spin;
      this.knockTimer = 18;
    }
    if(this.hp<=0){ this.dead=true; }
  }
  step(dt){
    if(this.dead) return;

    // 簡易AI：プレイヤーへ寄る（近すぎる時は止まる）
    const dx = player.x - this.x;
    const adx = Math.abs(dx);
    if(this.knockTimer>0){
      this.knockTimer--;
    }else{
      if(adx>100){ this.vx += Math.sign(dx)*0.2; }
      else if(adx<72){ this.vx *= 0.9; }
      this.vx = clamp(this.vx, -2.5, 2.5);
    }

    // 重力＆床
    this.vy += GRAVITY;
    this.x += this.vx;
    this.y += this.vy;

    if(this.y >= GROUND_Y){
      this.y = GROUND_Y; this.vy=0; this.grounded=true;
    }else this.grounded=false;

    // 回転減衰
    this.spin *= 0.95;
  }
  draw(){
    // 簡易表示：フレームが無ければ色ブロック
    const imgList = IMG[(this.type==='golem'? (window.ASSETS.enemies.golem[0]||'') : (window.ASSETS.enemies.mob[0]||''))];
    ctx.save();
    ctx.translate(this.x, this.y - this.h/2);
    if(this.spin!==0){
      ctx.rotate(this.spin);
    }
    if(imgList){
      ctx.drawImage(imgList, -this.w/2, -this.h/2, this.w, this.h);
    }else{
      ctx.fillStyle = this.type==='golem' ? '#6f8d9e' : '#d55';
      ctx.fillRect(-this.w/2, -this.h/2, this.w, this.h);
    }
    ctx.restore();
  }
}

// ------------ プレイヤー ------------
const player = {
  x: CANVAS_W*0.5, y:GROUND_Y, vx:0, vy:0, w:64, h:72,
  dir:1, grounded:true, superArmor:false, hp:100, sp:100,
  state:'idle', anim:null, t:0,
  atkCooldown:0, busyTimer:0,
  hitboxTimer:0, hitboxPower:0, hitboxKB:{x:0,y:0}, hitboxSpin:0, hitboxLaunch:false,
};

function setAnim(frames, fps=16, loop=true){
  player.anim = new Sprite(frames, fps, loop);
}

function setState(name, dur=0){
  player.state = name;
  player.busyTimer = dur;
  player.t = 0;
}

function rectsOverlap(a,b){
  return a.x<b.x+b.w && a.x+a.w>b.x && a.y<b.y+b.h && a.y+a.h>b.y;
}

function playerAABB(){ return {x:player.x-player.w/2, y:player.y-player.h, w:player.w, h:player.h}; }

function spawnHitbox(power, kx, ky, spin=0.3, launch=false, frames=4){
  player.hitboxTimer = frames;
  player.hitboxPower = power;
  player.hitboxKB = {x:kx, y:ky};
  player.hitboxSpin = spin;
  player.hitboxLaunch = launch;
}

// スキル実装 -------------------------------

// スキル②：その場高速回転（◎） スーパーアーマー
function doSkill2(){
  if(player.busyTimer>0) return;
  player.superArmor = true;
  player.vx *= 0.6; // その場寄り
  const seq = window.ASSETS.skill2.slice(); // 8枚
  // 3ループ分の配列を生成
  const full = [];
  for(let i=0;i<3;i++) full.push(...seq);
  setAnim(full, 18, false);
  setState('skill2', full.length/18 + 0.05);

  // ヒット生成：各フレームで判定（タイマーで擬似的に）
  player._skill2Ticker = 0;
  player._skill2Step = ()=>{
    if(player.state!=='skill2') return;
    player._skill2Ticker++;
    // おおよそ毎フレームヒット（軽く間引き）
    const isLastFrame = player._skill2Ticker % 8 === 0; // tms6相当
    if(isLastFrame){
      // tms6：威力20・超ぶっ飛び・ハイジャンプ
      spawnHitbox(20, player.dir*9.0, -2.0, 0.5, true, 2);
    }else{
      // 通常：威力10・強ぶっ飛び・ハイジャンプ
      spawnHitbox(10, player.dir*6.5, -1.5, 0.35, true, 2);
    }
  };
}

// スキル③：高速回転（P） 入り→ループ×4
function doSkill3(){
  if(player.busyTimer>0) return;
  player.superArmor = false; // 指定なしなので通常
  const inSeq = window.ASSETS.skill3_in.slice();
  const loopSeq = window.ASSETS.skill3_loop.slice();
  const full = [...inSeq];
  for(let i=0;i<4;i++) full.push(...loopSeq);
  setAnim(full, 18, false);
  setState('skill3', full.length/18 + 0.05);
  player._skill3Ticker = 0;
  player._skill3Step = ()=>{
    if(player.state!=='skill3') return;
    player._skill3Ticker++;
    // 威力15・弱ぶっ飛び
    spawnHitbox(15, player.dir*3.5, -0.6, 0.2, false, 2);
  };
}

// スキル④：高速技（A） 発動中スーパーアーマー
function doSkill4(){
  if(player.busyTimer>0) return;
  player.superArmor = true;
  const unit = window.ASSETS.skill4_seq.slice(); // [air1,2,3,airA,4,5] 6枚
  const full=[];

  // 指定列：air1から始まる→途中3サイクル→締めサイクル（実質 1 + 3 + 1 = 5サイクル）
  // ユーザー列そのままに近い実装（長めの連撃）
  full.push(...unit);                    // 1
  full.push(...unit, ...unit, ...unit);  // +3
  full.push(...unit);                    // +1 = 計5

  setAnim(full, 22, false);
  setState('skill4', full.length/22 + 0.05);
  player._skill4Ticker = 0;
  player._skill4Step = ()=>{
    if(player.state!=='skill4') return;
    player._skill4Ticker++;
    // 全ヒット威力30・超ぶっ飛び / 非SA敵は回転吹っ飛び
    spawnHitbox(30, player.dir*8.5, -2.0, 0.6, true, 2);
  };
}

// ULT②：PK1→…→PK8（最後1秒硬直）
function doULT2(){
  if(player.busyTimer>0) return;
  player.superArmor = true; // ULT中は守られ感を少し
  const seq = window.ASSETS.ult2.slice();
  setAnim(seq, 14, false);
  // 演出長に+1秒硬直
  setState('ult2', seq.length/14 + 1.0);

  // 段階ヒット
  let i=0;
  player._ult2Step = ()=>{
    if(player.state!=='ult2') return;
    i++;
    // ざっくりフレーム進行に合わせて段階威力
    // PK1,3,5,7で強化ヒット／PK2,4,6は前進寄り
    if(i===2){ // PK1
      spawnHitbox(20, player.dir*5.0, -1.0, 0.25, false, 3);
    }else if(i===4){ // PK2：前進
      player.vx += player.dir*2.0;
    }else if(i===6){ // PK3
      spawnHitbox(30, player.dir*6.0, -1.2, 0.3, false, 3);
      player.vx += player.dir*1.0;
    }else if(i===8){ // PK4
      // なし（間）
    }else if(i===10){ // PK5
      spawnHitbox(50, player.dir*7.5, -1.8, 0.45, true, 4);
    }else if(i===12){ // PK6
      // なし（間）
    }else if(i===14){ // PK7
      spawnHitbox(80, player.dir*9.5, -2.8, 0.7, true, 6);
    }else if(i===16){ // PK8：1秒硬直中はヒットなし
      // 何もしない
    }
  };
}

// ------------ 敵管理 ------------
const enemies = [];
function spawnEnemy(x, sa=false, type='mob'){
  const e = new Entity(x, GROUND_Y);
  e.hasSuperArmor = sa;
  e.type = type;
  if(type==='golem'){ e.w=80; e.h=96; e.hp=240; }
  enemies.push(e);
}
function updateEnemies(dt){
  for(const e of enemies) e.step(dt);
  for(let i=enemies.length-1;i>=0;i--){
    if(enemies[i].dead) enemies.splice(i,1);
  }
}

// 初期スポーン（例：SA無しMOBとSA持ちゴーレム）
