import { GoogleGenerativeAI } from "@google/generative-ai";
import { geminiApiKeys } from "../secret";
import logger from "../config/logger";
import fs from "fs/promises";
import path from "path";
import ErrorLog from "../models/ErrorLog";

class ImageGenerationService {
  private currentApiKeyIndex = 0;
  // Path works for both dev (ts-node) and production (compiled js)
  private referenceImagesDir = (() => {
    const buildPath = path.join(__dirname, '../config/reference-images');
    return buildPath;
  })();

  private readonly MAX_RETRIES = 3; // Total attempts: 3

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

  /**
   * Log error to database
   */
  private async logError(
    errorMessage: string,
    errorStack: string | undefined,
    context: any,
    attemptNumber: number
  ): Promise<void> {
    try {
      await ErrorLog.create({
        errorType: 'image_generation',
        errorMessage,
        errorStack,
        context: {
          ...context,
          attemptNumber
        },
        timestamp: new Date(),
        resolved: false
      });
      logger.info('Error logged to database');
    } catch (dbError) {
      logger.error('Failed to log error to database:', dbError);
    }
  }

  /**
   * Select random reference image from array or return single image
   */
  private selectReferenceImage(referenceImage: string | string[] | undefined): string | undefined {
    if (!referenceImage) return undefined;

    if (typeof referenceImage === 'string') {
      return referenceImage;
    }

    if (Array.isArray(referenceImage) && referenceImage.length > 0) {
      const selected = referenceImage[Math.floor(Math.random() * referenceImage.length)];
      logger.info(`Selected reference image: ${selected} (from ${referenceImage.length} options)`);
      return selected;
    }

    return undefined;
  }

  /**
   * Load reference image and convert to base64
   */
  private async loadReferenceImage(filename: string): Promise<{ data: string; mimeType: string } | null> {
    try {
      const imagePath = path.join(this.referenceImagesDir, filename);
      
      // Check if file exists
      await fs.access(imagePath);
      
      // Read file
      const imageBuffer = await fs.readFile(imagePath);
      
      // Determine mime type from extension
      const ext = path.extname(filename).toLowerCase();
      const mimeTypeMap: { [key: string]: string } = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.webp': 'image/webp',
        '.gif': 'image/gif'
      };
      
      const mimeType = mimeTypeMap[ext] || 'image/jpeg';
      
      logger.info(`Loaded reference image: ${filename} (${imageBuffer.length} bytes, ${mimeType})`);
      
      return {
        data: imageBuffer.toString('base64'),
        mimeType
      };
      
    } catch (error: any) {
      logger.error(`Failed to load reference image: ${filename}`, error);
      return null;
    }
  }

  /**
   * Generate image with retry logic (3 attempts)
   */
  async generateImage(
    prompt: string, 
    referenceImage?: string | string[],
    themeContext?: { themeId: string; themeName: string }
  ): Promise<Buffer> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        logger.info(`Image generation attempt ${attempt}/${this.MAX_RETRIES}`);
        
        const imageBuffer = await this.generateImageAttempt(prompt, referenceImage);
        
        if (attempt > 1) {
          logger.info(`✅ Image generation succeeded on attempt ${attempt}`);
        }
        
        return imageBuffer;

      } catch (error: any) {
        lastError = error;
        logger.error(`Image generation attempt ${attempt}/${this.MAX_RETRIES} failed:`, error.message);

        // Log error to database
        const selectedRef = this.selectReferenceImage(referenceImage);
        await this.logError(
          error.message || 'Unknown error',
          error.stack,
          {
            prompt: prompt.substring(0, 200),
            referenceImage: selectedRef,
            themeId: themeContext?.themeId,
            themeName: themeContext?.themeName
          },
          attempt
        );

        // If this was the last attempt, throw error
        if (attempt === this.MAX_RETRIES) {
          logger.error(`❌ Image generation failed after ${this.MAX_RETRIES} attempts`);
          throw new Error(`Image generation failed after ${this.MAX_RETRIES} attempts: ${error.message}`);
        }

        // Wait before retry (exponential backoff)
        const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        logger.info(`Waiting ${waitTime}ms before retry...`);
        await this.delay(waitTime);

        // Try rotating API key if rate limited
        if (error.message?.includes('429')) {
          this.rotateApiKey();
        }
      }
    }

    // This should never be reached, but TypeScript needs it
    throw lastError || new Error('Image generation failed');
  }

  /**
   * Single image generation attempt
   */
  private async generateImageAttempt(
    prompt: string,
    referenceImage?: string | string[]
  ): Promise<Buffer> {
    const googleAI = new GoogleGenerativeAI(this.getApiKey());
    const model = googleAI.getGenerativeModel({ 
      model: "gemini-2.5-flash-image-preview" 
    });

    // Select reference image (if multiple provided)
    const selectedRef = this.selectReferenceImage(referenceImage);
    
    let parts: any[] = [];

    // Add reference image if provided
    if (selectedRef) {
      const refImageData = await this.loadReferenceImage(selectedRef);
      
      if (refImageData) {
        logger.info(`Using reference image: ${selectedRef}`);
        
        parts.push({
          inlineData: {
            data: refImageData.data,
            mimeType: refImageData.mimeType
          }
        });
        
        parts.push({
          text: `Using the provided reference image as style and composition guide, create a new image with the following description:\n\n${prompt}\n\nIMPORTANT: Use the reference image's style, lighting, and atmosphere, but create a NEW scene matching the description above. Do not copy the reference image exactly.`
        });
      } else {
        logger.warn(`Reference image not found, generating without reference: ${selectedRef}`);
        parts.push({ text: prompt });
      }
    } else {
      parts.push({ text: prompt });
    }

    logger.info(`Generating image: ${prompt.substring(0, 100)}...`);

    const result = await model.generateContent(parts);
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
  }

  /**
   * Save image to temp directory
   */
  async saveImageToTemp(imageBuffer: Buffer, filename: string = 'post-image.jpg'): Promise<string> {
    const tempDir = '/tmp';
    const filePath = path.join(tempDir, filename);
    await fs.writeFile(filePath, imageBuffer);
    logger.info(`Image saved: ${filePath}`);
    return filePath;
  }

  /**
   * Verify reference images directory exists
   */
  async verifyReferenceImagesDir(): Promise<void> {
    try {
      await fs.access(this.referenceImagesDir);
      logger.info(`Reference images directory found: ${this.referenceImagesDir}`);
    } catch {
      logger.warn(`Reference images directory not found: ${this.referenceImagesDir}`);
      logger.warn('Reference images feature will not work until directory is created');
    }
  }

  /**
   * Delay utility
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const imageGenerationService = new ImageGenerationService();

// Verify reference images directory on service load
imageGenerationService.verifyReferenceImagesDir().catch(err => 
  logger.warn('Could not verify reference images directory:', err)
);