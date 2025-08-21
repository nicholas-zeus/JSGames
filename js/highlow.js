// High–Low Game — viewport-safe (force-fit), no btnReset
// Keeps gameplay intact while ensuring the table never overflows the visual viewport.
import { Coins } from './coins.js';
Coins.init({ ui: true, source: 'highlow' });

/* ------------------------------------------------------------------
   Viewport sizing & force-fit scaling
   - Writes --header-h and --table-h for CSS sizing
   - Applies top-anchored scale() so content never overflows
------------------------------------------------------------------- */
function setHeaderVar() {
  const header = document.querySelector('.site-header');
  if (header) {
    document.documentElement.style.setProperty('--header-h', header.offsetHeight + 'px');
  }
}

function setTableHeightVar() {
  // Prefer visual viewport (accounts for mobile toolbars/IME)
  const vv = window.visualViewport;
  const vh = Math.floor(vv?.height || window.innerHeight);

  const header = document.querySelector('.site-header');
  const headerH = header ? header.offsetHeight : 0;

  // Matches .hl-container vertical padding in CSS (12 top + 12 bottom)
  const shellPad = 24;

  // A small safety buffer to avoid rounding-induced overflow
  const safety = 6;

  const tableH = Math.max(420, vh - headerH - shellPad - safety);
  document.documentElement.style.setProperty('--table-h', tableH + 'px');
}

// --- FORCE-FIT by scaling table if its natural content exceeds the viewport
let _fitQueued = false;
function queueFit() {
  if (_fitQueued) return;
  _fitQueued = true;
  requestAnimationFrame(() => {
    _fitQueued = false;
    fitTableScale();
  });
}

function fitTableScale() {
  const container = document.querySelector('.hl-container');
  const table = document.querySelector('.hl-table');
  if (!container || !table) return;

  // Top-anchor so the bottom can never be clipped
  container.style.alignItems = 'start';
  container.style.justifyItems = 'center';

  // Reset any prior scaling to measure natural content size
  table.style.transform = 'none';
  table.style.transformOrigin = 'top center';

  const availW = container.clientWidth;
  const availH = container.clientHeight;

  // Use scroll sizes to include full content height/width
  const needW = table.scrollWidth;
  const needH = table.scrollHeight;

  const scale = Math.min(1, availW / needW, availH / needH);
  table.style.transform = scale < 1 ? `scale(${scale})` : 'none';
}

function debounce(fn, wait = 120) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}

const recalcViewport = () => { setHeaderVar(); setTableHeightVar(); queueFit(); };
const debouncedRecalc = debounce(recalcViewport, 140);

// Recalculate on common viewport changes
window.addEventListener('resize', debouncedRecalc, { passive: true });
window.addEventListener('orientationchange', () => setTimeout(recalcViewport, 300), { passive: true });
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', debouncedRecalc, { passive: true });
  window.visualViewport.addEventListener('scroll', debouncedRecalc, { passive: true }); // handles toolbar show/hide
}

// Keep vars updated if the header size changes (e.g., font load)
document.addEventListener('DOMContentLoaded', () => {
  const headerEl = document.querySelector('.site-header');
  if (headerEl && 'ResizeObserver' in window) {
    new ResizeObserver(debouncedRecalc).observe(headerEl);
  }
});

/* ------------------------------------------------------------------
   Coins UI: reuse the site-wide coin SVG next to Bet/Cash Out values
------------------------------------------------------------------- */
function unifyCoinIcons() {
  const src = document.querySelector('.coin-badge svg');
  if (!src) return;

  const targets = [
    document.getElementById('betDisplay')?.parentElement,
    document.getElementById('cashOutValue')?.parentElement
  ].filter(Boolean);

  for (const el of targets) {
    [...el.querySelectorAll('svg')].forEach(s => s.remove()); // avoid dupes
    el.appendChild(document.createTextNode(' '));
    el.appendChild(src.cloneNode(true));
  }
}
unifyCoinIcons();
setTimeout(unifyCoinIcons, 200); // retry soon in case badge mounts a bit late

/* ------------------------------------------------------------------
   Game config/state
------------------------------------------------------------------- */
const MIN_BET = 10, MAX_BET = 100, STEP_BET = 10;
const HOUSE_WIN_PROB = 0.56; // ties = player loss
const MAX_STREAK = 3;

