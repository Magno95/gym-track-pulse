import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useExercises, useInvalidateExercises } from "@/hooks/useExercises";
import { CategorySection } from "@/components/CategorySection";
import { AddExerciseDialog } from "@/components/AddExerciseDialog";
import { SessionCard, DaySession } from "@/components/SessionCard";
import { SessionStatistics } from "@/components/SessionStatistics";
import { ExerciseSearchBar } from "@/components/ExerciseSearchBar";
import { LogOut } from "lucide-react";
import gymTrackLogo from "@/assets/gym-track-logo.jpg";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

const Index = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"exercises" | "sessions">("exercises");
  
  const { data: exercises = [], isLoading: loading, isFetching } = useExercises();
  const { invalidateAll } = useInvalidateExercises();

  const handleExerciseAdded = () => {
    invalidateAll();
  };

  const handleExerciseDeleted = () => {
    invalidateAll();
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast.success("Signed out successfully");
    navigate("/auth");
  };

  // Group sessions by date
  const daySessions = useMemo(() => {
    const sessionsByDate = new Map<string, DaySession>();

    exercises.forEach((exercise) => {
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
  }, [exercises]);

  const categoriesList = ["arms", "chest", "back", "legs", "core", "cardio"] as const;

  return (
    <div className="min-h-screen bg-background pb-8">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border/50">
        <div className="container max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3 mb-4">
            <img 
              src={gymTrackLogo} 
              alt="GymTrack Logo" 
              className="h-10 w-10 rounded-full object-cover"
            />
            <div className="flex flex-1 items-baseline gap-2">
              <h1 className="text-2xl font-bold text-foreground">GymTrack</h1>
              <span className="text-xs font-medium text-muted-foreground">v{__APP_VERSION__}</span>
            </div>
            <Button variant="ghost" size="icon" onClick={handleSignOut}>
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
          
          {/* Tab Selector */}
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "exercises" | "sessions")} className="mb-4">
            <TabsList className="w-full">
              <TabsTrigger value="exercises" className="flex-1">Exercises</TabsTrigger>
              <TabsTrigger value="sessions" className="flex-1">Sessions</TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Search Bar - only visible on exercises tab */}
          {activeTab === "exercises" && (
            <ExerciseSearchBar exercises={exercises} />
          )}
        </div>
      </div>

      {/* Content */}
      <div className="container max-w-2xl mx-auto px-4 py-6 space-y-6">
        {loading ? (
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
                <SessionStatistics sessions={daySessions} />
                <div className="space-y-3">
                  {daySessions.map((session) => (
                    <SessionCard key={session.date} session={session} />
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-muted-foreground">No sessions found</p>
              </div>
            )}
          </>
        )}
      </div>

      {activeTab === "exercises" && (
        <AddExerciseDialog onExerciseAdded={handleExerciseAdded} />
      )}
    </div>
  );
};

export default Index;
