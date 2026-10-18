// Summons look like what they are. Every ally used to be drawn as the same skeleton — the Beast
// Tamer's wolves looked like little people, the Gangster crew and the Ninja's clones like the
// Necromancer's undead. This checks:
//   1. every ability that summons stamps a `kind`, and the right one (wolves are wolves, ...);
//   2. each kind has its own 3D builder with its expected parts, from the shared material pool,
//      no lights, standing on a green friendly ring; turrets have a barrel on a head that turns;
//      walls are brick or riveted steel;
//   3. the 2D drawing runs for every kind (and walls/turrets) without throwing, and draws something;
//   4. summons BEHAVE exactly as before: positions, stats, damage dealt, recorded from the version
//      before the look change, with a seeded RNG.
// Usage: node tools/test-summons-look.js index.html
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
  setTimeout:(fn)=>{ if(typeof fn==='function') sandbox.__deferred.push(fn); return 1; }, __deferred: [],
  clearTimeout:()=>{}, setInterval:()=>1, clearInterval:()=>{},
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
try { vm.runInNewContext(code, ctx, { filename:'game.js', timeout:20000 }); }
catch (e) { console.log('FAILED during LOAD: ' + e.message); process.exit(1); }
console.log('load        : OK');
function q(js){ return vm.runInNewContext(js, ctx, {filename:'game.js', timeout:60000}); }
let ok = true;
function check(pass,label,extra){ if(!pass) ok=false; console.log('  '+(pass?'PASS':'FAIL'),label+(extra?'  ('+extra+')':'')); }

