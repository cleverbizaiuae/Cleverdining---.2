import { useCallback, useEffect, useMemo, useRef, useState, type TouchEvent } from "react";
import { motion } from "motion/react";
import {
  ArrowLeft,
  ChevronRight,
  Gamepad2,
  Pause,
  Phone,
  Play,
  RotateCcw,
  Trophy,
  User,
  Users,
  X,
} from "lucide-react";
import axiosInstance from "@/lib/axios";
import {
  chooseConnect4CpuColumn,
  createConnect4Board,
  dropConnect4Piece,
  getConnect4ValidColumns,
  type Connect4Board,
  type Connect4Piece,
  type Connect4Player,
} from "@/lib/connect4Engine";
import { getPlayerSession, setPlayerSession, type PlayerSession } from "@/lib/playerSession";
import { getTableIdentity } from "@/lib/tableIdentity";
import { useActiveBrandConfig } from "@/lib/useBrandConfig";

type GameId = "snake" | "connect4" | "swajie";
type Point = { x: number; y: number };

type GameHubProps = {
  onBack: () => void;
  onChosenTreater?: (name: string) => void;
};

const submitScore = async (player: PlayerSession | null, score: number, gameType: "snake" | "connect4", restaurantId?: string | number | null) => {
  if (!player?.name || player.name === "Guest" || score <= 0) return;
  await axiosInstance.post("/api/game/score", {
    playerName: player.name,
    ...(player.phone ? { phone: player.phone } : {}),
    ...(player.customerId ? { customerId: player.customerId } : {}),
    score,
    gameType,
    ...(restaurantId ? { restaurantId } : {}),
  });
};

const maskPhone = (phone?: string) => {
  const digits = String(phone || "").replace(/\D/g, "");
  return digits ? `••••${digits.slice(-4)}` : "guest";
};

const gameCards: Array<{ id: GameId; name: string; subtitle: string; bg: string; image?: string; overlay: string }> = [
  {
    id: "snake",
    name: "Snake Xenzia",
    subtitle: "Classic arcade reflex challenge",
    bg: "bg-gray-900",
    image: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=900&q=70",
    overlay: "from-black/90",
  },
  {
    id: "connect4",
    name: "Connect 4",
    subtitle: "Drop discs. Outsmart the table.",
    bg: "bg-blue-900",
    image: "https://images.unsplash.com/photo-1611996575749-79a3a250f948?auto=format&fit=crop&w=900&q=70",
    overlay: "from-blue-950/90",
  },
  {
    id: "swajie",
    name: "Swajie 💸",
    subtitle: "The fairest way to pick who pays",
    bg: "bg-gradient-to-br from-violet-900 via-purple-900 to-indigo-950",
    overlay: "from-black/80",
  },
];

