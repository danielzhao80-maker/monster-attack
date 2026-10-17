// Wave monsters look like what their names say. Every one used to be the same zombie with an emoji,
// so a Comet, a Riot Husk and a Torch Thug all looked alike. This checks:
//   1. every WORLD_MONSTERS name (and the five base classes) maps to a look — plan, surface, props —
//      explicitly, with no name falling back to the plain zombie; unknown names go by keyword/world;
//   2. each body plan builds in 3D with its expected parts, light on meshes, pooled trim, no lights,
//      a far stand-in, the ability mutation on top; bosses keep their own bodies;
//   3. the 2D drawing runs for every world's monsters in top-down, third-person and first-person;
//   4. a multiplayer guest derives the same look from the packet it already gets;
//   5. mechanics (r, speed, hp, damage, score, flags) match a baseline recorded before the change.
// Usage: node tools/test-monster-looks.js index.html
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
  setTimeout:(fn)=>{ if(typeof fn==='function') sandbox.__deferred.push(fn); return 1; }, __deferred: [],
  clearTimeout:()=>{}, setInterval:()=>1, clearInterval:()=>{},
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
try { vm.runInNewContext(code, ctx, { filename:'game.js', timeout:20000 }); }
catch (e) { console.log('FAILED during LOAD: ' + e.message); process.exit(1); }
console.log('load        : OK');
function q(js){ return vm.runInNewContext(js, ctx, {filename:'game.js', timeout:60000}); }
let ok = true;
function check(pass,label,extra){ if(!pass) ok=false; console.log('  '+(pass?'PASS':'FAIL'),label+(extra?'  ('+extra+')':'')); }
// ---------- 5 (run first, on a fresh game). mechanics: identical to the game before the looks ----------
const MECH_PROBE = `(function(){
  var seed = 777; Math.random = function(){ seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  chosenClass = CLASSES[0]; gameRunning = false; cameraMode = 'topdown'; startGame(); gameRunning = true;
  var out = {};
  WORLDS.forEach(function(w){
    currentWorld = w; _themedCache.clear();
    ['Frost','Flame','Shield','Mad Mom','Miku'].forEach(function(bn){
      [1, 7].forEach(function(wv){
        wave = wv; monsters = [];
        currentMonsterClass = themeMonster(MONSTER_CLASSES.find(function(c){ return c.name === bn; }));
        spawnMonster();
        var m = monsters[0];
        out[w.id + ':' + bn + ':' + wv] = [m.r, m.speed, m.hp, m.maxHp, m.damage, m.score, !!m.isRanged, m.freezeDuration, !!m.flaming, !!m.hasShield, !!m.canScream, !!m.canSwallow, m.name, m.color].join(',');
      });
    });
  });
  currentWorld = WORLDS[0]; _themedCache.clear(); monsters = [];
  return JSON.stringify(out);
})()`;

