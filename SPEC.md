# Club Sim: build spec

A browser app (Vite + Three.js + Web Audio, deployed on Vercel). You drop in MP3s (mostly house, some techno), build a queue, and watch:

- an **AI DJ** mix the queue on 4 CDJ-3000-style decks, a DJM-style 4-channel mixer and an RMX-style FX unit;
- a crowd of **200 people**, each with their own personality, react to the music;

all inside a detailed, realistic dark-warehouse club. The user never touches anything; it is fully simulated.

## Status

- [x] Project scaffold (Vite, three@0.170.0, vercel.json)
- [x] `src/audio/analyzer.js`: the "ears" (bands, BPM/beat grid, downbeat, bars, sections, drops, mix points). Tested on the user's 3 songs (results below).
- [ ] Audio engine (4 decks, EQ, filters, FX)
- [ ] AI DJ (queue, transitions, FX automation)
- [ ] Crowd brain (personalities, reactions)
- [ ] 3D club, booth, crowd, lighting, cameras
- [ ] UI (upload/queue, brain view, drop scorecard)

## 1. Ears: song analysis (`src/audio/analyzer.js`)

- Offline render into low (<150 Hz), mid (250–2500 Hz) and high (>3 kHz) bands, plus a full band, at 22.05 kHz with 200 analysis frames/sec.
- BPM is a comb search over 108–140 that snaps to an integer. The downbeat comes from energy novelty every 4 beats.
- Each bar gets bassLevel, energy and hi, and is labelled intro, groove, breakdown, build, drop or outro.
- Drop = bass returns after ≥2 bars of absence and stays for ≥3 bars. Each drop has a strength (contrast, bass, breakdown length, build highs).
- Waveform envelopes (`wave.low/mid/high`) feed the CDJ RGB waveform displays.

Test results on the user's tracks:

| Track | BPM | Drops found |
|---|---|---|
| Berlin (186 s) | 130 | 59.2 s, 129.4 s (both strong; clean structure) |
| She's Gone, Dance On (227 s) | 134 | 28.8 s, 86.1 s, 139.8 s, 168.5 s |
| Cloonee & Prospa, Good Girl (184 s) | 128 | 76.5 s (main). It also flags 3.4 s, 106.5 s and 142.1 s; these are probably 1–2 bar fills. **Needs tuning**: require a longer off-run or a bigger contrast for "drop" vs "fill-return". Downbeat came out as index 3; verify. |

Test harness: `tools/analyze-test.cjs` (Playwright; songs are not committed).

Still to do for the ears: tune fill-vs-drop on Good Girl; detect vocal sections (mid band plus spectral flux) so the crowd can sing along; techno support (fewer breakdowns, so use energy/filter-sweep changes); ask the user to confirm the real drop times.

## 2. Audio engine

- **Per deck (×4):** buffer source → trim → 3-band EQ (low shelf / peaking / high shelf, with full kill) → color filter (HPF/LPF bipolar knob) → channel fader → crossfader → master.
- **Beatmatching:** sync tempo with `playbackRate` and phase-align on bar boundaries.
- **Master FX (RMX-style):** reverb (generated IR convolver), echo/delay throws, beat roll/loop stutter, noise riser and sweep, phaser/flanger, bass kill, vinyl brake, gate.
- **Output:** master analyser feeding the live visuals.

## 3. AI DJ

- **Queue:** user-added, drag to reorder, back-to-back. The next track loads into the next deck (1→2→3→4).
- **Transitions:** start the incoming track's intro at a phrase (8-bar) boundary so its first drop lands after the outgoing track's last drop. The incoming track starts with low EQ cut and is faded in; the bass swaps on a phrase boundary; then the outgoing track is filtered out. Length is 16–32 bars, adapted to the intro and outro lengths (radio edits have short intros, so use echo-out or a cut-on-the-one transition there).
- **Builds:**
  - HPF sweep up and a noise riser over the build bars.
  - Echo/reverb throw on the last beat.
  - Bass kill on the last beat, then slam back in on the drop.
