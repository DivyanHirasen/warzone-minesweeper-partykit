# gave-proper — Space War

A 2-player real-time PvP space war game running on [PartyKit](https://partykit.io).

## Game rules

- Each player starts with **100 HP** and **0 rockets**
- **Build Rocket** — takes 10 seconds, one at a time
- **Fire** — costs 1 rocket, deals **20 damage** to the opponent
- First player to reach 0 HP loses
- You cannot see the opponent's rockets or build status — intel blackout

## Architecture

The server (`src/server.ts`) is the single source of truth. The frontend only sends intent (`BUILD_ROCKET`, `FIRE_ROCKET`, `READY`) and renders what the server sends back. No game logic runs in the browser.

### Server → client messages

| Message | Recipient | Description |
|---|---|---|
| `STATE` | individual | Player's own state + opponent HP |
| `WAITING_FOR_OPPONENT` | individual | Sent when room has 1 player |
| `ROCKET_READY` | individual | Build timer completed |
| `ATTACKED` | defender only | Incoming hit with damage + new HP |
| `FIRE_CONFIRMED` | shooter only | Shot landed, opponent's new HP |
| `GAME_OVER` | broadcast | Match ended, includes winner ID |
| `OPPONENT_DISCONNECTED` | individual | Other player left |
| `ROOM_FULL` | individual | 3rd connection attempt rejected |

## Development

```bash
npm install
npm run dev     # http://localhost:1999
```

Add `?room=test` to the URL to use a fixed room during development. Open two tabs to test both players.

## Deploy

```bash
npm run deploy
```
