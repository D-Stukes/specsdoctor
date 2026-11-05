// Literal fetch URL: matched to an endpoint path for the repo-map add-on
// (Task 10's calls_endpoint edges). Not required by the core Scanner.
export async function fetchHabits() {
  const res = await fetch("/api/habits");
  return res.json();
}