// Recorded from index.html BEFORE monsters got their looks: r, speed, hp, maxHp, damage, score, the
// ability flags, name and colour, for all 36 worlds x 5 wave classes x waves 1 and 7, seeded RNG.
const MECH_BASELINE = {"city:Frost:1":"14,1,70,70,5,11,true,300,false,false,false,false,Sewer Lurker,#6b8f71","city:Frost:7":"14,1,154,154,7,17,true,300,false,false,false,false,Sewer Lurker,#6b8f71","city:Flame:1":"14,1.5,70,70,8,13,false,0,true,false,false,false,Torch Thug,#e25822","city:Flame:7":"14,1.5,154,154,10,19,false,0,true,false,false,false,Torch Thug,#e25822","city:Shield:1":"14,1.1,70,70,8,16,false,0,false,true,false,false,Riot Husk,#7f8c8d","city:Shield:7":"14,1.1,154,154,10,22,false,0,false,true,false,false,Riot Husk,#7f8c8d","city:Mad Mom:1":"14,1.2,105,105,10,21,false,0,false,false,true,false,Screaming Karen,#c0392b","city:Mad Mom:7":"14,1.2,231,231,12,27,false,0,false,false,true,false,Screaming Karen,#c0392b","city:Miku:1":"14,1.3,84,84,5,31,false,0,false,false,false,true,Miku,#39c5bb","city:Miku:7":"14,1.3,184,184,7,37,false,0,false,false,false,true,Miku,#39c5bb","desert:Frost:1":"14,1,70,70,5,11,true,300,false,false,false,false,Sand Spitter,#d9b382","desert:Frost:7":"14,1,154,154,7,17,true,300,false,false,false,false,Sand Spitter,#d9b382","desert:Flame:1":"14,1.5,70,70,8,13,false,0,true,false,false,false,Sunstroke,#e8963c","desert:Flame:7":"14,1.5,154,154,10,19,false,0,true,false,false,false,Sunstroke,#e8963c","desert:Shield:1":"14,1.1,70,70,8,16,false,0,false,true,false,false,Scarab Shell,#9c7a3f","desert:Shield:7":"14,1.1,154,154,10,22,false,0,false,true,false,false,Scarab Shell,#9c7a3f","desert:Mad Mom:1":"14,1.2,105,105,10,21,false,0,false,false,true,false,Wailing Widow,#b5651d","desert:Mad Mom:7":"14,1.2,231,231,12,27,false,0,false,false,true,false,Wailing Widow,#b5651d","desert:Miku:1":"14,1.3,84,84,5,31,false,0,false,false,false,true,Miku,#39c5bb","desert:Miku:7":"14,1.3,184,184,7,37,false,0,false,false,false,true,Miku,#39c5bb","circus:Frost:1":"14,1,70,70,5,11,true,300,false,false,false,false,Ice Juggler,#7fd4e0","circus:Frost:7":"14,1,154,154,7,17,true,300,false,false,false,false,Ice Juggler,#7fd4e0","circus:Flame:1":"14,1.5,70,70,8,13,false,0,true,false,false,false,Fire Eater,#e8553c","circus:Flame:7":"14,1.5,154,154,10,19,false,0,true,false,false,false,Fire Eater,#e8553c","circus:Shield:1":"14,1.1,70,70,8,16,false,0,false,true,false,false,Strongman,#8d6e63","circus:Shield:7":"14,1.1,154,154,10,22,false,0,false,true,false,false,Strongman,#8d6e63","circus:Mad Mom:1":"14,1.2,105,105,10,21,false,0,false,false,true,false,Shrieking Clown,#d63384","circus:Mad Mom:7":"14,1.2,231,231,12,27,false,0,false,false,true,false,Shrieking Clown,#d63384","circus:Miku:1":"14,1.3,84,84,5,31,false,0,false,false,false,true,Miku,#39c5bb","circus:Miku:7":"14,1.3,184,184,7,37,false,0,false,false,false,true,Miku,#39c5bb","jungle:Frost:1":"14,1,70,70,5,11,true,300,false,false,false,false,Blowdart Ape,#6b8f4e","jungle:Frost:7":"14,1,154,154,7,17,true,300,false,false,false,false,Blowdart Ape,#6b8f4e","jungle:Flame:1":"14,1.5,70,70,8,13,false,0,true,false,false,false,Ember Vine,#c75b2a","jungle:Flame:7":"14,1.5,154,154,10,19,false,0,true,false,false,false,Ember Vine,#c75b2a","jungle:Shield:1":"14,1.1,70,70,8,16,false,0,false,true,false,false,Bark Hulk,#7a5c3a","jungle:Shield:7":"14,1.1,154,154,10,22,false,0,false,true,false,false,Bark Hulk,#7a5c3a","jungle:Mad Mom:1":"14,1.2,105,105,10,21,false,0,false,false,true,false,Howler,#a0522d","jungle:Mad Mom:7":"14,1.2,231,231,12,27,false,0,false,false,true,false,Howler,#a0522d","jungle:Miku:1":"14,1.3,84,84,5,31,false,0,false,false,false,true,Miku,#39c5bb","jungle:Miku:7":"14,1.3,184,184,7,37,false,0,false,false,false,true,Miku,#39c5bb","arctic:Frost:1":"14,1,70,70,5,11,true,300,false,false,false,false,Ice Crawler,#bfe9ff","arctic:Frost:7":"14,1,154,154,7,17,true,300,false,false,false,false,Ice Crawler,#bfe9ff","arctic:Flame:1":"14,1.5,70,70,8,13,false,0,true,false,false,false,Frostbite,#9fd8ef","arctic:Flame:7":"14,1.5,154,154,10,19,false,0,true,false,false,false,Frostbite,#9fd8ef","arctic:Shield:1":"14,1.1,70,70,8,16,false,0,false,true,false,false,Glacier Guard,#8ec6e6","arctic:Shield:7":"14,1.1,154,154,10,22,false,0,false,true,false,false,Glacier Guard,#8ec6e6","arctic:Mad Mom:1":"14,1.2,105,105,10,21,false,0,false,false,true,false,Banshee of the Floe,#c7e8f5","arctic:Mad Mom:7":"14,1.2,231,231,12,27,false,0,false,false,true,false,Banshee of the Floe,#c7e8f5","arctic:Miku:1":"14,1.3,84,84,5,31,false,0,false,false,false,true,Miku,#39c5bb","arctic:Miku:7":"14,1.3,184,184,7,37,false,0,false,false,false,true,Miku,#39c5bb","volcano:Frost:1":"14,1,70,70,5,11,true,300,false,false,false,false,Cinder Spitter,#c0392b","volcano:Frost:7":"14,1,154,154,7,17,true,300,false,false,false,false,Cinder Spitter,#c0392b","volcano:Flame:1":"14,1.5,70,70,8,13,false,0,true,false,false,false,Magma Hound,#ff5a1f","volcano:Flame:7":"14,1.5,154,154,10,19,false,0,true,false,false,false,Magma Hound,#ff5a1f","volcano:Shield:1":"14,1.1,70,70,8,16,false,0,false,true,false,false,Obsidian Shell,#3a2a2a","volcano:Shield:7":"14,1.1,154,154,10,22,false,0,false,true,false,false,Obsidian Shell,#3a2a2a","volcano:Mad Mom:1":"14,1.2,105,105,10,21,false,0,false,false,true,false,Screaming Vent,#e25822","volcano:Mad Mom:7":"14,1.2,231,231,12,27,false,0,false,false,true,false,Screaming Vent,#e25822","volcano:Miku:1":"14,1.3,84,84,5,31,false,0,false,false,false,true,Miku,#39c5bb","volcano:Miku:7":"14,1.3,184,184,7,37,false,0,false,false,false,true,Miku,#39c5bb","ocean:Frost:1":"14,1,70,70,5,11,true,300,false,false,false,false,Brine Spitter,#3ba3c9","ocean:Frost:7":"14,1,154,154,7,17,true,300,false,false,false,false,Brine Spitter,#3ba3c9","ocean:Flame:1":"14,1.5,70,70,8,13,false,0,true,false,false,false,Vent Crawler,#e07a3c","ocean:Flame:7":"14,1.5,154,154,10,19,false,0,true,false,false,false,Vent Crawler,#e07a3c","ocean:Shield:1":"14,1.1,70,70,8,16,false,0,false,true,false,false,Clam Guard,#8fb8c4","ocean:Shield:7":"14,1.1,154,154,10,22,false,0,false,true,false,false,Clam Guard,#8fb8c4","ocean:Mad Mom:1":"14,1.2,105,105,10,21,false,0,false,false,true,false,Siren,#2e8fa3","ocean:Mad Mom:7":"14,1.2,231,231,12,27,false,0,false,false,true,false,Siren,#2e8fa3","ocean:Miku:1":"14,1.3,84,84,5,31,false,0,false,false,false,true,Miku,#39c5bb","ocean:Miku:7":"14,1.3,184,184,7,37,false,0,false,false,false,true,Miku,#39c5bb","space:Frost:1":"14,1,70,70,5,11,true,300,false,false,false,false,Cryo Drone,#8fd4ff","space:Frost:7":"14,1,154,154,7,17,true,300,false,false,false,false,Cryo Drone,#8fd4ff","space:Flame:1":"14,1.5,70,70,8,13,false,0,true,false,false,false,Plasma Drone,#ff7a3c","space:Flame:7":"14,1.5,154,154,10,19,false,0,true,false,false,false,Plasma Drone,#ff7a3c","space:Shield:1":"14,1.1,70,70,8,16,false,0,false,true,false,false,Hull Sentry,#9aa5b1","space:Shield:7":"14,1.1,154,154,10,22,false,0,false,true,false,false,Hull Sentry,#9aa5b1","space:Mad Mom:1":"14,1.2,105,105,10,21,false,0,false,false,true,false,Comms Screamer,#b06fd0","space:Mad Mom:7":"14,1.2,231,231,12,27,false,0,false,false,true,false,Comms Screamer,#b06fd0","space:Miku:1":"14,1.3,84,84,5,31,false,0,false,false,false,true,Miku,#39c5bb","space:Miku:7":"14,1.3,184,184,7,37,false,0,false,false,false,true,Miku,#39c5bb","boneyard:Frost:1":"14,1,70,70,5,11,true,300,false,false,false,false,Grave Chill,#9fb0b8","boneyard:Frost:7":"14,1,154,154,7,17,true,300,false,false,false,false,Grave Chill,#9fb0b8","boneyard:Flame:1":"14,1.5,70,70,8,13,false,0,true,false,false,false,Pyre Wretch,#d8703c","boneyard:Flame:7":"14,1.5,154,154,10,19,false,0,true,false,false,false,Pyre Wretch,#d8703c","boneyard:Shield:1":"14,1.1,70,70,8,16,false,0,false,true,false,false,Crypt Guard,#6f7a6b","boneyard:Shield:7":"14,1.1,154,154,10,22,false,0,false,true,false,false,Crypt Guard,#6f7a6b","boneyard:Mad Mom:1":"14,1.2,105,105,10,21,false,0,false,false,true,false,Wailing Widow,#a8b8c0","boneyard:Mad Mom:7":"14,1.2,231,231,12,27,false,0,false,false,true,false,Wailing Widow,#a8b8c0","boneyard:Miku:1":"14,1.3,84,84,5,31,false,0,false,false,false,true,Miku,#39c5bb","boneyard:Miku:7":"14,1.3,184,184,7,37,false,0,false,false,false,true,Miku,#39c5bb","candy:Frost:1":"14,1,70,70,5,11,true,300,false,false,false,false,Slush Gob,#8fd8e8","candy:Frost:7":"14,1,154,154,7,17,true,300,false,false,false,false,Slush Gob,#8fd8e8","candy:Flame:1":"14,1.5,70,70,8,13,false,0,true,false,false,false,Hot Cinnamon,#e0503c","candy:Flame:7":"14,1.5,154,154,10,19,false,0,true,false,false,false,Hot Cinnamon,#e0503c","candy:Shield:1":"14,1.1,70,70,8,16,false,0,false,true,false,false,Gobstopper,#d88fc0","candy:Shield:7":"14,1.1,154,154,10,22,false,0,false,true,false,false,Gobstopper,#d88fc0","candy:Mad Mom:1":"14,1.2,105,105,10,21,false,0,false,false,true,false,Sour Screamer,#e8d24c","candy:Mad Mom:7":"14,1.2,231,231,12,27,false,0,false,false,true,false,Sour Screamer,#e8d24c","candy:Miku:1":"14,1.3,84,84,5,31,false,0,false,false,false,true,Miku,#39c5bb","candy:Miku:7":"14,1.3,184,184,7,37,false,0,false,false,false,true,Miku,#39c5bb","swamp:Frost:1":"14,1,70,70,5,11,true,300,false,false,false,false,Bog Spitter,#6f8f6a","swamp:Frost:7":"14,1,154,154,7,17,true,300,false,false,false,false,Bog Spitter,#6f8f6a","swamp:Flame:1":"14,1.5,70,70,8,13,false,0,true,false,false,false,Marsh Gas,#b8a03c","swamp:Flame:7":"14,1.5,154,154,10,19,false,0,true,false,false,false,Marsh Gas,#b8a03c","swamp:Shield:1":"14,1.1,70,70,8,16,false,0,false,true,false,false,Shell Lurker,#5f7a52","swamp:Shield:7":"14,1.1,154,154,10,22,false,0,false,true,false,false,Shell Lurker,#5f7a52","swamp:Mad Mom:1":"14,1.2,105,105,10,21,false,0,false,false,true,false,Croaker,#7ea34c","swamp:Mad Mom:7":"14,1.2,231,231,12,27,false,0,false,false,true,false,Croaker,#7ea34c","swamp:Miku:1":"14,1.3,84,84,5,31,false,0,false,false,false,true,Miku,#39c5bb","swamp:Miku:7":"14,1.3,184,184,7,37,false,0,false,false,false,true,Miku,#39c5bb","mountain:Frost:1":"14,1,70,70,5,11,true,300,false,false,false,false,Snowcap,#cfe0e8","mountain:Frost:7":"14,1,154,154,7,17,true,300,false,false,false,false,Snowcap,#cfe0e8","mountain:Flame:1":"14,1.5,70,70,8,13,false,0,true,false,false,false,Rockslide,#9a8878","mountain:Flame:7":"14,1.5,154,154,10,19,false,0,true,false,false,false,Rockslide,#9a8878","mountain:Shield:1":"14,1.1,70,70,8,16,false,0,false,true,false,false,Cliff Guard,#7f8c8d","mountain:Shield:7":"14,1.1,154,154,10,22,false,0,false,true,false,false,Cliff Guard,#7f8c8d","mountain:Mad Mom:1":"14,1.2,105,105,10,21,false,0,false,false,true,false,Echo Howler,#a89e8c","mountain:Mad Mom:7":"14,1.2,231,231,12,27,false,0,false,false,true,false,Echo Howler,#a89e8c","mountain:Miku:1":"14,1.3,84,84,5,31,false,0,false,false,false,true,Miku,#39c5bb","mountain:Miku:7":"14,1.3,184,184,7,37,false,0,false,false,false,true,Miku,#39c5bb","factory:Frost:1":"14,1,70,70,5,11,true,300,false,false,false,false,Coolant Leak,#8fc4d8","factory:Frost:7":"14,1,154,154,7,17,true,300,false,false,false,false,Coolant Leak,#8fc4d8","factory:Flame:1":"14,1.5,70,70,8,13,false,0,true,false,false,false,Slag Worker,#d8703c","factory:Flame:7":"14,1.5,154,154,10,19,false,0,true,false,false,false,Slag Worker,#d8703c","factory:Shield:1":"14,1.1,70,70,8,16,false,0,false,true,false,false,Rivet Hulk,#8a8f94","factory:Shield:7":"14,1.1,154,154,10,22,false,0,false,true,false,false,Rivet Hulk,#8a8f94","factory:Mad Mom:1":"14,1.2,105,105,10,21,false,0,false,false,true,false,Klaxon,#d8a03c","factory:Mad Mom:7":"14,1.2,231,231,12,27,false,0,false,false,true,false,Klaxon,#d8a03c","factory:Miku:1":"14,1.3,84,84,5,31,false,0,false,false,false,true,Miku,#39c5bb","factory:Miku:7":"14,1.3,184,184,7,37,false,0,false,false,false,true,Miku,#39c5bb","cyber:Frost:1":"14,1,70,70,5,11,true,300,false,false,false,false,Ice Daemon,#6fe0ff","cyber:Frost:7":"14,1,154,154,7,17,true,300,false,false,false,false,Ice Daemon,#6fe0ff","cyber:Flame:1":"14,1.5,70,70,8,13,false,0,true,false,false,false,Overclock,#ff5ad8","cyber:Flame:7":"14,1.5,154,154,10,19,false,0,true,false,false,false,Overclock,#ff5ad8","cyber:Shield:1":"14,1.1,70,70,8,16,false,0,false,true,false,false,Firewall,#5a7fff","cyber:Shield:7":"14,1.1,154,154,10,22,false,0,false,true,false,false,Firewall,#5a7fff","cyber:Mad Mom:1":"14,1.2,105,105,10,21,false,0,false,false,true,false,Feedback,#c05aff","cyber:Mad Mom:7":"14,1.2,231,231,12,27,false,0,false,false,true,false,Feedback,#c05aff","cyber:Miku:1":"14,1.3,84,84,5,31,false,0,false,false,false,true,Miku,#39c5bb","cyber:Miku:7":"14,1.3,184,184,7,37,false,0,false,false,false,true,Miku,#39c5bb","farm:Frost:1":"14,1,70,70,5,11,true,300,false,false,false,false,Frost Scarecrow,#c8d8b0","farm:Frost:7":"14,1,154,154,7,17,true,300,false,false,false,false,Frost Scarecrow,#c8d8b0","farm:Flame:1":"14,1.5,70,70,8,13,false,0,true,false,false,false,Barn Burner,#d8703c","farm:Flame:7":"14,1.5,154,154,10,19,false,0,true,false,false,false,Barn Burner,#d8703c","farm:Shield:1":"14,1.1,70,70,8,16,false,0,false,true,false,false,Bull Hulk,#8a6a4a","farm:Shield:7":"14,1.1,154,154,10,22,false,0,false,true,false,false,Bull Hulk,#8a6a4a","farm:Mad Mom:1":"14,1.2,105,105,10,21,false,0,false,false,true,false,Rooster Shriek,#d8a03c","farm:Mad Mom:7":"14,1.2,231,231,12,27,false,0,false,false,true,false,Rooster Shriek,#d8a03c","farm:Miku:1":"14,1.3,84,84,5,31,false,0,false,false,false,true,Miku,#39c5bb","farm:Miku:7":"14,1.3,184,184,7,37,false,0,false,false,false,true,Miku,#39c5bb","cave:Frost:1":"14,1,70,70,5,11,true,300,false,false,false,false,Drip Lurker,#7f9aa8","cave:Frost:7":"14,1,154,154,7,17,true,300,false,false,false,false,Drip Lurker,#7f9aa8","cave:Flame:1":"14,1.5,70,70,8,13,false,0,true,false,false,false,Torchbearer,#c06a3c","cave:Flame:7":"14,1.5,154,154,10,19,false,0,true,false,false,false,Torchbearer,#c06a3c","cave:Shield:1":"14,1.1,70,70,8,16,false,0,false,true,false,false,Rock Shell,#6f6a62","cave:Shield:7":"14,1.1,154,154,10,22,false,0,false,true,false,false,Rock Shell,#6f6a62","cave:Mad Mom:1":"14,1.2,105,105,10,21,false,0,false,false,true,false,Echo Wraith,#8a7f9a","cave:Mad Mom:7":"14,1.2,231,231,12,27,false,0,false,false,true,false,Echo Wraith,#8a7f9a","cave:Miku:1":"14,1.3,84,84,5,31,false,0,false,false,false,true,Miku,#39c5bb","cave:Miku:7":"14,1.3,184,184,7,37,false,0,false,false,false,true,Miku,#39c5bb","sky:Frost:1":"14,1,70,70,5,11,true,300,false,false,false,false,Hailstone,#cfe8ff","sky:Frost:7":"14,1,154,154,7,17,true,300,false,false,false,false,Hailstone,#cfe8ff","sky:Flame:1":"14,1.5,70,70,8,13,false,0,true,false,false,false,Sunflare,#ffb03c","sky:Flame:7":"14,1.5,154,154,10,19,false,0,true,false,false,false,Sunflare,#ffb03c","sky:Shield:1":"14,1.1,70,70,8,16,false,0,false,true,false,false,Cloud Guard,#dfeaf5","sky:Shield:7":"14,1.1,154,154,10,22,false,0,false,true,false,false,Cloud Guard,#dfeaf5","sky:Mad Mom:1":"14,1.2,105,105,10,21,false,0,false,false,true,false,Thunderclap,#a8c8e8","sky:Mad Mom:7":"14,1.2,231,231,12,27,false,0,false,false,true,false,Thunderclap,#a8c8e8","sky:Miku:1":"14,1.3,84,84,5,31,false,0,false,false,false,true,Miku,#39c5bb","sky:Miku:7":"14,1.3,184,184,7,37,false,0,false,false,false,true,Miku,#39c5bb","ruins:Frost:1":"14,1,70,70,5,11,true,300,false,false,false,false,Dust Spitter,#c4ac84","ruins:Frost:7":"14,1,154,154,7,17,true,300,false,false,false,false,Dust Spitter,#c4ac84","ruins:Flame:1":"14,1.5,70,70,8,13,false,0,true,false,false,false,Brazier Shade,#c07a3c","ruins:Flame:7":"14,1.5,154,154,10,19,false,0,true,false,false,false,Brazier Shade,#c07a3c","ruins:Shield:1":"14,1.1,70,70,8,16,false,0,false,true,false,false,Stone Sentinel,#9a9186","ruins:Shield:7":"14,1.1,154,154,10,22,false,0,false,true,false,false,Stone Sentinel,#9a9186","ruins:Mad Mom:1":"14,1.2,105,105,10,21,false,0,false,false,true,false,Oracle Scream,#b8a878","ruins:Mad Mom:7":"14,1.2,231,231,12,27,false,0,false,false,true,false,Oracle Scream,#b8a878","ruins:Miku:1":"14,1.3,84,84,5,31,false,0,false,false,false,true,Miku,#39c5bb","ruins:Miku:7":"14,1.3,184,184,7,37,false,0,false,false,false,true,Miku,#39c5bb","toystore:Frost:1":"14,1,70,70,5,11,true,300,false,false,false,false,Water Pistol,#7fc8e8","toystore:Frost:7":"14,1,154,154,7,17,true,300,false,false,false,false,Water Pistol,#7fc8e8","toystore:Flame:1":"14,1.5,70,70,8,13,false,0,true,false,false,false,Sparkler,#ffb03c","toystore:Flame:7":"14,1.5,154,154,10,19,false,0,true,false,false,false,Sparkler,#ffb03c","toystore:Shield:1":"14,1.1,70,70,8,16,false,0,false,true,false,false,Tin Soldier,#8a9a7a","toystore:Shield:7":"14,1.1,154,154,10,22,false,0,false,true,false,false,Tin Soldier,#8a9a7a","toystore:Mad Mom:1":"14,1.2,105,105,10,21,false,0,false,false,true,false,Jack-in-a-Box,#e0508f","toystore:Mad Mom:7":"14,1.2,231,231,12,27,false,0,false,false,true,false,Jack-in-a-Box,#e0508f","toystore:Miku:1":"14,1.3,84,84,5,31,false,0,false,false,false,true,Miku,#39c5bb","toystore:Miku:7":"14,1.3,184,184,7,37,false,0,false,false,false,true,Miku,#39c5bb","mansion:Frost:1":"14,1,70,70,5,11,true,300,false,false,false,false,Cold Spot,#9fb0c0","mansion:Frost:7":"14,1,154,154,7,17,true,300,false,false,false,false,Cold Spot,#9fb0c0","mansion:Flame:1":"14,1.5,70,70,8,13,false,0,true,false,false,false,Candle Wraith,#d8a03c","mansion:Flame:7":"14,1.5,154,154,10,19,false,0,true,false,false,false,Candle Wraith,#d8a03c","mansion:Shield:1":"14,1.1,70,70,8,16,false,0,false,true,false,false,Suit of Armour,#7a7f88","mansion:Shield:7":"14,1.1,154,154,10,22,false,0,false,true,false,false,Suit of Armour,#7a7f88","mansion:Mad Mom:1":"14,1.2,105,105,10,21,false,0,false,false,true,false,Portrait Shriek,#8a6a8f","mansion:Mad Mom:7":"14,1.2,231,231,12,27,false,0,false,false,true,false,Portrait Shriek,#8a6a8f","mansion:Miku:1":"14,1.3,84,84,5,31,false,0,false,false,false,true,Miku,#39c5bb","mansion:Miku:7":"14,1.3,184,184,7,37,false,0,false,false,false,true,Miku,#39c5bb","beach:Frost:1":"14,1,70,70,5,11,true,300,false,false,false,false,Jellyfish,#8fd8e0","beach:Frost:7":"14,1,154,154,7,17,true,300,false,false,false,false,Jellyfish,#8fd8e0","beach:Flame:1":"14,1.5,70,70,8,13,false,0,true,false,false,false,Sunburn,#e88a3c","beach:Flame:7":"14,1.5,154,154,10,19,false,0,true,false,false,false,Sunburn,#e88a3c","beach:Shield:1":"14,1.1,70,70,8,16,false,0,false,true,false,false,Crab Shell,#d8703c","beach:Shield:7":"14,1.1,154,154,10,22,false,0,false,true,false,false,Crab Shell,#d8703c","beach:Mad Mom:1":"14,1.2,105,105,10,21,false,0,false,false,true,false,Gull Screamer,#e0d8c0","beach:Mad Mom:7":"14,1.2,231,231,12,27,false,0,false,false,true,false,Gull Screamer,#e0d8c0","beach:Miku:1":"14,1.3,84,84,5,31,false,0,false,false,false,true,Miku,#39c5bb","beach:Miku:7":"14,1.3,184,184,7,37,false,0,false,false,false,true,Miku,#39c5bb","mine:Frost:1":"14,1,70,70,5,11,true,300,false,false,false,false,Damp Crawler,#7f8f8a","mine:Frost:7":"14,1,154,154,7,17,true,300,false,false,false,false,Damp Crawler,#7f8f8a","mine:Flame:1":"14,1.5,70,70,8,13,false,0,true,false,false,false,Firedamp,#d8803c","mine:Flame:7":"14,1.5,154,154,10,19,false,0,true,false,false,false,Firedamp,#d8803c","mine:Shield:1":"14,1.1,70,70,8,16,false,0,false,true,false,false,Ore Shell,#8a7f6a","mine:Shield:7":"14,1.1,154,154,10,22,false,0,false,true,false,false,Ore Shell,#8a7f6a","mine:Mad Mom:1":"14,1.2,105,105,10,21,false,0,false,false,true,false,Cave-in Howl,#a89a80","mine:Mad Mom:7":"14,1.2,231,231,12,27,false,0,false,false,true,false,Cave-in Howl,#a89a80","mine:Miku:1":"14,1.3,84,84,5,31,false,0,false,false,false,true,Miku,#39c5bb","mine:Miku:7":"14,1.3,184,184,7,37,false,0,false,false,false,true,Miku,#39c5bb","lab:Frost:1":"14,1,70,70,5,11,true,300,false,false,false,false,Cryo Subject,#a8e0f0","lab:Frost:7":"14,1,154,154,7,17,true,300,false,false,false,false,Cryo Subject,#a8e0f0","lab:Flame:1":"14,1.5,70,70,8,13,false,0,true,false,false,false,Burn Subject,#e8703c","lab:Flame:7":"14,1.5,154,154,10,19,false,0,true,false,false,false,Burn Subject,#e8703c","lab:Shield:1":"14,1.1,70,70,8,16,false,0,false,true,false,false,Containment,#b0bcc4","lab:Shield:7":"14,1.1,154,154,10,22,false,0,false,true,false,false,Containment,#b0bcc4","lab:Mad Mom:1":"14,1.2,105,105,10,21,false,0,false,false,true,false,Test Scream,#a05ad0","lab:Mad Mom:7":"14,1.2,231,231,12,27,false,0,false,false,true,false,Test Scream,#a05ad0","lab:Miku:1":"14,1.3,84,84,5,31,false,0,false,false,false,true,Miku,#39c5bb","lab:Miku:7":"14,1.3,184,184,7,37,false,0,false,false,false,true,Miku,#39c5bb","casino:Frost:1":"14,1,70,70,5,11,true,300,false,false,false,false,Ice Dealer,#8fd0e8","casino:Frost:7":"14,1,154,154,7,17,true,300,false,false,false,false,Ice Dealer,#8fd0e8","casino:Flame:1":"14,1.5,70,70,8,13,false,0,true,false,false,false,Hot Streak,#e0503c","casino:Flame:7":"14,1.5,154,154,10,19,false,0,true,false,false,false,Hot Streak,#e0503c","casino:Shield:1":"14,1.1,70,70,8,16,false,0,false,true,false,false,Bouncer,#6a6f78","casino:Shield:7":"14,1.1,154,154,10,22,false,0,false,true,false,false,Bouncer,#6a6f78","casino:Mad Mom:1":"14,1.2,105,105,10,21,false,0,false,false,true,false,Jackpot Siren,#e0b03c","casino:Mad Mom:7":"14,1.2,231,231,12,27,false,0,false,false,true,false,Jackpot Siren,#e0b03c","casino:Miku:1":"14,1.3,84,84,5,31,false,0,false,false,false,true,Miku,#39c5bb","casino:Miku:7":"14,1.3,184,184,7,37,false,0,false,false,false,true,Miku,#39c5bb","dojo:Frost:1":"14,1,70,70,5,11,true,300,false,false,false,false,Frost Student,#a8d8e8","dojo:Frost:7":"14,1,154,154,7,17,true,300,false,false,false,false,Frost Student,#a8d8e8","dojo:Flame:1":"14,1.5,70,70,8,13,false,0,true,false,false,false,Fire Student,#d8603c","dojo:Flame:7":"14,1.5,154,154,10,19,false,0,true,false,false,false,Fire Student,#d8603c","dojo:Shield:1":"14,1.1,70,70,8,16,false,0,false,true,false,false,Iron Student,#8a8f7a","dojo:Shield:7":"14,1.1,154,154,10,22,false,0,false,true,false,false,Iron Student,#8a8f7a","dojo:Mad Mom:1":"14,1.2,105,105,10,21,false,0,false,false,true,false,Kiai Master,#c07a4c","dojo:Mad Mom:7":"14,1.2,231,231,12,27,false,0,false,false,true,false,Kiai Master,#c07a4c","dojo:Miku:1":"14,1.3,84,84,5,31,false,0,false,false,false,true,Miku,#39c5bb","dojo:Miku:7":"14,1.3,184,184,7,37,false,0,false,false,false,true,Miku,#39c5bb","underworld:Frost:1":"14,1,70,70,5,11,true,300,false,false,false,false,Soul Chill,#8fa8b8","underworld:Frost:7":"14,1,154,154,7,17,true,300,false,false,false,false,Soul Chill,#8fa8b8","underworld:Flame:1":"14,1.5,70,70,8,13,false,0,true,false,false,false,Hellhound,#e0402c","underworld:Flame:7":"14,1.5,154,154,10,19,false,0,true,false,false,false,Hellhound,#e0402c","underworld:Shield:1":"14,1.1,70,70,8,16,false,0,false,true,false,false,Damned Guard,#5a3a3a","underworld:Shield:7":"14,1.1,154,154,10,22,false,0,false,true,false,false,Damned Guard,#5a3a3a","underworld:Mad Mom:1":"14,1.2,105,105,10,21,false,0,false,false,true,false,Tormented,#a03a5a","underworld:Mad Mom:7":"14,1.2,231,231,12,27,false,0,false,false,true,false,Tormented,#a03a5a","underworld:Miku:1":"14,1.3,84,84,5,31,false,0,false,false,false,true,Miku,#39c5bb","underworld:Miku:7":"14,1.3,184,184,7,37,false,0,false,false,false,true,Miku,#39c5bb","crystal:Frost:1":"14,1,70,70,5,11,true,300,false,false,false,false,Prism Shard,#9be7ff","crystal:Frost:7":"14,1,154,154,7,17,true,300,false,false,false,false,Prism Shard,#9be7ff","crystal:Flame:1":"14,1.5,70,70,8,13,false,0,true,false,false,false,Refraction,#ff8fd0","crystal:Flame:7":"14,1.5,154,154,10,19,false,0,true,false,false,false,Refraction,#ff8fd0","crystal:Shield:1":"14,1.1,70,70,8,16,false,0,false,true,false,false,Facet Guard,#7f8fd0","crystal:Shield:7":"14,1.1,154,154,10,22,false,0,false,true,false,false,Facet Guard,#7f8fd0","crystal:Mad Mom:1":"14,1.2,105,105,10,21,false,0,false,false,true,false,Resonance,#b08fe0","crystal:Mad Mom:7":"14,1.2,231,231,12,27,false,0,false,false,true,false,Resonance,#b08fe0","crystal:Miku:1":"14,1.3,84,84,5,31,false,0,false,false,false,true,Miku,#39c5bb","crystal:Miku:7":"14,1.3,184,184,7,37,false,0,false,false,false,true,Miku,#39c5bb","storm:Frost:1":"14,1,70,70,5,11,true,300,false,false,false,false,Sleet,#a8c0d0","storm:Frost:7":"14,1,154,154,7,17,true,300,false,false,false,false,Sleet,#a8c0d0","storm:Flame:1":"14,1.5,70,70,8,13,false,0,true,false,false,false,Lightning Husk,#e8d03c","storm:Flame:7":"14,1.5,154,154,10,19,false,0,true,false,false,false,Lightning Husk,#e8d03c","storm:Shield:1":"14,1.1,70,70,8,16,false,0,false,true,false,false,Stormwall,#6f7f8a","storm:Shield:7":"14,1.1,154,154,10,22,false,0,false,true,false,false,Stormwall,#6f7f8a","storm:Mad Mom:1":"14,1.2,105,105,10,21,false,0,false,false,true,false,Thunder Howl,#8fa8c0","storm:Mad Mom:7":"14,1.2,231,231,12,27,false,0,false,false,true,false,Thunder Howl,#8fa8c0","storm:Miku:1":"14,1.3,84,84,5,31,false,0,false,false,false,true,Miku,#39c5bb","storm:Miku:7":"14,1.3,184,184,7,37,false,0,false,false,false,true,Miku,#39c5bb","mushroom:Frost:1":"14,1,70,70,5,11,true,300,false,false,false,false,Spore Chill,#a8c0a0","mushroom:Frost:7":"14,1,154,154,7,17,true,300,false,false,false,false,Spore Chill,#a8c0a0","mushroom:Flame:1":"14,1.5,70,70,8,13,false,0,true,false,false,false,Blight Cap,#d8703c","mushroom:Flame:7":"14,1.5,154,154,10,19,false,0,true,false,false,false,Blight Cap,#d8703c","mushroom:Shield:1":"14,1.1,70,70,8,16,false,0,false,true,false,false,Shield Cap,#8a7a5a","mushroom:Shield:7":"14,1.1,154,154,10,22,false,0,false,true,false,false,Shield Cap,#8a7a5a","mushroom:Mad Mom:1":"14,1.2,105,105,10,21,false,0,false,false,true,false,Screaming Bloom,#d08fc0","mushroom:Mad Mom:7":"14,1.2,231,231,12,27,false,0,false,false,true,false,Screaming Bloom,#d08fc0","mushroom:Miku:1":"14,1.3,84,84,5,31,false,0,false,false,false,true,Miku,#39c5bb","mushroom:Miku:7":"14,1.3,184,184,7,37,false,0,false,false,false,true,Miku,#39c5bb","void:Frost:1":"14,1,70,70,5,11,true,300,false,false,false,false,Null Spitter,#8f8fd0","void:Frost:7":"14,1,154,154,7,17,true,300,false,false,false,false,Null Spitter,#8f8fd0","void:Flame:1":"14,1.5,70,70,8,13,false,0,true,false,false,false,Entropy,#c05ad0","void:Flame:7":"14,1.5,154,154,10,19,false,0,true,false,false,false,Entropy,#c05ad0","void:Shield:1":"14,1.1,70,70,8,16,false,0,false,true,false,false,Nothing Guard,#5a5a7a","void:Shield:7":"14,1.1,154,154,10,22,false,0,false,true,false,false,Nothing Guard,#5a5a7a","void:Mad Mom:1":"14,1.2,105,105,10,21,false,0,false,false,true,false,The Wail,#9a8fd0","void:Mad Mom:7":"14,1.2,231,231,12,27,false,0,false,false,true,false,The Wail,#9a8fd0","void:Miku:1":"14,1.3,84,84,5,31,false,0,false,false,false,true,Miku,#39c5bb","void:Miku:7":"14,1.3,184,184,7,37,false,0,false,false,false,true,Miku,#39c5bb","dream:Frost:1":"14,1,70,70,5,11,true,300,false,false,false,false,Sleepwalker,#b9a7e8","dream:Frost:7":"14,1,154,154,7,17,true,300,false,false,false,false,Sleepwalker,#b9a7e8","dream:Flame:1":"14,1.5,70,70,8,13,false,0,true,false,false,false,Bad Dream,#7d5fbf","dream:Flame:7":"14,1.5,154,154,10,19,false,0,true,false,false,false,Bad Dream,#7d5fbf","dream:Shield:1":"14,1.1,70,70,8,16,false,0,false,true,false,false,Pillow Fort,#f5b3e0","dream:Shield:7":"14,1.1,154,154,10,22,false,0,false,true,false,false,Pillow Fort,#f5b3e0","dream:Mad Mom:1":"14,1.2,105,105,10,21,false,0,false,false,true,false,Screaming Alarm,#f5e0b3","dream:Mad Mom:7":"14,1.2,231,231,12,27,false,0,false,false,true,false,Screaming Alarm,#f5e0b3","dream:Miku:1":"14,1.3,84,84,5,31,false,0,false,false,false,true,Miku,#39c5bb","dream:Miku:7":"14,1.3,184,184,7,37,false,0,false,false,false,true,Miku,#39c5bb","clockwork:Frost:1":"14,1,70,70,5,11,true,300,false,false,false,false,Tick Spitter,#c9a227","clockwork:Frost:7":"14,1,154,154,7,17,true,300,false,false,false,false,Tick Spitter,#c9a227","clockwork:Flame:1":"14,1.5,70,70,8,13,false,0,true,false,false,false,Overwound,#d4af37","clockwork:Flame:7":"14,1.5,154,154,10,19,false,0,true,false,false,false,Overwound,#d4af37","clockwork:Shield:1":"14,1.1,70,70,8,16,false,0,false,true,false,false,Brass Guard,#b08d57","clockwork:Shield:7":"14,1.1,154,154,10,22,false,0,false,true,false,false,Brass Guard,#b08d57","clockwork:Mad Mom:1":"14,1.2,105,105,10,21,false,0,false,false,true,false,Chiming Horror,#e0c068","clockwork:Mad Mom:7":"14,1.2,231,231,12,27,false,0,false,false,true,false,Chiming Horror,#e0c068","clockwork:Miku:1":"14,1.3,84,84,5,31,false,0,false,false,false,true,Miku,#39c5bb","clockwork:Miku:7":"14,1.3,184,184,7,37,false,0,false,false,false,true,Miku,#39c5bb","mirror:Frost:1":"14,1,70,70,5,11,true,300,false,false,false,false,Cold Reflection,#b8cedd","mirror:Frost:7":"14,1,154,154,7,17,true,300,false,false,false,false,Cold Reflection,#b8cedd","mirror:Flame:1":"14,1.5,70,70,8,13,false,0,true,false,false,false,Glare,#ffffff","mirror:Flame:7":"14,1.5,154,154,10,19,false,0,true,false,false,false,Glare,#ffffff","mirror:Shield:1":"14,1.1,70,70,8,16,false,0,false,true,false,false,Silvered Guard,#9fb8c9","mirror:Shield:7":"14,1.1,154,154,10,22,false,0,false,true,false,false,Silvered Guard,#9fb8c9","mirror:Mad Mom:1":"14,1.2,105,105,10,21,false,0,false,false,true,false,Shrieking Pane,#dfe9f0","mirror:Mad Mom:7":"14,1.2,231,231,12,27,false,0,false,false,true,false,Shrieking Pane,#dfe9f0","mirror:Miku:1":"14,1.3,84,84,5,31,false,0,false,false,false,true,Miku,#39c5bb","mirror:Miku:7":"14,1.3,184,184,7,37,false,0,false,false,false,true,Miku,#39c5bb","grove:Frost:1":"14,1,70,70,5,11,true,300,false,false,false,false,Dewcap,#7fe0b0","grove:Frost:7":"14,1,154,154,7,17,true,300,false,false,false,false,Dewcap,#7fe0b0","grove:Flame:1":"14,1.5,70,70,8,13,false,0,true,false,false,false,Wisp,#c7f5e0","grove:Flame:7":"14,1.5,154,154,10,19,false,0,true,false,false,false,Wisp,#c7f5e0","grove:Shield:1":"14,1.1,70,70,8,16,false,0,false,true,false,false,Bark Warden,#398c68","grove:Shield:7":"14,1.1,154,154,10,22,false,0,false,true,false,false,Bark Warden,#398c68","grove:Mad Mom:1":"14,1.2,105,105,10,21,false,0,false,false,true,false,Screeching Pixie,#a8f0cf","grove:Mad Mom:7":"14,1.2,231,231,12,27,false,0,false,false,true,false,Screeching Pixie,#a8f0cf","grove:Miku:1":"14,1.3,84,84,5,31,false,0,false,false,false,true,Miku,#39c5bb","grove:Miku:7":"14,1.3,184,184,7,37,false,0,false,false,false,true,Miku,#39c5bb","storybook:Frost:1":"14,1,70,70,5,11,true,300,false,false,false,false,Inkling,#3a3a3a","storybook:Frost:7":"14,1,154,154,7,17,true,300,false,false,false,false,Inkling,#3a3a3a","storybook:Flame:1":"14,1.5,70,70,8,13,false,0,true,false,false,false,Burnt Page,#d4b98f","storybook:Flame:7":"14,1.5,154,154,10,19,false,0,true,false,false,false,Burnt Page,#d4b98f","storybook:Shield:1":"14,1.1,70,70,8,16,false,0,false,true,false,false,Bookend,#c9a97f","storybook:Shield:7":"14,1.1,154,154,10,22,false,0,false,true,false,false,Bookend,#c9a97f","storybook:Mad Mom:1":"14,1.2,105,105,10,21,false,0,false,false,true,false,Shouting Quote,#e0c9a0","storybook:Mad Mom:7":"14,1.2,231,231,12,27,false,0,false,false,true,false,Shouting Quote,#e0c9a0","storybook:Miku:1":"14,1.3,84,84,5,31,false,0,false,false,false,true,Miku,#39c5bb","storybook:Miku:7":"14,1.3,184,184,7,37,false,0,false,false,false,true,Miku,#39c5bb","astral:Frost:1":"14,1,70,70,5,11,true,300,false,false,false,false,Starchill,#b39ddb","astral:Frost:7":"14,1,154,154,7,17,true,300,false,false,false,false,Starchill,#b39ddb","astral:Flame:1":"14,1.5,70,70,8,13,false,0,true,false,false,false,Comet,#d1c4e9","astral:Flame:7":"14,1.5,154,154,10,19,false,0,true,false,false,false,Comet,#d1c4e9","astral:Shield:1":"14,1.1,70,70,8,16,false,0,false,true,false,false,Warden Rune,#7e57c2","astral:Shield:7":"14,1.1,154,154,10,22,false,0,false,true,false,false,Warden Rune,#7e57c2","astral:Mad Mom:1":"14,1.2,105,105,10,21,false,0,false,false,true,false,Wailing Oracle,#9575cd","astral:Mad Mom:7":"14,1.2,231,231,12,27,false,0,false,false,true,false,Wailing Oracle,#9575cd","astral:Miku:1":"14,1.3,84,84,5,31,false,0,false,false,false,true,Miku,#39c5bb","astral:Miku:7":"14,1.3,184,184,7,37,false,0,false,false,false,true,Miku,#39c5bb"};
const mechNow = JSON.parse(q(MECH_PROBE));

