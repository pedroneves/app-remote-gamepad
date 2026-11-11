/** Serves files from one directory. No directory listings, nothing outside the directory. */

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".map": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

const notFound = () => new Response("Not Found", { status: 404 });

function contentType(path: string): string {
  const dot = path.lastIndexOf(".");
  return CONTENT_TYPES[path.slice(dot)] ?? "application/octet-stream";
}

/**
 * @param root Directory to serve. Must end with `/`.
 * @param index File served for `/`.
 */
export function serveStatic(root: URL, index: string) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    let path: string;
    try {
      path = decodeURIComponent(new URL(request.url).pathname);
    } catch {
      return new Response("Bad Request", { status: 400 });
    }
    if (path.endsWith("/")) path += index;

    // Decoding can bring back "..", "/" or "\", so check every segment again.
    const segments = path.slice(1).split("/");
    const unsafe = (s: string) =>
      s === "" || s === "." || s === ".." || s.includes("\\") || s.includes("\0");
    if (segments.some(unsafe)) return notFound();

    const file = new URL(segments.map(encodeURIComponent).join("/"), root);
    try {
      if (!(await Deno.stat(file)).isFile) return notFound();
      const body = request.method === "HEAD" ? null : await Deno.readFile(file);
      return new Response(body, {
        headers: { "content-type": contentType(path), "cache-control": "no-cache" },
      });
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) return notFound();
      throw error;
    }
  };
}
