# Changelog

## 3.6.3 – 2026-11-20
- Circuit: a car that makes a mistake (!) now slides off the track on the outside of the corner (towards the wall on ovals), leaves brown marks on the grass and rejoins.
- Rally: trees, rocks and spectators are kept clear of every part of the road, also where the road passes close to itself (checked on 360 stages: nothing on the road).

## 3.6.2 – 2026-11-20
- Kerbs only on the inside of corners and following the corner's radius (they no longer fold over themselves in tight corners).
- Right-angle street / airfield layouts now have real corner radii (straights joined by circular arcs) instead of near-pointed corners.

## 3.6.1 – 2026-11-20
- Rally car moves a lot more on every surface: much bigger slides on tarmac too, a bit more on gravel and snow, and a slight weave on the straights.

## 3.6.0 – 2026-11-20
- Circuit races: cars follow a racing line (outside before a corner, inside at the apex, out again on the exit), each driver with a slightly different line; overtaking lanes still work on top of it.
- Slip angle: cars turn in a little in corners (GT more than prototypes and stock cars, more in the wet) and swing round when they slide.
- Skid marks: circuits get marks only on slides and lock-ups (heavy braking into corners); they stay for the whole race and get darker where it happens often. Rally leaves tyre marks all the time (darker when drifting; a stage's second pass drives over the first pass's marks). Rallycross builds up marks on the gravel lap after lap.
- Weather forecast: rain, heavier or lighter rain and the end of the rain are announced 1–2 laps ahead with a radio message and a blinking red/yellow icon on the map; weather icons on every map (circuit, rally minimap, rallycross).
- Rain: light spray curtain behind cars in the wet (does not hide the cars behind); rain and snowfall drawn on rally stages and rallycross.
- Fix: the rally mistake routine replaced the circuit one (since 3.5.0) and broke circuit races when a car made a mistake.
- Fix: three rally events shared ids with circuit/oval tracks and showed the wrong name.

## 3.5.2 – 2026-11-20
- Rally camera: smooth. The car heading is interpolated between track samples and the camera look-ahead turns gradually (frame-time based), so it no longer jumps in corners.
- Water splashes: little pixel drops fly out when the car goes through water.

## 3.5.1 – 2026-11-20
- Rally stage view: much slower on screen (½× is now about 3× real time), shorter stages (5–11 km, Power Stage 4–7 km), closer camera.
- The car no longer runs on rails: it takes a line towards the apex and the rear steps out in corners (more on gravel and snow, little on tarmac, more in attack mode), with dust spray from the slide. Rallycross cars drift too.
- Jumps: the car lifts off (grows, its shadow moves away) and lands with a dust burst.

## 3.5.0 – 2026-11-20
- New discipline: **Rally · Rallycross** (third career series, four tiers from Regional Rally Cup to World Rally Championship).
- Rally events: 9 special stages in 3 loops over 2 days, point-to-point stages generated per event (tarmac, gravel, sand, snow/ice and mixes), jumps, water splashes, hairpins.
- Live top-down stage view with follow camera, co-driver pace notes, minimap, splits and a ghost of the fastest crew; driving style (conserve / normal / attack) can be changed on the stage.
- Damage (suspension, bodywork, engine/cooling, gearbox) from slides, spins, offs, rolls, jump landings and bottoming out; punctures with a choice to change the wheel or drive on.
- Service park with time budget (15 / 30 / 45 min) and CR cost per repair, partial repairs, 10 s per minute overrun, tyre choice per loop (tarmac soft/hard/wet, gravel soft/hard, studded), spare wheels, setup change. Roadside repairs between stages by the crew.
- Shakedown with ride height, springs and gearing; low ride height on rough roads and jumps means more damage.
- Running order and road sweeping on gravel (day 1 championship order, day 2 reverse of the top 10), weather changes between loops with a forecast, Power Stage bonus points, Super Rally restart (fastest time + 10 min per missed stage).
- Co-driver instead of a second driver: pace-note accuracy and calm, own training, contracts and market.
- Rallycross rounds (3 per season): two qualifying rounds of 4-lap heats, two semi-finals and a final over 6 laps, compulsory joker lap (+30 s if skipped) with short and long jokers, contact, repairs between races.
- Rally hatchback side-view artwork; the roof wing grows with aero upgrades.
- Team points in rally: best crew of each team. New achievements: rally win, Power Stage, rallycross win, Super Rally comeback.

