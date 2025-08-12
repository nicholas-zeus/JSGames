// js/tetris.js — Complete game with level-up coin earnings
import { Coins } from './coins.js';
Coins.init({ ui: true, source: 'tetris' }); // renders badge & history; fullscreen-safe toasts

/* ------------------ DOM ------------------ */
const canvas = document.getElementById('tetris');
const ctx = canvas.getContext('2d');

const elScore   = document.getElementById('scoreBottom');
const elLevel   = document.getElementById('level');
const elLines   = document.getElementById('lines');
const elHiScore = document.getElementById('highScore');

const btnLeft   = document.getElementById('leftBtn');
const btnRight  = document.getElementById('rightBtn');
const btnDown   = document.getElementById('downBtn');
const btnRotate = document.getElementById('rotateBtn');
const btnPause  = document.getElementById('pauseBtn');
const btnReset  = document.getElementById('resetBtn');
const btnFs     = document.getElementById('fullscreenBtn');
const pauseOverlay = document.getElementById('pauseOverlay');

const shell = document.querySelector('.tetris-shell');
const container = document.querySelector('.tetris-container');

/* ------------------ Game Config ------------------ */
const W = 12, H = 20;              // arena size
const LEVEL_LINES = 10;            // lines needed per level
const SCORE_TABLE = { 1:40, 2:100, 3:300, 4:1200 }; // NES-like base
const MIN_DROP_MS = 100;           // cap
const START_DROP_MS = 1000;        // level 0

// Colors by piece id (0=empty)
const COLORS = [
  null,
  '#8BD3E6', // T
  '#F9E2AE', // O
  '#B1E5A3', // L
  '#E5B1D8', // J
  '#B3A3E5', // I
  '#E6C48B', // S
  '#E6A08B', // Z
];

/* ------------------ State ------------------ */
let arena = createMatrix(W, H);
let lastTime = 0;
let dropCounter = 0;
let dropInterval = START_DROP_MS;
let paused = false;
let gameOver = false;

// fade-out line clear animation
let clearingRows = [];   // [{y, alpha}]
const CLEAR_FADE_MS = 250;
let clearAnimElapsed = 0;

const state = {
  pos: { x: 0, y: 0 },
  matrix: null,
  score: 0,
  lines: 0,
  level: 0,
  hi: Number(localStorage.getItem('tetris_highScore') || 0),
  lastCoinAwardedLevel: 0, // to avoid duplicate awards
};

/* ------------------ Utilities ------------------ */
function createMatrix(w, h) {
  const m = [];
  for (let i = 0; i < h; i++) m.push(new Array(w).fill(0));
  return m;
}

function createPiece(type) {
  // 1..7 IDs map colors above
  switch (type) {
    case 'T': return [[0,1,0],[1,1,1],[0,0,0]];
    case 'O': return [[2,2],[2,2]];
    case 'L': return [[0,0,3],[3,3,3],[0,0,0]];
    case 'J': return [[4,0,0],[4,4,4],[0,0,0]];
    case 'I': return [[0,0,0,0],[5,5,5,5],[0,0,0,0],[0,0,0,0]];
    case 'S': return [[0,6,6],[6,6,0],[0,0,0]];
    case 'Z': return [[7,7,0],[0,7,7],[0,0,0]];
    default:  return [[1]];
  }
}

function rotate(matrix, dir) {
  // transpose
  for (let y = 0; y < matrix.length; y++) {
    for (let x = 0; x < y; x++) {
      [matrix[x][y], matrix[y][x]] = [matrix[y][x], matrix[x][y]];
    }
  }
  // directions
  if (dir > 0) {
    matrix.forEach(row => row.reverse());
  } else {
    matrix.reverse();
  }
}

/* ------------------ Collision & Merge ------------------ */
function collide(arena, player) {
  const m = player.matrix;
  const o = player.pos;
  for (let y = 0; y < m.length; y++) {
    for (let x = 0; x < m[y].length; x++) {
      if (m[y][x] !== 0 &&
          ((arena[y + o.y] && arena[y + o.y][x + o.x]) !== 0)) {
        return true;
      }
    }
  }
  return false;
}

function merge(arena, player) {
  player.matrix.forEach((row, y) => {
    row.forEach((val, x) => {
      if (val !== 0) arena[y + player.pos.y][x + player.pos.x] = val;
    });
  });
}

/* ------------------ Arena Sweep ------------------ */
function sweep() {
  const fullRows = [];
  outer: for (let y = arena.length - 1; y >= 0; --y) {
    for (let x = 0; x < arena[y].length; ++x) {
      if (arena[y][x] === 0) continue outer;
    }
    fullRows.push(y);
  }
  if (fullRows.length) {
    // prepare fade animation
    clearingRows = fullRows.map(y => ({ y, alpha: 1 }));
    clearAnimElapsed = 0;
  }
}

