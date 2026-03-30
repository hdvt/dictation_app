import mongoose from 'mongoose';

const challengeSchema = new mongoose.Schema({
  exerciseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Exercise',
    required: true,
    index: true,
  },
  index: {
    type: Number,
    required: true,
  },
  content: {
    type: String,
    required: true,
  },
  timeStart: {
    type: Number,
    required: true,
  },
  timeEnd: {
    type: Number,
    required: true,
  },
  hint: { type: String, default: '' },
}, { timestamps: false });

challengeSchema.index({ exerciseId: 1, index: 1 });

export default mongoose.model('Challenge', challengeSchema);
