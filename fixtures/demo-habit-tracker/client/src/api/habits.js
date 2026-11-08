export async function fetchHabits(userId) {
  const res = await fetch("/api/habits", { headers: { "x-user-id": userId } });
  return res.json();
}

export async function saveHabit(userId, name) {
  const res = await fetch("/api/habits", {
    method: "POST",
    headers: { "x-user-id": userId, "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
  return res.json();
}