- **Mid-drop:** occasional beat roll or loop stutter.
- **Style:** a "reads the room" personality that reacts to crowd hype (low hype → bigger FX, an earlier mix to a stronger track).
- **Animation link:** every action emits a gesture event `{deck, control, value, duration}`. The 3D DJ's hand goes to that exact knob or fader, and the knob visibly turns. The DJ is calmer than the crowd: nods, hand up on the big drops, headphones on one ear while cueing, styled outfit.

## 4. Brain: crowd model

**Personality per person** (no two alike):

| Trait | Notes |
|---|---|
| energy | |
| taste | likes bass, likes vocals, likes builds |
| reaction delay | |
| stamina / fatigue | |
| sociability | |
| style | jumper, head-bobber, two-step, arms-up raver, swayer, filmer, bar-hanger |
| beat-phase offset | |
| motion amplitude and tempo | some dance at double or half time |

**Reaction rules:**
- Anticipation grows during builds, since the brain knows `nextDrop`.
- Drops trigger a release spike scaled by drop strength × anticipation × (1 − fatigue) × taste.
- Breakdowns bring rest or sway, and some people head to the bar.

**Logging:** each drop's average reaction and best and worst people go to a **scorecard**. A **brain view** opens when you click a person and shows their regions (groove/motor, anticipation/dopamine, euphoria, fatigue) and the current song section. The crowd-wide hype timeline is overlaid on the track timeline.

## 5. Club (3D)

**Space:** dark warehouse techno room, about 28 m × 18 m × 8 m. It should be clean, mid-size and designed, with no grey boxes. Walls are concrete or brick with steel trusses, columns and a polished concrete floor.

**Stage:** a DJ booth on a riser with a crowd barrier. Security guards stand at the barrier and the entrance.

**Booth:** matches reference image 1 (exact layout):
- **Left to right:** CDJ, CDJ, DJM 4-channel mixer, CDJ, CDJ.
- **On top:** the RMX FX unit sits centred above the mixer. It has 3 big knobs on the left, a large blue-ringed jog/X-pad knob on the right, and a small screen.
- **Each CDJ:**
  - a top touchscreen with a scrolling RGB waveform (amber, blue and white) and an overview strip;
  - BPM, elapsed and remaining time, track title, beat counter and phrase markers;
  - a big jog wheel with a centre display (red/blue ring) that **spins when playing**;
  - play/cue buttons (bottom-left, green and amber);
  - a tempo fader on the right; hot-cue pads; a USB slot.
- **Mixer:**
  - per channel: trim, Hi, Mid and Low EQ, color FX knob, channel fader and VU meter;
  - a crossfader;
  - a beat-FX section on the right with a small screen.
- **Displays:** a deck that isn't playing shows a static waveform; an empty deck shows "no track". The waveform must match the actual audio.
- **Cabling:** everything is cabled together.

**Ceiling LED structure** (reference image 2):
- A big square pixel-LED grid of rows of LED cubes sits on the ceiling. It continues down a column/pillar wall and wraps around.
- Additional fixtures sit inside and near it.
- It is audio-reactive: patterns, colour washes, sweeps on builds and full white flashes on drops.

**More lighting:** moving heads with volumetric beams, lasers, strobes, LED strips along trusses, an LED wall behind the DJ, haze/smoke particles and bloom. The lighting is professional throughout.

**Speakers:** line arrays flying either side of the stage, a sub stack and booth monitors. The audio still plays from the user's computer.

**Other areas:**
- a bar with back-lit shelves and bottles;
- neon signage;
- a backstage/green room (couch, flight cases, mirror, door) visible behind the stage;
- an entrance and fire exits;
- a balcony / upper mezzanine.

**Crowd:** 200 detailed people with varied body sizes, skin tones, hair, clothing and accessories. No blocky figures: they are articulated with hands, faces and shoes. For believable realism, consider rigged GLB humans with instancing or vertex-shader animation.
- **Phones:** detailed handsets. Some screens are bright, some show the flash on, some have no flash; people film the drops.

## 6. Cameras

