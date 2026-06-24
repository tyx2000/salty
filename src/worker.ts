import { routeApiRequest, type ServerEnv } from "./server/chat";

type WorkerEnv = ServerEnv & {
  ASSETS: Fetcher;
};

export default {
  fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      return routeApiRequest(request, env);
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<WorkerEnv>;
