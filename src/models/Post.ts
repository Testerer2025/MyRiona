import mongoose, { Schema, Document } from 'mongoose';

// In src/models/Post.ts
// Füge NUR diese zwei Änderungen hinzu:

// 1. Im Interface IPost:
export interface IPost extends Document {
  theme: string;
  themeId: string;
  postText: string;
  imagePrompt: string;
  imageUrl?: string;
  similarityCheck?: string;
  weatherData?: string; // ← NEU: Nur diese Zeile hinzufügen
  postedAt: Date;
  status: 'success' | 'failed';
  errorMessage?: string;
}

// 2. Im PostSchema - nach similarityCheck einfügen:
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
  weatherData: {           // ← NEU: Nur diesen Block hinzufügen
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