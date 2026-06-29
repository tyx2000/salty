import type { ProviderId, ProviderKeyState } from "@/types/domain";
import type { UnlockedVault } from "@/lib/vault";
import { ProviderSettingsPanel } from "@/components/ProviderSettingsPanel";

/** Props for the provider settings panel. */
type ProviderPanelProps = {
  /** Provider-key loading error, if any. */
  providerError: string | null;
  /** Current provider key/model state keyed by provider. */
  providerKeys: Record<ProviderId, ProviderKeyState>;
  /** Applies provider key, model, and hidden-model changes. */
  updateProviderKey: (provider: ProviderId, state: ProviderKeyState) => void;
  /** Unlocked encryption vault used by provider setting cards. */
  vault: UnlockedVault;
};

const providerIds: ProviderId[] = ["openai", "deepseek"];

/** Displays provider API-key panels for all supported providers. */
export function ProviderPanel({
  providerError,
  providerKeys,
  updateProviderKey,
  vault,
}: ProviderPanelProps) {
  return (
    <section className="settings-panel">
      <header className="settings-panel-header">
        <div>
          <span>Provider</span>
          <h1>API keys</h1>
        </div>
      </header>
      {providerError ? <div className="notice danger">{providerError}</div> : null}
      <div className="provider-settings-list">
        {providerIds.map((providerId) => (
          <ProviderSettingsPanel
            key={providerId}
            onProviderKeyChange={updateProviderKey}
            provider={providerId}
            state={providerKeys[providerId]}
            vault={vault}
          />
        ))}
      </div>
    </section>
  );
}