// ---------- fake THREE that remembers what it builds (as in test-summons-look) ----------
q(`
  var __FT = (function(){
    function V(){ return { x:0, y:0, z:0, set: function(x,y,z){ this.x=x; this.y=y; this.z=z; }, setScalar: function(s){ this.x=this.y=this.z=s; }, copy: function(){} }; }
    function Obj(){ this.position = V(); this.rotation = { x:0, y:0, z:0, set: function(x,y,z){ this.x=x; this.y=y; this.z=z; } }; this.scale = V(); this.userData = {}; this.name = ''; this.children = []; this.visible = true; }
    Obj.prototype.add = function(m){ this.children.push(m); return this; };
    Obj.prototype.remove = function(m){ var i = this.children.indexOf(m); if (i >= 0) this.children.splice(i, 1); return this; };
    Obj.prototype.traverse = function(f){ f(this); this.children.forEach(function(c){ c.traverse ? c.traverse(f) : f(c); }); };
    function Group(){ Obj.call(this); }
    Group.prototype = Object.create(Obj.prototype);
    function Mesh(geo, mat){ Obj.call(this); this.geometry = geo; this.material = mat; this.isMesh = true; }
    Mesh.prototype = Object.create(Obj.prototype);
    function Mat(o){ Object.assign(this, o || {}); this.userData = {}; ft.mats++; }
    Mat.prototype.clone = function(){ var c = new Mat(this); c.userData = Object.assign({}, this.userData); return c; };
    function Geo(){ this.userData = {}; this.args = [].slice.call(arguments); ft.geos++; }
    var ft = { Group: Group, Mesh: Mesh, MeshStandardMaterial: Mat, MeshBasicMaterial: Mat,
      SphereGeometry: Geo, BoxGeometry: Geo, CylinderGeometry: Geo, ConeGeometry: Geo, TorusGeometry: Geo,
      CircleGeometry: Geo, PlaneGeometry: Geo, CapsuleGeometry: Geo, OctahedronGeometry: Geo,
      DodecahedronGeometry: Geo, RingGeometry: Geo, DoubleSide: 2, BackSide: 1, RepeatWrapping: 1000, SRGBColorSpace: 'srgb',
      lights: 0, mats: 0, geos: 0 };
    ft.Color = function(){ this.r = this.g = this.b = 0; }; ft.Color.prototype.lerp = function(){ return this; }; ft.Color.prototype.clone = function(){ return this; }; ft.Color.prototype.multiplyScalar = function(){ return this; };
    ft.CanvasTexture = function(c){ this.image = c; this.userData = {}; };
    ft.PointLight = ft.SpotLight = function(){ ft.lights++; Obj.call(this); };
    return ft;
  })();
  var __realTHREE = THREE;
  function __withFake(fn){ THREE = __FT; try { return fn(); } finally { THREE = __realTHREE; } }
  _pfMat.clear(); _geoCache.clear();
`);

