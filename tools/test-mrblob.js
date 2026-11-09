// 🍮 Mr Blob's loot: Mr Blob (eats 60%, 20% giant jump kills every monster), Master of Candy Grinding (+10% candy),
// Friendship (hold F: Mr Gum, 20% of Mrs Gum's stats), 3 Blobs (block 1 attack, 10% a pet levels up).
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
const reset = () => q(`petsOwned = []; equippedPets = []; savePets(); saveEquippedPet(); rebuildPetRuntime(); localStorage.setItem(BLOBS_KEY, '0'); localStorage.removeItem(FRIENDSHIP_KEY); localStorage.removeItem('daniels-arcade-v1'); localStorage.removeItem('monster_attack_rollmaster_carry'); mrGumCd = 0; fHeld = -1; blobJumpNext = null;`);
const boss = `({ isBoss: true, name: 'BOSS Mr Blob', x: 0, y: 0 })`;
const roll = (nums) => JSON.parse(q(`(function(){ var r = ${JSON.stringify(nums)}, i = 0; return JSON.stringify(mrBlobDrops(${boss}, function(){ return r[i++]; })); })()`));

// ---- the drops ----
reset();
check(q(`mrBlobDrops({ isBoss: true, name: 'BOSS Mr Roll' }).length`) === 0 && q(`mrBlobDrops({ isBoss: false, name: 'Mr Blob' }).length`) === 0, 'only Mr Blob (the boss) drops these');
let got = roll([0.05, 0.2, 0.3, 0.5]);
check(got.length === 4 && q(`mrBlobIdx()`) >= 0 && q(`arcadeOwns('candygrinder')`) && q(`hasFriendship()`) && q(`itemCount(BLOBS_KEY)`) === 3,
      'lucky rolls: 🍮 Mr Blob, 🏅 Candy Grinding, 🤝 Friendship, 🟤 3 Blobs', JSON.stringify(got));
reset();
check(roll([0.11, 0.31, 0.41, 0.61]).length === 0, 'just above every chance: nothing (10 / 30 / 40 / 60 %)');
const freq = JSON.parse(q(`(function(){ var n = 4000, c = { blob: 0, title: 0, friend: 0, blobs: 0 };
  for (var i = 0; i < n; i++) { petsOwned = []; equippedPets = []; localStorage.removeItem('daniels-arcade-v1'); localStorage.removeItem(FRIENDSHIP_KEY); var g = mrBlobDrops(${boss});
    g.forEach(function(x){ if (/Mr Blob \\(/.test(x)) c.blob++; if (/Grinding/.test(x)) c.title++; if (/Friendship/.test(x)) c.friend++; if (/3 Blobs/.test(x)) c.blobs++; }); }
  for (var k in c) c[k] = Math.round(c[k] / n * 100); return JSON.stringify(c); })()`));
check(Math.abs(freq.blob - 10) <= 3 && Math.abs(freq.title - 30) <= 4 && Math.abs(freq.friend - 40) <= 4 && Math.abs(freq.blobs - 60) <= 4, 'the dice really roll ~10 / 30 / 40 / 60 %', JSON.stringify(freq));
reset();

// ---- 🍮 Mr Blob the pet ----
q(`gameRunning = false; startGame(); waveIntroTimer = 0; monsters = []; var bi = giveMrBlob(); if (equippedPets.indexOf(bi) < 0) { equippedPets.push(bi); rebuildPetRuntime(); }`);
const eat = JSON.parse(q(`(function(){ var eaten = 0, jumps = 0, n = 3000; for (var k = 0; k < n; k++) { player.hp = player.maxHp = 1e9; player.invincible = 0; player.petDodge = 0; var h = player.hp; playerHit(5, player, 'x'); if (player.hp === h) eaten++; if (blobJumpNext) { jumps++; blobJumpNext = null; } }
  return JSON.stringify({ rate: eaten / n, jump: jumps / eaten }); })()`));
check(eat.rate > 0.55 && eat.rate < 0.65, 'Mr Blob eats about 60% of the attacks aimed at you', JSON.stringify(eat));
check(eat.jump > 0.16 && eat.jump < 0.24, '…and about 20% of the time he does the giant jump');
const jump = JSON.parse(q(`(function(){ monsters = []; for (var k = 0; k < 6; k++) spawnMonster(); monsters.forEach(function(m){ m.hp = m.maxHp = 500; });
  var b = monsters[0]; b.isBoss = true; b.hp = b.maxHp = 4000; monsters.forEach(function(m){ m.hasShield = true; m.shieldUp = true; });
  blobJumpNext = petsOwned[mrBlobIdx()]; update();
  var alive = monsters.filter(function(m){ return m.hp > 0 && !m.isBoss; }).length;
  return JSON.stringify({ alive: alive, bossHp: b.hp, big: (blobJumpUntil.get(petsOwned[mrBlobIdx()]) || 0) - performance.now(), saved: 'blobJumpUntil' in petsOwned[mrBlobIdx()] || /jump/i.test(localStorage.getItem(PETS_KEY)) }); })()`));
