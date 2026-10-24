// 🎃 The Halloween event: dates, candy drops and pickup, the Pumpkin King on boss waves,
// jack-o'-lanterns, the candy shop (incl. arcade rewards) and the menu button.
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
const force = v => q(v ? `localStorage.setItem('monster_attack_event_force', '${v}')` : `localStorage.removeItem('monster_attack_event_force')`);

// ---- when it is on ----
force(null);
check(q(`isHalloween(new Date(2026, 9, 1))`) && q(`isHalloween(new Date(2026, 9, 31))`) && q(`isHalloween(new Date(2026, 10, 7))`), 'on from 1 October to 7 November');
check(!q(`isHalloween(new Date(2026, 8, 30))`) && !q(`isHalloween(new Date(2026, 10, 8))`) && !q(`isHalloween(new Date(2027, 2, 1))`), 'off the rest of the year');
check(q(`halloweenDaysLeft(new Date(2026, 9, 24, 12))`) === 15 && q(`halloweenDaysLeft(new Date(2026, 10, 7, 12))`) === 1, 'counts the days left', q(`halloweenDaysLeft(new Date(2026, 9, 24, 12))`));
force('off'); check(q(`isHalloween(new Date(2026, 9, 24))`) === false, 'can be forced off');
force('halloween'); check(q(`isHalloween(new Date(2026, 2, 1))`) === true, 'and forced on');

// ---- menu button ----
force('halloween'); q(`refreshHalloweenButton()`);
check(q(`document.getElementById('halloween-btn').style.display`) === '', 'the 🎃 Halloween button shows during the event');
force('off'); q(`refreshHalloweenButton()`);
check(q(`document.getElementById('halloween-btn').style.display`) === 'none', 'and hides after it');

// ---- candy drops ----
force('halloween');
q(`gameRunning=false; startGame(); monsters=[]; pickups=[];`);
const drops = JSON.parse(q(`(function(){
  var n = 0, bags = 0, king = 0;
  for (var i = 0; i < 2000; i++) { pickups = []; halloweenOnKill({ x: 100, y: 100, name: 'Frosty' }); n += pickups.length; }
  pickups = []; halloweenOnKill({ x: 100, y: 100, name: 'Dragon', isBoss: true }); bags = pickups.reduce(function(a, p){ return a + p.n; }, 0);
  pickups = []; halloweenOnKill({ x: 100, y: 100, name: 'Pumpkin King', isBoss: true }); king = pickups.reduce(function(a, p){ return a + p.n; }, 0);
  var types = pickups.every(function(p){ return p.type === 'candy'; });
  pickups = [];
  return JSON.stringify({ rate: n / 2000, bags: bags, king: king, types: types }); })()`));
check(drops.rate > 0.25 && drops.rate < 0.35, 'monsters drop candy about 30% of the time', drops.rate.toFixed(3));
check(drops.bags === 15 && drops.king === 25 && drops.types, 'a boss drops a bag of 15, the Pumpkin King 25', drops.bags + ' / ' + drops.king);
force('off');
check(q(`(function(){ pickups = []; for (var i = 0; i < 200; i++) halloweenOnKill({ x: 0, y: 0, name: 'Dragon', isBoss: true }); return pickups.length; })()`) === 0, 'no candy when the event is off');
// A real kill drops through the normal kill path.
force('halloween');
check(q(`(function(){ gameRunning=false; startGame(); pickups=[]; monsters=[]; spawnMonster(); var m = monsters[0]; m.isBoss = true; m.hp = 1; m.hasShield = false; m.shieldUp = false; m.dodge = 0; hitMonster(m, 0, 999); return pickups.filter(function(p){ return p.type === 'candy'; }).length; })()`) === 5,
      'killing a boss in a real run drops the candy');
// Walking over candy collects it.
const got = JSON.parse(q(`(function(){
  candy = 0; saveCandy(); waveIntroTimer = 0; pickups = [{ x: player.x, y: player.y, type: 'candy', n: 3, life: 600 }]; monsters = []; monstersSpawned = monstersToSpawn;
  update(); return JSON.stringify({ candy: candy, saved: localStorage.getItem('monster_attack_candy'), left: pickups.length }); })()`));
