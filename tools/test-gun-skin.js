// Arcade gun skins repaint the GUN MODEL itself, not just the bullets:
//   - the 3D first-person viewmodel (built-in gun AND an equipped custom weapon; emblem untouched),
//   - the 2D top-down / third-person gun, and the raycast first-person gun sprite.
// Null restores the exact original colours; a rainbow skin animates on the gun.
//   node tools/test-gun-skin.js index.html
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
const ctx = vm.createContext(sandbox);
let fails = 0;
const check = (name, ok, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + name + (ok || extra === undefined ? '' : '  -> ' + extra)); if (!ok) fails++; };
const run = (s) => vm.runInContext(s, ctx, { filename: 'game.js', timeout: 30000 });
try { vm.runInContext(shopSrc, ctx, { filename: 'arcade-shop.js' }); } catch (e) { console.log('arcade-shop.js failed to load: ' + e.message); process.exit(1); }
try { run(code); } catch (e) { console.log('LOAD FAILED: ' + e.message); process.exit(1); }
console.log('load: OK');

const RUBY = { gun: { name: 'Odd Blue', bullet: '#13a4f7', glow: '#9ff0fe', trail: '#0b4f8a' } };   // colours nothing else on screen uses
const RAINBOW = { gun: { name: 'Rainbow', rainbow: true } };
const realNow = Date.now;
let fakeNow = 1000000;
const freezeTime = () => { Date.now = () => fakeNow; };
const thawTime = () => { Date.now = realNow; };

// ---------- frames in every camera mode with a gun skin on ----------
run(`window.applyArcadeSkins(${JSON.stringify(JSON.stringify(RUBY))});`);
for (const mode of ['topdown', 'thirdperson', 'firstperson', 'fp3d']) {
  try {
    run(`chosenClass = CLASSES.find(c => c.type !== 'melee'); playerName = 'GunSkin'; gameRunning = false;
         cameraMode = '${mode}'; startGame(); cameraMode = '${mode}';
         __clock = 0; _simLast = 0; _simAcc = 0; shooting = true;
         for (var i = 0; i < 60; i++) { __clock += 16.7; gameLoop(__clock); }`);
    check(mode + ': 60 frames with a gun skin', true);
  } catch (e) { check(mode + ': 60 frames with a gun skin', false, e.message); }
}

// ---------- 3D viewmodel: a fake THREE that remembers colours ----------
run(`
  var __realTHREE = THREE;
  function __C(h) { this.h = (h === undefined ? 0xffffff : h); }
  __C.prototype.getHex = function () { return this.h; };
  __C.prototype.setHex = function (h) { this.h = h; return this; };
  __C.prototype.set = function (c) { this.h = typeof c === 'string' ? parseInt(c.slice(1), 16) : c; return this; };
  function __Mat(o) { o = o || {}; this.color = new __C(o.color); this.emissive = new __C(o.emissive || 0);
    this.emissiveIntensity = o.emissiveIntensity === undefined ? 1 : o.emissiveIntensity;
    this.metalness = o.metalness === undefined ? 0 : o.metalness; this.userData = {}; }
  function __Obj() { this.children = []; this.userData = {};
    this.position = { set(){}, copy(){}, add(){} }; this.rotation = { x:0, y:0, z:0, set(){} };
    this.scale = { set(){}, setScalar(){} }; }
  __Obj.prototype.add = function (c) { this.children.push(c); return this; };
  __Obj.prototype.traverse = function (f) { f(this); for (const c of this.children) c.traverse(f); };
  function __Mesh(g, m) { __Obj.call(this); this.geometry = g; this.material = m; }
  __Mesh.prototype = Object.create(__Obj.prototype);
  var __fake = { Group: __Obj, Mesh: __Mesh, MeshStandardMaterial: __Mat, MeshBasicMaterial: __Mat };
  THREE = new Proxy(__fake, { get(t, k) { return k in t ? t[k] : function () { return { userData: {} }; }; } });
  function __mats(g) { var out = []; g.traverse(function (o) { if (o.material) out.push(o.material); }); return out; }
  function __snap(g) { return JSON.stringify(__mats(g).map(function (m) { return [m.color.h, m.emissive.h, m.emissiveIntensity, m.metalness]; })); }
`);
const hex = s => parseInt(s.slice(1), 16);
const pal = () => run('skinGunPalette()');
check('render3D tints the viewmodel every frame (change-gated)', /skinTintGun3D\(wg, !wantMelee\)/.test(code));

