import { createReadStream, existsSync, statSync, writeFileSync } from "node:fs";
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";
import { isValidLeaderboardName, readLeaderboard, saveLeaderboardEntry } from "./leaderboard";
import type { LeaderboardSubmission } from "./leaderboard";

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(`${JSON.stringify(value)}\n`);
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += data.length;
    if (size > 16 * 1024) throw new HttpError(413, "Request body exceeds 16 KB.");
    chunks.push(data);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new HttpError(400, "Request body must be valid JSON.");
  }
}

async function handleApi(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
  const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
  if (pathname === "/api/leaderboard" && request.method === "GET") {
    sendJson(response, 200, { entries: readLeaderboard() });
    return true;
  }
  if (pathname === "/api/leaderboard" && request.method === "POST") {
    const body = await readJsonBody(request);
    if (!body || typeof body !== "object") throw new HttpError(400, "Submission must be a JSON object.");
    const value = body as Record<string, unknown>;
    if (typeof value.name !== "string" || !isValidLeaderboardName(value.name)) {
      throw new HttpError(400, "Name must contain 3 to 12 ASCII letters, digits, or underscores.");
    }
    if (!Number.isSafeInteger(value.score) || Number(value.score) < 0) {
      throw new HttpError(400, "Score must be a non-negative safe integer.");
    }
    if (!Number.isSafeInteger(value.nights_won) || Number(value.nights_won) < 0 || Number(value.nights_won) > 3) {
      throw new HttpError(400, "Nights won must be an integer from 0 to 3.");
    }
    if (!Number.isSafeInteger(value.seed) || Number(value.seed) < 0) {
      throw new HttpError(400, "Seed must be a non-negative safe integer.");
    }
    const submission: LeaderboardSubmission = {
      name: value.name,
      score: Number(value.score),
      nights_won: Number(value.nights_won),
      seed: Number(value.seed),
    };
    sendJson(response, 201, { entries: saveLeaderboardEntry(submission) });
    return true;
  }
  if (pathname.startsWith("/api/")) {
    sendJson(response, 404, { error: "API endpoint not found." });
    return true;
  }
  return false;
}

const contentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webm": "video/webm",
  ".woff2": "font/woff2",
};

function serveProductionFile(request: IncomingMessage, response: ServerResponse): void {
  const outputDirectory = resolve("dist");
  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
  } catch {
    sendJson(response, 400, { error: "Invalid URL path." });
    return;
  }
  const requestedPath = pathname === "/" ? "index.html" : pathname.slice(1);
  let file = resolve(outputDirectory, requestedPath);
  if (!file.startsWith(`${outputDirectory}${sep}`) && file !== outputDirectory) {
    sendJson(response, 403, { error: "Path is outside the distribution directory." });
    return;
  }
  if (!existsSync(file) || !statSync(file).isFile()) {
    if (extname(pathname)) {
      sendJson(response, 404, { error: "File not found." });
      return;
    }
    file = join(outputDirectory, "index.html");
  }
  if (!existsSync(file)) {
    sendJson(response, 500, { error: "Build output is missing; run npm run build first." });
    return;
  }
  response.writeHead(200, {
    "content-type": contentTypes[extname(file).toLowerCase()] ?? "application/octet-stream",
    "content-length": statSync(file).size,
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  const stream = createReadStream(file);
  stream.on("error", (error) => {
    console.error(`Unable to serve ${relative(outputDirectory, file)}:`, error);
    if (!response.headersSent) response.writeHead(500);
    response.end();
  });
  stream.pipe(response);
}

function parseServerOptions(args: string[]): { dev: boolean; host: string; port: number } {
  const dev = args.includes("--dev");
  const hostIndex = args.indexOf("--host");
  const portIndex = args.indexOf("--port");
  const host = hostIndex >= 0 ? args[hostIndex + 1] : process.env.HOST ?? "127.0.0.1";
  const port = Number(portIndex >= 0 ? args[portIndex + 1] : process.env.PORT ?? 4173);
  if (!host || !Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error("Server host or port is invalid.");
  }
  return { dev, host, port };
}

async function main(args: string[]): Promise<void> {
  const exportIndex = args.indexOf("--export-leaderboard");
  if (exportIndex >= 0) {
    const outputPath = args[exportIndex + 1];
    if (!outputPath || outputPath.startsWith("--")) throw new Error("Provide an output path after --export-leaderboard.");
    writeFileSync(resolve(outputPath), `${JSON.stringify({ entries: readLeaderboard() }, null, 2)}\n`, "utf8");
    console.log(`Leaderboard exported to ${resolve(outputPath)}`);
    return;
  }

  const options = parseServerOptions(args);
  if (!options.dev && !existsSync(resolve("dist", "index.html"))) {
    throw new Error("Production build is missing; run npm run build before npm start.");
  }
  const vite = options.dev
    ? await createViteServer({
      configFile: resolve("vite.config.ts"),
      appType: "spa",
      server: { middlewareMode: true, host: options.host, hmr: false },
    })
    : undefined;
  const server = createHttpServer((request, response) => {
    void (async () => {
      try {
        if (await handleApi(request, response)) return;
        if (vite) vite.middlewares(request, response, (error?: unknown) => {
          if (error) {
            console.error("Vite request failed:", error);
            if (!response.headersSent) response.writeHead(500);
            response.end("Internal server error.");
          }
        });
        else serveProductionFile(request, response);
      } catch (error) {
        if (error instanceof HttpError) {
          sendJson(response, error.status, { error: error.message });
          return;
        }
        console.error("Request failed:", error);
        sendJson(response, 500, { error: "Internal server error." });
      }
    })();
  });
  server.on("close", () => { void vite?.close(); });
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(options.port, options.host, resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Server did not bind to a TCP port.");
  console.log(`Listening on http://${options.host}:${address.port}`);
  const shutdown = (): void => {
    server.close((error) => {
      if (error) {
        console.error("Unable to stop server:", error);
        process.exitCode = 1;
      }
    });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  }
}
