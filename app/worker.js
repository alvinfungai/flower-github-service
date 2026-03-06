import cron from "node-cron"

import { updateAllProjectMetadata } from "./sync.js"

console.log("Worker started...");

cron.schedule("0 */6 * * *", async () => {
  await updateAllProjectMetadata();
});

// Optional: run immediately on startup
updateAllProjectMetadata();