// ---------- 1. every name maps to a look ----------
console.log('\n1. every wave monster name has a look:\n');
// Names allowed to fall through to the plain zombie on purpose. None today.
const INTENTIONAL_FALLBACK = [];
const themes = JSON.parse(q(`(function(){
  var out = [];
  var add = function(wid, name, emoji, slot){ var t = monsterTheme(name, wid, emoji);
    out.push({ w: wid, name: name, slot: slot, plan: t.plan, surface: t.surface, props: t.props, src: t.src, key: t.key,
               rawProps: (MONSTER_LOOKS[name] || '').split(/\\s+/).slice(2) }); };
  ['Frost','Flame','Shield','Mad Mom','Miku'].forEach(function(n){ var c = MONSTER_CLASSES.find(function(x){ return x.name === n; }); add('city', n, c.emoji, 'base'); });
  WORLDS.forEach(function(w){ (WORLD_MONSTERS[w.id] || []).forEach(function(r, i){ add(w.id, r[0], r[1], MONSTER_BASES[i]); }); });
  return JSON.stringify(out);
})()`));
const worldCount = q(`WORLDS.filter(function(w){ return WORLD_MONSTERS[w.id]; }).length`);
check(themes.length === 5 + worldCount * 4, 'every world\'s four monsters and the five base classes are checked', themes.length + ' names in ' + worldCount + ' worlds');
const fell = themes.filter(t => t.src === 'fallback' && INTENTIONAL_FALLBACK.indexOf(t.name) < 0);
check(fell.length === 0, 'no name falls back to the plain zombie', fell.map(t => t.name).join(', ') || 'all mapped');
const notTable = themes.filter(t => t.src !== 'table');
check(notTable.length === 0, 'every current name is mapped explicitly in MONSTER_LOOKS', notTable.map(t => t.name).join(', ') || 'table');
const lostProps = themes.filter(t => t.rawProps.length !== t.props.length);
check(lostProps.length === 0, 'every prop a look names exists (none silently dropped)', lostProps.map(t => t.name + ':' + t.rawProps.join('+')).join(' ') || 'ok');
check(themes.every(t => t.props.length >= 1 && t.props.length <= 2), 'every look carries one or two props');
const plans = {}; themes.forEach(t => { plans[t.plan] = (plans[t.plan] || 0) + 1; });
check(['humanoid','beast','blob','spirit','construct','flier'].every(p => plans[p] > 0), 'all six body plans are in use', JSON.stringify(plans));
const surfs = new Set(themes.map(t => t.surface));
check(surfs.size >= 15, 'a wide range of surfaces', surfs.size + ' surfaces');
const looks = new Set(themes.map(t => t.key));
check(looks.size >= 100, 'monsters mostly look different from each other', looks.size + ' distinct looks for ' + new Set(themes.map(t => t.name)).size + ' names');
const byName = {}; themes.forEach(t => byName[t.name] = t);
const expect = {
  'Riot Husk': ['humanoid','metal',['riotHelmet','riotShield']], 'Torch Thug': ['humanoid',null,['torch']],
  'Comet': ['spirit','cosmic',['cometTail']], 'Starchill': [null,'cosmic',['crystals']], 'Warden Rune': ['construct',null,['rune']],
  'Magma Hound': ['beast',null,[]], 'Hellhound': ['beast','fiery',[]], 'Crab Shell': ['beast','shell',['claws']],
  'Cryo Drone': ['flier','metal',[]], 'Echo Wraith': ['flier',null,['bigEars']], 'Gobstopper': ['blob','candy',[]],
  'Wailing Widow': ['spirit','ghostly',['veil']], 'Rockslide': ['construct','rocky',[]], 'Frostbite': [null,'icy',[]],
};
for (const [n, [p, s, pr]] of Object.entries(expect)) {
  const t = byName[n];
  check(t && (!p || t.plan === p) && (!s || t.surface === s) && pr.every(x => t.props.indexOf(x) >= 0),
        n + ' looks like a ' + [p, s, pr.join('+')].filter(Boolean).join(' '), t ? t.key : 'missing');
}
// The same name always gets the same look, wherever it appears (Wailing Widow lives in two worlds).
const ww = themes.filter(t => t.name === 'Wailing Widow');
check(ww.length === 2 && ww[0].key === ww[1].key, 'a name shared by two worlds looks the same in both');
// Unknown names: keywords, then the world, then the plain zombie.
const kw = JSON.parse(q(`JSON.stringify([monsterTheme('Frost Wolf','city','🐺'), monsterTheme('Bob','arctic','🙂'), monsterTheme('Bob','city','🙂'), monsterTheme('Riot Golem','city','')])`));
check(kw[0].plan === 'beast' && kw[0].surface === 'icy' && kw[0].props.indexOf('crystals') >= 0 && kw[0].src === 'keyword', 'an unknown "Frost Wolf" is guessed from its keywords: an icy beast', kw[0].key);
check(kw[1].src === 'fallback' && kw[1].plan === 'humanoid' && kw[1].surface === 'icy', 'an unknown name takes its surface from the world', kw[1].key);
check(kw[2].src === 'fallback' && kw[2].key.trim() === 'humanoid flesh', 'and with nothing to go on it is the humanoid zombie', kw[2].key);
check(kw[3].plan === 'construct' && kw[3].props.join() === 'riotHelmet,riotShield', 'keywords pick props too ("Riot" → helmet + shield)', kw[3].key);
// The base class each name plays, for the ability mutation.
check(themes.filter(t => t.slot !== 'base').every(t => q(`monsterBaseName(${JSON.stringify(t.name)})`) === t.slot),
      'every re-skinned name resolves back to the class it plays');

