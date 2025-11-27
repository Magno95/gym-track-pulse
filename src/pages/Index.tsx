import { useState, useEffect } from "react";
import { supabaseStore, ExerciseWithSessions } from "@/lib/supabaseStore";
import { supabase } from "@/integrations/supabase/client";
import { SearchBar } from "@/components/SearchBar";
import { CategorySection } from "@/components/CategorySection";
import { AddExerciseDialog } from "@/components/AddExerciseDialog";
import { Dumbbell, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

const Index = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [exercises, setExercises] = useState<ExerciseWithSessions[]>([]);
  const [loading, setLoading] = useState(true);

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

  const filteredExercises = exercises.filter((exercise) =>
    exercise.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const categories = ["arms", "chest", "back", "legs"] as const;
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
          <SearchBar value={searchQuery} onChange={setSearchQuery} />
        </div>
      </div>

      {/* Exercise List */}
      <div className="container max-w-2xl mx-auto px-4 py-6 space-y-6">
        {loading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Loading exercises...</p>
          </div>
        ) : (
          <>
            {categories.map((category) => {
              const categoryExercises = filteredExercises.filter(
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
            
            {filteredExercises.length === 0 && !loading && (
              <div className="text-center py-12">
                <p className="text-muted-foreground">No exercises found</p>
              </div>
            )}
          </>
        )}
      </div>

      <AddExerciseDialog onExerciseAdded={handleExerciseAdded} />
    </div>
  );
};

export default Index;
