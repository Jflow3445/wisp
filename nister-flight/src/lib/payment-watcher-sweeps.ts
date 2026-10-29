import { z } from "zod";
import { runMarketingAutomationSweep } from "@/lib/marketing";
import { runWaitlistLaunchEmailSweep } from "@/lib/market-waitlist";
import { sweepSubscriptionLifecycle } from "@/lib/subscription-lifecycle";

export const paymentWatchBodySchema = z.object({
  max_blocks: z.coerce.number().int().min(1).max(500).optional(),
  dry_run: z.union([z.boolean(), z.stringbool()]).optional(),
  pending_order_limit: z.coerce.number().int().min(1).max(500).optional(),
  subscription_limit: z.coerce.number().int().min(1).max(200).optional(),
  waitlist_limit: z.coerce.number().int().min(1).max(10).optional(),
});


type WaitlistSweepResult = Awaited<ReturnType<typeof runWaitlistLaunchEmailSweep>>;
type SubscriptionSweepResult = Awaited<ReturnType<typeof sweepSubscriptionLifecycle>>;
type MarketingSweepResult = Awaited<ReturnType<typeof runMarketingAutomationSweep>>;

type InternalPostPaymentSweepInput = {
  dryRun: boolean;
  waitlistLimit?: number;
  subscriptionLimit?: number;
};

type InternalPostPaymentSweepDeps = {
  runWaitlistLaunchEmailSweep: (source: "manual" | "internal", limit?: number) => Promise<WaitlistSweepResult>;
  sweepSubscriptionLifecycle: (input: { limit?: number; dryRun?: boolean }) => Promise<SubscriptionSweepResult>;
  runMarketingAutomationSweep: () => Promise<MarketingSweepResult>;
};

export type InternalPostPaymentSweepResult = {
  waitlistSweep: WaitlistSweepResult | null;
  waitlistSweepError: string | null;
  subscriptionSweep: SubscriptionSweepResult | null;
  subscriptionSweepError: string | null;
  marketingSweep: MarketingSweepResult | null;
  marketingSweepError: string | null;
};

const DEFAULT_POST_PAYMENT_SWEEP_DEPS: InternalPostPaymentSweepDeps = {
  runWaitlistLaunchEmailSweep,
  sweepSubscriptionLifecycle,
  runMarketingAutomationSweep,
};

export async function runInternalPostPaymentSweeps(
  input: InternalPostPaymentSweepInput,
  deps: InternalPostPaymentSweepDeps = DEFAULT_POST_PAYMENT_SWEEP_DEPS,
): Promise<InternalPostPaymentSweepResult> {
  let waitlistSweep: WaitlistSweepResult | null = null;
  let waitlistSweepError: string | null = null;
  let subscriptionSweep: SubscriptionSweepResult | null = null;
  let subscriptionSweepError: string | null = null;
  let marketingSweep: MarketingSweepResult | null = null;
  let marketingSweepError: string | null = null;

  if (!input.dryRun) {
    try {
      waitlistSweep = await deps.runWaitlistLaunchEmailSweep("internal", input.waitlistLimit ?? 1);
    } catch (error) {
      waitlistSweepError = error instanceof Error ? error.message : "Waitlist launch sweep failed";
    }
  }

  try {
    subscriptionSweep = await deps.sweepSubscriptionLifecycle({
      limit: input.subscriptionLimit,
      ...(input.dryRun ? { dryRun: true } : {}),
    });
  } catch (error) {
    subscriptionSweepError = error instanceof Error ? error.message : "Subscription lifecycle sweep failed";
  }

  if (!input.dryRun) {
    try {
      marketingSweep = await deps.runMarketingAutomationSweep();
    } catch (error) {
      marketingSweepError = error instanceof Error ? error.message : "Marketing automation sweep failed";
    }
  }

  return {
    waitlistSweep,
    waitlistSweepError,
    subscriptionSweep,
    subscriptionSweepError,
    marketingSweep,
    marketingSweepError,
  };
}
