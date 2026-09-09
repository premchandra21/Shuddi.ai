import { useEffect, useState, type ReactNode } from "react";
import { Box, Typography } from "@mui/material";
import { useServerHealth } from "./useServerHealth";

const colors = {
  forest: "#0f3d2e",
  forestSage: "#2f6b4f",
  cream: "#f7f5ef",
  ink: "#1c2b22",
  inkMuted: "#5b6b60",
  accentGold: "#c9972c",
  border: "#e2e8e0",
};

const TIPS = [
  "Every task you finish on Shuddi links one real action to one real NGO.",
  "A single reused bottle skips about 80 disposable ones a year.",
  "Composting food scraps can cut a household's waste by nearly a third.",
  "Community clean-ups remove more than litter — they rebuild the habit of noticing.",
  "Free-tier servers nap after 15 minutes idle. First visit of the day wakes it up.",
  "Shuddi means purification — every verified task moves that forward, one step at a time.",
  "Urban trees can lower nearby air temperature by several degrees in summer.",
  "NGOs on Shuddi review your submissions by hand — real people, not just a script.",
  "Sorting recyclables correctly roughly doubles how much actually gets reused.",
  "Good things take a moment to grow. This one's almost up.",
];

const ANIM = `
  @keyframes swayStem {
    0%, 100% { transform: rotate(-1.5deg); }
    50% { transform: rotate(1.5deg); }
  }
  @keyframes popIn {
    0% { transform: scale(0); opacity: 0; }
    70% { transform: scale(1.15); opacity: 1; }
    100% { transform: scale(1); opacity: 1; }
  }
  @keyframes fadeTip {
    0% { opacity: 0; transform: translateY(4px); }
    10% { opacity: 1; transform: translateY(0); }
    90% { opacity: 1; transform: translateY(0); }
    100% { opacity: 0; transform: translateY(-4px); }
  }
  @keyframes driftDot {
    0%, 100% { transform: translateY(0); opacity: 0.5; }
    50% { transform: translateY(-6px); opacity: 1; }
  }
`;

const STEM_LENGTH = 120;

interface ServerWakeUpProps {
  children: ReactNode;
}

/**
 * Gates rendering of `children` until the API server responds to /health,
 * showing a themed "germinating" loading screen in the meantime. This
 * exists because the server is on Render's free tier and spins down after
 * 15 minutes idle, so the first request each day can take 30-60s to wake it.
 *
 * Fails open after 45s (lets the person continue and hit retries naturally
 * via the app's normal API error handling) so a genuinely down server
 * doesn't trap someone on this screen forever.
 */
