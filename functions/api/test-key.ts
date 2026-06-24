import { handleTestKeyRequest, type ServerEnv } from "../../src/server/chat";

export const onRequestPost: PagesFunction<ServerEnv> = async (context) =>
  handleTestKeyRequest(context.request, context.env);
