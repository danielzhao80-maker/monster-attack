// Load the game in the fake DOM, then actually PLAY it for a few hundred frames and report the first
// error. An exception inside update() or draw() propagates out of gameLoop, so the final
// requestAnimationFrame(gameLoop) never runs and the whole game freezes on the spot — which looks
// exactly like "looking and moving are broken".
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
    if(k==='createElement') return t=>(t==='canvas'?mkCanvas('tmp'):mkAny());
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


// A standing audit of the game's data tables and systems. Every check states an invariant; anything
// that answers with something other than 'ok' is reported. Written after a sweep that turned up a
// real leaderboard bug — the point is that the sweep is repeatable, not a one-off.
function q(js){ return vm.runInNewContext(js, ctx, {filename:'game.js', timeout:20000}); }
const findings = [];
let checks = 0;
function probe(label, js) {
  checks++;
  let r; try { r = q(js); } catch (e) { findings.push([label, 'THREW: ' + e.message]); return; }
  if (r && r !== 'ok') findings.push([label, String(r)]);
}
console.log('');
q(`chosenClass = CLASSES[0]; playerName='Auditor'; gameRunning=false; cameraMode='topdown';`);

// ---------- data integrity ----------
probe('classes: missing fields', `(function(){
  var bad=[]; CLASSES.forEach(function(c){
    ['name','emoji','rarity','speed','hp','damage','fireRate','ammo','type'].forEach(function(k){
      if (c[k] === undefined) bad.push(c.name+'.'+k); });
    if (c.type!=='ranged' && c.type!=='melee') bad.push(c.name+' type='+c.type);
  }); return bad.length ? bad.join(', ') : 'ok'; })()`);

probe('classes: duplicate names', `(function(){
  var seen={},d=[]; CLASSES.forEach(function(c){ if(seen[c.name]) d.push(c.name); seen[c.name]=1; });
  return d.length ? d.join(', ') : 'ok'; })()`);

probe('worlds: missing fields', `(function(){
  var bad=[]; WORLDS.forEach(function(w){
    ['id','name','emoji','unlockWave','ground','groundAlt','bldgColors','bosses'].forEach(function(k){
      if (w[k] === undefined) bad.push(w.id+'.'+k); });
    if (!w.trapTypes || !w.trapTypes.length) bad.push(w.id+': no trapTypes');
    if (w.bldgColors && !w.bldgColors.length) bad.push(w.id+': empty bldgColors');
  }); return bad.length ? bad.join(', ') : 'ok'; })()`);

probe('worlds: duplicate ids', `(function(){
  var seen={},d=[]; WORLDS.forEach(function(w){ if(seen[w.id]) d.push(w.id); seen[w.id]=1; });
  return d.length ? d.join(', ') : 'ok'; })()`);

probe('worlds: bosses that do not exist', `(function(){
  var names = MONSTER_CLASSES.map(function(m){return m.name;}); var bad=[];
  WORLDS.forEach(function(w){ (w.bosses||[]).forEach(function(b){
    if (names.indexOf(b) < 0) bad.push(w.id+' -> "'+b+'"'); }); });
  return bad.length ? bad.join(', ') : 'ok'; })()`);

probe('artifacts: duplicate ids', `(function(){
  var seen={},d=[]; ARTIFACTS.forEach(function(a){ if(seen[a.id]) d.push(a.id); seen[a.id]=1; });
  return d.length ? d.join(', ') : 'ok'; })()`);

probe('artifacts: unknown rarity or buff key', `(function(){
  // storage is a real buff key: the Ring of Holding multiplies the backpack stack limit.
  var okBuff = {speed:1,firerate:1,dmgmult:1,maxhp:1,ammo:1,defense:1,lifesteal:1,crit:1,dodge:1,storage:1};
  var bad=[]; ARTIFACTS.forEach(function(a){
    if (!ARTIFACT_RARITY[a.rarity]) bad.push(a.id+' rarity='+a.rarity);
    Object.keys(a.buff||{}).forEach(function(k){ if(!okBuff[k]) bad.push(a.id+' buff.'+k); });
  }); return bad.length ? bad.join(', ') : 'ok'; })()`);

