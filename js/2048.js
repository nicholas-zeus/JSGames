// js/2048.js — One-viewport layout (no fullscreen), with coin rewards/undo
import { Coins } from './coins.js';
Coins.init({ ui: true, source: '2048' });

/* =========================================================
   One-viewport sizing
   - Sets --header-h to the real sticky header height
   - Computes the square board side from the game shell's free space
   - Updates --board-size so CSS can size .gameboard precisely
   - Debounced on resize/orientation; also observes header/shell changes
   ========================================================= */

(function viewportSizing() {
  const root = document.documentElement;

  // Debounce helper
  const debounce = (fn, t = 80) => {
    let id;
    return (...args) => { clearTimeout(id); id = setTimeout(() => fn(...args), t); };
  };

  // Parse CSS px variable (fallback to number)
  function readPxVar(name, fallback) {
    const v = getComputedStyle(root).getPropertyValue(name).trim();
    if (!v) return fallback;
    const m = v.match(/([0-9.]+)/);
    return m ? parseFloat(m[1]) : fallback;
  }

  function setHeaderVar() {
    const header = document.querySelector('.site-header');
    // Account for any safe-area padding applied in CSS
    const h = header ? header.offsetHeight : 0;
    root.style.setProperty('--header-h', `${h}px`);
    return h;
  }

  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

  function sizeBoard() {
    const shell = document.getElementById('gameShell');
    const score = document.querySelector('.score_card');
    const controls = document.querySelector('.controls_game');
    if (!shell) return;

    // Ensure header var is fresh (fonts/layout may shift)
    const headerH = setHeaderVar();

    // Shell inner size
    const shellRect = shell.getBoundingClientRect();
    const shellW = Math.floor(shellRect.width);
    const shellH = Math.floor(shellRect.height);

    // Vertical UI stack (score + controls + shell gap(s))
    const gap = parseFloat(getComputedStyle(shell).gap) || 12;
    const scoreH = score ? score.offsetHeight : 0;
    const controlsH = controls ? controls.offsetHeight : 0;

    // Two gaps around the board in the vertical stack (score | gap | board | gap | controls)
    const uiStack = scoreH + controlsH + gap * 2;

    // Available square side: min(available width, available height after UI)
    const freeH = shellH - uiStack;
    let side = Math.min(shellW, freeH);

    // Respect base cap to avoid upscaling blur, and a sensible minimum
    const baseCap = readPxVar('--board-base', 500);      // from 2048.css :root
    side = Math.min(side, baseCap);
    side = clamp(side, 220, 9999); // minimum usable size; adjust if you prefer

    root.style.setProperty('--board-size', `${Math.floor(side)}px`);

    // Optional: nudge coin toasts if viewport is short so they don't overlap header
    // (kept simple; adjust if you re-parent toasts into #gameShell later)
    const toast = document.querySelector('.coin-toasts');
    if (toast) {
      if (shellH < 560 || window.matchMedia('(max-height: 560px)').matches) {
        toast.style.top = '14vh';
      } else {
        toast.style.top = '18vh';
      }
    }
  }

  const recalc = debounce(() => {
    // Recalculate in two frames to let fonts/layout settle during rotations
    requestAnimationFrame(() => {
      sizeBoard();
      requestAnimationFrame(sizeBoard);
    });
  }, 80);

  // Run after DOM is ready
  document.addEventListener('DOMContentLoaded', () => {
    // Initial measure
    recalc();

    // Recompute on resize & orientation changes
    window.addEventListener('resize', recalc, { passive: true });
    window.addEventListener('orientationchange', recalc);

    // Observe header & shell for intrinsic size changes (fonts, UI changes)
    const header = document.querySelector('.site-header');
    const shell = document.getElementById('gameShell');
    const ro = new ResizeObserver(recalc);
    header && ro.observe(header);
    shell && ro.observe(shell);
  });
})();

/* =========================================================
   Game bootstrap
   ========================================================= */

function gameStart() {
  window.game = new Game(4);
  if (!window.game.loadState()) {
    window.game.initialize();
    window.game.saveState();
  } else {
    window.game.initEventListeners();
    window.game.isGameOver();
  }
}
$(document).ready(gameStart);

/* ---------------- Game ---------------- */
function Game(size) {
  this.rows = size;
  this.columns = size;
  this.board = [];
  this.boardFlatten = function () { return _.flatten(this.board); };
  this.score = 0;

  this.highScoreKey = "2048_highScore";
  this.stateKey = "2048_gameState";
  this.highScore = parseInt(localStorage.getItem(this.highScoreKey)) || 0;

  $('[data-js="score"]').html(this.score.toString());
  $('[data-js="highScore"]').html(this.highScore.toString());

  this.moveInProgress = false;
}

