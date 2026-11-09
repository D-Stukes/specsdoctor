import { useMemo } from "react";
import TourPlayer from "./TourPlayer.jsx";

// Adapts an explorer/1 document into TourPlayer's tour/1 shape, so the guide
// walking its own, self-chosen path reuses the exact same camera, dot-travel,
// speech and "path stays lit" player built for Task 11's guided tours - see
// LOG.md's "watch it think" brainstorm. The only new thing TourPlayer needs
// is `thought`, which it already renders when present and ignores otherwise.
function asTour(explorer) {
  const stops = explorer.stops.map((s) => ({
    node_id: s.node_id,
    via_edge: s.via_edge,
    title: s.title,
    narration: s.narration,
    narrated_by: s.narrated_by,
    evidence: s.evidence,
    thought: s.thought,
  }));
  const last = explorer.stops.at(-1);
  if (last) {
    stops.push({ node_id: last.node_id, title: "That's the walk", narration: explorer.closing, narrated_by: explorer.source, evidence: [], thought: null });
  }
  return { tour_id: "explorer", title: explorer.title, stops };
}

export default function ExplorerPlayer({ graph, explorer, onBack }) {
  // TourPlayer resets its walk back to stop 0 whenever the `tour` object it's handed changes
  // identity (that's how it detects a genuinely new tour). Without this memo, `asTour(explorer)`
  // built a fresh object - and `[tour]` a fresh array - on every render, so any unrelated
  // re-render anywhere above this component (not just an actual new explorer walk) silently
  // rewound the player back to the start.
  const tour = useMemo(() => asTour(explorer), [explorer]);
  const tours = useMemo(() => [tour], [tour]);
  return <TourPlayer graph={graph} tour={tour} tours={tours} onSelectTour={() => {}} onBack={onBack} />;
}
