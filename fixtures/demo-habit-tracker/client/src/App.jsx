import { useEffect, useState } from "react";
import { fetchHabits, saveHabit } from "./api/habits.js";

export default function App() {
  const [habits, setHabits] = useState([]);
  const userId = "1";

  useEffect(() => {
    fetchHabits(userId).then(setHabits);
  }, []);

  async function add(name) {
    const habit = await saveHabit(userId, name);
    setHabits([habit, ...habits]);
  }

  return (
    <main>
      <h1>Habits</h1>
      <button onClick={() => add("Read")}>Add "Read"</button>
      <ul>{habits.map((h) => <li key={h.id}>{h.name}</li>)}</ul>
    </main>
  );
}
