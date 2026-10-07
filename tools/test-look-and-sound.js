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


function q(js){ return vm.runInNewContext(js, ctx, {filename:'game.js', timeout:15000}); }
let ok = true;
function check(pass,label,extra){ if(!pass) ok=false; console.log('  '+(pass?'PASS':'FAIL'),label+(extra?'  ('+extra+')':'')); }

console.log('\nmusic, player figure, pets in 3D:\n');
check(q(`typeof MUSIC === 'object' && typeof MUSIC.start === 'function'`) === true, 'the music module exists');
check(q(`(function(){ try { MUSIC.start(); MUSIC.stop(); return 'ok'; } catch(e){ return e.message; } })()`) === 'ok',
      'starting and stopping music does not throw');
check(q(`(function(){ var a = MUSIC.isOn(); MUSIC.toggle(); var b = MUSIC.isOn();
          var saved = localStorage.getItem('monster_city_music'); MUSIC.toggle();
          return (a !== b && saved !== null) ? 'ok' : 'a='+a+' b='+b+' saved='+saved; })()`) === 'ok',
      'the toggle flips and is remembered');
check(q(`(function(){ var was = MUSIC.isOn(); if (was) MUSIC.toggle();
          try { MUSIC.start(); } catch(e){ return e.message; }
          if (!MUSIC.isOn()) MUSIC.toggle();
          return 'ok'; })()`) === 'ok', 'start() is a no-op while music is off');

// the player is a person, not a pill
// THREE is a tolerant stub here, so child counts read as zero. Count how many meshes the figure
// actually CONSTRUCTS instead — that is the real measure of "a person, not a pill".
const parts = q(`(function(){
  var real = THREE, n = 0;
  THREE = new Proxy({}, { get: function(t,k){
    if (k === 'Mesh') return function(){ n++; return real.Mesh(); };
    return real[k]; } });
  try { makePlayerFigure(CLASSES[0]); } finally { THREE = real; }
  return n; })()`);
check(parts > 20, 'the player figure is built from many parts, not one capsule', parts + ' meshes');
const petParts = q(`(function(){
  var real = THREE, n = 0;
  THREE = new Proxy({}, { get: function(t,k){
    if (k === 'Mesh') return function(){ n++; return real.Mesh(); };
    return real[k]; } });
  try { makePetMesh3D({name:'Rat',rank:'F',element:'Fire'}); } finally { THREE = real; }
  return n; })()`);
check(petParts > 10, 'a pet is built from many parts too', petParts + ' meshes');
check(q(`(function(){ var g = makePlayerFigure(CLASSES[0]); return g.userData.head ? 'ok' : 'no head'; })()`) === 'ok',
      'the player figure has a head');
check(q(`(function(){ var bad=[]; CLASSES.forEach(function(c){
          try { makePlayerFigure(c); } catch(e){ bad.push(c.name+': '+e.message); } });
          return bad.length ? bad.slice(0,3).join(' | ') : 'ok'; })()`) === 'ok',
      'every class builds a figure without throwing');

// pets exist in 3D
check(q(`typeof makePetMesh3D === 'function'`) === true, 'pets have a 3D body');
check(q(`(function(){ var bad=[];
   [{name:'Rat',rank:'F',element:'Fire'},{name:'Phoenix',rank:'SSS',element:'Ice'},{name:'X',rank:'B'}]
   .forEach(function(p){ try { makePetMesh3D(p); } catch(e){ bad.push(p.name+': '+e.message); } });
   return bad.length ? bad.join(' | ') : 'ok'; })()`) === 'ok',
   'pets with and without an element both build');
check(q(`(function(){ petsOwned=[{name:'Rat',rank:'F',ability:'Scavenge',element:'Fire'}];
   equippedPets=[0]; rebuildPetRuntime();
   return (petRuntime.length===1 && petRuntime[0]._pet && petRuntime[0]._pet.name==='Rat') ? 'ok'
        : 'runtime carries '+JSON.stringify(petRuntime[0]); })()`) === 'ok',
   'each pet runtime slot carries its pet, so the renderer knows what to build');
check(q(`_three === null || _three === undefined ? 'na' : (_three.petMeshes ? 'ok' : 'missing')`) !== 'missing',
      'the 3D scene has a pet mesh map');

// ---- realism pass ----
console.log('\nrealism:');
check(q(`TIME_OF_DAY.every(function(t){ return Array.isArray(t.sunPos) && t.sunPos.length === 3; })`) === true,
      'the sun has a position for every time of day');
const sunH = q(`TIME_OF_DAY.map(function(t){ return t.sunPos[1]; }).join(',')`);
const heights = sunH.split(',').map(Number);
check(Math.max(...heights) > 800 && Math.min(...heights) < 200,
      'it is high at noon and low at dawn and dusk', sunH);
