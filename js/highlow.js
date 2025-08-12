// High–Low Game (elegant casino style, biased RNG, Coins-integrated)
import { Coins } from './coins.js';
Coins.init({ ui: true, source: 'highlow' });

// ---------- Config ----------
const MIN_BET = 10;
const MAX_BET = 100;
const STEP_BET = 10;

// House wins target probability:
const HOUSE_WIN_PROB = 0.56; // ~56% house wins (ties also count as house win)

// Streak multipliers (applied to ORIGINAL bet on cash out)
const STREAK_MULTIPLIERS = [0, 1.9, 2.5, 3.0]; 
// index 0 unused; 1 win->1.9x, 2 wins->2.5x, 3+ wins->3.0x

// ---------- State ----------
let bet = MIN_BET;
let streak = 0;
let inRound = false;      // has an active bet been placed?
let awaitingGuess = false;
let currentCard = null;
let nextCard = null;

// ---------- DOM ----------
const $ = (sel) => document.querySelector(sel);
const betRange = $('#betRange');
const betDisplay = $('#betDisplay');
const streakDisplay = $('#streak');
const cashOutValueEl = $('#cashOutValue');

const btnStart = $('#btnStart');
const btnHigh = $('#btnHigh');
const btnLow = $('#btnLow');
const btnCash = $('#btnCashOut');
const btnReset = $('#btnReset');

const currentCardEl = $('#currentCard');
const curRankEl = $('#curRank');
const curSuitEl = $('#curSuit');
const nextCardEl = $('#nextCard');

// ---------- Helpers ----------
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