let bet = MIN_BET;
let streak = 0;
let inRound = false;
let awaitingGuess = false;
let currentCard = null;
let nextCard = null;

/* ------------------------------------------------------------------
   DOM refs
------------------------------------------------------------------- */
const $ = (sel) => document.querySelector(sel);

const betRange       = $('#betRange');
const betDisplay     = $('#betDisplay');
const streakDisplay  = $('#streak');
const cashOutValueEl = $('#cashOutValue');

const btnStart  = $('#btnStart');
const btnHigh   = $('#btnHigh');
const btnLow    = $('#btnLow');
const btnCash   = $('#btnCashOut');

const currentCardEl = $('#currentCard');
const curRankEl     = $('#curRank');
const curSuitEl     = $('#curSuit');
const nextCardEl    = $('#nextCard');

const statusHeadEl  = $('#statusTitle');
const statusSubEl   = $('#statusSub');

/* ------------------------------------------------------------------
   Cards & suits
------------------------------------------------------------------- */
const SUITS = ['♠', '♥', '♦', '♣'];
const SUIT_COLORS = { '♠': '#111', '♣': '#111', '♥': '#c21b3a', '♦': '#c21b3a' };
const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const RANK_VAL = (r) => r === 'A' ? 14 : r === 'K' ? 13 : r === 'Q' ? 12 : r === 'J' ? 11 : parseInt(r,10);

function randomCard() {
  const r = RANKS[(Math.random() * RANKS.length) | 0];
  const s = SUITS[(Math.random() * SUITS.length) | 0];
  return { rank: r, suit: s, value: RANK_VAL(r) };
}

// Ensure both faces exist on the "next" card for flipping animation
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
    front.innerHTML = `<div class="rank"></div><div class="suit"></div>`;
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

/* ------------------------------------------------------------------
   Status banner
------------------------------------------------------------------- */
function setStatus(headText, subText, type = 'neutral') {
  if (statusHeadEl) statusHeadEl.textContent = headText || '';
  if (statusSubEl)  statusSubEl.textContent  = subText  || '';

  const box = document.querySelector('.hl-status');
  if (box) {
    box.classList.remove('win', 'loss', 'neutral');
    box.classList.add(type);
  }

  // Long messages can increase height — re-fit after updates
  queueFit();
}

/* ------------------------------------------------------------------
   Pot math
------------------------------------------------------------------- */
function computePot(wins, b) {
  if (wins <= 0) return 0;
  const w = Math.min(MAX_STREAK, wins);
  let pot = b + w * b;     // base: stake + 100% per win
  if (w >= 2) pot += 0.5*b; // +50% at 2nd win
  if (w >= 3) pot += 1.0*b; // +100% at 3rd win
  return Math.round(pot);
}
const getCashOutValue = () => computePot(streak, bet);

/* ------------------------------------------------------------------
   House bias (ties = loss)
------------------------------------------------------------------- */
function pickNextCardBiased(curVal, guess) {
  const playerShouldWin = Math.random() < (1 - HOUSE_WIN_PROB);

  const higher = [], lower = [];
  for (let v = 2; v <= 14; v++) { if (v > curVal) higher.push(v); else if (v < curVal) lower.push(v); }

  let poolVals;
  if (guess === 'high') {
    poolVals = playerShouldWin ? higher : [...lower, curVal]; // include tie in loss pool
  } else {
    poolVals = playerShouldWin ? lower : [...higher, curVal];
  }
  if (poolVals.length === 0) {
    // Edge when a "win" is impossible for chosen guess (e.g., cur=A + high)
    poolVals = guess === 'high' ? [...lower, curVal] : [...higher, curVal];
  }

  const val = poolVals[(Math.random() * poolVals.length) | 0];
  const rank = val === 14 ? 'A' : val === 13 ? 'K' : val === 12 ? 'Q' : val === 11 ? 'J' : String(val);
  const suit = SUITS[(Math.random() * SUITS.length) | 0];
  return { rank, suit, value: val };
}

