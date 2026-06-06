import { Injectable } from "@nestjs/common";

const TTL_MS = 30 * 60 * 1000; // 30 分钟
const ABORT_THRESHOLD = 3;

interface SessionState {
  consecutiveHigh: number;
  lastTouched: number;
}

/**
 * 内存级 stream session 状态;按 sessionId 计数连续 high 段。
 * WHY: ③ 阶段连续 ≥ 3 段 high → 触发 abortStream;无需持久化(进程重启清空可接受)。
 */
@Injectable()
export class StreamSessionStore {
  private map = new Map<string, SessionState>();

  /** 段落审核回调:命中 high 计数 +1,否则清零;返回是否应中断流。 */
  recordSegment(sessionId: string, isHigh: boolean): { shouldAbort: boolean } {
    this.gc();
    const now = Date.now();
    const cur = this.map.get(sessionId) ?? { consecutiveHigh: 0, lastTouched: now };
    cur.consecutiveHigh = isHigh ? cur.consecutiveHigh + 1 : 0;
    cur.lastTouched = now;
    this.map.set(sessionId, cur);
    return { shouldAbort: cur.consecutiveHigh >= ABORT_THRESHOLD };
  }

  /** test-only */
  __reset(): void {
    this.map.clear();
  }

  private gc(): void {
    const cutoff = Date.now() - TTL_MS;
    for (const [k, v] of this.map.entries()) {
      if (v.lastTouched < cutoff) this.map.delete(k);
    }
  }
}
