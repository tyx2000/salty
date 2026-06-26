import type {
  ChatResponseStats,
  ProviderId,
} from "@/types/domain";
import { recordUsageEvent } from "@/lib/usageEvents";
import type { UnlockedVault } from "@/lib/vault";

type CreateUsageEventRecorderOptions = {
  model: string;
  provider: ProviderId;
  vault: UnlockedVault;
};

type RecordUsageOptions = {
  errorCode?: string;
  messageId?: string | null;
  stats?: ChatResponseStats;
  success: boolean;
};

export function createUsageEventRecorder({
  model,
  provider,
  vault,
}: CreateUsageEventRecorderOptions) {
  let conversationId: string | null = null;
  let modelCallStartedAt: number | null = null;
  let usageRecorded = false;

  return {
    setConversationId(nextConversationId: string) {
      conversationId = nextConversationId;
    },
    start(startedAt: number) {
      modelCallStartedAt = startedAt;
    },
    async record({
      messageId,
      stats,
      success,
      errorCode,
    }: RecordUsageOptions) {
      if (usageRecorded || !conversationId || modelCallStartedAt === null) {
        return;
      }
      usageRecorded = true;
      const latencyMs =
        stats?.elapsedMs ??
        Math.max(0, Math.round(performance.now() - modelCallStartedAt));

      await recordUsageEvent(vault, {
        conversationId,
        messageId,
        provider,
        model,
        stats,
        latencyMs,
        success,
        errorCode,
      }).catch(() => undefined);
    },
  };
}
