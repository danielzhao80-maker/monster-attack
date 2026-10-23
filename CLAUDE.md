# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Monster City is a browser-based top-down shooter game built for a 10-year-old named Daniel. It is a single-file HTML5 Canvas game (`index.html`, ~2700 lines) with no build system, no dependencies, and no external assets. All sound is synthesized via Web Audio API.

## Running the Game

```bash
open -a "Google Chrome" index.html
```

No build step, no server needed. Just open in Chrome.

## Architecture

Everything lives in `index.html` — HTML structure, CSS styles, and all JavaScript in one `<script>` block. The JS is organized into labeled sections (search for `// ===` to navigate):

### Key Sections (in order)
- **Sound Effects** (~line 421) — `SFX` object with Web Audio API synthesized sounds
- **Classes** (~line 669) — `CLASSES` array defining all player classes with stats and abilities
- **Monster Classes** (~line 697) — `MONSTER_CLASSES` array (Frost, Flame, Shield, Mad Mom, Miku)
- **Game State** (~line 730) — Global variables including BigInt `coins` (called "rotten flesh")
- **Character Upgrades** (~line 743) — Level system (max Lv.3), localStorage persistence
- **Buildings** (~line 899) — Map obstacle generation, collision helpers (`ptInBld`, `ptInWall`, `isInShade`)
- **Roll Screen** (~line 917) — Gacha system with rarity weights and guaranteed class support
- **Player** (~line 1006) — `createPlayer()` applies class stats + level bonuses
- **Combat** (~line 1052) — `shootBullet()`, `meleeAttack()`, `hitMonster()` with cheat support
- **Abilities** (~line 1139) — `useAbility()` handles all [E] key abilities per class
- **Monster Spawning** (~line 1248) — `spawnMonster()` uses `currentMonsterClass` rolled per wave
- **Update Loop** (~line 1319) — Main game tick: movement, bullets, monster AI, status effects, wave progression, auto-save
- **Draw Loop** (~line 1684) — Canvas rendering: world-themed ground, buildings, monsters, player, HUD elements
- **Save/Load** (~line 2029) — localStorage auto-save every 5 seconds + wave completion
- **Worlds** (~line 2112) — 3 worlds (City/Desert/Circus) with unlock progression
- **Codes** (~line 2176) — Redemption system, 10 uses per code per day
- **Admin Panel** (~line 2254) — Secret panel (code `001060`) with cheats and player management
- **Cheats** (~line 2391) — God mode, aimbot, teleport, nuke, super speed/damage, inf ammo
- **Accounts & Titles** (~line 2463) — Player names, Admin/Owner/VIP titles
- **Ban System** (~line 2509) — Admin/Owner can ban players, bans block gameplay and hide from leaderboard
- **Leaderboard** (~line 2580) — Top scores, one entry per player, persistent
- **Input** (~line 2710) — Keyboard/mouse handlers, pause toggle, admin teleport on right-click

### Currency System
Coins use `BigInt` (variable name `coins`, displayed as "rotten flesh" 🍖). All coin operations must use `addCoins(n)`, `spendCoins(n)`, `hasCoins(n)` — never modify `coins` directly. Display with `coinStr()` which formats large numbers as scientific notation.

### Persistence (localStorage keys)
- `monster_city_save` — Game state auto-save
- `monster_city_flesh` — Rotten flesh (persists across sessions)
- `monster_city_points` — Points (🏆)
- `monster_city_char_levels` — Character upgrade levels
- `monster_city_worlds` — World unlock progress + highest wave
- `monster_city_used_codes` — Code usage tracking (per-day counts)
- `monster_city_leaderboard` — Top 10 scores
- `monster_city_accounts` — Player name → title mapping
- `monster_city_bans` — Banned player list
- `monster_city_player_name` — Current player name

### Adding a New Player Class
Add an entry to the `CLASSES` array with: `name`, `emoji`, `rarity`, `rarityColor`, `speed`, `hp`, `damage`, `fireRate`, `ammo`, `type` ('ranged'/'melee'), ability flags, and `desc`. Then:
1. Handle the ability in `useAbility()` if it uses [E]
2. Add body color in the draw section (search `p.cls.name===`)
3. Add HUD ability text (search `ability-display`)
4. If melee, set `meleeRange`; the melee system handles the rest

