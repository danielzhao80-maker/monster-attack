// 🍪 Biscuit the Cerberus's loot: Cookie the Cerberus (eats corpses, levels), the Cookie Dogs skill
// (click: 5 dogs at 30% of your stats, 50% with Cookie), 10 Crumbles ([T] -> cookie wall), Cookie King avatar.
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
const reset = () => q(`petsOwned = []; equippedPets = []; savePets(); saveEquippedPet(); rebuildPetRuntime(); localStorage.setItem(CRUMBLE_KEY, '0'); localStorage.removeItem(COOKIEDOGS_KEY); localStorage.removeItem('daniels-arcade-v1'); cookieDogsCd = 0;`);
const biscuit = `({ isBoss: true, name: 'BOSS Biscuit the Cerberus', x: 0, y: 0 })`;
const roll = (nums) => JSON.parse(q(`(function(){ var r = ${JSON.stringify(nums)}, i = 0; return JSON.stringify(biscuitDrops(${biscuit}, function(){ return r[i++]; })); })()`));

// ---- the drops ----
reset();
check(q(`biscuitDrops({ isBoss: true, name: 'BOSS Slimy the Jelly' }).length`) === 0 && q(`biscuitDrops({ isBoss: false, name: 'Biscuit the Cerberus' }).length`) === 0, 'only Biscuit the Cerberus (the boss) drops these');
let got = roll([0.05, 0.1, 0.2, 0.3]);
check(got.length === 4, 'lucky rolls: all four drops', JSON.stringify(got));
check(q(`cookieIdx()`) >= 0 && q(`hasCookieDogs()`) && q(`itemCount(CRUMBLE_KEY)`) === 10 && q(`arcadeOwns('cookieking')`), '🐕 Cookie, 🍪🐕 Cookie Dogs, 🍪 10 Crumbles, 👑 Cookie King');
reset();
got = roll([0.11, 0.21, 0.31, 0.41]);
check(got.length === 0, 'just above every chance: nothing (10 / 20 / 30 / 40 %)');
const freq = JSON.parse(q(`(function(){ var n = 4000, c = { cookie: 0, dogs: 0, crumb: 0, king: 0 };
  for (var i = 0; i < n; i++) { petsOwned = []; equippedPets = []; localStorage.removeItem(COOKIEDOGS_KEY); localStorage.removeItem('daniels-arcade-v1'); var g = biscuitDrops(${biscuit});
    g.forEach(function(x){ if (/Cookie the/.test(x)) c.cookie++; if (/Cookie Dogs/.test(x)) c.dogs++; if (/Crumbles/.test(x)) c.crumb++; if (/King/.test(x)) c.king++; }); }
  for (var k in c) c[k] = Math.round(c[k] / n * 100); return JSON.stringify(c); })()`));
check(Math.abs(freq.cookie - 10) <= 3 && Math.abs(freq.dogs - 20) <= 4 && Math.abs(freq.crumb - 30) <= 4 && Math.abs(freq.king - 40) <= 4, 'the dice really roll ~10 / 20 / 30 / 40 %', JSON.stringify(freq));
reset();

// ---- 🐕 Cookie eats corpses ----
q(`gameRunning = false; startGame(); waveIntroTimer = 0; monsters = []; var ci = giveCookie(); if (equippedPets.indexOf(ci) < 0) { equippedPets.push(ci); rebuildPetRuntime(); }`);
check(q(`petsOwned.filter(function(p){ return p.special === 'cookie'; }).length`) === 1 && q(`equippedPets.indexOf(cookieIdx()) > -1`), 'Cookie joins you as a pet');
const eat = JSON.parse(q(`(function(){ var slot = equippedPets.indexOf(cookieIdx()), rt = petRuntime[slot]; var near = 0;
  for (var k = 0; k < 9; k++) if (cookieEats({ x: rt.x + 40, y: rt.y })) near++;
  var far = cookieEats({ x: rt.x + 5000, y: rt.y }); var p = petsOwned[cookieIdx()];
  return JSON.stringify({ near: near, far: far, corpses: p.corpses, lv: petLevel(p) }); })()`));
