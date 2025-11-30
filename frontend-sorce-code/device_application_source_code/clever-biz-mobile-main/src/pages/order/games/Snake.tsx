import { useState, useEffect, useRef } from "react";
import { motion } from "motion/react";
import { RefreshCw, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

const GRID_SIZE = 20;
const CELL_SIZE = 15;
const INITIAL_SNAKE = [[10, 10]];
const INITIAL_DIRECTION = [0, -1];

export const Snake = ({ onBack }: { onBack: () => void }) => {
    const [snake, setSnake] = useState(INITIAL_SNAKE);
    const [food, setFood] = useState([15, 15]);
    const [direction, setDirection] = useState(INITIAL_DIRECTION);
    const [gameOver, setGameOver] = useState(false);
    const [score, setScore] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const gameLoopRef = useRef<NodeJS.Timeout | null>(null);

    const generateFood = () => {
        const x = Math.floor(Math.random() * GRID_SIZE);
        const y = Math.floor(Math.random() * GRID_SIZE);
        return [x, y];
    };

    const resetGame = () => {
        setSnake(INITIAL_SNAKE);
        setFood(generateFood());
        setDirection(INITIAL_DIRECTION);
        setGameOver(false);
        setScore(0);
        setIsPlaying(true);
    };

    useEffect(() => {
        if (isPlaying && !gameOver) {
            gameLoopRef.current = setInterval(moveSnake, 150);
        } else {
            if (gameLoopRef.current) clearInterval(gameLoopRef.current);
        }
        return () => {
            if (gameLoopRef.current) clearInterval(gameLoopRef.current);
        };
    }, [isPlaying, gameOver, snake, direction]);

    const moveSnake = () => {
        const newHead = [
            snake[0][0] + direction[0],
            snake[0][1] + direction[1],
        ];

        // Check collisions
        if (
            newHead[0] < 0 ||
            newHead[0] >= GRID_SIZE ||
            newHead[1] < 0 ||
            newHead[1] >= GRID_SIZE ||
            snake.some((segment) => segment[0] === newHead[0] && segment[1] === newHead[1])
        ) {
            setGameOver(true);
            setIsPlaying(false);
            return;
        }

        const newSnake = [newHead, ...snake];
        if (newHead[0] === food[0] && newHead[1] === food[1]) {
            setScore(score + 1);
            setFood(generateFood());
        } else {
            newSnake.pop();
        }
        setSnake(newSnake);
    };

    const handleDirection = (newDir: number[]) => {
        // Prevent 180 degree turns
        if (newDir[0] === -direction[0] && newDir[1] === -direction[1]) return;
        setDirection(newDir);
    };

    return (
        <div className="flex flex-col items-center h-full max-w-md mx-auto">
            <div className="flex justify-between items-center w-full mb-4">
                <button onClick={onBack} className="text-gray-400 hover:text-white">
                    ← Back
                </button>
                <h2 className="text-2xl font-bold text-green-400">Snake</h2>
                <div className="text-xl font-bold text-white">Score: {score}</div>
            </div>

            <div
                className="relative bg-gray-800 border-2 border-gray-700 rounded-lg overflow-hidden mb-6"
                style={{
                    width: GRID_SIZE * CELL_SIZE,
                    height: GRID_SIZE * CELL_SIZE,
                }}
            >
                {snake.map((segment, i) => (
                    <div
                        key={i}
                        className="absolute bg-green-500 rounded-sm"
                        style={{
                            left: segment[0] * CELL_SIZE,
                            top: segment[1] * CELL_SIZE,
                            width: CELL_SIZE,
                            height: CELL_SIZE,
                            zIndex: 2,
                        }}
                    />
                ))}
                <div
                    className="absolute bg-red-500 rounded-full"
                    style={{
                        left: food[0] * CELL_SIZE,
                        top: food[1] * CELL_SIZE,
                        width: CELL_SIZE,
                        height: CELL_SIZE,
                        zIndex: 1,
                    }}
                />

                {gameOver && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-10">
                        <div className="text-center">
                            <h3 className="text-2xl font-bold text-white mb-2">Game Over!</h3>
                            <button
                                onClick={resetGame}
                                className="px-4 py-2 bg-green-500 text-white rounded-lg font-bold flex items-center gap-2 mx-auto"
                            >
                                <RefreshCw size={16} />
                                Try Again
                            </button>
                        </div>
                    </div>
                )}

                {!isPlaying && !gameOver && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-10">
                        <button
                            onClick={resetGame}
                            className="px-6 py-3 bg-green-500 text-white rounded-xl font-bold shadow-lg"
                        >
                            Start Game
                        </button>
                    </div>
                )}
            </div>

            {/* Controls */}
            <div className="grid grid-cols-3 gap-2">
                <div />
                <button
                    className="p-4 bg-gray-700 rounded-xl active:bg-gray-600"
                    onClick={() => handleDirection([0, -1])}
                >
                    <ChevronUp className="text-white" />
                </button>
                <div />
                <button
                    className="p-4 bg-gray-700 rounded-xl active:bg-gray-600"
                    onClick={() => handleDirection([-1, 0])}
                >
                    <ChevronLeft className="text-white" />
                </button>
                <button
                    className="p-4 bg-gray-700 rounded-xl active:bg-gray-600"
                    onClick={() => handleDirection([0, 1])}
                >
                    <ChevronDown className="text-white" />
                </button>
                <button
                    className="p-4 bg-gray-700 rounded-xl active:bg-gray-600"
                    onClick={() => handleDirection([1, 0])}
                >
                    <ChevronRight className="text-white" />
                </button>
            </div>
        </div>
    );
};
