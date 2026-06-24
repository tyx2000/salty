import type { ProviderId, ProviderModel } from "@/types/domain";

export type ModelCapability = {
  provider: ProviderId;
  id: string;
  label: string;
  description?: string;
  endpoint: "chat_completions" | "responses";
  input: {
    text: boolean;
    image: boolean;
    file: boolean;
  };
  output: {
    markdown: boolean;
    json: boolean;
  };
  features: {
    streaming: boolean;
    structuredOutput: boolean;
    toolCalling: boolean;
  };
  confidence: "official" | "heuristic" | "unknown";
};

const openAiMultimodalFamilies = [
  /^gpt-5/i,
  /^gpt-4\.1/i,
  /^gpt-4o/i,
  /^o3/i,
  /^o4/i,
];

export function resolveModelCapability(
  provider: ProviderId,
  model: string,
): ModelCapability {
  if (provider === "deepseek") {
    return {
      provider,
      id: model,
      label: model,
      endpoint: "chat_completions",
      input: {
        text: true,
        image: false,
        file: false,
      },
      output: {
        markdown: true,
        json: true,
      },
      features: {
        streaming: true,
        structuredOutput: false,
        toolCalling: false,
      },
      confidence: "heuristic",
    };
  }

  const multimodal = openAiMultimodalFamilies.some((pattern) => pattern.test(model));

  return {
    provider,
    id: model,
    label: model,
    endpoint: multimodal ? "responses" : "chat_completions",
    input: {
      text: true,
      image: multimodal,
      file: multimodal,
    },
    output: {
      markdown: true,
      json: true,
    },
    features: {
      streaming: true,
      structuredOutput: true,
      toolCalling: multimodal,
    },
    confidence: multimodal ? "heuristic" : "unknown",
  };
}

export function enrichProviderModel(
  provider: ProviderId,
  model: ProviderModel,
): ProviderModel {
  const capability = resolveModelCapability(provider, model.id);
  const tags = [
    capability.input.image ? "image" : null,
    capability.input.file ? "file" : null,
    capability.output.json ? "json" : null,
  ].filter(Boolean);

  return {
    ...model,
    description: model.description || tags.join(" / ") || undefined,
  };
}

export function supportsAttachments(provider: ProviderId, model: string) {
  const capability = resolveModelCapability(provider, model);
  return capability.input.image || capability.input.file;
}
