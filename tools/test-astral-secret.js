// Astral Temple secret: an invisible spot near spawn that unlocks the arcade's MEDIUM QUEST.
// Harness copied from test-save.js. Load the game in the fake DOM, then actually PLAY it for a few hundred frames and report the first
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
    __listeners: {}, addEventListener: (t, f) => { (el.__listeners[t] = el.__listeners[t] || []).push(f); }, removeEventListener: () => {},
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
    if(k==='pointerLockElement') return sandbox.__plock || null;
    return mkAny(); } }),
  localStorage:{ getItem:k=>(k in store?store[k]:null), setItem:(k,v)=>{store[k]=String(v)},
                 removeItem:k=>{delete store[k]}, clear:()=>{} },
  navigator:{ maxTouchPoints:0, userAgent:'node', language:'en' },
  performance:{ now:()=>sandbox.__clock },
  __clock: 0,
  location:{ href:'file:///index.html', protocol:'file:' },
  requestAnimationFrame:()=>1, cancelAnimationFrame:()=>{},
  setTimeout:()=>1, clearTimeout:()=>{}, setInterval:(f)=>{ (sandbox.__intervals = sandbox.__intervals || []).push(f); return 1; }, clearInterval:()=>{},
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

function q2(js){ return vm.runInNewContext(js, ctx, {filename:'game.js', timeout:15000}); }
const canvasEl = getEl('game');
const downs = canvasEl.__listeners.mousedown || [];
check(downs.length > 0, 'the game canvas has a mousedown handler to hook into');
function clickAt(clientX, clientY) {
  for (const f of downs) f({ button: 0, clientX, clientY, preventDefault(){} });
  for (const f of (canvasEl.__listeners.mouseup || [])) f({ button: 0, preventDefault(){} });
}
const ARC = 'daniels-arcade-v1';
const unlocked = () => { try { return !!JSON.parse(store[ARC] || '{}').mediumUnlocked; } catch (e) { return false; } };
const statusText = () => String(getEl('status-overlay').textContent || '');
function resetStatus() { getEl('status-overlay').textContent = ''; }

function startIn(worldId, mode) {
  q(`chosenClass = CLASSES.find(function(c){ return c.type === 'ranged' && c.ammo < 999; }) || CLASSES[0];
     playerName = 'T'; gameRunning = false; gamePaused = false;
     currentWorld = WORLDS.find(function(w){ return w.id === ${JSON.stringify(worldId)}; });
     cameraMode = ${JSON.stringify(mode)}; startGame(); cameraMode = ${JSON.stringify(mode)};
     waveIntroTimer = 0; camera.x = player.x - W/2; camera.y = player.y - H/2;`);
}
// Screen position of a world point in top-down.
const scr = (wx, wy) => [q(`${wx} - camera.x`), q(`${wy} - camera.y`)];

console.log('\nastral secret:');
// ---------- 1/2: the spot exists near spawn ----------
startIn('astral', 'topdown');
const spawn = q(`({x: player.x, y: player.y})`);
const spot = q(`(function(){ var s = astralSecretSpot(); return s && {x: s.x, y: s.y}; })()`);
const off = spot ? Math.hypot(spot.x - spawn.x, spot.y - spawn.y) : -1;
check(!!spot && off > 60 && off < 100, 'Astral Temple run places the spot ~80 units from spawn', Math.round(off) + ' units');
check(q(`currentWorld.id`) === 'astral', 'world is the Astral Temple');

// ---------- 4: a click away from the spot does nothing ----------
resetStatus();
let [fx, fy] = scr(spot.x + 200, spot.y + 200);
clickAt(fx, fy);
check(!unlocked() && !/SECRET/.test(statusText()), 'top-down click 280 units off the spot does nothing');
// facing away in 3D also does nothing
q(`cameraMode = 'fp3d'; player.pitch = 0; player.angle = Math.atan2(${spot.y} - player.y, ${spot.x} - player.x) + Math.PI;`);
sandbox.__plock = canvasEl;
clickAt(450, 275);
check(!unlocked(), '3D click while facing away from the spot does nothing');
sandbox.__plock = null;
q(`cameraMode = 'topdown';`);

// ---------- 6: the click still fires a normal shot ----------
q(`bullets = []; player.shootCooldown = 0; player.ammo = player.maxAmmo; player.reloading = false; shooting = false;`);
[fx, fy] = scr(spot.x, spot.y);
for (const f of downs) f({ button: 0, clientX: fx, clientY: fy, preventDefault(){} });
const shootingNow = q('shooting');
// Firing runs off the game's own 100ms auto-fire interval; run that exact callback once.
const fireTicks = (sandbox.__intervals || []).filter(f => /shootBullet/.test(String(f)));
check(fireTicks.length > 0, "found the game's auto-fire interval");
fireTicks.forEach(f => f());
const nb = q('bullets.length');
for (const f of (canvasEl.__listeners.mouseup || [])) f({ button: 0 });
check(shootingNow === true && nb > 0, 'clicking the spot still pulls the trigger and fires a shot', nb + ' bullet(s)');

