import { useMemo, useState, lazy, Suspense } from "react";
import { useExercises, useInvalidateExercises, useSessionHistory } from "@/hooks/useExercises";
import { CategorySection } from "@/components/CategorySection";
import { FloatingNavigation } from "@/components/FloatingNavigation";
import { SessionCard, DaySession } from "@/components/SessionCard";
const SessionStatistics = lazy(() => import("@/components/SessionStatistics").then((module) => ({ default: module.SessionStatistics })));
import { QueryError } from "@/components/QueryError";
import { ExerciseSearchBar } from "@/components/ExerciseSearchBar";
import { UserRound } from "lucide-react";
import gymTrackLogo from "@/assets/gym-track-logo-small.jpg";
import { Button } from "@/components/ui/button";

import { Link, useSearchParams } from "react-router-dom";

const Index = () => {
  const [params] = useSearchParams();
  const activeTab = params.get("tab") === "sessions" ? "sessions" : "exercises";
  
  const { data: exercises = [], isLoading: loading, isError, refetch } = useExercises();
  const history = useSessionHistory(activeTab === "sessions");
  const [visibleDays, setVisibleDays] = useState(30);
  const { invalidateAll } = useInvalidateExercises();

  const handleExerciseDeleted = () => {
    invalidateAll();
  };

  // Group sessions by date
  const daySessions = useMemo(() => {
    const sessionsByDate = new Map<string, DaySession>();

    history.data.forEach((exercise) => {
      exercise.sessions.forEach((session) => {
        const existing = sessionsByDate.get(session.date);
        const exerciseData = {
          exerciseId: exercise.id,
          exerciseName: exercise.name,
          value: session.value,
          series: session.series,
          reps: session.reps,
          weight: session.weight,
        };

        if (existing) {
          existing.totalValue += session.value;
          existing.exercises.push(exerciseData);
        } else {
          sessionsByDate.set(session.date, {
            date: session.date,
            totalValue: session.value,
            exercises: [exerciseData],
          });
        }
      });
    });

    // Sort by date descending (most recent first)
    return Array.from(sessionsByDate.values()).sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [history.data]);

  const categoriesList = ["arms", "chest", "back", "legs", "core", "cardio"] as const;

  return (
    <div className="floating-page min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border/50">
        <div className="container max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3 mb-4">
            <img 
              src={gymTrackLogo} 
              width={40} height={40} alt="GymTrack Logo"
              className="h-10 w-10 rounded-full object-cover"
            />
            <div className="flex flex-1 items-baseline gap-2">
              <h1 className="text-2xl font-bold text-foreground">GymTrack</h1>
              <span className="text-xs font-medium text-muted-foreground">v{__APP_VERSION__}</span>
            </div>
            <Button asChild variant="ghost" size="icon" className="rounded-full bg-primary/10 text-primary">
              <Link to="/profile" aria-label="Open profile"><UserRound className="h-5 w-5" /></Link>
            </Button>
          </div>
          
          {/* Search Bar - only visible on exercises tab */}
          {activeTab === "exercises" && (
            <ExerciseSearchBar exercises={exercises} />
          )}
        </div>
      </div>

      {/* Content */}
      <div className="container max-w-2xl mx-auto px-4 py-6 space-y-6">
        {isError && <QueryError onRetry={() => void refetch()} />}
        {activeTab === "sessions" && history.isError && <QueryError onRetry={() => void history.refetch()} />}
        {(activeTab === "sessions" ? history.isLoading : loading) ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Loading...</p>
          </div>
        ) : activeTab === "exercises" ? (
          <>
            {categoriesList.map((category) => {
              const categoryExercises = exercises.filter(
                (ex) => ex.category === category
              );
              return (
                <CategorySection
                  key={category}
                  category={category}
                  exercises={categoryExercises}
                  onExerciseDeleted={handleExerciseDeleted}
                />
              );
            })}
            
            {exercises.length === 0 && !loading && (
              <div className="text-center py-12">
                <p className="text-muted-foreground">No exercises found</p>
              </div>
            )}
          </>
        ) : (
          <>
            {daySessions.length > 0 ? (
              <div className="space-y-6">
                {history.hasCompleteHistory && <Suspense fallback={<p>Loading statistics…</p>}><SessionStatistics sessions={daySessions} /></Suspense>}
                <div className="space-y-3">
                  {daySessions.slice(0, visibleDays).map((session) => (
                    <SessionCard key={session.date} session={session} />
                  ))}
                </div>
                {daySessions.length > visibleDays && <Button variant="outline" onClick={() => setVisibleDays((value) => value + 30)}>Load more days</Button>}
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-muted-foreground">No sessions found</p>
              </div>
            )}
          </>
        )}
      </div>

      <FloatingNavigation />
    </div>
  );
};

export default Index;
