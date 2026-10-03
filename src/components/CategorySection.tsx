import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ExerciseWithSessions } from "@/lib/supabaseStore";
import { ExerciseCard } from "./ExerciseCard";
import { Category, categoryConfig } from "@/lib/categoryIcons";

interface CategorySectionProps {
  category: Category;
  exercises: ExerciseWithSessions[];
  onExerciseDeleted: () => void;
}

export function CategorySection({ category, exercises, onExerciseDeleted }: CategorySectionProps) {
  const [visible, setVisible] = useState(30);
  const config = categoryConfig[category];
  const Icon = config.icon;

  if (exercises.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Icon className={`h-5 w-5 ${config.color}`} />
        <h2 className="text-xl font-bold text-foreground">{config.label}</h2>
        <span className="text-sm text-muted-foreground">({exercises.length})</span>
      </div>
      <div className="grid gap-3">
        {exercises.slice(0, visible).map((exercise) => (
          <ExerciseCard key={exercise.id} exercise={exercise} onDeleted={onExerciseDeleted} />
        ))}
      </div>
      {exercises.length > visible && <Button variant="outline" onClick={() => setVisible((count) => count + 30)}>Load more exercises</Button>}
    </div>
  );
}
