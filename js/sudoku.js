// js/sudoku.js — Unique-solution Sudoku (4x4, 6x6, 9x9)
// - Generates a solved grid, then removes clues while preserving uniqueness
// - Uses an early-exit solution counter (stops at 2) to test uniqueness
// - Keeps existing UI: hints use the single stored solution; "Check" compares to it

import { Coins } from './coins.js';
Coins.init({ ui: true, source: 'sudoku' });

let solution = [];
let hintCount = 3;
let currentSize = 9;
function sizeBoardSquare() {
  const shell = document.querySelector('.sudoku-shell');
  const board = document.getElementById('board');
  if (!shell || !board) return;

  // Available width inside shell
  const availW = shell.clientWidth - 24;     // small safety padding

  // Available height inside shell below everything above the board
  const shellTop = shell.getBoundingClientRect().top;
  const boardTop = board.getBoundingClientRect().top;
  const usedAbove = boardTop - shellTop;
  const availH = shell.clientHeight - usedAbove - 12; // bottom padding buffer

  // Cap size to keep things tasteful on desktop
  const maxCap = 520;

  const px = Math.max(180, Math.min(availW, availH, maxCap));
  document.documentElement.style.setProperty('--board-px', `${Math.floor(px)}px`);
}


/* ---------------------------- Header-aware sizing (one viewport) ---------------------------- */
function setHeaderVar() {
  const header = document.querySelector('.site-header');
  if (header) {
    document.documentElement.style.setProperty('--header-h', header.offsetHeight + 'px');
  }
}
function debounce(fn, delay = 120) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}
// keep --header-h and --board-px in sync with actual layout
const debouncedHeader = debounce(setHeaderVar, 120);
const debouncedSize = debounce(sizeBoardSquare, 120);

window.addEventListener('resize', () => { debouncedHeader(); debouncedSize(); }, { passive: true });
window.addEventListener('orientationchange', () => {
  // give mobile toolbars/viewport units a moment to settle
  setTimeout(() => { setHeaderVar(); sizeBoardSquare(); }, 300);
});


/* ---------------------------- Utilities ---------------------------- */
const rngInt = (n) => Math.floor(Math.random() * n);
const shuffle = (arr) => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rngInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};
const deepCopy = (grid) => grid.map(row => row.slice());

function getBoxDims(size) {
  // 4x4 -> 2x2, 6x6 -> 2x3, 9x9 -> 3x3
  if (size === 6) return { boxRows: 2, boxCols: 3 };
  const r = Math.floor(Math.sqrt(size));
  return { boxRows: r, boxCols: size / r };
}

/* ---------------------------- Rules ---------------------------- */
function isValid(board, row, col, num, size, boxRows, boxCols) {
  for (let i = 0; i < size; i++) {
    if (board[row][i] == num || board[i][col] == num) return false;
  }
  const boxStartRow = row - (row % boxRows);
  const boxStartCol = col - (col % boxCols);
  for (let r = 0; r < boxRows; r++) {
    for (let c = 0; c < boxCols; c++) {
      if (board[boxStartRow + r][boxStartCol + c] == num) return false;
    }
  }
  return true;
}

/* ---------------------------- Solver (first solution) ---------------------------- */
/** Classic backtracker to produce one full solution (used to create the seed solution). */
function solveBoard(board, size, boxRows, boxCols) {
  // Find first empty cell
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (board[row][col] === '') {
        // Try numbers in random order to vary solutions
        const nums = shuffle([...Array(size)].map((_, i) => i + 1));
        for (let k = 0; k < nums.length; k++) {
          const num = nums[k];
          if (isValid(board, row, col, num, size, boxRows, boxCols)) {
            board[row][col] = num;
            if (solveBoard(board, size, boxRows, boxCols)) return true;
            board[row][col] = '';
          }
        }
        return false;
      }
    }
  }
  return true; // solved
}

/* ---------------------------- Solution counter (early exit at 2) ---------------------------- */
/**
 * Counts how many solutions a partially-filled puzzle has, up to `limit` (default 2).
 * Returns 0, 1, or >=2 (never counts past the limit; fast).
 */
function countSolutions(board, size, boxRows, boxCols, limit = 2) {
  let count = 0;

  function backtrack() {
    if (count >= limit) return; // early exit

    // Find the next empty cell using a simple MRV-ish approach:
    // pick the empty with fewest legal candidates to speed up search.
    let bestR = -1, bestC = -1, bestOpts = null;

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (board[r][c] === '') {
          const opts = [];
          for (let n = 1; n <= size; n++) {
            if (isValid(board, r, c, n, size, boxRows, boxCols)) opts.push(n);
          }
          if (opts.length === 0) return; // dead end
          if (bestOpts === null || opts.length < bestOpts.length) {
            bestOpts = opts;
            bestR = r; bestC = c;
            if (opts.length === 1) break; // cannot do better for MRV
          }
        }
      }
      if (bestOpts && bestOpts.length === 1) break;
    }

    if (bestOpts === null) {
      // no empty cells -> a solution found
      count++;
      return;
    }

    // Try candidates (shuffled) and backtrack
    shuffle(bestOpts);
    for (let i = 0; i < bestOpts.length && count < limit; i++) {
      const n = bestOpts[i];
      board[bestR][bestC] = n;
      backtrack();
      board[bestR][bestC] = '';
    }
  }

  backtrack();
  return count;
}

