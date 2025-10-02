import mongoose, { Schema, Document } from 'mongoose';

export interface IErrorLog extends Document {
  errorType: 'image_generation' | 'instagram_login' | 'instagram_posting' | 'post_generation' | 'other';
  errorMessage: string;
  errorStack?: string;
  context?: {
    themeId?: string;
    themeName?: string;
    prompt?: string;
    referenceImage?: string;
    attemptNumber?: number;
    postId?: string;
  };
  timestamp: Date;
  resolved: boolean;
}

const ErrorLogSchema: Schema = new Schema({
  errorType: {
    type: String,
    enum: ['image_generation', 'instagram_login', 'instagram_posting', 'post_generation', 'other'],
    required: true
  },
  errorMessage: {
    type: String,
    required: true
  },
  errorStack: {
    type: String
  },
  context: {
    themeId: String,
    themeName: String,
    prompt: String,
    referenceImage: String,
    attemptNumber: Number,
    postId: String
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  resolved: {
    type: Boolean,
    default: false
  }
});

// Index for querying recent errors
ErrorLogSchema.index({ timestamp: -1 });
ErrorLogSchema.index({ errorType: 1, timestamp: -1 });

export default mongoose.model<IErrorLog>('ErrorLog', ErrorLogSchema);