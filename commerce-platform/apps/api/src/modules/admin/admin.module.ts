import { Controller, Get, Inject, Injectable, Module } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { PostgresAdminOverviewRepository, type Database } from "@nister/database";
import { RequirePermissions } from "../../common/auth.js";
import {
  DATABASE,
  PERSISTENCE_MODE,
  PersistenceModule,
  requireDatabase,
  type PersistenceMode,
} from "../../persistence/persistence.module.js";

export interface AdminOverview {
  generatedAt: string;
  users: { active: number; restricted: number };
  vendors: { pendingReview: number; active: number; suspended: number };
  orders: { awaitingVendor: number; processing: number; attentionRequired: number };
  payments: { pending: number; underReview: number };
}

export interface AdminOverviewRepository {
  readOverview(): Promise<AdminOverview>;
}

export const ADMIN_OVERVIEW_REPOSITORY = Symbol("ADMIN_OVERVIEW_REPOSITORY");

@Injectable()
export class InMemoryAdminOverviewRepository implements AdminOverviewRepository {
  async readOverview(): Promise<AdminOverview> {
    return {
      generatedAt: new Date().toISOString(),
      users: { active: 0, restricted: 0 },
      vendors: { pendingReview: 0, active: 0, suspended: 0 },
      orders: { awaitingVendor: 0, processing: 0, attentionRequired: 0 },
      payments: { pending: 0, underReview: 0 },
    };
  }
}

@Injectable()
export class AdminOverviewService {
  constructor(@Inject(ADMIN_OVERVIEW_REPOSITORY) private readonly repository: AdminOverviewRepository) {}
  read(): Promise<AdminOverview> {
    return this.repository.readOverview();
  }
}

@ApiTags("Administration")
@ApiBearerAuth()
@Controller("api/v1/admin")
export class AdminController {
  constructor(private readonly overview: AdminOverviewService) {}

  @Get("overview")
  @RequirePermissions("admin:overview:read")
  @ApiOperation({ summary: "Read marketplace operational overview counts" })
  readOverview(): Promise<AdminOverview> {
    return this.overview.read();
  }
}

@Module({
  imports: [PersistenceModule],
  controllers: [AdminController],
  providers: [
    {
      provide: ADMIN_OVERVIEW_REPOSITORY,
      inject: [PERSISTENCE_MODE, DATABASE],
      useFactory: (mode: PersistenceMode, database: Database | null): AdminOverviewRepository =>
        mode === "postgres"
          ? new PostgresAdminOverviewRepository(requireDatabase(database))
          : new InMemoryAdminOverviewRepository(),
    },
    AdminOverviewService,
  ],
})
export class AdminModule {}
