// Multiplayer movement and prediction.
//
// The game's functions are EXTRACTED FROM index.html AT RUNTIME rather than copied in here. An earlier
// version embedded a copy, which silently went stale the moment the movement maths changed — it kept
// passing while testing code the game no longer ran. Reading the real file every time is the only way
// this can be trusted.
const fs = require('fs'), vm = require('vm');
const FILE = process.argv[2] || 'index.html';
const src = fs.readFileSync(FILE, 'utf8');

function grab(name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('missing function: ' + name);
  let k = src.indexOf('{', i), d = 0;
  for (;; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) break; }
  }
  return src.slice(i, k + 1);
}
const FNS = ['mpHostOnData','updateRemotePlayer','mpBroadcastState','mpSerializePlayer','mpClientApplyState',
  'mpInterpolateRemotes','mpPredictLocal','localMoveDir','mpClientSendInput','mpEnsureBodies',
  'mpClientTick','_netNow','_snapPush','_snapAt','_hostClock','stepVelocity',
  'enterForm','exitForm','updateForm','formOf','tickPlayerTimers',
  // Gojo: his orbs ride the state packet, and his Infinity meter is ticked with the other timers.
  'mpSerializeGojoOrbs','mpClientGojoOrbs','mpClientTickGojoFx','spawnGameEffect','removeGameEffect',
  'tickInfinity','gojoSixEyes','infinityUp',
  // Sikuna: the guest ages its own one-shot effects (cuts, slashes, the shrine) every frame.
  'mpClientTickEffects'];
const game = FNS.map(grab).join('\n\n');

// Tuning constants come out of the real file too, so a retuned value is picked up rather than the
// test quietly measuring against a number the game no longer uses.
function constOf(name, fallback) {
  const m = src.match(new RegExp('const\\s+' + name + '\\s*=\\s*([^;,\\n]+)'));
  return m ? m[1].trim() : fallback;
}
const TUNING = ['MOVE_ACCEL','MOVE_BRAKE','MP_RECONCILE_DEADZONE','MP_RECONCILE_RATE','MP_LERP','MP_SNAP_KEEP','MP_STATE_HZ',
  'INF_R','INF_MAX','INF_DOWN_T','INF_REGEN','INF_REGEN_DELAY','INF_BACK','INF_SIXEYES_REGEN','INF_DRAIN_SHOT']
  .map(n => 'const ' + n + ' = ' + constOf(n, '0') + ';').join('\n');
// FORMS is a big literal; lift it out of the file rather than restating it here where it would rot.
const formsSrc = (function(){
  const i = src.indexOf('const FORMS = {');
  let k = src.indexOf('{', i), d = 0;
  for (;; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (d === 0) break; } }
  return src.slice(i, k + 1) + ';';
})();

