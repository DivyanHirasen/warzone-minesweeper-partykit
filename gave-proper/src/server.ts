import type * as Party from "partykit/server";

type GameStatus = "waiting" | "playing" | "ended";

interface PlayerState {
  id: string;
  health: number;
  rockets: number;
  isBuilding: boolean;
  buildEndsAt: number | null;
  ready: boolean;
}

interface RoomState {
  players: Record<string, PlayerState>;
  status: GameStatus;
  winnerId: string | null;
}

type ClientMsg =
  | { type: "BUILD_ROCKET" }
  | { type: "FIRE_ROCKET" }
  | { type: "READY" };

const MAX_PLAYERS = 2;
const ROCKET_BUILD_MS = 10_000;
const ROCKET_DAMAGE = 20;
const STARTING_HEALTH = 100;

export default class SpaceWarServer implements Party.Server {
  private state: RoomState = { players: {}, status: "waiting", winnerId: null };
  private buildTimers: Record<string, ReturnType<typeof setTimeout>> = {};

  constructor(readonly room: Party.Room) {}

  onConnect(conn: Party.Connection) {
    const playerCount = Object.keys(this.state.players).length;

    if (playerCount >= MAX_PLAYERS) {
      conn.send(JSON.stringify({ type: "ROOM_FULL", message: "Room is full (2/2 players)." }));
      conn.close();
      return;
    }

    this.state.players[conn.id] = {
      id: conn.id,
      health: STARTING_HEALTH,
      rockets: 0,
      isBuilding: false,
      buildEndsAt: null,
      ready: false,
    };

    const newCount = Object.keys(this.state.players).length;
    if (newCount === 1) {
      conn.send(JSON.stringify({ type: "WAITING_FOR_OPPONENT" }));
    } else {
      // Second player joined — notify both
      this.sendState(conn.id);
      const otherId = this.getOpponentId(conn.id);
      if (otherId) this.sendState(otherId);
    }
  }

  onClose(conn: Party.Connection) {
    const player = this.state.players[conn.id];
    if (!player) return;

    // Cancel any pending build timer
    if (this.buildTimers[conn.id]) {
      clearTimeout(this.buildTimers[conn.id]);
      delete this.buildTimers[conn.id];
    }

    delete this.state.players[conn.id];

    const opponentId = this.getOpponentId(conn.id);
    if (opponentId) {
      const opponentConn = this.getConn(opponentId);
      if (opponentConn) {
        opponentConn.send(JSON.stringify({ type: "OPPONENT_DISCONNECTED" }));
      }
    }

    // If game was playing, pause it back to waiting
    if (this.state.status === "playing") {
      this.state.status = "waiting";
    }
  }

  onMessage(raw: string, sender: Party.Connection) {
    let msg: ClientMsg;
    try { msg = JSON.parse(raw); } catch { return; }

    const player = this.state.players[sender.id];
    if (!player) return;

    switch (msg.type) {
      case "READY":     this.handleReady(sender.id); break;
      case "BUILD_ROCKET": this.handleBuild(sender.id); break;
      case "FIRE_ROCKET":  this.handleFire(sender.id); break;
    }
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  private handleReady(playerId: string) {
    const player = this.state.players[playerId];
    if (!player || this.state.status !== "waiting") return;
    player.ready = true;

    const players = Object.values(this.state.players);
    if (players.length === 2 && players.every(p => p.ready)) {
      this.state.status = "playing";
      for (const p of players) this.sendState(p.id);
    } else {
      this.sendState(playerId);
    }
  }

  private handleBuild(playerId: string) {
    const player = this.state.players[playerId];
    if (!player || this.state.status !== "playing") return;
    if (player.isBuilding) return; // already building

    player.isBuilding = true;
    player.buildEndsAt = Date.now() + ROCKET_BUILD_MS;
    this.sendState(playerId);

    this.buildTimers[playerId] = setTimeout(() => {
      const p = this.state.players[playerId];
      if (!p) return;
      p.isBuilding = false;
      p.buildEndsAt = null;
      p.rockets += 1;
      delete this.buildTimers[playerId];

      const conn = this.getConn(playerId);
      if (conn) {
        conn.send(JSON.stringify({ type: "ROCKET_READY" }));
        this.sendState(playerId);
      }
    }, ROCKET_BUILD_MS);
  }

  private handleFire(playerId: string) {
    const player = this.state.players[playerId];
    if (!player || this.state.status !== "playing") return;
    if (player.rockets < 1) return;

    const opponentId = this.getOpponentId(playerId);
    if (!opponentId) return;
    const opponent = this.state.players[opponentId];
    if (!opponent) return;

    player.rockets -= 1;
    opponent.health = Math.max(0, opponent.health - ROCKET_DAMAGE);

    // Confirm to shooter
    const shooterConn = this.getConn(playerId);
    if (shooterConn) {
      shooterConn.send(JSON.stringify({
        type: "FIRE_CONFIRMED",
        opponentNewHealth: opponent.health,
      }));
      this.sendState(playerId);
    }

    // Notify defender
    const defenderConn = this.getConn(opponentId);
    if (defenderConn) {
      defenderConn.send(JSON.stringify({
        type: "ATTACKED",
        damage: ROCKET_DAMAGE,
        newHealth: opponent.health,
      }));
      this.sendState(opponentId);
    }

    // Check win condition
    if (opponent.health <= 0) {
      this.state.status = "ended";
      this.state.winnerId = playerId;
      this.room.broadcast(JSON.stringify({
        type: "GAME_OVER",
        winnerId: playerId,
      }));
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private sendState(playerId: string) {
    const conn = this.getConn(playerId);
    if (!conn) return;
    const player = this.state.players[playerId];
    if (!player) return;
    const opponentId = this.getOpponentId(playerId);
    const opponent = opponentId ? this.state.players[opponentId] : null;

    conn.send(JSON.stringify({
      type: "STATE",
      health: player.health,
      rockets: player.rockets,
      isBuilding: player.isBuilding,
      buildEndsAt: player.buildEndsAt,
      gameStatus: this.state.status,
      opponentHealth: opponent?.health ?? null,
      opponentConnected: !!opponent,
      winnerId: this.state.winnerId,
      isWinner: this.state.winnerId === playerId,
    }));
  }

  private getOpponentId(playerId: string): string | null {
    return Object.keys(this.state.players).find(id => id !== playerId) ?? null;
  }

  private getConn(playerId: string): Party.Connection | null {
    for (const conn of this.room.getConnections()) {
      if (conn.id === playerId) return conn;
    }
    return null;
  }
}

SpaceWarServer satisfies Party.Worker;
