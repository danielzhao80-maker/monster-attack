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
function check(pass, label, extra){ if(!pass) ok=false;
  console.log('  ' + (pass?'PASS':'FAIL'), label + (extra ? '  (' + extra + ')' : '')); }

console.log('\nmap maker:');
q(`customMap = []; usingCustomMap = false; openMapMaker();`);

// --- drag out a building ---
q(`mmSetTool('build'); mmSetHeight(360); mmSetColor('#ff6b6b');
   mmPointerDown({clientX:10, clientY:10, pointerId:1});
   mmPointerMove({clientX:40, clientY:30, pointerId:1});
   mmPointerUp();`);
const b0 = q(`JSON.stringify(customMap[0])`);
const drawn = q('customMap.length') === 1;
const shape = q(`(function(){var b=customMap[0];
  return ['lx','ly','x','y','w','h','hgt','color'].every(function(k){return b[k]!==undefined;});})()`);
check(drawn && shape, 'dragging draws one building in the standard shape', b0);
check(q(`customMap[0].x`) === 100 && q(`customMap[0].y`) === 100
   && q(`customMap[0].w`) === 300 && q(`customMap[0].h`) === 200,
   'canvas pixels map to world units (x10)', q(`[customMap[0].x,customMap[0].y,customMap[0].w,customMap[0].h].join('x')`));

// --- a tap still makes something ---
q(`mmPointerDown({clientX:60, clientY:60, pointerId:1}); mmPointerUp();`);
check(q('customMap.length') === 2 && q('customMap[1].w') === 260, 'a tap drops a default building', q('customMap[1].w') + ' wide');

// --- erase ---
q(`mmSetTool('erase'); mmPointerDown({clientX:62, clientY:62, pointerId:1});`);
check(q('customMap.length') === 1, 'erase removes the building you tap');
q(`mmSetTool('erase'); mmPointerDown({clientX:880, clientY:540, pointerId:1});`);
check(q('customMap.length') === 1, 'erasing empty space removes nothing');

// --- height and colour are applied ---
q(`mmSetTool('build'); mmSetHeight(700); mmSetColor('#48dbfb');
   mmPointerDown({clientX:200,clientY:200,pointerId:1}); mmPointerMove({clientX:260,clientY:250,pointerId:1}); mmPointerUp();`);
check(q('customMap[1].hgt') === 700 && q('customMap[1].color') === '#48dbfb', 'height and colour are applied', 'hgt ' + q('customMap[1].hgt'));

// --- random city ---
q(`mmRandomFill();`);
const n = q('customMap.length');
const overlaps = q(`(function(){var c=0;for(var i=0;i<customMap.length;i++)for(var j=i+1;j<customMap.length;j++){
  var a=customMap[i],b=customMap[j];
  if(a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y)c++;}return c;})()`);
check(n > 20 && overlaps === 0, 'Random City fills the map with no overlaps', n + ' buildings, ' + overlaps + ' overlaps');

// --- playing on it ---
q(`chosenClass = CLASSES[0]; playerName='T'; gameRunning=false; cameraMode='topdown';
   usingCustomMap = true; startGame(); usingCustomMap = true; refreshChunks(true);`);
check(q('buildings.length') === q('customMap.length') && q('traps.length') === 0,
      'the run uses exactly the drawn buildings', q('buildings.length') + ' buildings, no generated traps');
// Every drawn structure must be solid at its centre, and somewhere well outside the map must be
// clear. Probing a point 500 units away used to be the "clear" test, which Random City could have
// quietly filled — a flaky assertion, not a flaky game.
const solid = q(`(function(){
  var allSolid = customMap.every(function(b){ return ptInBld(b.x + b.w/2, b.y + b.h/2, 14); });
  var outside  = !ptInBld(-9000, -9000, 14);
  return (allSolid && outside) ? true : ('allSolid=' + allSolid + ' outside=' + outside);
})()`);
check(solid === true, 'every drawn structure is solid, and off-map is clear',
      solid === true ? q('customMap.length') + ' checked' : String(solid));

// --- it survives Continue ---
q(`player.x = WORLD_W/2; player.y = WORLD_H/2; wave = 4; saveGame(); gameRunning=false;
   usingCustomMap = false; buildings = []; loadGame();`);
check(q('usingCustomMap') === true && q('buildings.length') === q('customMap.length'),
      'Continue comes back on your map, not a generated one', q('buildings.length') + ' buildings');

