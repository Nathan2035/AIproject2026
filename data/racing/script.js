// --- 自動縮放邏輯 ---
let currentScale = 1;
function resize() {
    const wrapper = document.getElementById('gameWrapper');
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    currentScale = Math.min(winW / 420, winH / 750);
    wrapper.style.transform = `scale(${currentScale})`;
}
window.addEventListener('resize', resize);
resize();

// --- 遊戲邏輯 ---
const backBtn = document.getElementById('backBtn');
const game = document.getElementById('game');
const player = document.getElementById('player');
const startBtn = document.getElementById('startBtn');
const gameOverText = document.getElementById('gameOver');
const canvas = document.getElementById('roadCanvas');
const ctx = canvas.getContext('2d');
const kmDisplay = document.getElementById('kmDisplay');
const speedDisplay = document.getElementById('speedDisplay');
const adBoard = document.getElementById('adBoard');
const highScoreDisplay = document.getElementById('highScoreDisplay');

backBtn.onclick=()=>{window.history.back();};

const gameWidth = 400, gameHeight = 600, playerWidth=50;
let playerPos = 175; player.style.left = playerPos+'px';
let targetPlayerPos = playerPos;
const PLAYER_MOVE_SPEED = 150;
let enemies = [];
let gameRunning=false;
let km=0, speed=0, displayKm=0, targetSpeed=100;
const acceleration=100/6;
let lastTimestamp=0;
let enemySpawnTimer = 0;

let highScore = parseFloat(localStorage.getItem('racing_high_score')) || 0;

const PLAYER_HITBOX_SCALE = 0.8;
const ENEMY_HITBOX_SCALE = 0.8;
const HITBOX_RADIUS = 18;
const SHOW_HITBOX = false;

const PX_PER_M = 19.5;
const WHITE_LINE_KM = 0.004;
const GAP_KM = 0.006;
const WHITE_LINE_PX = WHITE_LINE_KM * 1000 * PX_PER_M;
const GAP_PX = GAP_KM * 1000 * PX_PER_M;

let lineOffset=0;
const LEFT_MARGIN = 50 + 20;
const RIGHT_MARGIN = gameWidth - 50 - 20;
const LINE_WIDTH = 5;
const PLAYER_HITBOX_OFFSET = (playerWidth - PLAYER_HITBOX_SCALE*playerWidth)/2;
const ENEMY_HITBOX_OFFSET = (50 - ENEMY_HITBOX_SCALE*50)/2;
const PLAYER_MIN_X = LEFT_MARGIN - PLAYER_HITBOX_OFFSET;
const PLAYER_MAX_X = RIGHT_MARGIN - playerWidth - LINE_WIDTH + PLAYER_HITBOX_OFFSET - 4;
const ENEMY_MIN_X = LEFT_MARGIN - ENEMY_HITBOX_OFFSET;
const ENEMY_MAX_X = RIGHT_MARGIN - 50 - LINE_WIDTH + ENEMY_HITBOX_OFFSET - 4;

let nextAdKm = 1;
let adBoardActive = false;
let adBoardPosY = -50;

