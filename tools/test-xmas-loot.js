// ❄️ The ICE CASTLE (Christmas) and its loot: the same drops as the candy castle, but Christmas pets, skills and
// items. Plus the LIMITED rarity for every boss pet.
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
const force = v => q(v ? `localStorage.setItem('monster_attack_event_force', '${v}')` : `localStorage.removeItem('monster_attack_event_force')`);
const KEYS = `[CRYSTAL_KEY, BLOOD_KEY, CRUMBLE_KEY, CANDYBLOCK_KEY, BLOBS_KEY, COMBINE_KEY, BOSS_SUMMON_KEY, ICE_KEY, SNOWBALL_KEY, ICEBLOCK_KEY, STOCKING_KEY, FROST_COMBINE_KEY, XM_SUMMON_KEY]`;
const reset = () => q(`petsOwned = []; equippedPets = []; savePets(); saveEquippedPet(); rebuildPetRuntime(); ${KEYS}.forEach(function(k){ localStorage.setItem(k, '0'); });
  [COOKIEDOGS_KEY, FRIENDSHIP_KEY, GINGERMEN_KEY, REINDEER_KEY].forEach(function(k){ localStorage.removeItem(k); }); localStorage.removeItem('daniels-arcade-v1'); coins = 0n; points = 0; savePoints(); cookieDogsCd = 0; gingerMenCd = 0; mrGumCd = 0; reindeerCd = 0; fHeld = -1;`);
const drop = (fnName, boss, nums) => JSON.parse(q(`(function(){ var r = ${JSON.stringify(nums)}, i = 0; return JSON.stringify(${fnName}({ isBoss: true, name: 'BOSS ${boss}', x: 0, y: 0 }, function(){ return r[i++]; })); })()`));
const all = (n) => Array(n).fill(0);

// ---- 🏰 the castle at Christmas ----
force('christmas'); reset();
check(q(`castleEventId()`) === 'christmas', 'at Christmas the castle is on (an ice castle)');
check(JSON.stringify([0, 0.6, 0.8, 0.9, 0.995].map(r => q(`rollCastleBoss(${r})`))) === JSON.stringify(['Sleety the Slush', 'Ginger the Cerberus', 'Mr Candy Cane', 'Mr Figgy', 'Mrs Frost']),
      'its five bosses: the same 50 / 25 / 14 / 10 / 1 % slots, Christmas versions');
check(['Sleety the Slush', 'Ginger the Cerberus', 'Mr Candy Cane', 'Mr Figgy', 'Mrs Frost'].every(n => q(`!!MONSTER_CLASSES.find(function(c){ return c.name === ${JSON.stringify(n)} && c.isBossOnly; })`)), 'they are real boss-only monsters');
const run = JSON.parse(q(`(function(){ gameRunning = false; currentWorld = WORLDS[0]; startGame(); waveIntroTimer = 0; monsters = [];
  hwCastle = { x: player.x + 30, y: player.y, phase: 'closed' }; player.x = hwCastle.x; player.y = hwCastle.y; hwCastleTick();
  var kill = function(){ for (var round = 0; round < 30 && monsters.some(function(m){ return m._castle; }); round++) { for (var i = monsters.length - 1; i >= 0; i--) if (monsters[i]._castle) hitMonster(monsters[i], i, 1e9); monsters = monsters.filter(function(m){ return m.hp > 0; }); } };
  kill(); hwCastleTick();
  var b = monsters.find(function(m){ return m._castle; }); var name = b && b.name;
  loadEvent(EVENTS.christmas); var before = evWallet;
  kill(); hwCastleTick(); loadEvent(EVENTS.christmas);
  return JSON.stringify({ boss: name, phase: hwCastle.phase, flakes: evWallet - before }); })()`));
check(/Sleety|Ginger|Candy Cane|Figgy|Mrs Frost/.test(run.boss) && run.phase === 'won' && run.flakes >= 100, 'a whole ice-castle run: guards → a Christmas boss → ❄️ +100 snowflakes', JSON.stringify(run));
force('halloween');
check(q(`rollCastleBoss(0)`) === 'Slimy the Jelly', 'at Halloween it is the candy castle again');
force('off');
check(q(`castleEventId()`) === null, 'no castle outside the events');
force('christmas');

