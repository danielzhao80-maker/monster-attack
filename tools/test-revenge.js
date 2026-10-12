// The ☠️ Reaper boss and the Revenge challenge.
//   - the Reaper is a walking, hooded, scythe-carrying PERSON in 3D (legs, arms, skull, hood, scythe)
//     and in the 2D views, with its mechanics untouched;
//   - dying to it arms monster_city_revenge; the next run that kills it grants the arcade title
//     'revenge' (daniels-arcade-v1); ending that run any other way spends the chance.
// Usage: node tools/test-revenge.js index.html
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
const __timers = [];   // setTimeout QUEUES, so the second of two messages can be checked
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
  setTimeout:(f)=>{ if (typeof f === 'function') __timers.push(f); return 1; }, clearTimeout:()=>{}, setInterval:()=>1, clearInterval:()=>{},
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

function q(js){ return vm.runInNewContext(js, ctx, {filename:'game.js', timeout:15000}); }
let ok = true;
function check(pass,label,extra){ if(!pass) ok=false; console.log('  '+(pass?'PASS':'FAIL'),label+(extra?'  ('+extra+')':'')); }
function flushTimers(){ const q2 = __timers.splice(0); for (const f of q2) { try { f(); } catch (e) {} } }

// ---------------------------------------------------------------- a tiny real THREE
// The load stub answers everything with a proxy, so nothing it builds can be inspected. This fake
// keeps the scene graph — children, userData, positions — which is all the assertions need.
q(`
  (function(){
    function V3(x,y,z){ this.x=x||0; this.y=y||0; this.z=z||0; }
    V3.prototype.set = function(x,y,z){ this.x=x; this.y=y; this.z=z; return this; };
    V3.prototype.setScalar = function(s){ this.x=this.y=this.z=s; return this; };
    function Obj(){ this.position=new V3(); this.rotation=new V3(); this.scale=new V3(1,1,1);
                    this.children=[]; this.userData={}; this.parent=null; this.visible=true; }
    Obj.prototype.add = function(c){ this.children.push(c); c.parent=this; return this; };
    Obj.prototype.remove = function(c){ var i=this.children.indexOf(c); if(i>=0) this.children.splice(i,1); c.parent=null; return this; };
    Obj.prototype.traverse = function(f){ f(this); this.children.forEach(function(c){ c.traverse(f); }); };
    Obj.prototype.lookAt = function(){}; Obj.prototype.rotateX = function(){};
    function Mesh(g, m){ Obj.call(this); this.geometry=g; this.material=m; this.isMesh=true; }
    Mesh.prototype = Object.create(Obj.prototype);
    function Mat(o){ o = o || {}; for (var k in o) this[k]=o[k]; this.userData={};
                     this.emissive={ value:o.emissive, setHex:function(){} }; this.color={ setHex:function(){} }; }
    function Geo(){ this.userData={}; this.args=[].slice.call(arguments); }
    function Col(){ } Col.prototype.lerp = function(){ return this; };
    var known = { Group:Obj, Object3D:Obj, Mesh:Mesh, MeshStandardMaterial:Mat, MeshBasicMaterial:Mat,
                  Vector3:V3, Color:Col, DoubleSide:2 };
    __THREE_REAL = THREE;
    __THREE_FAKE = new Proxy(known, { get:function(t,k){ return (k in t) ? t[k] : Geo; } });
  })();
`);
function withThree(js) { return q(`(function(){ THREE = __THREE_FAKE; try { return (function(){ ${js} })(); } finally { THREE = __THREE_REAL; } })()`); }

console.log('\nthe Reaper looks like the Grim Reaper:\n');
check(q(`MONSTER_CLASSES.find(function(c){return c.name==='Reaper';}).body`) === 'reaper', 'the Reaper has its own body plan', 'reaper');
check(q(`(function(){ var c = MONSTER_CLASSES.find(function(c){return c.name==='Reaper';});
          return c.phasing && c.teleports && c.canScream && c.hp===38 && c.damage===15 && c.speed===1.25 && c.isBossOnly && c.habitat==='graveyard'; })()`) === true,
      'its mechanics are untouched (phasing, blinks, scream, HP, damage)');
