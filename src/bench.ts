import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

export interface BenchOptions {
  seed: number;
  duration: number;
  out: string;
  browser?: string;
  screenshot?: string;
  headless: boolean;
}

interface DevToolsMessage {
  id?: number;
  result?: Record<string, unknown>;
  error?: { message?: string };
}

export class DevToolsClient {
  private nextId = 0;
  private readonly pending = new Map<number, {
    resolve: (value: Record<string, unknown>) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  }>();
  private readonly listeners = new Map<string, Set<(params: Record<string, unknown>) => void>>();

  constructor(private readonly socket: WebSocket) {
    socket.on("message", (data) => {
      const message = JSON.parse(data.toString()) as DevToolsMessage & { method?: string; params?: Record<string, unknown> };
      if (message.id === undefined) {
        if (message.method) {
          for (const listener of this.listeners.get(message.method) ?? []) listener(message.params ?? {});
        }
        return;
      }
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timeout);
      if (message.error) pending.reject(new Error(message.error.message ?? "DevTools command failed"));
      else pending.resolve(message.result ?? {});
    });
    socket.on("close", () => {
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timeout);
        pending.reject(new Error("DevTools connection closed"));
      }
      this.pending.clear();
    });
  }

  static async connect(url: string): Promise<DevToolsClient> {
    const socket = new WebSocket(url);
    await new Promise<void>((resolveConnect, rejectConnect) => {
      const timeout = setTimeout(() => rejectConnect(new Error("Timed out connecting to browser DevTools")), 10_000);
      socket.once("open", () => {
        clearTimeout(timeout);
        resolveConnect();
      });
      socket.once("error", () => {
        clearTimeout(timeout);
        rejectConnect(new Error("Unable to connect to browser DevTools"));
      });
    });
    return new DevToolsClient(socket);
  }

  on(method: string, listener: (params: Record<string, unknown>) => void): () => void {
    const listeners = this.listeners.get(method) ?? new Set<(params: Record<string, unknown>) => void>();
    listeners.add(listener);
    this.listeners.set(method, listeners);
    return () => listeners.delete(listener);
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const id = ++this.nextId;
    return new Promise((resolveCommand, rejectCommand) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        rejectCommand(new Error(`Timed out waiting for DevTools response to ${method}`));
      }, 10_000);
      this.pending.set(id, { resolve: resolveCommand, reject: rejectCommand, timeout });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close(): void {
    this.socket.close();
  }
}

