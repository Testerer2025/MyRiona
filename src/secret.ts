import dotenv from 'dotenv';
dotenv.config();

export const IGusername = process.env.IGusername || '';
export const IGpassword = process.env.IGpassword || '';

// Gemini API Keys als Array
export const geminiApiKeys = [
    process.env.GEMINI_API_KEY_1 || '',
].filter(key => key !== '');

// MongoDB
export const MONGODB_URI = process.env.MONGODB_URI || '';