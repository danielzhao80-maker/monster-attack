// 👑 Daniel the God: an owner / admin-only pet, more OP than Typhon.
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
q(`petsOwned = []; equippedPets = []; savePets(); saveEquippedPet(); rebuildPetRuntime();`);
check(q(`(function(){ for (var i = 0; i < 400; i++) if (/Daniel/.test(hatchOneEgg().name)) return false; return !PETS.some(function(p){ return /Daniel/.test(p.name); }); })()`), 'never from eggs or the normal pet list');
check(/onclick="ownerDaniel\(\)"/.test(html) && /onclick="adminDaniel\(\)"/.test(html) && /unlockAction\('daniel'\)/.test(html), 'only from the Owner Panel, the Admin Panel and [U] Admin Unlocks');
q(`localStorage.setItem('daniels-arcade-v1', JSON.stringify({ owned: [] }));`);
check(q(`unlockAction('daniel')`) === false && q(`danielIdx()`) === -1, '[U] refuses a player who is not an admin or owner');
q(`ownerDaniel();`);
const d = JSON.parse(q(`JSON.stringify(petsOwned[danielIdx()])`));
check(d && d.rank === 'GOD' && d.special === 'danielgod', '👑 Owner Panel: Daniel the God, a GOD-rank pet', JSON.stringify(d));
check(q(`(function(){ ownerDaniel(); return petsOwned.filter(function(p){ return p.special === 'danielgod'; }).length; })()`) === 1, 'only one');
check(q(`isLimitedPet(petsOwned[danielIdx()])`) && q(`equippedPets.indexOf(danielIdx()) > -1`), 'a free slot (does not count toward the 5) and he goes out with you');
check(q(`petBoost(petsOwned[danielIdx()])`) === 3 && ['slime', 'cookie', 'rolly', 'blob'].every(pw => q(`!!petWithPower('${pw}')`)), 'every boss-pet power, ×3');
check(q(`PET_RANK_DAMAGE.GOD`) > q(`PET_RANK_DAMAGE.LIMITED`) * 5 && q(`!!PET_RANK_COLORS.GOD`), 'GOD rank: its own colour and far stronger shots');
q(`petsOwned[danielIdx()].level = 1; savePets(); loadPets();`);
check(q(`petsOwned[danielIdx()].rank`) === 'GOD', 'stays GOD after a reload (not turned into LIMITED)');
// more OP than Typhon
const ty = q(`MONSTER_CLASSES.find(function(c){ return c.name === 'Typhon'; }).damage`);
check(q(`DANIEL_SMITE`) > ty, 'his Divine Smite hits harder than Typhon (' + q('DANIEL_SMITE') + ' vs ' + ty + ')');
q(`gameRunning = false; startGame(); waveIntroTimer = 0; monsters = []; for (var i = 0; i < 7; i++) spawnMonster(); monsters.forEach(function(m, i){ m.x = player.x + 100 + i * 30; m.y = player.y; m.hp = m.maxHp = 4000; m.hasShield = false; });
   equippedPets = [danielIdx()]; rebuildPetRuntime(); danielSmiteCd = 1;`);
const sm = JSON.parse(q(`(function(){ var n0 = monsters.filter(function(m){ return m.hp > 0; }).length; danielTick(); return JSON.stringify({ dead: n0 - monsters.filter(function(m){ return m.hp > 0; }).length, cd: danielSmiteCd }); })()`));
check(sm.dead === 5 && sm.cd === 240, 'DIVINE SMITE: the 5 strongest monsters nearby are struck down at once, every 4 s', JSON.stringify(sm));
const prot = q(`(function(){ var safe = 0, n = 2000; for (var k = 0; k < n; k++) { player.hp = player.maxHp = 1e9; player.invincible = 0; player.petDodge = 0; var h = player.hp; playerHit(5, player, 'x'); if (player.hp === h) safe++; blobJumpNext = null; } return safe / n; })()`);
check(prot > 0.98, 'with him out almost no hit gets through', prot);
check(q(`(function(){ var c = document.getElementById('x').getContext('2d'); drawPetFull(petsOwned[danielIdx()], c, 30, 30, 1); return true; })()`) && /special === 'danielgod'\) \{ const d = makeGodMesh3D/.test(code), 'he has his own look (card and 3D)');
q(`openPetsScreen();`);
check(/GOD[\s\S]*Daniel the God/.test(q(`document.getElementById('pets-collection').innerHTML`)), 'shown in 🐾 Pets as GOD');
console.log('\n' + (ok ? 'DANIEL PASS' : 'DANIEL FAIL'));
process.exit(ok ? 0 : 1);
