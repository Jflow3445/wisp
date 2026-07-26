import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import { ApiError } from "./errors.js";
import type { AuthenticatedRequest } from "./auth.js";

export const CurrentPrincipal = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const principal = context.switchToHttp().getRequest<AuthenticatedRequest>().principal;
  if (!principal) throw ApiError.authentication();
  return principal;
});
