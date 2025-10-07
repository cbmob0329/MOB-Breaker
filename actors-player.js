// actors-player.js — Player only (ULT not cancellable on hit + S1 fast 8 spins + S2 big persistent)
// 依存: script-core.js（__GamePieces__）

(function(){
'use strict';

const {
  Effects, Assets, Input, CharacterBase,
  Projectile, EnergyBall, UltBlast, GroundSpike,
  constants:{ MOVE, JUMP_V, GROUND_TOP_Y, FOOT_PAD },
  utils:{ clamp, lerp, rectsOverlap }
} = window.__GamePieces__;

/* =============== helper: persistent wrapper for spikes =============== */
function makePersistentHitbox(obj){
  obj.persistent = true;
  let _dead = false;
  Object.defineProperty(obj, 'dead', {
    get(){ return _dead; },
    set(v){ if (obj.persistent && v === true) return; _dead = v; },
    configurable: true
  });
}

/* ================================
 * Player
 * ================================ */
class Player extends CharacterBase{
  constructor(assets, world, effects){
    super(56,64);
    this.assets=assets; this.world=world; this.effects=effects;
    this.x=100; this.y=Math.floor(GROUND_TOP_Y)-this.h/2+FOOT_PAD;
    this.hp=1000; this.maxhp=1000; this.lives=3;

    this.maxJumps=2; this.jumpsLeft=this.maxJumps;

    this.comboStep=0; this.comboGraceT=0; this.comboGraceMax=0.24;
    this.bufferA1=false; this.a2LockoutT=0;
    this.skillCDT=0; this.skill2CDT=0; this.ultCDT=0;

    this.saT=0;

    // ULTラッシュ管理
    this._inULT=false;
    this._ultQueue=null;     // ['A1R','S1','S2']
    this._ultSpeed=2.2;      // 再生速度倍率
    this._ultPhase='';
    this._ultTimer=0;        // ウォッチドッグ
    this._ultTimeLimit=2.5;  // フェイルセーフ
    this._ultLockInput=false;

    this.frames={
      idle:['M1-1.png'],
      run:['M1-2.png','M1-3.png','M1-4.png','M1-3.png'],
      k1prep:'K1-3.png', k1a:'K1-1.png', k1b:'K1-2.png', k1c:'K1-4.png',
      k2prep:'K1-3.png', k2:'K1-5.png',
      spin:['h1.png','h2.png','h3.png','h4.png'],
      chaseJump:'J.png',
      y1:'Y1.png', y2:'Y2.png', y3:'Y3.png', y4:'Y4.png',
      ul1:'UL1.PNG', ul2:'UL2.PNG', ul3:'UL3.png'
    };
    this.overhead=this._createOverheadGauge();
    document.querySelector('.gamewrap').appendChild(this.overhead.root);

    this._activeSpikes=null;
  }

  /* ---------- overhead ---------- */
  _getFramePath(key, i=0){ const v=this.frames[key]; return Array.isArray(v)? v[Math.max(0,Math.min(v.length-1,i))] : v; }
  _imgByKey(key,i=0){ return this.world.assets.img(this._getFramePath(key,i)); }
  _createOverheadGauge(){
    const root=document.createElement('div'); root.className='overhead';
    const g=document.createElement('div'); g.className='gauge'; const i=document.createElement('i'); g.appendChild(i);
    const label=document.createElement('span'); label.style.fontSize='10px'; label.style.color='#b8c7e3';
    root.appendChild(g); root.appendChild(label);
    return {root, gauge:g, fill:i, label};
  }
  _posOverhead(){
    const w=this.world, headY=this.y-this.h/2-10;
    this.overhead.root.style.left=((this.x-w.camX)*w.screenScaleX)+'px';
    this.overhead.root.style.bottom=(w.gameH-(headY-w.camY))*w.screenScaleY+'px';
  }
  _showGauge(show, text='', ratio=0){
    this.overhead.root.style.display=show?'flex':'none';
    this.overhead.label.textContent=text;
    this.overhead.fill.style.width=((ratio*100)|0)+'%';
  }

  /* ---------- hitbox ---------- */
  currentHitbox(){
    if(!(this.state==='atk'||this.state==='skill'||this.state==='skill2'||this.state==='ult') || !this._actionSeq) return null;
    const cur=this._actionSeq[this._actionIndex]; if(!cur) return null;
    if(this.state==='skill' || this.state==='skill2' || this.state==='ult'){
      const W=86,H=64; const x=this.x + this.face*(this.w*0.2);
      return {x, y:this.y, w:W, h:H, power:cur.power||0, dir:this.face, lift:cur.lift||0, kbMul:cur.kbMul||1.6, kbuMul:cur.kbuMul||1.3};
    }
    if(cur.kind==='hit' || cur.kind==='sp'){
      const w=52, h=42, x=this.x + this.face*(this.w*0.3 + w*0.5), y=this.y - 6;
      return {x,y,w,h, power:cur.power||0, dir:this.face, lift:cur.lift||1, kbMul:cur.kbMul||1, kbuMul:cur.kbuMul||1};
    }
    return null;
  }

  /* ---------- failsafe / cleanup ---------- */
  _abortAllActions(){
    this._inULT=false;
    this._ultQueue=null;
    this._ultPhase='';
    this._ultTimer=0;
    this._ultLockInput=false;

    this._actionSeq=null; this._actionIndex=0; this._actionTime=0;
    this.bufferA1=false; this.comboStep=0; this.comboGraceT=0; this.a2LockoutT=0;
    this.saT=0;
    this.vx=0;
    this.state='idle';
    this._showGauge(false);
  }

  /* ---------- update ---------- */
  update(dt,input,world,enemies){
    input.beginFrame(); this._posOverhead();
    if(this.saT>0) this.saT=Math.max(0,this.saT-dt);

    if(this.state!=='atk' && this.state!=='skill' && this.state!=='skill2' && this.state!=='ult' && this._actionSeq){ this._actionSeq=null; }
    if(this.a2LockoutT>0) this.a2LockoutT=Math.max(0,this.a2LockoutT-dt);

    const skBtn=document.getElementById('btnSK'); const sk2Btn=document.getElementById('btnSK2'); const ultBtn=document.getElementById('btnULT');
    if(this.skillCDT>0){ this.skillCDT=Math.max(0,this.skillCDT-dt); skBtn.setAttribute('disabled',''); } else skBtn.removeAttribute('disabled');
    if(this.skill2CDT>0){ this.skill2CDT=Math.max(0,this.skill2CDT-dt); sk2Btn.setAttribute('disabled',''); } else sk2Btn.removeAttribute('disabled');
    if(this.ultCDT>0){ this.ultCDT=Math.max(0,this.ultCDT-dt); ultBtn.setAttribute('disabled',''); } else ultBtn.removeAttribute('disabled');

    if(this.dead){
      this.updatePhysics(dt);
      if(this.fade<=0){ this._respawn(world); }
      world.updateTimer(dt);
      return;
    }

    /* ===== Skill1：常に8回転＋高速 ===== */
    if(!this._inULT){
      if(input.edge.skillRelease && this.skillCDT<=0){
        input.edge.skillRelease=false;
        this._startSkill1FixedTurns(8, {speed:1.5}); // 8回転・高速
      }
    } else {
      this._showGauge(false);
      // 入力ロック
      input.edge.a1=input.edge.a2Press=input.edge.skillRelease=input.edge.skill2=input.edge.ultPress=input.edge.ultRelease=false;
      input.btn.a1=input.btn.a2=input.btn.skill=input.btn.skill2=input.btn.ult=false;
    }

    /* ===== ULT起動（チャージ無し） ===== */
    if(!this._inULT && this.ultCDT<=0 && (input.edge.ultPress || input.edge.ultRelease)){
      input.edge.ultPress=false; input.edge.ultRelease=false; input.btn.ult=false;
      this._startULT_RushCombo();
    }

    // 実行中
    if(this.state==='atk'||this.state==='skill'||this.state==='skill2'||this.state==='ult'){
      const hb=this.currentHitbox();
      if(hb){
        for(const e of enemies){
          if(!e || e.dead || e.invulnT>0) continue;
          if(rectsOverlap({x:hb.x,y:hb.y,w:hb.w,h:hb.h}, e.aabb())){
            const hit=e.hurt(hb.power, hb.dir, {lift:hb.lift, kbMul:hb.kbMul, kbuMul:hb.kbuMul}, this.effects);
            if(hit && rectsOverlap(this.aabb(), e.aabb())){ e.x = this.x + hb.dir*(this.w*0.55); }
            if(hit && this.state==='atk' && this._actionSeq && this._actionSeq[this._actionIndex]?.tag==='chaseFinisher'){
              this.effects.addSpark(e.x, e.y-10, true);
            }
          }
        }
      }

      const dt2 = (this._inULT ? dt*this._ultSpeed : dt); // ULT中は高速再生
      this._updateAction(dt2,world,input);

      if(this._inULT) this._tickULT(dt);

      world.updateTimer(dt);
      return;
    }

    // 入力（通常時のみ）
    if(!this._inULT){
      if(input.edge.a1) this.bufferA1=true;
      if(input.edge.skill2 && this.skill2CDT<=0){ input.edge.skill2=false; this.bufferA1=false; this._startSkill2_BiggerDust_Persistent(); return; }
      if(input.edge.a2Press && this.a2LockoutT<=0){ input.edge.a2Press=false; this.bufferA1=false; this._startA2(); return; }
      if(this.bufferA1 && this.comboStep<3){ this.bufferA1=false; this._startA1(); return; }
    }

    // 移動（ULT中は停止）
    if(!this._inULT){
      let ax=0; if(input.left){ ax-=MOVE; this.face=-1; } if(input.right){ ax+=MOVE; this.face=1; }
      this.vx = ax!==0 ? (ax>0?MOVE:-MOVE) : 0;
      if(input.consumeJump() && this.jumpsLeft>0){ this.vy=-JUMP_V; this.onGround=false; this.jumpsLeft--; }
    } else {
      this.vx=0;
    }

    this.updatePhysics(dt);
    if(this.onGround) this.jumpsLeft=this.maxJumps;
    this.state = !this.onGround ? 'jump' : (Math.abs(this.vx)>1?'run':'idle');

    world.updateTimer(dt);
  }

  /* ---------- 通常アクション ---------- */
  _startA1(){
    this.state='atk'; this.animT=0; this.comboStep=Math.min(this.comboStep+1,3);
    const seq=[ {kind:'prep',dur:0.08,frame:'k1prep',fx:80,power:0} ];
    let frame='k1a', power=6, fx=140;
    if(this.comboStep===2){ frame='k1b'; power=9; fx=170; }
    else if(this.comboStep===3){ frame='k1c'; power=12; fx=200; }
    seq.push({kind:'hit',dur:0.20,frame,fx,power, kbMul:1.0, kbuMul:1.0});
    this._actionSeq=seq; this._actionIndex=0; this._actionTime=0;
  }
  _startA2(){
    this.state='atk'; this.animT=0;
    this._actionSeq=[
      {kind:'prep',dur:0.10,frame:'k2prep',fx:90,power:0},
      {kind:'hit', dur:0.22,frame:'k2',fx:220,power:18, lift:1.0, kbMul:1.15, kbuMul:1.2, after:'enableChase'}
    ];
    this._actionIndex=0; this._actionTime=0; this.a2LockoutT = 0.35;
    this._chaseWindowT = 0; this._chaseEnabled=false; this._chaseConsumed=false;
  }
  _startA2Chase(){
    this.state='atk'; this.animT=0;
    const seq=[
      {kind:'pose',dur:0.12,frame:'chaseJump',fx:260,power:0},
      {kind:'hit', dur:0.24,frame:'k1c',fx:280,power:50, lift:1.0, kbMul:1.2, kbuMul:1.2, tag:'chaseFinisher'}
    ];
    this._actionSeq=seq; this._actionIndex=0; this._actionTime=0;
    this._chaseEnabled=false; this._chaseConsumed=true;
    this.a2LockoutT=0.6;
  }

  // Skill1：回転数固定（8回転）＋スピード倍率
  _startSkill1FixedTurns(turns=8, opts={speed:1.0}){
    this.state='skill'; this.animT=0; this.skillCDT=5.0;
    const frames=this.frames.spin;
    const base=26;
    const kbm = 1.8; // 少し強化
    const kbum= 1.4;
    const speed = Math.max(0.5, opts.speed||1.0);
    const step = 0.06 / speed; // 高速化

    const seq=[];
    for(let r=0;r<turns;r++){
      for(let i=0;i<frames.length;i++){
        const pow = base*(i===1?1:0.6); const lift=(i===1?1:0);
        seq.push({kind:'sp',dur:step,frame:frames[i],fx:80,power:pow,lift, kbMul:kbm, kbuMul:kbum});
      }
    }
    this._actionSeq=seq; this._actionIndex=0; this._actionTime=0;
    this._showGauge(false);
  }

  // Skill2：大きい煙 + 持続（敵に当たっても消えない）
  _startSkill2_BiggerDust_Persistent(){
    if(this.skill2CDT>0) return;
    this.state='skill2'; this.animT=0; this.skill2CDT=10.0;
    this._skill2SAT = 1.6;
    this._actionSeq=[
      {kind:'hit', dur:0.12, frame:'y1', fx:30, power:5},
      {kind:'hit', dur:0.12, frame:'y2', fx:30, power:5},
      {kind:'hit', dur:0.12, frame:'y3', fx:30, power:5},
      {kind:'hit', dur:0.12, frame:'y4', fx:0,  power:10},
      {kind:'emit',dur:1.00,  frame:'y4', fx:0,  power:0}
    ];
    this._actionIndex=0; this._actionTime=0;

    const kem=this.world.assets.img('kem.png');
    if(kem){
      const off=72;
      const L=new GroundSpike(this.world, this.x - off, -1, kem);
      const R=new GroundSpike(this.world, this.x + off,  1, kem);
      [L,R].forEach(sp=>{
        sp.w = 68; sp.maxH = 140; sp.life = 1.15;
        makePersistentHitbox(sp);
      });
      (this.world._skillBullets||(this.world._skillBullets=[])).push(L,R);
      this._activeSpikes=[L,R];
      this.effects.shake(0.14,7);
    }
  }

  /* ===== ULT：ラッシュ（A1R → S1(8回転高速) → S2） ===== */
  _startULT_RushCombo(){
    this._inULT=true;
    this._ultQueue=['A1R','S1','S2'];
    this._ultPhase='';
    this._ultTimer=0;
    this._ultLockInput=true;
    this.ultCDT=6.0;      // 好みで
    this.saT=0.5;
    this.state='ult'; this.animT=0;

    this.effects.addSpark(this.x + this.face*10, this.y-14, true);
    this._advanceULTPhase();
  }

  _advanceULTPhase(){
    const next=this._ultQueue?.shift();
    this._ultPhase = next || '';
    if(!next){ this._finishULT(); return; }

    if(next==='A1R'){
      this._startA1RushSequence();   // 専用シーケンス
    } else if(next==='S1'){
      this._startSkill1FixedTurns(8, {speed:1.5});
    } else if(next==='S2'){
      this._startSkill2_BiggerDust_Persistent();
    }
  }

  // ULT専用：A1三段を1本のシーケンスで高速再生
  _startA1RushSequence(){
    this.state='atk'; this.animT=0;
    const seq=[
      {kind:'prep',dur:0.06,frame:'k1prep',fx:140,power:0},
      {kind:'hit', dur:0.12,frame:'k1a',  fx:220,power:12, kbMul:1.0, kbuMul:1.0},
      {kind:'hit', dur:0.12,frame:'k1b',  fx:240,power:16, kbMul:1.0, kbuMul:1.0},
      {kind:'hit', dur:0.14,frame:'k1c',  fx:260,power:22, kbMul:1.05, kbuMul:1.05}
    ];
    this._actionSeq=seq; this._actionIndex=0; this._actionTime=0;
  }

  _tickULT(dt){
    // SAを維持（薄く上書き）
    this.saT = Math.max(this.saT, 0.1);

    // ウォッチドッグ
    this._ultTimer += dt;
    if(this._ultTimer >= this._ultTimeLimit){
      this._finishULT();
      return;
    }

    // 現在のサブアクションが終わったら次へ
    if(!this._actionSeq){ this._advanceULTPhase(); }
  }

  _finishULT(){
    this._inULT=false;
    this._ultQueue=null;
    this._ultPhase='';
    this._ultTimer=0;
    this._ultLockInput=false;
    this.vx=0;
    this.state='idle';
    this.effects.shake(0.18,8);
    this.effects.addSpark(this.x + this.face*16, this.y-18, true);
  }

  /* ---------- 共通アクション進行 ---------- */
  _updateAction(dt,world,input){
    const cur=this._actionSeq?.[this._actionIndex];

    if(this.state==='skill2'){
      this._skill2SAT = Math.max(0, this._skill2SAT - dt);
      this.saT = Math.max(this.saT, 0.08);
    }

    if(cur?.fx){ this.x += this.face * cur.fx * dt; }

    if(this._actionSeq && this.state==='atk' && cur?.after==='enableChase' && !this._inULT){
      this._chaseWindowT = (this._chaseWindowT||0) + dt;
      if(this._chaseWindowT>0.18 && !this._chaseEnabled){ this._chaseEnabled=true; }
      if(this._chaseEnabled && input.edge.a2Press && !this._chaseConsumed){
        input.edge.a2Press=false; this._startA2Chase(); return;
      }
    }

    if((this.state==='skill2' && (cur?.frame==='y4' || cur?.kind==='emit')) || this.state==='ult'){
      const ox=Math.sin(performance.now()/25)*2; this._shakeOX = ox;
    } else this._shakeOX=0;

    this.vx = 0; this.updatePhysics(dt);

    if(this._actionSeq){
      this._actionTime+=dt;
      if(this._actionTime>=cur.dur){
        this._actionIndex++; this._actionTime=0;
        if(this._actionIndex>=this._actionSeq.length){
          if(this.state==='skill2'){ this._activeSpikes=null; }
          this.state='idle'; this._actionSeq=null; // busy解除
        }
      }
    }
    this.animT+=dt;
  }

  _respawn(world){
    // デス復帰時にも完全初期化
    this.dead=false; this.fade=1; this.spinAngle=0; this.spinSpeed=0;
    this._abortAllActions();

    this.invulnT=0.6; this.hp=this.maxhp;
    const fill=document.getElementById('hpfill'); const num=document.getElementById('hpnum');
    if(fill&&num){ fill.style.width='100%'; num.textContent=this.hp; }
    this.x=world.camX+80; this.y=Math.floor(GROUND_TOP_Y)-this.h/2+FOOT_PAD; this.vx=0; this.vy=0;
    this.jumpsLeft=this.maxJumps; this._activeSpikes=null;
  }

  draw(ctx,world){
    ctx.save(); ctx.translate(this.x-world.camX, this.y-world.camY);
    if(this.dead){ ctx.globalAlpha=this.fade; ctx.rotate(this.spinAngle); }
    if(this.face<0 && !this.dead) ctx.scale(-1,1);

    let img=null, ox=this._shakeOX||0;
    if(this.state==='idle'){ img=this._imgByKey('idle',0); }
    else if(this.state==='run'){
      const speed=Math.abs(this.vx);
      const rate = lerp(6, 11, clamp(speed/MOVE, 0, 1));
      const i=Math.floor(this.animT*rate)%this.frames.run.length;
      img=this._imgByKey('run',i);
    }
    else if(this.state==='jump'){ img=this._imgByKey('run',0); }
    else if((this.state==='atk'||this.state==='skill'||this.state==='skill2'||this.state==='ult') && this._actionSeq){
      const cur=this._actionSeq[this._actionIndex]; const key=cur.frame; img=this.world.assets.img(this.frames[key]?this._getFramePath(key,0):key);
    } else img=this._imgByKey('idle',0);

    if(img){
      const scale=this.h/img.height, w=img.width*scale, h=this.h;
      ctx.imageSmoothingEnabled=false; ctx.drawImage(img, Math.round(-w/2+ox), Math.round(-h/2), Math.round(w), Math.round(h));
    }
    ctx.restore();
  }

  // 被弾：ULT中は絶対にキャンセルされない
  hurt(amount,dir,opts,effects){
    if(this._inULT){
      // ダメージは受けるが、ノックバックは完全無効化
      const safeOpts = {...(opts||{}), kbMul:0, kbuMul:0};
      const prevState='ult';
      const hit = CharacterBase.prototype.hurt.call(this,amount,dir,safeOpts,effects);
      if(hit && !this.dead){
        // すぐにULT状態へ強制復帰（親が'state=hurt'にしても上書き）
        this.state=prevState;
        // アクション継続（_actionSeqは触らない）
        // 再被弾連打のブレを抑えるため短い無敵
        this.invulnT = Math.max(this.invulnT, 0.08);
      }
      // HP UI更新
      const fill=document.getElementById('hpfill'); const num=document.getElementById('hpnum');
      if(fill&&num){ num.textContent=this.hp; fill.style.width=Math.max(0,Math.min(100,(this.hp/this.maxhp)*100))+'%'; }
      return hit;
    }

    // 通常時：スキル2やSA中は軽減
    if(this.state==='skill2' || this.saT>0){
      opts = {...(opts||{}), kbMul:0.2, kbuMul:0.2};
    }
    const hit = CharacterBase.prototype.hurt.call(this,amount,dir,opts,effects);
    if(hit){
      const fill=document.getElementById('hpfill'); const num=document.getElementById('hpnum');
      if(fill&&num){ num.textContent=this.hp; fill.style.width=Math.max(0,Math.min(100,(this.hp/this.maxhp)*100))+'%'; }

      if(this.state!=='skill2'){
        // アクション残骸で固まらないよう初期化
        this._actionSeq=null; this._actionIndex=0; this._actionTime=0;
        this.bufferA1=false; this.comboStep=0; this.comboGraceT=0; this.a2LockoutT=0;
        this.overhead?.root && (this.overhead.root.style.display='none');
        this.jumpsLeft=this.maxJumps;
        this.state='idle';
      }
    }
    return hit;
  }
}

/* ================================
 * export (merge)
 * ================================ */
window.__Actors__ = Object.assign({}, window.__Actors__||{}, { Player });

})();