const classesSrc = (function(){
  const i = src.indexOf('const CLASSES = [');
  let k = src.indexOf('[', i), d = 0;
  for (;; k++) { if (src[k] === '[') d++; else if (src[k] === ']') { d--; if (d === 0) break; } }
  return src.slice(i, k + 1).replace(/^const CLASSES = /, '');
})();
const HARNESS = `
// The REAL class table, lifted from the file — a hand-written stand-in would not include the new
// classes and would quietly stop testing them.
const CLASSES = ${classesSrc};
const MONSTER_CLASSES = [{ name:'Zombie', rarityColor:'#fff' }];
const WORLDS = [{ id:'city', name:'City', bldgColors:['#ff6b6b'], trapTypes:[] }];
const BULLET_SPEED = 12, BULLET_EYE = 20, WORLD_W = 9000, WORLD_H = 5500, MAX_PLAYER_LEVEL = 100;
let _mpLastBroadcast = 0, _nidSeq = 0;
const _r1 = v => Math.round(v * 10) / 10;
const _netMon = new Map();
const _predHist = [];
const _recErr = { x:0, y:0 };
let gameEffects = [], gojoOrbs = [], _three = null;
const _gorbFx = new Map(), _gorbOut = [];
const _GORB_COL = {}, _skGuestDoms = [];
function _shrineCutsVisual(){ return 0; }
const BLUE_PULL_R = ${(src.match(/BLUE_PULL_R = (\d+)/) || [0, 220])[1]};
const MP_INTERP_MS = 2000 / MP_STATE_HZ;
let FRAME = 0;
const performance = { now: () => FRAME * (1000/60) };
let NET, player, remotePlayers = [], monsters = [], bullets = [], pickups = [], walls = [],
    fireTiles = [], poisonTiles = [], allies = [], turrets = [], buildings = [], traps = [],
    shadeZones = [], score = 0, wave = 1, currentMonsterClass = MONSTER_CLASSES[0],
    currentWorld = WORLDS[0], keys = {}, shooting = false, cameraMode = '3d', playerName = 'Host',
    _worldSeed = 1, _chunkCache = new Map(), _loadedChunkKey = null, _cliTodWave = 0,
    usingCustomMap = false, customMap = [], customTraps = [];
function ptInBld(){ return false; }
function ptInWall(){ return null; }
function refreshChunks(){}
function mouseWorldX(){ return player.x + 100; }
function mouseWorldY(){ return player.y; }
function aimsVertically(){ return true; }
function setTimeOfDayForWave(){}
function applySupporterBuffTo(){} function mpUpdateLobby(){} function mpSpawnLateJoiner(){}
function mpSerializeLobby(){ return NET.lobby.map(p => ({ name:p.name, clsName:p.clsName })); }
function showStatus(){} function addShake(){} function playStep(){}
function _mvRing(){} function hitMonster(){}
function isInShade(){ return true; }   // Vampire burns in the sun; keep it shaded here
function _mvDmgRadius(){} function _mvDash(){} function _mvSpray(){}
function themeMonster(m){ return m; }
const SFX = new Proxy({}, { get: () => () => {} });
const BP_ITEM = {}; let _bpQuiet = false;
let toGuest = [], toHost = [];
let LAT = 6;
const guestConn = { open:true, send: m => toGuest.push({ at: FRAME + LAT, m: JSON.parse(JSON.stringify(m)) }) };
function mpBroadcast(msg){ for (const c of NET.conns) { try { c.send(msg); } catch(e){} } }
`;


