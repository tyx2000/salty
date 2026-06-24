import { handleChatRequest, type ServerEnv } from "../../src/server/chat";

export const onRequestPost: PagesFunction<ServerEnv> = async (context) =>
  handleChatRequest(context.request, context.env);