// ---------- 2. 3D ----------
console.log('\n2. each body plan builds in 3D:\n');
const need3D = {
  humanoid:  { leg: 2, arm: 2, torso: 1, head: 1, eye: 2 },
  beast:     { leg: 4, tail: 1, torso: 1, head: 1, eye: 2 },
  blob:      { head: 1, torso: 1, mouth: 1, eye: 2 },
  spirit:    { torso: 1, chest: 1, head: 1, arm: 2, eye: 2 },
  construct: { leg: 2, arm: 2, torso: 1, head: 1, eye: 2 },
  flier:     { wing: 2, tail: 1, torso: 1, head: 1, eye: 2 },
};
const sample = { humanoid: 'Riot Husk', beast: 'Crab Shell', blob: 'Gobstopper', spirit: 'Comet', construct: 'Warden Rune', flier: 'Cryo Drone' };
const sampleWorld = { 'Riot Husk': 'city', 'Crab Shell': 'beach', 'Gobstopper': 'candy', 'Comet': 'astral', 'Warden Rune': 'astral', 'Cryo Drone': 'space' };
const b3 = JSON.parse(q(`__withFake(function(){
  var out = {};
  var names = ${JSON.stringify(sample)}, worlds = ${JSON.stringify(sampleWorld)};
  Object.keys(names).forEach(function(plan){
    var n = names[plan]; currentWorld = WORLDS.find(function(w){ return w.id === worlds[n]; });
    var row = WORLD_MONSTERS[currentWorld.id].find(function(r){ return r[0] === n; });
    __FT.lights = 0;
    var g = _addMonsterLOD(makeMonsterMesh({ name: n, emoji: row[1], color: row[2], r: 14, hp: 10, maxHp: 10 }), { r: 14, color: row[2] });
    var parts = {}; Object.keys(g.userData.parts).forEach(function(k){ parts[k] = g.userData.parts[k].length; });
    var detail = 0; g.userData.detail.traverse(function(o){ if (o.isMesh) detail++; });
    var simple = 0; g.userData.simple.traverse(function(o){ if (o.isMesh) simple++; });
    out[plan] = { parts: parts, detail: detail, simple: simple, legs: (g.userData.legs || []).length, wings: (g.userData.wings || []).length,
                  lights: __FT.lights, plan: g.userData.plan, flash: !!g.userData.flashBase, head: !!g.userData.head };
  });
  currentWorld = WORLDS[0];
  return JSON.stringify(out);
})`));
for (const plan of Object.keys(need3D)) {
  const b = b3[plan];
  const miss = Object.entries(need3D[plan]).filter(([n, c]) => (b.parts[n] || 0) < c).map(([n, c]) => n + '<' + c);
  check(miss.length === 0 && b.plan === plan, plan + ' (' + sample[plan] + ') has its parts: ' + Object.keys(need3D[plan]).join(', '), miss.join(' ') || b.detail + ' meshes');
  check(b.simple === 2 && b.lights === 0 && b.head && b.flash, plan + ': a 2-mesh far stand-in, a head that flashes when hit, no lights');
}
check(b3.humanoid.legs === 2 && b3.construct.legs === 2 && b3.beast.legs === 4, 'people and robots walk on two legs, beasts trot on four',
      'humanoid ' + b3.humanoid.legs + ', construct ' + b3.construct.legs + ', beast ' + b3.beast.legs);
