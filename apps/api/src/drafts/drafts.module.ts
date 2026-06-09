import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { PromptsModule } from "../prompts/prompts.module";
import { DraftsController } from "./drafts.controller";
import { DraftsService } from "./drafts.service";
import { OutlineService } from "./outline.service";
import { SectionsService } from "./sections.service";
import { ToolsService } from "./tools.service";
import { VersionsController } from "./versions/versions.controller";
import { VersionsService } from "./versions/versions.service";

@Module({
  imports: [AuthModule, PromptsModule, NotificationsModule],
  controllers: [DraftsController, VersionsController],
  providers: [DraftsService, OutlineService, SectionsService, ToolsService, VersionsService],
  exports: [DraftsService],
})
export class DraftsModule {}
