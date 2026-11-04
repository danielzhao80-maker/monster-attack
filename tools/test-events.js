// 🎉 Seasonal events (🎃 Halloween, 🎄 Christmas): dates, currency drops and pickup, the event boss on boss
// waves, decorations, the 50-tier pass (incl. arcade rewards), the shop, gift spots, codes, [U] admin unlocks.
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
check(q(`isEventOn('halloween', new Date(2026, 9, 1))`) && q(`isEventOn('halloween', new Date(2026, 9, 31))`) && q(`isEventOn('halloween', new Date(2026, 10, 7))`), 'on from 1 October to 7 November');
check(!q(`isEventOn('halloween', new Date(2026, 8, 30))`) && !q(`isEventOn('halloween', new Date(2026, 10, 8))`) && !q(`isEventOn('halloween', new Date(2027, 2, 1))`), 'off the rest of the year');
force('off'); check(q(`isEventOn('halloween', new Date(2026, 9, 24))`) === false, 'can be forced off');
force('halloween'); check(q(`isEventOn('halloween', new Date(2026, 2, 1))`) === true, 'and forced on');

force('halloween'); q(`renderEventScreen()`);
check(!/Ends in|Last day/.test(q(`document.getElementById('event-days').textContent`)), 'no countdown to when it ends');

// ---- menu button ----
force('halloween'); q(`refreshEventButton()`);
check(q(`document.getElementById('event-btn').style.display`) === '', 'the 🎃 Halloween button shows during the event');
force('off'); q(`refreshEventButton()`);
check(q(`document.getElementById('event-btn').style.display`) === 'none', 'and hides after it');

// ---- candy drops ----
force('halloween');
q(`gameRunning=false; startGame(); monsters=[]; pickups=[];`);
const drops = JSON.parse(q(`(function(){
  var n = 0, bags = 0, king = 0;
  for (var i = 0; i < 2000; i++) { pickups = []; eventOnKill({ x: 100, y: 100, name: 'Frosty' }); n += pickups.length; }
  pickups = []; eventOnKill({ x: 100, y: 100, name: 'Dragon', isBoss: true }); bags = pickups.reduce(function(a, p){ return a + p.n; }, 0);
  pickups = []; eventOnKill({ x: 100, y: 100, name: 'Pumpkin King', isBoss: true }); king = pickups.reduce(function(a, p){ return a + p.n; }, 0);
  var types = pickups.every(function(p){ return p.type === 'eventcur'; });
  pickups = [];
  return JSON.stringify({ rate: n / 2000, bags: bags, king: king, types: types }); })()`));
check(drops.rate > 0.25 && drops.rate < 0.35, 'monsters drop candy about 30% of the time', drops.rate.toFixed(3));
check(drops.bags === 15 && drops.king === 25 && drops.types, 'a boss drops a bag of 15, the Pumpkin King 25', drops.bags + ' / ' + drops.king);
force('off');
check(q(`(function(){ pickups = []; for (var i = 0; i < 200; i++) eventOnKill({ x: 0, y: 0, name: 'Dragon', isBoss: true }); return pickups.length; })()`) === 0, 'no candy when the event is off');
// A real kill drops through the normal kill path.
force('halloween');
check(q(`(function(){ gameRunning=false; startGame(); pickups=[]; monsters=[]; spawnMonster(); var m = monsters[0]; m.isBoss = true; m.hp = 1; m.hasShield = false; m.shieldUp = false; m.dodge = 0; hitMonster(m, 0, 999); return pickups.filter(function(p){ return p.type === 'eventcur'; }).length; })()`) === 5,
      'killing a boss in a real run drops the candy');
// Walking over candy collects it.
const got = JSON.parse(q(`(function(){
  evWallet = 0; saveEvent(); waveIntroTimer = 0; pickups = [{ x: player.x, y: player.y, type: 'eventcur', ev: 'halloween', n: 3, life: 600 }]; monsters = []; monstersSpawned = 0; monstersToSpawn = 99;
  update(); return JSON.stringify({ evWallet: evWallet, saved: localStorage.getItem('monster_attack_candy'), left: pickups.length }); })()`));
check(got.evWallet === 3 && got.saved === '3' && got.left === 0, 'walking over candy collects it and saves it', JSON.stringify(got));

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

