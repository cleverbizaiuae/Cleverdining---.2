import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ArrowLeft, Fingerprint } from "lucide-react";

type ChwaziPhase = "intro" | "waiting" | "counting" | "chosen";

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

const COLORS = ["#ef4444", "#22c55e", "#3b82f6", "#eab308", "#a855f7", "#f97316", "#14b8a6", "#ec4899"];

const COLOR_NAMES: Record<string, string> = {
  "#ef4444": "Red",
  "#22c55e": "Green",
  "#3b82f6": "Blue",
  "#eab308": "Yellow",
  "#a855f7": "Purple",
  "#f97316": "Orange",
  "#14b8a6": "Teal",
  "#ec4899": "Pink",
};

export const Chwazi = ({ onBack, onChosen }: ChwaziProps) => {
  const pointersRef = useRef<Map<number, TouchPoint>>(new Map());
  const timerRef = useRef<number | null>(null);
  const pickTimerRef = useRef<number | null>(null);

  const [phase, setPhase] = useState<ChwaziPhase>("intro");
  const [seconds, setSeconds] = useState(3);
  const [points, setPoints] = useState<TouchPoint[]>([]);
  const [chosenId, setChosenId] = useState<number | null>(null);

  const chosenPoint = useMemo(() => points.find((point) => point.id === chosenId) || null, [points, chosenId]);

  const clearTimers = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (pickTimerRef.current) {
      window.clearTimeout(pickTimerRef.current);
      pickTimerRef.current = null;
    }
  };

  const syncFromPointers = () => {
    const current = Array.from(pointersRef.current.values());
    setPoints(current);
    return current;
  };

  const pickWinner = () => {
    const current = Array.from(pointersRef.current.values());
    if (current.length < 2) {
      setPhase("waiting");
      return;
    }
    const winner = current[Math.floor(Math.random() * current.length)];
    setChosenId(winner.id);
    setPhase("chosen");

    pickTimerRef.current = window.setTimeout(() => {
      const name = COLOR_NAMES[winner.color] || "Lucky";
      onChosen(name);
      setPhase("waiting");
      setChosenId(null);
    }, 2500);
  };

  const startCountdown = () => {
    clearTimers();
    setSeconds(3);
    timerRef.current = window.setInterval(() => {
      setSeconds((previous) => {
        if (previous <= 1) {
          clearTimers();
          pickWinner();
          return 0;
        }
        return previous - 1;
      });
    }, 1000);
  };

  useEffect(() => {
    return () => clearTimers();
  }, []);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (phase === "intro") setPhase("waiting");
    const color = COLORS[pointersRef.current.size % COLORS.length];
    pointersRef.current.set(event.pointerId, {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      color,
    });

    const current = syncFromPointers();
    event.currentTarget.setPointerCapture(event.pointerId);

    if (current.length >= 2 && phase !== "counting" && phase !== "chosen") {
      setPhase("counting");
      startCountdown();
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const existing = pointersRef.current.get(event.pointerId);
    if (!existing) return;
    pointersRef.current.set(event.pointerId, {
      ...existing,
      x: event.clientX,
      y: event.clientY,
    });
    syncFromPointers();
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId);
    const current = syncFromPointers();

    if (current.length < 2) {
      clearTimers();
      setPhase("waiting");
      setSeconds(3);
      setChosenId(null);
    }

    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // no-op
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-950 text-white">
      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-200 hover:text-white"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <span className="text-sm font-semibold">Chwazi: Who Pays?</span>
        <span className="w-10" />
      </div>

      <div
        className="relative flex-1 touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {points.map((point) => (
          <div
            key={point.id}
            className="absolute w-16 h-16 rounded-full border-4 border-white/70 shadow-lg flex items-center justify-center transition-transform"
            style={{
              left: point.x - 32,
              top: point.y - 32,
              backgroundColor: point.color,
              transform: point.id === chosenId ? "scale(1.2)" : "scale(1)",
              zIndex: point.id === chosenId ? 20 : 10,
            }}
          >
            <Fingerprint className="w-6 h-6 text-white" />
          </div>
        ))}

        <div className="absolute inset-x-0 top-8 px-4 text-center z-30 pointer-events-none">
          {phase === "intro" && (
            <p className="text-sm text-slate-200">Put at least two fingers on the screen to start.</p>
          )}
          {phase === "waiting" && (
            <p className="text-sm text-slate-300">Waiting for players. Keep fingers pressed.</p>
          )}
          {phase === "counting" && (
            <div className="inline-flex items-center gap-3 bg-white/10 border border-white/20 rounded-full px-4 py-2">
              <span className="text-xs uppercase tracking-wide text-slate-300">Picking in</span>
              <span className="text-lg font-bold">{seconds}</span>
            </div>
          )}
          {phase === "chosen" && chosenPoint && (
            <div className="inline-flex items-center gap-2 bg-emerald-500/20 border border-emerald-300/30 rounded-full px-4 py-2 text-emerald-100">
              <span className="text-sm font-semibold">{COLOR_NAMES[chosenPoint.color] || "Lucky"} finger treats! 🎉</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Chwazi;