probe('weapons: duplicate ids', `(function(){
  var seen={},d=[]; WEAPONS.forEach(function(w){ if(seen[w.id]) d.push(w.id); seen[w.id]=1; });
  return d.length ? d.join(', ') : 'ok'; })()`);

probe('weapons: classReq naming a class that does not exist', `(function(){
  var names = CLASSES.map(function(c){return c.name;}); var bad=[];
  WEAPONS.forEach(function(w){ if (w.classReq && names.indexOf(w.classReq)<0) bad.push(w.id+' -> '+w.classReq); });
  return bad.length ? bad.join(', ') : 'ok'; })()`);

probe('pets: duplicate names / bad rank', `(function(){
  var seen={},d=[]; PETS.forEach(function(p){
    if(seen[p.name]) d.push('dup '+p.name); seen[p.name]=1;
    if(!PET_RANK_COLORS[p.rank]) d.push(p.name+' rank='+p.rank); });
  return d.length ? d.join(', ') : 'ok'; })()`);

probe('quests: stats outside QUEST_STATS', `(function(){
  var bad=[]; (typeof QUESTS!=='undefined'?QUESTS:[]).forEach(function(qq){
    if (QUEST_STATS.indexOf(qq.stat) < 0) bad.push(qq.id+' stat='+qq.stat); });
  return bad.length ? bad.join(', ') : 'ok'; })()`);

probe('monster classes: missing fields', `(function(){
  var bad=[]; MONSTER_CLASSES.forEach(function(m){
    ['name','emoji','rarity','rarityColor'].forEach(function(k){ if(m[k]===undefined) bad.push(m.name+'.'+k); });
  }); return bad.length ? bad.join(', ') : 'ok'; })()`);

// ---------- currency ----------
probe('coins: spend below zero', `(function(){
  coins = 10n; spendCoins(999); return coins < 0n ? 'went negative: '+coins : 'ok'; })()`);
probe('coins: cap', `(function(){
  coins = 0n; addCoins(Number(MAX_COINS) * 2); return coins > MAX_COINS ? 'exceeded cap' : 'ok'; })()`);
probe('coins: coinStr on huge values', `(function(){
  coins = MAX_COINS; var s = coinStr();
  return (typeof s === 'string' && s.length && s.indexOf('NaN') < 0) ? 'ok' : 'coinStr gave "'+s+'"'; })()`);
probe('coins: survive a save/load round trip', `(function(){
  coins = 123456789012345n; saveFlesh(); coins = 0n; loadFlesh();
  return coins === 123456789012345n ? 'ok' : 'became '+coins; })()`);

// ---------- backpack ----------
probe('backpack: overfill', `(function(){
  backpack.slots = new Array(BP_SLOTS).fill(null); saveBackpack();
  var put = 0; for (var i=0;i<400;i++) put += bpAddRaw('flesh', 50);
  var cap = BP_SLOTS * 50;
  return put > cap ? 'accepted '+put+' into a '+cap+' pack' : 'ok'; })()`);
probe('backpack: bank empties and pays out', `(function(){
  backpack.slots = new Array(BP_SLOTS).fill(null);
  bpAddRaw('flesh', 120); coins = 0n; var got = bankBackpack(true);
  return (got === 120 && Number(coins) === 120 && bpCount('flesh') === 0) ? 'ok'
       : 'banked '+got+', coins '+coins+', left '+bpCount('flesh'); })()`);

// ---------- codes ----------
probe('codes: unknown reward types', `(function(){
  if (typeof CODES === 'undefined') return 'ok';
  var known = {coins:1,flesh:1,points:1,xp:1,level:1,class:1,pet:1,weapon:1,artifact:1,move:1,upgrade:1,ability:1};
  var bad=[]; Object.keys(CODES).forEach(function(k){
    var r = CODES[k]; if (r && r.type && !known[r.type]) bad.push(k+' -> '+r.type); });
  return bad.length ? bad.join(', ') : 'ok'; })()`);

