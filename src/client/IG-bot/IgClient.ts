import * as puppeteer from 'puppeteer';
import puppeteerExtra from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import AdblockerPlugin from "puppeteer-extra-plugin-adblocker";
import { Server } from "proxy-chain";
import { IGpassword, IGusername } from "../../secret";
import logger from "../../config/logger";
import { Instagram_cookiesExist, loadCookies, saveCookies } from "../../utils";
import { runAgent } from "../../Agent";
import { getInstagramCommentSchema } from "../../Agent/schema";
import { getShouldExitInteractions } from '../../api/agent';
import fs from "fs";
import path from "path";

// Add stealth plugin to puppeteer
puppeteerExtra.use(StealthPlugin());
puppeteerExtra.use(
  AdblockerPlugin({
    interceptResolutionPriority: puppeteer.DEFAULT_INTERCEPT_RESOLUTION_PRIORITY,
  })
);

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class IgClient {
    private browser: puppeteer.Browser | null = null;
    private page: puppeteer.Page | null = null;
    private username: string;
    private password: string;

    constructor(username?: string, password?: string) {
        this.username = username || '';
        this.password = password || '';
    }

    /**
     * Find Chrome executable path automatically
     */
    private findChromePath(): string | undefined {
        // 1. Check environment variable
        if (process.env.PUPPETEER_EXECUTABLE_PATH) {
            const envPath = process.env.PUPPETEER_EXECUTABLE_PATH;
            
            // Check if path exists
            if (fs.existsSync(envPath)) {
                logger.info(`Using Chrome from env var: ${envPath}`);
                return envPath;
            }
            
            // Try with different extension
            const alternatives = [
                envPath,
                path.join(path.dirname(envPath), 'chrome'),
                path.join(path.dirname(envPath), 'chrome-linux64')
            ];
            
            for (const altPath of alternatives) {
                if (fs.existsSync(altPath)) {
                    logger.info(`Found Chrome at alternative path: ${altPath}`);
                    return altPath;
                }
            }
            
            logger.warn(`Chrome not found at PUPPETEER_EXECUTABLE_PATH: ${envPath}`);
        }

        // 2. Try common Render.com paths
        const renderPaths = [
            '/opt/render/.cache/puppeteer/chrome/linux-131.0.6778.264/chrome-linux64/chrome',
            '/opt/render/.cache/puppeteer/chrome/linux-131.0.6778.264/chrome-linux64/chrome-linux64',
        ];

        for (const chromePath of renderPaths) {
            if (fs.existsSync(chromePath)) {
                logger.info(`Found Chrome at: ${chromePath}`);
                return chromePath;
            }
        }

        // 3. Let Puppeteer use its default (should work with npx puppeteer browsers install chrome)
        logger.info('Using Puppeteer default Chrome path');
        return undefined;
    }

    async init() {
        const execPath = this.findChromePath();

        // Proxy Setup
        const proxyServer = new Server({ port: 8000 });
        await proxyServer.listen();
        const proxyUrl = `http://localhost:8000`;
        
        logger.info('Launching Puppeteer browser...');
        
        this.browser = await puppeteerExtra.launch({
            executablePath: execPath,
            headless: true,
            args: [
                `--proxy-server=${proxyUrl}`,
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--no-zygote',
                '--disable-web-security',
                '--disable-features=VizDisplayCompositor'
            ],
        });
        
        logger.info('Browser launched successfully');
        
        this.page = await this.browser.newPage();
        await this.page.setViewport({ width: 1366, height: 768 });
        await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

        await this.authenticateUser();
    }


    /* Debug Screenshot for Testing */
        private async debugScreenshot(name: string): Promise<void> {
        try {
            const screenshotPath = `/tmp/${name}.png`;
            await this.page!.screenshot({ path: screenshotPath });
            
            // Read and log as base64 for remote debugging
            const imageBuffer = await fs.readFile(screenshotPath);
            const base64 = imageBuffer.toString('base64');
            
            logger.info(`=== SCREENSHOT: ${name} ===`);
            logger.info(`data:image/png;base64,${base64.substring(0, 100)}...`);
            logger.info(`Full screenshot saved to: ${screenshotPath}`);
            logger.info(`Image size: ${imageBuffer.length} bytes`);
        } catch (e) {
            logger.warn(`Could not save screenshot: ${name}`);
        }
    }
    
    /* Ende Debug Screenshot for Testing */

    private async authenticateUser(): Promise<void> {
        logger.info("Authenticating user...");
        
        const cookiesExist = await Instagram_cookiesExist();
        
        if (cookiesExist) {
            logger.info("Loading existing cookies.");
            const cookies = await loadCookies("/persistent/Instagramcookies.json");
            if (cookies && cookies.length > 0) {
                await this.page!.setCookie(...cookies);
            }
            await this.page!.goto("https://www.instagram.com/", { waitUntil: 'networkidle2' });

            const isLoggedIn = await this.page!.$("a[href='/direct/inbox/']");
            if (isLoggedIn) {
                logger.info("Authentication successful with cookies");
                return;
            }
            logger.warn("Cookies invalid, logging in with credentials.");
        }

        await this.loginWithCredentials();
        logger.info("Authentication successful");
    }

    private async loginWithCredentials(): Promise<void> {
        try {
            logger.info(`Attempting login for user: ${this.username.substring(0, 3)}***`);
            
            await this.page!.goto("https://www.instagram.com/accounts/login/");
            logger.info("Login page loaded");
            
            await this.page!.waitForSelector('input[name="username"]', { timeout: 10000 });
            logger.info("Username field found");
            
            await this.page!.type('input[name="username"]', this.username);
            await this.page!.type('input[name="password"]', this.password);
            logger.info("Credentials entered");
            
            await this.page!.click('button[type="submit"]');
            logger.info("Submit button clicked, waiting for navigation...");

            // Take screenshot before navigation
            try {
                await this.debugScreenshot('before-nav');
                logger.info("Screenshot saved to /tmp/before-nav.png");
            } catch (e) {
                logger.warn("Could not save screenshot");
            }

            await this.page!.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
            logger.info("Navigation completed");

            const cookies = await this.page!.cookies();
            await saveCookies("/persistent/Instagramcookies.json", cookies);

            logger.info("Login successful, cookies saved");
            await this.handleNotificationPopup();
        } catch (error) {
            logger.error("Login failed:", error);
            
            // Take error screenshot
            try {
                await this.page!.screenshot({ path: '/tmp/login-error.png' });
                logger.info("Error screenshot saved to /tmp/login-error.png");
                
                // Log page URL and title
                const url = this.page!.url();
                const title = await this.page!.title();
                logger.info(`Current URL: ${url}`);
                logger.info(`Page title: ${title}`);
            } catch (e) {
                logger.warn("Could not capture error state");
            }
            
            throw new Error("Authentication failed");
        }
    }

    async handleNotificationPopup() {
        if (!this.page) throw new Error("Page not initialized");
        console.log("Checking for notification popup...");

        try {
            const dialogSelector = 'div[role="dialog"]';
            await this.page.waitForSelector(dialogSelector, { timeout: 5000 });
            const dialog = await this.page.$(dialogSelector);

            if (dialog) {
                console.log("Notification dialog found. Searching for 'Not Now' button.");
                const notNowButtonSelectors = ["button", `div[role="button"]`];
                let notNowButton: puppeteer.ElementHandle<Element> | null = null;

                for (const selector of notNowButtonSelectors) {
                    const elements = await dialog.$$(selector);
                    for (const element of elements) {
                        try {
                            const text = await element.evaluate((el) => el.textContent);
                            if (text && text.trim().toLowerCase() === "not now") {
                                notNowButton = element;
                                console.log(`Found 'Not Now' button with selector: ${selector}`);
                                break;
                            }
                        } catch (e) {
                            // Ignore errors from stale elements
                        }
                    }
                    if (notNowButton) break;
                }

                if (notNowButton) {
                    try {
                        console.log("Dismissing 'Not Now' notification popup...");
                        await notNowButton.evaluate((btn:any) => btn.click());
                        await delay(1500);
                        console.log("'Not Now' notification popup dismissed.");
                    } catch (e) {
                        console.warn("Failed to click 'Not Now' button. It might be gone or covered.", e);
                    }
                } else {
                    console.log("'Not Now' button not found within the dialog.");
                }
            }
        } catch (error) {
            console.log("No notification popup appeared within the timeout period.");
        }
    }

    // ... (rest of your methods remain the same)
    async sendDirectMessage(username: string, message: string) {
        if (!this.page) throw new Error("Page not initialized");
        try {
            await this.sendDirectMessageWithMedia(username, message);
        } catch (error) {
            logger.error("Failed to send direct message", error);
            throw error;
        }
    }

    async sendDirectMessageWithMedia(username: string, message: string, mediaPath?: string) {
        if (!this.page) throw new Error("Page not initialized");
        try {
            await this.page.goto(`https://www.instagram.com/${username}/`, {
                waitUntil: "networkidle2",
            });
            console.log("Navigated to user profile");
            await delay(3000);

            const messageButtonSelectors = ['div[role="button"]', "button", 'a[href*="/direct/t/"]', 'div[role="button"] span', 'div[role="button"] div'];
            let messageButton: puppeteer.ElementHandle<Element> | null = null;
            for (const selector of messageButtonSelectors) {
                const elements = await this.page.$$(selector);
                for (const element of elements) {
                    const text = await element.evaluate((el: Element) => el.textContent);
                    if (text && text.trim() === "Message") {
                        messageButton = element;
                        break;
                    }
                }
                if (messageButton) break;
            }
            if (!messageButton) throw new Error("Message button not found.");
            await messageButton.click();
            await delay(2000);
            await this.handleNotificationPopup();

            if (mediaPath) {
                const fileInput = await this.page.$('input[type="file"]');
                if (fileInput) {
                    await fileInput.uploadFile(mediaPath);
                    await this.handleNotificationPopup();
                    await delay(2000);
                } else {
                    logger.warn("File input for media not found.");
                }
            }

            const messageInputSelectors = ['textarea[placeholder="Message..."]', 'div[role="textbox"]', 'div[contenteditable="true"]', 'textarea[aria-label="Message"]'];
            let messageInput: puppeteer.ElementHandle<Element> | null = null;
            for (const selector of messageInputSelectors) {
                messageInput = await this.page.$(selector);
                if (messageInput) break;
            }
            if (!messageInput) throw new Error("Message input not found.");
            await messageInput.type(message);
            await this.handleNotificationPopup();
            await delay(2000);

            const sendButtonSelectors = ['div[role="button"]', "button"];
            let sendButton: puppeteer.ElementHandle<Element> | null = null;
            for (const selector of sendButtonSelectors) {
                const elements = await this.page.$$(selector);
                for (const element of elements) {
                    const text = await element.evaluate((el: Element) => el.textContent);
                    if (text && text.trim() === "Send") {
                        sendButton = element;
                        break;
                    }
                }
                if (sendButton) break;
            }
            if (!sendButton) throw new Error("Send button not found.");
            await sendButton.click();
            await this.handleNotificationPopup();
            console.log("Message sent successfully");
        } catch (error) {
            logger.error(`Failed to send DM to ${username}`, error);
            throw error;
        }
    }

    async sendDirectMessagesFromFile(file: Buffer | string, message: string, mediaPath?: string) {
        if (!this.page) throw new Error("Page not initialized");
        logger.info(`Sending DMs from provided file content`);
        let fileContent: string;
        if (Buffer.isBuffer(file)) {
            fileContent = file.toString('utf-8');
        } else {
            fileContent = file;
        }
        const usernames = fileContent.split("\n");
        for (const username of usernames) {
            if (username.trim()) {
                await this.handleNotificationPopup();
                await this.sendDirectMessageWithMedia(username.trim(), message, mediaPath);
                await this.handleNotificationPopup();
                await delay(30000);
            }
        }
    }

    async interactWithPosts() {
        if (!this.page) throw new Error("Page not initialized");
        let postIndex = 1;
        const maxPosts = 20;
        const page = this.page;
        while (postIndex <= maxPosts) {
            if (typeof getShouldExitInteractions === 'function' && getShouldExitInteractions()) {
                console.log('Exit from interactions requested. Stopping loop.');
                break;
            }
            try {
                const postSelector = `article:nth-of-type(${postIndex})`;
                if (!(await page.$(postSelector))) {
                    console.log("No more posts found. Ending iteration...");
                    return;
                }
                const likeButtonSelector = `${postSelector} svg[aria-label="Like"]`;
                const likeButton = await page.$(likeButtonSelector);
                let ariaLabel = null;
                if (likeButton) {
                    ariaLabel = await likeButton.evaluate((el: Element) => el.getAttribute("aria-label"));
                }
                if (ariaLabel === "Like" && likeButton) {
                    console.log(`Liking post ${postIndex}...`);
                    await likeButton.click();
                    await page.keyboard.press("Enter");
                    console.log(`Post ${postIndex} liked.`);
                } else if (ariaLabel === "Unlike") {
                    console.log(`Post ${postIndex} is already liked.`);
                } else {
                    console.log(`Like button not found for post ${postIndex}.`);
                }
                const captionSelector = `${postSelector} div.x9f619 span._ap3a div span._ap3a`;
                const captionElement = await page.$(captionSelector);
                let caption = "";
                if (captionElement) {
                    caption = await captionElement.evaluate((el) => (el as HTMLElement).innerText);
                    console.log(`Caption for post ${postIndex}: ${caption}`);
                } else {
                    console.log(`No caption found for post ${postIndex}.`);
                }
                const moreLinkSelector = `${postSelector} div.x9f619 span._ap3a span div span.x1lliihq`;
                const moreLink = await page.$(moreLinkSelector);
                if (moreLink && captionElement) {
                    console.log(`Expanding caption for post ${postIndex}...`);
                    await moreLink.click();
                    const expandedCaption = await captionElement.evaluate((el) => (el as HTMLElement).innerText);
                    console.log(`Expanded Caption for post ${postIndex}: ${expandedCaption}`);
                    caption = expandedCaption;
                }
                const commentBoxSelector = `${postSelector} textarea`;
                const commentBox = await page.$(commentBoxSelector);
                if (commentBox) {
                    console.log(`Commenting on post ${postIndex}...`);
                    const prompt = `human-like Instagram comment based on to the following post: "${caption}". make sure the reply\n            Matchs the tone of the caption (casual, funny, serious, or sarcastic).\n            Sound organic—avoid robotic phrasing, overly perfect grammar, or anything that feels AI-generated.\n            Use relatable language, including light slang, emojis (if appropriate), and subtle imperfections like minor typos or abbreviations (e.g., 'lol' or 'omg').\n            If the caption is humorous or sarcastic, play along without overexplaining the joke.\n            If the post is serious (e.g., personal struggles, activism), respond with empathy and depth.\n            Avoid generic praise ('Great post!'); instead, react specifically to the content (e.g., 'The way you called out pineapple pizza haters 😂👏').\n            *Keep it concise (1-2 sentences max) and compliant with Instagram's guidelines (no spam, harassment, etc.).*`;
                    const schema = getInstagramCommentSchema();
                    const result = await runAgent(schema, prompt);
                    const comment = (result[0]?.comment ?? "") as string;
                    await commentBox.type(comment);
                    const postButton = await page.evaluateHandle(() => {
                        const buttons = Array.from(document.querySelectorAll('div[role="button"]'));
                        return buttons.find((button) => button.textContent === "Post" && !button.hasAttribute("disabled"));
                    });
                    const postButtonElement = postButton && postButton.asElement ? postButton.asElement() : null;
                    if (postButtonElement) {
                        console.log(`Posting comment on post ${postIndex}...`);
                        await (postButtonElement as puppeteer.ElementHandle<Element>).click();
                        console.log(`Comment posted on post ${postIndex}.`);
                        await delay(2000);
                    } else {
                        console.log("Post button not found.");
                    }
                } else {
                    console.log("Comment box not found.");
                }
                const waitTime = Math.floor(Math.random() * 5000) + 5000;
                console.log(`Waiting ${waitTime / 1000} seconds before moving to the next post...`);
                await delay(waitTime);
                await delay(1000);
                await page.evaluate(() => {
                    window.scrollBy(0, window.innerHeight);
                });
                postIndex++;
            } catch (error) {
                console.error(`Error interacting with post ${postIndex}:`, error);
                break;
            }
        }
    }

    async scrapeFollowers(targetAccount: string, maxFollowers: number) {
        if (!this.page) throw new Error("Page not initialized");
        const page = this.page;
        try {
            await page.goto(`https://www.instagram.com/${targetAccount}/followers/`, {
                waitUntil: "networkidle2",
            });
            console.log(`Navigated to ${targetAccount}'s followers page`);

            try {
                await page.waitForSelector('div a[role="link"] span[title]');
            } catch {
                await page.waitForSelector('div[role="dialog"]');
            }
            console.log("Followers modal loaded");

            const followers: string[] = [];
            let previousHeight = 0;
            let currentHeight = 0;
            maxFollowers = maxFollowers + 4;
            console.log(maxFollowers);
            while (followers.length < maxFollowers) {
                const newFollowers = await page.evaluate(() => {
                    const followerElements = document.querySelectorAll('div a[role="link"]');
                    return Array.from(followerElements)
                        .map((element) => element.getAttribute("href"))
                        .filter((href): href is string => href !== null && href.startsWith("/"))
                        .map((href) => href.substring(1));
                });

                for (const follower of newFollowers) {
                    if (!followers.includes(follower) && followers.length < maxFollowers) {
                        followers.push(follower);
                        console.log(`Found follower: ${follower}`);
                    }
                }

                await page.evaluate(() => {
                    const dialog = document.querySelector('div[role="dialog"]');
                    if (dialog) {
                        dialog.scrollTop = dialog.scrollHeight;
                    }
                });

                await delay(1000);

                currentHeight = await page.evaluate(() => {
                    const dialog = document.querySelector('div[role="dialog"]');
                    return dialog ? dialog.scrollHeight : 0;
                });

                if (currentHeight === previousHeight) {
                    console.log("Reached the end of followers list");
                    break;
                }

                previousHeight = currentHeight;
            }

            console.log(`Successfully scraped ${followers.length - 4} followers`);
            return followers.slice(4, maxFollowers);
        } catch (error) {
            console.error(`Error scraping followers for ${targetAccount}:`, error);
            throw error;
        }
    }

    public async close() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            this.page = null;
        }
    }
}

export async function scrapeFollowersHandler(targetAccount: string, maxFollowers: number) {
    const client = new IgClient();
    await client.init();
    const followers = await client.scrapeFollowers(targetAccount, maxFollowers);
    await client.close();
    return followers;
}