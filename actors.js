// actors.js — Player & Enemies
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
    this.skillCDT=0; this.skill2CDT=0; this.ultCDT=0;

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
      ul1:'UL1.PNG', ul2:'UL2.PNG', ul3:'UL3.png'
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
  update(dt,input,world,enemies){
    input.beginFrame(); this._posOverhead();
    if(this.saT>0) this.saT=Math.max(0,this.saT-dt);

    if(this.state!=='atk' && this.state!=='skill' && this.state!=='skill2' && this.state!=='ult' && this._actionSeq){ this._actionSeq=null; }
    if(this.a2LockoutT>0) this.a2LockoutT=Math.max(0,this.a2LockoutT-dt);

    const skBtn=document.getElementById('btnSK'); const sk2Btn=document.getElementById('btnSK2'); const ultBtn=document.getElementById('btnULT');
    if(this.skillCDT>0){ this.skillCDT=Math.max(0,this.skillCDT-dt); skBtn.setAttribute('disabled',''); } else skBtn.removeAttribute('disabled');
    if(this.skill2CDT>0){ this.skill2CDT=Math.max(0,this.skill2CDT-dt); sk2Btn.setAttribute('disabled',''); } else sk2Btn.removeAttribute('disabled');
    if(this.ultCDT>0){ this.ultCDT=Math.max(0,this.ultCDT-dt); ultBtn.setAttribute('disabled',''); } else ultBtn.removeAttribute('disabled');

    if(this.dead){ this.updatePhysics(dt); if(this.fade<=0){ this._respawn(world); } world.updateTimer(dt); return; }

    // ● スキル1チャージ
    if(input.skillCharging && this.skillCDT<=0){
      input.skillChargeT=Math.min(1.0, input.skillChargeT+dt);
      this._showGauge(true,'● Charge', input.skillChargeT/1.0);
      this.saT = 0.08;
    }
    // ULT：溜めながら移動可
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
      this._releaseULT(input.ultChargeT);
      input.ultChargeT=0; input.edge.ultRelease=false;
    }

    // 実行中（ultChargeは含めない）
    if(this.state==='atk'||this.state==='skill'||this.state==='skill2'||this.state==='ult'){
      const hb=this.currentHitbox();
      if(hb){
        for(const e of enemies){
          if(!e || e.dead || e.invulnT>0) continue;
          if(rectsOverlap({x:hb.x,y:hb.y,w:hb.w,h:hb.h}, e.aabb())){
            const hit = e.hurt(hb.power, hb.dir, {lift:hb.lift, kbMul:hb.kbMul, kbuMul:hb.kbuMul}, this.effects);
            if(hit && rectsOverlap(this.aabb(), e.aabb())){ e.x = this.x + hb.dir * (this.w*0.55); }
            if(hit && this.state==='atk' && this._actionSeq && this._actionSeq[this._actionIndex]?.tag==='chaseFinisher'){
              this.effects.addSpark(e.x, e.y-10, true);
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

    // 起動優先
    if(input.edge.skill2 && this.skill2CDT<=0){ input.edge.skill2=false; this.bufferA1=false; this._startSkill2(); return; }
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
  _startSkill2(){
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
      const off=68;
      const L=new GroundSpike(this.world, this.x - off, -1, kem);
      const R=new GroundSpike(this.world, this.x + off,  1, kem);
      (this.world._skillBullets||(this.world._skillBullets=[])).push(L,R);
      this._activeSpikes=[L,R];
      this.effects.shake(0.12,6);
    }
  }
  _releaseULT(chargeSec){
    if(this.ultCDT>0) return;
    this.state='ult'; this.animT=0;
    this._actionSeq=[
      {kind:'pose',dur:0.10,frame:'ul2',fx:40},
      {kind:'post',dur:0.22,frame:'ul2',fx:20}
    ];
    this._actionIndex=0; this._actionTime=0;

    this.ultCDT=3.0; // CT 3秒

    const img=this.world.assets.img(this.frames.ul3);
    const ox=this.face*30, oy=-12;
    const blast=new UltBlast(this.world, this.x+ox, this.y+oy, this.face, img, chargeSec);
    (this.world._skillBullets||(this.world._skillBullets=[])).push(blast);
    this.saT=0;
    this._showGauge(false);
    this.effects.addSpark(this.x+ox, this.y-14, true);
  }
  _updateAction(dt,world,input){
    const cur=this._actionSeq?.[this._actionIndex];

    if(this.state==='skill2'){
      this._skill2SAT = Math.max(0, this._skill2SAT - dt);
      this.saT = Math.max(this.saT, 0.08);
    }

    if(cur?.fx){ this.x += this.face * cur.fx * dt; }

    if(this._actionSeq && this.state==='atk' && cur?.after==='enableChase'){
      this._chaseWindowT = (this._chaseWindowT||0) + dt;
      if(this._chaseWindowT>0.18 && !this._chaseEnabled){ this._chaseEnabled=true; }
      if(this._chaseEnabled && input.edge.a2Press && !this._chaseConsumed){
        input.edge.a2Press=false; this._startA2Chase(); return;
      }
    }

    if((this.state==='skill2' && (cur.frame==='y4' || cur.kind==='emit')) || this.state==='ult'){
      const ox=Math.sin(performance.now()/25)*2; this._shakeOX = ox;
    } else this._shakeOX=0;

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

  // ▼Baseのhurtを上書き（スキル中はのけ反り軽減＋UI更新）
  hurt(amount,dir,opts,effects){
    if(this.state==='skill2'){ opts = {...(opts||{}), kbMul:0.1, kbuMul:0.1}; }
    else if(this.saT>0){ opts = {...(opts||{}), kbMul:0.1, kbuMul:0.1}; }

    const hit = CharacterBase.prototype.hurt.call(this,amount,dir,opts,effects);
    if(hit){
      const fill=document.getElementById('hpfill'); const num=document.getElementById('hpnum');
      if(fill&&num){ num.textContent=this.hp; fill.style.width=Math.max(0,Math.min(100,(this.hp/this.maxhp)*100))+'%'; }
      if(this.state!=='skill2'){
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

  // ★ 弱キャラは吹っ飛び強化
  hurt(amount, dir, opts={}, effects){
    const boomy = { kbMul: (opts.kbMul||1)*1.85, kbuMul:(opts.kbuMul||1)*1.65, lift:opts.lift };
    return super.hurt(amount, dir, boomy, effects);
  }

  update(dt,player){
    if(this.dead){ this.updatePhysics(dt); return; }
    if(this.cool>0) this.cool=Math.max(0,this.cool-dt);
    this.forceActT += dt;

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

    // ★ 1.6秒以上攻撃なしなら強制射撃
    if((this.cool<=0 && adx<=fire) || this.forceActT>=1.6){
      this._seq=[ {kind:'pose',dur:0.16,key:'prep1'}, {kind:'pose',dur:0.22,key:'prep2'} ];
      this.cool=1.3; this.state='atk'; this._idx=0; this._t=0; this.vx=0; this.forceActT=0;
      this.updatePhysics(dt); this.animT+=dt; return;
    }

    if(this.cool>0){
      if(adx<near){ this.vx = (dx>0? -backSp : backSp); }
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
  draw(ctx,world){
    ctx.save(); ctx.translate(this.x-world.camX, this.y-world.camY);
    if(this.dead){ ctx.globalAlpha=this.fade; ctx.rotate(this.spinAngle); }
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

  // ★ ボスでもスキル/ウルトは吹っ飛び強化（opts.kbMul が大きい時に受けやすく）
  hurt(amount, dir, opts={}, effects){
    const skillish = (opts.kbMul||1) >= 1.5;   // プレイヤーのskill/ultは kbMul が高い
    const kbMul = this.superArmor ? (skillish? 0.6 : 0.15) : (opts.kbMul||1);
    const kbuMul= this.superArmor ? (skillish? 0.5 : 0.10) : (opts.kbuMul||1);
    const o = {...opts, kbMul, kbuMul};
    return super.hurt(amount, dir, o, effects);
  }

  update(dt, player){
    if(this.dead){ this.updatePhysics(dt); return; }
    if(this.cool>0) this.cool=Math.max(0,this.cool-dt);
    if(this.recoverT>0){ this.recoverT=Math.max(0,this.recoverT-dt); }
    this.forceActT += dt;

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

    // ★ 強制行動: 1.4秒以上何もしなければ行動
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
  draw(ctx,world){
    if(this.state==='atk' && this._seq){
      this._t+=1/60; const cur=this._seq[this._idx];
      if(cur){ cur._t=(cur._t||0)+1/60; if(cur._t>=cur.dur){ this._idx++; if(this._idx>=this._seq.length){ this.state='dash'; this._t=0; this.vx = (this.face>0? 540 : -540); this._seq=null; } } }
    }
    ctx.save(); ctx.translate(this.x-world.camX, this.y-world.camY);
    if(this.dead){ ctx.globalAlpha=this.fade; ctx.rotate(this.spinAngle); }
    if(this.face<0 && !this.dead) ctx.scale(-1,1);
    let img=null, ox=0;
    if(this.state==='charge'){ img=this.img('charge'); ox=Math.sin(performance.now()/25)*1.5; }
    else if(this.state==='dash' || (this.state==='atk' && this._seq && this._seq[this._idx] && this._seq[this._idx].key==='dashAtk')){ img=this.img('dashAtk'); }
    else if(this.state==='atk' && this._seq){ const cur=this._seq[this._idx]; img=this.img(cur.key||'dashPrep'); ox=Math.sin(performance.now()/25)*2; }
    else if(this.state==='recover'){ img=this.img('release'); }
    else if(this.state==='run'){ const f=Math.floor(this.animT*6)%2; img=this.img(f? 'walk1':'walk2'); }
    else if(this.state==='jump'){ const f=Math.floor(this.animT*8)%3; img=this.img(['jump1','jump2','jump3'][f]); }
    else { img=this.img('idle'); }
    if(img){ const scale=this.h/img.height, w=img.width*scale, h=this.h; ctx.imageSmoothingEnabled=false; ctx.drawImage(img, Math.round(-w/2+ox), Math.round(-h/2), Math.round(w), Math.round(h)); }
    if(this.state==='charge'){
      const orb=this.img('orb'); const t=this.chargeT;
      const mul = 0.6 + 0.8*(t/2); const hh=32*mul, ww=44*mul; const oxh = this.face*26, oyh=-14;
      if(orb){ ctx.save(); ctx.translate(oxh, oyh); if(this.face<0) ctx.scale(-1,1); ctx.globalAlpha=0.9; ctx.drawImage(orb, Math.round(-ww/2), Math.round(-hh/2), Math.round(ww), Math.round(hh)); ctx.restore(); }
    }
    ctx.restore();
    this.drawHPBar(ctx,world);
    for(const p of this.energyOrbs) p.draw(ctx);
  }
}

/* ================================
 * Enemy: IceRoboMini (weak, 5体同時対象)
 * ================================ */
class IceRoboMini extends CharacterBase{
  constructor(world, effects, assets, x=1200){
    super(40,44); this.world=world; this.effects=effects; this.assets=assets;
    this.x=x; this.y=Math.floor(GROUND_TOP_Y)-this.h/2+FOOT_PAD; this.face=-1;
    this.maxhp=60; this.hp=60; this.cool=0; this.state='idle'; this.animT=0; this.hopT=0; this.superArmor=false;
    this.idleT=0;
  }
  img(key){ const map={ idle:'IC.png', move:'IC2.png', atk1:'IC3.png', sp:'IC4.png' }; return this.assets.img(map[key]||'IC.png'); }
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

    if(this.state==='sp'){
      this.superArmor=true; this.hopT+=dt; const period=0.24, bounces=5;
      const bi=Math.floor(this.hopT/period); const dir = (bi%2===0)? this.face : -this.face;
      this.vx = dir * 240; if(this.onGround) this.vy = -JUMP_V*0.45;
      this.updatePhysics(dt);
      if(this.hopT>=period*bounces){ this.state='idle'; this.vx=0; this.superArmor=false; this.hopT=0; this.cool=1.3; this.idleT=0; }
      if(rectsOverlap(this.aabb(), player.aabb()) && player.invulnT<=0){
        const hit = player.hurt(7, (player.x>=this.x?1:-1), {lift:0.3,kbMul:0.9,kbuMul:0.9}, this.effects);
        if(hit){ const fill=document.getElementById('hpfill'); const num=document.getElementById('hpnum'); if(fill&&num){ num.textContent=player.hp; fill.style.width=Math.max(0,Math.min(100,(player.hp/player.maxhp)*100))+'%'; } }
      }
      this.animT+=dt; return;
    }
    if(this.state==='atk'){
      this.hopT+=dt; const dur=0.32; this.vx = this.face * 140; this.updatePhysics(dt);
      if(this.hopT>dur*0.5 && this.hopT<=dur*0.75){
        const hb={x:this.x + this.face*18, y:this.y, w:36, h:28};
        if(player.invulnT<=0 && rectsOverlap(hb, player.aabb())){
          const hit=player.hurt(5, this.face, {lift:0.2,kbMul:0.8,kbuMul:0.8}, this.effects);
          if(hit){ const fill=document.getElementById('hpfill'); const num=document.getElementById('hpnum'); if(fill&&num){ num.textContent=player.hp; fill.style.width=Math.max(0,Math.min(100,(player.hp/player.maxhp)*100))+'%'; } }
        }
      }
      if(this.hopT>=dur){ this.state='idle'; this.hopT=0; this.vx=0; this.cool=0.9; this.idleT=0; }
      this.animT+=dt; return;
    }
    const dx=player.x-this.x; const adx=Math.abs(dx); this.face=dx>=0?1:-1;
    this.vx = (dx>0? 70 : -70); this.hopT+=dt;
    if(this.onGround && this.hopT>0.35){ this.vy=-JUMP_V*0.35; this.hopT=0; }

    // 強制行動
    if(this.cool<=0 && (this.idleT>=1.2 || adx<120 && Math.random()<0.6)){
      this.state = (adx<120? 'atk' : 'sp'); this.hopT=0; this.animT=0; this.idleT=0;
    }

    this.updatePhysics(dt);
    this.state = (this.state==='idle'||this.state==='run') ? (this.onGround? 'run':'jump') : this.state;
    this.animT+=dt;
  }
  draw(ctx,world){
    ctx.save(); ctx.translate(this.x-world.camX, this.y-world.camY); if(this.face<0) ctx.scale(-1,1);
    let img=null; if(this.state==='sp') img=this.img('sp');
    else if(this.state==='atk'){ img=this.hopT<0.16? this.img('idle'): this.img('atk1'); }
    else if(!this.onGround) img=this.img('move'); else img=this.img('move');
    if(img){
      const scale=this.h/img.height, w=img.width*scale, h=this.h;
      ctx.imageSmoothingEnabled=false; ctx.drawImage(img, Math.round(-w/2), Math.round(-h/2), Math.round(w), Math.round(h));
    }
    ctx.restore(); this.drawHPBar(ctx,world);
  }
}

/* ================================
 * Enemy: Kozou (weak thrower, 5体対象)
 * ================================ */
class KozouStone extends Projectile{
  constructor(world,x,y,dir,img){ super(world,x,y,dir,img,6); this.vx = 140*dir; this.vy = -380; this.w = 22; this.h = 22; this.gravity = 900; }
  update(dt){
    if(this.dead) return; this.vy += this.gravity*dt; this.x += this.vx*dt; this.y += this.vy*dt;
    const ground = Math.floor(GROUND_TOP_Y); if(this.y + this.h/2 >= ground+FOOT_PAD){ this.dead=true; }
  }
}
class Kozou extends CharacterBase{
  constructor(world,effects,assets,x=1400){
    super(50,58); this.world=world; this.effects=effects; this.assets=assets;
    this.x=x; this.y=Math.floor(GROUND_TOP_Y)-this.h/2+FOOT_PAD; this.face=-1;
    this.maxhp=90; this.hp=90; this.cool=0; this.state='idle'; this.animT=0; this.projectiles=[];
    this.guard=false; this.guardHits=0; this._thrown=false;
    this.idleT=0;
  }
  img(key){ const map={ idle:'SL.png', w1:'SL2.png', w2:'SL3.png', prep:'SL4.png', throw:'SL5.png', guard:'SL6.png', counter:'SL7.png', stone:'SL8.png'}; return this.assets.img(map[key]||'SL.png'); }
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
    this.idleT += dt;

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

    // 強制行動
    if(this.cool<=0){
      if(this.idleT>=1.2){ // 強制
        if(adx>120){ this.state='throw'; this.animT=0; this.vx=0; }
        else { this.guard=true; this.state='idle'; this.animT=0; this.vx=0; }
        this.idleT=0; return;
      }
      // 通常ランダム
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
  draw(ctx,world){
    ctx.save(); ctx.translate(this.x-world.camX, this.y-world.camY); if(this.face<0) ctx.scale(-1,1);
    let img=null;
    if(this.state==='throw'){ img=this.animT<0.2? this.img('prep'): this.img('throw'); }
    else if(this.state==='counter'){ img=this.img('counter'); }
    else if(this.guard){ img=this.img('guard'); }
    else if(this.state==='run'){ const f=Math.floor(this.animT*6)%2; img=this.img(f?'w1':'w2'); }
    else { img=this.img('idle'); }
    if(img){ const scale=this.h/img.height, w=img.width*scale, h=this.h; ctx.imageSmoothingEnabled=false; ctx.drawImage(img, Math.round(-w/2), Math.round(-h/2), Math.round(w), Math.round(h)); }
    ctx.restore(); this.drawHPBar(ctx,world);
    for(const p of this.projectiles) p.draw(ctx);
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

  // ボス：スキル/ウルト強めに吹っ飛ぶ
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
    this.idleT += dt;

    // 弾更新＆当たり判定
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

      if(this._t>=cur.dur){ this._idx++; this._t=0;
        if(this._idx>=this._seq.length){ this._seq=null; this.state='idle'; this.superArmor=false; this.vx=0; } }
      this.animT+=dt; return;
    }

    const dx=player.x-this.x, adx=Math.abs(dx); this.face=dx>=0?1:-1;
    const slow=80;
    if(adx>180){ this.vx = (dx>0? slow : -slow); }
    else this.vx=0;

    // 強制行動
    if(this.cool<=0 && (this.idleT>=1.3)){
      if(adx<140){
        this.state='atk';
        this._seq=[
          {dur:0.08, key:'atk1a', fx:160, hit:false},
          {dur:0.12, key:'atk1b', fx:200, hit:true, hx:26, hw:48, hh:40, power:30, lift:0.6, kbm:1.0, kbum:1.0},
          {dur:0.06, key:'atk1a', fx:140},
          {dur:0.12, key:'atk1b', fx:200, hit:true, hx:26, hw:48, hh:40, power:30, lift:0.6, kbm:1.0, kbum:1.0}
        ];
        this.cool=1.6; this._idx=0; this._t=0; this.idleT=0; return;
      }
      if(adx<320){
        this.state='skill'; this.superArmor=true;
        this._seq=[
          {dur:0.50, key:'prep', fx:0},
          {dur:0.30, key:'prep', fx:520, hit:true, hx:28, hw:70, hh:46, power:72, lift:0.9, kbm:1.2, kbum:1.1}
        ];
        this.cool=2.8; this._idx=0; this._t=0; this.idleT=0; return;
      }
      this.state='ult'; this.superArmor=true;
      this._seq=[
        {dur:0.50, key:'hold', fx:0},
        {dur:0.18, key:'pose', fx:0, hit:true, hx:24, hw:56, hh:50, power:50, lift:0.6, kbm:1.0, kbum:1.0},
        {dur:0.30, key:'pose', fx:0, fire:true}
      ];
      this.cool=7.0; this._idx=0; this._t=0; this.idleT=0; return;
    }

    // 通常抽選
    if(this.cool<=0){
      if(adx<140 && Math.random()<0.55){ this.idleT=1.3; }
      else if(adx<320 && Math.random()<0.35){ this.idleT=1.3; }
      else if(adx<420 && Math.random()<0.22){ this.idleT=1.3; }
    }

    this.updatePhysics(dt);
    this.state = !this.onGround ? 'jump' : (Math.abs(this.vx)>1?'run':'idle');
    this.animT+=dt;
  }
  draw(ctx,world){
    ctx.save(); ctx.translate(this.x-world.camX, this.y-world.camY); if(this.face<0) ctx.scale(-1,1);
    let img=null;
    if(this._seq){ const cur=this._seq[this._idx]; img=this.img(cur?.key||'idle'); }
    else if(this.state==='run'){ const f=Math.floor(this.animT*6)%2; img=this.img(f?'w1':'w2'); }
    else img=this.img('idle');
    if(img){ const scale=this.h/img.height, w=img.width*scale, h=this.h; ctx.imageSmoothingEnabled=false; ctx.drawImage(img, Math.round(-w/2), Math.round(-h/2), Math.round(w), Math.round(h)); }
    ctx.restore(); this.drawHPBar(ctx,world);
    for(const b of this.bullets) b.draw(world.ctx);
  }
}

/* ================================
 * Enemy: Screw (boss) — 攻撃強制AI
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

  // ボス：スキル/ウルトは吹っ飛びUP
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
      if(adx<120){ // 近距離：A1
        this._startSeq([
          {dur:0.10, key:'a1a', fx:120},
          {dur:0.18, key:'a1b', fx:180, hit:true, hx:20, hw:46, hh:36, power:32, lift:0.45, kbm:0.95, kbum:0.95}
        ], 1.1); chose=true;
      } else if(adx<180){ // 準近距離：A2
        this._startSeq([
          {dur:0.10, key:'a2a', fx:130},
          {dur:0.20, key:'a2b', fx:200, hit:true, hx:22, hw:50, hh:38, power:36, lift:0.6, kbm:1.0, kbum:1.0}
        ], 1.3); chose=true;
      } else if(adx<320){ // 中距離：スキル連撃
        this._startSeq([
          {dur:0.45, key:'sPrep', fx:0},
          {dur:0.22, key:'s1', fx:520, hit:true, hx:22, hw:56, hh:40, power:52, lift:0.5, kbm:0.95, kbum:0.95},
          {dur:0.14, key:'s2', fx:380, hit:true, hx:20, hw:44, hh:36, power:22, lift:0.3, kbm:0.9, kbum:0.9},
          {dur:0.22, key:'s3', fx:520, hit:true, hx:24, hw:58, hh:42, power:52, lift:1.0, kbm:1.05, kbum:1.05}
        ], 3.8); chose=true;
      } else if(adx<380){ // 遠距離：ウルト
        this._startSeq([
          {dur:0.45, key:'uPrep', fx:0},
          {dur:0.26, key:'uDash', fx:580},
          {dur:0.22, key:'uFin',  fx:0, hit:true, hx:26, hw:64, hh:50, power:120, lift:1.4, kbm:1.2, kbum:1.2}
        ], 12.0); chose=true;
      }
      if(chose){ return; } else { this.idleT = 0; }
    }

    this.updatePhysics(dt);
    if(!this.onGround) this.state = this.highJump? 'jump':'jump';
    else this.state = Math.abs(this.vx)>1? 'run':'idle';
    this.animT+=dt;
  }
  draw(ctx,world){
    ctx.save(); ctx.translate(this.x-world.camX, this.y-world.camY); if(this.face<0) ctx.scale(-1,1);
    let img=null;
    if(this._seq){ const cur=this._seq[this._idx]; img=this.img(cur?.key||'idle'); }
    else if(!this.onGround){ img=this.img(this.highJump? 'high':'jump'); }
    else if(this.state==='run'){ const f=Math.floor(this.animT*6)%2; img=this.img(f?'w1':'w2'); }
    else img=this.img('idle');
    if(img){ const scale=this.h/img.height, w=img.width*scale, h=this.h; ctx.imageSmoothingEnabled=false; ctx.drawImage(img, Math.round(-w/2), Math.round(-h/2), Math.round(w), Math.round(h)); }
    ctx.restore(); this.drawHPBar(ctx,world);
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
    this.idleT += dt;

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

    // 強制行動
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
  draw(ctx,world){
    ctx.save(); ctx.translate(this.x-world.camX, this.y-world.camY);
    if(this.dead){ ctx.globalAlpha=this.fade; ctx.rotate(this.spinAngle); }
    if(this.face<0 && !this.dead) ctx.scale(-1,1);
    let img=null, ox=0;
    if(this.state==='charge'){ img=this.img('charge'); ox=Math.sin(performance.now()/25)*2; }
    else if(this.state==='dash'){ img=this.img('dashAtk'); }
    else if(this.state==='post'){ img=this.img('release'); }
    else if(this.state==='run'){ const f=Math.floor(this.animT*6)%2; img=this.img(f?'w1':'w2'); }
    else if(this.state==='jump'){
      const f=Math.floor(this.animT*8)%3; img=this.img(['j1','j2','j3'][f]);
    } else { img=this.img('idle'); }
    if(img){ const scale=this.h/img.height, w=img.width*scale, h=this.h; ctx.imageSmoothingEnabled=false; ctx.drawImage(img, Math.round(-w/2+ox), Math.round(-h/2), Math.round(w), Math.round(h)); }
    if(this.state==='charge'){
      const orb=this.img('orb'); const t=this.chargeT;
      const mul = 0.7 + 1.0*(t/2.2);
      const hh=38*mul, ww=54*mul; const oxh = this.face*34, oyh=-22;
      if(orb){ ctx.save(); ctx.translate(oxh, oyh); if(this.face<0) ctx.scale(-1,1); ctx.globalAlpha=0.95; ctx.drawImage(orb, Math.round(-ww/2), Math.round(-hh/2), Math.round(ww), Math.round(hh)); ctx.restore(); }
    }
    ctx.restore();
    this.drawHPBar(ctx,world);
    for(const p of this.energyOrbs) p.draw(ctx);
  }
}

/* ================================
 * Export
 * ================================ */
window.__Actors__ = {
  Player,
  WaruMOB, IceRobo, IceRoboMini, Kozou, MOBGiant, GabuKing, Screw,
  // optional subclasses if直参照したい場合
  KozouStone, GabuUltShot
};

})();
