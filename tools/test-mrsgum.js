// 🐻 Mrs Gum's loot: Gumdrop (every boss pet's power), Candy Combination Crystal (→ the Candy Lord, +80%),
// 3 Upgrade Crystals, a Boss Summon ([H]), 50000 flesh + 5 arcade points. Plus the boss loot in [U] Admin Unlocks.
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
const reset = () => q(`petsOwned = []; equippedPets = []; savePets(); saveEquippedPet(); rebuildPetRuntime(); [CRYSTAL_KEY, BLOOD_KEY, CRUMBLE_KEY, CANDYBLOCK_KEY, BLOBS_KEY, COMBINE_KEY, BOSS_SUMMON_KEY].forEach(function(k){ localStorage.setItem(k, '0'); }); localStorage.removeItem(COOKIEDOGS_KEY); localStorage.removeItem(FRIENDSHIP_KEY); localStorage.removeItem('daniels-arcade-v1'); coins = 0n; blobJumpNext = null;`);
const boss = `({ isBoss: true, name: 'BOSS Mrs Gum', x: 0, y: 0 })`;
const roll = (nums) => JSON.parse(q(`(function(){ var r = ${JSON.stringify(nums)}, i = 0; return JSON.stringify(mrsGumDrops(${boss}, function(){ return r[i++]; })); })()`));
const arcadeCoins = () => q(`(JSON.parse(localStorage.getItem('daniels-arcade-v1') || '{}').coins || 0)`);

// ---- the drops ----
reset();
check(q(`mrsGumDrops({ isBoss: true, name: 'BOSS Mr Blob' }).length`) === 0 && q(`mrsGumDrops({ isBoss: false, name: 'Mrs Gum' }).length`) === 0, 'only Mrs Gum (the boss) drops these');
let got = roll([0.05, 0.01, 0.1, 0.3, 0.4]);
check(got.length === 5 && q(`gumdropIdx()`) >= 0 && q(`itemCount(COMBINE_KEY)`) === 1 && q(`itemCount(CRYSTAL_KEY)`) === 3 && q(`itemCount(BOSS_SUMMON_KEY)`) === 1
      && q(`coins.toString()`) === '50000' && arcadeCoins() === 5, 'lucky rolls: 🐻 Gumdrop, 💠 crystal, 💎 3 crystals, 👑 Boss Summon, 🍖 50000 + 🪙 5 arcade points', JSON.stringify(got));
reset();
check(roll([0.11, 0.06, 0.21, 0.41, 0.51]).length === 0, 'just above every chance: nothing (10 / 5 / 20 / 40 / 50 %)');
const freq = JSON.parse(q(`(function(){ var n = 6000, c = { gum: 0, comb: 0, cry: 0, sum: 0, flesh: 0 };
  for (var i = 0; i < n; i++) { petsOwned = []; equippedPets = []; var g = mrsGumDrops(${boss});
    g.forEach(function(x){ if (/Gumdrop/.test(x)) c.gum++; if (/Combination/.test(x)) c.comb++; if (/3 Upgrade/.test(x)) c.cry++; if (/Summon/.test(x)) c.sum++; if (/50000/.test(x)) c.flesh++; }); }
  for (var k in c) c[k] = Math.round(c[k] / n * 100); return JSON.stringify(c); })()`));
check(Math.abs(freq.gum - 10) <= 3 && Math.abs(freq.comb - 5) <= 2 && Math.abs(freq.cry - 20) <= 3 && Math.abs(freq.sum - 40) <= 4 && Math.abs(freq.flesh - 50) <= 4, 'the dice really roll ~10 / 5 / 20 / 40 / 50 %', JSON.stringify(freq));
reset();