function applySweep() {
  // remove rows and add empty rows at top
  const ys = clearingRows.map(r => r.y).sort((a,b) => a - b);
  let linesCleared = 0;
  while (ys.length) {
    const y = ys.pop();
    arena.splice(y, 1);
    arena.unshift(new Array(W).fill(0));
    linesCleared++;
  }
  clearingRows = [];
  return linesCleared;
}

/* ------------------ Player Actions ------------------ */
function playerReset() {
  const pieces = 'TJLOSZI';
  const type = pieces[(pieces.length * Math.random()) | 0];
  state.matrix = createPiece(type);
  state.pos.y = 0;
  state.pos.x = (W / 2 | 0) - (state.matrix[0].length / 2 | 0);
  // Game over if spawn position is blocked
  if (collide(arena, state)) {
    arena.forEach(row => row.fill(0));
    state.score = 0;
    state.lines = 0;
    state.level = 0;
    state.lastCoinAwardedLevel = 0;
    dropInterval = START_DROP_MS;
    gameOver = true;
    updateScoreUI();
    showPausedOverlay(true, 'GAME OVER');
  }
}

function playerMove(dir) {
  state.pos.x += dir;
  if (collide(arena, state)) state.pos.x -= dir;
}

function playerDropSoft() {
  state.pos.y++;
  if (collide(arena, state)) {
    state.pos.y--;
    merge(arena, state);
    sweep();
    playerReset();
  }
  dropCounter = 0;
}

function playerHardDrop() {
  while (!collide(arena, state)) state.pos.y++;
  state.pos.y--;
  merge(arena, state);
  sweep();
  playerReset();
  dropCounter = 0;
}

function playerRotate(dir) {
  const pos = state.pos.x;
  let offset = 1;
  rotate(state.matrix, dir);
  // naive wall-kick
  while (collide(arena, state)) {
    state.pos.x += offset;
    offset = -(offset + (offset > 0 ? 1 : -1));
    if (offset > state.matrix[0].length) {
      rotate(state.matrix, -dir);
      state.pos.x = pos;
      return;
    }
  }
}

/* ------------------ Draw ------------------ */
function drawMatrix(matrix, offset, ghost = false) {
  matrix.forEach((row, y) => {
    row.forEach((val, x) => {
      if (val !== 0) {
        ctx.save();
        if (ghost) ctx.globalAlpha = 0.22;
        ctx.fillStyle = COLORS[val];
        ctx.fillRect(x + offset.x, y + offset.y, 1, 1);
        // subtle top highlight for 3D feel
        ctx.globalAlpha = ghost ? 0.12 : 0.25;
        ctx.fillStyle = '#fff';
        ctx.fillRect(x + offset.x, y + offset.y, 1, 0.14);
        ctx.restore();
      }
    });
  });
}

function drawArena() {
  // base background
  ctx.fillStyle = '#0f0d1f';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // cells
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = arena[y][x];
      if (v !== 0) {
        ctx.fillStyle = COLORS[v];
        ctx.fillRect(x, y, 1, 1);
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = '#fff';
        ctx.fillRect(x, y, 1, 0.14);
        ctx.globalAlpha = 1;
      }
    }
  }
  // draw flashing fade rows
  if (clearingRows.length) {
    clearingRows.forEach(({ y, alpha }) => {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, y, W, 1);
      ctx.restore();
    });
  }
}

function draw() {
  drawArena();

  // Ghost piece
  const ghost = {
    matrix: state.matrix,
    pos: { x: state.pos.x, y: state.pos.y }
  };
  while (!collide(arena, ghost)) ghost.pos.y++;
  ghost.pos.y--;
  drawMatrix(ghost.matrix, ghost.pos, true);

  // Current piece
  drawMatrix(state.matrix, state.pos, false);
}

/* ------------------ Scoring, Level, Coins ------------------ */
function linesToNextLevel() {
  return (state.level + 1) * LEVEL_LINES;
}

function onLinesCleared(n) {
  if (!n) return;

  // Score increases by table × (level+1)
  state.score += (SCORE_TABLE[n] || 0) * (state.level + 1);

  // Update high score
  if (state.score > state.hi) {
    state.hi = state.score;
    try { localStorage.setItem('tetris_highScore', String(state.hi)); } catch {}
  }

  // Lines & Level
  state.lines += n;
  const threshold = linesToNextLevel();
  if (state.lines >= threshold) {
    // May jump more than 1 level if many lines were waiting
    const newLevel = Math.floor(state.lines / LEVEL_LINES);
    if (newLevel > state.level) {
      state.level = newLevel;
      // speed up
      dropInterval = Math.max(MIN_DROP_MS, START_DROP_MS - state.level * 75);

      // award coins once per reached level: coins = level * 10
      if (state.level > state.lastCoinAwardedLevel) {
        try {
          Coins.add(state.level * 10, `Reached Level ${state.level}`, { source: 'tetris' });
        } catch (e) { /* swallow to keep gameplay smooth */ }
        state.lastCoinAwardedLevel = state.level;
      }
    }
  }

  updateScoreUI();
}