// ---------- 4. behaviour probe (same script that produced BASELINE from the pre-change game) ----------
var PROBE = `(function(){
  var seed = 12345; Math.random = function(){ seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  var r2 = function(v){ return Math.round(v * 100) / 100; };
  var mech = function(){
    return JSON.stringify({
      a: allies.map(function(a){ return [r2(a.x), r2(a.y), a.r, r2(a.speed), a.damage, a.hp, a.maxHp, a.life, a.decoy ? 1 : 0]; }),
      t: turrets.map(function(t){ return [r2(t.x), r2(t.y), t.r, t.hp, t.maxHp, t.ammo]; }),
      w: walls.map(function(w){ return [r2(w.x), r2(w.y), w.hp]; }),
      m: monsters.map(function(m){ return [r2(m.x), r2(m.y), m.hp]; }) });
  };
  chosenClass = CLASSES[0]; gameRunning = false; cameraMode = 'topdown'; startGame(); gameRunning = true;
  function setup(c){
    // Reseeded per ability, so a change to one class's moves (how many random numbers it draws)
    // cannot shift every class probed after it.
    seed = 12345;
    chosenClass = c; player = createPlayer();
    player.x = 4500; player.y = 2750; player.angle = 0; player.charLevel = 3;
    player.moveZUnlocked = true; player.moveXUnlocked = true;
    player._eCd = 0; player.moveQCooldown = 0; player.moveFCooldown = 0;
    bullets=[]; allies=[]; turrets=[]; walls=[]; fireTiles=[]; poisonTiles=[]; particles=[]; pickups=[];
    buildings = []; monsters = [];
    for (var i=0;i<5;i++) monsters.push({ x:4500+160+i*18, y:2750+i*9, r:14, hp:4000, maxHp:4000,
       name:'Zombie', emoji:'Z', color:'#7bed9f', speed:0, frozen:0, stunned:0, slow:0, score:10 });
    return player;
  }
  function flush(){ for (var g = 0; g < 6 && __deferred.length; g++) { var b = __deferred.splice(0); b.forEach(function(f){ try { f(); } catch(e){} }); } }
  // Only the summon / ally / turret pass of the update loop: freeze everything else so the result
  // depends on the summons alone.
  function tickSummons(n){
    for (var k = 0; k < n; k++) {
      for (var i = allies.length-1; i >= 0; i--) {
        var a = allies[i]; a.life--;
        if (a.life <= 0 || a.hp <= 0) { allies.splice(i, 1); continue; }
        var target = null, td = Infinity;
        for (var j = 0; j < monsters.length; j++) { var m = monsters[j]; var d = Math.hypot(m.x-a.x, m.y-a.y); if (d < td) { target = m; td = d; } }
        if (target) {
          var ang = Math.atan2(target.y - a.y, target.x - a.x);
          a.x += Math.cos(ang) * a.speed; a.y += Math.sin(ang) * a.speed;
          if (a.atkCd > 0) a.atkCd--;
          if (td < a.r + target.r + 3 && a.atkCd <= 0) { target.hp -= a.damage; a.atkCd = 30; a.life -= 30; }
        }
      }
    }
  }
  var out = {};
  CLASSES.forEach(function(c){
    ['e','z','x'].forEach(function(slot){
      var p = setup(c);
      try {
        if (slot === 'e') useAbility(p, 4700, 2750);
        else if (slot === 'z') useMoveQ(p, 4700, 2750);
        else useMoveF(p, 4700, 2750);
      } catch (e) {}
      flush();
      if (p.form) for (var t = 0; t < 130; t++) { try { updateForm(p); } catch(e){} }
      if (!allies.length && !turrets.length && !walls.length) return;
      tickSummons(90);
      out[c.name + ':' + slot] = mech();
    });
  });
  // Necromancer passive: a kill rises.
  var p = setup(CLASSES.find(function(c){ return c.name === 'Necromancer'; }));
  monsters[0].hp = 1; try { hitMonster(monsters[0], 0, 50); } catch(e){}
  tickSummons(40); out['necro-kill'] = mech();
  // Shadow pet summon
  p = setup(CLASSES[0]);
  try { petSummon('Shadow', p, 3); } catch(e){}
  tickSummons(40); out['pet-shadow'] = mech();
  return JSON.stringify(out);
})()`;
// Recorded from index.html BEFORE summons got their own looks. Any change here is a mechanics change.
// Re-recorded from that same pre-change game with the RNG reseeded per ability (see setup), so one
// class's moves drawing more or fewer random numbers cannot shift every class probed after it.
// Admin:e is the one exception: All In One fires every class's Z, including Gojo's Blue, which now
// pulls monsters in over three seconds instead of teleporting them — its monster column is new.
const BASELINE = {"Gangster Captain:e":"{\"a\":[[4660.57,2749.89,11,2,4,30,30,450,0],[4628.42,2746.79,11,2,4,30,30,510,0]],\"t\":[],\"w\":[],\"m\":[[4660,2750,3992],[4678,2759,4000],[4696,2768,4000],[4714,2777,4000],[4732,2786,4000]]}","Gangster Captain:x":"{\"a\":[[4636.16,2745.92,10,1.6,3,20,20,480,0],[4617.21,2746.39,10,1.6,3,20,20,510,0]],\"t\":[],\"w\":[],\"m\":[[4660,2750,3997],[4678,2759,4000],[4696,2768,4000],[4714,2777,4000],[4732,2786,4000]]}","Builder:e":"{\"a\":[],\"t\":[],\"w\":[[4540,2750,3]],\"m\":[[4660,2750,4000],[4678,2759,4000],[4696,2768,4000],[4714,2777,4000],[4732,2786,4000]]}","Builder:z":"{\"a\":[],\"t\":[],\"w\":[[4555,2750,3],[4538.89,2788.89,3],[4500,2805,3],[4461.11,2788.89,3],[4445,2750,3],[4461.11,2711.11,3],[4500,2695,3],[4538.89,2711.11,3]],\"m\":[[4660,2750,4000],[4678,2759,4000],[4696,2768,4000],[4714,2777,4000],[4732,2786,4000]]}","Builder:x":"{\"a\":[],\"t\":[],\"w\":[[4570,2750,5],[4549.5,2799.5,5],[4500,2820,5],[4450.5,2799.5,5],[4430,2750,5],[4450.5,2700.5,5],[4500,2680,5],[4549.5,2700.5,5],[4488.65,2819.07,4],[4556.41,2791.45,4],[4562.52,2718.52,4]],\"m\":[[4660,2750,4000],[4678,2759,4000],[4696,2768,4000],[4714,2777,4000],[4732,2786,4000]]}","Ninja:e":"{\"a\":[[4657.23,2749.1,10,3.4,10,22,22,390,0],[4657.23,2750.9,10,3.4,10,22,22,390,0]],\"t\":[],\"w\":[],\"m\":[[4660,2750,3960],[4678,2759,4000],[4696,2768,4000],[4714,2777,4000],[4732,2786,4000]]}","Ninja:x":"{\"a\":[[4658.33,2750.15,10,1.6,6,20,20,480,0],[4623.38,2747.26,10,1.6,6,20,20,510,0]],\"t\":[],\"w\":[],\"m\":[[4660,2750,3994],[4678,2759,4000],[4696,2768,4000],[4714,2777,4000],[4732,2786,4000]]}","Beast Tamer:e":"{\"a\":[[4658.23,2750.31,11,3.2,9,34,34,720,0],[4663.09,2749.38,11,3.2,9,34,34,750,0],[4662.55,2750.86,11,3.2,9,34,34,750,0]],\"t\":[],\"w\":[],\"m\":[[4660,2750,3937],[4678,2759,4000],[4696,2768,4000],[4714,2777,4000],[4732,2786,4000]]}","Beast Tamer:x":"{\"a\":[[4658.33,2750.15,10,1.6,5,20,20,480,0],[4623.38,2747.26,10,1.6,5,20,20,510,0]],\"t\":[],\"w\":[],\"m\":[[4660,2750,3995],[4678,2759,4000],[4696,2768,4000],[4714,2777,4000],[4732,2786,4000]]}","Mirror Knight:e":"{\"a\":[[4624,2750,13,0.6,7,70,70,570,1]],\"t\":[],\"w\":[],\"m\":[[4660,2750,4000],[4678,2759,4000],[4696,2768,4000],[4714,2777,4000],[4732,2786,4000]]}","Admin:e":"{\"a\":[[4662.66,2751.65,10,3,8,15,15,480,0],[4663.78,2750.71,10,3,8,15,15,480,0]],\"t\":[[4530.6,2852.84,10,20,20,18]],\"w\":[[4555,2750,3],[4527.5,2797.63,3],[4472.5,2797.63,3],[4445,2750,3],[4472.5,2702.37,3],[4527.5,2702.37,3],[4551.41,2873.6,3],[4535.3,2912.49,3],[4496.41,2928.6,3],[4457.52,2912.49,3],[4441.41,2873.6,3],[4457.52,2834.71,3],[4496.41,2818.6,3],[4535.3,2834.71,3]],\"m\":[[4664.65,2750,3804],[4682.51,2757.15,3820],[4697.07,2763.17,3820],[4711.8,2772.75,3820],[4728.98,2782.6,3960]]}","The Iron:z":"{\"a\":[],\"t\":[],\"w\":[[4555,2750,3],[4527.5,2797.63,3],[4472.5,2797.63,3],[4445,2750,3],[4472.5,2702.37,3],[4527.5,2702.37,3]],\"m\":[[4660,2750,4000],[4678,2759,4000],[4696,2768,4000],[4714,2777,4000],[4732,2786,4000]]}","Necromancer:e":"{\"a\":[[4660.8,2750,10,1.8,6,25,25,630,0],[4626.26,2759.23,10,1.8,6,25,25,690,0],[4626.26,2740.77,10,1.8,6,25,25,690,0]],\"t\":[],\"w\":[],\"m\":[[4660,2750,3988],[4678,2759,4000],[4696,2768,4000],[4714,2777,4000],[4732,2786,4000]]}","Necromancer:z":"{\"a\":[[4657.37,2750.2,10,3,8,15,15,450,0],[4660.69,2750.09,10,3,8,15,15,450,0]],\"t\":[],\"w\":[],\"m\":[[4660,2750,3968],[4678,2759,4000],[4696,2768,4000],[4714,2777,4000],[4732,2786,4000]]}","Necromancer:x":"{\"a\":[[4658.33,2750.15,10,1.6,5,20,20,480,0],[4623.38,2747.26,10,1.6,5,20,20,510,0]],\"t\":[],\"w\":[],\"m\":[[4660,2750,3995],[4678,2759,4000],[4696,2768,4000],[4714,2777,4000],[4732,2786,4000]]}","Mind Swapper:x":"{\"a\":[[4657.54,2750.51,10,1.6,5,20,20,480,0],[4655.67,2749.67,10,1.6,5,20,20,480,0]],\"t\":[],\"w\":[],\"m\":[[4660,2750,3971],[4678,2759,3981],[4696,2768,3981],[4714,2777,4000],[4732,2786,4000]]}","Machine:e":"{\"a\":[],\"t\":[[4700,2750,14,60,60,60]],\"w\":[],\"m\":[[4660,2750,4000],[4678,2759,4000],[4696,2768,4000],[4714,2777,4000],[4732,2786,4000]]}","Machine:z":"{\"a\":[],\"t\":[[4540,2750,10,20,20,18]],\"w\":[],\"m\":[[4660,2750,4000],[4678,2759,4000],[4696,2768,4000],[4714,2777,4000],[4732,2786,4000]]}","Machine:x":"{\"a\":[],\"t\":[[4550,2750,12,30,30,30],[4500,2800,12,30,30,30],[4450,2750,12,30,30,30],[4500,2700,12,30,30,30]],\"w\":[],\"m\":[[4660,2750,4000],[4678,2759,4000],[4696,2768,4000],[4714,2777,4000],[4732,2786,4000]]}","necro-kill":"{\"a\":[[4660,2750,10,0,8,15,15,500,0]],\"t\":[],\"w\":[],\"m\":[[4678,2759,3984],[4696,2768,4000],[4714,2777,4000],[4732,2786,4000]]}","pet-shadow":"{\"a\":[[4627.82,2754.07,9,2.6,10,20,20,560,0]],\"t\":[],\"w\":[],\"m\":[[4660,2750,4000],[4678,2759,4000],[4696,2768,4000],[4714,2777,4000],[4732,2786,4000]]}"};