// --- and normal Play does NOT use it ---
q(`gameRunning=false; openRollScreen();`);
check(q('usingCustomMap') === false, 'normal Play goes back to the generated world');
q(`gameRunning=false; usingCustomMap=false; chosenClass=CLASSES[0]; startGame();`);
check(q('buildings.length') > 100 && q('traps.length') > 0,
      'the generated world still streams chunks and traps', q('buildings.length') + ' buildings, ' + q('traps.length') + ' traps');

// ---- undo ----
q(`customMap = []; mmUndo.length = 0; usingCustomMap = false; openMapMaker(); mmSetTool('build'); mmSetStyle('tower');
   mmPointerDown({clientX:10,clientY:10,pointerId:1}); mmPointerMove({clientX:40,clientY:30,pointerId:1}); mmPointerUp();
   mmPointerDown({clientX:70,clientY:70,pointerId:1}); mmPointerMove({clientX:100,clientY:100,pointerId:1}); mmPointerUp();`);
check(q('customMap.length') === 2, 'two structures placed');
q(`mmUndoLast();`);
check(q('customMap.length') === 1, 'undo removes the last structure');
q(`mmUndoLast();`);
check(q('customMap.length') === 0, 'undo again empties the map');
q(`mmUndoLast();`);
check(q('customMap.length') === 0, 'undo past the start is harmless');

// undo covers erase and clear too
q(`customMap=[]; mmUndo.length=0; mmSetTool('build');
   mmPointerDown({clientX:10,clientY:10,pointerId:1}); mmPointerMove({clientX:40,clientY:30,pointerId:1}); mmPointerUp();
   mmSetTool('erase'); mmPointerDown({clientX:20,clientY:15,pointerId:1});`);
check(q('customMap.length') === 0, 'erased it');
q(`mmUndoLast();`);
check(q('customMap.length') === 1, 'undo brings an erased structure back');

// ---- the spawn point stays walkable ----
q(`customMap=[]; mmUndo.length=0; mmSetTool('build'); _mmFlashMsg='';
   var sx = (WORLD_W/2)/10, sy = (WORLD_H/2)/10;
   mmPointerDown({clientX:sx-20, clientY:sy-20, pointerId:1});
   mmPointerMove({clientX:sx+20, clientY:sy+20, pointerId:1});
   mmPointerUp();`);
check(q('customMap.length') === 0 && q('_mmFlashMsg').indexOf('spawn') > -1,
      'a structure over the spawn is refused, with a reason', q('_mmFlashMsg'));

q(`customMap=[]; mmRandomFill();`);
const buriedSpawn = q(`customMap.filter(function(b){ return mmCoversSpawn(b); }).length`);
check(buriedSpawn === 0, 'Random City never buries the spawn', buriedSpawn + ' structures over it');

q(`chosenClass = CLASSES[0]; playerName='T'; gameRunning=false; cameraMode='topdown';
   usingCustomMap = true; startGame(); usingCustomMap = true; refreshChunks(true);`);
check(q(`!ptInBld(player.x, player.y, player.r)`) === true, 'you spawn somewhere walkable on your map');

// ---- the structure picker actually changes what you place ----
q(`gameRunning=false; customMap=[]; mmUndo.length=0; openMapMaker(); mmSetTool('build');`);
const placed = q(`(function(){
  var out = [];
  ['hut','rock','crystal','tent'].forEach(function(st, i){
    mmSetStyle(st);
    mmPointerDown({clientX:100+i*60, clientY:60, pointerId:1});
    mmPointerMove({clientX:130+i*60, clientY:100, pointerId:1});
    mmPointerUp();
    out.push(customMap[customMap.length-1].st);
  });
  return out.join(',');
})()`);
check(placed === 'hut,rock,crystal,tent', 'each structure type is placed as chosen', placed);
const bodies = q(`customMap.map(function(b){return bldgStyleOf(b).body;}).join(',')`);
check(bodies === 'tree,boulder,shard,bigtop', 'and they build the right 3D structures', bodies);

// ---- the editor preview uses the real renderer ----
q(`__drew = 0; var __od = drawStructureTop; drawStructureTop = function(){ __drew++; return __od.apply(this, arguments); };
   mmRender();`);
check(q('__drew') === q('customMap.length'), 'the editor previews every structure with the game renderer',
      q('__drew') + ' drawn');