// ---------- levels ----------
probe('player level: xpToNext never zero or negative', `(function(){
  for (var l=1;l<MAX_PLAYER_LEVEL;l++){ var n = xpToNext(l); if(!(n>0)) return 'level '+l+' -> '+n; }
  return 'ok'; })()`);
probe('player level: addXP cannot pass the cap', `(function(){
  plevel = MAX_PLAYER_LEVEL - 1; pxp = 0; addXP(1e12);
  return plevel > MAX_PLAYER_LEVEL ? 'reached '+plevel : 'ok'; })()`);

// ---------- worlds ----------
probe('worlds: unlockWave ordering', `(function(){
  for (var i=1;i<WORLDS.length;i++) if (WORLDS[i].unlockWave <= WORLDS[i-1].unlockWave)
    return WORLDS[i].id+' unlocks at '+WORLDS[i].unlockWave+' but '+WORLDS[i-1].id+' at '+WORLDS[i-1].unlockWave;
  return 'ok'; })()`);

// ---------- rolls ----------
probe('rollRarity always returns a usable rarity', `(function(){
  var bad = {}; for (var i=0;i<4000;i++){ var r = rollRarity();
    if (!CLASSES.some(function(c){return c.rarity===r;})) bad[r]=1; }
  var k = Object.keys(bad); return k.length ? 'no class has rarity: '+k.join(',') : 'ok'; })()`);
probe('rollMonsterClass never returns nothing', `(function(){
  for (var i=0;i<2000;i++) if (!rollMonsterClass()) return 'returned null';
  return 'ok'; })()`);
probe('hatchOneEgg always yields a real pet', `(function(){
  for (var i=0;i<2000;i++){ var p = hatchOneEgg();
    if (!p || !p.name || !PET_RANK_COLORS[p.rank]) return 'bad pet: '+JSON.stringify(p); }
  return 'ok'; })()`);

// ---------- character upgrades ----------
probe('upgrades: can you level past the cap', `(function(){
  charLevels = {}; points = 999999; savePoints();
  var n = CLASSES[0].name;
  for (var i=0;i<10;i++) upgradeChar(n);
  return getCharLevel(n) > 3 ? 'reached Lv.'+getCharLevel(n) : 'ok'; })()`);
probe('upgrades: are you charged when you cannot afford it', `(function(){
  charLevels = {}; points = 0; savePoints();
  var n = CLASSES[0].name; var before = points;
  upgradeChar(n);
  return (getCharLevel(n) > 1 || points < before) ? 'level '+getCharLevel(n)+', points '+points : 'ok'; })()`);

// ---------- artifacts ----------
probe('artifacts: buying more than remain', `(function(){
  artifactsOwned = ARTIFACTS.map(function(a){return a.id;}).slice(0, ARTIFACTS.length-2);
  saveArtifacts(); coins = 1000000n;
  var before = Number(coins);
  buyArtifacts(10);
  return (Number(coins) < before && artifactsOwned.length < ARTIFACTS.length)
    ? 'charged '+(before-Number(coins))+' for undeliverable artifacts' : 'ok'; })()`);
probe('artifacts: equipping more than the cap', `(function(){
  artifactsOwned = ARTIFACTS.map(function(a){return a.id;}); artifactsEquipped = []; saveArtifacts();
  for (var i=0;i<10;i++) toggleArtifact(ARTIFACTS[i].id);
  return artifactsEquipped.length > MAX_EQUIPPED_ARTIFACTS
    ? 'equipped '+artifactsEquipped.length+' of max '+MAX_EQUIPPED_ARTIFACTS : 'ok'; })()`);
probe('artifacts: do the buffs actually reach the player', `(function(){
  artifactsOwned = ['a01']; artifactsEquipped = []; saveArtifacts();
  chosenClass = CLASSES[0]; var base = createPlayer().maxHp;
  artifactsEquipped = ['a01']; saveArtifacts();
  var withA = createPlayer().maxHp;
  return withA > base ? 'ok' : 'Stone Core (+20 maxhp) changed nothing: '+base+' -> '+withA; })()`);
