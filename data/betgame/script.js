const backBtn = document.getElementById('backBtn');
backBtn.onclick = () => { window.history.back(); };

const audioContext = new (window.AudioContext || window.webkitAudioContext)();
let coinBuffer = null;
fetch('coin07.mp3')
    .then(r => r.arrayBuffer())
    .then(b => audioContext.decodeAudioData(b))
    .then(buf => { coinBuffer = buf; })
    .catch(e => console.log("Audio load error"));

function playCoin() {
    if (!coinBuffer) return;
    const source = audioContext.createBufferSource();
    source.buffer = coinBuffer;
    const gainNode = audioContext.createGain();
    gainNode.gain.value = 0.5;
    source.connect(gainNode).connect(audioContext.destination);
    source.start(0);
}

const grid = document.getElementById('grid');
const msg = document.getElementById('msg');
const func1Btn = document.getElementById('func1');
let credit = 0, win = 0, spinning = false, pos = 0, centerWin = 0, flashingInterval = null;
let bets = {}, betCounts = {};

function updateDigits(id, val) {
    const s = val.toString().padStart(4, '0');
    const d = document.getElementById(id).children;
    for (let i = 0; i < 4; i++) d[i].textContent = s[i];
}

function clearMsg() { msg.textContent = ''; }

// 機台網格文字定義
const letters = Array(7).fill(0).map(() => Array(7).fill(''));
letters[0][0] = '🍊'; letters[6][6] = '🍊'; letters[0][1] = '🛎️'; letters[6][5] = '🛎️';
letters[0][2] = '🍒'; letters[0][5] = '🍒'; letters[2][6] = '🍒'; letters[5][6] = '🍒';
letters[6][4] = '🍒'; letters[6][1] = '🍒'; letters[4][0] = '🍒'; letters[1][0] = '🍒';
letters[0][3] = '🀄'; letters[0][4] = '🍎'; letters[2][0] = '🍎'; letters[4][6] = '🍎';
letters[6][2] = '🍎'; letters[0][6] = '🥭'; letters[6][0] = '🥭'; letters[1][6] = '🍉';
letters[6][3] = '7️⃣'; letters[5][0] = '⭐'; letters[3][0] = 'ONCE MORE'; letters[3][6] = 'ONCE MORE';

let cells = [];
for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 7; c++) {
        const d = document.createElement('div');
        d.className = 'cell';
        d.dataset.letter = letters[r][c];
        d.textContent = letters[r][c];
        
        if (['🍊', '🛎️', '🍒', '🍎', '🥭', '🍉', '⭐', '🀄'].includes(letters[r][c])) {
            d.style.fontSize = '30px';
        } else if (letters[r][c] === '7️⃣') {
            d.style.fontSize = '28px';
        } else if (letters[r][c] === 'ONCE MORE') {
            d.classList.add('cell-once-more');
        }

        const l = document.createElement('div');
        l.className = 'light';
        if (r >= 1 && r <= 5 && c >= 1 && c <= 5) {
            d.dataset.center = 'true';
            d.style.border = '1px solid #fff';
            l.style.background = '#fff';
        } else { l.style.background = '#bbb'; }
        d.appendChild(l);
        grid.appendChild(d);
        cells.push({ el: d });
    }
}

// 定義跑燈順序
let order = [];
for (let c = 0; c < 7; c++) order.push(cells[c]);
for (let r = 1; r < 6; r++) order.push(cells[r * 7 + 6]);
for (let c = 6; c >= 0; c--) order.push(cells[6 * 7 + c]);
for (let r = 5; r > 0; r--) order.push(cells[r * 7]);

const buttonConfig = [
    { ch: '🍎', mult: 5 }, { ch: '🍉', mult: 20 }, { ch: '⭐', mult: 30 }, 
    { ch: '7️⃣', mult: 40 }, { ch: '🀄', mult: 50 }, { ch: '🛎️', mult: 20 }, 
    { ch: '🥭', mult: 15 }, { ch: '🍊', mult: 10 }, { ch: '🍒', mult: 2 }
];

const betBox = document.getElementById('bets');
buttonConfig.forEach(cfg => {
    bets[cfg.ch] = 0; betCounts[cfg.ch] = 0;
    const wrap = document.createElement('div'); wrap.className = 'bet';
    wrap.innerHTML = `<div class="fixed-number">${cfg.mult}</div><button>${cfg.ch}</button><div class="count">0</div>`;
    const btn = wrap.querySelector('button');
    const countDiv = wrap.querySelector('.count');
    
    btn.onclick = () => {
        clearMsg();
        if (spinning) return;
        if (betCounts[cfg.ch] >= 9) return;
        if (credit <= 0) { 
            msg.style.color = '#f00'; 
            msg.textContent = '請先投幣'; 
            return; 
        }
        betCounts[cfg.ch]++; bets[cfg.ch]++; credit--;
        countDiv.textContent = betCounts[cfg.ch];
        updateDigits('credit-digits', credit);
        playCoin();
        win += centerWin; updateDigits('win-digits', win);
        if (flashingInterval) {
            clearInterval(flashingInterval); flashingInterval = null;
            document.getElementById('center-left-light').style.background = '#bbb';
            document.getElementById('center-right-light').style.background = '#bbb';
        }
        centerWin = 0; updateDigits('center-win-digits', centerWin);
    };
    betBox.appendChild(wrap);
});

