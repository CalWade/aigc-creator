import { Module } from "@nestjs/common";
import { FeedController } from "./feed.controller";
import { PostsController } from "./posts.controller";
import { MeWorksController } from "./me.controller";
import { FeedService } from "./feed.service";

@Module({
  controllers: [FeedController, PostsController, MeWorksController],
  providers: [FeedService],
})
export class FeedModule {}
