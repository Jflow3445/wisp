export const queueNames = [
  "notifications",
  "payments",
  "search-index",
  "images",
  "payouts",
  "reporting",
  "delivery",
  "reconciliation",
  "outbox",
] as const;

export type QueueName = (typeof queueNames)[number];

export interface MarketplaceJob<T extends Record<string, unknown> = Record<string, unknown>> {
  eventId: string;
  requestId: string;
  occurredAt: string;
  payload: T;
}

export function stableJobId(queue: QueueName, eventId: string): string {
  return `${queue}:${eventId}`;
}
