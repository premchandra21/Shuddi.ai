import { useState, useEffect } from 'react';
import { Box, Container, Typography, Tabs, Tab, Grid, Paper, Skeleton } from '@mui/material';
import { useNavigate } from 'react-router-dom';

import { TaskListFilters } from '../../../components/tasks/TaskListFilters';
import { TaskCard } from '../../individual-tasks/components/TaskCard';
import { getAllTasks, getDailyTasks } from '../../../apis/task/individual/individual.api';
import { getAvailableCommunityTasks, type CommunityTaskListItem } from '../../../apis/task/community/community.api';
import type { Task, TaskDetails, TaskListItem } from '../../../utils/individualTask.type';

const GREEN_GRADIENT = 'linear-gradient(135deg, #1b5e20 0%, #2e7d32 100%)';
const GREEN_PRIMARY = '#1b5e20';

const mapTaskToListItem = (task: Task): TaskListItem => ({
  id: task.id,
  title: task.title,
  description: task.description,
  category: task.individualTask.category,
  difficulty: task.individualTask.difficulty,
  points: task.baseScore,
});

const mapDailyToListItem = (task: TaskDetails): TaskListItem => ({
  id: task.id,
  title: task.title,
  description: task.description,
  category: task.category,
  difficulty: task.difficulty,
  points: task.baseScore,
});

type BrowseTab = 'individual' | 'community';

