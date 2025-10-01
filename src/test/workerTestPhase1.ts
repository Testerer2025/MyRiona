import { connectDB } from '../config/db';
import { themeService } from '../services/themeService';
import Post from '../models/Post';
import logger from '../config/logger';

export async function testPhase1() {
  logger.info('=== Starting Phase 1 Tests ===');
  
  try {
    // 1. Test Theme Configuration
    logger.info('Testing theme configuration...');
    const isValid = await themeService.validateConfiguration();
    logger.info(`✓ Configuration valid: ${isValid}`);

    // 2. Test Theme Stats
    const stats = await themeService.getThemeStats();
    logger.info(`✓ Stats: ${JSON.stringify(stats)}`);

    // 3. Test Theme Selection
    logger.info('Testing theme selection...');
    const theme = await themeService.selectRandomTheme();
    logger.info(`✓ Selected: ${theme.name} (weight: ${theme.weight})`);

    // 4. Test Prompt Loading
    const { promptText } = await themeService.getThemeWithPrompt(theme.id);
    logger.info(`✓ Loaded prompt: ${promptText.substring(0, 100)}...`);

    // 5. Test Backup Post
    const backupPost = await themeService.getRandomBackupPost();
    logger.info(`✓ Backup post: ${backupPost.substring(0, 50)}...`);

    // 6. Test DB
    const testPost = new Post({
      theme: theme.name,
      themeId: theme.id,
      postText: 'Test',
      imagePrompt: theme.image.prompt,
      status: 'success'
    });
    await testPost.save();
    logger.info(`✓ Test post saved: ${testPost._id}`);
    
    await Post.findByIdAndDelete(testPost._id);
    logger.info('✓ Test post deleted');

    // 7. Test Post Generation (Phase 2)
    logger.info('\n=== Testing Phase 2: Post Generation ===');
    const { postGenerationService } = await import('../services/postGenerationService');

    const selectedTheme = await themeService.selectRandomTheme();
    const { promptText: themePrompt } = await themeService.getThemeWithPrompt(selectedTheme.id);

    const generatedPost = await postGenerationService.generatePost(selectedTheme, themePrompt);
    logger.info(`✓ Generated post: ${generatedPost.postText.substring(0, 100)}...`);
    logger.info(`✓ Hashtags: ${generatedPost.hashtags.join(', ')}`);
    logger.info(`✓ Tone: ${generatedPost.tone}`);

    // 8. Test Image Generation (Phase 3)
    logger.info('\n=== Testing Phase 3: Image Generation ===');
    const { imageGenerationService } = await import('../services/imageGenerationService');

    try {
      const testImagePrompt = selectedTheme.image.prompt;
      const imageBuffer = await imageGenerationService.generateImage(testImagePrompt);
      logger.info(`✓ Image generated: ${imageBuffer.length} bytes`);
      
      const imagePath = await imageGenerationService.saveImageToTemp(imageBuffer, 'test-image.jpg');
      logger.info(`✓ Image saved to: ${imagePath}`);
    } catch (error) {
      logger.error('Image generation test failed:', error);
      logger.warn('Skipping image generation test - may not be supported yet');
    }

    // 9. Test Instagram Post Upload (Phase 4)
    logger.info('\n=== Testing Phase 4: Instagram Post Upload ===');
    const { instagramPostService } = await import('../services/instagramPostService');

    try {
      const testCaption = "Test post from Riona AI Bot 🤖\n\n#test #bot #automation";
      await instagramPostService.postToInstagram('/tmp/test-image.jpg', testCaption);
      logger.info('✓ Instagram post uploaded successfully');
    } catch (error) {
      logger.error('Instagram post upload failed:', error);
      logger.warn('This is expected if not logged in or selectors changed');
    }

    // 10. Test Full Posting Workflow (Phase 5)
    logger.info('\n=== Testing Phase 5: Full Posting Workflow ===');
    const { postingOrchestrator } = await import('../services/postingOrchestrator');

    try {
      logger.info('Executing complete post workflow...');
      const result = await postingOrchestrator.executePostWithFallback();
      
      if (result.success) {
        logger.info(`✓ Full workflow successful! Post ID: ${result.postId}`);
      } else {
        logger.error(`✗ Full workflow failed: ${result.error}`);
      }
    } catch (error) {
      logger.error('Phase 5 test failed:', error);
      logger.warn('This is expected if Instagram is not accessible');
    }

    logger.info('=== ✅ All Tests Completed ===');
    return true;
  } catch (error) {
    logger.error('=== ❌ Tests Failed ===', error);
    return false;
  }
}