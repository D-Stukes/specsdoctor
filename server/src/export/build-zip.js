import { ZipArchive } from "archiver";

// T18: assembles the export ZIP in memory (mkdocs.yml, README, docs/*.md,
// docs/provenance.md, optionally docs/review.md). archiver 8.x's ZipArchive
// is a Transform stream - collecting its 'data' chunks and resolving on
// 'end' gives us the whole archive as one Buffer, with no temp files.
export async function buildExportZip({ mkdocsYml, readme, provenanceMd, pages, reviewMd, graphJson }) {
  const archive = new ZipArchive({ zlib: { level: 9 } });
  const chunks = [];
  archive.on("data", (chunk) => chunks.push(chunk));
  const done = new Promise((resolve, reject) => {
    archive.on("end", resolve);
    archive.on("error", reject);
  });

  archive.append(mkdocsYml, { name: "mkdocs.yml" });
  archive.append(readme, { name: "README.md" });
  archive.append(provenanceMd, { name: "docs/provenance.md" });
  for (const page of pages) {
    archive.append(page.markdown, { name: `docs/${page.slug}.md` });
  }
  if (reviewMd) {
    archive.append(reviewMd, { name: "docs/review.md" });
  }

  if (graphJson) {
    archive.append(graphJson, { name: "graph.json" });
  }

  archive.finalize();
  await done;
  return Buffer.concat(chunks);
}
