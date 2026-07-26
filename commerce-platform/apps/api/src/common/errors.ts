import type { ErrorCode } from "@nister/contracts";
import type { ZodError } from "zod";

export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly statusCode: number,
    readonly fields?: Record<string, string[]>,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }

  static authentication(message = "Authentication is required"): ApiError {
    return new ApiError("AUTHENTICATION_REQUIRED", message, 401);
  }

  static permission(message = "Permission denied"): ApiError {
    return new ApiError("PERMISSION_DENIED", message, 403);
  }

  static notFound(message: string): ApiError {
    return new ApiError("RESOURCE_NOT_FOUND", message, 404);
  }

  static validation(error: ZodError): ApiError {
    const fields: Record<string, string[]> = {};
    for (const issue of error.issues) {
      const field = issue.path.join(".") || "request";
      fields[field] = [...(fields[field] ?? []), issue.message];
    }
    return new ApiError("VALIDATION_FAILED", "Request validation failed", 400, fields);
  }
}
