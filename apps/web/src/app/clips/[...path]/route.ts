import { createReadStream, statSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { CLIPS } from "@/lib/data";

const TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

// The first range of a "bytes=" header. A header that names no valid range, such as "bytes=-"
// or "bytes=500-100", is ignored and the whole file is sent, as RFC 9110 section 14.2 allows.
function byteRange(header: string | null): RegExpExecArray | null {
  const m = /^bytes=(\d*)-(\d*)(?:,|$)/.exec(header ?? "");
  if (!m || (!m[1] && !m[2])) return null;
  if (m[1] && m[2] && Number(m[2]) < Number(m[1])) return null;
  return m;
}

// Clips and stills the engine wrote to data/local/clips. Video needs byte ranges to seek.
export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const rel = (await params).path.join("/");
  const file = path.resolve(CLIPS, rel);
  if (!file.startsWith(CLIPS + path.sep)) return new Response("not found", { status: 404 });
  let size: number;
  try {
    const st = statSync(file);
    // A folder such as detections/ has a size too, but reading it fails after the headers go out.
    if (!st.isFile()) return new Response("not found", { status: 404 });
    size = st.size;
  } catch {
    return new Response("not found", { status: 404 });
  }
  const type = TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream";
  const range = byteRange(req.headers.get("range"));
  const head = { "Content-Type": type, "Accept-Ranges": "bytes", "Cache-Control": "no-store" };
  if (!range) {
    const body = Readable.toWeb(createReadStream(file)) as ReadableStream;
    return new Response(body, { headers: { ...head, "Content-Length": String(size) } });
  }
  const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
  const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
  if (start >= size || start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  const body = Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream;
  return new Response(body, {
    status: 206,
    headers: { ...head, "Content-Length": String(end - start + 1), "Content-Range": `bytes ${start}-${end}/${size}` },
  });
}
