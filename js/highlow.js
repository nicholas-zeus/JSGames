// High–Low Game (elegant casino style, biased RNG, Coins-integrated)
import { Coins } from './coins.js';
Coins.init({ ui: true, source: 'highlow' });

// ---------- Config ----------
const MIN_BET = 10;
const MAX_BET = 100;
const STEP_BET = 10;

const HOUSE_WIN_PROB = 0.56; // ~56% house wins; ties = player loss
const MAX_STREAK = 3;

// ---------- State ----------
let bet = MIN_BET;
let streak = 0;            // current consecutive wins in active round
let inRound = false;       // a bet has been placed and round is active
let awaitingGuess = false; // waiting for user to press High/Low
let currentCard = null;
let nextCard = null;

// ---------- DOM ----------
const $ = (sel) => document.querySelector(sel);

const betRange       = $('#betRange');
const betDisplay     = $('#betDisplay');
const streakDisplay  = $('#streak');
const cashOutValueEl = $('#cashOutValue');

const btnStart  = $('#btnStart');
const btnHigh   = $('#btnHigh');
const btnLow    = $('#btnLow');
const btnCash   = $('#btnCashOut');
const btnReset  = $('#btnReset');

const currentCardEl = $('#currentCard');
const curRankEl     = $('#curRank');
const curSuitEl     = $('#curSuit');
const nextCardEl    = $('#nextCard');

const statusHeadEl  = $('#statusTitle');
const statusSubEl   = $('#statusSub');

// ---------- Helpers: cards/suits ----------
const SUITS = ['♠', '♥', '♦', '♣'];
const SUIT_COLORS = { '♠': '#111', '♣': '#111', '♥': '#c21b3a', '♦': '#c21b3a' };
const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];

const RANK_VAL = (r) => {
  if (r === 'A') return 14;
  if (r === 'K') return 13;
  if (r === 'Q') return 12;
  if (r === 'J') return 11;
  return parseInt(r, 10);
};

function randomCard() {
  const r = RANKS[(Math.random() * RANKS.length) | 0];
  const s = SUITS[(Math.random() * SUITS.length) | 0];
  return { rank: r, suit: s, value: RANK_VAL(r) };
}

// Ensure .card-face.back and .card-face.front exist at all times on nextCard
function ensureNextCardFacesExist() {
  let back = nextCardEl.querySelector('.card-face.back');
  let front = nextCardEl.querySelector('.card-face.front');

  if (!back) {
    back = document.createElement('div');
    back.className = 'card-face back';
    back.innerHTML = `<div class="back-pattern"></div>`;
    nextCardEl.appendChild(back);
  }
  if (!front) {
    front = document.createElement('div');
    front.className = 'card-face front';
    front.innerHTML = `
      <div class="rank"></div>
      <div class="suit"></div>
    `;
    nextCardEl.appendChild(front);
  }
  return { back, front };
}

function setCurrentCardUI(card) {
  curRankEl.textContent = card.rank;
  curSuitEl.textContent = card.suit;
  curSuitEl.style.color = SUIT_COLORS[card.suit];
}

function setNextFrontFaceUI(card) {
  const front = nextCardEl.querySelector('.card-face.front');
  if (!front) return;
  const r = front.querySelector('.rank');
  const s = front.querySelector('.suit');
  if (r) r.textContent = card.rank;
  if (s) { s.textContent = card.suit; s.style.color = SUIT_COLORS[card.suit]; }
}

// ---------- Status banner ----------
// Update the status banner (headline + subline) and tint it by state.
// type: 'neutral' | 'win' | 'loss'
function setStatus(headText, subText, type = 'neutral') {
  const headEl = document.getElementById('statusTitle');
  const subEl  = document.getElementById('statusSub');
  const box    = document.querySelector('.hl-status');

  if (headEl) headEl.textContent = headText || '';
  if (subEl)  subEl.textContent  = subText  || '';

  if (box) {
    box.classList.remove('win', 'loss', 'neutral');
    box.classList.add(type);
  }
}

