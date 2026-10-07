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


function q(js){ return vm.runInNewContext(js, ctx, {filename:'game.js', timeout:20000}); }
let ok = true;
function check(pass,label,extra){ if(!pass) ok=false;
  console.log('  ' + (pass?'PASS':'FAIL'), label + (extra?'  ('+extra+')':'')); }

console.log('\nper-world architecture:');
q(`chosenClass = CLASSES[0]; playerName='T'; gameRunning=false; cameraMode='topdown'; startGame();`);

const rows = q(`(function(){
  var out = [];
  for (var i = 0; i < WORLDS.length; i++) {
    currentWorld = WORLDS[i];
    usingCustomMap = false;
    generateBuildings();
    var n = buildings.length;
    var w=0,h=0,g=0,styled=0;
    for (var k=0;k<n;k++){ var b=buildings[k]; w+=b.w; h+=b.h; g+=b.hgt; if(b.st) styled++; }
    out.push({ id: WORLDS[i].id, style: worldStyleId(WORLDS[i]),
               facade: bldgStyleOf(buildings[0]).facade,
               body: bldgStyleOf(buildings[0]).body,
               n: n, w: Math.round(w/n), h: Math.round(h/n), hgt: Math.round(g/n),
               styled: styled === n });
  }
  return JSON.stringify(out);
})()`);
const data = JSON.parse(rows);

check(data.length === 36, 'all worlds generate', data.length + ' worlds');
check(data.every(d => d.n > 100), 'every world fills its chunks', 'min ' + Math.min(...data.map(d=>d.n)) + ' buildings');
check(data.every(d => d.styled), 'every building carries its style id');

const styles = [...new Set(data.map(d => d.style))];
const facades = [...new Set(data.map(d => d.facade))];
const bodies  = [...new Set(data.map(d => d.body))];
check(bodies.length >= 8, 'distinct STRUCTURE bodies, not just different roofs', bodies.length + ' kinds');

// Every map builds something only IT builds.
const styleIds = data.map(d => d.style);
const dupStyles = styleIds.filter((v,i) => styleIds.indexOf(v) !== i);
check(dupStyles.length === 0, 'every world has its OWN structure style, none shared',
      dupStyles.length ? 'shared: ' + [...new Set(dupStyles)].join(', ') : '30 unique');
const dupBodies = bodies.length;
check(dupBodies === data.length, 'and its own 3D body', dupBodies + ' distinct bodies across ' + data.length + ' worlds');

// A body with no branch in the 3D dispatcher renders NOTHING - the structures simply vanish.
const missing3D = [...new Set(data.map(d => d.body))].filter(bd => !new RegExp("kind === '" + bd + "'").test(code) && bd !== 'box');
check(missing3D.length === 0, 'every body has a 3D branch (no invisible worlds)',
      missing3D.length ? 'NO 3D GEOMETRY for: ' + missing3D.join(', ') : 'all ' + dupBodies + ' build');

// ...and something sensible from above.
// A body is covered either by its own branch, or by being mapped into a silhouette family.
const famBlock = code.slice(code.indexOf('const kind2 = ({'), code.indexOf('[_rawKind]'));
const missing2D = [...new Set(data.map(d => d.body))].filter(bd =>
  !new RegExp("kind2 === '" + bd + "'").test(code) && !new RegExp(bd + "\\s*:").test(famBlock));
check(missing2D.length === 0, 'every body has a top-down silhouette',
      missing2D.length ? 'no plan view for: ' + missing2D.join(', ') : 'all mapped');
check(data.every(d => d.body), 'every world declares what its structures are');
const boxy = data.filter(d => ['skyscraper','works','pagoda'].indexOf(d.body) > -1).map(d => d.id);
check(boxy.length <= 3, 'only the worlds that SHOULD build boxes do', 'boxes: ' + boxy.join(', '));
check(styles.length >= 10, 'distinct archetypes in use', styles.length + ': ' + styles.join(', '));
check(facades.length >= 5, 'distinct wall facades in use', facades.length + ': ' + facades.join(', '));

