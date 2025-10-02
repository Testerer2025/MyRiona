import { themeManager, Theme } from '../config/themes';
import logger from '../config/logger';

/**
 * Service for theme selection with weighted randomization
 */
class ThemeService {
  /**
   * Select a random theme based on weights
   * Higher weight = higher probability of being selected
   */
  async selectRandomTheme(): Promise<Theme> {
    const enabledThemes = await themeManager.getEnabledThemes();

    if (enabledThemes.length === 0) {
      throw new Error('No enabled themes available');
    }

    // Calculate total weight
    const totalWeight = enabledThemes.reduce((sum, theme) => sum + theme.weight, 0);

    if (totalWeight === 0) {
      // If all weights are 0, select randomly with equal probability
      const randomIndex = Math.floor(Math.random() * enabledThemes.length);
      const selected = enabledThemes[randomIndex];
      logger.info(`Selected theme (equal probability): ${selected.name} (${selected.id})`);
      return selected;
    }

    // Generate random number between 0 and totalWeight
    let random = Math.random() * totalWeight;

    // Select theme based on weight
    for (const theme of enabledThemes) {
      random -= theme.weight;
      if (random <= 0) {
        logger.info(`Selected theme (weighted): ${theme.name} (${theme.id}) - weight: ${theme.weight}`);
        return theme;
      }
    }

    // Fallback (should never reach here)
    const fallback = enabledThemes[0];
    logger.warn('Weighted selection fallback triggered, using first theme');
    return fallback;
  }

  /**
   * Get theme with its prompt text loaded
   * @param themeId - The theme ID
   * @param customPromptFile - Optional custom prompt file (for weather-specific prompts)
   */
  async getThemeWithPrompt(
    themeId: string, 
    customPromptFile?: string
  ): Promise<{ theme: Theme; promptText: string }> {
    const theme = await themeManager.getThemeById(themeId);
    
    if (!theme) {
      throw new Error(`Theme not found: ${themeId}`);
    }

    if (!theme.enabled) {
      throw new Error(`Theme is disabled: ${themeId}`);
    }

    // Use custom prompt file if provided (for weather posts), otherwise use theme's default
    const promptFile = customPromptFile || theme.promptFile;

    if (!promptFile) {
      throw new Error(`No prompt file available for theme: ${themeId}`);
    }

    const promptText = await themeManager.loadPrompt(promptFile);

    return {
      theme,
      promptText
    };
  }

  /**
   * Get a random backup post
   */
  async getRandomBackupPost(): Promise<string> {
    const backupPosts = await themeManager.getBackupPosts();
    
    if (backupPosts.length === 0) {
      throw new Error('No backup posts available');
    }

    const randomIndex = Math.floor(Math.random() * backupPosts.length);
    const selected = backupPosts[randomIndex];
    
    logger.info('Selected backup post');
    return selected;
  }

  /**
   * Validate theme configuration on startup
   */
  async validateConfiguration(): Promise<boolean> {
    return await themeManager.validate();
  }

  /**
   * Get statistics about themes
   */
  async getThemeStats(): Promise<{
    total: number;
    enabled: number;
    disabled: number;
    totalWeight: number;
  }> {
    const config = await themeManager.getConfig();
    const enabledThemes = config.themes.filter(t => t.enabled);
    const totalWeight = enabledThemes.reduce((sum, t) => sum + t.weight, 0);

    return {
      total: config.themes.length,
      enabled: enabledThemes.length,
      disabled: config.themes.length - enabledThemes.length,
      totalWeight
    };
  }
}

// Export singleton instance
export const themeService = new ThemeService();