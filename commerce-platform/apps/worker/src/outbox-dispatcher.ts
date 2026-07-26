import type { Queue } from "bullmq";
import { stableJobId, type MarketplaceJob, type QueueName } from "./queues.js";

export interface OutboxEvent {
  id: string;
  eventType: string;
  queue: QueueName;
  requestId: string;
  payload: Record<string, unknown>;
  createdAt: Date;
  attemptCount: number;
}

export interface OutboxRepository {
  claimBatch(limit: number): Promise<OutboxEvent[]>;
  markProcessed(id: string): Promise<void>;
  markFailed(id: string, message: string): Promise<void>;
}

export type QueueRegistry = Record<QueueName, Pick<Queue<MarketplaceJob>, "add">>;

export class OutboxDispatcher {
  constructor(
    private readonly repository: OutboxRepository,
    private readonly queues: QueueRegistry,
  ) {}

  async dispatchBatch(limit = 100): Promise<{ processed: number; failed: number }> {
    const events = await this.repository.claimBatch(limit);
    let processed = 0;
    let failed = 0;

    for (const event of events) {
      try {
        await this.queues[event.queue].add(
          event.eventType,
          {
            eventId: event.id,
            requestId: event.requestId,
            occurredAt: event.createdAt.toISOString(),
            payload: event.payload,
          },
          { jobId: stableJobId(event.queue, event.id), attempts: 8, backoff: { type: "exponential", delay: 1_000 } },
        );
        await this.repository.markProcessed(event.id);
        processed += 1;
      } catch (error) {
        await this.repository.markFailed(event.id, error instanceof Error ? error.message : "Unknown dispatch error");
        failed += 1;
      }
    }
    return { processed, failed };
  }
}
