// The Elemental Mage must be able to CHOOSE what it fires — and the choice has to survive
// everything downstream that repaints a bullet.
const fs = require('fs');
const file = process.argv[2] || 'index.html';
const h = fs.readFileSync(file, 'utf8');
let pass = 0, fail = 0;
const chk = (c, m, e = '') => { c ? pass++ : fail++; console.log('  ' + (c ? 'PASS ' : 'FAIL ') + m + (e ? '  ' + (c ? '(' + e + ')' : '— ' + e) : '')); };

console.log('\nChoosing your element\n');

const ELEMENTS = [...h.slice(h.indexOf('const ELEMENTS = ['), h.indexOf('const ELEM_RAINBOW'))
    .matchAll(/name:'([^']+)'/g)].map(m => m[1]);
chk(ELEMENTS.length === 6, 'all six elements are pickable', ELEMENTS.join(','));

// --- pickedElement really returns what you picked, and rainbow really rotates ---
const src = (() => {
    const i = h.indexOf('function pickedElement');
    let d = 0, seen = false;
    for (let k = i; k < h.length; k++) {
        if (h[k] === '{') { d++; seen = true; } else if (h[k] === '}') { d--; if (seen && d === 0) return h.slice(i, k + 1); }
    }
})();
const EL = ELEMENTS.map((n, i) => ({ name: n, emoji: 'x', color: '#' + i }));
const pick = new Function('ELEMENTS', 'ELEM_RAINBOW', src + '; return pickedElement;')(EL, -1);

let exact = true;
for (let i = 0; i < 6; i++) if (pick({ elemPick: i }).name !== ELEMENTS[i]) exact = false;
chk(exact, 'picking an element fires THAT element', '6/6');

const p = { elemPick: -1 }, seen = new Set();
for (let i = 0; i < 24; i++) seen.add(pick(p).name);
chk(seen.size === 6, 'and rainbow still cycles through every one', seen.size + ' over 24 shots');

const p2 = { };
chk(pick(p2) && seen.has(pick(p2).name), 'a mage who has never chosen still fires (defaults to rainbow)');

// --- the choice must be applied AFTER the weapon repaints the bullet ---
const shot = h.slice(h.indexOf('const _mageEl ='), h.indexOf('bullets.push(b);'));
const applications = (shot.match(/if \(_mageEl\)/g) || []).length;
chk(applications >= 2, 'the choice is re-applied after the weapon repaints the bullet', applications + ' applications');
const lastApply = shot.lastIndexOf('if (_mageEl)');
chk(lastApply > shot.lastIndexOf('aw.bcolor'), 'so an equipped weapon cannot wash every element the same colour');
chk(/if \(_mageEl\)[^\n]*petElement/.test(shot), 'and it sets petElement — the field the on-hit switch reads');

// --- the on-hit switch handles every element it can now be given ---
const sw = (() => { const a = h.indexOf('switch (b.petElement)'); let d = 0, seen = false;
    for (let k = a; k < h.length; k++) { if (h[k] === '{') { d++; seen = true; }
        else if (h[k] === '}') { d--; if (seen && d === 0) return h.slice(a, k + 1); } } })();
const missing = ELEMENTS.filter(e => !sw.includes("case '" + e + "'"));
chk(missing.length === 0, 'every element you can pick has a real on-hit effect',
    missing.length ? missing.join(',') : ELEMENTS.length + ' handled');