// ---- the candy shop (spends the wallet) ----
force('halloween');
setArcade({ coins: 0, owned: [] });
q(`evWallet = 100; evEarned = 0; evClaimed = []; saveEvent(); coins = 0n; seasonXP = 0; points = 0; document.getElementById('event-shop').children.length = 0; openEventScreen();`);
check(q(`document.getElementById('event-shop').children.length`) === 3, 'the shop lists 3 things');
check(q(`buyEvent('flesh')`) === true && q(`coins.toString()`) === '100' && q('evWallet') === 90, '10 candy -> 100 flesh');
check(q(`buyEvent('xp')`) === true && q('seasonXP') === 250 && q('evWallet') === 70, '20 candy -> 250 Season Pass XP');
check(q(`buyEvent('points')`) === true && q('points') === 3 && q('evWallet') === 40, '30 candy -> 3 points');
check(q(`buyEvent('points')`) === true && q(`buyEvent('points')`) === false && q('evWallet') === 10, 'not enough candy -> no sale');
check(q(`localStorage.getItem('monster_attack_candy')`) === '10', 'spending is saved');

// ---- the Halloween Pass: 50 tiers, filled by candy EARNED ----
q(`evWallet = 0; evEarned = 0; evClaimed = []; saveEvent(); coins = 0n; seasonXP = 0; points = 0;`);
check(q(`EVENTS.halloween.pass.length`) === 50 && q(`EVENTS.halloween.pass[0].at`) === 10 && q(`EVENTS.halloween.pass[24].at`) === 375 && q(`EVENTS.halloween.pass[49].at`) === 1000, '50 tiers: 10 candy for tier 1 ... 1000 for tier 50');
check(q(`EVENTS.halloween.pass.every(function(t, i){ return i === 0 || t.at > EVENTS.halloween.pass[i-1].at; })`) === true, 'each tier needs more than the last');
const cos = JSON.parse(q(`JSON.stringify(EVENTS.halloween.pass.filter(function(t){ return t.type === 'arcade'; }).map(function(t){ return [t.n, t.ids]; }))`));
const allIds = cos.flatMap(c => c[1]);
const titles = ['hw-sweettooth', 'hw-ghosthunter', 'hw-night', 'pumpkin'], bgs = ['bg-haunted-night', 'bg-graveyard-fog', 'bg-pumpkin-moon'], avatars = ['hw-ghost', 'hw-vampire', 'hw-pumpkinking'];
check(titles.every(x => allIds.includes(x)), '4 event titles in the pass');
check(bgs.every(x => allIds.includes(x)), '3 event backgrounds in the pass');
check(avatars.every(x => allIds.includes(x)), '3 event avatars in the pass');
const last = cos.find(c => c[0] === 50);
check(last && ['hw-pumpkinking', 'bg-pumpkin-moon', 'pumpkin'].every(x => last[1].includes(x)) && q(`EVENTS.halloween.pass[49].best`) === true,
      'the best ones are at tier 50: Pumpkin King avatar, Pumpkin Moon background and Pumpkin King title');
check(q(`claimEvTier(0)`) === false, 'a tier is locked until you have earned enough candy');
q(`addEventCur(30)`);
check(q('evEarned') === 30 && q('evWallet') === 30, 'collecting candy fills both the wallet and the pass');
check(q(`claimAllEv()`) === 2 && q(`coins.toString()`) === '120' && q('seasonXP') === 130, 'claim all at 30: tiers 1 and 2 (120 flesh, 130 XP)');
check(q(`claimEvTier(0)`) === false, 'each tier is claimed once');
q(`buyEvent('points')`);
check(q('evWallet') === 0 && q('evEarned') === 30, 'spending candy does NOT take pass progress away');
q(`addEventCur(${8 * 10 + Math.floor(64 / 5) - 30})`); q(`claimAllEv()`);
check(JSON.parse(store[ARC]).owned.indexOf('hw-sweettooth') > -1, 'tier 8 gives the 🍬 Sweet Tooth title (arcade save)');
q(`addEventCur(1000)`); q(`claimAllEv()`);
const ownedNow = JSON.parse(store[ARC]).owned;
check(allIds.every(x => ownedNow.includes(x)) && q('evClaimed.length') === 50, 'at 1000: all 50 tiers and every event item', allIds.filter(x => !ownedNow.includes(x)).join(','));
check(JSON.parse(q(`localStorage.getItem('monster_attack_hw_claimed_' + new Date().getFullYear())`)).length === 50, "the pass is saved per year's event");
q(`loadEvent()`);
check(q('evClaimed.length') === 50, 'and loads back');
// (the stub DOM does not empty `children` on innerHTML = '', so start from an empty list)
q(`document.getElementById('event-pass').children.length = 0; renderEventScreen()`);
const passHead = q(`document.getElementById('event-pass-head').textContent`);
check(q(`document.getElementById('event-pass').children.length`) === 50 && /all unlocked/.test(passHead), 'the menu shows all 50 tiers', passHead);