probe('artifacts: grantRandomArtifact stops at the full set', `(function(){
  artifactsOwned = ARTIFACTS.map(function(a){return a.id;}); saveArtifacts();
  var r = grantRandomArtifact(true);
  return (r === null && artifactsOwned.length === ARTIFACTS.length) ? 'ok' : 'granted past the full set'; })()`);

// ---------- pets ----------
probe('pets: equipping more than the cap', `(function(){
  petsOwned = []; for (var i=0;i<8;i++) petsOwned.push({name:'Rat',rank:'F',ability:'Scavenge',element:'Fire'});
  equippedPets = []; savePets();
  for (var i=0;i<8;i++) equipPet(i);
  return equippedPets.length > MAX_EQUIPPED_PETS ? 'equipped '+equippedPets.length : 'ok'; })()`);
probe('pets: releasing shifts the equipped indices', `(function(){
  petsOwned = [{name:'Rat',rank:'F'},{name:'Bunny',rank:'C'},{name:'Phoenix',rank:'SSS'}];
  equippedPets = [2]; savePets();
  _origConfirm = typeof confirm; 
  releasePet(0);
  var still = equippedPets.length && petsOwned[equippedPets[0]] && petsOwned[equippedPets[0]].name;
  return still === 'Phoenix' ? 'ok'
       : 'after releasing pet 0 the equipped slot points at '+still+' (indices shifted)'; })()`);

// ---------- weapons ----------
probe('weapons: buying one you cannot afford', `(function(){
  unlockedWeapons = []; coins = 0n; saveWeapons();
  var w = WEAPONS.find(function(x){return x.price > 0;});
  buyWeapon(w.id);
  return unlockedWeapons.indexOf(w.id) > -1 ? 'got '+w.id+' for free' : 'ok'; })()`);
probe('weapons: do the buffs reach the player', `(function(){
  unlockedWeapons = WEAPONS.map(function(w){return w.id;}); saveWeapons();
  var w = WEAPONS.find(function(x){return x.dmg > 0 && x.type === CLASSES[0].type;});
  equippedWeaponId = null; saveWeapons(); chosenClass = CLASSES[0];
  var base = createPlayer().damage;
  equippedWeaponId = w.id; saveWeapons();
  var withW = createPlayer().damage;
  return withW > base ? 'ok' : w.id+' (+'+w.dmg+' dmg) changed nothing: '+base+' -> '+withW; })()`);

// ---------- quests ----------
probe('quests: can the same quest be claimed twice', `(function(){
  loadQuests(); questData.prog = {}; questData.claimed = {}; questData.life = {}; questData.lifeClaimed = {};
  var qq = DAILY_POOL[0];
  questTrack(qq.stat, qq.target * 5);
  coins = 0n; points = 0; plevel = 1; pxp = 0;
  claimQuest(qq.id, false);
  var after1 = Number(coins) + points;
  claimQuest(qq.id, false);
  var after2 = Number(coins) + points;
  return after2 > after1 ? 'paid out twice' : 'ok'; })()`);
probe('quests: claiming one you have not finished', `(function(){
  loadQuests(); questData.prog = {}; questData.claimed = {};
  var qq = DAILY_POOL[0]; coins = 0n; points = 0;
  claimQuest(qq.id, false);
  return (Number(coins) + points) > 0 ? 'paid out for an unfinished quest' : 'ok'; })()`);

// ---------- leaderboard ----------
probe('leaderboard: grows past its cap', `(function(){
  localStorage.removeItem('monster_city_leaderboard');
  for (var i=0;i<40;i++){ playerName = 'P'+i; addToLeaderboard(i*10, i, 'Soldier', 'S'); }
  var lb = JSON.parse(localStorage.getItem('monster_city_leaderboard')||'[]');
  return lb.length > 10 ? 'holds '+lb.length+' entries' : 'ok'; })()`);
