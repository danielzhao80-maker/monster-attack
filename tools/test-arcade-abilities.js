// Arcade ⚡ Abilities in Monster Attack!: the shop's upgradable passives (tough, power, swift, greed,
// regen, reload) reach the LOCAL player, apply live when bought mid-round, never stack on Continue,
// never touch the arcade currency trade, and do nothing at all when the shop is absent.
//   node tools/test-arcade-abilities.js index.html
const fs = require('fs'), vm = require('vm'), path = require('path');
const file = process.argv[2] || 'index.html';
const html = fs.readFileSync(file, 'utf8');
const code = [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n;\n');
const shopSrc = fs.readFileSync(path.join(path.dirname(file), 'arcade-shop.js'), 'utf8');
const __created = [];
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
    __listeners: {}, addEventListener(t, h) { (real.__listeners[t] = real.__listeners[t] || []).push(h); }, removeEventListener() {}, dispatchEvent: () => true,
    offsetWidth: 0, __subs: {},
    setAttribute() {}, getAttribute: () => null, removeAttribute() {},
    focus() {}, blur() {}, click() {}, scrollIntoView() {}, insertAdjacentHTML() {},
    querySelector: (sel) => real.__subs[sel] || (real.__subs[sel] = mkEl(sel)), querySelectorAll: () => [], closest: () => null, contains: () => false,
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

// Boot a fresh game. withShop=false leaves window.ArcadeShop undefined (the game on its own).
function boot(withShop, arcadeSave) {
  const store = {};
  const sandbox = {
    console,
    document: new Proxy(function(){}, { ...anyHandler, get(t,k){
      if(k==='getElementById') return getEl;
      if(k==='querySelector') return ()=>mkAny();
      if(k==='createElement') return t=>(t==='canvas'?mkCanvas('tmp'):(__created.push(mkEl('new-'+t)), __created[__created.length-1]));
      if(k==='body'||k==='head') return mkEl(k);
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
    location:{ href:'file:///index.html', protocol:'file:', search:'' },
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
  sandbox.CustomEvent = function (type, init) { this.type = type; this.detail = init && init.detail; };
  sandbox.URLSearchParams = URLSearchParams;
  if (arcadeSave) store['daniels-arcade-v1'] = JSON.stringify(arcadeSave);
  const ctx = vm.createContext(sandbox);
  const run = (s) => vm.runInContext(s, ctx, { filename: 'game.js', timeout: 30000 });
  if (withShop) {
    vm.runInContext(shopSrc, ctx, { filename: 'arcade-shop.js' });
    // Capture the currency the game registers, so the arcade trade can be exercised directly.
    run('(function(){ var r = ArcadeShop.registerCurrency; ArcadeShop.registerCurrency = function(c){ window.__cur = c; return r(c); }; })()');
  }
  run(code);
  // A quiet, endless round: no spawns, no wave clear, nothing else moving the numbers.
  run(`chosenClass = CLASSES[0]; playerName = 'AbilityTest'; gameRunning = false; cameraMode = 'topdown';
       startGame(); gamePaused = false; waveIntroTimer = 0; monsters = []; bullets = []; pickups = [];
       spawnTimer = 1e9; monstersToSpawn = 999; monstersSpawned = 0;`);
  return { run, store, sandbox };
}

let fails = 0;
const check = (name, ok, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + name + (ok || extra === undefined ? '' : '  -> ' + extra)); if (!ok) fails++; };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

const SEED = { coins: 0, abilities: { 'monster-city:tough': 2, 'monster-city:power': 3, 'monster-city:swift': 1,
                                      'monster-city:greed': 2, 'monster-city:regen': 1, 'monster-city:reload': 2 } };
let G;
try { G = boot(true, SEED); } catch (e) { console.log('LOAD FAILED: ' + e.message); process.exit(1); }
const run = G.run;
console.log('load: OK');

check('setGame("monster-city") limits the Abilities tab', run('ArcadeShop.abilityValue("tough")') === 20);
// Only 3 abilities can be switched on at once (the ⚡ bar). Nothing chosen yet = the first three learned.
check('cached values: first 3 learned are on (tough 20, power 24, swift 5), the rest off',
  run('JSON.stringify(_AB)') === JSON.stringify({ tough: 20, power: 24, swift: 5, greed: 0, regen: 0, reload: 0 }), run('JSON.stringify(_AB)'));
// Switch to the other three through the shop's own save, as the ⚡ bar does.
run(`ArcadeShop.update(function(s){ s.active = { 'monster-city': ['monster-city:greed', 'monster-city:regen', 'monster-city:reload'] }; });
     window.applyArcadeAbilities();`);
check('switching the loadout updates the cache (greed 20, regen 1, reload 12 on; tough/power/swift off)',
  run('JSON.stringify(_AB)') === JSON.stringify({ tough: 0, power: 0, swift: 0, greed: 20, regen: 1, reload: 12 }), run('JSON.stringify(_AB)'));
// The hook tests below exercise every effect, so give them all six values directly.
run(`ArcadeShop.update(function(s){ delete s.active; }); window.applyArcadeAbilities();
     _AB.greed = 20; _AB.regen = 1; _AB.reload = 12;`);

// ---- tough: max HP x1.2
const base = run('(function(){ var t = _AB.tough; _AB.tough = 0; var p = createPlayer(); _AB.tough = t; return p.maxHp; })()');
check(`tough: max HP ${base} -> x1.2`, run('player.maxHp') === base + Math.round(base * 0.2), run('player.maxHp'));
check('tough: starts at full HP', run('player.hp === player.maxHp'));

// ---- power: damage x1.24 on the local player's damage only
run('var __m = { x: player.x + 400, y: player.y, r: 12, hp: 1e6, maxHp: 1e6, score: 1, speed: 0, damage: 0, name: "Dummy" }; monsters = [__m];');
const dealt = (s) => run(`(function(){ var h = __m.hp; ${s}; return h - __m.hp; })()`);
check('power: local melee/point-blank hit 100 -> 124', dealt('hitMonster(__m, 0, 100, true, true)') === 124);
check('power: local ability damage 100 -> 124', dealt('_asLocalDamage(true, function(){ hitMonster(__m, 0, 100); })') === 124);
check('power: other damage (allies, tiles, guests) untouched', dealt('hitMonster(__m, 0, 100)') === 100);
check('power: bullet from a guest (bySelf, not mine) untouched', dealt('hitMonster(__m, 0, 100, true)') === 100);
check('power: ability flag is restored afterwards', run('_dmgByLocal') === false);
// Through the real bullet loop.
// The random city can put a building on the dummy; a bullet would hit the wall first (1 run in ~12).
// Clear the buildings for this one step so the check only measures the damage bonus.
const bulletHit = (mine) => dealt(`var __bld = buildings; buildings = []; bullets.push({ x: __m.x, y: __m.y, z: BULLET_EYE, vx: 0, vy: 0, vz: 0, life: 50, damage: 50, color: '#fff'${mine ? ', mine: true' : ''} }); update(); bullets = []; buildings = __bld;`);
check('power: own bullet through update() 50 -> 62', bulletHit(true) === 62, bulletHit(true));
check('power: untagged bullet through update() stays 50', bulletHit(false) === 50);
check('power: shootBullet tags its bullets', /b\.mine = true;[^\n]*\n\s*bullets\.push\(b\);/.test(html));
check('power: bullets fired by an ability are tagged', run('(function(){ bullets = []; _asLocalDamage(true, function(){ bullets.push({ x:0, y:0, vx:0, vy:0, life:1, damage:1 }); }); var ok = bullets[0].mine === true; bullets = []; return ok; })()'));
run('monsters = [];');

// ---- swift: +5% move speed (steady-state velocity, walls ignored)
const speed = (swift) => run(`(function(){ var s = _AB.swift; _AB.swift = ${swift}; var p = player;
  p.invisible = true; p.invisTimer = 1e6; p.vx = 0; p.vy = 0; p.slow = 0; p.frozen = 0; p.stunned = 0;
  keys = { w: true }; for (var i = 0; i < 120; i++) update(); keys = {};
  var v = Math.hypot(p.vx, p.vy); _AB.swift = s; return v; })()`);
const v0 = speed(0), v1 = speed(5);
check(`swift: speed ${v0.toFixed(3)} -> ${v1.toFixed(3)} (x1.05)`, v0 > 0 && near(v1 / v0, 1.05, 1e-3), v1 / v0);
run('player.invisible = false; player.invisTimer = 0; player.vx = 0; player.vy = 0;');

// ---- greed: +20% flesh from a kill and from a pickup, not from the arcade trade
const flesh = () => run("bpCount('flesh')");
let f0 = flesh();
run('var __k = { x: player.x + 400, y: player.y, r: 12, hp: 5, maxHp: 5, score: 1, speed: 0, damage: 0, name: "Dummy" }; monsters = [__k]; hitMonster(__k, 0, 100);');
check('greed: a kill pays 12 flesh instead of 10', flesh() - f0 === 12, flesh() - f0);
f0 = flesh(); run('collectFlesh(20)');
check('greed: a pickup pays 24 flesh instead of 20', flesh() - f0 === 24, flesh() - f0);
run('pickups = []; monsters = [];');
const c0 = run('coins');
run('window.__cur.grant(500)');
check('greed: the arcade trade grants exactly 500 (BigInt, no bonus)', run('coins') - c0 === 500n, String(run('coins') - c0));

// ---- reload: cooldown runs out 12% sooner
run('player.shootCooldown = 100; update();');
check('reload: cooldown ticks 1/(1-0.12) per step', near(run('player.shootCooldown'), 100 - 1 / 0.88), run('player.shootCooldown'));
const frames = run('(function(){ player.shootCooldown = player.fireRate = 25; var n = 0; while (player.shootCooldown > 0 && n < 100) { update(); n++; } return n; })()');
check(`reload: a 25-step cooldown takes ${frames} steps (22 expected)`, frames === 22, frames);

// ---- regen: 1% of max HP every 120 steps, not before, not while paused, not when dead
run('player._abRegenT = 0; player.invincible = 1e6; player.hp = player.maxHp - 50;');
let h0 = run('player.hp');
run('for (var i = 0; i < 119; i++) update();');
check('regen: nothing before 2 seconds', run('player.hp') === h0);
run('update();');
const tick = Math.max(1, Math.round(run('player.maxHp') * 0.01));
check(`regen: +${tick} HP at 2 seconds`, run('player.hp') === h0 + tick, run('player.hp') - h0);
h0 = run('player.hp');
run('gamePaused = true; for (var i = 0; i < 300; i++) { __clock += 16.7; gameLoop(__clock); } gamePaused = false;');
check('regen: no healing while paused', run('player.hp') === h0);
run('player.hp = player.maxHp - 1; for (var i = 0; i < 240; i++) update();');
check('regen: capped at max HP', run('player.hp === player.maxHp'));

// ---- live upgrade mid-round: tough 2 -> 4 and power 3 -> 5 via the shop hook
run('player.hp = player.maxHp - 30;');
const hpBefore = run('player.hp'), maxBefore = run('player.maxHp');
const s = JSON.parse(G.store['daniels-arcade-v1']);
s.abilities['monster-city:tough'] = 4; s.abilities['monster-city:power'] = 5;
G.store['daniels-arcade-v1'] = JSON.stringify(s);
run(`window.applyArcadeAbilities(${JSON.stringify(s.abilities)})`);
const want = base + Math.round(base * 0.4);
check(`live: max HP ${maxBefore} -> ${want}`, run('player.maxHp') === want, run('player.maxHp'));
check('live: current HP gains the same difference', run('player.hp') === hpBefore + (want - maxBefore), run('player.hp'));
run(`window.applyArcadeAbilities(${JSON.stringify(s.abilities)})`);
check('live: applying again does not stack', run('player.maxHp') === want);
run('var __m = { x: player.x + 400, y: player.y, r: 12, hp: 1e6, maxHp: 1e6, score: 1, speed: 0, damage: 0, name: "Dummy" }; monsters = [__m];');
check('live: power now x1.40', dealt('hitMonster(__m, 0, 100, true, true)') === 140);
run('monsters = [];');
run('reapplyLoadout(player);');
check('live: equipping mid-round (reapplyLoadout) keeps the bonus', run('player.maxHp') === want, run('player.maxHp'));
run('player.hp = 0; window.applyArcadeAbilities({});');
check('live: an upgrade never revives the dead', run('player.hp') === 0);
run('player.hp = 10;');

// ---- save / Continue does not stack Tough
run('var __old = player; saveGame(); gameRunning = false; loadGame();');
check('Continue: a new player was built from the save', run('player !== __old && gameRunning'));
check('Continue: max HP rebuilt once, not stacked', run('player.maxHp') === want, run('player.maxHp'));

// ---- game still runs
try { run('waveIntroTimer = 0; for (var i = 0; i < 30; i++) { __clock += 16.7; gameLoop(__clock); }'); check('game loop runs with abilities', true); }
catch (e) { check('game loop runs with abilities', false, e.message); }

// ---- without the shop: nothing changes
let N;
try { N = boot(false, SEED); } catch (e) { console.log('LOAD (no shop) FAILED: ' + e.message); process.exit(1); }
check('no shop: every ability is 0', N.run('Object.values(_AB).every(function(v){ return v === 0; })'));
check('no shop: max HP is the plain value', N.run('player.maxHp') === base, N.run('player.maxHp'));
N.run('var __m = { x: player.x + 400, y: player.y, r: 12, hp: 1e6, maxHp: 1e6, score: 1, speed: 0, damage: 0, name: "Dummy" }; monsters = [__m];');
check('no shop: damage unchanged', N.run('(function(){ var h = __m.hp; hitMonster(__m, 0, 100, true, true); return h - __m.hp; })()') === 100);
const nf = N.run("bpCount('flesh')"); N.run('collectFlesh(10)');
check('no shop: flesh unchanged', N.run("bpCount('flesh')") - nf === 10);
check('no shop: applyArcadeAbilities is harmless', N.run('window.applyArcadeAbilities({}); player.maxHp') === base);

console.log(fails ? `\nARCADE ABILITIES FAIL (${fails})` : '\nARCADE ABILITIES PASS');
process.exit(fails ? 1 : 0);