/* ---------------------------- Puzzle generation (unique) ---------------------------- */
function generateSolvedGrid(size) {
  const { boxRows, boxCols } = getBoxDims(size);
  const board = Array.from({ length: size }, () => Array(size).fill(''));

  // Optionally seed a few valid random entries to diversify solutions
  const seeds = Math.min(size, 6);
  for (let i = 0; i < seeds; i++) {
    const row = rngInt(size), col = rngInt(size);
    if (board[row][col] === '') {
      const nums = shuffle([...Array(size)].map((_, k) => k + 1));
      for (let n of nums) {
        if (isValid(board, row, col, n, size, boxRows, boxCols)) {
          board[row][col] = n;
          break;
        }
      }
    }
  }

  if (!solveBoard(board, size, boxRows, boxCols)) {
    // Fallback: if seeding failed, brute-force from empty
    for (let r = 0; r < size; r++) board[r].fill('');
    solveBoard(board, size, boxRows, boxCols);
  }
  return board;
}

function generateUniquePuzzle(size) {
  const { boxRows, boxCols } = getBoxDims(size);

  // 1) Build a full valid solution
  const full = generateSolvedGrid(size);
  solution = deepCopy(full); // store as the single true solution

  // 2) Start removing clues while preserving uniqueness
  const puzzle = deepCopy(full);

  // Removal order: try symmetric pairs (r,c) and (size-1-r, size-1-c) for aesthetics
  const positions = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) positions.push({ r, c });
  }
  shuffle(positions);

  // Target blanks: similar to your previous ~60%, but limited by uniqueness feasibility
  const targetBlanks = Math.floor(size * size * 0.6);
  let blanks = 0;

  const seen = new Set();
  const key = (r, c) => `${r},${c}`;

  for (let i = 0; i < positions.length && blanks < targetBlanks; i++) {
    const { r, c } = positions[i];
    if (puzzle[r][c] === '') continue; // already blank

    // Pair index for symmetry
    const pr = size - 1 - r;
    const pc = size - 1 - c;
    const pairDifferent = (pr !== r || pc !== c);

    // Skip if we've already tried this cell or its symmetric partner
    if (seen.has(key(r, c)) || (pairDifferent && seen.has(key(pr, pc)))) continue;

    // Try removing this cell (and its pair if different)
    const removed = [];
    const tryRemove = (rr, cc) => {
      if (puzzle[rr][cc] !== '') {
        removed.push([rr, cc, puzzle[rr][cc]]);
        puzzle[rr][cc] = '';
      }
    };
    tryRemove(r, c);
    if (pairDifferent) tryRemove(pr, pc);

    // Uniqueness test
    const test = deepCopy(puzzle);
    const solCount = countSolutions(test, size, boxRows, boxCols, 2);

    if (solCount >= 2) {
      // Revert; this removal would make puzzle ambiguous
      for (const [rr, cc, val] of removed) puzzle[rr][cc] = val;
      // Mark as seen to avoid retry
      seen.add(key(r, c));
      if (pairDifferent) seen.add(key(pr, pc));
    } else {
      blanks += removed.length;
      // Keep these blanks; mark as seen
      seen.add(key(r, c));
      if (pairDifferent) seen.add(key(pr, pc));
    }
  }

  return puzzle;
}

/* ---------------------------- Rendering / State ---------------------------- */
function renderBoard(grid) {
  const boardEl = document.getElementById('board');
  boardEl.innerHTML = '';

  const size = grid.length;
  const { boxRows, boxCols } = getBoxDims(size);

  // Make a size-appropriate CSS grid
  boardEl.style.gridTemplateColumns = `repeat(${size}, 1fr)`;

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const input = document.createElement('input');
      input.type = 'tel';                  // mobile numpad
      input.className = 'cell';
      input.dataset.row = r;
      input.dataset.col = c;
      input.inputMode = 'numeric';
      input.autocomplete = 'off';
      input.maxLength = 2;                 // supports 10+ for larger sizes

      // Apply subgrid borders:
      // - Top border at every boxRows boundary except first row
      // - Left border at every boxCols boundary except first col
      if (r !== 0 && r % boxRows === 0) {
        input.classList.add('subgrid-border-top');
      }
      if (c !== 0 && c % boxCols === 0) {
        input.classList.add('subgrid-border-left');
      }

      // Prefill given clues
      const val = grid[r][c];
      if (val) {
        input.value = val;
        input.readOnly = true;
        input.setAttribute('aria-readonly', 'true');
      } else {
        input.setAttribute('aria-readonly', 'false');
      }

      // Optional: restrict keystrokes to 1..size (soft guard; hard guard can be added on input events)
      input.addEventListener('beforeinput', (e) => {
        if (e.data && !/^\d$/.test(e.data)) e.preventDefault();
      });

      boardEl.appendChild(input);
    }
  }
}

