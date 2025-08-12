// js/sudoku.js — Clean ESM version with toasts
import { Coins } from './coins.js';
Coins.init({ ui: true, source: 'sudoku' });

let solution = [];
let hintCount = 3;
let currentSize = 9;

function isValid(board, row, col, num, size, boxRows, boxCols) {
  for (let i = 0; i < size; i++) {
    if (board[row][i] == num || board[i][col] == num) return false;
  }
  const boxStartRow = row - row % boxRows;
  const boxStartCol = col - col % boxCols;
  for (let r = 0; r < boxRows; r++) {
    for (let c = 0; c < boxCols; c++) {
      if (board[boxStartRow + r][boxStartCol + c] == num) return false;
    }
  }
  return true;
}

function solveBoard(board, size, boxRows, boxCols) {
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (board[row][col] === '') {
        for (let num = 1; num <= size; num++) {
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
  return true;
}

function generateSudoku(size) {
  const board = Array(size).fill().map(() => Array(size).fill(''));
  const boxRows = size === 6 ? 2 : Math.floor(Math.sqrt(size));
  const boxCols = size / boxRows;

  for (let i = 0; i < size; i++) {
    const row = Math.floor(Math.random() * size);
    const col = Math.floor(Math.random() * size);
    const num = Math.floor(Math.random() * size) + 1;
    if (isValid(board, row, col, num, size, boxRows, boxCols)) {
      board[row][col] = num;
    }
  }

  solveBoard(board, size, boxRows, boxCols);
  solution = board.map(row => row.slice());

  const puzzle = board.map(row => row.slice());
  const blanks = Math.floor(size * size * 0.6);
  let removed = 0;
  while (removed < blanks) {
    const r = Math.floor(Math.random() * size);
    const c = Math.floor(Math.random() * size);
    if (puzzle[r][c] !== '') {
      puzzle[r][c] = '';
      removed++;
    }
  }
  return puzzle;
}

function renderBoard(grid) {
  const boardEl = document.getElementById('board');
  boardEl.innerHTML = '';
  const size = grid.length;
  boardEl.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const input = document.createElement('input');
      input.type = 'tel'; // mobile numpad
      input.className = 'cell';
      input.dataset.row = r;
      input.dataset.col = c;
      input.maxLength = 2;
      if (grid[r][c]) {
        input.value = grid[r][c];
        input.readOnly = true;
      }
      boardEl.appendChild(input);
    }
  }
}

function saveGameState(puzzle, solutionIn, hintCountIn, size) {
  localStorage.setItem('sudokuPuzzle', JSON.stringify(puzzle));
  localStorage.setItem('sudokuSolution', JSON.stringify(solutionIn));
  localStorage.setItem('sudokuHintCount', hintCountIn);
  localStorage.setItem('sudokuDifficulty', size);
}

function loadSavedGame() {
  const savedPuzzle = JSON.parse(localStorage.getItem('sudokuPuzzle'));
  const savedSolution = JSON.parse(localStorage.getItem('sudokuSolution'));
  const savedHintCount = parseInt(localStorage.getItem('sudokuHintCount'));
  const savedDifficulty = parseInt(localStorage.getItem('sudokuDifficulty'));

  if (savedPuzzle && savedSolution && !isNaN(savedHintCount)) {
    solution = savedSolution;
    hintCount = savedHintCount;
    currentSize = savedDifficulty || 9;
    document.getElementById('difficulty').value = currentSize;
    document.getElementById('hintCount').textContent = hintCount;
    renderBoard(savedPuzzle);
    return true;
  }
  return false;
}

function newGame() {
  localStorage.removeItem('sudokuPuzzle');
  localStorage.removeItem('sudokuSolution');
  localStorage.removeItem('sudokuHintCount');
  localStorage.removeItem('sudokuDifficulty');
  startGame();
}

function startGame() {
  currentSize = parseInt(document.getElementById('difficulty').value);
  hintCount = 3;
  document.getElementById('hintCount').textContent = hintCount;
  const puzzle = generateSudoku(currentSize);
  renderBoard(puzzle);
  saveGameState(puzzle, solution, hintCount, currentSize);
}

function giveHint() {
  if (hintCount === 0) return Coins.toast('No hints left!');
  const cells = document.querySelectorAll('.cell');
  let blankCells = [];
  cells.forEach(cell => {
    const r = cell.dataset.row, c = cell.dataset.col;
    if (!cell.readOnly && !cell.value) blankCells.push(cell);
  });
  if (blankCells.length === 0) return;
  const cell = blankCells[Math.floor(Math.random() * blankCells.length)];
  const r = parseInt(cell.dataset.row);
  const c = parseInt(cell.dataset.col);
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
    const r = parseInt(cell.dataset.row);
    const c = parseInt(cell.dataset.col);
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

function getCurrentPuzzle() {
  const size = currentSize;
  const puzzle = Array(size).fill().map(() => Array(size).fill(''));
  document.querySelectorAll('.cell').forEach(cell => {
    const r = parseInt(cell.dataset.row);
    const c = parseInt(cell.dataset.col);
    puzzle[r][c] = cell.value || '';
  });
  return puzzle;
}

/* Wire UI */
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btnNewGame').addEventListener('click', newGame);
  document.getElementById('btnHint').addEventListener('click', giveHint);
  document.getElementById('btnCheck').addEventListener('click', checkBoard);
  document.getElementById('difficulty').addEventListener('change', startGame);
  if (!loadSavedGame()) startGame();
});