export function parseBenchArgs(args: string[]): BenchOptions {
  const known = new Set(["--seed", "--duration", "--out", "--browser", "--screenshot", "--headless"]);
  const values = new Map<string, string>();
  let headless = false;
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (!known.has(key)) throw new Error(`Unknown option: ${key}`);
    if (key === "--headless") {
      if (headless) throw new Error("Option supplied more than once: --headless");
      headless = true;
      continue;
    }
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${key}`);
    if (values.has(key)) throw new Error(`Option supplied more than once: ${key}`);
    values.set(key, value);
    index += 1;
  }
  const seed = Number(values.get("--seed") ?? 42);
  if (!Number.isSafeInteger(seed) || seed < 0) throw new Error("--seed must be a non-negative safe integer");
  const duration = Number(values.get("--duration") ?? 30);
  if (!Number.isSafeInteger(duration) || duration < 1 || duration > 600) {
    throw new Error("--duration must be an integer from 1 to 600 seconds");
  }
  const browser = values.get("--browser");
  if (browser && !existsSync(browser)) throw new Error(`Browser executable not found: ${browser}`);
  return {
    seed,
    duration,
    out: values.get("--out") ?? "bench.json",
    browser,
    screenshot: values.get("--screenshot"),
    headless,
  };
}

export async function findFreePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Could not reserve a local port");
  }
  const port = address.port;
  await new Promise<void>((resolveClose, rejectClose) => {
    server.close((error) => error ? rejectClose(error) : resolveClose());
  });
  return port;
}

export function findBrowser(explicitPath?: string): string {
  if (explicitPath) return explicitPath;
  const candidates = [
    process.env.EDGE_PATH,
    process.env.CHROME_PATH,
    process.env["PROGRAMFILES(X86)"] && join(process.env["PROGRAMFILES(X86)"], "Microsoft", "Edge", "Application", "msedge.exe"),
    process.env.ProgramFiles && join(process.env.ProgramFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
    process.env.ProgramFiles && join(process.env.ProgramFiles, "Google", "Chrome", "Application", "chrome.exe"),
  ].filter((path): path is string => Boolean(path));
  const browser = candidates.find((path) => existsSync(path));
  if (!browser) throw new Error("No Chromium browser found. Set EDGE_PATH, CHROME_PATH, or pass --browser.");
  return browser;
}

function waitForChildExit(child: ChildProcess): Promise<void> {
  return new Promise((resolveExit) => child.once("exit", () => resolveExit()));
}

async function stopChild(child?: ChildProcess): Promise<void> {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = waitForChildExit(child);
  child.kill();
  await exited;
}

export async function waitForHttp(url: string, child: ChildProcess, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Browser or Vite exited with code ${child.exitCode ?? child.signalCode}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The service may still be starting.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
  return await response.json() as T;
}

function assertBenchmarkState(value: unknown): void {
  if (!value || typeof value !== "object") throw new Error("Benchmark page did not expose its scenario state");
  const state = value as Record<string, unknown>;
  const lanterns = state.lanterns;
  const validLanterns = Array.isArray(lanterns)
    && ["L1", "L2", "L3"].every((id) => lanterns.some((item) => {
      if (!item || typeof item !== "object") return false;
      const lantern = item as Record<string, unknown>;
      return lantern.id === id && lantern.lit === true && lantern.fuel === 100;
    }));
  if (
    state.night !== 1
    || JSON.stringify(state.player) !== "[0,0,0]"
    || state.motes !== 100
    || state.shades !== 200
    || state.wandering_shades !== 200
    || state.random_motes !== false
    || state.random_shades !== false
    || state.random_drifters !== false
    || state.wind_enabled !== false
    || !validLanterns
  ) {
    throw new Error(`Benchmark scenario does not match Contract v1.3: ${JSON.stringify(state)}`);
  }
}

export async function runBenchmark(options: BenchOptions): Promise<Record<string, unknown>> {
  const browserPath = findBrowser(options.browser);
  const vitePort = await findFreePort();
  const debugPort = await findFreePort();
  const profile = mkdtempSync(join(tmpdir(), "dao-den-long-bench-"));
  const vite = spawn(process.execPath, [
    resolve("node_modules/vite/bin/vite.js"),
    "--host",
    "127.0.0.1",
    "--port",
    String(vitePort),
    "--strictPort",
  ], { cwd: process.cwd(), stdio: "ignore", windowsHide: true });
  let browser: ChildProcess | undefined;
  let client: DevToolsClient | undefined;
  try {
    await waitForHttp(`http://127.0.0.1:${vitePort}/`, vite, 15_000);
    const browserArgs = [
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--disable-backgrounding-occluded-windows",
      "--disable-frame-rate-limit",
      "--disable-gpu-vsync",
      "--window-size=1280,720",
    ];
    if (options.headless) browserArgs.push("--headless=new");
    browserArgs.push("about:blank");
    browser = spawn(browserPath, browserArgs, { stdio: "ignore", windowsHide: options.headless });
    await waitForHttp(`http://127.0.0.1:${debugPort}/json/version`, browser, 15_000);
    const pages = await readJson<Array<{ type: string; webSocketDebuggerUrl?: string }>>(
      `http://127.0.0.1:${debugPort}/json/list`,
    );
    const page = pages.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
    if (!page?.webSocketDebuggerUrl) throw new Error("Browser did not expose a page target");
    client = await DevToolsClient.connect(page.webSocketDebuggerUrl);
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: 1280,
      height: 720,
      deviceScaleFactor: 1,
      mobile: false,
    });
    const url = `http://127.0.0.1:${vitePort}/?benchmark=1&seed=${options.seed}&duration=${options.duration}`;
    await client.send("Page.navigate", { url });

    const stateDeadline = Date.now() + 30_000;
    let scenarioState: unknown;
    while (Date.now() < stateDeadline) {
      const evaluation = await client.send("Runtime.evaluate", {
        expression: "window.__daoDenLongBenchmarkState__ ?? null",
        returnByValue: true,
      });
      scenarioState = (evaluation.result as { value?: unknown } | undefined)?.value;
      if (scenarioState) break;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
    }
    assertBenchmarkState(scenarioState);
    if (options.screenshot) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
      const capture = await client.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      const screenshotData = capture.data;
      if (typeof screenshotData !== "string") throw new Error("Browser did not return screenshot data");
      writeFileSync(resolve(options.screenshot), Buffer.from(screenshotData, "base64"));
      console.log(`Benchmark screenshot written to ${resolve(options.screenshot)}`);
    }

    const reportDeadline = Date.now() + (options.duration + 90) * 1000;
    let report: Record<string, unknown> | undefined;
    while (Date.now() < reportDeadline) {
      const evaluation = await client.send("Runtime.evaluate", {
        expression: "window.__daoDenLongBenchmarkReport__ ?? null",
        returnByValue: true,
      });
      report = (evaluation.result as { value?: Record<string, unknown> | null } | undefined)?.value ?? undefined;
      if (report) break;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
    }
    if (!report) throw new Error("Benchmark did not finish before the timeout");
    const result = {
      ...report,
      browser: basename(browserPath),
      window_mode: options.headless ? "headless" : "window",
    };
    const output = `${JSON.stringify(result, null, 2)}\n`;
    if (options.out === "-") process.stdout.write(output);
    else {
      const outputPath = resolve(options.out);
      writeFileSync(outputPath, output, "utf8");
      console.log(`Benchmark report written to ${outputPath}`);
    }
    return result;
  } finally {
    client?.close();
    await Promise.all([stopChild(browser), stopChild(vite)]);
    rmSync(profile, { recursive: true, force: true });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    await runBenchmark(parseBenchArgs(process.argv.slice(2)));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  }
}