function updateScoreUI() {
  elScore.textContent = String(state.score);
  elLevel.textContent = String(state.level);
  elLines.textContent = String(state.lines);
  elHiScore.textContent = String(state.hi);
}

/* ------------------ Loop ------------------ */
function update(ts = 0) {
  const dt = ts - lastTime;
  lastTime = ts;

  if (paused || gameOver) {
    draw(); // still render overlay state
    requestAnimationFrame(update);
    return;
  }

  if (clearingRows.length) {
    clearAnimElapsed += dt;
    // fade alpha from 1 -> 0 over CLEAR_FADE_MS
    const t = Math.min(1, clearAnimElapsed / CLEAR_FADE_MS);
    const alpha = 1 - t;
    clearingRows.forEach(r => r.alpha = alpha);

    if (t >= 1) {
      const cleared = applySweep();
      onLinesCleared(cleared);
    }
    draw();
    requestAnimationFrame(update);
    return;
  }

  dropCounter += dt;
  if (dropCounter > dropInterval) {
    state.pos.y++;
    if (collide(arena, state)) {
      state.pos.y--;
      merge(arena, state);
      sweep();
      playerReset();
    }
    dropCounter = 0;
  }

  draw();
  requestAnimationFrame(update);
}

/* ------------------ Resize / Fullscreen ------------------ */
function resizeCanvas() {
  const availW = Math.max(1, container.clientWidth);
  const availH = Math.max(1, container.clientHeight);
  const cell = Math.max(1, Math.floor(Math.min(availW / W, availH / H)));
  // scale canvas to integral cell size
  canvas.width = cell * W;
  canvas.height = cell * H;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(cell, cell);
  // redraw immediately
  draw();
}
window.addEventListener('resize', resizeCanvas);
['fullscreenchange','webkitfullscreenchange','mozfullscreenchange','MSFullscreenChange']
  .forEach(ev => document.addEventListener(ev, resizeCanvas));

/* ------------------ Pause / Reset / FS ------------------ */
function showPausedOverlay(show, label = 'PAUSED') {
  if (!pauseOverlay) return;
  pauseOverlay.style.display = show ? 'flex' : 'none';
  const labelEl = pauseOverlay.querySelector('.pause-label');
  if (labelEl) labelEl.textContent = label;
}

function togglePause(force) {
  paused = (typeof force === 'boolean') ? force : !paused;
  showPausedOverlay(paused, paused ? 'PAUSED' : ''); // label only when paused
}

function resetGame() {
  arena = createMatrix(W, H);
  state.score = 0;
  state.lines = 0;
  state.level = 0;
  state.lastCoinAwardedLevel = 0;
  dropInterval = START_DROP_MS;
  gameOver = false;
  clearingRows = [];
  clearAnimElapsed = 0;
  playerReset();
  updateScoreUI();
  togglePause(false);
}

/* ------------------ Controls ------------------ */
// Keyboard
document.addEventListener('keydown', (e) => {
  if (gameOver) return;
  switch (e.key) {
    case 'ArrowLeft':  playerMove(-1); break;
    case 'ArrowRight': playerMove(1); break;
    case 'ArrowDown':  playerDropSoft(); break;
    case 'ArrowUp':    playerRotate(1); break;
    case 'x': case 'X': playerRotate(1); break;
    case 'z': case 'Z': playerRotate(-1); break;
    case ' ':          playerHardDrop(); break;
    case 'p': case 'P': togglePause(); break;
  }
});

// On-screen buttons (simple repeat for hold on move/down)
function holdRepeat(element, onPress, onRelease) {
  let t = null;
  const start = () => {
    if (gameOver) return;
    onPress();
    t = setInterval(onPress, 100);
  };
  const end = () => { if (t) clearInterval(t); t = null; if (onRelease) onRelease(); };
  element.addEventListener('pointerdown', start);
  element.addEventListener('pointerup', end);
  element.addEventListener('pointerleave', end);
  element.addEventListener('touchstart', (e) => { e.preventDefault(); start(); }, { passive: false });
  element.addEventListener('touchend', end);
}

holdRepeat(btnLeft,  () => playerMove(-1));
holdRepeat(btnRight, () => playerMove(1));
holdRepeat(btnDown,  () => playerDropSoft());
btnRotate.addEventListener('click', () => { if (!gameOver) playerRotate(1); });

btnPause.addEventListener('click', () => togglePause());
btnReset.addEventListener('click', resetGame);
btnFs.addEventListener('click', () => {
  const fsEl = document.fullscreenElement
    || document.webkitFullscreenElement
    || document.mozFullScreenElement
    || document.msFullscreenElement;
  if (!fsEl) {
    (shell.requestFullscreen || shell.webkitRequestFullscreen || shell.mozRequestFullScreen || shell.msRequestFullscreen)?.call(shell);
  } else {
    (document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen)?.call(document);
  }
});

/* ------------------ Boot ------------------ */
function init() {
  playerReset();
  updateScoreUI();
  resizeCanvas();
  showPausedOverlay(false);
  requestAnimationFrame(update);
}
init();