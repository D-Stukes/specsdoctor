import React, { useEffect, useState } from "react";
import { fetchHabits } from "../api/fetchHabits";

export default function HabitsPage() {
  const [habits, setHabits] = useState([]);

  useEffect(() => {
    fetchHabits().then(setHabits);
  }, []);

  return (
    <ul>
      {habits.map((habit) => (
        <li key={habit.id}>{habit.title}</li>
      ))}
    </ul>
  );
}