// ---- the arcade adds candy to the same keys while the game is open ----
q(`evWallet = 5; evEarned = 5; saveEvent();`);
q(`localStorage.setItem('monster_attack_candy', '25'); localStorage.setItem('monster_attack_hw_earned_' + new Date().getFullYear(), '25');`);   // the arcade page: +20
q(`addEventCur(1)`);
check(q('evWallet') === 26 && q('evEarned') === 26, "candy the arcade added while playing is not overwritten", q('evWallet') + '/' + q('evEarned'));

// ---- other ways to get candy ----
q(`evWallet = 0; saveEvent(); evEarned = 0; evClaimed = []; saveEvent(); localStorage.removeItem('monster_attack_hw_daily');`);
check(q(`claimEvDaily()`) === true && q('evWallet') === 10, '🎁 daily treat: +10');
check(q(`claimEvDaily()`) === false && q('evWallet') === 10, 'once a day');
check(q(`eventOnWaveClear(3)`) === 2 && q(`eventOnWaveClear(12)`) === 4 && q('evWallet') === 16, 'clearing a wave: 2, +1 per 5 waves');
// A real wave clear pays it.
check(q(`(function(){ gameRunning=false; startGame(); evWallet = 0; saveEvent(); waveIntroTimer = 0; monsters = []; monstersSpawned = monstersToSpawn; update(); return evWallet; })()`) === 2, 'a real wave clear pays out');
// The trick-or-treat door.
const door = JSON.parse(q(`(function(){
  gameRunning=false; startGame(); waveIntroTimer = 0; monsters = []; monstersSpawned = 0; monstersToSpawn = 99; __freezeMonsters = true;
  tickEvGift(); var o = { made: !!evGift };
  if (evGift) { o.dist = Math.round(Math.hypot(evGift.x - player.x, evGift.y - player.y)); o.inWall = ptInBld(evGift.x, evGift.y, 30); }
  evWallet = 0; saveEvent(); player.x = evGift.x; player.y = evGift.y; tickEvGift(); o.done = evGift.done; o.candy = evWallet;
  tickEvGift(); o.again = evWallet;
  wave++; tickEvGift(); o.newDoor = !!evGift && !evGift.done;
  __freezeMonsters = false;
  return JSON.stringify(o); })()`));
check(door.made && door.dist >= 600 && door.dist <= 1100 && !door.inWall, 'a trick-or-treat door appears a walk away', door.dist + ' units');
check(door.done && door.candy >= 1 && door.candy <= 8 && door.again === door.candy, 'knocking gives a treat (3-8) or a trick (1), once', door.candy + ' candy');
check(door.newDoor, 'and a new door comes with the next wave');
const treats = q(`(function(){ var t = 0; for (var i = 0; i < 400; i++) { evGift = null; tickEvGift(); evWallet = 0; saveEvent(); player.x = evGift.x; player.y = evGift.y; player.slow = 0; tickEvGift(); if (evWallet >= 3) t++; } return t; })()`);
check(treats > 240 && treats < 320, 'about 70% treats', treats + '/400');
force('off');
check(q(`(function(){ evGift = null; tickEvGift(); return evGift; })()`) === null && q(`eventOnWaveClear(5)`) === 0, 'no doors or wave candy after the event');
// The code.
force('halloween');
const redeem = c => q(`(function(){ document.getElementById('code-input').value = '${c}'; redeemCode(); return document.getElementById('code-msg').textContent; })()`);
q(`evWallet = 0; saveEvent(); localStorage.removeItem(USED_CODES_KEY);`);
const m1 = redeem('TRICKORTREAT');
check(q('evWallet') === 15 && /15 candy/.test(m1), 'the code TRICKORTREAT gives 15 candy', m1);
const m2 = redeem('TRICKORTREAT');
check(q('evWallet') === 15 && /tomorrow/.test(m2), 'once a day', m2);
force('off'); q(`localStorage.removeItem(USED_CODES_KEY)`);
const m3 = redeem('TRICKORTREAT');
check(q('evWallet') === 15 && /Halloween/.test(m3), 'and only during the event', m3);

