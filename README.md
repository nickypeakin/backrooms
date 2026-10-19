# The Backrooms: Closing Time

A co-op, first-person Backrooms horror game that runs in the browser.

It's closing time at Gold Oak Furniture. You and up to three coworkers have to
take the inventory sheet to the stockroom at the end of the back hallway, and
nobody mopped the floor. The first person to step in the puddle slips, falls
backwards *through the wall* and lands on damp carpet under buzzing
fluorescent lights. The wall where they went through starts to glitch, and
everyone else has to walk into it and follow them.

Then you're all in Level 0, and you have to:

- **Regroup.** Everyone lands near the same spot.
- **Find the way out.** Somewhere in the maze is a door with an EXIT sign. You
  can hear it buzz when you get close. Someone has drawn arrows on the walls;
  most of them point the right way.
- **Stay sane.** Sanity drains while you're in Level 0, and faster when you
  wander off alone. Almond water brings it back.
- **Don't get caught.** About 40 seconds after the first person arrives,
  something wakes up. It wanders, listens for running and chases anyone it
  sees. Lights flicker as it gets close. Break line of sight to lose it.

If you're caught or escape, you watch your teammates until the round ends.

**Play it:** <https://nickypeakin.github.io/bdb/> (once GitHub Pages is
switched on, see below). It works in Chrome, Edge or Firefox on a computer
with a keyboard and mouse.

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | walk |
| Mouse | look |
| Shift | run (it can hear you) |
| E | pick up almond water / open the exit door |
| Q | drink almond water |
| F | flashlight |
| Esc | pause |

## Playing with friends

- **Solo:** click **Play Solo**. Three bot coworkers fill the other spots, and
  the match runs in your own tab, so you don't need a fast connection.
- **With friends:** one person clicks **Host a Game** and sends the 5-letter
  code or the invite link. Friends type the code and click **Join**. Empty
  spots can be filled with bots.

There's no game server. The host's browser runs the match, and friends
connect straight to it over WebRTC. The free [PeerJS](https://peerjs.com)
service is only used to find each other by lobby code. The host has to keep
the game open while everyone plays. If a friend drops out mid-match, a bot
takes over their character.

## Publishing to GitHub Pages (one-time setup)

`.github/workflows/pages.yml` tests the game, builds it and publishes it on
every push to the default branch. GitHub only needs to be told to use it
once: in the repository go to **Settings → Pages → Build and deployment →
Source** and pick **GitHub Actions**. Then re-run the workflow from the
**Actions** tab, or push any change.

## Running it locally

Needs Node.js 20 or newer.

```sh
npm install
npm run dev      # builds dist/ and serves it at http://localhost:8080
npm test         # plays a few headless matches against the host simulation
```

## How it's built

Plain JavaScript modules and [three.js](https://threejs.org). Every texture,
model and sound is generated in code, so there are no asset files.

```
public/
  index.html, css/style.css
  js/main.js              menus, lobby and match flow
  js/shared/              rules both the host and clients use
    config.js             tuning numbers
    maze.js               Level 0: seeded maze, path finding, line of sight
    store.js              the furniture store layout and the slip/hole zones
    collision.js, rng.js
  js/host/                runs in the host's browser (and in Node for tests)
    lobby.js              players joining and leaving, starting matches
    match.js              the authoritative match: slip, arrivals, escapes
    bots.js               bot coworkers
    entity.js             the thing in Level 0
    nav.js                movement and path following
  js/client/              what each player sees and hears
    game.js               first-person play, cutscenes, spectating
    storeScene.js         the furniture store
    level0Scene.js        Level 0, lit by a custom fluorescent-grid shader
    vhs.js                the camcorder look (tape wobble, static, grain)
    audio.js              synthesised hum, muzak, footsteps, the entity
    models.js, textures.js, net.js, input.js, ui.js, attract.js
```

Level 0 is generated from a seed the host picks, so every player builds the
same maze without it being sent over the network. Each client moves its own
character and reports where it is; the host decides who slips, moves the bots
and the entity, and says who got caught or got out.

> **Fan project.** Inspired by the Backrooms creepypasta and the found-footage
> videos and film it grew into. Not affiliated with any of their creators.
