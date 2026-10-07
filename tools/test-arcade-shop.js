// The in-game 🛒 Skins shop: arcade-shop.js loads alongside the game, the Skins button opens it
// (pausing a running round), and a buy/equip changes ARCADE_SKINS and the 3D/raycast sky LIVE —
// including going back to the normal look when "Normal" is equipped again.
//   node tools/test-arcade-shop.js index.html
const fs = require('fs'), vm = require('vm'), path = require('path');
const file = process.argv[2] || 'index.html';
const html = fs.readFileSync(file, 'utf8');
const code = [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n;\n');
const shopSrc = fs.readFileSync(path.join(path.dirname(file), 'arcade-shop.js'), 'utf8');
const __created = [];
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
    __listeners: {}, addEventListener(t, h) { (real.__listeners[t] = real.__listeners[t] || []).push(h); }, removeEventListener() {}, dispatchEvent: () => true,
    offsetWidth: 0, __subs: {},
    setAttribute() {}, getAttribute: () => null, removeAttribute() {},
    focus() {}, blur() {}, click() {}, scrollIntoView() {}, insertAdjacentHTML() {},
    querySelector: (sel) => real.__subs[sel] || (real.__subs[sel] = mkEl(sel)), querySelectorAll: () => [], closest: () => null, contains: () => false,
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
    if(k==='createElement') return t=>(t==='canvas'?mkCanvas('tmp'):(__created.push(mkEl('new-'+t)), __created[__created.length-1]));
    if(k==='body'||k==='head') return mkEl(k);
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

sandbox.CustomEvent = function (type, init) { this.type = type; this.detail = init && init.detail; };
sandbox.URLSearchParams = URLSearchParams;
// A stale hub URL param says "Sunny Day" — the in-game shop must be able to change it anyway.
sandbox.location.search = '?arcadeSkins=' + encodeURIComponent(JSON.stringify({ bg: { sky: '#7ec8ff', fog: '#bfe3ff', ground: '#5a9e3a', light: '#fff6e0' } }));
store['daniels-arcade-v1'] = JSON.stringify({ coins: 50 });
const ctx = vm.createContext(sandbox);

let fails = 0;
const check = (name, ok, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + name + (ok || extra === undefined ? '' : '  -> ' + extra)); if (!ok) fails++; };
const run = (s) => vm.runInContext(s, ctx, { filename: 'game.js', timeout: 30000 });

try { vm.runInContext(shopSrc, ctx, { filename: 'arcade-shop.js' }); } catch (e) { console.log('arcade-shop.js failed to load: ' + e.message); process.exit(1); }
try { run(code); } catch (e) { console.log('LOAD FAILED: ' + e.message); process.exit(1); }
console.log('load: OK');

check('ArcadeShop defined', run('typeof ArcadeShop') === 'object');
check('applyArcadeSkins defined', run('typeof window.applyArcadeSkins') === 'function');
check('Skins buttons in the menu and pause screen', /id="skins-btn"[^>]*onclick="openSkinShop\(\)"/.test(html) && /id="pause-skins-btn"[^>]*onclick="openSkinShop\(\)"/.test(html));
check('startup reads the URL param', run('ARCADE_SKINS.bg && ARCADE_SKINS.bg.sky') === '#7ec8ff');

