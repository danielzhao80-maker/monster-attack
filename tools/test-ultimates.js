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
  // X moves run their effect BEHIND a cutscene via setTimeout. Stubbed to a no-op, every ultimate
  // looks dead — which is exactly how a broken one would look too. Queue them so they can be flushed.
  setTimeout:(fn)=>{ if(typeof fn==='function') sandbox.__deferred.push(fn); return 1; },
  clearTimeout:()=>{}, setInterval:()=>1, clearInterval:()=>{},
  __deferred: [],
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
function check(pass,label,extra){ if(!pass) ok=false;
  console.log('  ' + (pass?'PASS':'FAIL'), label + (extra?'  ('+extra+')':'')); }

console.log('\nultimate forms:\n');
q(`chosenClass = CLASSES.find(function(c){return c.name==='Machine';}) || CLASSES[0];
   playerName='T'; gameRunning=false; cameraMode='topdown'; startGame();`);

check(q(`Object.keys(FORMS).length >= 6`) === true, 'there are several distinct forms', q(`Object.keys(FORMS).join(', ')`));

// the mech: more health, rockets, slower
const before = q(`JSON.stringify({hp:player.maxHp, dmg:player.damage, spd:player.speed, fr:player.fireRate})`);
q(`enterForm(player, 'mech');`);
const during = q(`JSON.stringify({hp:player.maxHp, dmg:player.damage, spd:player.speed, fr:player.fireRate})`);
const b = JSON.parse(before), d = JSON.parse(during);
check(d.hp > b.hp + 100, 'the mech has far more health', b.hp + ' -> ' + d.hp);
check(d.dmg > b.dmg, 'and hits harder', b.dmg + ' -> ' + d.dmg);
check(d.spd < b.spd, 'and is slower, because it is heavy', b.spd.toFixed(2) + ' -> ' + d.spd.toFixed(2));
check(q(`FORMS.mech.rockets === true`) === true, 'and fires rockets rather than bullets');
check(q(`player.hp > ${b.hp}`) === true, 'the bonus health is granted, not just the maximum raised');

// it fires actual rockets
q(`bullets = []; monsters = []; player.ammo = 50; player.shootCooldown = 0; shootBullet();`);
const rocket = q(`JSON.stringify(bullets[0] ? {eff:bullets[0].eff, emoji:bullets[0].bemoji, b3d:bullets[0].b3d} : null)`);
check(rocket.indexOf('explode') > -1, 'the shot it fires actually explodes', rocket);

// and it ends cleanly
q(`player.hp = player.maxHp; player.form.t = 1; updateForm(player);`);
const after = q(`JSON.stringify({hp:player.maxHp, dmg:player.damage, spd:player.speed, fr:player.fireRate, form:player.form})`);
check(after === before.slice(0, before.length-1) + ',"form":null}', 'every stat is put back exactly', after);
check(q(`player.hp <= player.maxHp && player.hp > 0`) === true,
      'and losing the bonus maximum does not kill you', q(`player.hp + '/' + player.maxHp`));

// re-entering must not stack
q(`enterForm(player,'mech'); enterForm(player,'mech'); var m1 = player.maxHp;
   player.form.t = 1; updateForm(player);`);
check(q(`player.maxHp`) === b.hp, 'pressing it twice does not stack the bonus', q(`player.maxHp`) + ' vs ' + b.hp);

// every form round-trips
check(q(`(function(){
   var bad = [];
   Object.keys(FORMS).forEach(function(k){
     var s0 = [player.maxHp, player.damage, player.speed, player.fireRate].join(',');
     enterForm(player, k);
     if (!player.form) { bad.push(k + ': did not enter'); return; }
     player.form.t = 1; updateForm(player);
     var s1 = [player.maxHp, player.damage, player.speed, player.fireRate].join(',');
     if (s0 !== s1) bad.push(k + ': ' + s0 + ' -> ' + s1);
     if (player.form) bad.push(k + ': did not end');
   });
   return bad.length ? bad.join(' | ') : 'ok'; })()`) === 'ok',
   'every form restores every stat it touched');

// an ultimate that is a form must say so, and the form must exist
check(q(`(function(){
   var bad = [];
   Object.keys(MOVES).forEach(function(cn){
     var x = MOVES[cn].x;
     if (x && x.form && !FORMS[x.form]) bad.push(cn + ' -> ' + x.form);
   });
   return bad.length ? bad.join(', ') : 'ok'; })()`) === 'ok',
   'every ultimate that names a form has one');
// EVERY class transforms. An ultimate that is still a burst is the odd one out now.
const noForm = q(`CLASSES.filter(function(c){
   var m = MOVES[c.name]; return !(m && m.x && m.x.form);
}).map(function(c){ return c.name; }).join(', ')`);
check(noForm === '', 'every single class has a transformation ultimate',
      noForm ? 'still a plain burst: ' + noForm : q('CLASSES.length') + ' of ' + q('CLASSES.length'));
// ...and no two classes share one, or they stop being a class fantasy.
const keys = q(`CLASSES.map(function(c){ return MOVES[c.name].x.form; }).join(',')`).split(',');
const dupes = keys.filter((v,i) => keys.indexOf(v) !== i);
check(dupes.length === 0, 'and no two classes turn into the same thing',
      dupes.length ? 'shared: ' + [...new Set(dupes)].join(', ') : keys.length + ' distinct');
// every form must survive a full enter/exit for every class that uses it
check(q(`(function(){
   var bad = [];
   CLASSES.forEach(function(c){
     chosenClass = c; player = createPlayer();
     var s0 = [player.maxHp, player.damage, player.speed, player.fireRate, player.gsCrit||0, player.petDodge||0].join(',');
     try { enterForm(player, MOVES[c.name].x.form); } catch (e) { bad.push(c.name + ': ' + e.message); return; }
     if (!player.form) { bad.push(c.name + ': did not enter'); return; }
     player.form.t = 1; updateForm(player);
     var s1 = [player.maxHp, player.damage, player.speed, player.fireRate, player.gsCrit||0, player.petDodge||0].join(',');
     if (s0 !== s1) bad.push(c.name + ': ' + s0 + ' -> ' + s1);
   });
   return bad.length ? bad.slice(0,4).join(' | ') : 'ok'; })()`) === 'ok',
   'every class enters and leaves its form with every stat intact');

// the transformation is visible to everyone, not just its owner
check(/form: pl\.form \? pl\.form\.key : null/.test(code), 'the form is sent to other players');
check(/mesh\.scale\.setScalar\(_sc\)/.test(code), 'and they see a bigger body for it');

// ---- the normal [E] abilities ----
console.log('\n[E] abilities:');
check(q(`CLASSES.every(function(c){ return !!E_ABILITIES[c.name]; })`) === true,
      'every class has a named [E]',
      q(`CLASSES.filter(function(c){ return !E_ABILITIES[c.name]; }).map(function(c){return c.name;}).join(', ') || CLASSES.length + ' named'`));
const eNames = q(`CLASSES.map(function(c){ return E_ABILITIES[c.name].name; }).join('|')`).split('|');
const dupE = eNames.filter((v,i) => eNames.indexOf(v) !== i);
check(dupE.length === 0, 'and no two classes share an ability name',
      dupE.length ? 'shared: ' + [...new Set(dupE)].join(', ') : eNames.length + ' distinct');
