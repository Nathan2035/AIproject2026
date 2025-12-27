window.onload = function() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const audioCtx = new AudioContext();
    const soundBuffers = {};

    async function loadSfx(name, url) {
        try {
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            const decodedData = await audioCtx.decodeAudioData(arrayBuffer);
            soundBuffers[name] = decodedData;
        } catch (e) { console.log(`Failed to load sound: ${name}`); }
    }

    loadSfx('roll', 'dice roll.mp3');
    loadSfx('discard', 'dealing_cards1.mp3');
    loadSfx('win', 'cheers2.mp3');

    function playSfx(name) {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        if (soundBuffers[name]) {
            const source = audioCtx.createBufferSource();
            source.buffer = soundBuffers[name];
            source.connect(audioCtx.destination);
            source.start(0);
        }
    }

    const allTileNames = [
        '1萬','2萬','3萬','4萬','5萬','6萬','7萬','8萬','9萬',
        '1筒','2筒','3筒','4筒','5筒','6筒','7筒','8筒','9筒',
        '1條','2條','3條','4條','5條','6條','7條','8條','9條',
        '東','南','西','北','中','發','白','back','1','2','3','4','5','6'
    ];
    const imageCache = {};
    function preloadImages() {
        allTileNames.forEach(name => {
            const img = new Image();
            img.src = `images/${name}.png`;
            imageCache[name] = img;
        });
    }
    preloadImages();

    function autoScale() {
        const container = document.getElementById('game-container');
        if(!container) return;
        const windowW = window.innerWidth;
        const windowH = window.innerHeight;
        const contentW = 980; 
        const contentH = 750; 
        const scale = Math.min(windowW / contentW, windowH / contentH);
        container.style.transform = `scale(${scale})`;
        container.style.marginTop = `${(windowH - contentH * scale) / 2}px`;
    }
    window.addEventListener('resize', autoScale);
    window.addEventListener('orientationchange', autoScale);
    autoScale();

    const $ = id => document.getElementById(id);
    $('backBtn').onclick=()=>{window.history.back();};

    let deck=[], playerHand=[], dealerHand=[], playerMelds=[], dealerMelds=[];
    let playerMoney = 10000, initialDealt = false, isDealing = false;
    let playerTurn=true, hasDrawnThisTurn=false, lastDiscardedTile=null;
    let tempDraw=null, dealerTempDraw=null;
    let isDealerFirst = true, dealerCount = 0;
    let totalGames = 0;

    function showMsg(layer, text, autoHide = true) {
        layer.textContent = text; layer.style.opacity = 1;
        if (autoHide) {
            setTimeout(() => {
                if (layer.textContent === text) layer.style.opacity = 0;
            }, 3000);
        }
    }

    function initDeck() {
        const suits=['萬','筒','條'], nums=[1,2,3,4,5,6,7,8,9], honors=['東','南','西','北','中','發','白'];
        deck = [];
        suits.forEach(s=>nums.forEach(n=>{for(let i=0;i<4;i++)deck.push(`${n}${s}`)}));
        honors.forEach(h=>{for(let i=0;i<4;i++)deck.push(h)});
        deck.sort(()=>Math.random()-0.5);
    }

    function sortHand(h){
        const o={'萬':1,'筒':2,'條':3,'東':4,'南':5,'西':6,'北':7,'中':8,'發':9,'白':10};
        return h.slice().sort((a,b)=>{
            const ma = a.match(/(\d)?(.+)/), mb = b.match(/(\d)?(.+)/);
            return o[ma[2]]-o[mb[2]] || (parseInt(ma[1])||0)-(parseInt(mb[1])||0);
        });
    }

    function updateUI() {
        $('playerHand').innerHTML = ''; $('dealerHand').innerHTML = '';
        const gap = 46;
        playerHand.forEach((t, i) => {
            const img = document.createElement('img'); img.src = `images/${t}.png`;
            img.style.left = `${i*gap}px`; img.onclick = () => playTile(i);
            $('playerHand').appendChild(img);
        });
        if(tempDraw) {
            const img = document.createElement('img'); img.src = `images/${tempDraw}.png`;
            img.style.left = `${playerHand.length*gap + 15}px`; img.onclick = () => playTile('temp');
            $('playerHand').appendChild(img);
        }
        dealerHand.forEach((t, i) => {
            const img = document.createElement('img'); 
            img.src = `images/back.png`;
            img.style.left = `${i*gap}px`; 
            $('dealerHand').appendChild(img);
        });
        if(dealerTempDraw) {
            const img = document.createElement('img'); 
            img.src = `images/back.png`;
            img.style.left = `-60px`; 
            $('dealerHand').appendChild(img);
        }
        $('deckCount').textContent = deck.length;
        $('moneyDisplay').textContent = `籌碼: $${playerMoney}`;
        const canRespond = initialDealt && playerTurn && !hasDrawnThisTurn && lastDiscardedTile;
        $('drawBtn').className = (initialDealt && playerTurn && !hasDrawnThisTurn) ? '' : 'disabled';
        $('pengBtn').className = (canRespond && playerHand.filter(t=>t===lastDiscardedTile).length >= 2) ? '' : 'disabled';
        $('chiBtn').className = (canRespond && checkChiAvailable(lastDiscardedTile)) ? '' : 'disabled';
        let canGang = (canRespond && playerHand.filter(t=>t===lastDiscardedTile).length === 3) || 
                      (hasDrawnThisTurn && checkSelfGangAvailable());
        $('gangBtn').className = canGang ? '' : 'disabled';
        $('huBtn').className = (initialDealt && playerTurn) ? '' : 'disabled';
        $('rollDiceBtn').className = (initialDealt || isDealing) ? 'disabled' : '';
    }

    function checkSelfGangAvailable() {
        let combined = [...playerHand]; if(tempDraw) combined.push(tempDraw);
        let counts = {}; combined.forEach(t => counts[t] = (counts[t]||0)+1);
        for(let t in counts) if(counts[t] === 4) return true;
        if(tempDraw && playerMelds.some(m => m.type === 'pong' && m.tiles[0] === tempDraw)) return true;
        return false;
    }

    $('gangBtn').onclick = () => {
        if($('gangBtn').classList.contains('disabled')) return;
        let gangTile = "";
        if (lastDiscardedTile && !hasDrawnThisTurn) {
            gangTile = lastDiscardedTile;
            playerHand = playerHand.filter(t => t !== gangTile);
            playerMelds.push({type:'gang', tiles:[gangTile,gangTile,gangTile,gangTile]});
            addMeldUI('playerMeldArea', [gangTile,gangTile,gangTile,gangTile]);
            lastDiscardedTile = null;
        } else {
            let combined = [...playerHand]; if(tempDraw) combined.push(tempDraw);
            let counts = {}; combined.forEach(t => counts[t] = (counts[t]||0)+1);
            for(let t in counts) {
                if(counts[t] === 4) {
                    gangTile = t; playerHand = combined.filter(tile => tile !== gangTile);
                    tempDraw = null;
                    playerMelds.push({type:'angang', tiles:[gangTile,gangTile,gangTile,gangTile]});
                    addMeldUI('playerMeldArea', [gangTile,gangTile,gangTile,gangTile]);
                    break;
                }
            }
            if(!gangTile && tempDraw) {
                let meldIdx = playerMelds.findIndex(m => m.type === 'pong' && m.tiles[0] === tempDraw);
                if(meldIdx !== -1) {
                    gangTile = tempDraw;
                    playerMelds[meldIdx] = {type:'gang', tiles:[gangTile,gangTile,gangTile,gangTile]};
                    tempDraw = null;
                    $('playerMeldArea').innerHTML = '';
                    playerMelds.forEach(m => addMeldUI('playerMeldArea', m.tiles));
                }
            }
        }
        if(gangTile) {
            showMsg($('playerMessage'), "槓！");
            setTimeout(() => { 
                if(deck.length === 0) {
                    showMsg($('tableMessage'), "流局！牌堆已空", false);
                    initialDealt = false; updateUI(); return;
                }
                tempDraw = deck.pop(); hasDrawnThisTurn = true; updateUI(); 
            }, 500);
        }
    };

    function settleGame(winner, isSelfDraw) {
        let rawHand = (winner === 'player') ? [...playerHand] : [...dealerHand];
        let melds = (winner === 'player') ? playerMelds : dealerMelds;
        let lastTile = isSelfDraw ? (winner === 'player' ? tempDraw : dealerTempDraw) : lastDiscardedTile;
        let fullCheckHand = [...rawHand, lastTile];
        melds.forEach(m => fullCheckHand = fullCheckHand.concat(m.tiles));
        let result = calculateTai(winner, rawHand, melds, isSelfDraw, lastTile, fullCheckHand);
        let totalMoney = 500 + (result.tai * 200);
        if (winner === 'player') { 
            playerMoney += totalMoney; 
            if (!isDealerFirst) dealerCount++; else dealerCount = 0; 
            playSfx('win'); isDealerFirst = false; 
        } else { 
            playerMoney -= totalMoney; 
            if (isDealerFirst) dealerCount++; else dealerCount = 0; 
            isDealerFirst = true; 
        }
        totalGames++; initialDealt = false; isDealing = false; updateUI(); 
        showMsg($('tableMessage'), `${winner==='player'?'玩家':'莊家'} ${isSelfDraw?'自摸':'胡牌'}！\n${result.tai} 台 (${result.details.join(', ')})\n$${totalMoney}`, false);
    }

    function calculateTai(winner, rawHand, melds, isSelfDraw, lastTile, fullCheckHand) {
        let tai = 0, details = [];
        let counts = {}; 
        let allTilesInHand = [...rawHand, lastTile];
        allTilesInHand.forEach(t => counts[t] = (counts[t]||0)+1);
        if ((winner === 'player' && !isDealerFirst) || (winner === 'dealer' && isDealerFirst)) {
            tai += 1; details.push("莊家");
            if (dealerCount > 0) { tai += (dealerCount * 2); details.push(`連莊${dealerCount}`); }
        }
        if (isSelfDraw) { tai += 1; details.push("自摸"); }
        if (melds.length === 0) { tai += 1; details.push("門清"); if(isSelfDraw) { tai += 1; details.push("不求人"); } }
        ['中', '發', '白'].forEach(h => { 
            let totalCount = fullCheckHand.filter(t => t === h).length;
            if (totalCount >= 3) { tai += 1; details.push(h); } 
        });
        let internalTriplets = 0;
        for(let t in counts) { if(counts[t] >= 3) { if(!isSelfDraw && t === lastTile) continue; internalTriplets++; } }
        melds.forEach(m => { if(m.type === 'angang') internalTriplets++; });
        if(internalTriplets === 3) { tai += 2; details.push("三暗刻"); }
        else if(internalTriplets === 4) { tai += 5; details.push("四暗刻"); }
        else if(internalTriplets === 5) { tai += 8; details.push("五暗刻"); }
        if (Object.values(counts).filter(v => v >= 3).length + melds.filter(m=>m.type!=='chi').length === 5) { tai += 4; details.push("碰碰胡"); }
        let hasWan = fullCheckHand.some(t => t.includes('萬')), hasTong = fullCheckHand.some(t => t.includes('筒')), hasTiao = fullCheckHand.some(t => t.includes('條')), hasZi = fullCheckHand.some(t => !t.match(/\d/)); 
        let suitCount = [hasWan, hasTong, hasTiao].filter(Boolean).length;
        if (suitCount === 1) { if (!hasZi) { tai += 8; details.push("清一色"); } else { tai += 4; details.push("混一色"); } }
        return { tai, details };
    }

    $('rollDiceBtn').onclick = () => {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        if(initialDealt || isDealing) return;
        $('tableMessage').textContent = ''; $('tableMessage').style.opacity = 0;
        tempDraw = null; dealerTempDraw = null; lastDiscardedTile = null; 
        isDealing = true; 
        $('rollDiceBtn').className = 'disabled'; 
        $('playerHand').innerHTML = ''; $('dealerHand').innerHTML = ''; $('discardArea').innerHTML = '';
        $('playerMeldArea').innerHTML = ''; $('dealerMeldArea').innerHTML = '';
        initDeck(); playerHand=[]; dealerHand=[]; playerMelds=[]; dealerMelds=[];

        const startDeal = () => {
            showMsg($('tableMessage'), isDealerFirst ? "對方為莊家" : "你是莊家");
            for(let i=0; i<16; i++) { playerHand.push(deck.pop()); dealerHand.push(deck.pop()); }
            playerHand = sortHand(playerHand); dealerHand = sortHand(dealerHand);
            initialDealt = true; isDealing = false;
            if(isDealerFirst) { playerTurn = false; setTimeout(dealerAction, 1000); }
            else { playerTurn = true; hasDrawnThisTurn = false; }
            updateUI();
        };

        if (totalGames > 0 && totalGames % 16 !== 0) { startDeal(); }
        else {
            showMsg($('tableMessage'), "新局開始，擲骰中...");
            playSfx('roll'); 
            $('diceContainer').style.display = 'flex';
            let count = 0;
            const interval = setInterval(() => {
                const r1 = Math.floor(Math.random()*6)+1, r2 = Math.floor(Math.random()*6)+1;
                $('dice1').src = `images/${r1}.png`; $('dice2').src = `images/${r2}.png`;
                if (++count > 10) {
                    clearInterval(interval); 
                    setTimeout(() => { 
                        $('diceContainer').style.display = 'none';
                        isDealerFirst = ((r1+r2)%2 !== 0);
                        startDeal();
                    }, 800);
                }
            }, 100);
        }
    };

    $('drawBtn').onclick = () => {
        if($('drawBtn').classList.contains('disabled')) return;
        if (deck.length === 0) { showMsg($('tableMessage'), "流局！牌堆已空", false); initialDealt = false; updateUI(); return; }
        tempDraw = deck.pop(); hasDrawnThisTurn = true; lastDiscardedTile = null; updateUI();
    };

    function playTile(index) {
        if(!playerTurn || !hasDrawnThisTurn) return;
        let t = (index === 'temp') ? tempDraw : playerHand.splice(index, 1)[0];
        if(index !== 'temp' && tempDraw) { playerHand.push(tempDraw); }
        tempDraw = null; playerHand = sortHand(playerHand);
        const img = document.createElement('img'); img.src = `images/${t}.png`; img.className = 'discardTile';
        $('discardArea').appendChild(img);
        playSfx('discard'); 
        lastDiscardedTile = t; playerTurn = false; hasDrawnThisTurn = false;
        updateUI(); setTimeout(() => dealerResponse(t), 800);
    }

    $('pengBtn').onclick = () => {
        const t = lastDiscardedTile;
        playerHand.splice(playerHand.indexOf(t), 1); playerHand.splice(playerHand.indexOf(t), 1);
        playerMelds.push({type:'pong', tiles:[t,t,t]}); addMeldUI('playerMeldArea', [t,t,t]);
        lastDiscardedTile = null; playerTurn = true; hasDrawnThisTurn = true; updateUI();
    };

    $('chiBtn').onclick = () => {
        const t = lastDiscardedTile; const m = t.match(/^(\d)([萬筒條])$/); if(!m) return;
        const n = parseInt(m[1]), s = m[2];
        const patterns = [[n-2, n-1], [n-1, n+1], [n+1, n+2]];
        $('chiChoices').innerHTML = '';
        patterns.forEach(p => {
            const p1 = `${p[0]}${s}`, p2 = `${p[1]}${s}`;
            if(playerHand.includes(p1) && playerHand.includes(p2)) {
                const div = document.createElement('div'); div.className = 'chi-group';
                [p1, t, p2].sort().forEach(src => {
                    const img = document.createElement('img'); img.src = `images/${src}.png`;
                    img.style.width = '44px'; div.appendChild(img);
                });
                div.onclick = () => {
                    playerHand.splice(playerHand.indexOf(p1), 1); playerHand.splice(playerHand.indexOf(p2), 1);
                    const combined = sortHand([p1, t, p2]);
                    playerMelds.push({type:'chi', tiles: combined}); addMeldUI('playerMeldArea', combined);
                    lastDiscardedTile = null; playerTurn = true; hasDrawnThisTurn = true;
                    $('chiChoices').style.display = 'none'; updateUI();
                };
                $('chiChoices').appendChild(div);
            }
        });
        $('chiChoices').style.display = 'flex';
    };

    $('huBtn').onclick = () => {
        let tiles = [...playerHand]; if (hasDrawnThisTurn) tiles.push(tempDraw); else tiles.push(lastDiscardedTile);
        if (checkWin(tiles)) settleGame('player', hasDrawnThisTurn);
        else showMsg($('playerMessage'), "沒胡喔");
    };

    function dealerResponse(tile) {
        if (checkWin([...dealerHand, tile])) { settleGame('dealer', false); return; }
        let canPeng = dealerHand.filter(x => x === tile).length >= 2;
        if (canPeng) {
            let tempHandAfterPeng = [...dealerHand];
            tempHandAfterPeng.splice(tempHandAfterPeng.indexOf(tile), 1);
            tempHandAfterPeng.splice(tempHandAfterPeng.indexOf(tile), 1);
            let currentlyTenpai = checkIfTenpai(dealerHand);
            let willBeTenpai = false;
            for (let i = 0; i < tempHandAfterPeng.length; i++) {
                let testHand = [...tempHandAfterPeng]; testHand.splice(i, 1);
                if (checkIfTenpai(testHand)) { willBeTenpai = true; break; }
            }
            if (!currentlyTenpai || willBeTenpai) {
                dealerHand = tempHandAfterPeng; dealerMelds.push({type:'pong', tiles:[tile,tile,tile]});
                addMeldUI('dealerMeldArea', [tile,tile,tile]); showMsg($('dealerMessage'), "碰！");
                dealerDiscard(); return;
            }
        }
        let count = dealerHand.filter(x => x === tile).length;
        if (count === 3) {
            let tempHandAfterGang = dealerHand.filter(x => x !== tile);
            if (!checkIfTenpai(dealerHand) || checkIfTenpai(tempHandAfterGang)) {
                dealerHand = tempHandAfterGang; dealerMelds.push({type:'gang', tiles:[tile,tile,tile,tile]});
                addMeldUI('dealerMeldArea', [tile,tile,tile,tile]); showMsg($('dealerMessage'), "槓！");
                dealerAction(); return;
            }
        }
        dealerAction();
    }

    function dealerAction() {
        if(deck.length === 0) { showMsg($('tableMessage'), "流局！牌堆已空", false); initialDealt = false; isDealing = false; updateUI(); return; }
        dealerTempDraw = deck.pop(); updateUI();
        setTimeout(() => {
            if (checkWin([...dealerHand, dealerTempDraw])) { settleGame('dealer', true); return; }
            let counts = {}; [...dealerHand, dealerTempDraw].forEach(t => counts[t] = (counts[t]||0)+1);
            for(let t in counts) if(counts[t] === 4) {
                dealerHand = [...dealerHand, dealerTempDraw].filter(tile => tile !== t);
                dealerTempDraw = null; dealerMelds.push({type:'angang', tiles:[t,t,t,t]});
                addMeldUI('dealerMeldArea', [t,t,t,t]); dealerAction(); return;
            }
            dealerHand.push(dealerTempDraw); dealerTempDraw = null; dealerHand = sortHand(dealerHand); dealerDiscard();
        }, 1000);
    }

    function dealerDiscard() {
        let hand = [...dealerHand]; let bestDiscardIdx = -1; let isCurrentlyTenpai = false; let tenpaiOptions = [];
        for (let i = 0; i < hand.length; i++) {
            let testHand = [...hand]; testHand.splice(i, 1);
            if (checkIfTenpai(testHand)) { tenpaiOptions.push(i); }
        }
        if (tenpaiOptions.length > 0) { bestDiscardIdx = tenpaiOptions[0]; isCurrentlyTenpai = true; }
        let t;
        if (isCurrentlyTenpai && bestDiscardIdx !== -1) { t = dealerHand.splice(bestDiscardIdx, 1)[0]; }
        else {
            let scores = hand.map((tile, index) => {
                let score = 0; let m = tile.match(/^(\d)([萬筒條])$/);
                if (!m) { 
                    let count = hand.filter(t => t === tile).length;
                    if (count >= 3) score = 120; else if (count === 2) score = 60; else score = 0;
                } else {
                    let n = parseInt(m[1]), s = m[2], count = hand.filter(t => t === tile).length;
                    if (count >= 3) score += 100; if (count === 2) score += 40;
                    if (hand.includes(`${n-1}${s}`)) score += 25; if (hand.includes(`${n+1}${s}`)) score += 25;
                    if (hand.includes(`${n-2}${s}`)) score += 15; if (hand.includes(`${n+2}${s}`)) score += 15;
                    if (n >= 3 && n <= 7) score += 5;
                }
                return { index, score: score + Math.random() * 5 };
            });
            scores.sort((a, b) => a.score - b.score); t = dealerHand.splice(scores[0].index, 1)[0];
        }
        if (!t) t = dealerHand.splice(0, 1)[0]; 
        const img = document.createElement('img'); img.src = `images/${t}.png`; img.className = 'discardTile';
        $('discardArea').appendChild(img); playSfx('discard'); 
        lastDiscardedTile = t; playerTurn = true; updateUI();
    }

    function checkIfTenpai(testHand) {
        const fullTiles = ['1萬','2萬','3萬','4萬','5萬','6萬','7萬','8萬','9萬','1筒','2筒','3筒','4筒','5筒','6筒','7筒','8筒','9筒','1條','2條','3條','4條','5條','6條','7條','8條','9條','東','南','西','北','中','發','白'];
        return fullTiles.some(tile => checkWin([...testHand, tile]));
    }

    function checkWin(hand) {
        if (hand.length % 3 !== 2) return false;
        let counts = {}; hand.forEach(t => counts[t] = (counts[t]||0)+1);
        for (let t in counts) if (counts[t] >= 2) { counts[t] -= 2; if (canExhaust(counts)) return true; counts[t] += 2; }
        return false;
    }

    function canExhaust(counts) {
        let tiles = Object.keys(counts).filter(t => counts[t] > 0).sort(); if (tiles.length === 0) return true;
        let f = tiles[0];
        if (counts[f] >= 3) { counts[f] -= 3; if (canExhaust(counts)) return true; counts[f] += 3; }
        let m = f.match(/^(\d)([萬筒條])$/);
        if (m) {
            let n=parseInt(m[1]), s=m[2], t2=`${n+1}${s}`, t3=`${n+2}${s}`;
            if (n<=7 && counts[t2]>0 && counts[t3]>0) {
                counts[f]--; counts[t2]--; counts[t3]--; if (canExhaust(counts)) return true;
                counts[f]++; counts[t2]++; counts[t3]++;
            }
        }
        return false;
    }

    function checkChiAvailable(tile) {
        if(!tile) return false;
        let m = tile.match(/^(\d)([萬筒條])$/); if(!m) return false;
        let n=parseInt(m[1]), s=m[2];
        return [[n-2,n-1],[n-1,n+1],[n+1,n+2]].some(p => playerHand.includes(`${p[0]}${s}`) && playerHand.includes(`${p[1]}${s}`));
    }

    function addMeldUI(target, tiles) {
        const group = document.createElement('div'); group.className = 'meldGroup';
        tiles.forEach(t => { const img = document.createElement('img'); img.src = `images/${t}.png`; group.appendChild(img); });
        $(target).appendChild(group);
    }
    window.addEventListener('touchstart', (e) => { if (e.target.id === 'table') $('chiChoices').style.display = 'none'; });
    
    // 初始化執行一次 UI 更新，確保按鈕處於正確狀態
    updateUI();
};