check(got.candy === 3 && got.saved === '3' && got.left === 0, 'walking over candy collects it and saves it', JSON.stringify(got));

// ---- Pumpkin King ----
const king = JSON.parse(q(`(function(){
  var c = MONSTER_CLASSES.find(function(x){ return x.name === 'Pumpkin King'; });
  wave = 10; var kings = 0; for (var i = 0; i < 1000; i++) if (rollMonsterClass().name === 'Pumpkin King') kings++;
  wave = 3; var early = 0; for (var i = 0; i < 300; i++) if (rollMonsterClass().name === 'Pumpkin King') early++;
  return JSON.stringify({ boss: !!(c && c.isBossOnly), kings: kings, early: early }); })()`));
check(king.boss, 'the Pumpkin King is a boss');
check(king.kings > 280 && king.kings < 420, 'he takes about a third of boss waves', king.kings + '/1000');
check(king.early === 0, 'never on a normal wave');
force('off');
check(q(`(function(){ wave = 10; for (var i = 0; i < 500; i++) if (rollMonsterClass().name === 'Pumpkin King') return false; wave = 1; return true; })()`) === true, 'and never outside the event');

// ---- jack-o'-lanterns ----
force('halloween');
check(q(`PROPS_FOR(findWorld('desert')).indexOf('jackolantern') > -1 && PROPS_FOR(findWorld('arctic')).indexOf('jackolantern') > -1`) === true, "jack-o'-lanterns stand in every world");
check(/case 'jackolantern':/.test(code), "and they have a 3D model");
force('off');
check(q(`PROPS_FOR(findWorld('desert')).indexOf('jackolantern')`) === -1, 'not after the event');

// ---- the candy shop ----
force('halloween');
setArcade({ coins: 0, owned: [] });
q(`candy = 200; saveCandy(); coins = 0n; seasonXP = 0; openHalloweenScreen();`);
const shopRows = q(`document.getElementById('halloween-shop').children.length`);
check(shopRows === 4, 'the shop lists 4 rewards', shopRows);
check(q(`buyHalloween('flesh')`) === true && q(`coins.toString()`) === '100' && q('candy') === 190, '10 candy -> 100 flesh');
check(q(`buyHalloween('xp')`) === true && q('seasonXP') === 250 && q('candy') === 170, '20 candy -> 250 Season Pass XP');
check(q(`buyHalloween('gun')`) === true && JSON.parse(store[ARC]).owned.indexOf('gun-jack-o-lantern') > -1 && q('candy') === 120,
      "50 candy -> the Jack-o'-Lantern gun skin, in the arcade save");
check(q(`buyHalloween('gun')`) === false && q('candy') === 120, 'it cannot be bought twice');
check(q(`buyHalloween('title')`) === true && JSON.parse(store[ARC]).owned.indexOf('pumpkin') > -1 && q('candy') === 20, '100 candy -> the 🎃 Pumpkin King title');
check(q(`buyHalloween('xp')`) === true && q(`buyHalloween('flesh')`) === false && q('candy') === 0, 'not enough candy -> no sale');
check(q(`localStorage.getItem('monster_attack_candy')`) === '0', 'spending is saved');
force('off'); q(`candy = 50; saveCandy();`);
check(q(`buyHalloween('flesh')`) === false && q('candy') === 50, 'the shop is closed after the event (the candy is kept)');
q(`renderHalloweenScreen()`);
check(/over/.test(q(`document.getElementById('halloween-days').textContent`)), 'and says the event is over');
const arcadeItems = q(`(function(){ try { var s = window.ArcadeShop; if (!s) return 'no shop'; var t = s.SHOP.Titles.find(function(i){ return i.id === 'pumpkin'; }); var g = s.SHOP['Gun Skins'].find(function(i){ return i.id === 'gun-jack-o-lantern'; }); return !!(t && t.secret && g && g.secret && g.skin.bullet); } catch (e) { return e.message; } })()`);
check(arcadeItems === true || arcadeItems === 'no shop', 'the arcade shop knows both rewards (secret, not for sale)', String(arcadeItems));

console.log('\n' + (ok ? 'HALLOWEEN PASS' : 'HALLOWEEN FAIL'));
process.exit(ok ? 0 : 1);
