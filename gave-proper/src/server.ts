import type * as Party from "partykit/server";

// ─── Types ───────────────────────────────────────────────────────────────────

type GameStatus = "idle" | "playing" | "won" | "lost";

interface GameState {
  rows: number;
  cols: number;
  mines: number;
  grid: number[][];        // -1 = mine, 0-8 = number
  revealed: boolean[][];
  flagged: boolean[][];
  minePos: number[];       // flat indices
  status: GameStatus;
  scores: Record<string, number>; // playerId -> cells revealed
  difficulty: string;
}

type ClientMsg =
  | { type: "REVEAL"; x: number; y: number }
  | { type: "FLAG";   x: number; y: number }
  | { type: "RESET";  difficulty?: string };

// ─── Difficulty configs ───────────────────────────────────────────────────────

const CONFIGS: Record<string, { rows: number; cols: number; mines: number }> = {
  easy:   { rows: 9,  cols: 9,  mines: 10 },
  medium: { rows: 16, cols: 16, mines: 40 },
  hard:   { rows: 16, cols: 30, mines: 99 },
};

// ─── Server ──────────────────────────────────────────────────────────────────

export default class MinesweeperServer implements Party.Server {
  private state: GameState | null = null;

  constructor(readonly room: Party.Room) {}

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  onConnect(conn: Party.Connection) {
    if (!this.state) {
      this.state = this.createState("easy");
    }
    // Send full state to the new player
    conn.send(JSON.stringify({ type: "STATE", state: this.serializeState() }));
  }

  onMessage(raw: string, sender: Party.Connection) {
    if (!this.state) this.state = this.createState("easy");

    let msg: ClientMsg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {
      case "REVEAL": this.handleReveal(msg.x, msg.y, sender.id); break;
      case "FLAG":   this.handleFlag(msg.x, msg.y);              break;
      case "RESET":  this.handleReset(msg.difficulty);           break;
    }
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  private handleReveal(x: number, y: number, playerId: string) {
    const s = this.state!;
    if (s.status === "won" || s.status === "lost") return;
    if (s.revealed[y][x] || s.flagged[y][x]) return;

    // First click: place mines with safe zone
    if (s.status === "idle") {
      this.placeMines(x, y);
      s.status = "playing";
    }

    // Flood fill reveal
    const newlyRevealed: Array<{ x: number; y: number; value: number }> = [];
    this.floodReveal(x, y, newlyRevealed, s);

    if (!s.scores[playerId]) s.scores[playerId] = 0;

    if (s.grid[y][x] === -1) {
      // Hit a mine
      s.status = "lost";
      this.room.broadcast(JSON.stringify({
        type: "GAME_OVER",
        won: false,
        minePos: s.minePos,
        explodeX: x,
        explodeY: y,
        scores: s.scores,
      }));
      return;
    }

    // Credit score (only safe cells)
    s.scores[playerId] += newlyRevealed.length;

    this.room.broadcast(JSON.stringify({
      type: "CELLS_REVEALED",
      cells: newlyRevealed,
      scores: s.scores,
    }));

    // Check win
    if (this.checkWin()) {
      s.status = "won";
      this.room.broadcast(JSON.stringify({
        type: "GAME_OVER",
        won: true,
        scores: s.scores,
      }));
    }
  }

  private handleFlag(x: number, y: number) {
    const s = this.state!;
    if (s.status === "won" || s.status === "lost") return;
    if (s.revealed[y][x]) return;

    s.flagged[y][x] = !s.flagged[y][x];
    this.room.broadcast(JSON.stringify({
      type: "CELL_FLAGGED",
      x, y,
      flagged: s.flagged[y][x],
    }));
  }

  private handleReset(difficulty?: string) {
    const diff = difficulty && CONFIGS[difficulty] ? difficulty : (this.state?.difficulty ?? "easy");
    this.state = this.createState(diff);
    this.room.broadcast(JSON.stringify({
      type: "STATE",
      state: this.serializeState(),
    }));
  }

  // ── Game logic ─────────────────────────────────────────────────────────────

  private createState(difficulty: string): GameState {
    const cfg = CONFIGS[difficulty] ?? CONFIGS.easy;
    const { rows, cols } = cfg;
    const grid: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));
    const revealed: boolean[][] = Array.from({ length: rows }, () => Array(cols).fill(false));
    const flagged: boolean[][] = Array.from({ length: rows }, () => Array(cols).fill(false));
    return { ...cfg, grid, revealed, flagged, minePos: [], status: "idle", scores: {}, difficulty };
  }

  private placeMines(safeX: number, safeY: number) {
    const s = this.state!;
    const { rows, cols, mines } = s;
    const safe = new Set<number>();
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const nr = safeY + dr, nc = safeX + dc;
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) safe.add(nr * cols + nc);
      }
    }

    const mineSet = new Set<number>();
    while (mineSet.size < mines) {
      const idx = Math.floor(Math.random() * rows * cols);
      if (!safe.has(idx)) mineSet.add(idx);
    }
    s.minePos = [...mineSet];

    // Mark mines and compute numbers
    for (const idx of mineSet) {
      const r = Math.floor(idx / cols), c = idx % cols;
      s.grid[r][c] = -1;
    }
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (s.grid[r][c] === -1) continue;
        let count = 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && s.grid[nr][nc] === -1) count++;
          }
        }
        s.grid[r][c] = count;
      }
    }
  }

  private floodReveal(
    x: number, y: number,
    out: Array<{ x: number; y: number; value: number }>,
    s: GameState
  ) {
    const { rows, cols } = s;
    const stack: Array<[number, number]> = [[x, y]];
    while (stack.length) {
      const [cx, cy] = stack.pop()!;
      if (cx < 0 || cx >= cols || cy < 0 || cy >= rows) continue;
      if (s.revealed[cy][cx] || s.flagged[cy][cx]) continue;
      s.revealed[cy][cx] = true;
      out.push({ x: cx, y: cy, value: s.grid[cy][cx] });
      if (s.grid[cy][cx] === 0) {
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            stack.push([cx + dc, cy + dr]);
          }
        }
      }
    }
  }

  private checkWin(): boolean {
    const s = this.state!;
    const { rows, cols, mines } = s;
    let count = 0;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (s.revealed[r][c]) count++;
    return count === rows * cols - mines;
  }

  // ── Serialization ──────────────────────────────────────────────────────────

  private serializeState() {
    const s = this.state!;
    const gameOver = s.status === "lost" || s.status === "won";
    // Send grid values only for revealed cells (safe — numbers don't reveal mine positions)
    // and all values on game over
    const grid = s.grid.map((row, r) =>
      row.map((v, c) => (gameOver || s.revealed[r][c]) ? v : 0)
    );
    return {
      rows: s.rows,
      cols: s.cols,
      mines: s.mines,
      grid,
      revealed: s.revealed,
      flagged: s.flagged,
      minePos: gameOver ? s.minePos : [],
      status: s.status,
      scores: s.scores,
      difficulty: s.difficulty,
    };
  }
}

MinesweeperServer satisfies Party.Worker;
