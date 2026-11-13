// 🏆 Achievement 🦶 Achilles Heel: knocked out by ONE hit from full health in Monster Attack!
// (an arcade title, shown in the arcade's 🏆 Achievements box).
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
const owns = () => q(`arcadeOwns('achilles')`);
q(`localStorage.setItem('daniels-arcade-v1', JSON.stringify({ owned: [] })); petsOwned = []; equippedPets = []; rebuildPetRuntime();
   ['monster_attack_blobs','monster_attack_stockings'].forEach(function(k){ localStorage.setItem(k, '0'); });
   gameRunning = false; startGame(); waveIntroTimer = 0;`);
q(`player.maxHp = 100; player.hp = 100; player.invincible = 0; player.petDodge = 0; playerHit(40, player, 'x');`);
check(!owns(), 'a hit that does not finish you: nothing');
q(`player.hp = 50; player.invincible = 0; playerHit(80, player, 'x');`);
check(!owns(), 'knocked out, but you were not at full health: nothing');
q(`gameRunning = false; startGame(); waveIntroTimer = 0; player.maxHp = 100; player.hp = 100; player.invincible = 0; player.petDodge = 0; playerHit(150, player, 'Reaper');`);
check(owns(), 'ONE hit from full health: 🦶 Achilles Heel unlocked');
check(JSON.parse(q(`localStorage.getItem('daniels-arcade-v1')`)).owned.filter(x => x === 'achilles').length === 1, 'given once');
check(/'achilles'/.test(code), 'the game grants the arcade title');
// ---- 🏛️ a god from the arcade's 🏆 Achievements box ----
q(`petsOwned = []; equippedPets = []; savePets(); saveEquippedPet(); rebuildPetRuntime();
   localStorage.setItem('daniels-arcade-v1', JSON.stringify({ owned: [], godPet: 'Odin', pendingPets: ['Odin'] }));`);
const god = JSON.parse(q(`JSON.stringify(claimArcadePets())`));
const odin = JSON.parse(q(`JSON.stringify(petsOwned.find(function(p){ return p.name === 'Odin'; }) || null)`));
check(god.length === 1 && odin && odin.rank === 'SSS' && odin.god && odin.exclusive && odin.element === 'Shadow', 'the arcade\'s god pet arrives in your pets (🦅 Odin, SSS)', JSON.stringify(odin));
check(q(`equippedPets.indexOf(petsOwned.length - 1) > -1`), '…and goes out with you if there is room');
check(JSON.parse(q(`localStorage.getItem('daniels-arcade-v1')`)).pendingPets.length === 0 && q(`claimArcadePets().length`) === 0 && q(`petsOwned.length`) === 1, 'only once (the arcade\'s note is cleared)');
check(q(`(function(){ for (var i = 0; i < 300; i++) { var r = hatchOneEgg(); if (['Zeus','Achilles','Odin'].indexOf(r.name) > -1) return false; } return true; })()`), 'the gods never come out of eggs');
check(/claimArcadePets\(\);   \/\/ 🏛️/.test(code) && /function openPetsScreen\(\) \{\s*claimArcadePets\(\);/.test(code), 'checked when the game loads and when 🐾 Pets opens');
check(q(`(function(){ var c = document.getElementById('x').getContext('2d'); ['Zeus','Achilles','Odin'].forEach(function(n){ drawPetFull({ name: n, rank: 'SSS', element: 'Holy', ability: '🛡️ Defense' }, c, 30, 30, 1); }); return true; })()`), 'all three draw');

// ---- 🏆 in the Admin Panel, the Owner Panel and [U] ----
check(/adminAchievement\('achilles'\)/.test(html) && /ownerAchievement\('all'\)/.test(html) && /unlockAction\('achievements'\)/.test(html), 'the Admin Panel, the Owner Panel and [U] all have 🏆 Achievements');
q(`localStorage.setItem('daniels-arcade-v1', JSON.stringify({ owned: [] })); localStorage.removeItem(ADMIN_LIMITS_KEY);`);
check(q(`ownerAchievement('achilles')`) === true && q(`arcadeOwns('achilles')`), '👑 Owner Panel: 🦶 Achilles Heel');
check(q(`ownerAchievement('all')`) && ['achilles','champion','comeback','revenge','dimension'].every(id => q(`arcadeOwns('${id}')`)), '👑 …and all of them at once');
q(`localStorage.setItem('daniels-arcade-v1', JSON.stringify({ owned: [] }));`);
check(JSON.stringify([q(`adminAchievement('champion')`), q(`adminAchievement('revenge')`)]) === '[true,false]' && q(`arcadeOwns('champion')`) && !q(`arcadeOwns('revenge')`), '🛠️ Admin Panel: 1 a day');
q(`localStorage.setItem('daniels-arcade-v1', JSON.stringify({ owned: ['owner'] }));`);
check(q(`unlockAction('achievements')`) === true && q(`arcadeOwns('dimension')`), '[U] Admin Unlocks: all achievements');
q(`localStorage.removeItem(ADMIN_LIMITS_KEY);`);

console.log('\n' + (ok ? 'ACHILLES PASS' : 'ACHILLES FAIL'));
process.exit(ok ? 0 : 1);
