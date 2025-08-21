// tower.js
// Dependencies: THREE r84, TweenLite + EasePack 1.20.x loaded BEFORE this file.
// Gameplay logic unchanged. Only visuals adjusted:
//  - Stage.onResize() uses #game size (not window) for renderer & camera aspect.
//  - After first addBlock(), offset render groups by (-width/2, 0, -depth/2) to center the tower.
//
// Note: camera.lookAt is a function; tweening it is a no-op. Kept to preserve original intent.

console.clear();

function Stage() {
  // container
  this.container = document.getElementById('game');

  // renderer
  this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
this.renderer.setClearColor(0x000000, 0); // transparent

  this.container.appendChild(this.renderer.domElement);

  // scene
  this.scene = new THREE.Scene();

  // camera (final frustum set in onResize)
  var d = 20;
  this._orthoSize = d;
  this.camera = new THREE.OrthographicCamera(-d, d, d, -d, -100, 1000);
  this.camera.position.set(2, 2, 2);
  this.camera.lookAt(new THREE.Vector3(0, 0, 0));

  // lights
  this.light = new THREE.DirectionalLight(0xffffff, 0.5);
  this.light.position.set(0, 499, 0);
  this.scene.add(this.light);

  this.softLight = new THREE.AmbientLight(0xffffff, 0.4);
  this.scene.add(this.softLight);

  // resize (window + fullscreen changes)
  window.addEventListener('resize', this.onResize.bind(this));
  ['fullscreenchange','webkitfullscreenchange','msfullscreenchange'].forEach(evt => {
    document.addEventListener(evt, this.onResize.bind(this), { passive: true });
  });

  this.onResize();
}

Stage.prototype.setCamera = function(y, speed) {
  if (speed === void 0) speed = 0.3;
  TweenLite.to(this.camera.position, speed, { y: y + 4, ease: Power1.easeInOut });
  // Note: camera.lookAt is a method; tweening it does nothing (kept to preserve code)
  TweenLite.to(this.camera.lookAt, speed, { y: y, ease: Power1.easeInOut });
};

Stage.prototype.onResize = function() {
  // Size to the actual #game element so the canvas stays centered in your layout
  const rect = this.container.getBoundingClientRect();
  const w = Math.max(1, Math.floor(rect.width));
  const h = Math.max(1, Math.floor(rect.height));

  this.renderer.setSize(w, h, false);

  // Update orthographic frustum using container aspect
  const aspect = w / h;
  const d = this._orthoSize;
  this.camera.left   = -d * aspect;
  this.camera.right  =  d * aspect;
  this.camera.top    =  d;
  this.camera.bottom = -d;
  this.camera.updateProjectionMatrix();
};

Stage.prototype.render = function() {
  this.renderer.render(this.scene, this.camera);
};

Stage.prototype.add = function(elem) {
  this.scene.add(elem);
};

Stage.prototype.remove = function(elem) {
  this.scene.remove(elem);
};

function Block(block) {
  this.STATES = { ACTIVE: 'active', STOPPED: 'stopped', MISSED: 'missed' };
  this.MOVE_AMOUNT = 12;

  this.dimension = { width: 0, height: 0, depth: 0 };
  this.position = { x: 0, y: 0, z: 0 };

  this.mesh = null;
  this.state = '';
  this.index = 0;
  this.speed = 0;
  this.direction = 0;
  this.colorOffset = 0;
  this.color = 0;
  this.material = null;

  this.workingPlane = '';
  this.workingDimension = '';

  this.targetBlock = block || null;

  // size/position
  this.index = (this.targetBlock ? this.targetBlock.index : 0) + 1;
  this.workingPlane = this.index % 2 ? 'x' : 'z';
  this.workingDimension = this.index % 2 ? 'width' : 'depth';

  this.dimension.width  = this.targetBlock ? this.targetBlock.dimension.width  : 10;
  this.dimension.height = this.targetBlock ? this.targetBlock.dimension.height : 2;
  this.dimension.depth  = this.targetBlock ? this.targetBlock.dimension.depth  : 10;

  this.position.x = this.targetBlock ? this.targetBlock.position.x : 0;
  this.position.y = this.dimension.height * this.index;
  this.position.z = this.targetBlock ? this.targetBlock.position.z : 0;

  this.colorOffset = this.targetBlock ? this.targetBlock.colorOffset : Math.round(Math.random() * 100);

  // color
  if (!this.targetBlock) {
    this.color = 0x333344;
  } else {
    var offset = this.index + this.colorOffset;
    var r = Math.sin(0.3 * offset) * 55 + 200;
    var g = Math.sin(0.3 * offset + 2) * 55 + 200;
    var b = Math.sin(0.3 * offset + 4) * 55 + 200;
    this.color = new THREE.Color(r / 255, g / 255, b / 255);
  }

  // state
  this.state = this.index > 1 ? this.STATES.ACTIVE : this.STATES.STOPPED;

  // direction
  this.speed = -0.1 - (this.index * 0.005);
  if (this.speed < -4) this.speed = -4;
  this.direction = this.speed;

  // create mesh (local origin at cube corner)
  var geometry = new THREE.BoxGeometry(this.dimension.width, this.dimension.height, this.dimension.depth);
  geometry.applyMatrix(new THREE.Matrix4().makeTranslation(this.dimension.width / 2, this.dimension.height / 2, this.dimension.depth / 2));
  this.material = new THREE.MeshToonMaterial({ color: this.color, shading: THREE.FlatShading });
  this.mesh = new THREE.Mesh(geometry, this.material);
  this.mesh.position.set(this.position.x, this.position.y, this.position.z);

  if (this.state == this.STATES.ACTIVE) {
    this.position[this.workingPlane] = Math.random() > 0.5 ? -this.MOVE_AMOUNT : this.MOVE_AMOUNT;
  }
}

