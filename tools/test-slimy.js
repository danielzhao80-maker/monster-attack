// 🍮 Slimy the Jelly's loot: the Little Blue Slime pet (name/look, eats attacks, levels, fires back),
// Upgrade Crystals (pet levels), 64 blood -> [B] blood wall (10 HP), 500 flesh + 5 points.
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
const reset = () => q(`petsOwned = []; equippedPets = []; savePets(); saveEquippedPet(); rebuildPetRuntime(); localStorage.setItem(CRYSTAL_KEY, '0'); localStorage.setItem(BLOOD_KEY, '0'); coins = 0n; points = 0; savePoints();`);
const slimy = `({ isBoss: true, name: 'BOSS Slimy the Jelly', x: 0, y: 0 })`;
// Deterministic rolls: a list of numbers the drop dice will return, in order.
const roll = (nums) => JSON.parse(q(`(function(){ var r = ${JSON.stringify(nums)}, i = 0; return JSON.stringify(slimyDrops(${slimy}, function(){ return r[i++]; })); })()`));

// ---- the drops ----
reset();
check(q(`slimyDrops({ isBoss: true, name: 'BOSS Mr Roll' }).length`) === 0 && q(`slimyDrops({ isBoss: false, name: 'Slimy the Jelly' }).length`) === 0, 'only Slimy the Jelly (the boss) drops these');
let got = roll([0.1, 0.05, 0.1, 0.1]);
check(got.length === 4 && q(`blueSlimeIdx()`) >= 0, 'lucky rolls: all four drops', JSON.stringify(got));
check(q(`itemCount(CRYSTAL_KEY)`) === 1 && q(`itemCount(BLOOD_KEY)`) === 64 && q(`coins.toString()`) === '500' && q('points') === 5,
      '💎 1 crystal, 🩸 64 blood, 🍖 500 flesh + 🏆 5 points');
check(q(`equippedPets.indexOf(blueSlimeIdx()) > -1`), 'the new slime is put out with you');
reset();
got = roll([0.26, 0.11, 0.31, 0.61]);
check(got.length === 0 && q(`blueSlimeIdx()`) === -1, 'just above every chance: nothing (slime 25%, crystal 10%, blood 30%, flesh 60%)');
q(`giveBlueSlime()`);
got = roll([0.49, 0.9, 0.9, 0.9]);
check(q(`petLevel(petsOwned[blueSlimeIdx()])`) === 2 && /levelled up/.test(got[0] || ''), 'already have the slime: 50% it levels up instead', JSON.stringify(got));
got = roll([0.51, 0.9, 0.9, 0.9]);
check(q(`petLevel(petsOwned[blueSlimeIdx()])`) === 2 && got.length === 0, '…and not above 50%');
check(q(`petsOwned.filter(function(p){ return p.special === 'blueslime'; }).length`) === 1, 'you only ever have one Little Blue Slime');
// The real dice.
const freq = JSON.parse(q(`(function(){ var n = 4000, c = { slime: 0, crystal: 0, blood: 0, flesh: 0 };
  for (var i = 0; i < n; i++) { petsOwned = []; equippedPets = []; var g = slimyDrops(${slimy});
    g.forEach(function(x){ if (/Slime/.test(x)) c.slime++; if (/Crystal/.test(x)) c.crystal++; if (/blood/.test(x)) c.blood++; if (/flesh/.test(x)) c.flesh++; }); }
  for (var k in c) c[k] = Math.round(c[k] / n * 100); return JSON.stringify(c); })()`));
check(Math.abs(freq.slime - 25) <= 4 && Math.abs(freq.crystal - 10) <= 3 && Math.abs(freq.blood - 30) <= 4 && Math.abs(freq.flesh - 60) <= 4, 'the dice really roll ~25 / 10 / 30 / 60 %', JSON.stringify(freq));
reset();

// ---- name and look ----
q(`var i = giveBlueSlime(); openSlimeCustom(i);`);
check(q(`document.getElementById('slime-modal').style.display`) === 'flex', '✏️ the slime has its own name & look window');
q(`document.getElementById('slime-name').value = 'Bloopy<b>'; _slimeEdit.color = '#ff6bcb'; _slimeEdit.hat = '👑'; saveSlimeCustom();`);
const sp = JSON.parse(q(`JSON.stringify(petsOwned[blueSlimeIdx()])`));
check(sp.nickname === 'Bloopyb' && sp.color === '#ff6bcb' && sp.hat === '👑', 'you name it and pick its colour and hat (saved)', JSON.stringify(sp));
q(`loadPets(); loadEquippedPet();`);
check(q(`petsOwned[blueSlimeIdx()].nickname`) === 'Bloopyb', 'and it is still yours after a reload');
check(q(`(function(){ var c = document.getElementById('slime-preview').getContext('2d'); drawPetFull(petsOwned[blueSlimeIdx()], c, 30, 30, 1); return true; })()`), 'it draws as a slime (its own look, not a regular pet)');

