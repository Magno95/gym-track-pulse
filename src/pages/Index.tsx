import { useState, useEffect, useMemo } from "react";
import { supabaseStore, ExerciseWithSessions } from "@/lib/supabaseStore";
import { supabase } from "@/integrations/supabase/client";
import { CategorySection } from "@/components/CategorySection";
import { AddExerciseDialog } from "@/components/AddExerciseDialog";
import { SessionCard, DaySession } from "@/components/SessionCard";
import { Dumbbell, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

const Index = () => {
  const navigate = useNavigate();
  const [exercises, setExercises] = useState<ExerciseWithSessions[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"exercises" | "sessions">("exercises");

  const loadExercises = async () => {
    try {
      setLoading(true);
      const data = await supabaseStore.getAll();
      setExercises(data);
    } catch (error) {
      console.error("Error loading exercises:", error);
      toast.error("Failed to load exercises");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadExercises();
  }, []);

  const handleExerciseAdded = () => {
    loadExercises();
  };

  const handleExerciseDeleted = () => {
    loadExercises();
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

  const categories = ["arms", "chest", "back", "legs", "core"] as const;
  type Category = typeof categories[number];

  return (
    <div className="min-h-screen bg-background pb-8">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border/50">
        <div className="container max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Dumbbell className="h-6 w-6 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-bold text-foreground flex-1">GymTrack</h1>
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
            {categories.map((category) => {
              const categoryExercises = exercises.filter(
                (ex) => ex.category === category
              );
              return (
                <CategorySection
                  key={category}
                  category={category as Category}
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
              <div className="space-y-3">
                {daySessions.map((session) => (
                  <SessionCard key={session.date} session={session} />
                ))}
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
