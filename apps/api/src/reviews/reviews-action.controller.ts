import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from "@nestjs/common";
import type { PromptReviewResponse, SectionReviewResponse } from "@aigc-creator/shared";

import { CurrentUser } from "../auth/current-user.decorator";
import type { JwtPayload } from "../auth/jwt-payload.interface";
import { UserGuard } from "../auth/user.guard";
import { ReviewService } from "./review.service";
import { ReviewPromptDto } from "./dto/review-prompt.dto";
import { ReviewSectionDto } from "./dto/review-section.dto";

@Controller("reviews")
@UseGuards(UserGuard)
export class ReviewsActionController {
  constructor(private readonly reviews: ReviewService) {}

  @Post("prompt")
  @HttpCode(HttpStatus.OK)
  reviewPrompt(@Body() body: ReviewPromptDto): Promise<PromptReviewResponse> {
    // service.reviewPrompt 是单参签名(commit 79883e1 收紧),plan 写的双参已废弃
    return this.reviews.reviewPrompt(body.text);
  }

  @Post("section")
  @HttpCode(HttpStatus.OK)
  reviewSection(
    @Body() body: ReviewSectionDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<SectionReviewResponse> {
    return this.reviews.reviewSection({
      draftId: body.draftId,
      userSub: user.sub,
      sessionId: body.sessionId,
      range: body.range,
      text: body.text,
    });
  }
}
