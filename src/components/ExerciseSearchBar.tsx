import { useState, useRef, useEffect } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useNavigate } from "react-router-dom";
import { getCategoryIcon } from "@/lib/categoryIcons";

interface Exercise {
  id: string;
  name: string;
  category: string;
}

interface ExerciseSearchBarProps {
  exercises: Exercise[];
}

export const ExerciseSearchBar = ({ exercises }: ExerciseSearchBarProps) => {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const filteredExercises = exercises.filter((exercise) =>
    exercise.name.toLowerCase().includes(query.toLowerCase())
  );

  const handleSelect = (exerciseId: string) => {
    navigate(`/exercise/${exerciseId}`);
    setQuery("");
    setIsOpen(false);
  };

  const handleClear = () => {
    setQuery("");
    inputRef.current?.focus();
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          type="text"
          placeholder="Search exercises..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          className="pl-9 pr-9"
        />
        {query && (
          <button
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Suggestions dropdown */}
      {isOpen && query && filteredExercises.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg z-50 max-h-64 overflow-y-auto">
          {filteredExercises.map((exercise) => {
            const CategoryIcon = getCategoryIcon(exercise.category);
            return (
              <button
                key={exercise.id}
                onClick={() => handleSelect(exercise.id)}
                className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-accent transition-colors"
              >
                <CategoryIcon className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{exercise.name}</span>
                <span className="text-xs text-muted-foreground ml-auto capitalize">
                  {exercise.category}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {isOpen && query && filteredExercises.length === 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg z-50 p-3">
          <p className="text-sm text-muted-foreground text-center">No exercises found</p>
        </div>
      )}
    </div>
  );
};