// ---- 🔓 [U] Admin Unlocks (like [G] God Survival, but unlocks) ----
force('halloween');
setArcade({ owned: [] });
q(`gameRunning=false; startGame(); document.getElementById('unlock-menu').style.display = 'none';`);
q(`toggleUnlockMenu()`);
check(q(`document.getElementById('unlock-menu').style.display`) !== 'flex' && q(`isArcadeAdmin()`) === false, '[U] stays shut for players without the arcade Admin Panel');
check(q(`unlockAction('cur1000')`) === false, 'and its unlocks refuse to run');
setArcade({ owned: [], adminUnlocked: true });
q(`toggleUnlockMenu()`);
check(q(`document.getElementById('unlock-menu').style.display`) === 'flex', '[U] opens for arcade admins');
q(`toggleUnlockMenu()`);
check(q(`document.getElementById('unlock-menu').style.display`) === 'none', 'and [U] closes it again');
check(/k==='u' && gameRunning\) \{ toggleUnlockMenu\(\)/.test(code), 'the U key is wired up like G');
q(`evWallet = 0; evEarned = 0; evClaimed = []; saveEvent(); coins = 0n; points = 0;`);
check(q(`unlockAction('cur100')`) === true && q(`unlockAction('cur1000')`) === true && q('evWallet') === 1100, 'admin: +100 / +1000 candy');
check(q(`unlockAction('pass')`) === true && q('evClaimed.length') === 50 && JSON.parse(store[ARC]).owned.indexOf('pumpkin') > -1, 'admin: fill the whole Halloween Pass (all 50 tiers claimed)');
setArcade({ owned: [], adminUnlocked: true });
check(q(`unlockAction('eventitems')`) === true && ['hw-ghost', 'hw-vampire', 'hw-pumpkinking', 'bg-pumpkin-moon', 'gun-jack-o-lantern', 'hw-night'].every(x => JSON.parse(store[ARC]).owned.indexOf(x) > -1), 'admin: every Halloween item');
check(q(`unlockAction('floors')`) === true && JSON.parse(store[ARC]).specialMaps.length === 21, 'admin: all 21 Backrooms floors');
q(`coins = 0n; points = 0;`);
check(q(`unlockAction('flesh')`) === true && q(`coins.toString()`) === '10000' && q(`unlockAction('points')`) === true && q('points') === 100, 'admin: flesh and points');
setArcade({ owned: ['owner'] });
check(q(`isArcadeAdmin()`) === true, 'the Owner counts as an admin too');

// ---- the other Halloween codes ----
force('halloween');
q(`evWallet = 0; saveEvent(); localStorage.removeItem(USED_CODES_KEY);`);
const hwCodes = { PUMPKIN: 20, SPOOKY: 10, BOO: 5, CANDYCORN: 25, GHOSTPARTY: 15 };
let expect = 0;
for (const [c, n] of Object.entries(hwCodes)) { redeem(c); expect += n; }
check(q('evWallet') === expect, 'Halloween codes PUMPKIN, SPOOKY, BOO, CANDYCORN, GHOSTPARTY give candy', q('evWallet') + ' candy');
for (const c of Object.keys(hwCodes)) redeem(c);
check(q('evWallet') === expect, 'each one once a day');
force('off'); q(`localStorage.removeItem(USED_CODES_KEY); evWallet = 0; saveEvent();`);
redeem('PUMPKIN');
check(q('evWallet') === 0, 'and only during Halloween');
force('halloween');
check(q(`Object.keys(CODES).filter(function(k){ return CODES[k].reward === 'event' && CODES[k].event === 'halloween'; }).length`) === 6, '6 Halloween codes in all');

