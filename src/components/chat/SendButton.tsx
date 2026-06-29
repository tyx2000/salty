import {
  Send,
  Square,
} from "lucide-react";

/** Props for the composer send/stop button. */
type SendButtonProps = {
  /** Whether the button should show stop state instead of send state. */
  busy: boolean;
  /** Whether sending is disabled because there is no message content. */
  disabled: boolean;
  /** Aborts the active response when the button is in stop state. */
  onStopResponse: () => void;
};

/** Displays the animated send/stop action at the end of the composer toolbar. */
export function SendButton({
  busy,
  disabled,
  onStopResponse,
}: SendButtonProps) {
  return (
    <button
      className={busy ? "send-button stop-button" : "send-button"}
      disabled={disabled}
      onClick={busy ? onStopResponse : undefined}
      type={busy ? "button" : "submit"}
      aria-label={busy ? "Stop response" : "Send message"}
    >
      <span className="send-icon-stack" aria-hidden="true">
        <span className={busy ? "send-icon inactive" : "send-icon active"}>
          <Send size={16} />
        </span>
        <span className={busy ? "send-icon active" : "send-icon inactive"}>
          <Square size={13} fill="currentColor" />
        </span>
      </span>
    </button>
  );
}
