# Space War

A 2-player real-time PvP browser game built with [PartyKit](https://partykit.io).

Two players share a room link. Each manages their own base in secret — building rockets and firing at the opponent. First to reach 0 HP loses.

## How to play

1. Open the game and share the URL with your opponent
2. Both players click **READY** to start
3. Click **BUILD ROCKET** — takes 10 seconds to construct
4. Click **FIRE** to deal 20 damage to the enemy base
5. Destroy the enemy base (100 HP) to win

You can't see your opponent's rockets or build status — you only find out when you get hit.

## Project structure

```
gave-proper/
  src/
    server.ts   — PartyKit server (all game logic lives here)
    client.ts   — unused, game runs from index.html
  public/
    index.html  — single-file frontend (UI + WebSocket client)
  partykit.json
```

## Development

```bash
cd gave-proper
npm install
npm run dev     # starts local server at http://localhost:1999
```

## Deploy

```bash
cd gave-proper
npm run deploy
```

## PartyKit CLI reference

```bash
npm install partykit@latest     # install/update CLI

npx partykit dev                # local dev server
npx partykit deploy             # deploy to PartyKit cloud
npx partykit tail               # stream live logs
npx partykit list               # list deployed projects
npx partykit delete             # delete a project

npx partykit env list           # list env var keys
npx partykit env add <key>      # add/update an env var
npx partykit env remove <key>   # remove an env var
npx partykit env pull           # pull env vars to partykit.json
npx partykit env push           # push env vars to platform

npx partykit login              # log in via GitHub
npx partykit logout
npx partykit whoami
npx partykit token generate     # generate token for CI/CD
```
