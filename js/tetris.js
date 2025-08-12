// js/tetris.js — ESM wrapper (imports Coins only so the UI is ready)
import { Coins } from './coins.js';
Coins.init({ ui: true, source: 'tetris' });
// Coins: earn coins on each level-up (coins = level * 10)

// The rest is your original tetris.js content (unchanged)
const canvas = document.getElementById('tetris');
const context = canvas.getContext('2d');
let isGameOver = false;
let isClearing = false;

const arenaWidth = 12;
const arenaHeight = 20;
let linesToClear = [];
let lineClearFrame = 0;
const lineClearDuration = 20; // ~20 frames (~300ms)

function createMatrix(w, h) {
  const matrix = [];
  while (h--) matrix.push(new Array(w).fill(0));
  return matrix;
}

function resizeCanvas() {
  const container = document.querySelector('.tetris-container');
  const availableHeight = container.clientHeight;
  const availableWidth = container.clientWidth;
  const maxBlockSizeByHeight = Math.floor(availableHeight / arenaHeight);
  const maxBlockSizeByWidth = Math.floor(availableWidth / arenaWidth);
  const blockSize = Math.min(maxBlockSizeByHeight, maxBlockSizeByWidth);
  const canvasWidth = blockSize * arenaWidth;
  const canvasHeight = blockSize * arenaHeight;
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.scale(blockSize, blockSize);
  logResizeDebug(
    availableHeight,
    availableWidth,
    maxBlockSizeByHeight,
    maxBlockSizeByWidth,
    blockSize,
    canvasWidth,
    canvasHeight
  );
}
window.addEventListener('resize', () => { resizeCanvas(); draw(); });

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

function createPiece(type) {
  if (type === 'T') return [[0, 0, 0],[1, 1, 1],[0, 1, 0]];
  if (type === 'O') return [[2, 2],[2, 2]];
  if (type === 'L') return [[0, 3, 0],[0, 3, 0],[0, 3, 3]];
  if (type === 'J') return [[0, 4, 0],[0, 4, 0],[4, 4, 0]];
  if (type === 'I') return [[0, 5, 0, 0],[0, 5, 0, 0],[0, 5, 0, 0],[0, 5, 0, 0]];
  if (type === 'S') return [[0, 6, 6],[6, 6, 0],[0, 0, 0]];
  if (type === 'Z') return [[7, 7, 0],[0, 7, 7],[0, 0, 0]];
  return [[0]];
}

function drawMatrix(matrix, offset) {
  matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value !== 0) {
        context.fillStyle = colors[value];
        context.fillRect(x + offset.x, y + offset.y, 1, 1);
        // 3D-ish shading
        context.globalAlpha = 0.25;
        context.fillStyle = '#fff';
        context.fillRect(x + offset.x, y + offset.y, 1, 0.15);
        context.globalAlpha = 1;
      }
    });
  });
}

function draw() {
  context.fillStyle = '#141127';
  context.fillRect(0, 0, canvas.width, canvas.height);
  drawMatrix(arena, { x: 0, y: 0 });
  drawMatrix(player.matrix, player.pos);

  // Ghost piece
  const ghost = { ...player, pos: { ...player.pos } };
  while (!collide(arena, ghost)) { ghost.pos.y++; }
  ghost.pos.y--;
  context.globalAlpha = 0.18;
  drawMatrix(ghost.matrix, ghost.pos);
  context.globalAlpha = 1;

  // Flash clearing lines
  if (isClearing && linesToClear.length > 0) {
    const phase = lineClearFrame / lineClearDuration;
    const alpha = 0.25 + 0.75 * Math.abs(Math.sin(phase * Math.PI));
    context.fillStyle = `rgba(255,255,255,${alpha})`;
    linesToClear.forEach(y => context.fillRect(0, y, arenaWidth, 1));
  }
}

function merge(arena, player) {
  player.matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value !== 0) { arena[y + player.pos.y][x + player.pos.x] = value; }
    });
  });
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

function playerDrop() {
  player.pos.y++;
  if (collide(arena, player)) {
    player.pos.y--;
    merge(arena, player);
    sweepArena();
    playerReset();
  }
  dropCounter = 0;
}

function playerMove(dir) {
  player.pos.x += dir;
  if (collide(arena, player)) player.pos.x -= dir;
}

