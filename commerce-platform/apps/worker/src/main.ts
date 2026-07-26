import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { queueNames, type MarketplaceJob, type QueueName } from "./queues.js";

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
  throw new Error("REDIS_URL is required");
}

const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
const queues = Object.fromEntries(queueNames.map((name) => [name, new Queue<MarketplaceJob>(name, { connection })])) as Record<
  QueueName,
  Queue<MarketplaceJob>
>;

const workers = queueNames
  .filter((name) => name !== "outbox")
  .map(
    (name) =>
      new Worker<MarketplaceJob>(
        name,
        async (job) => {
          // Domain processors are registered by event type as their modules land.
          process.stdout.write(
            `${JSON.stringify({ level: "info", queue: name, job: job.name, eventId: job.data.eventId, requestId: job.data.requestId })}\n`,
          );
        },
        { connection, concurrency: name === "delivery" ? 25 : 10 },
      ),
  );

async function shutdown(signal: string) {
  process.stdout.write(`${JSON.stringify({ level: "info", message: "worker shutdown", signal })}\n`);
  await Promise.all([...workers.map((worker) => worker.close()), ...Object.values(queues).map((queue) => queue.close())]);
  await connection.quit();
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));
