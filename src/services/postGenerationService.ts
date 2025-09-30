import { GoogleGenerativeAI } from "@google/generative-ai";
import Post from "../models/Post";
import logger from "../config/logger";
import { geminiApiKeys } from "../secret";
import { themeManager, Theme } from "../config/themes";
import { getPostGenerationSchema, getSimilarityCheckSchema } from "../Agent/schema/postSchema";

class PostGenerationService {
  private currentApiKeyIndex = 0;

  /**
   * Get next Gemini API key (with rotation on rate limits)
   */
  private getApiKey(): string {
    const key = geminiApiKeys[this.currentApiKeyIndex];
    if (!key) {
      throw new Error('No Gemini API key available');
    }
    return key;
  }

  /**
   * Rotate to next API key
   */
  private rotateApiKey(): void {
    this.currentApiKeyIndex = (this.currentApiKeyIndex + 1) % geminiApiKeys.length;
    logger.info(`Rotated to API key ${this.currentApiKeyIndex + 1}`);
  }

  /**
   * Get last N posts from database
   */
  async getLastPosts(limit: number = 25): Promise<string[]> {
    try {
      const posts = await Post.find({ status: 'success' })
        .sort({ postedAt: -1 })
        .limit(limit)
        .select('postText');
      
      const postTexts = posts.map(p => p.postText);
      logger.info(`Retrieved ${postTexts.length} previous posts for similarity check`);
      return postTexts;
    } catch (error) {
      logger.error('Error fetching last posts:', error);
      return [];
    }
  }

  /**
   * Perform similarity check with Gemini
   */
  async checkSimilarity(lastPosts: string[]): Promise<{
    avoidKeywords: string[];
    avoidThemes: string[];
    recommendation: string;
  }> {
    if (lastPosts.length === 0) {
      return {
        avoidKeywords: [],
        avoidThemes: [],
        recommendation: "No previous posts found. Feel free to be creative."
      };
    }

    const prompt = `Analysiere diese ${lastPosts.length} Instagram-Posts und identifiziere:
1. Häufig verwendete Keywords, die vermieden werden sollten
2. Wiederkehrende Themen, die vermieden werden sollten
3. Eine Empfehlung für einen neuen, frischen Ansatz

Posts:
${lastPosts.map((post, i) => `${i + 1}. ${post}`).join('\n\n')}

Gib eine strukturierte Analyse zurück.`;

    try {
      const googleAI = new GoogleGenerativeAI(this.getApiKey());
      const model = googleAI.getGenerativeModel({
        model: "gemini-2.0-flash-exp",
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: getSimilarityCheckSchema()
        }
      });

      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      const data = JSON.parse(responseText);

      logger.info(`Similarity check completed. Avoid keywords: ${data.avoidKeywords.join(', ')}`);
      return data;
    } catch (error: any) {
      if (error.message?.includes('429')) {
        this.rotateApiKey();
        return this.checkSimilarity(lastPosts); // Retry with new key
      }
      logger.error('Similarity check failed:', error);
      return {
        avoidKeywords: [],
        avoidThemes: [],
        recommendation: "Error during analysis. Proceed with caution."
      };
    }
  }

  /**
   * Generate post text with Gemini
   */
  async generatePostText(
    theme: Theme,
    promptText: string,
    similarityCheck: { avoidKeywords: string[]; avoidThemes: string[]; recommendation: string }
  ): Promise<{ postText: string; hashtags: string[]; tone: string }> {
    const defaults = await themeManager.getDefaults();

    const prompt = `Erstelle einen Instagram-Post basierend auf:

THEMA: ${theme.name}
PROMPT: ${promptText}

WICHTIGE EINSCHRÄNKUNGEN:
- Maximal ${defaults.maxLength} Zeichen
- Sprache: ${defaults.language}
- ${defaults.includeHashtags ? `Genau ${defaults.hashtagCount} relevante Hashtags (ohne # Symbol)` : 'Keine Hashtags'}
- Vermeide diese Keywords: ${similarityCheck.avoidKeywords.join(', ')}
- Vermeide diese Themen: ${similarityCheck.avoidThemes.join(', ')}
- Empfehlung: ${similarityCheck.recommendation}

STIL:
- Authentisch und natürlich
- Passend für eine lokale Bar in Dübi
- Einladend und freundlich
- Keine übertriebenen Emojis

Erstelle einen ansprechenden Post, der sich von vorherigen Posts abhebt.`;

    try {
      const googleAI = new GoogleGenerativeAI(this.getApiKey());
      const model = googleAI.getGenerativeModel({
        model: "gemini-2.0-flash-exp",
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: getPostGenerationSchema()
        }
      });

      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      const data = JSON.parse(responseText);

      logger.info(`Generated post text (${data.postText.length} chars): ${data.postText.substring(0, 50)}...`);
      return data;
    } catch (error: any) {
      if (error.message?.includes('429')) {
        this.rotateApiKey();
        return this.generatePostText(theme, promptText, similarityCheck); // Retry
      }
      logger.error('Post generation failed:', error);
      throw error;
    }
  }

  /**
   * Complete workflow: Check similarity and generate post
   */
  async generatePost(theme: Theme, promptText: string): Promise<{
    postText: string;
    hashtags: string[];
    tone: string;
    similarityCheck: string;
  }> {
    // 1. Get last posts
    const lastPosts = await this.getLastPosts(25);

    // 2. Check similarity
    const similarityResult = await this.checkSimilarity(lastPosts);

    // 3. Generate post
    const postData = await this.generatePostText(theme, promptText, similarityResult);

    // 4. Format final post text with hashtags
    const defaults = await themeManager.getDefaults();
    let finalText = postData.postText;
    
    if (defaults.includeHashtags && postData.hashtags.length > 0) {
      const hashtagString = postData.hashtags.map(tag => `#${tag}`).join(' ');
      finalText = `${postData.postText}\n\n${hashtagString}`;
    }

    return {
      postText: finalText,
      hashtags: postData.hashtags,
      tone: postData.tone,
      similarityCheck: JSON.stringify(similarityResult)
    };
  }
}

export const postGenerationService = new PostGenerationService();