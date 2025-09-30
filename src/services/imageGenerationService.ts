import { GoogleGenerativeAI } from "@google/generative-ai";
import { geminiApiKeys } from "../secret";
import logger from "../config/logger";
import fs from "fs/promises";
import path from "path";

class ImageGenerationService {
  private currentApiKeyIndex = 0;

  private getApiKey(): string {
    const key = geminiApiKeys[this.currentApiKeyIndex];
    if (!key) {
      throw new Error('No Gemini API key available');
    }
    return key;
  }

  private rotateApiKey(): void {
    this.currentApiKeyIndex = (this.currentApiKeyIndex + 1) % geminiApiKeys.length;
    logger.info(`Rotated to API key ${this.currentApiKeyIndex + 1}`);
  }

  async generateImage(prompt: string): Promise<Buffer> {
    try {
      const googleAI = new GoogleGenerativeAI(this.getApiKey());
      
      // Try the model name from Python SDK
      const model = googleAI.getGenerativeModel({ 
        model: "gemini-2.5-flash-image-preview" 
      });

      logger.info(`Generating image: ${prompt.substring(0, 100)}...`);

      const result = await model.generateContent(prompt);
      const response = result.response;
      
      // Check for image in response
      if (response.candidates && response.candidates[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData?.data) {
            const imageBuffer = Buffer.from(part.inlineData.data, 'base64');
            logger.info(`Image generated: ${imageBuffer.length} bytes`);
            return imageBuffer;
          }
        }
      }

      throw new Error('No image data in response');
    } catch (error: any) {
      logger.error('Image generation failed:', error);
      
      // If model not found, try alternative
      if (error.message?.includes('not found') || error.message?.includes('does not exist')) {
        logger.warn('Model gemini-2.5-flash-image-preview not available, trying gemini-exp-1206');
        return this.generateImageFallback(prompt);
      }
      
      if (error.message?.includes('429')) {
        this.rotateApiKey();
        return this.generateImage(prompt);
      }
      throw error;
    }
  }

  private async generateImageFallback(prompt: string): Promise<Buffer> {
    const googleAI = new GoogleGenerativeAI(this.getApiKey());
    const model = googleAI.getGenerativeModel({ model: "gemini-exp-1206" });

    const result = await model.generateContent(prompt);
    const response = result.response;
    
    if (response.candidates && response.candidates[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData?.data) {
          return Buffer.from(part.inlineData.data, 'base64');
        }
      }
    }

    throw new Error('No image data in response');
  }

  async saveImageToTemp(imageBuffer: Buffer, filename: string = 'post-image.jpg'): Promise<string> {
    const tempDir = '/tmp';
    const filePath = path.join(tempDir, filename);
    await fs.writeFile(filePath, imageBuffer);
    logger.info(`Image saved: ${filePath}`);
    return filePath;
  }
}

export const imageGenerationService = new ImageGenerationService();