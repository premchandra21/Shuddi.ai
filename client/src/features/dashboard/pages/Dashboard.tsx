import React, { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Container,
  CssBaseline,
  Paper,
  Skeleton,
  ThemeProvider,
  Typography,
} from '@mui/material';
import { toast } from 'react-hot-toast';

import { theme } from '../theme/theme';
// import Header from '../components/Header';
import ActionAlert from '../components/alert/ActionAlert';

// Dashboard-specific components
import StatPillsBar from '../components/StatPillsBar';
import LevelProgressBar from '../components/LevelProgressBar';
import ImpactStatsRow from '../components/ImpactStatsRow';
import ActivityGraph from '../components/ActivityGraph';
import BadgesStrip from '../components/BadgesStrip';
import LeaderboardPanel from '../components/LeaderboardPanel';
import QuickNavCards from '../components/QuickNavCards';

// API
import {
  fetchOverview,
  fetchImpact,
  fetchBadges,
  fetchActivity,
  fetchLeaderboard,
  fetchBalance,
} from '../../../apis/dashboard/dashboardApi';

// Types
import type {
  OverviewData,
  ImpactData,
  BadgesData,
  ActivityData,
  LeaderboardData,
} from '../types/types';

// ─── Dashboard ──────────────────────────────────────────────────────────────────
const Dashboard: React.FC = () => {
  // const navigate = useNavigate();

  const [overview, setOverview]     = useState<OverviewData | null>(null);
  const [impact, setImpact]         = useState<ImpactData | null>(null);
  const [badges, setBadges]         = useState<BadgesData | null>(null);
  const [activity, setActivity]     = useState<ActivityData | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardData | null>(null);
  const [balance, setBalance]       = useState<number | null>(null);
  const [loading, setLoading]       = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [ovRes, impRes, badRes, actRes, lbRes, balRes] = await Promise.allSettled([
      fetchOverview(),
      fetchImpact(),
      fetchBadges(),
      fetchActivity(),
      fetchLeaderboard('global'),
      fetchBalance(),
    ]);

    if (ovRes.status  === 'fulfilled') setOverview(ovRes.value);
    else toast.error('Could not load profile stats.');

    if (impRes.status === 'fulfilled') setImpact(impRes.value);
    else toast.error('Could not load impact data.');

    if (badRes.status === 'fulfilled') setBadges(badRes.value);
    else toast.error('Could not load badges.');

    if (actRes.status === 'fulfilled') setActivity(actRes.value);
    else toast.error('Could not load activity data.');

    if (lbRes.status  === 'fulfilled') setLeaderboard(lbRes.value);
    else toast.error('Could not load leaderboard.');

    if (balRes.status === 'fulfilled') setBalance(balRes.value);
    else toast.error('Could not load wallet balance.');

    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleFixClick = () => toast('Fix & Resubmit — coming soon!', { icon: '🔧' });

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
        {/* <Header /> */}

        <Container maxWidth="xl" sx={{ py: 3 }}>

          {/* ── Overview pills strip (live data) ── */}
          {loading ? (
            <Skeleton variant="rectangular" height={60} sx={{ borderRadius: '0 0 16px 16px', mb: 3 }} />
          ) : overview ? (
            <StatPillsBar overview={overview} balance={balance} />
          ) : null}

          {/* ── Level XP bar ── */}
          {loading ? (
            <Skeleton variant="rectangular" height={8} sx={{ borderRadius: 4, mb: 3 }} />
          ) : overview ? (
            <LevelProgressBar level={overview.level} progressPercentage={overview.progressPercentage} />
          ) : null}

          {/* ── Quick navigation cards ── */}
          <QuickNavCards />

          {/* ── Two-column layout ── */}
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', lg: 'row' }, gap: 3 }}>

            {/* ══ Left column ══ */}
            <Box sx={{ flex: '1 1 0', minWidth: 0 }}>

              {/* Progress & Activity card */}
              <Paper
                elevation={0}
                sx={{
                  border: '1px solid rgba(0,0,0,0.08)',
                  borderRadius: 2,
                  p: { xs: 2, sm: 3 },
                  mb: 3,
                  bgcolor: 'rgba(249,250,251,0.5)',
                }}
              >
                <Typography variant="h6" fontWeight={600} mb={2.5}>
                  Your Progress & Activity
                </Typography>

                {loading ? (
                  <Skeleton variant="rectangular" height={120} sx={{ borderRadius: 2, mb: 3 }} />
                ) : impact ? (
                  <ImpactStatsRow impact={impact} />
                ) : null}

                {loading ? (
                  <Skeleton variant="rectangular" height={80} sx={{ borderRadius: 2, mb: 3 }} />
                ) : activity ? (
                  <ActivityGraph activity={activity} />
                ) : null}

                {/* Submission alert — wire to a real submissions API when ready */}
                <ActionAlert
                  title="Beach Cleanup"
                  items={[
                    { text: 'Location mismatch detected' },
                    { text: 'Photo timestamp outside task window' },
                  ]}
                  buttonText="Fix & Resubmit"
                  onButtonClick={handleFixClick}
                />
              </Paper>

              {/* Badges */}
              <BadgesStrip badges={badges} loading={loading} />
            </Box>

            {/* ══ Right column ══ */}
            <Box sx={{ width: { xs: '100%', lg: 340 }, flexShrink: 0 }}>
              <LeaderboardPanel
                leaderboard={leaderboard}
                myUsername={overview?.username}
                loading={loading}
                onLeaderboardChange={setLeaderboard}
              />
            </Box>
          </Box>

        </Container>
      </Box>
    </ThemeProvider>
  );
};

export default Dashboard;