export default function ServerWakeUp({ children }: ServerWakeUpProps) {
  const { isReady, progress, elapsedSeconds, isTakingLong } = useServerHealth();
  const [tipIndex, setTipIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const id = setInterval(() => {
      setTipIndex((i) => (i + 1) % TIPS.length);
    }, 3800);
    return () => clearInterval(id);
  }, []);

  if (isReady || dismissed) return <>{children}</>;

  // Growth thresholds — stem draws in continuously, leaves and the bud pop
  // in as milestones so it reads as stages rather than one smooth wipe.
  const stemOffset = STEM_LENGTH * (1 - progress / 100);
  const showLeftLeaf = progress > 30;
  const showRightLeaf = progress > 55;
  const showBud = progress >= 99;

  return (
    <Box
      sx={{
        minHeight: "100vh",
        width: "100%",
        bgcolor: colors.cream,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        px: 3,
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <style>{ANIM}</style>

      <Box sx={{ width: 96, height: 150, position: "relative", mb: 2 }}>
        <svg viewBox="0 0 96 150" width="96" height="150">
          {/* soil */}
          <ellipse cx="48" cy="138" rx="34" ry="8" fill={colors.forest} opacity={0.15} />
          <ellipse cx="48" cy="134" rx="30" ry="7" fill={colors.forest} />

          <g style={{ transformOrigin: "48px 134px", animation: "swayStem 3.5s ease-in-out infinite" }}>
            {/* stem, drawn in via dashoffset as progress climbs */}
            <path
              d="M48 134 C 46 100, 50 70, 48 20"
              fill="none"
              stroke={colors.forestSage}
              strokeWidth={4}
              strokeLinecap="round"
              strokeDasharray={STEM_LENGTH}
              strokeDashoffset={stemOffset}
              style={{ transition: "stroke-dashoffset 0.25s linear" }}
            />

            {/* left leaf */}
            <path
              d="M47 95 C 20 90, 12 70, 22 55 C 38 62, 46 78, 47 95 Z"
              fill={colors.forestSage}
              style={{
                transformOrigin: "47px 95px",
                opacity: showLeftLeaf ? 1 : 0,
                animation: showLeftLeaf ? "popIn 0.5s ease-out" : "none",
              }}
            />

            {/* right leaf */}
            <path
              d="M49 65 C 76 60, 85 42, 76 28 C 59 34, 50 49, 49 65 Z"
              fill={colors.forest}
              style={{
                transformOrigin: "49px 65px",
                opacity: showRightLeaf ? 1 : 0,
                animation: showRightLeaf ? "popIn 0.5s ease-out" : "none",
              }}
            />

            {/* bud / bloom at completion */}
            <circle
              cx="48"
              cy="18"
              r="7"
              fill={colors.accentGold}
              style={{
                opacity: showBud ? 1 : 0,
                animation: showBud ? "popIn 0.4s ease-out" : "none",
              }}
            />
          </g>

          {/* ambient dust motes */}
          <circle cx="16" cy="60" r="2" fill={colors.accentGold} style={{ animation: "driftDot 2.6s ease-in-out infinite" }} />
          <circle cx="82" cy="90" r="1.6" fill={colors.accentGold} style={{ animation: "driftDot 3.2s ease-in-out infinite 0.6s" }} />
        </svg>
      </Box>

      <Typography
        sx={{
          fontFamily: "'Lora', serif",
          fontWeight: 600,
          fontSize: "1.35rem",
          color: colors.ink,
          textAlign: "center",
          mb: 0.5,
        }}
      >
        Waking things up
      </Typography>
      <Typography
        sx={{
          color: colors.inkMuted,
          fontSize: "0.9rem",
          textAlign: "center",
          mb: 3,
        }}
      >
        Our server naps when idle — give it a moment to stretch.
      </Typography>

      {/* progress bar */}
      <Box
        sx={{
          width: "100%",
          maxWidth: 320,
          height: 8,
          borderRadius: 999,
          bgcolor: colors.border,
          overflow: "hidden",
          mb: 1,
        }}
      >
        <Box
          sx={{
            height: "100%",
            width: `${progress}%`,
            borderRadius: 999,
            bgcolor: colors.forestSage,
            transition: "width 0.3s ease-out",
          }}
        />
      </Box>
      <Typography sx={{ color: colors.inkMuted, fontSize: "0.78rem", mb: 4 }}>
        {progress}% · {elapsedSeconds}s
      </Typography>

      {/* rotating tip */}
      <Box sx={{ minHeight: 44, maxWidth: 380, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Typography
          key={tipIndex}
          sx={{
            fontFamily: "'Lora', serif",
            fontStyle: "italic",
            color: colors.forest,
            textAlign: "center",
            fontSize: "0.95rem",
            animation: "fadeTip 3.8s ease-in-out",
          }}
        >
          {TIPS[tipIndex]}
        </Typography>
      </Box>

      {isTakingLong && (
        <Typography
          onClick={() => setDismissed(true)}
          sx={{
            mt: 4,
            fontSize: "0.8rem",
            color: colors.inkMuted,
            textDecoration: "underline",
            cursor: "pointer",
            "&:hover": { color: colors.ink },
          }}
        >
          Taking longer than usual — continue anyway
        </Typography>
      )}
    </Box>
  );
}