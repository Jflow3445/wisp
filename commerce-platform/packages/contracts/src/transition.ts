import { z } from "zod";

export const TransitionCommandSchema = z.object({
  entityId: z.uuid(),
  expectedVersion: z.number().int().positive(),
  actorUserId: z.uuid().nullable(),
  systemActor: z.string().min(1).max(100).nullable().optional(),
  action: z.string().min(1).max(100),
  reasonCode: z.string().max(100).nullable().optional(),
  reasonText: z.string().max(2000).nullable().optional(),
  evidence: z.record(z.string(), z.unknown()).nullable().optional(),
  idempotencyKey: z.string().min(8).max(255),
  requestId: z.uuid(),
  occurredAt: z.iso.datetime(),
});

export interface TransitionResult<State extends string> {
  entityId: string;
  previousState: State;
  newState: State;
  newVersion: number;
  availableActions: string[];
  sideEffectsQueued: string[];
  ledgerTransactionReferences: string[];
  warnings: string[];
}

export type TransitionCommand = z.infer<typeof TransitionCommandSchema>;
