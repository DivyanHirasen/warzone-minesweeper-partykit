# PartyKit Architecture — Space War

How PartyKit powers real-time multiplayer in this project.

---

## High-level overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                        PARTYKIT CLOUD                                │
│                                                                      │
│   ┌────────────────────────────────────────────────────────────┐     │
│   │                    Room: "abc123"                          │     │
│   │                                                            │     │
│   │   ┌──────────────────────────────────────────────────┐     │     │
│   │   │           SpaceWarServer instance                │     │     │
│   │   │                                                  │     │     │
│   │   │   RoomState {                                    │     │     │
│   │   │     players: { connA: {...}, connB: {...} }      │     │     │
│   │   │     status: "playing"                            │     │     │
│   │   │     winnerId: null                               │     │     │
│   │   │   }                                              │     │     │
│   │   │                                                  │     │     │
│   │   │   buildTimers: { connA: setTimeout(...) }        │     │     │
│   │   └──────────┬───────────────────────┬───────────────┘     │     │
│   │              │                       │                     │     │
│   │         WebSocket              WebSocket                   │     │
│   │              │                       │                     │     │
│   └──────────────┼───────────────────────┼─────────────────────┘     │
│                  │                       │                           │
└──────────────────┼───────────────────────┼───────────────────────────┘
                   │                       │
            ┌──────┴──────┐         ┌──────┴──────┐
            │  Player A   │         │  Player B   │
            │  (browser)  │         │  (browser)  │
            │             │         │             │
            │ index.html  │         │ index.html  │
            │ ?room=abc123│         │ ?room=abc123│
            └─────────────┘         └─────────────┘
```

## What PartyKit does

PartyKit gives you **rooms** — isolated server instances that multiple clients connect to via WebSockets. Each room runs a single instance of your server class and holds state in memory for the lifetime of the room.

In this project:

- The **room ID** comes from the `?room=` URL parameter
- The **server class** (`SpaceWarServer`) is instantiated once per room
- Each browser tab opens a **WebSocket** to that room
- The server holds all game state — players never talk to each other directly

## How a room is created and joined

```
Player A opens:  https://example.partykit.dev/?room=abc123
                          │
                          ▼
              PartyKit checks: does room "abc123" exist?
                          │
                 ┌────────┴────────┐
                 │ NO              │ YES
                 ▼                 ▼
        Create new room      Use existing room
        Instantiate                │
        SpaceWarServer             │
                 │                 │
                 └────────┬────────┘
                          │
                          ▼
              WebSocket connection opened
              onConnect(conn) fires
              conn.id = unique player ID
                          │
                          ▼
              Server checks player count:
                          │
              ┌───────────┼───────────┐
              │           │           │
           0 → 1       1 → 2       2 → reject
              │           │           │
              ▼           ▼           ▼
          Send:       Send STATE   Send ROOM_FULL
          WAITING_    to both      conn.close()
          FOR_        players
          OPPONENT
```

## Message flow during gameplay

All game logic runs on the server. The browser only sends **intent** and renders **responses**.

### Building a rocket

```
  Player A (browser)              Server                    Player B (browser)
       │                            │                            │
       │  { type: "BUILD_ROCKET" }  │                            │
       │ ─────────────────────────► │                            │
       │                            │                            │
       │  STATE { isBuilding:true,  │                            │
       │    buildEndsAt: T+10s }    │                            │
       │ ◄───────────────────────── │                            │
       │                            │                            │
       │  [browser shows countdown] │                            │
       │                            │                            │
       │        ... 10 seconds ...  │                            │
       │                            │                            │
       │  { type: "ROCKET_READY" }  │                            │
       │ ◄───────────────────────── │  (Player B sees nothing)   │
       │                            │                            │
       │  STATE { rockets: 1,       │                            │
       │    isBuilding: false }     │                            │
       │ ◄───────────────────────── │                            │
```

### Firing a rocket

```
  Player A (browser)              Server                    Player B (browser)
       │                            │                            │
       │  { type: "FIRE_ROCKET" }   │                            │
       │ ─────────────────────────► │                            │
       │                            │                            │
       │                            │  Deduct 1 rocket from A    │
       │                            │  Deduct 20 HP from B       │
       │                            │                            │
       │  FIRE_CONFIRMED            │  ATTACKED                  │
       │  { opponentNewHealth: 80 } │  { damage: 20,             │
       │ ◄───────────────────────── │    newHealth: 80 }         │
       │                            │ ──────────────────────────►│
       │                            │                            │
       │  STATE (updated rockets)   │  STATE (updated HP)        │
       │ ◄───────────────────────── │ ──────────────────────────►│
       │                            │                            │
       │  [UI: opponent HP → 80]    │  [UI: red flash "ATTACKED"]│
```

### Game over

```
  Player A (shooter)              Server                    Player B (HP → 0)
       │                            │                            │
       │  { type: "FIRE_ROCKET" }   │                            │
       │ ─────────────────────────► │                            │
       │                            │  opponent.health = 0       │
       │                            │  status = "ended"          │
       │                            │                            │
       │         GAME_OVER { winnerId: A }  (broadcast)          │
       │ ◄───────────────────────── │ ──────────────────────────►│
       │                            │                            │
       │  STATE { isWinner: true }  │  STATE { isWinner: false } │
       │ ◄───────────────────────── │ ──────────────────────────►│
       │                            │                            │
       │  [UI: "VICTORY"]           │  [UI: "DEFEATED"]          │
```

## Key PartyKit APIs used

| API | Where | Purpose |
|---|---|---|
| `Party.Server` | server.ts class | Interface for the room server |
| `Party.Room` | `this.room` | Access to the room (broadcast, connections) |
| `Party.Connection` | `conn` param | Individual WebSocket connection |
| `conn.send()` | handlers | Send a message to one specific player |
| `conn.close()` | onConnect | Reject a 3rd player |
| `this.room.broadcast()` | handleFire | Send to all players at once |
| `this.room.getConnections()` | getConn helper | Iterate connections to find a player |
| `onConnect()` | lifecycle | Fires when a WebSocket connects |
| `onClose()` | lifecycle | Fires when a WebSocket disconnects |
| `onMessage()` | lifecycle | Fires when a client sends a message |

## Information isolation

PartyKit sends messages per-connection, which makes it easy to enforce information hiding:

```
What Player A sees:          What Player B sees:
─────────────────────        ─────────────────────
✓ Own HP                     ✓ Own HP
✓ Own rocket count           ✓ Own rocket count
✓ Own build status           ✓ Own build status
✓ Opponent HP                ✓ Opponent HP
✗ Opponent rockets           ✗ Opponent rockets
✗ Opponent build status      ✗ Opponent build status
```

The `sendState()` method constructs a per-player payload — it reads the opponent's health but never includes their rockets or build status. Since the server is the only place state lives, there's no way for a client to access hidden data.

## File mapping

```
partykit.json          → tells PartyKit which file is the server entry point
src/server.ts          → SpaceWarServer class (all game logic)
public/index.html      → static file served by PartyKit, connects via WebSocket
```

PartyKit serves everything in `public/` as static files and runs `src/server.ts` as the room server. The `?room=` query parameter in the URL maps directly to a PartyKit room ID — same room ID means same server instance, same game.
