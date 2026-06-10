import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DouyinTrendingService } from "./douyin.service";
import { ExternalTrendingController } from "./external-trending.controller";

@Module({
  imports: [AuthModule],
  controllers: [ExternalTrendingController],
  providers: [DouyinTrendingService],
  exports: [DouyinTrendingService],
})
export class ExternalTrendingModule {}
