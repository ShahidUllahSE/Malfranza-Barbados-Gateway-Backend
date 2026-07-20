import { app } from "./app.js";
import { connectDatabase, disconnectDatabase } from "./config/database.js";
import { env } from "./config/env.js";

async function startServer(): Promise<void> {
  await connectDatabase();

  const server = app.listen(env.PORT, () => {
    console.log(`API listening on http://localhost:${env.PORT}`);
  });

  async function shutdown(signal: string): Promise<void> {
    console.log(`${signal} received, shutting down`);
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
  }

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

startServer().catch((error: unknown) => {
  console.error("Unable to start server", error);
  process.exit(1);
});