Block.prototype.reverseDirection = function() {
  this.direction = this.direction > 0 ? this.speed : Math.abs(this.speed);
};

Block.prototype.place = function() {
  this.state = this.STATES.STOPPED;

  var overlap = this.targetBlock.dimension[this.workingDimension] -
                Math.abs(this.position[this.workingPlane] - this.targetBlock.position[this.workingPlane]);

  var blocksToReturn = { plane: this.workingPlane, direction: this.direction };

  if (this.dimension[this.workingDimension] - overlap < 0.3) {
    overlap = this.dimension[this.workingDimension];
    blocksToReturn.bonus = true;
    this.position.x = this.targetBlock.position.x;
    this.position.z = this.targetBlock.position.z;
    this.dimension.width = this.targetBlock.dimension.width;
    this.dimension.depth = this.targetBlock.dimension.depth;
  }

  if (overlap > 0) {
    var choppedDimensions = { width: this.dimension.width, height: this.dimension.height, depth: this.dimension.depth };
    choppedDimensions[this.workingDimension] -= overlap;
    this.dimension[this.workingDimension] = overlap;

    var placedGeometry = new THREE.BoxGeometry(this.dimension.width, this.dimension.height, this.dimension.depth);
    placedGeometry.applyMatrix(new THREE.Matrix4().makeTranslation(this.dimension.width / 2, this.dimension.height / 2, this.dimension.depth / 2));
    var placedMesh = new THREE.Mesh(placedGeometry, this.material);

    var choppedGeometry = new THREE.BoxGeometry(choppedDimensions.width, choppedDimensions.height, choppedDimensions.depth);
    choppedGeometry.applyMatrix(new THREE.Matrix4().makeTranslation(choppedDimensions.width / 2, choppedDimensions.height / 2, choppedDimensions.depth / 2));
    var choppedMesh = new THREE.Mesh(choppedGeometry, this.material);

    var choppedPosition = { x: this.position.x, y: this.position.y, z: this.position.z };

    if (this.position[this.workingPlane] < this.targetBlock.position[this.workingPlane]) {
      this.position[this.workingPlane] = this.targetBlock.position[this.workingPlane];
    } else {
      choppedPosition[this.workingPlane] += overlap;
    }

    placedMesh.position.set(this.position.x, this.position.y, this.position.z);
    choppedMesh.position.set(choppedPosition.x, choppedPosition.y, choppedPosition.z);

    blocksToReturn.placed = placedMesh;
    if (!blocksToReturn.bonus) blocksToReturn.chopped = choppedMesh;
  } else {
    this.state = this.STATES.MISSED;
  }

  this.dimension[this.workingDimension] = overlap;

  return blocksToReturn;
};

Block.prototype.tick = function() {
  if (this.state == this.STATES.ACTIVE) {
    var value = this.position[this.workingPlane];
    if (value > this.MOVE_AMOUNT || value < -this.MOVE_AMOUNT) this.reverseDirection();
    this.position[this.workingPlane] += this.direction;
    this.mesh.position[this.workingPlane] = this.position[this.workingPlane];
  }
};

function Game() {
  this.STATES = { LOADING: 'loading', PLAYING: 'playing', READY: 'ready', ENDED: 'ended', RESETTING: 'resetting' };
  this.blocks = [];
  this.state = this.STATES.LOADING;

  // groups
  this.newBlocks = null;
  this.placedBlocks = null;
  this.choppedBlocks = null;

  // UI
  this.scoreContainer = null;
  this.mainContainer = null;
  this.startButton = null;
  this.instructions = null;

  this.stage = new Stage();

  this.mainContainer = document.getElementById('container');
  this.scoreContainer = document.getElementById('score');
  this.startButton = document.getElementById('start-button');
  this.instructions = document.getElementById('instructions');
  this.scoreContainer.innerHTML = '0';

  this.newBlocks = new THREE.Group();
  this.placedBlocks = new THREE.Group();
  this.choppedBlocks = new THREE.Group();

  this.stage.add(this.newBlocks);
  this.stage.add(this.placedBlocks);
  this.stage.add(this.choppedBlocks);

  this.addBlock();      // creates the base block at (0,0,0)

  // VISUAL CENTERING (no gameplay change):
  // shift the rendered groups by half a base block so the tower appears centered.
  (function centerScene(game) {
    var base = game.blocks[0];
    var ox = -(base.dimension.width / 2);   // usually -5
    var oz = -(base.dimension.depth / 2);   // usually -5
    [game.newBlocks, game.placedBlocks, game.choppedBlocks].forEach(function (g) {
      g.position.x = ox;
      g.position.z = oz;
    });
  })(this);

  this.tick();

  this.updateState(this.STATES.READY);

  document.addEventListener('keydown', (e) => {
    if (e.keyCode == 32) this.onAction();
  });

  document.addEventListener('click', () => {
    this.onAction();
  });

  document.addEventListener('touchstart', (e) => {
    e.preventDefault();
    // Original behavior kept: don't trigger on touchstart to avoid double-fire on Android.
  });
}

