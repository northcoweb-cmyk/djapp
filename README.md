# Sublevel: club sim

A browser club simulator. You drop in house or techno MP3s, and an AI DJ mixes them on 4 CDJ-style decks with a 4-channel mixer and an RMX-style FX unit. A 3D crowd with individual personalities reacts to the music in a dark warehouse club.

## Run locally

```bash
npm install
npm run dev
```

Deploys on Vercel as a static Vite app (`npm run build` → `dist/`).

## What's in the prototype

- **Ears** (`src/audio/analyzer.js`): BPM, beat grid, downbeats, bars, sections (intro/groove/breakdown/build/drop/outro), drops with strength.
- **AI DJ** (`src/audio/autodj.js`): queue played back-to-back across decks 1→2→3→4.
  - Phrase-aligned 16- or 8-bar blends, timed so the incoming drop lands as the outgoing track leaves its last drop.
  - Mixing moves: low-EQ cut on the incoming track, bass swap at the halfway point, high-pass sweep plus echo/reverb throw out.
  - Build/drop FX: HPF sweep, noise riser, bass kill on the last beat, slam back in, ½-beat roll.
  - Every move is explained in the DJ log.
- **Audio engine** (`src/audio/engine.js`):
  - Per deck: trim, 3-band EQ, bipolar filter, fader, echo/reverb sends.
  - FX: beat roll, noise riser.
  - Synthesized crowd: male and female "woo" cheers on drops, "oh yeah"s in quiet parts, clap-alongs (~1 track in 4), "oh-oh" chants in key (~1 in 5).
- **Club** (`src/scene/club.js`):
  - Room: 30×20×8 m warehouse.
  - Lighting: LED pixel ceiling with a canopy curving down over the stage and pixel-wrapped pillars, audio-reactive LED wall, LED dance floor, 10 moving heads, lasers, strobes, wall washes, haze. Blue and purple throughout.
  - Areas: line arrays, subs, booth monitors, bar with back-bar bottles, taps and stools, VIP lounge with couches, rope and candles, balcony, backstage green room, entrance, exit signs, neon signage.
  - Navigation: colliders and zones.
- **Booth** (`src/scene/booth.js`):
  - CDJ, CDJ, mixer, CDJ, CDJ layout, with the RMX unit raised behind the mixer.
  - CDJ screens draw the real analysed 3-band waveform, beat grid, sections and overview.
  - Jogs spin while playing.
  - Knobs, faders and VU meters mirror the engine.
- **People** (`src/scene/people.js`): converted Mixamo characters, with every animation retargeted to every character.
  - **Crowd:** each person has an energy level, bass/vocal/build taste, reaction delay, stamina, style and beat phase.
    - The brain model tracks groove, anticipation, euphoria and fatigue.
    - Drop reactions scale with drop strength, anticipation, fatigue and taste.
    - Layout: the front is tall and hyped, the middle has jumpers, the back is chill. A few pushers creep forward.
  - **Bar trips:** people walk to the bar, wait, get served by the bartenders, and walk back with a beer, cup or cocktail.
  - **Lounge:** seated guests.
  - **Security:** suited guards. They face you, scan you and wave you through private areas.
  - **DJ:** Ch38 in a white shirt, black cap, sunglasses and silver watch. CCD IK moves his hands to the exact knob or fader being used.
  - **Behind the decks:** dancers.
  - **Phones:** filmers hold the phone model, with screen glow and flash.
- **Cameras:** orbit, drone (inertia and banking), balcony, DJ POV, deck fisheye, front, phone-in-crowd, and Play (the owner, WASD and mouse drag).
- **UI:** queue, DJ log, crowd brain (click anyone for their own brain), drop scorecard, section timeline with a hype trace, FPS counter. Auto-resolution aims for 60 fps.

## Assets

- `tools/convert-models.cjs` converts the raw Mixamo FBX files in `source-models/` into `public/models/`. Each character becomes a GLB of about 1.3 MB with 512 px textures and a simplified mesh. Clips become JSON (in place, with normalised bone names).
- Raw files aren't deployed (`.vercelignore`).
- Phone: "Generic cellphone" by AndrxTMZ (Sketchfab Standard licence).
- Characters and animations: Adobe Mixamo.
