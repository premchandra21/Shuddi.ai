import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Container,
  Typography,
  Box,
  Button,
  CircularProgress,
  Paper,
  Chip,
  Stepper,
  Step,
  StepLabel,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';

import { VerificationUpload } from '../components/VerificationUpload';
import { SubmissionResultState } from '../../../components/tasks/SubmissionResultState';
import { getCategoryTheme, getDifficultyTheme } from '../../../config/taskTheme';
import { taskToast } from '../../../utils/taskToast';
import { getTaskDetails, startTask, getStatus, SubmitTaskEvidence } from '../../../apis/task/individual/individual.api';
import type { TaskDetails, TaskUIStatus, TaskRequirement, MCQQuestion } from '../../../utils/individualTask.type';

const GREEN_PRIMARY = '#1b5e20';

// Steps are content, not just labels — order carries real meaning here,
// mirroring the orchestrator's actual TaskCompletionStatus stages.
const STEP_LABELS = ['Start', 'In Progress', 'Submitted', 'Verifying', 'Reward', 'Completed'] as const;

const stepIndexForStatus = (status: TaskUIStatus): number => {
  switch (status) {
    case 'NOT_STARTED':
      return 0;
    case 'STARTED':
      return 1;
    case 'SUBMITTED':
      return 2;
    case 'REJECTED': // needs another submission attempt — sits at "Submitted", not further along
      return 2;
    case 'UNDER_VERIFICATION':
      return 3;
    case 'VERIFIED':
    case 'REWARD_PROCESSING':
      return 4;
    case 'COMPLETED':
    case 'COOLDOWN':
      return 5;
    default:
      return 0;
  }
};

// Statuses the orchestrator can still move forward on its own, without any
// user action — these are the ones worth polling.
const IN_FLIGHT_STATUSES: readonly TaskUIStatus[] = [
  'SUBMITTED',
  'UNDER_VERIFICATION',
  'VERIFIED',
  'REWARD_PROCESSING',
];

// Copy for the in-flight states — one shared "pending" block below instead
// of four near-identical JSX branches.
const PENDING_COPY: Partial<Record<TaskUIStatus, string>> = {
  SUBMITTED: "Your proof has been submitted — verification will start shortly.",
  UNDER_VERIFICATION: 'Verifying your submission...',
  VERIFIED: 'Verified! Processing your reward...',
  REWARD_PROCESSING: 'Processing your reward...',
};

const POLL_INTERVAL_MS = 3000;

// TaskDetails already gives id/title/description/category/difficulty/baseScore.
// These are the extra fields IndividualTask already has on the backend
// (requirements, factContent, educationalLink, isDaily) plus verificationType
// and MCQ questions — add them to TaskDetails itself once the API returns
// them, then this intersection collapses to just `TaskDetails`.
type TaskDetailData = TaskDetails & {
  verificationType: 'IMAGE' | 'TEXT' | 'MCQ' | 'HYBRID' | 'BEFORE_AFTER';
  requirements?: TaskRequirement[];
  factContent?: string | null;
  educationalLink?: string | null;
  isDaily?: boolean;
  mcqQuestions?: MCQQuestion[];
};

interface StatusData {
  status: TaskUIStatus;
  // getStatus() doesn't return these yet (see current individual.api.ts) —
  // extend the /tasks/:id/status endpoint to include them so the
  // Rejected/Cooldown screens can show real messages instead of the
  // generic fallback copy SubmissionResultState uses when they're undefined.
  rejectionReason?: string | null;
  expiresAt?: string | null;
}

