import "reflect-metadata";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module.js";

async function bootstrap(): Promise<void> {
  const adapter = new FastifyAdapter({ logger: true, trustProxy: true });
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, { rawBody: true });
  const config = app.get(ConfigService);

  await app.register(helmet);
  await app.register(cors, {
    credentials: true,
    origin: [
      config.getOrThrow<string>("STOREFRONT_ORIGIN"),
      config.getOrThrow<string>("VENDOR_ORIGIN"),
      config.getOrThrow<string>("ADMIN_ORIGIN"),
    ],
  });

  const openApi = new DocumentBuilder()
    .setTitle("NISTER Marketplace API")
    .setDescription("Marketplace-only buyer, vendor, administrator and payment API")
    .setVersion("1.0")
    .addBearerAuth({ type: "http", scheme: "bearer", bearerFormat: "JWT" })
    .build();
  SwaggerModule.setup("docs", app, SwaggerModule.createDocument(app, openApi));

  app.enableShutdownHooks();
  await app.listen(config.getOrThrow<number>("PORT"), "0.0.0.0");
}

void bootstrap();
