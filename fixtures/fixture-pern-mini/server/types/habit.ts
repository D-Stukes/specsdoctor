export interface Habit {
  id: number;
  userId: number;
  title: string;
  frequency: string;
}

export type HabitFrequency = "daily" | "weekly";

export function describeHabit(habit: Habit): string {
  return `${habit.title} (${habit.frequency})`;
}
