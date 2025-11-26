import { useState, useEffect } from "react";
import { exerciseStore } from "@/lib/exerciseStore";
import { Exercise } from "@/data/mockData";
import { SearchBar } from "@/components/SearchBar";
import { CategorySection } from "@/components/CategorySection";
import { AddExerciseDialog } from "@/components/AddExerciseDialog";
import { Dumbbell } from "lucide-react";

const Index = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [exercises, setExercises] = useState<Exercise[]>([]);

  useEffect(() => {
    setExercises(exerciseStore.getAll());
  }, []);

  const handleExerciseAdded = () => {
    setExercises(exerciseStore.getAll());
  };

  const filteredExercises = exercises.filter((exercise) =>
    exercise.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const categories = ["arms", "chest", "back", "legs"] as const;

  return (
    <div className="min-h-screen bg-background pb-8">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border/50">
        <div className="container max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Dumbbell className="h-6 w-6 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">GymTrack</h1>
          </div>
          <SearchBar value={searchQuery} onChange={setSearchQuery} />
        </div>
      </div>

      {/* Exercise List */}
      <div className="container max-w-2xl mx-auto px-4 py-6 space-y-6">
        {categories.map((category) => {
          const categoryExercises = filteredExercises.filter(
            (ex) => ex.category === category
          );
          return (
            <CategorySection
              key={category}
              category={category}
              exercises={categoryExercises}
            />
          );
        })}
        
        {filteredExercises.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No exercises found</p>
          </div>
        )}
      </div>

      <AddExerciseDialog onExerciseAdded={handleExerciseAdded} />
    </div>
  );
};

export default Index;
