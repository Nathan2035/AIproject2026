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
backBtn.onclick = () => { window.history.back(); };

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

const gameWidth = 400, gameHeight = 600, playerWidth = 50;
let playerPos = 175; player.style.left = playerPos + 'px';
let targetPlayerPos = playerPos;
const PLAYER_MOVE_SPEED = 150;
let enemies = [];
let gameRunning = false;
let km = 0, speed = 0, displayKm = 0, targetSpeed = 100;
const acceleration = 100 / 6;
let lastTimestamp = 0;
let enemySpawnTimer = 0;

let highScore = parseFloat(localStorage.getItem('racing_high_score')) || 0;

const PLAYER_HITBOX_SCALE = 0.8;
const ENEMY_HITBOX_SCALE = 0.8;
const HITBOX_RADIUS = 18;
const SHOW_HITBOX = false;

const PX_PER_M = 19.5;
const WHITE_LINE_PX = 0.004 * 1000 * PX_PER_M;
const GAP_PX = 0.006 * 1000 * PX_PER_M;

let lineOffset = 0;
const LEFT_MARGIN = 70;
const RIGHT_MARGIN = 330;
const LINE_WIDTH = 5;

const PLAYER_MIN_X = LEFT_MARGIN - (playerWidth - PLAYER_HITBOX_SCALE * playerWidth) / 2;
const PLAYER_MAX_X = RIGHT_MARGIN - playerWidth - LINE_WIDTH + (playerWidth - PLAYER_HITBOX_SCALE * playerWidth) / 2 - 4;
const ENEMY_MIN_X = LEFT_MARGIN - (50 - ENEMY_HITBOX_SCALE * 50) / 2;
const ENEMY_MAX_X = RIGHT_MARGIN - 50 - LINE_WIDTH + (50 - ENEMY_HITBOX_SCALE * 50) / 2 - 4;

let nextAdKm = 1;
let adBoardActive = false;
let adBoardPosY = -50;

// 音效系統
let audioCtx, engineOsc, engineNoise, engineGain, engineFilter, engineRunning = false;
let crashBuffer = null;

function loadCrashSound() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    fetch('Crash_sound.mp3').then(r => r.arrayBuffer()).then(d => audioCtx.decodeAudioData(d)).then(b => { crashBuffer = b; }).catch(e => console.log(e));
}

function playCrashSound() { if (!crashBuffer) return; const cs = audioCtx.createBufferSource(); cs.buffer = crashBuffer; cs.connect(audioCtx.destination); cs.start(); }

function startEngineSound() {
    if (engineRunning) return;
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    loadCrashSound();
    engineOsc = audioCtx.createOscillator(); engineOsc.type = 'sawtooth';
    const buffer = audioCtx.createBuffer(1, audioCtx.sampleRate, audioCtx.sampleRate);
    const data = buffer.getChannelData(0); for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    engineNoise = audioCtx.createBufferSource(); engineNoise.buffer = buffer; engineNoise.loop = true;
    engineGain = audioCtx.createGain(); engineGain.gain.value = 0.15;
    engineFilter = audioCtx.createBiquadFilter(); engineFilter.type = 'lowpass'; engineFilter.frequency.value = 800;
    engineOsc.connect(engineFilter); engineNoise.connect(engineFilter); engineFilter.connect(engineGain); engineGain.connect(audioCtx.destination);
    engineOsc.start(); engineNoise.start(); engineRunning = true;
}

function stopEngineSound() { if (!engineRunning) return; engineOsc.stop(); engineNoise.stop(); engineRunning = false; }

function updateEngineSound() { if (!engineRunning) return; engineOsc.frequency.setTargetAtTime(100 + speed * 5, audioCtx.currentTime, 0.1); }

function displayLED(container, text) { container.innerHTML = ''; for (let c of text) { const span = document.createElement('span'); span.className = /[0-9]/.test(c) ? 'digit' : 'text'; span.textContent = c; container.appendChild(span); } }

function updateInfo() {
    while (km >= displayKm + 0.1) displayKm += 0.1;
    const [ki, kd] = displayKm.toFixed(1).split('.');
    displayLED(speedDisplay, `${Math.floor(speed).toString().padStart(3, '0')} KM/H`);
    displayLED(kmDisplay, `${ki.padStart(3, '0')}.${kd} KM`);
}

