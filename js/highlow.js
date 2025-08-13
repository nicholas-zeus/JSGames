// High–Low Game (elegant casino style, biased RNG, Coins-integrated)
import { Coins } from './coins.js';
Coins.init({ ui: true, source: 'highlow' });

// ---------- Config ----------
const MIN_BET = 10;
const MAX_BET = 100;
const STEP_BET = 10;

const HOUSE_WIN_PROB = 0.56; // ~56% house wins; ties = player loss
const STREAK_MULTIPLIERS = [0, 1.9, 2.5, 3.0]; // 1 win->1.9x, 2->2.5x, 3+->3x

// ---------- State ----------
let bet = MIN_BET;
let streak = 0;
let inRound = false;
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
const btnLow  = $('#btnLow');
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

function randomCard() {
  const r = RANKS[Math.floor(Math.random() * RANKS.length)];
  const s = SUITS[Math.floor(Math.random() * SUITS.length)];
  return { rank: r, suit: s, value: RANK_VAL(r) };
}

function getCashOutValue() {
  const m = streak >= 3 ? STREAK_MULTIPLIERS[3] : STREAK_MULTIPLIERS[streak];
  if (!m) return 0;
  return Math.round(bet * m);
}

function updateUI() {
  betDisplay.textContent = String(bet);
  if (betRange) betRange.value = String(bet);

  streakDisplay.textContent = String(streak);
  cashOutValueEl.textContent = String(getCashOutValue());

  btnHigh.disabled = !awaitingGuess;
  btnLow.disabled  = !awaitingGuess;
  btnCash.disabled = !(inRound && streak > 0);
  btnStart.disabled = inRound || awaitingGuess;
}

function ensureNextCardFacesExist() {
  // Ensure .card-face.back and .card-face.front exist simultaneously in #nextCard
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

function resetRoundState() {
  inRound = false;
  awaitingGuess = false;
  streak = 0;
  nextCard = null;

  // Reset “next” card to back-visible/front-hidden
  ensureNextCardFacesExist();
  nextCardEl.classList.remove('revealed');

  updateUI();
}

/**
 * Deterministic biased picker:
 *  - Decide if player SHOULD win this guess (~44%) or lose (~56%).
 *  - Build a pool of values guaranteeing that outcome for the player's choice.
 *  - Include current value in the “loss” pool so ties count as a loss.
 *  - If pool is empty (edge ranks), fall back to the possible outcome.
 */
function pickNextCardBiased(curVal, guess) {
  const playerShouldWin = Math.random() < (1 - HOUSE_WIN_PROB); // ~0.44

  const higher = [];
  const lower  = [];
  for (let v = 2; v <= 14; v++) {
    if (v > curVal) higher.push(v);
    else if (v < curVal) lower.push(v);
  }

  let poolVals = [];
  if (guess === 'high') {
    poolVals = playerShouldWin ? higher : [...lower, curVal];
  } else {
    poolVals = playerShouldWin ? lower : [...higher, curVal];
  }

  if (poolVals.length === 0) {
    poolVals = guess === 'high' ? [...lower, curVal] : [...higher, curVal];
  }

  const val = poolVals[Math.floor(Math.random() * poolVals.length)];
  const rank = (val === 14) ? 'A' : (val === 13 ? 'K' : (val === 12 ? 'Q' : (val === 11 ? 'J' : String(val))));
  const suit = SUITS[Math.floor(Math.random() * SUITS.length)];
  return { rank, suit, value: val };
}

// ---------- Game Flow ----------
function dealOpeningCard() {
  currentCard = randomCard();
  setCurrentCardUI(currentCard);

  // Prepare next card: ensure both faces exist, start “unrevealed”
  ensureNextCardFacesExist();
  nextCardEl.classList.remove('revealed');
}

async function placeBet() {
  if (inRound || awaitingGuess) return;
  try {
    await Coins.spend(bet, `High–Low bet (${bet})`, { source: 'highlow' });
  } catch (e) {
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
  nextCard = pickNextCardBiased(curVal, dir);

  // Update the front face with the card we will reveal
  ensureNextCardFacesExist();
  setNextFrontFaceUI(nextCard);

  // Trigger flip: back -> 180deg, front -> 0deg
  requestAnimationFrame(() => {
    nextCardEl.classList.add('revealed');
  });

  // After flip animation finishes (~480ms), resolve outcome
  setTimeout(() => {
    const win = (dir === 'high') ? (nextCard.value > curVal) : (nextCard.value < curVal);
    // ties (==) are losses

    if (win) {
      streak++;

      // Move next -> current for next guess
      currentCard = nextCard;
      setCurrentCardUI(currentCard);

      // Reset next card to back (face-down) for another guess
      nextCardEl.classList.remove('revealed');

      awaitingGuess = true;
      updateUI();
    } else {
      // Loss: end round, no payout
      resetRoundState();
      // subtle shake feedback
      currentCardEl.animate(
        [
          { transform: 'translateX(0)' },
          { transform: 'translateX(-6px)' },
          { transform: 'translateX(6px)' },
          { transform: 'translateX(0)' }
        ],
        { duration: 280, easing: 'ease-in-out' }
      );
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
if (betRange) {
  betRange.addEventListener('input', (e) => {
    bet = Math.max(MIN_BET, Math.min(MAX_BET, Math.round(Number(e.target.value) / STEP_BET) * STEP_BET));
    betDisplay.textContent = String(bet);
  });
}
const btnDown = document.querySelector('[data-bet="down"]');
const btnUp   = document.querySelector('[data-bet="up"]');
if (btnDown) btnDown.addEventListener('click', () => { bet = Math.max(MIN_BET, bet - STEP_BET); updateUI(); });
if (btnUp)   btnUp.addEventListener('click',   () => { bet = Math.max(MIN_BET, Math.min(MAX_BET, bet + STEP_BET)); updateUI(); });

btnStart.addEventListener('click', placeBet);
btnHigh.addEventListener('click', () => makeGuess('high'));
btnLow .addEventListener('click', () => makeGuess('low'));
btnCash.addEventListener('click', cashOut);
btnReset.addEventListener('click', () => {
  resetRoundState();
  dealOpeningCard();
});

// Initial paint
dealOpeningCard();
updateUI();