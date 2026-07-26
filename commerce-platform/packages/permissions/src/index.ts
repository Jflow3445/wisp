export type PermissionScope = "GLOBAL" | "COUNTRY" | "REGION" | "VENDOR" | "STORE" | "SELF" | "ASSIGNED_RECORDS";

export interface PermissionGrant {
  permission: string;
  scope: PermissionScope;
  scopeId?: string;
}

export interface Principal {
  userId: string;
  status: "ACTIVE" | "RESTRICTED" | "SUSPENDED" | "DEACTIVATED";
  grants: readonly PermissionGrant[];
  vendorIds: readonly string[];
  storeIds: readonly string[];
}

export interface ResourceScope {
  ownerUserId?: string;
  countryCode?: string;
  region?: string;
  vendorId?: string;
  storeId?: string;
  assignedUserId?: string;
}

function scopeMatches(principal: Principal, grant: PermissionGrant, resource: ResourceScope): boolean {
  switch (grant.scope) {
    case "GLOBAL":
      return true;
    case "SELF":
      return resource.ownerUserId === principal.userId;
    case "ASSIGNED_RECORDS":
      return resource.assignedUserId === principal.userId;
    case "COUNTRY":
      return Boolean(resource.countryCode && grant.scopeId === resource.countryCode);
    case "REGION":
      return Boolean(resource.region && grant.scopeId === resource.region);
    case "VENDOR":
      return Boolean(resource.vendorId && grant.scopeId === resource.vendorId && principal.vendorIds.includes(resource.vendorId));
    case "STORE":
      return Boolean(resource.storeId && grant.scopeId === resource.storeId && principal.storeIds.includes(resource.storeId));
  }
}

export function can(principal: Principal, permission: string, resource: ResourceScope = {}): boolean {
  if (principal.status !== "ACTIVE") {
    return false;
  }
  return principal.grants.some((grant) => grant.permission === permission && scopeMatches(principal, grant, resource));
}

export function requirePermission(principal: Principal, permission: string, resource: ResourceScope = {}): void {
  if (!can(principal, permission, resource)) {
    throw new Error(`PERMISSION_DENIED:${permission}`);
  }
}
