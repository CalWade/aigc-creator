import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { DraftsModule } from "../drafts/drafts.module";
import { PromptsModule } from "../prompts/prompts.module";
import { ReviewsController } from "./reviews.controller";
import { ReviewsActionController } from "./reviews-action.controller";
import { ReviewService } from "./review.service";
import { StreamSessionStore } from "./stream-session";

@Module({
  imports: [AuthModule, DraftsModule, PromptsModule],
  controllers: [ReviewsController, ReviewsActionController],
  providers: [ReviewService, StreamSessionStore],
  exports: [ReviewService],
})
export class ReviewsModule {}
