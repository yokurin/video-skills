#!/usr/bin/env npx tsx

import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { fal } from "@fal-ai/client";
import { program } from "commander";
import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import * as http from "http";

// Load .env from skill directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: join(__dirname, "..", ".env"), debug: false, quiet: true });

const falKey = process.env.FAL_KEY;
if (!falKey) {
  console.error("Error: FAL_KEY not found in environment variables.");
  process.exit(1);
}
fal.config({ credentials: falKey });

// ============================================================
// Utility Functions
// ============================================================

async function downloadFile(url: string, outputPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith("https") ? https : http;
    const file = fs.createWriteStream(outputPath);
    protocol
      .get(url, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            downloadFile(redirectUrl, outputPath).then(resolve).catch(reject);
            return;
          }
        }
        response.pipe(file);
        file.on("finish", () => { file.close(); resolve(outputPath); });
      })
      .on("error", (err) => { fs.unlink(outputPath, () => {}); reject(err); });
  });
}

function getExtensionFromUrl(url: string, defaultExt: string = ".bin"): string {
  try {
    const ext = path.extname(new URL(url).pathname);
    if ([".png", ".jpg", ".jpeg", ".webp", ".mp4", ".webm", ".wav", ".mp3"].includes(ext.toLowerCase())) return ext;
  } catch {}
  return defaultExt;
}

function sanitize(text: string, maxLen: number = 30): string {
  return text.trim().toLowerCase()
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[,.'!@#$%^&()=+\[\]{}]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, maxLen);
}

function modelShort(id: string): string {
  if (id.includes("nano-banana")) return "nano-banana";
  if (id.includes("kling-video")) {
    const v = id.match(/v(\d+)/)?.[1] || "";
    const mode = id.includes("image-to-video") ? "-i2v" : id.includes("text-to-video") ? "-t2v" : "";
    return `kling-v${v}${mode}`;
  }
  return id.split("/").pop() || "fal";
}

function timestamp(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}_${String(d.getHours()).padStart(2,"0")}${String(d.getMinutes()).padStart(2,"0")}${String(d.getSeconds()).padStart(2,"0")}`;
}

function ensureDir(p: string) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }

function resolveOutput(url: string, output?: string, outputDir?: string, prompt?: string, modelId?: string, mediaType?: "image"|"video"): string {
  if (output) { ensureDir(path.dirname(output)); return output; }
  const dir = outputDir || process.cwd();
  ensureDir(dir);
  const ext = getExtensionFromUrl(url, mediaType === "video" ? ".mp4" : ".png");
  const p = prompt ? sanitize(prompt) : "output";
  const m = modelId ? modelShort(modelId) : "fal";
  return path.join(dir, `${p}_${m}_${timestamp()}${ext}`);
}

async function downloadResults(result: any, output?: string, outputDir?: string, prompt?: string, modelId?: string): Promise<string[]> {
  const files: string[] = [];
  if (result.images && Array.isArray(result.images)) {
    for (const img of result.images) {
      const url = img.url || img;
      if (typeof url === "string" && url.startsWith("http")) {
        const p = resolveOutput(url, output, outputDir, prompt, modelId, "image");
        await downloadFile(url, p);
        files.push(p);
      }
    }
  }
  if (result.image?.url) {
    const p = resolveOutput(result.image.url, output, outputDir, prompt, modelId, "image");
    await downloadFile(result.image.url, p);
    files.push(p);
  }
  if (result.video?.url) {
    const p = resolveOutput(result.video.url, output, outputDir, prompt, modelId, "video");
    await downloadFile(result.video.url, p);
    files.push(p);
  }
  return files;
}

// ============================================================
// Commands
// ============================================================

program.name("fal").version("1.0.0");

// image - 画像生成（単一モデル）
program
  .command("image")
  .argument("<prompt>")
  .option("-m, --model <model>", "Model ID", "fal-ai/nano-banana-pro")
  .option("-o, --output <path>")
  .option("--output-dir <dir>", "Output directory", "./assets")
  .option("--aspect-ratio <ratio>")
  .option("--resolution <res>")
  .action(async (prompt: string, opts: any) => {
    try {
      const input: Record<string, any> = { prompt };
      if (opts.aspectRatio) input.aspect_ratio = opts.aspectRatio;
      if (opts.resolution) input.resolution = opts.resolution;

      const result = await fal.subscribe(opts.model, {
        input, logs: true,
        onQueueUpdate: (u) => { if (u.status === "IN_PROGRESS" && u.logs) u.logs.forEach((l) => console.error(l.message)); },
      });

      const files = await downloadResults(result.data, opts.output, opts.outputDir, prompt, opts.model);
      console.log(JSON.stringify({ ...result.data, downloaded_files: files }, null, 2));
      files.forEach((f) => console.error(`saved: ${f}`));
    } catch (e) { console.error("Error:", e); process.exit(1); }
  });

// subscribe - 汎用エンドポイント実行（Kling v3 等）
program
  .command("subscribe")
  .argument("<endpoint>")
  .argument("<input>", "Input JSON string")
  .option("-o, --output <path>")
  .option("--output-dir <dir>")
  .option("--logs", "Show logs", false)
  .action(async (endpoint: string, inputJson: string, opts: any) => {
    try {
      const input = JSON.parse(inputJson);
      const result = await fal.subscribe(endpoint, {
        input, logs: opts.logs,
        onQueueUpdate: (u) => { if (opts.logs && u.status === "IN_PROGRESS" && u.logs) u.logs.forEach((l) => console.error(l.message)); },
      });

      const files = await downloadResults(result.data, opts.output, opts.outputDir || process.cwd(), input.prompt || input.text, endpoint);
      console.log(JSON.stringify({ ...result.data, downloaded_files: files }, null, 2));
      files.forEach((f) => console.error(`saved: ${f}`));
    } catch (e) { console.error("Error:", e); process.exit(1); }
  });

// download - URLダウンロード
program
  .command("download")
  .argument("<url>")
  .option("-o, --output <path>")
  .option("--output-dir <dir>")
  .action(async (url: string, opts: any) => {
    try {
      const p = resolveOutput(url, opts.output, opts.outputDir || process.cwd());
      await downloadFile(url, p);
      console.log(JSON.stringify({ downloaded_file: p }));
      console.error(`saved: ${p}`);
    } catch (e) { console.error("Error:", e); process.exit(1); }
  });

program.parse();