/* ------------------------------------------------------------------
   UI sync
------------------------------------------------------------------- */
function updateUI() {
  betDisplay.textContent = String(bet);
  if (betRange) betRange.value = String(bet);
  streakDisplay.textContent = String(streak);
  cashOutValueEl.textContent = String(getCashOutValue());

  const atMaxStreak = streak >= MAX_STREAK;

  btnStart.disabled = inRound || awaitingGuess;
  btnHigh .disabled = !(inRound && awaitingGuess && !atMaxStreak);
  btnLow  .disabled = !(inRound && awaitingGuess && !atMaxStreak);
  btnCash .disabled = !(inRound && getCashOutValue() > 0);

  // Lock bet slider and +/– buttons during a round
  if (betRange) betRange.disabled = inRound;
  if (btnDown) btnDown.disabled = inRound;
  if (btnUp)   btnUp.disabled   = inRound;

  // Button enable/disable can slightly change layout → re-fit
  queueFit();
}


/* ------------------------------------------------------------------
   Round lifecycle
------------------------------------------------------------------- */
function dealOpeningCard() {
  currentCard = randomCard();
  setCurrentCardUI(currentCard);

  ensureNextCardFacesExist();
  nextCardEl.classList.remove('revealed');

  queueFit();
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
    // ignore, we'll treat as failure
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
    const win = dir === 'high' ? (nextCard.value > curVal) : (nextCard.value < curVal);

    if (win) {
      streak = Math.min(MAX_STREAK, streak + 1);

      // Move next -> current
      currentCard = nextCard;
      setCurrentCardUI(currentCard);

      // Reset next to facedown
      nextCardEl.classList.remove('revealed');

      const potCoins = computePot(streak, bet);
      if (streak === 1) {
        setStatus('Round 1 win!', `Pot: ${potCoins} coins. Cash out or continue for better rewards.`, 'win');
        awaitingGuess = true;
      } else if (streak === 2) {
        setStatus('Round 2 win!', `Pot: ${potCoins} coins. Cash out or go for one more to boost rewards.`, 'win');
        awaitingGuess = true;
      } else {
        // streak == 3 cap
        setStatus('Round 3 win — congratulations!', `Pot: ${potCoins} coins. End of the round — cash out to bank your coins.`, 'win');
        awaitingGuess = false;
      }

      updateUI();
    } else {
      // Loss → red banner, subtle shake, keep banner until next round
      setStatus('You lose this round', 'Pot: 0 coins. Try again — set your bet and Place Bet.', 'loss');

      currentCardEl.animate(
        [
          { transform: 'translateX(0)' },
          { transform: 'translateX(-6px)' },
          { transform: 'translateX(6px)' },
          { transform: 'translateX(0)' }
        ],
        { duration: 280, easing: 'ease-in-out' }
      );

      // Reset state but keep the loss banner
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
    // ignore for now
  }

  setStatus('Round complete', `You banked ${winAmt} coins. Place your bet to start a new round.`);
  resetRoundState();
}

/* ------------------------------------------------------------------
   Wire up
------------------------------------------------------------------- */
if (betRange) {
  betRange.addEventListener('input', (e) => {
    bet = Math.max(MIN_BET, Math.min(MAX_BET, Math.round(Number(e.target.value) / STEP_BET) * STEP_BET));
    betDisplay.textContent = String(bet);
    queueFit();
  });
}
const btnDown = document.querySelector('[data-bet="down"]');
const btnUp   = document.querySelector('[data-bet="up"]');
if (btnDown) btnDown.addEventListener('click', () => { bet = Math.max(MIN_BET, bet - STEP_BET); updateUI(); });
if (btnUp)   btnUp.addEventListener('click',   () => { bet = Math.min(MAX_BET, bet + STEP_BET); updateUI(); });

btnStart.addEventListener('click', placeBet);
btnHigh .addEventListener('click', () => makeGuess('high'));
btnLow  .addEventListener('click', () => makeGuess('low'));
btnCash .addEventListener('click', cashOut);

/* ------------------------------------------------------------------
   Boot
------------------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', () => {
  recalcViewport();                 // set --header-h / --table-h and fit
  dealOpeningCard();
  setStatus('Place your bet', 'Adjust the slider (10–100) and tap Place Bet.', 'neutral');
  updateUI();

  // A second pass once fonts/UI settle
  setTimeout(queueFit, 200);
});
