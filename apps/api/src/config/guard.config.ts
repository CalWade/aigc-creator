import type { ConfigService } from "@nestjs/config";

/**
 * 阿里云 AI 安全护栏(MultiModalGuard)运行时配置。
 * 来源:ALIBABA_CLOUD_ACCESS_KEY_ID / ALIBABA_CLOUD_ACCESS_KEY_SECRET / GUARD_ENDPOINT / GUARD_REGION_ID。
 */
export interface GuardConfig {
  accessKeyId: string;
  accessKeySecret: string;
  endpoint: string;
  regionId: string;
}

export function getGuardConfig(cs: ConfigService): GuardConfig {
  return {
    accessKeyId: cs.get<string>("ALIBABA_CLOUD_ACCESS_KEY_ID") ?? "",
    accessKeySecret: cs.get<string>("ALIBABA_CLOUD_ACCESS_KEY_SECRET") ?? "",
    endpoint: cs.get<string>("GUARD_ENDPOINT") ?? "green-cip.cn-shanghai.aliyuncs.com",
    regionId: cs.get<string>("GUARD_REGION_ID") ?? "cn-shanghai",
  };
}
