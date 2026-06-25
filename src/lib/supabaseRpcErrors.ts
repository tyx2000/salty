type SupabaseLikeError = {
  code?: string;
  details?: string;
  hint?: string;
  message?: string;
};

export function normalizeAtomicDeleteRpcError(
  error: SupabaseLikeError,
  action: "delete messages" | "delete conversation",
) {
  if (isMissingRpcError(error)) {
    return new Error(
      `Database migration is required to ${action}. Run npm run db:migrate, refresh the page, and try again.`,
    );
  }

  return error;
}

function isMissingRpcError(error: SupabaseLikeError) {
  const code = error.code ?? "";
  const text = [error.message, error.details, error.hint]
    .filter(Boolean)
    .join(" ");

  return (
    code === "PGRST202" ||
    code === "42883" ||
    text.includes("Could not find the function") ||
    text.includes("delete_messages_atomic") ||
    text.includes("delete_conversation_atomic")
  );
}
