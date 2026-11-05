// Commit-pinned GitHub links. Technical Design §4c.
export function buildSourceLink(repo, path, startLine, endLine) {
  const range = startLine === endLine ? `L${startLine}` : `L${startLine}-L${endLine}`;
  return `https://github.com/${repo.owner}/${repo.name}/blob/${repo.sha}/${path}#${range}`;
}
