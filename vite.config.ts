import { defineConfig, type Plugin, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import { config } from "dotenv";
import { ProxyAgent, setGlobalDispatcher } from "undici";
import type { IncomingMessage, ServerResponse } from "node:http";
import { fileURLToPath, URL } from "node:url";
import { routeApiRequest } from "./src/server/chat";

config({ path: ".env.local" });
config({ path: ".env" });
configureLocalFetchProxy();

export default defineConfig({
  optimizeDeps: {
    include: ["lucide-react"],
  },
  plugins: [react(), localApiPlugin()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
  },
});

function localApiPlugin(): Plugin {
  return {
    name: "salty-local-api",
    configureServer(server: ViteDevServer) {
      server.middlewares.use(
        "/api",
        async (req: IncomingMessage, res: ServerResponse) => {
          try {
            const request = await nodeRequestToWebRequest(req, "/api");
            const response = await routeApiRequest(request, {
              SUPABASE_URL: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
              SUPABASE_ANON_KEY:
                process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY,
              OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
              DEEPSEEK_BASE_URL: process.env.DEEPSEEK_BASE_URL,
            });
            await writeWebResponse(res, response);
          } catch (error) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(
              JSON.stringify({
                error:
                  error instanceof Error
                    ? error.message
                    : "Local API handler failed.",
              }),
            );
          }
        },
      );
    },
  };
}

function configureLocalFetchProxy() {
  const proxyUrl =
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY ||
    process.env.ALL_PROXY ||
    process.env.https_proxy ||
    process.env.http_proxy ||
    process.env.all_proxy;

  if (!proxyUrl) return;

  setGlobalDispatcher(new ProxyAgent(proxyUrl));
}

async function nodeRequestToWebRequest(
  req: IncomingMessage,
  mountPath: string,
) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const origin = `http://${req.headers.host || "127.0.0.1:5173"}`;
  const rawPath = req.url || "/";
  const path = rawPath.startsWith(mountPath)
    ? rawPath
    : `${mountPath}${rawPath.startsWith("/") ? rawPath : `/${rawPath}`}`;

  return new Request(new URL(path, origin), {
    method: req.method,
    headers: req.headers as HeadersInit,
    body: chunks.length > 0 ? Buffer.concat(chunks) : undefined,
  });
}

async function writeWebResponse(res: ServerResponse, response: Response) {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));

  if (!response.body) {
    res.end();
    return;
  }

  const reader = response.body.getReader();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    res.write(Buffer.from(value));
  }
  res.end();
}
