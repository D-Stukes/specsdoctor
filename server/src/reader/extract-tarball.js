import { pipeline, Transform } from "node:stream";
import zlib from "node:zlib";
import * as tarStream from "tar-stream";
import { classifyFile, isMinified, MAX_FILE_BYTES } from "./classify-file.js";

// §4a limits.
export const MAX_EXPANDED_BYTES = 300 * 1024 * 1024; // 300 MiB
export const MAX_ENTRIES = 15_000;

/**
 * Streams a gzip'd tarball (as returned by GitHub's codeload) and extracts
 * it in memory - never to disk (SEC-3). Returns:
 *   { files: SnapshotFile[], contentByPath: Record<string,string>, limitsHit: string[] }
 * `tarballStream` is a Node Readable (not a web ReadableStream - convert
 * with Readable.fromWeb first) of the raw .tar.gz bytes.
 */
export async function extractTarball(tarballStream) {
  const extract = tarStream.extract();
  const files = [];
  const contentByPath = Object.create(null);
  const fallbackByPath = Object.create(null);
  let fallbackBytes = 0;
  const limitsHit = new Set();
  let expandedBytes = 0;
  let entryCount = 0;

  const gunzip = zlib.createGunzip();
  const bounded = new Transform({
    transform(chunk, encoding, callback) {
      expandedBytes += chunk.length;
      if (expandedBytes > MAX_EXPANDED_BYTES) {
        callback(new Error(`Expanded archive exceeds ${MAX_EXPANDED_BYTES / 1024 / 1024} MiB`));
        return;
      }
      callback(null, chunk);
    },
  });

  return new Promise((resolve, reject) => {
    extract.on("entry", (header, stream, next) => {
      entryCount += 1;
      if (entryCount > MAX_ENTRIES) {
        limitsHit.add("archive_entries");
        stream.resume();
        return next();
      }

      // GitHub tarballs wrap everything in a single "<owner>-<repo>-<sha>/"
      // top directory; strip it so paths match the repo's own layout.
      const rawPath = header.name.replace(/\\/g, "/");
      const firstSlash = rawPath.indexOf("/");
      const path = firstSlash === -1 ? rawPath : rawPath.slice(firstSlash + 1);

      // SEC-3: reject absolute paths, ".." segments, symlinks, hardlinks, device files.
      const isUnsafePath =
        path.startsWith("/") ||
        path.split("/").includes("..") ||
        header.type === "symlink" ||
        header.type === "link" ||
        header.type === "character-device" ||
        header.type === "block-device";

      if (isUnsafePath) {
        stream.resume();
        return next();
      }

      if (header.type !== "file" || path === "") {
        stream.resume();
        return next();
      }

      const initial = classifyFile(path, header.size);
      const fallbackCandidate = initial.status === "unsupported" &&
        /\.(html?|vue|svelte|astro|rb|php|go|rs|java|kt|cs|swift|cpp|c|h|hpp|scala|lua|exs?|clj|dart|sh)$/i.test(path);
      const retain = initial.status === "scanned" || fallbackCandidate;
      const chunks = [];
      let entryBytes = 0;
      stream.on("data", (chunk) => {
        entryBytes += chunk.length;
        if (retain && entryBytes <= MAX_FILE_BYTES) chunks.push(chunk);
      });
      stream.on("end", () => {
        const classification = classifyFile(path, entryBytes);
        if (classification.status !== "scanned") {
          files.push({ path, size: entryBytes, status: classification.status, reason: classification.reason });
          if (classification.status === "unsupported" && fallbackCandidate &&
              fallbackBytes + entryBytes <= 2 * 1024 * 1024) {
            const bytes = Buffer.concat(chunks);
            try {
              const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
              if (!source.includes("\0")) {
                fallbackByPath[path] = source;
                fallbackBytes += entryBytes;
              }
            } catch {
              // Ignore files that are not valid UTF-8.
            }
          }
          return next();
        }

        const content = Buffer.concat(chunks).toString("utf8");
        if (isMinified(content)) {
          files.push({ path, size: entryBytes, status: "skipped", reason: "minified" });
          return next();
        }

        contentByPath[path] = content;
        files.push({ path, size: entryBytes, status: "scanned" });
        next();
      });
      stream.on("error", next);
    });

    pipeline(tarballStream, gunzip, bounded, extract, (error) => {
      if (error) reject(error);
      else resolve({ files, contentByPath, fallbackByPath, limitsHit: [...limitsHit] });
    });
  });
}
