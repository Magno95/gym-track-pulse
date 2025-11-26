import { Card } from "@/components/ui/card";
import { Dumbbell, TrendingUp } from "lucide-react";
import { Exercise } from "@/data/mockData";
import { useNavigate } from "react-router-dom";

interface ExerciseCardProps {
  exercise: Exercise;
}

export function ExerciseCard({ exercise }: ExerciseCardProps) {
  const navigate = useNavigate();
  const latestSession = exercise.sessions[exercise.sessions.length - 1];
  const previousSession = exercise.sessions[exercise.sessions.length - 2];
  
  const improvement = previousSession 
    ? ((latestSession.value - previousSession.value) / previousSession.value * 100).toFixed(1)
    : null;

  return (
    <Card 
      className="p-4 hover:shadow-lg transition-all cursor-pointer animate-fade-in border-border/50"
      style={{ boxShadow: 'var(--shadow-card)' }}
      onClick={() => navigate(`/exercise/${exercise.id}`)}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="font-semibold text-lg text-foreground mb-1">
            {exercise.name}
          </h3>
          {latestSession && (
            <div className="text-sm text-muted-foreground space-y-1">
              <p>Last: {latestSession.series}×{latestSession.reps} @ {latestSession.weight}kg</p>
              <p className="text-xs">{new Date(latestSession.date).toLocaleDateString()}</p>
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <Dumbbell className="h-5 w-5 text-primary" />
          {improvement && (
            <div className={`flex items-center gap-1 text-xs ${
              parseFloat(improvement) > 0 ? 'text-accent' : 'text-muted-foreground'
            }`}>
              <TrendingUp className="h-3 w-3" />
              {improvement}%
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
