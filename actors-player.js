// actors-player.js — Player (skills revamp)
(function(){
'use strict';

const {
  Effects, Assets, Input, CharacterBase,
  Projectile, EnergyBall, UltBlast, GroundSpike,
  constants:{ STAGE_LEFT, STAGE_RIGHT, WALL_PAD, GRAV, MOVE, JUMP_V, MAX_FALL, GROUND_TOP_Y, FOOT_PAD },
  utils:{ clamp, lerp, now, rectsOverlap }
} = window.__GamePieces__;

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

    // 既存
    this.skillCDT=0;   // ●（長押し）
    this.skill2CDT=0;  // ◎（その場回転SA）
    this.ultCDT=0;     // U1
    // 追加
    this.pCDT=0;       // P回転
    this.airCDT=0;     // A（高速SA）
    this.ult2CDT=0;    // U2

    this.saT=0;
    this.isUltCharging=false;

    this.frames={
      idle:['M1-1.png'],
      run:['M1-2.png','M1-3.png','M1-4.png','M1-3.png'],
      k1prep:'K1-3.png', k1a:'K1-1.png', k1b:'K1-2.png', k1c:'K1-4.png',
      k2prep:'K1-3.png', k2:'K1-5.png',
      spin:['h1.png','h2.png','h3.png','h4.png'],
      chaseJump:'J.png',
      y1:'Y1.png', y2:'Y2.png', y3:'Y3.png', y4:'Y4.png',
      ul1:'UL1.PNG', ul2:'UL2.PNG', ul3:'UL3.png',

      // 新規アニメ
      tms:['tms1.png','tmsA.png','tms2.png','tms3.png','tms4.png','tmsA.png','tms5.png','tms6.png'],
      drIn:['dr1.png','dr2.png','dr3.png','dr4.png'],
      drLp:['dr5.png','dr6.png','dr7.png','dr8.png'],
      airSeq:[ // 指定順に完全一致
        'air1.png','air2.png','air3.png','airA.png','air4.png','air5.png',
        'air2.png','air3.png','airA.png','air4.png','air5.png',
        'air2.png','air3.png','airA.png','air4.png','air5.png',
        'air1.png','air2.png','air3.png','airA.png','air4.png','air5.png',
        'air2.png','air3.png','airA.png','air4.png','air5.png',
        'air2.png','air3.png','airA.png','air4.png','air5.png'
      ],
      pk:['PK1.png','PK2.png','PK3.png','PK4.png','PK5.png','PK6.png','PK7.png','PK8.png']
    };
    this.overhead=this._createOverheadGauge();
    document.querySelector('.gamewrap').appendChild(this.overhead.root);

    this._activeSpikes=null;
  }
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

  currentHitbox(){
    if(!(this.state==='atk'||this.state==='skill'||this.state==='skill2'||this.state==='skillP'||this.state==='air'||this.state==='ult'||this.state==='ult2') || !this._actionSeq) return null;
    const cur=this._actionSeq[this._actionIndex]; if(!cur) return null;
    // 汎用：広め（回転/高速でも拾える）
    const W=86,H=64; const x=this.x + this.face*(this.w*0.2);
    return {x, y:this.y, w:W, h:H, power:cur.power||0, dir:this.face, lift:cur.lift||0, kbMul:cur.kbMul||1.6, kbuMul:cur.kbuMul||1.3, tag:cur.tag||''};
  }

  /* ====== UPDATE ====== */
  update(dt,input,world,enemies){
    input.beginFrame(); this._posOverhead();
    if(this.saT>0) this.saT=Math.max(0,this.saT-dt);

    if(this.state!=='atk' && this.state!=='skill' && this.state!=='skill2' && this.state!=='skillP' && this.state!=='air' && this.state!=='ult' && this.state!=='ult2' && this._actionSeq){ this._actionSeq=null; }
    if(this.a2LockoutT>0) this.a2LockoutT=Math.max(0,this.a2LockoutT-dt);

    // UI ボタン（存在すれば有効/無効）
    const skBtn = document.getElementById('btnSK');
    const sk2Btn= document.getElementById('btnSK2');  // ◎
    const pBtn  = document.getElementById('btnP');
    const airBtn= document.getElementById('btnAIR');
    const ultBtn= document.getElementById('btnULT');  // U1
    const u2Btn = document.getElementById('btnULT2'); // U2

    if(this.skillCDT>0){ this.skillCDT=Math.max(0,this.skillCDT-dt); skBtn?.setAttribute('disabled',''); } else skBtn?.removeAttribute('disabled');
    if(this.skill2CDT>0){ this.skill2CDT=Math.max(0,this.skill2CDT-dt); sk2Btn?.setAttribute('disabled',''); } else sk2Btn?.removeAttribute('disabled');
    if(this.pCDT>0){ this.pCDT=Math.max(0,this.pCDT-dt); pBtn?.setAttribute('disabled',''); } else pBtn?.removeAttribute('disabled');
    if(this.airCDT>0){ this.airCDT=Math.max(0,this.airCDT-dt); airBtn?.setAttribute('disabled',''); } else airBtn?.removeAttribute('disabled');
    if(this.ultCDT>0){ this.ultCDT=Math.max(0,this.ultCDT-dt); ultBtn?.setAttribute('disabled',''); } else ultBtn?.removeAttribute('disabled');
    if(this.ult2CDT>0){ this.ult2CDT=Math.max(0,this.ult2CDT-dt); u2Btn?.setAttribute('disabled',''); } else u2Btn?.removeAttribute('disabled');

    if(this.dead){ this.updatePhysics(dt); if(this.fade<=0){ this._respawn(world); } world.updateTimer(dt); return; }

    // ● スキル1（長押し）既存
    if(input.skillCharging && this.skillCDT<=0){
      input.skillChargeT=Math.min(1.0, input.skillChargeT+dt);
      this._showGauge(true,'● Charge', input.skillChargeT/1.0);
      this.saT = 0.08;
    }
    // ULT①：溜めながら移動可
    this.isUltCharging = input.ultCharging && this.ultCDT<=0;
    if(this.isUltCharging){
      input.ultChargeT = Math.min(3, input.ultChargeT + dt);
      this._showGauge(true,'U Charge', input.ultChargeT/3);
      this.saT = 0.12;
    }

    // リリース
    if(input.edge.skillRelease && input.skillChargeT>0 && this.skillCDT<=0){
      this._startSkill1Release(input.skillChargeT);
      input.skillChargeT=0; input.edge.skillRelease=false;
    }
    if(input.edge.ultRelease && input.ultChargeT>0 && this.ultCDT<=0){
      this._releaseULT(input.ultChargeT); // ULT①（演出少し延長）
      input.ultChargeT=0; input.edge.ultRelease=false;
    }

    // 実行中
    if(['atk','skill','skill2','skillP','air','ult','ult2'].includes(this.state)){
      const hb=this.currentHitbox();
      if(hb){
        for(const e of enemies){
          if(!e || e.dead || e.invulnT>0) continue;
          if(rectsOverlap({x:hb.x,y:hb.y,w:hb.w,h:hb.h}, e.aabb())){
            const hit = e.hurt(hb.power, hb.dir, {lift:hb.lift, kbMul:hb.kbMul, kbuMul:hb.kbuMul}, this.effects);
            // スピン退避（非SAの敵のみ）
            if(hit && (this.state==='skill2' || this.state==='air')){
              if(!e.superArmor){ e._twirlT = Math.max(e._twirlT||0, 0.45); }
            }
          }
        }
      }
      this._updateAction(dt,world,input);
      world.updateTimer(dt);
      return;
    }

    // 入力
    if(input.edge.a1) this.bufferA1=true;

    // 起動優先（新ボタン）
    if(input.edge.air && this.airCDT<=0){ input.edge.air=false; this.bufferA1=false; this._startAIR(); return; }
    if(input.edge.p && this.pCDT<=0){ input.edge.p=false; this.bufferA1=false; this._startP(); return; }
    if(input.edge.skill2 && this.skill2CDT<=0){ input.edge.skill2=false; this.bufferA1=false; this._startSpinSkill2(); return; }
    if(input.edge.ult2 && this.ult2CDT<=0){ input.edge.ult2=false; this.bufferA1=false; this._startULT2(); return; }

    if(input.edge.a2Press && this.a2LockoutT<=0){ input.edge.a2Press=false; this.bufferA1=false; this._startA2(); return; }
    if(this.bufferA1 && this.comboStep<3){ this.bufferA1=false; this._startA1(); return; }

    // 通常移動/ジャンプ
    let ax=0; if(input.left){ ax-=MOVE; this.face=-1; } if(input.right){ ax+=MOVE; this.face=1; }
    this.vx = ax!==0 ? (ax>0?MOVE:-MOVE) : 0;
    if(input.consumeJump() && this.jumpsLeft>0){ this.vy=-JUMP_V; this.onGround=false; this.jumpsLeft--; }
    this.updatePhysics(dt);
    if(this.onGround) this.jumpsLeft=this.maxJumps;
    this.state = !this.onGround ? 'jump' : (Math.abs(this.vx)>1?'run':'idle');

    if(!(input.skillCharging||this.isUltCharging)) this._showGauge(false);
    world.updateTimer(dt);
  }

  /* ===== A1/A2 remain (略) ===== */
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

  /* ===== ●（既存） ===== */
  _startSkill1Release(chargeSec){
    this.state='skill'; this.animT=0; this.skillCDT=5.0;
    const t=clamp(chargeSec,0,1.0);
    const rounds = 2 + Math.floor(t/0.33);
    const base   = 26 + Math.floor(t/0.1)*2;
    const kbm  = 1.6 + 0.1*(rounds-2);
    const kbum = 1.3 + 0.05*(rounds-2);
    const frames=this.frames.spin; const seq=[];
    for(let r=0;r<rounds;r++){
      for(let i=0;i<frames.length;i++){
        const pow = base*(i===1?1:0.6); const lift=(i===1?1:0);
        seq.push({kind:'sp',dur:0.06,frame:frames[i],fx:80,power:pow,lift, kbMul:kbm, kbuMul:kbum});
      }
    }
    this._actionSeq=seq; this._actionIndex=0; this._actionTime=0;
    this._showGauge(false);
  }

  /* ===== ◎ スキル②（その場高速回転・SA） ===== */
  _startSpinSkill2(){
    if(this.skill2CDT>0) return;
    this.state='skill2'; this.animT=0; this.skill2CDT=8.0;
    this._skill2SAT = 1.6; // SA維持時間
    // tms1→tmsA→tms2→tms3→tms4→tmsA→tms5→tms6 を3ループ
    const order=this.frames.tms;
    const seq=[];
    for(let loop=0; loop<3; loop++){
      for(let i=0;i<order.length;i++){
        const f=order[i];
        const isFin = (f==='tms6.png'||f==='tms6'); // 最後のコマでぶっ飛ばし超強
        seq.push({
          kind:'hit', dur:0.08, frame:f, fx:0,
          power: isFin? 20:10,
          lift:  1.0,
          kbMul: isFin? 2.0:1.6,
          kbuMul:isFin? 1.7:1.4,
          tag:'spin2'
        });
      }
    }
    this._actionSeq=seq; this._actionIndex=0; this._actionTime=0;
    this.saT = 1.6;
  }

  /* ===== P スキル③（回転2） ===== */
  _startP(){
    if(this.pCDT>0) return;
    this.state='skillP'; this.animT=0; this.pCDT=9.0;
    const seq=[];
    // 入り
    for(const f of this.frames.drIn){ seq.push({kind:'hit',dur:0.08,frame:f,fx:80,power:15, lift:0.2, kbMul:0.9, kbuMul:0.9}); }
    // ループ 4回
    for(let loop=0; loop<4; loop++){
      for(const f of this.frames.drLp){ seq.push({kind:'hit',dur:0.07,frame:f,fx:120,power:15, lift:0.2, kbMul:0.9, kbuMul:0.9}); }
    }
    this._actionSeq=seq; this._actionIndex=0; this._actionTime=0;
  }

  /* ===== A スキル④（高速・SA、順序完全一致） ===== */
  _startAIR(){
    if(this.airCDT>0) return;
    this.state='air'; this.animT=0; this.airCDT=12.0;
    const seq=[];
    const arr=this.frames.airSeq;
    for(let i=0;i<arr.length;i++){
      const f=arr[i];
      seq.push({
        kind:'hit', dur:0.06, frame:f, fx:220,    // 高速
        power:30, lift:0.8,
        kbMul:1.9, kbuMul:1.7,
        tag:'air'
      });
    }
    this._actionSeq=seq; this._actionIndex=0; this._actionTime=0;
    this.saT = 1.8; // 発動中SA
  }

  /* ===== ULT①（演出延長） ===== */
  _releaseULT(chargeSec){
    if(this.ultCDT>0) return;
    this.state='ult'; this.animT=0;
    this._actionSeq=[
      {kind:'pose',dur:0.20,frame:'ul2',fx:40},  // 0.20 に延長
      {kind:'post',dur:0.55,frame:'ul2',fx:20}   // 0.55 に延長（着地余韻）
    ];
    this._actionIndex=0; this._actionTime=0;

    this.ultCDT=3.0; // CT 3秒（据え置き）

    const img=this.world.assets.img(this.frames.ul3);
    const ox=this.face*30, oy=-12;
    const blast=new UltBlast(this.world, this.x+ox, this.y+oy, this.face, img, chargeSec);
    (this.world._skillBullets||(this.world._skillBullets=[])).push(blast);
    this.saT=0;
    this._showGauge(false);
    this.effects.addSpark(this.x+ox, this.y-14, true);
  }

  /* ===== ULT② ===== */
  _startULT2(){
    if(this.ult2CDT>0) return;
    this.state='ult2'; this.animT=0; this.ult2CDT=12.0;
    const pk=this.frames.pk;
    // PK1(20) -> PK2(前進小揺れ) -> PK3(30) -> PK4->PK5(50) -> PK6->PK7(80,超ぶっ飛ばし) -> PK8(1s硬直)
    this._actionSeq=[
      {kind:'hit', dur:0.10, frame:pk[0], fx:120, power:20, lift:0.4, kbMul:1.1, kbuMul:1.0},
      {kind:'pose',dur:0.16, frame:pk[1], fx:140, power:0},
      {kind:'hit', dur:0.12, frame:pk[2], fx:160, power:30, lift:0.6, kbMul:1.2, kbuMul:1.1},
      {kind:'pose',dur:0.10, frame:pk[3], fx:100, power:0},
      {kind:'hit', dur:0.12, frame:pk[4], fx:180, power:50, lift:0.8, kbMul:1.4, kbuMul:1.2},
      {kind:'pose',dur:0.10, frame:pk[5], fx:120, power:0},
      {kind:'hit', dur:0.18, frame:pk[6], fx:220, power:80, lift:1.4, kbMul:2.2, kbuMul:1.9, tag:'u2fin'},
      {kind:'pose',dur:1.00, frame:pk[7], fx:0, power:0}
    ];
    this._actionIndex=0; this._actionTime=0;
  }

  _updateAction(dt,world,input){
    const cur=this._actionSeq?.[this._actionIndex];

    if(this.state==='skill2' || this.state==='air'){
      this.saT = Math.max(this.saT, 0.06); // 発動中は常に少しSA
    }

    if(cur?.fx){ this.x += this.face * cur.fx * dt; }

    this.vx = 0; this.updatePhysics(dt);

    if(this._actionSeq){
      this._actionTime+=dt;
      if(this._actionTime>=cur.dur){
        this._actionIndex++; this._actionTime=0;
        if(this._actionIndex>=this._actionSeq.length){
          if(this.state==='atk' && this.comboStep>0){ this.comboGraceT=this.comboGraceMax; if(this.comboStep>=3){ this.comboStep=0; this.bufferA1=false; } }
          if(this.state==='skill2'){ this._activeSpikes=null; }
          this.state='idle'; this._actionSeq=null;
        }
      }
    }
    this.animT+=dt;
  }

  _respawn(world){
    this.dead=false; this.fade=1; this.spinAngle=0; this.spinSpeed=0;
    this.state='idle'; this.comboStep=0; this.comboGraceT=0; this.bufferA1=false;
    this.invulnT=0.6; this.hp=this.maxhp;
    const fill=document.getElementById('hpfill'); const num=document.getElementById('hpnum');
    if(fill&&num){ fill.style.width='100%'; num.textContent=this.hp; }
    this.x=world.camX+80; this.y=Math.floor(GROUND_TOP_Y)-this.h/2+FOOT_PAD; this.vx=0; this.vy=0;
    this.jumpsLeft=this.maxJumps; this.saT=0; this._activeSpikes=null; this.isUltCharging=false;
  }

  draw(ctx,world){
    ctx.save(); ctx.translate(this.x-world.camX, this.y-world.camY);
    if(this.dead){ ctx.globalAlpha=this.fade; ctx.rotate(this.spinAngle); }
    if(this.face<0 && !this.dead) ctx.scale(-1,1);

    let img=null, ox=0;
    if(this.state==='idle'){ img=this._imgByKey('idle',0); }
    else if(this.state==='run'){
      const speed=Math.abs(this.vx);
      const rate = lerp(6, 11, clamp(speed/MOVE, 0, 1));
      const i=Math.floor(this.animT*rate)%this.frames.run.length;
      img=this._imgByKey('run',i);
    }
    else if(this.state==='jump'){ img=this._imgByKey('run',0); }
    else if(['atk','skill','skill2','skillP','air','ult','ult2'].includes(this.state) && this._actionSeq){
      const cur=this._actionSeq[this._actionIndex]; const key=cur.frame; img=this.world.assets.img(this.frames[key]?this._getFramePath(key,0):key);
    } else img=this._imgByKey('idle',0);

    if(img){
      const scale=this.h/img.height, w=img.width*scale, h=this.h;
      ctx.imageSmoothingEnabled=false; ctx.drawImage(img, Math.round(-w/2+ox), Math.round(-h/2), Math.round(w), Math.round(h));
    }

    if(this.isUltCharging){
      const holder=this.world.assets.img(this.frames.ul1);
      if(holder){
        const scale=this.h/holder.height, w=holder.width*scale, h=this.h;
        ctx.save(); if(this.face<0) ctx.scale(-1,1);
        ctx.globalAlpha=0.95; ctx.drawImage(holder, Math.round(-w/2), Math.round(-h/2), Math.round(w), Math.round(h));
        ctx.restore();
      }
      const ul3=this.world.assets.img(this.frames.ul3);
      if(ul3){
        const t=Math.min(3, (window._inputUltT||0));
        const mul = lerp(0.35, 1.6, clamp(t/3.0,0,1));
        const hh=60*mul, ww=60*mul; const oxh = this.face*26, oyh=-14;
        ctx.save(); ctx.translate(oxh, oyh); if(this.face<0) ctx.scale(-1,1); ctx.globalAlpha=0.95; ctx.drawImage(ul3, Math.round(-ww/2), Math.round(-hh/2), Math.round(ww), Math.round(hh)); ctx.restore();
      }
    }
    ctx.restore();
  }

  // ▼Baseのhurtを上書き
  hurt(amount,dir,opts,effects){
    if(this.state==='skill2' || this.state==='air'){ opts = {...(opts||{}), kbMul:0.1, kbuMul:0.1}; } // SA中はのけ反り激減
    else if(this.saT>0){ opts = {...(opts||{}), kbMul:0.1, kbuMul:0.1}; }

    const hit = CharacterBase.prototype.hurt.call(this,amount,dir,opts,effects);
    if(hit){
      const fill=document.getElementById('hpfill'); const num=document.getElementById('hpnum');
      if(fill&&num){ num.textContent=this.hp; fill.style.width=Math.max(0,Math.min(100,(this.hp/this.maxhp)*100))+'%'; }
      if(!(this.state==='skill2' || this.state==='air')){
        this._actionSeq = null; this._actionIndex = 0; this._actionTime = 0;
        this.bufferA1 = false; this.comboStep = 0; this.comboGraceT = 0; this.a2LockoutT = 0;
        this.overhead?.root && (this.overhead.root.style.display='none');
        this.jumpsLeft=this.maxJumps;
        this.isUltCharging=false;
      }
    }
    return hit;
  }
}

window.__Actors__ = Object.assign({}, window.__Actors__||{}, { Player });

})();
