import { FormEvent, useState } from "react";
import { CheckCircle2, Eye, EyeOff, Loader2, X } from "lucide-react";
import type { ProviderId, ProviderKeyState } from "@/types/domain";
import { testProviderKey } from "@/lib/chatApi";
import { saveEncryptedProviderKey } from "@/lib/providerKeys";
import type { UnlockedVault } from "@/lib/vault";

type SettingsModalProps = {
  open: boolean;
  vault: UnlockedVault;
  providerKeys: Record<ProviderId, ProviderKeyState>;
  onClose: () => void;
  onProviderKeyChange: (provider: ProviderId, state: ProviderKeyState) => void;
};

const providerLabels: Record<ProviderId, string> = {
  openai: "OpenAI",
  deepseek: "DeepSeek",
};

export function SettingsModal({
  open,
  vault,
  providerKeys,
  onClose,
  onProviderKeyChange,
}: SettingsModalProps) {
  const [activeProvider, setActiveProvider] = useState<ProviderId>("openai");
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const activeState = providerKeys[activeProvider];

  if (!open) return null;

  async function handleTest(event: FormEvent) {
    event.preventDefault();
    setTesting(true);
    setStatus(null);

    try {
      const result = await testProviderKey(activeProvider, activeState.apiKey);
      const returnedModelIds = new Set(result.models.map((model) => model.id));
      await saveEncryptedProviderKey(vault, activeProvider, activeState.apiKey);
      onProviderKeyChange(activeProvider, {
        ...activeState,
        hiddenModelIds: activeState.hiddenModelIds.filter((modelId) =>
          returnedModelIds.has(modelId),
        ),
        models: result.models,
        tested: true,
      });
      setStatus(`${result.message} Key saved encrypted to your account.`);
    } catch (error) {
      onProviderKeyChange(activeProvider, {
        ...activeState,
        hiddenModelIds: [],
        models: [],
        tested: false,
      });
      setStatus(error instanceof Error ? error.message : "Provider key test failed.");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="settings-modal" role="dialog" aria-modal="true">
        <header className="modal-header">
          <div>
            <h2>Provider settings</h2>
            <p>Keys are encrypted in the browser before being saved to Supabase.</p>
          </div>
          <button className="icon-button" onClick={onClose} type="button" aria-label="Close">
            <X size={18} />
          </button>
        </header>

        <div className="provider-tabs">
          {(["openai", "deepseek"] as ProviderId[]).map((provider) => (
            <button
              className={provider === activeProvider ? "tab-button active" : "tab-button"}
              key={provider}
              onClick={() => {
                setActiveProvider(provider);
                setStatus(null);
              }}
              type="button"
            >
              {providerLabels[provider]}
            </button>
          ))}
        </div>

        <form className="settings-form" onSubmit={handleTest}>
          <input
              autoComplete="off"
              onChange={(event) => {
                const nextApiKey = event.target.value;
                onProviderKeyChange(activeProvider, {
                  ...activeState,
                  apiKey: nextApiKey,
                  tested: false,
                });
              }}
            placeholder={providerLabels[activeProvider] + ' API key sk-'}
            type="password"
            value={activeState.apiKey}
          />
          <button disabled={testing || !activeState.apiKey.trim()} type="submit">
            {testing ? <Loader2 className="spin" size={16} /> : <CheckCircle2 size={16} />}
            Test
          </button>
        </form>

        {status ? (
          <div className={activeState.tested ? "notice success" : "notice danger"}>
            {status}
          </div>
        ) : null}

        <div className="models-panel">
          {activeState.models.length > 0 ? (
            <div className="model-list">
              {activeState.models.map((model) => (
                <div
                  className={
                    activeState.hiddenModelIds.includes(model.id)
                      ? "model-list-item hidden-model"
                      : "model-list-item"
                  }
                  key={model.id}
                >
                  <span>{model.id}</span>
                  {model.description ? <small>{model.description}</small> : null}
                  <button
                    aria-label={
                      activeState.hiddenModelIds.includes(model.id)
                        ? `Show ${model.id}`
                        : `Hide ${model.id}`
                    }
                    className="model-visibility-button"
                    onClick={() =>
                      onProviderKeyChange(activeProvider, {
                        ...activeState,
                        hiddenModelIds: toggleModelVisibility(
                          activeState.hiddenModelIds,
                          model.id,
                        ),
                      })
                    }
                    type="button"
                  >
                    {activeState.hiddenModelIds.includes(model.id) ? (
                      <EyeOff size={14} />
                    ) : (
                      <Eye size={14} />
                    )}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p>No models loaded. Test a provider key first.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function toggleModelVisibility(hiddenModelIds: string[], modelId: string) {
  if (hiddenModelIds.includes(modelId)) {
    return hiddenModelIds.filter((hiddenModelId) => hiddenModelId !== modelId);
  }

  return [...hiddenModelIds, modelId];
}