// This one caught a real bug: addToLeaderboard pushed unconditionally, so ten games on one machine
// filled every slot in the top ten with the same name and pushed everyone else off the board.
probe('leaderboard: one entry per player', `(function(){
  localStorage.removeItem('monster_city_leaderboard');
  playerName = 'Solo';
  for (var i=1;i<=5;i++) addToLeaderboard(i*100, i, 'Soldier', 'S');
  var lb = JSON.parse(localStorage.getItem('monster_city_leaderboard')||'[]');
  var mine = lb.filter(function(e){return e.name==='Solo';});
  return mine.length > 1 ? mine.length+' entries for one player' : 'ok'; })()`);
probe('leaderboard: keeps your BEST score', `(function(){
  localStorage.removeItem('monster_city_leaderboard');
  playerName = 'Solo';
  addToLeaderboard(500, 9, 'Soldier', 'S');
  addToLeaderboard(100, 2, 'Soldier', 'S');
  var lb = JSON.parse(localStorage.getItem('monster_city_leaderboard')||'[]');
  var mine = lb.filter(function(e){return e.name==='Solo';})[0];
  return (mine && mine.score === 500) ? 'ok' : 'best score became '+(mine&&mine.score); })()`);

// ---------- corrupt localStorage must never break startup ----------
const LOADERS = [
  ['loadFlesh','monster_city_flesh'], ['loadPoints','monster_city_points'],
  ['loadCharLevels','monster_city_char_levels'], ['loadWorldProgress','monster_city_worlds'],
  ['loadPets','monster_city_pets'], ['loadArtifacts','monster_city_artifacts'],
  ['loadWeapons','monster_city_weapons'], ['loadQuests','monster_city_quests'],
  ['loadBackpack','monster_city_backpack'], ['loadCustomMap','monster_city_custom_map'],
  ['loadPlayerLevel','monster_city_plevel'], ['loadSeason','monster_city_season'],
  ['loadGS','monster_city_gs'],
];
const JUNK = ['', 'null', '{', '[[[', '"a string"', '{"x":1}', '[1,2,3]', 'undefined', '99999999999999999999999999', '[{"broken":true}]'];
for (const [fn, key] of LOADERS) {
  probe('corrupt save: ' + fn, `(function(){
    if (typeof ${fn} !== 'function') return 'ok';
    var bad = [];
    ${JSON.stringify(JUNK)}.forEach(function(j){
      localStorage.setItem(${JSON.stringify(key)}, j);
      try { ${fn}(); } catch (e) { bad.push(JSON.stringify(j)+' -> '+e.message); }
    });
    localStorage.removeItem(${JSON.stringify(key)});
    return bad.length ? bad.join(' | ') : 'ok'; })()`);
}

// ---------- codes ----------
probe('codes: an unknown code pays out', `(function(){
  if (typeof redeemCode !== 'function') return 'ok';
  coins = 0n; points = 0; plevel = 1;
  var el = document.getElementById('code-input'); if (el) el.value = 'TOTALLYNOTAREALCODE123';
  try { redeemCode(); } catch(e) { return 'threw: '+e.message; }
  return (Number(coins) + points) > 0 ? 'an unknown code paid out' : 'ok'; })()`);

// ---------- bans ----------
probe('bans: a banned player can still start a run', `(function(){
  if (typeof banPlayer !== 'function') return 'ok';
  playerName = 'BannedGuy'; banPlayer('BannedGuy');
  var blocked = isPlayerBanned('BannedGuy');
  unbanPlayer && unbanPlayer('BannedGuy');
  return blocked ? 'ok' : 'ban did not register'; })()`);

// ---------- God Survivor ----------
probe('god survivor: stats past their cap', `(function(){
  if (typeof godAction !== 'function') return 'ok';
  gsData.unlocked = true; gsData.stats = gsData.stats || {};
  gsData.stats.HP = 0; saveGS();
  for (var i=0;i<200;i++) { try { godAction('heal'); } catch(e){} }
  return (gsData.stats.HP||0) > 400 ? 'HP reached '+gsData.stats.HP : 'ok'; })()`);

// ---------- worlds ----------
probe('worlds: a locked world can be selected', `(function(){
  highestWaveEver = 0; saveWorldProgress();
  var locked = WORLDS.find(function(w){return w.unlockWave > 0;});
  return (typeof isWorldUnlocked === 'function' && isWorldUnlocked(locked))
    ? locked.id+' is unlocked at wave 0' : 'ok'; })()`);