check(b3.blob.legs === 0 && b3.spirit.legs === 0 && b3.flier.legs === 0 && b3.flier.wings === 2, 'blobs and spirits have no legs (they bob), fliers flap two wings');
check(!b3.beast.parts.arm && !b3.blob.parts.arm && !b3.flier.parts.arm, 'beasts, blobs and fliers have no human arms');

// every name: built, props present, mutation present, mesh budget, pooled materials
const all3 = JSON.parse(q(`__withFake(function(){
  var rows = [];
  var build = function(wid, name, emoji, color){
    currentWorld = WORLDS.find(function(w){ return w.id === wid; });
    var mats0 = __FT.mats;
    var g = makeMonsterMesh({ name: name, emoji: emoji, color: color, r: 14, hp: 10, maxHp: 10 });
    var meshes = 0, unshared = new Set(), props = {}, muts = 0;
    g.traverse(function(o){ if (!o.isMesh) return; if (o === g.userData.hpBar.userData.fill || g.userData.hpBar.children.indexOf(o) >= 0) return;
      meshes++; if (!o.material.userData.shared) unshared.add(o.material);
      if (o.name.indexOf('prop:') === 0) props[o.name.slice(5)] = 1; if (o.name === 'mutation') muts++; });
    rows.push({ name: name, w: wid, meshes: meshes, unshared: unshared.size, props: Object.keys(props), muts: muts, look: g.userData.look });
  };
  ['Frost','Flame','Shield','Mad Mom','Miku'].forEach(function(n){ var c = MONSTER_CLASSES.find(function(x){ return x.name === n; }); build('city', n, c.emoji, c.color); });
  WORLDS.forEach(function(w){ (WORLD_MONSTERS[w.id] || []).forEach(function(r){ build(w.id, r[0], r[1], r[2]); }); });
  // a second full pass must not allocate any new pooled material
  var pool0 = _pfMat.size, geo0 = _geoCache.size;
  WORLDS.forEach(function(w){ (WORLD_MONSTERS[w.id] || []).forEach(function(r){ currentWorld = w; makeMonsterMesh({ name: r[0], emoji: r[1], color: r[2], r: 14, hp: 1, maxHp: 1 }); }); });
  currentWorld = WORLDS[0];
  return JSON.stringify({ rows: rows, poolGrew: _pfMat.size - pool0, geoGrew: _geoCache.size - geo0, lights: __FT.lights });
})`));
const rows = all3.rows;
const tMap = {}; themes.forEach(t => tMap[t.w + '|' + t.name] = t);
const propMiss = rows.filter(r => { const t = tMap[r.w + '|' + r.name]; return t && t.props.some(p => r.props.indexOf(p) < 0); });
check(propMiss.length === 0, 'every monster is built wearing its props (' + rows.length + ' builds)', propMiss.map(r => r.name).join(', ') || 'ok');
check(rows.every(r => r.muts === 2), 'every monster still grows its ability mutation on top (freezer, burner, shield, screamer, singer)',
      rows.filter(r => r.muts !== 2).map(r => r.name + ':' + r.muts).join(' ') || '2 pieces each');
