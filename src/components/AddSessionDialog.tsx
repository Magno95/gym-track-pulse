import { useProfile } from "@/hooks/useProfile";
import { findBodyWeight, materializeSets, todayLocal } from "@/lib/bodyweight";
import { BodyweightSummary } from "@/components/BodyweightSummary";
import { toast } from "sonner";
import { useEffect, useRef, useState } from "react";
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
import { getCachedExercises } from "@/lib/localCache";
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
    .max(100000, { message: "Maximum 100000" }),
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
  isBodyweight?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}

export function AddSessionDialog({
  exerciseId,
  exerciseName,
  unit = "weight",
  supersetMultiplier = 1.2,
  onSessionAdded,
  isBodyweight = false,
  open: controlledOpen,
  onOpenChange,
  hideTrigger = false,
}: AddSessionDialogProps) {
  const [localOpen, setLocalOpen] = useState(false);
  const open = controlledOpen ?? localOpen;
  const setOpen = (next: boolean) => { setLocalOpen(next); onOpenChange?.(next); };
  const addSessionMutation = useAddSession(exerciseId);
  const addSupersetMutation = useAddSupersetSession();
  const [exercises, setExercises] = useState<ExerciseWithSessions[]>([]);
  const [selectedSecondaryExercise, setSelectedSecondaryExercise] = useState<ExerciseWithSessions | null>(null);
  const primarySetsRef = useRef<HTMLDivElement>(null);
  const secondarySetsRef = useRef<HTMLDivElement>(null);

  const form = useForm<SessionFormValues>({
    resolver: zodResolver(sessionSchema),
    defaultValues: {
      date: todayLocal(),
      sets: [{ reps: 10, weight: 0 }],
      isSuperSet: false,
      secondaryExerciseId: undefined,
      secondarySets: [{ reps: 10, weight: 0 }],
    },
  });

  const secondaryIsBodyweight = !!selectedSecondaryExercise?.is_bodyweight;
  const { history } = useProfile({ enabled: open && (isBodyweight || secondaryIsBodyweight), loadProfile: false });
  const sessionDate = form.watch("date");
  const bodyWeight = findBodyWeight(history.data ?? [], sessionDate);

  const isSuperSet = form.watch("isSuperSet");
  const primarySets = form.watch("sets") || [];
  const secondarySets = form.watch("secondarySets") || [];
  const multiplier = supersetMultiplier || 1.2;
  const loading = addSessionMutation.isPending || addSupersetMutation.isPending;
  const unitLabel = getUnitLabel((unit || "weight") as UnitType);

  const scoreSets = (sets: Array<{ reps?: number; weight?: number }>, bodyweight: boolean) =>
    sets.reduce((sum, set) => sum + Number(set.reps || 0) * (Number(set.weight || 0) + (bodyweight ? bodyWeight ?? 0 : 0)), 0);
  const primaryScore = Math.round(scoreSets(primarySets, isBodyweight));
  const secondaryScore = isSuperSet && selectedSecondaryExercise
    ? Math.round(scoreSets(secondarySets, secondaryIsBodyweight) * multiplier)
    : 0;
  const totalScore = primaryScore + secondaryScore;

  const resetFormAfterSave = (data: SessionFormValues) => {
    const lastSet = data.sets[data.sets.length - 1];
    form.reset({
      date: todayLocal(),
      sets: [{ reps: lastSet.reps, weight: lastSet.weight }],
      isSuperSet: false,
      secondaryExerciseId: undefined,
      secondarySets: [{ reps: 10, weight: 0 }],
    });
    setSelectedSecondaryExercise(null);
  };

  useEffect(() => {
    if (!open) return;

    const cached = getCachedExercises();
    if (cached) {
      setExercises(cached.filter((exercise) => exercise.id !== exerciseId));
      return;
    }

    supabaseStore.getAll()
      .then((data) => setExercises(data.filter((exercise) => exercise.id !== exerciseId)))
      .catch((error) => console.error("Error loading exercises:", error));
  }, [open, exerciseId]);

  const addSet = () => {
    const currentSets = form.getValues("sets");
    const lastSet = currentSets[currentSets.length - 1];
    form.setValue("sets", [...currentSets, { reps: lastSet?.reps ?? 10, weight: lastSet?.weight ?? 0 }], {
      shouldDirty: true,
      shouldValidate: true,
    });
    setTimeout(() => {
      primarySetsRef.current?.scrollTo({ top: primarySetsRef.current.scrollHeight, behavior: "smooth" });
    }, 50);
  };

  const removeSet = (index: number) => {
    const currentSets = form.getValues("sets");
    if (currentSets.length > 1) {
      form.setValue("sets", currentSets.filter((_, i) => i !== index), {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
  };

  const addSecondarySet = () => {
    const currentSets = form.getValues("secondarySets") || [];
    const lastSet = currentSets[currentSets.length - 1];
    form.setValue("secondarySets", [...currentSets, { reps: lastSet?.reps ?? 10, weight: lastSet?.weight ?? 0 }], {
      shouldDirty: true,
      shouldValidate: true,
    });
    setTimeout(() => {
      secondarySetsRef.current?.scrollTo({ top: secondarySetsRef.current.scrollHeight, behavior: "smooth" });
    }, 50);
  };

  const removeSecondarySet = (index: number) => {
    const currentSets = form.getValues("secondarySets") || [];
    if (currentSets.length > 1) {
      form.setValue("secondarySets", currentSets.filter((_, i) => i !== index), {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
  };

  const handleSelectSecondaryExercise = (exercise: ExerciseWithSessions) => {
    setSelectedSecondaryExercise(exercise);
    form.setValue("secondaryExerciseId", exercise.id, {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  const handleClearSecondaryExercise = () => {
    setSelectedSecondaryExercise(null);
    form.setValue("secondaryExerciseId", undefined, {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  const onSubmit = async (data: SessionFormValues) => {
    const resetForm = () => {
      resetFormAfterSave(data);
      setOpen(false);
      onSessionAdded();
    };

    let savedPrimarySets;
    let savedSecondarySets: ReturnType<typeof materializeSets> = [];
    try {
      const weightAtDate = findBodyWeight(history.data ?? [], data.date);
      savedPrimarySets = materializeSets(data.sets as Array<{ reps: number; weight: number }>, isBodyweight, weightAtDate);
      if (data.isSuperSet && data.secondaryExerciseId && data.secondarySets?.length) {
        savedSecondarySets = materializeSets(data.secondarySets as Array<{ reps: number; weight: number }>, secondaryIsBodyweight, weightAtDate);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not prepare session load.");
      return;
    }

    if (data.isSuperSet && data.secondaryExerciseId && savedSecondarySets?.length) {
      addSupersetMutation.mutate(
        {
          primaryExerciseId: exerciseId,
          secondaryExerciseId: data.secondaryExerciseId,
          date: data.date,
          primarySets: savedPrimarySets,
          secondarySets: savedSecondarySets,
          multiplier,
        },
        { onSuccess: resetForm }
      );
    } else {
      addSessionMutation.mutate(
        {
          date: data.date,
          sets: savedPrimarySets,
        },
        { onSuccess: resetForm }
      );
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!loading) {
      setOpen(nextOpen);
    }
  };

  const renderSetsForm = (
    fieldPrefix: "sets" | "secondarySets",
    label: string,
    removeFn: (index: number) => void,
    displayUnitLabel: string,
    scrollRef: React.RefObject<HTMLDivElement>,
    bodyweight: boolean = false,
  ) => {
    const sets = form.watch(fieldPrefix) || [];
    const totalReps = sets.reduce((sum, set) => sum + (Number(set.reps) || 0), 0);
    return (
      <div className="space-y-3">
        {bodyweight && <BodyweightSummary weight={bodyWeight} loading={history.isLoading} />}
        <div className="flex items-center justify-between">
          <div>
            <FormLabel>{label} ({sets.length})</FormLabel>
            <p className="text-xs text-muted-foreground">{totalReps.toLocaleString()} total reps</p>
          </div>

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
                        <Input type="number" inputMode="numeric" aria-label={`Set ${index + 1} repetitions`} min="1" {...field} />
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
                      {index === 0 && <FormLabel className="text-xs">{bodyweight ? "Added weight (kg)" : displayUnitLabel}</FormLabel>}
                      <FormControl>
                        <Input type="number" inputMode="decimal" aria-label={`Set ${index + 1} ${bodyweight ? "added weight" : "load"}`} min="0" step="0.5" {...field} />
                      </FormControl>
                      <FormMessage />
                      {bodyweight && bodyWeight !== null && <p className="text-xs text-muted-foreground">{bodyWeight} + {Number(field.value) || 0} = {Math.round((bodyWeight + Number(field.value || 0)) * 100) / 100} kg</p>}
                    </FormItem>
                  )}
                />
              </div>
              {sets.length > 1 && (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={`Remove set ${index + 1}`}
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
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {!hideTrigger && <DialogTrigger asChild>
        <Button
          size="lg"
          className="fixed bottom-6 left-6 h-[72px] w-[72px] rounded-full shadow-lg z-50 hover:scale-110 transition-transform"
          style={{ boxShadow: "var(--shadow-elevated)" }}
        >
          <Plus className="h-8 w-8" />
        </Button>
      </DialogTrigger>}
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Log New Session</DialogTitle>
          <DialogDescription>
            Record your workout session for {exerciseName}.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col h-full relative">
            <div className="flex-1 space-y-4 overflow-y-auto sets-scrollbar pr-1 pb-5">
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

              <div className="flex items-center justify-between p-3 rounded-lg bg-primary/10 border border-primary/20">
                <span className="text-sm font-medium">Session Score</span>
                <span className="text-lg font-bold text-primary">{totalScore.toLocaleString()} pts</span>
              </div>

              <div className="p-3 rounded-lg bg-muted/50 border border-border">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium text-foreground">{exerciseName}</p>
                  <span className="text-sm font-semibold text-primary">{primaryScore.toLocaleString()} pts</span>
                </div>
                {renderSetsForm("sets", "Sets", removeSet, unitLabel, primarySetsRef, isBodyweight)}
              </div>

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
                      {renderSetsForm("secondarySets", "Sets", removeSecondarySet, getUnitLabel((selectedSecondaryExercise.unit || "weight") as UnitType), secondarySetsRef, secondaryIsBodyweight)}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="sticky bottom-0 space-y-2 border-t border-border bg-background pt-4 pb-[env(safe-area-inset-bottom)]">
              <Button type="button" size="lg" disabled={loading} onClick={(event) => { event.currentTarget.blur(); addSet(); }}
                className="h-14 w-full rounded-xl bg-accent text-base font-semibold text-accent-foreground hover:bg-accent/90 focus-visible:ring-accent active:scale-[0.98]">
                <Plus className="h-5 w-5" /> {isSuperSet && selectedSecondaryExercise ? `Add Set · ${exerciseName}` : "Add Set"}
              </Button>
              {isSuperSet && selectedSecondaryExercise && <Button type="button" size="lg" disabled={loading} onClick={(event) => { event.currentTarget.blur(); addSecondarySet(); }}
                className="h-14 w-full rounded-xl bg-accent text-base font-semibold text-accent-foreground hover:bg-accent/90 focus-visible:ring-accent active:scale-[0.98]">
                <Plus className="h-5 w-5" /> Add Set · {selectedSecondaryExercise.name}
              </Button>}
              <Button
                type="submit"
                className="w-full"
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
