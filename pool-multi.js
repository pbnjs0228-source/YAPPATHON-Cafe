(() => {
  'use strict';

  const APP = 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
  const FIRESTORE = 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

  let fs = null, db = null;
  let roomId = null, room = null, players = [], unsubscribe = null;
  let canvas = null, ctx = null, animation = 0, lastTime = 0;
  let balls = [], aiming = false, aimPoint = null, shotInProgress = false;
  let solo = false, power = 0;
  let currentTurnUid = null;

  const TABLE = { w: 1100, h: 600, rail: 34, playL: 42, playT: 42, playR: 1058, playB: 558 };
  const BALL_R = 13;
  const MAX_POWER = 15.5;
  const BALL_RESTITUTION = 0.96;
  const CUSHION_RESTITUTION = 0.84;
  const ROLL_DECEL = 7.4;
  const STOP_SPEED = 0.045;
  const POCKET_R = 27;
  const pockets = [
    [TABLE.playL, TABLE.playT],
    [TABLE.w / 2, TABLE.playT - 1],
    [TABLE.playR, TABLE.playT],
    [TABLE.playL, TABLE.playB],
    [TABLE.w / 2, TABLE.playB + 1],
    [TABLE.playR, TABLE.playB]
  ];

  const colors = [
    '#f6cf45','#356fd3','#d743cf','#e64b3b','#32bd68','#7e55d9','#ed8a22',
    '#111317','#e64040','#35ad55','#25a9c7','#e3b12f','#285fc7','#df4b98','#21a892'
  ];

  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
  const getUid = () => window.YappathonVoiceContext?.currentUser?.uid || ('guest-' + Math.random().toString(36).slice(2,9));
  const getName = () => window.YappathonVoiceContext?.profile?.username || window.YappathonVoiceContext?.currentUser?.displayName || 'Player';

  async function loadFirebase(){
    if(db) return;
    const app = await import(APP);
    fs = await import(FIRESTORE);
    db = fs.getFirestore(app.getApp());
  }

  function invitePlayers(){
    // Re-use the Cafe's existing Yappathon invite picker instead of creating
    // a second invitation system just for games.
    const invite = document.getElementById('inviteBtn');
    if(invite){
      window.__ycGameInvite = { game: 'pool', roomId, roomName: 'Pool' };
      invite.click();
      return;
    }
    const picker = document.querySelector('[data-action="invite"]');
    if(picker) picker.click();
  }

  function inject(){
    if($('#yc-pool-root')) return;

    const style = document.createElement('style');
    style.id = 'yc-pool-style-v2';
    style.textContent = `
      #yc-pool-root{position:fixed;inset:0;z-index:99999;display:none;align-items:center;justify-content:center;padding:18px;background:rgba(2,6,5,.84);backdrop-filter:blur(14px);font-family:Inter,system-ui,sans-serif;color:#f1f7f3}
      #yc-pool-root.open{display:flex}
      .yc-pool-card{width:min(1240px,97vw);max-height:95vh;overflow:auto;border:1px solid #3b604d;border-radius:28px;background:linear-gradient(145deg,#132c23,#081813 72%);box-shadow:0 35px 110px #000b;padding:22px}
      .yc-pool-head{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:16px}
      .yc-pool-title{font-size:28px;font-weight:900;letter-spacing:-.03em}.yc-pool-sub{margin-left:10px;color:#8fb2a1;font-weight:700}
      .yc-pool-head-actions{display:flex;gap:8px}.yc-pool-close{border:1px solid #ffffff18;background:#ffffff0b;color:#d8ebe2;border-radius:12px;padding:8px 13px;font-size:20px}
      .yc-pool-lobby{display:grid;grid-template-columns:1.15fr .85fr;gap:16px}.yc-pool-panel{background:#06120d99;border:1px solid #315142;border-radius:20px;padding:18px}
      .yc-pool-panel h3{margin:0 0 10px;font-size:18px}.yc-pool-status{min-height:24px;color:#9fbeaf;font-weight:700}
      .yc-pool-actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:16px}.yc-pool-btn{border:0;border-radius:12px;padding:12px 17px;font-weight:850;background:linear-gradient(180deg,#9cf0be,#67d99b);color:#082017;box-shadow:0 8px 20px #0002}
      .yc-pool-btn.secondary{background:#ffffff0d;color:#d7ebe0;border:1px solid #ffffff17}.yc-pool-btn.gold{background:linear-gradient(180deg,#f4d37b,#dcae4d);color:#211705}
      .yc-pool-players{display:grid;grid-template-columns:1fr 1fr;gap:10px}.yc-pool-player{min-height:58px;padding:12px 13px;border-radius:15px;background:linear-gradient(145deg,#ffffff0b,#ffffff05);border:1px solid #ffffff12;display:flex;align-items:center;gap:10px}
      .yc-pool-avatar{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(145deg,#49df91,#198958);font-weight:900;color:#062015}.yc-pool-wait{color:#647f72;font-weight:700}
      .yc-pool-code{font-family:ui-monospace,monospace;letter-spacing:.2em;font-size:19px;background:#0005;border:1px solid #ffffff10;border-radius:12px;padding:11px 13px;margin-top:12px}
      .yc-pool-game{display:none}.yc-pool-game.active{display:block}.yc-pool-toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:12px}
      .yc-pool-names{display:flex;gap:7px;flex-wrap:wrap}.yc-pool-name{padding:7px 11px;border-radius:999px;background:#ffffff09;border:1px solid #ffffff12;color:#c6ddd1}.yc-pool-name.active{background:#7ee6aa20;border-color:#7ee6aa;color:#aef2c9;box-shadow:0 0 18px #7ee6aa18}
      .yc-pool-turn{color:#9dbbae;font-weight:750}.yc-pool-turn strong{color:#fff}.yc-pool-board-wrap{padding:14px;border-radius:24px;background:linear-gradient(145deg,#24150d,#0d0906);border:1px solid #664329;box-shadow:0 20px 55px #0008}
      .yc-pool-board{display:block;width:100%;height:auto;border-radius:18px;touch-action:none;box-shadow:0 8px 30px #0008}
      .yc-pool-help{text-align:center;color:#8aa99a;font-size:13px;margin-top:10px}.yc-pool-power{height:8px;max-width:420px;margin:10px auto 0;background:#ffffff0d;border-radius:999px;overflow:hidden;border:1px solid #ffffff0b}.yc-pool-power i{display:block;height:100%;width:0;background:linear-gradient(90deg,#6ee79d,#f1d06c,#ed7c63);transition:width .05s}
      @media(max-width:850px){.yc-pool-lobby{grid-template-columns:1fr}.yc-pool-players{grid-template-columns:1fr}.yc-pool-card{padding:13px}.yc-pool-title{font-size:23px}}
    `;
    document.head.appendChild(style);

    const root = document.createElement('div');
    root.id = 'yc-pool-root';
    root.innerHTML = `
      <div class="yc-pool-card">
        <div class="yc-pool-head">
          <div><span class="yc-pool-title">🎱 Pool</span><span class="yc-pool-sub">2–4 players</span></div>
          <div class="yc-pool-head-actions"><button class="yc-pool-close" id="ycPoolClose">×</button></div>
        </div>
        <section id="ycPoolLobby" class="yc-pool-lobby">
          <div class="yc-pool-panel">
            <h3>Pool lobby</h3>
            <div class="yc-pool-status" id="ycPoolStatus">Create a room, join one, or play solo.</div>
            <div class="yc-pool-actions">
              <button class="yc-pool-btn" id="ycPoolCreate">Create room</button>
              <button class="yc-pool-btn secondary" id="ycPoolJoin">Join room</button>
              <button class="yc-pool-btn gold" id="ycPoolSolo">Start solo</button>
              <button class="yc-pool-btn secondary" id="ycPoolInvite">＋ Invite players</button>
            </div>
            <div class="yc-pool-code" id="ycPoolCode" style="display:none"></div>
            <div id="ycPoolError" style="color:#ffaaa3;margin-top:9px"></div>
          </div>
          <div class="yc-pool-panel">
            <h3>Players</h3>
            <div id="ycPoolPlayers" class="yc-pool-players"></div>
            <div class="yc-pool-actions">
              <button class="yc-pool-btn" id="ycPoolStart" style="display:none">Start game</button>
              <button class="yc-pool-btn secondary" id="ycPoolLeave" style="display:none">Leave room</button>
            </div>
          </div>
        </section>
        <section id="ycPoolGame" class="yc-pool-game">
          <div class="yc-pool-toolbar">
            <div>
              <div class="yc-pool-names" id="ycPoolNames"></div>
              <div class="yc-pool-turn" id="ycPoolTurn"></div>
            </div>
            <div class="yc-pool-actions" style="margin:0">
              <button class="yc-pool-btn secondary" id="ycPoolGameInvite">＋ Invite players</button>
              <button class="yc-pool-btn secondary" id="ycPoolGameLeave">Leave game</button>
            </div>
          </div>
          <div class="yc-pool-board-wrap"><canvas class="yc-pool-board" id="ycPoolCanvas" width="1100" height="600"></canvas></div>
          <div class="yc-pool-power"><i id="ycPoolPower"></i></div>
          <div class="yc-pool-help">Drag the cue backwards from the white ball. Release to shoot. Pull farther for more power.</div>
        </section>
      </div>`;
    document.body.appendChild(root);

    $('#ycPoolClose').onclick = close;
    $('#ycPoolCreate').onclick = createRoom;
    $('#ycPoolJoin').onclick = joinRoom;
    $('#ycPoolSolo').onclick = startSolo;
    $('#ycPoolInvite').onclick = invitePlayers;
    $('#ycPoolGameInvite').onclick = invitePlayers;
    $('#ycPoolStart').onclick = startGame;
    $('#ycPoolLeave').onclick = leaveRoom;
    $('#ycPoolGameLeave').onclick = leaveRoom;
  }

  function open(){
    inject();
    $('#yc-pool-root').classList.add('open');
    $('#ycPoolLobby').style.display = 'grid';
    $('#ycPoolGame').classList.remove('active');
    renderLobby();
  }

  function close(){
    $('#yc-pool-root')?.classList.remove('open');
    cleanup();
  }

  function makeBalls(){
    const out = [{id:'cue',type:'cue',x:280,y:300,vx:0,vy:0,spin:0,pocketed:false}];
    let n = 1;
    const cx = 790, cy = 300;
    for(let row=0; row<5; row++){
      for(let j=0; j<=row; j++){
        const x = cx + row * 27.0;
        const y = cy + (j - row/2) * 27.1;
        out.push({id:'b'+n,type:n===8?'eight':'ball',num:n,color:colors[n-1],x,y,vx:0,vy:0,spin:0,pocketed:false,striped:n>8});
        n++;
      }
    }
    return out;
  }

  async function createRoom(){
    try{
      await loadFirebase();
      roomId = Math.random().toString(36).slice(2,8).toUpperCase();
      const me = {uid:getUid(),name:getName()};
      room = {host:me.uid,status:'waiting',players:[me],state:null,createdAt:Date.now(),updatedAt:Date.now()};
      await fs.setDoc(fs.doc(db,'poolRooms',roomId),room);
      watchRoom();
    }catch(e){ $('#ycPoolError').textContent = e.message || 'Could not create room.'; }
  }

  async function joinRoom(){
    const code = prompt('Enter the 6-character pool room code:');
    if(!code) return;
    try{
      await loadFirebase();
      roomId = code.trim().toUpperCase();
      const ref = fs.doc(db,'poolRooms',roomId);
      const snap = await fs.getDoc(ref);
      if(!snap.exists()) throw new Error('Room not found.');
      const r = snap.data();
      if(r.status !== 'waiting') throw new Error('That game has already started.');
      const list = Array.isArray(r.players) ? r.players : [];
      if(list.some(p=>p.uid===getUid())){ watchRoom(); return; }
      if(list.length >= 4) throw new Error('That room is full.');
      await fs.updateDoc(ref,{players:[...list,{uid:getUid(),name:getName()}],updatedAt:Date.now()});
      watchRoom();
    }catch(e){ $('#ycPoolError').textContent = e.message || 'Could not join room.'; }
  }

  function watchRoom(){
    if(unsubscribe) unsubscribe();
    unsubscribe = fs.onSnapshot(fs.doc(db,'poolRooms',roomId), snap=>{
      if(!snap.exists()){ setStatus('Room closed.'); cleanup(); return; }
      room = snap.data();
      players = room.players || [];
      currentTurnUid = room.state?.turnUid || players[0]?.uid || null;
      renderLobby();
      if(room.status === 'playing'){
        showGame();
        if(room.state?.balls) loadState(room.state);
      }
    });
  }

  function setStatus(text){ if($('#ycPoolStatus')) $('#ycPoolStatus').textContent = text; }

  function renderLobby(){
    if(!$('#ycPoolPlayers')) return;
    const box = $('#ycPoolPlayers');
    box.innerHTML = '';
    for(let i=0;i<4;i++){
      const p = players[i];
      const el = document.createElement('div');
      el.className = 'yc-pool-player';
      el.innerHTML = p
        ? `<span class="yc-pool-avatar">${esc((p.name||'P')[0].toUpperCase())}</span><div><b>${esc(p.name)}</b><div style="color:#789688;font-size:12px">${p.uid===room?.host?'Host':'Player '+(i+1)}</div></div>`
        : `<span class="yc-pool-avatar" style="opacity:.22">?</span><span class="yc-pool-wait">WAITING FOR PLAYER</span>`;
      box.appendChild(el);
    }
    if(roomId){ $('#ycPoolCode').style.display='block'; $('#ycPoolCode').textContent='ROOM  '+roomId; }
    setStatus(room?.status==='waiting' ? (players.length<2 ? 'WAITING FOR PLAYERS' : 'Players ready — waiting for host to start.') : 'Game in progress');
    $('#ycPoolStart').style.display = room?.status==='waiting' && room?.host===getUid() ? 'inline-block' : 'none';
    $('#ycPoolLeave').style.display = roomId ? 'inline-block' : 'none';
  }

  async function startGame(){
    if(!roomId || room?.host!==getUid()) return;
    await loadFirebase();
    const state = {balls:makeBalls(),turn:0,turnUid:players[0]?.uid||getUid(),updatedAt:Date.now()};
    await fs.updateDoc(fs.doc(db,'poolRooms',roomId),{status:'playing',state,updatedAt:Date.now()});
  }

  function startSolo(){
    solo = true;
    roomId = null;
    room = {host:getUid(),status:'playing',players:[{uid:getUid(),name:getName()}]};
    players = room.players;
    currentTurnUid = getUid();
    balls = makeBalls();
    showGame();
  }

  function showGame(){
    $('#ycPoolLobby').style.display='none';
    $('#ycPoolGame').classList.add('active');
    canvas = $('#ycPoolCanvas');
    ctx = canvas.getContext('2d');
    $('#ycPoolNames').innerHTML = players.map(p=>`<span class="yc-pool-name ${p.uid===currentTurnUid?'active':''}">${esc(p.name)}${p.uid===currentTurnUid?' · turn':''}</span>`).join('');
    const current = players.find(p=>p.uid===currentTurnUid)?.name || getName();
    $('#ycPoolTurn').innerHTML = currentTurnUid===getUid() ? `<strong>Your shot</strong> · ${esc(current)}` : `<strong>${esc(current)}</strong>'s shot`;
    if(!animation){lastTime=performance.now();animation=requestAnimationFrame(loop);}
    canvas.onpointerdown = pointerDown;
    canvas.onpointermove = pointerMove;
    canvas.onpointerup = pointerUp;
    canvas.onpointercancel = pointerCancel;
    draw();
  }

  function loadState(state){
    balls = (state.balls || makeBalls()).map(b=>({...b}));
    currentTurnUid = state.turnUid || players[state.turn||0]?.uid || currentTurnUid;
    shotInProgress = balls.some(b=>!b.pocketed && Math.hypot(b.vx||0,b.vy||0)>STOP_SPEED);
    updateGameLabels();
  }

  function updateGameLabels(){
    if(!$('#ycPoolNames')) return;
    $('#ycPoolNames').innerHTML = players.map(p=>`<span class="yc-pool-name ${p.uid===currentTurnUid?'active':''}">${esc(p.name)}${p.uid===currentTurnUid?' · turn':''}</span>`).join('');
    const current = players.find(p=>p.uid===currentTurnUid)?.name || 'Player';
    $('#ycPoolTurn').innerHTML = currentTurnUid===getUid() ? `<strong>Your shot</strong> · ${esc(current)}` : `<strong>${esc(current)}</strong>'s shot`;
  }

  function pointerDown(e){
    if(shotInProgress || (currentTurnUid!==getUid() && !solo)) return;
    const p=position(e), cue=balls.find(b=>b.type==='cue'&&!b.pocketed);
    if(!cue) return;
    if(Math.hypot(p.x-cue.x,p.y-cue.y) < 42){
      aiming=true; aimPoint=p; updateAimPower();
      try{canvas.setPointerCapture(e.pointerId);}catch{}
    }
  }
  function pointerMove(e){ if(!aiming) return; aimPoint=position(e); updateAimPower(); }
  function pointerUp(e){ if(!aiming) return; aimPoint=position(e); shoot(); try{canvas.releasePointerCapture(e.pointerId);}catch{} }
  function pointerCancel(){aiming=false;power=0;updateAimPower();}

  function position(e){
    const r=canvas.getBoundingClientRect();
    return {x:(e.clientX-r.left)*TABLE.w/r.width,y:(e.clientY-r.top)*TABLE.h/r.height};
  }

  function updateAimPower(){
    const cue=balls.find(b=>b.type==='cue'&&!b.pocketed);
    if(!cue || !aimPoint){power=0;return;}
    const pull=Math.min(230,Math.hypot(cue.x-aimPoint.x,cue.y-aimPoint.y));
    power=pull/230;
    if($('#ycPoolPower')) $('#ycPoolPower').style.width=(power*100)+'%';
    draw();
  }

  function shoot(){
    const cue=balls.find(b=>b.type==='cue'&&!b.pocketed);
    if(!cue) return;
    const dx=cue.x-aimPoint.x, dy=cue.y-aimPoint.y, len=Math.hypot(dx,dy);
    if(len<7){aiming=false;power=0;updateAimPower();return;}
    const speed=Math.min(MAX_POWER, 2.2 + power*MAX_POWER);
    cue.vx=dx/len*speed; cue.vy=dy/len*speed;
    cue.spin=(dy/len)*0.15;
    shotInProgress=true; aiming=false;
    power=0; updateAimPower();
  }

  function loop(now){
    const dt=Math.min(.022,(now-lastTime)/1000 || .016); lastTime=now;
    if(shotInProgress || aiming) stepPhysics(dt);
    draw();
    animation=requestAnimationFrame(loop);
  }

  function stepPhysics(dt){
    let moving=false;
    for(const b of balls){
      if(b.pocketed) continue;
      b.x += b.vx*60*dt; b.y += b.vy*60*dt;
      const speed=Math.hypot(b.vx,b.vy);
      if(speed>STOP_SPEED){
        const next=Math.max(0,speed-ROLL_DECEL*dt);
        const k=next/speed; b.vx*=k; b.vy*=k; moving=true;
      }else{b.vx=0;b.vy=0;}
      // Slight rolling spin effect, mostly visible on the cue ball.
      if(Math.abs(b.spin||0)>0.001){ b.vx += b.spin*dt*0.18; b.spin*=Math.pow(.08,dt); }
      for(const [px,py] of pockets){
        const d=Math.hypot(b.x-px,b.y-py);
        if(d<POCKET_R){
          const fall=Math.max(0,1-d/POCKET_R);
          if(fall>.08){b.pocketed=true;b.vx=b.vy=0;break;}
        }
      }
      if(b.pocketed) continue;
      // Cushions have a dead zone around pocket mouths.
      if(b.x < TABLE.playL+BALL_R){b.x=TABLE.playL+BALL_R;b.vx=Math.abs(b.vx)*CUSHION_RESTITUTION;}
      if(b.x > TABLE.playR-BALL_R){b.x=TABLE.playR-BALL_R;b.vx=-Math.abs(b.vx)*CUSHION_RESTITUTION;}
      if(b.y < TABLE.playT+BALL_R){b.y=TABLE.playT+BALL_R;b.vy=Math.abs(b.vy)*CUSHION_RESTITUTION;}
      if(b.y > TABLE.playB-BALL_R){b.y=TABLE.playB-BALL_R;b.vy=-Math.abs(b.vy)*CUSHION_RESTITUTION;}
    }

    // Equal-mass elastic collision with positional correction.
    for(let i=0;i<balls.length;i++) for(let j=i+1;j<balls.length;j++){
      const a=balls[i],b=balls[j]; if(a.pocketed||b.pocketed) continue;
      const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);
      if(d>0 && d<2*BALL_R){
        const nx=dx/d,ny=dy/d,overlap=2*BALL_R-d;
        a.x-=nx*overlap*.501;a.y-=ny*overlap*.501;b.x+=nx*overlap*.501;b.y+=ny*overlap*.501;
        const rel=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;
        if(rel<0){
          const impulse=-(1+BALL_RESTITUTION)*rel/2;
          a.vx-=impulse*nx;a.vy-=impulse*ny;b.vx+=impulse*nx;b.vy+=impulse*ny;
        }
      }
    }

    if(shotInProgress && !moving && balls.every(b=>b.pocketed || Math.hypot(b.vx,b.vy)<=STOP_SPEED)){
      shotInProgress=false;
      finishShot();
    }
  }

  async function finishShot(){
    const cue=balls.find(b=>b.type==='cue');
    if(cue?.pocketed){
      cue.pocketed=false; cue.x=280;cue.y=300;cue.vx=cue.vy=0;
    }
    if(solo){currentTurnUid=getUid();updateGameLabels();return;}
    if(roomId && room?.status==='playing' && currentTurnUid===getUid()){
      const idx=Math.max(0,players.findIndex(p=>p.uid===getUid()));
      const next=(idx+1)%Math.max(1,players.length);
      currentTurnUid=players[next]?.uid||getUid();
      const state={balls:balls.map(b=>({...b})),turn:next,turnUid:currentTurnUid,updatedAt:Date.now()};
      try{await fs.updateDoc(fs.doc(db,'poolRooms',roomId),{state,updatedAt:Date.now()});}catch(e){console.warn('Pool sync failed',e);}
      updateGameLabels();
    }
  }

  function draw(){
    if(!ctx) return;
    ctx.clearRect(0,0,TABLE.w,TABLE.h);
    drawTable();
    drawAim();
    balls.filter(b=>!b.pocketed).forEach(drawBall);
    drawCueStick();
  }

  function drawTable(){
    const bg=ctx.createLinearGradient(0,0,0,TABLE.h);bg.addColorStop(0,'#073d2a');bg.addColorStop(.5,'#0a5b3b');bg.addColorStop(1,'#063522');
    ctx.fillStyle='#24150c';ctx.fillRect(0,0,TABLE.w,TABLE.h);
    ctx.fillStyle='#5c341b';ctx.fillRect(12,12,TABLE.w-24,TABLE.h-24);
    ctx.fillStyle='#8c5a31';ctx.fillRect(25,25,TABLE.w-50,TABLE.h-50);
    ctx.fillStyle=bg;ctx.fillRect(TABLE.playL,TABLE.playT,TABLE.playR-TABLE.playL,TABLE.playB-TABLE.playT);

    // Cloth lighting and subtle baize marks.
    const glow=ctx.createRadialGradient(550,260,80,550,300,650);glow.addColorStop(0,'rgba(80,210,130,.12)');glow.addColorStop(1,'rgba(0,0,0,.18)');ctx.fillStyle=glow;ctx.fillRect(TABLE.playL,TABLE.playT,TABLE.playR-TABLE.playL,TABLE.playB-TABLE.playT);
    ctx.strokeStyle='#c18a4f';ctx.lineWidth=2;ctx.strokeRect(TABLE.playL,TABLE.playT,TABLE.playR-TABLE.playL,TABLE.playB-TABLE.playT);

    for(const [x,y] of pockets){
      const g=ctx.createRadialGradient(x-5,y-5,3,x,y,POCKET_R+5);g.addColorStop(0,'#000');g.addColorStop(.72,'#020403');g.addColorStop(1,'#18221c');ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,POCKET_R+5,0,Math.PI*2);ctx.fill();
    }

    // Rail diamonds.
    const diamond='#e1bb70';
    ctx.fillStyle=diamond;
    [180,335,490,610,765,920].forEach(x=>{for(const y of [16,TABLE.h-16]){ctx.beginPath();ctx.moveTo(x,y-5);ctx.lineTo(x+5,y);ctx.lineTo(x,y+5);ctx.lineTo(x-5,y);ctx.closePath();ctx.fill();}});
    [145,300,450].forEach(y=>{for(const x of [16,TABLE.w-16]){ctx.beginPath();ctx.moveTo(x-5,y);ctx.lineTo(x,y+5);ctx.lineTo(x+5,y);ctx.lineTo(x,y-5);ctx.closePath();ctx.fill();}});
  }

  function drawBall(b){
    const shadow=ctx.createRadialGradient(b.x+4,b.y+5,2,b.x+4,b.y+5,BALL_R+6);shadow.addColorStop(0,'rgba(0,0,0,.45)');shadow.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=shadow;ctx.beginPath();ctx.arc(b.x+4,b.y+5,BALL_R+6,0,Math.PI*2);ctx.fill();
    const grad=ctx.createRadialGradient(b.x-5,b.y-6,2,b.x,b.y,BALL_R);grad.addColorStop(0,'#fff');grad.addColorStop(.12,b.type==='cue'?'#fff':b.color);grad.addColorStop(1,b.type==='cue'?'#d9d5ca':shade(b.color,.58));ctx.fillStyle=grad;ctx.beginPath();ctx.arc(b.x,b.y,BALL_R,0,Math.PI*2);ctx.fill();
    if(b.type!=='cue' && b.striped){ctx.save();ctx.beginPath();ctx.arc(b.x,b.y,BALL_R-.5,0,Math.PI*2);ctx.clip();ctx.fillStyle='#f4f0e8';ctx.fillRect(b.x-BALL_R,b.y-4.4,BALL_R*2,8.8);ctx.restore();}
    if(b.type==='eight'){ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(b.x,b.y,5.4,0,Math.PI*2);ctx.fill();ctx.fillStyle='#101010';ctx.font='bold 7px Inter,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('8',b.x,b.y+.2);}
    else if(b.type!=='cue'){ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(b.x-3.5,b.y-3.5,2.2,0,Math.PI*2);ctx.fill();}
  }

  function shade(hex,f){
    const n=parseInt(hex.slice(1),16);const r=Math.max(0,Math.min(255,Math.round((n>>16)*f)));const g=Math.max(0,Math.min(255,Math.round(((n>>8)&255)*f)));const b=Math.max(0,Math.min(255,Math.round((n&255)*f)));return '#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('');
  }

  function drawAim(){
    if(!aiming) return;
    const cue=balls.find(b=>b.type==='cue'&&!b.pocketed);if(!cue||!aimPoint)return;
    const dx=cue.x-aimPoint.x,dy=cue.y-aimPoint.y,len=Math.hypot(dx,dy)||1,nx=dx/len,ny=dy/len;
    ctx.save();
    ctx.strokeStyle='rgba(255,255,255,.72)';ctx.lineWidth=2;ctx.setLineDash([9,9]);ctx.beginPath();ctx.moveTo(cue.x,cue.y);ctx.lineTo(cue.x+nx*420,cue.y+ny*420);ctx.stroke();ctx.setLineDash([]);
    ctx.strokeStyle='rgba(255,225,145,.38)';ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(cue.x,cue.y);ctx.lineTo(cue.x+nx*110,cue.y+ny*110);ctx.stroke();ctx.restore();
  }

  function drawCueStick(){
    if(!aiming || shotInProgress) return;
    const cue=balls.find(b=>b.type==='cue'&&!b.pocketed);if(!cue||!aimPoint)return;
    const dx=cue.x-aimPoint.x,dy=cue.y-aimPoint.y,len=Math.hypot(dx,dy)||1,nx=dx/len,ny=dy/len;
    const pull=10+power*115;
    const buttX=cue.x-nx*(pull+250),buttY=cue.y-ny*(pull+250);
    const tipX=cue.x-nx*(pull+8),tipY=cue.y-ny*(pull+8);
    ctx.save();ctx.lineCap='round';
    ctx.strokeStyle='#4b2917';ctx.lineWidth=12;ctx.beginPath();ctx.moveTo(buttX,buttY);ctx.lineTo(tipX,tipY);ctx.stroke();
    const wood=ctx.createLinearGradient(buttX,buttY,tipX,tipY);wood.addColorStop(0,'#7b4525');wood.addColorStop(.72,'#d9ad6a');wood.addColorStop(1,'#f2e0bc');
    ctx.strokeStyle=wood;ctx.lineWidth=8;ctx.beginPath();ctx.moveTo(buttX,buttY);ctx.lineTo(tipX,tipY);ctx.stroke();
    ctx.strokeStyle='#d8d9df';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(tipX,tipY);ctx.lineTo(cue.x-nx*(pull-2),cue.y-ny*(pull-2));ctx.stroke();
    ctx.strokeStyle='#f5f4ec';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(tipX,tipY);ctx.lineTo(cue.x-nx*(pull-2),cue.y-ny*(pull-2));ctx.stroke();
    ctx.restore();
  }

  async function leaveRoom(){
    try{
      if(roomId && db){
        const ref=fs.doc(db,'poolRooms',roomId);
        if(room?.host===getUid()) await fs.updateDoc(ref,{status:'closed',updatedAt:Date.now()});
        else await fs.updateDoc(ref,{players:(players||[]).filter(p=>p.uid!==getUid()),updatedAt:Date.now()});
      }
    }catch(e){console.warn(e)}
    cleanup();
    $('#ycPoolLobby').style.display='grid';$('#ycPoolGame').classList.remove('active');
  }

  function cleanup(){
    if(unsubscribe){unsubscribe();unsubscribe=null;}
    roomId=null;room=null;players=[];solo=false;balls=[];aiming=false;shotInProgress=false;currentTurnUid=null;
  }

  function hook(){
    inject();
    document.addEventListener('click',e=>{
      const b=e.target.closest('button');if(!b)return;
      const text=(b.textContent||'').trim().toLowerCase();
      if(text==='pool' || text.startsWith('pool ')){
        e.preventDefault();e.stopImmediatePropagation();open();
      }
    },true);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',hook); else hook();
})();