check(q(`MONSTER_CLASSES.filter(function(c){return c.body==='wraith';}).length`) >= 5, "the other ghosts still use 'wraith'");

const built = withThree(`
  var g = makeBossMesh({ name:'BOSS Reaper', body:'reaper', r:32, color:'#00ffe0', isBoss:true });
  if (!g) return 'no mesh';
  var R = g.userData.reaper || {};
  var meshes = 0; g.traverse(function(o){ if (o.isMesh) meshes++; });
  var legKids = (R.legs||[]).map(function(l){ return l.children.length; });
  var armKids = (R.arms||[]).map(function(a){ return a.children.length; });
  var footY = (R.legs||[]).map(function(l){ return l.position.y; });
  return JSON.stringify({ legs:(R.legs||[]).length, arms:(R.arms||[]).length, head:!!R.head, hood:!!R.hood,
    scythe: R.scythe ? R.scythe.children.length : 0, scytheInHand: !!(R.scythe && R.arms && R.scythe.parent === R.arms[1]),
    legKids:legKids, armKids:armKids, meshes:meshes, headIsUserHead: g.userData.head === R.head,
    headOwnMat: !!(R.head && R.head.material && !R.head.material.userData.shared),
    anim: g.userData.legs === R.legs && g.userData.arms === R.arms, hp: !!g.userData.hpBar, baseR: g.userData.baseR });
`);
let B = {};
try { B = JSON.parse(built); } catch (e) { B = {}; }
check(B.legs === 2 && B.legKids.every(n => n >= 4), 'two legs, each with thigh, shin and a bony foot', built);
check(B.arms === 2 && B.armKids.every(n => n >= 4), 'two arms with sleeves and skeletal hands');
check(B.head && B.hood, 'a skull head inside a hood');
check(B.scythe >= 10 && B.scytheInHand, 'a scythe with a curved blade, held in the right hand', B.scythe + ' parts');
check(B.anim, 'the legs and arms are exposed to the renderer so they can swing');
check(B.headIsUserHead && B.headOwnMat, 'the skull takes the hit flash, on a material of its own');
check(B.hp && B.baseR === 32, 'same boss scale and health-bar contract as every other boss');
check(B.meshes > 40, 'built from many parts, not a capsule', B.meshes + ' meshes');
check(withThree(`var g = makeMonsterMesh({ name:'BOSS Reaper', isBoss:true, r:32, color:'#00ffe0' }); return !!(g && g.userData.reaper);`) === true,
      'a Reaper with no body field (a guest\'s copy) still finds its body by name');
check(withThree(`var g = makeBossMesh({ name:'BOSS Tomb Wraith', body:'wraith', r:32, color:'#a29bfe', isBoss:true }); return !!(g && !g.userData.legs);`) === true,
      "a 'wraith' boss still builds its floating ghost");
check(/const _legs = mesh\.userData\.legs;/.test(code) && /_legs\[k\]\.rotation\.x = sw/.test(code), 'the renderer swings the legs as it walks');

// ---------------------------------------------------------------- 2D
console.log('\nthe Reaper in 2D:\n');
const c2 = _els.game.getContext('2d');
let calls = 0;
for (const k of ['fill','stroke','fillRect','arc','ellipse','quadraticCurveTo','lineTo']) { const f = c2[k]; c2[k] = function(){ calls++; return f.apply(this, arguments); }; }
const twoD = q(`(function(){ try {
   drawReaper2D(200, 200, 32, null, '#00ffe0');
   drawReaper2D(200, 200, 32, '#ffffff', '#00ffe0');
   return 'ok'; } catch (e) { return e.message; } })()`);
check(twoD === 'ok' && calls > 40, 'drawReaper2D draws without throwing', calls + ' draw calls');
const inGame = q(`(function(){ try {
   chosenClass = CLASSES[0]; playerName = 'RevengeTest'; gameRunning = false; startGame();
   var out = [];
   ['topdown','thirdperson'].forEach(function(mode){
     cameraMode = mode;
     monsters = [{ x: player.x + 60, y: player.y, r: 32, hp: 100, maxHp: 200, name:'BOSS Reaper', emoji:'☠️', color:'#00ffe0',
                   isBoss:true, phasing:true, hitFlash:0, frozen:0, stunned:0, slow:0, swallowed:0, riseT:1 }];
     draw(); monsters[0].hitFlash = 3; draw();
     out.push(mode);
   });
   return out.join(','); } catch (e) { return 'THREW ' + e.message; } })()`);