check(q(`Object.keys(E_ABILITIES).every(function(n){ return CLASSES.some(function(c){ return c.name === n; }); })`) === true,
      'and no entry names a class that does not exist');

// The two that used to do nothing now do something.
check(q(`(function(){
   var out = [];
   ['Gangster Captain','Monster Copier'].forEach(function(cn){
     chosenClass = CLASSES.find(function(c){ return c.name === cn; });
     player = createPlayer(); player.x = 4500; player.y = 2750;
     allies = []; monsters = [{ x:4560, y:2750, r:14, hp:40, maxHp:40, name:'Zombie', color:'#7bed9f', speed:1 }];
     player._eCd = 0; player.copiedPower = false;
     useAbility(player, 4600, 2750);
     out.push(cn + ':' + (allies.length > 0 || player.copiedPower ? 'acts' : 'NOTHING'));
   });
   return out.join(' '); })()`).indexOf('NOTHING') < 0,
   'pressing [E] as Gangster Captain or Monster Copier actually does something');

// Every class's [E] must run without throwing, whatever is on screen.
check(q(`(function(){
   var bad = [];
   CLASSES.forEach(function(c){
     chosenClass = c; player = createPlayer(); player.x = 4500; player.y = 2750;
     monsters = []; allies = []; turrets = []; walls = []; bullets = []; particles = [];
     player._eCd = 0;
     try { useAbility(player, 4600, 2750); } catch (e) { bad.push(c.name + ': ' + e.message); }
   });
   return bad.length ? bad.slice(0,4).join(' | ') : 'ok'; })()`) === 'ok',
   'every class can use its [E] without throwing');
// The HUD must never leave the ability line blank - that is what "this key does nothing" looks like.
const hudNames = q(`(function(){
   var blank = [];
   CLASSES.forEach(function(c){
     chosenClass = c; player = createPlayer(); player._eCd = 0; gameRunning = true;
     updateHUD();
     var t = document.getElementById('ability-display').textContent || '';
     // The line is ab + ' | [Z] ...' + ' | [X] ...'. If the ability part is empty the whole thing
     // starts with the separator — that is what "this key does nothing" looks like on screen.
     if (!t || t.indexOf(' | ') === 0) blank.push(c.name);
   });
   gameRunning = false;
   return blank.length ? blank.slice(0,5).join(', ') : 'ok'; })()`);
check(hudNames === 'ok', 'the ability line is never blank, for any class', hudNames === 'ok' ? '23 classes' : 'blank for: ' + hudNames);

// ---- does every ability actually DO anything? ----
// Named and non-throwing is not the same as working. This fires all 69 abilities against a stocked
// world and checks each one changes something observable — bullets, allies, turrets, walls, fire,
// monster health, or the player's own state. A cooldown alone does not count: that only means the
// key was accepted.
console.log('\n every ability has an effect:');
// The ultimates check `gameRunning` before firing their deferred effect, and the tests above leave it
// false — without this every X move reads as dead.
q(`chosenClass = CLASSES[0]; gameRunning = false; cameraMode='topdown'; startGame(); gameRunning = true;`);
// Snapshot everything an ability could plausibly touch, fire it, and see what moved.
const _report = q(`(function(){
  function snap(p){
    return { bullets:bullets.length, allies:allies.length, turrets:turrets.length, walls:walls.length,
             fire:fireTiles.length, poison:poisonTiles.length, parts:particles.length,
             pickups:pickups.length, monHp: monsters.reduce(function(a,m){return a+m.hp;},0),
             monFrozen: monsters.reduce(function(a,m){return a+(m.frozen||0)+(m.stunned||0)+(m.slow||0);},0),
             monCount: monsters.length,
             hp:p.hp, maxHp:p.maxHp, inv:p.invincible, invis:p.invisible?1:0, dmg:p.damage,
             spd:p.speed, fr:p.fireRate, form:p.form?1:0, swing:p.meleeSwing||0,
             chili:p.chiliBoost||0, copied:p.copiedPower?1:0, shield:p.shieldUp?1:0,
             poss:p.possessing?1:0, teleport:p.teleporting||0, ecd:p._eCd||0, x:Math.round(p.x), y:Math.round(p.y) };
  }
  function diff(a,b){ var d=[]; for (var k in a) if (a[k] !== b[k]) d.push(k); return d; }
  function setup(c){
    chosenClass = c; player = createPlayer();
    player.x = 4500; player.y = 2750; player.angle = 0; player.charLevel = 3;
    player.moveZUnlocked = true; player.moveXUnlocked = true;
    player._eCd = 0; player.moveQCooldown = 0; player.moveFCooldown = 0;
    player.hp = Math.max(1, Math.floor(player.maxHp * 0.5));
    bullets=[]; allies=[]; turrets=[]; walls=[]; fireTiles=[]; poisonTiles=[]; particles=[]; pickups=[];
    // Clear the ground. Abilities that PLACE something correctly refuse inside a building, so a
    // randomly generated city made this probe flaky — we are testing the ability, not the map.
    buildings = [];
    monsters = [];
    for (var i=0;i<5;i++) monsters.push({ x:4500+60+i*18, y:2750, r:14, hp:400, maxHp:400,
       name:'Zombie', emoji:'Z', color:'#7bed9f', speed:1, frozen:0, stunned:0, slow:0, score:10 });
    return player;
  }
  var out = [];
  CLASSES.forEach(function(c){
    ['e','z','x'].forEach(function(slot){
      var p = setup(c);
      var before = snap(p);
      var err = '';
      try {
        if (slot === 'e') useAbility(p, 4700, 2750);
        else if (slot === 'z') useMoveQ(p, 4700, 2750);
        else useMoveF(p, 4700, 2750);
      } catch (e) { err = e.message; }
      // Let anything the ability deferred behind its cutscene actually happen.
      for (var g = 0; g < 6 && __deferred.length; g++) {
        var batch = __deferred.splice(0, __deferred.length);
        batch.forEach(function(f){ try { f(); } catch (e) { err = err || e.message; } });
      }
      var after = snap(p);
      var changed = diff(before, after);
      // A cooldown alone is not an effect — it just means the key was accepted.
      var real = changed.filter(function(k){ return k !== 'ecd' && k !== 'parts'; });
      out.push({ cls:c.name, slot:slot, err:err, changed:real.join(',') });
    });
  });
  return JSON.stringify(out);
})()`);

const rows = JSON.parse(_report);
const dead = rows.filter(r => !r.err && !r.changed);
const threw = rows.filter(r => r.err);
check(threw.length === 0, 'no ability throws', threw.length ? threw.map(r => r.cls+'['+r.slot+']').join(', ') : rows.length + ' probed');
check(dead.length === 0, 'every ability changes something observable',
      dead.length ? 'does nothing: ' + dead.map(r => r.cls+'['+r.slot.toUpperCase()+']').join(', ')
                  : rows.length + ' abilities, all live');

// ---- the hidden Elemental Mage ----
check(q(`CLASSES.some(function(c){ return c.name === 'Elemental Mage'; })`) === true, 'the hidden class exists');
check(q(`(function(){
   for (var i = 0; i < 8000; i++) if (rollRarity() === 'hidden') return 'a roll produced it';
   return 'ok'; })()`) === 'ok', 'and can never be rolled by chance');
