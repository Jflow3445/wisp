import { Global, Inject, Module, OnApplicationShutdown } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  createDatabaseFromEnv,
  type Database,
  type DatabaseHandle,
} from "@nister/database";

export type PersistenceMode = "memory" | "postgres";

export const PERSISTENCE_MODE = Symbol("PERSISTENCE_MODE");
export const DATABASE = Symbol("DATABASE");
const DATABASE_HANDLE = Symbol("DATABASE_HANDLE");

export function requireDatabase(database: Database | null): Database {
  if (!database) throw new Error("PostgreSQL persistence was selected without a database handle");
  return database;
}

class DatabaseShutdown implements OnApplicationShutdown {
  constructor(@Inject(DATABASE_HANDLE) private readonly handle: DatabaseHandle | null) {}

  async onApplicationShutdown(): Promise<void> {
    await this.handle?.close();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: PERSISTENCE_MODE,
      inject: [ConfigService],
      useFactory: (config: ConfigService): PersistenceMode =>
        config.getOrThrow<PersistenceMode>("PERSISTENCE_MODE"),
    },
    {
      provide: DATABASE_HANDLE,
      inject: [PERSISTENCE_MODE],
      useFactory: (mode: PersistenceMode): DatabaseHandle | null =>
        mode === "postgres" ? createDatabaseFromEnv(process.env) : null,
    },
    {
      provide: DATABASE,
      inject: [DATABASE_HANDLE],
      useFactory: (handle: DatabaseHandle | null): Database | null => handle?.db ?? null,
    },
    DatabaseShutdown,
  ],
  exports: [PERSISTENCE_MODE, DATABASE],
})
export class PersistenceModule {}
