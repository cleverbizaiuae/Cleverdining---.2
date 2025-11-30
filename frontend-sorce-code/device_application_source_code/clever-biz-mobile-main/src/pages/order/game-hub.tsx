import { Gamepad2, X, Trophy, Play } from "lucide-react";
import { cn } from "clsx-for-tailwind";

interface GameHubProps {
    isOpen: boolean;
    close: () => void;
}

export const GameHub = ({ isOpen, close }: GameHubProps) => {
    if (!isOpen) return null;

    const games = [
        { id: 1, name: "Snake", color: "bg-green-500" },
        { id: 2, name: "Connect 4", color: "bg-blue-500" },
        { id: 3, name: "Tic Tac Toe", color: "bg-purple-500" },
        { id: 4, name: "Memory Match", color: "bg-orange-500" },
    ];

    return (
        <div className="fixed inset-0 z-50 bg-gray-900 text-white overflow-y-auto animate-in fade-in duration-300">
            {/* Header */}
            <div className="sticky top-0 z-10 flex items-center justify-between p-6 bg-gray-900/95 backdrop-blur-sm border-b border-gray-800">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-600 rounded-full">
                        <Gamepad2 size={24} />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold">Arcade Hub</h2>
                        <p className="text-xs text-gray-400">Play while you wait!</p>
                    </div>
                </div>
                <button
                    onClick={close}
                    className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-full text-sm font-medium transition-colors flex items-center gap-2"
                >
                    <X size={16} />
                    Check Order
                </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-8">
                {/* Featured Banner */}
                <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 to-purple-700 p-6 shadow-2xl">
                    <div className="absolute top-0 right-0 -mt-4 -mr-4 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
                    <div className="relative z-10">
                        <span className="inline-block px-3 py-1 rounded-full bg-white/20 text-xs font-bold mb-3">
                            FEATURED
                        </span>
                        <h3 className="text-2xl font-bold mb-2">Weekly Tournament</h3>
                        <p className="text-indigo-100 text-sm mb-4 max-w-[80%]">
                            Compete with other diners and win a free dessert!
                        </p>
                        <button className="px-5 py-2.5 bg-white text-indigo-600 rounded-xl font-bold text-sm shadow-lg hover:bg-indigo-50 transition-colors flex items-center gap-2">
                            <Trophy size={16} />
                            Join Now
                        </button>
                    </div>
                </div>

                {/* Games Grid */}
                <div>
                    <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                        <Play size={18} className="text-indigo-400" />
                        All Games
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                        {games.map((game) => (
                            <div
                                key={game.id}
                                className="group relative aspect-square rounded-2xl bg-gray-800 border border-gray-700 overflow-hidden hover:border-indigo-500/50 transition-all"
                            >
                                <div className={cn("absolute inset-0 opacity-20 group-hover:opacity-30 transition-opacity", game.color)} />
                                <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center">
                                    <div className={cn("w-12 h-12 rounded-xl mb-3 flex items-center justify-center shadow-lg", game.color)}>
                                        <Gamepad2 size={24} className="text-white" />
                                    </div>
                                    <span className="font-bold text-sm">{game.name}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};