/* Init */
Game.prototype.initialize = function () {
  $(".grid").empty();
  $(".tile-container").empty();
  this.board = [];
  this.initBoard();
  this.initTile();
  this.initEventListeners();
};

/* Grid */
Game.prototype.initBoard = function () {
  function initGridCell(x, y) {
    var getGridCell = $.parseHTML($("#template_grid_cell").html());
    $(getGridCell).appendTo(".grid");
    return { x: x, y: y, tilesArray: [] };
  }
  for (var x = 0; x < this.rows; x++) {
    var newArray = [];
    this.board.push(newArray);
    for (var y = 0; y < this.columns; y++) {
      var gridObj = initGridCell(x, y);
      newArray.push(gridObj);
    }
  }
};

/* Spawn one tile */
Game.prototype.initTile = function () {
  this.isGameOver();
  var emptyCell = this.getRandomEmptyCell();
  if (!emptyCell) return;
  var tile = new Tile(emptyCell.x, emptyCell.y, this);
  this.isGameOver();
};

/* Listeners */
Game.prototype.initEventListeners = function () {
  var self = this;
  var getGameboard = document.getElementById("touchGameboard");

  window.hammertime && window.hammertime.destroy();
  window.hammertime = new Hammer(getGameboard, {
    recognizers: [[Hammer.Swipe, { direction: Hammer.DIRECTION_ALL }]]
  });

  window.hammertime
    .on("swipeleft", function () { self.move("left"); })
    .on("swiperight", function () { self.move("right"); })
    .on("swipedown", function () { self.move("down"); })
    .on("swipeup", function () { self.move("up"); });

  $(document).off("keydown.move").on("keydown.move", function (event) {
    if ([37,38,39,40].includes(event.which)) event.preventDefault();
    switch (event.which) {
      case 37: self.move("left"); break;
      case 38: self.move("up"); break;
      case 39: self.move("right"); break;
      case 40: self.move("down"); break;
    }
  });

  // New game
  $('[data-js="newGame"]').off("click.newGame").on("click.newGame", function () {
    localStorage.removeItem(self.stateKey);
    gameStart(); // call local function (ESM scope)
  });

  // (Removed) Fullscreen toggle — per new design, no fullscreen mode

  // Undo (costs 50 coins only if a snapshot exists)
  $('[data-js="undo"]').off("click.undo").on("click.undo", async function () {
    const hasSnapshot = !!localStorage.getItem(self.stateKey + "_undo");
    if (!hasSnapshot) { Coins.toast('Nothing to undo.'); return; }

    try {
      const res = await Coins.spend(50, 'Undo move', { source: '2048' });
      if (res?.ok) {
        self.undo();
      } else if (res?.reason === 'insufficient') {
        Coins.toast('Not enough coins (need 50).');
      } else {
        Coins.toast('Could not process coin spend. Please try again.');
      }
    } catch (e) {
      console.warn('Coins.spend failed:', e);
      Coins.toast('Coin system error. Please try again.');
    }
  });
};

/* Win/Lose via toaster */
Game.prototype.gameWon = function () { Coins.toast("You won! 🎉"); };
Game.prototype.gameLost = function () { Coins.toast("Game over!"); };

/* Status */
Game.prototype.isGameOver = function () {
  var gameBoard = this.boardFlatten();
  var is2048 = false, canAnyTileMove = false, hasEmptyCells = false;

  gameBoard.forEach(function (cell) {
    cell.tilesArray.forEach(function (tile) {
      if (tile.valueProp === 2048) is2048 = true;
    });
  });
  if (this.getEmptyCells().length > 0) hasEmptyCells = true;

  gameBoard.forEach(function (cell) {
    cell.tilesArray.forEach(function (tile) {
      tile.moveCheck();
      if (tile.canMove) canAnyTileMove = true;
    });
  });

  if (is2048) return this.gameWon();
  if (!hasEmptyCells && !canAnyTileMove) return this.gameLost();
  return false;
};

Game.prototype.getEmptyCells = function () {
  return _.filter(this.boardFlatten(), function (cell) { return !cell.tilesArray.length; });
};
Game.prototype.getRandomEmptyCell = function () {
  var emptyGridCells = this.getEmptyCells();
  if (!emptyGridCells.length) return null;
  var randomIndex = Math.floor(Math.random() * emptyGridCells.length);
  return emptyGridCells[randomIndex];
};

