import { sql } from "drizzle-orm";

import { createDatabaseFromEnv, type Database } from "./connection.js";
import { ledgerAccountSeeds, permissionSeeds, rolePermissionCodes, roleSeeds } from "./seed-data.js";
import { ledgerAccounts, permissions, rolePermissions, roles } from "./schema.js";

export const seedDatabase = async (db: Database): Promise<void> => {
  await db.transaction(async (transaction) => {
    await transaction
      .insert(permissions)
      .values(permissionSeeds)
      .onConflictDoUpdate({
        target: permissions.code,
        set: {
          name: sql`excluded.name`,
          description: sql`excluded.description`,
          riskLevel: sql`excluded.risk_level`,
        },
      });

    await transaction
      .insert(roles)
      .values([...roleSeeds])
      .onConflictDoUpdate({
        target: roles.code,
        set: {
          name: sql`excluded.name`,
          description: sql`excluded.description`,
          scopeType: sql`excluded.scope_type`,
          isSystem: sql`excluded.is_system`,
          updatedAt: sql`now()`,
        },
      });

    const roleIdByCode = new Map<string, string>(roleSeeds.map((role) => [role.code, role.id]));
    const permissionIdByCode = new Map<string, string>(
      permissionSeeds.map((permission) => [permission.code, permission.id]),
    );
    const assignments = Object.entries(rolePermissionCodes).flatMap(([roleCode, permissionCodes]) =>
      permissionCodes.map((permissionCode) => ({
        roleId: roleIdByCode.get(roleCode)!,
        permissionId: permissionIdByCode.get(permissionCode)!,
      })),
    );

    await transaction.insert(rolePermissions).values(assignments).onConflictDoNothing();
    await transaction.insert(ledgerAccounts).values(ledgerAccountSeeds).onConflictDoNothing();
  });
};

const isExecutedDirectly = process.argv[1] && new URL(import.meta.url).pathname === process.argv[1];

if (isExecutedDirectly) {
  const connection = createDatabaseFromEnv();
  try {
    await seedDatabase(connection.db);
  } finally {
    await connection.close();
  }
}
