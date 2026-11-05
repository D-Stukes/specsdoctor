import zlib from "node:zlib";
import * as tarStream from "tar-stream";
import { classifyFile, isMinified } from "./classify-file.js";

// §4a limits.
export const MAX_EXPANDED_BYTES = 100 * 1024 * 1024; // 100 MB
export const MAX_ENTRIES = 5000;

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
  const contentByPath = {};
  const limitsHit = new Set();
  let expandedBytes = 0;
  let entryCount = 0;

  const gunzip = zlib.createGunzip();

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

      const chunks = [];
      let entryBytes = 0;
      stream.on("data", (chunk) => {
        entryBytes += chunk.length;
        expandedBytes += chunk.length;
        if (expandedBytes > MAX_EXPANDED_BYTES) {
          limitsHit.add("archive_size");
          stream.resume(); // drain and drop the rest; we already know the limit is hit
          return;
        }
        chunks.push(chunk);
      });
      stream.on("end", () => {
        if (expandedBytes > MAX_EXPANDED_BYTES) {
          return next();
        }

        const classification = classifyFile(path, entryBytes);
        if (classification.status !== "scanned") {
          files.push({ path, size: entryBytes, status: classification.status, reason: classification.reason });
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

    extract.on("finish", () => resolve({ files, contentByPath, limitsHit: [...limitsHit] }));
    extract.on("error", reject);
    gunzip.on("error", reject);

    tarballStream.pipe(gunzip).pipe(extract);
  });
}