// Run the behaviour probe FIRST, on a freshly loaded game, exactly as the baseline was recorded.
const now = JSON.parse(q(PROBE));
if (process.env.DUMP_SUMMONS) { console.log('DUMP ' + JSON.stringify(now)); }

// ---------- fake THREE that remembers what it builds ----------
q(`
  var __FT = (function(){
    function V(){ return { x:0, y:0, z:0, set: function(x,y,z){ this.x=x; this.y=y; this.z=z; }, setScalar: function(s){ this.x=this.y=this.z=s; }, copy: function(){} }; }
    function Obj(){ this.position = V(); this.rotation = { x:0, y:0, z:0 }; this.scale = V(); this.userData = {}; this.name = ''; this.children = []; }
    Obj.prototype.add = function(m){ this.children.push(m); return this; };
    Obj.prototype.traverse = function(f){ f(this); this.children.forEach(function(c){ c.traverse ? c.traverse(f) : f(c); }); };
    function Group(){ Obj.call(this); }
    Group.prototype = Object.create(Obj.prototype);
    function Mesh(geo, mat){ Obj.call(this); this.geometry = geo; this.material = mat; this.isMesh = true; }
    Mesh.prototype = Object.create(Obj.prototype);
    function Mat(o){ Object.assign(this, o || {}); this.userData = {}; }
    Mat.prototype.clone = function(){ var c = new Mat(this); c.userData = Object.assign({}, this.userData); ft.clones++; return c; };
    function Geo(){ this.userData = {}; this.args = [].slice.call(arguments); }
    var ft = { Group: Group, Mesh: Mesh, MeshStandardMaterial: Mat, MeshBasicMaterial: Mat,
      SphereGeometry: Geo, BoxGeometry: Geo, CylinderGeometry: Geo, ConeGeometry: Geo, TorusGeometry: Geo,
      CircleGeometry: Geo, PlaneGeometry: Geo, CapsuleGeometry: Geo, OctahedronGeometry: Geo,
      DodecahedronGeometry: Geo, RingGeometry: Geo, RepeatWrapping: 1000, SRGBColorSpace: 'srgb',
      lights: 0, clones: 0 };
    ft.CanvasTexture = function(c){ this.image = c; this.userData = {}; };
    ft.PointLight = ft.SpotLight = function(){ ft.lights++; Obj.call(this); };
    return ft;
  })();
  var __realTHREE = THREE;
  function __withFake(fn){ THREE = __FT; try { return fn(); } finally { THREE = __realTHREE; } }
  _pfMat.clear(); _swatCamoCache.clear(); _geoCache.clear();
`);

