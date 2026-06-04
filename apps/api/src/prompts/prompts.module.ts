import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { PromptsController } from "./prompts.controller";
import { PromptsPrivateController } from "./prompts-private.controller";
import { PromptsService } from "./prompts.service";

@Module({
  imports: [AuthModule],
  // PromptsPrivateController 写在前,确保 /prompts/private 与 PATCH /prompts/:id
  // 等具体路径优先匹配,而不是被 PromptsController 的 /prompts/:id (Public) 抢走。
  controllers: [PromptsPrivateController, PromptsController],
  providers: [PromptsService],
  exports: [PromptsService],
})
export class PromptsModule {}
