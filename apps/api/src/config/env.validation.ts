import * as Joi from "joi";

/**
 * 环境变量 schema:进程启动时一次性校验,任一项缺失或类型错误立刻拒绝启动。
 *
 * 设计原则:
 * - 关键变量(PORT/JWT/DB)必填,无默认值,缺了启动失败而非走兜底。
 * - STORAGE_DRIVER=mock 时 S3_* 整组豁免(给 CI / e2e 留口)。
 * - LLM_* 必填,因为代码路径里全是 getOrThrow,提前在启动期暴露。
 * - 其它带合理默认的(JWT_EXPIRES_IN / S3_FORCE_PATH_STYLE)给默认值。
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid("development", "production", "test").default("development"),

  PORT: Joi.number().integer().min(1).max(65535).required(),

  DATABASE_URL: Joi.string()
    .uri({ scheme: ["postgresql", "postgres"] })
    .required(),

  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: Joi.string().default("7d"),

  LLM_BASE_URL: Joi.string().uri().required(),
  LLM_API_KEY: Joi.string().required(),
  LLM_MODEL: Joi.string().required(),

  STORAGE_DRIVER: Joi.string().valid("s3", "mock").default("s3"),
  S3_ENDPOINT: Joi.string().uri().when("STORAGE_DRIVER", {
    is: "s3",
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  S3_REGION: Joi.string().when("STORAGE_DRIVER", {
    is: "s3",
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  S3_BUCKET: Joi.string().when("STORAGE_DRIVER", {
    is: "s3",
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  S3_ACCESS_KEY: Joi.string().when("STORAGE_DRIVER", {
    is: "s3",
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  S3_SECRET_KEY: Joi.string().when("STORAGE_DRIVER", {
    is: "s3",
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  S3_PUBLIC_URL: Joi.string().uri().when("STORAGE_DRIVER", {
    is: "s3",
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  S3_FORCE_PATH_STYLE: Joi.string().valid("true", "false").default("true"),

  REDIS_URL: Joi.string()
    .uri({ scheme: ["redis", "rediss"] })
    .optional(),

  // ---------- 短信服务 ----------
  SMS_PROVIDER: Joi.string().valid("mock", "volcengine").default("mock"),
  SMS_ACCESS_KEY: Joi.string().optional().default(""),
  SMS_SECRET_KEY: Joi.string().optional().default(""),
  SMS_ACCOUNT: Joi.string().optional().default(""),
  SMS_SIGN_NAME: Joi.string().optional().default(""),
  SMS_TEMPLATE_CODE: Joi.string().optional().default(""),
  SMS_REGION: Joi.string().default("cn-north-1"),

  // ---------- 邮件服务 ----------
  MAIL_PROVIDER: Joi.string().valid("mock", "resend").default("mock"),
  MAIL_API_KEY: Joi.string().optional().default(""),
  MAIL_FROM: Joi.string().optional().default("noreply@example.com"),

  // 阿里云 AI 安全护栏(审核引擎专用)
  // 本地开发可不配置,审核调用会走 mock 兜底;NODE_ENV=test 同样可选。
  ALIBABA_CLOUD_ACCESS_KEY_ID: Joi.string().optional().default(""),
  ALIBABA_CLOUD_ACCESS_KEY_SECRET: Joi.string().optional().default(""),
  GUARD_ENDPOINT: Joi.string().default("green-cip.cn-shanghai.aliyuncs.com"),
  GUARD_REGION_ID: Joi.string().default("cn-shanghai"),

  // 二发热度继承开关:"true"(默认)沿用旧 PostStat;"false"清零。
  REPUBLISH_HOTNESS_INHERIT: Joi.string().valid("true", "false").default("true"),
}).unknown(true);
