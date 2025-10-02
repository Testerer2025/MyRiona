import fs from 'fs/promises';
import path from 'path';
import logger from './logger';

// ============ INTERFACES ============

export interface ImageConfig {
  // Standard properties (für normale Themes)
  prompt?: string;
  apiStyle?: string;
  details?: string;
  size?: string;
  quality?: string;
  usePostingText?: boolean;
  referenceImage?: string | string[];
  
  // Weather-specific properties
  prompt_good_weather?: string;
  prompt_bad_weather?: string;
  referenceImage_good_weather?: string[];
  referenceImage_bad_weather?: string[];
}

export interface Theme {
  id: string;
  name: string;
  enabled: boolean;
  weight: number;
  
  // Standard prompt file (für normale Themes)
  promptFile?: string;
  
  // Weather-specific prompt files
  promptFile_good_weather?: string;
  promptFile_bad_weather?: string;
  
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

// ============ WEATHER HELPER FUNCTIONS ============

export function isWeatherTheme(theme: Theme): boolean {
  return theme.id === 'weather_post' && 
         !!theme.promptFile_good_weather && 
         !!theme.promptFile_bad_weather;
}

export function getWeatherPromptFile(theme: Theme, condition: 'good' | 'bad'): string {
  if (!isWeatherTheme(theme)) {
    throw new Error('Theme is not a weather theme');
  }
  
  return condition === 'good' 
    ? theme.promptFile_good_weather! 
    : theme.promptFile_bad_weather!;
}

export function getWeatherImagePrompt(theme: Theme, condition: 'good' | 'bad'): string {
  if (!isWeatherTheme(theme)) {
    throw new Error('Theme is not a weather theme');
  }
  
  return condition === 'good'
    ? theme.image.prompt_good_weather!
    : theme.image.prompt_bad_weather!;
}

export function getWeatherReferenceImages(theme: Theme, condition: 'good' | 'bad'): string[] {
  if (!isWeatherTheme(theme)) {
    throw new Error('Theme is not a weather theme');
  }
  
  return condition === 'good'
    ? theme.image.referenceImage_good_weather || []
    : theme.image.referenceImage_bad_weather || [];
}

// ============ THEME MANAGER CLASS ============

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

      // Check if prompt files exist (including weather-specific prompts)
      for (const theme of enabledThemes) {
        // Check normal theme prompt file
        if (theme.promptFile) {
          const promptPath = path.join(this.promptsDir, theme.promptFile);
          try {
            await fs.access(promptPath);
          } catch {
            logger.error(`Prompt file not found: ${theme.promptFile} for theme ${theme.id}`);
            return false;
          }
        }

        // Check weather-specific prompt files
        if (theme.id === 'weather_post') {
          if (theme.promptFile_good_weather) {
            const goodWeatherPath = path.join(this.promptsDir, theme.promptFile_good_weather);
            try {
              await fs.access(goodWeatherPath);
            } catch {
              logger.error(`Weather prompt file not found: ${theme.promptFile_good_weather}`);
              return false;
            }
          }

          if (theme.promptFile_bad_weather) {
            const badWeatherPath = path.join(this.promptsDir, theme.promptFile_bad_weather);
            try {
              await fs.access(badWeatherPath);
            } catch {
              logger.error(`Weather prompt file not found: ${theme.promptFile_bad_weather}`);
              return false;
            }
          }
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