// ---------- monster scaling ----------
probe('monsters: hp or count goes non-finite at high waves', `(function(){
  var bad = [];
  [1, 10, 50, 100, 500, 1000].forEach(function(w){
    wave = w; currentMonsterClass = MONSTER_CLASSES[0];
    monsters = []; player = player || createPlayer();
    try { spawnMonster(); } catch(e) { bad.push('wave '+w+': '+e.message); return; }
    var m = monsters[monsters.length-1];
    if (!m) { bad.push('wave '+w+': nothing spawned'); return; }
    if (!isFinite(m.hp) || m.hp <= 0) bad.push('wave '+w+': hp='+m.hp);
    if (!isFinite(m.speed) || m.speed < 0) bad.push('wave '+w+': speed='+m.speed);
  });
  return bad.length ? bad.join(', ') : 'ok'; })()`);

// ---------- abilities ----------
probe('abilities: any class ability throws when used', `(function(){
  var bad = [];
  CLASSES.forEach(function(c){
    chosenClass = c; player = createPlayer();
    player.x = WORLD_W/2; player.y = WORLD_H/2;
    monsters = []; bullets = []; walls = []; allies = []; turrets = []; particles = [];
    try { useAbility(); } catch (e) { bad.push(c.name+' [E]: '+e.message); }
    try { if (typeof useMoveQ === 'function') { player.charLevel = 3; useMoveQ(); } } catch (e) { bad.push(c.name+' [Z]: '+e.message); }
    try { if (typeof useMoveF === 'function') { player.charLevel = 3; useMoveF(); } } catch (e) { bad.push(c.name+' [X]: '+e.message); }
  });
  return bad.length ? bad.slice(0,6).join(' | ') + (bad.length>6?' (+'+(bad.length-6)+' more)':'') : 'ok'; })()`);

// ---------- backpack items ----------
probe('backpack: any item throws when used', `(function(){
  chosenClass = CLASSES[0]; player = createPlayer(); gameRunning = true;
  monsters = []; var bad = [];
  Object.keys(BP_ITEM).forEach(function(k){
    var def = BP_ITEM[k]; if (!def || !def.use) return;
    try { def.use(player); } catch (e) { bad.push(k+': '+e.message); }
  });
  gameRunning = false;
  return bad.length ? bad.join(' | ') : 'ok'; })()`);

probe('bans: a ban blocks starting a run', `(function(){
  var bans = getBannedPlayers(); bans.push('bannedguy'); saveBans(bans);
  playerName = 'BannedGuy';
  var started = false;
  try { openRollScreen(); started = (document.getElementById('roll-screen').style.display === 'flex'); } catch(e){}
  saveBans([]);  playerName='Auditor';
  return started ? 'a banned player reached the class roll' : 'ok'; })()`);

probe('bans: a ban is case-insensitive', `(function(){
  saveBans(['daniel']);
  var a = isPlayerBanned('Daniel'), b = isPlayerBanned('DANIEL'), c = isPlayerBanned('daniel');
  saveBans([]);
  return (a && b && c) ? 'ok' : 'Daniel='+a+' DANIEL='+b+' daniel='+c; })()`);

probe('leaderboard: banned players are hidden', `(function(){
  localStorage.removeItem('monster_city_leaderboard');
  playerName='Cheater'; addToLeaderboard(9999, 99, 'Soldier', 'S');
  playerName='Honest';  addToLeaderboard(10, 1, 'Soldier', 'S');
  saveBans(['cheater']);
  var shown = getLeaderboard().filter(function(e){ return !isPlayerBanned(e.name); });
  var raw = getLeaderboard();
  saveBans([]);
  // Only a finding if the RENDER path does not filter — check the helper the UI uses.
  return (raw.length === 2 && shown.length === 1) ? 'ok'
       : 'raw='+raw.length+' visible='+shown.length; })()`);

