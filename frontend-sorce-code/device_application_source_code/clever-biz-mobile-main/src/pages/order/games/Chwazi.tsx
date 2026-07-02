import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { motion } from "motion/react";
import { ArrowLeft, RotateCcw } from "lucide-react";

type ChwaziPhase = "waiting" | "countdown" | "result";

type TouchPoint = {
  id: number;
  x: number;
  y: number;
  color: string;
};

interface ChwaziProps {
  onBack: () => void;
  onChosen: (name: string) => void;
}

const COLORS = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#FED766", "#FF8C42", "#A78BFA", "#34D399", "#F472B6", "#60A5FA", "#FBBF24"];

export const Chwazi = ({ onBack, onChosen }: ChwaziProps) => {
  const areaRef = useRef<HTMLDivElement | null>(null);
  const pointersRef = useRef<Map<number, TouchPoint>>(new Map());
  const countdownTimerRef = useRef<number | null>(null);
  const delayTimerRef = useRef<number | null>(null);
  const chosenNotifiedRef = useRef(false);
  const [phase, setPhase] = useState<ChwaziPhase>("waiting");
  const [countdown, setCountdown] = useState(3);
  const [points, setPoints] = useState<TouchPoint[]>([]);
  const [winnerId, setWinnerId] = useState<number | null>(null);

  const winner = useMemo(() => points.find((point) => point.id === winnerId) || null, [points, winnerId]);

  const clearTimers = () => {
    if (countdownTimerRef.current) {
      window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    if (delayTimerRef.current) {
      window.clearTimeout(delayTimerRef.current);
      delayTimerRef.current = null;
    }
  };

  const syncPoints = () => {
    const nextPoints = Array.from(pointersRef.current.values());
    setPoints(nextPoints);
    return nextPoints;
  };

  const resetGame = () => {
    clearTimers();
    pointersRef.current.clear();
    setPoints([]);
    setPhase("waiting");
    setCountdown(3);
    setWinnerId(null);
    chosenNotifiedRef.current = false;
  };

  const pickWinner = () => {
    const current = Array.from(pointersRef.current.values());
    if (current.length < 2) {
      setPhase("waiting");
      setCountdown(3);
      return;
    }
    const selected = current[Math.floor(Math.random() * current.length)];
    setWinnerId(selected.id);
    setPhase("result");
    if (!chosenNotifiedRef.current) {
      chosenNotifiedRef.current = true;
      onChosen("This person");
    }
  };

  const startCountdown = () => {
    clearTimers();
    setCountdown(3);
    setPhase("countdown");
    countdownTimerRef.current = window.setInterval(() => {
      setCountdown((current) => {
        if (current <= 1) {
          clearTimers();
          pickWinner();
          return 0;
        }
        return current - 1;
      });
    }, 1000);
  };

  const scheduleCountdown = () => {
    clearTimers();
    delayTimerRef.current = window.setTimeout(startCountdown, 600);
  };

  useEffect(() => () => clearTimers(), []);

  const getRelativePoint = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = areaRef.current?.getBoundingClientRect();
    if (!rect) return { x: event.clientX, y: event.clientY };
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (phase === "result") return;
    const position = getRelativePoint(event);
    const color = COLORS[pointersRef.current.size % COLORS.length];
    pointersRef.current.set(event.pointerId, { id: event.pointerId, ...position, color });
    const current = syncPoints();
    event.currentTarget.setPointerCapture(event.pointerId);
    if (current.length >= 2) scheduleCountdown();
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const existing = pointersRef.current.get(event.pointerId);
    if (!existing || phase === "result") return;
    pointersRef.current.set(event.pointerId, { ...existing, ...getRelativePoint(event) });
    syncPoints();
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (phase === "result") return;
    pointersRef.current.delete(event.pointerId);
    const current = syncPoints();
    if (current.length < 2) {
      clearTimers();
      setPhase("waiting");
      setCountdown(3);
    } else {
      scheduleCountdown();
    }
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture can already be released on some mobile browsers.
    }
  };

  return (
    <div className="h-full bg-gray-950 text-white flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-8 pb-3 shrink-0">
        <button onClick={onBack} className="inline-flex items-center gap-2 text-white/80 hover:text-white text-sm font-semibold">
          <ArrowLeft className="w-5 h-5" strokeWidth={1.8} /> Back
        </button>
        <div className="text-center">
          <h2 className="text-xl font-bold text-white">Swajie</h2>
          <p className="text-xs text-gray-400">Who pays the bill?</p>
        </div>
        <button onClick={resetGame} className="p-2 rounded-full hover:bg-white/10 text-white/60 hover:text-white">
          <RotateCcw className="w-4 h-4" strokeWidth={1.8} />
        </button>
      </div>

      <div
        ref={areaRef}
        className="flex-1 relative overflow-hidden mx-3 mb-3 rounded-3xl border border-white/10 bg-gray-900/80 touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {points.map((point) => {
          const isWinner = point.id === winnerId;
          return (
            <motion.div
              key={point.id}
              initial={{ scale: 0, opacity: 0 }}
              animate={phase === "result" ? { scale: isWinner ? [1, 1.5, 1.3] : 0.5, opacity: isWinner ? 1 : 0.2 } : { scale: 1, opacity: 1 }}
              className="absolute w-20 h-20 rounded-full border-4 border-white/80 shadow-xl flex items-center justify-center"
              style={{ left: point.x - 40, top: point.y - 40, backgroundColor: point.color, zIndex: isWinner ? 30 : 10 }}
            >
              {phase === "countdown" && <span className="absolute -bottom-5 w-5 h-5 rounded-full border-2 animate-ping" style={{ borderColor: point.color }} />}
              {isWinner && <span className="text-2xl text-white">💸</span>}
            </motion.div>
          );
        })}

        {phase === "waiting" && points.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-8 pointer-events-none">
            <motion.div animate={{ scale: [1, 1.08, 1] }} transition={{ duration: 2, repeat: Infinity }} className="text-6xl mb-5">☝️</motion.div>
            <h3 className="text-white text-xl font-bold mb-2">Everyone place a finger</h3>
            <p className="text-gray-400 text-sm">Place 2+ fingers on the screen...</p>
          </div>
        )}

        {phase === "waiting" && points.length === 1 && (
          <div className="absolute inset-x-0 top-8 text-center pointer-events-none">
            <span className="bg-white/10 backdrop-blur-sm rounded-full px-5 py-2 text-white text-sm font-semibold">Waiting for more fingers…</span>
          </div>
        )}

        {phase === "countdown" && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <motion.div key={countdown} initial={{ scale: 1.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-16 h-16 rounded-full bg-primary shadow-lg shadow-primary/40 flex items-center justify-center">
              <span className="text-white text-3xl font-black">{countdown}</span>
            </motion.div>
          </div>
        )}

        {phase === "result" && winner && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center text-center px-6">
            <div className="w-20 h-20 rounded-full border-4 border-white shadow-2xl mb-5" style={{ backgroundColor: winner.color }} />
            <h3 className="text-white text-3xl font-black mb-1">This person pays!</h3>
            <p className="text-gray-300 text-sm mb-6">The highlighted finger is the one 🎯</p>
            <button onClick={resetGame} className="px-8 py-3 bg-white text-gray-900 rounded-full font-bold text-sm shadow-lg active:scale-95">
              Play Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Chwazi;