for (const [label, build] of [['built-in gun', '_buildVmGun()'], ['equipped rifle + skull emblem', "build3DWeapon('rifle', '#22cc88', 'skull')"]]) {
  run(`window.applyArcadeSkins(null); var __g = ${build}; var __orig = __snap(__g); skinTintGun3D(__g, true);`);
  check(label + ': no skin leaves it untouched', run('__snap(__g) === __orig'));
  run(`window.applyArcadeSkins(${JSON.stringify(JSON.stringify(RUBY))}); skinTintGun3D(__g, true);`);
  const p = pal();
  const roles = run(`JSON.stringify(__mats(__g).map(function (m) { return [m.userData.skinRole || '', m.color.h, m.emissive.h]; }))`);
  const R = JSON.parse(roles);
  const body = R.filter(r => r[0] === 'body');
  check(label + ': body takes the skin bullet colour', body.length > 0 && body.every(r => r[1] === hex(p.body)), roles);
  check(label + ': grip/stock take the darker accent', R.filter(r => r[0] === 'accent').every(r => r[1] === hex(p.accent)) && R.some(r => r[0] === 'accent'));
  check(label + ': sights/barrel glow in the skin glow', R.some(r => (r[0] === 'glow' || r[0] === 'barrel') && r[2] === hex(p.glow)));
  if (label.includes('emblem')) {
    const emb = R.filter(r => !r[0]);
    check(label + ': emblem keeps its own colours', emb.length > 0 && emb.every(r => r[1] === 0xf2f2f2 || r[1] === 0x1a1a1a || r[1] === 0xdfe9ee || r[1] === 0x22cc88), roles);
  }
  // Same skin again: nothing is rewritten (change-gated).
  run(`__mats(__g)[0].color.h = 0x123456; skinTintGun3D(__g, true);`);
  check(label + ': unchanged skin does not re-tint', run('__mats(__g)[0].color.h') === 0x123456);
  run(`window.applyArcadeSkins(null); skinTintGun3D(__g, true);`);
  check(label + ': null restores the exact original colours', run('__snap(__g) === __orig'), run('__snap(__g)') + ' vs ' + run('__orig'));
  run(`window.applyArcadeSkins(${JSON.stringify(JSON.stringify(RUBY))}); skinTintGun3D(__g, false);`);
  check(label + ': melee/off restores too', run('__snap(__g) === __orig'));
}
// Shared (pooled) materials are never mutated.
run(`var __pg = new THREE.Group(); var __pm = new THREE.MeshStandardMaterial({ color: 0x445566 }); __pm.userData.shared = true; __pm.userData.skinRole = 'body';
     __pg.add(new THREE.Mesh({}, __pm)); skinTintGun3D(__pg, true);`);
check('pooled (shared) material is not touched', run('__pm.color.h') === 0x445566);

// Rainbow: the gun colour changes over time.
freezeTime();
run(`window.applyArcadeSkins(${JSON.stringify(JSON.stringify(RAINBOW))}); var __rg = _buildVmGun(); skinTintGun3D(__rg, true);`);
const c1 = run('__mats(__rg)[1].color.h');
fakeNow += 400; run('skinTintGun3D(__rg, true)');
const c2 = run('__mats(__rg)[1].color.h');
fakeNow += 400; run('skinTintGun3D(__rg, true)');
const c3 = run('__mats(__rg)[1].color.h');
check('rainbow skin animates the 3D gun body', c1 !== c2 && c2 !== c3, [c1, c2, c3].map(x => x.toString(16)).join(','));
thawTime();
run('THREE = __realTHREE;');