export default function IndividualTaskPage() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();

  const [task, setTask] = useState<TaskDetailData | null>(null);
  const [statusData, setStatusData] = useState<StatusData>({ status: 'NOT_STARTED' });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!taskId) return;

    const load = async () => {
      setLoading(true);
      try {
        const [taskRes, statusRes] = await Promise.all([
          getTaskDetails(taskId),
          getStatus(taskId),
        ]);
        setTask(taskRes as unknown as TaskDetailData);
        setStatusData({ status: statusRes.status });
      } catch (err) {
        console.error('Failed to load task', err);
        taskToast.error(err instanceof Error ? err.message : 'Could not load this task.');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [taskId]);

  // While the orchestrator is working through SUBMITTED -> UNDER_VERIFICATION
  // -> VERIFIED -> REWARD_PROCESSING, nothing the user does changes the
  // status — only polling catches the transition to COMPLETED/REJECTED/
  // COOLDOWN. Re-registers whenever statusData.status changes, and stops
  // registering once the status is no longer in-flight.
  useEffect(() => {
    if (!taskId) return;
    if (!IN_FLIGHT_STATUSES.includes(statusData.status)) return;

    const interval = setInterval(async () => {
      try {
        const res = await getStatus(taskId);
        setStatusData((prev) => {
          if (prev.status !== res.status) {
            if (res.status === 'COMPLETED' && task) taskToast.approved(task.baseScore);
            if (res.status === 'REJECTED') taskToast.rejected((res as { rejectionReason?: string }).rejectionReason);
            if (res.status === 'COOLDOWN') taskToast.cooldown();
          }
          return {
            status: res.status,
            rejectionReason: (res as { rejectionReason?: string }).rejectionReason ?? prev.rejectionReason,
            expiresAt: (res as { expiresAt?: string }).expiresAt ?? prev.expiresAt,
          };
        });
      } catch (err) {
        console.error('Failed to poll task status', err);
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [taskId, statusData.status, task]);

  const handleStart = async () => {
    if (!taskId) return;
    try {
      const res = await startTask(taskId);
      setStatusData({ status: res.status });
      taskToast.started();
    } catch (err) {
      console.error('Failed to start task', err);
      taskToast.error(err instanceof Error ? err.message : 'Could not start this task.');
    }
  };

  const handleRetry = async () => {
    if (!taskId) return;
    try {
      const res = await startTask(taskId);
      setStatusData({ status: res.status });
    } catch (err) {
      console.error('Failed to restart task', err);
      taskToast.error('Could not start a new attempt. Please try again.');
    }
  };

  const handleSubmitProof = async (data: {
    evidenceUrls?: string[];
    textResponse?: string;
    mcqAnswer?: Record<string, string>;
  }) => {
    if (!taskId) return;
    setSubmitting(true);
    try {
      // SubmitTaskEvidence's `mcqAnswer` is a single string on the wire —
      // serialize the per-question answer map. If the backend ends up
      // wanting one answer for the whole task rather than per-question,
      // swap this for the single selected value instead.
      await SubmitTaskEvidence(taskId, {
        evidenceUrls: data.evidenceUrls,
        textResponse: data.textResponse,
        mcqAnswer: data.mcqAnswer ? JSON.stringify(data.mcqAnswer) : undefined,
      });
      setStatusData({ status: 'SUBMITTED' });
      taskToast.submitted();
    } catch (err) {
      console.error('Failed to submit proof', err);
      taskToast.error(err instanceof Error ? err.message : 'Could not submit your proof. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="100vh">
        <CircularProgress sx={{ color: GREEN_PRIMARY }} />
      </Box>
    );
  }

  if (!task) {
    return (
      <Box p={4}>
        <Typography variant="h6" gutterBottom>
          Task Not Found
        </Typography>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/all-tasks')}>
          Back to Tasks
        </Button>
      </Box>
    );
  }

  const categoryTheme = getCategoryTheme(task.category);
  const difficultyTheme = getDifficultyTheme(task.difficulty);
  const CategoryIcon = categoryTheme.icon;
  const activeStep = stepIndexForStatus(statusData.status);

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f4f6f8' }}>

      <Container maxWidth="md" sx={{ py: 6 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/all-tasks')} sx={{ mb: 3 }}>
          Back
        </Button>

        <Paper elevation={3} sx={{ borderRadius: 3, overflow: 'hidden' }}>
          {/* Icon hero — replaces the old (broken) task.image banner */}
          <Box
            sx={{
              background: categoryTheme.gradient,
              color: 'white',
              px: 4,
              py: 5,
              display: 'flex',
              alignItems: 'center',
              gap: 3,
            }}
          >
            <CategoryIcon sx={{ fontSize: 64, opacity: 0.9 }} />
            <Box>
              <Box display="flex" gap={1} mb={1}>
                <Chip
                  label={categoryTheme.label}
                  size="small"
                  sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white', fontWeight: 600 }}
                />
                <Chip
                  label={difficultyTheme.label}
                  size="small"
                  sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white', fontWeight: 600 }}
                />
                {task.isDaily && (
                  <Chip
                    label="Daily"
                    size="small"
                    sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white', fontWeight: 600 }}
                  />
                )}
              </Box>
              <Typography variant="h4" fontWeight={800}>
                {task.title}
              </Typography>
              <Typography sx={{ opacity: 0.9, mt: 0.5 }}>+{task.baseScore} XP</Typography>
            </Box>
          </Box>

          <Box sx={{ p: 4 }}>
            <Typography variant="body1" color="text.secondary" mb={3}>
              {task.description}
            </Typography>

            <Stepper activeStep={activeStep} sx={{ mb: 4 }} alternativeLabel>
              {STEP_LABELS.map((label) => (
                <Step key={label}>
                  <StepLabel>{label}</StepLabel>
                </Step>
              ))}
            </Stepper>

            {task.requirements && task.requirements.length > 0 && (
              <Box mb={3}>
                <Typography fontWeight={700} mb={1}>
                  What you'll need to do
                </Typography>
                <List dense>
                  {task.requirements.map((req) => (
                    <ListItem key={req.id} disableGutters>
                      <ListItemIcon sx={{ minWidth: 32 }}>
                        <CheckCircleOutlineIcon fontSize="small" sx={{ color: GREEN_PRIMARY }} />
                      </ListItemIcon>
                      <ListItemText primary={req.label} />
                    </ListItem>
                  ))}
                </List>
              </Box>
            )}

            {task.factContent && (
              <Paper
                elevation={0}
                sx={{ p: 2, mb: 3, bgcolor: categoryTheme.soft, borderRadius: 2, display: 'flex', gap: 1.5 }}
              >
                <LightbulbOutlinedIcon sx={{ color: categoryTheme.accent }} />
                <Box>
                  <Typography fontWeight={700} sx={{ color: categoryTheme.accent }} gutterBottom>
                    Did you know?
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {task.factContent}
                  </Typography>
                </Box>
              </Paper>
            )}

            {task.educationalLink && (
              <Button
                href={task.educationalLink}
                target="_blank"
                rel="noopener noreferrer"
                endIcon={<OpenInNewIcon />}
                sx={{ mb: 3, color: categoryTheme.accent }}
              >
                Learn more
              </Button>
            )}

            <Divider sx={{ mb: 3 }} />

            {/* Action zone — one branch per status */}
            {statusData.status === 'NOT_STARTED' && (
              <Box textAlign="center">
                <Button
                  variant="contained"
                  size="large"
                  onClick={handleStart}
                  sx={{ bgcolor: GREEN_PRIMARY, px: 6, '&:hover': { bgcolor: '#144a18' } }}
                >
                  Start Task
                </Button>
              </Box>
            )}

            {statusData.status === 'STARTED' && (
              <VerificationUpload
                type={task.verificationType}
                mcqQuestions={task.mcqQuestions}
                onSubmit={handleSubmitProof}
                loading={submitting}
              />
            )}

            {statusData.status === 'SUBMITTED' ||
              statusData.status === 'UNDER_VERIFICATION' ||
              statusData.status === 'VERIFIED' ||
              statusData.status === 'REWARD_PROCESSING' ? (
              <Box textAlign="center" py={2}>
                <CircularProgress size={32} sx={{ color: GREEN_PRIMARY, mb: 2 }} />
                <Typography color="text.secondary">{PENDING_COPY[statusData.status]}</Typography>
              </Box>
            ) : null}

            {statusData.status === 'COMPLETED' && (
              <SubmissionResultState
                variant="approved"
                points={task.baseScore}
                onFindAnother={() => navigate('/all-tasks')}
              />
            )}

            {statusData.status === 'REJECTED' && (
              <SubmissionResultState
                variant="rejected"
                rejectionReason={statusData.rejectionReason}
                onRetry={handleRetry}
              />
            )}

            {statusData.status === 'COOLDOWN' && (
              <SubmissionResultState
                variant="cooldown"
                expiresAt={statusData.expiresAt}
                onFindAnother={() => navigate('/all-tasks')}
              />
            )}
          </Box>
        </Paper>
      </Container>
    </Box>
  );
}