Game.prototype.updateState = function(newState) {
  for (var key in this.STATES) this.mainContainer.classList.remove(this.STATES[key]);
  this.mainContainer.classList.add(newState);
  this.state = newState;
};

Game.prototype.onAction = function() {
  switch (this.state) {
    case this.STATES.READY:
      this.startGame();
      break;
    case this.STATES.PLAYING:
      this.placeBlock();
      break;
    case this.STATES.ENDED:
      this.restartGame();
      break;
  }
};

Game.prototype.startGame = function() {
  if (this.state != this.STATES.PLAYING) {
    this.scoreContainer.innerHTML = '0';
    this.updateState(this.STATES.PLAYING);
    this.addBlock();
  }
};

Game.prototype.restartGame = function() {
  this.updateState(this.STATES.RESETTING);

  var oldBlocks = this.placedBlocks.children.slice(0);
  var removeSpeed = 0.2;
  var delayAmount = 0.02;
  for (var i = 0; i < oldBlocks.length; i++) {
    TweenLite.to(oldBlocks[i].scale, removeSpeed, {
      x: 0, y: 0, z: 0,
      delay: (oldBlocks.length - i) * delayAmount,
      ease: Power1.easeIn,
      onComplete: (function(mesh, group) { return function() { group.remove(mesh); }; })(oldBlocks[i], this.placedBlocks)
    });
    TweenLite.to(oldBlocks[i].rotation, removeSpeed, {
      y: 0.5,
      delay: (oldBlocks.length - i) * delayAmount,
      ease: Power1.easeIn
    });
  }
  var cameraMoveSpeed = removeSpeed * 2 + (oldBlocks.length * delayAmount);
  this.stage.setCamera(2, cameraMoveSpeed);

  var countdown = { value: this.blocks.length - 1 };
  TweenLite.to(countdown, cameraMoveSpeed, { value: 0, onUpdate: () => { this.scoreContainer.innerHTML = String(Math.round(countdown.value)); } });

  this.blocks = this.blocks.slice(0, 1);

  setTimeout(() => { this.startGame(); }, cameraMoveSpeed * 1000);
};

Game.prototype.placeBlock = function() {
  var currentBlock = this.blocks[this.blocks.length - 1];
  var newBlocks = currentBlock.place();
  this.newBlocks.remove(currentBlock.mesh);
  if (newBlocks.placed) this.placedBlocks.add(newBlocks.placed);
  if (newBlocks.chopped) {
    this.choppedBlocks.add(newBlocks.chopped);
    var positionParams = { y: '-=30', ease: Power1.easeIn, onComplete: () => this.choppedBlocks.remove(newBlocks.chopped) };
    var rotateRandomness = 10;
    var rotationParams = {
      delay: 0.05,
      x: newBlocks.plane == 'z' ? ((Math.random() * rotateRandomness) - (rotateRandomness / 2)) : 0.1,
      z: newBlocks.plane == 'x' ? ((Math.random() * rotateRandomness) - (rotateRandomness / 2)) : 0.1,
      y: Math.random() * 0.1
    };
    if (newBlocks.chopped.position[newBlocks.plane] > newBlocks.placed.position[newBlocks.plane]) {
      positionParams[newBlocks.plane] = '+=' + (40 * Math.abs(newBlocks.direction));
    } else {
      positionParams[newBlocks.plane] = '-=' + (40 * Math.abs(newBlocks.direction));
    }
    TweenLite.to(newBlocks.chopped.position, 1, positionParams);
    TweenLite.to(newBlocks.chopped.rotation, 1, rotationParams);
  }

  this.addBlock();
};

Game.prototype.addBlock = function() {
  var lastBlock = this.blocks[this.blocks.length - 1];

  if (lastBlock && lastBlock.state == lastBlock.STATES.MISSED) {
    return this.endGame();
  }

  this.scoreContainer.innerHTML = String(this.blocks.length - 1);

  var newKidOnTheBlock = new Block(lastBlock);
  this.newBlocks.add(newKidOnTheBlock.mesh);
  this.blocks.push(newKidOnTheBlock);

  this.stage.setCamera(this.blocks.length * 2);

  if (this.blocks.length >= 5) this.instructions.classList.add('hide');
};

Game.prototype.endGame = function() {
  this.updateState(this.STATES.ENDED);
};

Game.prototype.tick = function() {
  this.blocks[this.blocks.length - 1].tick();
  this.stage.render();
  requestAnimationFrame(() => { this.tick(); });
};

var game = new Game();
