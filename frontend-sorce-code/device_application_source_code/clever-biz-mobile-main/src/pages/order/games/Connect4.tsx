import { useState } from "react";
import { motion } from "motion/react";
import { RefreshCw, Trophy } from "lucide-react";

const ROWS = 6;
const COLS = 7;

export const Connect4 = ({ onBack }: { onBack: () => void }) => {
    const [board, setBoard] = useState(Array(ROWS).fill(null).map(() => Array(COLS).fill(null)));
    const [isRedNext, setIsRedNext] = useState(true);
    const [winner, setWinner] = useState<string | null>(null);

    const checkWinner = (b: any[][]) => {
        // Check horizontal
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS - 3; c++) {
                if (b[r][c] && b[r][c] === b[r][c + 1] && b[r][c] === b[r][c + 2] && b[r][c] === b[r][c + 3]) {
                    return b[r][c];
                }
            }
        }
        // Check vertical
        for (let r = 0; r < ROWS - 3; r++) {
            for (let c = 0; c < COLS; c++) {
                if (b[r][c] && b[r][c] === b[r + 1][c] && b[r][c] === b[r + 2][c] && b[r][c] === b[r + 3][c]) {
                    return b[r][c];
                }
            }
        }
        // Check diagonal /
        for (let r = 3; r < ROWS; r++) {
            for (let c = 0; c < COLS - 3; c++) {
                if (b[r][c] && b[r][c] === b[r - 1][c + 1] && b[r][c] === b[r - 2][c + 2] && b[r][c] === b[r - 3][c + 3]) {
                    return b[r][c];
                }
            }
        }
        // Check diagonal \
        for (let r = 3; r < ROWS; r++) {
            for (let c = 3; c < COLS; c++) {
                if (b[r][c] && b[r][c] === b[r - 1][c - 1] && b[r][c] === b[r - 2][c - 2] && b[r][c] === b[r - 3][c - 3]) {
                    return b[r][c];
                }
            }
        }
        return null;
    };

    const dropPiece = (colIndex: number) => {
        if (winner) return;

        const newBoard = board.map((row) => [...row]);
        let placed = false;

        for (let r = ROWS - 1; r >= 0; r--) {
            if (!newBoard[r][colIndex]) {
                newBoard[r][colIndex] = isRedNext ? "Red" : "Yellow";
                placed = true;
                break;
            }
        }

        if (!placed) return;

        setBoard(newBoard);
        setIsRedNext(!isRedNext);

        const w = checkWinner(newBoard);
        if (w) setWinner(w);
        else if (newBoard.every((row) => row.every((cell) => cell))) setWinner("Draw");
    };

    const resetGame = () => {
        setBoard(Array(ROWS).fill(null).map(() => Array(COLS).fill(null)));
        setIsRedNext(true);
        setWinner(null);
    };

    return (
        <div className="flex flex-col items-center h-full max-w-md mx-auto">
            <div className="flex justify-between items-center w-full mb-6">
                <button onClick={onBack} className="text-gray-400 hover:text-white">
                    ← Back
                </button>
                <h2 className="text-2xl font-bold text-blue-400">Connect 4</h2>
                <div className="w-12" />
            </div>

            <div className="bg-blue-700 p-4 rounded-2xl shadow-xl mb-8">
                <div className="grid grid-cols-7 gap-2">
                    {board.map((row, rIndex) =>
                        row.map((cell, cIndex) => (
                            <div
                                key={`${rIndex}-${cIndex}`}
                                onClick={() => dropPiece(cIndex)}
                                className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-900 rounded-full flex items-center justify-center cursor-pointer"
                            >
                                {cell && (
                                    <motion.div
                                        initial={{ y: -200, opacity: 0 }}
                                        animate={{ y: 0, opacity: 1 }}
                                        className={`w-full h-full rounded-full ${cell === "Red" ? "bg-red-500" : "bg-yellow-400"
                                            }`}
                                    />
                                )}
                            </div>
                        ))
                    )}
                </div>
            </div>

            {winner && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center"
                >
                    <div className="flex items-center gap-2 justify-center mb-4">
                        {winner === "Draw" ? (
                            <span className="text-2xl font-bold text-gray-300">It's a Draw!</span>
                        ) : (
                            <>
                                <Trophy className="text-yellow-400" />
                                <span className="text-2xl font-bold text-white">
                                    {winner} Wins!
                                </span>
                            </>
                        )}
                    </div>
                    <button
                        onClick={resetGame}
                        className="px-6 py-3 bg-white text-gray-900 rounded-xl font-bold flex items-center gap-2 mx-auto hover:bg-gray-100"
                    >
                        <RefreshCw size={18} />
                        Play Again
                    </button>
                </motion.div>
            )}

            {!winner && (
                <p className="text-gray-400">
                    Current Turn:{" "}
                    <span className={`font-bold ${isRedNext ? "text-red-500" : "text-yellow-400"}`}>
                        {isRedNext ? "Red" : "Yellow"}
                    </span>
                </p>
            )}
        </div>
    );
};