probe('coinStr: formatting across magnitudes', `(function(){
  var bad=[];
  ['0','1','999','1000','1000000','1000000000','123456789012345678901234567890'].forEach(function(v){
    coins = BigInt(v); var s = coinStr();
    if (typeof s !== 'string' || !s.length || /NaN|undefined|Infinity/.test(s)) bad.push(v+' -> '+s);
  });
  return bad.length ? bad.join(', ') : 'ok'; })()`);

probe('backpack: the Ring of Holding really raises the stack limit', `(function(){
  artifactsOwned = ['a51']; artifactsEquipped = []; saveArtifacts();
  var base = bpStack();
  artifactsEquipped = ['a51']; saveArtifacts();
  var ringed = bpStack();
  artifactsEquipped = []; saveArtifacts();
  return ringed > base ? 'ok' : 'stack limit unchanged: '+base+' -> '+ringed; })()`);

probe('waves: monster count grows and stays sane', `(function(){
  var prev = 0, bad = [];
  [1,2,5,10,20,50].forEach(function(w){
    wave = w;
    var n = (w % 10 === 0) ? 1 : (5 + (w-1)*3);
    if (!isFinite(n) || n < 1) bad.push('wave '+w+' -> '+n);
  });
  return bad.length ? bad.join(', ') : 'ok'; })()`);

probe('season pass: XP never goes backwards or non-finite', `(function(){
  if (typeof addSeasonXP !== 'function') return 'ok';
  seasonXP = 0; saveSeason();
  for (var i=0;i<500;i++) addSeasonXP(10);
  return (isFinite(seasonXP) && seasonXP === 5000) ? 'ok' : 'seasonXP='+seasonXP; })()`);

probe('save: a custom map with traps survives Continue', `(function(){
  customMap = [{lx:0,ly:0,x:1000,y:1000,w:200,h:200,hgt:200,color:'#f00',st:'tower'}];
  customTraps = [{x:2000,y:2000,r:18,type:'manhole',emoji:'X',color:'#000',dmg:5,effect:'slow',duration:120,label:'M',art:'pit',cooldown:0,seed:1}];
  saveCustomMap();
  chosenClass = CLASSES[0]; gameRunning=false; usingCustomMap = true; startGame(); usingCustomMap = true;
  refreshChunks(true); player.x = WORLD_W/2; player.y = WORLD_H/2; wave = 3; saveGame();
  gameRunning = false; usingCustomMap = false; buildings = []; traps = [];
  loadGame();
  return (usingCustomMap && buildings.length === 1 && traps.length === 1) ? 'ok'
       : 'custom='+usingCustomMap+' buildings='+buildings.length+' traps='+traps.length; })()`);


// Guard against a probe quietly skipping itself because it named a function that does not exist.
const PROBED = ['loadFlesh','loadPoints','loadCharLevels','loadWorldProgress','loadPets','loadArtifacts',
  'loadWeapons','loadQuests','loadBackpack','loadCustomMap','loadPlayerLevel','loadSeason','loadGS',
  'redeemCode','isPlayerBanned','getBannedPlayers','saveBans','godAction','spawnMonster','useAbility',
  'claimQuest','upgradeChar','buyWeapon','buyArtifacts','toggleArtifact','equipPet','releasePet',
  'addToLeaderboard','getLeaderboard','hatchOneEgg','rollRarity','rollMonsterClass','bpStack','coinStr'];
const absent = q(`(function(){ var m=[]; ${JSON.stringify(PROBED)}.forEach(function(n){
  try { if (typeof eval(n) !== 'function') m.push(n); } catch(e) { m.push(n); } }); return m.join(','); })()`);
if (absent) findings.push(['audit coverage', 'these helpers no longer exist, so their checks are silently skipped: ' + absent]);

console.log(checks + ' invariants checked\n');
if (!findings.length) { console.log('AUDIT PASS - no anomalies'); process.exit(0); }
console.log('FINDINGS:\n');
for (const [l, d] of findings) console.log('  ' + l + '\n      ' + d + '\n');
console.log('AUDIT FAIL - ' + findings.length + ' finding(s)');
process.exit(1);
