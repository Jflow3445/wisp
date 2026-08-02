import {
  CanActivate,
  ExecutionContext,
  Global,
  Inject,
  Injectable,
  Module,
  SetMetadata,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { APP_GUARD, Reflector } from "@nestjs/core";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { z } from "zod";
import { ApiError } from "./errors.js";
import type { MarketplaceRequest } from "./http.js";

export interface AuthenticatedPrincipal {
  subject: string;
  userId: string;
  email?: string;
  permissions: string[];
  roles: string[];
  vendorIds: string[];
  authenticationMode: "development" | "auth0";
}

export interface AuthenticatedRequest extends MarketplaceRequest {
  principal?: AuthenticatedPrincipal;
}

export interface AuthenticationAdapter {
  authenticate(request: MarketplaceRequest): Promise<AuthenticatedPrincipal>;
}

export const AUTHENTICATION_ADAPTER = Symbol("AUTHENTICATION_ADAPTER");
const PUBLIC_ROUTE = Symbol("PUBLIC_ROUTE");
const REQUIRED_PERMISSIONS = Symbol("REQUIRED_PERMISSIONS");
const VENDOR_SCOPE_PARAMETER = Symbol("VENDOR_SCOPE_PARAMETER");

export const Public = () => SetMetadata(PUBLIC_ROUTE, true);
export const RequirePermissions = (...permissions: string[]) => SetMetadata(REQUIRED_PERMISSIONS, permissions);
export const VendorScoped = (parameter = "vendorId") => SetMetadata(VENDOR_SCOPE_PARAMETER, parameter);

function singleHeader(request: MarketplaceRequest, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function commaSeparatedHeader(request: MarketplaceRequest, name: string): string[] {
  return (singleHeader(request, name) ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export class DevelopmentAuthenticationAdapter implements AuthenticationAdapter {
  async authenticate(request: MarketplaceRequest): Promise<AuthenticatedPrincipal> {
    const userId = singleHeader(request, "x-dev-user-id");
    const parsedUserId = z.uuid().safeParse(userId);
    if (!parsedUserId.success) {
      throw ApiError.authentication("A valid x-dev-user-id header is required in development mode");
    }

    const vendorIds = commaSeparatedHeader(request, "x-dev-vendor-ids");
    if (vendorIds.some((vendorId) => !z.uuid().safeParse(vendorId).success)) {
      throw new ApiError("VALIDATION_FAILED", "x-dev-vendor-ids contains an invalid UUID", 400);
    }

    return {
      subject: `development|${parsedUserId.data}`,
      userId: parsedUserId.data,
      email: singleHeader(request, "x-dev-email"),
      permissions: commaSeparatedHeader(request, "x-dev-permissions"),
      roles: commaSeparatedHeader(request, "x-dev-roles"),
      vendorIds,
      authenticationMode: "development",
    };
  }
}

export interface OidcTokenVerifier {
  verify(token: string): Promise<JWTPayload>;
}

class Auth0TokenVerifier implements OidcTokenVerifier {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;

  constructor(
    private readonly issuer: string,
    private readonly audience: string,
  ) {
    const issuerUrl = issuer.endsWith("/") ? issuer : `${issuer}/`;
    this.jwks = createRemoteJWKSet(new URL(".well-known/jwks.json", issuerUrl));
  }

  async verify(token: string): Promise<JWTPayload> {
    const result = await jwtVerify(token, this.jwks, { issuer: this.issuer, audience: this.audience });
    return result.payload;
  }
}

function stringArrayClaim(payload: JWTPayload, claim: string): string[] {
  const value = payload[claim];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export class Auth0AuthenticationAdapter implements AuthenticationAdapter {
  constructor(private readonly verifier: OidcTokenVerifier) {}

  static create(issuer: string, audience: string): Auth0AuthenticationAdapter {
    return new Auth0AuthenticationAdapter(new Auth0TokenVerifier(issuer, audience));
  }

  async authenticate(request: MarketplaceRequest): Promise<AuthenticatedPrincipal> {
    const authorization = singleHeader(request, "authorization");
    const match = /^Bearer\s+(.+)$/i.exec(authorization ?? "");
    if (!match?.[1]) throw ApiError.authentication();

    try {
      const payload = await this.verifier.verify(match[1]);
      if (!payload.sub) throw ApiError.authentication("The access token has no subject");
      const userIdClaim = payload["https://nister.org/user_id"];
      const emailClaim = payload.email;
      return {
        subject: payload.sub,
        userId: typeof userIdClaim === "string" ? userIdClaim : payload.sub,
        ...(typeof emailClaim === "string" ? { email: emailClaim } : {}),
        permissions: stringArrayClaim(payload, "permissions"),
        roles: stringArrayClaim(payload, "https://nister.org/roles"),
        vendorIds: stringArrayClaim(payload, "https://nister.org/vendor_ids"),
        authenticationMode: "auth0",
      };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw ApiError.authentication("The access token is invalid or expired");
    }
  }
}

@Injectable()
export class AuthenticationGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AUTHENTICATION_ADAPTER) private readonly adapter: AuthenticationAdapter,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    request.principal = await this.adapter.authenticate(request);
    return true;
  }
}

function grantsPermission(granted: readonly string[], required: string): boolean {
  return granted.some((permission) => {
    if (permission === "*" || permission === required) return true;
    if (!permission.endsWith(":*")) return false;
    return required.startsWith(permission.slice(0, -1));
  });
}

@Injectable()
export class ScopedPermissionGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS, [
      context.getHandler(),
      context.getClass(),
    ]) ?? [];
    const vendorParameter = this.reflector.getAllAndOverride<string>(VENDOR_SCOPE_PARAMETER, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required.length === 0 && !vendorParameter) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const principal = request.principal;
    if (!principal) throw ApiError.authentication();
    if (!required.every((permission) => grantsPermission(principal.permissions, permission))) {
      throw ApiError.permission("The authenticated user lacks a required permission");
    }

    if (vendorParameter && !grantsPermission(principal.permissions, "vendor:scope:any")) {
      const scopedVendorId = (request.params as Record<string, unknown> | undefined)?.[vendorParameter];
      if (typeof scopedVendorId !== "string" || !principal.vendorIds.includes(scopedVendorId)) {
        throw ApiError.permission("The authenticated user is outside this vendor scope");
      }
    }
    return true;
  }
}

@Global()
@Module({
  providers: [
    {
      provide: AUTHENTICATION_ADAPTER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): AuthenticationAdapter => {
        if (config.getOrThrow<string>("AUTH_MODE") === "development") {
          return new DevelopmentAuthenticationAdapter();
        }
        return Auth0AuthenticationAdapter.create(
          config.getOrThrow<string>("AUTH0_ISSUER_BASE_URL"),
          config.getOrThrow<string>("AUTH0_AUDIENCE"),
        );
      },
    },
    { provide: APP_GUARD, useClass: AuthenticationGuard },
    { provide: APP_GUARD, useClass: ScopedPermissionGuard },
  ],
  exports: [AUTHENTICATION_ADAPTER],
})
export class AuthModule {}
