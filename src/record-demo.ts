import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DevToolsClient,
  findBrowser,
  findFreePort,
  waitForHttp,
} from "./bench";

interface RecordOptions {
  browser?: string;
  out: string;
  ffmpeg?: string;
}

function parseArgs(args: string[]): RecordOptions {
  const known = new Set(["--browser", "--out", "--ffmpeg"]);
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (!known.has(key)) throw new Error(`Unknown option: ${key}`);
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${key}`);
    if (values.has(key)) throw new Error(`Option supplied more than once: ${key}`);
    values.set(key, value);
    index += 1;
  }
  const browser = values.get("--browser");
  if (browser && !existsSync(browser)) throw new Error(`Browser executable not found: ${browser}`);
  const ffmpeg = values.get("--ffmpeg") ?? process.env.FFMPEG_PATH ?? "C:\\ffmpeg\\bin\\ffmpeg.exe";
  if (ffmpeg.includes("\\") || ffmpeg.includes("/")) {
    if (!existsSync(ffmpeg)) throw new Error(`FFmpeg executable not found: ${ffmpeg}`);
  }
  return { browser, out: values.get("--out") ?? "docs/demo/phase-4.mp4", ffmpeg };
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

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function evaluate(client: DevToolsClient, expression: string): Promise<unknown> {
  const result = await client.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error("Browser evaluation failed");
  return (result.result as { value?: unknown } | undefined)?.value;
}

async function waitForExpression(client: DevToolsClient, expression: string, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (await evaluate(client, expression) === true) return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Could not inspect browser UI (${expression}): ${message}`);
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for browser UI: ${expression}`);
}

async function clickAction(client: DevToolsClient, action: string): Promise<void> {
  const selector = `[data-action="${action}"]`;
  const clicked = await evaluate(
    client,
    `(() => { const button = document.querySelector(${JSON.stringify(selector)}); if (!button) return false; button.click(); return true; })()`,
  );
  if (clicked !== true) throw new Error(`Could not find the ${action} button`);
}

async function dispatchKey(client: DevToolsClient, code: string, key: string, holdMs = 80): Promise<void> {
  await client.send("Input.dispatchKeyEvent", { type: "keyDown", code, key });
  if (holdMs > 0) await delay(holdMs);
  await client.send("Input.dispatchKeyEvent", { type: "keyUp", code, key });
}

async function holdKey(client: DevToolsClient, code: string, key: string, durationMs: number): Promise<void> {
  await client.send("Input.dispatchKeyEvent", { type: "keyDown", code, key });
  await delay(durationMs);
  await client.send("Input.dispatchKeyEvent", { type: "keyUp", code, key });
}

async function run(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const browserPath = findBrowser(options.browser);
  const vitePort = await findFreePort();
  const debugPort = await findFreePort();
  const profile = mkdtempSync(join(tmpdir(), "dao-den-long-demo-"));
  const framesDirectory = mkdtempSync(join(tmpdir(), "dao-den-long-frames-"));
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
  let frameCount = 0;
  let captureFailure: Error | undefined;
  const unsubscribeFrames: (() => void)[] = [];
  try {
    await waitForHttp(`http://127.0.0.1:${vitePort}/`, vite, 15_000);
    browser = spawn(browserPath, [
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--disable-backgrounding-occluded-windows",
      "--window-size=1280,720",
      "about:blank",
    ], { stdio: "ignore", windowsHide: false });
    const versionUrl = `http://127.0.0.1:${debugPort}/json/version`;
    await waitForHttp(versionUrl, browser, 15_000);
    const pages = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json() as Array<{
      type: string;
      webSocketDebuggerUrl?: string;
    }>;
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

    const frameListener = client.on("Page.screencastFrame", (params) => {
      try {
        const data = params.data;
        const sessionId = params.sessionId;
        if (typeof data !== "string" || typeof sessionId !== "number") return;
        frameCount += 1;
        writeFileSync(join(framesDirectory, `frame-${String(frameCount).padStart(6, "0")}.png`), Buffer.from(data, "base64"));
        void client?.send("Page.screencastFrameAck", { sessionId }).catch(() => undefined);
      } catch (error) {
        captureFailure = error instanceof Error ? error : new Error(String(error));
      }
    });
    unsubscribeFrames.push(frameListener);
    await client.send("Page.navigate", { url: `http://127.0.0.1:${vitePort}/` });
    await waitForExpression(client, `Boolean(document.querySelector('[data-action="start"]'))`);
    await client.send("Page.startScreencast", {
      format: "png",
      everyNthFrame: 2,
      maxWidth: 1280,
      maxHeight: 720,
    });

    await delay(2500);
    await clickAction(client, "start");
    await waitForExpression(client, `Boolean(document.querySelector('[data-action="begin"]'))`);
    await clickAction(client, "begin");
    await delay(1200);
    await holdKey(client, "KeyW", "w", 2200);
    await dispatchKey(client, "Space", " ");
    await dispatchKey(client, "ShiftLeft", "Shift");
    await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x: 640, y: 360, button: "left", buttons: 1 });
    await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 760, y: 360, button: "left", buttons: 1 });
    await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: 760, y: 360, button: "left", buttons: 0 });
    await holdKey(client, "KeyD", "d", 1800);
    await dispatchKey(client, "KeyQ", "q");
    await holdKey(client, "KeyS", "s", 1400);
    await dispatchKey(client, "Escape", "Escape");
    await waitForExpression(client, `Boolean(document.querySelector('[data-action="continue"]'))`);
    await delay(1200);
    await clickAction(client, "settings");
    await waitForExpression(client, `Boolean(document.querySelector('[data-action="rebind"]'))`);
    await delay(1800);
    await evaluate(client, `document.querySelector('[data-binding="jump"]')?.click()`);
    await dispatchKey(client, "KeyJ", "j");
    await delay(800);
    await clickAction(client, "reset-bindings");
    await delay(1200);
    await clickAction(client, "settings-back");
    await waitForExpression(client, `Boolean(document.querySelector('[data-action="continue"]'))`);
    await clickAction(client, "continue");
    await delay(800);
    await holdKey(client, "KeyW", "w", 1600);
    await dispatchKey(client, "Space", " ");
    await delay(900);
    await dispatchKey(client, "Escape", "Escape");
    await waitForExpression(client, `Boolean(document.querySelector('[data-action="menu"]'))`);
    await clickAction(client, "menu");
    await waitForExpression(client, `Boolean(document.querySelector('[data-action="leaderboard"]'))`);
    await delay(1800);
    void client.send("Page.stopScreencast").catch(() => undefined);
    await delay(500);
    if (captureFailure) throw captureFailure;
    if (frameCount < 30) throw new Error(`Too few browser frames were captured: ${frameCount}`);

    const outputPath = resolve(options.out);
    mkdirSync(resolve(outputPath, ".."), { recursive: true });
    const ffmpegArgs = [
      "-y",
      "-hide_banner",
      "-loglevel",
      "warning",
      "-framerate",
      "15",
      "-i",
      join(framesDirectory, "frame-%06d.png"),
      "-frames:v",
      String(frameCount),
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "27",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      outputPath,
    ];
    const ffmpeg = spawn(options.ffmpeg ?? "ffmpeg", ffmpegArgs, { stdio: "inherit", windowsHide: true });
    const exitCode = await new Promise<number>((resolveExit, rejectExit) => {
      ffmpeg.once("error", rejectExit);
      ffmpeg.once("exit", (code) => resolveExit(code ?? 1));
    });
    if (exitCode !== 0) throw new Error(`FFmpeg exited with code ${exitCode}`);
    console.log(`Recorded ${frameCount} gameplay frames to ${outputPath} using ${basename(browserPath)}.`);
  } finally {
    for (const unsubscribe of unsubscribeFrames) unsubscribe();
    client?.close();
    await Promise.all([stopChild(browser), stopChild(vite)]);
    rmSync(profile, { recursive: true, force: true });
    rmSync(framesDirectory, { recursive: true, force: true });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    await run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  }
}
