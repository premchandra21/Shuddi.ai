import { useEffect, useRef, useState } from "react";

const SERVER_LINK = import.meta.env.VITE_SERVER_LINK;
const POLL_INTERVAL_MS = 2500;
const REQUEST_TIMEOUT_MS = 4000;
// Tuned so progress feels like it's climbing steadily for the first ~15s
// (typical Render free-tier cold start) then eases off if it runs long.
const PROGRESS_TIME_CONSTANT_MS = 9000;
const PROGRESS_CAP_BEFORE_READY = 92;

interface ServerHealthState {
  /** true once /health has responded ok */
  isReady: boolean;
  /** 0-100, only reaches 100 once isReady is true */
  progress: number;
  /** seconds since we started polling */
  elapsedSeconds: number;
  /** true once we've been polling for a while with no luck */
  isTakingLong: boolean;
}

/**
 * Polls the server's /health endpoint until it responds, for cold-starting
 * a free-tier host (e.g. Render) that spins down when idle. Exposes a
 * synthetic 0-100 progress value (there's no real percentage to report,
 * since we don't know how far along the boot is) so a loading UI has
 * something to animate toward.
 */
export function useServerHealth(): ServerHealthState {
  const [isReady, setIsReady] = useState(false);
  const [progress, setProgress] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const startTimeRef = useRef(Date.now());
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    const checkHealth = async () => {
      const controller = new AbortController();
      const abortTimer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        const res = await fetch(`${SERVER_LINK}/health`, {
          signal: controller.signal,
          // /health has no cookies/auth requirement; keep this a plain,
          // cheap request so it isn't blocked by anything CORS-credential related.
          credentials: "omit",
        });
        clearTimeout(abortTimer);

        if (res.ok && !cancelled) {
          setProgress(100);
          setIsReady(true);
          return;
        }
      } catch {
        // Server still asleep / unreachable — fall through and retry.
        clearTimeout(abortTimer);
      }

      if (!cancelled) {
        pollTimeoutRef.current = setTimeout(checkHealth, POLL_INTERVAL_MS);
      }
    };

    checkHealth();

    const tickInterval = setInterval(() => {
      if (cancelled) return;
      const elapsedMs = Date.now() - startTimeRef.current;
      setElapsedSeconds(Math.floor(elapsedMs / 1000));
      setProgress((prev) => {
        if (prev >= 100) return prev;
        // Asymptotic curve: climbs fast at first, eases off, never quite
        // reaches the cap on its own — the real jump to 100 comes from
        // a successful health check above.
        const eased =
          PROGRESS_CAP_BEFORE_READY *
          (1 - Math.exp(-elapsedMs / PROGRESS_TIME_CONSTANT_MS));
        return Math.max(prev, eased);
      });
    }, 250);

    return () => {
      cancelled = true;
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
      clearInterval(tickInterval);
    };
  }, []);

  return {
    isReady,
    progress: Math.round(progress),
    elapsedSeconds,
    isTakingLong: elapsedSeconds > 25 && !isReady,
  };
}