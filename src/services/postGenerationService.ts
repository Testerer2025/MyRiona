import { GoogleGenerativeAI } from "@google/generative-ai";
import Post from "../models/Post";
import logger from "../config/logger";
import { geminiApiKeys } from "../secret";
import { themeManager, Theme } from "../config/themes";

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
   * Get last N posts from database - optionally filtered by theme
   */
  async getLastPosts(limit: number = 5, themeId?: string): Promise<string[]> {
    try {
      const query: any = { status: 'success' };
      
      // Theme-specific filtering
      if (themeId) {
        query.themeId = themeId;
        logger.info(`Filtering posts by themeId: ${themeId}`);
      }
      
      const posts = await Post.find(query)
        .sort({ postedAt: -1 })
        .limit(limit)
        .select('postText');
      
      const postTexts = posts.map(p => p.postText);
      logger.info(`Retrieved ${postTexts.length} previous posts${themeId ? ` for theme ${themeId}` : ''} for similarity check`);
      return postTexts;
    } catch (error) {
      logger.error('Error fetching last posts:', error);
      return [];
    }
  }

  /**
   * Perform similarity check with Gemini - structured analysis
   */
  async checkSimilarity(lastPosts: string[], themeName: string): Promise<{
    avoidPhrases: string[];
    avoidEmojiPatterns: string[];
    avoidStructures: string[];
    recommendation: string;
  }> {
    if (lastPosts.length === 0) {
      return {
        avoidPhrases: [],
        avoidEmojiPatterns: [],
        avoidStructures: [],
        recommendation: "Keine vorherigen Posts gefunden. Sei kreativ!"
      };
    }

    const prompt = `Du bist ein Instagram-Content-Analyst. Analysiere diese ${lastPosts.length} Posts für die PAPA Bar (Theme: ${themeName}).

Posts (neueste zuerst):
${lastPosts.map((post, i) => `${i + 1}. ${post}`).join('\n\n')}

Identifiziere Muster die VERMIEDEN werden sollten:
1. **Formulierungen** die zu oft verwendet werden (z.B. "Komm vorbei!", "Wer ist dabei?", "Lass den Tag ausklingen")
2. **Emoji-Kombinationen** die sich wiederholen (z.B. immer "🍺🎯" oder "☀️🍹")
3. **Post-Strukturen** die langweilig werden (z.B. immer "Frage → Info → CTA" oder immer gleicher Aufbau)

Gib dann eine konkrete, umsetzbare Empfehlung für Abwechslung im nächsten Post.

WICHTIG: 
- Sei spezifisch, nicht generisch
- Wenn Muster nicht deutlich sind, gib leere Arrays zurück
- Fokus auf wirklich auffällige Wiederholungen

Antworte NUR mit einem gültigen JSON-Objekt in diesem Format:
{
  "avoidPhrases": ["phrase1", "phrase2"],
  "avoidEmojiPatterns": ["🍺🎯", "☀️🍹"],
  "avoidStructures": ["Immer mit Frage beginnen", "Immer gleiche CTA"],
  "recommendation": "Konkrete Empfehlung für den nächsten Post"
}`;

    try {
      const googleAI = new GoogleGenerativeAI(this.getApiKey());
      const model = googleAI.getGenerativeModel({
        model: "gemini-2.0-flash-exp"
      });

      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      
      // Extract JSON from response (sometimes Gemini wraps it in markdown)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : responseText;
      const data = JSON.parse(jsonStr);

      logger.info(`Similarity check completed. Avoid phrases: ${data.avoidPhrases.length}, emoji patterns: ${data.avoidEmojiPatterns.length}`);
      logger.debug(`Recommendation: ${data.recommendation}`);
      
      return data;
    } catch (error: any) {
      if (error.message?.includes('429')) {
        this.rotateApiKey();
        return this.checkSimilarity(lastPosts, themeName); // Retry with new key
      }
      logger.error('Similarity check failed:', error);
      return {
        avoidPhrases: [],
        avoidEmojiPatterns: [],
        avoidStructures: [],
        recommendation: "Fehler bei der Analyse. Sei vorsichtig mit Wiederholungen."
      };
    }
  }

  /**
   * Generate post text with Gemini
   */
  async generatePostText(
    theme: Theme,
    promptText: string,
    similarityCheck: { 
      avoidPhrases: string[]; 
      avoidEmojiPatterns: string[]; 
      avoidStructures: string[];
      recommendation: string;
    }
  ): Promise<{ postText: string; hashtags: string[]; tone: string }> {
    const defaults = await themeManager.getDefaults();

    const prompt = `Erstelle einen Instagram-Post basierend auf:

THEMA: ${theme.name}
PROMPT: ${promptText}

WICHTIGE EINSCHRÄNKUNGEN:
- Maximal ${defaults.maxLength} Zeichen
- Sprache: ${defaults.language}
- ${defaults.includeHashtags ? `Genau ${defaults.hashtagCount} relevante Hashtags (ohne # Symbol)` : 'Keine Hashtags'}

VERMEIDUNGS-REGELN (aus Analyse vorheriger Posts):
${similarityCheck.avoidPhrases.length > 0 ? `- Vermeide diese Formulierungen: ${similarityCheck.avoidPhrases.join(', ')}` : ''}
${similarityCheck.avoidEmojiPatterns.length > 0 ? `- Vermeide diese Emoji-Muster: ${similarityCheck.avoidEmojiPatterns.join(', ')}` : ''}
${similarityCheck.avoidStructures.length > 0 ? `- Vermeide diese Strukturen: ${similarityCheck.avoidStructures.join(', ')}` : ''}
- Empfehlung: ${similarityCheck.recommendation}

STIL:
- Authentisch und natürlich
- Passend für eine lokale Bar in Dübi
- Einladend und freundlich
- Keine übertriebenen Emojis
- Variiere die Post-Struktur

Antworte NUR mit einem gültigen JSON-Objekt in diesem Format:
{
  "postText": "der post text",
  "hashtags": ["tag1", "tag2", "tag3"],
  "tone": "casual"
}`;

    try {
      const googleAI = new GoogleGenerativeAI(this.getApiKey());
      const model = googleAI.getGenerativeModel({
        model: "gemini-2.0-flash-exp"
      });

      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      
      // Extract JSON from response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : responseText;
      const data = JSON.parse(jsonStr);

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
    // 1. Get last 5 posts from SAME theme
    const lastPosts = await this.getLastPosts(5, theme.id);

    // 2. Check similarity with structured analysis
    const similarityResult = await this.checkSimilarity(lastPosts, theme.name);

    // 3. Generate post with avoidance rules
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