// ---------- 1. every summoning ability stamps the right kind ----------
console.log('\n1. summons are tagged with what they are:\n');
const kinds = JSON.parse(q(`(function(){
  chosenClass = CLASSES[0]; gameRunning = false; cameraMode = 'topdown'; startGame(); gameRunning = true;
  function setup(c){
    chosenClass = c; player = createPlayer(); player.x = 4500; player.y = 2750; player.angle = 0; player.charLevel = 3;
    player.moveZUnlocked = true; player.moveXUnlocked = true; player._eCd = 0; player.moveQCooldown = 0; player.moveFCooldown = 0;
    bullets=[]; allies=[]; turrets=[]; walls=[]; buildings=[]; monsters=[{ x:4700, y:2750, r:14, hp:4000, maxHp:4000, name:'Zombie', color:'#7bed9f', speed:0 }];
    return player;
  }
  var out = {};
  CLASSES.forEach(function(c){ ['e','z','x'].forEach(function(slot){
    var p = setup(c);
    try { if (slot==='e') useAbility(p,4700,2750); else if (slot==='z') useMoveQ(p,4700,2750); else useMoveF(p,4700,2750); } catch(e){}
    for (var g=0; g<6 && __deferred.length; g++) __deferred.splice(0).forEach(function(f){ try{f();}catch(e){} });
    if (p.form) for (var t=0;t<130;t++) updateForm(p);
    var ks = {};
    allies.forEach(function(a){ ks['a:' + a.kind] = 1; });
    turrets.forEach(function(t){ ks['t:' + t.kind] = 1; });
    walls.forEach(function(w){ ks['w:' + w.kind] = 1; });
    if (Object.keys(ks).length) out[c.name + ':' + slot] = Object.keys(ks).sort().join(',');
  }); });
  var p = setup(CLASSES.find(function(c){ return c.name === 'Necromancer'; }));
  monsters[0].hp = 1; hitMonster(monsters[0], 0, 50);
  out['necro-kill'] = allies.map(function(a){ return 'a:' + a.kind; }).join(',');
  p = setup(CLASSES[0]); petSummon('Shadow', p, 3);
  out['pet-shadow'] = allies.map(function(a){ return 'a:' + a.kind; }).join(',');
  return JSON.stringify(out);
})()`));
const want = {
  'Beast Tamer:e': 'a:wolf', 'Beast Tamer:x': 'a:wolf', 'Gangster Captain:e': 'a:gangster', 'Gangster Captain:x': 'a:gangster',
  'Ninja:e': 'a:clone', 'Ninja:x': 'a:clone', 'Mind Swapper:x': 'a:clone', 'Mirror Knight:e': 'a:decoy',
  'Necromancer:e': 'a:skeleton', 'Necromancer:z': 'a:skeleton', 'Necromancer:x': 'a:skeleton', 'necro-kill': 'a:skeleton',
  'pet-shadow': 'a:ghost', 'Machine:e': 't:turret', 'Machine:z': 't:turret', 'Machine:x': 't:turret',
  'Builder:e': 'w:brick', 'Builder:z': 'w:brick', 'Builder:x': 'w:brick', 'The Iron:z': 'w:iron',
};
for (const k of Object.keys(want)) check(kinds[k] === want[k], k + ' summons ' + want[k].slice(2), kinds[k] || 'nothing');
const untagged = Object.entries(kinds).filter(([k, v]) => /undefined/.test(v));
check(untagged.length === 0, 'no summon anywhere is left without a kind', untagged.map(e => e.join('=')).join(' ') || Object.keys(kinds).length + ' sources');
check(q(`summonKind({}) === 'skeleton' && summonKind({kind:'nope'}) === 'skeleton'`) === true,
      'an old save / unknown kind falls back to the skeleton look');

