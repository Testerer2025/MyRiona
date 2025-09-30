import { IgClient } from './IG-bot/IgClient';
import logger from '../config/logger';

let igClient: IgClient | null = null;
let lastCredentials: { username: string, password: string } | null = null;

export const getIgClient = async (username?: string, password?: string): Promise<IgClient> => {
    if (!igClient || (username && password && (!lastCredentials || lastCredentials.username !== username || lastCredentials.password !== password))) {
        igClient = new IgClient(username, password);
        lastCredentials = { username: username || '', password: password || '' };
        try {
            await igClient.init();
        } catch (error) {
            logger.error("Failed to initialize Instagram client", error);
            throw error;
        }
    }
    return igClient;
};

// Füge hinzu - exportiere die page für direkten Zugriff:
export const getIgPage = async () => {
    const client = await getIgClient();
    return (client as any).page;
};

export const closeIgClient = async () => {
    if (igClient) {
        await igClient.close();
        igClient = null;
    }
};

export { scrapeFollowersHandler } from './IG-bot/IgClient'; 