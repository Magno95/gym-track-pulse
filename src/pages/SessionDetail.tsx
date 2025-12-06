import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabaseStore, ExerciseWithSessions } from "@/lib/supabaseStore";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Dumbbell } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { toast } from "sonner";

interface SessionExercise {
  exerciseId: string;
  exerciseName: string;
  category: string;
  value: number;
  series: number;
  reps: number;
  weight: number;
}

const SessionDetail = () => {
  const { date } = useParams<{ date: string }>();
  const navigate = useNavigate();
  const [exercises, setExercises] = useState<SessionExercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalValue, setTotalValue] = useState(0);

  useEffect(() => {
    const loadSessionData = async () => {
      if (!date) return;
      
      try {
        setLoading(true);
        const allExercises = await supabaseStore.getAll();
        
        const sessionExercises: SessionExercise[] = [];
        let total = 0;
        
        allExercises.forEach((exercise) => {
          const sessionsForDate = exercise.sessions.filter(
            (s) => s.date === date
          );
          
          sessionsForDate.forEach((session) => {
            sessionExercises.push({
              exerciseId: exercise.id,
              exerciseName: exercise.name,
              category: exercise.category,
              value: session.value,
              series: session.series,
              reps: session.reps,
              weight: session.weight,
            });
            total += session.value;
          });
        });
        
        setExercises(sessionExercises);
        setTotalValue(total);
      } catch (error) {
        console.error("Error loading session:", error);
        toast.error("Failed to load session");
      } finally {
        setLoading(false);
      }
    };

    loadSessionData();
  }, [date]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Caricamento...</p>
      </div>
    );
  }

  if (!date || exercises.length === 0) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Sessione non trovata</p>
        <Button onClick={() => navigate("/")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Torna alla home
        </Button>
      </div>
    );
  }

  const formattedDate = format(new Date(date), "EEEE d MMMM yyyy", { locale: it });

  return (
    <div className="min-h-screen bg-background pb-8">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border/50">
        <div className="container max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-xl font-bold text-foreground capitalize">
                {formattedDate}
              </h1>
              <p className="text-sm text-muted-foreground">
                {exercises.length} esercizi • {totalValue.toLocaleString()} punti totali
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Exercise List */}
      <div className="container max-w-2xl mx-auto px-4 py-6 space-y-3">
        {exercises.map((exercise, index) => (
          <Card
            key={`${exercise.exerciseId}-${index}`}
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => navigate(`/exercise/${exercise.exerciseId}`)}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Dumbbell className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">
                      {exercise.exerciseName}
                    </p>
                    <p className="text-sm text-muted-foreground capitalize">
                      {exercise.category}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-primary">
                    {exercise.value.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {exercise.series}×{exercise.reps} @ {exercise.weight}kg
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default SessionDetail;
