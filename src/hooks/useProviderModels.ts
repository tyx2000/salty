import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ProviderId,
  ProviderKeyState,
  ProviderModel,
} from "@/types/domain";
import { testProviderKey } from "@/lib/chatApi";
import {
  enrichProviderModel,
  supportsAttachments,
} from "@/lib/modelCapabilities";
import {
  loadHiddenModelIds,
  saveHiddenModelIds,
} from "@/lib/modelPreferences";
import {
  emptyProviderKeyState,
  loadEncryptedProviderKeys,
} from "@/lib/providerKeys";
import type { UnlockedVault } from "@/lib/vault";

const providerIds: ProviderId[] = ["openai", "deepseek"];

export type AvailableModel = {
  /** Provider that owns the listed model. */
  provider: ProviderId;
  /** Enriched model metadata displayed in model selection UIs. */
  model: ProviderModel;
};

/** Options for loading provider keys and selecting available models. */
type UseProviderModelsOptions = {
  /** Receives provider-key load/test failures for display. */
  onError: (message: string) => void;
  /** Unlocked encryption vault used to read encrypted provider keys. */
  vault: UnlockedVault;
};

/**
 * Loads saved provider keys, tests them to discover models, tracks hidden model
 * preferences, and exposes the active provider/model selection.
 */
export function useProviderModels({
  onError,
  vault,
}: UseProviderModelsOptions) {
  const [provider, setProvider] = useState<ProviderId>("openai");
  const [model, setModel] = useState("");
  const [providerKeys, setProviderKeys] =
    useState<Record<ProviderId, ProviderKeyState>>(emptyProviderKeyState);
  const providerRef = useRef(provider);
  const selectedModelRef = useRef(model);

  useEffect(() => {
    providerRef.current = provider;
  }, [provider]);

  useEffect(() => {
    selectedModelRef.current = model;
  }, [model]);

  useEffect(() => {
    let cancelled = false;

    async function loadSavedProviderKeys() {
      try {
        const savedKeys = await loadEncryptedProviderKeys(vault);

        for (const providerId of providerIds) {
          const apiKey = savedKeys[providerId];
          if (!apiKey) continue;

          setProviderKeys((current) => ({
            ...current,
            [providerId]: {
              ...current[providerId],
              apiKey,
              hiddenModelIds: loadHiddenModelIds(vault.userId, providerId),
            },
          }));

          const result = await testProviderKey(providerId, apiKey);
          if (cancelled) return;
          const hiddenModelIds = loadHiddenModelIds(vault.userId, providerId);
          const models = result.models.map((availableModel) =>
            enrichProviderModel(providerId, availableModel),
          );
          const firstVisibleModel = models.find(
            (availableModel) => !hiddenModelIds.includes(availableModel.id),
          );

          setProviderKeys((current) => ({
            ...current,
            [providerId]: {
              apiKey,
              hiddenModelIds,
              models,
              tested: true,
            },
          }));

          if (!selectedModelRef.current && firstVisibleModel) {
            selectedModelRef.current = firstVisibleModel.id;
            providerRef.current = providerId;
            setProvider(providerId);
            setModel(firstVisibleModel.id);
          }
        }
      } catch (unknownError) {
        if (!cancelled) {
          onError(
            unknownError instanceof Error
              ? unknownError.message
              : "Unable to load saved provider keys.",
          );
        }
      }
    }

    loadSavedProviderKeys();

    return () => {
      cancelled = true;
    };
  }, [onError, vault]);

  const availableModels = useMemo<AvailableModel[]>(() => {
    return providerIds.flatMap((providerId) =>
      providerKeys[providerId].models
        .filter(
          (availableModel) =>
            !providerKeys[providerId].hiddenModelIds.includes(availableModel.id),
        )
        .map((availableModel) => ({
          provider: providerId,
          model: availableModel,
        })),
    );
  }, [providerKeys]);

  const updateProviderKey = useCallback(
    (providerId: ProviderId, state: ProviderKeyState) => {
      saveHiddenModelIds(vault.userId, providerId, state.hiddenModelIds);
      const models = state.models.map((availableModel) =>
        enrichProviderModel(providerId, availableModel),
      );
      const firstVisibleModel = models.find(
        (availableModel) => !state.hiddenModelIds.includes(availableModel.id),
      );

      setProviderKeys((current) => ({
        ...current,
        [providerId]: {
          ...state,
          models,
        },
      }));
      if (!selectedModelRef.current && firstVisibleModel) {
        selectedModelRef.current = firstVisibleModel.id;
        providerRef.current = providerId;
        setProvider(providerId);
        setModel(firstVisibleModel.id);
        return;
      }

      if (providerRef.current !== providerId) return;

      if (models.length === 0) {
        selectedModelRef.current = "";
        setModel("");
        return;
      }

      if (firstVisibleModel) {
        setModel((currentModel) => {
          const selectedStillVisible = models.some(
            (availableModel) =>
              availableModel.id === currentModel &&
              !state.hiddenModelIds.includes(availableModel.id),
          );
          const nextModel = selectedStillVisible
            ? currentModel
            : firstVisibleModel.id;
          selectedModelRef.current = nextModel;
          return nextModel;
        });
      } else if (state.hiddenModelIds.includes(selectedModelRef.current)) {
        selectedModelRef.current = "";
        setModel("");
      }
    },
    [vault.userId],
  );

  const handleModelChange = useCallback((value: string) => {
    const [nextProvider, ...modelParts] = value.split(":");
    if (
      (nextProvider === "openai" || nextProvider === "deepseek") &&
      modelParts.length > 0
    ) {
      const nextModel = modelParts.join(":");
      selectedModelRef.current = nextModel;
      providerRef.current = nextProvider;
      setProvider(nextProvider);
      setModel(nextModel);
    }
  }, []);

  const selectedModelValue = model ? `${provider}:${model}` : "";
  const selectedModelLabel = model || "Test an API key first";
  const selectedSupportsAttachments = model
    ? supportsAttachments(provider, model)
    : false;

  return {
    availableModels,
    handleModelChange,
    model,
    provider,
    providerKeys,
    selectedModelLabel,
    selectedModelValue,
    selectedSupportsAttachments,
    updateProviderKey,
  };
}