// ---------- Pot math (your new rules, capped to streak 3) ----------
function computePot(wins, b) {
  if (wins <= 0) return 0;
  const w = Math.min(MAX_STREAK, wins);
  // base: original stake + 100% of bet per win
  let pot = b + w * b;
  // bonuses
  if (w >= 2) pot += 0.5 * b;  // +50% at 2nd win
  if (w >= 3) pot += 1.0 * b;  // +100% at 3rd win
  return Math.round(pot);
}

function getCashOutValue() {
  return computePot(streak, bet);
}

// ---------- House bias (ties = loss) ----------
function pickNextCardBiased(curVal, guess) {
  // Decide if player should win (~44%) or lose (~56%)
  const playerShouldWin = Math.random() < (1 - HOUSE_WIN_PROB);

  const higher = [];
  const lower  = [];
  for (let v = 2; v <= 14; v++) {
    if (v > curVal) higher.push(v);
    else if (v < curVal) lower.push(v);
  }

  let poolVals = [];
  if (guess === 'high') {
    poolVals = playerShouldWin ? higher : [...lower, curVal]; // include tie in loss pool
  } else {
    poolVals = playerShouldWin ? lower : [...higher, curVal]; // include tie in loss pool
  }

  if (poolVals.length === 0) {
    // Edge case when a "win" is impossible for the chosen guess (e.g., cur=A + high)
    poolVals = guess === 'high' ? [...lower, curVal] : [...higher, curVal];
  }

  const val = poolVals[(Math.random() * poolVals.length) | 0];
  const rank = (val === 14) ? 'A' : (val === 13 ? 'K' : (val === 12 ? 'Q' : (val === 11 ? 'J' : String(val))));
  const suit = SUITS[(Math.random() * SUITS.length) | 0];
  return { rank, suit, value: val };
}

// ---------- UI sync ----------
function updateUI() {
  // Numbers
  betDisplay.textContent = String(bet);
  if (betRange) betRange.value = String(bet);
  streakDisplay.textContent = String(streak);
  cashOutValueEl.textContent = String(getCashOutValue());

  // Controls (respect your existing behavior; enforce max streak)
  const atMaxStreak = streak >= MAX_STREAK;

  // Place Bet only when not in active round
  btnStart.disabled = inRound || awaitingGuess;

  // Guess buttons when awaiting AND below max streak
  btnHigh.disabled = !(inRound && awaitingGuess && !atMaxStreak);
  btnLow.disabled  = !(inRound && awaitingGuess && !atMaxStreak);

  // Cash Out if there's any positive pot in an active round
  btnCash.disabled = !(inRound && getCashOutValue() > 0);
}

// ---------- Round lifecycle ----------
function dealOpeningCard() {
  currentCard = randomCard();
  setCurrentCardUI(currentCard);

  ensureNextCardFacesExist();
  nextCardEl.classList.remove('revealed');
}

function resetRoundState(keepStatus = false) {
  inRound = false;
  awaitingGuess = false;
  streak = 0;
  nextCard = null;

  ensureNextCardFacesExist();
  nextCardEl.classList.remove('revealed');

  if (!keepStatus) {
    setStatus('Place your bet', 'Adjust the slider (10–100) and tap Place Bet.', 'neutral');
  }
  updateUI();
}
async function placeBet() {
  if (inRound || awaitingGuess) return;

  let result;
  try {
    result = await Coins.spend(bet, `High–Low bet (${bet})`, { source: 'highlow' });
  } catch (e) {
    console.warn('Coins.spend error:', e);
    return;
  }

  if (!result || result.ok !== true) {
    try { Coins.toast?.('Not enough coins for that bet.'); } catch {}
    setStatus('Place your bet', 'Not enough coins for that bet.', 'neutral');
    updateUI();
    return;
  }

  inRound = true;
  streak = 0;
  dealOpeningCard();
  awaitingGuess = true;

  setStatus('Guess the next card', 'Choose Higher or Lower. Ties lose. Up to 3 wins with increasing bonus.', 'neutral');
  updateUI();
} 

