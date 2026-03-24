import express from 'express';
import Exercise from '../models/Exercise.js';
import Challenge from '../models/Challenge.js';
import UserProgress from '../models/UserProgress.js';
import { requireAuth } from '../middleware/auth.js';
import { extractVideoId, processTranscript } from '../services/YouTubeTranscriptService.js';

const router = express.Router();

// All exercise routes require auth — exercises are private per user
router.use(requireAuth);

// GET /api/exercises  — list current user's exercises with their progress
router.get('/', async (req, res, next) => {
  try {
    const { status, search, page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const filter = { createdBy: req.user._id };
    if (search) filter.title = { $regex: search, $options: 'i' };

    const [exercises, total] = await Promise.all([
      Exercise.find(filter)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      Exercise.countDocuments(filter),
    ]);

    // Attach progress to each exercise
    const exerciseIds = exercises.map(e => e._id);
    const progressList = await UserProgress.find({
      userId: req.user._id,
      exerciseId: { $in: exerciseIds },
    }).lean();

    const progressMap = {};
    for (const p of progressList) {
      progressMap[String(p.exerciseId)] = p;
    }

    // Get challenge counts
    const counts = await Challenge.aggregate([
      { $match: { exerciseId: { $in: exerciseIds } } },
      { $group: { _id: '$exerciseId', total: { $sum: 1 } } },
    ]);
    const countMap = {};
    for (const c of counts) countMap[String(c._id)] = c.total;

    const result = exercises.map(ex => {
      const prog = progressMap[String(ex._id)];
      const total = countMap[String(ex._id)] || 0;
      return {
        ...ex,
        progress: prog ? {
          status: prog.status,
          currentChallengeIndex: prog.currentChallengeIndex,
          passedCount: prog.passedChallengeIds.length,
          totalChallenges: total,
          lastActivityAt: prog.lastActivityAt,
        } : {
          status: 'not_started',
          currentChallengeIndex: 0,
          passedCount: 0,
          totalChallenges: total,
          lastActivityAt: null,
        },
      };
    });

    // Filter by progress status if requested
    const filtered = status
      ? result.filter(ex => ex.progress.status === status)
      : result;

    res.json({ exercises: filtered, total: filtered.length, page: Number(page) });
  } catch (err) {
    next(err);
  }
});

// GET /api/exercises/:id  — get one exercise + its challenges
router.get('/:id', async (req, res, next) => {
  try {
    const exercise = await Exercise.findOne({
      _id: req.params.id,
      createdBy: req.user._id,
    });
    if (!exercise) return res.status(404).json({ error: 'Exercise not found' });

    const challenges = await Challenge.find({ exerciseId: exercise._id })
      .sort({ index: 1 })
      .lean();

    const progress = await UserProgress.findOne({
      userId: req.user._id,
      exerciseId: exercise._id,
    }).lean();

    res.json({
      exercise,
      challenges,
      progress: progress || null,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/exercises/:id/status  — poll transcript processing status
router.get('/:id/status', async (req, res, next) => {
  try {
    const exercise = await Exercise.findOne({
      _id: req.params.id,
      createdBy: req.user._id,
    }).select('transcriptStatus transcriptError title thumbnailUrl');
    if (!exercise) return res.status(404).json({ error: 'Exercise not found' });

    const challengeCount = exercise.transcriptStatus === 'ready'
      ? await Challenge.countDocuments({ exerciseId: exercise._id })
      : 0;

    res.json({
      status: exercise.transcriptStatus,
      error: exercise.transcriptError,
      title: exercise.title,
      thumbnailUrl: exercise.thumbnailUrl,
      challengeCount,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/exercises  — add exercise by YouTube URL
router.post('/', async (req, res, next) => {
  try {
    const { youtubeUrl, title, difficulty, language } = req.body;
    if (!youtubeUrl) return res.status(400).json({ error: 'youtubeUrl is required' });

    const videoId = extractVideoId(youtubeUrl);
    if (!videoId) return res.status(400).json({ error: 'Could not extract a valid YouTube video ID' });

    // Check if this user already has this exercise
    const existing = await Exercise.findOne({
      createdBy: req.user._id,
      youtubeVideoId: videoId,
    });
    if (existing) {
      return res.status(409).json({
        error: 'You already have this video in your library',
        exerciseId: existing._id,
      });
    }

    const exercise = await Exercise.create({
      youtubeVideoId: videoId,
      title: title || '',
      difficulty: difficulty || 'intermediate',
      language: language || 'en',
      createdBy: req.user._id,
      thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      transcriptStatus: 'pending',
    });

    // Fire and forget — client polls /status
    processTranscript(exercise._id).catch(err =>
      console.error('Background transcript error:', err)
    );

    res.status(201).json({ exercise });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/exercises/:id  — update metadata
router.patch('/:id', async (req, res, next) => {
  try {
    const allowed = ['title', 'difficulty', 'language', 'tags', 'description'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    const exercise = await Exercise.findOneAndUpdate(
      { _id: req.params.id, createdBy: req.user._id },
      { $set: updates },
      { new: true }
    );
    if (!exercise) return res.status(404).json({ error: 'Exercise not found' });
    res.json({ exercise });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/exercises/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const exercise = await Exercise.findOneAndDelete({
      _id: req.params.id,
      createdBy: req.user._id,
    });
    if (!exercise) return res.status(404).json({ error: 'Exercise not found' });

    await Promise.all([
      Challenge.deleteMany({ exerciseId: exercise._id }),
      UserProgress.deleteMany({ exerciseId: exercise._id }),
    ]);

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// POST /api/exercises/:id/retry-transcript  — re-run failed transcript
router.post('/:id/retry-transcript', async (req, res, next) => {
  try {
    const exercise = await Exercise.findOne({
      _id: req.params.id,
      createdBy: req.user._id,
    });
    if (!exercise) return res.status(404).json({ error: 'Exercise not found' });
    if (exercise.transcriptStatus === 'processing') {
      return res.status(409).json({ error: 'Already processing' });
    }

    exercise.transcriptStatus = 'pending';
    exercise.transcriptError = null;
    await exercise.save();

    processTranscript(exercise._id).catch(() => {});
    res.json({ message: 'Transcript re-processing started' });
  } catch (err) {
    next(err);
  }
});

export default router;
