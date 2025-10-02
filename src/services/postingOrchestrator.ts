import { themeService } from './themeService';
import { postGenerationService } from './postGenerationService';
import { imageGenerationService } from './imageGenerationService';
import { instagramPostService } from './instagramPostService';
import { weatherService } from './weatherService'; 
import Post from '../models/Post';
import logger from '../config/logger';
import { Types } from 'mongoose';


class PostingOrchestrator {
  /**
   * Main posting workflow - orchestrates the entire process
   */
  async executePost(): Promise<{ success: boolean; postId?: string; error?: string }> {
    let selectedTheme;
    let postText;
    let imagePath;
    let weatherData = undefined; // ← NEU

    try {
      logger.info('=== Starting new post creation ===');

      // 1. Validate theme configuration
      const isValid = await themeService.validateConfiguration();
      if (!isValid) {
        throw new Error('Theme configuration validation failed');
      }

      // 2. Select random theme based on weights
      selectedTheme = await themeService.selectRandomTheme();
      logger.info(`Selected theme: ${selectedTheme.name} (${selectedTheme.id})`);

      // ============ NEU: Weather Check ============
      let promptText;
      let imagePrompt;
      let referenceImage;

      // Check if theme is weather_post
      if (selectedTheme.id === 'weather_post') {
        logger.info('Weather theme detected - fetching current weather...');
        
        try {
          weatherData = await weatherService.getCurrentWeather();
          logger.info(`Weather condition: ${weatherData.condition} (${weatherData.description})`);

          // Get weather-specific prompt file
          const promptFileName = weatherData.condition === 'good' 
            ? selectedTheme.promptFile_good_weather 
            : selectedTheme.promptFile_bad_weather;

          if (!promptFileName) {
            throw new Error(`No weather prompt file defined for condition: ${weatherData.condition}`);
          }

          // Load prompt text and inject weather data
          const themeWithPrompt = await themeService.getThemeWithPrompt(selectedTheme.id, promptFileName);
          promptText = themeWithPrompt.promptText
            .replace('{{weatherDescription}}', weatherData.description)
            .replace('{{temperature}}', weatherData.temperature.toString());

          logger.info(`Loaded weather-specific prompt: ${promptFileName}`);

          // Get weather-specific image config
          imagePrompt = weatherData.condition === 'good'
            ? selectedTheme.image.prompt_good_weather
            : selectedTheme.image.prompt_bad_weather;

          const referenceImages = weatherData.condition === 'good'
            ? selectedTheme.image.referenceImage_good_weather
            : selectedTheme.image.referenceImage_bad_weather;

          // Select random reference image if array
          if (Array.isArray(referenceImages) && referenceImages.length > 0) {
            referenceImage = referenceImages[Math.floor(Math.random() * referenceImages.length)];
          } else {
            referenceImage = referenceImages;
          }

          logger.info(`Using weather-specific image config for ${weatherData.condition} weather`);

        } catch (weatherError: any) {
          logger.error('Failed to fetch weather data:', weatherError);
          throw new Error(`Weather fetch failed: ${weatherError.message}`);
        }

      } else {
        // Normal theme (non-weather)
        const themeWithPrompt = await themeService.getThemeWithPrompt(selectedTheme.id);
        promptText = themeWithPrompt.promptText;
        logger.info(`Loaded prompt for theme: ${selectedTheme.name}`);
      }
      // ============ END Weather Check ============

      // 4. Generate post text (with similarity check)
      logger.info('Generating post text with Gemini...');
      const postData = await postGenerationService.generatePost(selectedTheme, promptText);
      postText = postData.postText;

      logger.info(`Generated post text (${postText.length} chars)`);
      logger.debug(`Post text: ${postText.substring(0, 100)}...`);

      // 5. Generate image with Gemini Image (with optional reference image and retry logic)
      logger.info('Generating image with Gemini Flash...');
      
      // Use weather-specific imagePrompt if available, otherwise build from theme
      if (!imagePrompt) {
        imagePrompt = this.buildImagePrompt(selectedTheme, postText);
      }
      
      // Use weather-specific referenceImage if available, otherwise get from theme
      if (!referenceImage) {
        referenceImage = this.getReferenceImage(selectedTheme);
      }
      
      // Pass theme context for error logging
      const themeContext = {
        themeId: selectedTheme.id,
        themeName: selectedTheme.name
      };
      
      const imageBuffer = await imageGenerationService.generateImage(
        imagePrompt, 
        referenceImage,
        themeContext
      );
      
      // Save image temporarily
      const timestamp = Date.now();
      const filename = `post-${selectedTheme.id}-${timestamp}.jpg`;
      imagePath = await imageGenerationService.saveImageToTemp(imageBuffer, filename);
      logger.info(`Image generated and saved: ${imagePath}`);

      // 6. Post to Instagram
      logger.info('Posting to Instagram...');
      const postSuccess = await instagramPostService.postToInstagram(imagePath, postText);

      if (!postSuccess) {
        throw new Error('Instagram post upload returned false');
      }

      logger.info('Post uploaded to Instagram successfully!');

      // 7. Save to database
      const postDoc = new Post({
        theme: selectedTheme.name,
        themeId: selectedTheme.id,
        postText: postText,
        imagePrompt: imagePrompt,
        imageUrl: imagePath,
        similarityCheck: postData.similarityCheck,
        weatherData: weatherData ? JSON.stringify(weatherData) : undefined, // ← NEU
        postedAt: new Date(),
        status: 'success'
      });

      await postDoc.save();
      logger.info(`Post saved to database with ID: ${postDoc._id}`);

      // 8. Cleanup temp image (optional)
      await this.cleanupTempImage(imagePath);

      logger.info('=== Post creation completed successfully ===');

      return {
        success: true,
        postId: postDoc._id instanceof Types.ObjectId ? postDoc._id.toString() : String(postDoc._id)
      };

    } catch (error: any) {
      logger.error('Post creation failed:', error);

      // Try to save failed attempt to database
      try {
        const failedPost = new Post({
          theme: selectedTheme?.name || 'unknown',
          themeId: selectedTheme?.id || 'unknown',
          postText: postText || 'Generation failed',
          imagePrompt: 'Generation failed',
          weatherData: weatherData ? JSON.stringify(weatherData) : undefined, // ← NEU
          postedAt: new Date(),
          status: 'failed',
          errorMessage: error.message || 'Unknown error'
        });

        await failedPost.save();
        logger.info('Failed post attempt saved to database');
      } catch (dbError) {
        logger.error('Failed to save error to database:', dbError);
      }

      return {
        success: false,
        error: error.message || 'Unknown error occurred'
      };
    }
  }