function updateHighScoreDisplay() {
    const [int, dec] = highScore.toFixed(1).split('.');
    displayLED(highScoreDisplay, `最高紀錄 : ${int.padStart(3, '0')}.${dec} KM`);
}

// 觸控與座標
function getX(e) {
    const rect = game.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    return (clientX - rect.left) / currentScale;
}
game.addEventListener('mousemove', e => { if (gameRunning) targetPlayerPos = getX(e); });
game.addEventListener('touchmove', e => { if (gameRunning) { targetPlayerPos = getX(e); e.preventDefault(); } }, { passive: false });

function getScaledRect(rect, scale) { const w = rect.width * scale, h = rect.height * scale; const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2; return { left: cx - w / 2, right: cx + w / 2, top: cy - h / 2, bottom: cy + h / 2 }; }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function pointToRectDist(px, py, rect) { const cx = clamp(px, rect.left, rect.right), cy = clamp(py, rect.top, rect.bottom); return Math.sqrt((px - cx) ** 2 + (py - cy) ** 2); }
function roundedRectCollision(a, b, r) { const aC = [[a.left + r, a.top + r], [a.right - r, a.top + r], [a.left + r, a.bottom - r], [a.right - r, a.bottom - r]]; for (const [ax, ay] of aC) if (pointToRectDist(ax, ay, b) <= r) return true; return false; }

function spawnEnemy() {
    let laneX, topY, attempts = 0;
    do { laneX = ENEMY_MIN_X + Math.random() * (ENEMY_MAX_X - ENEMY_MIN_X); topY = -100 - Math.random() * 200; attempts++; } 
    while (enemies.some(e => Math.abs(parseFloat(e.style.left) - laneX) < 50 && Math.abs(parseFloat(e.style.top) - topY) < 100) && attempts < 20);
    const enemy = document.createElement('div'); enemy.classList.add('enemy'); enemy.style.left = laneX + 'px'; enemy.style.top = topY + 'px';
    const enemyImg = document.createElement('div'); enemyImg.className = 'enemyImg';
    const rand = Math.random(); enemyImg.style.backgroundImage = `url(E${Math.floor(rand * 3) + 1}.png)`;
    enemy.appendChild(enemyImg);
    enemy.vx = (Math.random() * 0.6 - 0.3);
    enemy.targetSpeed = targetSpeed * (0.7 + Math.random() * 0.2);
    enemy.speed = enemy.targetSpeed * 0.6; enemy.acceleration = (enemy.targetSpeed - enemy.speed) / 3;
    game.appendChild(enemy); enemies.push(enemy);
}

function clearEnemies() { enemies.forEach(e => e.remove()); enemies = []; }

function adjustEnemyDistances() {
    const SAFE_DIST = 100;
    for (let i = 0; i < enemies.length; i++) {
        for (let j = i + 1; j < enemies.length; j++) {
            const e1 = enemies[i], e2 = enemies[j];
            let y1 = parseFloat(e1.style.top), y2 = parseFloat(e2.style.top);
            if (Math.abs(y2 - y1) < SAFE_DIST) {
                const push = (SAFE_DIST - Math.abs(y2 - y1)) * 0.5;
                const dir = y2 >= y1 ? 1 : -1;
                e1.style.top = (y1 - push * dir) + 'px'; e2.style.top = (y2 + push * dir) + 'px';
            }
        }
    }
}

// 煙火
let fireworks = [], fireworkText = null, fireworkTimer = 0;
function spawnFirework(x, y, km) {
    fireworks = []; fireworkTimer = 5; fireworkText = `恭喜你，達到${km}KM`;
    for (let i = 0; i < 50; i++) {
        const ang = Math.random() * 2 * Math.PI, spd = 50 + Math.random() * 100;
        fireworks.push({ x, y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, life: 2, color: `hsl(${Math.random() * 360},100%,50%)` });
    }
}

