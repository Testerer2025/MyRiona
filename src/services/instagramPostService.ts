import { getIgClient } from '../client/Instagram';
import logger from '../config/logger';
import fs from 'fs/promises';

class InstagramPostService {
  /**
   * Post an image with caption to Instagram using Puppeteer
   */
  async postToInstagram(imagePath: string, caption: string): Promise<boolean> {
    const client = await getIgClient();
    const page = (client as any).page;

    if (!page) {
      throw new Error('Instagram client page not initialized');
    }

    try {
      logger.info('Starting Instagram post upload...');

      // Navigate to Instagram home
      await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle2' });
      await this.delay(2000);

      // FIXED: Use improved clickCreateButton method
      await this.clickCreateButton(page);

      // FIXED: Use improved uploadImage method
      await this.uploadImage(page, imagePath);

      // Click "Next" buttons (2x for editing steps)
      logger.info('Clicking Next buttons...');
      await this.clickNextButtons(page, 2);

      // Add caption with improved method
      logger.info('Adding caption...');
      await this.findAndFillCaption(page, caption);

      // Wait for Instagram to process
      await this.delay(5000);

      // Click Share button
      await this.clickShareButton(page);

      // Wait for confirmation
      await this.delay(15000);

      // Verify success
      try {
        await page.waitForSelector('div[role="dialog"]', { timeout: 3000, hidden: true });
        logger.info('✅ Post successfully shared - dialog disappeared!');
      } catch (e) {
        logger.warn('⚠️ Dialog still visible - post may not be successful');
      }

      logger.info('Post uploaded successfully!');
      return true;

    } catch (error) {
      logger.error('Instagram post upload failed:', error);
      
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
   * Click create button and handle new Instagram UI with "Beitrag"/"KI" menu
   */
  private async clickCreateButton(page: any): Promise<void> {
    // Step 1: Click the + (Create) button
    const plusSelectors = [
      'svg[aria-label*="New post"]',
      'svg[aria-label*="Create"]', 
      'svg[aria-label*="Neuer Beitrag"]',
      'svg[aria-label*="Beitrag erstellen"]',
      'a[href="#"] svg',
      'div[role="menuitem"] svg'
    ];

    let plusFound = false;
    for (const selector of plusSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 5000, visible: true });
        await page.click(selector);
        plusFound = true;
        logger.info(`Plus icon found with selector: ${selector}`);
        break;
      } catch (e) {
        continue;
      }
    }

    if (!plusFound) {
      throw new Error('Plus icon not found');
    }

    await this.delay(2000);

    // Step 2: Handle the new Instagram menu with "Beitrag" and "KI" options
    try {
      logger.info('Checking for new Instagram menu...');
      
      // Wait for menu and look for "Beitrag" or "Post" option
      const beitragClicked = await page.evaluate(() => {
        const elements = document.querySelectorAll('div, span, button, a');
        for (const el of elements) {
          const text = el.textContent?.trim().toLowerCase();
          if (text === 'beitrag' || text === 'post') {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              (el as HTMLElement).click();
              return true;
            }
          }
        }
        return false;
      });