// ---- Gojo across the wire: guests must SEE his orbs, and his Infinity meter ----
const GOJO_TESTS = `
console.log('');
reset();
load(HOST);
gameEffects = [];
const _fx = spawnGameEffect('gorb', 4700, 2750, '#3fa9ff', { maxR: 14, maxT: 1e9, kind: 'blue', reach: BLUE_PULL_R });
gojoOrbs = [{ id: 7, k: 'blue', fx: _fx, fxA: null, fxB: null }];
save(HOST);
HOST._gfx = gameEffects; gameEffects = [];
for (let i = 0; i < 20; i++) tick();
const _gOrb = gameEffects.find(e => e.type === 'gorb' && e.kind === 'blue');
check(!!_gOrb && Math.abs(_gOrb.x - 4700) < 1 && _gOrb.reach === BLUE_PULL_R,
      "a guest sees the host's Blue orb, where it really is", _gOrb ? Math.round(_gOrb.x) + ',' + Math.round(_gOrb.y) : 'none');
const _t0 = _gOrb ? _gOrb.t : 0; tick();
check(_gOrb && _gOrb.t > _t0, 'and it animates between packets');
_fx.x = 4800;
for (let i = 0; i < 20; i++) tick();
check(_gOrb && Math.abs(_gOrb.x - 4800) < 1, 'it follows the orb as it moves', _gOrb ? Math.round(_gOrb.x) : '');
gojoOrbs = [];
for (let i = 0; i < 20; i++) tick();
check(!gameEffects.some(e => e.type === 'gorb'), 'and it is gone on the guest when the orb ends');
gameEffects = [];
// The meter rides the player packet, so a guest playing Gojo sees the truth on the HUD.
reset();
const _gojo = CLASSES.find(c => c.name === 'Gojo');
HOST.remotePlayers[0].cls = _gojo; HOST.remotePlayers[0]._inf = 37;
GUEST.player.cls = _gojo;
for (let i = 0; i < 20; i++) tick();
check(GUEST.player._inf === 37, "a guest's Infinity meter comes from the host", String(GUEST.player._inf));
load(HOST); const _rg = HOST.remotePlayers[0]; _rg._infBlk = 100; tickPlayerTimers(_rg); save(HOST);
check(_rg._infDown > 0 && infinityUp(_rg) === false, "a guest's Infinity drops on the host when its meter empties");
// ---- Sikuna's Fuga rides the same orb sync: the arrow (with its angle), then the firestorm ----
console.log('');
reset();
load(HOST);
gameEffects = [];
const _af = spawnGameEffect('gorb', 4700, 2750, '#ff7f11', { maxR: 10, maxT: 1e9, kind: 'fuga', angle: 1.2 });
const _fo = { id: 9, k: 'fuga', fx: _af, fxA: null, fxB: null };
gojoOrbs = [_fo];
save(HOST);
HOST._gfx = gameEffects; gameEffects = [];
for (let i = 0; i < 20; i++) tick();
const _gA = gameEffects.find(e => e.type === 'gorb' && e.kind === 'fuga');
check(!!_gA && Math.abs(_gA.angle - 1.2) < 0.02, "a guest sees Sikuna's fire arrow, pointing the way it flies", _gA ? 'angle ' + _gA.angle : 'none');
// The host's arrow bursts: same orb id, now a firestorm (made on the host's own effect list).
{ const _guestFx = gameEffects; gameEffects = HOST._gfx;
  _fo.k = 'storm'; _fo.fx = spawnGameEffect('gorb', 4700, 2750, '#ff4500', { maxR: 220, maxT: 1e9, kind: 'storm' });
  gameEffects = _guestFx; }
for (let i = 0; i < 20; i++) tick();
check(gameEffects.some(e => e.type === 'gorb' && e.kind === 'storm' && e.maxR === 220) && !gameEffects.some(e => e.kind === 'fuga'),
      'and the firestorm it bursts into (the arrow is swapped out, not left behind)');
gojoOrbs = [];
for (let i = 0; i < 20; i++) tick();
check(!gameEffects.some(e => e.type === 'gorb'), 'the firestorm goes away on the guest when it ends');
// A guest never runs update(), so its one-shot effects must be aged by mpClientTick or they hang forever.
gameEffects = [];
spawnGameEffect('cut', 4600, 2750, '#ff2d55', { maxR: 20, maxT: 10 });
spawnGameEffect('shrine', 4500, 2750, '#7a0010', { maxR: 70, maxT: 30 });
for (let i = 0; i < 12; i++) tick();
check(!gameEffects.some(e => e.type === 'cut') && gameEffects.some(e => e.type === 'shrine'), 'a cut on a guest fades on time; the shrine is still up');
for (let i = 0; i < 25; i++) tick();
check(!gameEffects.some(e => e.type === 'shrine'), 'and the shrine goes when its time is up');
gameEffects = [];
`;
const TESTS = '// ---------------------------------------------------------------- peers\nfunction makeRemote(cls, idx, name, x, y) {\n  return { x, y, r:14, speed:cls.speed, hp:100, maxHp:100, ammo:30, maxAmmo:30, damage:10, fireRate:12,\n    reloading:false, reloadTimer:0, angle:0, shootCooldown:0, invincible:0, flashTimer:0, cls,\n    frozen:0, stunned:0, slow:0, speedMode:1, meleeSwing:0, chiliBoost:0, shieldUp:false,\n    shieldRecharge:0, moveQCooldown:0, moveFCooldown:0, idx, name,\n    input:{keys:{},mx:x,my:y,shooting:false}, isRemote:true, abilityLvls:{e:1,z:1,x:1} };\n}\nfunction makePlayer(cls, x, y) {\n  return { x, y, r:14, speed:cls.speed, hp:100, maxHp:100, ammo:30, maxAmmo:30, damage:10, fireRate:12,\n    reloading:false, angle:0, cls, frozen:0, stunned:0, slow:0, speedMode:1, invincible:0,\n    meleeSwing:0, shieldUp:false, teleporting:0, invisible:false, pitch:0, chiliBoost:0 };\n}\nconst HOST = { player: makePlayer(CLASSES[0], 4500, 2750),\n  remotePlayers: [ makeRemote(CLASSES[1], 1, \'Daniel\', 4600, 2750) ],\n  NET: { mode:\'host\', started:true, myIdx:0, conns:[guestConn],\n         lobby:[{name:\'Host\',clsName:\'Soldier\'},{name:\'Daniel\',clsName:\'Scout\',conn:guestConn}] } };\nconst GUEST = { player: makePlayer(CLASSES[1], 4600, 2750), remotePlayers: [],\n  NET: { mode:\'client\', started:true, myIdx:1, conns:[],\n         hostConn:{ open:true, send: m => toHost.push({ at: FRAME + LAT, m: JSON.parse(JSON.stringify(m)) }) },\n         lobby: HOST.NET.lobby } };\nfunction load(p){ player=p.player; remotePlayers=p.remotePlayers; NET=p.NET; monsters=p.monsters||[]; bullets=p.bullets||[]; }\nfunction save(p){ p.player=player; p.remotePlayers=remotePlayers; p.NET=NET; p.monsters=monsters; p.bullets=bullets; }\n\nlet ok = true;\nfunction check(pass, label, extra) {\n  if (!pass) ok = false;\n  console.log(\'  \' + (pass ? \'PASS\' : \'FAIL\'), label + (extra ? \'  (\' + extra + \')\' : \'\'));\n}\nfunction reset(lat) {\n  LAT = lat === undefined ? 6 : lat;\n  FRAME = 0; toGuest.length = 0; toHost.length = 0;\n  _predHist.length = 0; _recErr.x = 0; _recErr.y = 0;\n  GUEST.NET._lastAck = undefined; GUEST.NET._clockOff = undefined;\n  GUEST.remotePlayers = []; _netMon.clear();\n  _mpLastBroadcast = -1e9;\n  HOST.player = makePlayer(CLASSES[0], 4500, 2750);\n  HOST.remotePlayers = [ makeRemote(CLASSES[1], 1, \'Daniel\', 4600, 2750) ];\n  GUEST.player = makePlayer(CLASSES[1], 4600, 2750);\n}\n// One full network tick: guest sends, host simulates and broadcasts, guest applies and smooths.\nfunction tick(opts) {\n  opts = opts || {};\n  load(GUEST);\n  keys = opts.idle ? {} : { w:true };\n  cameraMode = \'3d\'; player.angle = 0;\n  mpClientTick();\n  if (FRAME % 2 === 0 && !opts.drop) mpClientSendInput();\n  save(GUEST);\n\n  load(HOST);\n  for (let i = toHost.length-1; i>=0; i--) if (toHost[i].at <= FRAME) { mpHostOnData(guestConn, toHost[i].m); toHost.splice(i,1); }\n  for (const rp of remotePlayers) updateRemotePlayer(rp);\n  if (opts.hostMove) player.x += opts.hostMove;\n  mpBroadcastState();\n  save(HOST);\n\n  load(GUEST);\n  for (let i = toGuest.length-1; i>=0; i--) if (toGuest[i].at <= FRAME) {\n    if (toGuest[i].m.t === \'state\') mpClientApplyState(toGuest[i].m.state);\n    toGuest.splice(i,1);\n  }\n  save(GUEST);\n  FRAME++;\n}\n\nconsole.log(\'\\nmultiplayer movement:\\n\');\n\n// 1. the host drives the guest\'s body from their input\nreset();\nconst gx0 = HOST.remotePlayers[0].x;\nfor (let i = 0; i < 90; i++) tick();\ncheck(HOST.remotePlayers[0].x - gx0 > 200, "the host moves the guest\'s body from their input",\n      \'moved \' + Math.round(HOST.remotePlayers[0].x - gx0));\n\n// 2. the guest\'s OWN character runs at full speed under latency - the rubber-band regression\nfor (const lat of [3, 6, 12]) {\n  reset(lat);\n  const sx = GUEST.player.x;\n  const steps = [];\n  for (let i = 0; i < 200; i++) { const b = GUEST.player.x; tick(); steps.push(GUEST.player.x - b); }\n  const tail2 = steps.slice(80);\n  const mean = tail2.reduce((a,b)=>a+b,0) / tail2.length;\n  const back = tail2.filter(v => v < CLASSES[1].speed * 0.5).length;\n  check(Math.abs(mean - CLASSES[1].speed) < 0.25 && back === 0,\n        \'own character keeps full speed at \' + Math.round(lat*16.7) + \'ms latency\',\n        mean.toFixed(2) + \'/frame, \' + back + \' dragged frames\');\n}\n\n// 3. another player moves SMOOTHLY on your screen\nreset();\nfor (let i = 0; i < 60; i++) tick({ hostMove: 4 });\nconst seen = [];\nfor (let i = 0; i < 120; i++) {\n  tick({ hostMove: 4 });\n  load(GUEST); const h = remotePlayers.find(r => r._origIdx === 0); if (h) seen.push(h.x); save(GUEST);\n}\nconst st = []; for (let i = 1; i < seen.length; i++) st.push(seen[i] - seen[i-1]);\nconst t2 = st.slice(30);\nconst m2 = t2.reduce((a,b)=>a+b,0)/t2.length;\nconst sd = Math.sqrt(t2.reduce((a,b)=>a+(b-m2)*(b-m2),0)/t2.length);\ncheck(Math.abs(m2 - 4) < 0.4 && sd < 1.0, \'another player moves smoothly, not in lurches\',\n      \'mean \' + m2.toFixed(2) + \', wobble \' + sd.toFixed(2));\n\n// 4. a real disagreement is still obeyed\nreset();\nfor (let i = 0; i < 40; i++) tick();\nHOST.remotePlayers[0].y += 400;\nfor (let i = 0; i < 60; i++) tick();\nconst gap = Math.hypot(GUEST.player.x - HOST.remotePlayers[0].x, GUEST.player.y - HOST.remotePlayers[0].y);\ncheck(gap < 80, \'a teleport on the host is obeyed by the guest\', Math.round(gap) + \' units apart\');\n\n// 5. a run of dropped input does not desync\nreset();\nfor (let i = 0; i < 40; i++) tick();\nfor (let i = 0; i < 30; i++) tick({ drop: true });\nfor (let i = 0; i < 60; i++) tick();\nconst gap2 = Math.hypot(GUEST.player.x - HOST.remotePlayers[0].x, GUEST.player.y - HOST.remotePlayers[0].y);\ncheck(gap2 < 120, \'a run of dropped packets recovers\', Math.round(gap2) + \' units apart\');\n\n// 6. standing still means standing still\nreset();\nfor (let i = 0; i < 60; i++) tick();\nconst sx2 = GUEST.player.x, sy2 = GUEST.player.y;\nfor (let i = 0; i < 90; i++) tick({ idle: true });\ncheck(Math.hypot(GUEST.player.x - sx2, GUEST.player.y - sy2) < 30,\n      \'releasing the keys stops you\', Math.round(Math.hypot(GUEST.player.x - sx2, GUEST.player.y - sy2)) + \' units of drift\');\n\n// 7. bodies have mass: you ramp up and you coast to a stop\nreset();\nload(GUEST);\nkeys = { w:true }; cameraMode = \'3d\'; player.angle = 0;\nconst ramp = [];\nfor (let i = 0; i < 40; i++) { const b = player.x; mpPredictLocal(); ramp.push(+(player.x - b).toFixed(2)); }\nconst top = CLASSES[1].speed;\nconst framesToFull = ramp.findIndex(v => v > top * 0.95);\ncheck(ramp[0] < top * 0.4 && framesToFull > 3 && framesToFull < 40,\n      \'you accelerate up to speed rather than snapping to it\',\n      \'first frame \' + ramp[0] + \', full speed after \' + framesToFull + \' frames\');\nkeys = {};\nconst coast = [];\nfor (let i = 0; i < 40; i++) { const b = player.x; mpPredictLocal(); coast.push(+(player.x - b).toFixed(2)); }\nconst coasted = coast.reduce((a, b) => a + b, 0);\ncheck(coast[0] > 0 && coasted > 2 && coasted < 30,\n      \'and you coast to a stop rather than stopping dead\',\n      coasted.toFixed(1) + \' units after releasing\');\ncheck(coast[coast.length - 1] === 0, \'but you do come to a complete stop\');\nsave(GUEST);\n\n// 8. the host and the guest must integrate that velocity IDENTICALLY, or the guest rubber-bands\nconst hostBody = makeRemote(CLASSES[1], 1, \'X\', 0, 0);\nconst guestBody = makePlayer(CLASSES[1], 0, 0);\nhostBody.input = { mvx: 1, mvy: 0, speedMode: 1, keys: {} };\nlet worst = 0;\nfor (let i = 0; i < 120; i++) {\n  if (i === 60) hostBody.input = { mvx: 0, mvy: 0, speedMode: 1, keys: {} };\n  updateRemotePlayer(hostBody);\n  player = guestBody; keys = (i < 60) ? { d:true } : {}; cameraMode = \'topdown\';\n  mpPredictLocal();\n  worst = Math.max(worst, Math.abs(hostBody.x - guestBody.x));\n}\ncheck(worst < 0.001, \'host and guest integrate the same velocity to the last decimal\',\n      \'worst divergence \' + worst.toExponential(1) + \' units over 120 frames\');\n\n\n// ---- ultimate forms across the wire ----\nconsole.log(\'\');\nreset();\nload(HOST);\nconst rp0 = HOST.remotePlayers[0];\nconst guestSpeedBefore = rp0.speed;\nenterForm(rp0, \'mech\');\nconst guestSpeedInMech = rp0.speed;\nsave(HOST);\ncheck(guestSpeedInMech < guestSpeedBefore, "the host slows a guest\'s body in a mech",\n      guestSpeedBefore.toFixed(2) + \' -> \' + guestSpeedInMech.toFixed(2));\n\nfor (let i = 0; i < 60; i++) tick();\ncheck(GUEST.player._formKey === \'mech\', \'the guest is told which form it is in\', String(GUEST.player._formKey));\ncheck(Math.abs(GUEST.player.speed - guestSpeedInMech) < 0.01,\n      \'and predicts at the form speed, not its normal speed\',\n      \'guest \' + GUEST.player.speed.toFixed(2) + \' vs host \' + guestSpeedInMech.toFixed(2));\n\nlet worstGap = 0;\nfor (let i = 0; i < 120; i++) {\n  tick();\n  worstGap = Math.max(worstGap, Math.hypot(GUEST.player.x - HOST.remotePlayers[0].x, GUEST.player.y - HOST.remotePlayers[0].y));\n}\ncheck(worstGap < 90, \'a guest in a form does not drift away from its own body\',\n      Math.round(worstGap) + \' units at worst\');\n\nload(HOST);\nif (HOST.remotePlayers[0].form) { HOST.remotePlayers[0].form.t = 1; updateForm(HOST.remotePlayers[0]); }\nsave(HOST);\ncheck(!HOST.remotePlayers[0].form, "a guest\'s form ends on the host");\ncheck(Math.abs(HOST.remotePlayers[0].speed - guestSpeedBefore) < 0.001,\n      \'and every stat is put back\', HOST.remotePlayers[0].speed.toFixed(2));\n\n\n// The extremes are where a speed mismatch really shows: a fortress crawls, lightspeed sprints.\n[\'fortress\', \'lightspeed\', \'swarm\'].forEach(function(key){\n  reset();\n  load(HOST); enterForm(HOST.remotePlayers[0], key); save(HOST);\n  for (let i = 0; i < 50; i++) tick();\n  let worst = 0;\n  for (let i = 0; i < 120; i++) {\n    tick();\n    worst = Math.max(worst, Math.hypot(GUEST.player.x - HOST.remotePlayers[0].x, GUEST.player.y - HOST.remotePlayers[0].y));\n  }\n  check(worst < 90 && Math.abs(GUEST.player.speed - HOST.remotePlayers[0].speed) < 0.01,\n        \'a guest in \' + key + \' stays with its own body\',\n        \'gap \' + Math.round(worst) + \', speed \' + GUEST.player.speed.toFixed(2) + \' vs \' + HOST.remotePlayers[0].speed.toFixed(2));\n});\n\n// A timer that only ticks in the local-player path never expires for a guest.\nreset();\nload(HOST);\nconst nerd = HOST.remotePlayers[0];\nnerd.gsCrit = 0; nerd._nerdCrit = 5;\nfor (let i = 0; i < 10; i++) tickPlayerTimers(nerd);\nsave(HOST);\ncheck((nerd._nerdCrit || 0) === 0, "a guest\'s temporary buffs count down on the host",\n      \'_nerdCrit \' + (nerd._nerdCrit || 0));\n\n// Every class must survive being a REMOTE body, including the new ones and the melee Ninja.\nconst remoteFails = (function(){\n  const bad = [];\n  CLASSES.forEach(function(c){\n    try {\n      const rp = makeRemote(c, 1, \'X\', 100, 100);\n      rp.input = { mvx: 1, mvy: 0, speedMode: 1, keys: {} };\n      for (let f = 0; f < 30; f++) updateRemotePlayer(rp);\n      if (!isFinite(rp.x) || !isFinite(rp.y)) bad.push(c.name + \': position went non-finite\');\n    } catch (e) { bad.push(c.name + \': \' + e.message); }\n  });\n  return bad;\n})();\ncheck(remoteFails.length === 0, \'every class works as somebody else on your screen\',\n      remoteFails.length ? remoteFails.slice(0,3).join(\' | \') : CLASSES.length + \' classes\');\n\n' + GOJO_TESTS + 'console.log(\'\\n\' + (ok ? \'MULTIPLAYER PASS\' : \'MULTIPLAYER FAIL\'));\nprocess.exit(ok ? 0 : 1);\n';

const sandbox = { console, process, Math, JSON, Date, Object, Array, String, Number, Boolean, Map, Set,
                  Proxy, isFinite, isNaN, parseInt, parseFloat, Float32Array };
sandbox.globalThis = sandbox;
vm.runInNewContext(TUNING + '\n' + formsSrc + '\n' + HARNESS + '\n' + game + '\n' + TESTS,
                   vm.createContext(sandbox), { filename: 'mp.js' });