check(inGame === 'topdown,thirdperson', 'the game draws a live Reaper boss in top-down and third-person', inGame);

// ---------------------------------------------------------------- Revenge
console.log('\nrevenge:\n');
const REC = () => q(`localStorage.getItem('monster_city_revenge')`);
const ARC = () => { try { return JSON.parse(q(`localStorage.getItem('daniels-arcade-v1')`) || '{}'); } catch (e) { return {}; } };
const STATUS = () => q(`document.getElementById('status-overlay').textContent`);
function newRun() { q(`chosenClass = CLASSES[0]; gameRunning = false; startGame(); cheats.godMode = false;
  player.petDodge = 0; player.gsDef = 0; player.reviveUsed = true; player.possessing = null;
  player.cls = Object.assign({}, player.cls, { canRevive:false, dodgeChance:0, hasPlayerShield:false, reflectEvery:0 });
  waveIntroTimer = 0;   // the wave banner holds the world still for two seconds`); }
function reaper(extra) { return `{ x: player.x, y: player.y, r: 32, hp: 10, maxHp: 10, name:'BOSS Reaper', emoji:'☠️', color:'#00ffe0',
   isBoss:true, phasing:true, teleports:false, canScream:false, damage: 99999, speed:0, score:1, hitFlash:0, frozen:0, stunned:0,
   slow:0, swallowed:0, riseT:1, teleportTimer:999, screamCooldown:999 ${extra||''} }`; }
function killReaper() { q(`monsters = [${reaper()}]; hitMonster(monsters[0], 0, 1e9);`); }

q(`localStorage.removeItem('monster_city_revenge'); localStorage.removeItem('daniels-arcade-v1');`);
// 1. the Reaper's touch kills you — through the real monster loop, not a hand-made call
newRun();
q(`monsters = [${reaper()}]; player.hp = 5; player.invincible = 0; player.teleporting = 0; player.invisible = false; update();`);
let rec = null; try { rec = JSON.parse(REC()); } catch (e) {}
check(q(`gameRunning`) === false && rec && rec.boss === 'Reaper' && rec.armed === true && typeof rec.at === 'number' && !rec.runId,
      'dying to the Reaper arms the record', REC());
check(/Reaper got you/.test(STATUS()), 'and says so', STATUS());
flushTimers();
check(/REVENGE/.test(STATUS()), 'then tells you to beat it next match', STATUS());

// a Reaper's SHOT can be the killing blow too
q(`localStorage.removeItem('monster_city_revenge');`);
newRun();
q(`monsters = []; player.hp = 3; player.invincible = 0; player.teleporting = 0;
   bullets = [{ x: player.x, y: player.y, vx: 0, vy: 0, life: 30, damage: 50, owner:'monster', from:'BOSS Reaper', color:'#9b59b6' }];
   update();`);
check(/"armed":true/.test(REC() || ''), "a Reaper's blink-shot that kills you arms it too", REC());

// 2. next run: kill it → revenge
newRun();
try { rec = JSON.parse(REC()); } catch (e) { rec = null; }
check(rec && rec.runId, 'the next run claims the chance', REC());
__timers.length = 0;
killReaper();
const a1 = ARC();
check(Array.isArray(a1.owned) && a1.owned.includes('revenge') && a1.equipped && a1.equipped.title === 'revenge',
      "killing the Reaper grants 'revenge' into the daniels-arcade-v1 owned list (and equips it)", JSON.stringify(a1));
check(/REVENGE!/.test(STATUS()), 'with a big REVENGE banner', STATUS());
flushTimers();
check(/Title unlocked/.test(STATUS()), 'then the unlock message', STATUS());
check(REC() === null, 'and the record is cleared');

