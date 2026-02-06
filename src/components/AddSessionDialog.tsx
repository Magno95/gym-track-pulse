import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Plus, Zap, X } from "lucide-react";
import { supabaseStore, ExerciseWithSessions } from "@/lib/supabaseStore";
import { getCategoryIcon } from "@/lib/categoryIcons";
import { useAddSession, useAddSupersetSession } from "@/hooks/useSessionMutations";

const setSchema = z.object({
  reps: z.coerce
    .number()
    .min(1, { message: "Must be at least 1 rep" })
    .max(100, { message: "Maximum 100 reps" }),
  weight: z.coerce
    .number()
    .min(0, { message: "Weight cannot be negative" })
    .max(1000, { message: "Maximum 1000 kg" }),
});

const sessionSchema = z.object({
  date: z.string().min(1, { message: "Date is required" }),
  sets: z.array(setSchema).min(1, { message: "Must add at least 1 set" }),
  isSuperSet: z.boolean().default(false),
  secondaryExerciseId: z.string().optional(),
  secondarySets: z.array(setSchema).optional(),
});

type SessionFormValues = z.infer<typeof sessionSchema>;

type UnitType = "weight" | "distance" | "time";

const getUnitLabel = (unit: UnitType): string => {
  switch (unit) {
    case "weight": return "Weight (kg)";
    case "distance": return "Distance (m)";
    case "time": return "Time (s)";
    default: return "Weight (kg)";
  }
};

interface AddSessionDialogProps {
  exerciseId: string;
  exerciseName: string;
  unit?: string | null;
  supersetMultiplier?: number | null;
  onSessionAdded: () => void;
}