const meshCounts = rows.map(r => r.meshes);
const avg = meshCounts.reduce((a, b) => a + b, 0) / meshCounts.length;
check(Math.max(...meshCounts) <= 16 && avg <= 14, 'a light body: 16 meshes at most (the old zombie was ~130)',
      'min ' + Math.min(...meshCounts) + ', avg ' + avg.toFixed(1) + ', max ' + Math.max(...meshCounts));
check(rows.every(r => r.unshared === 1), 'only the body material is per monster (it flashes when hit); all trim is pooled');
check(all3.poolGrew === 0 && all3.geoGrew === 0, 'building every monster again allocates no new materials or geometry', JSON.stringify({ pool: all3.poolGrew, geo: all3.geoGrew }));
check(all3.lights === 0, 'no monster adds a light');

// bosses keep their bodies; a boss without a plan keeps the old zombie
const boss = JSON.parse(q(`__withFake(function(){
  var withBody = MONSTER_CLASSES.find(function(c){ return c.isBossOnly && c.body; });
  var noBody = MONSTER_CLASSES.find(function(c){ return c.isBossOnly && !c.body; });
  var a = makeMonsterMesh({ name: 'BOSS ' + withBody.name, isBoss: true, body: withBody.body, r: 32, color: withBody.color });
  var b = makeMonsterMesh({ name: 'BOSS ' + noBody.name, isBoss: true, r: 32, color: noBody.color });
  var n = 0; b.traverse(function(o){ if (o.isMesh) n++; });
  return JSON.stringify({ a: !a.userData.look, b: !b.userData.look, bMeshes: n });
})`));
check(boss.a && boss.b && boss.bMeshes > 60, 'bosses are untouched: boss bodies stay, and a boss with no body keeps the old zombie', boss.bMeshes + ' meshes');

