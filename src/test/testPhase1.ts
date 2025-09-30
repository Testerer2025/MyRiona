import { connectDB } from '../config/db';
import { themeService } from '../services/themeService';
import { themeManager } from '../config/themes';
import Post from '../models/Post';
import logger from '../config/logger';

async function testPhase1() {
  try {
    // 1. Test DB Connection
    logger.info('Testing MongoDB connection...');
    await connectDB();
    logger.info('✓ MongoDB connected');

    // 2. Test Theme Configuration
    logger.info('\nTesting theme configuration...');
    const isValid = await themeService.validateConfiguration();
    logger.info(`✓ Configuration valid: ${isValid}`);

    // 3. Test Theme Stats
    logger.info('\nGetting theme statistics...');
    const stats = await themeService.getThemeStats();
    logger.info(`✓ Theme stats: ${JSON.stringify(stats, null, 2)}`);

    // 4. Test Theme Selection
    logger.info('\nTesting weighted theme selection...');
    for (let i = 0; i < 5; i++) {
      const theme = await themeService.selectRandomTheme();
      logger.info(`  Selection ${i + 1}: ${theme.name} (weight: ${theme.weight})`);
    }

    // 5. Test Prompt Loading
    logger.info('\nTesting prompt loading...');
    const theme = await themeService.selectRandomTheme();
    const { promptText } = await themeService.getThemeWithPrompt(theme.id);
    logger.info(`✓ Loaded prompt for ${theme.name}:`);
    logger.info(`  ${promptText.substring(0, 100)}...`);

    // 6. Test Backup Posts
    logger.info('\nTesting backup posts...');
    const backupPost = await themeService.getRandomBackupPost();
    logger.info(`✓ Random backup post: ${backupPost.substring(0, 50)}...`);

    // 7. Test Post Model (create dummy post)
    logger.info('\nTesting Post model...');
    const testPost = new Post({
      theme: theme.name,
      themeId: theme.id,
      postText: 'Test post text',
      imagePrompt: theme.image.prompt,
      imageUrl: 'https://example.com/test.jpg',
      status: 'success'
    });
    await testPost.save();
    logger.info(`✓ Test post saved with ID: ${testPost._id}`);

    // 8. Query the test post
    const savedPost = await Post.findById(testPost._id);
    logger.info(`✓ Retrieved post: ${savedPost?.theme}`);

    // 9. Delete test post
    await Post.findByIdAndDelete(testPost._id);
    logger.info('✓ Test post deleted');

    logger.info('\n✅ All Phase 1 tests passed!');
    process.exit(0);
  } catch (error) {
    logger.error('❌ Phase 1 test failed:', error);
    process.exit(1);
  }
}

testPhase1();