func1Btn.onclick = () => { 
    clearMsg(); credit += 100; 
    updateDigits('credit-digits', credit); 
    playCoin(); func1Btn.disabled = true; 
};

document.getElementById('func2').onclick = () => { 
    clearMsg(); credit += win; win = 0; 
    updateDigits('credit-digits', credit); 
    updateDigits('win-digits', win); 
};

function enableFunc1IfZero() {
    if (win === 0 && credit === 0 && centerWin === 0 && Object.values(betCounts).every(v => v === 0)) {
        func1Btn.disabled = false;
    }
}

function spin() {
    if (spinning) return;
    spinning = true;
    const totalSteps = order.length * 4 + Math.floor(Math.random() * order.length);
    let step = 0;
    
    function nextStep() {
        order.forEach((o, idx) => {
            const l = o.el.querySelector('.light');
            if (!o.el.dataset.center) l.style.background = idx === pos ? '#f00' : '#bbb';
        });
        playCoin();
        step++;
        if (step >= totalSteps) {
            const stop = order[pos];
            const letter = stop.el.dataset.letter;
            if (letter === 'ONCE MORE') { 
                spinning = false; 
                setTimeout(spin, 1500); 
                return; 
            }
            const cfg = buttonConfig.find(b => b.ch === letter);
            const gain = cfg ? bets[letter] * cfg.mult : 0;
            if (gain > 0) {
                centerWin = gain; 
                updateDigits('center-win-digits', centerWin);
                msg.style.color = '#f00'; 
                msg.textContent = `押中${letter} 獎金${gain}\n可選左右加倍`;
                let onLeft = true;
                flashingInterval = setInterval(() => {
                    playCoin();
                    document.getElementById('center-left-light').style.background = onLeft ? '#f00' : '#bbb';
                    document.getElementById('center-right-light').style.background = onLeft ? '#bbb' : '#f00';
                    onLeft = !onLeft;
                }, 300);
            } else {
                centerWin = 0; 
                updateDigits('center-win-digits', centerWin);
                msg.style.color = '#f00'; 
                msg.textContent = '沒有押中';
            }
            document.querySelectorAll('.count').forEach(c => c.textContent = '0');
            for (let k in bets) { bets[k] = 0; betCounts[k] = 0; }
            document.getElementById('start').disabled = true;
            setTimeout(() => { 
                document.getElementById('start').disabled = false; 
                enableFunc1IfZero(); 
            }, 5000);
            spinning = false; 
            return;
        }
        pos = (pos + 1) % order.length;
        let delay = step < totalSteps * 0.25 ? 300 - (250 * (step / (totalSteps * 0.25))) : 
                   (step > totalSteps * 0.75 ? 50 + (250 * ((step - totalSteps * 0.75) / (totalSteps * 0.25))) : 50);
        setTimeout(nextStep, delay);
    }
    nextStep();
}

document.getElementById('cancel').onclick = () => {
    if (centerWin > 0) {
        win += centerWin; updateDigits('win-digits', win);
        centerWin = 0; updateDigits('center-win-digits', centerWin);
        if (flashingInterval) { clearInterval(flashingInterval); flashingInterval = null; }
        document.getElementById('center-left-light').style.background = '#bbb';
        document.getElementById('center-right-light').style.background = '#bbb';
        msg.textContent = '已收回獎金'; enableFunc1IfZero();
    }
};

document.getElementById('start').onclick = () => {
    if (spinning) return;
    if (Object.values(bets).every(v => v === 0)) { 
        msg.textContent = '請先押注'; 
        return; 
    }
    clearMsg(); spin();
};

function stopFlashing(selected) {
    if (!flashingInterval) return;
    clearInterval(flashingInterval); flashingInterval = null;
    let finalSide = Math.random() < 0.5 ? 'left' : 'right';
    let count = 0;
    
    function slowStep() {
        if (count >= 6) {
            document.getElementById('center-left-light').style.background = finalSide === 'left' ? '#f00' : '#bbb';
            document.getElementById('center-right-light').style.background = finalSide === 'right' ? '#f00' : '#bbb';
            if (finalSide === selected) {
                centerWin *= 2; 
                updateDigits('center-win-digits', centerWin);
                msg.textContent = `恭喜! 獎金 x2`;
                let onLeft = true;
                flashingInterval = setInterval(() => {
                    playCoin();
                    document.getElementById('center-left-light').style.background = onLeft ? '#f00' : '#bbb';
                    document.getElementById('center-right-light').style.background = onLeft ? '#bbb' : '#f00';
                    onLeft = !onLeft;
                }, 300);
            } else { 
                centerWin = 0; 
                updateDigits('center-win-digits', 0); 
                msg.textContent = `可惜歸零`; 
            }
            enableFunc1IfZero(); return;
        }
        document.getElementById('center-left-light').style.background = count % 2 === 0 ? '#f00' : '#bbb';
        document.getElementById('center-right-light').style.background = count % 2 === 0 ? '#bbb' : '#f00';
        playCoin(); count++; setTimeout(slowStep, 200);
    }
    slowStep();
}

document.getElementById('func3').onclick = () => stopFlashing('left');
document.getElementById('func4').onclick = () => stopFlashing('right');