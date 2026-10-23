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
check(!!openCard && !/locked/.test(openCard.cls) && openCard.html.indexOf('The Backrooms') > -1 && openCard.html.indexOf('🌀') > -1,
      'after the secret is found it shows as 🌀 The Backrooms');
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

console.log('\n' + (ok ? 'SPECIAL MAPS PASS' : 'SPECIAL MAPS FAIL'));
process.exit(ok ? 0 : 1);
