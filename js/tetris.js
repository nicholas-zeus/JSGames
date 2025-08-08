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

  // Available space
  const availableHeight = container.clientHeight;
  const availableWidth = container.clientWidth;

  // Calculate max block size for both dimensions
  const maxBlockSizeByHeight = Math.floor(availableHeight / arenaHeight);
  const maxBlockSizeByWidth = Math.floor(availableWidth / arenaWidth);

  // Use the smaller one to preserve aspect ratio
  const blockSize = Math.min(maxBlockSizeByHeight, maxBlockSizeByWidth);

  // Final canvas size
  const canvasWidth = blockSize * arenaWidth;
  const canvasHeight = blockSize * arenaHeight;

  // Apply size and scaling
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.scale(blockSize, blockSize);
   logResizeDebug(availableHeight, availableWidth, maxBlockSizeByHeight, maxBlockSizeByWidth, blockSize, canvasWidth, canvasHeight);
}




window.addEventListener('resize', () => {
  resizeCanvas();
  draw();
});

function collide(arena, player) {
  const m = player.matrix;
  const o = player.pos;
  for (let y = 0; y < m.length; ++y) {
    for (let x = 0; x < m[y].length; ++x) {
      if (m[y][x] !== 0 && (arena[y + o.y] && arena[y + o.y][x + o.x]) !== 0) {
        return true;
      }
    }
  }
  return false;
}

function merge(arena, player) {
  player.matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value !== 0) {
        arena[y + player.pos.y][x + player.pos.x] = value;
      }
    });
  });
}

const baseScores = [0, 40, 100, 300, 1200];

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
    isClearing = true; // Pause gameplay for animation
  }
}

function createPiece(type) {
  if (type === 'T') return [[0, 1, 0], [1, 1, 1], [0, 0, 0]];
  if (type === 'O') return [[2, 2], [2, 2]];
  if (type === 'L') return [[0, 0, 3], [3, 3, 3], [0, 0, 0]];
  if (type === 'J') return [[4, 0, 0], [4, 4, 4], [0, 0, 0]];
  if (type === 'I') return [[0, 0, 0, 0], [5, 5, 5, 5], [0, 0, 0, 0], [0, 0, 0, 0]];
  if (type === 'S') return [[0, 6, 6], [6, 6, 0], [0, 0, 0]];
  if (type === 'Z') return [[7, 7, 0], [0, 7, 7], [0, 0, 0]];
}
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

function lighten(hex, amt) {
  return adjustColor(hex, amt);
}

function darken(hex, amt) {
  return adjustColor(hex, -amt);
}

function adjustColor(hex, amt) {
  let col = parseInt(hex.slice(1), 16);
  let r = Math.min(255, Math.max(0, ((col >> 16) + amt * 255)));
  let g = Math.min(255, Math.max(0, (((col >> 8) & 0x00FF) + amt * 255)));
  let b = Math.min(255, Math.max(0, ((col & 0x0000FF) + amt * 255)));
  return `rgb(${r}, ${g}, ${b})`;
}

function drawMatrix(matrix, offset) {
  const colors = [null, '#FF0D72', '#0DC2FF', '#0DFF72', '#F538FF', '#FF8E0D', '#FFE138', '#3877FF'];

  matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value !== 0) {
        const px = x + offset.x;
        const py = y + offset.y;

        const baseColor = colors[value];
        const light = lighten(baseColor, 0.2);
        const dark = darken(baseColor, 0.2);

        // Gradient fill
        const grad = context.createLinearGradient(px, py, px + 1, py + 1);
        grad.addColorStop(0, light);
        grad.addColorStop(1, dark);
        context.fillStyle = grad;

        // Rounded rectangle path
        drawRoundedRect(px, py, 1, 1, 0.15);
        context.fill();

        // Glossy top
        context.fillStyle = 'rgba(255, 255, 255, 0.1)';
        drawRoundedRect(px + 0.05, py + 0.05, 0.9, 0.4, 0.1);
        context.fill();

        // Border/segment stroke
        context.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        context.lineWidth = 0.05;
        drawRoundedRect(px, py, 1, 1, 0.15);
        context.stroke();
      }
    });
  });
}

function drawBlock(x, y, value, alpha = 1) {
  context.globalAlpha = alpha;

  const colors = [null, '#FF0D72', '#0DC2FF', '#0DFF72', '#F538FF', '#FF8E0D', '#FFE138', '#3877FF'];
  const baseColor = colors[value];
  const light = lighten(baseColor, 0.2);
  const dark = darken(baseColor, 0.2);

  const grad = context.createLinearGradient(x, y, x + 1, y + 1);
  grad.addColorStop(0, light);
  grad.addColorStop(1, dark);
  context.fillStyle = grad;
  drawRoundedRect(x, y, 1, 1, 0.15);
  context.fill();

  context.fillStyle = 'rgba(255, 255, 255, 0.1)';
  drawRoundedRect(x + 0.05, y + 0.05, 0.9, 0.4, 0.1);
  context.fill();

  context.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  context.lineWidth = 0.05;
  drawRoundedRect(x, y, 1, 1, 0.15);
  context.stroke();

  context.globalAlpha = 1;
}

function draw() {
  // 1. Dark background
  context.fillStyle = '#001528';
  context.fillRect(0, 0, canvas.width, canvas.height);

  // 2. Grid lines (before blocks)
  context.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  context.lineWidth = 0.02;

  for (let x = 0; x <= arenaWidth; x++) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, arenaHeight);
    context.stroke();
  }

  for (let y = 0; y <= arenaHeight; y++) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(arenaWidth, y);
    context.stroke();
  }

  // 3. Arena with fade effect
  arena.forEach((row, y) => {
    const isClearing = linesToClear.includes(y);
    const alpha = isClearing ? 1 - (lineClearFrame / lineClearDuration) : 1;

    row.forEach((value, x) => {
      if (value !== 0 && alpha > 0) {
        drawBlock(x, y, value, alpha);
      }
    });
  });

  // 4. Player piece
  drawMatrix(player.matrix, player.pos);
}