function playerHardDrop() {
  while (!collide(arena, player)) player.pos.y++;
  player.pos.y--;
  merge(arena, player);
  sweepArena();
  playerReset();
  dropCounter = 0;
}

function playerReset() {
  const pieces = 'TJLOSZI';
  player.matrix = createPiece(pieces[(pieces.length * Math.random()) | 0]);
  player.pos.y = 0;
  player.pos.x = (arenaWidth / 2 | 0) - (player.matrix[0].length / 2 | 0);
  if (collide(arena, player)) {
    arena.forEach(row => row.fill(0));
    player.score = 0;
    player.lines = 0;
    player.level = 0;
    dropInterval = 1000;
    isGameOver = true;
    updateScore();
  }
}

function sweepArena() {
  linesToClear = [];
  outer: for (let y = arena.length - 1; y >= 0; --y) {
    for (let x = 0; x < arena[y].length; ++x) {
      if (arena[y][x] === 0) continue outer;
    }
    linesToClear.push(y);
  }

  if (linesToClear.length > 0) {
    isClearing = true;
    lineClearFrame = 0;
  }
}

function applySweep() {
  let linesCleared = 0;
  linesToClear.sort((a, b) => a - b);
  while (linesToClear.length) {
    const row = linesToClear.pop();
    arena.splice(row, 1);
    arena.unshift(new Array(arenaWidth).fill(0));
    linesCleared++;
  }
  return linesCleared;
}

const colors = [
  null,
  '#8BD3E6',
  '#F9E2AE',
  '#B1E5A3',
  '#E5B1D8',
  '#B3A3E5',
  '#E6C48B',
  '#E6A08B'
];

let dropCounter = 0;
let dropInterval = 1000;
let lastTime = 0;

const baseScores = { 1: 40, 2: 100, 3: 300, 4: 1200 };

const arena = createMatrix(arenaWidth, arenaHeight);
const player = {
  pos: { x: 0, y: 0 },
  matrix: null,
  score: 0,
  lines: 0,
  level: 0,
  highScore: Number(localStorage.getItem('highScore') || 0)
};

function update(time = 0) {
  const deltaTime = time - lastTime;
  lastTime = time;

  if (isClearing) {
    lineClearFrame++;
    if (lineClearFrame >= lineClearDuration) {
      const linesCleared = applySweep();
      player.lines += linesCleared;
      player.score += baseScores[linesCleared] * (player.level + 1);
      if (player.score > player.highScore) {
        player.highScore = player.score; localStorage.setItem('highScore', player.highScore);
      }
      // LEVEL-UP: adjust speed and award coins = level * 10
      if (player.lines >= (player.level + 1) * 10) {
        player.level++;
        dropInterval = Math.max(100, 1000 - player.level * 100);
        try {
          Coins.add(player.level * 10, `Reached Level ${player.level}`, { source: 'tetris' });
        } catch (e) { /* no-op: coin storage might be unavailable */ }
      }
      updateScore(); linesToClear = []; isClearing = false; playerReset();
    }
    draw(); return requestAnimationFrame(update);
  }

  dropCounter += deltaTime; if (dropCounter > dropInterval) playerDrop();
  draw(); requestAnimationFrame(update);
}

document.getElementById('fullscreenBtn').onclick = () => {
  const elem = document.querySelector('.tetris-shell');
  if (!document.fullscreenElement) elem.requestFullscreen().catch(() => {});
  else document.exitFullscreen();
};

document.getElementById('pauseBtn').onclick = () => { paused = !paused; };

let paused = false;
function gameLoop(time = 0) {
  if (!paused && !isGameOver) update(time);
  requestAnimationFrame(gameLoop);
}

function updateScore() {
  document.getElementById('score').innerText = player.score;
  document.getElementById('lines').innerText = player.lines;
  document.getElementById('level').innerText = player.level;
  document.getElementById('highscore').innerText = player.highScore;
}

document.addEventListener('keydown', event => {
  if (event.keyCode === 37) { playerMove(-1); }
  else if (event.keyCode === 39) { playerMove(1); }
  else if (event.keyCode === 40) { playerDrop(); }
  else if (event.keyCode === 38) { playerRotate(1); }
  else if (event.keyCode === 32) { playerHardDrop(); }
});

function logResizeDebug(...args) { /* optionally log sizing for debug */
  // console.debug('resize', ...args);
}

resizeCanvas();
playerReset();
updateScore();
gameLoop();