// ---- 🐻 Gumdrop: every boss pet's power ----
q(`gameRunning = false; startGame(); waveIntroTimer = 0; monsters = []; equippedPets = []; var gi = giveGumdrop(); if (equippedPets.indexOf(gi) < 0) { equippedPets.push(gi); rebuildPetRuntime(); }`);
check(['slime', 'cookie', 'rolly', 'blob'].every(pw => q(`!!petWithPower('${pw}')`)), 'Gumdrop has the slime, Cookie, Rolly and Mr Blob powers');
const prot = JSON.parse(q(`(function(){ var safe = 0, n = 3000; for (var k = 0; k < n; k++) { player.hp = player.maxHp = 1e9; player.invincible = 0; player.petDodge = 0; var h = player.hp; playerHit(5, player, 'x'); if (player.hp === h) safe++; blobJumpNext = null; } return JSON.stringify({ rate: safe / n }); })()`));
// slime 20%, then Rolly 40%, then Mr Blob 60%: 1 - 0.8*0.6*0.4 = 0.808
check(prot.rate > 0.77 && prot.rate < 0.85, 'it eats / blocks attacks like all three pets together (~81%)', JSON.stringify(prot));
check(q(`(function(){ var a = petsOwned[gumdropIdx()].corpses || 0; var slot = equippedPets.indexOf(gumdropIdx()), rt = petRuntime[slot]; cookieEats({ x: rt.x + 10, y: rt.y }); return (petsOwned[gumdropIdx()].corpses || 0) - a; })()`) === 1, 'it eats corpses like Cookie');
check(q(`(function(){ plevel = 1; pxp = 0; addXP(100); return pxp; })()`) === 120, 'and gives +20% XP like Rolly');
check(Math.abs(q(`cookieDogsPct()`) - 0.5) < 1e-9, 'and gives the Cookie Dogs their +20% like Cookie');

// ---- 💠 the Candy Lord ----
reset();
q(`giveBlueSlime(); giveCookie(); giveRolly(); giveMrBlob(); petsOwned.push({ name: 'Rat', rank: 'F', ability: '💪 Damage Boost', element: 'Fire' }); savePets(); petsOwned[2].level = 7;`);
check(q(`combineCandyLord()`) === false && q(`candyLordIdx()`) === -1, 'no Combination Crystal: no Candy Lord');
q(`localStorage.setItem(COMBINE_KEY, '1'); equippedPets = [4, 1]; saveEquippedPet(); openPetsScreen();`);
check(q(`document.getElementById('pets-combine').style.display`) === 'inline-block', 'with a crystal, 🐾 Pets shows the 💠 Combine button');
check(q(`combineCandyLord()`) === true, '💠 combine the four boss pets');
const cl = JSON.parse(q(`JSON.stringify({ names: petsOwned.map(function(p){ return p.special || p.name; }), eq: equippedPets, lv: petLevel(petsOwned[candyLordIdx()]), left: itemCount(COMBINE_KEY) })`));
check(cl.names.join() === 'Rat,candylord' && cl.left === 0, 'the four are gone, the 👑 Candy Lord is here, the crystal is used', JSON.stringify(cl));
check(cl.lv === 7 && cl.eq.indexOf(0) > -1 && cl.eq.indexOf(1) > -1, 'it keeps the best level, and the other pets stay equipped right', JSON.stringify(cl.eq));
check(Math.abs(q(`petLevelMult(petsOwned[candyLordIdx()])`) - (1 + 0.15 * 6) * 1.8) < 1e-9, 'its shots are 80% stronger');
q(`gameRunning = false; startGame(); waveIntroTimer = 0; equippedPets = [candyLordIdx()]; rebuildPetRuntime();`);
check(q(`(function(){ plevel = 1; pxp = 0; addXP(50); return pxp; })()`) === 68, "and Rolly's XP boost +80% (+36% XP)");
const lordProt = JSON.parse(q(`(function(){ var safe = 0, jumps = 0, n = 3000; for (var k = 0; k < n; k++) { player.hp = player.maxHp = 1e9; player.invincible = 0; player.petDodge = 0; var h = player.hp; playerHit(5, player, 'x'); if (player.hp === h) safe++; if (blobJumpNext) jumps++; blobJumpNext = null; } return JSON.stringify({ rate: safe / n, jumps: jumps }); })()`));
check(lordProt.rate > 0.97, 'every power +80%: it almost never lets a hit through', JSON.stringify(lordProt));
check(q(`combineCandyLord()`) === false, 'the four pets are used up: no second combine without new ones');
check(q(`(function(){ var c = document.getElementById('x').getContext('2d'); drawPetFull(petsOwned[candyLordIdx()], c, 30, 30, 1); return true; })()`), 'the Candy Lord draws (a big crowned gummy titan)');

