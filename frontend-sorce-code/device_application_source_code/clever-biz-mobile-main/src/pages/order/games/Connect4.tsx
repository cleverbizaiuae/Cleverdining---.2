import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { ArrowLeft, RotateCcw, User, Users } from "lucide-react";
import axiosInstance from "../../../lib/axios";
import { getPlayerSession } from "../../../lib/playerSession";
import { getTableIdentity } from "../../../lib/tableIdentity";

const ROWS = 6;
const COLS = 7;
type Piece = "red" | "yellow" | null;
type Mode = "single" | "two" | null;
type Winner = "red" | "yellow" | "draw" | null;

type WinResult = {
  winner: Winner;
  cells: string[];
};

const createBoard = (): Piece[][] => Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => null));

const checkWinner = (board: Piece[][]): WinResult => {
  const directions = [
    { r: 0, c: 1 },
    { r: 1, c: 0 },
    { r: 1, c: 1 },
    { r: 1, c: -1 },
  ];

  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      const piece = board[r][c];
      if (!piece) continue;
      for (const direction of directions) {
        const cells = [`${r}-${c}`];
        for (let step = 1; step < 4; step += 1) {
          const nr = r + direction.r * step;
          const nc = c + direction.c * step;
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || board[nr][nc] !== piece) break;
          cells.push(`${nr}-${nc}`);
        }
        if (cells.length === 4) return { winner: piece, cells };
      }
    }
  }

  if (board.every((row) => row.every(Boolean))) return { winner: "draw", cells: [] };
  return { winner: null, cells: [] };
};

