import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { RefreshCw, Star, Heart, Zap, Bell, Music, Camera, Sun } from "lucide-react";

const ICONS = [Star, Heart, Zap, Bell, Music, Camera, Sun, RefreshCw];

export const MemoryMatch = ({ onBack }: { onBack: () => void }) => {
    const [cards, setCards] = useState<any[]>([]);
    const [flipped, setFlipped] = useState<number[]>([]);
    const [solved, setSolved] = useState<number[]>([]);
    const [disabled, setDisabled] = useState(false);
    const [moves, setMoves] = useState(0);

    const initializeGame = () => {
        const duplicatedIcons = [...ICONS, ...ICONS];
        const shuffled = duplicatedIcons
            .sort(() => Math.random() - 0.5)
            .map((Icon, index) => ({
                id: index,
                Icon,
            }));
        setCards(shuffled);
        setFlipped([]);
        setSolved([]);
        setMoves(0);
        setDisabled(false);
    };

    useEffect(() => {
        initializeGame();
    }, []);

    const handleClick = (id: number) => {
        if (disabled || flipped.includes(id) || solved.includes(id)) return;

        if (flipped.length === 0) {
            setFlipped([id]);
            return;
        }

        if (flipped.length === 1) {
            setDisabled(true);
            setFlipped([...flipped, id]);
            setMoves(moves + 1);

            const firstCard = cards.find((c) => c.id === flipped[0]);
            const secondCard = cards.find((c) => c.id === id);

            if (firstCard.Icon === secondCard.Icon) {
                setSolved([...solved, flipped[0], id]);
                setFlipped([]);
                setDisabled(false);
            } else {
                setTimeout(() => {
                    setFlipped([]);
                    setDisabled(false);
                }, 1000);
            }
        }
    };

    const isWon = cards.length > 0 && solved.length === cards.length;

    return (
        <div className="flex flex-col items-center h-full max-w-md mx-auto">
            <div className="flex justify-between items-center w-full mb-6">
                <button onClick={onBack} className="text-gray-400 hover:text-white">
                    ← Back
                </button>
                <h2 className="text-2xl font-bold text-orange-400">Memory Match</h2>
                <div className="text-white font-bold">Moves: {moves}</div>
            </div>

            <div className="grid grid-cols-4 gap-3 w-full aspect-square">
                {cards.map((card) => {
                    const isFlipped = flipped.includes(card.id) || solved.includes(card.id);
                    const isSolved = solved.includes(card.id);

                    return (
                        <motion.div
                            key={card.id}
                            className={`relative cursor-pointer rounded-xl overflow-hidden`}
                            onClick={() => handleClick(card.id)}
                            animate={{ rotateY: isFlipped ? 180 : 0 }}
                            transition={{ duration: 0.3 }}
                        >
                            <div
                                className={`absolute inset-0 flex items-center justify-center bg-gray-700 backface-hidden ${isFlipped ? "opacity-0" : "opacity-100"
                                    }`}
                            >
                                <span className="text-2xl font-bold text-gray-500">{card.id + 1}</span>
                            </div>
                            <div
                                className={`absolute inset-0 flex items-center justify-center ${isSolved ? "bg-orange-500" : "bg-orange-400"
                                    } backface-hidden rotate-y-180 ${isFlipped ? "opacity-100" : "opacity-0"
                                    }`}
                                style={{ transform: "rotateY(180deg)" }}
                            >
                                <card.Icon className="text-white w-6 h-6" />
                            </div>
                        </motion.div>
                    );
                })}
            </div>

            {isWon && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-8 text-center"
                >
                    <h3 className="text-3xl font-bold text-white mb-4">You Won!</h3>
                    <button
                        onClick={initializeGame}
                        className="px-6 py-3 bg-orange-500 text-white rounded-xl font-bold flex items-center gap-2 mx-auto hover:bg-orange-600"
                    >
                        <RefreshCw size={18} />
                        Play Again
                    </button>
                </motion.div>
            )}
        </div>
    );
};
