import { getIgClient } from '../client/Instagram';
import logger from '../config/logger';
import fs from 'fs/promises';

class InstagramPostService {
  /**
   * Post an image with caption to Instagram using Puppeteer
   */
  async postToInstagram(imagePath: string, caption: string): Promise<boolean> {
    const client = await getIgClient();
    const page = (client as any).page; // Access the Puppeteer page

    if (!page) {
      throw new Error('Instagram client page not initialized');
    }

    try {
      logger.info('Starting Instagram post upload...');

      // Navigate to Instagram home
      await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle2' });
      await this.delay(2000);

      // Find and click "Create" button (the + icon)
      logger.info('Looking for Create button...');
      const createButtonSelectors = [
        'svg[aria-label="New post"]',
        'svg[aria-label="Neuer Beitrag"]',
        'a[href="#"]>svg',
        'svg[aria-label="Create"]',
        'svg[aria-label="Erstellen"]'
      ];

      let createButton = null;
      for (const selector of createButtonSelectors) {
        createButton = await page.$(selector);
        if (createButton) {
          logger.info(`Found Create button with selector: ${selector}`);
          break;
        }
      }

      if (!createButton) {
        throw new Error('Create button not found');
      }

      await createButton.click();
      await this.delay(2000);

      // Upload image
      logger.info('Uploading image...');
      const fileInputSelectors = [
        'input[type="file"]',
        'input[accept*="image"]'
      ];

      let fileInput = null;
      for (const selector of fileInputSelectors) {
        fileInput = await page.$(selector);
        if (fileInput) break;
      }

      if (!fileInput) {
        throw new Error('File input not found');
      }

      await fileInput.uploadFile(imagePath);
      await this.delay(3000);

      // Click "Next" button (may need to click multiple times)
      logger.info('Clicking Next button...');
      await this.clickNextButtons(page, 2);

      // Add caption
      logger.info('Adding caption...');
      const captionSelectors = [
        'textarea[aria-label="Write a caption..."]',
        'textarea[aria-label="Beschreibung hinzufügen ..."]',
        'textarea[placeholder="Write a caption..."]',
        'div[contenteditable="true"]'
      ];

      let captionInput = null;
      for (const selector of captionSelectors) {
        captionInput = await page.$(selector);
        if (captionInput) {
          logger.info(`Found caption input with selector: ${selector}`);
          break;
        }
      }

      if (!captionInput) {
        throw new Error('Caption input not found');
      }

      await captionInput.click();
      await this.delay(500);
      await captionInput.type(caption, { delay: 50 });
      await this.delay(1000);

      // Click "Share" button
      logger.info('Clicking Share button...');
      const shareButton = await page.evaluateHandle(() => {
        const buttons = Array.from(document.querySelectorAll('button, div[role="button"]'));
        return buttons.find(button => 
          button.textContent === 'Share' || 
          button.textContent === 'Teilen'
        );
      });

      const shareButtonElement = shareButton && shareButton.asElement ? shareButton.asElement() : null;
      
      if (!shareButtonElement) {
        throw new Error('Share button not found');
      }

      await shareButtonElement.click();
      await this.delay(3000);

      // Wait for success confirmation
      logger.info('Waiting for post confirmation...');
      await this.delay(5000);

      logger.info('Post uploaded successfully!');
      return true;

    } catch (error) {
      logger.error('Instagram post upload failed:', error);
      
      // Take screenshot for debugging
      try {
        const screenshotPath = `/tmp/instagram-error-${Date.now()}.png`;
        await page.screenshot({ path: screenshotPath });
        logger.info(`Error screenshot saved: ${screenshotPath}`);
      } catch (screenshotError) {
        logger.error('Failed to take error screenshot:', screenshotError);
      }

      throw error;
    }
  }

  /**
   * Click "Next" buttons multiple times (Instagram's multi-step flow)
   */
  private async clickNextButtons(page: any, times: number = 2): Promise<void> {
    for (let i = 0; i < times; i++) {
      try {
        const nextButton = await page.evaluateHandle(() => {
          const buttons = Array.from(document.querySelectorAll('button, div[role="button"]'));
          return buttons.find(button => 
            button.textContent === 'Next' || 
            button.textContent === 'Weiter'
          );
        });

        const nextButtonElement = nextButton && nextButton.asElement ? nextButton.asElement() : null;
        
        if (nextButtonElement) {
          await nextButtonElement.click();
          await this.delay(2000);
          logger.info(`Clicked Next button ${i + 1}/${times}`);
        }
      } catch (error) {
        logger.warn(`Failed to click Next button ${i + 1}:`, error);
      }
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const instagramPostService = new InstagramPostService();