function svgSuit(suit, color) {
  // Simple vector—keeps file self-contained
  const txt = encodeURIComponent(suit);
  const fill = encodeURIComponent(color);
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'>
    <text x='50' y='70' text-anchor='middle' font-size='86' fill='${fill}' font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${txt}</text>
  </svg>`;
  return `url("data:image/svg+xml;utf8,${svg}")`;
}

function randomCard() {
  const r = RANKS[Math.floor(Math.random() * RANKS.length)];
  const s = SUITS[Math.floor(Math.random() * SUITS.length)];
  return { rank: r, suit: s, value: RANK_VAL(r) };
}

function setCard(el, card, reveal = false) {
  if (reveal) el.classList.add('revealed');
  else el.classList.remove('revealed');

  if (el === currentCardEl) {
    curRankEl.textContent = card.rank;
    curSuitEl.style.backgroundImage = svgSuit(card.suit, SUIT_COLORS[card.suit]);
  } else {
    // next card: front is implied by flipping the "back"
    // We'll flip the .next card to reveal by toggling class
  }
}

// potential cash-out = bet * multiplier(streak)
function getCashOutValue() {
  const m = streak >= 3 ? STREAK_MULTIPLIERS[3] : STREAK_MULTIPLIERS[streak];
  if (!m) return 0;
  return Math.round(bet * m);
}

function updateUI() {
  betDisplay.textContent = String(bet);
  betRange.value = String(bet);
  streakDisplay.textContent = String(streak);
  cashOutValueEl.textContent = String(getCashOutValue());

  btnHigh.disabled = !awaitingGuess;
  btnLow.disabled = !awaitingGuess;
  btnCash.disabled = !(inRound && streak > 0);
  btnStart.disabled = inRound || awaitingGuess;
}

function resetRoundState() {
  inRound = false;
  awaitingGuess = false;
  streak = 0;
  nextCard = null;
  // Reset next card to back
  nextCardEl.classList.remove('revealed');
  updateUI();
}

function flipAndShowNext(next) {
  // Paint front content by temporarily swapping the "back" for visual flip illusion
  const tmp = document.createElement('div');
  tmp.className = 'card-face';
  tmp.innerHTML = `
    <div class="rank">${next.rank}</div>
    <div class="suit" style="background-image:${svgSuit(next.suit, SUIT_COLORS[next.suit])}"></div>
  `;
  // Replace child inside #nextCard
  nextCardEl.innerHTML = '';
  nextCardEl.appendChild(tmp);
  // Animate (simple class swap)
  nextCardEl.classList.add('revealed');
}

function riggedOutcome(userGuess, curVal) {
  // Target: ~44% chance player wins (house 56%)
  // 1) Decide desired outcome using biased RNG
  const wantWin = Math.random() < (1 - HOUSE_WIN_PROB); // ~0.44

  // 2) If we want a win but it's impossible (e.g., cur A and guess High), force loss; vice versa.
  const hasHigher = curVal < 14;
  const hasLower  = curVal > 2;

  if (wantWin) {
    if ((userGuess === 'high' && !hasHigher) || (userGuess === 'low' && !hasLower)) {
      return false;
    }
    return true;
  } else {
    if ((userGuess === 'high' && !hasLower) || (userGuess === 'low' && !hasHigher)) {
      return true;
    }
    return false;
  }
}

function drawCompatibleCard(curVal, wantWin, guess) {
  // Build allowable values based on desired outcome.
  let pool = [];
  if (wantWin) {
    if (guess === 'high') {
      for (let v = curVal + 1; v <= 14; v++) pool.push(v);
    } else {
      for (let v = 2; v <= curVal - 1; v++) pool.push(v);
    }
  } else {
    // House wins on loss OR tie
    if (guess === 'high') {
      for (let v = 2; v <= curVal; v++) pool.push(v);
    } else {
      for (let v = curVal; v <= 14; v++) pool.push(v);
    }
  }
  if (pool.length === 0) {
    // Fallback to any random (should be rare thanks to riggedOutcome guard)
    return randomCard();
  }
  const val = pool[Math.floor(Math.random() * pool.length)];
  // map back to rank string
  const rank = (val === 14) ? 'A' : (val === 13 ? 'K' : (val === 12 ? 'Q' : (val === 11 ? 'J' : String(val))));
  const suit = SUITS[Math.floor(Math.random() * SUITS.length)];
  return { rank, suit, value: val };
}

// ---------- Game Flow ----------
function dealOpeningCard() {
  currentCard = randomCard();
  setCard(currentCardEl, currentCard, false);
  // prepare next card face-down
  nextCardEl.innerHTML = `
    <div class="card-face back">
      <div class="back-pattern"></div>
    </div>
  `;
  nextCardEl.classList.remove('revealed');
}

async function placeBet() {
  if (inRound || awaitingGuess) return;
  try {
    await Coins.spend(bet, `High–Low bet (${bet})`, { source: 'highlow' });
  } catch (e) {
    // If Coins module throws (e.g., insufficient coins), just stop
    console.warn('Coins.spend failed:', e);
    return;
  }
  inRound = true;
  streak = 0;
  dealOpeningCard();
  awaitingGuess = true;
  updateUI();
}

function makeGuess(dir) {
  if (!inRound || !awaitingGuess) return;
  awaitingGuess = false;
  updateUI();

  const curVal = currentCard.value;
  const wantWin = riggedOutcome(dir, curVal);
  nextCard = drawCompatibleCard(curVal, wantWin, dir);

  // Reveal with animation
  setTimeout(() => flipAndShowNext(nextCard), 80);

  setTimeout(() => {
    const win = (dir === 'high')
      ? (nextCard.value > curVal)
      : (nextCard.value < curVal);

    if (win) {
      streak++;
      // Move next -> current for next round
      currentCard = nextCard;
      setCard(currentCardEl, currentCard, false);
      // Reset next to back for another guess
      nextCardEl.innerHTML = `
        <div class="card-face back"><div class="back-pattern"></div></div>
      `;
      nextCardEl.classList.remove('revealed');

      awaitingGuess = true;
      updateUI();
    } else {
      // Loss → round ends, streak reset, no payout
      resetRoundState();
      // subtle shake feedback
      currentCardEl.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { duration: 280, easing: 'ease-in-out' });
    }
  }, 520);
}

async function cashOut() {
  if (!inRound || streak <= 0) return;
  const winAmt = getCashOutValue();
  try {
    await Coins.add(winAmt, `High–Low cash out (+${winAmt})`, { streak, bet, source: 'highlow' });
  } catch (e) {
    console.warn('Coins.add failed:', e);
  }
  resetRoundState();
}

// ---------- Wire up ----------
betRange.addEventListener('input', (e) => {
  bet = Math.max(MIN_BET, Math.min(MAX_BET, Math.round(Number(e.target.value) / STEP_BET) * STEP_BET));
  betDisplay.textContent = String(bet);
});
document.querySelector('[data-bet="down"]').addEventListener('click', () => {
  bet = Math.max(MIN_BET, bet - STEP_BET); updateUI();
});
document.querySelector('[data-bet="up"]').addEventListener('click', () => {
  bet = Math.max(MIN_BET, Math.min(MAX_BET, bet + STEP_BET)); updateUI();
});

btnStart.addEventListener('click', placeBet);
btnHigh.addEventListener('click', () => makeGuess('high'));
btnLow.addEventListener('click',  () => makeGuess('low'));
btnCash.addEventListener('click', cashOut);
btnReset.addEventListener('click', () => {
  resetRoundState();
  dealOpeningCard();
});

// Initial paint
dealOpeningCard();
updateUI();