import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Pause, Play, Trophy } from "lucide-react";
import axiosInstance from "../../../lib/axios";
import { getPlayerSession } from "../../../lib/playerSession";
import { getTableIdentity } from "../../../lib/tableIdentity";

const GRID_SIZE = 20;
const INITIAL_SNAKE: Point[] = [{ x: 10, y: 10 }];
const INITIAL_FOOD: Point = { x: 15, y: 15 };
const INITIAL_DIRECTION: Point = { x: 0, y: -1 };
const BEST_KEY = "cb_snake_best_score";

type Point = { x: number; y: number };

const samePoint = (a: Point, b: Point) => a.x === b.x && a.y === b.y;

const generateFood = (snake: Point[]) => {
  let candidate = INITIAL_FOOD;
  do {
    candidate = {
      x: Math.floor(Math.random() * GRID_SIZE),
      y: Math.floor(Math.random() * GRID_SIZE),
    };
  } while (snake.some((segment) => samePoint(segment, candidate)));
  return candidate;
};

export const Snake = ({ onBack }: { onBack: () => void }) => {
  const [snake, setSnake] = useState<Point[]>(INITIAL_SNAKE);
  const [food, setFood] = useState<Point>(INITIAL_FOOD);
  const directionRef = useRef<Point>(INITIAL_DIRECTION);
  const [gameOver, setGameOver] = useState(false);
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(() => Number(localStorage.getItem(BEST_KEY) || 0));
  const [isPlaying, setIsPlaying] = useState(true);
  const submittedScoreRef = useRef(false);

  const resetGame = useCallback(() => {
    directionRef.current = INITIAL_DIRECTION;
    setSnake(INITIAL_SNAKE);
    setFood(INITIAL_FOOD);
    setGameOver(false);
    setScore(0);
    setIsPlaying(true);
    submittedScoreRef.current = false;
  }, []);

  const handleDirection = useCallback((next: Point) => {
    const current = directionRef.current;
    if (next.x === -current.x && next.y === -current.y) return;
    directionRef.current = next;
    setIsPlaying(true);
  }, []);

  const moveSnake = useCallback(() => {
    setSnake((currentSnake) => {
      const currentDirection = directionRef.current;
      const head = currentSnake[0];
      const newHead = { x: head.x + currentDirection.x, y: head.y + currentDirection.y };
      const hitWall = newHead.x < 0 || newHead.x >= GRID_SIZE || newHead.y < 0 || newHead.y >= GRID_SIZE;
      const hitSelf = currentSnake.some((segment) => samePoint(segment, newHead));

      if (hitWall || hitSelf) {
        setGameOver(true);
        setIsPlaying(false);
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
  }, [food]);

  useEffect(() => {
    if (!isPlaying || gameOver) return undefined;
    const interval = window.setInterval(moveSnake, 150);
    return () => window.clearInterval(interval);
  }, [gameOver, isPlaying, moveSnake]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowUp") handleDirection({ x: 0, y: -1 });
      if (event.key === "ArrowDown") handleDirection({ x: 0, y: 1 });
      if (event.key === "ArrowLeft") handleDirection({ x: -1, y: 0 });
      if (event.key === "ArrowRight") handleDirection({ x: 1, y: 0 });
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleDirection]);

  useEffect(() => {
    if (!gameOver || submittedScoreRef.current) return;
    submittedScoreRef.current = true;
    const nextBest = Math.max(bestScore, score);
    setBestScore(nextBest);
    localStorage.setItem(BEST_KEY, String(nextBest));

    const player = getPlayerSession();
    if (!player?.name || player.name === "Guest") return;
    const table = getTableIdentity();
    void axiosInstance.post("/api/game/score", {
      playerName: player.name,
      ...(player.phone ? { phone: player.phone } : {}),
      score,
      gameType: "snake",
      ...(table.restaurantId ? { restaurantId: table.restaurantId } : {}),
    }).catch(() => {});
  }, [bestScore, gameOver, score]);

  const snakeCells = useMemo(() => new Map(snake.map((segment, index) => [`${segment.x}-${segment.y}`, index])), [snake]);

  return (
    <div className="h-full overflow-y-auto bg-gray-950 text-white flex flex-col items-center py-5">
      <div className="flex justify-between items-center w-full mb-4 px-4">
        <button onClick={onBack} className="inline-flex items-center gap-2 text-white/80 hover:text-white text-sm font-semibold">
          <ArrowLeft className="w-5 h-5" strokeWidth={1.8} /> Back
        </button>
        <div className="flex items-center gap-5 text-right">
          <div>
            <p className="text-[10px] uppercase text-muted-foreground font-bold">Score</p>
            <p className="text-xl font-bold text-white leading-none">{score}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold text-yellow-500">Best</p>
            <p className="text-xl font-bold text-yellow-500 leading-none">{bestScore}</p>
          </div>
        </div>
      </div>

      <div className="relative bg-gray-900 rounded-xl p-2 shadow-xl border-2 border-gray-800 aspect-square w-full max-w-[350px]">
        <div className="grid grid-cols-[repeat(20,1fr)] grid-rows-[repeat(20,1fr)] w-full h-full bg-gray-800/50 rounded-lg overflow-hidden">
          {Array.from({ length: GRID_SIZE * GRID_SIZE }).map((_, index) => {
            const x = index % GRID_SIZE;
            const y = Math.floor(index / GRID_SIZE);
            const key = `${x}-${y}`;
            const snakeIndex = snakeCells.get(key);
            const isFood = food.x === x && food.y === y;
            return (
              <div key={key} className="relative border-[0.5px] border-white/5">
                {snakeIndex !== undefined && (
                  <div className={`absolute inset-[1px] rounded-sm ${snakeIndex === 0 ? "bg-green-400 scale-110 z-10" : "bg-green-600"}`} />
                )}
                {isFood && <div className="absolute inset-[18%] bg-red-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.6)]" />}
              </div>
            );
          })}
        </div>

        {gameOver && (
          <div className="absolute inset-0 z-10 bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center rounded-lg">
            <Trophy className="w-12 h-12 text-yellow-400 mb-2" strokeWidth={1.8} />
            <h3 className="text-2xl font-bold text-white mb-1">Game Over!</h3>
            <p className="text-gray-300 mb-6">Score: {score}</p>
            <button onClick={resetGame} className="bg-white text-black font-bold rounded-full px-8 py-3">
              Play Again
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 w-48 mt-6">
        <div />
        <button onClick={() => handleDirection({ x: 0, y: -1 })} className="h-14 rounded-2xl bg-gray-800 text-white border border-gray-700 hover:bg-gray-700 text-xl">▲</button>
        <div />
        <button onClick={() => handleDirection({ x: -1, y: 0 })} className="h-14 rounded-2xl bg-gray-800 text-white border border-gray-700 hover:bg-gray-700 text-xl">◀</button>
        <button onClick={() => setIsPlaying((current) => !current)} className="h-14 rounded-2xl bg-gray-800 text-white border border-gray-700 hover:bg-gray-700 flex items-center justify-center">
          {isPlaying ? <Pause className="w-5 h-5" strokeWidth={1.8} /> : <Play className="w-5 h-5" strokeWidth={1.8} />}
        </button>
        <button onClick={() => handleDirection({ x: 1, y: 0 })} className="h-14 rounded-2xl bg-gray-800 text-white border border-gray-700 hover:bg-gray-700 text-xl">▶</button>
        <div />
        <button onClick={() => handleDirection({ x: 0, y: 1 })} className="h-14 rounded-2xl bg-gray-800 text-white border border-gray-700 hover:bg-gray-700 text-xl">▼</button>
        <div />
      </div>
    </div>
  );
};