// --- controls exist on all three input paths ---
chk(/k === 'q'/.test(h) && /'1234567'\.indexOf\(k\)/.test(h), 'keyboard: [Q] cycles, [1]-[7] pick directly');
chk(/class="elem-chip"|'elem-chip'/.test(h) && /addEventListener\('click', ev => \{ ev\.preventDefault\(\); setElement\(idx\)/.test(h),
    'touch: the chips are tappable, so it works on a phone too');
chk(/elemPick:/.test(h) && /d\.elemPick/.test(h), 'multiplayer: a guest’s choice reaches the host that simulates their shots');
chk(/elemPart/.test(h) && /renderElemPicker\(\)/.test(h), 'the HUD names the element you are about to fire');

// --- the picker must not appear for the other 34 classes ---
chk(/function canPickElement/.test(h) && /cls\.allElements/.test(h),
    'and the picker only shows for a class that actually commands the elements');

// --- every element must do something, and something DIFFERENT from the others ---
{
    // Pull the on-hit switch out and run it against a fake monster so we measure the real behaviour,
    // not a grep for the word "case".
    const start = h.indexOf('switch (b.petElement)');
    let d = 0, seen = false, end = start;
    for (let k = start; k < h.length; k++) {
        if (h[k] === '{') { d++; seen = true; } else if (h[k] === '}') { d--; if (seen && d === 0) { end = k + 1; break; } }
    }
    const body = h.slice(start, end);

    const names = ELEMENTS;
    const signature = new Map();
    const dead = [], noVisual = [];
    for (const name of names) {
        const log = { dmg: 0, fx: [], status: [], heal: 0, tiles: 0, zaps: 0, particles: 0 };
        const m = { x: 100, y: 100, r: 14, hp: 500, maxHp: 500 };
        const other = { x: 150, y: 100, r: 14, hp: 500, maxHp: 500 };
        const third = { x: 200, y: 100, r: 14, hp: 500, maxHp: 500 };
        const monsters = [m, other, third];
        const track = obj => new Proxy(obj, { set(t, k, v) {
            if (typeof k === 'string' && k !== 'hp' && v) log.status.push(k);
            t[k] = v; return true;
        } });
        const env = {
            b: { petElement: name, damage: 20, color: '#fff' }, m: track(m), j: 0, i: 0,
            monsters, bullets: [{}],
            fireTiles: { push: () => log.tiles++ }, poisonTiles: { push: () => log.tiles++ },
            particles: { push: () => log.particles++ }, zaps: { push: () => log.zaps++ },
            hitMonster: (t, k, dm) => { log.dmg += dm; t.hp -= dm; },
            spawnGameEffect: (type) => log.fx.push(type),
            showStatus: () => {}, addShake: () => {}, SFX: { hit() {} },
            _playersScratch: () => [{ hp: 10, maxHp: 100 }],
            player: { hp: 10, maxHp: 100 },
            Math, console,
        };
        const keys = Object.keys(env);
        try {
            new Function(...keys, body)(...keys.map(k => env[k]));
        } catch (e) { dead.push(name + ': ' + e.message); continue; }
        const did = log.dmg > 0 || log.status.length || log.tiles || log.zaps || log.heal ||
                    env._playersScratch()[0].hp > 10;
        if (!did) dead.push(name + ': changed nothing');
        // gameEffects are the ONLY effect layer that renders in BOTH 2D and the Three.js view.
        // Particles alone would make an element invisible in every 3D camera mode.
        if (!log.fx.length) noVisual.push(name);
        signature.set(name, JSON.stringify({
            dmg: log.dmg, status: [...new Set(log.status)].sort(), tiles: log.tiles, zaps: log.zaps, fx: log.fx,
        }));
    }

    chk(dead.length === 0, 'every element actually does something when it hits',
        dead.length ? dead.join(' | ') : names.length + ' elements fired');
    chk(noVisual.length === 0, 'and every one is visible in 3D, not just as 2D particles',
        noVisual.length ? noVisual.join(', ') + ' spawn no gameEffect' : names.length + ' with a 3D effect');
    const sigs = [...signature.values()];
    chk(new Set(sigs).size === names.length, 'and no two elements do the SAME thing',
        new Set(sigs).size + ' of ' + names.length + ' distinct');

    // the specific promise each element makes
    const S = n => JSON.parse(signature.get(n));
    chk(S('Fire').status.includes('_burn'), 'Fire keeps burning after the shot lands');
    chk(S('Ice').status.includes('frozen'), 'Ice freezes solid');
    chk(S('Lightning').zaps >= 2, 'Lightning chains to more than one monster', S('Lightning').zaps + ' jumps');
    chk(S('Poison').status.includes('_plague'), 'Poison spreads');
    chk(S('Shadow').status.includes('_curse'), 'Shadow curses');
    chk(S('Holy').dmg > 0, 'Holy smites for extra damage', '+' + S('Holy').dmg);
}

// --- curse has to be an amp, which means it has to live where all damage passes ---
{
    const hm = h.slice(h.indexOf('function hitMonster'), h.indexOf('function hitMonster') + 900);
    chk(/m\._curse > 0\) dmg = /.test(hm), 'a cursed monster takes more damage from EVERYTHING, not just the mage');
}
// --- burn must be able to kill, and must not corrupt the loop when it does ---
{
    const tickIdx = h.indexOf('if (m._burn > 0)');
    const tick = h.slice(tickIdx, tickIdx + 700);
    chk(/hitMonster\(m, i,/.test(tick), 'burn damages over time (so Fire can finish a monster on its own)');
    chk(/if \(!monsters\[i\] \|\| monsters\[i\] !== m\) continue;/.test(tick),
        'and the loop survives a monster dying to its own burn');
}

console.log('\n' + (fail ? 'FAILED ' + fail + ' of ' + (pass + fail) : 'all ' + pass + ' checks pass') + '\n');
process.exit(fail ? 1 : 0);
