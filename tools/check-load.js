// Actually EVALUATE the game's top-level code in a tolerant fake DOM. node --check only parses;
// it cannot see a temporal-dead-zone reference, an undefined global, or anything else that only
// explodes when the script is really run. This does.
const fs = require('fs'), vm = require('vm');
const html = fs.readFileSync(process.argv[2] || 'index.html', 'utf8');
const blocks = [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const code = blocks.join('\n;\n');

// A value that tolerates absolutely anything done to it.
const anyHandler = {
  get(t, k) {
    if (k === Symbol.toPrimitive) return () => 0;
    if (k === 'then') return undefined;               // never look like a promise
    if (k === Symbol.iterator) return function*(){};
    if (k === 'length') return 0;
    if (k === 'style' || k === 'dataset' || k === 'classList') return mkAny();
    return mkAny();
  },
  set() { return true },
  has() { return true },
  apply() { return mkAny() },
  construct() { return mkAny() },
  deleteProperty() { return true },
  ownKeys() { return [] },
  getOwnPropertyDescriptor() { return { configurable: true, enumerable: false } },
};
function mkAny() { const f = function(){}; f.nodeType = 1; return new Proxy(f, anyHandler); }

const store = {};
const sandbox = {
  console,
  document: new Proxy(function(){}, {
    ...anyHandler,
    get(t, k) {
      if (k === 'getElementById' || k === 'querySelector' || k === 'createElement') return () => mkAny();
      if (k === 'querySelectorAll') return () => [];
      if (k === 'addEventListener' || k === 'removeEventListener') return () => {};
      if (k === 'hidden') return false;
      if (k === 'body' || k === 'documentElement' || k === 'head') return mkAny();
      return mkAny();
    },
  }),
  localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k,v) => { store[k] = String(v) },
                  removeItem: k => { delete store[k] }, clear: () => {} },
  navigator: { maxTouchPoints: 0, userAgent: 'node', language: 'en' },
  performance: { now: () => 0 },
  location: { href: 'file:///index.html', protocol: 'file:' },
  requestAnimationFrame: () => 1, cancelAnimationFrame: () => {},
  setTimeout: () => 1, clearTimeout: () => {}, setInterval: () => 1, clearInterval: () => {},
  alert: () => {}, confirm: () => true, prompt: () => null,
  THREE: mkAny(), Peer: mkAny(), AudioContext: mkAny(), webkitAudioContext: mkAny(),
  Image: function(){ return mkAny() }, Audio: function(){ return mkAny() },
  matchMedia: () => ({ matches:false, addEventListener(){}, addListener(){} }),
  MutationObserver: function(){ return { observe(){}, disconnect(){} } },
  fetch: () => Promise.resolve(mkAny()),
  Math, JSON, Date, BigInt, Object, Array, String, Number, Boolean, Map, Set, WeakMap, WeakSet,
  Promise, RegExp, Error, TypeError, Symbol, Proxy, Reflect, isNaN, isFinite, parseInt, parseFloat,
  encodeURIComponent, decodeURIComponent, Float32Array, Uint8Array, Int32Array, ArrayBuffer,
};
sandbox.addEventListener = () => {}; sandbox.removeEventListener = () => {};
sandbox.dispatchEvent = () => true;
sandbox.getComputedStyle = () => mkAny();
sandbox.innerWidth = 1440; sandbox.innerHeight = 900; sandbox.devicePixelRatio = 2;
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.self = sandbox;

try {
  vm.runInNewContext(code, vm.createContext(sandbox), { filename: 'game.js', timeout: 20000 });
  console.log('LOAD OK — the script evaluates top to bottom with no error.');
  process.exit(0);
} catch (e) {
  const line = (e.stack || '').match(/game\.js:(\d+)/);
  console.log('LOAD FAILED');
  console.log('  ' + e.name + ': ' + e.message);
  if (line) {
    const n = +line[1];
    console.log('  at script line ' + n + ':');
    const src = code.split('\n');
    for (let i = Math.max(0, n-3); i < Math.min(src.length, n+2); i++)
      console.log('   ' + (i+1 === n ? '>' : ' ') + ' ' + String(i+1).padStart(6) + '  ' + src[i].slice(0,110));
  }
  process.exit(1);
}