check(q(`(function(){
   var code = Object.keys(CODES || {}).find(function(k){
     return CODES[k] && CODES[k].className === 'Elemental Mage'; });
   return code ? 'ok' : 'no code unlocks it'; })()`) === 'ok', 'but a code unlocks it');
// It must actually command EVERY element, through the field the game reads.
const elemShots = q(`(function(){
   chosenClass = CLASSES.find(function(c){ return c.name === 'Elemental Mage'; });
   gameRunning = false; startGame(); gameRunning = true;
   player.x = 4500; player.y = 2750; player._eCd = 0; bullets = [];
   useAbility(player, 4700, 2750);
   var els = bullets.map(function(b){ return b.petElement; }).filter(Boolean);
   return els.join(',');
})()`);
const wanted = q(`ELEMENTS.map(function(e){ return e.name; }).join(',')`);
check(elemShots === wanted, 'one bolt of every element, on the field the game actually reads',
      elemShots || '(none carried an element)');
// And its ultimate keeps the promise rather than being bigger numbers.
check(q(`FORMS.archmage && FORMS.archmage.allElements === true`) === true,
      'the ultimate keeps cycling every element');
check(q(`typeof showElementalCutscene === 'function'`) === true, 'and it has its own cutscene');
check(/showElementalCutscene\(\); \} catch/.test(code),
      'the cutscene cannot swallow the ability if it fails');

// ---- the claims that need real engine support ----
// Contagion says it SPREADS. A flag that sits on one monster is a slow poison with a fancy name.
check(q(`(function(){
   chosenClass = CLASSES.find(function(c){ return c.name === 'Plague Doctor'; });
   gameRunning = false; startGame(); gameRunning = true;
   player.x = 4500; player.y = 2750; player._eCd = 0; buildings = []; waveIntroTimer = 0;
   monsters = [];
   // a line of monsters, only the first close enough to be infected directly
   for (var i = 0; i < 5; i++) monsters.push({ x:4500 + 150 + i*95, y:2750, r:14, hp:9999, maxHp:9999,
      name:'Z', emoji:'Z', color:'#7bed9f', speed:0, frozen:0, stunned:0, slow:0, score:1, damage:0 });
   useAbility(player, 4650, 2750);
   var seeded = monsters.filter(function(m){ return m._plague > 0; }).length;
   for (var f = 0; f < 400; f++) { waveIntroTimer = 0; update(); }
   var infected = monsters.filter(function(m){ return m._plague > 0; }).length;
   return (infected > seeded) ? 'ok' : ('seeded ' + seeded + ', still ' + infected);
})()`) === 'ok', 'contagion spreads from one monster to the next');

// A decoy is only a decoy if they go for it.
check(q(`(function(){
   chosenClass = CLASSES.find(function(c){ return c.name === 'Mirror Knight'; });
   gameRunning = false; startGame(); gameRunning = true;
   player.x = 4500; player.y = 2750; player.angle = 0; player._eCd = 0; allies = [];
   useAbility(player, 4600, 2750);
   if (!allies.length) return 'no decoy was created';
   var m = { x: 4560, y: 2750, r: 14, hp: 100, maxHp: 100, name:'Z', speed: 1 };
   var t = nearestPlayer(m);
   return (t && t.decoy) ? 'ok' : 'monsters still target the player';
})()`) === 'ok', 'monsters go for a Mirror Knight decoy instead of the player');

// ---- a piercing arrow really does pass through ----
// Driven through the GAME's own update loop, not a reimplementation of it — the first version of
// this test simulated the bullet/monster loop itself and passed while the real guard was missing.
const pierceResult = q(`(function(){
   chosenClass = CLASSES.find(function(c){ return c.name === 'Archer'; });
   gameRunning = false; startGame(); gameRunning = true;
   player.x = 4500; player.y = 2750; player.angle = 0; player._eCd = 0;
   monsters = []; bullets = []; NET.mode = 'single';
   buildings = []; walls = [];   // a wall in the way stops the arrow - that is not what we are testing
   waveIntroTimer = 0;   // update() returns early during the wave announcement
   for (var i = 0; i < 3; i++) monsters.push({ x:4560 + i*45, y:2750, r:14, hp:99999, maxHp:99999,
      name:'Z', emoji:'Z', color:'#7bed9f', speed:0, frozen:0, stunned:0, slow:0, score:1, damage:0 });
   var before = monsters.map(function(m){ return m.hp; });
   useAbility(player, 4900, 2750);
   var fired = bullets.length;
   for (var f = 0; f < 60; f++) { waveIntroTimer = 0; update(); }
   var hurt = 0;
   for (var k = 0; k < monsters.length; k++) if (monsters[k].hp < before[k]) hurt++;
   return (fired > 0 && hurt >= 3) ? 'ok' : ('fired ' + fired + ', hit ' + hurt + ' of 3');
})()`);
check(pierceResult === 'ok', 'an Archer volley passes through a line of monsters',
      pierceResult === 'ok' ? '3 of 3 hit by one volley' : pierceResult);

// ---- Gojo: rollable, redeemable, and his E + Z + X Domain combo ----
console.log('\nGojo:');
check(q(`(function(){ var c = CLASSES.find(function(c){ return c.name === 'Gojo'; });
   return !!c && c.rarity === 'mythical' && CLASSES.filter(function(k){ return k.rarity === 'mythical'; }).indexOf(c) >= 0; })()`) === true,
   'Gojo is in the mythical roll pool');
check(q(`(function(){ guaranteedClass = null; document.getElementById('code-input').value = 'gojo';
   try { localStorage.removeItem('monster_city_used_codes'); } catch(e){}
   redeemCode(); var g = guaranteedClass && guaranteedClass.name; guaranteedClass = null; return g; })()`) === 'Gojo',
   'the GOJO code unlocks Gojo for the next roll');
// A stocked Gojo at Lv.3 with five monsters and one boss around him.
const GOJO_SETUP = `(function(lvl){
   chosenClass = CLASSES.find(function(c){ return c.name === 'Gojo'; });
   player = createPlayer(); player.x = 4500; player.y = 2750; player.angle = 0;
   player.charLevel = lvl; player.moveZUnlocked = lvl >= 2; player.moveXUnlocked = lvl >= 3;
   player._eCd = 0; player.moveQCooldown = 0; player.moveFCooldown = 0; player._domainCd = 0; player._domain = null;
   if (player.form) exitForm(player, true);
   NET.mode = 'single'; gameRunning = true; buildings = []; bullets = []; particles = [];
   _combo.keys = []; __deferred.length = 0;
   monsters = [];
   for (var i = 0; i < 5; i++) monsters.push({ x:4560+i*20, y:2750, r:14, hp:5000, maxHp:5000, name:'Z', emoji:'Z',
      color:'#7bed9f', speed:1, frozen:0, stunned:0, slow:0, score:1, damage:5 });
   monsters.push({ x:4500, y:2850, r:32, hp:50000, maxHp:50000, name:'BOSS Z', emoji:'Z', color:'#f00', speed:1,
      frozen:0, stunned:0, slow:0, score:1, damage:5, isBoss:true });
})`;
const flush = `for (var g = 0; g < 6 && __deferred.length; g++) { var b = __deferred.splice(0, __deferred.length); b.forEach(function(f){ try { f(); } catch(e){} }); }`;
const combo = q(`(function(){ ${GOJO_SETUP}(3);
   var r = [abilityKeyPress('e', 1000), abilityKeyPress('z', 1100), abilityKeyPress('x', 1250)];
   ${flush}
   return JSON.stringify({ r:r, domain: !!player._domain, cd: player._domainCd, ecd: player._eCd, zcd: player.moveQCooldown,
      xcd: player.moveFCooldown, frozen: monsters.filter(function(m){ return !m.isBoss && m.frozen > 0; }).length,
      bossSlow: monsters.filter(function(m){ return m.isBoss; })[0].slow > 0,
      dome: gameEffects.some(function(e){ return e.type === 'dome'; }) }); })()`);
