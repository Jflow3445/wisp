import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { describe, expect, it } from "vitest";
import {
  Auth0AuthenticationAdapter,
  DevelopmentAuthenticationAdapter,
  RequirePermissions,
  ScopedPermissionGuard,
  VendorScoped,
  type AuthenticatedPrincipal,
} from "./auth.js";
import type { MarketplaceRequest } from "./http.js";

const userId = "11111111-1111-4111-8111-111111111111";
const vendorId = "22222222-2222-4222-8222-222222222222";

function request(headers: Record<string, string>): MarketplaceRequest {
  return { headers } as unknown as MarketplaceRequest;
}

function contextFor(principal: AuthenticatedPrincipal, scopedVendorId: string): ExecutionContext {
  class Controller {
    @RequirePermissions("vendor:orders:read")
    @VendorScoped()
    handler(): void {}
  }
  const handler = Controller.prototype.handler;
  return {
    getHandler: () => handler,
    getClass: () => Controller,
    switchToHttp: () => ({
      getRequest: () => ({ principal, params: { vendorId: scopedVendorId } }),
    }),
  } as unknown as ExecutionContext;
}

describe("authentication and authorization", () => {
  it("creates an explicit development principal from request headers", async () => {
    const principal = await new DevelopmentAuthenticationAdapter().authenticate(request({
      "x-dev-user-id": userId,
      "x-dev-email": "buyer@example.com",
      "x-dev-permissions": "cart:read, cart:write",
      "x-dev-vendor-ids": vendorId,
    }));
    expect(principal).toMatchObject({ userId, email: "buyer@example.com", vendorIds: [vendorId] });
    expect(principal.permissions).toEqual(["cart:read", "cart:write"]);
  });

  it("rejects missing development identity", async () => {
    await expect(new DevelopmentAuthenticationAdapter().authenticate(request({}))).rejects.toMatchObject({
      code: "AUTHENTICATION_REQUIRED",
    });
  });

  it("maps verified Auth0 claims through the OIDC adapter boundary", async () => {
    const adapter = new Auth0AuthenticationAdapter({
      verify: async () => ({
        sub: "auth0|buyer-1",
        email: "buyer@example.com",
        permissions: ["cart:read"],
        "https://nister.org/user_id": userId,
        "https://nister.org/vendor_ids": [vendorId],
      }),
    });
    await expect(adapter.authenticate(request({ authorization: "Bearer signed-token" }))).resolves.toMatchObject({
      subject: "auth0|buyer-1",
      userId,
      permissions: ["cart:read"],
      vendorIds: [vendorId],
      authenticationMode: "auth0",
    });
  });

  it("requires both permission and matching vendor scope", () => {
    const guard = new ScopedPermissionGuard(new Reflector());
    const principal: AuthenticatedPrincipal = {
      subject: `development|${userId}`,
      userId,
      permissions: ["vendor:orders:read"],
      roles: [],
      vendorIds: [vendorId],
      authenticationMode: "development",
    };
    expect(guard.canActivate(contextFor(principal, vendorId))).toBe(true);
    expect(() => guard.canActivate(contextFor(principal, "33333333-3333-4333-8333-333333333333"))).toThrowError(
      expect.objectContaining({ code: "PERMISSION_DENIED" }),
    );
  });
});
