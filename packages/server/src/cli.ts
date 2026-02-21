import { loadServerConfigFromArgv } from "./config";
import { startScreenshotterServer } from "./server";

async function main(): Promise<void> {
  const config = loadServerConfigFromArgv(process.argv);
  const running = await startScreenshotterServer(config);
  console.log(`[screenshotter] server running at ${running.url}`);
  console.log(
    `[screenshotter] writing captures to ${config.outputRoot} (maxPayloadMB=${config.maxPayloadMB})`,
  );

  const shutdown = async (): Promise<void> => {
    await running.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(message);
  process.exit(1);
});
