import {
  ArgumentsHost,
  CallHandler,
  Catch,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
  PipeTransform,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { ErrorResponse, ListResponse, ObjectResponse } from "@nister/contracts";
import { RequestIdSchema } from "@nister/contracts";
import { PersistenceError } from "@nister/database";
import { StateTransitionError } from "@nister/state-machines";
import type { FastifyReply, FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { Observable, map } from "rxjs";
import type { ZodType } from "zod";
import { ZodError } from "zod";
import { ApiError } from "./errors.js";

export interface MarketplaceRequest extends FastifyRequest {
  marketplaceRequestId?: string;
}

export interface PageResult<T> {
  items: T[];
  pagination: Omit<ListResponse<T>["pagination"], never>;
}

const RESPONSE_KIND = Symbol("response-kind");
type ResponseKind = "object" | "list" | "none";

export const ListEnvelope = () => SetMetadata(RESPONSE_KIND, "list" satisfies ResponseKind);
export const NoEnvelope = () => SetMetadata(RESPONSE_KIND, "none" satisfies ResponseKind);

export function requestIdFor(request: MarketplaceRequest): string {
  if (request.marketplaceRequestId) return request.marketplaceRequestId;
  const supplied = Array.isArray(request.headers["x-request-id"])
    ? request.headers["x-request-id"][0]
    : request.headers["x-request-id"];
  const parsed = RequestIdSchema.safeParse(supplied);
  request.marketplaceRequestId = parsed.success ? parsed.data : randomUUID();
  return request.marketplaceRequestId;
}

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}

  transform(value: unknown): unknown {
    const result = this.schema.safeParse(value);
    if (!result.success) throw ApiError.validation(result.error);
    return result.data;
  }
}

@Injectable()
export class ApiEnvelopeInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<MarketplaceRequest>();
    const reply = context.switchToHttp().getResponse<FastifyReply>();
    const requestId = requestIdFor(request);
    reply.header("x-request-id", requestId);
    const kind = this.reflector.getAllAndOverride<ResponseKind>(RESPONSE_KIND, [context.getHandler(), context.getClass()]) ?? "object";

    return next.handle().pipe(
      map((value: unknown) => {
        if (kind === "none") return value;
        const meta = { requestId, timestamp: new Date().toISOString() };
        if (kind === "list") {
          const page = value as PageResult<unknown>;
          return { data: page.items, pagination: page.pagination, meta } satisfies ListResponse<unknown>;
        }
        return { data: value ?? null, meta } satisfies ObjectResponse<unknown>;
      }),
    );
  }
}

@Catch()
export class ApiExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const request = host.switchToHttp().getRequest<MarketplaceRequest>();
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    const requestId = requestIdFor(request);
    reply.header("x-request-id", requestId);

    let statusCode = 500;
    let code = "SERVICE_TEMPORARILY_UNAVAILABLE";
    let message = "The service could not complete the request";
    let fields: Record<string, string[]> | undefined;
    let details: Record<string, unknown> | undefined;

    if (exception instanceof ApiError) {
      ({ statusCode, code, message, fields, details } = exception);
    } else if (exception instanceof PersistenceError) {
      ({ statusCode, code, message, details } = exception);
    } else if (exception instanceof ZodError) {
      const validationError = ApiError.validation(exception);
      ({ statusCode, code, message, fields } = validationError);
    } else if (exception instanceof StateTransitionError) {
      statusCode = 409;
      code = exception.code;
      message = exception.message;
    } else if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      code = statusCode === 404 ? "RESOURCE_NOT_FOUND" : "VALIDATION_FAILED";
      message = exception.message;
    }

    const response: ErrorResponse = {
      error: { code, message, requestId },
    };
    if (fields) response.error.fields = fields;
    if (details) response.error.details = details;
    reply.status(statusCode).send(response);
  }
}