export function AddSessionDialog({
  exerciseId,
  exerciseName,
  unit = "weight",
  supersetMultiplier = 1.2,
  onSessionAdded,
}: AddSessionDialogProps) {
  const [open, setOpen] = useState(false);
  const addSessionMutation = useAddSession(exerciseId);
  const addSupersetMutation = useAddSupersetSession();
  const [exercises, setExercises] = useState<ExerciseWithSessions[]>([]);
  const [selectedSecondaryExercise, setSelectedSecondaryExercise] = useState<ExerciseWithSessions | null>(null);
  const primarySetsRef = useRef<HTMLDivElement>(null);
  const secondarySetsRef = useRef<HTMLDivElement>(null);

  const form = useForm<SessionFormValues>({
    resolver: zodResolver(sessionSchema),
    defaultValues: {
      date: new Date().toISOString().split("T")[0],
      sets: [{ reps: 10, weight: 0 }],
      isSuperSet: false,
      secondaryExerciseId: undefined,
      secondarySets: [{ reps: 10, weight: 0 }],
    },
  });

  const isSuperSet = form.watch("isSuperSet");

  useEffect(() => {
    const loadExercises = async () => {
      try {
        const data = await supabaseStore.getAll();
        setExercises(data.filter(ex => ex.id !== exerciseId));
      } catch (error) {
        console.error("Error loading exercises:", error);
      }
    };
    if (open) {
      loadExercises();
    }
  }, [open, exerciseId]);

  const addSet = () => {
    const currentSets = form.getValues("sets");
    const lastSet = currentSets[currentSets.length - 1];
    form.setValue("sets", [...currentSets, { reps: lastSet?.reps ?? 10, weight: lastSet?.weight ?? 0 }]);
    setTimeout(() => {
      primarySetsRef.current?.scrollTo({ top: primarySetsRef.current.scrollHeight, behavior: 'smooth' });
    }, 50);
  };

  const removeSet = (index: number) => {
    const currentSets = form.getValues("sets");
    if (currentSets.length > 1) {
      form.setValue("sets", currentSets.filter((_, i) => i !== index));
    }
  };

  const addSecondarySet = () => {
    const currentSets = form.getValues("secondarySets") || [];
    const lastSet = currentSets[currentSets.length - 1];
    form.setValue("secondarySets", [...currentSets, { reps: lastSet?.reps ?? 10, weight: lastSet?.weight ?? 0 }]);
    setTimeout(() => {
      secondarySetsRef.current?.scrollTo({ top: secondarySetsRef.current.scrollHeight, behavior: 'smooth' });
    }, 50);
  };

  const removeSecondarySet = (index: number) => {
    const currentSets = form.getValues("secondarySets") || [];
    if (currentSets.length > 1) {
      form.setValue("secondarySets", currentSets.filter((_, i) => i !== index));
    }
  };

  const handleSelectSecondaryExercise = (exercise: ExerciseWithSessions) => {
    setSelectedSecondaryExercise(exercise);
    form.setValue("secondaryExerciseId", exercise.id);
  };

  const handleClearSecondaryExercise = () => {
    setSelectedSecondaryExercise(null);
    form.setValue("secondaryExerciseId", undefined);
  };

  const multiplier = supersetMultiplier || 1.2;

  const loading = addSessionMutation.isPending || addSupersetMutation.isPending;

  const onSubmit = async (data: SessionFormValues) => {
    const resetForm = () => {
      const lastSet = data.sets[data.sets.length - 1];
      form.reset({
        date: new Date().toISOString().split("T")[0],
        sets: [{ reps: lastSet.reps, weight: lastSet.weight }],
        isSuperSet: false,
        secondaryExerciseId: undefined,
        secondarySets: [{ reps: 10, weight: 0 }],
      });
      setSelectedSecondaryExercise(null);
      setOpen(false);
      onSessionAdded();
    };

    if (data.isSuperSet && data.secondaryExerciseId && data.secondarySets?.length) {
      addSupersetMutation.mutate(
        {
          primaryExerciseId: exerciseId,
          secondaryExerciseId: data.secondaryExerciseId,
          date: data.date,
          primarySets: data.sets as Array<{ reps: number; weight: number }>,
          secondarySets: data.secondarySets as Array<{ reps: number; weight: number }>,
          multiplier,
        },
        { onSuccess: resetForm }
      );
    } else {
      addSessionMutation.mutate(
        {
          date: data.date,
          sets: data.sets as Array<{ reps: number; weight: number }>,
        },
        { onSuccess: resetForm }
      );
    }
  };

  const unitLabel = getUnitLabel((unit || "weight") as UnitType);

  // Calculate live scores
  const primarySets = form.watch("sets") || [];
  const secondarySets = form.watch("secondarySets") || [];
  
  const primaryScore = primarySets.reduce((sum, set) => sum + (set.reps * set.weight), 0);
  const secondaryScore = isSuperSet && selectedSecondaryExercise 
    ? Math.round(secondarySets.reduce((sum, set) => sum + (set.reps * set.weight), 0) * multiplier)
    : 0;
  const totalScore = primaryScore + secondaryScore;

  const renderSetsForm = (
    fieldPrefix: "sets" | "secondarySets",
    label: string,
    addFn: () => void,
    removeFn: (index: number) => void,
    displayUnitLabel: string,
    scrollRef: React.RefObject<HTMLDivElement>
  ) => {
    const sets = form.watch(fieldPrefix) || [];
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <FormLabel>{label} ({sets.length})</FormLabel>
          <Button 
            type="button" 
            size="sm" 
            variant="outline" 
            onClick={(e) => {
              (e.target as HTMLButtonElement).blur();
              addFn();
            }}
            className="active:scale-95 transition-transform"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Set
          </Button>
        </div>
        
        <div ref={scrollRef} className="max-h-[30vh] overflow-y-auto space-y-2 sets-scrollbar pr-1">
          {sets.map((_, index) => (
            <div key={index} className="flex gap-2 items-start">
              <div className={`flex items-center justify-center w-6 h-9 text-xs font-medium text-muted-foreground ${index === 0 ? "mt-6" : ""}`}>
                {index + 1}
              </div>
              <div className="flex-1 grid grid-cols-2 gap-2">
                <FormField
                  control={form.control}
                  name={`${fieldPrefix}.${index}.reps`}
                  render={({ field }) => (
                    <FormItem>
                      {index === 0 && <FormLabel className="text-xs">Reps</FormLabel>}
                      <FormControl>
                        <Input type="number" min="1" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`${fieldPrefix}.${index}.weight`}
                  render={({ field }) => (
                    <FormItem>
                      {index === 0 && <FormLabel className="text-xs">{displayUnitLabel}</FormLabel>}
                      <FormControl>
                        <Input type="number" min="0" step="0.5" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              {sets.length > 1 && (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => removeFn(index)}
                  className={index === 0 ? "mt-6" : ""}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="lg"
          className="fixed bottom-6 left-6 h-14 w-14 rounded-full shadow-lg z-50 hover:scale-110 transition-transform"
          style={{ boxShadow: "var(--shadow-elevated)" }}
        >
          <Plus className="h-6 w-6" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Log New Session</DialogTitle>
          <DialogDescription>
            Record your workout session for {exerciseName}.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col h-full">
            <div className="flex-1 space-y-4 overflow-y-auto sets-scrollbar pr-1">
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} autoFocus={false} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* Primary Exercise Sets */}
              <div className="p-3 rounded-lg bg-muted/50 border border-border">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium text-foreground">{exerciseName}</p>
                  <span className="text-sm font-semibold text-primary">{primaryScore.toLocaleString()} pts</span>
                </div>
                {renderSetsForm("sets", "Sets", addSet, removeSet, unitLabel, primarySetsRef)}
              </div>

              {/* Live Total Score */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-primary/10 border border-primary/20">
                <span className="text-sm font-medium">Session Score</span>
                <span className="text-lg font-bold text-primary">{totalScore.toLocaleString()} pts</span>
              </div>

              {/* Super Set Toggle */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-accent/10 border border-accent/20">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-accent" />
                  <span className="text-sm font-medium">Super Set</span>
                  <Badge variant="secondary" className="text-xs">{multiplier}x bonus</Badge>
                </div>
                <FormField
                  control={form.control}
                  name="isSuperSet"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={(checked) => {
                            field.onChange(checked);
                            if (!checked) {
                              handleClearSecondaryExercise();
                            }
                          }}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              {/* Secondary Exercise Selection */}
              {isSuperSet && (
                <div className="space-y-3">
                  {!selectedSecondaryExercise ? (
                    <div className="space-y-2">
                      <FormLabel>Select Secondary Exercise</FormLabel>
                      <div className="max-h-40 overflow-y-auto rounded-lg border border-border bg-popover">
                        {exercises.map((exercise) => {
                          const CategoryIcon = getCategoryIcon(exercise.category);
                          return (
                            <button
                              key={exercise.id}
                              type="button"
                              onClick={() => handleSelectSecondaryExercise(exercise)}
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
                        {exercises.length === 0 && (
                          <p className="text-sm text-muted-foreground text-center py-4">
                            No other exercises available
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 rounded-lg bg-accent/5 border border-accent/20">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          {(() => {
                            const CategoryIcon = getCategoryIcon(selectedSecondaryExercise.category);
                            return <CategoryIcon className="h-4 w-4 text-accent" />;
                          })()}
                          <p className="text-sm font-medium text-foreground">
                            {selectedSecondaryExercise.name}
                          </p>
                          <Badge variant="outline" className="text-xs text-accent border-accent">
                            {multiplier}x
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-accent">{secondaryScore.toLocaleString()} pts</span>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            onClick={handleClearSecondaryExercise}
                            className="h-6 w-6"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      {renderSetsForm("secondarySets", "Sets", addSecondarySet, removeSecondarySet, getUnitLabel((selectedSecondaryExercise.unit || "weight") as UnitType), secondarySetsRef)}
                    </div>
                  )}
                </div>
              )}
            </div>
            
            {/* Fixed bottom buttons */}
            <div className="flex gap-3 pt-4 pb-16 mt-auto">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                className="flex-1" 
                disabled={loading || (isSuperSet && !selectedSecondaryExercise)}
              >
                {loading ? "Logging..." : "Log Session"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}