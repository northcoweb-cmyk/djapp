# Sublevel: club sim

A browser club simulator. You drop in house or techno MP3s and line up a queue. An AI DJ then mixes the set on 4 CDJ-style decks, a 4-channel mixer and an RMX-style FX unit, while a living crowd reacts in a detailed warehouse club. You can watch it like a filmed set with quick cuts, or walk around as the club owner.

## Run locally

```bash
npm install
npm run dev
```

Vercel builds it as a static Vite app (`npm run build` → `dist/`).

## Using it

1. Drop MP3s on the start screen, or use **+ Add songs** later. Songs and their analysis are saved in your browser, so they're instant next time.
2. **Enter the club.** It opens quiet, with crowd chatter.
3. Arrange **Up next**: ▲▼ to reorder, ⏭ to play next, ✕ to remove, ↺ in Played to replay.
4. Press **Start set** (or Space). The first track opens with a 6-second filter and bass fade-in.

### Shortcuts

| Key | Action |
|---|---|
| `1`–`0` | Cameras: wide, DJ close, deck cam, behind DJ, side stage, in the crowd, phone, balcony, drone, overhead |
| `Tab` | Next camera |
| `A` | Auto-director: cuts on the music |
| `H` | Hide all UI |
| `C` | Cinematic mode: REC, timecode, letterbox, film grain |
| `F` | Fullscreen |
| `N` | Mix the next track now |
| `Q` / `B` / `D` | Toggle the set panel / brain panel / DJ view |
| `O` | Free orbit camera |
| `P` | Walk as the owner: `WASD`, drag to look, `Shift` to run |
| `?` | Show all shortcuts |

Click anyone in the crowd to see their brain.

## What's inside

- **Ears** (`src/audio/analyzer.js`): BPM, beat grid, downbeats, bars, and sections (intro/groove/breakdown/build/drop/outro). It also finds drops and scores their strength.
- **Library** (`src/audio/library.js`): IndexedDB storage for songs, analysis and queue order. Audio is decoded on demand, so long queues stay light on memory.
- **AI DJ** (`src/audio/autodj.js`):
  - **Queue:** a set with now playing, up next and history.
  - **Transitions:** energy-matched and phrase-aligned (the incoming drop lands as the outgoing track leaves its last high-energy section), as 16-bar, 8-bar or 4-bar mixes or echo-out cuts. They work even for songs added late.
  - **Mixing moves:** low-EQ cut on the way in, bass swap halfway, high-pass sweep plus echo/reverb throw on the way out.
  - **Build and drop FX:** HPF sweep, noise riser, bass kill on the last beat, slam back in, ½-beat roll.
- **Audio engine** (`src/audio/engine.js`):
  - **Decks:** 4, each with 3-band EQ, filter, fader, and echo/reverb sends.
  - **Synthesized crowd:** chatter, cheers, claps and chants.
- **Club** (`src/scene/club.js`, `src/scene/rooms.js`):
  - **Lighting:** LED pixel ceiling with a canopy, LED wall, LED dance floor, moving heads with floor gobos, lasers, strobes, washes, haze, and CO2 cannons on big drops.
  - **Bar:** onyx-front bar with backlit bottles.
  - **VIP lounge.**
  - **Balcony:** walkable, along the left wall, with couches and LED-edged stairs.
  - **Restrooms:** behind the left wall, with stalls, sinks and urinals.
  - **Backstage:** a lit green room.
- **Navigation** (`src/scene/nav.js`): walkable areas per level, obstacles, zones, seats/spots, and a waypoint graph with path finding.
- **People** (`src/scene/people.js`):
  - **Rendering:** atlased characters, one draw call each, with per-person outfit tints.
  - **Crowd:** personalities and a brain model (groove, anticipation, euphoria, chills, fatigue).
    - **Motion:** beat-locked bounce, sway and head nods, a crouch before drops, and on-beat hops with arms up after big drops.
    - **Spacing:** nobody overlaps; walkers steer around people and dancers step aside.
    - **Errands:** bar runs, restroom visits, seating and the balcony rail.
  - **Staff:** bartenders serve guests. Security scans the owner at private areas.
  - **DJ:** steps toward the deck in use, IK hands reach the exact control, hand-ups, jumps on drops, headphones.
- **Camera director** (`src/camera/director.js`): 15 shots with their own moves, quick cuts, and an auto-director that cuts on bars and beats by song section.
- **HUD** (`src/ui/`):
  - **Set panel:** shows the transition plan with countdowns.
  - **4-deck waveform view:** beat grid, sections, drops and mix markers.
  - **Brain panel:** prefrontal, motor, auditory, caudate, accumbens, amygdala and cerebellum.
  - **Drop scorecard.**

## Assets

- `tools/convert-models.cjs` converts the raw Mixamo FBX files in `source-models/` into `public/models/` (character GLBs and clip JSON).
- `tools/make-lods.mjs` builds the low-poly crowd versions.
- Raw files aren't deployed (`.vercelignore`).
- Phone: "Generic cellphone" by AndrxTMZ (Sketchfab Standard licence).
- Characters and animations: Adobe Mixamo.
