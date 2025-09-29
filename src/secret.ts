import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { Request } from 'express';

dotenv.config();

// Instagram
export const IGusername = process.env.IGusername || '';
export const IGpassword = process.env.IGpassword || '';

// Twitter API Credentials
export const TWITTER_API_CREDENTIALS = {
    appKey: process.env.TWITTER_API_KEY || '',
    appSecret: process.env.TWITTER_API_SECRET || '',
    accessToken: process.env.TWITTER_ACCESS_TOKEN || '',
    accessTokenSecret: process.env.TWITTER_ACCESS_SECRET || '',
    bearerToken: process.env.TWITTER_BEARER_TOKEN || ''
};

// Gemini API Keys
export const geminiApiKeys = [
    process.env.GEMINI_API_KEY_1 || '',
].filter(key => key !== '');

// MongoDB
export const MONGODB_URI = process.env.MONGODB_URI || '';

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey';

// JWT Functions
export const signToken = (payload: any): string => {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '2h' });
};

export const verifyToken = (token: string): any => {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (error) {
        return null;
    }
};

export const getTokenFromRequest = (req: Request): string | null => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return authHeader.substring(7);
    }
    return null;
};