// ---------- 2. 3D builders ----------
console.log('\n2. each kind has its own 3D body:\n');
const need3D = {
  skeleton: { skull: 1, rib: 3, spine: 1, leg: 2, arm: 2, eye: 2, jaw: 1 },
  wolf:     { leg: 4, tail: 1, snout: 1, ear: 2, head: 1, body: 1, paw: 4 },
  clone:    { helmet: 1, visor: 1, vest: 1, boot: 2 },
  decoy:    { helmet: 1, vest: 1, mirror: 1 },
  gangster: { fedora: 2, tie: 1, gun: 3, suit: 1, leg: 2 },
  ghost:    { sheet: 2, eye: 2, tail: 5 },
};
const built = JSON.parse(q(`__withFake(function(){
  var out = {}, sigs = {};
  SUMMON_KINDS.forEach(function(k){
    __FT.lights = 0;
    var cls = k === 'decoy' ? 'Mirror Knight' : 'Ninja';
    var g = makeSummonMesh3D({ kind: k, r: 10, cls: cls, color: '#5f27cd' });
    var parts = {}; Object.keys(g.userData.parts || {}).forEach(function(n){ parts[n] = g.userData.parts[n].length; });
    var meshes = 0, shared = true, seeThrough = true;
    g.traverse(function(o){ if (o.isMesh) { meshes++; if (!(o.material && o.material.userData.shared)) shared = false;
      if ((k==='clone'||k==='decoy') && o.name !== 'friendRing' && o.name !== 'mirror' && !(o.material.transparent && o.material.opacity < 0.7)) seeThrough = false; } });
    out[k] = { parts: parts, meshes: meshes, shared: shared, lights: __FT.lights, kind: g.userData.kind, seeThrough: seeThrough,
               legs: (g.userData.legs || []).length };
    sigs[k] = Object.keys(parts).sort().join(',');
  });
  // build twice more: no new materials should appear
  var before = _pfMat.size, clonesBefore = __FT.clones;
  SUMMON_KINDS.forEach(function(k){ var cl = k === 'decoy' ? 'Mirror Knight' : 'Ninja'; makeSummonMesh3D({ kind: k, r: 10, cls: cl, color: '#5f27cd' }); makeSummonMesh3D({ kind: k, r: 10, cls: cl, color: '#5f27cd' }); });
  out._pool = { grew: _pfMat.size - before, clones: __FT.clones - clonesBefore };
  var ninja = makeSummonMesh3D({ kind:'clone', r:10, cls:'Ninja' }), mk = makeSummonMesh3D({ kind:'clone', r:10, cls:'Mind Swapper' });
  var vestOf = function(g){ var v; g.traverse(function(o){ if (o.name === 'vest') v = o.material; }); return v; };
  out._classColour = vestOf(ninja) !== vestOf(mk);
  out._sigsDistinct = new Set(Object.values(sigs)).size === SUMMON_KINDS.length;
  return JSON.stringify(out);
})`));
for (const k of Object.keys(need3D)) {
  const b = built[k];
  const miss = Object.entries(need3D[k]).filter(([n, c]) => (b.parts[n] || 0) < c).map(([n, c]) => n + '<' + c);
  check(miss.length === 0, k + ' has its parts: ' + Object.keys(need3D[k]).join(', '), miss.join(' ') || b.meshes + ' meshes');
  check(b.parts.friendRing === 1, k + ' stands on a green friendly ring');
  check(b.shared && b.lights === 0, k + ' uses only pooled materials and adds no lights');
}
check(built.wolf.legs === 4, 'the wolf trots on four animated legs (not two like a person)', built.wolf.legs + ' legs');
check(!built.wolf.parts.helmet && !built.wolf.parts.arm && !built.wolf.parts.vest, 'the wolf has no human parts');
check(built.clone.seeThrough && built.decoy.seeThrough, 'clones and decoys are see-through copies of the SWAT figure');
check(built._classColour, "a clone wears its owner's class colour");
check(built._sigsDistinct, 'no two kinds share the same body');
check(built._pool.grew === 0 && built._pool.clones === 0, 'building more summons allocates no new materials', JSON.stringify(built._pool));