// The archetypes must actually differ in the world, not just in name.
const by = {};
for (const d of data) (by[d.style] = by[d.style] || []).push(d);
const avg = (st, k) => Math.round(by[st].reduce((a,d)=>a+d[k],0) / by[st].length);
console.log('\n  archetype  structure   footprint     height     worlds');
for (const st of styles.sort())
  console.log('  ' + st.padEnd(11) + String(by[st][0].body).padEnd(12)
              + String(avg(st,'w')+' x '+avg(st,'h')).padEnd(14)
              + String(avg(st,'hgt')).padEnd(11) + by[st].map(d=>d.id).join(', '));

check(avg('hut','w') < avg('stack','w') * 0.6, 'huts are much smaller than factories',
      avg('hut','w') + ' vs ' + avg('stack','w'));
check(avg('crystal','hgt') > avg('adobe','hgt') * 1.8, 'crystal spires tower over adobe',
      avg('crystal','hgt') + ' vs ' + avg('adobe','hgt'));
check(avg('tower','hgt') > avg('hut','hgt') * 1.3, 'city towers still rise above the jungle canopy',
      avg('tower','hgt') + ' vs ' + avg('hut','hgt'));
// A tree is narrow and tall; a factory is wide and squat. That ratio is what makes them read as
// different KINDS of thing rather than the same block at different scales.
check(avg('hut','hgt') / avg('hut','w') > 2, 'trees are slender - tall for their footprint',
      (avg('hut','hgt')/avg('hut','w')).toFixed(1) + ':1');
check(avg('stack','hgt') / avg('stack','w') < 1.2, 'factories are wide and squat',
      (avg('stack','hgt')/avg('stack','w')).toFixed(1) + ':1');

// ---- the ground each world stands on ----
const grounds = q(`(function(){
  return JSON.stringify(WORLDS.map(function(w){ return { id:w.id, art: groundArtOf(w), col: w.ground }; }));
})()`);
const gd = JSON.parse(grounds);
const arts = [...new Set(gd.map(g => g.art))];
check(gd.every(g => g.art), 'every world declares what its ground is made of');
check(arts.length >= 12, 'many distinct ground surfaces, not one shared speckle', arts.length + ': ' + arts.join(', '));
// An art with no drawing branch silently falls back to flat paint - the same silent-downgrade class
// of bug as a body with no 3D branch.
const missingArt = arts.filter(a => !new RegExp("art === '" + a + "'").test(code));
check(missingArt.length === 0, 'every ground surface has a drawing branch',
      missingArt.length ? 'flat paint for: ' + missingArt.join(', ') : 'all ' + arts.length + ' drawn');
