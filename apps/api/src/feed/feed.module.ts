import { Module } from "@nestjs/common";
import { FeedController } from "./feed.controller";
import { PostsController } from "./posts.controller";
import { MeWorksController } from "./me.controller";
import { ReactionsController } from "./reactions.controller";
import { FeedService } from "./feed.service";
import { ReactionsService } from "./reactions.service";

@Module({
  controllers: [FeedController, PostsController, MeWorksController, ReactionsController],
  providers: [FeedService, ReactionsService],
  exports: [ReactionsService],
})
export class FeedModule {}