// A fake 3D scene that remembers colours, so the live refresh can be checked.
run(`
  function __Col(h) { this.h = h || 0; }
  __Col.prototype.setHex = function (h) { this.h = h; return this; };
  __Col.prototype.set = function (c) { this.h = typeof c === 'string' ? parseInt(c.slice(1), 16) : c; return this; };
  __Col.prototype.lerp = function () { return this; };
  var __hemi = { isHemisphereLight: true, color: new __Col(), groundColor: new __Col(), intensity: 1 };
  var __scene = { fog: { color: new __Col() }, background: new __Col(), traverse(f) { f(__hemi); } };
  _three = { scene: __scene, ground: { material: { color: new __Col() } } };
  _three_sky = { material: { uniforms: { topColor: { value: new __Col() }, bottomColor: { value: new __Col() } } } };
  _three_stars = { visible: false };
  chosenClass = CLASSES[0]; playerName = 'ShopTest'; gameRunning = false; cameraMode = 'topdown';
  startGame();
  _three = { scene: __scene, ground: { material: { color: new __Col() } } };   // startGame may have rebuilt it
`);
check('round is running, not paused', run('gameRunning && !gamePaused') === true);
run('openSkinShop()');
check('opening the shop mid-round pauses', run('gamePaused') === true);
check('shop is open', run('ArcadeShop.isOpen()') === true);

const veil = __created.find(e => e.className === 'as-veil');
check('shop window created', !!veil);
const click = (dataset) => {
  const t = { dataset, closest: () => t };
  for (const h of veil.__listeners.click) h({ target: t });
};

// Backgrounds tab, buy "Night" (3 coins).
click({ tab: 'Backgrounds' });
click({ buy: 'bg-night' });
const save = run('ArcadeShop.load()');
check('coins spent (50 -> 47)', save.coins === 47, save.coins);
check('ARCADE_SKINS.bg is Night', run('ARCADE_SKINS.bg && ARCADE_SKINS.bg.sky') === '#0a1030', run('JSON.stringify(ARCADE_SKINS.bg)'));
check('worldSky() uses the new bg', run('worldSky(currentWorld, _timeOfDay).top') === 0x0a1030 && run('worldSky(currentWorld, _timeOfDay).bot') === 0x10183a);
check('3D sky dome updated', run('_three_sky.material.uniforms.topColor.value.h') === 0x0a1030);
check('3D fog updated', run('__scene.fog.color.h') === 0x10183a);
check('hemisphere light updated', run('__hemi.color.h') === 0x7a8aff);

// Gun + ability skins.
click({ tab: 'Gun Skins' }); click({ buy: 'gun-ruby' });
check('bullet colour is Ruby', run('skinBulletColor()') === '#ff2d55', run('skinBulletColor()'));
click({ tab: 'Ability Skins' }); click({ buy: 'ab-arcane' });
check('ability colour is Arcane', run('skinAbilityColor(0)') === '#b36bff' && run('skinAbilityColor(1)') === '#4ae3ff');

// Back to Normal: everything returns to the game's own look.
click({ tab: 'Backgrounds' }); click({ use: 'bg-none' });
click({ tab: 'Gun Skins' }); click({ use: 'gun-none' });
check('bg slot cleared', run('ARCADE_SKINS.bg') === null);
check('gun slot cleared', run('skinBulletColor()') === null);
const normal = run('(function(){ var o = WORLD_SKY[currentWorld && currentWorld.id]; return o ? _tintHex(o.top, _timeOfDay.groundTint) : _timeOfDay.skyTop; })()');
check('worldSky() back to the world sky', run('worldSky(currentWorld, _timeOfDay).top') === normal);
check('3D sky dome back to the world sky', run('_three_sky.material.uniforms.topColor.value.h') === normal);
check('hemisphere light back to time of day', run('__hemi.color.h') === run('_timeOfDay.hemiTop'));
check('fog cache reset so render3D re-applies world fog', run('_three._fogHex') === undefined);
check('stale URL param not re-read', run('window.applyArcadeSkins() && ARCADE_SKINS.bg') === null);

// Frames still run with the shop's skins in place.
try { run('gamePaused = false; for (var i = 0; i < 30; i++) { __clock += 16.7; gameLoop(__clock); }'); check('game loop runs after skin changes', true); }
catch (e) { check('game loop runs after skin changes', false, e.message); }

console.log(fails ? `\nARCADE SHOP FAIL (${fails})` : '\nARCADE SHOP PASS');
process.exit(fails ? 1 : 0);