// ---- after the event ----
force('off'); q(`evWallet = 50; evEarned = 50; evClaimed = []; saveEvent();`);
check(q(`buyEvent('flesh')`) === false && q(`claimEvTier(0)`) === false && q('evWallet') === 50, 'the shop and pass close after the event (candy is kept)');
q(`renderEventScreen()`);
check(/over/.test(q(`document.getElementById('event-days').textContent`)), 'and the menu says it is over');

// ======================== 🏚️ TRICK-OR-TREAT STREET + 🏰 CANDY CASTLE ========================
force('off');
check(q(`isWorldUnlocked(findWorld('trickstreet'))`) === false && q(`selectWorld('trickstreet')`) === false, 'Trick-or-Treat Street is shut outside Halloween');
force('halloween');
check(q(`isWorldUnlocked(findWorld('trickstreet'))`) === true, 'and open at Halloween (no secret needed)');
// The boss odds.
const pick = (r) => q(`rollCastleBoss(${r})`);
check(pick(0) === 'Slimy the Jelly' && pick(0.49) === 'Slimy the Jelly' && pick(0.5) === 'Biscuit the Cerberus' && pick(0.74) === 'Biscuit the Cerberus'
      && pick(0.75) === 'Mr Roll' && pick(0.88) === 'Mr Roll' && pick(0.89) === 'Mr Blob' && pick(0.98) === 'Mr Blob' && pick(0.99) === 'Mrs Gum',
      'castle bosses: Slimy 50%, Biscuit 25%, Mr Roll 14%, Mr Blob 10%, Mrs Gum 1%');
const odds = JSON.parse(q(`(function(){ var c = {}; for (var i = 0; i < 20000; i++) { var b = rollCastleBoss(); c[b] = (c[b] || 0) + 1; } return JSON.stringify(c); })()`));
check(odds['Slimy the Jelly'] > 9400 && odds['Slimy the Jelly'] < 10600 && odds['Mrs Gum'] > 100 && odds['Mrs Gum'] < 320, 'and the dice really roll like that', JSON.stringify(odds));
check(q(`['Castle Guard','Slimy the Jelly','Biscuit the Cerberus','Mr Roll','Mr Blob','Mrs Gum'].every(function(n){ var c = MONSTER_CLASSES.find(function(x){ return x.name === n; }); return c && c.isBossOnly; })`), 'the guards and the five bosses exist (and never turn up as normal monsters)');
// The street: one road between houses, a gate behind you, doors to knock on, double your candy -> castle.
const street = JSON.parse(q(`(function(){
  selectWorld('trickstreet'); localStorage.setItem('monster_attack_candy', '30'); gameRunning = false; startGame(); waveIntroTimer = 0; monsters = []; monstersSpawned = 0; monstersToSpawn = 99; __freezeMonsters = true;
  var o = { goal: hwStreetGoal, startY: player.y };
  // Houses shoulder to shoulder on both sides of the road, all along it.
  var roadY = WORLD_H / 2, gaps = 0;
  for (var x = player.x - 200; x < player.x + 3000; x += 15) { if (!ptInBld(x, roadY - STREET_HALF - 40, 2)) gaps++; if (!ptInBld(x, roadY + STREET_HALF + 40, 2)) gaps++; }
  o.width = STREET_HALF * 2;
  o.gaps = gaps; o.road = !ptInBld(player.x + 1000, roadY, 20);
  o.gate = ptInBld(WORLD_W / 2 - 500, roadY, 5) && player.x > WORLD_W / 2 - 480;
  var behind = 0; for (var i = 0; i < 300; i++) { spawnMonster(); var m = monsters.pop(); if (m.x < WORLD_W / 2 - 440) behind++; } o.spawnBehind = behind;
  hwCastleTick(); o.houses = hwHouses.length; o.doorsOnRoad = hwHouses.every(function(h){ return Math.abs(h.y - roadY) < STREET_HALF; });
  var k = 0;
  while (!hwCastle && k < 60) { var h = hwHouses.find(function(x){ return !x.done; }); if (!h) { hwCastleTick(); k++; continue; } player.x = h.x; player.y = h.y; hwCastleTick(); k++; }
  loadEvent(); o.candy = evWallet; o.castle = !!hwCastle; o.castleOnRoad = hwCastle && Math.abs(hwCastle.y - roadY) < 20; o.knocks = hwKnocks;
  __freezeMonsters = false; return JSON.stringify(o); })()`));
