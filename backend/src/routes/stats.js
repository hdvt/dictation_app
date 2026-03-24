import express from 'express';
import UserProgress from '../models/UserProgress.js';
import ActivityLog from '../models/ActivityLog.js';
import Exercise from '../models/Exercise.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();
router.use(requireAuth);

// GET /api/stats/me  — overview stats + streak
router.get('/me', async (req, res, next) => {
  try {
    const userId = req.user._id;

    const [progressStats, activityStats] = await Promise.all([
      // Aggregate progress across all exercises
      UserProgress.aggregate([
        { $match: { userId } },
        {
          $group: {
            _id: null,
            totalExercises: { $sum: 1 },
            completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
            inProgress: { $sum: { $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0] } },
            totalPassed: { $sum: '$totalPassed' },
            totalTimeMs: { $sum: '$totalTimeMs' },
          },
        },
      ]),

      // Activity for streak calculation — last 365 days
      ActivityLog.find({
        userId,
        date: { $gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) },
      })
        .sort({ date: -1 })
        .select('date challengesPassed')
        .lean(),
    ]);

    const stats = progressStats[0] || {
      totalExercises: 0,
      completed: 0,
      inProgress: 0,
      totalPassed: 0,
      totalTimeMs: 0,
    };

    // Calculate current streak (consecutive days with activity)
    let streakDays = 0;
    if (activityStats.length > 0) {
      const activeDates = new Set(
        activityStats.map(a => a.date.toISOString().slice(0, 10))
      );
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);

      // Start from today or yesterday if today has no activity yet
      let check = new Date(today);
      const todayStr = check.toISOString().slice(0, 10);
      if (!activeDates.has(todayStr)) {
        check.setDate(check.getDate() - 1);
      }

      while (activeDates.has(check.toISOString().slice(0, 10))) {
        streakDays++;
        check.setDate(check.getDate() - 1);
      }
    }

    res.json({
      totalExercises: stats.totalExercises,
      completed: stats.completed,
      inProgress: stats.inProgress,
      totalPassed: stats.totalPassed,
      totalTimeMs: stats.totalTimeMs,
      streakDays,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/stats/me/activity?from=&to=  — daily activity for heatmap
router.get('/me/activity', async (req, res, next) => {
  try {
    const userId = req.user._id;
    const to = req.query.to ? new Date(req.query.to) : new Date();
    const from = req.query.from
      ? new Date(req.query.from)
      : new Date(Date.now() - 84 * 24 * 60 * 60 * 1000); // 12 weeks default

    to.setUTCHours(23, 59, 59, 999);
    from.setUTCHours(0, 0, 0, 0);

    const activity = await ActivityLog.aggregate([
      { $match: { userId, date: { $gte: from, $lte: to } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
          challengesPassed: { $sum: '$challengesPassed' },
          durationMs: { $sum: '$durationMs' },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json({ activity });
  } catch (err) {
    next(err);
  }
});

// GET /api/stats/me/exercises  — top exercises + recent activity
router.get('/me/exercises', async (req, res, next) => {
  try {
    const userId = req.user._id;

    const [topByTime, recentActivity] = await Promise.all([
      // Top exercises by total time
      UserProgress.find({ userId })
        .sort({ totalTimeMs: -1 })
        .limit(5)
        .populate('exerciseId', 'title thumbnailUrl youtubeVideoId')
        .lean(),

      // Recent activity log (last 20 entries)
      ActivityLog.find({ userId })
        .sort({ date: -1, _id: -1 })
        .limit(20)
        .populate('exerciseId', 'title thumbnailUrl youtubeVideoId')
        .lean(),
    ]);

    res.json({ topByTime, recentActivity });
  } catch (err) {
    next(err);
  }
});

export default router;