const C = JSON.parse(combo);
check(C.r[2] === 'domain' && C.domain && C.cd === 3600, 'E + Z + X inside the window opens the Domain', JSON.stringify(C.r));
check(C.ecd === 0 && C.zcd === 0 && C.xcd === 0, 'and Red, Blue and Hollow Purple do NOT also fire',
      'E ' + C.ecd + ' / Z ' + C.zcd + ' / X ' + C.xcd);
check(C.frozen === 5 && C.bossSlow, 'everything inside is frozen (a boss is slowed instead)', C.frozen + ' frozen');
check(C.dome, 'the Domain draws its dome through spawnGameEffect, so 3D sees it too');
check(q(`(function(){ try { draw2DEffects(-1e9, -1e9, 1e9, 1e9); return 'ok'; } catch (e) { return e.message; } })()`) === 'ok',
      'and the dome draws in 2D without throwing');
const dot = q(`(function(){ ${GOJO_SETUP}(3); gojoDomain(player);
   var m0 = monsters[0].hp, b0 = monsters[5].hp;
   for (var f = 0; f < 360; f++) tickPlayerTimers(player);
   return JSON.stringify({ small: m0 - monsters[0].hp, boss: b0 - monsters[5].hp, over: player._domain === null }); })()`);
const D = JSON.parse(dot);
check(D.small > 0 && D.boss > 0 && D.boss < D.small && D.over,
      'it hurts everything inside over time, bosses less but for real, then closes', 'monster -' + D.small + ', boss -' + D.boss);
const two = q(`(function(){ ${GOJO_SETUP}(3);
   var r = [abilityKeyPress('e', 1000), abilityKeyPress('z', 1100)];
   ${flush}
   return JSON.stringify({ r:r, domain: !!player._domain, cd: player._domainCd, ecd: player._eCd, zcd: player.moveQCooldown }); })()`);
const T = JSON.parse(two);
check(!T.domain && T.cd === 0 && T.ecd > 0 && T.zcd > 0, 'only two keys: Red and Blue fire normally, no Domain', JSON.stringify(T));
const late = q(`(function(){ ${GOJO_SETUP}(3);
   var r = [abilityKeyPress('e', 1000), abilityKeyPress('z', 1100), abilityKeyPress('x', 1450)];
   ${flush}
   return JSON.stringify({ r:r, domain: !!player._domain, ecd: player._eCd, zcd: player.moveQCooldown, xcd: player.moveFCooldown }); })()`);
const Lt = JSON.parse(late);
check(!Lt.domain && Lt.ecd > 0 && Lt.zcd > 0 && Lt.xcd > 0, 'the third key too late: three normal moves, no Domain', JSON.stringify(Lt.r));
const locked = q(`(function(){ ${GOJO_SETUP}(2);
   var r = [abilityKeyPress('e', 1000), abilityKeyPress('z', 1050), abilityKeyPress('x', 1100)];
   ${flush}
   return JSON.stringify({ r:r, domain: !!player._domain, ecd: player._eCd }); })()`);
const Lk = JSON.parse(locked);
check(!Lk.domain && Lk.r.every(function(x){ return x === 'fired'; }) && Lk.ecd > 0,
      'with Hollow Purple still locked there is no Domain, and keys are not held back', JSON.stringify(Lk.r));
const cool = q(`(function(){ ${GOJO_SETUP}(3); gojoDomain(player); player._domain = null;
   player._eCd = 0; player.moveQCooldown = 0; player.moveFCooldown = 0;
   var r = [abilityKeyPress('e', 5000), abilityKeyPress('z', 5050), abilityKeyPress('x', 5100)];
   ${flush}
   var again = !!player._domain;
   var hud = '';
   updateHUD(); hud = document.getElementById('ability-display').textContent || '';
   for (var f = 0; f < 3600; f++) tickPlayerTimers(player);
   return JSON.stringify({ r:r, again: again, hud: hud, ready: gojoDomainReady(player) }); })()`);
const Cl = JSON.parse(cool);
check(!Cl.again && Cl.r.every(function(x){ return x === 'fired'; }), 'on cooldown the combo does nothing special; the keys fire normally', JSON.stringify(Cl.r));
check(/Domain \d+s/.test(Cl.hud), 'the Domain cooldown shows on the ability line', Cl.hud);
check(Cl.ready, 'and it is ready again after 60 seconds');
// ---- Gojo's Limitless, the way it works in the show ----
console.log('\nGojo techniques:');
// A Gojo standing still in a real running game, so the REAL update() loop moves the monsters.
const GOJO_LIVE = `(function(){
   chosenClass = CLASSES.find(function(c){ return c.name === 'Gojo'; });
   gameRunning = false; cameraMode = 'topdown'; startGame(); gameRunning = true; gamePaused = false;
   player = createPlayer(); player.x = 4500; player.y = 2750; player.angle = 0; player.charLevel = 3;
   player.moveZUnlocked = true; player.moveXUnlocked = true; player.maxHp = 5000; player.hp = 5000;
   player._eCd = 0; player.moveQCooldown = 0; player.moveFCooldown = 0; player.invincible = 0;
   if (player.form) exitForm(player, true);
   keys = {}; shooting = false; mouseDown = false; remotePlayers = []; allies = []; turrets = []; walls = [];
   NET.mode = 'single'; buildings = []; bullets = []; particles = []; gameEffects.length = 0; clearGojoOrbs();
   waveIntroTimer = 0; monstersToSpawn = 0; monstersSpawned = 0; spawnTimer = 1e9;
   monsters = [{ x:6500, y:2750, r:14, hp:5000, maxHp:5000, name:'Far', emoji:'Z', color:'#7bed9f', speed:0,
      frozen:0, stunned:0, slow:0, score:1, damage:5 }];   // one far away, so the wave never ends
})`;
const mon = (x, y, extra) => `Object.assign({ x:${x}, y:${y}, r:14, hp:5000, maxHp:5000, name:'Z', emoji:'Z', color:'#7bed9f',
   speed:1.5, frozen:0, stunned:0, slow:0, score:1, damage:5 }, ${extra || '{}'})`;