check(street.goal === 60, 'the street starts with a goal: double your candy (30 -> 60)', street.goal);
check(street.gaps === 0 && street.road, 'one road with houses packed along both sides (no way round)', JSON.stringify(street));
check(street.width <= 240, 'a tight street (about 6 m across)', street.width + ' units');
check(street.gate && street.spawnBehind === 0, 'a gate behind the start (forward only) — and no monsters spawn behind it');
check(street.houses === 6 && street.doorsOnRoad, 'the 6 nearest houses have doors on the road side');
check(street.castle && street.candy >= 60 && street.castleOnRoad, 'knock until your candy has doubled — then the castle appears up the road', street.candy + ' candy, ' + street.knocks + ' knocks');
check(q(`(function(){ var keep = hwCastle, c = localStorage.getItem('monster_attack_candy'); localStorage.setItem('monster_attack_candy', '0'); hwCastleNewRun(); var g = hwStreetGoal; hwCastle = keep; localStorage.setItem('monster_attack_candy', c); return g; })()`) === 20, 'an empty bag still has a goal (+20)');
// Inside the castle.
const fight = JSON.parse(q(`(function(){
  __freezeMonsters = true; waveIntroTimer = 0; monsters = []; monstersSpawned = 0; monstersToSpawn = 99; points = 0; savePoints();
  player.x = hwCastle.x; player.y = hwCastle.y; hwCastleTick();
  var o = { phase1: hwCastle.phase, guards: monsters.filter(function(m){ return m._castle && m.name === 'Castle Guard'; }).length };
  var before = monsters.length; spawnTimer = 0; update(); o.noWaveSpawns = monsters.length === before;
  monsters.forEach(function(m){ m.hp = 1; m.hasShield = false; m.shieldUp = false; m.dodge = 0; });
  for (var i = monsters.length - 1; i >= 0; i--) hitMonster(monsters[i], i, 99999);
  hwCastleTick();
  o.points = points; o.phase2 = hwCastle.phase; o.boss = hwCastle.boss;
  var b = monsters.find(function(m){ return m._castle; }); o.bossIsBoss = !!(b && b.isBoss); o.bossName = b && b.name;
  loadEvent(); var c0 = evWallet;
  monsters.forEach(function(m){ m.hp = 1; m.hasShield = false; m.shieldUp = false; m.dodge = 0; });
  for (var i = monsters.length - 1; i >= 0; i--) hitMonster(monsters[i], i, 99999);
  pickups = []; hwCastleTick(); loadEvent();
  o.phase3 = hwCastle.phase; o.bossCandy = evWallet - c0;
  __freezeMonsters = false; return JSON.stringify(o); })()`));
check(fight.phase1 === 'guards' && fight.guards === 4, 'entering the castle: 4 guards', JSON.stringify(fight));
check(fight.noWaveSpawns, 'no wave monsters join while you are inside');
check(fight.points === 10 && fight.phase2 === 'boss', 'beating the guards: 🏆 +10 points and the door opens');
check(fight.bossIsBoss && /^BOSS (Slimy the Jelly|Biscuit the Cerberus|Mr Roll|Mr Blob|Mrs Gum)$/.test(fight.bossName), 'a candy boss is waiting', fight.bossName);
check(fight.phase3 === 'done' && fight.bossCandy >= 40, 'beating it: 🍬 +40 candy (plus its candy bag)', fight.bossCandy + ' candy');
// The castle in other maps: about 5% of Halloween runs.
const finds = q(`(function(){ selectWorld('city'); gameRunning = false; startGame(); var n = 0; for (var i = 0; i < 2000; i++) { hwCastleNewRun(); if (hwCastle) n++; } return n; })()`);
check(finds > 60 && finds < 145, 'in any other map the castle is a 5% find', finds + '/2000');
force('off');
check(q(`(function(){ var n = 0; for (var i = 0; i < 300; i++) { hwCastleNewRun(); if (hwCastle) n++; } return n; })()`) === 0, 'and never outside Halloween');
force('halloween');
// ☠️ The Grim Reaper challenge in the Halloween menu.
q(`localStorage.removeItem('monster_attack_hw_reaper_next'); document.getElementById('event-daily').children.length = 0; renderEventScreen();`);
const reaperBtn = q(`(function(){ var b = document.getElementById('event-daily').children.find(function(x){ return x.dataset && x.dataset.ev === 'reaper'; }); if (!b) return 'none'; b.onclick(); return localStorage.getItem('monster_attack_hw_reaper_next'); })()`);
check(reaperBtn === '1', "the Halloween menu's ☠️ Grim Reaper button sends you to Buckshot's Reaper", reaperBtn);
q(`localStorage.removeItem('monster_attack_hw_reaper_next')`);

