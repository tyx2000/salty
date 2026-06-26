export function routeConversationIdFromPath(pathname: string) {
  const match = pathname.match(/^\/chat\/([^/]+)$/);
  if (!match?.[1]) return undefined;

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return undefined;
  }
}