// ---- in a fight: 20% to eat an attack, level up and fire it back ----
const fightRes = JSON.parse(q(`(function(){ gameRunning = false; startGame(); waveIntroTimer = 0; monsters = []; spawnMonster(); var m = monsters[0]; m.x = player.x + 200; m.y = player.y;
  var i = blueSlimeIdx(); if (equippedPets.indexOf(i) < 0) { equippedPets.push(i); rebuildPetRuntime(); }
  var lv0 = petLevel(petsOwned[i]), eaten = 0, hurt = 0, back = 0, n = 2000;
  for (var k = 0; k < n; k++) { player.hp = player.maxHp = 1e9; player.invincible = 0; player.petDodge = 0; bullets = []; var h = player.hp; playerHit(5, player, m.name); if (player.hp === h) { eaten++; if (bullets.some(function(b){ return b.petElement === 'Ice' && b.damage > 10; })) back++; } else hurt++; }
  return JSON.stringify({ rate: eaten / n, back: back, eaten: eaten, levels: petLevel(petsOwned[i]) - lv0 }); })()`));
check(fightRes.rate > 0.16 && fightRes.rate < 0.24, 'the slime eats about 20% of the attacks aimed at you', JSON.stringify(fightRes));
check(fightRes.back === fightRes.eaten, '…fires every one it eats back at the monster');
check(fightRes.levels === Math.min(fightRes.eaten, 9), '…and levels itself up each time (up to level 10)', fightRes.levels + ' levels');
check(q(`petLevel(petsOwned[blueSlimeIdx()])`) === 10 && q('PET_MAX_LEVEL') === 10, 'pet levels stop at 10');
check(q(`(function(){ var i = blueSlimeIdx(); localStorage.setItem(CRYSTAL_KEY, '5'); var ok = levelUpPet(i); return ok + '/' + itemCount(CRYSTAL_KEY); })()`) === 'false/5', 'a crystal cannot push a pet past 10 (and is not used up)');
check(q(`(function(){ petsOwned[blueSlimeIdx()].level = 57; savePets(); loadPets(); return petsOwned[blueSlimeIdx()].level; })()`) === 10, 'old saves with pets above 10 are brought down to 10');
q(`equippedPets = []; rebuildPetRuntime();`);
check(q(`(function(){ var n = 0; for (var k = 0; k < 300; k++) { player.hp = player.maxHp = 1e9; player.invincible = 0; var h = player.hp; playerHit(5, player, 'x'); if (player.hp === h) n++; } return n; })()`) === 0, 'it only helps while it is out with you');

// ---- Upgrade Crystals level up pets ----
reset();
q(`petsOwned = [{ name: 'Rat', rank: 'F', ability: '💪 Damage Boost', element: 'Fire' }]; savePets(); equippedPets = [0]; rebuildPetRuntime();`);
check(q(`levelUpPet(0)`) === false && q(`petLevel(petsOwned[0])`) === 1, 'no crystal, no level');
q(`localStorage.setItem(CRYSTAL_KEY, '2')`);
check(q(`levelUpPet(0)`) === true && q(`petLevel(petsOwned[0])`) === 2 && q(`itemCount(CRYSTAL_KEY)`) === 1, '💎 a crystal levels a pet up (and is used up)');
check(Math.abs(q(`petLevelMult(petsOwned[0])`) - 1.15) < 1e-9, 'each level makes its shots 15% stronger');
q(`openPetsScreen()`);
check(/Upgrade Crystals: 1/.test(q(`document.getElementById('pets-items').textContent`)) && /Lv\.2/.test(q(`document.getElementById('pets-collection').innerHTML`)), 'the Pets screen shows crystals, blood and each pet\'s level');

// ---- 🩸 blood wall ----
reset();
q(`gameRunning = false; startGame(); waveIntroTimer = 0; walls = []; player.angle = 0;`);
check(q(`buildBloodWall(player)`) === false && q('walls.length') === 0, 'no wall without 64 blood');
q(`localStorage.setItem(BLOOD_KEY, '70')`);
const bw = JSON.parse(q(`(function(){ var ok = buildBloodWall(player); var w = walls[0]; return JSON.stringify({ ok: ok, hp: w && w.hp, kind: w && w.kind, left: itemCount(BLOOD_KEY) }); })()`));
check(bw.ok && bw.kind === 'blood' && bw.hp === 10 && bw.left === 6, '[B] spends 64 blood on a blood wall with 10 HP', JSON.stringify(bw));
const absorb = q(`(function(){ var w = walls[0]; var hits = 0; while (walls.indexOf(w) > -1 && hits < 50) { bullets = [{ x: w.x, y: w.y, z: 10, vx: 0, vy: 0, vz: 0, life: 5, damage: 5, owner: 'monster', color: '#f00' }]; update(); hits++; } return hits; })()`);
check(absorb === 10, 'it soaks up 10 attacks, then breaks', absorb + ' hits');
check(/k==='b' && gameRunning/.test(code), 'the B key builds it');

console.log('\n' + (ok ? 'SLIMY PASS' : 'SLIMY FAIL'));
process.exit(ok ? 0 : 1);
