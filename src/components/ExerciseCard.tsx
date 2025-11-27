import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Dumbbell, TrendingUp, Trash2 } from "lucide-react";
import { ExerciseWithSessions, supabaseStore } from "@/lib/supabaseStore";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useState } from "react";

interface ExerciseCardProps {
  exercise: ExerciseWithSessions;
  onDeleted: () => void;
}

export function ExerciseCard({ exercise, onDeleted }: ExerciseCardProps) {
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);
  const latestSession = exercise.sessions[exercise.sessions.length - 1];
  const previousSession = exercise.sessions[exercise.sessions.length - 2];
  
  const improvement = previousSession 
    ? ((latestSession.value - previousSession.value) / previousSession.value * 100).toFixed(1)
    : null;

  const handleDelete = async () => {
    try {
      setDeleting(true);
      await supabaseStore.deleteExercise(exercise.id);
      toast.success("Exercise deleted successfully");
      onDeleted();
    } catch (error) {
      console.error("Error deleting exercise:", error);
      toast.error("Failed to delete exercise");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Card 
      className="p-4 hover:shadow-lg transition-all animate-fade-in border-border/50 relative group"
      style={{ boxShadow: 'var(--shadow-card)' }}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 cursor-pointer" onClick={() => navigate(`/exercise/${exercise.id}`)}>
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
          <div className="flex items-center gap-2">
            <Dumbbell className="h-5 w-5 text-primary" />
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Exercise</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete "{exercise.name}"? This will also delete all associated sessions. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} disabled={deleting}>
                    {deleting ? "Deleting..." : "Delete"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
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