// 1. A monster walking at him crawls to a stop at the edge and never touches him.
const inf = JSON.parse(q(`(function(){ ${GOJO_LIVE}();
   var m = ${mon(4700, 2750)}; monsters.push(m);
   var hp0 = player.hp, minD = 1e9, steps = [];
   for (var f = 0; f < 300; f++) { var x0 = m.x; update(); var d = Math.hypot(m.x - player.x, m.y - player.y);
      minD = Math.min(minD, d); steps.push(Math.abs(m.x - x0)); }
   var early = steps.slice(60, 70).reduce(function(a,b){return a+b;},0) / 10;
   var late = steps.slice(240).reduce(function(a,b){return a+b;},0);
   return JSON.stringify({ minD: minD, hp: hp0 - player.hp, early: early, late: late, inf: player._inf, up: infinityUp(player) }); })()`));
check(inf.minD >= 45 && inf.minD > 14 + 14 && inf.hp === 0,
      'Infinity: a monster walking at Gojo stops at the edge and never touches him', 'closest ' + inf.minD.toFixed(1) + ', hp lost ' + inf.hp);
check(inf.late < inf.early * 0.5 && inf.late < 2, 'it slows the closer it gets, then hangs there (asymptotic)',
      'step ' + inf.early.toFixed(2) + '/frame early, ' + inf.late.toFixed(3) + ' total over the last second');
check(inf.up && inf.inf < 100, 'holding it costs some Infinity meter, and the barrier stays up', 'meter ' + Math.round(inf.inf));

// 2. A projectile entering it stops in mid-air and fades.
const shot = JSON.parse(q(`(function(){ ${GOJO_LIVE}();
   bullets.push({ x:4620, y:2750, vx:-5, vy:0, life:90, damage:9, owner:'monster', from:'Z', color:'#fff' });
   var b = bullets[0], hp0 = player.hp, stopped = false, minD = 1e9;
   for (var f = 0; f < 60; f++) { update(); if (bullets.indexOf(b) >= 0) { minD = Math.min(minD, Math.hypot(b.x - player.x, b.y - player.y)); if (b.vx === 0 && b._inf) stopped = true; } }
   return JSON.stringify({ hp: hp0 - player.hp, stopped: stopped, gone: bullets.indexOf(b) < 0, minD: minD, inf: player._inf }); })()`));
check(shot.stopped && shot.gone && shot.hp === 0 && shot.minD > 40,
      'Infinity: an enemy shot stops in mid-air, fades out and never hits', 'stopped ' + shot.minD.toFixed(1) + ' away');

// 3. The meter: drains under a swarm, drops at 0 (hits land), comes back, refills.
const meter = JSON.parse(q(`(function(){ ${GOJO_LIVE}();
   for (var k = 0; k < 8; k++) { var a = k / 8 * Math.PI * 2; monsters.push(${mon('4500 + Math.cos(a) * 60', '2750 + Math.sin(a) * 60', '{ speed: 1.2 }')}); }
   var dropAt = -1, hpAtDrop = 0, f;
   for (f = 0; f < 900 && dropAt < 0; f++) { update(); if (player._infDown > 0) { dropAt = f; hpAtDrop = player.hp; } }
   var hurt = 0; for (var g = 0; g < 100; g++) update(); hurt = hpAtDrop - player.hp;
   monsters = monsters.slice(0, 1);                      // the swarm is gone
   for (var g2 = 0; g2 < ${'INF_DOWN_T'}; g2++) update();
   var back = { up: infinityUp(player), inf: player._inf };
   for (var g3 = 0; g3 < 200; g3++) update();
   updateHUD(); var hud = document.getElementById('ability-display').textContent || '';
   return JSON.stringify({ dropAt: dropAt, hurt: hurt, back: back, later: player._inf, hud: hud }); })()`));
check(meter.dropAt > 30 && meter.dropAt < 600, 'a swarm drains the Infinity meter until the barrier drops (he is not invincible)',
      'dropped after ' + meter.dropAt + ' frames under 8 monsters');
check(meter.hurt > 0, 'with Infinity down, hits land normally', '-' + meter.hurt + ' hp');
check(meter.back.up && meter.back.inf > 0 && meter.later > meter.back.inf, 'it comes back after a few seconds and refills when nothing pushes on it',
      Math.round(meter.back.inf) + ' -> ' + Math.round(meter.later));
check(/♾️ [▰▱]{5} \d+%/.test(meter.hud), 'the Infinity meter is on the ability line', meter.hud);

// 4. Red travels forward and knocks back only what is along its path.
const red = JSON.parse(q(`(function(){ ${GOJO_SETUP}(3); monsters = []; gameEffects.length = 0; clearGojoOrbs();
   var onPath = ${mon(4720, 2762)}, beside = ${mon(4500, 2960)}, behind = ${mon(4280, 2750)};
   monsters.push(onPath, beside, behind);
   useAbility(player, 4800, 2750);
   var orb = gojoOrbs[0], fx = orb && orb.fx, maxX = 0, gorb3d = !!fx && fx.type === 'gorb' && fx.kind === 'red';
   for (var f = 0; f < 80 && gojoOrbs.length; f++) { updateGojoOrbs(); if (gojoOrbs[0]) maxX = Math.max(maxX, gojoOrbs[0].x); }
   return JSON.stringify({ gorb: gorb3d, maxX: maxX, done: gojoOrbs.length === 0, cd: player._eCd,
      on: { dy: onPath.y - 2762, dx: onPath.x - 4720, hurt: 5000 - onPath.hp },
      beside: { moved: Math.hypot(beside.x - 4500, beside.y - 2960), hurt: 5000 - beside.hp },
      behind: { moved: Math.hypot(behind.x - 4280, behind.y - 2750), hurt: 5000 - behind.hp },
      burst: gameEffects.some(function(e){ return e.type === 'ring' && e.x > 5000; }) }); })()`));
check(red.gorb && red.maxX > 4500 + 540 && red.done, 'Red is a red orb that flies forward about 600 units, drawn through spawnGameEffect',
      'reached x=' + Math.round(red.maxX));
check(red.on.dy > 60 && red.on.hurt > 0, 'a monster on its path is blasted off to the side and hurt',
      'shoved ' + Math.round(red.on.dy) + ' sideways, ' + Math.round(red.on.dx) + ' onward, -' + red.on.hurt);
check(red.beside.moved === 0 && red.beside.hurt === 0 && red.behind.moved === 0 && red.behind.hurt === 0,
      'monsters beside or behind Gojo are untouched (it is not a radial blast any more)');
check(red.burst, 'it ends in a small red burst where it stops');

// 5. Blue pulls monsters toward the orb over time and crushes them.
const blue = JSON.parse(q(`(function(){ ${GOJO_SETUP}(3); monsters = []; gameEffects.length = 0; clearGojoOrbs();
   var near = ${mon(4800, 2900, '{ speed: 0 }')}, far = ${mon(4800, 3200, '{ speed: 0 }')};
   monsters.push(near, far);
   useMoveQ(player, 4800, 2750);
   var orb = gojoOrbs[0], d = [];
   for (var f = 0; f < 200; f++) { updateGojoOrbs(); if (f % 30 === 0) d.push(Math.round(Math.hypot(near.x - 4800, near.y - 2750))); }
   return JSON.stringify({ at: orb ? [orb.x, orb.y] : null, kind: orb && orb.fx.kind, d: d, hurt: 5000 - near.hp,
      far: Math.hypot(far.x - 4800, far.y - 3200), farHurt: 5000 - far.hp, over: gojoOrbs.length === 0, zcd: player.moveQCooldown }); })()`));