/* Merge & scoring (with coin rewards) */
Game.prototype.TileMerge = function () {
  var gameBoard = this.boardFlatten();
  var newScore = this.score;

  gameBoard.forEach(function (cell) {
    if (cell.tilesArray.length === 2) {
      var currentValue = cell.tilesArray[0].valueProp;
      var newValue = currentValue * 2;

      // apply merge
      cell.tilesArray[0].value = newValue;
      var x = cell.tilesArray.pop();
      x.el.remove();

      // score increases by the merged value (same as before)
      newScore += currentValue;

      // coin rewards per newly created tile
      if (newValue === 512) {
        Coins.add(10, 'Created 512 tile', { source: '2048' });
      } else if (newValue === 1024) {
        Coins.add(20, 'Created 1024 tile', { source: '2048' });
      } else if (newValue === 2048) {
        Coins.add(100, 'Created 2048 tile', { source: '2048' });
      }
    }
  });

  this.score = newScore;
  $('[data-js="score"]').html(this.score.toString());

  if (this.score > this.highScore) {
    this.highScore = this.score;
    localStorage.setItem(this.highScoreKey, this.highScore);
    $('[data-js="highScore"]').html(this.highScore.toString());
  }
};

/* Animations + post-move */
Game.prototype.moveAnimations = function (gameBoard) {
  var self = this;
  var promiseArray = [];

  if (this.moveInProgress) return false;
  this.moveInProgress = true;

  gameBoard.forEach(function (cell) {
    cell.tilesArray.forEach(function (tile) {
      promiseArray.push(tile.animatePosition());
    });
  });

  $.when.apply($, promiseArray).then(function () {
    self.moveInProgress = false;
    self.TileMerge();
    self.initTile();
    self.saveState();
  });

  if (promiseArray.length === 0) {
    self.moveInProgress = false;
    self.TileMerge();
    self.initTile();
    self.saveState();
  }
};

/* ----- UNDO helpers ----- */
Game.prototype.getMatrix = function () {
  var matrix = [];
  for (var x = 0; x < this.rows; x++) {
    var row = [];
    for (var y = 0; y < this.columns; y++) {
      var cell = this.board[x][y];
      row.push(cell.tilesArray.length ? cell.tilesArray[0].valueProp : 0);
    }
    matrix.push(row);
  }
  return matrix;
};
Game.prototype.saveUndoState = function () {
  try {
    var undo = {
      rows: this.rows,
      columns: this.columns,
      board: this.getMatrix(),
      score: this.score,
      highScore: this.highScore
    };
    localStorage.setItem(this.stateKey + "_undo", JSON.stringify(undo));
  } catch (e) { console.warn("Failed to save undo state:", e); }
};
Game.prototype.clearUndo = function () { localStorage.removeItem(this.stateKey + "_undo"); };
Game.prototype.undo = function () {
  try {
    var saved = localStorage.getItem(this.stateKey + "_undo");
    if (!saved) return;

    var state = JSON.parse(saved);
    $(".grid").empty();
    $(".tile-container").empty();
    this.board = [];
    this.initBoard();

    for (var x = 0; x < state.rows; x++) {
      for (var y = 0; y < state.columns; y++) {
        var value = state.board[x][y];
        if (value > 0) {
          var t = new Tile(x, y, this);
          t.value = value;
        }
      }
    }
    this.score = state.score || 0;
    this.highScore = Math.max(this.highScore, state.highScore || 0);
    $('[data-js="score"]').html(this.score.toString());
    $('[data-js="highScore"]').html(this.highScore.toString());

    this.moveInProgress = false;
    this.saveState();
    this.clearUndo();
  } catch (e) { console.warn("Failed to undo:", e); }
};

/* Movement */
Game.prototype.move = function (getDirection) {
  var gameBoard;
  var direction = getDirection.toLowerCase();
  var hasAnyTileMoved = false;
  var undoSaved = false;

  if (this.moveInProgress) return false;

  if (direction === "up") {
    gameBoard = _.orderBy(this.boardFlatten(), "y", "asc");
  } else if (direction === "right") {
    gameBoard = _.orderBy(this.boardFlatten(), "x", "desc");
  } else if (direction === "down") {
    gameBoard = _.orderBy(this.boardFlatten(), "y", "desc");
  } else if (direction === "left") {
    gameBoard = _.orderBy(this.boardFlatten(), "y", "asc");
  } else { return false; }

  gameBoard.forEach(function (cell) {
    cell.tilesArray.forEach(function (tile) {
      if (tile.move(direction, true)) {
        if (!undoSaved) { tile.game.saveUndoState(); undoSaved = true; }
        hasAnyTileMoved = true;
        tile.move(direction);
      }
    });
  });

  if (hasAnyTileMoved) this.moveAnimations(gameBoard);
};

