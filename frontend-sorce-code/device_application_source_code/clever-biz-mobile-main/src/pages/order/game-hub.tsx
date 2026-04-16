import { Gamepad2, Play, ArrowLeft } from "lucide-react";
import { cn } from "clsx-for-tailwind";
import { useState } from "react";
import { Snake } from "./games/Snake";
import { Connect4 } from "./games/Connect4";
import { TicTacToe } from "./games/TicTacToe";
import { FlappyBird } from "./games/FlappyBird";
import Chwazi from "./games/Chwazi";

type GameId = "chwazi" | "snake" | "connect4" | "tictactoe" | "flappybird";

interface GameHubProps {
  onBack: () => void;
  onChosenTreater: (name: string) => void;
}

export const GameHub = ({ onBack, onChosenTreater }: GameHubProps) => {
  const [activeGame, setActiveGame] = useState<GameId | null>(null);

  const games: Array<{ id: GameId; name: string; description: string; color: string }> = [
    {
      id: "chwazi",
      name: "Chwazi",
      description: "Pick who pays in one tap",
      color: "bg-emerald-500",
    },
    {
      id: "snake",
      name: "Snake",
      description: "Classic arcade",
      color: "bg-green-500",
    },
    {
      id: "connect4",
      name: "Connect 4",
      description: "2-player strategy",
      color: "bg-blue-500",
    },
    {
      id: "tictactoe",
      name: "Tic Tac Toe",
      description: "Quick duel",
      color: "bg-violet-500",
    },
    {
      id: "flappybird",
      name: "Flappy Bird",
      description: "Tap to fly",
      color: "bg-amber-500",
    },
  ];

  const renderGame = () => {
    if (activeGame === "chwazi") {
      return <Chwazi onBack={() => setActiveGame(null)} onChosen={onChosenTreater} />;
    }
    if (activeGame === "snake") {
      return <Snake onBack={() => setActiveGame(null)} />;
    }
    if (activeGame === "connect4") {
      return <Connect4 onBack={() => setActiveGame(null)} />;
    }
    if (activeGame === "tictactoe") {
      return <TicTacToe onBack={() => setActiveGame(null)} />;
    }
    if (activeGame === "flappybird") {
      return <FlappyBird onBack={() => setActiveGame(null)} />;
    }
    return null;
  };

  if (activeGame) {
    return <div className="flex-1 min-h-0">{renderGame()}</div>;
  }

  return (
    <div className="flex-1 min-h-0 bg-slate-950 text-white flex flex-col">
      <div className="sticky top-0 z-10 flex items-center justify-between p-4 bg-slate-900/95 backdrop-blur-sm border-b border-slate-800">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-200 hover:text-white"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Orders
        </button>
        <div className="flex items-center gap-2">
          <Gamepad2 className="w-5 h-5 text-indigo-300" />
          <h2 className="text-sm font-semibold">Wait & Play</h2>
        </div>
        <div className="w-24" />
      </div>

      <div className="p-4 overflow-y-auto">
        <h3 className="text-lg font-semibold mb-1">Game Hub</h3>
        <p className="text-xs text-slate-400 mb-4">Play while your order is being prepared.</p>

        <div className="grid grid-cols-2 gap-3">
          {games.map((game) => (
            <button
              key={game.id}
              onClick={() => setActiveGame(game.id)}
              className="group relative text-left rounded-2xl bg-slate-900 border border-slate-800 p-4 hover:border-indigo-400/60 transition-colors"
            >
              <div className={cn("w-10 h-10 rounded-xl mb-3 flex items-center justify-center", game.color)}>
                <Play className="w-5 h-5 text-white" />
              </div>
              <div className="text-sm font-semibold text-white">{game.name}</div>
              <div className="text-xs text-slate-400 mt-1">{game.description}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