function PlayerSetup({ onComplete }: { onComplete: (player: PlayerSession) => void }) {
  const brand = useActiveBrandConfig();
  const tableInfo = useMemo(() => getTableIdentity(), []);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [nameError, setNameError] = useState("");
  const [saving, setSaving] = useState(false);

  const savePlayer = async (asGuest = false) => {
    const normalizedName = asGuest ? "Guest" : name.trim();
    const normalizedPhone = phone.trim();

    if (!normalizedName) {
      setNameError("Name is required to save your score.");
      return;
    }

    setSaving(true);
    setNameError("");

    const nextPlayer: PlayerSession = {
      name: normalizedName,
      ...(normalizedPhone && !asGuest ? { phone: normalizedPhone } : {}),
    };

    if (normalizedPhone && !asGuest) {
      try {
        const response = await axiosInstance.post("/api/customers/lookup", {
          phone: normalizedPhone,
          name: normalizedName,
          ...(tableInfo.restaurantId ? { restaurantId: tableInfo.restaurantId } : {}),
          ...(brand.restaurantName ? { restaurantName: brand.restaurantName } : {}),
        });
        const customerId = response.data?.id || response.data?.customer?.id || response.data?.customerId;
        if (customerId) nextPlayer.customerId = String(customerId);
      } catch {
        // Score play should not be blocked if CRM lookup is temporarily unavailable.
      }
    }

    setPlayerSession(nextPlayer);
    setSaving(false);
    onComplete(nextPlayer);
  };

  return (
    <div className="relative flex h-full flex-col items-center justify-center overflow-hidden bg-gray-950 px-6 py-8 text-white">
      <motion.div className="absolute -right-20 -top-16 h-64 w-64 rounded-full bg-primary/20 blur-3xl" animate={{ opacity: [0.4, 0.8, 0.4] }} transition={{ duration: 4, repeat: Infinity }} />
      <motion.div className="absolute -bottom-16 -left-20 h-64 w-64 rounded-full bg-violet-500/20 blur-3xl" animate={{ opacity: [0.3, 0.7, 0.3] }} transition={{ duration: 5, repeat: Infinity }} />

      <div className="relative w-full max-w-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.82 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 18 }}
          className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-primary to-violet-500 shadow-2xl shadow-primary/40"
        >
          <Gamepad2 className="h-10 w-10 text-white" strokeWidth={1.8} />
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-7 text-center">
          <h2 className="text-3xl font-black tracking-tight text-white">Join the Arcade</h2>
          <p className="mt-2 text-sm leading-relaxed text-gray-400">Add your phone to save your score and connect games to loyalty.</p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-gray-400">Your Name *</label>
            <div className="relative">
              <User className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" strokeWidth={1.8} />
              <input
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setNameError("");
                }}
                placeholder="e.g. Ahmed"
                className="w-full rounded-2xl border border-white/20 bg-white/10 py-3.5 pl-10 pr-4 text-sm font-medium text-white outline-none placeholder:text-gray-500 focus:border-primary/60 focus:bg-white/15"
              />
            </div>
            {nameError && <p className="mt-1 pl-1 text-xs text-red-400">{nameError}</p>}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-gray-400">
              Phone Number <span className="font-normal normal-case text-gray-600">— optional</span>
            </label>
            <div className="relative">
              <Phone className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" strokeWidth={1.8} />
              <input
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="+971 50 000 0000"
                className="w-full rounded-2xl border border-white/20 bg-white/10 py-3.5 pl-10 pr-4 text-sm font-medium text-white outline-none placeholder:text-gray-500 focus:border-primary/60 focus:bg-white/15"
              />
            </div>
            <p className="mt-1.5 pl-1 text-[11px] text-gray-500">Your phone links your score to your loyalty account.</p>
          </div>

          <button
            onClick={() => void savePlayer(false)}
            disabled={saving}
            className="flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-base font-bold shadow-2xl shadow-primary/30 disabled:opacity-70"
          >
            {saving ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <>Let&apos;s Play <ChevronRight className="h-4 w-4" strokeWidth={1.8} /></>}
          </button>

          <button onClick={() => void savePlayer(true)} className="block w-full text-center text-xs text-gray-500">
            Continue as guest (score won&apos;t be saved)
          </button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="mt-6 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
        >
          <Trophy className="h-4 w-4 shrink-0 text-yellow-400" strokeWidth={1.8} />
          <p className="text-xs leading-relaxed text-gray-300">
            <span className="font-bold text-white">Loyalty points</span> are earned on orders. Phone registration connects games, visits, and spend.
          </p>
        </motion.div>
      </div>
    </div>
  );
}