export const Connect4 = ({ onBack }: { onBack: () => void }) => {
  const [mode, setMode] = useState<Mode>(null);
  const [board, setBoard] = useState<Piece[][]>(() => createBoard());
  const [currentPiece, setCurrentPiece] = useState<Exclude<Piece, null>>("red");
  const [winner, setWinner] = useState<Winner>(null);
  const [winningCells, setWinningCells] = useState<string[]>([]);
  const [moveCount, setMoveCount] = useState(0);
  const submittedScoreRef = useRef(false);

  const validColumns = useMemo(() => board[0].map((cell, index) => (cell ? null : index)).filter((value): value is number => value !== null), [board]);

  const resetGame = useCallback((nextMode: Mode = mode) => {
    setMode(nextMode);
    setBoard(createBoard());
    setCurrentPiece("red");
    setWinner(null);
    setWinningCells([]);
    setMoveCount(0);
    submittedScoreRef.current = false;
  }, [mode]);

  const dropPiece = useCallback((colIndex: number, forcedPiece?: Exclude<Piece, null>) => {
    if (winner) return false;
    const pieceToDrop = forcedPiece || currentPiece;
    let placed = false;
    let nextBoard: Piece[][] = [];

    setBoard((previous) => {
      const copy = previous.map((row) => [...row]);
      for (let r = ROWS - 1; r >= 0; r -= 1) {
        if (!copy[r][colIndex]) {
          copy[r][colIndex] = pieceToDrop;
          placed = true;
          break;
        }
      }
      if (!placed) return previous;
      nextBoard = copy;
      return copy;
    });

    if (!placed) return false;

    setMoveCount((count) => count + 1);
    const result = checkWinner(nextBoard);
    if (result.winner) {
      setWinner(result.winner);
      setWinningCells(result.cells);
    } else {
      setCurrentPiece(pieceToDrop === "red" ? "yellow" : "red");
    }
    return true;
  }, [currentPiece, winner]);

  useEffect(() => {
    if (mode !== "single" || currentPiece !== "yellow" || winner || validColumns.length === 0) return undefined;
    const timer = window.setTimeout(() => {
      const randomColumn = validColumns[Math.floor(Math.random() * validColumns.length)];
      dropPiece(randomColumn, "yellow");
    }, 500);
    return () => window.clearTimeout(timer);
  }, [currentPiece, dropPiece, mode, validColumns, winner]);

  useEffect(() => {
    if (winner !== "red" || submittedScoreRef.current) return;
    submittedScoreRef.current = true;
    const player = getPlayerSession();
    if (!player?.name || player.name === "Guest") return;
    const table = getTableIdentity();
    void axiosInstance.post("/api/game/score", {
      playerName: player.name,
      ...(player.phone ? { phone: player.phone } : {}),
      score: moveCount,
      gameType: "connect4",
      ...(table.restaurantId ? { restaurantId: table.restaurantId } : {}),
    }).catch(() => {});
  }, [moveCount, winner]);

  if (!mode) {
    return (
      <div className="relative h-full bg-gray-950 flex flex-col items-center justify-center px-5 text-white">
        <button onClick={onBack} className="absolute top-8 left-4 inline-flex items-center gap-2 text-white/80 hover:text-white text-sm font-semibold">
          <ArrowLeft className="w-5 h-5" strokeWidth={1.8} /> Back
        </button>
        <h2 className="text-3xl font-bold text-white">Connect 4</h2>
        <p className="text-gray-400 mt-1 mb-8">Classic strategy game</p>
        <div className="w-full max-w-sm space-y-3">
          <button onClick={() => resetGame("single")} className="w-full h-16 text-lg rounded-2xl gap-3 bg-blue-600 hover:bg-blue-700 border border-blue-500/50 shadow-lg shadow-blue-900/50 text-white font-bold flex items-center justify-center">
            <User className="w-6 h-6" strokeWidth={1.8} /> Single Player
          </button>
          <button onClick={() => resetGame("two")} className="w-full h-16 text-lg rounded-2xl gap-3 bg-orange-600 hover:bg-orange-700 border border-orange-500/50 shadow-lg shadow-orange-900/50 text-white font-bold flex items-center justify-center">
            <Users className="w-6 h-6" strokeWidth={1.8} /> Two Players
          </button>
        </div>
      </div>
    );
  }

  const turnLabel = mode === "single" && currentPiece === "yellow" ? "CPU" : currentPiece === "red" ? "Player 1" : "Player 2";

  return (
    <div className="h-full overflow-y-auto bg-gray-950 text-white flex flex-col items-center py-5 px-4">
      <div className="flex justify-between items-center w-full mb-4 px-2">
        <button onClick={() => setMode(null)} className="inline-flex items-center gap-1 text-white/80 hover:text-white text-sm font-semibold">
          <ArrowLeft className="w-5 h-5" strokeWidth={1.8} /> Menu
        </button>
        <div className="bg-gray-800/50 border border-gray-700 px-3 py-1 rounded-full flex items-center gap-2">
          <span className={`w-3 h-3 rounded-full bg-red-500 ${currentPiece === "red" && !winner ? "animate-pulse" : ""}`} />
          <span className={`w-3 h-3 rounded-full bg-yellow-400 ${currentPiece === "yellow" && !winner ? "animate-pulse" : ""}`} />
          <span className="text-xs font-bold uppercase text-gray-300">{winner ? "Finished" : turnLabel}</span>
        </div>
        <button onClick={() => resetGame(mode)} className="text-white/70 hover:text-white p-2 rounded-full hover:bg-white/10">
          <RotateCcw className="w-5 h-5" strokeWidth={1.8} />
        </button>
      </div>

      <div className="bg-blue-600 p-3 rounded-2xl shadow-xl w-full max-w-[350px] aspect-[7/6] border-4 border-blue-700 grid grid-cols-7 gap-2">
        {Array.from({ length: COLS }).map((_, colIndex) => (
          <button
            key={`col-${colIndex}`}
            onClick={() => dropPiece(colIndex)}
            disabled={Boolean(winner) || (mode === "single" && currentPiece === "yellow")}
            className="group grid grid-rows-6 gap-2 cursor-pointer disabled:cursor-default"
          >
            {board.map((row, rowIndex) => {
              const cell = row[colIndex];
              const key = `${rowIndex}-${colIndex}`;
              return (
                <div key={key} className={`flex-1 w-full bg-blue-800/50 rounded-full shadow-inner relative overflow-hidden ${winningCells.includes(key) ? "ring-4 ring-white animate-pulse" : ""}`}>
                  {!cell && <div className="absolute inset-0 bg-blue-900/20 rounded-full m-1" />}
                  {cell && (
                    <motion.div
                      initial={{ y: -200 }}
                      animate={{ y: 0 }}
                      transition={{ type: "spring", bounce: 0.4, duration: 0.45 }}
                      className={`absolute inset-0 rounded-full m-0.5 shadow-[inset_0_2px_4px_rgba(0,0,0,0.2)] ${cell === "red" ? "bg-red-500" : "bg-yellow-400"}`}
                    />
                  )}
                </div>
              );
            })}
          </button>
        ))}
      </div>

      {winner && (
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="mt-8 text-center p-6 bg-white rounded-3xl shadow-xl border border-gray-100 w-[90%] max-w-sm">
          <h3 className="text-2xl font-bold text-gray-900 mb-4">
            {winner === "draw" ? "It's a Draw!" : `${winner === "red" ? "Red" : "Yellow"} Wins! 🎉`}
          </h3>
          <button onClick={() => resetGame(mode)} className="w-full rounded-xl h-12 font-bold bg-primary text-primary-text">
            Play Again
          </button>
        </motion.div>
      )}
    </div>
  );
};