check(blue.at && blue.at[0] === 4800 && blue.at[1] === 2750 && blue.kind === 'blue', 'Blue opens a small black hole at the aim point', JSON.stringify(blue.at));
check(blue.d[1] < blue.d[0] && blue.d[2] < blue.d[1] && blue.d[blue.d.length - 1] < 30, 'it pulls a monster in toward its centre over time', blue.d.join(' -> '));
check(blue.hurt > 0 && blue.far === 0 && blue.farHurt === 0, 'and crushes what it pulls in; anything out of reach is left alone', '-' + blue.hurt);
check(blue.over, 'it lasts about three seconds');
const warp = JSON.parse(q(`(function(){ ${GOJO_SETUP}(3); monsters = []; clearGojoOrbs();
   useMoveQ(player, 4800, 2750); for (var f = 0; f < 20; f++) updateGojoOrbs();
   useMoveQ(player, 4800, 2750);
   return JSON.stringify({ x: player.x, y: player.y }); })()`));
check(warp.x === 4800 && warp.y === 2750, 'pressing Z again while Blue is out pulls Gojo to it', warp.x + ',' + warp.y);

// 6. Hollow Purple: the chant, red + blue merging, then a slow sphere that erases its path.
const purple = JSON.parse(q(`(function(){ ${GOJO_SETUP}(3); monsters = []; gameEffects.length = 0; clearGojoOrbs();
   var a = ${mon(4700, 2750, '{ speed: 0 }')}, b = ${mon(4900, 2770, '{ speed: 0 }')}, off = ${mon(4700, 3000, '{ speed: 0 }')};
   var boss = ${mon(5100, 2750, '{ speed: 0, r: 32, hp: 50000, maxHp: 50000, isBoss: true, name: "BOSS" }')};
   monsters.push(a, b, off, boss);
   bullets.push({ x:4800, y:2750, vx:0, vy:0, life:9999, damage:5, owner:'monster', from:'Z', color:'#fff' });
   var shotObj = bullets[0];
   useMoveF(player, 5000, 2750);
   ${flush}
   var orb = gojoOrbs[0];
   var charging = !!orb && orb.phase === 'charge' && !!orb.fxA && !!orb.fxB && !player.form;
   var gapStart = orb && orb.fxA ? Math.hypot(orb.fxA.x - orb.fxB.x, orb.fxA.y - orb.fxB.y) : 0;
   for (var f = 0; f < 30; f++) updateGojoOrbs();
   var gapMid = orb && orb.fxA ? Math.hypot(orb.fxA.x - orb.fxB.x, orb.fxA.y - orb.fxB.y) : 0;
   for (var f2 = 0; f2 < 20; f2++) updateGojoOrbs();
   var launched = orb.phase === 'fly' && !orb.fxA && player.form && player.form.key === 'sixeyes';
   var x0 = orb.x; updateGojoOrbs(); var speed = orb.x - x0;
   for (var f3 = 0; f3 < 260 && gojoOrbs.length; f3++) updateGojoOrbs();
   return JSON.stringify({ charging: charging, gapStart: gapStart, gapMid: gapMid, launched: launched, speed: speed, r: orb.r,
      aDead: monsters.indexOf(a) < 0, bDead: monsters.indexOf(b) < 0, offHurt: 5000 - off.hp,
      boss: monsters.indexOf(boss) >= 0 ? 50000 - boss.hp : -1, shotGone: bullets.indexOf(shotObj) < 0, over: gojoOrbs.length === 0 }); })()`));
check(purple.charging && purple.gapMid < purple.gapStart, 'Hollow Purple charges: a red orb and a blue orb at his sides close in',
      Math.round(purple.gapStart) + ' -> ' + Math.round(purple.gapMid) + ' apart');
check(purple.launched && purple.r >= 50 && purple.speed > 0 && purple.speed < 8,
      'they merge into a large purple sphere that travels forward slowly, and Six Eyes opens', 'r ' + purple.r + ', ' + purple.speed + '/frame');
check(purple.aDead && purple.bDead && purple.offHurt === 0, 'it erases every monster on its path and nothing off it');
check(purple.boss > 0, 'a boss survives it but takes a heavy hit', '-' + purple.boss);
check(purple.shotGone, 'it destroys enemy projectiles in its path');
check(purple.over, 'and it ends after its run');

// 7. Six Eyes: blindfold off, faster Infinity, shorter Red / Blue.
const six = JSON.parse(q(`(function(){ ${GOJO_SETUP}(3); monsters = []; clearGojoOrbs();
   var before = gojoBlindfolded(player);
   player._inf = 50; player._infQuiet = 100; player._infDown = 0; for (var f = 0; f < 20; f++) tickInfinity(player); var plain = player._inf - 50;
   enterForm(player, 'sixeyes');
   var after = gojoBlindfolded(player);
   player._inf = 50; player._infQuiet = 100; for (var f2 = 0; f2 < 20; f2++) tickInfinity(player); var fast = player._inf - 50;
   player._eCd = 0; player.moveQCooldown = 0; useAbility(player, 4800, 2750); useMoveQ(player, 4800, 2750);
   var e1 = player._eCd, z1 = player.moveQCooldown;
   exitForm(player, true); clearGojoOrbs();
   player._eCd = 0; player.moveQCooldown = 0; useAbility(player, 4800, 2750); useMoveQ(player, 4800, 2750);
   return JSON.stringify({ before: before, after: after, back: gojoBlindfolded(player), plain: plain, fast: fast,
      e1: e1, z1: z1, e0: player._eCd, z0: player.moveQCooldown }); })()`));
check(six.before && !six.after && six.back, 'Six Eyes takes the blindfold off (and it goes back on after)');
check(six.fast > six.plain * 2, 'Infinity refills faster with Six Eyes open', '+' + six.plain.toFixed(1) + ' vs +' + six.fast.toFixed(1) + ' in 20 frames');
check(six.e1 < six.e0 && six.z1 < six.z0, 'Red and Blue come back sooner in Six Eyes', 'E ' + six.e1 + ' vs ' + six.e0 + ', Z ' + six.z1 + ' vs ' + six.z0);

// 8. Everything draws in 2D without throwing, and the domain is a starry void.
const draws = q(`(function(){ ${GOJO_SETUP}(3); clearGojoOrbs(); gameEffects.length = 0;
   useAbility(player, 4800, 2750); useMoveQ(player, 4800, 2900); _gojoHollowPurple(player, 4900, 2750);
   for (var f = 0; f < 5; f++) updateGojoOrbs();
   gojoDomain(player);
   _infRipple(4520, 2750);
   try { draw2DEffects(-1e9, -1e9, 1e9, 1e9); } catch (e) { return e.message; }
   var types = {}; gameEffects.forEach(function(e){ types[e.type + (e.kind ? ':' + e.kind : '')] = 1; });
   return Object.keys(types).sort().join(','); })()`);
