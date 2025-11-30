import { useState } from "react";
import { motion } from "motion/react";
import { RefreshCw, Trophy } from "lucide-react";

export const TicTacToe = ({ onBack }: { onBack: () => void }) => {
    const [board, setBoard] = useState(Array(9).fill(null));
    const [isXNext, setIsXNext] = useState(true);
    const [winner, setWinner] = useState<string | null>(null);

    const checkWinner = (squares: any[]) => {
        const lines = [
            [0, 1, 2],
            [3, 4, 5],
            [6, 7, 8],
            [0, 3, 6],
            [1, 4, 7],
            [2, 5, 8],
            [0, 4, 8],
            [2, 4, 6],
        ];
        for (let i = 0; i < lines.length; i++) {
            const [a, b, c] = lines[i];
            if (squares[a] && squares[a] === squares[b] && squares[a] === squares[c]) {
                return squares[a];
            }
        }
        return null;
    };

    const handleClick = (index: number) => {
        if (board[index] || winner) return;

        const newBoard = [...board];
        newBoard[index] = isXNext ? "X" : "O";
        setBoard(newBoard);
        setIsXNext(!isXNext);

        const w = checkWinner(newBoard);
        if (w) setWinner(w);
        else if (!newBoard.includes(null)) setWinner("Draw");
    };

    const resetGame = () => {
        setBoard(Array(9).fill(null));
        setIsXNext(true);
        setWinner(null);
    };

    return (
        <div className="flex flex-col items-center h-full">
            <div className="flex justify-between items-center w-full mb-8">
                <button onClick={onBack} className="text-gray-400 hover:text-white">
                    ← Back
                </button>
                <h2 className="text-2xl font-bold text-purple-400">Tic Tac Toe</h2>
                <div className="w-12" /> {/* Spacer */}
            </div>

            <div className="bg-gray-800 p-6 rounded-2xl shadow-xl mb-8">
                <div className="grid grid-cols-3 gap-3">
                    {board.map((cell, index) => (
                        <motion.button
                            key={index}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => handleClick(index)}
                            className={`w-20 h-20 rounded-xl text-4xl font-bold flex items-center justify-center transition-colors ${cell === "X"
                                    ? "bg-blue-500/20 text-blue-400 border-2 border-blue-500/50"
                                    : cell === "O"
                                        ? "bg-pink-500/20 text-pink-400 border-2 border-pink-500/50"
                                        : "bg-gray-700 hover:bg-gray-600"
                                }`}
                        >
                            {cell}
                        </motion.button>
                    ))}
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
                    Current Turn: <span className="font-bold text-white">{isXNext ? "X" : "O"}</span>
                </p>
            )}
        </div>
    );
};