check(eat.near === 9 && !eat.far && eat.corpses === 9 && eat.lv === 4, 'it eats corpses near it (every 3 = +1 level), not far away', JSON.stringify(eat));
check(q(`(function(){ var c = document.getElementById('x').getContext('2d'); drawPetFull(petsOwned[cookieIdx()], c, 30, 30, 1); return true; })()`), 'it draws as a three-headed cookie dog');
check(/cookieEats\(m\)/.test(code) && /biscuitDrops\(m\)/.test(code), 'every kill is checked (drops + corpse eating)');

// ---- 🍪🐕 Cookie Dogs ----
reset();
q(`gameRunning = false; startGame(); waveIntroTimer = 0; allies = []; player.damage = 100; player.maxHp = 200;`);
check(q(`summonCookieDogs()`) === false && q(`allies.length`) === 0, 'no skill, no dogs');
q(`localStorage.setItem(COOKIEDOGS_KEY, '1'); update();`);
check(q(`document.getElementById('cookiedogs-btn').style.display`) === 'block', 'the skill shows a button to click in the game');
const dogs = JSON.parse(q(`(function(){ summonCookieDogs(); return JSON.stringify(allies.map(function(a){ return [a.kind, a.damage, a.maxHp]; })); })()`));
check(dogs.length === 5 && dogs.every(d => d[0] === 'cookiedog' && d[1] === 30 && d[2] === 60), 'click: 5 cookie dogs with 30% of your stats', JSON.stringify(dogs[0]));
check(q(`summonCookieDogs()`) === false && q(`allies.length`) === 5, 'then it has a cooldown');
q(`allies = []; cookieDogsCd = 0; giveCookie();`);
const dogs2 = JSON.parse(q(`(function(){ summonCookieDogs(); return JSON.stringify(allies.map(function(a){ return [a.damage, a.maxHp]; })); })()`));
check(dogs2.length === 5 && dogs2[0][0] === 50 && dogs2[0][1] === 100, 'with Cookie as a pet: +20% (50% of your stats)', JSON.stringify(dogs2[0]));
check(q(`SUMMON_EMOJI[summonKind({ kind: 'cookiedog' })]`) === '🍪' && /cookiedog: \(\) => makeWolfMesh3D\('cookie'\)/.test(code), 'cookie dogs have their own look (2D, 3D, raycast)');
q(`for (var k = 0; k < 5; k++) update(); draw();`);
check(true, 'update + draw with cookie dogs out');

// ---- 🍪 Crumbles ----
reset();
q(`gameRunning = false; startGame(); waveIntroTimer = 0; walls = []; monsters = []; player.angle = 0;`);
check(q(`throwCrumble(player)`) === false && q('walls.length') === 0, 'no crumbles, nothing to throw');
q(`localStorage.setItem(CRUMBLE_KEY, '10'); spawnMonster(); monsters[0].x = player.x + 150; monsters[0].y = player.y; monsters[0].hp = monsters[0].maxHp = 1000; monsters[0].hasShield = false; monsters[0].shieldUp = false;`);
const cr = JSON.parse(q(`(function(){ var ok = throwCrumble(player); var w = walls[0]; return JSON.stringify({ ok: ok, kind: w && w.kind, hp: w && w.hp, left: itemCount(CRUMBLE_KEY), mhp: monsters[0] && monsters[0].hp }); })()`));
check(cr.ok && cr.kind === 'cookie' && cr.hp === 6 && cr.left === 9, '[T] throws a crumble: it becomes a cookie wall (6 HP)', JSON.stringify(cr));
check(cr.mhp < 1000, '…and the smash hurts the monster where it lands');
q(`draw();`);
check(/k==='t' && gameRunning/.test(code), 'the T key throws it');
q(`openPetsScreen()`);
check(/Crumbles: 9/.test(q(`document.getElementById('pets-items').textContent`)), 'the Pets screen shows your crumbles');

console.log('\n' + (ok ? 'BISCUIT PASS' : 'BISCUIT FAIL'));
process.exit(ok ? 0 : 1);
