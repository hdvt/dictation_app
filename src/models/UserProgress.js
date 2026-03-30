import mongoose from 'mongoose';

const sessionSchema = new mongoose.Schema({
  startedAt: Date,
  endedAt: Date,
  durationMs: { type: Number, default: 0 },
  challengesPassed: { type: Number, default: 0 },
}, { _id: false });

const userProgressSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  exerciseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Exercise',
    required: true,
  },

  status: {
    type: String,
    enum: ['not_started', 'in_progress', 'completed'],
    default: 'not_started',
  },
  startedAt: Date,
  completedAt: Date,
  lastActivityAt: Date,

  // Current position in the exercise
  currentChallengeIndex: { type: Number, default: 0 },

  // IDs of challenges the user has passed at least once
  passedChallengeIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Challenge',
  }],

  // Session history (last 50 sessions kept)
  sessions: {
    type: [sessionSchema],
    default: [],
  },

  // Cumulative totals
  totalTimeMs: { type: Number, default: 0 },
  totalAttempts: { type: Number, default: 0 },
  totalPassed: { type: Number, default: 0 },
}, { timestamps: true });

userProgressSchema.index({ userId: 1, exerciseId: 1 }, { unique: true });
userProgressSchema.index({ userId: 1, lastActivityAt: -1 });

export default mongoose.model('UserProgress', userProgressSchema);