const formatDate = (date?: string) => {
  if (!date) return 'Not scheduled';
  return new Date(date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
};

export default function TasksPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<BrowseTab>('individual');

  // Individual Task State
  const [tasks, setTasks] = useState<TaskListItem[]>([]);
  const [dailyTask, setDailyTask] = useState<TaskListItem | null>(null);
  const [loading, setLoading] = useState(true);

  // Community Task State
  const [communityTasks, setCommunityTasks] = useState<CommunityTaskListItem[]>([]);
  const [communityLoading, setCommunityLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');

  useEffect(() => {
    const fetchTasks = async () => {
      try {
        const res = await getAllTasks();
        setTasks(res.filter((task: Task) => task.isActive).map(mapTaskToListItem));
      } catch (err) {
        console.error('Failed to fetch individual tasks', err);
      } finally {
        setLoading(false);
      }
    };

    const fetchDailyTask = async () => {
      try {
        const data = await getDailyTasks();
        setDailyTask(mapDailyToListItem(data));
      } catch (err) {
        console.error('Failed to fetch daily task', err);
      }
    };

    const fetchCommunityTasks = async () => {
      try {
        const res = await getAvailableCommunityTasks();
        setCommunityTasks(res.items ?? []);
      } catch (err) {
        console.error('Failed to fetch community tasks', err);
      } finally {
        setCommunityLoading(false);
      }
    };

    fetchDailyTask();
    fetchTasks();
    fetchCommunityTasks();
  }, []);

  const filteredIndividualTasks = tasks.filter((task) => {
    const matchesSearch = task.title.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'All' || task.category.toUpperCase() === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const filteredCommunityTasks = communityTasks.filter((task) =>
    task.title.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f8f9fa' }}>
      <Box sx={{ background: GREEN_GRADIENT, color: 'white', py: 6, mb: 4 }}>
        <Container maxWidth="xl">
          <Typography variant="h3" fontWeight={800} gutterBottom>
            Action Center
          </Typography>
          <Typography variant="h6" sx={{ opacity: 0.9, maxWidth: 600, mb: 3 }}>
            Browse impactful tasks — go it alone or join a community event.
          </Typography>

          <Tabs
            value={tab}
            onChange={(_, value: BrowseTab) => setTab(value)}
            textColor="inherit"
            TabIndicatorProps={{ sx: { bgcolor: 'white', height: 3 } }}
            sx={{ minHeight: 0 }}
          >
            <Tab
              value="individual"
              label="Individual Tasks"
              sx={{ color: 'rgba(255,255,255,0.75)', '&.Mui-selected': { color: 'white' }, fontWeight: 700 }}
            />
            <Tab
              value="community"
              label="Community Events"
              sx={{ color: 'rgba(255,255,255,0.75)', '&.Mui-selected': { color: 'white' }, fontWeight: 700 }}
            />
          </Tabs>
        </Container>
      </Box>

      <Container maxWidth="xl" sx={{ pb: 8 }}>
        <TaskListFilters
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          categoryFilter={categoryFilter}
          onCategoryChange={setCategoryFilter}
          searchPlaceholder={tab === 'individual' ? 'Search tasks...' : 'Search community events...'}
        />

        {tab === 'individual' && (
          <>
            {dailyTask && (
              <Paper
                elevation={0}
                sx={{ p: 2, mb: 3, border: '2px solid #2e7d32', borderRadius: 2, bgcolor: '#f1f8f2' }}
              >
                <Typography fontWeight={700} color={GREEN_PRIMARY} mb={1.5}>
                  🌱 Daily Task
                </Typography>
                <Grid container>
                  <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                    <TaskCard task={dailyTask} />
                  </Grid>
                </Grid>
              </Paper>
            )}

            <Grid container spacing={3}>
              {loading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <Grid size={{ xs: 12, sm: 6, md: 4 }} key={i}>
                      <Skeleton variant="rounded" height={320} />
                    </Grid>
                  ))
                : filteredIndividualTasks.length > 0
                ? filteredIndividualTasks.map((task) => (
                    <Grid size={{ xs: 12, sm: 6, md: 4 }} key={task.id}>
                      <TaskCard task={task} />
                    </Grid>
                  ))
                : (
                    <Grid size={{ xs: 12 }}>
                      <Box textAlign="center" py={6}>
                        <Typography color="text.secondary">No tasks found.</Typography>
                      </Box>
                    </Grid>
                  )}
            </Grid>
          </>
        )}

        {tab === 'community' && (
          <Grid container spacing={3}>
            {communityLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <Grid size={{ xs: 12, sm: 6, md: 4 }} key={i}>
                  <Skeleton variant="rounded" height={220} />
                </Grid>
              ))
            ) : filteredCommunityTasks.length > 0 ? (
              filteredCommunityTasks.map((task) => (
                <Grid size={{ xs: 12, sm: 6, md: 4 }} key={task.communityTaskId}>
                  <Paper
                    elevation={0}
                    sx={{
                      p: 2.5,
                      height: '100%',
                      borderRadius: 3,
                      border: '1px solid #e0e0e0',
                      display: 'flex',
                      flexDirection: 'column',
                      transition: 'transform 0.2s, box-shadow 0.2s',
                      '&:hover': {
                        transform: 'translateY(-4px)',
                        boxShadow: '0 12px 24px rgba(0,0,0,0.08)',
                        borderColor: GREEN_PRIMARY,
                      },
                    }}
                  >
                    <Typography variant="h6" fontWeight={700} gutterBottom>
                      {task.title}
                    </Typography>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ mb: 2, flexGrow: 1 }}
                    >
                      {task.description}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
                      {formatDate(task.startAt)} – {formatDate(task.endAt)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display="block" mb={2}>
                      Capacity: {task.registeredCount} / {task.maxParticipants ?? 'Unlimited'}
                    </Typography>
                    <Box
                      component="button"
                      onClick={() => navigate(`/community-tasks/${task.communityTaskId}`)}
                      sx={{
                        border: `1px solid ${GREEN_PRIMARY}`,
                        color: GREEN_PRIMARY,
                        bgcolor: 'transparent',
                        borderRadius: 2,
                        py: 1,
                        fontWeight: 700,
                        cursor: 'pointer',
                        '&:hover': { bgcolor: '#e8f5e9' },
                      }}
                    >
                      View Event
                    </Box>
                  </Paper>
                </Grid>
              ))
            ) : (
              <Grid size={{ xs: 12 }}>
                <Box textAlign="center" py={6}>
                  <Typography color="text.secondary">No community events found.</Typography>
                </Box>
              </Grid>
            )}
          </Grid>
        )}
      </Container>
    </Box>
  );
}