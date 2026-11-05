import { useMemo } from "react";
import { useDaySession } from "@/hooks/useExercises";
import { QueryError } from "@/components/QueryError";
import { isCalendarDate } from "@/lib/validation";
import { getSessionSets, isBodyweightSession, isTimedBodyweightSession } from "@/lib/bodyweight";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Dumbbell, Zap } from "lucide-react";
import { format } from "date-fns";
import { enUS } from "date-fns/locale";
import { getCategoryIcon } from "@/lib/categoryIcons";
import { StravaPublish } from "@/components/StravaPublish";

interface SessionExercise {
  sessionId: string;
  exerciseId: string;
  exerciseName: string;
  category: string;
  unit: string | null;
  value: number;
  series: number;
  reps: number;
  weight: number;
  totalReps: number;
  durationSeconds: number | null;
  supersetId: string | null;
  isSupersetSecondary: boolean;
  valueMultiplier: number;
}

interface SupersetGroup {
  supersetId: string;
  exercises: SessionExercise[];
  totalValue: number;
}

const getUnitSuffix = (unit?: string | null) => {
  switch (unit) {
    case "distance": return "m";
    case "time": return "s";
    case "weight":
    default: return "kg";
  }
};

const SessionDetail = () => {
  const { date } = useParams<{ date: string }>();
  const navigate = useNavigate();
  const { data, isLoading: loading, isError, refetch, hasCompleteHistory } = useDaySession(date && isCalendarDate(date) ? date : undefined);
  const exercises = useMemo<SessionExercise[]>(() => data.flatMap((exercise) =>
    exercise.sessions.filter((session) => session.date === date).map((session) => {
      const sets = getSessionSets(session);
      const timed = isTimedBodyweightSession(session);
      return {
        sessionId: session.id, exerciseId: exercise.id, exerciseName: exercise.name,
        category: exercise.category, unit: isBodyweightSession(session) ? "weight" : exercise.unit, value: session.value,
        series: session.series, reps: session.reps, weight: session.weight,
        totalReps: timed ? 0 : sets.reduce((sum, set) => sum + (Number(set.reps) || 0), 0),
        durationSeconds: timed ? sets.reduce((sum, set) => sum + (Number(set.duration_seconds) || 0), 0) : null,
        supersetId: session.superset_id, isSupersetSecondary: session.is_superset_secondary ?? false,
        valueMultiplier: session.value_multiplier ?? 1,
      };
    })), [data, date]);
  const totalValue = exercises.reduce((sum, exercise) => sum + exercise.value, 0);

  // Group exercises: supersets together, regular exercises separate
  const groupedExercises = () => {
    const supersets = new Map<string, SupersetGroup>();
    const regularExercises: SessionExercise[] = [];

    exercises.forEach((exercise) => {
      if (exercise.supersetId) {
        const existing = supersets.get(exercise.supersetId);
        if (existing) {
          existing.exercises.push(exercise);
          existing.totalValue += exercise.value;
          // Sort so primary comes first
          existing.exercises.sort((a, b) => 
            (a.isSupersetSecondary ? 1 : 0) - (b.isSupersetSecondary ? 1 : 0)
          );
        } else {
          supersets.set(exercise.supersetId, {
            supersetId: exercise.supersetId,
            exercises: [exercise],
            totalValue: exercise.value,
          });
        }
      } else {
        regularExercises.push(exercise);
      }
    });

    return { supersets: Array.from(supersets.values()), regularExercises };
  };

  const { supersets, regularExercises } = groupedExercises();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (isError && !exercises.length) return <div className="p-8"><QueryError onRetry={() => void refetch()} /></div>;

  if (!date || !isCalendarDate(date) || exercises.length === 0) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Session not found</p>
        <Button onClick={() => navigate("/")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to home
        </Button>
      </div>
    );
  }

  const formattedDate = format(new Date(`${date}T12:00:00`), "EEEE, MMMM d, yyyy", { locale: enUS });
  const totalSets = exercises.reduce((sum, exercise) => sum + exercise.series, 0);
  const totalReps = exercises.reduce((sum, exercise) => sum + exercise.totalReps, 0);

  const renderExerciseCard = (exercise: SessionExercise, showSupersetBadge = false) => {
    const CategoryIcon = getCategoryIcon(exercise.category);
    return (
      <div
        key={exercise.sessionId}
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => navigate(`/exercise/${exercise.exerciseId}`)}
      >
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <CategoryIcon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="font-semibold text-foreground">
                {exercise.exerciseName}
              </p>
              {exercise.isSupersetSecondary && (
                <span className="text-xs text-accent font-medium">{exercise.valueMultiplier.toFixed(2)}x</span>
              )}
            </div>
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
            {exercise.durationSeconds !== null ? `${exercise.series} sets · ${exercise.durationSeconds}s` : `${exercise.series}×${exercise.reps}`} @ {exercise.weight}{getUnitSuffix(exercise.unit)}
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background pb-8">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-xs border-b border-border/50">
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
                {exercises.length} exercises • {totalValue.toLocaleString()} {hasCompleteHistory ? "total" : "available"} points
              </p>
              <p className="text-xs text-muted-foreground">
                {totalSets.toLocaleString()} sets • {totalReps.toLocaleString()} reps
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Exercise List */}
      <div className="container max-w-2xl mx-auto px-4 py-6 space-y-3">
        <StravaPublish date={date} exercises={data} complete={hasCompleteHistory && !isError} />
        {isError && <QueryError onRetry={() => void refetch()} />}
        {!hasCompleteHistory && <p role="status" className="text-sm text-muted-foreground">
          Only changes saved on this device are available. Connect to load the full day.
        </p>}
        {/* Superset Cards */}
        {supersets.map((superset) => (
          <Card
            key={superset.supersetId}
            className="overflow-hidden border-accent/30"
            style={{ boxShadow: '0 0 0 1px hsl(var(--accent) / 0.2)' }}
          >
            <div className="bg-accent/10 px-4 py-2 flex items-center justify-between border-b border-accent/20">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-accent" />
                <span className="text-sm font-medium text-accent">Super Set</span>
              </div>
              <span className="text-sm font-bold text-accent">
                {superset.totalValue.toLocaleString()} pts
              </span>
            </div>
            <CardContent className="p-0 divide-y divide-border/50">
              {superset.exercises.map((exercise) => renderExerciseCard(exercise, true))}
            </CardContent>
          </Card>
        ))}

        {/* Regular Exercise Cards */}
        {regularExercises.map((exercise) => (
          <Card
            key={exercise.sessionId}
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => navigate(`/exercise/${exercise.exerciseId}`)}
          >
            <CardContent className="p-0">
              {renderExerciseCard(exercise)}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default SessionDetail;
