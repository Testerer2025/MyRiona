import dotenv from "dotenv";
import logger from "./config/logger";
import { shutdown } from "./services";
import app from "./app";
import { initAgent } from "./Agent/index";
import { postingOrchestrator } from './services/postingOrchestrator';
import { schedulerConfig } from './config/scheduler';

dotenv.config();

let postingTimer: NodeJS.Timeout | null = null;

/**
 * Execute a post and schedule the next one
 */
async function executeScheduledPost() {
  try {
    logger.info('=== Starting scheduled post ===');
    
    const result = await postingOrchestrator.executePostWithFallback();
    
    if (result.success) {
      logger.info(`✅ Post successful! ID: ${result.postId}`);
    } else {
      logger.error(`❌ Post failed: ${result.error}`);
    }

    // Get stats
    const stats = await postingOrchestrator.getPostStats();
    logger.info(`📊 Stats - Total: ${stats.totalPosts}, Success: ${stats.successfulPosts}, Failed: ${stats.failedPosts}`);

  } catch (error) {
    logger.error('Scheduled post execution failed:', error);
  } finally {
    // Always schedule next post
    scheduleNextPost();
  }
}

/**
 * Schedule the next post with randomized interval
 */
function scheduleNextPost() {
  // Clear any existing timer
  if (postingTimer) {
    clearTimeout(postingTimer);
  }

  const nextPostTime = schedulerConfig.getNextPostTime();
  const interval = nextPostTime.getTime() - Date.now();
  
  logger.info(`📅 Next post scheduled for: ${nextPostTime.toLocaleString('de-DE', { 
    timeZone: 'Europe/Zurich',
    dateStyle: 'short',
    timeStyle: 'short'
  })}`);

  postingTimer = setTimeout(executeScheduledPost, interval);
}

/**
 * Start the posting scheduler
 */
async function startPostingScheduler() {
  logger.info(`🚀 Starting posting scheduler`);
  logger.info(`📋 ${schedulerConfig.getSummary()}`);

  // Execute first post immediately
  logger.info('⚡ Executing first post immediately...');
  await executeScheduledPost();
}

/**
 * Stop the posting scheduler
 */
function stopPostingScheduler() {
  if (postingTimer) {
    clearTimeout(postingTimer);
    postingTimer = null;
    logger.info('🛑 Posting scheduler stopped');
  }
}

/**
 * Main server startup
 */
async function startServer() {
  try {
    // 1. Initialize AI Agent with character
    logger.info('🤖 Initializing AI Agent...');
    const character = await initAgent();
    logger.info(`✅ Character loaded: ${character?.name || 'Unknown'}`);

    // 2. Validate scheduler configuration
    if (!schedulerConfig.validate()) {
      throw new Error('Invalid scheduler configuration');
    }
    logger.info('✅ Scheduler configuration valid');

    // 3. Start posting scheduler
    await startPostingScheduler();

    // 4. Start HTTP server for health checks
    const server = app.listen(process.env.PORT || 3000, () => {
      logger.info(`🌐 Server running on port ${process.env.PORT || 3000}`);
      logger.info(`📍 Mode: ${schedulerConfig.getMode().toUpperCase()}`);
      
      const characterFile = process.env.CHARACTER_FILE || 'auto-detected';
      logger.info(`🎭 Character: ${characterFile}`);
    });

    // Handle graceful shutdown
    process.on("SIGTERM", () => {
      logger.info("Received SIGTERM signal.");
      stopPostingScheduler();
      shutdown(server);
    });

    process.on("SIGINT", () => {
      logger.info("Received SIGINT signal.");
      stopPostingScheduler();
      shutdown(server);
    });

  } catch (err) {
    logger.error("Fatal error during startup:", err);
    process.exit(1);
  }
}

// Start the bot
startServer();