function makeGuess(dir) {
  if (!inRound || !awaitingGuess) return;

  awaitingGuess = false;
  updateUI();

  const curVal = currentCard.value;
  nextCard = pickNextCardBiased(curVal, dir);

  ensureNextCardFacesExist();
  setNextFrontFaceUI(nextCard);
  requestAnimationFrame(() => nextCardEl.classList.add('revealed'));

  setTimeout(() => {
    const win = (dir === 'high') ? (nextCard.value > curVal) : (nextCard.value < curVal);
    // ties count as loss

    if (win) {
      streak = Math.min(3, streak + 1);

      // Move next -> current
      currentCard = nextCard;
      setCurrentCardUI(currentCard);

      // Reset next to facedown
      nextCardEl.classList.remove('revealed');

      const potCoins = computePot(streak, bet);
      if (streak === 1) {
        setStatus('Round 1 win!', `Pot: ${potCoins} coins. Cash out or continue for better rewards.`, 'win');
        awaitingGuess = true; // can continue
      } else if (streak === 2) {
        setStatus('Round 2 win!', `Pot: ${potCoins} coins. Cash out or go for one more to boost rewards.`, 'win');
        awaitingGuess = true; // can continue
      } else {
        // streak === 3 (max)
        setStatus('Round 3 win — congratulations!', `Pot: ${potCoins} coins. End of the round — cash out to bank your coins.`, 'win');
        awaitingGuess = false; // stop further guesses at cap
      }

      updateUI();
    } else {
      // Loss → show banner with red tint and keep it on screen
      setStatus('You lose this round', 'Pot: 0 coins. Try again — set your bet and Place Bet.', 'loss');

      // subtle shake
      currentCardEl.animate(
        [
          { transform: 'translateX(0)' },
          { transform: 'translateX(-6px)' },
          { transform: 'translateX(6px)' },
          { transform: 'translateX(0)' }
        ],
        { duration: 280, easing: 'ease-in-out' }
      );

      // Reset state but DON'T overwrite the banner we just set
      resetRoundState(true);
    }
  }, 520);
}

async function cashOut() {
  if (!inRound || streak <= 0) return;
  const winAmt = computePot(streak, bet);
  if (winAmt <= 0) return;

  try {
    await Coins.add(winAmt, `High–Low cash out (+${winAmt})`, { streak, bet, source: 'highlow' });
  } catch (e) {
    console.warn('Coins.add failed:', e);
  }

  setStatus('Round complete', `You banked ${winAmt} coins. Place your bet to start a new round.`);
  resetRoundState();
}

// ---------- Wire up ----------
if (betRange) {
  betRange.addEventListener('input', (e) => {
    // clamp + snap to step
    bet = Math.max(MIN_BET, Math.min(MAX_BET, Math.round(Number(e.target.value) / STEP_BET) * STEP_BET));
    betDisplay.textContent = String(bet);
  });
}
const btnDown = document.querySelector('[data-bet="down"]');
const btnUp   = document.querySelector('[data-bet="up"]');
if (btnDown) btnDown.addEventListener('click', () => { bet = Math.max(MIN_BET, bet - STEP_BET); updateUI(); });
if (btnUp)   btnUp.addEventListener('click',   () => { bet = Math.max(MIN_BET, Math.min(MAX_BET, bet + STEP_BET)); updateUI(); });

btnStart.addEventListener('click', placeBet);
btnHigh .addEventListener('click', () => makeGuess('high'));
btnLow  .addEventListener('click', () => makeGuess('low'));
btnCash .addEventListener('click', cashOut);
btnReset.addEventListener('click', () => { resetRoundState(); dealOpeningCard(); });

// ---------- Boot ----------
dealOpeningCard();
setStatus('Place your bet', 'Adjust the slider (10–100) and tap Place Bet.', 'neutral');
updateUI();