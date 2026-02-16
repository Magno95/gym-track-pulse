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
import { TrendingUp, Trash2, Image } from "lucide-react";
import { getCategoryConfig } from "@/lib/categoryIcons";
import { ExerciseWithSessions } from "@/lib/supabaseStore";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getCachedExercises, setCachedExercises, addToSyncQueue } from "@/lib/localCache";
import { EXERCISES_QUERY_KEY } from "@/hooks/useExercises";

interface ExerciseCardProps {
  exercise: ExerciseWithSessions;
  onDeleted: () => void;
}

export function ExerciseCard({ exercise, onDeleted }: ExerciseCardProps) {
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);
  const queryClient = useQueryClient();
  const latestSession = exercise.sessions[exercise.sessions.length - 1];
  const previousSession = exercise.sessions[exercise.sessions.length - 2];
  
  const categoryInfo = getCategoryConfig(exercise.category);
  const CategoryIcon = categoryInfo.icon;
  
  const improvement = previousSession 
    ? ((latestSession.value - previousSession.value) / previousSession.value * 100).toFixed(1)
    : null;

  const handleDelete = () => {
    // Update react-query cache
    queryClient.setQueryData<ExerciseWithSessions[]>(EXERCISES_QUERY_KEY, (old) =>
      old?.filter(e => e.id !== exercise.id) || []
    );
    // Update localStorage cache
    const cache = getCachedExercises();
    if (cache) {
      setCachedExercises(cache.filter(e => e.id !== exercise.id));
    }
    // Queue for background DB sync
    addToSyncQueue({ type: 'delete_exercise', payload: { exerciseId: exercise.id } });
    toast.success("Exercise deleted");
    onDeleted();
  };

  return (
    <Card 
      className="p-0 hover:shadow-lg transition-all animate-fade-in border-border/50 relative group overflow-hidden"
      style={{ boxShadow: 'var(--shadow-card)' }}
    >
      <div className="flex h-full">
        {/* Image on the left */}
        <div 
          className="w-20 flex-shrink-0 cursor-pointer self-stretch"
          onClick={() => navigate(`/exercise/${exercise.id}`)}
        >
          {exercise.image_url ? (
            <img 
              src={exercise.image_url} 
              alt={exercise.name}
              className="w-full h-full object-cover rounded-l-xl block"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                e.currentTarget.nextElementSibling?.classList.remove('hidden');
              }}
            />
          ) : null}
          <div className={`w-full h-full bg-muted flex items-center justify-center rounded-l-xl ${exercise.image_url ? 'hidden' : ''}`}>
            <Image className="h-6 w-6 text-muted-foreground" />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 p-3 flex items-start justify-between">
          <div className="flex-1 cursor-pointer" onClick={() => navigate(`/exercise/${exercise.id}`)}>
            <h3 className="font-semibold text-base text-foreground mb-1">
              {exercise.name}
            </h3>
            {latestSession && (
              <div className="text-sm text-muted-foreground space-y-0.5">
                <p className="text-xs">Last: {latestSession.series}×{latestSession.reps} @ {latestSession.weight}kg</p>
                <p className="text-xs">{new Date(latestSession.date).toLocaleDateString()}</p>
              </div>
            )}
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-1">
              <CategoryIcon className={`h-4 w-4 ${categoryInfo.color}`} />
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
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
      </div>
    </Card>
  );
}