check(/gorb:red/.test(draws) && /gorb:blue/.test(draws) && /gorb:purple/.test(draws) && /ripple/.test(draws),
      'Red, Blue, Purple and the Infinity ripple are all spawnGameEffect effects that draw in 2D', draws);
check(/voidstars/.test(draws) && /dome/.test(draws), 'Unlimited Void is a dark dome full of stars and streaks of light');
q(`clearGojoOrbs(); gameEffects.length = 0;`);
// ---- Sikuna: the same E + Z + X combo opens Malevolent Shrine ----
console.log('\nSikuna Domain:');
const SIK_SETUP = GOJO_SETUP.replace("c.name === 'Gojo'", "c.name === 'Sikuna'");
const sCombo = JSON.parse(q(`(function(){ ${SIK_SETUP}(3); gameEffects.length = 0;
   var r = [abilityKeyPress('e', 1000), abilityKeyPress('z', 1100), abilityKeyPress('x', 1250)];
   ${flush}
   return JSON.stringify({ r:r, domain: !!player._domain, cd: player._domainCd, ecd: player._eCd, zcd: player.moveQCooldown,
      xcd: player.moveFCooldown, form: !!player.form,
      dome: gameEffects.some(function(e){ return e.type === 'dome' && e.maxR >= 300; }) }); })()`));
check(sCombo.r[2] === 'domain' && sCombo.domain && sCombo.cd === 3600, 'E + Z + X inside the window opens Malevolent Shrine', JSON.stringify(sCombo.r));
check(sCombo.ecd === 0 && sCombo.zcd === 0 && sCombo.xcd === 0 && !sCombo.form, 'and Finger / World Cutting Slash / Demon Form do NOT also fire',
      'E ' + sCombo.ecd + ' / Z ' + sCombo.zcd + ' / X ' + sCombo.xcd);
check(sCombo.dome, 'the Shrine draws a big dome through spawnGameEffect (2D and 3D)');
const sDot = JSON.parse(q(`(function(){ ${SIK_SETUP}(3); gameEffects.length = 0; openDomain(player);
   var m0 = monsters[0].hp, b0 = monsters[5].hp, hits = 0, last = monsters[0].hp, slowed = true, frozen = false;
   for (var f = 0; f < 300; f++) { tickPlayerTimers(player);
      if (monsters[0].hp < last) { hits++; last = monsters[0].hp; }
      if (f < 290) monsters.forEach(function(m){ if (!(m.slow > 0)) slowed = false; if (m.frozen > 0) frozen = true; }); }
   var cuts = 0; gameEffects.forEach(function(e){ if (e.type === 'cut') cuts++; });
   var drew = 'ok'; try { draw2DEffects(-1e9, -1e9, 1e9, 1e9); } catch (e) { drew = e.message; }
   return JSON.stringify({ small: m0 - monsters[0].hp, boss: b0 - monsters[5].hp, hits: hits, slowed: slowed, frozen: frozen,
      cuts: cuts, drew: drew, over: player._domain === null }); })()`));
check(sDot.hits >= 20 && sDot.small > 0 && sDot.over, 'monsters inside are slashed over and over, then it closes', sDot.hits + ' hits, -' + sDot.small);
check(sDot.slowed && !sDot.frozen, 'they are slowed the whole time, never frozen');
check(sDot.boss > 0 && sDot.boss < sDot.small, 'bosses take reduced but real damage', 'monster -' + sDot.small + ', boss -' + sDot.boss);
check(sDot.cuts > 0 && sDot.drew === 'ok', 'red cut marks land on the monsters and draw in 2D', sDot.cuts + ' cuts / ' + sDot.drew);
const gDot = JSON.parse(q(`(function(){ ${GOJO_SETUP}(3); gojoDomain(player); var m0 = monsters[0].hp;
   for (var f = 0; f < 360; f++) tickPlayerTimers(player); return JSON.stringify({ d: m0 - monsters[0].hp, dmg: player.damage }); })()`));
check(sDot.small >= gDot.d * 0.75 && sDot.small <= gDot.d * 1.25, 'total damage is in line with Unlimited Void', 'shrine -' + sDot.small + ' vs void -' + gDot.d);
const sTwo = JSON.parse(q(`(function(){ ${SIK_SETUP}(3);
   var r = [abilityKeyPress('x', 1000), abilityKeyPress('z', 1100)];
   ${flush}
   return JSON.stringify({ r:r, domain: !!player._domain, cd: player._domainCd, zcd: player.moveQCooldown, xcd: player.moveFCooldown }); })()`));
check(!sTwo.domain && sTwo.cd === 0 && sTwo.zcd > 0 && sTwo.xcd > 0, 'only two keys: World Cutting Slash and Demon Form fire normally, no Domain', JSON.stringify(sTwo));
const sLock = JSON.parse(q(`(function(){ ${SIK_SETUP}(2);
   var r = [abilityKeyPress('e', 1000), abilityKeyPress('z', 1050), abilityKeyPress('x', 1100)];
   ${flush}
   return JSON.stringify({ r:r, domain: !!player._domain, cd: player._domainCd, zcd: player.moveQCooldown }); })()`));
check(!sLock.domain && sLock.cd === 0 && sLock.r.every(function(x){ return x === 'fired'; }) && sLock.zcd > 0,
      'at Lv.2 (Demon Form locked) there is no Domain, and keys are not held back', JSON.stringify(sLock.r));
const sCool = JSON.parse(q(`(function(){ ${SIK_SETUP}(3); openDomain(player); player._domain = null;
   player._eCd = 0; player.moveQCooldown = 0; player.moveFCooldown = 0;
   var r = [abilityKeyPress('e', 5000), abilityKeyPress('z', 5050), abilityKeyPress('x', 5100)];
   ${flush}
   var again = !!player._domain;
   updateHUD(); var hud = document.getElementById('ability-display').textContent || '';
   if (player.form) exitForm(player, true);
   player._domainCd = 0; updateHUD(); var hudReady = document.getElementById('ability-display').textContent || '';
   return JSON.stringify({ r:r, again: again, hud: hud, hudReady: hudReady, ready: domainReady(player) }); })()`));
check(!sCool.again && sCool.r.every(function(x){ return x === 'fired'; }), 'on cooldown the combo does nothing special; the keys fire normally', JSON.stringify(sCool.r));
check(/👹 Domain \d+s/.test(sCool.hud) && /👹 E\+Z\+X Domain/.test(sCool.hudReady), 'the HUD line shows "👹 E+Z+X Domain" and its cooldown', sCool.hud + ' / ' + sCool.hudReady);
check(sCool.ready, 'and it is ready again once the cooldown runs out');
check(q(`(function(){ ${SIK_SETUP}(3); return gojoDomainReady(player) === false && domainReady(player) === true; })()`) === true,
      "Sikuna's Domain is his own, not Gojo's");
