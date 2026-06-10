import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { join } from "node:path";

import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { AdminModule } from "./admin/admin.module";
import { AnalyticsModule } from "./analytics/analytics.module";
import { AssetsModule } from "./assets/assets.module";
import { AuthModule } from "./auth/auth.module";
import { JwtAuthGuard } from "./auth/jwt-auth.guard";
import { PrismaKnownRequestFilter } from "./common/filters/prisma-known-request.filter";
import { envValidationSchema } from "./config/env.validation";
import { DraftsModule } from "./drafts/drafts.module";
import { ExternalTrendingModule } from "./external-trending/external-trending.module";
import { FeedModule } from "./feed/feed.module";
import { LlmModule } from "./llm/llm.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { PrismaModule } from "./prisma/prisma.module";
import { PromptsModule } from "./prompts/prompts.module";
import { ReportsModule } from "./reports/reports.module";
import { ReviewsModule } from "./reviews/reviews.module";

// envFilePath 锚定到 apps/api/.env(相对源文件,不依赖 process.cwd()),
// 杜绝"从仓库根 vs 从 apps/api 启动"导致的环境漂移。
const API_ENV_PATH = join(__dirname, "..", ".env");

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: API_ENV_PATH,
      validationSchema: envValidationSchema,
      validationOptions: { abortEarly: false, allowUnknown: true },
    }),
    PrismaModule,
    AuthModule,
    DraftsModule,
    PromptsModule,
    LlmModule,
    ReviewsModule,
    ReportsModule,
    FeedModule,
    AssetsModule,
    AnalyticsModule,
    NotificationsModule,
    AdminModule,
    ExternalTrendingModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_FILTER, useClass: PrismaKnownRequestFilter },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
