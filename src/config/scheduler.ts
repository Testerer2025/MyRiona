import logger from './logger';

export type SchedulerMode = 'test' | 'live';

export interface SchedulerConfig {
  mode: SchedulerMode;
  testInterval: number;
  liveIntervalMin: number;
  liveIntervalMax: number;
}

/**
 * Scheduler configuration manager
 * This will be extended later with:
 * - Day-of-week specific intervals
 * - Time-of-day specific intervals
 * - Holiday handling
 * - etc.
 */
class SchedulerConfigManager {
  private config: SchedulerConfig;

  constructor() {
    const mode = (process.env.MODE || 'live') as SchedulerMode;
    
    this.config = {
      mode,
      // Test mode: 3 minutes
      testInterval: 3 * 60 * 1000,
      
      // Live mode: 4-8 hours
      liveIntervalMin: 4 * 60 * 60 * 1000,
      liveIntervalMax: 8 * 60 * 60 * 1000
    };

    logger.info(`📅 Scheduler initialized in ${mode.toUpperCase()} mode`);
  }

  /**
   * Get the current mode
   */
  getMode(): SchedulerMode {
    return this.config.mode;
  }

  /**
   * Calculate next posting interval with randomization
   */
  getNextInterval(): number {
    if (this.config.mode === 'test') {
      logger.info(`⏱️ Test mode: Next post in 3 minutes`);
      return this.config.testInterval;
    }

    // Live mode: Random interval between min and max
    const randomMs = Math.random() * 
      (this.config.liveIntervalMax - this.config.liveIntervalMin) + 
      this.config.liveIntervalMin;
    
    const hours = (randomMs / (60 * 60 * 1000)).toFixed(2);
    logger.info(`⏱️ Live mode: Next post in ${hours} hours`);
    
    return randomMs;
  }

  /**
   * Get next post time as Date object
   */
  getNextPostTime(): Date {
    const interval = this.getNextInterval();
    return new Date(Date.now() + interval);
  }

  /**
   * TODO: Future enhancements
   * 
   * getOptimalPostingTime(dayOfWeek: number, hour: number): number
   * - Returns best time to post based on day/hour
   * - Example: Higher frequency on Friday/Saturday evenings
   * 
   * isBlackoutPeriod(date: Date): boolean
   * - Check if posting should be paused (holidays, etc.)
   * 
   * getIntervalForDayOfWeek(dayOfWeek: number): { min: number, max: number }
   * - Different intervals per weekday
   * - Example: 2-4h on weekends, 6-8h on weekdays
   * 
   * adjustIntervalForEngagement(lastPostStats: any): number
   * - Dynamically adjust based on engagement
   * - Post more when engagement is high
   */

  /**
   * Validate configuration
   */
  validate(): boolean {
    if (!['test', 'live'].includes(this.config.mode)) {
      logger.error(`Invalid MODE: ${this.config.mode}. Must be 'test' or 'live'`);
      return false;
    }

    if (this.config.testInterval <= 0) {
      logger.error('Test interval must be positive');
      return false;
    }

    if (this.config.liveIntervalMin >= this.config.liveIntervalMax) {
      logger.error('Live interval min must be less than max');
      return false;
    }

    return true;
  }

  /**
   * Get human-readable configuration summary
   */
  getSummary(): string {
    if (this.config.mode === 'test') {
      return `Test Mode: Post every 3 minutes`;
    }

    const minHours = this.config.liveIntervalMin / (60 * 60 * 1000);
    const maxHours = this.config.liveIntervalMax / (60 * 60 * 1000);
    return `Live Mode: Post every ${minHours}-${maxHours} hours (randomized)`;
  }
}

// Export singleton instance
export const schedulerConfig = new SchedulerConfigManager();