### Adding a New Monster Class
Add to `MONSTER_CLASSES` array with ability flags. Then:
1. Add the flag to `spawnMonster()` properties
2. Add AI behavior in the monster update loop (search `// Contact damage`)
3. Update `rollMonsterClass()` rarity weights if needed

## Checking a change before handing it over

`node --check` only parses. It cannot see a reference to a `const` declared further down the file,
which throws at load, stops the whole script evaluating, and shows up as an unrelated
"cannot access X before initialization" for something hundreds of lines away.

```bash
node tools/check-load.js index.html
```

That evaluates the game's top-level code in a tolerant fake DOM and reports the first real error with
its line. Run it after every edit — a load failure breaks the entire game, not just the feature you
touched. The game also self-reports uncaught errors in an on-screen overlay (Ctrl+Shift+O for the
debug panel).

`tools/smoke-test.js` goes further: it loads the game, starts a real run, and plays 300 frames in
each of the four camera modes, reporting how far the player actually walked.

```bash
node tools/smoke-test.js index.html
```

An exception thrown inside `update()` or `draw()` escapes `gameLoop` before it can schedule the next
frame, so the game freezes where it stands — this catches that, per camera mode.

`tools/audit.js` is a standing sweep of 68 invariants across the data tables and every progression
system — duplicate ids, dangling references (a boss or classReq naming something that doesn't exist),
unknown buff keys, BigInt coin limits, backpack capacity, quest double-claims, equip caps, corrupt
localStorage in every loader, and whether artifact/weapon buffs actually reach the player. Run it after
touching any data table:

```bash
node tools/audit.js index.html
```

Feature tests live alongside them and take the same argument:

```bash
node tools/test-pets-search.js index.html   # pets search + pet artwork everywhere
node tools/test-look-and-sound.js index.html # music, 3D player figure, 3D pets
node tools/test-save.js index.html          # autosave, Continue, world restore
node tools/test-map-maker.js index.html     # map maker: draw, erase, traps, play, persist
node tools/test-multiplayer.js index.html   # movement, prediction, interpolation, acceleration
node tools/test-ultimates.js index.html     # ultimate forms: enter, transform, revert cleanly
node tools/test-world-styles.js index.html  # per-world architecture across all 30 worlds
node tools/test-summons-look.js index.html  # summons: one 2D+3D look per kind, mechanics unchanged
node tools/test-special-maps.js index.html  # ⭐ Special Maps: lock/unlock, Backrooms run, save, City fallback
```

### Saves
The run save (`monster_city_save`) stores the wave, score, class, player state and the **world seed**.
It deliberately does NOT store flesh — `monster_city_flesh` is written on every earn and spend, so it
is always the truth, and keeping a second copy meant Continue restored a stale snapshot over it.

### Map Maker
`🗺️ Map Maker` on the start screen opens a drag-to-draw editor (`monster_city_custom_map`). It has a
structure picker (any of the 11 archetypes, not just the current world's), undo (`mmSnapshot` before
every mutation), and a protected spawn box — `mmCoversSpawn` refuses placements that would bury it.
The preview calls the game's own `drawStructureTop`, so it cannot disagree with what you get.
A ☠️ Trap tool places traps from the current world's `trapTypes` (118 types exist across the worlds —
far too many for one palette — so it offers the themed ones plus the universal poison pebble).
Storage is `{ v:2, b:[structures], t:[traps] }`; a v1 bare array still loads. `refreshChunks` hands the
run **copies** of the traps, because the game writes `trap.cooldown` and would otherwise edit your map. It emits
buildings in the SAME shape `buildChunk` does — `{ lx, ly, x, y, w, h, hgt, color }` — which is why
collision, the 2D draw, the 3D renderer, the minimap and the raycaster need no special cases for it.
`usingCustomMap` makes `refreshChunks()` return the drawn list instead of streaming chunks;
`openRollScreen()` clears the flag so normal Play is always the generated world.

