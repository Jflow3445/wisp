import { Module } from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR } from "@nestjs/core";
import { AuthModule } from "./common/auth.js";
import { ApiExceptionFilter, ApiEnvelopeInterceptor } from "./common/http.js";
import { IdempotencyModule } from "./common/idempotency.js";
import { AppConfigModule } from "./config/config.module.js";
import { AdminModule } from "./modules/admin/admin.module.js";
import { CartModule } from "./modules/cart/cart.module.js";
import { CatalogueModule } from "./modules/catalogue/catalogue.module.js";
import { CheckoutModule } from "./modules/checkout/checkout.module.js";
import { DriverModule } from "./modules/driver/driver.module.js";
import { HealthModule } from "./modules/health/health.module.js";
import { PaymentsModule } from "./modules/payments/payments.module.js";
import { VendorModule } from "./modules/vendor/vendor.module.js";
import { PersistenceModule } from "./persistence/persistence.module.js";

@Module({
  imports: [
    AppConfigModule,
    PersistenceModule,
    AuthModule,
    IdempotencyModule,
    CatalogueModule,
    CartModule,
    CheckoutModule,
    PaymentsModule,
    VendorModule,
    DriverModule,
    AdminModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: ApiEnvelopeInterceptor },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
})
export class AppModule {}
