const pHandDiv = document.getElementById("player-hand");
const cHandDiv = document.getElementById("computer-hand");
const msgResult = document.getElementById("messageResult");
const msgMary = document.getElementById("messageMary");
const msgPlayer = document.getElementById("messagePlayer");
const warnMsg = document.getElementById("warningMessage");
const chipBoxDiv = document.getElementById("chipBox");
const sBtn = document.getElementById("swapBtn");
const rBtn = document.getElementById("revealBtn");
const nBtn = document.getElementById("newGameBtn");
const bBtn = document.getElementById("betBtn");
const addBtn = document.getElementById("addCoinBtn");
const backBtn = document.getElementById("backBtn");

backBtn.onclick=()=>{window.history.back();};

let chips = 0, currentBet = 0, selectedCards = [], swapUsed = false, coinPressCount = 0;
const maxCoinPress = 10;

let audioContext = new (window.AudioContext || window.webkitAudioContext)();
let coinBuffer, dealingBuffer, winBuffer, loseBuffer;

function loadAudio(url, callback) {
    fetch(url).then(r => r.arrayBuffer()).then(buf => audioContext.decodeAudioData(buf)).then(decoded => callback(decoded)).catch(e => console.log("音效載入略過"));
}

loadAudio('coin07.mp3', buf => coinBuffer = buf);
loadAudio('dealing_cards1.mp3', buf => dealingBuffer = buf);
loadAudio('cheers2.mp3', buf => winBuffer = buf);
loadAudio('you-lose1.mp3', buf => loseBuffer = buf);

function playSound(buffer){
    if(!buffer) return;
    if(audioContext.state === 'suspended') audioContext.resume();
    let source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    source.start(0);
}

function updateChipsDisplay(){chipBoxDiv.textContent = String(chips).padStart(5,'0');}
function showWarningMessage(msg){warnMsg.textContent = msg; warnMsg.style.display = "block"; setTimeout(()=>{ warnMsg.style.display="none"; },3000);}

function getMultiplier(score) {
    if(score === 10) return 50; 
    if(score === 9)  return 20; 
    if(score === 8)  return 10; 
    if(score === 7)  return 5;  
    if(score === 6)  return 4;  
    if(score === 5)  return 3;  
    if(score === 4)  return 2;  
    if(score === 3)  return 1.5;
    return 1; 
}

const suits=["♠","♥","♦","♣"], values=["2","3","4","5","6","7","8","9","10","J","Q","K","A"];
const sortOrder=["2","3","4","5","6","7","8","9","10","J","Q","K","A"];

function createDeck(){let deck=[];for(let s of suits){for(let v of values){deck.push({value:v,suit:s});}}return deck;}
function drawCards(deck,count){let hand=[];for(let i=0;i<count;i++){let idx=Math.floor(Math.random()*deck.length);hand.push(deck.splice(idx,1)[0]);}return hand;}
function cardValue(c){if(c.value==="J")return 11;if(c.value==="Q")return 12;if(c.value==="K")return 13;if(c.value==="A")return 14;return parseInt(c.value);}
function valueToFace(val){if(val===14)return "A";if(val===13)return "K";if(val===12)return "Q";if(val===11)return "J";return val.toString();}

function evaluateHand(hand){
    let vals=hand.map(c=>cardValue(c)).sort((a,b)=>a-b), suitsArr=hand.map(c=>c.suit), counts={};
    vals.forEach(v=>counts[v]=(counts[v]||0)+1);
    let isFlush=suitsArr.every(s=>s===suitsArr[0]), isStraight=vals[4]-vals[0]===4&&new Set(vals).size===5;
    let score=1, handName="";
    let countVals=Object.entries(counts).sort((a,b)=>{if(b[1]===a[1])return b[0]-a[0];return b[1]-a[1];}).map(x=>parseInt(x[0]));
    if(isFlush && isStraight && vals[4]===14){score=10;handName="皇家同花順";}
    else if(isFlush && isStraight){score=9;handName="同花順";}
    else if(Object.values(counts).includes(4)){score=8;handName="四條";}
    else if(Object.values(counts).includes(3) && Object.values(counts).includes(2)){score=7;handName="葫蘆";}
    else if(isFlush){score=6;handName="同花";}
    else if(isStraight){score=5;handName="順子";}
    else if(Object.values(counts).includes(3)){score=4;handName="三條";}
    else if(Object.values(counts).filter(x=>x===2).length===2){score=3;handName="兩對";}
    else if(Object.values(counts).includes(2)){score=2;let pairVal=Object.entries(counts).find(([k,v])=>v===2)[0];handName="一對 "+valueToFace(parseInt(pairVal));}
    else{score=1;let maxVal=Math.max(...vals);let maxCard=hand.find(c=>cardValue(c)===maxVal);handName="最大 "+valueToFace(maxVal)+maxCard.suit;}
    return {score, tiebreaker:countVals, handName};
}

function compareHands(h1,h2){
    let a=evaluateHand(h1), b=evaluateHand(h2);
    if(a.score>b.score)return {result:1, a, b}; 
    if(a.score<b.score)return {result:-1, a, b};
    for(let i=0;i<a.tiebreaker.length;i++){
        if(a.tiebreaker[i]>b.tiebreaker[i])return {result:1, a, b};
        if(a.tiebreaker[i]<b.tiebreaker[i])return {result:-1, a, b};
    }
    return {result:0, a, b};
}

const getCardX = (i) => {
    let base = window.innerWidth < 600 ? 5 : 170;
    let gap = window.innerWidth < 600 ? (window.innerWidth/6) : 80;
    return (window.innerWidth < 600) ? (5 + i * 18) + "%" : (base + i * gap) + "px";
};
const pY = "250px", cY = "40px";