// ---- each boss: Christmas pet / skill / item, the same everything else ----
reset();
let g = drop('slimyDrops', 'Sleety the Slush', all(4));
check(q(`snowSlimeIdx()`) >= 0 && q(`blueSlimeIdx()`) === -1 && q(`itemCount(ICE_KEY)`) === 64 && q(`itemCount(BLOOD_KEY)`) === 0 && q(`itemCount(CRYSTAL_KEY)`) === 1 && q(`coins.toString()`) === '500' && q('points') === 5,
      'Sleety: ❄️ Little Snow Slime, 🧊 64 ice (not blood) — and the same 💎 crystal, 🍖 500 + 🏆 5', JSON.stringify(g));
reset();
g = drop('biscuitDrops', 'Ginger the Cerberus', all(4));
check(q(`specialIdx('gingersnap')`) >= 0 && q(`hasGingerMen()`) && !q(`hasCookieDogs()`) && q(`itemCount(SNOWBALL_KEY)`) === 10 && q(`itemCount(CRUMBLE_KEY)`) === 0 && q(`arcadeOwns('cookieking')`),
      'Ginger: 🐕 Gingersnap, 🍪 Gingerbread Men, ⛄ 10 Snowballs — and the same 👑 Cookie King', JSON.stringify(g));
reset();
g = drop('mrRollDrops', 'Mr Candy Cane', all(4));
check(q(`specialIdx('jingle')`) >= 0 && q(`itemCount(ICEBLOCK_KEY)`) === 13 && q(`itemCount(CANDYBLOCK_KEY)`) === 0 && q(`coins.toString()`) === '3000' && q(`arcadeOwns('rollmaster')`),
      'Mr Candy Cane: 🔔 Jingle, 🧊 10 + 3 Ice Blocks — and the same 🍖 3000, 🍥 Master of Rolls', JSON.stringify(g));
reset();
g = drop('mrBlobDrops', 'Mr Figgy', all(4));
check(q(`specialIdx('figgy')`) >= 0 && q(`hasReindeer()`) && !q(`hasFriendship()`) && q(`itemCount(STOCKING_KEY)`) === 3 && q(`arcadeOwns('candygrinder')`),
      'Mr Figgy: 🎄 Mr Figgy pet, 🦌 Reindeer Call, 🧦 3 Stockings — and the same 🏅 Candy Grinding', JSON.stringify(g));
reset();
g = drop('mrsGumDrops', 'Mrs Frost', all(5));
check(q(`specialIdx('snowdrop')`) >= 0 && q(`itemCount(FROST_COMBINE_KEY)`) === 1 && q(`itemCount(XM_SUMMON_KEY)`) === 1 && q(`itemCount(COMBINE_KEY)`) === 0 && q(`itemCount(CRYSTAL_KEY)`) === 3 && q(`coins.toString()`) === '50000',
      'Mrs Frost: ❄️ Snowdrop, 💠 Frost crystal, 🎅 Christmas summon — and the same 💎 3, 🍖 50000 + 🪙 5', JSON.stringify(g));
const freq = JSON.parse(q(`(function(){ var n = 4000, c = 0; for (var i = 0; i < n; i++) { localStorage.setItem(ICE_KEY, '0'); slimyDrops({ isBoss: true, name: 'BOSS Sleety the Slush' }); if (itemCount(ICE_KEY) > 0) c++; } return JSON.stringify(Math.round(c / n * 100)); })()`));
check(Math.abs(freq - 30) <= 4, "the same chances (Sleety's ice: ~30%, like Slimy's blood)", freq + '%');

