import { useEffect, useState } from "react";
import TourPlayer from "./TourPlayer.jsx";
import "./theme.css";

// Idea 5 (LOG.md's "wow factor" brainstorm): the public, unauthenticated page a share link opens -
// no sign-in, no run list, no Ask/Explorer (both are AI-metered and must never be reachable from
// here). Just the repo it's about and its already-generated tour, autoplaying. See
// server/src/routes/public.js for the one API call this makes.
export default function SharedRunView({ token }) {
  const [state, setState] = useState({ status: "loading" });
  const [tourId, setTourId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/public/runs/${token}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error?.message ?? "This link is no longer available.");
        }
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setState({ status: "ready", data });
        setTourId(data.tours[0]?.tour_id ?? null);
      })
      .catch((err) => !cancelled && setState({ status: "error", message: err.message }));
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (state.status === "loading") {
    return (
      <div className="shell">
        <div className="card">
          <p className="lede">Loading…</p>
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="shell">
        <div className="card">
          <div className="brand">
            <span className="brand-mark">[ ]</span>
            <span>SpecsDoctor</span>
          </div>
          <p className="lede">{state.message}</p>
        </div>
      </div>
    );
  }

  const { repo, resolved_sha, graph, tours } = state.data;
  const tour = tours.find((t) => t.tour_id === tourId) ?? tours[0];

  return (
    <div className="tour-share-shell">
      <div className="tour-share-header">
        <div className="brand">
          <span className="brand-mark">[ ]</span>
          <span>SpecsDoctor</span>
        </div>
        <span className="tour-share-repo">
          {repo.owner}/{repo.name} · {resolved_sha.slice(0, 7)}
        </span>
        <span className="tour-share-caption">Generated, source-linked documentation draft - not verified. Flagged uncertainty is reviewed in the full app.</span>
      </div>
      <TourPlayer graph={graph} tour={tour} tours={tours} onSelectTour={setTourId} autoPlay />
    </div>
  );
}