// ---- 👑 Boss Summon ----
reset();
q(`gameRunning = false; startGame(); waveIntroTimer = 0; allies = []; wave = 1;`);
check(q(`useBossSummon(player)`) === false && q('allies.length') === 0, 'no summons, no boss');
q(`localStorage.setItem(BOSS_SUMMON_KEY, '2')`);
const bs = JSON.parse(q(`(function(){ useBossSummon(player, 'Mr Roll'); var a = allies[0]; return JSON.stringify({ kind: a && a.kind, boss: a && a.boss, hp: a && a.hp, left: itemCount(BOSS_SUMMON_KEY) }); })()`));
check(bs.kind === 'candyboss' && bs.boss === 'Mr Roll' && bs.hp > 0 && bs.left === 1, '[H] summons a candy boss to fight for you (one summon used)', JSON.stringify(bs));
check(q(`(function(){ useBossSummon(player); return CASTLE_BOSSES.some(function(b){ return b[0] === allies[1].boss; }); })()`), 'a random one of the five candy bosses');
q(`for (var k = 0; k < 5; k++) update(); draw();`);
check(/k==='h' && gameRunning/.test(code) && q(`SUMMON_EMOJI.candyboss`) === '👑', 'the H key; it draws in 2D, 3D and raycast');

// ---- 🔓 Admin Unlocks: the boss loot ----
reset();
q(`localStorage.setItem('daniels-arcade-v1', JSON.stringify({ owned: ['owner'] }));`);
check(q(`unlockAction('bosspets')`) === true && q(`petsOwned.length`) === 5 && q(`candyLordIdx()`) === -1, '[U] 🐾 the 5 boss pets (not the Candy Lord — you combine that)');
check(q(`unlockAction('bossitems')`) === true && q(`itemCount(BOSS_SUMMON_KEY)`) === 5 && q(`itemCount(COMBINE_KEY)`) === 1 && q(`itemCount(BLOBS_KEY)`) === 10, '[U] 🎒 boss items');
q(`openPetsScreen()`);
check(q(`document.getElementById('pets-combine').style.opacity`) === '1', '…and the 💠 Combine button is ready in 🐾 Pets');
check(q(`combineCandyLord()`) === true && q(`petsOwned.map(function(p){ return p.special; }).join()`) === 'gumdrop,candylord', 'admin pets + crystal: you CAN combine the Candy Lord');
q(`unlockAction('bosspets'); unlockAction('bossitems');`);
check(q(`combineCandyLord()`) === true && q(`petsOwned.filter(function(p){ return p.special === 'candylord'; }).length`) === 2, 'and again (a second Candy Lord) with 4 new boss pets and another crystal');
check(q(`unlockAction('bossskills')`) === true && q(`hasCookieDogs() && hasFriendship()`), '[U] ✨ boss skills');
check(q(`unlockAction('bosscosmetics')`) === true && q(`arcadeOwns('cookieking') && arcadeOwns('rollmaster') && arcadeOwns('candygrinder')`), '[U] 🏅 boss titles & avatar');
check(/unlockAction\('bosspets'\)/.test(html) && /unlockAction\('bosscosmetics'\)/.test(html), 'the buttons are in the menu');
q(`localStorage.setItem('daniels-arcade-v1', '{}'); petsOwned = [];`);
check(q(`unlockAction('bosspets')`) === false && q(`petsOwned.length`) === 0, 'not for players who are not admins or owners');
check(/mrsGumDrops\(m\)/.test(code), 'every kill is checked');

// ---- 🛠️ Admin Panel (4 a day) and 👑 Owner Panel (no limit) ----
reset();
q(`localStorage.removeItem(ADMIN_LIMITS_KEY)`);
check(/adminBossLoot\('bosspets'\)/.test(html) && /ownerBossLoot\('bosscosmetics'\)/.test(html) && /id="cap-bossloot"/.test(html), 'both panels have a 🏰 boss loot section');
const ad = JSON.parse(q(`(function(){ var r = ['bosspets', 'bossitems', 'bossskills', 'bosscosmetics', 'bossitems'].map(adminBossLoot); return JSON.stringify({ r: r, summons: itemCount(BOSS_SUMMON_KEY), pets: petsOwned.length, msg: document.getElementById('admin-msg').textContent }); })()`));
check(ad.r.join() === 'true,true,true,true,false' && ad.summons === 5 && ad.pets === 5, 'Admin Panel: boss loot, 4 a day', JSON.stringify(ad));
check(/Daily limit/.test(ad.msg), '…then it says the daily limit is reached');
check(q(`ownerBossLoot('bossitems') && ownerBossLoot('bossitems') && ownerBossLoot('bossitems')`) && q(`itemCount(BOSS_SUMMON_KEY)`) === 20, 'Owner Panel: no limit');
q(`localStorage.removeItem(ADMIN_LIMITS_KEY)`);