// ---- LIMITED ----
reset();
q(`giveBlueSlime(); giveCookie(); giveRolly(); giveMrBlob(); giveGumdrop(); giveSnowSlime(); giveGingersnap(); giveJingle(); giveFiggy(); giveSnowdrop();`);
check(q(`petsOwned.every(function(p){ return p.rank === 'LIMITED'; })`), 'every boss pet is LIMITED rarity');
check(q(`PET_RANK_COLORS.LIMITED`) && q(`PET_RANK_DAMAGE.LIMITED >= PET_RANK_DAMAGE.SSS`), 'LIMITED has its own colour and is at least as strong as SSS');
q(`petsOwned.push({ name: 'Dragon', rank: 'SSS', ability: '💪 Damage Boost', element: 'Fire' }); savePets(); openPetsScreen();`);
check(/LIMITED[\s\S]*SSS/.test(q(`document.getElementById('pets-collection').innerHTML`)), 'in 🐾 Pets the LIMITED pets come before SSS');
check(q(`(function(){ var d = JSON.parse(localStorage.getItem(PETS_KEY)); d[0].rank = 'S'; localStorage.setItem(PETS_KEY, JSON.stringify(d)); loadPets(); return petsOwned[0].rank; })()`) === 'LIMITED', 'older saves: boss pets that were S become LIMITED');

// ---- LIMITED pets don't take a battle-pet slot ----
reset();
q(`for (var k = 0; k < 5; k++) petsOwned.push({ name: 'Rat' + k, rank: 'F', ability: '💪 Damage Boost', element: 'Fire' }); petsOwned.push({ name: 'Extra', rank: 'SSS', ability: '💪 Damage Boost', element: 'Fire' }); savePets();
   equippedPets = []; for (var k = 0; k < 5; k++) equipPet(k);`);
check(q(`equippedPets.length`) === 5 && (q(`(function(){ equipPet(5); return equippedPets.length; })()`) === 5), '5 normal pets: the 6th normal one does not fit');
q(`giveBlueSlime(); giveCookie(); giveRolly(); giveMrBlob(); giveGumdrop(); giveSnowSlime(); giveGingersnap(); giveJingle(); giveFiggy(); giveSnowdrop();`);
check(q(`equippedPets.length`) === 15 && q(`normalEquippedCount()`) === 5, 'every LIMITED pet still goes out with you — they do not count toward the 5', q(`equippedPets.length`) + ' out');
check(q(`(function(){ var i = specialIdx('rolly'); equipPet(i); var off = equippedPets.indexOf(i) < 0; equipPet(i); return off && equippedPets.indexOf(i) > -1; })()`), 'you can take a LIMITED pet off and put it back even with 5 normal pets out');
q(`openPetsScreen();`);
check(/Battle Pets 5\/5[\s\S]*\+ 10 LIMITED/.test(q(`document.getElementById('pets-equipped').innerHTML`)), 'the label says 5/5 + 10 LIMITED (free)');
q(`saveEquippedPet(); equippedPets = []; loadEquippedPet();`);
check(q(`equippedPets.length`) === 15 && q(`petRuntime.length`) === 15, 'and they all stay out after a reload');
q(`gameRunning = false; startGame(); waveIntroTimer = 0; for (var k = 0; k < 5; k++) update(); draw();`);
check(q(`petRuntime.length`) === 15, 'a game runs with all of them out');

// ---- Christmas pets have the powers ----
reset();
q(`gameRunning = false; startGame(); waveIntroTimer = 0; monsters = []; equippedPets = []; rebuildPetRuntime(); var i = giveJingle(); if (equippedPets.indexOf(i) < 0) { equippedPets.push(i); rebuildPetRuntime(); }`);
check(q(`(function(){ plevel = 1; pxp = 0; addXP(50); return pxp; })()`) === 60, '🔔 Jingle gives +20% XP like Rolly');
const jb = q(`(function(){ var s = 0, n = 2000; for (var k = 0; k < n; k++) { player.hp = player.maxHp = 1e9; player.invincible = 0; player.petDodge = 0; var h = player.hp; playerHit(5, player, 'x'); if (player.hp === h) s++; } return s / n; })()`);
check(jb > 0.35 && jb < 0.45, '…and blocks ~40% like Rolly', jb);
q(`equippedPets = []; rebuildPetRuntime(); var gi = giveGingersnap(); if (equippedPets.indexOf(gi) < 0) { equippedPets.push(gi); rebuildPetRuntime(); }`);
check(q(`(function(){ var rt = petRuntime[equippedPets.indexOf(specialIdx('gingersnap'))]; return cookieEats({ x: rt.x + 5, y: rt.y }); })()`) === true, '🐕 Gingersnap eats corpses like Cookie');
check(Math.abs(q(`cookieDogsPct()`) - 0.5) < 1e-9, '…and gives the dogs / gingerbread men their +20%');