const tw = JSON.parse(q(`__withFake(function(){
  var t = makeTurretMesh3D(), p = t.userData.parts, head = t.userData.head;
  var barrelOnHead = head.children.indexOf(p.barrel[0]) >= 0, baseOnHead = head.children.indexOf(p.base[0]) >= 0;
  var b = makeWallMesh3D('brick'), i = makeWallMesh3D('iron'), d = makeWallMesh3D(undefined);
  var cnt = function(g, n){ return (g.userData.parts[n] || []).length; };
  var blockGeo = b.userData.parts.block[0].geometry.args.join(',');
  return JSON.stringify({ barrel: cnt(t,'barrel'), base: cnt(t,'base'), ring: cnt(t,'friendRing'), barrelOnHead: barrelOnHead, baseOnHead: baseOnHead,
    brick: { mortar: cnt(b,'mortar'), merlon: cnt(b,'merlon'), flag: cnt(b,'flag'), rivet: cnt(b,'rivet') },
    iron: { rivet: cnt(i,'rivet'), plate: cnt(i,'plate'), flag: cnt(i,'flag'), mortar: cnt(i,'mortar') },
    dflt: cnt(d,'mortar'), blockGeo: blockGeo, lights: __FT.lights });
})`));
check(tw.barrel === 1 && tw.base === 1 && tw.barrelOnHead && !tw.baseOnHead, 'the turret is a barrel on a turning head, over a fixed base');
check(tw.ring === 1, 'the turret stands on a green friendly ring');
check(tw.brick.mortar >= 4 && tw.brick.merlon === 4 && tw.brick.flag === 1 && !tw.brick.rivet, 'a Builder wall is brick with mortar and a battlement');
check(tw.iron.rivet >= 8 && tw.iron.plate >= 2 && tw.iron.flag === 1 && !tw.iron.mortar, 'an Iron wall is riveted steel plate');
check(tw.dflt > 0, 'a wall with no kind (old save) is brick');
check(tw.blockGeo === '30,50,30', 'the wall block keeps its 30x50x30 size', tw.blockGeo);
check(tw.lights === 0, 'turrets and walls add no lights');

