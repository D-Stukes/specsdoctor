import React from "react";

interface HabitBadgeProps {
  title: string;
  streak: number;
}

export default function HabitBadge({ title, streak }: HabitBadgeProps) {
  return <span>{title}: {streak} days</span>;
}
