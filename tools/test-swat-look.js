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
function check(pass,label,extra){ if(!pass) ok=false; console.log('  '+(pass?'PASS':'FAIL'),label+(extra?'  ('+extra+')':'')); }

console.log('\nplayers look like SWAT officers:\n');

// ---------- 3D: a tiny fake THREE that REMEMBERS what it builds ----------
// The sandbox THREE is a tolerant stub where every read is a proxy, so names and materials cannot be
// inspected. Swap in real little objects for the duration of the build.
q(`
  var __FT = (function(){
    function V(){ return { set: function(){}, setScalar: function(){}, copy: function(){} }; }
    function Obj(){ this.position = V(); this.rotation = {}; this.scale = V(); this.userData = {}; this.name = ''; }
    function Group(){ Obj.call(this); this.children = []; }
    Group.prototype.add = function(m){ this.children.push(m); return this; };
    function Mesh(geo, mat){ Obj.call(this); this.geometry = geo; this.material = mat; }
    function Mat(o){ Object.assign(this, o || {}); this.userData = {}; }
    function Geo(){ this.userData = {}; this.args = [].slice.call(arguments); }
    var ft = { Group: Group, Mesh: Mesh, MeshStandardMaterial: Mat, MeshBasicMaterial: Mat,
      SphereGeometry: Geo, BoxGeometry: Geo, CylinderGeometry: Geo, ConeGeometry: Geo, TorusGeometry: Geo,
      CircleGeometry: Geo, PlaneGeometry: Geo, CapsuleGeometry: Geo, OctahedronGeometry: Geo,
      DodecahedronGeometry: Geo, RingGeometry: Geo,
      RepeatWrapping: 1000, SRGBColorSpace: 'srgb', textures: 0, lights: 0 };
    ft.CanvasTexture = function(c){ ft.textures++; this.image = c; this.userData = {}; };
    ft.PointLight = ft.SpotLight = function(){ ft.lights++; Obj.call(this); };
    return ft;
  })();
  var __realTHREE = THREE;
  function __withFake(fn){ THREE = __FT; try { return fn(); } finally { THREE = __realTHREE; } }
  _pfMat.clear(); _swatCamoCache.clear();
`);

const partNames = ['helmet', 'visor', 'vest', 'pouch', 'belt', 'glove', 'elbowpad', 'kneepad', 'boot'];
const parts = JSON.parse(q(`__withFake(function(){
  var g = makePlayerFigure(CLASSES[0]), out = {};
  Object.keys(g.userData.parts).forEach(function(k){ out[k] = g.userData.parts[k].length; });
  return JSON.stringify({ parts: out, meshes: g.children.length, head: !!g.userData.head }); })`));
for (const n of partNames) check(parts.parts[n] > 0, 'the 3D figure has a ' + n, (parts.parts[n] || 0) + ' mesh(es)');
check(parts.parts.glove === 2 && parts.parts.kneepad === 2 && parts.parts.boot === 2, 'two gloves, two kneepads, two boots');
check(parts.head, 'the figure still exposes its head');
check(parts.meshes >= 25 && parts.meshes <= 40, 'mesh budget stays reasonable', parts.meshes + ' meshes');
check(q(`__FT.lights`) === 0, 'the figure adds no lights');
const gojo3d = JSON.parse(q(`__withFake(function(){
  var g = makePlayerFigure(CLASSES.find(function(c){ return c.name === 'Gojo'; })), p = g.userData.parts;
  return JSON.stringify({ hair: (p.hair||[]).length, fold: (p.blindfold||[]).length, meshes: g.children.length,
    shared: g.children.every(function(m){ return m.material && m.material.userData.shared; }) }); })`));
check(gojo3d.hair > 0 && gojo3d.fold === 1 && gojo3d.meshes <= 40 && gojo3d.shared,
      'Gojo wears white spiky hair and a blindfold in 3D, inside the mesh budget', gojo3d.meshes + ' meshes');
check(q(`__withFake(function(){ var g = makePlayerFigure(CLASSES[0]);
  return g.children.every(function(m){ return m.material && m.material.userData.shared; }); })`) === true,
  'every material comes from the shared _pf pool');

