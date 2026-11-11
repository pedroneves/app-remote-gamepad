/**
 * Dev server for the web app.
 *
 * Serves `app.html` from disk and builds `app.js` from `app.ts` in memory on
 * every request, so reloading the page always runs the latest source.
 * Nothing is written to disk. The build does not type check: run `deno task check` for that.
 *
 * Usage: deno task web-app:dev [port]
 */

const DEFAULT_PORT = 7000;
const APP_HTML = new URL("../app.html", import.meta.url);
const APP_TS = new URL("../app.ts", import.meta.url);
const NO_STORE = { "cache-control": "no-store" };

function javascript(code: string, status = 200): Response {
  return new Response(code, {
    status,
    headers: { "content-type": "text/javascript; charset=utf-8", ...NO_STORE },
  });
}

/** A script that replaces the page with the build error, so it shows up on the phone too. */
function errorScript(message: string): string {
  return `{
  const pre = document.createElement("pre");
  pre.style.cssText = "margin:0;padding:1rem;white-space:pre-wrap;color:#ff8080;background:#200;font:14px monospace";
  pre.textContent = ${JSON.stringify(`Build failed\n\n${message}`)};
  document.body.replaceChildren(pre);
  console.error(pre.textContent);
}`;
}

function formatMessage({ text, location }: Deno.bundle.Message): string {
  if (!location) return text;
  return `${location.file}:${location.line}:${location.column}: ${text}`;
}

async function buildApp(): Promise<Response> {
  const started = performance.now();
  let message: string;
  try {
    const result = await Deno.bundle({
      entrypoints: [APP_TS.href],
      platform: "browser",
      format: "iife",
      sourcemap: "inline",
      write: false,
    });
    const output = result.outputFiles?.[0];
    if (result.success && output) {
      console.log(`app.js built in ${Math.round(performance.now() - started)} ms`);
      return javascript(output.text());
    }
    message = result.errors.map(formatMessage).join("\n") || "No output";
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }
  console.error(`app.js build failed:\n${message}`);
  return javascript(errorScript(message), 500);
}

async function handle(request: Request): Promise<Response> {
  if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405 });

  switch (new URL(request.url).pathname) {
    case "/":
    case "/app.html":
      return new Response(await Deno.readFile(APP_HTML), {
        headers: { "content-type": "text/html; charset=utf-8", ...NO_STORE },
      });
    case "/app.js":
      return await buildApp();
    default:
      return new Response("Not Found", { status: 404 });
  }
}

const port = Number(Deno.args[0] ?? DEFAULT_PORT);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  console.error(`Invalid port: ${Deno.args[0]}`);
  Deno.exit(1);
}

Deno.serve({
  // Local connections only.
  hostname: "127.0.0.1",
  port,
  onListen({ hostname, port }) {
    console.log(`Web app dev server running at http://${hostname}:${port}/`);
  },
}, handle);