// ---- Sikuna [Z]: World Cutting Slash ----
console.log('\nSikuna World Cutting Slash:');
const wcs = JSON.parse(q(`(function(){ ${SIK_SETUP}(3); gameEffects.length = 0; document.getElementById('status-overlay').textContent = '';
   // Five monsters on the line (some far away), two off it, a boss on it, enemy shots on and off it.
   monsters.forEach(function(m, i){ m.hp = 5000; m.maxHp = 5000; });
   monsters[0].x = 4600; monsters[1].x = 3200; monsters[2].x = 6100; monsters[3].x = 4300; monsters[3].y = 2765;
   monsters[4].x = 4560; monsters[4].y = 2750 + 30;   // body (r 14) still touches the 46-wide band
   monsters.push({ x:4600, y:2900, r:14, hp:500, maxHp:500, name:'OFF1', emoji:'Z', color:'#7bed9f', speed:1, score:1, damage:5 });
   monsters.push({ x:5200, y:2600, r:14, hp:500, maxHp:500, name:'OFF2', emoji:'Z', color:'#7bed9f', speed:1, score:1, damage:5 });
   var boss = monsters[5]; boss.y = 2750; boss.x = 4800;
   bullets.push({ x:4900, y:2752, vx:-3, vy:0, owner:'monster', color:'#f00' });
   bullets.push({ x:3000, y:2748, vx:3, vy:0, owner:'monster', color:'#f00' });
   bullets.push({ x:4900, y:2950, vx:-3, vy:0, owner:'monster', color:'#f00' });
   var sc0 = score;
   useMoveQ(player, 4700, 2750);
   var chant = { banner: String(document.getElementById('status-overlay').textContent || ''), n: monsters.length, cd: player.moveQCooldown, queued: __deferred.length };
   ${flush}
   var names = monsters.map(function(m){ return m.name; });
   var drew = 'ok'; try { draw2DEffects(-1e9, -1e9, 1e9, 1e9); } catch (e) { drew = e.message; }
   var types = {}; gameEffects.forEach(function(e){ types[e.type] = (types[e.type] || 0) + 1; });
   var wc = gameEffects.filter(function(e){ return e.type === 'worldcut'; })[0];
   return JSON.stringify({ chant: chant, banner: String(document.getElementById('status-overlay').textContent || ''), names: names, boss: boss.hp, bossMax: boss.maxHp,
      bossAlive: monsters.indexOf(boss) >= 0, off: monsters.filter(function(m){ return /OFF/.test(m.name); }).length,
      bullets: bullets.filter(function(b){ return b.owner === 'monster'; }).map(function(b){ return b.x + ',' + b.y; }),
      types: types, len: wc ? wc.maxR : 0, life: wc ? wc.maxT : 0, drew: drew, scored: score > sc0, cd: player.moveQCooldown }); })()`));
check(wcs.chant.n === 8 && wcs.chant.queued > 0 && /Dragon scales/.test(wcs.chant.banner),
      'Z starts the chant first: "Dragon scales… Recoil… Twin meteors…", nothing cut yet', wcs.chant.banner);
check(/WORLD CUTTING SLASH/.test(wcs.banner), 'then the slash lands with its banner', wcs.banner);
check(wcs.names.filter(function(n){ return n === 'Z'; }).length === 0, 'every ordinary monster touching the line is wiped out, near or far',
      'left: ' + wcs.names.join(','));
check(wcs.off === 2, 'monsters off the line survive', wcs.off + ' of 2');
check(wcs.bossAlive && wcs.boss < wcs.bossMax * 0.8 && wcs.boss > 0, 'a boss on the line takes heavy damage (~28%) but survives',
      wcs.boss + ' / ' + wcs.bossMax);
check(wcs.bullets.length === 1 && wcs.bullets[0] === '4900,2950', 'enemy shots on the line are erased, others are not', wcs.bullets.join(' '));
check(wcs.types.worldcut === 1 && wcs.len >= 2000 && wcs.types.halves >= 5 && wcs.drew === 'ok',
      'a world-spanning cut and split-in-two monsters, through spawnGameEffect (2D + 3D)', JSON.stringify(wcs.types) + ' len ' + wcs.len);
check(wcs.scored, 'kills award score as usual');
check(wcs.chant.cd >= 1800, 'a long cooldown (30 s)', wcs.chant.cd + ' frames');
const wcsCool = JSON.parse(q(`(function(){ ${SIK_SETUP}(3); gameEffects.length = 0;
   player.moveQCooldown = 600; var n0 = monsters.length;
   useMoveQ(player, 4700, 2750); var queued = __deferred.length; ${flush}
   updateHUD(); var hud = document.getElementById('ability-display').textContent || '';
   player.moveQCooldown = 0; updateHUD(); var hudReady = document.getElementById('ability-display').textContent || '';
   return JSON.stringify({ queued: queued, n: monsters.length, n0: n0, hud: hud, hudReady: hudReady,
      cut: gameEffects.some(function(e){ return e.type === 'worldcut'; }) }); })()`));
check(wcsCool.queued === 0 && wcsCool.n === wcsCool.n0 && !wcsCool.cut, 'on cooldown Z does nothing');
check(/\[Z\] World Cutting Slash 10s/.test(wcsCool.hud) && /\[Z\] World Cutting Slash( |$)/.test(wcsCool.hudReady),
      'the HUD line shows "[Z] World Cutting Slash" and its countdown', wcsCool.hud.match(/\[Z\][^|]*/) + ' / ' + wcsCool.hudReady.match(/\[Z\][^|]*/));
const wcsDom = JSON.parse(q(`(function(){ ${SIK_SETUP}(3); gameEffects.length = 0;
   var r = [abilityKeyPress('e', 9000), abilityKeyPress('z', 9100), abilityKeyPress('x', 9200)];
   ${flush}
   return JSON.stringify({ r: r, domain: !!player._domain, zcd: player.moveQCooldown,
      cut: gameEffects.some(function(e){ return e.type === 'worldcut'; }) }); })()`));
check(wcsDom.r[2] === 'domain' && wcsDom.domain && wcsDom.zcd === 0 && !wcsDom.cut,
      'E + Z + X still opens Malevolent Shrine, and the slash does not fire', JSON.stringify(wcsDom));
const wcsNet = JSON.parse(q(`(function(){ ${SIK_SETUP}(3); gameEffects.length = 0;
   var sent = [], realB = mpBroadcast, realMode = NET.mode, realStarted = NET.started;
   mpBroadcast = function(m){ sent.push(m); }; NET.mode = 'host'; NET.started = true;
   try { useMoveQ(player, 4700, 2750); ${flush} } finally { mpBroadcast = realB; NET.mode = realMode; NET.started = realStarted; }
   var ev = sent.filter(function(m){ return m.t === 'event' && m.type === 'wcs'; });
   var cut = ev.filter(function(m){ return m.phase === 'cut'; })[0];
   gameEffects.length = 0;
   if (cut) mpHandleEvent(JSON.parse(JSON.stringify(cut)));
   return JSON.stringify({ phases: ev.map(function(m){ return m.phase; }), cuts: cut ? cut.cuts.length : 0,
      guestSees: gameEffects.some(function(e){ return e.type === 'worldcut'; }) }); })()`));
check(wcsNet.phases.join(',') === 'chant,cut' && wcsNet.cuts > 0 && wcsNet.guestSees,
      'multiplayer: the host broadcasts the chant and the cut, and a guest draws it', JSON.stringify(wcsNet));
q(`gameRunning = false; NET.mode = 'single';`);

console.log('\n' + (ok ? 'ULTIMATES PASS' : 'ULTIMATES FAIL'));

process.exit(ok ? 0 : 1);
