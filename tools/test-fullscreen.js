// Fullscreen has to actually work, and the numbers you need mid-fight have to survive the switch —
// the page's own HUD strip lives OUTSIDE the element that goes fullscreen, so it disappears.
const fs = require('fs');
const file = process.argv[2] || 'index.html';
const h = fs.readFileSync(file, 'utf8');
let pass = 0, fail = 0;
const chk = (c, m, e = '') => { c ? pass++ : fail++; console.log('  ' + (c ? 'PASS ' : 'FAIL ') + m + (e ? '  ' + (c ? '(' + e + ')' : '— ' + e) : '')); };

console.log('\nFullscreen\n');

// --- the toggle ---
chk(/function toggleFullscreen/.test(h) && /requestFullscreen/.test(h), 'there is a fullscreen toggle');
chk(/webkitRequestFullscreen/.test(h) && /webkitExitFullscreen/.test(h), 'and it works on browsers that still need the -webkit- name');
const fn = h.slice(h.indexOf('function toggleFullscreen'), h.indexOf('function toggleFullscreen') + 1400);
chk(/\.catch\(\(\) => \{\}\)/.test(fn),
    'a browser refusing the request cannot kill the keypress that asked for it');
chk(/showStatus\('Fullscreen not supported/.test(fn), 'and it says so instead of doing nothing at all');

// --- three ways in ---
chk(/k==='f' && gameRunning\) \{ toggleFullscreen\(\)/.test(h), 'keyboard: [F]');
chk(/id="touch-full"/.test(h) && /fullBtn.*addEventListener\('click'/.test(h.replace(/\n/g, ' ')), 'touch: a ⛶ button');
const keysF = (h.match(/keys\['f'\]/g) || []).length;
chk(keysF === 0, 'and [F] was not already doing something else', keysF ? keysF + ' other uses' : 'free');

// --- what goes fullscreen ---
chk(/getElementById\('game-wrap'\)/.test(fn),
    'the game canvas goes fullscreen, not the page — so the minimap and crosshair come with it');

// --- the picture must not be stretched ---
const css = h.slice(h.indexOf('#game-wrap:fullscreen'), h.indexOf('#fs-hud {'));
chk(/min\(100vw, calc\(100vh \* 900 \/ 550\)\)/.test(css) && /min\(100vh, calc\(100vw \* 550 \/ 900\)\)/.test(css),
    'the world is letterboxed, never squashed (900x550 stays 900x550)');

// --- the corner readout ---
chk(/id="fs-hud"/.test(h), 'important text moves to the top-left corner');
const fsCss = h.slice(h.indexOf('#fs-hud {'), h.indexOf('#fs-hud {') + 700);
chk(/display:none/.test(fsCss), 'and it stays out of the way when you are NOT fullscreen');
chk(/#game-wrap:fullscreen #fs-hud/.test(h), 'and appears when you are');
chk(/left:14px; top:14px/.test(fsCss), 'in the top-left corner, as asked', 'left:14px top:14px');

// --- it must not collide with the other corner overlays ---
chk(/#game-wrap:fullscreen #mp-diag[^}]*bottom:14px/.test(h),
    'the [M] diagnostics panel moves out of that corner so they do not overlap');
const mini = (h.match(/id="minimap"[^>]*style="([^"]*)"/) || [])[1] || '';
chk(/right:12px/.test(mini), 'and the minimap is in the opposite corner anyway', 'top-right');

// --- the mirror actually mirrors, and every id it names exists ---
{
    const list = (h.match(/const FS_MIRROR = \[([\s\S]*?)\];/) || [])[1] || '';
    const pairs = [...list.matchAll(/\['([^']+)','([^']+)'\]/g)].map(m => [m[1], m[2]]);
    chk(pairs.length >= 5, 'it carries the numbers that matter', pairs.length + ' rows');
    const missing = pairs.flat().filter(id => !h.includes('id="' + id + '"'));
    chk(missing.length === 0, 'and every element it names really exists',
        missing.length ? missing.join(', ') : pairs.flat().length + ' ids');

    // run it
    const src = h.slice(h.indexOf('function updateFsHud'), h.indexOf('function updateCrosshair'));
    const els = {};
    for (const [dst, src2] of pairs) { els[dst] = { textContent: '' }; els[src2] = { textContent: 'VALUE ' + src2 }; }
    const run = new Function('document', 'isFullscreen', 'FS_MIRROR', src + '; return updateFsHud;')(
        { getElementById: id => els[id] || null }, () => true, pairs);
    run();
    const copied = pairs.every(([d, s2]) => els[d].textContent === els[s2].textContent);
    chk(copied, 'and running it really copies the live values across', pairs.length + ' mirrored');

    // and must do nothing at all when not fullscreen
    for (const [d] of pairs) els[d].textContent = 'UNTOUCHED';
    const run2 = new Function('document', 'isFullscreen', 'FS_MIRROR', src + '; return updateFsHud;')(
        { getElementById: id => els[id] || null }, () => false, pairs);
    run2();
    chk(pairs.every(([d]) => els[d].textContent === 'UNTOUCHED'), 'and costs nothing when you are not fullscreen');
}

// --- the crosshair caches a scale that fullscreen invalidates ---
chk(/fullscreenchange[\s\S]{0,220}_markCrosshairDirty\(\)/.test(h),
    'the crosshair re-measures on the switch (its scale is cached, and the canvas just changed size)');

// --- the ability line lives in the strip that fullscreen hides ---
{
    const blk = h.slice(h.indexOf('const show3d ='), h.indexOf('const show3d =') + 400);
    chk(/\|\| isFullscreen\(\)/.test(blk),
        'the ability names stay on screen in fullscreen, in every camera mode');
}
// --- every overlay the player needs must sit INSIDE the element that goes fullscreen ---
{
    const a = h.indexOf('<div id="game-wrap"');
    const b = h.indexOf('<div id="hud">');
    const inside = h.slice(a, b);
    const need = ['minimap', 'crosshair', 'elem-picker', 'ability-hud-3d', 'fs-hud', 'status-overlay'];
    const outside = need.filter(id => !inside.includes('id="' + id + '"'));
    chk(outside.length === 0, 'every overlay you need is inside the element that goes fullscreen',
        outside.length ? outside.join(', ') + ' would vanish' : need.length + ' overlays');
    chk(!inside.includes('<div id="hud">'),
        'and the page HUD strip is outside it — which is exactly why the corner readout exists');
}

// --- the 3D layer in fullscreen ---
{
    // #game3d carries an INLINE style, and Three.js setSize() writes an inline width/height on top.
    // A plain stylesheet rule loses to both, leaving the 3D view a small bordered box in the corner
    // while the 2D canvas fills the screen.
    const inline = (h.match(/<canvas id="game3d"[^>]*style="([^"]*)"/) || [])[1] || '';
    const props = ['position', 'left', 'top', 'border'];
    const clashing = props.filter(pr => new RegExp('(^|;)\\s*' + pr + '\\s*:').test(inline));
    const rule = h.slice(h.indexOf('#game-wrap:fullscreen #game,'), h.indexOf('#game-wrap:fullscreen #vignette'));
    const unbeatable = clashing.filter(pr => !new RegExp(pr + '[^;]*!important').test(rule));
    chk(clashing.length > 0, 'the 3D canvas really does carry inline styles worth beating',
        clashing.join(','));
    chk(unbeatable.length === 0, 'and the fullscreen rule beats every one of them',
        unbeatable.length ? unbeatable.join(', ') + ' still win' : clashing.length + ' overridden');
    chk(/width:[^;]*!important/.test(rule) && /height:[^;]*!important/.test(rule),
        'including the width/height Three.js writes inline via setSize()');

    // resolution
    chk(/function resize3DToDisplay/.test(h), 'the 3D render buffer follows the displayed size');
    const fn2 = h.slice(h.indexOf('function resize3DToDisplay'), h.indexOf('function updateCrosshair'));
    chk(/setSize\([\s\S]*?,\s*false\)/.test(fn2),
        'and asks Three.js NOT to write the size back as inline style (it would fight the CSS)');
    chk(/camera\.aspect = w \/ hgt/.test(fn2) && /updateProjectionMatrix/.test(fn2),
        'and the camera is reprojected, so nothing is stretched');
    chk(/MAX_PX/.test(fn2), 'with a cap, so a big screen does not turn into a slideshow',
        (fn2.match(/MAX_PX = (\d+)/) || [])[1] + 'px buffer');
    chk(/fullscreenchange[\s\S]{0,220}resize3DToDisplay\(\)/.test(h), 'it runs on the switch');
    chk(/if \(isFullscreen\(\)\) resize3DToDisplay\(\);/.test(h),
        'and again if the 3D view is created while already fullscreen (it is born at 900x550)');

    // run it
    let got = null, aspect = null, projected = false;
    const three = {
        renderer: { getPixelRatio: () => 1.5, setSize: (w, hh, style) => { got = { w, hh, style }; } },
        camera: { aspect: 0, updateProjectionMatrix: () => { projected = true; } },
    };
    const run = new Function('_three', 'document', 'Math',
        fn2.slice(0, fn2.lastIndexOf('}') + 1) + '; return resize3DToDisplay;')(
        three, { getElementById: () => ({ getBoundingClientRect: () => ({ width: 2560, height: 1564 }) }) }, Math);
    run();
    chk(got && got.style === false, 'running it resizes the buffer without touching the style', JSON.stringify(got));
    chk(got && got.w * 1.5 <= 2200 + 2, 'and respects the cap on a 2560px screen', got ? got.w + 'px logical' : '');
    aspect = three.camera.aspect;
    chk(Math.abs(aspect - 2560 / 1564) < 0.001 && projected,
        'and reprojects the camera to the real aspect', aspect.toFixed(3));
}

console.log('\n' + (fail ? 'FAILED ' + fail + ' of ' + (pass + fail) : 'all ' + pass + ' checks pass') + '\n');
process.exit(fail ? 1 : 0);