// ======================== 🎄 CHRISTMAS ========================
force(null);
check(q(`activeEvent(new Date(2026, 11, 1)).id`) === 'christmas' && q(`activeEvent(new Date(2026, 11, 25)).id`) === 'christmas' && q(`activeEvent(new Date(2027, 0, 7)).id`) === 'christmas',
      'Christmas is on from 1 December to 7 January');
check(q(`activeEvent(new Date(2026, 10, 30))`) === null && q(`activeEvent(new Date(2027, 0, 8))`) === null && q(`activeEvent(new Date(2026, 9, 24)).id`) === 'halloween',
      'off in between, and October is still Halloween');
check(q(`EVENTS.christmas.year(new Date(2027, 0, 5))`) === 2026, "January belongs to last December's event (one pass, not two)");
force('christmas');
q(`refreshEventButton()`);
check(q(`document.getElementById('event-btn-label').textContent`) === '🎄 Christmas' && q(`document.getElementById('event-btn').style.display`) === '', 'the menu button turns into 🎄 Christmas');
q(`document.getElementById('event-pass').children.length = 0; document.getElementById('event-shop').children.length = 0; renderEventScreen()`);
check(/Christmas Event/.test(q(`document.getElementById('event-title').textContent`)) && /❄️/.test(q(`document.getElementById('event-cur').textContent`))
      && /JINGLEBELLS/.test(q(`document.getElementById('event-how').innerHTML`)), 'the event menu is the Christmas one (snowflakes, its codes)');
// Separate wallets.
q(`localStorage.setItem('monster_attack_candy', '42'); localStorage.setItem('monster_attack_snowflakes', '0'); localStorage.setItem('monster_attack_xm_earned_' + EVENTS.christmas.year(new Date()), '0'); localStorage.setItem('monster_attack_xm_claimed_' + EVENTS.christmas.year(new Date()), '[]');`);
q(`addEventCur(7)`);
check(q(`localStorage.getItem('monster_attack_snowflakes')`) === '7' && q(`localStorage.getItem('monster_attack_candy')`) === '42', 'snowflakes go in their own wallet; Halloween candy is untouched');
// Drops, pickups, boss, decorations, gift spot.
q(`gameRunning=false; startGame(); monsters=[]; pickups=[];`);
const xd = JSON.parse(q(`(function(){ pickups = []; eventOnKill({ x: 0, y: 0, name: 'Evil Snowman', isBoss: true }); var r = { n: pickups.reduce(function(a,p){ return a + p.n; }, 0), ev: pickups[0] && pickups[0].ev }; pickups = []; return JSON.stringify(r); })()`));
check(xd.n === 25 && xd.ev === 'christmas', 'the Evil Snowman drops 25 snowflakes');
const xp = JSON.parse(q(`(function(){ waveIntroTimer = 0; monstersSpawned = 0; monstersToSpawn = 99; monsters = [];
  pickups = [{ x: player.x, y: player.y, type: 'eventcur', ev: 'christmas', n: 4, life: 600 }]; update();
  return JSON.stringify({ snow: localStorage.getItem('monster_attack_snowflakes'), candy: localStorage.getItem('monster_attack_candy') }); })()`));
