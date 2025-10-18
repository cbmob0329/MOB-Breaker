// actors-player.js — Aの煙=小さく地面を這う/wing.pngを左右に3連続（威力40）/◎=LE発射/U2全体HIT 維持
(function(){
'use strict';

const {
  Effects, Assets, Input, CharacterBase,
  Projectile, EnergyBall, UltBlast, GroundSpike,
  constants:{ MOVE, JUMP_V, GROUND_TOP_Y, FOOT_PAD },
  utils:{ clamp, lerp, rectsOverlap }
} = window.__GamePieces__;

/* ---------- ◎: LEレコード弾（左右に飛ぶ） ---------- */
class LeRecordProjectile extends Projectile{
  constructor(player, dir){
    const world=player.world;
    const img=world.assets.img('LE.png');
    const x = player.x + dir*(player.w*0.7); // 体の外側から（被り防止）
    const y = player.y - player.h*0.1;
    super(world, x, y, dir, img, 60);
    const targetH = player.h*0.5; // プレイヤーの半分程度
    if(img){
      const s = targetH/img.height;
      this.w = Math.round(img.width * s);
      this.h = Math.round(img.height* s);
    }else{
      this.w = Math.round(player.h*0.5*0.9);
      this.h = Math.round(player.h*0.5);
    }
    this.vx = 420 * dir;
    this.vy = 0;
    this.life = 1.0;
  }
}

/* ---------- A: wing斬撃（左右に3連続/残像） ---------- */
class WingSlash extends Projectile{
  constructor(player, dir){
    const world=player.world;
    const img=world.assets.img('wing.png');
    const x = player.x + dir*(player.w*0.9);
    const y = player.y - player.h*0.2;
    super(world, x, y, dir, img, 40); // 威力40
    // 小さめ（身長の35%）
    const targetH = Math.round(player.h*0.35);
    if(img){
      const s = targetH/img.height;
      this.w = Math.round(img.width * s);
      this.h = Math.round(img.height* s);
    }else{
      this.w = Math.round(targetH*1.2);
      this.h = targetH;
    }
    this.vx = 0;                 // その場に“出る”斬撃
    this.vy = 0;
    this.life = 0.16;            // 短命でパッと出て消える
    this._trail = [];
  }
  update(dt){
    if(this.dead) return;
    // 残像
    this._trail.push({x:this.x, y:this.y, t:0});
    if(this._trail.length>6) this._trail.shift();
    for(const tr of this._trail) tr.t += dt;
    super.update(dt);
  }
  draw(ctx){
    const img=this.img; if(!img || this.dead) return;
    // 残像
    for(let i=0;i<this._trail.length;i++){
      const tr=this._trail[i], k=1 - i/this._trail.length;
      ctx.save(); ctx.translate(tr.x-this.world.camX, tr.y-this.world.camY);
      if(this.dir<0) ctx.scale(-1,1);
      ctx.globalAlpha=0.12*k;
      const s=this.h/img.height, w=img.width*s, h=this.h;
      ctx.imageSmoothingEnabled=false;
      ctx.drawImage(img, Math.round(-w/2), Math.round(-h/2), Math.round(w), Math.round(h));
      ctx.restore();
    }
    // 本体
    ctx.save(); ctx.translate(this.x-this.world.camX, this.y-this.world.camY);
    if(this.dir<0) ctx.scale(-1,1);
    const s=this.h/img.height, w=img.width*s, h=this.h;
    ctx.imageSmoothingEnabled=false;
    ctx.drawImage(img, Math.round(-w/2), Math.round(-h/2), Math.round(w), Math.round(h));
    ctx.restore();
  }
}

/* ---------- A: 地面這い煙（非ダメージ・描画専用） ---------- */
class AirCrawlSmoke{
  constructor(player, side){
    this.player=player;
    this.side = side; // -1:左 / +1:右
    this.t=0; this.life=0.5 + Math.random()*0.4;
    this.xOff = side*(player.w*0.9 + Math.random()*12); // 体から外側
    this.yOff = (Math.floor(GROUND_TOP_Y) - player.y) - 6; // 地面付近
    this.speed = 28 + Math.random()*18; // 地面を這う水平移動
    this.scale = 0.08 + Math.random()*0.025; // 小さめ
    this.alphaBase = 0.42; // 濃いめ指定
  }
  update(dt){
    this.t += dt;
    // 地面を這う：外側へじわっと
    this.xOff += this.side * this.speed * dt;
  }
  alive(){ return this.t < this.life; }
  draw(ctx, world){
    const img = world.assets.img('kem.png'); if(!img) return;
    const p = this.player;
    const x = p.x + this.xOff - world.camX;
    const y = Math.floor(GROUND_TOP_Y) - world.camY - 2; // 地面上
    const k = 1 - this.t/this.life;
    const a = this.alphaBase * (0.5 + 0.5*k);
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.scale(this.scale, this.scale);
    ctx.globalAlpha = a;
    ctx.imageSmoothingEnabled=false;
    // 地面沿いに描画（上下オフセットしない）
    ctx.drawImage(img, Math.round(-img.width/2), Math.round(-img.height/2));
    ctx.restore();
  }
}

/* ================================ */
class Player extends CharacterBase{
  constructor(assets, world, effects){
    super(56,64);
    this.assets=assets; this.world=world; this.effects=effects;
    this.x=100; this.y=Math.floor(GROUND_TOP_Y)-this.h/2+FOOT_PAD;
    this.hp=1000; this.maxhp=1000; this.lives=3;

    this.maxJumps=2; this.jumpsLeft=this.maxJumps;

    this.comboStep=0; this.comboGraceT=0; this.comboGraceMax=0.24;
    this.bufferA1=false; this.a2LockoutT=0;

    // CDs
    this.skillCDT=0;     // ●
    this.skill2CDT=0;    // ◎
    this.pCDT=0;         // P
    this.airCDT=0;       // A
    this.ultCDT=0;       // U1
    this.ult2CDT=0;      // U2

    // SA
    this.saT=0;

    // U1 溜め
    this.isUltCharging=false;
    this._ultChargeMax=1.5; // ため時間 短縮

    // U2
    this._trail=[];
    this._pendingU2AOE=false;
    this._u2aoeDone=false;
    this._u2ShakeT=0;

    // ◎ LE弾のスポーン制御
    this._leShotSpawned=false;

    // A 追加演出
    this._airSmokes=[];           // 地面這い煙
    this._airWingEmitFlags=[false,false,false]; // 3連射の発射済みフラグ

    this.frames={
      idle:['M1-1.png'],
      run:['M1-2.png','M1-3.png','M1-4.png','M1-3.png'],
      k1prep:'K1-3.png', k1a:'K1-1.png', k1b:'K1-2.png', k1c:'K1-4.png',
      k2prep:'K1-3.png', k2:'K1-5.png',
      spin:['h1.png','h2.png','h3.png','h4.png'],
      chaseJump:'J.png',
      y1:'Y1.png', y2:'Y2.png', y3:'Y3.png', y4:'Y4.png',
      ul1:'UL1.PNG', ul2:'UL2.PNG', ul3:'UL3.png',

      // ◎
      tms:['tms1.png','tmsA.png','tms2.png','tms3.png','tms4.png','tmsA.png','tms5.png','tms6.png'],
      // P
      drIn:['dr1.png','dr2.png','dr3.png','dr4.png'],
      drLp:['dr5.png','dr6.png','dr7.png','dr8.png'],
      // A（順序固定・その場）
      airSeq:[
        'air1.png','air2.png','air3.png','airA.png','air4.png','air5.png',
        'air2.png','air3.png','airA.png','air4.png','air5.png',
        'air2.png','air3.png','airA.png','air4.png','air5.png',
        'air1.png','air2.png','air3.png','airA.png','air4.png','air5.png',
        'air2.png','air3.png','airA.png','air4.png','air5.png',
        'air2.png','air3.png','airA.png','air4.png','air5.png'
      ],
      // U2
      pk:['PK1.png','PK2.png','PK3.png','PK4.png','PK5.png','PK6.png','PK7.png','PK8.png']
    };

    this.overhead=this._createOverheadGauge();
    document.querySelector('.gamewrap').appendChild(this.overhead.root);
  }

  /* ---------- HUD ---------- */
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

  /* ---------- HB ---------- */
  currentHitbox(){
    if(!(this.state==='atk'||this.state==='skill'||this.state==='skill2'||this.state==='skillP'||this.state==='air'||this.state==='ult'||this.state==='ult2') || !this._actionSeq) return null;
    const cur=this._actionSeq[this._actionIndex]; if(!cur) return null;
    const W=86,H=64; const x=this.x + this.face*(this.w*0.2);
    return {x, y:this.y, w:W, h:H, power:cur.power||0, dir:this.face, lift:cur.lift||0, kbMul:cur.kbMul||1.6, kbuMul:cur.kbuMul||1.3, tag:cur.tag||''};
  }

  /* ================== update ================== */
  update(dt,input,world,enemies){
    input.beginFrame(); this._posOverhead();
    if(this.saT>0) this.saT=Math.max(0,this.saT-dt);
    if(this._u2ShakeT>0) this._u2ShakeT=Math.max(0,this._u2ShakeT-dt);

    if(!['atk','skill','skill2','skillP','air','ult','ult2'].includes(this.state) && this._actionSeq){ this._actionSeq=null; }
    if(this.a2LockoutT>0) this.a2LockoutT=Math.max(0,this.a2LockoutT-dt);

    // UIボタン
    const skBtn=document.getElementById('btnSK');
    const sk2Btn=document.getElementById('btnSK2');
    const pBtn=document.getElementById('btnP');
    const airBtn=document.getElementById('btnAIR');
    const ultBtn=document.getElementById('btnULT');
    const u2Btn=document.getElementById('btnULT2');

    if(this.skillCDT>0){ this.skillCDT=Math.max(0,this.skillCDT-dt); skBtn?.setAttribute('disabled',''); } else skBtn?.removeAttribute('disabled');
    if(this.skill2CDT>0){ this.skill2CDT=Math.max(0,this.skill2CDT-dt); sk2Btn?.setAttribute('disabled',''); } else sk2Btn?.removeAttribute('disabled');
    if(this.pCDT>0){ this.pCDT=Math.max(0,this.pCDT-dt); pBtn?.setAttribute('disabled',''); } else pBtn?.removeAttribute('disabled');
    if(this.airCDT>0){ this.airCDT=Math.max(0,this.airCDT-dt); airBtn?.setAttribute('disabled',''); } else airBtn?.removeAttribute('disabled');
    if(this.ultCDT>0){ this.ultCDT=Math.max(0,this.ultCDT-dt); ultBtn?.setAttribute('disabled',''); } else ultBtn?.removeAttribute('disabled');
    if(this.ult2CDT>0){ this.ult2CDT=Math.max(0,this.ult2CDT-dt); u2Btn?.setAttribute('disabled',''); } else u2Btn?.removeAttribute('disabled');

    if(this.dead){ this.updatePhysics(dt); if(this.fade<=0){ this._respawn(world); } world.updateTimer(dt); return; }

    /* ===== ● 充填 ===== */
    if(input.skillCharging && this.skillCDT<=0){
      input.skillChargeT=Math.min(1.0, input.skillChargeT+dt);
      this._showGauge(true,'● Charge', input.skillChargeT/1.0);
      this.saT = 0.08;
    }

    /* ===== U 溜め（左右高速揺れ＋残像／溜め中SA） ===== */
    this.isUltCharging = input.ultCharging && this.ultCDT<=0;
    if(this.isUltCharging){
      input.ultChargeT = Math.min(this._ultChargeMax, input.ultChargeT + dt);
      this._showGauge(true,'U Charge', input.ultChargeT/this._ultChargeMax);
      this.saT = 0.18;
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

    // 実行中
    if(['atk','skill','skill2','skillP','air','ult','ult2'].includes(this.state)){
      const hb=this.currentHitbox();
      if(hb){
        for(const e of enemies){
          if(!e || e.dead || e.invulnT>0) continue;
          if(rectsOverlap({x:hb.x,y:hb.y,w:hb.w,h:hb.h}, e.aabb())){
            const hit=e.hurt(hb.power, hb.dir, {lift:hb.lift, kbMul:hb.kbMul, kbuMul:hb.kbuMul}, this.effects);
            if(hit && (this.state==='air' || this.state==='skill2') && !e.superArmor){
              e._twirlT = Math.max(e._twirlT||0, 0.6);
            }
          }
        }
      }

      // ◎：LE弾（左右1発ずつ）
      if(this.state==='skill2' && !this._leShotSpawned){
        this._leShotSpawned = true;
        const L = new LeRecordProjectile(this, -1);
        const R = new LeRecordProjectile(this,  1);
        (this.world._skillBullets||(this.world._skillBullets=[])).push(L,R);
      }

      // A：地面這い煙の生成（過密防止で最大4つ）
      if(this.state==='air'){
        // 0.06sごとに片側1つ、最大4（左右合計）
        this._airSmokeTick = (this._airSmokeTick||0) + dt;
        if(this._airSmokes.length<4 && this._airSmokeTick>=0.06){
          this._airSmokeTick=0;
          const side = (Math.random()<0.5? -1:+1);
          this._airSmokes.push(new AirCrawlSmoke(this, side));
        }
        // 更新＆掃除
        for(const s of this._airSmokes) s.update(dt);
        this._airSmokes = this._airSmokes.filter(s=>s.alive());

        // wing 3連射：シーケンス進捗でトリガ
        const prog = (this._actionSeq && this._actionSeq.length>0)? (this._actionIndex/this._actionSeq.length) : 0;
        const marks = [0.15, 0.50, 0.85];
        marks.forEach((m, i)=>{
          if(!this._airWingEmitFlags[i] && prog>=m){
            this._airWingEmitFlags[i]=true;
            const L = new WingSlash(this, -1);
            const R = new WingSlash(this,  1);
            (this.world._skillBullets||(this.world._skillBullets=[])).push(L,R);
          }
        });
      } else {
        this._airSmokes.length=0;
        this._airWingEmitFlags=[false,false,false];
        this._airSmokeTick=0;
      }

      // U2：AOE（PK8）発動（全員ヒット／当たり不要）
      if(this._pendingU2AOE){
        this._pendingU2AOE=false;
        if(!this._u2aoeDone){
          this._u2aoeDone=true;
          this._u2ShakeT=1.0;                // 1秒プレイヤー揺らす
          this.effects.shake(0.35,12);       // 画面シェイク
          for(const e of enemies){
            if(!e || e.dead) continue;
            const dir=(e.x>=this.x)?1:-1;
            e.hurt(100,dir,{lift:1.6,kbMul:2.6,kbuMul:2.2},this.effects);
            e.vx = dir*720; e.vy = -720;
            e._twirlT=Math.max(e._twirlT||0,1.2);
          }
        }
      }

      this._updateAction(dt,world,input);
      world.updateTimer(dt);
      return;
    }

    // 入力（待機時）
    if(input.edge.a1) this.bufferA1=true;
    if(input.edge.air && this.airCDT<=0){ input.edge.air=false; this.bufferA1=false; this._startAIR(); return; }
    if(input.edge.p && this.pCDT<=0){ input.edge.p=false; this.bufferA1=false; this._startP(); return; }
    if(input.edge.skill2 && this.skill2CDT<=0){ input.edge.skill2=false; this.bufferA1=false; this._startSpinSkill2(); return; }
    if(input.edge.ult2 && this.ult2CDT<=0){ input.edge.ult2=false; this.bufferA1=false; this._startULT2(); return; }
    if(input.edge.a2Press && this.a2LockoutT<=0){ input.edge.a2Press=false; this.bufferA1=false; this._startA2(); return; }
    if(this.bufferA1 && this.comboStep<3){ this.bufferA1=false; this._startA1(); return; }

    // 通常移動
    let ax=0; if(input.left){ ax-=MOVE; this.face=-1; } if(input.right){ ax+=MOVE; this.face=1; }
    this.vx = ax!==0 ? (ax>0?MOVE:-MOVE) : 0;
    if(input.consumeJump() && this.jumpsLeft>0){ this.vy=-JUMP_V; this.onGround=false; this.jumpsLeft--; }
    this.updatePhysics(dt);
    if(this.onGround) this.jumpsLeft=this.maxJumps;
    this.state = !this.onGround ? 'jump' : (Math.abs(this.vx)>1?'run':'idle');

    if(!(this.isUltCharging||input.skillCharging)) this._showGauge(false);
    world.updateTimer(dt);
  }

  /* ---------- 通常 ---------- */
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

  /* ---------- ●（既存） ---------- */
  _startSkill1Release(t){
    this.state='skill'; this.animT=0; this.skillCDT=5.0;
    const c=clamp(t,0,1.0);
    const rounds = 2 + Math.floor(c/0.33);
    const base   = 26 + Math.floor(c/0.1)*2;
    const kbm  = 1.6 + 0.1*(rounds-2);
    const kbum = 1.3 + 0.05*(rounds-2);
    const frames=this.frames.spin; const seq=[];
    for(let r=0;r<rounds;r++) for(let i=0;i<frames.length;i++){
      const pow = base*(i===1?1:0.6); const lift=(i===1?1:0);
      seq.push({kind:'sp',dur:0.06,frame:frames[i],fx:80,power:pow,lift, kbMul:kbm, kbuMul:kbum});
    }
    this._actionSeq=seq; this._actionIndex=0; this._actionTime=0;
    this._showGauge(false);
  }

  /* ---------- ◎（LE弾を左右へ） ---------- */
  _startSpinSkill2(){
    if(this.skill2CDT>0) return;
    this.state='skill2'; this.animT=0; this.skill2CDT=10.0;
    this.saT = 1.8;
    this._leShotSpawned=false;
    const order=this.frames.tms; const seq=[];
    for(let loop=0; loop<3; loop++){
      for(let i=0;i<order.length;i++){
        const f=order[i]; const fin=(f==='tms6.png'||f==='tms6');
        seq.push({kind:'hit', dur:0.09, frame:f, fx:0, power: fin?20:10, lift:1.0, kbMul: fin?2.0:1.6, kbuMul:fin?1.7:1.4, tag:'spin2'});
      }
    }
    this._actionSeq=seq; this._actionIndex=0; this._actionTime=0;
  }

  /* ---------- P ---------- */
  _startP(){
    if(this.pCDT>0) return;
    this.state='skillP'; this.animT=0; this.pCDT=9.0;
    const seq=[];
    for(const f of this.frames.drIn){ seq.push({kind:'hit',dur:0.10,frame:f,fx:80,power:15, lift:0.2, kbMul:0.9, kbuMul:0.9}); }
    for(let loop=0; loop<4; loop++) for(const f of this.frames.drLp){
      seq.push({kind:'hit',dur:0.08,frame:f,fx:120,power:15, lift:0.2, kbMul:0.9, kbuMul:0.9});
    }
    this._actionSeq=seq; this._actionIndex=0; this._actionTime=0;
  }

  /* ---------- A（その場・ゆっくり/SA/煙＆wing追加） ---------- */
  _startAIR(){
    if(this.airCDT>0) return;
    this.state='air'; this.animT=0; this.airCDT=12.0;
    this.saT = 2.0;
    this._airSmokes.length=0;
    this._airWingEmitFlags=[false,false,false];
    this._airSmokeTick=0;

    const seq=[]; const arr=this.frames.airSeq;
    for(let i=0;i<arr.length;i++){
      const f=arr[i];
      // その場・少しゆっくり（0.12s/コマ）
      // ※A自体のヒットは従来どおり（強めノックバック）
      seq.push({kind:'hit', dur:0.12, frame:f, fx:0, power:60, lift:1.0, kbMul:2.2, kbuMul:2.0, tag:'air'});
    }
    this._actionSeq=seq; this._actionIndex=0; this._actionTime=0;
  }

  /* ---------- U1（発射サイズ=溜め見た目に一致） ---------- */
  _releaseULT(chargeSec){
    if(this.ultCDT>0) return;
    this.state='ult'; this.animT=0;
    this._actionSeq=[
      {kind:'pose',dur:0.22,frame:'ul2',fx:40},
      {kind:'post',dur:0.58,frame:'ul2',fx:20}
    ];
    this._actionIndex=0; this._actionTime=0;
    this.ultCDT=3.0;

    const csClamped = Math.min(this._ultChargeMax, chargeSec);
    const csScaledForProjectile = csClamped * (3.0 / this._ultChargeMax); // UltBlastの0..3.0に合わせる

    const img=this.world.assets.img(this.frames.ul3);
    const ox=this.face*30, oy=-12;
    const blast=new UltBlast(this.world, this.x+ox, this.y+oy, this.face, img, csScaledForProjectile);
    (this.world._skillBullets||(this.world._skillBullets=[])).push(blast);
    this.saT=0; this._showGauge(false);
    this.effects.addSpark(this.x+ox, this.y-14, true);
  }

  /* ---------- U2 ---------- */
  _startULT2(){
    if(this.ult2CDT>0) return;
    this.state='ult2'; this.animT=0; this.ult2CDT=12.0; this._u2aoeDone=false;
    const P=this.frames.pk;
    this._actionSeq=[
      {kind:'hit', dur:0.10, frame:P[0], fx:120, power:20, lift:0.4, kbMul:1.1, kbuMul:1.0},
      {kind:'pose',dur:0.16, frame:P[1], fx:160, power:0},
      {kind:'hit', dur:0.12, frame:P[2], fx:180, power:30, lift:0.6, kbMul:1.2, kbuMul:1.1},
      {kind:'pose',dur:0.10, frame:P[3], fx:120, power:0},
      {kind:'hit', dur:0.12, frame:P[4], fx:200, power:50, lift:0.8, kbMul:1.4, kbuMul:1.2},
      {kind:'pose',dur:0.10, frame:P[5], fx:140, power:0},
      {kind:'hit', dur:0.18, frame:P[6], fx:240, power:80, lift:1.4, kbMul:2.2, kbuMul:1.9, tag:'u2fin'},
      {kind:'pose',dur:1.00, frame:P[7], fx:0, power:0, tag:'u2aoe'} // 当たり不要・全員HIT
    ];
    this._actionIndex=0; this._actionTime=0;
  }

  /* ---------- 進行 ---------- */
  _updateAction(dt,world,input){
    const cur=this._actionSeq?.[this._actionIndex];

    if(this.state==='skill2' || this.state==='air'){ this.saT = Math.max(this.saT, 0.08); }
    if(cur?.fx){ this.x += this.face * cur.fx * dt; }

    // U2 残像
    if(this.state==='ult2'){
      this._trail.push({x:this.x, y:this.y, t:0});
      if(this._trail.length>12) this._trail.shift();
      for(const tr of this._trail) tr.t += dt;
    } else this._trail.length=0;

    if(cur?.tag==='u2aoe' && !this._u2aoeSeen){
      this._u2aoeSeen=true; this._pendingU2AOE=true;
    }

    this.vx = 0; this.updatePhysics(dt);

    if(this._actionSeq){
      this._actionTime+=dt;
      if(this._actionTime>=cur.dur){
        this._actionIndex++; this._actionTime=0;
        if(this._actionIndex>=this._actionSeq.length){
          if(this.state==='atk' && this.comboStep>0){ this.comboGraceT=this.comboGraceMax; if(this.comboStep>=3){ this.comboStep=0; this.bufferA1=false; } }
          this.state='idle'; this._actionSeq=null; this._u2aoeSeen=false;
          // Aの後処理
          if(this._airSmokes.length){ this._airSmokes.length=0; }
          this._airWingEmitFlags=[false,false,false];
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
    this.jumpsLeft=this.maxJumps; this.saT=0; this.isUltCharging=false;
    this._trail.length=0; this._u2ShakeT=0; this._leShotSpawned=false;
    this._airSmokes.length=0; this._airWingEmitFlags=[false,false,false];
  }

  draw(ctx,world){
    ctx.save(); ctx.translate(this.x-world.camX, this.y-world.camY);

    // U溜め中：左右高速揺れ
    if(this.isUltCharging){
      const t=performance.now()/100;
      const ox=Math.sin(t*2.8)*6;
      ctx.translate(ox,0);
    }
    // U2：PK8中はプレイヤー自身も揺らす
    if(this._u2ShakeT>0){
      const a=6*this._u2ShakeT;
      ctx.translate((Math.random()*2-1)*a,(Math.random()*2-1)*a*0.6);
    }

    if(this.dead){ ctx.globalAlpha=this.fade; ctx.rotate(this.spinAngle); }
    if(this.face<0 && !this.dead) ctx.scale(-1,1);

    let img=null;
    if(this.state==='idle'){ img=this._imgByKey('idle',0); }
    else if(this.state==='run'){
      const rate = lerp(6, 11, clamp(Math.abs(this.vx)/MOVE, 0, 1));
      const i=Math.floor(this.animT*rate)%this.frames.run.length;
      img=this._imgByKey('run',i);
    }
    else if(this.state==='jump'){ img=this._imgByKey('run',0); }
    else if(['atk','skill','skill2','skillP','air','ult','ult2'].includes(this.state) && this._actionSeq){
      const cur=this._actionSeq[this._actionIndex]; const key=cur.frame; img=this.world.assets.img(this.frames[key]?this._getFramePath(key,0):key);
    } else img=this._imgByKey('idle',0);

    if(img){
      const scale=this.h/img.height, w=img.width*scale, h=this.h;
      ctx.imageSmoothingEnabled=false; ctx.drawImage(img, Math.round(-w/2), Math.round(-h/2), Math.round(w), Math.round(h));
    }

    // U溜め中：UL3を大きく（見た目）＋残像
    if(this.isUltCharging){
      const ul3=this.world.assets.img(this.frames.ul3);
      if(ul3){
        const t=Math.min(this._ultChargeMax, (window._inputUltT||0));
        const mul = lerp(0.7, 3.2, clamp(t/this._ultChargeMax,0,1));
        const hh=60*mul, ww=60*mul; const oxh = this.face*26, oyh=-14;
        for(let i=0;i<3;i++){
          const f=(3-i)/3; ctx.save(); ctx.globalAlpha=0.20*f;
          ctx.translate(oxh - i*6*this.face, oyh);
          if(this.face<0) ctx.scale(-1,1);
          ctx.drawImage(ul3, Math.round(-ww/2), Math.round(-hh/2), Math.round(ww), Math.round(hh));
          ctx.restore();
        }
        ctx.save(); ctx.translate(oxh, oyh); if(this.face<0) ctx.scale(-1,1);
        ctx.globalAlpha=0.95; ctx.drawImage(ul3, Math.round(-ww/2), Math.round(-hh/2), Math.round(ww), Math.round(hh)); ctx.restore();
      }
    }

    // A：地面を這う小粒の煙を描画（非ダメージ・プレイヤー非被り）
    if(this.state==='air' && this._airSmokes.length){
      for(const s of this._airSmokes) s.draw(ctx, this.world);
    }

    // U2：残像
    if(this.state==='ult2' && this._trail.length && img){
      for(let i=0;i<this._trail.length;i++){
        const tr=this._trail[i], k=1 - i/this._trail.length;
        ctx.save(); ctx.translate(tr.x-this.x, tr.y-this.y);
        ctx.globalAlpha=0.12*k;
        const scale=this.h/img.height, w=img.width*scale, h=this.h;
        ctx.drawImage(img, Math.round(-w/2), Math.round(-h/2), Math.round(w), Math.round(h));
        ctx.restore();
      }
    }

    ctx.restore();
  }

  // 被弾
  hurt(amount,dir,opts,effects){
    if(this.state==='skill2' || this.state==='air' || this.saT>0){ opts = {...(opts||{}), kbMul:0.1, kbuMul:0.1}; }
    const hit = CharacterBase.prototype.hurt.call(this,amount,dir,opts,effects);
    if(hit){
      const fill=document.getElementById('hpfill'); const num=document.getElementById('hpnum');
      if(fill&&num){ num.textContent=this.hp; fill.style.width=Math.max(0,Math.min(100,(this.hp/this.maxhp)*100))+'%'; }
      if(!(this.state==='skill2' || this.state==='air')){
        this._actionSeq = null; this._actionIndex = 0; this._actionTime = 0;
        this.bufferA1 = false; this.comboStep = 0; this.comboGraceT = 0; this.a2LockoutT = 0;
        this.overhead?.root && (this.overhead.root.style.display='none');
        this.jumpsLeft=this.maxJumps; this.isUltCharging=false;
      }
    }
    return hit;
  }
}

window.__Actors__ = Object.assign({}, window.__Actors__||{}, { Player, LeRecordProjectile, WingSlash });

})();