function update(time = 0) {
    if (isPaused || isGameOver) return requestAnimationFrame(update);

    const deltaTime = time - lastTime;
    lastTime = time;

    if (isClearing) {
        // Run fade animation only
        lineClearFrame++;
        if (lineClearFrame >= lineClearDuration) {

            // ✅ Correct classic Tetris row removal
            outer: for (let y = arena.length - 1; y >= 0; --y) {
                for (let x = 0; x < arena[y].length; ++x) {
                    if (arena[y][x] === 0) {
                        continue outer; // skip incomplete row
                    }
                }
                arena.splice(y, 1);
                arena.unshift(new Array(arenaWidth).fill(0));
                ++y; // re-check row that just dropped
            }

            // Scoring
            const linesCleared = linesToClear.length;
            player.lines += linesCleared;
            player.score += baseScores[linesCleared] * (player.level + 1);

            // High score check
            if (player.score > player.highScore) {
                player.highScore = player.score;
                localStorage.setItem('highScore', player.highScore);
            }

            // Level up
            if (player.lines >= (player.level + 1) * 10) {
                player.level++;
                dropInterval = Math.max(100, 1000 - player.level * 100);
            }

            updateScore();
            linesToClear = [];
            isClearing = false; // Resume gameplay
            playerReset();
        }

        draw();
        return requestAnimationFrame(update);
    }

    // Normal gameplay logic
    dropCounter += deltaTime;
    if (dropCounter > dropInterval) {
        playerDrop();
    }

    draw();
    requestAnimationFrame(update);
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
document.getElementById('fullscreenBtn').onclick = () => {
  const elem = document.querySelector('.tetris-shell');
 // Or use a specific container like `.tetris-shell`
  if (!document.fullscreenElement) {
    elem.requestFullscreen().catch(err => {
      console.error(`Fullscreen error: ${err.message}`);
    });
  } else {
    document.exitFullscreen();
  }
};

document.getElementById('pauseBtn').onclick = () => {
  isPaused = !isPaused;
  document.getElementById('pauseOverlay').style.display = isPaused ? 'flex' : 'none';
};
function playerReset() {
  const pieces = 'TJLOSZI';
  player.matrix = createPiece(pieces[Math.floor(Math.random() * pieces.length)]);
  player.pos.y = 0;
  player.pos.x = Math.floor(arenaWidth / 2) - Math.floor(player.matrix[0].length / 2);

  if (collide(arena, player)) {
    gameOver(); // Game over trigger
  }
}

function updateScore() {

  document.getElementById('scoreBottom').textContent = player.score;
  document.getElementById('lines').textContent = player.lines;
  document.getElementById('highScore').textContent = player.highScore;
  document.getElementById('level').textContent = player.level;

}

function logResizeDebug(availableHeight, availableWidth, maxBlockSizeByHeight, maxBlockSizeByWidth, blockSize, canvasWidth, canvasHeight) {
  console.log("=== resizeCanvas Debug ===");
  console.log("Available Height:", availableHeight);
  console.log("Available Width:", availableWidth);
  console.log("Arena Height:", arenaHeight, "Arena Width:", arenaWidth);
  console.log("Max Block Size by Height:", maxBlockSizeByHeight);
  console.log("Max Block Size by Width:", maxBlockSizeByWidth);
  console.log("Chosen Block Size:", blockSize);
  console.log("Final Canvas Width:", canvasWidth);
  console.log("Final Canvas Height:", canvasHeight);
  console.log("===========================");
}
function gameOver() {
  isPaused = true;
  isGameOver = true;
  document.querySelector('.pause-label').textContent = 'GAME OVER';
  document.getElementById('pauseOverlay').style.display = 'flex';
}

function rotate(matrix, dir) {
  for (let y = 0; y < matrix.length; ++y) {
    for (let x = 0; x < y; ++x) {
      [matrix[x][y], matrix[y][x]] = [matrix[y][x], matrix[x][y]];
    }
  }
  dir > 0 ? matrix.forEach(row => row.reverse()) : matrix.reverse();
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

document.addEventListener('keydown', e => {
  if (e.key === 'ArrowLeft') {
    player.pos.x--;
    if (collide(arena, player)) player.pos.x++;
  } else if (e.key === 'ArrowRight') {
    player.pos.x++;
    if (collide(arena, player)) player.pos.x--;
  } else if (e.key === 'ArrowDown') {
    playerDrop();
  } else if (e.key === 'ArrowUp') {
    playerRotate(1);
  }
});

document.getElementById('leftBtn').onclick = () => { player.pos.x--; if (collide(arena, player)) player.pos.x++; };
document.getElementById('rightBtn').onclick = () => { player.pos.x++; if (collide(arena, player)) player.pos.x--; };
document.getElementById('downBtn').onclick = () => { playerDrop(); };
document.getElementById('rotateBtn').onclick = () => { playerRotate(1); };

document.getElementById('resetBtn').onclick = () => {
  arena.forEach(row => row.fill(0));
  player.score = 0;
  player.lines = 0;
  player.level = 0;
  player.highScore = Number(localStorage.getItem('highScore')) || 0;
  dropInterval = 1000;
  isPaused = false;
  isGameOver = false;
  document.querySelector('.pause-label').textContent = 'PAUSED';
  document.getElementById('pauseOverlay').style.display = 'none';
  updateScore();
  playerReset();
};

resizeCanvas();
playerReset();
updateScore();
update();
document.getElementById('pauseOverlay').style.display = 'none';