// ---- ❄️ items ----
reset();
q(`gameRunning = false; startGame(); waveIntroTimer = 0; walls = []; monsters = []; player.angle = 0;`);
q(`localStorage.setItem(ICE_KEY, '64');`);
check(q(`buildBloodWall(player)`) === true && q(`walls[0].kind`) === 'ice' && q(`walls[0].hp`) === 10 && q(`itemCount(ICE_KEY)`) === 0, '[B] with 🧊 64 ice: an ice wall (10 HP)');
q(`walls = []; localStorage.setItem(SNOWBALL_KEY, '2'); localStorage.setItem(CRUMBLE_KEY, '2'); spawnMonster(); var m = monsters[0]; var d = 150, lx, ly; do { lx = player.x + d; ly = player.y; d -= 20; } while (d > 30 && (ptInBld(lx, ly, 15) || ptInWall(lx, ly, 15))); m.x = lx; m.y = ly; m.hp = m.maxHp = 1000; m.hasShield = false; m.shieldUp = false; m.frozen = 0;`);
const sb = JSON.parse(q(`(function(){ throwCrumble(player); var w = walls[0], m = monsters[0]; return JSON.stringify({ kind: w.kind, hp: w.hp, frozen: m.frozen, mhp: m.hp, snow: itemCount(SNOWBALL_KEY), crumbs: itemCount(CRUMBLE_KEY) }); })()`));
check(sb.kind === 'snow' && sb.hp === 6 && sb.frozen > 0 && sb.mhp < 1000 && sb.snow === 1 && sb.crumbs === 2, '[T] at Christmas throws a ⛄ Snowball first: it hurts, FREEZES them and leaves a snow wall', JSON.stringify(sb));
force('halloween');
check(q(`(function(){ walls = []; throwCrumble(player); return walls[0].kind + '/' + itemCount(CRUMBLE_KEY); })()`) === 'cookie/1', '…and at Halloween the 🍪 Crumble first');
force('christmas');
q(`walls = []; localStorage.setItem(ICEBLOCK_KEY, '1');`);
check(q(`placeCandyBlock(player)`) === true && q(`walls[0].kind`) === 'iceblock' && q(`walls[0].hp`) === 20, '[C] 🧊 an Ice Block (20 shots)');
q(`localStorage.setItem(STOCKING_KEY, '2'); equippedPets = []; rebuildPetRuntime();`);
check(q(`(function(){ var b = 0; for (var k = 0; k < 4; k++) { player.hp = player.maxHp = 1e9; player.invincible = 0; player.petDodge = 0; var h = player.hp; playerHit(5, player, 'x'); if (player.hp === h) b++; } return b + '/' + itemCount(STOCKING_KEY); })()`) === '2/0', '🧦 each Stocking blocks one attack');
q(`allies = []; localStorage.setItem(XM_SUMMON_KEY, '1');`);
check(q(`useBossSummon(player)`) === true && q(`XM_CASTLE_BOSSES.some(function(b){ return b[0] === allies[0].boss; })`), '[H] 🎅 a Christmas Boss Summon brings an ice-castle boss');

// ---- ❄️ skills ----
reset();
q(`gameRunning = false; startGame(); waveIntroTimer = 0; allies = []; player.damage = 100; player.maxHp = 200; localStorage.setItem(GINGERMEN_KEY, '1'); update();`);
check(q(`document.getElementById('gingermen-btn').style.display`) === 'block', '🍪 Gingerbread Men has its own button');
const gm = JSON.parse(q(`(function(){ summonGingerMen(); return JSON.stringify(allies.map(function(a){ return [a.kind, a.damage, a.maxHp]; })); })()`));
check(gm.length === 5 && gm.every(a => a[0] === 'gingerman' && a[1] === 30 && a[2] === 60), 'click: 5 gingerbread men with 30% of your stats', JSON.stringify(gm[0]));
check(q(`summonGingerMen()`) === false, 'then a cooldown');
q(`allies = []; localStorage.setItem(REINDEER_KEY, '1'); wave = 1; fHeld = 0; for (var k = 0; k < 70; k++) update();`);
const rd = JSON.parse(q(`JSON.stringify(allies.filter(function(a){ return a.kind === 'reindeer'; }).map(function(a){ return [a.hp, a.damage]; }))`));
check(rd.length === 1 && rd[0][0] === 794 && rd[0][1] === 7, "🦌 hold F: Rudolph, with 20% of Mrs Frost's stats", JSON.stringify(rd));
q(`for (var k = 0; k < 5; k++) update(); draw();`);
check(q(`SUMMON_EMOJI.gingerman`) && q(`SUMMON_EMOJI.reindeer`) === '🦌', 'they draw (2D / 3D / raycast)');

