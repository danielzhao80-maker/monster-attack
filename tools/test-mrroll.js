// 🍬 Mr Roll's loot: Rolly (40% blocks, levels with blocks, +20% XP), 10 Candy Blocks ([C], 20 shots),
// 3000 flesh + 3 Candy Blocks, The Master of Rolls title (+3% candy).
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
const reset = () => q(`petsOwned = []; equippedPets = []; savePets(); saveEquippedPet(); rebuildPetRuntime(); localStorage.setItem(CANDYBLOCK_KEY, '0'); localStorage.removeItem('daniels-arcade-v1'); coins = 0n;`);
const boss = `({ isBoss: true, name: 'BOSS Mr Roll', x: 0, y: 0 })`;
const roll = (nums) => JSON.parse(q(`(function(){ var r = ${JSON.stringify(nums)}, i = 0; return JSON.stringify(mrRollDrops(${boss}, function(){ return r[i++]; })); })()`));

// ---- the drops ----
reset();
check(q(`mrRollDrops({ isBoss: true, name: 'BOSS Slimy the Jelly' }).length`) === 0 && q(`mrRollDrops({ isBoss: false, name: 'Mr Roll' }).length`) === 0, 'only Mr Roll (the boss) drops these');
let got = roll([0.05, 0.1, 0.2, 0.3]);
check(got.length === 4 && q(`rollyIdx()`) >= 0 && q(`itemCount(CANDYBLOCK_KEY)`) === 13 && q(`coins.toString()`) === '3000' && q(`arcadeOwns('rollmaster')`),
      'lucky rolls: 🍥 Rolly, 🧱 10 + 3 Candy Blocks, 🍖 3000 flesh, 🍥 Master of Rolls', JSON.stringify(got));
reset();
check(roll([0.11, 0.31, 0.41, 0.51]).length === 0, 'just above every chance: nothing (10 / 30 / 40 / 50 %)');
const freq = JSON.parse(q(`(function(){ var n = 4000, c = { rolly: 0, blocks: 0, flesh: 0, title: 0 };
  for (var i = 0; i < n; i++) { petsOwned = []; equippedPets = []; localStorage.removeItem('daniels-arcade-v1'); var g = mrRollDrops(${boss});
    g.forEach(function(x){ if (/Rolly/.test(x)) c.rolly++; if (/10 Candy/.test(x)) c.blocks++; if (/3000/.test(x)) c.flesh++; if (/Master/.test(x)) c.title++; }); }
  for (var k in c) c[k] = Math.round(c[k] / n * 100); return JSON.stringify(c); })()`));
check(Math.abs(freq.rolly - 10) <= 3 && Math.abs(freq.blocks - 30) <= 4 && Math.abs(freq.flesh - 40) <= 4 && Math.abs(freq.title - 50) <= 4, 'the dice really roll ~10 / 30 / 40 / 50 %', JSON.stringify(freq));
reset();

// ---- 🍥 Rolly ----
q(`gameRunning = false; startGame(); waveIntroTimer = 0; monsters = []; var ri = giveRolly(); if (equippedPets.indexOf(ri) < 0) { equippedPets.push(ri); rebuildPetRuntime(); }`);
check(q(`rollyOut()`), 'Rolly joins you as a pet');
const blk = JSON.parse(q(`(function(){ var blocked = 0, n = 2000; for (var k = 0; k < n; k++) { player.hp = player.maxHp = 1e9; player.invincible = 0; player.petDodge = 0; var h = player.hp; playerHit(5, player, 'x'); if (player.hp === h) blocked++; }
  var p = petsOwned[rollyIdx()]; return JSON.stringify({ rate: blocked / n, blocks: p.blocks, lv: petLevel(p) }); })()`));
check(blk.rate > 0.35 && blk.rate < 0.45, 'it blocks about 40% of the attacks aimed at you', JSON.stringify(blk));
check(blk.lv === Math.min(10, 1 + Math.floor(blk.blocks / 5)), 'it levels up from blocking (every 5 blocks, up to 10)');
const xp = JSON.parse(q(`(function(){ plevel = 1; pxp = 0; addXP(100); var a = pxp; equippedPets = []; rebuildPetRuntime(); plevel = 1; pxp = 0; addXP(100); return JSON.stringify([a, pxp]); })()`));
check(xp[0] === 120 && xp[1] === 100, 'while Rolly is out you get 20% more XP', JSON.stringify(xp));
check(q(`(function(){ var n = 0; for (var k = 0; k < 300; k++) { player.hp = player.maxHp = 1e9; player.invincible = 0; var h = player.hp; playerHit(5, player, 'x'); if (player.hp === h) n++; } return n; })()`) === 0, 'it only blocks while it is out with you');
check(q(`(function(){ var c = document.getElementById('x').getContext('2d'); drawPetFull(petsOwned[rollyIdx()], c, 30, 30, 1); return true; })()`), 'it draws as a little candy roll');

// ---- 🧱 Candy Blocks ----
reset();
q(`gameRunning = false; startGame(); waveIntroTimer = 0; walls = []; player.angle = 0;`);
check(q(`placeCandyBlock(player)`) === false && q('walls.length') === 0, 'no blocks, nothing to put down');
q(`localStorage.setItem(CANDYBLOCK_KEY, '2')`);
const cb = JSON.parse(q(`(function(){ var ok = placeCandyBlock(player); var w = walls[0]; return JSON.stringify({ ok: ok, hp: w && w.hp, kind: w && w.kind, left: itemCount(CANDYBLOCK_KEY) }); })()`));
check(cb.ok && cb.kind === 'candy' && cb.hp === 20 && cb.left === 1, '[C] puts down a candy block', JSON.stringify(cb));
const absorb = q(`(function(){ var w = walls[0]; var hits = 0; while (walls.indexOf(w) > -1 && hits < 80) { bullets = [{ x: w.x, y: w.y, z: 10, vx: 0, vy: 0, vz: 0, life: 5, damage: 5, owner: 'monster', color: '#f00' }]; update(); hits++; } return hits; })()`);
check(absorb === 20, 'it blocks 20 shots, then breaks', absorb + ' shots');
q(`placeCandyBlock(player); draw();`);
check(/k==='c' && gameRunning/.test(code), 'the C key puts one down');
q(`openPetsScreen()`);
check(/Candy Blocks: 0/.test(q(`document.getElementById('pets-items').textContent`)), 'the Pets screen shows your candy blocks');
check(/mrRollDrops\(m\)/.test(code), 'every kill is checked');

// ---- 🍥 Master of Rolls: +3% candy ----
q(`localStorage.removeItem('monster_attack_rollmaster_carry')`);
const c3 = JSON.parse(q(`(function(){ var ev = EVENTS.halloween; loadEvent(ev); var a = evWallet; addEventCur(100, ev); var plain = evWallet - a;
  grantArcadeItem('rollmaster'); a = evWallet; addEventCur(100, ev); var boosted = evWallet - a;
  a = evWallet; for (var k = 0; k < 100; k++) addEventCur(1, ev); var small = evWallet - a;
  return JSON.stringify({ plain: plain, boosted: boosted, small: small }); })()`));
check(c3.plain === 100 && c3.boosted === 103 && c3.small === 103, 'the Master of Rolls title gives +3% candy (even on +1 pickups)', JSON.stringify(c3));

console.log('\n' + (ok ? 'MR ROLL PASS' : 'MR ROLL FAIL'));
process.exit(ok ? 0 : 1);