export function GameHub({ onBack, onChosenTreater }: GameHubProps) {
  const [player, setPlayer] = useState<PlayerSession | null>(() => getPlayerSession());
  const [selectedGame, setSelectedGame] = useState<GameId | null>(null);
  const tableInfo = useMemo(() => getTableIdentity(), []);

  if (selectedGame === "snake") return <SnakeGame onBack={() => setSelectedGame(null)} restaurantId={tableInfo.restaurantId} />;
  if (selectedGame === "connect4") return <Connect4Game onBack={() => setSelectedGame(null)} restaurantId={tableInfo.restaurantId} />;
  if (selectedGame === "swajie") return <SwajieGame onBack={() => setSelectedGame(null)} onChosen={(name) => onChosenTreater?.(name)} />;

  if (!player) return <PlayerSetup onComplete={setPlayer} />;

  return (
    <div className="h-full overflow-y-auto bg-gray-950 px-5 py-6 text-white">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Arcade</h2>
          <div className="mt-1 flex items-center gap-2 text-xs text-gray-400">
            <span className="h-2 w-2 animate-pulse rounded-full bg-green-400" />
            <span>Playing as <span className="font-semibold text-white">{player.name}</span> · <span className="text-gray-500">{maskPhone(player.phone)}</span></span>
          </div>
        </div>
        <button onClick={onBack} className="rounded-full bg-white/10 px-4 py-2 text-xs font-bold text-white hover:bg-white/20">Check Order</button>
      </div>

      <div className="space-y-4">
        {gameCards.map((game, index) => (
          <motion.button
            key={game.id}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.07 }}
            onClick={() => setSelectedGame(game.id)}
            className={`group relative h-40 w-full overflow-hidden rounded-3xl border border-white/10 text-left shadow-md transition-all hover:scale-[1.02] active:scale-95 ${game.bg}`}
          >
            {game.image && <img src={game.image} alt="" className="absolute inset-0 h-full w-full object-cover opacity-50 transition-transform duration-500 group-hover:scale-105" />}
            <div className={`absolute inset-0 bg-gradient-to-t ${game.overlay} to-transparent`} />
            <div className="absolute bottom-0 left-0 p-6">
              <h3 className="mb-1 text-2xl font-bold text-white">{game.name}</h3>
              <p className="text-sm text-gray-300">{game.subtitle}</p>
            </div>
          </motion.button>
        ))}
      </div>

      <p className="mb-4 mt-5 text-sm text-gray-300">Waiting for your food? Kill some time!</p>
      <button onClick={onBack} className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white">
        <ArrowLeft className="h-4 w-4" strokeWidth={1.8} /> Back to orders
      </button>
    </div>
  );
}

const GRID_SIZE = 20;
const SNAKE_SPEED = 150;
const INITIAL_SNAKE: Point[] = [{ x: 10, y: 10 }];
const INITIAL_FOOD: Point = { x: 15, y: 15 };
const INITIAL_DIRECTION: Point = { x: 0, y: -1 };
const SNAKE_BEST_KEY = "cb_snake_best_score";

const samePoint = (a: Point, b: Point) => a.x === b.x && a.y === b.y;

const generateFood = (snake: Point[]) => {
  let candidate = INITIAL_FOOD;
  do {
    candidate = { x: Math.floor(Math.random() * GRID_SIZE), y: Math.floor(Math.random() * GRID_SIZE) };
  } while (snake.some((segment) => samePoint(segment, candidate)));
  return candidate;
};