// ---- 👑 the Frost Lord ----
reset();
q(`giveSnowSlime(); giveGingersnap(); giveJingle(); giveFiggy(); giveBlueSlime(); localStorage.setItem(FROST_COMBINE_KEY, '1'); openPetsScreen();`);
check(q(`document.getElementById('pets-combine-frost').style.display`) === 'inline-block' && q(`document.getElementById('pets-combine').style.display`) === 'none', '💠 a Frost crystal shows the Frost Lord button');
check(q(`combineFrostLord()`) === true && q(`petsOwned.map(function(p){ return p.special; }).join()`) === 'blueslime,frostlord', 'Snow Slime + Gingersnap + Jingle + Mr Figgy → 👑 the Frost Lord');
check(Math.abs(q(`petBoost(petsOwned[specialIdx('frostlord')])`) - 1.8) < 1e-9 && q(`petsOwned[specialIdx('frostlord')].rank`) === 'LIMITED', 'all powers +80%, LIMITED');
check(q(`(function(){ var c = document.getElementById('x').getContext('2d'); ['snowslime','gingersnap','jingle','figgy','snowdrop','frostlord'].forEach(function(sp){ drawPetFull({ special: sp, name: sp, rank: 'LIMITED', element: 'Ice' }, c, 30, 30, 1); }); return true; })()`), 'every Christmas pet draws');
// ---- 🛷 Santa's Sleigh Road ----
reset(); force('christmas');
q(`localStorage.removeItem(SANTA_KEY()); localStorage.removeItem(SLEIGH_DONE_KEY());`);
check(q(`isWorldUnlocked(findWorld('sleighroad'))`) === false, 'locked until you say "santa" to Nullp');
q(`localStorage.setItem(SANTA_KEY(), '1')`);
check(q(`isWorldUnlocked(findWorld('sleighroad'))`) === true, '…then open at Christmas');
force('halloween');
check(q(`isWorldUnlocked(findWorld('sleighroad'))`) === false, '…and only at Christmas');
force('christmas');
const sr = JSON.parse(q(`(function(){ var o = {}; gameRunning = false; selectWorld('sleighroad'); startGame(); waveIntroTimer = 0;
  o.world = currentWorld.id; o.roadY = player.y === streetRoadY(); o.gate = buildings.some(function(b){ return b.gate; });
  o.houses = buildings.filter(function(b){ return b.house; }).length; o.style = buildings.filter(function(b){ return b.house; })[0].st;
  for (var k = 0; k < 30; k++) update(); o.wave = monsters.filter(function(m){ return !m._castle; }).length; o.gift = evGift; o.doors = hwHouses.length;
  o.castle = !!hwCastle; o.ahead = hwCastle && hwCastle.x - player.x; var x0 = player.x; for (var k = 0; k < 30; k++) hwCastleTick(); o.rode = Math.round(player.x - x0);
  loadEvent(EVENTS.christmas); evWallet = 37; saveEvent();
  player.x = hwCastle.x; player.y = hwCastle.y; hwCastleTick();
  o.phase = hwCastle.phase; o.guards = monsters.filter(function(m){ return m.name === 'Castle Guard'; }).length;
  var b = monsters.find(function(m){ return m._castle; }); o.boss = b && b.name; o.bossOk = !!b && XM_CASTLE_BOSSES.some(function(x){ return b.name === 'BOSS ' + x[0]; });
  for (var round = 0; round < 30 && monsters.some(function(m){ return m._castle; }); round++) { for (var i = monsters.length - 1; i >= 0; i--) if (monsters[i]._castle) hitMonster(monsters[i], i, 1e9); monsters = monsters.filter(function(m){ return m.hp > 0; }); }
  loadEvent(EVENTS.christmas); var before = evWallet; hwCastleTick(); loadEvent(EVENTS.christmas); o.before = before; o.after = evWallet;
  o.done = sleighDone(); o.locked = !isWorldUnlocked(findWorld('sleighroad'));
  return JSON.stringify(o); })()`));
