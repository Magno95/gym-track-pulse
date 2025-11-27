import { ExerciseWithSessions } from "@/lib/supabaseStore";
import { ExerciseCard } from "./ExerciseCard";
import { Dumbbell, Heart, Zap, Activity } from "lucide-react";

interface CategorySectionProps {
  category: "arms" | "chest" | "back" | "legs";
  exercises: ExerciseWithSessions[];
  onExerciseDeleted: () => void;
}

const categoryConfig = {
  arms: { icon: Dumbbell, label: "Arms", color: "text-primary" },
  chest: { icon: Heart, label: "Chest", color: "text-accent" },
  back: { icon: Activity, label: "Back", color: "text-primary" },
  legs: { icon: Zap, label: "Legs", color: "text-accent" },
};

export function CategorySection({ category, exercises, onExerciseDeleted }: CategorySectionProps) {
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
        {exercises.map((exercise) => (
          <ExerciseCard key={exercise.id} exercise={exercise} onDeleted={onExerciseDeleted} />
        ))}
      </div>
    </div>
  );
}
