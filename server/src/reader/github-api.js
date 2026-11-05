// SEC-2: the server talks only to api.github.com and GitHub's codeload
// redirect; no user-supplied host is ever fetched (the URL itself was
// already allowlisted by repo-url.js before we get here).

const GITHUB_API = "https://api.github.com";

class RepoReaderError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

async function githubFetch(path) {
  const headers = { accept: "application/vnd.github+json", "user-agent": "docsync" };
  if (process.env.GITHUB_TOKEN) {
    headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  const res = await fetch(`${GITHUB_API}${path}`, { headers });
  return res;
}

/**
 * Resolves a requested ref (branch, tag, SHA, or null for the default
 * branch) to a 40-char commit SHA, and confirms the repo exists.
 */
export async function resolveRef(owner, name, ref) {
  const repoRes = await githubFetch(`/repos/${owner}/${name}`);
  if (repoRes.status === 404) {
    throw new RepoReaderError("repo_not_found", `${owner}/${name} not found`);
  }
  if (!repoRes.ok) {
    throw new RepoReaderError("github_error", `GitHub API returned ${repoRes.status} for ${owner}/${name}`);
  }
  const repoInfo = await repoRes.json();
  const target = ref ?? repoInfo.default_branch;

  const commitRes = await githubFetch(`/repos/${owner}/${name}/commits/${encodeURIComponent(target)}`);
  if (commitRes.status === 404) {
    throw new RepoReaderError("ref_not_found", `${target} not found in ${owner}/${name}`);
  }
  if (!commitRes.ok) {
    throw new RepoReaderError("github_error", `GitHub API returned ${commitRes.status} resolving ${target}`);
  }
  const commitInfo = await commitRes.json();
  return { sha: commitInfo.sha, defaultBranch: repoInfo.default_branch };
}

export { RepoReaderError };
