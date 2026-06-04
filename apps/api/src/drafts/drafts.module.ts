import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { DraftsController } from "./drafts.controller";
import { DraftsService } from "./drafts.service";
import { OutlineService } from "./outline.service";

@Module({
  imports: [AuthModule],
  controllers: [DraftsController],
  providers: [DraftsService, OutlineService],
})
export class DraftsModule {}
