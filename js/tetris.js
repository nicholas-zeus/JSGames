// js/tetris.js — one-viewport layout, crisp canvas, correct clear->spawn order

import { Coins } from './coins.js';
Coins.init({ ui: true, source: 'tetris' });

/* -------------------- Canvas / sizing -------------------- */
const canvas = document.getElementById('tetris');
const context = canvas.getContext('2d', { alpha: false });

const arenaWidth = 12;
const arenaHeight = 20;

function setHeaderVar() {
  const header = document.querySelector('.site-header');
  if (header) {
    document.documentElement.style.setProperty('--header-h', header.offsetHeight + 'px');
  }
}

function resizeCanvas() {
  setHeaderVar();
  const container = document.querySelector('.tetris-container');
  if (!container) return;

  const dpr = window.devicePixelRatio || 1;
  const availW = Math.floor(container.clientWidth);
  const availH = Math.floor(container.clientHeight);

  // Choose integer block size to avoid subpixel blur
  const blockByW = Math.floor(availW / arenaWidth);
  const blockByH = Math.floor(availH / arenaHeight);
  const blockSize = Math.max(1, Math.min(blockByW, blockByH));

  const cssW = blockSize * arenaWidth;
  const cssH = blockSize * arenaHeight;

  // CSS size (what the user sees)
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';

  // Backing store size (for crispness)
  canvas.width = Math.max(1, Math.floor(cssW * dpr));
  canvas.height = Math.max(1, Math.floor(cssH * dpr));

  // 1 unit == 1 block in our drawing space
  context.setTransform(blockSize * dpr, 0, 0, blockSize * dpr, 0, 0);
}

function debounce(fn, delay = 120) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}

window.addEventListener('resize', debounce(() => { resizeCanvas(); draw(); }, 160), { passive: true });
window.addEventListener('orientationchange', () => {
  // allow toolbars/viewport units to settle
  setTimeout(() => { resizeCanvas(); draw(); }, 300);
});

/* -------------------- Arena / player -------------------- */
function createMatrix(w, h) {
  const m = [];
  while (h--) m.push(new Array(w).fill(0));
  return m;
}

const arena = createMatrix(arenaWidth, arenaHeight);

const player = {
  pos: { x: 0, y: 0 },
  matrix: null,
  score: 0,
  lines: 0,
  level: 0,
  highScore: Number(localStorage.getItem('highScore')) || 0,
};

let dropCounter = 0;
let dropInterval = 1000;
let lastTime = 0;

let isPaused = false;
let isGameOver = false;

let isClearing = false;        // true while the fade animation plays
let linesToClear = [];
let lineClearFrame = 0;
const lineClearDuration = 20;  // frames (~300ms at 60fps)

/* -------------------- Collision / merge / sweep -------------------- */
function collide(arena, player) {
  const m = player.matrix;
  const o = player.pos;
  for (let y = 0; y < m.length; ++y) {
    for (let x = 0; x < m[y].length; ++x) {
      if (m[y][x] !== 0 &&
         (arena[y + o.y] && arena[y + o.y][x + o.x]) !== 0) {
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

// Mark full lines; actual removal happens in the clearing branch of update()
function sweepArena() {
  linesToClear = [];
  outer: for (let y = arena.length - 1; y >= 0; --y) {
    for (let x = 0; x < arena[y].length; ++x) {
      if (arena[y][x] === 0) continue outer;
    }
    linesToClear.push(y);
  }
  if (linesToClear.length > 0) {
    lineClearFrame = 0;
    isClearing = true;
  }
}

/* -------------------- Pieces -------------------- */
function createPiece(type) {
  if (type === 'T') return [[0,1,0],[1,1,1],[0,0,0]];
  if (type === 'O') return [[2,2],[2,2]];
  if (type === 'L') return [[0,0,3],[3,3,3],[0,0,0]];
  if (type === 'J') return [[4,0,0],[4,4,4],[0,0,0]];
  if (type === 'I') return [[0,0,0,0],[5,5,5,5],[0,0,0,0],[0,0,0,0]];
  if (type === 'S') return [[0,6,6],[6,6,0],[0,0,0]];
  if (type === 'Z') return [[7,7,0],[0,7,7],[0,0,0]];
}

/* -------------------- Drawing -------------------- */
function drawRoundedRect(x, y, w, h, r) {
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + w - r, y);
  context.quadraticCurveTo(x + w, y, x + w, y + r);
  context.lineTo(x + w, y + h - r);
  context.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  context.lineTo(x + r, y + h);
  context.quadraticCurveTo(x, y + h, x, y + h - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
  context.closePath();
}

function adjustColor(hex, amt) {
  let col = parseInt(hex.slice(1), 16);
  let r = Math.min(255, Math.max(0, ((col >> 16) + amt * 255)));
  let g = Math.min(255, Math.max(0, (((col >> 8) & 0x00FF) + amt * 255)));
  let b = Math.min(255, Math.max(0, ((col & 0x0000FF) + amt * 255)));
  return `rgb(${r}, ${g}, ${b})`;
}
const lighten = (hex, a) => adjustColor(hex, a);
const darken = (hex, a) => adjustColor(hex, -a);

const colors = [null, '#FF0D72','#0DC2FF','#0DFF72','#F538FF','#FF8E0D','#FFE138','#3877FF'];

function drawMatrix(matrix, offset) {
  matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value !== 0) {
        const px = x + offset.x;
        const py = y + offset.y;
        const base = colors[value];
        const grad = context.createLinearGradient(px, py, px + 1, py + 1);
        grad.addColorStop(0, lighten(base, 0.2));
        grad.addColorStop(1, darken(base, 0.2));
        context.fillStyle = grad;
        drawRoundedRect(px, py, 1, 1, 0.15);
        context.fill();
        context.fillStyle = 'rgba(255,255,255,0.1)';
        drawRoundedRect(px + 0.05, py + 0.05, 0.9, 0.4, 0.1);
        context.fill();
        context.strokeStyle = 'rgba(255,255,255,0.15)';
        context.lineWidth = 0.05;
        drawRoundedRect(px, py, 1, 1, 0.15);
        context.stroke();
      }
    });
  });
}