## 3.4.0 – 2026-11-20
- The game is now called **Pit Stop Manager** (new title and logo). Saves from earlier versions still load.
- Moved to the public repository.

## 3.3.1 – 2026-11-20
- Safety car / caution: no overtaking. Cars queue up behind the car ahead (only the ones with a gap can close up); a car that pits under caution rejoins behind the cars that stayed out.

## 3.3.0 – 2026-11-20
- One garage per team: only one car of a team can be in the pit lane at a time. If the teammate is still in the lane, a BOX request carries over to the next lap (radio message, dimmed BOX button, "box busy" hint). AI teams follow the same rule.
- New 0.5x race speed, now the default; the chosen speed is remembered between races.
- Fix: the post-race interview crashed after a "hold position" team order.

## 3.2.3 – 2026-11-20
- Prototype redrawn as a modern LMH/LMDh Hypercar: long low body, central bubble cockpit, shark fin running into the rear wing, raised front fenders with louvres, side inlets, LED headlight strip, diffuser and full-height wing endplates.
- The Hypercar rear wing also grows with aero (small single plane -> larger -> dual element with tall endplates).

## 3.2.2 – 2026-11-20
- Stock car redrawn after the classic Gen 4 / ARCA silhouette: tall rounded nose with headlight decals, long hood, big greenhouse with window net, short fastback and high rear deck with a blade spoiler that grows with aero.
- Two-tone stock car livery (team colour, lighter band, white lower sweep), large italic outlined door number, primary sponsor on the rear quarter, black steel wheels with lug nuts.

## 3.2.1 – 2026-11-20
- New garage artwork in a race-livery style (glossy paint, three-stripe sweep, number panel, title sponsor, decals) for the GT, prototype and stock car, based on real GT4 proportions.
- Upgrades are visible on the car: the rear wing grows with aero (lip spoiler -> small wing -> swan-neck wing -> large twin-element wing), plus splitter and canards, rim finish, brake calipers, exhaust flame and ride height.

## 3.2.0 – 2026-11-20
- Two-car teams (8 teams, 16 cars), team and driver standings, shared garage with queueing in the pit box.
- Team orders: free racing, hold positions, swap positions; driver morale reacts to results, orders and crashes.
- Driver contracts with renewals, poaching attempts by other teams, nationalities on drivers.
- Practice session with setup sliders and engineer feedback; setups saved per track.
- Persistent rival team, head-to-head record, press conferences with choices.
- Parts take 1–3 races to build (rush option), production slots tied to the workshop, rule changes each season.
- Headline events: road endurance race with night stint and double points, oval Big Race with triple prize money.
- Career statistics, 20 achievements, hall of fame.
- Synthesised sound (engine, team radio, pit guns) with an on/off switch.
- More international names for drivers, teams, sponsors and tracks.
- Kerbs drawn as red and white blocks.
- When a race is skipped, the engineers run the pit strategy for both cars.

## 3.1.0 – 2026-11-19
- Touring car discipline removed; existing touring saves continue as road racing.
- New car artwork based on real race cars: GT3-style coupe (road tiers 1–2), LMDh/Hypercar-style prototype (road tiers 3–4), Next Gen-style stock car (ovals), with centre-lock wheels, splitters, diffusers, louvres and side exhausts.
- Real pit lane on every track: entry before the finish line, exit after it, speed limit, pit wall and team garage boxes. Pit calls after the entry point apply on the next lap.
- Start/finish line placed on the longest straight of each road course.
- More serious presentation: emoji removed from the interface, status colours instead.

## 3.0.0 – 2026-11-19
- Source code restructured into English modules with a build step.
- Language selection (Hungarian, English).
- New discipline: touring cars with reverse-grid race 2.
- 12 road circuits and 11 ovals; 11–12 races per season.
- Weather system: rain chance per track, changing conditions, slicks / wets, wet-driving skill and training.
- Fuel consumption and fuel strategy (full tank / to the finish).
- Damage (aero, suspension, engine), contacts, repair bills, safety car and oval cautions, red flag and rain-shortened oval races.
- Driving style affects speed, tyre wear, fuel use, mistakes and contact risk.
- In-race telemetry panel and pause button.
- Part artwork with four visual generations per part.
- Economy rebalanced for a longer career (about 9–12 seasons).

## 2.0.0
- Responsive layouts for phones, foldables, tablets and monitors.
- Credit (CR) currency, signed saves, economy rebalance.

## 1.0.0
- First playable version: road racing and ovals, upgrades, sponsors, top-down race view.
