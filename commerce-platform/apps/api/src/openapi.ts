import type { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from "@nestjs/swagger";

export function createMarketplaceOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle("NISTER Marketplace API")
    .setDescription("Marketplace-only buyer, vendor, driver, administrator and payment API")
    .setVersion("1.0")
    .addBearerAuth({ type: "http", scheme: "bearer", bearerFormat: "JWT" })
    .build();

  const document = SwaggerModule.createDocument(app, config);
  return {
    ...document,
    openapi: "3.1.0",
    jsonSchemaDialect: "https://json-schema.org/draft/2020-12/schema",
  } as OpenAPIObject;
}

export function setupMarketplaceOpenApi(app: INestApplication): void {
  SwaggerModule.setup("docs", app, createMarketplaceOpenApiDocument(app));
}
