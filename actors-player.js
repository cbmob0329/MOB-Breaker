// actors-player.js — Skill2/3/4 + ULT2 実装版（フル差し替え）
(function(){
'use strict';

const {
  Effects, Assets, Input, CharacterBase,
  Projectile, EnergyBall, UltBlast, GroundSpike,
  constants:{ MOVE, JUMP_V, GROUND_TOP_Y, FOOT_PAD },
  utils:{ clamp, lerp, rectsOverlap }
} = window.__GamePieces__;

/* ========= persistent helper ========= */
function makePersistentHitbox(obj){
  obj.persistent = true;
  let _dead = false;
  Object.defineProperty(obj, 'dead', {
    get(){ return _dead; },
    set(v){ if (obj.persistent && v === true) return; _dead = v; },
    configurable: true
  });
}

/* ================= Player ================= */
class Player extends CharacterBase{
  constructor(assets, world, effects){
    super(56,64);
    this.assets=assets; this.world=world; this.effects=effects;
    this.x=100; this.y=Math.floor(GROUND_TOP_Y)-this.h/2+FOOT_PAD;
    this.hp=1000; this.maxhp=1000; this.lives=3;

    this.maxJumps=2; this.jumpsLeft=this.maxJumps;

    // Combo / input
    this.comboStep=0; this.comboGraceT=0; this.comboGraceMax=0.24;
    this.bufferA1=false; this.a2LockoutT=0;

    // CDs
    this.skillCDT=0; this.skill2CDT=0; this.skill3CDT=0; this.skill4CDT=0; this.ultCDT=0;

    // SA
    this.saT=0;

    // ULT scheduler（既存のULT1を保持）
    this._inULT=false; this._ultQueue=null; this._ultSpeed=2.2; this._ultPhase='';
    this._ultTimer=0; this._ultTimeLimit=8.0; this._ultLockInput=false;

    this.frames={
      idle:['M1-1.png'],
      run:['M1-2.png','M1-3.png','M1-4.png','M1-3.png'],
      k1prep:'K1-3.png', k1a:'K1-1.png', k1b:'K1-2.png', k1c:'K1-4.png',
      k2prep:'K1-3.png', k2:'K1-5.png',
      spin:['h1.png','h2.png','h3.png','h4.png'],
      chaseJump:'J.png',
      y1:'Y1.png', y2:'Y2.png', y3:'Y3.png', y4:'Y4.png',
      // 新リソース（Skill2/3/4）
      tms1:'tms1.png', tms2:'tms2.png', tms3:'tms3.png', tms4:'tms4.png', tms5:'tms5.png', tms6:'tms6.png',
      dr1:'dr1.png', dr2:'dr2.png', dr3:'dr3.png', dr4:'dr4.png', dr5:'dr5.png', dr6:'dr6.png', dr7:'dr7.png', dr8:'dr8.png',
      air1:'air1.png', air2:'air2.png', air3:'air3.png', air4:'air4.png', air5:'air5.png',
      // ULT1/2
      ul1:'UL1.PNG', ul2:'UL2.PNG', ul3:'UL3.png',
      pk1:'PK1.png', pk2:'PK2.png', pk3:'PK3.png', pk4:'PK4.png', pk5:'PK5.png', pk6:'PK6.png', pk7:'PK7.png', pk8:'PK8.png'
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
    if(!(this.state==='atk'||this.state==='skill'||this.state==='skill2'||this.state==='skill3'||this.state==='skill4'||this.state==='ult') || !this._actionSeq) return null;
    const cur=this._actionSeq[this._actionIndex]; if(!cur) return null;
    // スキル＆ULTはやや大きめの矩形
    if(this.state==='skill'||this.state==='skill2'||this.state==='skill3'||this.state==='skill4'||this.state==='ult'){
      const W=86,H=64; const x=this.x + this.face*(this.w*0.2);
      return {x, y:this.y, w:W, h:H, power:cur.power||0, dir:this.face, lift:cur.lift||0, kbMul:cur.kbMul||1.6, kbuMul:cur.kbuMul||1.3};
    }
    if(cur.kind==='hit' || cur.kind==='sp'){
      const w=52, h=42, x=this.x + this.face*(this.w*0.3 + w*0.5), y=this.y - 6;
      return {x,y,w,h, power:cur.power||0, dir:this.face, lift:cur.lift||1, kbMul:cur.kbMul||1, kbuMul:cur.kbuMul||1};
    }
    return null;
  }

  /* ---------- cleanup ---------- */
  _abortAllActions(){
    this._inULT=false; this._ultQueue=null; this._ultPhase=''; this._ultTimer=0; this._ultLockInput=false;
    this._actionSeq=null; this._actionIndex=0; this._actionTime=0;
    this.bufferA1=false; this.comboStep=0; this.comboGraceT=0; this.a2LockoutT=0;
    this.saT=0; this.vx=0; this.state='idle';
    this._showGauge(false);
  }

  /* ================== update ================== */
  update(dt,input,world,enemies){
    input.beginFrame(); this._posOverhead();

    // ULT（常時先行）
    if(this._inULT){
      this.state='ult';
      this._tickULT(dt);
      // 入力ロック
      input.edge.a1=input.edge.a2Press=input.edge.skillRelease=input.edge.skill2=input.edge.p=input.edge.air=input.edge.ultPress=input.edge.ultRelease=false;
      input.btn.a1=input.btn.a2=input.btn.skill=input.btn.skill2=input.btn.p=input.btn.air=input.btn.ult=false;
    }

    if(this.saT>0) this.saT=Math.max(0,this.saT-dt);
    if(this.a2LockoutT>0) this.a2LockoutT=Math.max(0,this.a2LockoutT-dt);

    if(this.comboGraceT>0){
      this.comboGraceT=Math.max(0,this.comboGraceT-dt);
      if(this.comboGraceT===0 && this.state==='idle'){ this.comboStep=0; }
    }

    if(this.state!=='atk' && this.state!=='skill' && this.state!=='skill2' && this.state!=='skill3' && this.state!=='skill4' && this.state!=='ult' && this._actionSeq){ this._actionSeq=null; }

    // CD UI（disable）
    const skBtn=document.getElementById('btnSK');
    const sk2Btn=document.getElementById('btnSK2');
    const pBtn=document.getElementById('btnP');
    const airBtn=document.getElementById('btnAIR');
    const ultBtn=document.getElementById('btnULT');
    if(this.skillCDT>0){ this.skillCDT=Math.max(0,this.skillCDT-dt); skBtn?.setAttribute('disabled',''); } else skBtn?.removeAttribute('disabled');
    if(this.skill2CDT>0){ this.skill2CDT=Math.max(0,this.skill2CDT-dt); sk2Btn?.setAttribute('disabled',''); } else sk2Btn?.removeAttribute('disabled');
    if(this.skill3CDT>0){ this.skill3CDT=Math.max(0,this.skill3CDT-dt); pBtn?.setAttribute('disabled',''); } else pBtn?.removeAttribute('disabled');
    if(this.skill4CDT>0){ this.skill4CDT=Math.max(0,this.skill4CDT-dt); airBtn?.setAttribute('disabled',''); } else airBtn?.removeAttribute('disabled');
    if(this.ultCDT>0){ this.ultCDT=Math.max(0,this.ultCDT-dt); ultBtn?.setAttribute('disabled',''); } else ultBtn?.removeAttribute('disabled');

    if(this.dead){
      this.updatePhysics(dt);
      if(this.fade<=0){ this._respawn(world); }
      world.updateTimer(dt);
      return;
    }

    /* ===== Skill1（既存） ===== */
    if(!this._inULT){
      if(input.edge.skillRelease && this.skillCDT<=0){
        input.edge.skillRelease=false;
        this._startSkill1FixedTurns(8, {speed:1.5});
      }
    } else {
      this._showGauge(false);
    }

    /* ===== Skill2（◎）：tms1→…→tms6 を3ループ、全Hit（10）/ tms6は20＆強吹っ飛び ===== */
    if(!this._inULT && input.edge.skill2 && this.skill2CDT<=0){
      input.edge.skill2=false;
      this._startSkill2_TornadoTriple();
    }

    /* ===== Skill3（P）：dr1-4 イントロ → dr5-8 3ループ、全Hit（15）・吹っ飛び弱 ===== */
    if(!this._inULT && input.edge.p && this.skill3CDT<=0){
      input.edge.p=false;
      this._startSkill3_DrillLoop();
    }

    /* ===== Skill4（AIR）：列挙シーケンス、全Hit（20）・強吹っ飛び ===== */
    if(!this._inULT && input.edge.air && this.skill4CDT<=0){
      input.edge.air=false;
      this._startSkill4_AirRush();
    }

    /* ===== ULT：短押し=ULT1、長押し(>=1.0s)=ULT2 ===== */
    if(!this._inULT && this.ultCDT<=0 && (input.edge.ultPress || input.edge.ultRelease)){
      if(input.edge.ultRelease){
        const t = input.ultChargeT||0;
        input.edge.ultPress=false; input.edge.ultRelease=false; input.btn.ult=false;
        if(t>=1.0){ this._startULT2_PKCombo(); } else { this._startULT_RushCombo(); }
        input.ultChargeT=0;
      }
    }

    // 実行中のアクション
    if(this.state==='atk'||this.state==='skill'||this.state==='skill2'||this.state==='skill3'||this.state==='skill4'||this.state==='ult'){
      const hb=this.currentHitbox();
      if(hb){
        // 敵に当てる
        for(const e of enemies){
          if(!e || e.dead || e.invulnT>0) continue;
          if(rectsOverlap({x:hb.x,y:hb.y,w:hb.w,h:hb.h}, e.aabb())){
            const hit=e.hurt(hb.power, hb.dir, {lift:hb.lift, kbMul:hb.kbMul, kbuMul:hb.kbuMul}, this.effects);
            if(hit && rectsOverlap(this.aabb(), e.aabb())){ e.x = this.x + hb.dir*(this.w*0.55); }
          }
        }
      }
      const dt2 = (this._inULT ? dt*this._ultSpeed : dt);
      this._updateAction(dt2,world,input);
      world.updateTimer(dt);
      return;
    }

    // === 通常時の入力 ===
    if(!this._inULT){
      // A1（最優先）
      if(input.edge.a1 || input.btn.a1){
        if(this.comboStep>=3 && this.comboGraceT<=0){ this.comboStep=0; }
        this.bufferA1=false;
        this._startA1();
        return;
      }
      if(input.edge.a2Press && this.a2LockoutT<=0){ input.edge.a2Press=false; this._startA2(); return; }
    }

    // 通常移動
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

  /* ---------- 通常アクション（据え置き） ---------- */
  _startA1(){
    this.state='atk'; this.animT=0; this.comboStep=Math.min(this.comboStep+1,3);
    const seq=[ {kind:'prep',dur:0.08,frame:'k1prep',fx:80,power:0} ];
    let frame='k1a', power=6, fx=140;
    if(this.comboStep===2){ frame='k1b'; power=9; fx=170; }
    else if(this.comboStep===3){ frame='k1c'; power=12; fx=200; }
    seq.push({kind:'hit',dur:0.20,frame,fx,power, kbMul:1.0, kbuMul:1.0});
    this._actionSeq=seq; this._actionIndex=0; this._actionTime=0;
    this.comboGraceT=0;
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
      {kind:'hit', dur:0.24,frame:'k1c',fx:280,power:50, lift:1.0, kbMul:1.2, kbuMul:1.2}
    ];
    this._actionSeq=seq; this._actionIndex=0; this._actionTime=0;
    this._chaseEnabled=false; this._chaseConsumed=true;
    this.a2LockoutT=0.6;
  }

  // S1：8回転＋高速（据え置き）
  _startSkill1FixedTurns(turns=8, opts={speed:1.0}){
    this.state='skill'; this.animT=0; this.skillCDT=5.0;
    const frames=this.frames.spin;
    const base=26; const kbm=1.8, kbum=1.4;
    const speed=Math.max(0.5, opts.speed||1.0);
    const step=0.06/speed;
    const seq=[];
    for(let r=0;r<turns;r++){
      for(let i=0;i<frames.length;i++){
        const pow=base*(i===1?1:0.6), lift=(i===1?1:0);
        seq.push({kind:'sp',dur:step,frame:frames[i],fx:80,power:pow,lift, kbMul:kbm, kbuMul:kbum});
      }
    }
    this._actionSeq=seq; this._actionIndex=0; this._actionTime=0;
    this._showGauge(false);
  }

  /* ====== 新規：Skill2（◎） 高速回転（tms1→…→tms6）x3 ====== */
  _startSkill2_TornadoTriple(){
    this.state='skill2'; this.animT=0; this.skill2CDT=8.0;
    const fs=['tms1','tms2','tms3','tms4','tms5','tms6'];
    const seq=[];
    for(let loop=0; loop<3; loop++){
      for(let i=0;i<fs.length;i++){
        const hard = (fs[i]==='tms6');
        seq.push({
          kind:'hit',
          dur: hard?0.12:0.08,
          frame:fs[i],
          fx: hard? 220: 140,
          power: hard? 20: 10,
          lift: hard? 1.0: 0.2,
          kbMul: hard? 1.25: 0.9,
          kbuMul: hard? 1.25: 0.9
        });
      }
    }
    this._actionSeq=seq; this._actionIndex=0; this._actionTime=0;
    this.saT = 0.2;
  }

  /* ====== 新規：Skill3（P） ドリル：dr1-4(導入) → dr5-8 x3 ====== */
  _startSkill3_DrillLoop(){
    this.state='skill3'; this.animT=0; this.skill3CDT=10.0;
    const intro=['dr1','dr2','dr3','dr4'];
    const loop=['dr5','dr6','dr7','dr8'];
    const seq=[];
    for(const f of intro){ seq.push({kind:'hit',dur:0.08,frame:f,fx:120,power:15, lift:0.2, kbMul:0.85, kbuMul:0.85}); }
    for(let r=0;r<3;r++){
      for(const f of loop){ seq.push({kind:'hit',dur:0.08,frame:f,fx:150,power:15, lift:0.25, kbMul:0.85, kbuMul:0.85}); }
    }
    this._actionSeq=seq; this._actionIndex=0; this._actionTime=0;
    this.saT=0.18;
  }

  /* ====== 新規：Skill4（AIR） 高速技：列挙・全Hit（20）強め吹き飛び ====== */
  _startSkill4_AirRush(){
    this.state='skill4'; this.animT=0; this.skill4CDT=6.0;
    const order=['air1','air2','air3','air4','air5','air2','air3','air4','air5','air2','air3','air4','air5'];
    const seq=[];
    for(const f of order){
      seq.push({kind:'hit', dur:0.06, frame:f, fx:200, power:20, lift:0.8, kbMul:1.2, kbuMul:1.2});
    }
    this._actionSeq=seq; this._actionIndex=0; this._actionTime=0;
    this.saT=0.22;
  }

  /* ===== ULT1（既存：Rush A1R→S1→S2） ===== */
  _startULT_RushCombo(){
    this._inULT=true;
    this._ultQueue=['A1R','S1','S2'];
    this._ultPhase=''; this._ultTimer=0; this._ultLockInput=true;
    this.ultCDT=6.0; this.saT=0.5;
    this.state='ult'; this.animT=0;
    this.effects.addSpark(this.x + this.face*10, this.y-14, true);
    this._advanceULTPhase();
  }
  _advanceULTPhase(){
    const next=this._ultQueue?.shift();
    this._ultPhase = next || '';
    if(!next){ this._finishULT(); return; }
    if(next==='A1R'){ this._startA1RushSequence(); return; }
    if(next==='S1'){ this._startSkill1FixedTurns(8, {speed:1.5}); return; }
    if(next==='S2'){ this._startSkill2_TornadoTriple(); return; }
  }
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
    this.saT = Math.max(this.saT, 0.1);
    this._ultTimer += dt;
    if(this._ultTimer >= this._ultTimeLimit){ this._finishULT(); return; }
    if(!this._actionSeq){ this._advanceULTPhase(); }
  }
  _finishULT(){
    this._inULT=false; this._ultQueue=null; this._ultPhase=''; this._ultTimer=0; this._ultLockInput=false;
    this.vx=0; this.state='idle';
    this.effects.shake(0.18,8); this.effects.addSpark(this.x + this.face*16, this.y-18, true);
    this.bufferA1=false; this.comboStep=0; this.comboGraceT=0; this.a2LockoutT=0;
  }

  /* ===== 新規：ULT2（長押し） PK1..PK8 指示通りの挙動 ===== */
  _startULT2_PKCombo(){
    this._inULT=true; this.state='ult'; this.animT=0; this._ultLockInput=true;
    this.ultCDT=10.0; this.saT=0.6; this._ultTimer=0; this._ultTimeLimit=7.0;

    // 指定：PK1(威20) → PK2(小震え前進) → PK3(威30少し前進) → PK4→PK5(威50) → PK6→PK7(威80超ぶっ飛ばし) → PK8(1秒硬直)
    const seq=[
      {kind:'hit', dur:0.14, frame:'pk1', fx:160, power:20, lift:0.3, kbMul:1.0, kbuMul:1.0},
      {kind:'pose',dur:0.18, frame:'pk2', fx:220, power:0,   shake:0.05},
      {kind:'hit', dur:0.16, frame:'pk3', fx:220, power:30,  lift:0.6, kbMul:1.05, kbuMul:1.05},
      {kind:'pose',dur:0.10, frame:'pk4', fx:120, power:0},
      {kind:'hit', dur:0.16, frame:'pk5', fx:240, power:50,  lift:0.9, kbMul:1.15, kbuMul:1.15},
      {kind:'pose',dur:0.10, frame:'pk6', fx:160, power:0},
      {kind:'hit', dur:0.20, frame:'pk7', fx:280, power:80,  lift:1.4, kbMul:1.4,  kbuMul:1.4}, // 超ぶっ飛ばし
      {kind:'pose',dur:1.00, frame:'pk8', fx:0,   power:0}   // 1秒硬直
    ];
    this._actionSeq=seq; this._actionIndex=0; this._actionTime=0;
  }

  /* ---------- 共通アクション進行 ---------- */
  _updateAction(dt,world,input){
    const cur=this._actionSeq?.[this._actionIndex];

    if(this.state==='skill2' || this.state==='skill3' || this.state==='skill4'){
      this.saT = Math.max(this.saT, 0.08);
    }

    if(cur?.fx){ this.x += this.face * cur.fx * dt; }
    if(cur?.shake){ this.world.effects.shake(cur.shake, 6); }

    // 追撃窓（通常のみ）
    if(this._actionSeq && this.state==='atk' && cur?.after==='enableChase' && !this._inULT){
      this._chaseWindowT = (this._chaseWindowT||0) + dt;
      if(this._chaseWindowT>0.18 && !this._chaseEnabled){ this._chaseEnabled=true; }
      if(this._chaseEnabled && input.edge.a2Press && !this._chaseConsumed){
        input.edge.a2Press=false; this._startA2Chase(); return;
      }
    }

    if((this.state==='skill2' || this.state==='skill3' || this.state==='skill4' || this.state==='ult') && cur){
      const ox=Math.sin(performance.now()/25)*2; this._shakeOX = ox;
    } else this._shakeOX=0;

    this.vx = 0; this.updatePhysics(dt);

    if(this._actionSeq){
      this._actionTime+=dt;
      if(this._actionTime>=cur.dur){
        this._actionIndex++; this._actionTime=0;
        if(this._actionIndex>=this._actionSeq.length){
          if(this.state==='atk' && this.comboStep>0 && !this._inULT){
            this.comboGraceT=this.comboGraceMax;
          }
          if(!this._inULT) this.state='idle';
          this._actionSeq=null;
          if(this._inULT && this._ultQueue){ /* ULT1の次フェーズへ */ }
          else if(this._inULT && !this._ultQueue){ this._finishULT(); }
        }
      }
    }
    this.animT+=dt;
  }

  _respawn(world){
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
    else if((this.state==='atk'||this.state==='skill'||this.state==='skill2'||this.state==='skill3'||this.state==='skill4'||this.state==='ult') && this._actionSeq){
      const cur=this._actionSeq[this._actionIndex]; const key=cur.frame; img=this.world.assets.img(this.frames[key]?this._getFramePath(key,0):key);
    } else img=this._imgByKey('idle',0);

    if(img){
      const scale=this.h/img.height, w=img.width*scale, h=this.h;
      ctx.imageSmoothingEnabled=false; ctx.drawImage(img, Math.round(-w/2+ox), Math.round(-h/2), Math.round(w), Math.round(h));
    }
    ctx.restore();
  }

  // 被弾
  hurt(amount,dir,opts,effects){
    if(this._inULT){
      const safeOpts = {...(opts||{}), kbMul:0, kbuMul:0};
      const hit = CharacterBase.prototype.hurt.call(this,amount,dir,safeOpts,effects);
      if(hit && !this.dead){
        this.state='ult';
        this.invulnT = Math.max(this.invulnT, 0.08);
      }
      const fill=document.getElementById('hpfill'); const num=document.getElementById('hpnum');
      if(fill&&num){ num.textContent=this.hp; fill.style.width=Math.max(0,Math.min(100,(this.hp/this.maxhp)*100))+'%'; }
      return hit;
    }

    if(this.state==='skill2'||this.state==='skill3'||this.state==='skill4' || this.saT>0){ opts = {...(opts||{}), kbMul:0.2, kbuMul:0.2}; }
    const hit = CharacterBase.prototype.hurt.call(this,amount,dir,opts,effects);
    if(hit){
      const fill=document.getElementById('hpfill'); const num=document.getElementById('hpnum');
      if(fill&&num){ num.textContent=this.hp; fill.style.width=Math.max(0,Math.min(100,(this.hp/this.maxhp)*100))+'%'; }
      this.bufferA1=false; this.comboStep=0; this.comboGraceT=0; this.a2LockoutT=0;

      if(!(this.state==='skill2'||this.state==='skill3'||this.state==='skill4')){
        this._actionSeq=null; this._actionIndex=0; this._actionTime=0;
        this.overhead?.root && (this.overhead.root.style.display='none');
        this.jumpsLeft=this.maxJumps;
        this.state='idle';
      }
    }
    return hit;
  }
}

/* =============== export =============== */
window.__Actors__ = Object.assign({}, window.__Actors__||{}, { Player });

})();