### Special maps
`SPECIAL_WORLDS` (currently only `backrooms`) sit OUTSIDE `WORLDS`, so the wave ladder, the "x/36"
count and `highestWaveEver` never see them (clearing waves on one does not raise it). They unlock
when another arcade game puts their id in `specialMaps` in the shared `daniels-arcade-v1` save, read by
`getSpecialMaps()` each time the Worlds menu opens, a save loads or a run starts. Look worlds up by id
with `findWorld()` (it sees both lists), check access with `isWorldUnlocked()`, and
`ensureWorldAllowed()` drops a special map whose unlock is gone back to the City. Per-world tables
(BLDG_STYLES, WORLD_GROUND, ...) take special maps like any other world; `test-world-styles.js`
walks `ALL_WORLDS`. The Backrooms (`maze:true`) is a real maze: `buildMazeChunk` carves each chunk
with a recursive backtracker (plus a few loops), each chunk owns its west/north edge with doorways,
and the open edges are kept on the chunk (`chunk.maze`). Monsters there walk the maze via
`mazeStep` (a BFS field from the target's room) — straight-line chasing gets stuck on walls.
Floor 0: The Lobby is `backrooms`; Floor 1: Parking Zone (`backrooms2`, `concretemaze`, `garage:true`
→ buildGarageChunk: pillars, solid parked cars, bay lines) is unlocked IN the Lobby: a building class
(`buildsThings`: Builder, The Iron) hit by a `fallentile` trap gets `_tileHole` (10 s); looking up
(`pitch > 0.6` in first person) during it calls `unlockSpecialMap('backrooms2')` (tickTileHole). Indoor floors get a self-lit ceiling
(`WORLD_CEILING`, updateCeiling3D; fp3d only) at 110 = ~3 m, and their walls are 110 tall.
Floors 2–20 are DATA: `BACKROOMS_FLOORS` (near WORLD_W) feeds every per-world table via `_brRows`,
styles 'br2'…'br20' (shared body `brwall`; layout maze/pillars/city/open), SPECIAL_WORLDS, ceilings and
the Map Maker. `FLOOR_IDS` is the chain 0→20. Unlock: on Floor N≥1 reach `floorExitWave(N)`, an exit
(`brExit`, tickFloorExit) appears 1100–1600 away (minimap/2D/raycast/3D), touching it unlocks N+1.
The 3D building signature includes `_worldSeed` + world id (a new run at the same chunk used to keep
the previous world's 3D).
Indoor worlds (`isIndoors()` = has a WORLD_CEILING) ignore the time of day and use INDOOR_LIGHT. Canvas
textures need `colorSpace = SRGBColorSpace` or they render washed pale. The Lobby's fallen tile
shows a hole in the ceiling (`player._holeAt`, updateTileHole3D) while the Floor 1 secret is live.

### Per-world structures
Worlds contain STRUCTURES, not buildings-everywhere. Only a real town builds boxes; a jungle grows
trees, a volcano has boulders, a graveyard has headstones. Each world picks an ARCHETYPE, not a repaint. `BLDG_STYLES` holds one entry per world — 30 distinct
`body` kinds (igloo, lavaspire, coral, station, lollipop, stilt, peak, neon, barn, stalag, cloud,
column, blocks, manor, parasol, headframe, glasslab, sign, obelisk, rod, monolith, skyscraper, works,
pagoda, ziggurat, bigtop, tree, tombstone, shard, toadstool), each with its own footprint and height
ranges, landmark chance and wall facade. `WORLD_BLDG_STYLE` is one-to-one: no two worlds share a design.

Adding a body needs THREE things or it breaks silently: an entry in `BLDG_STYLES`, a
`kind === '<body>'` branch in the 3D dispatcher (no branch = the structures render as **nothing**), and
either a `kind2 === '<body>'` branch or a family entry in the top-down map. `test-world-styles.js`
asserts all three.
Every generated building is stamped with `st`, so the 3D crown, the wall texture and the top-down
marking all read the style off the building rather than asking which world is loaded — which is also
what lets the Map Maker stamp the current world's style onto hand-drawn buildings.

Collision stays the axis-aligned footprint (`ptInBld`) whatever the body looks like, so a tree's
canopy overhangs its trunk exactly like a real one.

To restyle a world, change its entry in `WORLD_BLDG_STYLE`. To add an archetype: add it to
`BLDG_STYLES` with a `body`, add a 3D branch (search `A real building: six textured walls` for the
dispatcher) and a top-down silhouette branch (search `each structure draws its own SILHOUETTE`).

### Music and figures
`MUSIC` synthesises a four-chord loop through the same AudioContext the SFX use — no audio files. Notes
are SCHEDULED AHEAD on the audio clock (`pump()` tops up a 600ms queue); sequencing straight off
setInterval drifts and stumbles, especially once the tab is hidden. Toggle persists in
`monster_city_music`.

`makePlayerFigure(cls)` builds a SWAT officer (30 meshes, feet at local y=0): helmet + visor, plate carrier
with pouches, belt, gloves, elbow/knee pads, boots, and a suit in the class `armorColor` covered in green
camo dots from `swatCamoTexture(col)` (one cached 64px CanvasTexture per colour, never per frame). In 2D,
`drawSwatBody2D` / `drawSwatHead2D` draw the same officer from above for every player (suit = `bodyColor`,
so frozen/stunned tints still show). `tools/test-swat-look.js` covers both. It is
used for other players in 3D — they were a single capsule. `makePetMesh3D(pet)` gives equipped pets a
body in the 3D camera, where they previously did not exist at all; `rebuildPetRuntime()` stamps `_pet`
on each runtime slot so the renderer knows which creature to build. Both use the `_pf()` material pool
and add NO point lights — see the perf notes about shader rebuilds.

### Ground surfaces
The ground is the largest surface on screen. `WORLD_GROUND` maps each world to one of 18 procedural
surfaces (asphalt with lane markings, wind-rippled sand, grass blades, ice cracks, caustic water,
molten basalt veins, riveted grate, flagstones, starfield, cloud, confetti, casino carpet, tatami,
dead grass, wet stone, crystal facets, marsh, rock), drawn by `makeGroundTexture(colour, art)` and
cached per (colour, art).

`makeGroundCanvas(colour, art)` paints the tile ONCE; `makeGroundTexture` wraps it for 3D and
`worldFloorPattern(ctx)` turns the same canvas into a repeating 2D fill. All THREE floor renderers —
3D, top-down/third-person, and the raycast first-person — draw the same artwork, so they cannot drift
apart. Each used to paint its own flat brown fill.

`ground` on a world is NOT a surface colour — it is the backdrop tint the old flat top-down art used,
which is why the City's is sky blue. `WORLD_FLOOR` overrides it for the worlds where that reads wrong
(city, arctic, sky) and `worldFloorColor(w)` is what every floor renderer must call; using `w.ground`
directly gives the City a blue street and the Arctic a blue snowfield.

The WORLD supplies the colour and the surface; the TIME OF DAY supplies only `groundTint`, a neutral
light multiplier (applied as a `multiply` pass in 2D). It used to supply both, which is why every
world stood on the same brown dirt. `groundAlt` — declared on all 30 worlds and previously unused —
now drives fog and the large-scale ground patches.
Adding a surface needs an `art === '<name>'` branch or it silently falls back to flat paint —
`test-world-styles.js` asserts that.

### World props
The clutter between structures. `PROP_SETS` gives each world three or four of the 39 prop kinds and
`buildProp(kind, takeLight)` builds them. Every world used to scatter the same city furniture —
lampposts, fire hydrants, mailboxes — so the Arctic had hydrants and the space station had a mailbox.

Two rules the tests enforce: a prop name with no `case` in `buildProp` returns null and silently never
appears, and only lamp-like props may call `takeLight()` (the scene allows itself three dynamic lights
in total — see the perf notes on shader rebuilds). Prop materials come from the shared `_pf` pool;
they used to be allocated fresh on every chunk edge crossed.

### Skies
`WORLD_SKY` gives 22 of the 30 worlds their own sky (top/bottom gradient); the other eight keep the
time-of-day sky, because over an ordinary world a sunrise IS the design. `worldSky(w, tod)` multiplies
a custom sky by `groundTint` so dawn and dusk still read, and returns `stars` for the three worlds
whose sky is stars (space, void, crystal) — one extra draw call, a `BackSide` sphere with a painted
star texture, hidden outright everywhere else. The raycast view draws the same stars deterministically.

Both sky renderers AND `scene.background` go through `worldSky()`. The background used to be set from
`currentWorld.ground`, which only looked right because that field holds a sky-blue backdrop tint — the
same confusion behind the blue City street.

### Per-world monsters
Only FIVE of the 65 `MONSTER_CLASSES` are rolled in a normal wave — the other sixty are the two bosses
each world owns. So ordinary waves were identical everywhere. `WORLD_MONSTERS` re-skins four of the
five per world (name, emoji, colour) via `themeMonster(base)`; Miku and the bosses keep their own
identity.

The MECHANICS are never touched — one ranged freezer, one burning trail, one shield, one scream — so
difficulty is unchanged and the game stays balanced. `mut` carries the base name forward, and
everything that resolves a monster by name must use it: the 3D body mutations
(`name.includes('Frost')`), the save file's `currentMonsterName`, and the multiplayer state packet.
Store or send the re-skinned name and it will not resolve on the other side.

### World ambience
`WORLD_FX` gives 29 of the 30 worlds weather — snow, rain, embers, ash, bubbles, leaves, dust,
confetti, spores, sparks, stardust, mist, drips, flies, petals. The City is deliberately clear air.

In 3D it is ONE `THREE.Points` cloud (`buildWorldFx` / `updateWorldFx`), rebuilt only when the world
changes and recycled in a box that follows the player, so a few hundred particles cover an endless
world at one draw call and no lights. `drawWorldFx2D` draws the same effect in screen space for the
top-down, third-person and raycast views, keeping its particles between frames.

A world naming an effect that is not in `FX_KINDS` draws nothing at all — `test-world-styles.js`
asserts every name resolves.

### Realism
Four things carry most of it, and each is cheap:

- **The sun moves.** `TIME_OF_DAY[].sunPos` puts it low in the east at dawn and low in the west at
  dusk. It used to sit at a fixed noon position all day, so an evening scene was lit warm but still
  cast short overhead shadows.
- **`FogExp2`** instead of a linear near/far ramp, so haze builds with distance rather than switching
  on at a line you can watch sweep over the ground.
- **Footsteps** (`STEP_SOUNDS`, `playStep`) keyed to the same `groundArtOf()` that decides how the
  floor LOOKS — snow crunches, water splashes, a grate rings, a starfield is silent. Paced by distance
  walked, never by a timer, so they match your speed and stop the instant you do.
- **The camera breathes.** `_three._gait` eases in and out of a walking cycle, a footfall drops faster
  than it rises (`abs(sin)^1.6`), and the head tips into each stride.

Materials: only a `metal` facade is metallic. Concrete, brick, canvas and planks all sat at
metalness 0.25, which gave every wall a sheen no real wall has.

### Movement has mass
`stepVelocity(p, dx, dy, spd)` eases a body up to speed (`MOVE_ACCEL`) and lets it coast to a stop
(`MOVE_BRAKE`, faster, the way legs do). It is called from all THREE places a player moves — the host
moving itself, the host moving a guest (`updateRemotePlayer`), and the guest predicting itself
(`mpPredictLocal`). They must stay byte-identical or the guest rubber-bands; `test-multiplayer.js`
asserts the host and guest diverge by 0.0 units over 120 frames.

Two traps live here. Frozen/stunned must ZERO the velocity on both sides, not just skip the move.
And `mpPredictLocal` must NOT return early when no key is held — releasing is a deceleration that has
to be simulated exactly as the host simulates it.

`tools/test-multiplayer.js` extracts the game's functions from index.html AT RUNTIME. An earlier
version embedded a copy and silently went stale the moment the movement maths changed — it passed
while testing code the game no longer ran.

### World sound
`AMBIENCE` gives each world a soundbed — 12 of them (wind, gale, surf, hum, reactor, cavern, jungle,
bog, fire, carnival, room, vacuum). One looping BROWNIAN noise buffer through a filter, with a slow
LFO opening the filter so the bed breathes, plus sparse one-shots (drips, chirps, croaks, crackle) for
the worlds that need a voice rather than a texture. Brownian rather than white noise: real wind and
surf have far more energy low down, and white noise through a filter still reads as hiss.

Every entry point that starts a run must call `AMBIENCE.start()` — there are four
(startGame, loadGame, startMultiplayerGame, mpClientStart) and missing one leaves that path silent.
`test-look-and-sound.js` counts `MUSIC.start()` against `AMBIENCE.start()` to catch exactly that.

Weapon recoil lives in the viewmodel block of `render3D`: `_three._recoil` is set the frame the shot
cooldown resets, so the kick follows the real fire rate rather than a timer of its own.

### Ultimate forms
An ultimate used to be a bigger version of a normal ability — a wider circle, a longer dash. `FORMS`
makes it a TRANSFORMATION: for a stretch of time you are something else, with its own health, damage,
speed, fire rate and gun. Six so far (mech, fortress, swarm, wraith, bonelord, demon) on The Iron,
Vampire, Ghost, Machine, Sikuna and Necromancer.

`enterForm` saves every stat it is about to change and `exitForm` puts them all back — the bonus
maximum HP is granted AND healed on the way in, and on the way out the health is CLAMPED down rather
than the player being killed by their own maximum dropping. Re-entering replaces rather than stacks.

Every one of the 23 classes has its own form and no two share one — `test-ultimates.js` asserts both,
and runs all 23 through enter/expire comparing six stats each side.

`tickPlayerTimers(p)` is the ONE place per-player countdowns live (form expiry, temporary crit). The
host runs it for itself and for every guest — a timer ticked only in the local-player path silently
never expires for anybody else.

A guest must MIRROR its form locally (`mpClientApplyState` enters/exits when the host's `form` key
changes) or its prediction runs at its NORMAL speed while the host runs the form's: measured 4.00 vs
2.88 in a mech, a permanent rubber-band for the whole duration. The host still owns the timer — the
guest only counts down for the HUD and never expires on its own. The active form key is in the state packet so everyone sees the transformation — `mpSerializePlayer`
sends it and the 3D figure scales to `FORMS[key].scale`.

### [E] abilities
Behaviour lives in `useAbility()` (a chain of class flags plus named `p.cls.name ===` branches);
`E_ABILITIES` holds the IDENTITY — name, emoji, colour, one-line description — for all 23 classes, and
the HUD falls back to it so no class is left with a blank ability line. A blank line is exactly what
"this key does nothing" looks like on screen, which is how two classes (Gangster Captain, Monster
Copier) went a long time with no active [E] at all.

`test-ultimates.js` asserts every class has an entry, no two share a name, no entry names a class that
does not exist, every [E] runs without throwing, and the ability line is never blank.

It also fires ALL 69 abilities (23 classes x E/Z/X) against a stocked world and checks each changes
something observable — bullets, allies, turrets, walls, fire, monster health, or the player's own
state. A cooldown alone does not count: that only means the key was accepted. Two things must be set
up or every result is a false negative: `gameRunning` must be true (ultimates refuse to fire
otherwise) and `setTimeout` must QUEUE rather than no-op, because X moves run their effect behind a
cutscene. Five classes had a passive where their [E] should have been, and two more only worked in
situations that rarely came up.

### The hidden class
Elemental Mage has `rarity:'hidden'`, which `rollRarity()` can never return — an egg or a roll will
never produce it. The `ELEMENTS` code is the only way in besides the admin panel. `test-ultimates.js`
rolls 8000 times to prove it cannot appear by chance.

Its bolts set `petElement`, which is the field the elemental on-hit switch actually reads. Inventing a
new field (the first attempt used `elem`) makes pretty coloured bullets with no effect — the exact
shape of bug that passes an "ability does something" probe while doing nothing it claims.

`showElementalCutscene()` is a visual only, called inside a try/catch, and the gameplay effect runs
regardless — a cutscene must never be able to swallow the ability behind it.

### Every class carries four kinds of custom content
A class is not finished when its abilities work. It also needs:
1. a `CWEAPON` entry — without one it silently falls back to a generic `"<Name> Cannon"` with a stock
   shape, an `orb` emblem and **no stat buff**;
2. a `RELIC` entry keyed by its **ultimate's name** — without one the move cutscene drops a plain
   floating orb. Renaming an ultimate orphans its relic, which is how 29 of them ended up on the
   fallback after transformations landed. If you rename a move, move its RELIC key with it;
3. a `bodyColor` branch, else the class is the default orange;
4. a `drawClassBodyBehind` case — the cape / trail / aura.

All four fail *silently and look deliberate*. `tools/test-class-custom.js` holds every class to all
four, checks that each shape named actually has a draw case in the 2D switch, the 3D switch, the
emblem switch and the relic switch, and then **runs** all 35 decorations against a recording canvas
to prove none throws and none draws nothing.

There is no global frame counter in the 2D renderer — animated art reads `Date.now()`.
`drawClassBodyBehind` declares `const frame = Date.now() / 16.7` so its cases can animate.

Elemental Mage is deliberately absent from `BEFF`: a themed on-hit effect there would stamp one
element over all six and quietly flatten the whole class.

### Choosing your element
`p.elemPick` is an index into `ELEMENTS`, or `-1` (`ELEM_RAINBOW`) to keep cycling all six. `-1` is the
default so a mage who has never pressed anything still fires. `[Q]` cycles, `[1]`-`[7]` pick directly,
and the on-screen chips are the same control for touch.

The pick is applied to the bullet **twice on purpose**: once where the old cycling code was, and again
*after* the `if (aw)` weapon block. That block repaints `color`/`bemoji`/`bshape` from the equipped
weapon, which would quietly wash every element the same shade of Elemental Focus cyan. Last write wins,
so the chosen element has to be last.

In multiplayer the host simulates a guest's shots, so the choice rides the input packet (`elemPick` /
`elemNext`) and is applied to the guest's player on the host. The guest also applies it locally, or
their own HUD lies to them until the next snapshot.

`showBanner()` does not exist — the on-screen announcer is `showStatus(text, color)`.

### The six elements each do their own thing
Fire = burn DoT (`m._burn`/`m._burnDmg`), Ice = freeze and **shatter** a target that was already frozen,
Lightning = a 3-hop chain with visible arcs, Poison = spreads via `m._plague`, Shadow = `m._curse`
(a +40% damage amp, applied in `hitMonster` because that is the one place all damage passes), Holy =
bonus damage plus a team heal.

**Particles do not render in 3D.** There is no `_syncMap` for them, so an effect built only from
`particles.push` is invisible in every 3D camera mode — which is most of how the game is played.
`gameEffects` (`spawnGameEffect`) is the only effect layer drawn by *both* `draw2DEffects` and
`update3DEffects`, so every element spawns one. `test-element-pick.js` fails any element that doesn't.

`_burn` can kill, so its tick guards the monster index (`if (!monsters[i] || monsters[i] !== m) continue`)
the same way `_plague` does; the on-hit switch does the same before touching the bullet afterwards.

The behaviour test extracts the switch and **runs** it against a fake monster with a tracking Proxy,
then asserts all six signatures are distinct. Note the earlier static check sliced a fixed 4000 chars
after `switch (b.petElement)` — the switch outgrew that window and three elements silently dropped out
of the check. Brace-match, don't guess a length.

### Text the player reads
`tools/test-text.js` covers the failure mode where nothing throws but the words are wrong:

- **A renamed ability orphans every card that named it.** Renaming the ultimates left five class cards
  describing moves that no longer exist (Admin's card still promised `[X] Ban Hammer`; the real move is
  `ADMIN MODE`). The test only judges a *capitalised phrase followed by a separator* — prose after
  `[E]` is a description, not a claim.
- **Two abilities in one class sharing a name** — Saber had `[E] Lunge` and `[Z] Lunge`, so the HUD read
  "Lunge | [Z] Lunge". `[Z]` is now `Blade Rush`. Same for Gravity Mage's `[E] Singularity` vs
  `[X] SINGULARITY`, now `Gravity Well`.
- **Overflow.** `#ability-hud-3d` was `white-space:nowrap`, centred with `translateX(-50%)`. The longest
  line is 79 characters, which runs off both edges of a phone. It wraps and is capped now, and because
  it grows *upward* the element picker had to move below it, not above.

Do not try to regex for `${` stranded in a plain string across the whole file: `${x ? \`y\` : ''}`
nests, so both a regex and a hand-rolled walker wander into template literals where `${}` is correct.
The check is scoped to authored data fields (`name:`/`desc:`/`msg:`/...), where it is decidable.

### Fullscreen
`[F]`, or the ⛶ touch button. `#game-wrap` is what goes fullscreen — **not** the page — so every
overlay already inside it (minimap, crosshair, ability line, element picker, status banner) comes
along and re-anchors to the screen edges for free. Anything you add that the player needs mid-fight
must live inside `#game-wrap`; `test-fullscreen.js` fails the build if one of them drifts outside.

The `#hud` strip is a **sibling** of `#game-wrap`, so it is off-screen in fullscreen. That is why
`#fs-hud` exists in the top-left corner. It *mirrors* the real HUD spans (`textContent` copy) instead
of recomputing anything — two sources for one number is how they end up disagreeing — and returns
immediately when not fullscreen. `#ability-hud-3d` is also forced visible in every camera mode while
fullscreen, since the strip that normally carries the ability names is gone.

The canvas is letterboxed with `min(100vw, calc(100vh*900/550))`, never stretched: the world is
900x550 and squashing it would lie about distance.

Two things the switch invalidates: the crosshair caches its canvas scale (`_chRectDirty`), so
`fullscreenchange` marks it dirty; and `requestFullscreen` rejects unless it came from a real user
gesture, so the returned promise is `.catch`-ed or an unhandled rejection kills the keydown handler.

#### 3D in fullscreen
`#game3d` is the one canvas the fullscreen CSS cannot style normally. It carries an **inline**
`style="position:absolute;top:0;left:0;border:4px solid #fff;..."`, and `renderer.setSize(W, H)`
writes an inline `width:900px; height:550px` on top of that. A stylesheet rule loses to both, so
without `!important` the 3D layer stays a small bordered box pinned to the corner while the 2D canvas
fills the screen. The `!important`s in that rule are load-bearing — do not tidy them away.

The render buffer is then matched to the displayed size by `resize3DToDisplay()`, called on
`fullscreenchange`, on `resize` while fullscreen, and at the end of 3D init (the renderer is born at
900x550, so switching into a 3D camera while already fullscreen needs the catch-up). It passes
`updateStyle=false` — otherwise Three.js writes the size back as inline style and fights the CSS
again — and caps the buffer at 2200px, because a 2560px screen at dpr 1.5 is a 3840px buffer.

### Summons
Allies carry a `kind` stamped where they are created (skeleton, wolf, clone, decoy, gangster, ghost;
`FORM_SUMMON_KIND` for forms), walls carry `brick`/`iron`, turrets `turret`. `drawSummon2D` /
`drawWall2D` and `makeSummonMesh3D` (`SUMMON_BUILDERS`) / `makeTurretMesh3D` / `makeWallMesh3D` draw
them; all stand on a green friendly ring. A summon with no kind falls back to the skeleton. New
summon? Give it a kind, a 2D case and a 3D builder — `test-summons-look.js` checks all three and
compares mechanics against a recorded baseline.
