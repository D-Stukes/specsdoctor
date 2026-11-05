import { resolveModuleSpecifier } from "./resolve-module.js";

function nodeKey(node) {
  return `${node.file}::${node.var}`;
}

/**
 * Cross-file mount resolution (§2 "Express" row, T07). Each scanned file's
 * own `extractRoutes()` facts only know about identifiers in that one
 * file; this stitches them into a graph of "who mounts whom, at what
 * prefix" and climbs it from every endpoint up to a root to compute the
 * endpoint's full path.
 */
export function buildRouteGraph(routesByFile, scannedPaths) {
  const incomingMounts = new Map(); // nodeKey -> [{ parentNode, prefixLiteral, prefixResolved, viaFile, viaLine }]

  function addIncoming(childNode, entry) {
    const key = nodeKey(childNode);
    if (!incomingMounts.has(key)) incomingMounts.set(key, []);
    incomingMounts.get(key).push(entry);
  }

  for (const [filePath, facts] of routesByFile) {
    for (const mount of facts.mounts) {
      const parentNode = { file: filePath, var: mount.ownerVar };
      let childNode = null;

      if (facts.requireBindings.has(mount.targetIdentifier)) {
        const specRaw = facts.requireBindings.get(mount.targetIdentifier);
        const spec = specRaw.split("#")[0];
        const resolved = resolveModuleSpecifier(filePath, spec, scannedPaths);
        const targetFacts = resolved ? routesByFile.get(resolved) : null;
        if (resolved && targetFacts?.exportedRouterVar) {
          childNode = { file: resolved, var: targetFacts.exportedRouterVar };
        }
      } else if (facts.routerInstanceVars.has(mount.targetIdentifier)) {
        childNode = { file: filePath, var: mount.targetIdentifier };
      }

      if (!childNode) continue; // target isn't a locally resolvable router (external, or unresolved dynamic import)
      addIncoming(childNode, {
        parentNode,
        prefixLiteral: mount.prefixLiteral,
        prefixResolved: mount.prefixResolved,
        viaFile: filePath,
        viaLine: mount.line,
      });
    }
  }

  function climb(node, visited) {
    const key = nodeKey(node);
    if (visited.has(key)) return []; // cycle guard
    const nextVisited = new Set(visited).add(key);
    const incoming = incomingMounts.get(key) ?? [];
    if (incoming.length === 0) {
      return [{ segments: [], resolved: true, mountSteps: [] }];
    }
    const results = [];
    for (const inc of incoming) {
      const parentPaths = climb(inc.parentNode, nextVisited);
      for (const pp of parentPaths) {
        results.push({
          segments: [...pp.segments, inc.prefixLiteral ?? ""],
          resolved: pp.resolved && inc.prefixResolved,
          mountSteps: [
            ...pp.mountSteps,
            { path: inc.viaFile, start_line: inc.viaLine, end_line: inc.viaLine, prefix: inc.prefixLiteral ?? "" },
          ],
        });
      }
    }
    return results;
  }

  /** Returns { fullPath, resolved, mountSteps } for an endpoint's owner node + its own declared path. */
  function resolveEndpointPath(ownerFile, ownerVar, declaredPath, declaredPathResolved) {
    const candidates = climb({ file: ownerFile, var: ownerVar }, new Set());
    const withOwnPath = candidates.map((c) => ({
      fullPath: normalizePath([...c.segments, declaredPath ?? "<unresolved>"].join("")),
      resolved: c.resolved && declaredPathResolved,
      mountSteps: c.mountSteps,
    }));
    const resolvedOne = withOwnPath.find((c) => c.resolved);
    return resolvedOne ?? withOwnPath[0] ?? { fullPath: declaredPath ?? "<unresolved>", resolved: false, mountSteps: [] };
  }

  return { resolveEndpointPath };
}

function normalizePath(path) {
  const collapsed = path.replace(/\/{2,}/g, "/") || "/";
  return collapsed.length > 1 && collapsed.endsWith("/") ? collapsed.slice(0, -1) : collapsed;
}