export function SnakeGame({ onBack, restaurantId }: { onBack: () => void; restaurantId?: string | number | null }) {
  const [snake, setSnake] = useState<Point[]>(INITIAL_SNAKE);
  const [food, setFood] = useState<Point>(INITIAL_FOOD);
  const [gameOver, setGameOver] = useState(false);
  const [score, setScore] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [highScore, setHighScore] = useState(() => Number(localStorage.getItem(SNAKE_BEST_KEY) || 0));
  const directionRef = useRef<Point>(INITIAL_DIRECTION);
  const scoreSubmittedRef = useRef(false);

  const reset = useCallback(() => {
    setSnake(INITIAL_SNAKE);
    setFood(INITIAL_FOOD);
    directionRef.current = INITIAL_DIRECTION;
    setGameOver(false);
    setScore(0);
    setIsPaused(false);
    scoreSubmittedRef.current = false;
  }, []);

  const changeDirection = useCallback((next: Point) => {
    const current = directionRef.current;
    if (next.x === -current.x && next.y === -current.y) return;
    directionRef.current = next;
  }, []);

  const moveSnake = useCallback(() => {
    if (gameOver || isPaused) return;
    setSnake((currentSnake) => {
      const head = currentSnake[0];
      const direction = directionRef.current;
      const newHead = { x: head.x + direction.x, y: head.y + direction.y };
      const hitWall = newHead.x < 0 || newHead.x >= GRID_SIZE || newHead.y < 0 || newHead.y >= GRID_SIZE;
      const hitSelf = currentSnake.some((segment) => samePoint(segment, newHead));

      if (hitWall || hitSelf) {
        setGameOver(true);
        return currentSnake;
      }

      const nextSnake = [newHead, ...currentSnake];
      if (samePoint(newHead, food)) {
        setScore((currentScore) => currentScore + 1);
        setFood(generateFood(nextSnake));
      } else {
        nextSnake.pop();
      }
      return nextSnake;
    });
  }, [food, gameOver, isPaused]);

  useEffect(() => {
    const interval = window.setInterval(moveSnake, SNAKE_SPEED);
    return () => window.clearInterval(interval);
  }, [moveSnake]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowUp") changeDirection({ x: 0, y: -1 });
      if (event.key === "ArrowDown") changeDirection({ x: 0, y: 1 });
      if (event.key === "ArrowLeft") changeDirection({ x: -1, y: 0 });
      if (event.key === "ArrowRight") changeDirection({ x: 1, y: 0 });
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [changeDirection]);

  useEffect(() => {
    if (!gameOver || scoreSubmittedRef.current) return;
    scoreSubmittedRef.current = true;
    const nextBest = Math.max(highScore, score);
    setHighScore(nextBest);
    localStorage.setItem(SNAKE_BEST_KEY, String(nextBest));
    void submitScore(getPlayerSession(), score, "snake", restaurantId).catch(() => {});
  }, [gameOver, highScore, restaurantId, score]);

  const snakeCells = useMemo(() => new Map(snake.map((segment, index) => [`${segment.x}-${segment.y}`, index])), [snake]);

  return (
    <div className="flex h-full flex-col items-center overflow-y-auto bg-gray-950 py-5 text-white">
      <div className="mb-4 flex w-full items-center justify-between px-4">
        <button onClick={onBack} className="inline-flex items-center gap-2 text-sm font-semibold text-white/80 hover:text-white">
          <ArrowLeft className="h-5 w-5" strokeWidth={1.8} /> Back
        </button>
        <div className="flex items-center gap-5 text-right">
          <div><p className="text-[10px] font-bold uppercase text-gray-500">Score</p><p className="text-xl font-bold leading-none text-white">{score}</p></div>
          <div><p className="text-[10px] font-bold uppercase text-yellow-500">Best</p><p className="text-xl font-bold leading-none text-yellow-500">{highScore}</p></div>
        </div>
      </div>

      <div className="relative aspect-square w-full max-w-[350px] rounded-xl border-2 border-gray-800 bg-gray-900 p-2 shadow-xl">
        <div className="grid h-full w-full grid-cols-[repeat(20,1fr)] grid-rows-[repeat(20,1fr)] overflow-hidden rounded-lg bg-gray-800/50">
          {Array.from({ length: GRID_SIZE * GRID_SIZE }).map((_, index) => {
            const x = index % GRID_SIZE;
            const y = Math.floor(index / GRID_SIZE);
            const key = `${x}-${y}`;
            const snakeIndex = snakeCells.get(key);
            const isFood = food.x === x && food.y === y;
            return (
              <div key={key} className="relative border-[0.5px] border-white/5">
                {snakeIndex !== undefined && <div className={`absolute inset-[1px] rounded-sm ${snakeIndex === 0 ? "z-10 scale-110 bg-green-400" : "bg-green-600"}`} />}
                {isFood && <div className="absolute inset-[18%] animate-pulse rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.6)]" />}
              </div>
            );
          })}
        </div>

        {gameOver && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-lg bg-black/90 backdrop-blur-sm">
            <Trophy className="mb-2 h-12 w-12 text-yellow-400" strokeWidth={1.8} />
            <h3 className="mb-1 text-2xl font-bold text-white">Game Over!</h3>
            <p className="mb-6 text-gray-300">Score: {score}</p>
            <button onClick={reset} className="rounded-full bg-white px-8 py-3 font-bold text-black">Play Again</button>
          </div>
        )}
      </div>

      <div className="mt-6 grid w-48 grid-cols-3 gap-2">
        <div />
        <button onClick={() => changeDirection({ x: 0, y: -1 })} className="h-14 rounded-2xl border border-gray-700 bg-gray-800 text-xl text-white hover:bg-gray-700">▲</button>
        <div />
        <button onClick={() => changeDirection({ x: -1, y: 0 })} className="h-14 rounded-2xl border border-gray-700 bg-gray-800 text-xl text-white hover:bg-gray-700">◀</button>
        <button onClick={() => setIsPaused((current) => !current)} className="flex h-14 items-center justify-center rounded-2xl border border-gray-700 bg-gray-800 text-white hover:bg-gray-700">
          {isPaused ? <Play className="h-5 w-5" strokeWidth={1.8} /> : <Pause className="h-5 w-5" strokeWidth={1.8} />}
        </button>
        <button onClick={() => changeDirection({ x: 1, y: 0 })} className="h-14 rounded-2xl border border-gray-700 bg-gray-800 text-xl text-white hover:bg-gray-700">▶</button>
        <div />
        <button onClick={() => changeDirection({ x: 0, y: 1 })} className="h-14 rounded-2xl border border-gray-700 bg-gray-800 text-xl text-white hover:bg-gray-700">▼</button>
        <div />
      </div>
    </div>
  );
}