// the arcade shop's own update() is used when it is on the page
q(`localStorage.removeItem('daniels-arcade-v1'); __asCalls = 0;
   window.ArcadeShop = { update: function(fn){ __asCalls++; var s = JSON.parse(localStorage.getItem('daniels-arcade-v1') || '{"owned":["rookie"],"equipped":{"title":"rookie"}}');
     fn(s); localStorage.setItem('daniels-arcade-v1', JSON.stringify(s)); return s; } };
   localStorage.setItem('monster_city_revenge', JSON.stringify({ boss:'Reaper', armed:true, at: Date.now() }));`);
newRun(); killReaper();
check(q(`__asCalls`) === 1 && ARC().owned.includes('rookie') && ARC().owned.includes('revenge'), 'ArcadeShop.update is used when present, keeping what you own', JSON.stringify(ARC()));
q(`delete window.ArcadeShop;`);

// 3. already own it → REVENGE, but no unlock message
q(`localStorage.setItem('monster_city_revenge', JSON.stringify({ boss:'Reaper', armed:true, at: Date.now() }));`);
newRun(); __timers.length = 0; killReaper();
const s1 = STATUS(); flushTimers(); const s2 = STATUS();
check(/REVENGE!/.test(s1) && !/Title unlocked/.test(s2), 'already owning the title: REVENGE, but no unlock line', s1 + ' / ' + s2);

// 4. a run that ends without killing it → the chance is gone
q(`localStorage.setItem('monster_city_revenge', JSON.stringify({ boss:'Reaper', armed:true, at: Date.now() }));`);
newRun();
q(`player._lastHitBy = 'BOSS Bone Colossus'; gameOver();`);
check(REC() === null, 'a run that ends (game over) without killing it clears the record', REC());
q(`localStorage.setItem('monster_city_revenge', JSON.stringify({ boss:'Reaper', armed:true, at: Date.now() }));`);
newRun(); q(`leaveToMenu();`);
check(REC() === null, 'so does quitting to the menu', REC());
q(`localStorage.removeItem('daniels-arcade-v1');`);
newRun(); killReaper();
check(!(ARC().owned || []).includes('revenge'), 'and a later Reaper kill no longer counts');

// 5. no record → nothing special
q(`localStorage.removeItem('monster_city_revenge'); localStorage.removeItem('daniels-arcade-v1');`);
newRun(); q(`document.getElementById('status-overlay').textContent = '';`); killReaper();
check(!(ARC().owned || []).includes('revenge') && !/REVENGE/.test(STATUS()) && REC() === null,
      'killing the Reaper without an armed record does nothing special', STATUS());

// 6. another boss's kill does not arm it
newRun();
q(`monsters = [${reaper(", name:'BOSS Bone Colossus'")}]; player.hp = 5; player.invincible = 0; player.teleporting = 0; update();`);
check(q(`gameRunning`) === false && REC() === null, 'a death to a different boss does not arm it', REC());
newRun();
q(`player._lastHitBy = null; gameOver();`);
check(REC() === null, 'nor does a death with no killer');

// 7. dying to the Reaper AGAIN in the revenge run re-arms it for the following match
q(`localStorage.setItem('monster_city_revenge', JSON.stringify({ boss:'Reaper', armed:true, at: 1 }));`);
newRun();
q(`monsters = [${reaper()}]; player.hp = 5; player.invincible = 0; player.teleporting = 0; update();`);
try { rec = JSON.parse(REC()); } catch (e) { rec = null; }
check(rec && rec.armed && !rec.runId && rec.at > 1, 'dying to the Reaper again in that run re-arms it', REC());

// 8. a guest claims it from the host's boss-kill event (guests never run hitMonster themselves)
q(`localStorage.removeItem('daniels-arcade-v1');
   localStorage.setItem('monster_city_revenge', JSON.stringify({ boss:'Reaper', armed:true, at: Date.now() }));`);
newRun();
q(`mpHandleEvent({ t:'event', type:'kill', boss:true, name:'BOSS Reaper' });`);
check((ARC().owned || []).includes('revenge') && REC() === null, "a guest gets Revenge from the host's kill event", JSON.stringify(ARC()));

console.log('\n' + (ok ? 'REVENGE PASS' : 'REVENGE FAIL'));
process.exit(ok ? 0 : 1);