function drawBlock(x, y, value, alpha = 1) {
  context.globalAlpha = alpha;
  const base = colors[value];
  const grad = context.createLinearGradient(x, y, x + 1, y + 1);
  grad.addColorStop(0, lighten(base, 0.2));
  grad.addColorStop(1, darken(base, 0.2));
  context.fillStyle = grad;
  drawRoundedRect(x, y, 1, 1, 0.15);
  context.fill();
  context.fillStyle = 'rgba(255,255,255,0.1)';
  drawRoundedRect(x + 0.05, y + 0.05, 0.9, 0.4, 0.1);
  context.fill();
  context.strokeStyle = 'rgba(255,255,255,0.15)';
  context.lineWidth = 0.05;
  drawRoundedRect(x, y, 1, 1, 0.15);
  context.stroke();
  context.globalAlpha = 1;
}

function draw() {
  // clear/paint background in block units (since we scaled the context)
  context.fillStyle = '#001528';
  context.fillRect(0, 0, arenaWidth, arenaHeight);

  // grid
  context.strokeStyle = 'rgba(255,255,255,0.05)';
  context.lineWidth = 0.02;
  for (let x = 0; x <= arenaWidth; x++) {
    context.beginPath(); context.moveTo(x, 0); context.lineTo(x, arenaHeight); context.stroke();
  }
  for (let y = 0; y <= arenaHeight; y++) {
    context.beginPath(); context.moveTo(0, y); context.lineTo(arenaWidth, y); context.stroke();
  }

  // arena (with fade on clearing rows)
  arena.forEach((row, y) => {
    const fading = linesToClear.includes(y);
    const alpha = fading ? Math.max(0, 1 - (lineClearFrame / lineClearDuration)) : 1;
    row.forEach((value, x) => {
      if (value !== 0 && alpha > 0) drawBlock(x, y, value, alpha);
    });
  });

  // active piece (only when not clearing, or show it anyway? Traditional games keep it)
  // We keep drawing the active piece even during clear animation, but we will NOT spawn a new one until clear completes.
  if (!isGameOver) drawMatrix(player.matrix, player.pos);
}

/* -------------------- Update loop -------------------- */
const baseScores = [0, 40, 100, 300, 1200];

function update(time = 0) {
  const deltaTime = time - lastTime;
  lastTime = time;

  // Pause or Game Over: just redraw and loop
  if (isPaused || isGameOver) {
    draw();
    return requestAnimationFrame(update);
  }

  // Clearing phase: play fade, then remove rows and spawn NEXT piece
  if (isClearing) {
    lineClearFrame++;

    if (lineClearFrame >= lineClearDuration) {
      // Remove rows
      let rowsCleared = 0;
      outer: for (let y = arena.length - 1; y >= 0; --y) {
        for (let x = 0; x < arena[y].length; ++x) {
          if (arena[y][x] === 0) continue outer;
        }
        arena.splice(y, 1);
        arena.unshift(new Array(arenaWidth).fill(0));
        rowsCleared++;
        ++y; // stay on same index
      }

      // Scoring / progression / coins
      if (rowsCleared > 0) {
        player.lines += rowsCleared;
        player.score += (baseScores[rowsCleared] || 0) * (player.level + 1);
        if (player.score > player.highScore) {
          player.highScore = player.score;
          localStorage.setItem('highScore', player.highScore);
        }
        // Level up every 10 lines
        while (player.lines >= (player.level + 1) * 10) {
          player.level++;
          dropInterval = Math.max(100, 1000 - player.level * 100);
          try { Coins.add(player.level * 10, `Reached Level ${player.level}`, { source: 'tetris' }); } catch (e) {}
        }
      }

      updateScore();
      // End clearing phase
      isClearing = false;
      linesToClear = [];
      lineClearFrame = 0;

      // NOW spawn next piece (this is the core fix)
      playerReset();
      dropCounter = 0; // reset gravity timing
    }

    draw();
    return requestAnimationFrame(update);
  }

  // Normal gravity progression
  dropCounter += deltaTime;
  if (dropCounter > dropInterval) {
    playerDrop();
  }

  draw();
  return requestAnimationFrame(update);
}

