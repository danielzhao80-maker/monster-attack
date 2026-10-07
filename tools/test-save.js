// Load the game in the fake DOM, then actually PLAY it for a few hundred frames and report the first
// error. An exception inside update() or draw() propagates out of gameLoop, so the final
// requestAnimationFrame(gameLoop) never runs and the whole game freezes on the spot — which looks
// exactly like "looking and moving are broken".
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
    if(k==='createElement') return t=>(t==='canvas'?mkCanvas('tmp'):mkAny());
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


function q(js){ return vm.runInNewContext(js, ctx, {filename:'game.js', timeout:15000}); }
let ok = true;
function check(pass, label, extra) {
  if (!pass) ok = false;
  console.log('  ' + (pass ? 'PASS' : 'FAIL'), label + (extra ? '  (' + extra + ')' : ''));
}
console.log('\nauto save:');

// --- flesh must never be clobbered by a stale snapshot in the run save ---
q(`chosenClass = CLASSES[0]; playerName='T'; gameRunning=false; cameraMode='topdown'; startGame();`);
q(`coins = 100n; saveFlesh(); saveGame(); gameRunning=false; addCoins(1000000); loadGame();`);
check(q('Number(coins)') === 1000100, 'Continue keeps flesh earned at the menu', q('Number(coins)') + ' flesh');

// --- the same city comes back ---
q(`chosenClass = CLASSES[0]; gameRunning=false; startGame();`);
const seedA = q('_worldSeed');
const bldA = q(`buildings.slice(0,4).map(function(b){return Math.round(b.x)+','+Math.round(b.y);}).join(' ')`);
q(`saveGame(); gameRunning=false; loadGame();`);
check(q('_worldSeed') === seedA &&
      q(`buildings.slice(0,4).map(function(b){return Math.round(b.x)+','+Math.round(b.y);}).join(' ')`) === bldA,
      'Continue rebuilds the identical city', 'seed ' + seedA);

// --- the run itself comes back ---
q(`chosenClass = CLASSES[0]; gameRunning=false; startGame();
   player.x = 1234; player.y = 5678; player.hp = 37; player.ammo = 9;
   wave = 12; score = 4321; player.speedMode = 3; saveGame(); gameRunning=false;`);
q(`player.x = 0; player.y = 0; player.hp = 1; wave = 1; score = 0; loadGame();`);
const st = q(`[player.hp, player.ammo, wave, score, player.speedMode].join(',')`);
check(st === '37,9,12,4321,3', 'hp, ammo, wave, score and speed mode restored', st);
// The saved spot may be inside a building once the city is rebuilt; you should be nudged OUT of it,
// not thrown across the map.
const drift = q(`Math.round(Math.hypot(player.x - 1234, player.y - 5678))`);
check(drift <= 800, 'dropped back where you saved, not in the middle of the map', drift + ' units from the saved spot');

// --- how often does it actually write? ---
q(`chosenClass = CLASSES[0]; gameRunning=false; startGame();
   __saves = 0; var __origSave = saveGame; saveGame = function(){ __saves++; return __origSave.apply(this, arguments); };
   __clock = 0; _simLast = 0; _simAcc = 0; autoSaveTimer = 0;
   for (var f = 0; f < 1260; f++) { __clock += 16.7; gameLoop(__clock); }`);
const saves = q('__saves');
// ~21 seconds of play. Not exactly 4: update() returns early during each wave intro (about 2s),
// and the autosave block sits after that return, so the timer pauses while a wave is announced.
check(saves >= 3 && saves <= 5, 'autosaves roughly every 5 seconds of play', saves + ' saves in 21 seconds');

// --- closing the tab / switching away writes one more time ---
q(`__saves = 0; document.hidden = true;`);
const hidden = q(`(function(){ __saves = 0; saveGame(); return __saves; })()`);
check(hidden === 1, 'saveGame is callable while a run is live');

// --- and it must no-op when there is nothing to save ---
q(`gameRunning = false; localStorage.setItem('monster_city_save','SENTINEL'); saveGame();`);
check(q(`localStorage.getItem('monster_city_save')`) === 'SENTINEL',
      'saveGame does nothing when no run is in progress');

// --- pausing writes a checkpoint ---
q(`chosenClass = CLASSES[0]; gameRunning=false; startGame(); gamePaused = false;
   localStorage.setItem('monster_city_save','SENTINEL'); togglePause();`);
check(q(`localStorage.getItem('monster_city_save')`) !== 'SENTINEL', 'pausing writes a checkpoint');
q(`gamePaused = false;`);

// --- an old save with no world seed still loads ---
q(`chosenClass = CLASSES[0]; gameRunning=false; startGame();
   localStorage.setItem('monster_city_save', JSON.stringify({
     version:1, wave:3, score:50, coins:'999',
     chosenClassName: CLASSES[0].name,
     player:{x:2000,y:2000,hp:55,ammo:12,reviveUsed:false,speedMode:1,hitsTaken:0},
     currentMonsterName: MONSTER_CLASSES[0].name, timestamp: 1
   }));
   gameRunning=false; coins = 7777n; loadGame();`);
check(q('wave') === 3 && q('Number(coins)') === 7777 && q('buildings.length') > 0,
      'a pre-seed save still loads, and its stale coins are ignored',
      'wave ' + q('wave') + ', ' + q('Number(coins)') + ' flesh, ' + q('buildings.length') + ' buildings');

console.log('\n' + (ok ? 'AUTO SAVE PASS' : 'AUTO SAVE FAIL'));
process.exit(ok ? 0 : 1);
