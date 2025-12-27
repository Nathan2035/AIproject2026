const HORSE_COUNT = 8;
let georgeChips = 5000;
let maryChips = 5000;

let horses = [], rankingCounter = 0, startTime = null, animationId = null, lastTs = null, ragingHorseId = null, raceHistory = [], betPlaced = false, statsVisible = false, currentBets = [], currentChips = [];

const betSelect = document.getElementById('betSelect');
const betSelect2 = document.getElementById('betSelect2');
const chipSelect1 = document.getElementById('chipSelect1');
const chipSelect2 = document.getElementById('chipSelect2');
const georgeChipsDisp = document.getElementById('georgeChipsDisp');
const maryChipsDisp = document.getElementById('maryChipsDisp');
const countdownEl = document.getElementById('countdown');
const horseRow = document.getElementById('horseRow');
const timeRow = document.getElementById('timeRow');
const messageEl = document.getElementById('message');
const betMessageEl = document.getElementById('betMessage');
const startBtn = document.getElementById('startBtn');
const rematchBtn = document.getElementById('rematchBtn');
const resetBtn = document.getElementById('resetBtn');
const statsBtn = document.getElementById('statsBtn');
const placeBetBtn = document.getElementById('placeBetBtn');
const track = document.getElementById('track');
const startLine = document.getElementById('startLine');
const backBtn = document.getElementById('backBtn');

backBtn.onclick = () => { window.history.back(); };

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const audioBuffers = {};

async function loadAudio(name, url) {
    try {
        const resp = await fetch(url);
        const arrBuf = await resp.arrayBuffer();
        audioBuffers[name] = await audioCtx.decodeAudioData(arrBuf);
    } catch (e) {
        console.log("Audio load error");
    }
}

function playSound(name) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    if (audioBuffers[name]) {
        const src = audioCtx.createBufferSource();
        src.buffer = audioBuffers[name];
        src.connect(audioCtx.destination);
        src.start(0);
    }
}

loadAudio('start', 'correct_answer2.mp3');
loadAudio('win', 'coin07.mp3');
loadAudio('champion', 'cheers2.mp3');

function updateChipsDisplay() {
    georgeChipsDisp.textContent = georgeChips.toString().padStart(6, '0');
    maryChipsDisp.textContent = maryChips.toString().padStart(6, '0');
}

function init() {
    track.querySelectorAll('.lane,.horse').forEach(e => e.remove());
    horseRow.querySelectorAll('td').forEach(td => td.textContent = '');
    timeRow.querySelectorAll('td').forEach(td => td.textContent = '');
    betSelect.innerHTML = ''; betSelect2.innerHTML = '';
    messageEl.textContent = ''; messageEl.style.opacity = 1;
    betMessageEl.style.opacity = 0;
    horses = []; rankingCounter = 0; startTime = null; lastTs = null;
    startBtn.disabled = true;
    rematchBtn.disabled = true;
    placeBetBtn.disabled = false;
    betPlaced = false; ragingHorseId = Math.floor(Math.random() * HORSE_COUNT) + 1;

    const laneHeight = 350 / HORSE_COUNT;
    for (let i = 0; i < HORSE_COUNT; i++) {
        const lane = document.createElement('div'); lane.className = 'lane'; lane.style.top = i * laneHeight + 'px'; track.appendChild(lane);
        const horse = document.createElement('div'); horse.className = 'horse'; horse.style.top = i * laneHeight + 2 + 'px'; horse.innerHTML = '🐖<div class="number">' + (i + 1) + '</div>'; track.appendChild(horse);
        horses.push({ id: i + 1, x: 10, speed: ((Math.random() * 2 + 1.5) * 0.5) * 0.8, finished: false, el: horse, tilt: 0, tiltDirection: 1, finishTime: 0, isRaging: false, rageTime: 0, rageSpeed: 0 });
        const opt1 = document.createElement('option'); opt1.value = i + 1; opt1.textContent = (i + 1) + '號豬'; betSelect.appendChild(opt1);
        const opt2 = document.createElement('option'); opt2.value = i + 1; opt2.textContent = (i + 1) + '號豬'; betSelect2.appendChild(opt2);
    }
    startLine.style.display = 'block';
    updateChipsDisplay();
}

function showBetMessage(msg) {
    betMessageEl.textContent = msg;
    betMessageEl.style.opacity = 1;
    setTimeout(() => { betMessageEl.style.opacity = 0; }, 3000);
}

placeBetBtn.onclick = () => {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    if (betPlaced) return;
    const bet1 = parseInt(betSelect.value), bet2 = parseInt(betSelect2.value);
    const chip1 = parseInt(chipSelect1.value), chip2 = parseInt(chipSelect2.value);

    if (georgeChips < chip1) { showBetMessage('George 籌碼不足'); return; }
    if (maryChips < chip2) { showBetMessage('Mary 籌碼不足'); return; }

    georgeChips -= chip1;
    maryChips -= chip2;

    updateChipsDisplay();
    currentBets = [bet1, bet2];
    currentChips = [chip1, chip2];
    showBetMessage(`已下注！George押${bet1}號${chip1}元，Mary押${bet2}號${chip2}元`);
    startBtn.disabled = false; placeBetBtn.disabled = true; betPlaced = true;
};