/* -------------------- Player actions -------------------- */
function playerDrop() {
  if (isClearing || isPaused || isGameOver) return; // guard

  player.pos.y++;
  if (collide(arena, player)) {
    player.pos.y--;
    merge(arena, player);
    sweepArena();

    // If lines will clear, DO NOT spawn a new piece yet.
    if (isClearing) {
      dropCounter = 0;
      return;
    }

    // No lines to clear -> spawn next immediately
    playerReset();
  }
  dropCounter = 0;
}

function rotate(matrix, dir) {
  for (let y = 0; y < matrix.length; ++y) {
    for (let x = 0; x < y; ++x) {
      [matrix[x][y], matrix[y][x]] = [matrix[y][x], matrix[x][y]];
    }
  }
  if (dir > 0) matrix.forEach(row => row.reverse());
  else matrix.reverse();
}

function playerRotate(dir) {
  if (isClearing || isPaused || isGameOver) return;
  const pos = player.pos.x;
  let offset = 1;
  rotate(player.matrix, dir);
  while (collide(arena, player)) {
    player.pos.x += offset;
    offset = -(offset + (offset > 0 ? 1 : -1));
    if (offset > player.matrix[0].length) {
      rotate(player.matrix, -dir);
      player.pos.x = pos;
      return;
    }
  }
}

function playerReset() {
  const pieces = 'TJLOSZI';
  player.matrix = createPiece(pieces[Math.floor(Math.random() * pieces.length)]);
  player.pos.y = 0;
  player.pos.x = Math.floor(arenaWidth / 2) - Math.floor(player.matrix[0].length / 2);

  if (collide(arena, player)) {
    gameOver();
  }
}

/* -------------------- UI: score/level/lines -------------------- */
function updateScore() {
  const $ = (id) => document.getElementById(id);
  $('scoreBottom').textContent = player.score;
  $('lines').textContent = player.lines;
  $('highScore').textContent = player.highScore;
  $('level').textContent = player.level;
}

/* -------------------- Game state -------------------- */
function gameOver() {
  isPaused = true;
  isGameOver = true;
  const lbl = document.querySelector('.pause-label');
  if (lbl) lbl.textContent = 'GAME OVER';
  const overlay = document.getElementById('pauseOverlay');
  if (overlay) overlay.style.display = 'flex';
}

/* -------------------- Controls (keyboard + on-screen) -------------------- */
document.addEventListener('keydown', (e) => {
  if (isPaused || isGameOver || isClearing) return;
  if (e.key === 'ArrowLeft') {
    player.pos.x--; if (collide(arena, player)) player.pos.x++;
  } else if (e.key === 'ArrowRight') {
    player.pos.x++; if (collide(arena, player)) player.pos.x--;
  } else if (e.key === 'ArrowDown') {
    playerDrop();
  } else if (e.key === 'ArrowUp') {
    playerRotate(1);
  }
});

const $btn = (id) => document.getElementById(id);
$btn('leftBtn').onclick = () => { if (!isPaused && !isGameOver && !isClearing) { player.pos.x--; if (collide(arena, player)) player.pos.x++; } };
$btn('rightBtn').onclick = () => { if (!isPaused && !isGameOver && !isClearing) { player.pos.x++; if (collide(arena, player)) player.pos.x--; } };
$btn('downBtn').onclick = () => { if (!isPaused && !isGameOver && !isClearing) playerDrop(); };
$btn('rotateBtn').onclick = () => { if (!isPaused && !isGameOver && !isClearing) playerRotate(1); };

$btn('pauseBtn').onclick = () => {
  if (isGameOver) return;
  isPaused = !isPaused;
  const overlay = document.getElementById('pauseOverlay');
  if (overlay) overlay.style.display = isPaused ? 'flex' : 'none';
};

$btn('resetBtn').onclick = () => {
  // reset arena & player state
  arena.forEach(row => row.fill(0));
  player.score = 0;
  player.lines = 0;
  player.level = 0;
  player.highScore = Number(localStorage.getItem('highScore')) || 0;
  dropInterval = 1000;
  isPaused = false;
  isGameOver = false;
  isClearing = false;
  linesToClear = [];
  lineClearFrame = 0;
  const lbl = document.querySelector('.pause-label');
  if (lbl) lbl.textContent = 'PAUSED';
  const overlay = document.getElementById('pauseOverlay');
  if (overlay) overlay.style.display = 'none';
  updateScore();
  playerReset();
  dropCounter = 0;
  draw();
};

/* -------------------- Kick-off -------------------- */
resizeCanvas();
playerReset();
updateScore();
document.getElementById('pauseOverlay').style.display = 'none';
update();