function gameLoop(timestamp) {
    if (!lastTimestamp) lastTimestamp = timestamp;
    const delta = (timestamp - lastTimestamp) / 1000; lastTimestamp = timestamp;

    if (km >= 1 && targetSpeed === 100) targetSpeed = 150;
    if (km >= 2 && targetSpeed === 150) targetSpeed = 200;
    if (speed < targetSpeed) { speed += acceleration * delta; if (speed > targetSpeed) speed = targetSpeed; }
    km += speed * delta / 3600;

    const roadSpeedPx = (speed * 1000 / 3600) * PX_PER_M;
    lineOffset = (lineOffset + roadSpeedPx * delta) % (WHITE_LINE_PX + GAP_PX);

    // 畫背景
    ctx.clearRect(0, 0, 400, 600);
    ctx.fillStyle = '#C2B280'; ctx.fillRect(0, 0, 70, 600); ctx.fillRect(330, 0, 70, 600);
    ctx.fillStyle = '#555'; ctx.fillRect(70, 0, 260, 600);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(70, 0); ctx.lineTo(70, 600); ctx.moveTo(330, 0); ctx.lineTo(330, 600); ctx.stroke();
    ctx.setLineDash([WHITE_LINE_PX, GAP_PX]);
    ctx.beginPath(); ctx.moveTo(200, lineOffset); ctx.lineTo(200, 600 + lineOffset); ctx.stroke();
    ctx.setLineDash([]);

    // 煙火更新
    if (fireworkTimer > 0) {
        fireworkTimer -= delta;
        fireworks.forEach(p => {
            p.x += p.vx * delta; p.y += p.vy * delta; p.vy += 20 * delta; p.life -= delta / 5;
            ctx.fillStyle = p.color; ctx.globalAlpha = Math.max(0, p.life); ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, 2 * Math.PI); ctx.fill();
        });
        if (fireworkText) { ctx.globalAlpha = Math.sin(Date.now() / 100) * 0.5 + 0.5; ctx.fillStyle = 'yellow'; ctx.font = '32px monospace'; ctx.textAlign = 'center'; ctx.fillText(fireworkText, 200, 300); }
        ctx.globalAlpha = 1;
    }

    if (Math.floor(km) === nextAdKm) {
        adBoardActive = true; adBoardPosY = -50; adBoard.style.display = 'flex';
        adBoard.textContent = `恭喜達成${nextAdKm}KM`; spawnFirework(200, 300, nextAdKm); nextAdKm++;
    }

    if (adBoardActive) { adBoardPosY += roadSpeedPx * delta; adBoard.style.top = adBoardPosY + 'px'; if (adBoardPosY > 600) adBoard.style.display = 'none'; }

    const diff = targetPlayerPos - (playerPos + 25);
    if (Math.abs(diff) > 1) { playerPos += Math.sign(diff) * Math.min(Math.abs(diff), PLAYER_MOVE_SPEED * delta); playerPos = clamp(playerPos, 65, 285); player.style.left = playerPos + 'px'; }

    enemySpawnTimer += delta;
    if (enemySpawnTimer >= (targetSpeed >= 200 ? 1 : 1.5)) { spawnEnemy(); enemySpawnTimer = 0; }

    const pRect = getScaledRect(player.getBoundingClientRect(), 0.8);
    enemies.forEach((enemy, idx) => {
        const eSpeed = enemy.speed;
        const relativeMove = (eSpeed - speed) * 1000 / 3600 * PX_PER_M * delta;
        enemy.style.top = (parseFloat(enemy.style.top) - relativeMove) + 'px';
        let left = parseFloat(enemy.style.left) + enemy.vx * delta * 60;
        enemy.style.left = clamp(left, 65, 285) + 'px';

        if (parseFloat(enemy.style.top) > 650) { enemy.remove(); enemies.splice(idx, 1); return; }
        const eRect = getScaledRect(enemy.getBoundingClientRect(), 0.8);
        if (roundedRectCollision(pRect, eRect, 18)) {
            gameOverText.style.display = 'block'; gameRunning = false; startBtn.disabled = false; stopEngineSound(); playCrashSound();
        }
    });

    adjustEnemyDistances();
    if (engineRunning) updateEngineSound();
    if (displayKm > highScore) { highScore = parseFloat(displayKm.toFixed(1)); localStorage.setItem('racing_high_score', highScore); updateHighScoreDisplay(); }
    updateInfo();
    if (gameRunning) requestAnimationFrame(gameLoop);
}

startBtn.onclick = () => {
    if (gameRunning) return;
    clearEnemies(); playerPos = 175; targetPlayerPos = 200; km = 0; speed = 0; displayKm = 0;
    targetSpeed = 100; lastTimestamp = 0; nextAdKm = 1; gameOverText.style.display = 'none';
    gameRunning = true; startEngineSound(); requestAnimationFrame(gameLoop);
};

updateHighScoreDisplay(); updateInfo();