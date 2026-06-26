import type {
  ChatAttachment,
  ProviderId,
  ProviderKeyState,
} from "@/types/domain";
import type { PendingAttachment } from "@/lib/messages";
import { supportsAttachments } from "@/lib/modelCapabilities";

const providerLabels: Record<ProviderId, string> = {
  openai: "OpenAI",
  deepseek: "DeepSeek",
};

function formatProviderLabel(providerId: ProviderId) {
  return providerLabels[providerId] ?? providerId;
}

export function resolveProviderApiKey({
  model,
  provider,
  providerKeys,
}: {
  model: string | undefined;
  provider: ProviderId;
  providerKeys: Record<ProviderId, ProviderKeyState>;
}) {
  if (!model) {
    return {
      ok: false as const,
      error: "Test a provider key in Settings before choosing a model.",
    };
  }

  const providerKeyState = providerKeys[provider];
  const apiKey = providerKeyState?.apiKey.trim();
  if (!apiKey) {
    return {
      ok: false as const,
      error: `Configure and test a ${formatProviderLabel(provider)} API key first.`,
    };
  }

  return {
    ok: true as const,
    apiKey,
    model,
  };
}

export function validateTurnAttachments({
  model,
  pendingAttachments,
  provider,
  reusedAttachments,
}: {
  model: string;
  pendingAttachments: PendingAttachment[];
  provider: ProviderId;
  reusedAttachments: ChatAttachment[];
}) {
  if (
    (pendingAttachments.length > 0 || reusedAttachments.length > 0) &&
    !supportsAttachments(provider, model)
  ) {
    return "The selected model is not configured for file or image input.";
  }

  return null;
}
