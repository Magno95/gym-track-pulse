import { Card, CardContent } from "@/components/ui/card";
import { Calendar } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { useNavigate } from "react-router-dom";

interface SessionExercise {
  exerciseId: string;
  exerciseName: string;
  value: number;
  series: number;
  reps: number;
  weight: number;
}

export interface DaySession {
  date: string;
  totalValue: number;
  exercises: SessionExercise[];
}

interface SessionCardProps {
  session: DaySession;
}

export function SessionCard({ session }: SessionCardProps) {
  const navigate = useNavigate();

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => navigate(`/session/${session.date}`)}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Calendar className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-foreground">
                {format(new Date(session.date), "dd-MM-yyyy")}
              </p>
              <p className="text-sm text-muted-foreground">
                {session.exercises.length} esercizi
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold text-primary">
              {session.totalValue.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground">punti</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
