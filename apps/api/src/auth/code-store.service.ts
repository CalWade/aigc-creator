import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

const KEY_PREFIX = "auth:code:";
const CODE_TTL_SECONDS = 300; // 5 min

@Injectable()
export class CodeStoreService {
  private readonly logger = new Logger(CodeStoreService.name);
  private readonly redis: Redis | null = null;
  /** Redis 不可用时的进程内 fallback（开发 / CI） */
  private readonly fallback = new Map<string, { code: string; expiresAt: number }>();

  constructor(private readonly config: ConfigService) {
    const url = this.config.get<string>("REDIS_URL");
    if (url) {
      this.redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 2 });
      this.redis.on("error", (err) => this.logger.warn(`Redis error: ${err.message}`));
    } else {
      this.logger.log("REDIS_URL not set, using in-memory code store (dev/CI only)");
    }
  }

  async set(key: string, code: string): Promise<void> {
    const fullKey = `${KEY_PREFIX}${key}`;
    if (this.redis) {
      await this.redis.set(fullKey, code, "EX", CODE_TTL_SECONDS);
    } else {
      this.fallback.set(key, { code, expiresAt: Date.now() + CODE_TTL_SECONDS * 1000 });
    }
  }

  async get(key: string): Promise<string | null> {
    const fullKey = `${KEY_PREFIX}${key}`;
    if (this.redis) {
      return this.redis.get(fullKey);
    }
    const entry = this.fallback.get(key);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      this.fallback.delete(key);
      return null;
    }
    return entry.code;
  }

  async del(key: string): Promise<void> {
    const fullKey = `${KEY_PREFIX}${key}`;
    if (this.redis) {
      await this.redis.del(fullKey);
    } else {
      this.fallback.delete(key);
    }
  }

  /** 验证并消费验证码（一次性） */
  async consume(key: string, code: string): Promise<void> {
    const stored = await this.get(key);
    if (!stored) throw new Error("验证码已过期，请重新获取");
    if (stored !== code) throw new Error("验证码不正确");
    await this.del(key);
  }
}