// ---------- 3. 2D ----------
console.log('\n3. every world\'s monsters draw in 2D:\n');
const d2 = JSON.parse(q(`(function(){
  var c = ctx, calls = 0, wrap = {};
  ['fill','stroke','fillRect','ellipse','arc'].forEach(function(m){ wrap[m] = c[m]; c[m] = function(){ calls++; }; });
  var out = { bad: [], counts: {} };
  try {
    chosenClass = CLASSES[0]; startGame(); gameRunning = true;
    WORLDS.forEach(function(w){
      currentWorld = w;
      var list = (WORLD_MONSTERS[w.id] || []).map(function(r){ return r; }).concat([['Miku','🎤','#39c5bb']]);
      list.forEach(function(r){
        var m = { x: player.x + 60, y: player.y, r: 14, hp: 5, maxHp: 10, name: r[0], emoji: r[1], color: r[2], hitFlash: 0, frozen: 0, stunned: 0, slow: 0 };
        ['topdown','thirdperson','firstperson'].forEach(function(mode){
          cameraMode = mode; calls = 0;
          try {
            if (mode === 'firstperson') drawMonsterFront2D(c, m, 400, 400, 12, m.color);
            else { drawMonsterTop2D(m, m.x, m.y, m.color); m.hitFlash = 3; drawMonsterTop2D(m, m.x, m.y, '#fff'); m.hitFlash = 0; }
            out.counts[mode] = (out.counts[mode] || 0) + 1;
            if (calls < 6) out.bad.push(w.id + ':' + r[0] + ':' + mode + ' drew only ' + calls);
          } catch (e) { out.bad.push(w.id + ':' + r[0] + ':' + mode + ' THREW ' + e.message); }
        });
      });
    });
    // whole frames with a full wave of each world on screen, in every 2D camera
    out.frames = [];
    WORLDS.forEach(function(w, wi){
      if (wi % 6) return;
      currentWorld = w;
      monsters = (WORLD_MONSTERS[w.id] || []).map(function(r, i){ return { x: player.x + 40 + i*30, y: player.y + 20, r: 14, hp: 5, maxHp: 10, name: r[0], emoji: r[1], color: r[2],
        speed: 0, damage: 1, hitFlash: i === 0 ? 2 : 0, frozen: i === 1 ? 5 : 0, stunned: 0, slow: 0, phasing: i === 2, hasShield: i === 2, shieldUp: true }; });
      ['topdown','thirdperson','firstperson'].forEach(function(mode){ cameraMode = mode; try { draw(); } catch (e) { out.frames.push(w.id + ':' + mode + ' ' + e.message); } });
    });
    cameraMode = 'topdown'; currentWorld = WORLDS[0]; monsters = [];
  } finally { Object.keys(wrap).forEach(function(m){ c[m] = wrap[m]; }); }
  return JSON.stringify(out);
})()`));
check(d2.bad.length === 0, 'every world\'s monsters (and Miku) draw in top-down, third-person and first-person', d2.bad.slice(0, 4).join(' | ') || JSON.stringify(d2.counts));
check(d2.frames.length === 0, 'full frames with a whole wave on screen draw in every 2D camera', d2.frames.join(' | ') || 'ok');
// silhouettes really differ by plan: a beast is longer than it is wide from above, a blob is round
const sil = JSON.parse(q(`(function(){
  var ext = function(name, wid, view){ currentWorld = WORLDS.find(function(w){ return w.id === wid; });
    var L = monsterLook({ name: name }); var sh = _lookProj(L.parts, view);
    var u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
    sh.forEach(function(s){ var cx = s.cx || 0, cy = s.cy || 0, rx = s.rx || s.hw || 0, ry = s.ry || s.hh || 0;
      if (s.pts) { for (var i = 0; i < s.pts.length; i += 2) { u0 = Math.min(u0, s.pts[i]); u1 = Math.max(u1, s.pts[i]); v0 = Math.min(v0, s.pts[i+1]); v1 = Math.max(v1, s.pts[i+1]); } return; }
      u0 = Math.min(u0, cx - rx); u1 = Math.max(u1, cx + rx); v0 = Math.min(v0, cy - ry); v1 = Math.max(v1, cy + ry); });
    return { w: u1 - u0, h: v1 - v0 }; };
  var r = { beastTop: ext('Crab Shell','beach','top'), humFront: ext('Riot Husk','city','front'), blobFront: ext('Gobstopper','candy','front'), cometTop: ext('Comet','astral','top') };
  currentWorld = WORLDS[0];
  return JSON.stringify(r);
})()`));
check(sil.beastTop.h > sil.beastTop.w * 1.3, 'from above, a beast is long, nose to tail', sil.beastTop.w.toFixed(1) + ' wide x ' + sil.beastTop.h.toFixed(1) + ' long');
check(sil.humFront.h > sil.humFront.w * 1.5 && sil.blobFront.h < sil.humFront.h * 0.7, 'from the front, a person stands tall and a blob squats',
      'person ' + sil.humFront.h.toFixed(1) + ' tall, blob ' + sil.blobFront.h.toFixed(1));
check(sil.cometTop.h > 3.5, 'a comet trails its tail behind it', sil.cometTop.h.toFixed(1) + ' long');

// ---------- 4. multiplayer: a guest derives the same look from the packet alone ----------
console.log('\n4. multiplayer guests see the same monster:\n');
const mp = JSON.parse(q(`(function(){
  var bad = [];
  WORLDS.forEach(function(w){
    currentWorld = w; _themedCache.clear();
    ['Frost','Flame','Shield','Mad Mom'].forEach(function(bn){
      var cls = themeMonster(MONSTER_CLASSES.find(function(c){ return c.name === bn; }));
      var host = { name: cls.name, emoji: cls.emoji, color: cls.color, r: 14, mut: cls.mut };
      // exactly the fields mpBroadcastState sends for a monster
      var guest = JSON.parse(JSON.stringify({ i: 1, x: 0, y: 0, r: host.r, color: host.color, name: host.name, emoji: host.emoji, hp: 1, maxHp: 1 }));
      var a = monsterLook(host), b = monsterLook(guest);
      if (a.theme.key !== b.theme.key || a.base !== b.base || a.parts !== b.parts) bad.push(w.id + ':' + host.name);
    });
  });
  currentWorld = WORLDS[0]; _themedCache.clear();
  return JSON.stringify(bad);
})()`));
check(mp.length === 0, 'host and guest build the identical look and mutation from name + world (no new packet data)', mp.join(', ') || 'all ' + worldCount * 4);
check(/name:m\.name, emoji:m\.emoji/.test(code), 'the state packet still carries the name and emoji the look is derived from');

// ---------- 5. mechanics ----------
console.log('\n5. monsters play exactly as before:\n');
const mk = Object.keys(MECH_BASELINE);
const diff = mk.filter(k => mechNow[k] !== MECH_BASELINE[k]);
check(Object.keys(mechNow).length === mk.length && diff.length === 0,
      'radius, speed, hp, damage, score and ability flags match the pre-change game for all ' + mk.length + ' world x class x wave spawns',
      diff.length ? diff.slice(0, 3).map(k => k + ': ' + mechNow[k] + ' vs ' + MECH_BASELINE[k]).join(' | ') : 'identical');
check(!/\bmut\b|look|theme/.test((code.match(/function spawnMonster\(\)[\s\S]*?\n    }\n/) || [''])[0]), 'spawnMonster is untouched by the look system');

console.log('\n' + (ok ? 'ALL PASS' : 'SOME CHECKS FAILED'));
process.exit(ok ? 0 : 1);
