import { Global, Module } from "@nestjs/common";
import { ConfigModule as NestConfigModule } from "@nestjs/config";
import { fileURLToPath } from "node:url";
import { validateEnvironment } from "./environment.js";

@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      cache: true,
      envFilePath: [
        fileURLToPath(new URL("../../../../.env", import.meta.url)),
        fileURLToPath(new URL("../../.env", import.meta.url)),
      ],
      isGlobal: true,
      validate: validateEnvironment,
    }),
  ],
})
export class AppConfigModule {}