function showSingleCard(card,elementId,index,hide){
    const container = (elementId === "player-hand") ? pHandDiv : cHandDiv;
    let div=document.createElement("div");
    div.className="card"+(hide?" back":"");
    div.textContent=hide?"":card.value+card.suit;
    if(!hide&&(card.suit==="♥"||card.suit==="♦"))div.classList.add("red");
    div.style.top=elementId==="player-hand"?pY:cY;
    div.style.left=getCardX(index);
    if(elementId==="player-hand"){
        div.onclick=()=>{
            if(swapUsed||sBtn.disabled)return;
            if(div.style.border.includes("red")){div.style.border="1px solid #333";selectedCards=selectedCards.filter(i=>i!==index);}
            else{if(selectedCards.length>=2){showWarningMessage("最多只能選2張牌");return;} div.style.border="3px solid red";selectedCards.push(index);}
        };
    }
    container.appendChild(div);
}

let playerHand=[],maryHand=[],deck=[];
async function dealCardsAnimation(){
    deck=createDeck();playerHand=drawCards(deck,5);maryHand=drawCards(deck,5);
    pHandDiv.replaceChildren(); cHandDiv.replaceChildren();
    for(let i=0;i<5;i++){
        showSingleCard(playerHand[i],"player-hand",i,false); playSound(dealingBuffer); await new Promise(r=>setTimeout(r,300)); 
        showSingleCard(maryHand[i],"computer-hand",i,true); playSound(dealingBuffer); await new Promise(r=>setTimeout(r,300));
    }
    setTimeout(()=>{
        playerHand.sort((a,b)=>sortOrder.indexOf(a.value)-sortOrder.indexOf(b.value));
        pHandDiv.replaceChildren();
        for(let i=0;i<5;i++) showSingleCard(playerHand[i],"player-hand",i,false);
        sBtn.disabled=false; rBtn.disabled=false;
    },500);
}

addBtn.onclick=()=>{
    if(coinPressCount >= maxCoinPress) return;
    chips += 10; coinPressCount++; updateChipsDisplay(); playSound(coinBuffer);
    if(coinPressCount >= maxCoinPress) addBtn.disabled = true;
};

bBtn.onclick=()=>{
    let bet=parseInt(document.getElementById("betAmount").value);
    if(bet>chips){showWarningMessage("錢不夠了"); return;}
    chips-=bet; currentBet=bet; updateChipsDisplay();
    pHandDiv.replaceChildren(); cHandDiv.replaceChildren();
    msgResult.textContent=""; msgMary.textContent=""; msgPlayer.textContent="";
    bBtn.disabled=true; nBtn.disabled=false;
    swapUsed=false; selectedCards=[];
};

sBtn.onclick=async()=>{
    if(swapUsed) { showWarningMessage("換牌只能使用一次"); return; }
    if(selectedCards.length===0){ showWarningMessage("請先點選最多2張撲克牌"); return; }
    
    swapUsed=true; sBtn.disabled=true;
    const cards = pHandDiv.children;
    
    // 1. 蓋牌
    for(let idx of selectedCards){ let d=cards[idx]; d.classList.add("back"); d.textContent=""; }
    await new Promise(r=>setTimeout(r,1000));
    
    // 2. 換上新牌並掀開
    for(let idx of selectedCards){
        playerHand[idx]=drawCards(deck,1)[0];
        let d=cards[idx];
        d.classList.remove("back"); d.textContent=playerHand[idx].value+playerHand[idx].suit;
        if(playerHand[idx].suit==="♥"||playerHand[idx].suit==="♦") d.classList.add("red"); else d.classList.remove("red");
        d.style.border="1px solid #333";
    }
    
    // 3. 等待 1 秒讓玩家看清楚新牌
    await new Promise(r=>setTimeout(r,1000));
    
    // 4. 排序
    playerHand.sort((a,b)=>sortOrder.indexOf(a.value)-sortOrder.indexOf(b.value));
    pHandDiv.replaceChildren();
    for(let i=0;i<5;i++) showSingleCard(playerHand[i],"player-hand",i,false);
    selectedCards=[];
};

nBtn.onclick=async()=>{
    nBtn.disabled=true; addBtn.disabled=true; 
    await dealCardsAnimation();
};

rBtn.onclick=()=>{
    const computerCards=cHandDiv.children;
    for(let i=0;i<5;i++){
        computerCards[i].textContent=maryHand[i].value+maryHand[i].suit; computerCards[i].classList.remove("back");
        if(maryHand[i].suit==="♥"||maryHand[i].suit==="♦") computerCards[i].classList.add("red");
    }
    let res=compareHands(playerHand,maryHand);
    let resultText="";
    if(res.result===1){
        let mult = getMultiplier(res.a.score);
        let win = Math.floor(currentBet * (1 + mult));
        chips += win; resultText = `你贏了 ${win} 元 (x${mult})`; playSound(winBuffer);
    } else if(res.result===-1){
        resultText = `你輸了 ${currentBet} 元`; playSound(loseBuffer);
    } else {
        chips += currentBet; resultText = "平手 (退回籌碼)";
    }
    msgResult.textContent=resultText;
    msgMary.textContent=res.b.handName;
    msgPlayer.textContent=res.a.handName;
    updateChipsDisplay();
    bBtn.disabled=false; rBtn.disabled=true;
    sBtn.disabled=true;
    if(chips===0){ coinPressCount=0; addBtn.disabled=false; }
};

updateChipsDisplay();