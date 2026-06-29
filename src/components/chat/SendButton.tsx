import {
  Send,
  Square,
} from "lucide-react";

/** Props for the composer send/stop button. */
type SendButtonProps = {
  /** Whether sending is disabled because there is no message content. */
  disabled: boolean;
  /** Current action exposed by the button. */
  mode: "send" | "stop";
  /** Aborts the active response when the button is in stop state. */
  onStopResponse: () => void;
};

/** Displays the animated send/stop action at the end of the composer toolbar. */
export function SendButton({
  disabled,
  mode,
  onStopResponse,
}: SendButtonProps) {
  const stopping = mode === "stop";

  return (
    <button
      className={stopping ? "send-button stop-button" : "send-button"}
      disabled={disabled}
      onClick={stopping ? onStopResponse : undefined}
      type={stopping ? "button" : "submit"}
      aria-label={stopping ? "Stop response" : "Send message"}
    >
      <span className="send-icon-stack" aria-hidden="true">
        <span className={stopping ? "send-icon inactive" : "send-icon active"}>
          <Send size={16} />
        </span>
        <span className={stopping ? "send-icon active" : "send-icon inactive"}>
          <Square size={13} fill="currentColor" />
        </span>
      </span>
    </button>
  );
}
