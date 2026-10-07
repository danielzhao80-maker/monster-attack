// Text the player actually reads. Wrong or overflowing words are as broken as a crash — they just
// don't throw, so nothing else catches them.
const fs = require('fs');
const file = process.argv[2] || 'index.html';
const h = fs.readFileSync(file, 'utf8');
let pass = 0, fail = 0;
const chk = (c, m, e = '') => { c ? pass++ : fail++; console.log('  ' + (c ? 'PASS ' : 'FAIL ') + m + (e ? '  ' + (c ? '(' + e + ')' : '— ' + e) : '')); };

console.log('\nWords on the screen\n');

const classBlock = h.slice(h.indexOf('const CLASSES = ['), h.indexOf('// ======================== MONSTER CLASSES'));
const CLASS = [...classBlock.matchAll(/\{ name:'([^']+)'/g)].map(m => m[1]);
const mv = h.slice(h.indexOf('const MOVES = '), h.indexOf('function useAbility'));
const E  = h.slice(h.indexOf('const E_ABILITIES'), h.indexOf('const MOVES = '));

const kit = CLASS.map(c => {
    const i = mv.indexOf("'" + c + "': {");
    const blk = i < 0 ? '' : mv.slice(i, i + 2500);
    const ei = E.indexOf("'" + c + "':");
    return {
        c,
        e: ei < 0 ? null : (E.slice(ei, ei + 220).match(/name:'([^']+)'/) || [])[1],
        z: (blk.match(/z:\{[^\n]*?name:'([^']+)'/) || [])[1],
        x: (blk.match(/x:\{[^\n]*?name:'([^']+)'/) || [])[1],
    };
});

// --- 1. nothing blank, nothing literally "undefined" ---
const blank = [];
for (const k of kit) for (const slot of ['e', 'z', 'x']) {
    const v = k[slot];
    if (!v || !v.trim() || /^(undefined|null|NaN|\?)$/i.test(v)) blank.push(k.c + ' [' + slot.toUpperCase() + ']');
}
chk(blank.length === 0, 'every ability slot has a real name', blank.length ? blank.join(', ') : kit.length * 3 + ' names');

// --- 2. a class must not use one name for two different abilities ---
const dupes = kit.filter(k => {
    const l = [k.e, k.z, k.x].filter(Boolean).map(s => s.toLowerCase());
    return new Set(l).size !== l.length;
}).map(k => k.c + ' (' + [k.e, k.z, k.x].join(' / ') + ')');
chk(dupes.length === 0, 'and no class calls two different abilities the same thing',
    dupes.length ? dupes.join('; ') : CLASS.length + ' classes');

// --- 3. the HUD line has to fit on a phone ---
const LIMIT = 88;
const lines = kit.map(k => ({ c: k.c, n: `X [E] ${k.e} | [Z] ${k.z} | [X] ${k.x}`.length + (k.c === 'Elemental Mage' ? 21 : 0) }));
const tooLong = lines.filter(l => l.n > LIMIT);
const longest = lines.reduce((a, b) => a.n > b.n ? a : b);
chk(tooLong.length === 0, 'the ability line stays a readable length',
    tooLong.length ? tooLong.map(l => l.c + ':' + l.n).join(', ') : 'longest is ' + longest.c + ' at ' + longest.n);

// --- 4. ...and is allowed to wrap when it doesn't ---
const hud3d = (h.match(/id="ability-hud-3d" style="([^"]*)"/) || [])[1] || '';
chk(hud3d && !/white-space:\s*nowrap/.test(hud3d),
    'and it can wrap instead of running off both edges of the screen');
chk(/max-width:/.test(hud3d), 'and it is capped to the screen width', (hud3d.match(/max-width:[^;]*/) || [''])[0]);

// --- 5. the element picker must not sit on top of it ---
const picker = (h.match(/id="elem-picker" style="([^"]*)"/) || [])[1] || '';
const bot = st => Number((st.match(/bottom:(\d+)px/) || [])[1]);
chk(picker && bot(picker) < bot(hud3d),
    'the element picker sits below the ability line, which grows upward',
    'picker ' + bot(picker) + 'px, line ' + bot(hud3d) + 'px');
chk(/flex-wrap:\s*wrap/.test(picker), 'and the chips wrap on a narrow screen');

// --- 6. no unresolved ${...} in text a human typed into a data table ---
// Scoped deliberately to the authored fields. Lexing the whole file for this is a losing fight
// (`${x ? `y` : ''}` nests), and every hit it produced was a template literal doing its job.
{
    const FIELDS = /\b(name|desc|msg|label|title|hint|why|tip):\s*'([^'\n]*)'/g;
    const bad = [...h.matchAll(FIELDS)].filter(m => m[2].includes('${')).map(m => m[1] + ": '" + m[2] + "'");
    const total = [...h.matchAll(FIELDS)].length;
    chk(bad.length === 0, 'no ${...} left stranded in authored text (it would print literally)',
        bad.length ? bad.slice(0, 3).join(' | ') : total + ' authored strings');
}

// --- 7. class descriptions: present, and short enough for the card ---
const descs = [...classBlock.matchAll(/name:'([^']+)'[^\n]*?desc:'([^']*)'/g)].map(m => ({ c: m[1], d: m[2] }));
const noDesc = CLASS.filter(c => !descs.find(d => d.c === c));
chk(noDesc.length === 0, 'every class explains itself on its card', noDesc.length ? noDesc.join(', ') : descs.length + ' described');
const longDesc = descs.filter(d => d.d.length > 64);
chk(longDesc.length === 0, 'and the description fits the card',
    longDesc.length ? longDesc.map(d => d.c + ':' + d.d.length).join(', ') : 'longest ' + Math.max(...descs.map(d => d.d.length)));

// --- 8. a card must not name an ability that has since been renamed ---
{
    const stale = [];
    for (const { c, d } of descs) {
        const k = kit.find(x => x.c === c); if (!k) continue;
        const real = { E: k.e, Z: k.z, X: k.x };
        for (const m of d.matchAll(/\[([EZX])\]\s*([A-Z][A-Za-z0-9'!-]*(?: [A-Z][A-Za-z0-9'!-]*)*)/g)) {
            const claimed = m[2].trim(), actual = real[m[1]];
            if (!actual) continue;
            // Only judge a claim that looks like a Name (capitalised), not prose after the bracket.
            const after = d.slice(m.index + m[0].length).trimStart()[0] || '';
            if (after && !'\u2014\u2022(,."\'!'.includes(after)) continue;   // prose, not a name
            const a = actual.toLowerCase(), cl = claimed.toLowerCase();
            if (a === cl || a.startsWith(cl) || cl.startsWith(a) || cl.includes(a)) continue;
            stale.push(c + ' [' + m[1] + '] says "' + claimed + '", really "' + actual + '"');
        }
    }
    chk(stale.length === 0, 'and no card names an ability that was renamed out from under it',
        stale.length ? stale.join('; ') : descs.length + ' cards checked');
}

console.log('\n' + (fail ? 'FAILED ' + fail + ' of ' + (pass + fail) : 'all ' + pass + ' checks pass') + '\n');
process.exit(fail ? 1 : 0);