// ---------- 2D / raycast: record the colours the gun is painted with ----------
run(`
  var __rec = [];
  var __c = document.getElementById('game').getContext('2d');
  var __fs = '#000', __ss = '#000';
  Object.defineProperty(__c, 'fillStyle',   { get(){ return __fs; }, set(v){ __fs = v; __rec.push(v); }, configurable: true });
  Object.defineProperty(__c, 'strokeStyle', { get(){ return __ss; }, set(v){ __ss = v; __rec.push(v); }, configurable: true });
  // Gradients record their colour stops too, so a gradient-filled part still shows its colour.
  __c.createLinearGradient = __c.createRadialGradient = function () { return { addColorStop: function (o, c) { __rec.push(c); } }; };
  function __draw2D(fn) { __rec = []; fn(); return __rec.filter(function (v) { return typeof v === 'string'; }); }
  chosenClass = CLASSES.find(c => c.type !== 'melee'); gameRunning = false; cameraMode = 'topdown'; startGame();
`);
const sameCtx = run("typeof ctx !== 'undefined' && ctx === __c");
check('recording the game canvas', sameCtx);
// The gun's own default colours (other parts of the figure/scene reuse #2d3436, so compare only these):
// top-down = grip #5d3a1a + barrel highlight #7f8c8d; raycast = everything drawn after the arm cuff (#222).
const GUN2D = [
  ['top-down/third-person gun', 'drawOnePlayer(player, true)', a => a, ['#5d3a1a', '#7f8c8d']],
  ['raycast first-person gun', 'drawFirstPerson()', a => a.slice(a.lastIndexOf('#222') + 1), ['#2d3436', '#1a1a1a', '#444', '#feca57']],
];
for (const [label, call, gunPart, defaults] of GUN2D) {
  run(`window.applyArcadeSkins(${JSON.stringify(JSON.stringify(RUBY))});`);
  const p = pal();
  const skinned = gunPart(run(`__draw2D(function(){ ${call}; })`));
  check(label + ': painted in the skin body colour', skinned.includes(p.body), skinned.join(' '));
  check(label + ': skin accent + glow on grip/sight/muzzle', skinned.includes(p.accent) && skinned.includes(p.glow));
  check(label + ': default gun colours gone', defaults.every(d => !skinned.includes(d)), skinned.join(' '));
  run('window.applyArcadeSkins(null);');
  const normal = gunPart(run(`__draw2D(function(){ ${call}; })`));
  check(label + ': null = normal gun colours back', defaults.every(d => normal.includes(d)) && !normal.includes(p.body), normal.join(' '));
}
// Equipped weapon in 2D: drawWeaponIcon with a palette repaints metal parts, shape unchanged.
run(`window.applyArcadeSkins(${JSON.stringify(JSON.stringify(RUBY))});`);
{
  const p = pal();
  const withPal = run(`__draw2D(function(){ drawWeaponIcon(__c, 'pistol', '#22cc88', 6, undefined, skinGunPalette()); })`);
  const without = run(`__draw2D(function(){ drawWeaponIcon(__c, 'pistol', '#22cc88', 6); })`);
  check('equipped weapon icon: same shape (same draw calls)', withPal.length === without.length, withPal.length + ' vs ' + without.length);
  check('equipped weapon icon: metal repainted in the skin', without.includes('#3a3f44') && !withPal.includes('#3a3f44') && withPal.includes(p.body) && withPal.includes(p.glow), withPal.join(' '));
}
// Rainbow in 2D.
freezeTime();
run(`window.applyArcadeSkins(${JSON.stringify(JSON.stringify(RAINBOW))});`);
const r1 = run('skinGunPalette().body'); fakeNow += 400; const r2 = run('skinGunPalette().body');
const d1 = run(`__draw2D(function(){ drawOnePlayer(player, true); })`);
check('rainbow skin animates the 2D gun', r1 !== r2 && d1.includes(r2), r1 + ' ' + r2);
thawTime();

// Mechanics untouched.
run('window.applyArcadeSkins(null);');
const base = run('JSON.stringify([player.damage, player.fireRate, player.maxAmmo, player.speed])');
run(`window.applyArcadeSkins(${JSON.stringify(JSON.stringify(RUBY))});`);
check('stats unchanged by a gun skin', run('JSON.stringify([player.damage, player.fireRate, player.maxAmmo, player.speed])') === base);

console.log(fails ? `\nGUN SKIN FAIL (${fails})` : '\nGUN SKIN PASS');
process.exit(fails ? 1 : 0);