// ---------- 3. 2D drawing ----------
console.log('\n3. every kind draws in 2D:\n');
const d2 = JSON.parse(q(`(function(){
  var c = ctx, calls = 0, wrap = {};
  ['fill','stroke','fillRect','arc','ellipse'].forEach(function(m){ wrap[m] = c[m]; c[m] = function(){ calls++; }; });
  var out = {};
  try {
    ['topdown','thirdperson'].forEach(function(mode){
      cameraMode = mode;
      SUMMON_KINDS.forEach(function(k){
        calls = 0;
        try {
          var a = { x: 500, y: 500, r: 10, life: 300, hp: 10, maxHp: 10, kind: k, cls: 'Ninja', color: '#5f27cd' };
          drawSummon2D(a); a.x += 3; drawSummon2D(a);
          out[mode + ':' + k] = calls;
        } catch (e) { out[mode + ':' + k] = 'THREW ' + e.message; }
      });
      ['brick','iron',undefined].forEach(function(k){
        calls = 0;
        try { drawWall2D({ x: 300, y: 300, hp: 3, kind: k }); out[mode + ':wall-' + k] = calls; } catch (e) { out[mode + ':wall-' + k] = 'THREW ' + e.message; }
      });
    });
    cameraMode = 'topdown';
  } finally { Object.keys(wrap).forEach(function(m){ c[m] = wrap[m]; }); }
  return JSON.stringify(out);
})()`));
for (const [k, v] of Object.entries(d2)) check(typeof v === 'number' && v > 4, k + ' draws', String(v));
check(q(`SUMMON_KINDS.every(function(k){ return !!SUMMON_EMOJI[k]; })`) === true, 'every kind has a first-person (raycast) sprite emoji');
// A full frame with every kind and wall/turret on screen, in each 2D camera.
const frame = q(`(function(){
  try {
    chosenClass = CLASSES[0]; startGame(); gameRunning = true;
    allies = SUMMON_KINDS.map(function(k, i){ return { x: player.x + 30 + i*20, y: player.y, r: 10, speed: 0, damage: 1, hp: 10, maxHp: 10, life: 500, atkCd: 0, kind: k, cls: 'Ninja', color: '#5f27cd' }; });
    turrets = [{ x: player.x - 40, y: player.y, r: 12, hp: 30, maxHp: 30, cooldown: 0, angle: 0.5, ammo: 9, kind: 'turret' }];
    walls = [{ x: player.x, y: player.y + 60, hp: 3, kind: 'brick' }, { x: player.x + 40, y: player.y + 60, hp: 3, kind: 'iron' }];
    ['topdown','thirdperson','firstperson'].forEach(function(m){ cameraMode = m; draw(); });
    cameraMode = 'topdown';
    return 'ok';
  } catch (e) { return e.message; }
})()`);
check(frame === 'ok', 'a full frame with every summon on screen draws in top-down, third-person and first-person', frame);

// ---------- 4. behaviour unchanged ----------
console.log('\n4. summons behave exactly as before:\n');
const keys = Object.keys(BASELINE);
check(Object.keys(now).length === keys.length, 'the same abilities summon something', Object.keys(now).length + ' vs ' + keys.length);
const diffs = keys.filter(k => now[k] !== BASELINE[k]);
check(diffs.length === 0, 'positions, stats, life, and damage dealt match the pre-change game for all ' + keys.length + ' summon sources',
      diffs.length ? 'differs: ' + diffs.join(', ') : 'x/y/r/speed/damage/hp/life + monster hp');

console.log('\n' + (ok ? 'ALL PASS' : 'SOME CHECKS FAILED'));
process.exit(ok ? 0 : 1);