- Free orbit
- Drone, with real drone physics: inertia, banking, altitude hold and scripted flight paths over the crowd
- Balcony view from the upper mezzanine
- DJ POV
- Front-of-deck fisheye: a wide fisheye lens just in front of the decks showing the DJ and the gear (reference image 3, a GoPro-style booth cam)
- Front view
- Phone-in-crowd view: handheld shake, bounce when the holder jumps, people blocking the shot
- Visible camera rigs in the scene where the views are taken from

## 7. UI

- Drag-drop MP3s and a queue list with reorder.
- Songs are stored in IndexedDB so they don't need re-uploading; they are never committed.
- Analysis progress indicator.
- Now-playing panel: section, "drop in N bars", BPM and a hype meter.
- Track timeline: sections coloured, drops marked, crowd hype overlaid.
- DJ action log, camera buttons, volume control, crowd brain panel and drop scorecard.

---

# Decisions from the user (round 2). These override anything above.

## Drops and crowd realism
- Drop = mostly a bass drop. Sometimes a **vocal hook landing** counts too (needs vocal detection).
- The crowd must not overreact. Reactions are realistic and restrained; people differ a lot (some jump, some bob, some barely move).
- **Sing-along:** rare (about 1 in 5 songs, or only on one specific song). Use varied voice models/layers. Cheering is more common.
- **Quiet or break sections:** light "oh yeah" cheers and, rarely, a few claps. If the beat suits it, clap along. These are random events (roughly every 5–10 songs), not constant.
- Cheers, claps and sing-along are **synthesized/layered crowd audio** mixed quietly under the music (no sample files needed up front; bring in free CC0 crowd samples later if wanted).

## Crowd layout (200 people)
- **Front:** the tallest people, most hyped, some pushing in.
- **Middle:** jumpers.
- **Back:** chill. A few jumpers at the back who couldn't get to the front.
- People bump and push past each other; some push toward the front.
- **Bar at the back, with bartenders:** people drift there naturally (not obviously), wait, get served, take the drink and walk back. Bartenders visibly make drinks.
- Extra life details (ideas I will add): people greeting friends and hugging, a few couples, someone leaving and re-entering, security checking the barrier, glow sticks and drinks being raised on the drop, someone filming a story, hair and clothes moving, sweat sheen late in the night, crowd density shifting with the song's energy.

## AI DJ transitions (fully automatic)
- **Energy matching:** a high-energy outgoing section must land on a high-energy section of the incoming track. The planner scores candidate (out-point, in-point) pairs by energy, key/bass compatibility and phrase alignment, then picks the best.
- Transition types: 16-bar blend, 8-bar blend, echo-out, filter swap, bass-swap, cut on the one. Chosen by intro/outro length and energy.
- The DJ also: cuts the bass at certain points, uses cue points, and can lay one track's vocal over another's drop (acapella-style) when the keys are compatible.
- **Every transition is explained on screen** in plain language (for example "16-bar blend: bass swap on bar 8, high-pass sweep out, drop lands on the outgoing breakdown").
- **FX:** subtle mid-song. Strong on builds, drops and transitions. The RMX unit is used in transitions in basically every song.

## DJ and booth look
- DJ: white shirt, full tattoo sleeves on both arms, black jeans, silver watch, black cap, sunglasses. Calmer than the crowd.
- A group of girls dancing behind the decks, well away from the DJ, in club outfits.
- **Very realistic people are the top priority.** No cylinder or sphere people. Realistic eyes, bodies, clothing.

## Lighting
- **Blue and purple** as the main LED colors, with the ceiling LED grid from reference image 2. Wall color washes and designs, an LED dance floor, professional natural-looking effects that match the song, with no gimmicky patterns.

## Character models
- Cloud sandbox can only reach GitHub (Mixamo, Sketchfab, Quaternius, Poly Pizza and CDNs are blocked). The only models I can fetch myself are the three.js sample characters (Michelle, Xbot, Soldier), which are low-poly and **not** realistic enough.
- Plan: the user downloads realistic rigged characters (GLB) and drops them in `public/models/`. The code is built to load them and fall back to the sample characters.
