// Every class must carry its OWN custom kit — and every shape it names must really be drawable.
// A shape with no case in the switch renders nothing at all and throws no error: the exact
// bug this file exists to catch.
const fs = require('fs');
const file = process.argv[2] || 'index.html';
const h = fs.readFileSync(file, 'utf8');
const L = h.split('\n');
let pass = 0, fail = 0;
const ok  = (m, extra='') => { pass++; console.log('  PASS ' + m + (extra ? '  (' + extra + ')' : '')); };
const bad = (m, extra='') => { fail++; console.log('  FAIL ' + m + (extra ? '  — ' + extra : '')); };
const chk = (c, m, extra='') => c ? ok(m, extra) : bad(m, extra);

// --- read the switch vocabularies straight out of the game ---
function casesAt(lineNo) {
    const out = []; let d = 0, seen = false;
    for (let i = lineNo - 1; i < L.length; i++) {
        const m = L[i].match(/case '([^']+)'/g);
        if (m) out.push(...m.map(x => x.slice(6, -1)));
        for (const ch of L[i]) { if (ch === '{') { d++; seen = true; } else if (ch === '}') d--; }
        if (seen && d <= 0) break;
    }
    return new Set(out);
}
function switchLineAfter(marker, needle) {
    const from = h.indexOf(marker);
    const at = h.indexOf(needle, from);
    return h.slice(0, at).split('\n').length;
}
const weapon2d = casesAt(switchLineAfter('const circ=(x,y,r,col)', 'switch(shape){'));
const weapon3d = casesAt(switchLineAfter('const cone= (r,h,mat,x,y,z,rx)', 'switch (shape) {'));
const accents  = casesAt(switchLineAfter("const dmat = new THREE.MeshBasicMaterial", 'switch (shape) {'));
const relic3d  = casesAt(switchLineAfter('const RELIC_STAB', 'switch (shape) {'));

const classBlock = h.slice(h.indexOf('const CLASSES = ['), h.indexOf('// ======================== MONSTER CLASSES'));
const CLASS = [...classBlock.matchAll(/\{ name:'([^']+)'/g)].map(m => m[1]);

console.log('\nEvery class brings its own kit\n');

// --- 1. a custom weapon, not the generic fallback ---
const cw = h.slice(h.indexOf('const CWEAPON = {'), h.indexOf('const BEFF = {'));
const wEntries = [...cw.matchAll(/'([^']+)':\s*\[\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'/g)]
    .map(m => ({ cls: m[1], name: m[2], shape: m[6], accent: m[7] }));
const withWeapon = new Set(wEntries.map(e => e.cls));
const noWeapon = CLASS.filter(c => !withWeapon.has(c));
chk(noWeapon.length === 0, 'every class has a custom weapon', noWeapon.length ? noWeapon.join(', ') : CLASS.length + ' classes');

const names = wEntries.map(e => e.name);
chk(new Set(names).size === names.length, 'and no two classes carry the same weapon', new Set(names).size + ' distinct');

const deadShape = wEntries.filter(e => !weapon2d.has(e.shape) || !weapon3d.has(e.shape));
chk(deadShape.length === 0, 'every weapon shape is drawable in 2D and 3D',
    deadShape.length ? deadShape.map(e => e.cls + ':' + e.shape).join(', ') : wEntries.length + ' checked');

const deadAccent = wEntries.filter(e => !accents.has(e.accent));
chk(deadAccent.length === 0, 'every 3D emblem has a real model',
    deadAccent.length ? deadAccent.map(e => e.cls + ':' + e.accent).join(', ') : wEntries.length + ' checked');

