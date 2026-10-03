import { useProfile } from "@/hooks/useProfile";
import { bodyWeightForEdit, getEditableSets, isBodyweightSession, isTimedBodyweightSession, materializeSets } from "@/lib/bodyweight";
import { BodyweightSummary } from "@/components/BodyweightSummary";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createSessionSetSchema } from "@/lib/sessionForm";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
import { Plus } from "lucide-react";
import { useUpdateSession } from "@/hooks/useSessionMutations";
import { Database } from "@/integrations/supabase/types";

type Session = Database["public"]["Tables"]["sessions"]["Row"];

const createSessionSchema = (timed: boolean) => z.object({
  date: z.string().min(1, { message: "Date is required" }),
  sets: z.array(createSessionSetSchema(timed)).min(1, { message: "Must add at least 1 set" }),
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

const getPayloadHash = (payload: SessionFormValues) => JSON.stringify(payload);

interface EditSessionDialogProps {
  session: Session;
  exerciseName: string;
  unit?: string | null;
  supersetMultiplier?: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditSessionDialog({
  session,
  exerciseName,
  unit = "weight",
  supersetMultiplier = 1.2,
  open,
  onOpenChange,
}: EditSessionDialogProps) {
  const { mutateAsync: updateSession, isPending } = useUpdateSession(session.exercise_id);
  const isBodyweight = isBodyweightSession(session);
  const isTimedBodyweight = isTimedBodyweightSession(session);
  const sessionSchema = useMemo(() => createSessionSchema(isTimedBodyweight), [isTimedBodyweight]);
  const { history } = useProfile({ enabled: open && isBodyweight, loadProfile: false });
  const [closeLoading, setCloseLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"saved" | "pending" | "saving" | "invalid" | "error">("saved");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestPayloadRef = useRef<SessionFormValues | null>(null);
  const lastSavedHashRef = useRef("");
  const saveInFlightRef = useRef(false);
  const currentSavePromiseRef = useRef<Promise<boolean> | null>(null);
  const pendingSaveRef = useRef(false);
  const setsRef = useRef<HTMLDivElement>(null);

  const getInitialSets = useCallback(() => getEditableSets(session), [session]);

  const form = useForm<SessionFormValues>({
    resolver: zodResolver(sessionSchema),
    defaultValues: {
      date: session.date,
      sets: getInitialSets(),
    },
  });

  const valueMultiplier = session.is_superset_secondary ? (session.value_multiplier ?? supersetMultiplier ?? 1.2) : 1;
  const watchedDate = form.watch("date");
  const bodyWeight = bodyWeightForEdit(session, watchedDate, history.data ?? []);
  const watchedSets = form.watch("sets") || [];
  const totalReps = watchedSets.reduce((sum, set) => sum + (Number(set.reps) || 0), 0);
  const score = Math.round(watchedSets.reduce((sum, set) => sum + Number(set.reps || 0) * (Number(set.weight || 0) + (isBodyweight ? bodyWeight ?? 0 : 0)), 0) * valueMultiplier);
  const loading = closeLoading || isPending;

  useEffect(() => {
    const nextPayload = {
      date: session.date,
      sets: getInitialSets(),
    };
    form.reset(nextPayload);
    latestPayloadRef.current = nextPayload;
    lastSavedHashRef.current = getPayloadHash(nextPayload);
    pendingSaveRef.current = false;
    setSaveStatus("saved");
  }, [form, getInitialSets, session.date, session.id]);

  const persistLatest = useCallback(async (): Promise<boolean> => {
    if (saveInFlightRef.current) {
      pendingSaveRef.current = true;
      return currentSavePromiseRef.current ?? Promise.resolve(true);
    }

    const payload = latestPayloadRef.current;
    if (!payload) return true;

    const payloadHash = getPayloadHash(payload);
    if (payloadHash === lastSavedHashRef.current) {
      setSaveStatus("saved");
      return true;
    }

    saveInFlightRef.current = true;
    setSaveStatus("saving");

    const savePromise = (async () => {
      try {
        await updateSession({
          sessionId: session.id,
          supersetId: session.superset_id,
          isSupersetSecondary: session.is_superset_secondary ?? false,
          date: payload.date,
          sets: materializeSets(payload.sets as Array<{ reps: number; weight: number }>, isBodyweight,
            bodyWeightForEdit(session, payload.date, history.data ?? []), isTimedBodyweight ? "time" : "weight"),
          valueMultiplier,
          suppressToast: true,
        });
        lastSavedHashRef.current = payloadHash;
        setSaveStatus("saved");
        return true;
      } catch (error) {
        console.error("Error autosaving session:", error);
        setSaveStatus("error");
        return false;
      } finally {
        saveInFlightRef.current = false;
        currentSavePromiseRef.current = null;
        if (pendingSaveRef.current) {
          pendingSaveRef.current = false;
          void persistLatest();
        }
      }
    })();

    currentSavePromiseRef.current = savePromise;
    return savePromise;
  }, [session, updateSession, valueMultiplier, isBodyweight, isTimedBodyweight, history.data]);

  const queueAutosave = useCallback((payload: SessionFormValues) => {
    const payloadHash = getPayloadHash(payload);
    latestPayloadRef.current = payload;

    if (payloadHash === lastSavedHashRef.current) {
      setSaveStatus("saved");
      return;
    }

    setSaveStatus("pending");
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      void persistLatest();
    }, 700);
  }, [persistLatest]);

  useEffect(() => {
    if (!open) return;

    const subscription = form.watch(() => {
      const parsed = sessionSchema.safeParse(form.getValues());
      if (!parsed.success) {
        setSaveStatus("invalid");
        return;
      }
      queueAutosave(parsed.data);
    });

    return () => {
      subscription.unsubscribe();
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [form, open, queueAutosave, sessionSchema]);

  const flushAutosave = useCallback(async () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    const parsed = sessionSchema.safeParse(form.getValues());
    if (!parsed.success) {
      setSaveStatus("invalid");
      return false;
    }

    latestPayloadRef.current = parsed.data;

    if (currentSavePromiseRef.current) {
      const inFlightSaved = await currentSavePromiseRef.current;
      if (!inFlightSaved) return false;
    }

    const saved = await persistLatest();
    if (!saved) return false;

    if (currentSavePromiseRef.current) {
      return currentSavePromiseRef.current;
    }

    return true;
  }, [form, persistLatest, sessionSchema]);

  const closeDialog = useCallback(async () => {
    try {
      setCloseLoading(true);
      const saved = await flushAutosave();
      if (!saved) {
        setCloseLoading(false);
        return;
      }

      setCloseLoading(false);
      onOpenChange(false);
    } catch (error) {
      console.error("Error closing session dialog:", error);
      setCloseLoading(false);
    }
  }, [flushAutosave, onOpenChange]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      onOpenChange(true);
      return;
    }
    void closeDialog();
  };

  const addSet = () => {
    const currentSets = form.getValues("sets");
    const lastSet = currentSets[currentSets.length - 1];
    form.setValue("sets", [...currentSets, { reps: lastSet?.reps ?? 10, weight: lastSet?.weight ?? 0 }], {
      shouldDirty: true,
      shouldValidate: true,
    });
    setTimeout(() => {
      setsRef.current?.scrollTo({ top: setsRef.current.scrollHeight, behavior: "smooth" });
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

  const statusLabel = {
    saved: "Saved on this device",
    pending: "Saving soon...",
    saving: "Saving...",
    invalid: "Fix invalid fields to save",
    error: "Save failed. Check the date, profile weight and connection.",
  }[saveStatus];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px] max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Session</DialogTitle>
          <DialogDescription>
            Edit the session for {exerciseName}.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-4" onSubmit={(event) => event.preventDefault()}>
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
              <span className="text-lg font-bold text-primary">{score.toLocaleString()} pts</span>
            </div>

            <div className="space-y-3">
              {isBodyweight && <BodyweightSummary weight={bodyWeight} loading={history.isLoading} timed={isTimedBodyweight} />}
              <div className="flex items-center justify-between">
                <div>
                  <FormLabel>Sets ({watchedSets.length})</FormLabel>
                  <p className="text-xs text-muted-foreground">{totalReps.toLocaleString()} total {isTimedBodyweight ? "seconds" : "reps"}</p>
                </div>

              </div>

              <div ref={setsRef} className="max-h-[30vh] overflow-y-auto space-y-2 sets-scrollbar pr-1">
                {watchedSets.map((_, index) => (
                  <div key={index} className="flex gap-2 items-start">
                    <div className={`flex items-center justify-center w-6 h-9 text-xs font-medium text-muted-foreground ${index === 0 ? "mt-8" : ""}`}>
                      {index + 1}
                    </div>
                    <div className="flex-1 grid grid-cols-2 gap-2">
                      <FormField
                        control={form.control}
                        name={`sets.${index}.reps`}
                        render={({ field }) => (
                          <FormItem>
                            {index === 0 && <FormLabel>{isTimedBodyweight ? "Time (s)" : "Reps"}</FormLabel>}
                            <FormControl>
                              <Input type="number" inputMode="numeric" aria-label={`Set ${index + 1} ${isTimedBodyweight ? "duration in seconds" : "repetitions"}`} min="1" step="1" max={isTimedBodyweight ? 10000 : 100} {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`sets.${index}.weight`}
                        render={({ field }) => (
                          <FormItem>
                            {index === 0 && <FormLabel>{isBodyweight ? "Added weight (kg)" : getUnitLabel((unit || "weight") as UnitType)}</FormLabel>}
                            <FormControl>
                              <Input type="number" inputMode="decimal" aria-label={`Set ${index + 1} ${isBodyweight ? "added weight" : "load"}`} min="0" step="0.5" {...field} />
                            </FormControl>
                            <FormMessage />
                            {isBodyweight && bodyWeight !== null && <p className="text-xs text-muted-foreground">{bodyWeight} + {Number(field.value) || 0} = {Math.round((bodyWeight + Number(field.value || 0)) * 100) / 100} kg</p>}
                          </FormItem>
                        )}
                      />
                    </div>
                    {watchedSets.length > 1 && (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label={`Remove set ${index + 1}`}
                        onClick={() => removeSet(index)}
                        className={index === 0 ? "mt-8" : ""}
                      >
                        <Plus className="h-4 w-4 rotate-45" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2 pt-4">
              <p role="status" className="text-center text-xs text-muted-foreground">{statusLabel}</p>
              <Button type="button" size="lg" disabled={loading}
                onClick={(event) => { event.currentTarget.blur(); addSet(); }}
                className="h-14 w-full rounded-xl bg-accent text-base font-semibold text-accent-foreground hover:bg-accent/90 focus-visible:ring-accent active:scale-[0.98]">
                <Plus className="h-5 w-5" /> Add Set
              </Button>
              <Button
                type="button"
                className="w-full"
                disabled={loading || saveStatus === "invalid"}
                onClick={closeDialog}
              >
                {loading || saveStatus === "saving" ? "Saving..." : "Close"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
