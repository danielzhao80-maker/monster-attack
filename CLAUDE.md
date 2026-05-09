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
