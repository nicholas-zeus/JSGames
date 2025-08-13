// High–Low Game (elegant casino style, biased RNG, Coins-integrated)
import { Coins } from './coins.js';
Coins.init({ ui: true, source: 'highlow' });

// ---------- Config ----------
const MIN_BET = 10;
const MAX_BET = 100;
const STEP_BET = 10;

// House wins target probability:
const HOUSE_WIN_PROB = 0.56; // ~56% house wins (ties also count as a loss)

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

function randomCard() {
  const r = RANKS[Math.floor(Math.random() * RANKS.length)];
  const s = SUITS[Math.floor(Math.random() * SUITS.length)];
  return { rank: r, suit: s, value: RANK_VAL(r) };
}

function setCard(el, card, reveal = false) {
  // Flip visual state
  if (reveal) el.classList.add('revealed');
  else el.classList.remove('revealed');

  // Only the current card has fixed DOM children for rank/suit
  if (el === currentCardEl) {
    curRankEl.textContent = card.rank;
    curSuitEl.textContent = card.suit;              // emoji/text suit
    curSuitEl.style.color = SUIT_COLORS[card.suit]; // color suit
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
  if (betRange) betRange.value = String(bet);

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

  // Reset next card to back pattern
  nextCardEl.innerHTML = `
    <div class="card-face back">
      <div class="back-pattern"></div>
    </div>
  `;
  nextCardEl.classList.remove('revealed');

  updateUI();
}

function flipAndShowNext(next) {
  // Build a face for the next card (front)
  const tmp = document.createElement('div');
  tmp.className = 'card-face';
  tmp.innerHTML = `
    <div class="rank">${next.rank}</div>
    <div class="suit" style="color:${SUIT_COLORS[next.suit]}">${next.suit}</div>
  `;
  // Replace child inside #nextCard with the "front"
  nextCardEl.innerHTML = '';
  nextCardEl.appendChild(tmp);
  // Animate flip
  nextCardEl.classList.add('revealed');
}

/**
 * Deterministic biased picker:
 * - Decide if player SHOULD win this guess (~44%) or lose (~56%).
 * - Build a pool of values guaranteeing that outcome for the player's choice.
 * - Include current value in the "lose" pool to make ties a loss.
 * - If the pool is empty (edge ranks), flip to the only possible outcome.
 */
function pickNextCardBiased(curVal, guess) {
  // Target: ~44% player win; ties = player loss
  const playerShouldWin = Math.random() < (1 - HOUSE_WIN_PROB); // ~0.44

  const higher = [];        // values strictly > curVal
  const lower  = [];        // values strictly < curVal
  for (let v = 2; v <= 14; v++) {
    if (v > curVal) higher.push(v);
    else if (v < curVal) lower.push(v);
  }

  let poolVals = [];
  if (guess === 'high') {
    poolVals = playerShouldWin ? higher : [...lower, curVal]; // tie in loss pool
  } else {
    poolVals = playerShouldWin ? lower : [...higher, curVal]; // tie in loss pool
  }

  if (poolVals.length === 0) {
    // Edge case: if winning set is impossible (e.g., cur=A & guess=high)
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
  setCard(currentCardEl, currentCard, false);

  // Prepare next card face-down
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
  nextCard = pickNextCardBiased(curVal, dir);

  // Reveal with small delay for flip
  setTimeout(() => flipAndShowNext(nextCard), 80);

  setTimeout(() => {
    const win = (dir === 'high')
      ? (nextCard.value > curVal)
      : (nextCard.value < curVal);
    // ties implicitly count as loss (==)

    if (win) {
      streak++;

      // Move next -> current for another guess
      currentCard = nextCard;
      setCard(currentCardEl, currentCard, false);

      // Reset next to back for next round
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
btnLow.addEventListener('click',  () => makeGuess('low'));
btnCash.addEventListener('click', cashOut);
btnReset.addEventListener('click', () => {
  resetRoundState();
  dealOpeningCard();
});

// Initial paint
dealOpeningCard();
updateUI();