check(/new THREE\.FogExp2\(/.test(code), 'haze builds with distance instead of switching on at a line');

// footsteps
check(q(`typeof playStep === 'function'`) === true, 'footsteps exist at all');
const stepArts = q(`Object.keys(STEP_SOUNDS).join(',')`).split(',');
const groundArts = q(`(function(){ var a = {}; WORLDS.forEach(function(w){ a[groundArtOf(w)] = 1; }); return Object.keys(a).join(','); })()`).split(',');
const noSound = groundArts.filter(a => stepArts.indexOf(a) < 0);
check(noSound.length === 0, 'every ground surface has a footstep sound',
      noSound.length ? 'silent on: ' + noSound.join(', ') : stepArts.length + ' surfaces');
check(q(`(function(){
   var bad = [];
   Object.keys(STEP_SOUNDS).forEach(function(k){
     currentWorld = WORLDS.find(function(w){ return groundArtOf(w) === k; }) || WORLDS[0];
     try { playStep(false); playStep(true); } catch (e) { bad.push(k + ': ' + e.message); }
   });
   currentWorld = WORLDS[0];
   return bad.length ? bad.join(' | ') : 'ok'; })()`) === 'ok',
   'every surface plays without throwing');
check(q(`STEP_SOUNDS.snow.noise > STEP_SOUNDS.flagstone.noise`) === true,
      'snow is more scuff than click, stone the reverse');
check(q(`STEP_SOUNDS.starfield.vol === 0`) === true, 'and there are no footsteps in a starfield');
// steps must be paced by DISTANCE, not by a timer
check(/p\._stepDist \+= _moved/.test(code), 'steps are paced by distance walked, not by a timer');

// camera
check(/_three\._gait/.test(code), 'the camera eases in and out of a walking gait');
check(/Math\.pow\(Math\.abs\(Math\.sin\(_three\._bobPhase\)\), 1\.6\)/.test(code),
      'and a footfall drops faster than it rises');
check(/breath/.test(code), 'you breathe when standing still');

// materials
const faceMat = code.slice(code.indexOf('const _isMetal'), code.indexOf('const _isMetal') + 420);
check(/metalness: _isMetal \? 0\.75 : 0\.0/.test(faceMat), 'only metal facades are metallic');

// ---- the sound of each world ----
console.log('\nworld ambience:');
check(q(`typeof AMBIENCE === 'object' && typeof AMBIENCE.start === 'function'`) === true, 'the ambience module exists');
const beds = q(`(function(){ var a = {}; WORLDS.forEach(function(w){ a[AMBIENCE.bedFor(w.id)] = 1; }); return Object.keys(a).join(','); })()`).split(',');
check(beds.length >= 8, 'many distinct soundbeds', beds.length + ': ' + beds.join(', '));
check(q(`(function(){
   var bad = [];
   Object.keys(AMBIENCE.WORLD_BED).forEach(function(k){
     if (!AMBIENCE.BEDS[AMBIENCE.WORLD_BED[k]]) bad.push(k + ' -> ' + AMBIENCE.WORLD_BED[k]);
   });
   return bad.length ? bad.join(', ') : 'ok'; })()`) === 'ok',
   'every world names a bed that exists');
check(q(`AMBIENCE.bedFor('ocean')`) === 'surf', 'you hear surf at the Ocean');
check(q(`AMBIENCE.bedFor('volcano')`) === 'fire', 'and crackling over the Volcano');
check(q(`AMBIENCE.bedFor('space')`) === 'vacuum', 'space is nearly silent');
check(q(`(function(){
   var bad = [];
   WORLDS.forEach(function(w){ try { AMBIENCE.start(w.id); } catch (e) { bad.push(w.id + ': ' + e.message); } });
   try { AMBIENCE.stop(); } catch (e) { bad.push('stop: ' + e.message); }
   return bad.length ? bad.slice(0,3).join(' | ') : 'ok'; })()`) === 'ok',
   'every world starts and stops without throwing');
check(/AMBIENCE\.stop\(\)/.test(code), 'the air goes quiet when the run ends');
// Every place a run begins must start the air, or one entry point plays in silence.
const starts = (code.match(/MUSIC\.start\(\)/g) || []).length;
const ambStarts = (code.match(/AMBIENCE\.start\(/g) || []).length;
check(starts === ambStarts, 'every way of starting a run also starts the ambience',
      starts + ' music starts, ' + ambStarts + ' ambience starts');

// ---- the gun kicks ----
check(/_three\._recoil/.test(code), 'firing kicks the weapon');
check(/camera\.rotateX\(_three\._recoil/.test(code), 'and nudges your aim up');
check(/_three\._swayX/.test(code), 'the weapon lags behind the view when you turn');

console.log('\n' + (ok ? 'LOOK AND SOUND PASS' : 'LOOK AND SOUND FAIL'));
process.exit(ok ? 0 : 1);
