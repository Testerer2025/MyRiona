import mongoose, { Schema, Document } from 'mongoose';

export interface IPost extends Document {
  theme: string;
  themeId: string;
  postText: string;
  imagePrompt: string;
  imageUrl?: string;
  similarityCheck?: string;
  postedAt: Date;
  status: 'success' | 'failed';
  errorMessage?: string;
}

const PostSchema: Schema = new Schema({
  theme: {
    type: String,
    required: true,
    index: true
  },
  themeId: {
    type: String,
    required: true,
    index: true
  },
  postText: {
    type: String,
    required: true
  },
  imagePrompt: {
    type: String,
    required: true
  },
  imageUrl: {
    type: String,
    required: false
  },
  similarityCheck: {
    type: String,
    required: false
  },
  postedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  status: {
    type: String,
    enum: ['success', 'failed'],
    default: 'success'
  },
  errorMessage: {
    type: String,
    required: false
  }
}, {
  timestamps: true
});

// Index für schnellere Abfragen der letzten Posts
PostSchema.index({ postedAt: -1 });

export default mongoose.model<IPost>('Post', PostSchema);