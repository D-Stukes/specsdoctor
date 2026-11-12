import { Readable } from "node:stream";
import { resolveRef, RepoReaderError } from "./github-api.js";
import { extractTarball, MAX_ENTRIES } from "./extract-tarball.js";

const MAX_TARBALL_BYTES = 100 * 1024 * 1024; // §4a

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

  const { files, contentByPath, fallbackByPath, limitsHit } = await extractTarball(bounded);

  if (limitsHit.includes("archive_entries")) {
    throw new RepoReaderError("too_many_archive_entries", `Archive exceeds ${MAX_ENTRIES} entries`);
  }

  const snapshot = {
    schema_version: "snapshot/1",
    repo: { owner, name },
    requested_ref: ref ?? null,
    resolved_sha: sha,
    files,
    limits_hit: limitsHit,
  };

  return { snapshot, contentByPath, fallbackByPath };
}

/** Aborts the stream once more than `maxBytes` have come through, even without a Content-Length. */
function boundStream(source, maxBytes) {
  return Readable.from((async function* () {
    let total = 0;
    for await (const chunk of source) {
      total += chunk.length;
      if (total > maxBytes) {
        throw new RepoReaderError("tarball_too_large", `Tarball exceeded ${maxBytes} bytes`);
      }
      yield chunk;
    }
  })());
}
