import { useProfile } from "@/hooks/useProfile";
import { findBodyWeight, materializeSets, todayLocal } from "@/lib/bodyweight";
import { BodyweightSummary } from "@/components/BodyweightSummary";
import { createSessionSetSchema } from "@/lib/sessionForm";
import { toast } from "sonner";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { useAddSession, useAddSupersetSession, useUpdateSession } from "@/hooks/useSessionMutations";

const createSessionSchema = (primaryTimed: boolean, secondaryTimed: boolean) => z.object({
  date: z.string().min(1, { message: "Date is required" }),
  sets: z.array(createSessionSetSchema(primaryTimed)).min(1, { message: "Must add at least 1 set" }),
  isSuperSet: z.boolean().default(false),
  secondaryExerciseId: z.string().optional(),
  secondarySets: z.array(createSessionSetSchema(secondaryTimed)).optional(),
});

type SessionFormValues = z.infer<ReturnType<typeof createSessionSchema>>;

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
  const updatePrimaryMutation = useUpdateSession(exerciseId);
  const savedSessionRef = useRef<{ primaryId: string; secondaryId?: string; supersetId?: string } | null>(null);
  const saveInFlightRef = useRef(false);
  const lastSavedValuesRef = useRef("");
  const [saving, setSaving] = useState(false);
  const [hasLoggedSession, setHasLoggedSession] = useState(false);
  const [exercises, setExercises] = useState<ExerciseWithSessions[]>([]);
  const [selectedSecondaryExercise, setSelectedSecondaryExercise] = useState<ExerciseWithSessions | null>(null);
  const updateSecondaryMutation = useUpdateSession(selectedSecondaryExercise?.id ?? "");
  const primarySetsRef = useRef<HTMLDivElement>(null);
  const secondarySetsRef = useRef<HTMLDivElement>(null);
  const isTimedBodyweight = isBodyweight && unit === "time";
  const secondaryIsBodyweight = !!selectedSecondaryExercise?.is_bodyweight;
  const secondaryIsTimed = secondaryIsBodyweight && selectedSecondaryExercise?.unit === "time";
  const sessionSchema = useMemo(() => createSessionSchema(isTimedBodyweight, secondaryIsTimed), [isTimedBodyweight, secondaryIsTimed]);

  const form = useForm<SessionFormValues>({
    resolver: zodResolver(sessionSchema),
    defaultValues: {
      date: todayLocal(),
      sets: [{ reps: isTimedBodyweight ? 30 : 10, weight: 0 }],
      isSuperSet: false,
      secondaryExerciseId: undefined,
      secondarySets: [{ reps: 10, weight: 0 }],
    },
  });

  const { history } = useProfile({ enabled: open && (isBodyweight || secondaryIsBodyweight), loadProfile: false });
  const sessionDate = form.watch("date");
  const bodyWeight = findBodyWeight(history.data ?? [], sessionDate);

  const isSuperSet = form.watch("isSuperSet");
  const primarySets = form.watch("sets") || [];
  const secondarySets = form.watch("secondarySets") || [];
  const multiplier = supersetMultiplier || 1.2;
  const loading = saving;
  const unitLabel = getUnitLabel((unit || "weight") as UnitType);

  const scoreSets = (sets: Array<{ reps?: number; weight?: number }>, bodyweight: boolean) =>
    sets.reduce((sum, set) => sum + Number(set.reps || 0) * (Number(set.weight || 0) + (bodyweight ? bodyWeight ?? 0 : 0)), 0);
  const primaryScore = Math.round(scoreSets(primarySets, isBodyweight));
  const secondaryScore = isSuperSet && selectedSecondaryExercise
    ? Math.round(scoreSets(secondarySets, secondaryIsBodyweight) * multiplier)
    : 0;
  const totalScore = primaryScore + secondaryScore;

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

  const removeSet = (index: number) => {
    const currentSets = form.getValues("sets");
    if (currentSets.length > 1) {
      form.setValue("sets", currentSets.filter((_, i) => i !== index), {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
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
    if (selectedSecondaryExercise?.unit !== exercise.unit || selectedSecondaryExercise?.is_bodyweight !== exercise.is_bodyweight) {
      form.setValue("secondarySets", [{ reps: exercise.is_bodyweight && exercise.unit === "time" ? 30 : 10, weight: 0 }]);
    }
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

  const persistSession = async (data: SessionFormValues): Promise<boolean> => {
    if (saveInFlightRef.current) return false;
    if (data.isSuperSet && !data.secondaryExerciseId) return false;
    saveInFlightRef.current = true;
    setSaving(true);
    try {
      const weightAtDate = findBodyWeight(history.data ?? [], data.date);
      const primary = materializeSets(data.sets as Array<{ reps: number; weight: number }>, isBodyweight, weightAtDate, unit);
      const secondary = data.isSuperSet && data.secondaryExerciseId && data.secondarySets?.length
        ? materializeSets(data.secondarySets as Array<{ reps: number; weight: number }>, secondaryIsBodyweight, weightAtDate, selectedSecondaryExercise?.unit)
        : [];
      const saved = savedSessionRef.current;
      if (saved) {
        await updatePrimaryMutation.mutateAsync({ sessionId: saved.primaryId, date: data.date, sets: primary,
          supersetId: saved.supersetId });
        if (saved.secondaryId) {
          await updateSecondaryMutation.mutateAsync({ sessionId: saved.secondaryId, date: data.date, sets: secondary,
            supersetId: saved.supersetId, isSupersetSecondary: true, valueMultiplier: multiplier });
        }
      } else if (data.isSuperSet && data.secondaryExerciseId && secondary.length) {
        const result = await addSupersetMutation.mutateAsync({ primaryExerciseId: exerciseId,
          secondaryExerciseId: data.secondaryExerciseId, date: data.date, primarySets: primary, secondarySets: secondary, multiplier });
        savedSessionRef.current = { primaryId: result.primary.id, secondaryId: result.secondary.id, supersetId: result.supersetId };
      } else {
        const result = await addSessionMutation.mutateAsync({ date: data.date, sets: primary });
        savedSessionRef.current = { primaryId: result.id };
      }
      lastSavedValuesRef.current = JSON.stringify(data);
      setHasLoggedSession(true);
      onSessionAdded();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save session. Please retry.");
      return false;
    } finally {
      saveInFlightRef.current = false;
      setSaving(false);
    }
  };

  const addSet = async (field: "sets" | "secondarySets" = "sets") => {
    if (saveInFlightRef.current) return;
    if (!await form.trigger(undefined, { shouldFocus: true })) return;
    const data = sessionSchema.parse(form.getValues());
    // The first click confirms the initial set; later clicks add another one.
    if (savedSessionRef.current) {
      const sets = data[field] || [];
      const lastSet = sets[sets.length - 1];
      data[field] = [...sets, { reps: lastSet?.reps ?? 10, weight: lastSet?.weight ?? 0 }];
    }
    if (!await persistSession(data)) return;
    form.reset(data);
    const scrollRef = field === "sets" ? primarySetsRef : secondarySetsRef;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  };

  const handleOpenChange = async (nextOpen: boolean) => {
    if (saveInFlightRef.current) return;
    if (!nextOpen && savedSessionRef.current && JSON.stringify(form.getValues()) !== lastSavedValuesRef.current) {
      if (!await form.trigger(undefined, { shouldFocus: true })) return;
      if (!await persistSession(sessionSchema.parse(form.getValues()))) return;
    }
    if (!nextOpen) {
      savedSessionRef.current = null;
      setHasLoggedSession(false);
      form.reset({ date: todayLocal(), sets: [{ reps: isTimedBodyweight ? 30 : 10, weight: 0 }],
        isSuperSet: false, secondaryExerciseId: undefined, secondarySets: [{ reps: 10, weight: 0 }] });
      setSelectedSecondaryExercise(null);
    }
    setOpen(nextOpen);
  };

  const renderSetsForm = (
    fieldPrefix: "sets" | "secondarySets",
    label: string,
    removeFn: (index: number) => void,
    displayUnitLabel: string,
    scrollRef: React.RefObject<HTMLDivElement>,
    bodyweight: boolean = false,
    timedBodyweight: boolean = false,
  ) => {
    const sets = form.watch(fieldPrefix) || [];
    const totalReps = sets.reduce((sum, set) => sum + (Number(set.reps) || 0), 0);
    return (
      <div className="space-y-3">
        {bodyweight && <BodyweightSummary weight={bodyWeight} loading={history.isLoading} timed={timedBodyweight} />}
        <div className="flex items-center justify-between">
          <div>
            <FormLabel>{label} ({sets.length})</FormLabel>
            <p className="text-xs text-muted-foreground">{totalReps.toLocaleString()} total {timedBodyweight ? "seconds" : "reps"}</p>
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
                      {index === 0 && <FormLabel className="text-xs">{timedBodyweight ? "Time (s)" : "Reps"}</FormLabel>}
                      <FormControl>
                        <Input type="number" inputMode="numeric" aria-label={`Set ${index + 1} ${timedBodyweight ? "duration in seconds" : "repetitions"}`} min="1" step="1" max={timedBodyweight ? 10000 : 100} disabled={loading} {...field} />
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
                        <Input type="number" inputMode="decimal" aria-label={`Set ${index + 1} ${bodyweight ? "added weight" : "load"}`} min="0" step="0.5" disabled={loading} {...field} />
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
                  disabled={loading}
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
            Record your workout session for {exerciseName}. Add Set saves automatically.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={(event) => { event.preventDefault(); void addSet(); }} className="flex flex-col h-full relative">
            <div className="flex-1 space-y-4 overflow-y-auto sets-scrollbar pr-1 pb-5">
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} disabled={loading} autoFocus={false} />
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
                {renderSetsForm("sets", "Sets", removeSet, unitLabel, primarySetsRef, isBodyweight, isTimedBodyweight)}
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
                          disabled={loading || hasLoggedSession}
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
                              disabled={loading || hasLoggedSession}
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
                            disabled={loading || hasLoggedSession}
                            onClick={handleClearSecondaryExercise}
                            className="h-6 w-6"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      {renderSetsForm("secondarySets", "Sets", removeSecondarySet, getUnitLabel((selectedSecondaryExercise.unit || "weight") as UnitType), secondarySetsRef, secondaryIsBodyweight, secondaryIsTimed)}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="sticky bottom-0 space-y-2 border-t border-border bg-background pt-4 pb-[env(safe-area-inset-bottom)]">
              <Button type="button" size="lg" disabled={loading || (isSuperSet && !selectedSecondaryExercise)} onClick={(event) => { event.currentTarget.blur(); void addSet(); }}
                className="h-14 w-full rounded-xl bg-accent text-base font-semibold text-accent-foreground hover:bg-accent/90 focus-visible:ring-accent active:scale-[0.98]">
                <Plus className="h-5 w-5" /> {isSuperSet && selectedSecondaryExercise ? `Add Set · ${exerciseName}` : "Add Set"}
              </Button>
              {isSuperSet && selectedSecondaryExercise && <Button type="button" size="lg" disabled={loading} onClick={(event) => { event.currentTarget.blur(); void addSet("secondarySets"); }}
                className="h-14 w-full rounded-xl bg-accent text-base font-semibold text-accent-foreground hover:bg-accent/90 focus-visible:ring-accent active:scale-[0.98]">
                <Plus className="h-5 w-5" /> Add Set · {selectedSecondaryExercise.name}
              </Button>}
              {loading && <p role="status" className="text-center text-xs text-muted-foreground">Saving...</p>}
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