const ROWS = 6;
const COLS = 7;
type Piece = Connect4Piece;
type ConnectMode = "1p" | "2p" | null;
type Cell = { x: number; y: number };
const createBoard = createConnect4Board;

const checkConnectWin = (board: Piece[][], row: number, col: number, piece: Exclude<Piece, null>): Cell[] => {
  const directions = [
    { x: 0, y: 1 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 1, y: -1 },
  ];

  for (const direction of directions) {
    const cells: Cell[] = [{ x: row, y: col }];
    for (const sign of [1, -1]) {
      let r = row + direction.x * sign;
      let c = col + direction.y * sign;
      while (r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r][c] === piece) {
        cells.push({ x: r, y: c });
        r += direction.x * sign;
        c += direction.y * sign;
      }
    }
    if (cells.length >= 4) return cells.slice(0, 4);
  }
  return [];
};

export function Connect4Game({ onBack, restaurantId }: { onBack: () => void; restaurantId?: string | number | null }) {
  const [mode, setMode] = useState<ConnectMode>(null);
  const [board, setBoard] = useState<Piece[][]>(() => createBoard());
  const [currentPlayer, setCurrentPlayer] = useState<Connect4Player>("red");
  const [winner, setWinner] = useState<Exclude<Piece, null> | "draw" | null>(null);
  const [winningCells, setWinningCells] = useState<Cell[]>([]);
  const boardRef = useRef<Connect4Board>(board);
  const currentPlayerRef = useRef<Connect4Player>("red");
  const winnerRef = useRef<Exclude<Piece, null> | "draw" | null>(null);
  const moveCountRef = useRef(0);
  const scoreSubmittedRef = useRef(false);

  const reset = useCallback((nextMode: ConnectMode = mode) => {
    const nextBoard = createBoard();
    setMode(nextMode);
    boardRef.current = nextBoard;
    setBoard(nextBoard);
    currentPlayerRef.current = "red";
    setCurrentPlayer("red");
    winnerRef.current = null;
    setWinner(null);
    setWinningCells([]);
    moveCountRef.current = 0;
    scoreSubmittedRef.current = false;
  }, [mode]);

  const dropPiece = useCallback((col: number, forcedPlayer?: Connect4Player) => {
    if (winnerRef.current) return false;
    if (!forcedPlayer && mode === "1p" && currentPlayerRef.current !== "red") return false;
    const player = forcedPlayer || currentPlayerRef.current;
    if (player !== currentPlayerRef.current) return false;
    const move = dropConnect4Piece(boardRef.current, col, player);
    if (!move) return false;

    boardRef.current = move.board;
    setBoard(move.board);
    moveCountRef.current += 1;
    const winning = checkConnectWin(move.board, move.row, col, player);
    if (winning.length) {
      winnerRef.current = player;
      setWinner(player);
      setWinningCells(winning);
    } else if (move.board.every((row) => row.every(Boolean))) {
      winnerRef.current = "draw";
      setWinner("draw");
    } else {
      const nextPlayer = player === "red" ? "yellow" : "red";
      currentPlayerRef.current = nextPlayer;
      setCurrentPlayer(nextPlayer);
    }
    return true;
  }, [mode]);

  const validColumns = useMemo(() => getConnect4ValidColumns(board), [board]);

  useEffect(() => {
    if (mode !== "1p" || currentPlayer !== "yellow" || winner || validColumns.length === 0) return undefined;
    const timer = window.setTimeout(() => {
      const cpuColumn = chooseConnect4CpuColumn(boardRef.current);
      if (cpuColumn !== null) dropPiece(cpuColumn, "yellow");
    }, 500);
    return () => window.clearTimeout(timer);
  }, [board, currentPlayer, dropPiece, mode, validColumns.length, winner]);

  useEffect(() => {
    if (winner !== "red" || scoreSubmittedRef.current) return;
    scoreSubmittedRef.current = true;
    void submitScore(getPlayerSession(), moveCountRef.current, "connect4", restaurantId).catch(() => {});
  }, [restaurantId, winner]);

  if (!mode) {
    return (
      <div className="relative flex h-full flex-col items-center justify-center bg-gray-950 px-5 text-white">
        <button onClick={onBack} className="absolute left-4 top-8 inline-flex items-center gap-2 text-sm font-semibold text-white/80 hover:text-white">
          <ArrowLeft className="h-5 w-5" strokeWidth={1.8} /> Back
        </button>
        <h2 className="text-3xl font-bold text-white">Connect 4</h2>
        <p className="mb-8 mt-1 text-gray-400">Choose how you want to play</p>
        <div className="w-full max-w-sm space-y-3">
          <button onClick={() => reset("1p")} className="flex h-16 w-full items-center justify-center gap-3 rounded-2xl border border-blue-500/50 bg-blue-600 text-lg font-bold text-white shadow-lg shadow-blue-900/50 hover:bg-blue-700">
            <User className="h-6 w-6" strokeWidth={1.8} /> Single Player
          </button>
          <button onClick={() => reset("2p")} className="flex h-16 w-full items-center justify-center gap-3 rounded-2xl border border-orange-500/50 bg-orange-600 text-lg font-bold text-white shadow-lg shadow-orange-900/50 hover:bg-orange-700">
            <Users className="h-6 w-6" strokeWidth={1.8} /> Two Players
          </button>
        </div>
      </div>
    );
  }

  const turnLabel = mode === "1p" && currentPlayer === "yellow" ? "CPU" : currentPlayer === "red" ? "Player 1" : "Player 2";

  return (
    <div className="flex h-full flex-col items-center overflow-y-auto bg-gray-950 px-4 py-5 text-white">
      <div className="mb-4 flex w-full items-center justify-between px-2">
        <button onClick={() => setMode(null)} className="inline-flex items-center gap-1 text-sm font-semibold text-white/80 hover:text-white">
          <ArrowLeft className="h-5 w-5" strokeWidth={1.8} /> Menu
        </button>
        <div className="flex items-center gap-2 rounded-full border border-gray-700 bg-gray-800/50 px-3 py-1">
          <span className={`h-3 w-3 rounded-full bg-red-500 ${currentPlayer === "red" && !winner ? "animate-pulse" : ""}`} />
          <span className={`h-3 w-3 rounded-full bg-yellow-400 ${currentPlayer === "yellow" && !winner ? "animate-pulse" : ""}`} />
          <span className="text-xs font-bold uppercase text-gray-300">{winner ? "Finished" : turnLabel}</span>
        </div>
        <button onClick={() => reset(mode)} className="rounded-full p-2 text-white/70 hover:bg-white/10 hover:text-white">
          <RotateCcw className="h-5 w-5" strokeWidth={1.8} />
        </button>
      </div>

      <div className="grid aspect-[7/6] w-full max-w-[350px] grid-cols-7 gap-2 rounded-2xl border-4 border-blue-700 bg-blue-600 p-3 shadow-xl">
        {Array.from({ length: COLS }).map((_, col) => (
          <button key={`col-${col}`} onClick={() => dropPiece(col)} disabled={Boolean(winner) || (mode === "1p" && currentPlayer === "yellow")} className="group grid cursor-pointer grid-rows-6 gap-2 disabled:cursor-default">
            {board.map((row, rowIndex) => {
              const cell = row[col];
              const isWinning = winningCells.some((win) => win.x === rowIndex && win.y === col);
              return (
                <div key={`${rowIndex}-${col}`} className={`relative w-full flex-1 overflow-hidden rounded-full bg-blue-800/50 shadow-inner ${isWinning ? "animate-pulse ring-4 ring-white" : ""}`}>
                  {!cell && <div className="absolute inset-1 rounded-full bg-blue-900/20 transition-colors group-hover:bg-white/10" />}
                  {cell && (
                    <motion.div
                      initial={{ y: -200 }}
                      animate={{ y: 0 }}
                      transition={{ type: "spring", bounce: 0.4, duration: 0.45 }}
                      className={`absolute inset-0 m-0.5 rounded-full shadow-[inset_0_2px_4px_rgba(0,0,0,0.2)] ${cell === "red" ? "bg-red-500" : "bg-yellow-400"}`}
                    />
                  )}
                </div>
              );
            })}
          </button>
        ))}
      </div>

      {winner && (
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="mt-8 w-[90%] max-w-sm rounded-3xl border border-gray-100 bg-white p-6 text-center shadow-xl">
          <h3 className="mb-4 text-2xl font-bold text-gray-900">{winner === "draw" ? "It's a Draw!" : `${winner === "red" ? "Red" : "Yellow"} Wins! 🎉`}</h3>
          <button onClick={() => reset(mode)} className="h-12 w-full rounded-xl bg-primary font-bold text-white">Play Again</button>
        </motion.div>
      )}
    </div>
  );
}