/* ---- Save / Load ---- */
Game.prototype.saveState = function () {
  try {
    var matrix = [];
    for (var x = 0; x < this.rows; x++) {
      var row = [];
      for (var y = 0; y < this.columns; y++) {
        var cell = this.board[x][y];
        row.push(cell.tilesArray.length ? cell.tilesArray[0].valueProp : 0);
      }
      matrix.push(row);
    }
    var state = { rows: this.rows, columns: this.columns, board: matrix, score: this.score, highScore: this.highScore };
    localStorage.setItem(this.stateKey, JSON.stringify(state));
  } catch (e) { console.warn("Failed to save game state:", e); }
};

Game.prototype.loadState = function () {
  try {
    var saved = localStorage.getItem(this.stateKey);
    if (!saved) return false;

    var state = JSON.parse(saved);
    if (!state || !Array.isArray(state.board)) return false;

    $(".grid").empty();
    $(".tile-container").empty();
    this.board = [];
    this.initBoard();

    for (var x = 0; x < state.rows; x++) {
      for (var y = 0; y < state.columns; y++) {
        var value = state.board[x][y];
        if (value > 0) {
          var t = new Tile(x, y, this);
          t.value = value;
        }
      }
    }
    this.score = state.score || 0;
    this.highScore = state.highScore || (parseInt(localStorage.getItem(this.highScoreKey)) || 0);
    $('[data-js="score"]').html(this.score.toString());
    $('[data-js="highScore"]').html(this.highScore.toString());

    return true;
  } catch (e) {
    console.warn("Failed to load game state:", e);
    return false;
  }
};

/* ---------------- Tile ---------------- */
function Tile(x, y, game) {
  this.game = game;
  this.x = x;
  this.y = y;
  this.valueProp = Math.random() < 0.3 ? 4 : 2;
  this.canMove = false;

  Object.defineProperties(this, {
    value: {
      get: function () { return this.valueProp; },
      set: function (val) {
        this.valueProp = val;
        this.el.find(".tile_number").html(val).attr("data-value", val);
      }
    }
  });

  this.initialize();
}
Tile.prototype.initialize = function () {
  var getTile = $.parseHTML($("#template_tile").html());
  this.el = $(getTile);
  this.el.find(".tile_number").html(this.valueProp).attr("data-value", this.valueProp);
  this.setPosition(this.x, this.y);
  this.animatePosition(true);
  this.el.appendTo(".tile-container");
};
Tile.prototype.setPosition = function (x, y) {
  this.x = x; this.y = y;
  this.game.board[x][y].tilesArray.push(this);
};
Tile.prototype.removeOldPosition = function (x, y) {
  this.game.board[x][y].tilesArray.pop();
};
Tile.prototype.animatePosition = function (initializeFlag) {
  var self = this;
  var fromLeft = this.x * 25 + "%";
  var fromTop = this.y * 25 + "%";
  var animationDuration = 175;
  var getPromise = $.Deferred();

  if (initializeFlag) this.el.addClass("initialize");
  else this.el.removeClass("initialize");

  function resolvePromise() {
    getPromise.resolve();
    self.el.removeClass("animate initialize");
  }
  function setPosition() {
    self.el.addClass("animate");
    self.el.attr({ "data-x": fromLeft, "data-y": fromTop });
  }

  setPosition();
  setTimeout(resolvePromise, initializeFlag ? animationDuration + 50 : animationDuration);
  return getPromise;
};
Tile.prototype.moveCheck = function () {
  return (
    this.move("up", true) ||
    this.move("right", true) ||
    this.move("down", true) ||
    this.move("left", true)
  ) ? (this.canMove = true) : (this.canMove = false);
};
Tile.prototype.move = function (getDirection, checkFlag) {
  checkFlag = !!checkFlag;
  var direction = getDirection.toLowerCase();
  var getX = this.x, getY = this.y;
  var nx = getX, ny = getY;

  if (direction === "up") ny--;
  else if (direction === "down") ny++;
  else if (direction === "left") nx--;
  else if (direction === "right") nx++;

  if (nx < 0 || ny < 0 || nx >= 4 || ny >= 4) return false;

  var getNext = this.game.board[nx][ny];
  var isNextMatch = getNext.tilesArray.length === 1 && getNext.tilesArray[0].valueProp === this.valueProp;
  var isNextEmpty = getNext.tilesArray.length === 0;

  if (checkFlag) return isNextEmpty || isNextMatch;

  if (isNextEmpty || isNextMatch) {
    this.setPosition(nx, ny);
    this.removeOldPosition(getX, getY);
    if (!isNextMatch) this.move(direction);
  }
};
