// Zero-dependency static server: `npm start` then open http://localhost:5173
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PORT = Number(process.env.PORT) || 5173;
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8" };
const ALLOWED = new Set(["/index.html", "/styles.css", "/app.js", "/schedule.js"]);

http
  .createServer((req, res) => {
    const url = new URL(req.url, "http://localhost").pathname;
    const route = url === "/" ? "/index.html" : url;
    if (!ALLOWED.has(route)) {
      res.writeHead(404).end("Not found");
      return;
    }
    fs.readFile(path.join(__dirname, route), (err, data) => {
      if (err) return res.writeHead(500).end("Error");
      res.writeHead(200, { "Content-Type": TYPES[path.extname(route)], "Cache-Control": "no-cache" }).end(data);
    });
  })
  .listen(PORT, () => console.log(`Reminders running at http://localhost:${PORT}`));
