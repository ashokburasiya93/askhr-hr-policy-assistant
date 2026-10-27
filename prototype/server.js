// Local dev server: serves public/ and the same api/ handlers Vercel runs.
// Usage: npm run dev  ->  http://localhost:3000
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, "public");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };

function wrap(res) {
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (o) => (res.setHeader("Content-Type", "application/json"), res.end(JSON.stringify(o)));
  return res;
}

http
  .createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname.startsWith("/api/")) {
      const name = url.pathname.slice(5).replace(/[^a-z-]/g, "");
      const file = path.join(__dirname, "api", `${name}.js`);
      if (!fs.existsSync(file)) return wrap(res).status(404).json({ error: "not found" });
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        try {
          req.body = body ? JSON.parse(body) : {};
        } catch {
          req.body = {};
        }
        require(file)(req, wrap(res));
      });
      return;
    }
    const p = path.join(PUBLIC, url.pathname === "/" ? "index.html" : path.normalize(url.pathname));
    if (!p.startsWith(PUBLIC) || !fs.existsSync(p)) return ((res.statusCode = 404), res.end("Not found"));
    res.setHeader("Content-Type", TYPES[path.extname(p)] || "application/octet-stream");
    fs.createReadStream(p).pipe(res);
  })
  .listen(PORT, () => console.log(`AskHR running on http://localhost:${PORT}`));