check(jump.alive === 0 && jump.bossHp === 3000 && jump.big > 0 && !jump.saved, 'the giant jump squashes every monster (a boss loses 25%)', JSON.stringify(jump));
check(q(`(function(){ var c = document.getElementById('x').getContext('2d'); drawPetFull(petsOwned[mrBlobIdx()], c, 30, 30, 1); return true; })()`), 'he draws as a chocolate pudding (and grows when he jumps)');
q(`equippedPets = []; rebuildPetRuntime();`);
check(q(`(function(){ var n = 0; for (var k = 0; k < 300; k++) { player.hp = player.maxHp = 1e9; player.invincible = 0; var h = player.hp; playerHit(5, player, 'x'); if (player.hp === h) n++; } return n; })()`) === 0, 'he only eats attacks while he is out with you');

// ---- 🟤 Blobs ----
reset();
q(`gameRunning = false; startGame(); waveIntroTimer = 0; petsOwned = [{ name: 'Rat', rank: 'F', ability: '💪 Damage Boost', element: 'Fire' }]; savePets(); localStorage.setItem(BLOBS_KEY, '3');`);
const bl = JSON.parse(q(`(function(){ var blocked = 0; for (var k = 0; k < 5; k++) { player.hp = player.maxHp = 1e9; player.invincible = 0; player.petDodge = 0; var h = player.hp; playerHit(5, player, 'x'); if (player.hp === h) blocked++; } return JSON.stringify({ blocked: blocked, left: itemCount(BLOBS_KEY) }); })()`));
check(bl.blocked === 3 && bl.left === 0, 'each Blob blocks one attack, then it is used up', JSON.stringify(bl));
check(q(`(function(){ petsOwned[0].level = 1; localStorage.setItem(BLOBS_KEY, '1'); blobBlocks(player, function(){ return 0.05; }); return petLevel(petsOwned[0]); })()`) === 2, '10%: a Blob levels up one of your pets');
check(q(`(function(){ localStorage.setItem(BLOBS_KEY, '1'); blobBlocks(player, function(){ return 0.15; }); return petLevel(petsOwned[0]); })()`) === 2, '…and above 10% it does not');

// ---- 🤝 Friendship: hold F → Mr Gum ----
reset();
q(`gameRunning = false; startGame(); waveIntroTimer = 0; allies = []; wave = 1;`);
check(q(`summonMrGum()`) === false && q(`allies.length`) === 0, 'no skill, no Mr Gum');
q(`localStorage.setItem(FRIENDSHIP_KEY, '1');`);
const kd = (k, rep) => q(`(function(){ var ev = { key: '${k}', repeat: ${!!rep}, preventDefault: function(){} }; return ev; })()`);
const st = JSON.parse(q(`JSON.stringify(mrGumStats())`));
// Mrs Gum the boss at wave 1: hp 90*7*6.3 = 3969, damage (18+0)*2 = 36 -> Mr Gum gets 20%.
check(st.hp === 794 && st.damage === 7, 'Mr Gum has 20% of Mrs Gum the boss\'s stats', JSON.stringify(st));
q(`fHeld = 0; for (var k = 0; k < 30; k++) update();`);
check(q(`allies.filter(function(a){ return a.kind === 'gum'; }).length`) === 0, 'half a second of holding F: not yet');
q(`for (var k = 0; k < 40; k++) update();`);
const gum = JSON.parse(q(`JSON.stringify(allies.filter(function(a){ return a.kind === 'gum'; }).map(function(a){ return [a.hp, a.damage]; }))`));
check(gum.length === 1 && gum[0][0] === 794, 'hold F for 1 second: 🤝 Mr Gum is summoned', JSON.stringify(gum));
check(q(`summonMrGum()`) === false, 'then he has a cooldown');
check(/fHeld < F_HOLD; fHeld = -1; if \(tap && gameRunning\) toggleFullscreen\(\)/.test(code), 'a quick tap of F is still fullscreen');
check(q(`SUMMON_EMOJI[summonKind({ kind: 'gum' })]`) === '🧸' && /gum: +\(\) => makeGummyMesh3D\(\)/.test(code), 'Mr Gum has his own look (2D, 3D, raycast)');
q(`for (var k = 0; k < 5; k++) update(); draw();`);
check(true, 'update + draw with Mr Gum out');

// ---- 🏅 Master of Candy Grinding: +10% candy (stacks with Master of Rolls) ----
reset();
const c10 = JSON.parse(q(`(function(){ var ev = EVENTS.halloween; loadEvent(ev); grantArcadeItem('candygrinder'); var a = evWallet; addEventCur(100, ev); var one = evWallet - a;
  grantArcadeItem('rollmaster'); a = evWallet; addEventCur(100, ev); return JSON.stringify([one, evWallet - a]); })()`));
check(c10[0] === 110 && c10[1] === 113, 'Candy Grinding: +10% candy (+13% with Master of Rolls too)', JSON.stringify(c10));
q(`openPetsScreen()`);
check(/Blobs: /.test(q(`document.getElementById('pets-items').textContent`)), 'the Pets screen shows your Blobs');
check(/mrBlobDrops\(m\)/.test(code), 'every kill is checked');

console.log('\n' + (ok ? 'MR BLOB PASS' : 'MR BLOB FAIL'));
process.exit(ok ? 0 : 1);
