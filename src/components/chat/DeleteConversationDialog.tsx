import {
  Trash2,
  X,
} from "lucide-react";
import type { ConversationListItem } from "@/lib/conversations";

/** Props for the destructive conversation deletion confirmation dialog. */
type DeleteConversationDialogProps = {
  /** Conversation awaiting deletion, or null to hide the dialog. */
  conversation: ConversationListItem | null;
  /** Closes the dialog without deleting data. */
  onCancel: () => void;
  /** Confirms permanent conversation deletion. */
  onConfirm: () => void;
};

/** Displays the modal that confirms true deletion of a conversation and files. */
export function DeleteConversationDialog({
  conversation,
  onCancel,
  onConfirm,
}: DeleteConversationDialogProps) {
  if (!conversation) return null;

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="confirm-modal" role="dialog" aria-modal="true">
        <h2>Delete conversation?</h2>
        <p>
          This permanently deletes "{conversation.title}", its messages, and
          uploaded files. This action cannot be undone.
        </p>
        <div className="confirm-actions">
          <button
            className="ghost-button"
            onClick={onCancel}
            type="button"
            aria-label="Cancel delete"
          >
            <X size={16} />
            Cancel
          </button>
          <button
            className="danger-button"
            onClick={onConfirm}
            type="button"
            aria-label="Confirm delete"
          >
            <Trash2 size={16} />
            Delete
          </button>
        </div>
      </section>
    </div>
  );
}
