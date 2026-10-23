// The "⭐ Special Maps" section of the Worlds menu and the Backrooms, the first special map.
// Special maps are unlocked by a secret in ANOTHER arcade game, which writes `specialMaps` into the
// shared arcade save ('daniels-arcade-v1'). This checks: locked -> 🔒 ??? and unselectable; unlocked
// -> selectable and a run starts there; its walls build in 2D and 3D; save/Continue keep it; losing
// the unlock falls back to the City; and the normal wave ladder is untouched.
const fs = require('fs'), vm = require('vm');
const html = fs.readFileSync(process.argv[2] || 'index.html', 'utf8');
const code = [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n;\n');

const anyHandler = {
  get(t,k){ if(k===Symbol.toPrimitive) return ()=>0; if(k==='then') return undefined;
            if(k===Symbol.iterator) return function*(){}; if(k==='length') return 0; return mkAny(); },
  set(){return true}, has(){return true}, apply(){return mkAny()}, construct(){return mkAny()},
  deleteProperty(){return true}, ownKeys(){return []},
  getOwnPropertyDescriptor(){return {configurable:true,enumerable:false}} };
function mkAny(){ const f=function(){}; f.nodeType=1; return new Proxy(f, anyHandler); }

// A CHEAP 2d context. The Proxy allocates a new Proxy on every property touch, and draw() makes
// hundreds of context calls per frame — that alone made the draw-heavy raycast mode look like it hung.
function mkCtx() {
  const noop = () => {};
  const c = { canvas: null, globalAlpha: 1, fillStyle: '#000', strokeStyle: '#000', lineWidth: 1,
    font: '', textAlign: '', textBaseline: '', shadowBlur: 0, shadowColor: '', lineCap: '', lineJoin: '',
    globalCompositeOperation: 'source-over', imageSmoothingEnabled: true, filter: 'none' };
  for (const m of ['save','restore','beginPath','closePath','moveTo','lineTo','arc','arcTo','rect',
    'fill','stroke','fillRect','strokeRect','clearRect','fillText','strokeText','translate','rotate',
    'scale','transform','setTransform','resetTransform','clip','drawImage','quadraticCurveTo',
    'bezierCurveTo','ellipse','setLineDash','putImageData','roundRect','createImageData','drawFocusIfNeeded'])
    c[m] = noop;
  c.measureText = () => ({ width: 10 });
  c.createLinearGradient = c.createRadialGradient = () => ({ addColorStop: noop });
  c.createPattern = () => null;
  c.getImageData = () => ({ data: new Uint8Array(4) });
  return c;
}
function mkCanvas(id) {
  const el = { id, width: 900, height: 550, style: {}, dataset: {}, nodeType: 1,
    getContext: () => el.__ctx || (el.__ctx = mkCtx()),
    getBoundingClientRect: () => ({ left:0, top:0, width:900, height:550, right:900, bottom:550 }),
    addEventListener: () => {}, removeEventListener: () => {},
    requestPointerLock: () => {}, appendChild: () => {}, focus: () => {},
    toDataURL: () => 'data:,' };
  return el;
}
// A DOM element that actually REMEMBERS what you set on it, so tests can assert on textContent,
// style.display, value and so on. Unknown properties still fall through to the tolerant proxy, so
// anything the game reaches for that we have not modelled does not explode.
function mkEl(id) {
  const real = {
    id, nodeType: 1, style: {}, dataset: {}, classList: { add(){}, remove(){}, toggle(){}, contains: () => false },
    // Every stub can act as a canvas. The game has canvases all over the place (pet portraits, the
    // map maker, the minimap) and a stub whose .width reads as a proxy silently turns coordinate
    // maths into zero, which looks like a game bug and is not one.
    width: 900, height: 550, getContext() { return this.__ctx || (this.__ctx = mkCtx()); },
    childElementCount: 0, setPointerCapture() {}, releasePointerCapture() {},
    textContent: '', innerHTML: '', innerText: '', value: '', className: '',
    checked: false, disabled: false, children: [], parentNode: null,
    appendChild(c) { real.children.push(c); return c; }, removeChild() {}, remove() {},
    addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true,
    setAttribute() {}, getAttribute: () => null, removeAttribute() {},
    focus() {}, blur() {}, click() {}, scrollIntoView() {}, insertAdjacentHTML() {},
    querySelector: () => mkAny(), querySelectorAll: () => [], closest: () => null, contains: () => false,
    getBoundingClientRect: () => ({ left:0, top:0, width:900, height:550, right:900, bottom:550 }),
    requestPointerLock() {},
  };
  return new Proxy(real, {
    get(t, k) { return (k in t) ? t[k] : (typeof k === 'symbol' ? undefined : mkAny()); },
    set(t, k, v) { t[k] = v; return true; },
    has() { return true; },
  });
}
const _els = {};
function getEl(id) {
  if (!_els[id]) _els[id] = (id === 'game' || id === 'game3d' || id === 'minimap') ? mkCanvas(id) : mkEl(id);
  return _els[id];
}
const store={};
const sandbox = {
  console,
  document: new Proxy(function(){}, { ...anyHandler, get(t,k){
    if(k==='getElementById') return getEl;
    if(k==='querySelector') return ()=>mkAny();
    if(k==='createElement') return t=>(t==='canvas'?mkCanvas('tmp'):mkEl('new-'+t));   // real-ish elements, so the menu can be inspected
    if(k==='querySelectorAll') return ()=>[];
    if(k==='addEventListener'||k==='removeEventListener') return ()=>{};
    if(k==='hidden') return false;
    if(k==='pointerLockElement') return null;
    return mkAny(); } }),
  localStorage:{ getItem:k=>(k in store?store[k]:null), setItem:(k,v)=>{store[k]=String(v)},
                 removeItem:k=>{delete store[k]}, clear:()=>{} },
  navigator:{ maxTouchPoints:0, userAgent:'node', language:'en' },
  performance:{ now:()=>sandbox.__clock },
  __clock: 0,
  location:{ href:'file:///index.html', protocol:'file:' },
  requestAnimationFrame:()=>1, cancelAnimationFrame:()=>{},
  setTimeout:()=>1, clearTimeout:()=>{}, setInterval:()=>1, clearInterval:()=>{},
  alert:()=>{}, confirm:()=>true, prompt:()=>null,
  THREE:mkAny(), Peer:mkAny(), AudioContext:mkAny(), webkitAudioContext:mkAny(),
  Image:function(){return mkAny()}, Audio:function(){return mkAny()},
  matchMedia:()=>({matches:false,addEventListener(){},addListener(){}}),
  MutationObserver:function(){return {observe(){},disconnect(){}}},
  fetch:()=>Promise.resolve(mkAny()),
  addEventListener:()=>{}, removeEventListener:()=>{}, dispatchEvent:()=>true,
  getComputedStyle:()=>mkAny(), innerWidth:1440, innerHeight:900, devicePixelRatio:2,
  Math, JSON, Date, BigInt, Object, Array, String, Number, Boolean, Map, Set, WeakMap, WeakSet,
  Promise, RegExp, Error, TypeError, Symbol, Proxy, Reflect, isNaN, isFinite, parseInt, parseFloat,
  encodeURIComponent, decodeURIComponent, Float32Array, Uint8Array, Int32Array, ArrayBuffer,
};
sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.self = sandbox;
const ctx = vm.createContext(sandbox);

function fail(stage, e) {
  console.log('FAILED during ' + stage);
  console.log('  ' + e.name + ': ' + e.message);
  const m = (e.stack||'').match(/game\.js:(\d+)/);
  if (m) {
    const n = +m[1], src = code.split('\n');
    console.log('  at script line ' + n + ':');
    for (let i=Math.max(0,n-3); i<Math.min(src.length,n+2); i++)
      console.log('   ' + (i+1===n?'>':' ') + ' ' + String(i+1).padStart(6) + '  ' + src[i].slice(0,115));
  }
  process.exit(1);
}
try { vm.runInNewContext(code, ctx, { filename:'game.js', timeout:20000 }); }
catch (e) { fail('LOAD', e); }
console.log('load        : OK');



function q(js){ return vm.runInNewContext(js, ctx, {filename:'game.js', timeout:20000}); }
let ok = true;
function check(pass, label, extra) {
  if (!pass) ok = false;
  console.log('  ' + (pass ? 'PASS' : 'FAIL'), label + (extra ? '  (' + extra + ')' : ''));
}
const ARC = 'daniels-arcade-v1';
const setArcade = obj => { if (obj === null) delete store[ARC]; else store[ARC] = JSON.stringify(obj); };
// The special-maps grid as the Worlds menu drew it: [title, grid], grid.children = cards.
const specialCards = () => q(`(function(){
  var box = document.getElementById('special-maps');
  var title = box.children[box.children.length - 2], grid = box.children[box.children.length - 1];
  return JSON.stringify({ title: title && title.textContent,
    cards: (grid && grid.children || []).map(function(c){ return { cls: c.className, html: c.innerHTML, id: c.dataset.world }; }) });
})()`);
const clickSpecial = id => q(`(function(){
  var box = document.getElementById('special-maps'), grid = box.children[box.children.length - 1];
  var c = grid.children.find(function(c){ return c.dataset.world === ${JSON.stringify(id)}; });
  if (c && typeof c.onclick === 'function' && !/locked/.test(c.className)) { c.onclick(); return true; }
  return false; })()`);

q(`chosenClass = CLASSES[0]; playerName='T'; gameRunning=false; cameraMode='topdown';`);

console.log('\nlocked:');
setArcade(null);
q(`highestWaveEver = 0; currentWorld = WORLDS[0]; saveWorldProgress(); openWorldScreen();`);
let sc = JSON.parse(specialCards());
check(sc.title === '⭐ Special Maps', 'the Worlds menu has a "⭐ Special Maps" section', sc.title);
const lockedCard = sc.cards.find(c => c.id === 'backrooms');
check(!!lockedCard && /locked/.test(lockedCard.cls) && lockedCard.html.indexOf('🔒') > -1 && lockedCard.html.indexOf('???') > -1,
      'the Backrooms shows as 🔒 ???');
check(!!lockedCard && lockedCard.html.indexOf('Find the secret in another game') > -1, 'with the hint');
check(lockedCard && lockedCard.html.indexOf('Backrooms') < 0, 'and does not give its name away');
check(clickSpecial('backrooms') === false && q(`currentWorld.id`) === 'city', 'clicking it does nothing');
check(q(`selectWorld('backrooms')`) === false && q(`currentWorld.id`) === 'city', 'and it cannot be selected any other way');
setArcade({ coins: 5, specialMaps: 'oops' });
check(q(`getSpecialMaps().length`) === 0, 'a malformed specialMaps is treated as none');
store[ARC] = '{not json';
check(q(`getSpecialMaps().length`) === 0, 'a corrupt arcade save is treated as none');

console.log('\nunlocked:');
setArcade({ coins: 5, specialMaps: ['backrooms'], titles: ['dimension'] });
q(`openWorldScreen();`);                         // re-read on open
sc = JSON.parse(specialCards());
const openCard = sc.cards.find(c => c.id === 'backrooms');
check(!!openCard && !/locked/.test(openCard.cls) && openCard.html.indexOf('Floor 0: The Lobby') > -1 && openCard.html.indexOf('🌀') > -1,
      'after the secret is found it shows as 🌀 Floor 0: The Lobby');
check(clickSpecial('backrooms') === true && q(`currentWorld.id`) === 'backrooms', 'clicking it selects it');
check(JSON.parse(q(`localStorage.getItem('monster_city_worlds')`)).currentWorldId === 'backrooms', 'and the choice is saved');
sc = JSON.parse(specialCards());
check(/selected/.test(sc.cards.find(c => c.id === 'backrooms').cls), 'the card shows as selected');

q(`gameRunning=false; startGame();`);
check(q(`currentWorld.id`) === 'backrooms', 'a run starts in the Backrooms');
const geo = JSON.parse(q(`(function(){
  var thin = 0, styled = 0;
  buildings.forEach(function(b){ if (b.st === 'backroom') styled++; if (Math.min(b.w, b.h) <= 50) thin++; });
  return JSON.stringify({ n: buildings.length, styled: styled, thin: thin, inside: ptInBld(player.x, player.y, player.r) }); })()`));
check(geo.n > 100 && geo.styled === geo.n, 'its structures are Backrooms walls', geo.n + ' pieces');
check(geo.thin === geo.n, 'every piece is a thin wall or a pillar, not a building');
check(geo.n < 1600, 'and there are not so many that collision bogs down', geo.n);
check(!geo.inside, 'the player does not start inside a wall');
check(q(`worldSky(currentWorld, TIME_OF_DAY[2]).top`) === 0xe6da9a && q(`groundArtOf(currentWorld)`) === 'dampcarpet',
      'pale-yellow ceiling sky and damp carpet underfoot');
check(q(`worldFxName(currentWorld)`) === 'motes' && q(`AMBIENCE.bedFor('backrooms')`) === 'fluoro', 'dust motes and fluorescent hum');
check(q(`currentWorld.fogDensity > 0.00042`) === true, 'the haze is thicker than an ordinary world');
check(q(`(function(){ wave = 10; var b = rollMonsterClass(); wave = 1; return currentWorld.bosses.indexOf(b.name) > -1; })()`) === true,
      'boss waves summon a Backrooms boss');
check(q(`themeMonster(MONSTER_CLASSES.find(function(c){return c.name==='Frost';})).name`) === 'Smiler', 'Frost is re-skinned as the Smiler');

console.log('\nstructures build:');
// 2D: the top-down silhouette draws, and draws the Backrooms branch rather than falling through.
check(q(`(function(){
   var n = 0, ctx2 = { fillRect: function(){ n++; }, strokeRect: function(){}, beginPath: function(){}, moveTo: function(){},
     lineTo: function(){}, stroke: function(){}, fill: function(){}, arc: function(){}, roundRect: function(){} };
   drawStructureTop(ctx2, buildings[0]); return n >= 2 && n < 6; })()`) === true, 'the top-down silhouette draws a wall');
check(/kind2 === 'backroom'/.test(code), 'it has its own top-down branch');
// 3D: the dispatcher has a branch, and a frame of the 3D view renders without throwing.
check(/kind === 'backroom'/.test(code), 'the 3D dispatcher has a Backrooms branch');
// THREE is a tolerant stub here, so this proves the dispatcher runs every Backrooms wall through
// its branch without throwing and registers a group for each — not what the pixels look like.
let err3d = null;
try { q(`cameraMode = '3d'; if (!_three) init3D(); render3D(); cameraMode = 'topdown';`); } catch (e) { err3d = e.message; }
check(!err3d, 'a 3D frame in the Backrooms runs', err3d || 'ok');
const meshed = q(`(_three && _three._bldgMap && typeof _three._bldgMap.size === 'number') ? _three._bldgMap.size : -1`);
check(meshed > 0, 'and its walls are meshed in 3D', meshed + ' wall groups');
let err2d = null;
try { q(`for (var f = 0; f < 60; f++) { __clock += 16.7; gameLoop(__clock); }`); } catch (e) { err2d = e.message; }
check(!err2d, 'a second of top-down play runs', err2d || 'ok');
const props = q(`JSON.stringify(PROPS_FOR(currentWorld))`);
check(q(`PROPS_FOR(currentWorld).every(function(k){ return !!buildProp(k, function(){ return false; }); })`) === true,
      'every Backrooms prop builds', props);
check(q(`(function(){ var n = 0; PROPS_FOR(currentWorld).forEach(function(k){ buildProp(k, function(){ n++; return true; }); }); return n; })()`) === 0,
      'and none of them takes a dynamic light');

console.log('\nsave / continue:');
q(`gameRunning=false; startGame(); wave = 7; score = 1234; saveGame();`);
const seed = q('_worldSeed');
q(`gameRunning=false; currentWorld = WORLDS[0]; loadGame();`);
check(q(`currentWorld.id`) === 'backrooms' && q('_worldSeed') === seed && q('wave') === 7,
      'Continue comes back to the same Backrooms', 'wave ' + q('wave'));
q(`currentWorld = WORLDS[0]; loadWorldProgress();`);
check(q(`currentWorld.id`) === 'backrooms', 'the selected world survives a reload');

console.log('\nunlock removed:');
setArcade({ coins: 5, specialMaps: [] });
q(`currentWorld = findWorld('backrooms'); loadWorldProgress();`);
check(q(`currentWorld.id`) === 'city', 'the world save falls back to the City');
q(`gameRunning=false; currentWorld = findWorld('backrooms'); loadGame();`);
check(q(`currentWorld.id`) === 'city', 'Continue on a Backrooms run falls back to the City');
q(`gameRunning=false; currentWorld = findWorld('backrooms'); startGame();`);
check(q(`currentWorld.id`) === 'city', 'starting a run falls back to the City');
q(`openWorldScreen();`);
sc = JSON.parse(specialCards());
check(/locked/.test(sc.cards.find(c => c.id === 'backrooms').cls), 'and the menu locks it again');
setArcade(null);
q(`currentWorld = findWorld('backrooms'); loadWorldProgress();`);
check(q(`currentWorld.id`) === 'city', 'no arcade save at all also means the City');

console.log('\nnormal progression unchanged:');
check(q(`WORLDS.length`) === 36 && q(`WORLDS.some(function(w){ return w.special; })`) === false,
      'the Backrooms is not on the wave ladder', q(`WORLDS.length`) + ' normal worlds');
setArcade({ specialMaps: ['backrooms'] });
q(`highestWaveEver = 45; saveWorldProgress(); openWorldScreen();`);
const prog = q(`document.getElementById('world-progress').textContent`);
check(/3\/36 worlds unlocked/.test(prog), 'the progress line still counts only normal worlds', prog);
check(q(`isWorldUnlocked(findWorld('jungle'))`) === false && q(`isWorldUnlocked(findWorld('circus'))`) === true,
      'normal worlds still unlock by wave');
// Clearing waves in the Backrooms must not move the normal ladder.
q(`selectWorld('backrooms'); gameRunning=false; startGame(); wave = 60;
   monsters = []; monstersSpawned = monstersToSpawn; waveIntroTimer = 0;
   for (var f = 0; f < 400 && wave === 60; f++) { monsters = []; monstersSpawned = monstersToSpawn; __clock += 16.7; gameLoop(__clock); }`);
check(q('wave') === 61, 'a wave can be cleared in the Backrooms', 'wave ' + q('wave'));
check(q('highestWaveEver') === 45 && JSON.parse(q(`localStorage.getItem('monster_city_worlds')`)).highestWave === 45,
      'and it does not raise the highest wave', 'still ' + q('highestWaveEver'));
q(`selectWorld('city'); gameRunning=false; startGame(); wave = 60;
   for (var f = 0; f < 400 && wave === 60; f++) { monsters = []; monstersSpawned = monstersToSpawn; __clock += 16.7; gameLoop(__clock); }`);
check(q('highestWaveEver') === 61, 'while clearing it in a normal world still does', q('highestWaveEver'));

// ---- it is a real maze ----
q(`selectWorld('backrooms'); gameRunning=false; startGame();`);
const maze = JSON.parse(q(`(function(){
  // Every room in a 3x3 block of chunks is reachable from the start room.
  var gx0 = Math.floor(player.x / MAZE_CELL), gy0 = Math.floor(player.y / MAZE_CELL);
  var cx = Math.floor(gx0 / MAZE_NX), cy = Math.floor(gy0 / MAZE_NY);
  var lo = [(cx-1)*MAZE_NX, (cy-1)*MAZE_NY], hi = [(cx+2)*MAZE_NX, (cy+2)*MAZE_NY];
  var seen = {}, q2 = [[gx0, gy0]], D = [[1,0],[0,1],[-1,0],[0,-1]], open = 0, edges = 0;
  seen[gx0+','+gy0] = 1;
  for (var h = 0; h < q2.length; h++) {
    var x = q2[h][0], y = q2[h][1];
    for (var k = 0; k < 4; k++) {
      var x2 = x + D[k][0], y2 = y + D[k][1];
      if (x2 < lo[0] || y2 < lo[1] || x2 >= hi[0] || y2 >= hi[1]) continue;
      var pass = mazeCanPass(x, y, k);
      if (k < 2) { edges++; if (pass) open++; }
      if (!pass || seen[x2+','+y2]) continue;
      seen[x2+','+y2] = 1; q2.push([x2, y2]);
    }
  }
  // A wall really stands on every closed edge: the middle of a closed edge is inside a wall.
  var bad = 0, checked = 0;
  for (var i = 0; i < 60; i++) {
    var ex = lo[0] + 3 + (i * 7) % (MAZE_NX*3 - 6), ey = lo[1] + 3 + (i * 5) % (MAZE_NY*3 - 6);
    if (!mazeCanPass(ex, ey, 0)) { checked++; refreshChunks(true);
      if (!ptInBld((ex+1)*MAZE_CELL, (ey+0.5)*MAZE_CELL, 2)) {
        player.x = (ex+1)*MAZE_CELL; player.y = (ey+0.5)*MAZE_CELL; refreshChunks(true);
        if (!ptInBld((ex+1)*MAZE_CELL, (ey+0.5)*MAZE_CELL, 2)) bad++; }
    }
    if (mazeCanPass(ex, ey, 0)) { player.x = (ex+1)*MAZE_CELL; player.y = (ey+0.5)*MAZE_CELL; refreshChunks(true);
      if (ptInBld((ex+1)*MAZE_CELL, (ey+0.5)*MAZE_CELL, 2)) bad++; }
  }
  return JSON.stringify({ reached: q2.length, total: MAZE_NX*MAZE_NY*9, open: open, edges: edges, bad: bad, checked: checked });
})()`));
check(maze.reached === maze.total, 'every room in the maze can be reached', maze.reached + '/' + maze.total);
check(maze.open / maze.edges < 0.7, 'and most of the room edges are walls, so it is a maze', Math.round(100*maze.open/maze.edges) + '% open');
check(maze.checked > 5 && maze.bad === 0, 'walls stand exactly where the maze says, and doorways are clear', maze.checked + ' walls, ' + maze.bad + ' wrong');

// A monster on the far side of walls walks the maze to the player instead of sticking to a wall.
const chase = JSON.parse(q(`(function(){
  gameRunning=false; startGame(); __freezeMonsters = false;
  var gx = Math.floor(player.x / MAZE_CELL), gy = Math.floor(player.y / MAZE_CELL);
  // Find a room 6+ steps away by the maze.
  var f = mazeField(gx, gy), W = MAZE_REACH*2+1, best = null;
  for (var ix = 0; ix < W; ix++) for (var iy = 0; iy < W; iy++) {
    var d = f.dist[ix*W+iy]; if (d >= 6 && d <= 9 && !best) best = [gx+ix-MAZE_REACH, gy+iy-MAZE_REACH, d];
  }
  player.x = (gx+0.5)*MAZE_CELL; player.y = (gy+0.5)*MAZE_CELL; refreshChunks(true);
  spawnMonster && spawnMonster();
  var m = monsters[0]; if (!m) return JSON.stringify({ err: 'no monster' });
  monsters = [m]; monstersSpawned = 0; monstersToSpawn = 99;
  m.x = (best[0]+0.5)*MAZE_CELL; m.y = (best[1]+0.5)*MAZE_CELL; m.phasing = false; m.hp = m.maxHp = 1e9;
  player.hp = player.maxHp = 1e9; player.invincible = 1e9;
  var start = Math.hypot(m.x-player.x, m.y-player.y), steps = 0;
  for (; steps < 6000 && Math.hypot(m.x-player.x, m.y-player.y) > 200; steps++) {
    monstersSpawned = 0; monsters = [m]; player.x = (gx+0.5)*MAZE_CELL; player.y = (gy+0.5)*MAZE_CELL; update(); }
  return JSON.stringify({ rooms: best[2], start: Math.round(start), end: Math.round(Math.hypot(m.x-player.x, m.y-player.y)), steps: steps });
})()`));
// 200: a ranged monster stops at 180 to shoot, which still means it got through.
check(chase.end <= 200, 'a monster ' + chase.rooms + ' rooms away finds its way through the maze', JSON.stringify(chase));

// ---- Floor 1 (Parking Zone): a builder hit by a falling ceiling tile looks up through the hole ----
const tileRun = (cls, look, worldId) => JSON.parse(q(`(function(){
  selectWorld('${worldId || 'backrooms'}'); gameRunning=false; startGame(); monsters = [];
  player.cls = CLASSES.find(function(c){ return c.name === '${cls}'; });
  player.invincible = 0; player.hp = player.maxHp = 1000; setCameraMode('fp3d'); player.pitch = 0;
  var t = { x: player.x, y: player.y, r: 20, type: 'fallentile', emoji: '⬜', color: '#e9e3cc', dmg: 10,
            effect: 'knockback', duration: 0, label: 'CEILING TILE!', cooldown: 0 };
  var hit = applyTrapToPlayer(t, player);
  var hole = player._tileHole || 0;
  for (var f = 0; f < 30; f++) { monsters = []; update(); }
  player.pitch = ${look};
  for (var f = 0; f < 5; f++) { monsters = []; update(); }
  return JSON.stringify({ hit: hit, hole: hole, maps: getSpecialMaps() });
})()`));
setArcade({ specialMaps: ['backrooms'] });
check(q(`isWorldUnlocked(findWorld('backrooms2'))`) === false, 'Floor 1 starts locked');
let tr = tileRun('Scientist', 1.0);
check(tr.hit && tr.hole === 0 && tr.maps.indexOf('backrooms2') < 0, 'a class that cannot build looks up and nothing happens');
tr = tileRun('Builder', 0);
check(tr.hit && tr.hole === 600 && tr.maps.indexOf('backrooms2') < 0, 'a Builder hit by a tile who does NOT look up gets nothing');
setArcade({ specialMaps: ['backrooms'] });
tr = tileRun('Builder', 1.0);
check(tr.maps.indexOf('backrooms2') > -1, 'a Builder hit by a falling tile who looks up unlocks Floor 1', JSON.stringify(tr.maps));
check(tr.maps.indexOf('backrooms') > -1, 'and keeps the Backrooms');
setArcade({ specialMaps: ['backrooms'] });
tr = tileRun('The Iron', 1.0);
check(tr.maps.indexOf('backrooms2') > -1, 'The Iron (it builds Iron Walls) can find it too');
// Looking up too late: the hole is gone after 10 s.
setArcade({ specialMaps: ['backrooms'] });
const late = JSON.parse(q(`(function(){
  selectWorld('backrooms'); gameRunning=false; startGame(); monsters = [];
  player.cls = CLASSES.find(function(c){ return c.name === 'Builder'; }); setCameraMode('fp3d'); player.pitch = 0;
  player.invincible = 0; player.hp = player.maxHp = 1e6;
  applyTrapToPlayer({ x: player.x, y: player.y, r: 20, type: 'fallentile', dmg: 0, effect: 'knockback', duration: 0, label: 'x', color: '#fff', cooldown: 0 }, player);
  for (var f = 0; f < 620; f++) { monsters = []; update(); }
  player.pitch = 1.0; for (var f = 0; f < 5; f++) { monsters = []; update(); }
  return JSON.stringify(getSpecialMaps());
})()`));
check(late.indexOf('backrooms2') < 0, 'looking up after the hole is gone (10 s) does nothing');
// Floor 1 is a playable underground car park.
setArcade({ specialMaps: ['backrooms', 'backrooms2'] });
q(`selectWorld('backrooms2'); gameRunning=false; startGame();`);
check(q(`currentWorld.id`) === 'backrooms2', 'Floor 1: Parking Zone can be selected and a run starts there');
const gar = JSON.parse(q(`(function(){ var o = { n: buildings.length, st: 0, pillars: 0, cars: 0, walls: 0 };
  buildings.forEach(function(b){ if (b.st === 'concretemaze') o.st++; if (b.pillar) o.pillars++; if (b.car) o.cars++; if (b.divider) o.walls++; });
  o.inside = ptInBld(player.x, player.y, player.r); o.name = currentWorld.name; return JSON.stringify(o); })()`));
check(gar.st === gar.n && gar.pillars > 500, 'rows of concrete pillars', gar.pillars + ' pillars');
check(gar.cars > 30, 'with cars parked in the bays (solid, like the pillars)', gar.cars + ' cars');
check(gar.n < 4000, 'kept small enough for collision', gar.n + ' pieces');
check(!gar.inside, 'the player does not start inside a pillar or a car');
check(gar.name === 'Floor 1: Parking Zone' && q(`findWorld('backrooms').name`) === 'Floor 0: The Lobby', 'named Floor 0: The Lobby and Floor 1: Parking Zone');
check(q(`BLDG_STYLES[worldStyleId(currentWorld)].maze`) !== true && q(`mazeStep(player.x, player.y, player.x + 2000, player.y)`) === null
      && q(`groundArtOf(currentWorld)`) === 'wetconcrete', 'an open car park (no maze steering) on wet concrete');
check(q(`WORLD_CEILING.backrooms.h`) === 110 && q(`WORLD_CEILING.backrooms2.h`) === 110
      && q(`BLDG_STYLES.backroom.hgt[1]`) === 110 && q(`BLDG_STYLES.concretemaze.hgt[1]`) === 110,
      'both floors have a ceiling at about 3 m, and the walls reach it');
check(q(`WORLDS.some(function(w){ return w.id === 'backrooms2'; })`) === false, 'and it is not on the wave ladder either');

// ---- Floors 2–20 and the exits that unlock them ----
check(q(`FLOOR_IDS.length`) === 21 && q(`FLOOR_IDS[0]`) === 'backrooms' && q(`FLOOR_IDS[20]`) === 'brfloor20', 'there are 21 Backrooms floors, 0 to 20');
check(q(`FLOOR_IDS.every(function(id, n){ var w = findWorld(id); return w && w.special && w.floor === n && w.name.indexOf('Floor ' + n + ': ') === 0; })`) === true,
      'each is a special map named "Floor N: ..."', q(`findWorld('brfloor7').name`) + ' / ' + q(`findWorld('brfloor20').name`));
setArcade({ specialMaps: ['backrooms', 'backrooms2'] });
check(q(`FLOOR_IDS.slice(2).every(function(id){ return !isWorldUnlocked(findWorld(id)); })`) === true, 'floors 2-20 start locked');
check(q(`findWorld('brfloor5').hint`) === 'Find the exit on Floor 4', 'a locked floor says where its exit is');
// Every floor plays.
setArcade({ specialMaps: q(`JSON.stringify(FLOOR_IDS)`) && JSON.parse(q(`JSON.stringify(FLOOR_IDS)`)) });
const plays = JSON.parse(q(`(function(){ var bad = [];
  FLOOR_IDS.forEach(function(id){
    try {
      if (!selectWorld(id)) { bad.push(id + ': not selectable'); return; }
      gameRunning = false; startGame(); monsters = [];
      if (currentWorld.id !== id) bad.push(id + ': run is in ' + currentWorld.id);
      if (buildings.length < 100) bad.push(id + ': only ' + buildings.length + ' pieces');
      if (buildings.length > 4000) bad.push(id + ': ' + buildings.length + ' pieces');
      if (ptInBld(player.x, player.y, player.r)) bad.push(id + ': starts inside a wall');
      for (var f = 0; f < 20; f++) { update(); draw(); }
    } catch (e) { bad.push(id + ': ' + e.message); }
  });
  return JSON.stringify(bad); })()`));
check(plays.length === 0, 'every floor builds, starts clear and runs', plays.join('; ') || 'all 21');
check(q(`BACKROOMS_FLOORS.filter(function(f){ return f.ceiling; }).every(function(f){ return WORLD_CEILING[f.id] && WORLD_CEILING[f.id].h === 110; })`) === true,
      'the indoor floors have a ceiling');

// The exit: Floor 1 -> Floor 2.
setArcade({ specialMaps: ['backrooms', 'backrooms2'] });
const ex = JSON.parse(q(`(function(){
  selectWorld('backrooms2'); gameRunning = false; startGame(); monsters = []; __freezeMonsters = true;
  var o = {};
  wave = floorExitWave(1) - 1; tickFloorExit(); o.early = !!brExit;
  wave = floorExitWave(1); tickFloorExit(); o.made = !!brExit;
  if (brExit) { o.dist = Math.round(Math.hypot(brExit.x - player.x, brExit.y - player.y)); o.inWall = ptInBld(brExit.x, brExit.y, 30); o.next = brExit.next; }
  player.x = brExit.x + 20; player.y = brExit.y; tickFloorExit();
  o.done = brExit.done; o.maps = getSpecialMaps();
  __freezeMonsters = false;
  return JSON.stringify(o); })()`));
check(ex.early === false, 'no exit before wave ' + q(`floorExitWave(1)`));
check(ex.made && ex.dist >= 1100 && ex.dist <= 1600 && !ex.inWall, 'then an exit appears on open floor a walk away', ex.dist + ' units');
check(ex.next === 'brfloor2' && ex.done && ex.maps.indexOf('brfloor2') > -1, 'walking into it unlocks Floor 2', JSON.stringify(ex.maps));
// Higher floors need more waves, the top floor has no exit, and the Lobby keeps its tile secret.
check(q(`floorExitWave(19)`) > q(`floorExitWave(2)`), 'higher floors need more waves', q(`floorExitWave(2)`) + ' -> ' + q(`floorExitWave(19)`));
setArcade({ specialMaps: JSON.parse(q(`JSON.stringify(FLOOR_IDS)`)) });
check(q(`(function(){ selectWorld('brfloor20'); gameRunning=false; startGame(); wave = 99; tickFloorExit(); return brExit; })()`) === null, 'Floor 20 is the top: no exit');
check(q(`(function(){ selectWorld('backrooms'); gameRunning=false; startGame(); wave = 99; tickFloorExit(); return brExit; })()`) === null, 'the Lobby has no exit (its way up is the ceiling tile)');
// An exit chain all the way up.
setArcade({ specialMaps: ['backrooms', 'backrooms2'] });
const chain = q(`(function(){ __freezeMonsters = true;
  for (var n = 1; n < 20; n++) {
    selectWorld(FLOOR_IDS[n]); gameRunning = false; startGame(); monsters = [];
    wave = floorExitWave(n); tickFloorExit(); if (!brExit) return 'no exit on floor ' + n;
    player.x = brExit.x; player.y = brExit.y; tickFloorExit();
  }
  __freezeMonsters = false;
  return getSpecialMaps().length; })()`);
check(chain === 21, 'climbing exit by exit reaches Floor 20', String(chain));

console.log('\n' + (ok ? 'SPECIAL MAPS PASS' : 'SPECIAL MAPS FAIL'));
process.exit(ok ? 0 : 1);
