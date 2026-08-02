import { Controller, Get, Inject, Injectable, Module } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { PostgresReadinessRepository, type Database } from "@nister/database";
import { Public } from "../../common/auth.js";
import { ApiError } from "../../common/errors.js";
import {
  DATABASE,
  PERSISTENCE_MODE,
  PersistenceModule,
  requireDatabase,
  type PersistenceMode,
} from "../../persistence/persistence.module.js";

export interface ReadinessRepository {
  check(): Promise<Record<string, "up" | "down">>;
}

export const READINESS_REPOSITORY = Symbol("READINESS_REPOSITORY");

@Injectable()
export class InMemoryReadinessRepository implements ReadinessRepository {
  async check(): Promise<Record<string, "up" | "down">> {
    return { persistence: "up" };
  }
}

@Injectable()
export class HealthService {
  constructor(@Inject(READINESS_REPOSITORY) private readonly readiness: ReadinessRepository) {}

  live(): { status: "ok" } {
    return { status: "ok" };
  }

  async ready(): Promise<{ status: "ready"; checks: Record<string, "up" | "down"> }> {
    const checks = await this.readiness.check();
    if (Object.values(checks).some((status) => status === "down")) {
      throw new ApiError("SERVICE_TEMPORARILY_UNAVAILABLE", "A required dependency is unavailable", 503, undefined, { checks });
    }
    return { status: "ready", checks };
  }
}

@ApiTags("Health")
@Public()
@Controller("health")
export class HealthController {
  constructor(@Inject(HealthService) private readonly health: HealthService) {}

  @Get("live")
  @ApiOperation({ summary: "Process liveness" })
  live(): { status: "ok" } {
    return this.health.live();
  }

  @Get("ready")
  @ApiOperation({ summary: "Dependency readiness" })
  ready(): Promise<{ status: "ready"; checks: Record<string, "up" | "down"> }> {
    return this.health.ready();
  }
}

@Module({
  imports: [PersistenceModule],
  controllers: [HealthController],
  providers: [
    {
      provide: READINESS_REPOSITORY,
      inject: [PERSISTENCE_MODE, DATABASE],
      useFactory: (mode: PersistenceMode, database: Database | null): ReadinessRepository =>
        mode === "postgres"
          ? new PostgresReadinessRepository(requireDatabase(database))
          : new InMemoryReadinessRepository(),
    },
    HealthService,
  ],
})
export class HealthModule {}
