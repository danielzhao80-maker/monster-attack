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


function q(js){ return vm.runInNewContext(js, ctx, {filename:'game.js', timeout:10000}); }
try {
  q(`
    petsOwned = [
      { name:'Rat',      rank:'F',   ability:'Scavenge',  element:'Fire'      },
      { name:'Bunny',    rank:'C',   ability:'Dodge',     element:'Ice'       },
      { name:'Phoenix',  rank:'SSS', ability:'Revive',    element:'Fire'      },
      { name:'Golem',    rank:'S',   ability:'Shield',    element:'Earth'     },
      { name:'Wisp',     rank:'A',   ability:'Heal',      element:'Lightning' },
      { name:'Medic Cat',rank:'B',   ability:'Heal',      element:'Ice'       },
    ];
    equippedPets = [2];
  `);
} catch(e){ console.log('setup failed:', e.message); process.exit(1); }

function shown(query) {
  q(`petSearch(${JSON.stringify(query)});`);
  // read which pet cards actually rendered, via the canvas ids the render emits
  return q(`(function(){
     var html = _els['pets-collection'] ? '' : '';
     return __lastPetView.join(',');
  })()`);
}
// instrument: record the rendered view
q(`
  var __lastPetView = [];
  var __origDraw = drawPetFull;
  drawPetFull = function(p, c, a, b, d){ __lastPetView.push(p.name); };
  var __origRender = renderPetsCollection;
  renderPetsCollection = function(){ __lastPetView = []; return __origRender.apply(this, arguments); };
`);

const cases = [
  ['',            ['Phoenix','Golem','Wisp','Medic Cat','Bunny','Rat'], 'empty search shows everything, best rank first'],
  ['fire',        ['Phoenix','Rat'],                                    'element'],
  ['sss',         ['Phoenix'],                                          'rank'],
  ['heal',        ['Wisp','Medic Cat'],                                 'ability'],
  ['bun',         ['Bunny'],                                            'partial name'],
  ['HEAL',        ['Wisp','Medic Cat'],                                 'case-insensitive'],
  ['heal ice',    ['Medic Cat'],                                        'two terms must BOTH match'],
  ['medic cat',   ['Medic Cat'],                                        'name with a space'],
  ['dragon',      [],                                                   'no match'],
];
let ok = true;
console.log('\npets search:');
for (const [query, expect, label] of cases) {
  q(`petSearch(${JSON.stringify(query)});`);
  const got = q('__lastPetView.slice()');
  const same = got.length === expect.length && got.every((v,i) => v === expect[i]);
  if (!same) ok = false;
  console.log('  ' + (same ? 'PASS' : 'FAIL'), JSON.stringify(query).padEnd(12), '->',
              (got.length ? got.join(', ') : '(none)').padEnd(42), label);
  if (!same) console.log('        expected:', expect.join(', ') || '(none)');
}
// header text + the clear button visibility
q(`petSearch('fire');`);
const clearVisible = q(`petSearch('fire'); document.getElementById('pets-search-clear').style.display`);
const hdrFiltered  = q(`petSearch('fire'); document.getElementById('pets-collection-header').textContent`);
const clearHidden  = q(`petSearch('');     document.getElementById('pets-search-clear').style.display`);
const hdrAll       = q(`petSearch('');     document.getElementById('pets-collection-header').textContent`);
console.log('  header while searching :', JSON.stringify(hdrFiltered));
console.log('  header when cleared    :', JSON.stringify(hdrAll));
console.log('  ' + (clearVisible === 'block' ? 'PASS' : 'FAIL'), 'clear button shows while searching  (' + clearVisible + ')');
console.log('  ' + (clearHidden === 'none' ? 'PASS' : 'FAIL'), 'clear button hides when empty       (' + clearHidden + ')');
ok = ok && clearVisible === 'block' && clearHidden === 'none';

