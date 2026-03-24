import mongoose from 'mongoose';

const exerciseSchema = new mongoose.Schema({
  youtubeVideoId: {
    type: String,
    required: true,
  },
  title: { type: String, default: '' },
  description: { type: String, default: '' },
  thumbnailUrl: { type: String, default: '' },
  channelName: { type: String, default: '' },
  durationSeconds: { type: Number, default: 0 },
  language: { type: String, default: 'en' },
  difficulty: {
    type: String,
    enum: ['beginner', 'intermediate', 'advanced'],
    default: 'intermediate',
  },
  tags: [String],

  // Each exercise is private to the user who created it
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },

  transcriptStatus: {
    type: String,
    enum: ['pending', 'processing', 'ready', 'failed'],
    default: 'pending',
  },
  transcriptError: { type: String, default: null },
}, { timestamps: true });

// One user cannot have two exercises with the same video
exerciseSchema.index({ createdBy: 1, youtubeVideoId: 1 }, { unique: true });

export default mongoose.model('Exercise', exerciseSchema);
