import { useEffect } from "react";
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

interface EditSessionDialogProps {
  session: Session;
  exerciseName: string;
  unit?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSessionUpdated: () => void;
}

export function EditSessionDialog({
  session,
  exerciseName,
  unit = "weight",
  open,
  onOpenChange,
  onSessionUpdated,
}: EditSessionDialogProps) {
  const updateSessionMutation = useUpdateSession(session.exercise_id);

  // Parse sets from session
  const getInitialSets = () => {
    if (session.sets && Array.isArray(session.sets) && session.sets.length > 0) {
      return (session.sets as Array<{ reps: number; weight: number }>).map((s) => ({
        reps: s.reps,
        weight: s.weight,
      }));
    }
    // Fallback to legacy format
    return Array.from({ length: session.series }, () => ({
      reps: session.reps,
      weight: Number(session.weight),
    }));
  };

  const form = useForm<SessionFormValues>({
    resolver: zodResolver(sessionSchema),
    defaultValues: {
      date: session.date,
      sets: getInitialSets(),
    },
  });

  // Reset form when session changes
  useEffect(() => {
    form.reset({
      date: session.date,
      sets: getInitialSets(),
    });
  }, [session.id]);

  const addSet = () => {
    const currentSets = form.getValues("sets");
    const lastSet = currentSets[currentSets.length - 1];
    form.setValue("sets", [...currentSets, { reps: lastSet?.reps ?? 10, weight: lastSet?.weight ?? 0 }]);
  };

  const removeSet = (index: number) => {
    const currentSets = form.getValues("sets");
    if (currentSets.length > 1) {
      form.setValue("sets", currentSets.filter((_, i) => i !== index));
    }
  };

  const loading = updateSessionMutation.isPending;

  const onSubmit = async (data: SessionFormValues) => {
    updateSessionMutation.mutate(
      {
        sessionId: session.id,
        date: data.date,
        sets: data.sets as Array<{ reps: number; weight: number }>,
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          onSessionUpdated();
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit Session</DialogTitle>
          <DialogDescription>
            Edit the session for {exerciseName}.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
            
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <FormLabel>Sets ({form.watch("sets").length})</FormLabel>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={addSet}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Set
                </Button>
              </div>
              
              <div className="max-h-[30vh] overflow-y-auto space-y-2">
                {form.watch("sets").map((_, index) => (
                  <div key={index} className="flex gap-2 items-start">
                    <div className="flex-1 grid grid-cols-2 gap-2">
                      <FormField
                        control={form.control}
                        name={`sets.${index}.reps`}
                        render={({ field }) => (
                          <FormItem>
                            {index === 0 && <FormLabel>Reps</FormLabel>}
                            <FormControl>
                              <Input type="number" min="1" {...field} />
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
                            {index === 0 && <FormLabel>{getUnitLabel((unit || "weight") as UnitType)}</FormLabel>}
                            <FormControl>
                              <Input type="number" min="0" step="0.5" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    {form.watch("sets").length > 1 && (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
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
            
            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button type="submit" className="flex-1" disabled={loading}>
                {loading ? "Saving..." : "Save"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
