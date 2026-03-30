import express from 'express';
import UserProgress from '../models/UserProgress.js';
import Exercise from '../models/Exercise.js';
import Challenge from '../models/Challenge.js';
import ActivityLog from '../models/ActivityLog.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();
router.use(requireAuth);

// Helper: get midnight UTC for today
function todayUTC() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

// Helper: upsert activity log entry for today
async function logActivity(userId, exerciseId, challengesPassed, durationMs) {
  const date = todayUTC();
  await ActivityLog.findOneAndUpdate(
    { userId, exerciseId, date },
    {
      $inc: { challengesPassed, durationMs },
    },
    { upsert: true }
  );
}

// GET /api/progress  — all exercises progress for current user
router.get('/', async (req, res, next) => {
  try {
    const progress = await UserProgress.find({ userId: req.user._id })
      .populate('exerciseId', 'title thumbnailUrl youtubeVideoId durationSeconds transcriptStatus')
      .sort({ lastActivityAt: -1 })
      .lean();
    res.json({ progress });
  } catch (err) {
    next(err);
  }
});

// GET /api/progress/:exerciseId
router.get('/:exerciseId', async (req, res, next) => {
  try {
    // Verify exercise belongs to user
    const exercise = await Exercise.findOne({
      _id: req.params.exerciseId,
      createdBy: req.user._id,
    });
    if (!exercise) return res.status(404).json({ error: 'Exercise not found' });

    const progress = await UserProgress.findOne({
      userId: req.user._id,
      exerciseId: req.params.exerciseId,
    }).lean();

    res.json({ progress: progress || null });
  } catch (err) {
    next(err);
  }
});

// POST /api/progress/:exerciseId/start  — begin or resume an exercise
router.post('/:exerciseId/start', async (req, res, next) => {
  try {
    const exercise = await Exercise.findOne({
      _id: req.params.exerciseId,
      createdBy: req.user._id,
    });
    if (!exercise) return res.status(404).json({ error: 'Exercise not found' });

    const now = new Date();
    const progress = await UserProgress.findOneAndUpdate(
      { userId: req.user._id, exerciseId: req.params.exerciseId },
      {
        $setOnInsert: { startedAt: now },
        $set: {
          status: 'in_progress',
          lastActivityAt: now,
        },
        $push: {
          sessions: {
            $each: [{ startedAt: now, endedAt: null, durationMs: 0, challengesPassed: 0 }],
            $slice: -50, // keep last 50 sessions
          },
        },
      },
      { upsert: true, new: true }
    );

    res.json({ progress });
  } catch (err) {
    next(err);
  }
});

// POST /api/progress/:exerciseId/pass  — record a passed challenge
router.post('/:exerciseId/pass', async (req, res, next) => {
  try {
    const { challengeId, currentChallengeIndex, attemptCount = 1, sessionDurationMs = 0 } = req.body;

    if (!challengeId) return res.status(400).json({ error: 'challengeId is required' });

    // Verify challenge belongs to exercise
    const challenge = await Challenge.findOne({
      _id: challengeId,
      exerciseId: req.params.exerciseId,
    });
    if (!challenge) return res.status(404).json({ error: 'Challenge not found' });

    const now = new Date();

    // Add challengeId to passedChallengeIds only if not already there
    const progress = await UserProgress.findOneAndUpdate(
      { userId: req.user._id, exerciseId: req.params.exerciseId },
      {
        $addToSet: { passedChallengeIds: challengeId },
        $set: {
          currentChallengeIndex: currentChallengeIndex ?? challenge.index,
          lastActivityAt: now,
          status: 'in_progress',
        },
        $inc: {
          totalAttempts: attemptCount,
          totalPassed: 1,
          totalTimeMs: sessionDurationMs,
          'sessions.$[last].challengesPassed': 1,
          'sessions.$[last].durationMs': sessionDurationMs,
        },
      },
      {
        new: true,
        arrayFilters: [{ 'last.endedAt': null }],
      }
    );

    // Log to activity (1 challenge passed today)
    await logActivity(req.user._id, req.params.exerciseId, 1, sessionDurationMs);

    res.json({ progress });
  } catch (err) {
    next(err);
  }
});

// POST /api/progress/:exerciseId/complete  — mark exercise as fully completed
router.post('/:exerciseId/complete', async (req, res, next) => {
  try {
    const now = new Date();
    const progress = await UserProgress.findOneAndUpdate(
      { userId: req.user._id, exerciseId: req.params.exerciseId },
      {
        $set: {
          status: 'completed',
          completedAt: now,
          lastActivityAt: now,
          'sessions.$[last].endedAt': now,
        },
      },
      {
        new: true,
        arrayFilters: [{ 'last.endedAt': null }],
      }
    );
    if (!progress) return res.status(404).json({ error: 'Progress not found' });
    res.json({ progress });
  } catch (err) {
    next(err);
  }
});

// POST /api/progress/:exerciseId/reset  — restart exercise from the beginning
router.post('/:exerciseId/reset', async (req, res, next) => {
  try {
    const now = new Date();
    const progress = await UserProgress.findOneAndUpdate(
      { userId: req.user._id, exerciseId: req.params.exerciseId },
      {
        $set: {
          status: 'not_started',
          currentChallengeIndex: 0,
          passedChallengeIds: [],
          completedAt: null,
          lastActivityAt: now,
          'sessions.$[last].endedAt': now,
        },
      },
      {
        new: true,
        arrayFilters: [{ 'last.endedAt': null }],
      }
    );
    res.json({ progress });
  } catch (err) {
    next(err);
  }
});

export default router;
