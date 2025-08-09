function gameStart() {
  window.game = new Game(4);
  window.game.initialize();
}
$(document).ready(gameStart);

/*
 * Game Board
 */
function Game(size) {
  this.rows = size;
  this.columns = size;
  this.board = [];
  this.boardFlatten = function () {
    return _.flatten(this.board);
  };
  this.score = 0;

  // High score
  this.highScoreKey = "2048_highScore";
  this.highScore = parseInt(localStorage.getItem(this.highScoreKey)) || 0;

  // Set both scores
  $('[data-js="score"]').html(this.score.toString());
  $('[data-js="highScore"]').html(this.highScore.toString());

  this.moveInProgress = false;
}


/**
 * Run all initializations
 */
Game.prototype.initialize = function () {
  $(".grid").empty();
  $(".tile-container").empty();
  this.initBoard();
  this.initTile();
  this.initEventListeners();
};

/**
 * Initialize grid
 */
Game.prototype.initBoard = function () {
  function initGridCell(x, y) {
    var getGridCell = $.parseHTML($("#template_grid_cell").html());
    $(getGridCell).appendTo(".grid");
    return {
      x: x,
      y: y,
      tilesArray: []
    };
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

/**
 * Initialize tiles
 */
Game.prototype.initTile = function () {
  this.isGameOver();
  var emptyCell = this.getRandomEmptyCell();
  var tile = new Tile(emptyCell.x, emptyCell.y, this);
  this.isGameOver();
};

/**
 * Set event listeners
 */
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

  $(document)
    .off("keydown.move")
    .on("keydown.move", function (event) {
      event.preventDefault();
      switch (event.which) {
        case 37: self.move("left"); break;
        case 38: self.move("up"); break;
        case 39: self.move("right"); break;
        case 40: self.move("down"); break;
      }
    });

  $('[data-js="newGame"]')
    .off("click.newGame")
    .on("click.newGame", window.gameStart);

  // ✅ Fullscreen toggle
  $('[data-js="fullscreenToggle"]').off("click.fullscreen").on("click.fullscreen", function () {
    const shell = document.getElementById("gameShell");

    if (!document.fullscreenElement) {
      shell.requestFullscreen().catch(err => {
        console.error(`Error attempting fullscreen: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  });
};


/**
 * Game is WON!
 */
Game.prototype.gameWon = function () {
  alert("you won");
};

/**
 * Game is LOST!
 */
Game.prototype.gameLost = function () {
  alert("what a loser!");
};

/**
 * Check if game over
 */
Game.prototype.isGameOver = function () {
  var gameBoard = this.boardFlatten();
  var is2048 = false;
  var canAnyTileMove = false;
  var hasEmptyCells = false;

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
  return _.filter(this.boardFlatten(), function (cell) {
    return !cell.tilesArray.length;
  });
};

Game.prototype.getRandomEmptyCell = function () {
  var emptyGridCells = this.getEmptyCells();
  var randomIndex = Math.floor(Math.random() * emptyGridCells.length);
  return emptyGridCells[randomIndex];
};

Game.prototype.TileMerge = function () {
  var gameBoard = this.boardFlatten();
  var newScore = this.score;

  gameBoard.forEach(function (cell) {
    if (cell.tilesArray.length === 2) {
      var currentValue = cell.tilesArray[0].valueProp;
      cell.tilesArray[0].value = currentValue * 2;
      var x = cell.tilesArray.pop();
      x.el.remove();
      newScore += currentValue;
    }
  });

  this.score = newScore;
  $('[data-js="score"]').html(this.score.toString());

  // ✅ High score check & update
  if (this.score > this.highScore) {
    this.highScore = this.score;
    localStorage.setItem(this.highScoreKey, this.highScore);
    $('[data-js="highScore"]').html(this.highScore.toString());
  }
};


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
  });

  if (promiseArray.length === 0) {
    self.moveInProgress = false;
    self.TileMerge();
    self.initTile();
  }
};

Game.prototype.move = function (getDirection) {
  var gameBoard;
  var direction = getDirection.toLowerCase();
  var hasAnyTileMoved = false;

  if (this.moveInProgress) return false;

  if (direction === "up") {
    gameBoard = _.orderBy(this.boardFlatten(), "y", "asc");
  } else if (direction === "right") {
    gameBoard = _.orderBy(this.boardFlatten(), "x", "desc");
  } else if (direction === "down") {
    gameBoard = _.orderBy(this.boardFlatten(), "y", "desc");
  } else if (direction === "left") {
    gameBoard = _.orderBy(this.boardFlatten(), "y", "asc");
  }

  gameBoard.forEach(function (cell) {
    cell.tilesArray.forEach(function (tile) {
      if (tile.move(direction, true)) {
        hasAnyTileMoved = true;
        tile.move(direction);
      }
    });
  });

  if (hasAnyTileMoved) this.moveAnimations(gameBoard);
};

/*
 * Tile
 */
function Tile(x, y, game) {
  this.game = game;
  this.x = x;
  this.y = y;
  this.valueProp = Math.random() < 0.3 ? 4 : 2;
  this.canMove = false;

  Object.defineProperties(this, {
    value: {
      get: function () {
        return this.valueProp;
      },
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
  this.x = x;
  this.y = y;
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

  if (initializeFlag) {
    this.el.addClass("initialize");
  } else {
    this.el.removeClass("initialize");
  }

  function resolvePromise() {
    getPromise.resolve();
    self.el.removeClass("animate initialize");
  }

  function setPosition() {
    self.el.addClass("animate");
    self.el.attr({
      "data-x": fromLeft,
      "data-y": fromTop
    });
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
  var getX = this.x;
  var getY = this.y;

  var nx = getX, ny = getY;

  if (direction === "up") ny--;
  else if (direction === "down") ny++;
  else if (direction === "left") nx--;
  else if (direction === "right") nx++;

  if (nx < 0 || ny < 0 || nx >= 4 || ny >= 4) return false;

  var getNext = this.game.board[nx][ny];
  var isNextMatch = getNext.tilesArray.length === 1 &&
                    getNext.tilesArray[0].valueProp === this.valueProp;
  var isNextEmpty = getNext.tilesArray.length === 0;

  if (checkFlag) return isNextEmpty || isNextMatch;

  if (isNextEmpty || isNextMatch) {
    this.setPosition(nx, ny);
    this.removeOldPosition(getX, getY);
    if (!isNextMatch) this.move(direction);
  }
};