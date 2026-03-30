import mongoose from 'mongoose';

const activityLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  // Stored as midnight UTC of the day
  date: {
    type: Date,
    required: true,
  },
  exerciseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Exercise',
  },
  challengesPassed: { type: Number, default: 0 },
  durationMs: { type: Number, default: 0 },
}, { timestamps: false });

activityLogSchema.index({ userId: 1, date: -1 });

export default mongoose.model('ActivityLog', activityLogSchema);
