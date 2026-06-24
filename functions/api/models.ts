import { handleModelsRequest, type ServerEnv } from "../../src/server/chat";

export const onRequestPost: PagesFunction<ServerEnv> = async (context) =>
  handleModelsRequest(context.request, context.env);
