import { Module } from "@nestjs/common";

import { AdminContentController } from "./admin-content.controller";
import { AdminContentService } from "./admin-content.service";
import { SampleAuditController } from "./sample-audit/sample-audit.controller";
import { SampleAuditService } from "./sample-audit/sample-audit.service";
import { RuleRecheckController } from "./rule-recheck/rule-recheck.controller";
import { RuleRecheckService } from "./rule-recheck/rule-recheck.service";
import { ReviewsModule } from "../reviews/reviews.module";

@Module({
  imports: [ReviewsModule],
  controllers: [AdminContentController, SampleAuditController, RuleRecheckController],
  providers: [AdminContentService, SampleAuditService, RuleRecheckService],
  exports: [AdminContentService],
})
export class AdminModule {}