// ---- fixes ----
reset();
q(`gameRunning = false; startGame(); waveIntroTimer = 0;`);
check(/walls: walls\.map\(w=>\(\{[^)]*maxHp:w\.maxHp/.test(code) && /allies: allies\.map\(a=>\(\{[^)]*boss:a\.boss,emoji:a\.emoji,body:a\.body/.test(code), 'multiplayer guests get wall HP bars and the summoned boss\'s look');
q(`localStorage.setItem(COOKIEDOGS_KEY, '1'); localStorage.setItem(FRIENDSHIP_KEY, '1'); allies = []; NET.mode = 'client';`);
check(q(`summonCookieDogs()`) === false && q(`summonMrGum()`) === false && q('allies.length') === 0, 'a multiplayer guest cannot summon on their own screen only');
q(`refreshCookieDogsBtn();`);
check(q(`document.getElementById('cookiedogs-btn').style.display`) === 'none', '…and does not get the Cookie Dogs button');
q(`NET.mode = 'single'; mrGumCd = 0; cookieDogsCd = 0;`);
check(/window\.addEventListener\('blur', \(\) => \{ fHeld = -1; \}\)/.test(code), 'switching windows while holding F does not leave it stuck');
// combine while 5 OTHER pets are equipped: the runtime still matches
q(`petsOwned = []; equippedPets = []; for (var k = 0; k < 5; k++) petsOwned.push({ name: 'Rat' + k, rank: 'F', ability: '💪 Damage Boost', element: 'Fire' }); savePets(); equippedPets = [0,1,2,3,4]; saveEquippedPet(); rebuildPetRuntime();
   giveBlueSlime(); giveCookie(); giveRolly(); giveMrBlob(); equippedPets = [0, 1, 2, 3, 5]; rebuildPetRuntime(); localStorage.setItem(COMBINE_KEY, '1');`);
const rt = JSON.parse(q(`(function(){ combineCandyLord(); return JSON.stringify({ eq: equippedPets, rt: petRuntime.length, n: petsOwned.length, lord: candyLordIdx() }); })()`));
check(rt.eq.length === rt.rt && rt.n === 6 && rt.eq.every(i => i < rt.n), 'combining with every slot full keeps the equipped pets and the runtime in step', JSON.stringify(rt));
q(`localStorage.setItem('daniels-arcade-v1', JSON.stringify({ owned: ['owner', 'rollmaster', 'candygrinder'] }));`);
check(q(`(function(){ var ev = EVENTS.halloween; loadEvent(ev); var a = evWallet; unlockAction('cur100'); return evWallet - a; })()`) === 100, 'the admin +100 candy button gives exactly 100 (no title bonus)');
check(q(`(function(){ var ev = EVENTS.halloween; loadEvent(ev); var a = evWallet; addEventCur(100, ev); return evWallet - a; })()`) === 113, '…but candy you earn still gets the title bonus');

// ---- 👑 the owner code: only its hash is in the page ----
check(!/CROWNKEEPER67/.test(html) && /OWNER_CODE_HASH = '[0-9a-z]+'/.test(code), 'the old public code is gone; only a hash of the owner code is in the page');
const tryCode = (c) => q(`(function(){ var opened = false; var keep = openOwnerPanel; openOwnerPanel = function(){ opened = true; }; var st = setTimeout; setTimeout = function(f){ f(); return 1; };
  document.getElementById('code-input').value = ${JSON.stringify(c)}; redeemCode(); openOwnerPanel = keep; setTimeout = st; return opened; })()`);
check(tryCode('CROWNKEEPER67') === false && tryCode('ownerpanel') === false, 'wrong codes do not open the Owner Panel');
if (process.env.OWNER_CODE) {
  check(tryCode(process.env.OWNER_CODE.toLowerCase()) === true, 'the real owner code opens the Owner Panel (any case)');
  check(!q(`localStorage.getItem(USED_CODES_KEY) || ''`).toUpperCase().includes(process.env.OWNER_CODE.toUpperCase()), '…and is never saved in the used-codes list');
} else console.log('  (skip) set OWNER_CODE=... to check the real owner code');

console.log('\n' + (ok ? 'MRS GUM PASS' : 'MRS GUM FAIL'));
process.exit(ok ? 0 : 1);