// The green-dot texture: one per colour, built once, reused.
const tex = JSON.parse(q(`__withFake(function(){
  _pfMat.clear(); _swatCamoCache.clear(); __FT.textures = 0;
  var a = CLASSES.find(function(c){ return c.name === 'Saber'; });
  var b = CLASSES.find(function(c){ return c.name === 'Storm Caller'; });
  var g1 = makePlayerFigure(a), afterOne = __FT.textures;
  for (var i = 0; i < 5; i++) makePlayerFigure(a);
  var afterSix = __FT.textures;
  var t1 = swatCamoTexture(a.armorColor), t2 = swatCamoTexture(a.armorColor);
  var g2 = makePlayerFigure(b), afterB = __FT.textures;
  var suit = function(g){ return g.children.find(function(m){ return m.name === 'torso'; }).material; };
  var vest = function(g){ return g.children.find(function(m){ return m.name === 'vest'; }).material; };
  return JSON.stringify({ afterOne: afterOne, afterSix: afterSix, afterB: afterB, same: t1 === t2,
    mapIsCached: suit(g1).map === t1, suitDiffers: suit(g1).map !== suit(g2).map,
    vestDiffers: vest(g1).color !== vest(g2).color, cacheKeys: Array.from(_swatCamoCache.keys()),
    colA: a.armorColor, colB: b.armorColor, wrap: t1.wrapS === __FT.RepeatWrapping });
})`));
check(tex.afterOne === 1, 'the first figure paints one camo texture', tex.afterOne);
check(tex.afterSix === 1 && tex.same && tex.mapIsCached, 'the camo texture is cached and reused for the same colour');
check(tex.afterB === 2, 'a second suit colour gets its own texture', tex.afterB);
check(tex.wrap, 'the camo texture tiles around the limbs');
check(tex.colA !== tex.colB && tex.suitDiffers && tex.vestDiffers, 'two classes wear different suit colours',
  tex.colA + ' vs ' + tex.colB);
check(q(`(function(){ var x = SWAT_DOT_GREENS.every(function(c){ var n = parseInt(c.slice(1), 16);
  var r = n >> 16, g = (n >> 8) & 255, b = n & 255; return g > r && g > b; }); return x; })()`) === true,
  'the camo dots are green');
q(`_swatCamoCache.clear(); _pfMat.clear();`);

// ---------- 2D: top-down and third-person for every class ----------
q(`
  var __rec = [];
  var __c = document.getElementById('game').getContext('2d');
  var __fs = '#000', __ss = '#000';
  Object.defineProperty(__c, 'fillStyle',   { get(){ return __fs; }, set(v){ __fs = v; __rec.push(v); }, configurable: true });
  Object.defineProperty(__c, 'strokeStyle', { get(){ return __ss; }, set(v){ __ss = v; __rec.push(v); }, configurable: true });
  __c.createLinearGradient = __c.createRadialGradient = function () { return { addColorStop: function (o, c) { __rec.push(c); } }; };
  chosenClass = CLASSES.find(function(c){ return c.type !== 'melee'; }); gameRunning = false; cameraMode = 'topdown'; startGame();
`);
check(q(`typeof ctx !== 'undefined' && ctx === __c`) === true, 'recording the game canvas');
const r2d = JSON.parse(q(`(function(){
  var bad = [], noDots = [], noVisor = [], noGlove = [], suits = {};
  ['topdown', 'thirdperson'].forEach(function(mode){
    cameraMode = mode;
    CLASSES.forEach(function(c){
      [true, false].forEach(function(local){
        player.cls = c; player.meleeSwing = 0;
        __rec = [];
        try { drawOnePlayer(player, local); } catch (e) { bad.push(mode + '/' + c.name + ': ' + e.message); return; }
        var cols = __rec.filter(function(v){ return typeof v === 'string'; });
        if (!SWAT_DOT_GREENS.some(function(g){ return cols.indexOf(g) >= 0; })) noDots.push(mode + '/' + c.name);
        if (cols.indexOf('#0b0f14') < 0) noVisor.push(mode + '/' + c.name);
        if (cols.indexOf('#23272b') < 0) noGlove.push(mode + '/' + c.name);
        if (mode === 'topdown' && local) suits[c.name] = swatDark(c.armorColor, 0.55);
      });
    });
  });
  cameraMode = 'topdown';
  var distinct = Object.keys(suits).map(function(k){ return suits[k]; }).filter(function(v, i, a){ return a.indexOf(v) === i; }).length;
  return JSON.stringify({ bad: bad, noDots: noDots, noVisor: noVisor, noGlove: noGlove, distinct: distinct, n: CLASSES.length });
})()`));
check(r2d.bad.length === 0, 'every class draws in top-down and third-person without throwing', r2d.bad.slice(0, 3).join(' | '));
check(r2d.noDots.length === 0, 'every class draws green camo dots', r2d.noDots.slice(0, 3).join(' | '));
check(r2d.noVisor.length === 0, 'every class draws the dark helmet visor', r2d.noVisor.slice(0, 3).join(' | '));
check(r2d.noGlove.length === 0, 'every class draws gloves / pads', r2d.noGlove.slice(0, 3).join(' | '));
check(r2d.distinct > r2d.n / 2, 'vest colours vary by class', r2d.distinct + ' distinct of ' + r2d.n);
// Status tint still reaches the suit (frozen = ice blue).
check(q(`(function(){ player.cls = CLASSES[0]; player.frozen = 30; __rec = []; drawOnePlayer(player, true); player.frozen = 0;
  return __rec.indexOf('#48dbfb') >= 0; })()`) === true, 'a frozen player still shows the frozen colour on the suit');

console.log(ok ? '\nSWAT LOOK PASS' : '\nSWAT LOOK FAIL');
process.exit(ok ? 0 : 1);
