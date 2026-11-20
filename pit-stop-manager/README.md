# Pit Stop Manager

**Play online:** https://csabulator.github.io/Public/pit-stop-manager/ (after GitHub Pages is enabled for this repository)  
**Play offline:** download `index.html` and open it in any modern browser. It is a single file, no server or internet needed.

A browser-based racing team manager game. Start with a small team in a regional series and work your way up to a world title.

- **Three disciplines:** road racing (GT cars in the lower tiers, LMDh/Hypercar-style prototypes at the top), ovals (Gen 4-style stock cars, cautions, drafting) and rally with rallycross rounds (stages, service park, co-driver, joker lap).
- **Four tiers per discipline**, 11–12 races per season, 8 teams with two cars each, team and driver championships, promotion (top 2) and relegation (bottom 2).
- **Team management:** two drivers with morale, contracts and training; team orders during the race (free / hold / swap); other teams try to poach your drivers; a persistent rival team that follows you through the tiers.
- **Race weekend:** practice with car setup (wing, gearing, ride height, tyre pressure) and engineer feedback, then qualifying and the race. Each season has a headline event: an endurance race with a night stint (road) or the Big Race (oval).
- **Career:** parts take 1–3 races to build, rule changes between seasons, press conferences, career statistics, 20 achievements and a hall of fame.
- **Sound:** synthesised engine, radio and pit sounds (can be switched off).
- **Live top-down race view** with driving style (conserve / normal / attack), tyre choice (slicks / wets), fuel strategy, damage, contacts, safety car / cautions and changing weather.
- **Real pit lane:** the entry is before the finish line and the exit after it, with a speed limit and a garage box per team; only one car per team can be in the pit lane at a time. A pit call made too late only takes effect on the next lap. No overtaking under the safety car.
- **Telemetry** for your car during the race: tyre condition, fuel, damage (aero, suspension, engine).
- **Upgrades:** 6 car parts with 20 levels and 4 visual generations each (stock / sport / race / pro), 5 staff departments, driver market and a training programme (pace, consistency, wet driving).
- **Sponsors** with per-race pay, goals and bonuses; the title sponsor appears on the car.
- **Languages:** Hungarian and English (selectable). Add more in `src/i18n.js`.
- **Saves** are stored in the browser, encoded and signed; edited saves are rejected.
- Works on phones (portrait and landscape), foldables, tablets and desktop monitors.

## Project layout

```
src/
  template.html   page skeleton (CSS and JS are injected by the build)
  style.css       all styles, responsive layouts
  data.js         helpers, balance constants, tracks, names
  i18n.js         translations (hu, en) and t() helper
  state.js        game state, economy, driver / field generation
  security.js     save encoding, signature, validation and migration
  setup.js        car setup, practice feedback
  audio.js        synthesised sound effects
  career.js       race results, morale, press, contracts, achievements, season end
  geometry.js     track splines, ovals, curvature
  art.js          SVG artwork: part generations, cars, helmets, telemetry
  race.js         race weekend, simulation, canvas rendering, race controls
  rally.js        rally stages: generation, timing model, live stage view
  rallyui.js      rally weekend: shakedown, service park, stage results, rally results
  rx.js           rallycross: heats, semi-finals, final, joker lap
  ui.js           screens, modals, results, season end
  main.js         boot
build.mjs         concatenates src into index.html
index.html        the playable single-file game (built)
```

## Build and run

Requires Node.js 18+.

```
node build.mjs
```

Open `index.html` in any modern browser. No server is needed.

## Adding a language

1. Copy the `en` block in `src/i18n.js`.
2. Give it a new key (for example `de`) and translate the values. Set `_name` to the language name.
3. Rebuild. The new language appears in the language selector automatically.

## Notes on anti-cheat

Saves are signed and validated (ranges plus money bookkeeping), and all game code runs inside a closure so that values cannot be changed from the browser console. A browser game can never be fully tamper-proof. Someone who reverse-engineers the source can still bypass this, but casual save editing (by hand or by asking an AI tool) does not work.