check(xp.snow === '11' && xp.candy === '42', 'walking over a snowflake collects it', JSON.stringify(xp));
const snowmen = q(`(function(){ wave = 10; var n = 0, kings = 0; for (var i = 0; i < 1000; i++) { var c = rollMonsterClass().name; if (c === 'Evil Snowman') n++; if (c === 'Pumpkin King') kings++; } wave = 1; return n + '/' + kings; })()`);
check(+snowmen.split('/')[0] > 280 && +snowmen.split('/')[0] < 420 && snowmen.split('/')[1] === '0', 'the ⛄ Evil Snowman takes about a third of boss waves (no Pumpkin King)', snowmen);
check(q(`(function(){ var c = MONSTER_CLASSES.find(function(x){ return x.name === 'Evil Snowman'; }); return !!(c && c.isBossOnly && c.habitat === 'ice'); })()`), 'the Evil Snowman is an ice boss');
check(q(`PROPS_FOR(findWorld('desert')).indexOf('xmastree') > -1 && PROPS_FOR(findWorld('desert')).indexOf('jackolantern') === -1`), '🎄 Christmas trees stand in every world (no jack-o\'-lanterns)');
check(/case 'xmastree':/.test(code), 'and the tree has a 3D model');
check(q(`(function(){ evGift = null; tickEvGift(); return evGift && evGift.ev; })()`) === 'christmas' && q(`EVENTS[evGift.ev].gift.emoji`) === '🎁', 'the gift spot is a 🎁 present');
// The Christmas pass.
q(`loadEvent(); evEarned = 0; evClaimed = []; saveEvent();`);
setArcade({ owned: [] });
q(`addEventCur(${8 * 10 + Math.floor(64 / 5)})`); q(`claimAllEv()`);
check(JSON.parse(store[ARC]).owned.indexOf('xm-helper') > -1 && JSON.parse(store[ARC]).owned.indexOf('hw-sweettooth') === -1, "Christmas Pass tier 8: 🧝 Santa's Helper (not the Halloween title)");
q(`addEventCur(1000)`); q(`claimAllEv()`);
check(['santa', 'xm-santa', 'bg-christmas-eve', 'xm-penguin', 'xm-snowman', 'xm-snowballer', 'xm-reindeer', 'bg-snowy-night', 'bg-northern-lights', 'gun-candy-cane'].every(x => JSON.parse(store[ARC]).owned.indexOf(x) > -1),
      'all 50 tiers: every Christmas item, the best (Santa avatar, Christmas Eve, Santa Claus title) at tier 50');
check(q(`EVENTS.christmas.pass[49].best && EVENTS.christmas.pass[49].ids.join()`) === 'xm-santa,bg-christmas-eve,santa', 'tier 50 is the best one');
// Codes.
q(`localStorage.removeItem(USED_CODES_KEY); evWallet = 0; saveEvent();`);
const before = +q(`localStorage.getItem('monster_attack_snowflakes')`);
['JINGLEBELLS', 'HOHOHO', 'SNOWMAN', 'CANDYCANE', 'MISTLETOE', 'NORTHPOLE'].forEach(c => redeem(c));
check(+q(`localStorage.getItem('monster_attack_snowflakes')`) === 90, '6 Christmas codes give snowflakes (90 in all)', q(`localStorage.getItem('monster_attack_snowflakes')`));
const ht = redeem('PUMPKIN');
check(/Halloween/.test(ht), 'Halloween codes wait for Halloween', ht);
force('halloween'); q(`localStorage.removeItem(USED_CODES_KEY)`);
check(/Christmas/.test(redeem('JINGLEBELLS')), 'and Christmas codes wait for Christmas');
// [U] admin unlocks follow the event that is on.
force('christmas'); setArcade({ owned: [], adminUnlocked: true });
q(`document.getElementById('unlock-menu').style.display = 'none'; toggleUnlockMenu();`);
check(/snowflakes/.test(q(`document.getElementById('unlock-cur100').textContent`)) && /Christmas Pass/.test(q(`document.getElementById('unlock-pass').textContent`)), '[U] shows snowflakes and the Christmas Pass in December');
q(`localStorage.setItem('monster_attack_snowflakes', '0')`);
q(`unlockAction('cur100')`);
check(q(`localStorage.getItem('monster_attack_snowflakes')`) === '100', '[U] +100 gives snowflakes at Christmas');
force(null);

console.log('\n' + (ok ? 'EVENTS PASS' : 'EVENTS FAIL'));
process.exit(ok ? 0 : 1);
