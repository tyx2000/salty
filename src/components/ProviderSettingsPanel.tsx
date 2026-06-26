import { FormEvent, useState } from "react";
import { CheckCircle2, Eye, EyeOff, Loader2, Trash2 } from "lucide-react";
import type { ProviderId, ProviderKeyState } from "@/types/domain";
import { testProviderKey } from "@/lib/chatApi";
import { enrichProviderModel } from "@/lib/modelCapabilities";
import {
  deleteEncryptedProviderKey,
  saveEncryptedProviderKey,
} from "@/lib/providerKeys";
import type { UnlockedVault } from "@/lib/vault";

type ProviderSettingsPanelProps = {
  provider: ProviderId;
  state: ProviderKeyState;
  vault: UnlockedVault;
  onProviderKeyChange: (provider: ProviderId, state: ProviderKeyState) => void;
};

const providerLabels: Record<ProviderId, string> = {
  openai: "OpenAI",
  deepseek: "DeepSeek",
};

export function ProviderSettingsPanel({
  provider,
  state,
  vault,
  onProviderKeyChange,
}: ProviderSettingsPanelProps) {
  const [testing, setTesting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [statusTone, setStatusTone] = useState<"success" | "danger" | null>(null);
  const canDeleteProviderKey = state.tested || state.models.length > 0;
  const label = providerLabels[provider];

  async function handleTest(event: FormEvent) {
    event.preventDefault();
    setTesting(true);
    setStatus(null);
    setStatusTone(null);

    try {
      const result = await testProviderKey(provider, state.apiKey);
      const returnedModelIds = new Set(result.models.map((model) => model.id));
      const models = result.models.map((model) => enrichProviderModel(provider, model));
      await saveEncryptedProviderKey(vault, provider, state.apiKey);
      onProviderKeyChange(provider, {
        ...state,
        hiddenModelIds: state.hiddenModelIds.filter((modelId) =>
          returnedModelIds.has(modelId),
        ),
        models,
        tested: true,
      });
      setStatus(`${result.message} Key saved encrypted to your account.`);
      setStatusTone("success");
    } catch (error) {
      onProviderKeyChange(provider, {
        ...state,
        hiddenModelIds: [],
        models: [],
        tested: false,
      });
      setStatus(error instanceof Error ? error.message : "Provider key test failed.");
      setStatusTone("danger");
    } finally {
      setTesting(false);
    }
  }

  async function handleDeleteProviderKey() {
    setDeleting(true);
    setStatus(null);
    setStatusTone(null);

    try {
      await deleteEncryptedProviderKey(vault, provider);
      onProviderKeyChange(provider, {
        apiKey: "",
        hiddenModelIds: [],
        models: [],
        tested: false,
      });
      setStatus(`${label} key and models deleted.`);
      setStatusTone("success");
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Unable to delete provider key.",
      );
      setStatusTone("danger");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="provider-settings-card" aria-labelledby={`${provider}-settings`}>
      <header>
        <div>
          <h3 id={`${provider}-settings`}>{label}</h3>
          <p>{state.tested ? `${state.models.length} models loaded` : "Not connected"}</p>
        </div>
      </header>

      <form className="settings-form" onSubmit={handleTest}>
        <input
          aria-label={`${label} API key`}
          autoComplete="off"
          onChange={(event) => {
            onProviderKeyChange(provider, {
              ...state,
              apiKey: event.target.value,
              tested: false,
            });
          }}
          placeholder={`${label} API key sk-`}
          type="password"
          value={state.apiKey}
        />
        <button disabled={testing || !state.apiKey.trim()} type="submit">
          {testing ? <Loader2 className="spin" size={16} /> : <CheckCircle2 size={16} />}
          Test
        </button>
        {canDeleteProviderKey ? (
          <button
            className="danger-button"
            disabled={testing || deleting}
            onClick={() => {
              void handleDeleteProviderKey();
            }}
            type="button"
          >
            {deleting ? <Loader2 className="spin" size={16} /> : <Trash2 size={16} />}
            Delete
          </button>
        ) : null}
      </form>

      {status ? (
        <div className={statusTone === "success" ? "notice success" : "notice danger"}>
          {status}
        </div>
      ) : null}

      <div className="models-panel">
        {state.models.length > 0 ? (
          <div className="model-list">
            {state.models.map((model) => {
              const hidden = state.hiddenModelIds.includes(model.id);
              return (
                <div
                  className={hidden ? "model-list-item hidden-model" : "model-list-item"}
                  key={model.id}
                >
                  <span>{model.id}</span>
                  {model.description ? <small>{model.description}</small> : null}
                  <button
                    aria-label={hidden ? `Show ${model.id}` : `Hide ${model.id}`}
                    className="model-visibility-button"
                    onClick={() =>
                      onProviderKeyChange(provider, {
                        ...state,
                        hiddenModelIds: toggleModelVisibility(
                          state.hiddenModelIds,
                          model.id,
                        ),
                      })
                    }
                    type="button"
                  >
                    {hidden ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <p>No models loaded.</p>
        )}
      </div>
    </section>
  );
}

function toggleModelVisibility(hiddenModelIds: string[], modelId: string) {
  if (hiddenModelIds.includes(modelId)) {
    return hiddenModelIds.filter((hiddenModelId) => hiddenModelId !== modelId);
  }

  return [...hiddenModelIds, modelId];
}
