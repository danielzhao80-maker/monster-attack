// 🐍 Typhon, the OP Greek-mythology boss: rare (5% of boss waves from 20), lightning storms, big rewards + title.
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
q(`chosenClass = CLASSES[0]; playerName='T'; gameRunning=false; cameraMode='topdown';`);
q(`chosenClass = CLASSES[0]; playerName='T'; gameRunning=false; cameraMode='topdown';`);
const ty = JSON.parse(q(`JSON.stringify(MONSTER_CLASSES.find(function(c){ return c.name === 'Typhon'; }))`));
const gum = JSON.parse(q(`JSON.stringify(MONSTER_CLASSES.find(function(c){ return c.name === 'Mrs Gum'; }))`));
check(ty && ty.isBossOnly && ty.hp > gum.hp && ty.damage > gum.damage && ty.breathesFire && ty.enrage && ty.teleports && ty.hasShield && ty.canScream, 'Typhon: the strongest boss — more HP and damage than any other, and every boss power', JSON.stringify({ hp: ty.hp, dmg: ty.damage }));
const rate = JSON.parse(q(`(function(){ var n = 0, low = 0, k = 4000; currentWorld = WORLDS[0]; wave = 20; for (var i = 0; i < k; i++) if (rollMonsterClass().name === 'Typhon') n++; wave = 10; for (var i = 0; i < 1000; i++) if (rollMonsterClass().name === 'Typhon') low++; wave = 21; var notBoss = 0; for (var i = 0; i < 500; i++) if (rollMonsterClass().name === 'Typhon') notBoss++; wave = 1; return JSON.stringify({ pct: n / k * 100, low: low, notBoss: notBoss }); })()`));
check(Math.abs(rate.pct - 5) < 1.5 && rate.low === 0 && rate.notBoss === 0, 'rare: ~5% of boss waves from wave 20 (never before, never on normal waves)', JSON.stringify(rate));
q(`localStorage.setItem('daniels-arcade-v1', JSON.stringify({ owned: [] })); gameRunning = false; startGame(); waveIntroTimer = 0; monsters = []; coins = 0n; points = 0; savePoints(); summonTyphon();`);
const t = JSON.parse(q(`(function(){ var m = monsters.find(function(x){ return /Typhon/.test(x.name); }); return JSON.stringify({ boss: m && m.isBoss, hp: m && m.maxHp }); })()`));
check(t.boss && t.hp > 2 * 90 * 7 * 6.3, 'summoned (Owner Panel / [U]) he is a real boss — over twice Mrs Gum', JSON.stringify(t));
const storm = JSON.parse(q(`(function(){ player.hp = player.maxHp = 1e9; var m = monsters.find(function(x){ return /Typhon/.test(x.name); }); m.x = player.x + 3000; m._stormCd = 1; typhonTick(); var n = typhonStrikes.length, h = player.hp; player.invincible = 0;
  for (var k = 0; k < 50; k++) { player.invincible = 0; typhonTick(); } return JSON.stringify({ bolts: n, hurt: player.hp < h }); })()`));
check(storm.bolts === 5 && storm.hurt, 'LIGHTNING STORM: 5 bolts around you; one lands where you stand and hits you', JSON.stringify(storm));
q(`player.x += 0; typhonStrikes = []; var m = monsters.find(function(x){ return /Typhon/.test(x.name); }); m._stormCd = 1; typhonTick(); player.x += 400; player.y += 400; var h = player.hp; for (var k = 0; k < 50; k++) { player.invincible = 0; typhonTick(); }`);
check(q(`player.hp`) === q(`h`), 'step out of the sparks and the bolts miss');
const win = JSON.parse(q(`(function(){ var i = monsters.findIndex(function(x){ return /Typhon/.test(x.name); }); var m = monsters[i];
  for (var r = 0; r < 4 && m.hp > 0; r++) hitMonster(m, i, 1e12); return JSON.stringify({ dead: m.hp <= 0, flesh: coins.toString(), points: points, title: arcadeOwns('typhonslayer') }); })()`));
check(win.dead && BigInt(win.flesh) >= 100000n && win.points >= 25 && win.title, 'beat him: 🍖 100,000 flesh, 🏆 25 points, 🐍 Typhon Slayer title', JSON.stringify(win));
q(`for (var k = 0; k < 5; k++) update(); draw();`);
check(/unlockAction\('typhon'\)/.test(html) && /setTimeout\(summonTyphon, 300\)/.test(html), 'Owner Panel and [U] can summon him');
console.log('\n' + (ok ? 'TYPHON PASS' : 'TYPHON FAIL'));
process.exit(ok ? 0 : 1);
