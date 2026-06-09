import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { DraftsModule } from "../drafts/drafts.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { PromptsModule } from "../prompts/prompts.module";
import { ReviewsController } from "./reviews.controller";
import { ReviewsActionController } from "./reviews-action.controller";
import { SafeRewriteController } from "./safe-rewrite.controller";
import { ReviewService } from "./review.service";
import { SafeRewriteService } from "./safe-rewrite.service";
import { StreamSessionStore } from "./stream-session";

@Module({
  imports: [AuthModule, DraftsModule, PromptsModule, NotificationsModule],
  controllers: [ReviewsController, ReviewsActionController, SafeRewriteController],
  providers: [ReviewService, StreamSessionStore, SafeRewriteService],
  exports: [ReviewService],
})
export class ReviewsModule {}