// --- 2. every ultimate drops its own relic ---
const relicBlock = h.slice(h.indexOf('const RELIC = {'), h.indexOf('const relic = RELIC[name]'));
const relics = new Map([...relicBlock.matchAll(/'([^']+)':\s*\{ shape:'([a-z]+)'/g)].map(m => [m[1], m[2]]));
const mv = h.slice(h.indexOf('const MOVES = '), h.indexOf('function useAbility'));
const ults = [];
for (const c of CLASS) {
    const i = mv.indexOf("'" + c + "': {");
    if (i < 0) continue;
    const m = mv.slice(i, i + 2500).match(/x:\{[^\n]*?name:'([^']+)'/);
    if (m) ults.push({ cls: c, ult: m[1] });
}
const noRelic = ults.filter(u => !relics.has(u.ult));
chk(noRelic.length === 0, 'every ultimate leaves its own relic behind, not the fallback orb',
    noRelic.length ? noRelic.map(u => u.cls + ':' + u.ult).join(', ') : ults.length + ' ultimates');

const deadRelic = [...relics.entries()].filter(([, sh]) => !relic3d.has(sh));
chk(deadRelic.length === 0, 'and every relic shape has a model to build',
    deadRelic.length ? deadRelic.map(([n, s]) => n + ':' + s).join(', ') : relics.size + ' relics');

// --- 3. look: colour + decoration ---
const colBlock = h.slice(h.indexOf("let bodyColor = '#ff9f43';"), h.indexOf('drawClassBodyBehind(p.cls.name'));
const coloured = new Set([...colBlock.matchAll(/p\.cls\.name===?'([^']+)'/g)].map(m => m[1]));
const noColour = CLASS.filter(c => !coloured.has(c));
chk(noColour.length === 0, 'every class has its own body colour',
    noColour.length ? noColour.join(', ') : coloured.size + ' coloured');

const behindLine = h.slice(0, h.indexOf('function drawClassBodyBehind')).split('\n').length;
const decorated = casesAt(behindLine);
const noDeco = CLASS.filter(c => !decorated.has(c));
chk(noDeco.length === 0, 'and its own cape / trail / aura behind it',
    noDeco.length ? noDeco.join(', ') : CLASS.length + ' decorated');

// --- 4. the Elemental Mage must NOT get a flat on-hit effect stamped over its six ---
const beff = h.slice(h.indexOf('const BEFF = {'), h.indexOf('for (const c of CLASSES)'));
chk(!/'Elemental Mage'\s*:/.test(beff),
    'the Elemental Mage keeps all six elements (no single effect stamped over them)');

// --- 5. RUN the decorations. A static case list proves nothing: the body can still throw
//        (a missing global, an undefined helper) or quietly draw zero pixels.
{
    const src = (() => {
        const i = h.indexOf('function drawClassBodyBehind');
        let d = 0, seen = false;
        for (let k = i; k < h.length; k++) {
            if (h[k] === '{') { d++; seen = true; } else if (h[k] === '}') { d--; if (seen && d === 0) return h.slice(i, k + 1); }
        }
    })();
    let calls = 0;
    const grad = { addColorStop() {} };
    const ctx = new Proxy({}, {
        get(_, k) {
            if (k === 'createRadialGradient' || k === 'createLinearGradient') return () => grad;
            if (k === 'measureText') return () => ({ width: 8 });
            if (k === 'canvas') return { width: 800, height: 600 };
            if (typeof k === 'string' && /^(fill|stroke|arc|move|line|quad|bez|rect|round|ellipse|text|image)/i.test(k)) {
                return (...a) => { calls++; };
            }
            return () => { calls++; };
        },
        set() { return true; },
    });
    const make = new Function('ctx', 'Math', 'Date', src + '; return drawClassBodyBehind;');
    const draw = make(ctx, Math, Date);
    const threw = [], silent = [];
    for (const c of CLASS) {
        const before = calls;
        try { draw(c, 400, 300, 14); } catch (e) { threw.push(c + ': ' + e.message); continue; }
        if (calls === before) silent.push(c);
    }
    chk(threw.length === 0, 'every decoration actually runs without throwing',
        threw.length ? threw.join(' | ') : CLASS.length + ' classes drawn');
    chk(silent.length === 0, 'and every one of them puts pixels on the screen',
        silent.length ? silent.join(', ') : calls + ' draw calls');
}

console.log('\n' + (fail ? 'FAILED ' + fail + ' of ' + (pass + fail) : 'all ' + pass + ' checks pass') + '\n');
process.exit(fail ? 1 : 0);