type FingerPoint = { id: number; x: number; y: number; color: string };
type SwajiePhase = "waiting" | "countdown" | "reveal" | "result";
const FINGER_COLORS = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#FED766", "#FF8C42", "#A78BFA", "#34D399", "#F472B6", "#60A5FA", "#FBBF24"];

export function SwajieGame({ onBack, onChosen }: { onBack: () => void; onChosen?: (name: string) => void }) {
  const areaRef = useRef<HTMLDivElement | null>(null);
  const fingersRef = useRef<FingerPoint[]>([]);
  const delayTimerRef = useRef<number | null>(null);
  const countdownTimerRef = useRef<number | null>(null);
  const resultTimerRef = useRef<number | null>(null);
  const [fingers, setFingers] = useState<FingerPoint[]>([]);
  const [phase, setPhase] = useState<SwajiePhase>("waiting");
  const [countdown, setCountdown] = useState(3);
  const [winnerId, setWinnerId] = useState<number | null>(null);

  const winner = fingers.find((finger) => finger.id === winnerId) || null;

  const clearTimers = () => {
    if (delayTimerRef.current) {
      window.clearTimeout(delayTimerRef.current);
      delayTimerRef.current = null;
    }
    if (countdownTimerRef.current) {
      window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    if (resultTimerRef.current) {
      window.clearTimeout(resultTimerRef.current);
      resultTimerRef.current = null;
    }
  };

  const syncFingers = (next: FingerPoint[]) => {
    fingersRef.current = next;
    setFingers(next);
  };

  const reset = useCallback(() => {
    clearTimers();
    syncFingers([]);
    setPhase("waiting");
    setCountdown(3);
    setWinnerId(null);
  }, []);

  const getRelativeTouch = (touch: { clientX: number; clientY: number }) => {
    const rect = areaRef.current?.getBoundingClientRect();
    if (!rect) return { x: touch.clientX, y: touch.clientY };
    return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
  };

  const startCountdown = useCallback(() => {
    if (fingersRef.current.length < 2 || phase !== "waiting" || countdownTimerRef.current) return;
    setPhase("countdown");
    setCountdown(3);
    countdownTimerRef.current = window.setInterval(() => {
      setCountdown((current) => {
        if (current <= 1) {
          if (countdownTimerRef.current) {
            window.clearInterval(countdownTimerRef.current);
            countdownTimerRef.current = null;
          }
          const currentFingers = fingersRef.current;
          if (currentFingers.length < 2) {
            setPhase("waiting");
            return 3;
          }
          const selected = currentFingers[Math.floor(Math.random() * currentFingers.length)];
          setWinnerId(selected.id);
          setPhase("reveal");
          resultTimerRef.current = window.setTimeout(() => {
            setPhase("result");
            onChosen?.("This person");
          }, 1200);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
  }, [onChosen, phase]);

  useEffect(() => {
    if (fingers.length >= 2 && phase === "waiting" && !delayTimerRef.current) {
      delayTimerRef.current = window.setTimeout(() => {
        delayTimerRef.current = null;
        startCountdown();
      }, 600);
    }
    if (fingers.length < 2 && (phase === "waiting" || phase === "countdown")) {
      clearTimers();
      setPhase("waiting");
      setCountdown(3);
    }
    return undefined;
  }, [fingers.length, phase, startCountdown]);

  useEffect(() => () => clearTimers(), []);

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (phase === "reveal" || phase === "result") return;
    const existing = new Map(fingersRef.current.map((finger) => [finger.id, finger]));
    Array.from(event.changedTouches).forEach((touch) => {
      const position = getRelativeTouch(touch);
      existing.set(touch.identifier, {
        id: touch.identifier,
        ...position,
        color: FINGER_COLORS[existing.size % FINGER_COLORS.length],
      });
    });
    syncFingers(Array.from(existing.values()));
  };

  const handleTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (phase === "reveal" || phase === "result") return;
    const existing = new Map(fingersRef.current.map((finger) => [finger.id, finger]));
    Array.from(event.changedTouches).forEach((touch) => {
      const current = existing.get(touch.identifier);
      if (current) existing.set(touch.identifier, { ...current, ...getRelativeTouch(touch) });
    });
    syncFingers(Array.from(existing.values()));
  };

  const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (phase === "reveal" || phase === "result") return;
    const lifted = new Set(Array.from(event.changedTouches).map((touch) => touch.identifier));
    syncFingers(fingersRef.current.filter((finger) => !lifted.has(finger.id)));
  };

  return (
    <div
      ref={areaRef}
      className="relative flex h-full select-none flex-col items-center justify-center overflow-hidden bg-slate-900 text-white"
      style={{ touchAction: "none", userSelect: "none" }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      <button onClick={onBack} className="absolute left-5 top-5 z-30 rounded-full bg-white/10 px-4 py-2 text-sm font-bold text-white/80 hover:text-white">
        Back
      </button>
      <button onClick={reset} className="absolute right-5 top-5 z-30 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white/80 hover:text-white">
        <X className="h-5 w-5" strokeWidth={1.8} />
      </button>

      {fingers.map((finger) => {
        const isWinner = finger.id === winnerId;
        return (
          <motion.div
            key={finger.id}
            initial={{ scale: 0, opacity: 0 }}
            animate={phase === "reveal" || phase === "result" ? { scale: isWinner ? [1, 1.5, 1.3] : 0.5, opacity: isWinner ? 1 : 0.2 } : { scale: 1, opacity: 0.9 }}
            transition={{ type: "spring", stiffness: 300, damping: 12 }}
            className="pointer-events-none absolute h-24 w-24 rounded-full"
            style={{ left: finger.x - 48, top: finger.y - 48, backgroundColor: finger.color, boxShadow: `0 0 30px ${finger.color}88`, zIndex: isWinner ? 20 : 10 }}
          />
        );
      })}

      {phase === "waiting" && fingers.length === 0 && (
        <div className="pointer-events-none px-8 text-center">
          <div className="mb-3 text-7xl">✋</div>
          <h2 className="text-5xl font-black tracking-tight text-white">Swajie</h2>
          <p className="mt-3 text-base text-slate-400">Place two or more fingers to decide who pays.</p>
        </div>
      )}

      {phase === "waiting" && fingers.length > 0 && (
        <div className="pointer-events-none absolute inset-x-0 top-20 px-8 text-center">
          <div className="mb-3 text-6xl">☝️</div>
          <h3 className="text-3xl font-black text-white">Who Pays?</h3>
          <p className="mt-2 text-base text-slate-400">Need at least 2 fingers</p>
        </div>
      )}

      {phase === "countdown" && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <p className="text-sm font-bold uppercase tracking-widest text-slate-400">Keep your fingers on screen</p>
          <motion.div key={countdown} initial={{ scale: 1.6, opacity: 0.4 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.4 }} className="text-[120px] font-black leading-none text-white">
            {countdown}
          </motion.div>
          <p className="text-xs text-slate-500">{fingers.length} fingers detected</p>
        </div>
      )}

      {phase === "result" && winner && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center text-center" style={{ backgroundColor: winner.color }}>
          <motion.div initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 300, damping: 12 }}>
            <div className="mb-5 text-8xl">🎉</div>
            <h3 className="text-5xl font-black text-white drop-shadow-lg">This person</h3>
            <p className="mt-2 text-xl font-semibold text-white/80">Pays for everyone!</p>
            <button onClick={reset} className="mt-8 rounded-full bg-white px-8 py-3 text-sm font-black text-slate-900 shadow-xl">Play Again</button>
          </motion.div>
        </div>
      )}
    </div>
  );
}

export default GameHub;
