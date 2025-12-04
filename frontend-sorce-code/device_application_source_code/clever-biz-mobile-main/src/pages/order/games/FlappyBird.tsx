import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, RefreshCw, Trophy } from 'lucide-react';
import { motion } from 'motion/react';

interface FlappyBirdProps {
    onBack: () => void;
}

export const FlappyBird: React.FC<FlappyBirdProps> = ({ onBack }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [gameState, setGameState] = useState<'start' | 'playing' | 'gameover'>('start');
    const [score, setScore] = useState(0);
    const [highScore, setHighScore] = useState(0);

    // Game constants
    const GRAVITY = 0.6;
    const JUMP = -8;
    const PIPE_SPEED = 3;
    const PIPE_SPAWN_RATE = 1500; // ms
    const PIPE_GAP = 150;

    useEffect(() => {
        const storedHighScore = localStorage.getItem('flappy_highscore');
        if (storedHighScore) setHighScore(parseInt(storedHighScore));
    }, []);

    useEffect(() => {
        if (score > highScore) {
            setHighScore(score);
            localStorage.setItem('flappy_highscore', score.toString());
        }
    }, [score]);

    useEffect(() => {
        if (gameState !== 'playing') return;

        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Resize canvas to fit container
        const resizeCanvas = () => {
            canvas.width = canvas.parentElement?.clientWidth || 300;
            canvas.height = canvas.parentElement?.clientHeight || 500;
        };
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        let birdY = canvas.height / 2;
        let birdVelocity = 0;
        let pipes: { x: number; topHeight: number; passed: boolean }[] = [];
        let lastPipeTime = 0;
        let animationFrameId: number;

        const loop = (timestamp: number) => {
            if (gameState !== 'playing') return;

            // Clear canvas
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Update bird
            birdVelocity += GRAVITY;
            birdY += birdVelocity;

            // Draw bird
            ctx.fillStyle = '#FFD700'; // Gold bird
            ctx.beginPath();
            ctx.arc(50, birdY, 15, 0, Math.PI * 2);
            ctx.fill();
            // Eye
            ctx.fillStyle = '#000';
            ctx.beginPath();
            ctx.arc(58, birdY - 5, 4, 0, Math.PI * 2);
            ctx.fill();
            // Beak
            ctx.fillStyle = '#FF4500';
            ctx.beginPath();
            ctx.moveTo(60, birdY);
            ctx.lineTo(70, birdY + 5);
            ctx.lineTo(60, birdY + 10);
            ctx.fill();


            // Spawn pipes
            if (timestamp - lastPipeTime > PIPE_SPAWN_RATE) {
                const minPipeHeight = 50;
                const maxPipeHeight = canvas.height - PIPE_GAP - minPipeHeight;
                const topHeight = Math.random() * (maxPipeHeight - minPipeHeight) + minPipeHeight;

                pipes.push({
                    x: canvas.width,
                    topHeight,
                    passed: false
                });
                lastPipeTime = timestamp;
            }

            // Update and draw pipes
            ctx.fillStyle = '#2ECC71'; // Green pipes
            pipes.forEach((pipe, index) => {
                pipe.x -= PIPE_SPEED;

                // Draw top pipe
                ctx.fillRect(pipe.x, 0, 50, pipe.topHeight);
                // Draw bottom pipe
                ctx.fillRect(pipe.x, pipe.topHeight + PIPE_GAP, 50, canvas.height - (pipe.topHeight + PIPE_GAP));

                // Collision detection
                // Bird bounds
                const birdLeft = 35; // 50 - 15
                const birdRight = 65; // 50 + 15
                const birdTop = birdY - 15;
                const birdBottom = birdY + 15;

                // Pipe bounds
                const pipeLeft = pipe.x;
                const pipeRight = pipe.x + 50;

                // Check collision with pipes
                if (
                    birdRight > pipeLeft &&
                    birdLeft < pipeRight &&
                    (birdTop < pipe.topHeight || birdBottom > pipe.topHeight + PIPE_GAP)
                ) {
                    setGameState('gameover');
                }

                // Check collision with ground/ceiling
                if (birdBottom > canvas.height || birdTop < 0) {
                    setGameState('gameover');
                }

                // Score update
                if (!pipe.passed && birdLeft > pipeRight) {
                    setScore(s => s + 1);
                    pipe.passed = true;
                }
            });

            // Remove off-screen pipes
            pipes = pipes.filter(p => p.x > -50);

            animationFrameId = requestAnimationFrame(loop);
        };

        // Input handling
        const jump = () => {
            birdVelocity = JUMP;
        };

        const handleTouch = (e: TouchEvent) => {
            e.preventDefault(); // Prevent scrolling
            jump();
        };

        const handleClick = () => {
            jump();
        };

        canvas.addEventListener('touchstart', handleTouch, { passive: false });
        canvas.addEventListener('mousedown', handleClick);

        animationFrameId = requestAnimationFrame(loop);

        return () => {
            window.removeEventListener('resize', resizeCanvas);
            canvas.removeEventListener('touchstart', handleTouch);
            canvas.removeEventListener('mousedown', handleClick);
            cancelAnimationFrame(animationFrameId);
        };
    }, [gameState]);

    const startGame = () => {
        setScore(0);
        setGameState('playing');
    };

    return (
        <div className="flex flex-col h-full bg-gray-900 text-white">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-gray-900/95 backdrop-blur-sm z-10">
                <button
                    onClick={onBack}
                    className="p-2 hover:bg-gray-800 rounded-full transition-colors"
                >
                    <ArrowLeft size={24} />
                </button>
                <div className="flex flex-col items-center">
                    <h2 className="font-bold text-lg">Flappy Bird</h2>
                    <div className="text-xs text-gray-400 flex items-center gap-1">
                        <Trophy size={12} className="text-yellow-500" />
                        High Score: {highScore}
                    </div>
                </div>
                <div className="w-10" /> {/* Spacer */}
            </div>

            {/* Game Area */}
            <div className="flex-1 relative overflow-hidden bg-sky-900">
                <canvas
                    ref={canvasRef}
                    className="block w-full h-full touch-none"
                />

                {/* Score Overlay */}
                {gameState === 'playing' && (
                    <div className="absolute top-10 left-1/2 -translate-x-1/2 text-6xl font-bold text-white drop-shadow-lg opacity-50 pointer-events-none">
                        {score}
                    </div>
                )}

                {/* Start Screen */}
                {gameState === 'start' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 backdrop-blur-sm">
                        <motion.div
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="text-center"
                        >
                            <h1 className="text-4xl font-bold mb-4 text-yellow-400">Flappy Bird</h1>
                            <p className="mb-8 text-gray-300">Tap to fly!</p>
                            <button
                                onClick={startGame}
                                className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 rounded-full font-bold text-lg shadow-lg transition-all active:scale-95"
                            >
                                Start Game
                            </button>
                        </motion.div>
                    </div>
                )}

                {/* Game Over Screen */}
                {gameState === 'gameover' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm">
                        <motion.div
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="bg-gray-800 p-8 rounded-2xl border border-gray-700 text-center max-w-xs w-full mx-4 shadow-2xl"
                        >
                            <h2 className="text-3xl font-bold mb-2 text-red-500">Game Over!</h2>
                            <div className="text-6xl font-bold mb-6 text-white">{score}</div>

                            <div className="flex items-center justify-center gap-2 mb-8 text-sm text-gray-400 bg-gray-900/50 p-3 rounded-lg">
                                <Trophy size={16} className="text-yellow-500" />
                                Best: <span className="text-white font-bold">{highScore}</span>
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={onBack}
                                    className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 rounded-xl font-bold transition-colors"
                                >
                                    Exit
                                </button>
                                <button
                                    onClick={startGame}
                                    className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors"
                                >
                                    <RefreshCw size={18} />
                                    Replay
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </div>
        </div>
    );
};