// The ground must key off the WORLD, not the time of day.
check(/makeGroundTexture\(worldFloorColor\(/.test(code), 'the ground texture is built from the current world');
check(q(`TIME_OF_DAY.every(function(t){ return t.groundTint !== undefined; })`) === true,
      'every time of day supplies a light tint rather than an earth colour');
// Two worlds with different ground colours must not share a cached texture.
check(q(`(function(){
   _texCache.clear && _texCache.clear();
   makeGroundTexture('#dff3ff','snow'); makeGroundTexture('#1b6ca8','water');
   return _texCache.size >= 2 ? 'ok' : 'cache collapsed to '+_texCache.size; })()`) === 'ok',
   'ground textures are cached per world colour and surface');

// ---- all three floor renderers, not just the 3D one ----
check(q(`(function(){
   var a = makeGroundCanvas('#dff3ff','snow'), b2 = makeGroundCanvas('#dff3ff','snow');
   return a === b2 ? 'ok' : 'not cached'; })()`) === 'ok',
   'the painted floor tile is built once and shared');
check(q(`(function(){
   var a = makeGroundCanvas('#dff3ff','snow'), b2 = makeGroundCanvas('#1b6ca8','water');
   return a !== b2 ? 'ok' : 'two worlds share one tile'; })()`) === 'ok',
   'different worlds get different tiles');
check(q(`typeof worldFloorPattern === 'function'`) === true, 'the 2D views can fill with that same tile');
// The three renderers must take the floor from the WORLD. Before, all three read _timeOfDay.groundHex.
const fpFloor = code.slice(code.indexOf('const floorGrad'), code.indexOf('const floorGrad') + 700);
check(/worldFloorColor\(/.test(fpFloor), 'the raycast first-person floor is world-coloured');
const topFloor = code.slice(code.indexOf('// Ground (world themed)'), code.indexOf('// Ground (world themed)') + 1600);
check(/worldFloorPattern/.test(topFloor), 'the top-down floor uses the world tile');
check(/globalCompositeOperation = 'multiply'/.test(topFloor), 'and the time of day still tints it');
// The only places the old brown earth may still appear are as a last-resort fallback.
const dirtUses = (code.match(/_timeOfDay\.groundHex/g) || []).length;
const dirtFallbacks = (code.match(/\|\| _timeOfDay\.groundHex/g) || []).length;
check(dirtUses === dirtFallbacks, 'the time-of-day earth colour survives only as a fallback',
      dirtUses + ' uses, ' + dirtFallbacks + ' of them fallbacks');
// groundAlt was declared on all 30 worlds and used nowhere.
check(q(`WORLDS.every(function(w){ return !!w.groundAlt; })`) === true, 'every world declares a second ground tone');
check(/currentWorld\.fog \|\| currentWorld\.groundAlt/.test(code), 'fog now takes its colour from the world');
check(q(`(function(){ var seen = {};
   WORLDS.forEach(function(w){ seen[w.fog || w.groundAlt] = 1; });
   return Object.keys(seen).length; })()`) >= 20, 'fog differs across worlds');

// ---- the air in each world ----
const fx = JSON.parse(q(`(function(){
  return JSON.stringify(WORLDS.map(function(w){
    var k = worldFxKind(w);
    return { id:w.id, name: worldFxName(w), n: k ? k.n : 0 };
  }));
})()`));
const withFx = fx.filter(f => f.name);
check(withFx.length >= 25, 'most worlds have weather in the air', withFx.length + ' of 30');
const kinds = [...new Set(withFx.map(f => f.name))];
check(kinds.length >= 10, 'and it differs between them', kinds.length + ': ' + kinds.join(', '));
check(fx.find(f => f.id === 'arctic').name === 'snow', 'it snows in the Arctic');
check(fx.find(f => f.id === 'volcano').name === 'embers', 'embers rise over the Volcano');
check(fx.find(f => f.id === 'ocean').name === 'bubbles', 'bubbles rise in the Ocean');
check(fx.find(f => f.id === 'city').name === null, 'the City air is deliberately clear');
// Every named effect must exist in the table or nothing is drawn at all.
check(q(`(function(){
   var bad = [];
   Object.keys(WORLD_FX).forEach(function(k){
     var v = WORLD_FX[k];
     if (v && !FX_KINDS[v]) bad.push(k + ' -> ' + v);
   });
   return bad.length ? bad.join(', ') : 'ok'; })()`) === 'ok',
   'every world names an effect that actually exists');
// It must cost one draw call, and must not be rebuilt every frame.
check(/new THREE\.Points\(/.test(code), 'the 3D ambience is a single Points cloud');
check(/if \(name === _fxKindName && _three_fx\) return;/.test(code),
      'and it is only rebuilt when the world changes, not per frame');
check(q(`(function(){
   currentWorld = WORLDS.find(function(w){ return w.id === 'arctic'; });
   drawWorldFx2D(document.getElementById('game').getContext('2d'));
   var first = _fx2d && _fx2d.length;
   drawWorldFx2D(document.getElementById('game').getContext('2d'));
   var same = _fx2d && _fx2d.length;
   currentWorld = WORLDS[0];
   return (first > 0 && first === same) ? 'ok' : 'rebuilt: ' + first + ' -> ' + same; })()`) === 'ok',
   'the 2D ambience keeps its particles between frames');

// ---- the monsters each world sends at you ----
const mons = JSON.parse(q(`(function(){
  var out = [];
  WORLDS.forEach(function(w){
    currentWorld = w; _themedCache.clear();
    var names = [], muts = [], cols = [];
    ['Frost','Flame','Shield','Mad Mom'].forEach(function(bn){
      var base = MONSTER_CLASSES.find(function(c){ return c.name === bn; });
      var t = themeMonster(base);
      names.push(t.name); muts.push(t.mut || t.name); cols.push(t.color);
      // the mechanics must be untouched
      if (t.hp !== base.hp || t.speed !== base.speed || t.damage !== base.damage ||
          t.score !== base.score || !!t.hasShield !== !!base.hasShield ||
          !!t.flaming !== !!base.flaming || !!t.canScream !== !!base.canScream ||
          !!t.isRanged !== !!base.isRanged) names.push('MECHANICS-CHANGED:' + bn);
    });
    out.push({ id:w.id, names:names, muts:muts, cols:cols });
  });
  currentWorld = WORLDS[0]; _themedCache.clear();
  return JSON.stringify(out);
})()`));
check(mons.length === 36, 'every world themes its monsters', mons.length + ' worlds');
check(!mons.some(m => m.names.some(n => n.indexOf('MECHANICS-CHANGED') === 0)),
      'a re-skin changes the name and colour, never the mechanics');
const allNames = mons.flatMap(m => m.names);
check(new Set(allNames).size >= 100, 'a large cast of monster names across the worlds',
      new Set(allNames).size + ' distinct names');
check(mons.every(m => m.muts.join(',') === 'Frost,Flame,Shield,Mad Mom'),
      'every world still fields the same four roles, so difficulty is unchanged');
const cityM = mons.find(m => m.id === 'city'), spaceM = mons.find(m => m.id === 'space');
check(cityM.names.join(',') !== spaceM.names.join(','), 'a Space wave is not a City wave',
      cityM.names[0] + ' vs ' + spaceM.names[0]);
// The base name is what saves and multiplayer carry, so a re-skin must resolve.
check(/currentMonsterClass\.mut \|\| currentMonsterClass\.name/.test(code),
      'the save file stores the base name, not the re-skinned one');
check(/themeMonster\(MONSTER_CLASSES\.find/.test(code),
      'and loading re-themes it for the world you return to');
check(q(`(function(){
   var m = MONSTER_CLASSES.find(function(c){ return c.name === 'Dragon'; });
   return themeMonster(m).name === 'Dragon' ? 'ok' : 'a boss got re-skinned'; })()`) === 'ok',
   'bosses keep their own identity');

// ---- the sky over each world ----
const skies = JSON.parse(q(`(function(){
  var tod = TIME_OF_DAY[2];   // Afternoon: tint is neutral, so this is the world's own sky
  return JSON.stringify(WORLDS.map(function(w){
    var sk = worldSky(w, tod);
    return { id:w.id, top:sk.top, bot:sk.bot, stars:sk.stars, custom: !!WORLD_SKY[w.id] };
  }));
})()`));
const customSkies = skies.filter(k => k.custom);
check(customSkies.length >= 18, 'most worlds have their own sky', customSkies.length + ' of 30 custom');
const skyKeys = [...new Set(skies.map(k => k.top + '|' + k.bot))];
check(skyKeys.length >= 18, 'and those skies are actually different from each other', skyKeys.length + ' distinct');
const spaceSky = skies.find(k => k.id === 'space');
const citySky  = skies.find(k => k.id === 'city');
check(spaceSky.top < 0x222222, 'Space is not blue daylight', '#' + spaceSky.top.toString(16).padStart(6,'0'));
check(spaceSky.stars === true, 'Space has stars');
check(skies.filter(k => k.stars).length >= 2 && skies.filter(k => k.stars).length <= 6,
      'stars are reserved for the worlds whose sky IS stars',
      skies.filter(k => k.stars).map(k => k.id).join(', '));
check(citySky.custom === false, 'an ordinary world keeps the time-of-day sky, so sunrises still work');
// A custom sky must still respond to the time of day.
check(q(`(function(){
   var noon = worldSky(WORLDS.find(function(w){return w.id==='ocean';}), TIME_OF_DAY[2]);
   var dusk = worldSky(WORLDS.find(function(w){return w.id==='ocean';}), TIME_OF_DAY[3]);
   return noon.bot !== dusk.bot ? 'ok' : 'a custom sky ignores the time of day'; })()`) === 'ok',
   'custom skies are still tinted by the time of day');
// Both sky renderers, and the clear colour, must ask the same helper.
check((code.match(/worldSky\(/g) || []).length >= 5, 'every sky path goes through one helper',
      (code.match(/worldSky\(/g) || []).length + ' call sites');
check(!/scene\.background\.set\(gCol\)/.test(code), 'the background behind everything is the sky, not the floor');

// ---- floor colours must be believable as a SURFACE ----
// `ground` on a world is the backdrop tint the old flat art used, not a floor: the City's is sky blue.
const floors = JSON.parse(q(`(function(){
  return JSON.stringify(WORLDS.map(function(w){ return { id:w.id, floor: worldFloorColor(w), back: w.ground }; }));
})()`));
const rgb = c => [parseInt(c.slice(1,3),16), parseInt(c.slice(3,5),16), parseInt(c.slice(5,7),16)];
check(floors.every(f => /^#[0-9a-f]{6}$/i.test(f.floor)), 'every world resolves to a floor colour');
const cityF = floors.find(f => f.id === 'city');
const arcF  = floors.find(f => f.id === 'arctic');
const skyF  = floors.find(f => f.id === 'sky');
const isSkyBlue = c => { const [r,g,b] = rgb(c); return b > r + 25 && b > g + 10 && (r+g+b)/3 > 140; };
check(!isSkyBlue(cityF.floor), 'the City street is asphalt, not sky', cityF.back + ' -> ' + cityF.floor);
check(!isSkyBlue(arcF.floor),  'the Arctic floor is snow, not light blue', arcF.back + ' -> ' + arcF.floor);
check(!isSkyBlue(skyF.floor),  'the Sky floor is cloud, not light blue', skyF.back + ' -> ' + skyF.floor);
const arcRGB = rgb(arcF.floor);
check(Math.max(...arcRGB) - Math.min(...arcRGB) < 20 && arcRGB[0] > 225,
      'and the Arctic reads as near-white', arcF.floor);
check(floors.filter(f => isSkyBlue(f.floor)).length === 0, 'no world stands on a sky colour',
      floors.filter(f => isSkyBlue(f.floor)).map(f => f.id).join(', ') || 'none');
// Every floor renderer must ask the same helper.
check((code.match(/worldFloorColor\(/g) || []).length >= 6,
      'all the floor renderers go through one colour helper',
      (code.match(/worldFloorColor\(/g) || []).length + ' call sites');

// ---- the clutter scattered between the structures ----
const props = q(`(function(){
  return JSON.stringify(WORLDS.map(function(w){ return { id:w.id, set: PROPS_FOR(w) }; }));
})()`);
const pd = JSON.parse(props);
const allProps = [...new Set(pd.flatMap(p => p.set))];
check(pd.every(p => p.set && p.set.length >= 3), 'every world scatters at least three kinds of thing');
check(allProps.length >= 25, 'many distinct props, not just city furniture everywhere',
      allProps.length + ' kinds');
// A prop name with no case in buildProp returns null and simply never appears.
const buildable = q(`(function(){
  var bad = [];
  ${JSON.stringify(allProps)}.forEach(function(k){
    try { if (!buildProp(k, function(){ return false; })) bad.push(k); }
    catch (e) { bad.push(k + ': ' + e.message); }
  });
  return bad.join(', '); })()`);
check(buildable === '', 'every prop a world asks for can actually be built',
      buildable ? 'MISSING: ' + buildable : 'all ' + allProps.length + ' build');
// City furniture must not turn up where it makes no sense.
const cityStuff = ['hydrant','mailbox','bench'];
const wrong = pd.filter(p => p.id !== 'city' && p.set.some(k => cityStuff.indexOf(k) > -1));
check(wrong.length === 0, 'no fire hydrants in the Arctic',
      wrong.length ? wrong.map(w => w.id).join(', ') : 'city furniture stays in the city');
// Only lamps may claim one of the scene's three dynamic lights.
check(q(`(function(){
   var granted = 0;
   ${JSON.stringify(allProps)}.forEach(function(k){ buildProp(k, function(){ granted++; return true; }); });
   return granted <= 3 ? 'ok' : granted + ' props asked for a light'; })()`) === 'ok',
   'only lamp props request a dynamic light');

// Same world, same seed -> same city (the save/Continue guarantee must survive this change)
q(`currentWorld = WORLDS[0]; generateBuildings();`);
const seed = q('_worldSeed');
const sig1 = q(`buildings.slice(0,5).map(function(b){return Math.round(b.x)+','+Math.round(b.y)+','+b.st;}).join(' ')`);
q(`_worldSeed = ${seed}; _chunkCache = new Map(); _loadedChunkKey = null; refreshChunks(true);`);
const sig2 = q(`buildings.slice(0,5).map(function(b){return Math.round(b.x)+','+Math.round(b.y)+','+b.st;}).join(' ')`);
check(sig1 === sig2, 'generation is still deterministic from the seed');

console.log('\n' + (ok ? 'WORLD STYLES PASS' : 'WORLD STYLES FAIL'));
process.exit(ok ? 0 : 1);