check(sr.world === 'sleighroad' && sr.roadY && sr.gate && sr.houses > 10 && sr.style === 'xmhouse', 'a snowy street like Trick-or-Treat Street: one road, houses both sides, a gate behind', JSON.stringify(sr));
check(sr.wave === 0 && sr.gift === null && sr.doors === 0, 'no wave monsters, no presents, no doors to knock on');
check(sr.castle && sr.ahead > 1000 && sr.rode > 20, 'the ice castle is right up the road and the road carries you there');
check(sr.phase === 'boss' && sr.guards === 0 && sr.bossOk, 'inside: STRAIGHT to the boss (no guards) — an ice-castle boss');
check(sr.after - sr.before >= 37 && sr.after >= 2 * 37, 'beat it: your ❄️ snowflakes DOUBLE', sr.before + ' → ' + sr.after);
check(sr.done && sr.locked, 'once a Christmas: then the road is done');
check(q(`(function(){ localStorage.setItem(SLEIGH_DONE_KEY(), '0'); localStorage.removeItem(SLEIGH_DONE_KEY()); loadEvent(EVENTS.christmas); evWallet = 0; saveEvent(); return Math.max(evWallet, 20); })()`) === 20, 'with an empty bag you still get at least +20');
// ---- 🗺️ the event maps in the Admin Panel, the Owner Panel and [U] ----
check(/adminEventMap\('sleighroad'\)/.test(html) && /ownerEventMap\('sleighroad'\)/.test(html) && /unlockAction\('sleighroad'\)/.test(html) && /ownerEventMap\('trickstreet'\)/.test(html), 'the Admin Panel, the Owner Panel and [U] all have the 🗺️ event maps');
q(`localStorage.removeItem(SANTA_KEY()); localStorage.setItem(SLEIGH_DONE_KEY(), '1'); localStorage.removeItem(ADMIN_LIMITS_KEY);`);
check(q(`isWorldUnlocked(findWorld('sleighroad'))`) === false, '(not opened, and already ridden)');
check(q(`ownerEventMap('sleighroad')`) === true && q(`isWorldUnlocked(findWorld('sleighroad'))`) === true, '👑 Owner Panel: 🛷 Santa\'s Sleigh Road opened and ready to ride again');
const lim = JSON.parse(q(`JSON.stringify(['sleighroad', 'trickstreet', 'sleighroad'].map(adminEventMap))`));
check(lim.join() === 'true,true,false', '🛠️ Admin Panel: 2 a day', JSON.stringify(lim));
force('halloween'); q(`localStorage.setItem(STREET_DONE_KEY(), '1');`);
check(q(`isWorldUnlocked(findWorld('trickstreet'))`) === false && q(`ownerEventMap('trickstreet')`) === true && q(`isWorldUnlocked(findWorld('trickstreet'))`) === true, '🏚️ Trick-or-Treat Street can be ridden again too');
q(`localStorage.setItem('daniels-arcade-v1', JSON.stringify({ owned: ['owner'] }));`);
force('christmas'); q(`localStorage.setItem(SLEIGH_DONE_KEY(), '1');`);
check(q(`unlockAction('sleighroad')`) === true && q(`isWorldUnlocked(findWorld('sleighroad'))`) === true, '[U] Admin Unlocks: the same');
q(`localStorage.setItem('daniels-arcade-v1', '{}'); localStorage.removeItem(ADMIN_LIMITS_KEY);`);
q(`gameRunning = false; selectWorld('city');`);
force(null);

console.log('\n' + (ok ? 'CHRISTMAS LOOT PASS' : 'CHRISTMAS LOOT FAIL'));
process.exit(ok ? 0 : 1);