      if (beitragClicked) {
        logger.info('✅ "Beitrag" option found and clicked');
        await this.delay(2000);
      } else {
        // Alternative: Look for clickable elements in menu/dialog
        const menuItemClicked = await page.evaluate(() => {
          const menuItems = document.querySelectorAll('[role="menuitem"], [role="button"], button, div[tabindex="0"]');
          for (const item of menuItems) {
            const text = item.textContent?.trim().toLowerCase();
            if (text?.includes('beitrag') || text?.includes('post')) {
              (item as HTMLElement).click();
              return true;
            }
          }
          return false;
        });

        if (menuItemClicked) {
          logger.info('✅ "Beitrag" menu item found and clicked');
          await this.delay(2000);
        } else {
          logger.warn('⚠️ No "Beitrag" menu found - possibly old UI or already correct');
        }
      }

    } catch (error) {
      logger.warn('⚠️ Error handling new Instagram menu:', error);
      // Continue anyway - might be old UI
    }

    // Step 3: Verify we're in the right place
    await this.delay(1000);
    
    try {
      await page.waitForSelector('input[type="file"], [role="dialog"] div', { timeout: 5000 });
      logger.info('✅ Upload area reached');
    } catch (e) {
      logger.warn('⚠️ Upload area not immediately visible - trying to continue anyway');
    }
  }

  /**
   * Enhanced upload image method with better error handling
   */
  private async uploadImage(page: any, imagePath: string): Promise<void> {
    try {
      logger.info('🔍 Looking for file input...');
      
      const fileSelectors = [
        'input[type="file"][accept*="image"]',
        'input[type="file"]',
        'input[accept*="image"]',
        'input[accept*="jpeg"]',
        'input[accept*="png"]'
      ];

      let fileInput = null;
      for (const selector of fileSelectors) {
        try {
          await page.waitForSelector(selector, { timeout: 5000 });
          fileInput = await page.$(selector);
          if (fileInput) {
            logger.info(`✅ File input found with selector: ${selector}`);
            break;
          }
        } catch (e) {
          continue;
        }
      }

      // If no file input found, try to trigger upload area
      if (!fileInput) {
        logger.warn('⚠️ No file input found - trying to activate upload area');
        
        const uploadAreaClicked = await page.evaluate(() => {
          const elements = document.querySelectorAll('div, span, button');
          for (const el of elements) {
            const text = el.textContent?.trim().toLowerCase();
            if (text?.includes('auswählen') || 
                text?.includes('computer') || 
                text?.includes('select') ||
                text?.includes('upload') ||
                text?.includes('hochladen')) {
              (el as HTMLElement).click();
              return true;
            }
          }
          return false;
        });
        
        if (uploadAreaClicked) {
          logger.info('✅ Upload area activated via text click');
          await this.delay(2000);
          
          // Try to find file input again
          for (const selector of fileSelectors) {
            try {
              await page.waitForSelector(selector, { timeout: 3000 });
              fileInput = await page.$(selector);
              if (fileInput) {
                logger.info(`✅ File input found after upload click: ${selector}`);
                break;
              }
            } catch (e) {
              continue;
            }
          }
        }
      }

      if (!fileInput) {
        throw new Error('File input could not be found. Instagram UI may have changed.');
      }
      
      // Upload the file
      await fileInput.uploadFile(imagePath);
      logger.info('✅ Image uploaded successfully');
      await this.delay(3000);
      
    } catch (error) {
      logger.error('❌ Error during file upload:', error);
      throw error;
    }
  }

  /**
   * Find and fill caption with improved method
   */
  private async findAndFillCaption(page: any, text: string): Promise<void> {
    logger.info(`Attempting to enter caption: "${text.slice(0, 100)}..."`);
    
    const sel = 'div[role="textbox"][contenteditable="true"][data-lexical-editor="true"]';
    await page.waitForSelector(sel, { timeout: 10000, visible: true });
    const handle = await page.$(sel);
    
    if (!handle) throw new Error('Caption field not found');

    await handle.click({ clickCount: 1 });
    await page.keyboard.down('Control');
    await page.keyboard.press('A');
    await page.keyboard.up('Control');
    await page.keyboard.press('Backspace');
    await page.type(sel, text, { delay: 25 });
    await this.delay(500);
    await page.evaluate(() => (document.activeElement as HTMLElement).blur());
    await this.delay(300);

    const current = await page.evaluate((s: string) => 
      document.querySelector<HTMLElement>(s)?.innerText || '', sel
    );
    logger.info(`Caption length after entry: ${current.length}`);
  }

  /**
   * Click Share button with improved waiting logic
   */
  private async clickShareButton(page: any): Promise<void> {
    logger.info('Waiting for enabled Share button...');

    try {
      await page.waitForFunction(
        () => !document.querySelector('div[role="progressbar"]'), 
        { timeout: 60000 }
      );
    } catch {
      logger.warn('Progress spinner remained visible - continuing anyway');
    }

    const clicked = await page.waitForFunction(
      () => {
        const dialog = document.querySelector('div[role="dialog"]');
        if (!dialog) return false;

        const btn = [...dialog.querySelectorAll<HTMLElement>('button, div[role="button"]')].find(b => {
          const txt = (b.textContent || '').trim();
          const visible = b.offsetParent !== null;
          const enabled = !b.hasAttribute('disabled') &&
                          !(b as HTMLButtonElement).disabled &&
                          b.getAttribute('aria-disabled') !== 'true';
          return visible && enabled && (txt === 'Teilen' || txt === 'Share');
        });

        if (btn) {
          btn.click();
          return true;
        }
        return false;
      },
      { timeout: 60000 }
    );

    if (!clicked) throw new Error('Share button not clickable');
    logger.info('✅ Share button clicked, waiting for dialog to disappear...');

    await page.waitForFunction(
      () => window.location.pathname === '/' ||
            !!document.querySelector('[data-testid="upload-flow-success-toast"]'),
      { timeout: 60000 }
    );
  }

  /**
   * Click "Next" buttons multiple times
   */
  private async clickNextButtons(page: any, times: number = 2): Promise<void> {
    for (let i = 0; i < times; i++) {
      try {
        logger.info(`Looking for Next button ${i + 1}/${times}...`);
        
        const nextButtonClicked = await page.evaluate(() => {
          const buttons = document.querySelectorAll('button, div[role="button"]');
          for (const btn of buttons) {
            const text = btn.textContent?.trim().toLowerCase();
            if (text === 'weiter' || text === 'next' || text === 'continue') {
              (btn as HTMLElement).click();
              return true;
            }
          }
          return false;
        });
        
        if (nextButtonClicked) {
          logger.info(`✅ Next button ${i + 1}/${times} clicked`);
          await this.delay(2000);
        } else {
          logger.warn(`⚠️ Next button ${i + 1}/${times} not found`);
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