import { thumbnailUrl } from "@/lib/exerciseImages";
import { exerciseImageUrl, generatedThumbnailUrl } from "@/lib/generatedExerciseImages";
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
import { addToSyncQueue } from "@/lib/localCache";
import { isBodyweightSession, isTimedBodyweightSession } from "@/lib/bodyweight";

interface ExerciseCardProps {
  exercise: ExerciseWithSessions;
  onDeleted: () => void;
}

const getUnitSuffix = (unit?: string | null) => {
  switch (unit) {
    case "distance": return "m";
    case "time": return "s";
    case "weight":
    default: return "kg";
  }
};

export function ExerciseCard({ exercise, onDeleted }: ExerciseCardProps) {
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);
  const imageUrl = exerciseImageUrl(exercise.name, exercise.image_url);
  const isDefaultImage = !!imageUrl && generatedThumbnailUrl(imageUrl) !== null;
  const latestSession = exercise.sessions[exercise.sessions.length - 1];
  const previousSession = exercise.sessions[exercise.sessions.length - 2];
  
  const categoryInfo = getCategoryConfig(exercise.category);
  const CategoryIcon = categoryInfo.icon;
  
  const improvement = previousSession && previousSession.value > 0 && latestSession
    ? ((latestSession.value - previousSession.value) / previousSession.value * 100).toFixed(1)
    : null;

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await addToSyncQueue({ type: "delete_exercise", payload: { exerciseId: exercise.id, imageUrl: exercise.image_url ?? undefined } }, exercise.user_id);
      onDeleted();
    } catch { toast.error("Could not save the deletion. Please retry."); }
    finally { setDeleting(false); }
  };

  return (
    <Card 
      className="p-0 hover:shadow-lg transition-all animate-fade-in border-border/50 relative group overflow-hidden"
      style={{ boxShadow: 'var(--shadow-card)' }}
    >
      <div className="flex h-full">
        {/* Image on the left */}
        <div 
          className="w-20 shrink-0 cursor-pointer self-stretch"
          onClick={() => navigate(`/exercise/${exercise.id}`)}
        >
          {imageUrl ? (
            <img 
              loading="lazy" decoding="async"
              src={thumbnailUrl(imageUrl)}
              alt={exercise.name}
              className={`w-full h-full ${isDefaultImage ? "object-contain bg-white" : "object-cover"} rounded-l-xl block`}
              onError={(e) => {
                if (e.currentTarget.getAttribute("src") !== imageUrl) { e.currentTarget.src = imageUrl; return; }
                e.currentTarget.style.display = 'none';
                e.currentTarget.nextElementSibling?.classList.remove('hidden');
              }}
            />
          ) : null}
          <div className={`w-full h-full bg-muted flex items-center justify-center rounded-l-xl ${imageUrl ? 'hidden' : ''}`}>
            <Image className="h-6 w-6 text-muted-foreground" />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 p-3 flex items-start justify-between">
          <div className="flex-1 cursor-pointer" onClick={() => navigate(`/exercise/${exercise.id}`)}>
            <h3 className="font-semibold text-base text-foreground mb-1">
              {exercise.name}
            </h3>
            {exercise.is_bodyweight && <p className="mb-1 text-xs font-medium text-primary">{exercise.unit === "time" ? "Timed bodyweight + added load" : "Bodyweight + added load"}</p>}
            {latestSession && (
              <div className="text-sm text-muted-foreground space-y-0.5">
                <p className="text-xs">Last: {latestSession.series}×{latestSession.reps}{isTimedBodyweightSession(latestSession) ? "s" : ""} @ {latestSession.weight}{isBodyweightSession(latestSession) ? "kg" : getUnitSuffix(exercise.unit)}</p>
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
