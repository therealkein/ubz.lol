import { server as wisp, logging } from "@mercuryworkshop/wisp-js/server";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 8080;

// Logging every proxied connection slows busy pages down; only show problems.
logging.set_level(logging.WARN);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};
const COMPRESSIBLE = new Set([".html", ".js", ".mjs", ".css", ".json", ".wasm", ".svg"]);

// Gzipped copies of files, rebuilt whenever a file changes on disk.
const gzipCache = new Map();
function gzipped(file, stat) {
  const hit = gzipCache.get(file);
  if (hit && hit.mtimeMs === stat.mtimeMs) return hit.data;
  const data = zlib.gzipSync(fs.readFileSync(file));
  gzipCache.set(file, { mtimeMs: stat.mtimeMs, data });
  return data;
}

const httpServer = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, "http://x").pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  if (pathname === "/ac") {
    // DuckDuckGo search suggestions for the home search autofill.
    const q = new URL(req.url, "http://x").searchParams.get("q") || "";
    const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };
    if (!q.trim()) {
      res.writeHead(200, headers).end("[]");
      return;
    }
    fetch("https://duckduckgo.com/ac/?type=list&q=" + encodeURIComponent(q), { headers: { "User-Agent": "Mozilla/5.0" } })
      .then((r) => r.json())
      .then((data) => res.writeHead(200, headers).end(JSON.stringify(Array.isArray(data[1]) ? data[1] : [])))
      .catch(() => res.writeHead(200, headers).end("[]"));
    return;
  }
  if (pathname === "/") pathname = "/c1.html";
  if (pathname.endsWith("/")) pathname += "index.html";

  const file = path.join(ROOT, pathname);
  if (!file.startsWith(ROOT + path.sep) || file.includes(`${path.sep}node_modules${path.sep}`)) {
    res.writeHead(403).end();
    return;
  }

  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
      return;
    }
    // Let the browser reuse its copy until the file changes (304 instead of re-downloading).
    const etag = `"${stat.size.toString(36)}-${Math.floor(stat.mtimeMs).toString(36)}"`;
    const ext = path.extname(file).toLowerCase();
    const headers = {
      "Content-Type": TYPES[ext] || "application/octet-stream",
      "Cache-Control": "no-cache",
      ETag: etag,
      Vary: "Accept-Encoding",
    };
    if (req.headers["if-none-match"] === etag) {
      res.writeHead(304, headers).end();
      return;
    }
    if (COMPRESSIBLE.has(ext) && /\bgzip\b/.test(req.headers["accept-encoding"] || "")) {
      let data;
      try {
        data = gzipped(file, stat);
      } catch {
        res.writeHead(500).end();
        return;
      }
      res.writeHead(200, { ...headers, "Content-Encoding": "gzip", "Content-Length": data.length });
      res.end(data);
      return;
    }
    res.writeHead(200, { ...headers, "Content-Length": stat.size });
    fs.createReadStream(file).pipe(res);
  });
});

httpServer.on("upgrade", (req, socket, head) => {
  if (req.url.startsWith("/wisp/")) wisp.routeRequest(req, socket, head);
  else socket.end();
});

httpServer.listen(PORT, () => {
  console.log(`unblockedzone running at http://localhost:${PORT}  (wisp at /wisp/)`);
});