// ---- traps ----
console.log('');
q(`gameRunning=false; currentWorld = WORLDS[0]; customMap=[]; customTraps=[]; mmUndo.length=0; openMapMaker();`);
const pal = q(`mmTrapPalette().map(function(t){return t.type;}).join(',')`);
check(pal.split(',').length >= 2 && pal.indexOf('pebble') > -1,
      "the palette is this world's traps plus the pebble", pal);

q(`mmSetTool('trap'); mmSetTrap(0); mmPointerDown({clientX:120,clientY:90,pointerId:1});`);
check(q('customTraps.length') === 1, 'tapping in Trap mode drops a trap');
const t0 = q(`JSON.stringify(customTraps[0])`);
check(q(`['x','y','r','type','emoji','color','dmg','effect','duration','label','art','cooldown','seed']
        .every(function(k){return customTraps[0][k] !== undefined;})`) === true,
      'the trap has every field the game needs', t0.slice(0, 96) + '…');
check(q(`customTraps[0].x`) === 1200 && q(`customTraps[0].y`) === 900, 'placed where you tapped');

q(`mmSetTrap(1); mmPointerDown({clientX:300,clientY:300,pointerId:1});`);
check(q(`customTraps[1].type`) !== q(`customTraps[0].type`), 'the picker changes which trap you place',
      q(`customTraps[0].type`) + ' then ' + q(`customTraps[1].type`));

// spawn stays clear
q(`_mmFlashMsg=''; var sx=(WORLD_W/2)/10, sy=(WORLD_H/2)/10; mmPointerDown({clientX:sx,clientY:sy,pointerId:1});`);
check(q('customTraps.length') === 2 && q('_mmFlashMsg').indexOf('spawn') > -1,
      'a trap on the spawn point is refused');

// erase prefers the trap sitting on top of a structure
q(`mmSetTool('build'); mmSetStyle('tower');
   mmPointerDown({clientX:100,clientY:70,pointerId:1}); mmPointerMove({clientX:160,clientY:120,pointerId:1}); mmPointerUp();`);
const bN = q('customMap.length');
q(`mmSetTool('erase'); mmPointerDown({clientX:120,clientY:90,pointerId:1});`);
check(q('customTraps.length') === 1 && q('customMap.length') === bN,
      'erase takes the trap, not the structure under it');
q(`mmUndoLast();`);
check(q('customTraps.length') === 2, 'undo restores an erased trap');

// ---- playing on it ----
q(`chosenClass = CLASSES[0]; playerName='T'; gameRunning=false; cameraMode='topdown';
   usingCustomMap = true; startGame(); usingCustomMap = true; refreshChunks(true);`);
check(q('traps.length') === q('customTraps.length'), 'your traps are in the run',
      q('traps.length') + ' traps');
check(q(`traps[0] !== customTraps[0]`) === true, 'the run gets COPIES, not the saved objects');
q(`traps[0].cooldown = 120;`);
check(q('customTraps[0].cooldown') === 0, 'setting a trap off in game does not edit your saved map');

// ---- it all survives a reload ----
q(`saveCustomMap(); customMap=[]; customTraps=[]; loadCustomMap();`);
check(q('customTraps.length') === 2 && q('customMap.length') === bN,
      'structures and traps both reload', q('customMap.length') + ' structures, ' + q('customTraps.length') + ' traps');

// ---- a map drawn before traps existed still opens ----
q(`localStorage.setItem('monster_city_custom_map', JSON.stringify([
     {lx:0,ly:0,x:500,y:500,w:200,h:200,hgt:200,color:'#ff6b6b',st:'tower'}
   ])); customMap=[]; customTraps=[]; loadCustomMap();`);
check(q('customMap.length') === 1 && q('customTraps.length') === 0,
      'a v1 map (bare array, no traps) still loads');

// The picker must keep up with the style table, or new structures exist but cannot be drawn.
const offered = q(`MM_STRUCTURES.map(function(x){return x.st;}).join(',')`).split(',');
const allStyles = q(`Object.keys(BLDG_STYLES).join(',')`).split(',');
const notOffered = allStyles.filter(x => offered.indexOf(x) < 0);
const bogus = offered.filter(x => allStyles.indexOf(x) < 0);
check(notOffered.length === 0 && bogus.length === 0,
      'the map maker offers every structure the game can build',
      notOffered.length ? 'missing: ' + notOffered.join(', ')
      : bogus.length ? 'unknown: ' + bogus.join(', ')
      : offered.length + ' of ' + allStyles.length);

console.log('\n' + (ok ? 'MAP MAKER PASS' : 'MAP MAKER FAIL'));
process.exit(ok ? 0 : 1);