// equipping still hits the right pet: indices must survive filtering
q(`petSearch('heal');`);
const idxAfterFilter = q(`(function(){
   var RANK={SSS:6,S:5,A:4,B:3,C:2,F:1};
   var v = petsOwned.map(function(p,i){return {p:p,idx:i};}).filter(function(o){return _petMatches(o.p);})
            .sort(function(a,b){return (RANK[b.p.rank]||0)-(RANK[a.p.rank]||0);});
   return v.map(function(o){return o.p.name+'#'+o.idx;}).join(',');
})()`);
const idxOk = idxAfterFilter === 'Wisp#4,Medic Cat#5';
ok = ok && idxOk;
console.log('  ' + (idxOk ? 'PASS' : 'FAIL'), 'filtered cards keep their real indices (' + idxAfterFilter + ')');

// reopening the screen must start unfiltered — a stale filter reads as "my pets are gone"
q(`petSearch('sss'); openPetsScreen();`);
// Assert on the SEARCH state, not on a draw count — the equipped-pet chip draws too now.
const afterReopen = q(`_petQuery + '|' + document.getElementById('pets-search').value + '|' + document.getElementById('pets-collection-header').textContent`);
const reopenOk = afterReopen === '||My Collection (6) — best first';
ok = ok && reopenOk;
console.log('  ' + (reopenOk ? 'PASS' : 'FAIL'), 'reopening the screen clears the search (' + afterReopen + ')');

// empty collection still shows its own message, not the no-match one
q(`petsOwned = []; equippedPets = []; petSearch('');`);
const emptyMsg = q(`document.getElementById('pets-collection').innerHTML`);
const emptyOk = emptyMsg.includes('No pets yet');
ok = ok && emptyOk;
console.log('  ' + (emptyOk ? 'PASS' : 'FAIL'), 'empty collection keeps its own message');

// ---- pet artwork ("the logo") must be drawn everywhere a pet is shown ----
console.log('\npet artwork:');
q(`
  petsOwned = [
    { name:'Rat',     rank:'F',   ability:'Scavenge', element:'Fire' },
    { name:'Phoenix', rank:'SSS', ability:'Revive',   element:'Fire' },
    { name:'Golem',   rank:'S',   ability:'Shield',   element:'Earth' },
  ];
  equippedPets = [1, 2];
  __drawn = [];
  drawPetFull = function(p){ if (p) __drawn.push(p.name); };
  updatePetsEquippedLabel();
`);
const eqDrawn = q('__drawn.slice()');
const eqHtml  = q(`document.getElementById('pets-equipped').innerHTML`);
const eqOk = eqDrawn.length === 2 && eqDrawn.includes('Phoenix') && eqDrawn.includes('Golem')
             && (eqHtml.match(/<canvas/g)||[]).length === 2;
ok = ok && eqOk;
console.log('  ' + (eqOk?'PASS':'FAIL'), 'equipped line draws each pet  (' + eqDrawn.join(', ') + ', ' +
            (eqHtml.match(/<canvas/g)||[]).length + ' canvases)');

// no pets equipped -> plain message, no stray canvases
q(`equippedPets = []; __drawn = []; updatePetsEquippedLabel();`);
const eqEmptyHtml = q(`document.getElementById('pets-equipped').innerHTML`);
const eqEmptyOk = eqEmptyHtml.indexOf('No battle pets equipped') === 0 && eqEmptyHtml.indexOf('<canvas') === -1;
ok = ok && eqEmptyOk;
console.log('  ' + (eqEmptyOk?'PASS':'FAIL'), 'nothing equipped keeps the plain message');

// the admin grids draw every pet rather than a bare emoji
q(`__drawn = []; openAdminPanel();`);
const adminDrawn = q('__drawn.length');
const petCount   = q('PETS.length');
const adminHtml  = q(`document.getElementById('admin-pet-grid').innerHTML`);
// openAdminPanel fills BOTH the admin and the owner grid, so every pet is drawn twice.
const adminOk = adminDrawn === petCount * 2 && (adminHtml.match(/<canvas/g)||[]).length === petCount
                && adminHtml.indexOf('font-size:1.6em') === -1;   // the bare-emoji div is gone
ok = ok && adminOk;
console.log('  ' + (adminOk?'PASS':'FAIL'), 'admin + owner grids draw all ' + petCount +
            ' pets each  (' + adminDrawn + ' draws, ' + (adminHtml.match(/<canvas/g)||[]).length + ' canvases in admin)');

console.log('\n' + (ok ? 'PETS PASS' : 'PETS FAIL'));
process.exit(ok ? 0 : 1);
