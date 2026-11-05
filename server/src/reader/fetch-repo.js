import { Readable, Transform } from "node:stream";
import { resolveRef, RepoReaderError } from "./github-api.js";
import { extractTarball } from "./extract-tarball.js";

const MAX_TARBALL_BYTES = 25 * 1024 * 1024; // §4a

/**
 * Full Repo Reader pipeline: resolves { owner, name, ref } to a SHA,
 * downloads and safely extracts the tarball, and returns a validated
 * snapshot/1 document plus the extracted file contents (kept separately -
 * the snapshot itself never carries file bodies).
 */
export async function fetchRepo({ owner, name, ref }) {
  const { sha } = await resolveRef(owner, name, ref);

  const tarballUrl = `https://codeload.github.com/${owner}/${name}/tar.gz/${sha}`;
  const res = await fetch(tarballUrl);
  if (!res.ok || !res.body) {
    throw new RepoReaderError("github_error", `codeload returned ${res.status} for ${owner}/${name}@${sha}`);
  }

  const contentLength = Number(res.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_TARBALL_BYTES) {
    throw new RepoReaderError("tarball_too_large", `Tarball is ${contentLength} bytes, over the ${MAX_TARBALL_BYTES} limit`);
  }

  const nodeStream = Readable.fromWeb(res.body);
  const bounded = boundStream(nodeStream, MAX_TARBALL_BYTES);

  const { files, contentByPath, limitsHit } = await extractTarball(bounded);

  const snapshot = {
    schema_version: "snapshot/1",
    repo: { owner, name },
    requested_ref: ref ?? null,
    resolved_sha: sha,
    files,
    limits_hit: limitsHit,
  };

  return { snapshot, contentByPath };
}

/** Aborts the stream once more than `maxBytes` have come through, even without a Content-Length. */
function boundStream(source, maxBytes) {
  let total = 0;
  const bound = new Transform({
    transform(chunk, encoding, callback) {
      total += chunk.length;
      if (total > maxBytes) {
        return callback(new RepoReaderError("tarball_too_large", `Tarball exceeded ${maxBytes} bytes`));
      }
      callback(null, chunk);
    },
  });
  source.pipe(bound);
  source.on("error", (err) => bound.destroy(err));
  return bound;
}
