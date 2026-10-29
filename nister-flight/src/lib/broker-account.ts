import { AgentStatus, BrokerAccountMode, BrokerAccountStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type UpsertPrimaryBrokerAccountInput = {
  userId: string;
  brokerOptionId: string;
  brokerName: string;
  brokerServer: string;
  accountLogin: string;
  accountMode: BrokerAccountMode;
};

type UpsertPrimaryBrokerAccountResult = {
  brokerAccountId: string;
  operation: "created" | "updated";
};

function mergeConnectionDetails(
  baseValue: Prisma.JsonValue | null | undefined,
  input: {
    brokerServer: string;
    accountLogin: string;
    accountMode: BrokerAccountMode;
  },
) {
  const base =
    baseValue && typeof baseValue === "object" && !Array.isArray(baseValue)
      ? (baseValue as Record<string, unknown>)
      : {};

  return {
    ...base,
    brokerAccountNumber: input.accountLogin,
    brokerServer: input.brokerServer,
    brokerAccountType: input.accountMode === BrokerAccountMode.REAL ? "Live" : "Demo",
  } as Prisma.InputJsonValue;
}

export async function upsertPrimaryBrokerAccount(
  input: UpsertPrimaryBrokerAccountInput,
): Promise<UpsertPrimaryBrokerAccountResult> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.brokerAccount.findFirst({
      where: {
        userId: input.userId,
        brokerServer: input.brokerServer,
        accountLogin: input.accountLogin,
      },
      select: {
        id: true,
      },
    });

    const existingAny = existing
      ? null
      : await tx.brokerAccount.findFirst({
          where: {
            userId: input.userId,
          },
          orderBy: [{ createdAt: "desc" }],
          select: {
            id: true,
          },
        });

    const targetAccountId = existing?.id || existingAny?.id || null;
    const operation: "created" | "updated" = targetAccountId ? "updated" : "created";

    const brokerAccount = targetAccountId
      ? await tx.brokerAccount.update({
          where: {
            id: targetAccountId,
          },
          data: {
            brokerName: input.brokerName,
            brokerServer: input.brokerServer,
            accountLogin: input.accountLogin,
            accountMode: input.accountMode,
            isActive: true,
            status: BrokerAccountStatus.ACTIVE,
          },
          select: {
            id: true,
          },
        })
      : await tx.brokerAccount.create({
          data: {
            userId: input.userId,
            brokerName: input.brokerName,
            brokerServer: input.brokerServer,
            accountLogin: input.accountLogin,
            accountMode: input.accountMode,
            status: BrokerAccountStatus.ACTIVE,
            isActive: true,
          },
          select: {
            id: true,
          },
        });

    await tx.brokerAccount.updateMany({
      where: {
        userId: input.userId,
        id: {
          not: brokerAccount.id,
        },
      },
      data: {
        isActive: false,
        status: BrokerAccountStatus.DISABLED,
      },
    });

    await tx.userPolicy.upsert({
      where: {
        brokerAccountId: brokerAccount.id,
      },
      update: {
        userId: input.userId,
      },
      create: {
        userId: input.userId,
        brokerAccountId: brokerAccount.id,
        policyVersion: 1,
        aiEnabled: true,
        closeOnlyMode: false,
        manualApprovalMode: false,
        maxRiskPerTradePct: 1.0,
        maxDailyLossPct: 5.0,
        maxOpenTradesTotal: 0,
        maxOpenTradesPerSymbol: 0,
        maxSpreadPoints: 20,
        maxSlippagePoints: 25,
        weekendTradingAllowed: false,
      },
    });

    const existingPreference = await tx.userPreference.findUnique({
      where: {
        userId: input.userId,
      },
      select: {
        preferredBrokerId: true,
        tradingGoal: true,
        experienceLevel: true,
        connectionDetails: true,
      },
    });

    const mergedConnectionDetails = mergeConnectionDetails(existingPreference?.connectionDetails, {
      brokerServer: input.brokerServer,
      accountLogin: input.accountLogin,
      accountMode: input.accountMode,
    });

    await tx.userPreference.upsert({
      where: {
        userId: input.userId,
      },
      update: {
        preferredBrokerId: input.brokerOptionId,
        connectionDetails: mergedConnectionDetails,
      },
      create: {
        userId: input.userId,
        preferredBrokerId: input.brokerOptionId,
        tradingGoal: existingPreference?.tradingGoal ?? null,
        experienceLevel: existingPreference?.experienceLevel ?? null,
        connectionDetails: mergedConnectionDetails,
      },
    });

    const otherAccounts = await tx.brokerAccount.findMany({
      where: {
        userId: input.userId,
        id: {
          not: brokerAccount.id,
        },
      },
      select: {
        id: true,
      },
    });
    const otherAccountIds = otherAccounts.map((row) => row.id);

    if (otherAccountIds.length) {
      const now = new Date();
      const retiredAgents = await tx.agent.findMany({
        where: {
          brokerAccountId: {
            in: otherAccountIds,
          },
        },
        select: {
          id: true,
        },
      });
      const retiredAgentIds = retiredAgents.map((agent) => agent.id);

      if (retiredAgentIds.length) {
        await tx.agentSecret.updateMany({
          where: {
            agentId: {
              in: retiredAgentIds,
            },
            active: true,
          },
          data: {
            active: false,
          },
        });

        await tx.agentSession.updateMany({
          where: {
            agentId: {
              in: retiredAgentIds,
            },
            revokedAt: null,
          },
          data: {
            revokedAt: now,
          },
        });

        await tx.agent.updateMany({
          where: {
            id: {
              in: retiredAgentIds,
            },
            status: {
              in: [AgentStatus.ACTIVE, AgentStatus.STANDBY, AgentStatus.BLOCKED],
            },
          },
          data: {
            status: AgentStatus.REVOKED,
            isExecutionLeader: false,
          },
        });
      }

      await tx.enrollmentToken.updateMany({
        where: {
          brokerAccountId: {
            in: otherAccountIds,
          },
          usedAt: null,
          expiresAt: {
            gt: now,
          },
        },
        data: {
          expiresAt: now,
        },
      });
    }

    return {
      brokerAccountId: brokerAccount.id,
      operation,
    };
  });
}