// 音效
let audioCtx, engineOsc, engineNoise, engineGain, engineFilter, engineSoundActive=false;
let crashBuffer = null;
function loadCrashSound(){
  if(!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  fetch('Crash_sound.mp3').then(r => r.arrayBuffer()).then(d => audioCtx.decodeAudioData(d)).then(b => { crashBuffer = b; }).catch(e => console.log(e));
}
function playCrashSound(){ if(!crashBuffer) return; const cs = audioCtx.createBufferSource(); cs.buffer = crashBuffer; cs.connect(audioCtx.destination); cs.start(); }
function startEngineSound() {
  if(engineSoundActive) return;
  if(!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  loadCrashSound();
  engineOsc = audioCtx.createOscillator(); engineOsc.type = 'sawtooth';
  const buffer = audioCtx.createBuffer(1, audioCtx.sampleRate, audioCtx.sampleRate);
  const data = buffer.getChannelData(0); for(let i=0;i<data.length;i++) data[i] = Math.random()*2-1;
  engineNoise = audioCtx.createBufferSource(); engineNoise.buffer = buffer; engineNoise.loop = true;
  engineGain = audioCtx.createGain(); engineGain.gain.value = 0.15;
  engineFilter = audioCtx.createBiquadFilter(); engineFilter.type = 'lowpass'; engineFilter.frequency.value = 800;
  engineOsc.connect(engineFilter); engineNoise.connect(engineFilter); engineFilter.connect(engineGain); engineGain.connect(audioCtx.destination);
  engineOsc.frequency.value = speedToHz(speed); engineOsc.start(); engineNoise.start(); engineSoundActive = true;
}
function stopEngineSound(){ if(!engineSoundActive) return; engineOsc.stop(); engineNoise.stop(); engineSoundActive = false; }
function speedToHz(spd) { return 100 + spd * 5; }
function updateEngineSound(delta){ if(!engineSoundActive) return; engineOsc.frequency.setTargetAtTime(speedToHz(speed), audioCtx.currentTime, 0.1); engineFilter.frequency.setTargetAtTime(500 + speed*1.5, audioCtx.currentTime, 0.1); engineGain.gain.setTargetAtTime(0.05 + speed/300*0.25, audioCtx.currentTime, 0.1); }

function displayLED(container,text){ container.innerHTML=''; for(let c of text){ const span=document.createElement('span'); span.className = /[0-9]/.test(c)?'digit':'text'; span.textContent=c; container.appendChild(span); } }
function updateInfo(){ while(km >= displayKm + 0.1) displayKm += 0.1; const kmFixed = displayKm.toFixed(1); const [ki, kd] = kmFixed.split('.'); displayLED(speedDisplay, `${Math.floor(speed).toString().padStart(3,'0')} KM/H`); displayLED(kmDisplay, `${ki.padStart(3,'0')}.${kd} KM`); }
function updateHighScoreDisplay() { 
    const roundedHigh = highScore.toFixed(1); 
    const [int, dec] = roundedHigh.split('.'); 
    displayLED(highScoreDisplay, `最高紀錄 : ${int.padStart(3,'0')}.${dec} KM`); 
}

function getX(e) {
    const rect = game.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    return (clientX - rect.left) / currentScale;
}
game.addEventListener('mousemove', e=>{ if(!gameRunning) return; targetPlayerPos = getX(e); });
game.addEventListener('touchmove', e=>{ if(!gameRunning) return; targetPlayerPos = getX(e); e.preventDefault(); }, {passive: false});

const playerHitboxDiv = document.createElement('div'); playerHitboxDiv.className = 'hitbox'; game.appendChild(playerHitboxDiv);
function getScaledRect(rect, scale){ const w = rect.width * scale; const h = rect.height * scale; const cx = rect.left + rect.width / 2; const cy = rect.top + rect.height / 2; return {left: cx-w/2, right: cx+w/2, top: cy-h/2, bottom: cy+h/2}; }
function clamp(v, min, max){ return Math.max(min, Math.min(max, v)); }
function pointToRectDist(px, py, rect){ const cx = clamp(px, rect.left, rect.right); const cy = clamp(py, rect.top, rect.bottom); const dx = px-cx; const dy = py-cy; return Math.sqrt(dx*dx + dy*dy); }
function roundedRectCollision(a,b,r){ const aCorners=[[a.left+r,a.top+r],[a.right-r,a.top+r],[a.left+r,a.bottom-r],[a.right-r,a.bottom-r]]; const bCorners=[[b.left+r,b.top+r],[b.right-r,b.top+r],[b.left+r,b.bottom-r],[b.right-r,b.bottom-r]]; for(const [ax,ay] of aCorners) for(const [bx,by] of bCorners) if((ax-bx)**2+(ay-by)**2<=(r*2)**2) return true; for(const [ax,ay] of aCorners) if(pointToRectDist(ax,ay,b)<=r) return true; for(const [bx,by] of bCorners) if(pointToRectDist(bx,by,a)<=r) return true; return false; }

function spawnEnemy(){ 
    let laneX, topY, attempts = 0; 
    do { laneX = ENEMY_MIN_X + Math.random()*(ENEMY_MAX_X - ENEMY_MIN_X); topY = -100 - Math.random()*200; attempts++; 
    } while(enemies.some(e => Math.abs(parseFloat(e.style.left)-laneX)<50 && Math.abs(parseFloat(e.style.top)-topY)<100) && attempts < 20); 
    const enemy = document.createElement('div'); enemy.classList.add('enemy'); enemy.style.left = laneX + 'px'; enemy.style.top = topY + 'px'; 
    const enemyImg = document.createElement('div'); enemyImg.className = 'enemyImg'; 
    const rand = Math.random(); 
    if(rand < 1/3) enemyImg.style.backgroundImage = "url('E1.png')"; 
    else if(rand < 2/3) enemyImg.style.backgroundImage = "url('E2.png')"; 
    else enemyImg.style.backgroundImage = "url('E3.png')"; 
    enemy.appendChild(enemyImg); 
    enemy.vx = (Math.random()*0.6 - 0.3); enemy.minX = ENEMY_MIN_X; enemy.maxX = ENEMY_MAX_X; 
    enemy.targetSpeed = targetSpeed * (0.7 + Math.random()*0.2); 
    enemy.speed = enemy.targetSpeed * (0.5 + Math.random()*0.3); 
    enemy.acceleration = (enemy.targetSpeed - enemy.speed) / 3; 
    const hitboxDiv = document.createElement('div'); hitboxDiv.className = 'hitbox'; enemy.hitboxDiv = hitboxDiv; 
    game.appendChild(hitboxDiv); game.appendChild(enemy); enemies.push(enemy); 
}
function clearEnemies(){ enemies.forEach(e=>{ if(e.hitboxDiv) e.hitboxDiv.remove(); e.remove(); }); enemies=[]; }
function adjustEnemyDistances(){ const SAFE_DIST = 100; for(let i=0;i<enemies.length;i++){ for(let j=i+1;j<enemies.length;j++){ const e1 = enemies[i]; const e2 = enemies[j]; let y1 = parseFloat(e1.style.top); let y2 = parseFloat(e2.style.top); let dy = y2 - y1; if(Math.abs(dy) < SAFE_DIST){ const push = (SAFE_DIST - Math.abs(dy)) * 0.5; const dir = dy >= 0 ? 1 : -1; e1.style.top = (y1 - push * dir)+'px'; e2.style.top = (y2 + push * dir)+'px'; } } } }

// 煙火特效
let fireworks = []; let fireworkText = null; let fireworkTimer = 0;
function spawnFirework(x, y, km){
    fireworks = []; fireworkTimer = 5; fireworkText = `恭喜你，達到${km}KM`;
    for(let i=0;i<50;i++){ const ang = Math.random()*2*Math.PI; const spd = 50 + Math.random()*100; fireworks.push({x, y, vx:Math.cos(ang)*spd, vy:Math.sin(ang)*spd, life:2, color:`hsl(${Math.random()*360},100%,50%)`}); }
}
function updateFireworks(delta){
    if(fireworkTimer<=0) return; fireworkTimer -= delta;
    fireworks.forEach(p=>{ p.x += p.vx*delta; p.y += p.vy*delta; p.vy += 20*delta; p.life -= delta/5; });
}
function drawFireworks(){
    if(fireworkTimer<=0) return;
    fireworks.forEach(p=>{ ctx.fillStyle=p.color; ctx.globalAlpha=Math.max(0,p.life); ctx.beginPath(); ctx.arc(p.x,p.y,3,0,2*Math.PI); ctx.fill(); });
    if(fireworkText){ ctx.globalAlpha = Math.sin(Date.now()/100)*0.5+0.5; ctx.fillStyle='yellow'; ctx.font='32px monospace'; ctx.textAlign='center'; ctx.fillText(fireworkText, gameWidth/2, gameHeight/2); }
    ctx.globalAlpha=1;
}

function drawRoad(){
    ctx.clearRect(0,0,gameWidth,gameHeight);
    ctx.fillStyle='#C2B280'; ctx.fillRect(0,0,LEFT_MARGIN,gameHeight); ctx.fillRect(RIGHT_MARGIN,0,gameWidth-RIGHT_MARGIN,gameHeight);
    ctx.fillStyle='#555'; ctx.fillRect(LEFT_MARGIN,0,RIGHT_MARGIN-LEFT_MARGIN,gameHeight);
    ctx.strokeStyle='#fff'; ctx.lineWidth=LINE_WIDTH;
    ctx.beginPath(); ctx.moveTo(LEFT_MARGIN,0); ctx.lineTo(LEFT_MARGIN,gameHeight); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(RIGHT_MARGIN,0); ctx.lineTo(RIGHT_MARGIN,gameHeight); ctx.stroke();
    ctx.setLineDash([WHITE_LINE_PX,GAP_PX]);
    ctx.beginPath(); ctx.moveTo(gameWidth/2,lineOffset); ctx.lineTo(gameWidth/2,gameHeight+lineOffset); ctx.stroke();
    ctx.setLineDash([]);
}

function gameLoop(timestamp){
    if(!lastTimestamp) lastTimestamp=timestamp;
    const delta = (timestamp - lastTimestamp)/1000; lastTimestamp = timestamp;

    if(km >= 1 && targetSpeed===100) targetSpeed=150;
    if(km >= 2 && targetSpeed===150) targetSpeed=200;
    if(speed<targetSpeed){ speed += acceleration*delta; if(speed>targetSpeed) speed=targetSpeed; }
    km += speed*delta/3600;

    const roadSpeedPxPerSec = (speed*1000/3600)*PX_PER_M;
    lineOffset += roadSpeedPxPerSec*delta;
    if(lineOffset >= WHITE_LINE_PX+GAP_PX) lineOffset -= WHITE_LINE_PX+GAP_PX;

    drawRoad(); updateInfo(); updateFireworks(delta); drawFireworks();

    if(Math.floor(km) === nextAdKm){
        const curKm = nextAdKm; adBoardActive = true; adBoardPosY = -50; adBoard.style.display = 'flex';
        adBoard.style.left = RIGHT_MARGIN + 5 + 'px'; adBoard.textContent = `恭喜達成${curKm}KM`;
        spawnFirework(gameWidth/2 - 50, gameHeight/2, curKm);
        setTimeout(()=>{ spawnFirework(gameWidth/2 + 50, gameHeight/2, curKm); }, 500);
        nextAdKm++;
    }

    if(adBoardActive){ adBoardPosY += roadSpeedPxPerSec*delta; adBoard.style.top = adBoardPosY+'px'; if(adBoardPosY>gameHeight){ adBoardActive=false; adBoard.style.display='none'; } }

    const diff = targetPlayerPos - (playerPos+playerWidth/2);
    if(Math.abs(diff)>1){ const move = Math.sign(diff)*Math.min(Math.abs(diff), PLAYER_MOVE_SPEED*delta); playerPos+=move; playerPos=clamp(playerPos,PLAYER_MIN_X,PLAYER_MAX_X); player.style.left=playerPos+'px'; }

    const pRect = getScaledRect(player.getBoundingClientRect(), PLAYER_HITBOX_SCALE);
    if(SHOW_HITBOX){ const gRect=game.getBoundingClientRect(); playerHitboxDiv.style.display='block'; playerHitboxDiv.style.left=(pRect.left-gRect.left)+'px'; playerHitboxDiv.style.top=(pRect.top-gRect.top)+'px'; playerHitboxDiv.style.width=(pRect.right-pRect.left)+'px'; playerHitboxDiv.style.height=(pRect.bottom-pRect.top)+'px'; } else playerHitboxDiv.style.display='none';

    enemySpawnTimer += delta;
    let curInt = (targetSpeed===200)?1:(targetSpeed===150?1.5:2);
    if(enemySpawnTimer>=curInt){ spawnEnemy(); enemySpawnTimer=0; }

    enemies.forEach((enemy,idx)=>{
        if(enemy.speed<enemy.targetSpeed){ enemy.speed+=enemy.acceleration*delta; if(enemy.speed>enemy.targetSpeed) enemy.speed=enemy.targetSpeed; }
        const relativeMovePx = ((enemy.speed-speed)*1000/3600)*PX_PER_M*delta;
        enemy.style.top = parseFloat(enemy.style.top)-relativeMovePx+'px';
        let left=parseFloat(enemy.style.left)+enemy.vx*delta*60; left=clamp(left,ENEMY_MIN_X,ENEMY_MAX_X); enemy.style.left=left+'px';
        if(parseFloat(enemy.style.top)>gameHeight){ if(enemy.hitboxDiv) enemy.hitboxDiv.remove(); enemy.remove(); enemies.splice(idx,1); return; }
        const eRect=getScaledRect(enemy.getBoundingClientRect(), ENEMY_HITBOX_SCALE);
        if(SHOW_HITBOX){ const gRect=game.getBoundingClientRect(); const div=enemy.hitboxDiv; div.style.display='block'; div.style.left=(eRect.left-gRect.left)+'px'; div.style.top=(eRect.top-gRect.top)+'px'; div.style.width=(eRect.right-eRect.left)+'px'; div.style.height=(eRect.bottom-eRect.top)+'px'; } else if(enemy.hitboxDiv) enemy.hitboxDiv.style.display='none';
        if(roundedRectCollision(pRect, eRect, HITBOX_RADIUS)){
            gameOverText.style.display='block'; gameRunning=false; startBtn.classList.remove('disabled'); startBtn.disabled=false; stopEngineSound(); playCrashSound();
        }
    });

    adjustEnemyDistances();
    if(engineSoundActive) updateEngineSound(delta);
    const roundedKm = parseFloat(displayKm.toFixed(1));
    if(roundedKm>highScore){ highScore=roundedKm; localStorage.setItem('racing_high_score', highScore); updateHighScoreDisplay(); }
    if(gameRunning) requestAnimationFrame(gameLoop);
}

startBtn.addEventListener('click', ()=>{
    if(startBtn.disabled) return;
    startBtn.disabled=true; startBtn.classList.add('disabled');
    clearEnemies(); playerPos=175; targetPlayerPos=175; player.style.left=playerPos+'px';
    gameOverText.style.display='none'; km=0; speed=0; displayKm=0; targetSpeed=100; lastTimestamp=0; enemySpawnTimer=0; nextAdKm=1; adBoardActive=false;
    updateInfo(); gameRunning=true; startEngineSound(); requestAnimationFrame(gameLoop);
});

// --- 初始化啟動順序 ---
km=0; speed=0; displayKm=0; 
resize(); // 先確定縮放
drawRoad(); // 再畫跑道
updateInfo(); 
updateHighScoreDisplay();