  /**
   * Execute post with backup fallback
   */
  async executePostWithFallback(): Promise<{ success: boolean; postId?: string; error?: string }> {
    const result = await this.executePost();

    // If post failed, try with backup post
    if (!result.success) {
      logger.warn('Primary post failed, attempting backup post...');
      
      try {
        const backupPostText = await themeService.getRandomBackupPost();
        logger.info('Using backup post text');

        // Generate a simple image for backup (without reference image)
        const backupImagePrompt = 'Eine gemütliche Bar-Atmosphäre mit warmer Beleuchtung, Dartscheibe und Drinks';
        const imageBuffer = await imageGenerationService.generateImage(backupImagePrompt, undefined);
        const imagePath = await imageGenerationService.saveImageToTemp(imageBuffer, 'backup-post.jpg');

        // Post to Instagram
        const postSuccess = await instagramPostService.postToInstagram(imagePath, backupPostText);

        if (postSuccess) {
          // Save to database
          const postDoc = new Post({
            theme: 'Backup Post',
            themeId: 'backup',
            postText: backupPostText,
            imagePrompt: backupImagePrompt,
            imageUrl: imagePath,
            postedAt: new Date(),
            status: 'success'
          });

          await postDoc.save();
          logger.info('Backup post uploaded successfully');

          await this.cleanupTempImage(imagePath);

          return {
            success: true,
            postId: postDoc._id instanceof Types.ObjectId ? postDoc._id.toString() : String(postDoc._id)
          };
        }
      } catch (backupError: any) {
        logger.error('Backup post also failed:', backupError);
        return {
          success: false,
          error: `Primary and backup posts failed: ${backupError.message}`
        };
      }
    }

    return result;
  }

  /**
   * Build image prompt from theme config and post text
   */
  private buildImagePrompt(theme: any, postText: string): string {
    const imageConfig = theme.image;

    if (!imageConfig) {
      return 'Eine gemütliche Bar-Atmosphäre mit warmer Beleuchtung';
    }

    let prompt = imageConfig.prompt;

    // If usePostingText is true, append the post text to the image prompt
    if (imageConfig.usePostingText) {
      // Clean post text (remove hashtags and emojis)
      const cleanText = postText
        .replace(/#\w+/g, '')
        .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')
        .trim()
        .substring(0, 200);
      
      prompt += `\n\nKontext: ${cleanText}`;
    }

    // Add details if available
    if (imageConfig.details) {
      prompt += `\n\nDetails: ${imageConfig.details}`;
    }

    return prompt;
  }

  /**
   * Get reference image(s) from theme config
   */
  private getReferenceImage(theme: any): string | string[] | undefined {
    return theme.image?.referenceImage;
  }

  /**
   * Clean up temporary image file
   */
  private async cleanupTempImage(imagePath: string): Promise<void> {
    try {
      const fs = await import('fs/promises');
      await fs.unlink(imagePath);
      logger.debug(`Cleaned up temp image: ${imagePath}`);
    } catch (error) {
      logger.debug('Failed to cleanup temp image (non-critical):', error);
    }
  }

  /**
   * Get statistics about recent posts
   */
  async getPostStats(): Promise<{
    totalPosts: number;
    successfulPosts: number;
    failedPosts: number;
    lastPost: Date | null;
  }> {
    try {
      const totalPosts = await Post.countDocuments();
      const successfulPosts = await Post.countDocuments({ status: 'success' });
      const failedPosts = await Post.countDocuments({ status: 'failed' });

      const lastPostDoc = await Post.findOne().sort({ postedAt: -1 });
      const lastPost = lastPostDoc ? lastPostDoc.postedAt : null;

      return {
        totalPosts,
        successfulPosts,
        failedPosts,
        lastPost
      };
    } catch (error) {
      logger.error('Error fetching post stats:', error);
      throw error;
    }
  }
}

export const postingOrchestrator = new PostingOrchestrator();