startBtn.onclick = () => {
    if (animationId || !betPlaced) return;
    startBtn.disabled = true;
    rematchBtn.disabled = true;
    startCountdown();
};

function startCountdown() {
    let count = 3; countdownEl.style.display = 'block'; startLine.style.display = 'block';
    function showCount() {
        if (count > 0) {
            countdownEl.textContent = count; playSound('start'); count--; setTimeout(showCount, 1000);
        } else if (count === 0) {
            countdownEl.textContent = 'GO'; playSound('start'); count--;
            setTimeout(() => {
                countdownEl.style.display = 'none'; startLine.style.display = 'none'; startTime = performance.now(); lastTs = null; animationId = requestAnimationFrame(update);
            }, 1000);
        }
    }
    showCount();
}

function update(ts) {
    if (lastTs === null) lastTs = ts;
    const delta = (ts - lastTs) / 1000; lastTs = ts;
    const currentTrackWidth = track.clientWidth;
    horses.forEach(h => {
        if (h.finished) return;
        if (h.id === ragingHorseId && !h.isRaging && Math.random() < 0.005) { h.isRaging = true; h.rageTime = 0.5; h.rageSpeed = (1 + Math.random() * 2) * 0.8; h.el.style.fontSize = "36px"; }
        let actualSpeed = h.speed;
        if (h.isRaging) { actualSpeed += h.rageSpeed; h.rageTime -= delta; if (h.rageTime <= 0) { h.isRaging = false; h.el.style.fontSize = "32px"; } }
        const widthFactor = currentTrackWidth / 900;
        h.x += actualSpeed * delta * 120 * widthFactor;
        h.el.style.right = h.x + 'px';
        h.tilt += 0.4 * h.tiltDirection; if (h.tilt >= 10) h.tiltDirection = -1; if (h.tilt <= -10) h.tiltDirection = 1; h.el.style.transform = `rotate(${h.tilt}deg)`;
        if (h.x >= currentTrackWidth - 50 && !h.finished) {
            h.finished = true; h.finishTime = ((ts - startTime) / 1000).toFixed(2); horseRow.cells[rankingCounter].textContent = h.id; timeRow.cells[rankingCounter].textContent = h.finishTime + 's';
            if (rankingCounter === 0) { const crown = document.createElement('div'); crown.className = 'crown'; crown.textContent = '👑'; h.el.appendChild(crown); playSound('champion'); } rankingCounter++;
        }
    });

    if (horses.every(h => h.finished)) {
        saveRaceResult();
        handleBetResults();
        cancelAnimationFrame(animationId);
        animationId = null;
        lastTs = null;
        rematchBtn.disabled = false;
        return;
    }
    animationId = requestAnimationFrame(update);
}

function saveRaceResult() { raceHistory.push(horses.slice().sort((a, b) => a.finishTime - b.finishTime).map(h => h.id)); }

function handleBetResults() {
    const firstThree = [parseInt(horseRow.cells[0].textContent), parseInt(horseRow.cells[1].textContent), parseInt(horseRow.cells[2].textContent)];
    let resultMsgs = [];
    currentBets.forEach((bet, idx) => {
        const chip = currentChips[idx]; let reward = 0; let msg = ''; const name = idx === 0 ? 'George' : 'Mary';
        if (bet === firstThree[0]) { reward = chip * 3; if (idx === 0) georgeChips += reward; else maryChips += reward; msg = `${name}押中冠軍 獎金 ${reward}元`; playSound('win'); }
        else if (bet === firstThree[1]) { reward = chip * 2; if (idx === 0) georgeChips += reward; else maryChips += reward; msg = `${name}押中亞軍 獎金 ${reward}元`; }
        else if (bet === firstThree[2]) { reward = chip * 1; if (idx === 0) georgeChips += reward; else maryChips += reward; msg = `${name}打平 獎金 ${reward}元`; }
        else { msg = `${name}沒有押中`; }
        resultMsgs.push(msg);
    });
    updateChipsDisplay(); messageEl.innerHTML = resultMsgs.join('<br>'); messageEl.style.opacity = 1; currentChips = [];
}

rematchBtn.onclick = () => { init(); };
resetBtn.onclick = () => { georgeChips = 5000; maryChips = 5000; init(); };

statsBtn.onclick = () => {
    if (!statsVisible) {
        if (raceHistory.length === 0) { messageEl.textContent = "尚無比賽資料！"; messageEl.style.opacity = 1; setTimeout(() => { if (!statsVisible) messageEl.style.opacity = 0; }, 3000); return; }
        const stats = {}; for (let i = 1; i <= HORSE_COUNT; i++) stats[i] = { champ: 0, second: 0, third: 0, last: 0 };
        raceHistory.forEach(result => { stats[result[0]].champ++; stats[result[1]].second++; stats[result[2]].third++; stats[result[result.length - 1]].last++; });
        let msg = ""; for (let i = 1; i <= HORSE_COUNT; i++) { msg += `${i}號豬 冠軍:${stats[i].champ} 亞軍:${stats[i].second} 季軍:${stats[i].third} 最後:${stats[i].last}\n`; }
        messageEl.textContent = msg; messageEl.style.opacity = 1; statsBtn.textContent = "關閉資料顯示"; statsVisible = true;
    } else {
        messageEl.textContent = ''; messageEl.style.opacity = 1; statsBtn.textContent = "比賽資料統計"; statsVisible = false;
    }
};

init();