import fs from 'fs/promises';
import path from 'path';
import logger from './logger';

export interface ImageConfig {
  prompt: string;
  apiStyle: string;
  details: string;
  size: string;
  quality: string;
  usePostingText?: boolean;
}

export interface Theme {
  id: string;
  name: string;
  enabled: boolean;
  weight: number;
  promptFile: string;
  image: ImageConfig;
}

export interface ThemeDefaults {
  maxLength: number;
  includeHashtags: boolean;
  hashtagCount: number;
  language: string;
}

export interface ThemeConfig {
  themes: Theme[];
  defaults: ThemeDefaults;
  backupPosts: string[];
}

class ThemeManager {
  private config: ThemeConfig | null = null;
  private configPath: string;
  private promptsDir: string;

  constructor() {
    this.configPath = path.join(__dirname, 'themes.json');
    this.promptsDir = path.join(__dirname, 'prompts');
  }

  /**
   * Load themes configuration from JSON file
   */
  async loadConfig(): Promise<ThemeConfig> {
    try {
      const data = await fs.readFile(this.configPath, 'utf-8');
      this.config = JSON.parse(data);
      logger.info(`Loaded ${this.config!.themes.length} themes from configuration`);
      return this.config!;
    } catch (error) {
      logger.error('Failed to load themes configuration:', error);
      throw new Error('Could not load themes.json');
    }
  }

  /**
   * Get the configuration (load if not already loaded)
   */
  async getConfig(): Promise<ThemeConfig> {
    if (!this.config) {
      await this.loadConfig();
    }
    return this.config!;
  }

  /**
   * Get all enabled themes
   */
  async getEnabledThemes(): Promise<Theme[]> {
    const config = await this.getConfig();
    return config.themes.filter(theme => theme.enabled);
  }

  /**
   * Get a specific theme by ID
   */
  async getThemeById(id: string): Promise<Theme | undefined> {
    const config = await this.getConfig();
    return config.themes.find(theme => theme.id === id);
  }

  /**
   * Load prompt text from file
   */
  async loadPrompt(promptFile: string): Promise<string> {
    try {
      const promptPath = path.join(this.promptsDir, promptFile);
      const promptText = await fs.readFile(promptPath, 'utf-8');
      return promptText.trim();
    } catch (error) {
      logger.error(`Failed to load prompt file: ${promptFile}`, error);
      throw new Error(`Could not load prompt file: ${promptFile}`);
    }
  }

  /**
   * Get defaults configuration
   */
  async getDefaults(): Promise<ThemeDefaults> {
    const config = await this.getConfig();
    return config.defaults;
  }

  /**
   * Get backup posts
   */
  async getBackupPosts(): Promise<string[]> {
    const config = await this.getConfig();
    return config.backupPosts;
  }

  /**
   * Validate configuration
   */
  async validate(): Promise<boolean> {
    try {
      const config = await this.getConfig();
      
      // Check if there are any enabled themes
      const enabledThemes = config.themes.filter(t => t.enabled);
      if (enabledThemes.length === 0) {
        logger.warn('No enabled themes found in configuration');
        return false;
      }

      // Check if prompt files exist
      for (const theme of enabledThemes) {
        const promptPath = path.join(this.promptsDir, theme.promptFile);
        try {
          await fs.access(promptPath);
        } catch {
          logger.error(`Prompt file not found: ${theme.promptFile} for theme ${theme.id}`);
          return false;
        }
      }

      logger.info('Theme configuration validated successfully');
      return true;
    } catch (error) {
      logger.error('Configuration validation failed:', error);
      return false;
    }
  }
}

// Export singleton instance
export const themeManager = new ThemeManager();