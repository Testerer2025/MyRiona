import dotenv from "dotenv";
import logger from "./config/logger";
import { shutdown } from "./services";
import app from "./app";
import { initAgent } from "./Agent/index";
import { testPhase1 } from './test/workerTestPhase1';

dotenv.config();

async function startServer() {
   try {
    // TEST PHASE 1
    await testPhase1();
    
    await initAgent();
  } catch (err) {
    logger.error("Error during agent initialization:", err);
    process.exit(1);
  }
  try {
    await initAgent();
  } catch (err) {
    logger.error("Error during agent initialization:", err);
    process.exit(1);
  }

  const server = app.listen(process.env.PORT || 3000, () => {
    logger.info(`Server is running on port ${process.env.PORT || 3000}`);
  });

  process.on("SIGTERM", () => {
    logger.info("Received SIGTERM signal.");
    shutdown(server);
  });
  process.on("SIGINT", () => {
    logger.info("Received SIGINT signal.");
    shutdown(server);
  });
}

startServer();