// ---------- 3a: top-down click on the spot unlocks ----------
check(unlocked(), 'top-down click on the spot sets mediumUnlocked in ' + ARC);
check(/MEDIUM QUEST UNLOCKED/.test(statusText()), 'big MEDIUM QUEST UNLOCKED announcement shown', statusText());
// existing arcade data is kept
check(JSON.parse(store[ARC]).mediumUnlocked === true, 'save written as JSON with mediumUnlocked:true');

// clicking again: short "already found" message, nothing else
resetStatus();
store[ARC] = JSON.stringify({ coins: 42, mediumUnlocked: true });
clickAt(fx, fy);
check(/already found the Astral secret/.test(statusText()) && JSON.parse(store[ARC]).coins === 42,
      'second click only says "already found" and leaves the save alone', statusText());

// ---------- 3b: 3D camera (fp3d) — crosshair on the ground at the spot ----------
for (const mode of ['fp3d', 'firstperson', 'thirdperson']) {
  delete store[ARC]; resetStatus();
  startIn('astral', mode);
  const s = q(`(function(){ var s = astralSecretSpot(); return {x: s.x, y: s.y}; })()`);
  const d = Math.hypot(s.x - q('player.x'), s.y - q('player.y'));
  const eye = mode === 'fp3d' ? 22 : 30;
  // Look straight at it and down so the crosshair meets the floor right on the spot.
  q(`player.angle = Math.atan2(${s.y} - player.y, ${s.x} - player.x); player.pitch = ${mode === 'thirdperson' ? 0 : -Math.atan(eye / d)};`);
  if (mode === 'thirdperson') q(`player.x += (${s.x} - player.x) * 0.5; player.y += (${s.y} - player.y) * 0.5;`); // walk up to it
  sandbox.__plock = canvasEl;
  clickAt(450, 275);
  sandbox.__plock = null;
  check(unlocked() && /MEDIUM QUEST UNLOCKED/.test(statusText()), mode + ': clicking with the crosshair on the spot unlocks it');
}

// out of reach: > 300 units away, even aiming at it
delete store[ARC]; resetStatus();
startIn('astral', 'topdown');
const s2 = q(`(function(){ var s = astralSecretSpot(); return {x: s.x, y: s.y}; })()`);
q(`player.x = ${s2.x} - 500; player.y = ${s2.y}; camera.x = player.x - W/2; camera.y = player.y - H/2;`);
[fx, fy] = scr(s2.x, s2.y);
clickAt(fx, fy);
check(!unlocked(), 'cannot click it from more than 300 units away');

// paused: nothing
q(`player.x = ${s2.x} - 80; player.y = ${s2.y}; camera.x = player.x - W/2; camera.y = player.y - H/2; gamePaused = true;`);
[fx, fy] = scr(s2.x, s2.y);
clickAt(fx, fy);
q(`gamePaused = false;`);
check(!unlocked(), 'does nothing while paused');

// ---------- 5: other worlds have no spot ----------
const others = q(`WORLDS.filter(function(w){ return w.id !== 'astral'; }).map(function(w){ return w.id; })`);
let leaked = [];
for (const id of others) {
  startIn(id, 'topdown');
  if (q(`astralSecretSpot()`) !== null) leaked.push(id);
  // and a click where the spot WOULD be does nothing
  const sp = q(`({x: player.x + 80 * Math.SQRT1_2, y: player.y - 80 * Math.SQRT1_2})`);
  [fx, fy] = scr(sp.x, sp.y);
  clickAt(fx, fy);
}
check(leaked.length === 0 && !unlocked(), 'no spot in any of the other ' + others.length + ' worlds', leaked.join(','));

// ---------- through the real ArcadeShop, when it is loaded ----------
try {
  vm.runInNewContext(fs.readFileSync(require('path').join(require('path').dirname(process.argv[2] || 'index.html'), 'arcade-shop.js'), 'utf8'), ctx, { filename: 'arcade-shop.js', timeout: 10000 });
} catch (e) { console.log('  (arcade-shop.js did not load in the fake DOM: ' + e.message + ')'); }
if (q(`!!(window.ArcadeShop && ArcadeShop.update)`)) {
  store[ARC] = JSON.stringify({ coins: 7 });
  resetStatus();
  startIn('astral', 'topdown');
  const s3 = q(`(function(){ var s = astralSecretSpot(); return {x: s.x, y: s.y}; })()`);
  [fx, fy] = scr(s3.x, s3.y);
  clickAt(fx, fy);
  const sv = JSON.parse(store[ARC]);
  check(sv.mediumUnlocked === true && sv.coins === 7, 'with ArcadeShop loaded, ArcadeShop.update records it and keeps the coins');
}

console.log('\n' + (ok ? 'ASTRAL SECRET PASS' : 'ASTRAL SECRET FAIL'));
process.exit(ok ? 0 : 1);