function saveGameState(puzzle, solutionIn, hintCountIn, size) {
  localStorage.setItem('sudokuPuzzle', JSON.stringify(puzzle));
  localStorage.setItem('sudokuSolution', JSON.stringify(solutionIn));
  localStorage.setItem('sudokuHintCount', String(hintCountIn));
  localStorage.setItem('sudokuDifficulty', String(size));
}

function getCurrentPuzzle() {
  const size = currentSize;
  const puzzle = Array.from({ length: size }, () => Array(size).fill(''));
  document.querySelectorAll('.cell').forEach(cell => {
    const r = parseInt(cell.dataset.row, 10);
    const c = parseInt(cell.dataset.col, 10);
    puzzle[r][c] = cell.value || '';
  });
  return puzzle;
}

/* ---------------------------- Game loop (new / load / hint / check) ---------------------------- */
function newGame() {
  localStorage.removeItem('sudokuPuzzle');
  localStorage.removeItem('sudokuSolution');
  localStorage.removeItem('sudokuHintCount');
  localStorage.removeItem('sudokuDifficulty');
  startGame();
}

function startGame() {
  currentSize = parseInt(document.getElementById('difficulty').value, 10);
  hintCount = 3;
  document.getElementById('hintCount').textContent = hintCount;

  const puzzle = generateUniquePuzzle(currentSize);
  renderBoard(puzzle);

  // ensure the board fits after it's in the DOM
  sizeBoardSquare();

  saveGameState(puzzle, solution, hintCount, currentSize);
}


function giveHint() {
  if (hintCount === 0) return Coins.toast('No hints left!');
  const cells = document.querySelectorAll('.cell');
  const blanks = [];
  cells.forEach(cell => {
    if (!cell.readOnly && !cell.value) blanks.push(cell);
  });
  if (blanks.length === 0) return;

  const cell = blanks[rngInt(blanks.length)];
  const r = parseInt(cell.dataset.row, 10);
  const c = parseInt(cell.dataset.col, 10);
  cell.value = solution[r][c];
  cell.classList.add('highlight');
  setTimeout(() => cell.classList.remove('highlight'), 1000);

  hintCount--;
  document.getElementById('hintCount').textContent = hintCount;

  const puzzle = getCurrentPuzzle();
  saveGameState(puzzle, solution, hintCount, currentSize);
}

function checkBoard() {
  const cells = document.querySelectorAll('.cell');
  let allCorrect = true;

  cells.forEach(cell => {
    const r = parseInt(cell.dataset.row, 10);
    const c = parseInt(cell.dataset.col, 10);
    if (!cell.readOnly && cell.value != solution[r][c]) {
      cell.style.background = '#ffcccc';
      allCorrect = false;
    } else if (!cell.readOnly) {
      cell.style.background = '#ccffcc';
    }
  });

  const puzzle = getCurrentPuzzle();
  saveGameState(puzzle, solution, hintCount, currentSize);

  if (allCorrect) Coins.toast('🎉 All entries are correct!');
}

/* ---------------------------- Save/load (with uniqueness migration) ---------------------------- */
function loadSavedGame() {
  const savedPuzzle = JSON.parse(localStorage.getItem('sudokuPuzzle') || 'null');
  const savedSolution = JSON.parse(localStorage.getItem('sudokuSolution') || 'null');
  const savedHintCount = parseInt(localStorage.getItem('sudokuHintCount') || 'NaN', 10);
  const savedDifficulty = parseInt(localStorage.getItem('sudokuDifficulty') || 'NaN', 10);

  if (!savedPuzzle || !savedSolution || isNaN(savedHintCount)) return false;

  // Migration guard: if old saved puzzle wasn’t uniqueness-checked, verify it now.
  const size = Array.isArray(savedPuzzle) ? savedPuzzle.length : 0;
  if (size !== 4 && size !== 6 && size !== 9) return false;

  const { boxRows, boxCols } = getBoxDims(size);
  const test = deepCopy(savedPuzzle);
  const solCount = countSolutions(test, size, boxRows, boxCols, 2);

  if (solCount >= 2) {
    // Non-unique saved puzzle; regenerate a fresh unique one for a fair game.
    Coins.toast('Loaded puzzle wasn’t unique—created a fresh one.');
    return false;
  }

  // Restore saved state
  solution = savedSolution;
  hintCount = savedHintCount;
  currentSize = savedDifficulty || size;

  document.getElementById('difficulty').value = String(currentSize);
  document.getElementById('hintCount').textContent = hintCount;

  renderBoard(savedPuzzle);
  return true;
}

/* ---------------------------- Wire UI ---------------------------- */
document.addEventListener('DOMContentLoaded', () => {
  // set header size and initial board size before anything else
  setHeaderVar();
  sizeBoardSquare();

  document.getElementById('btnNewGame').addEventListener('click', newGame);
  document.getElementById('btnHint').addEventListener('click', giveHint);
  document.getElementById('btnCheck').addEventListener('click', checkBoard);
  document.getElementById('difficulty').addEventListener('change', startGame);

  if (!loadSavedGame()) {
    startGame();
  } else {
    // loaded an existing board: make sure it fits current viewport
    sizeBoardSquare();
  }
});

