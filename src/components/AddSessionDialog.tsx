import { useState } from "react";
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
import { Plus } from "lucide-react";
import { supabaseStore } from "@/lib/supabaseStore";
import { toast } from "sonner";

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

interface AddSessionDialogProps {
  exerciseId: string;
  exerciseName: string;
  onSessionAdded: () => void;
}

export function AddSessionDialog({
  exerciseId,
  exerciseName,
  onSessionAdded,
}: AddSessionDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const form = useForm<SessionFormValues>({
    resolver: zodResolver(sessionSchema),
    defaultValues: {
      date: new Date().toISOString().split("T")[0],
      sets: [{ reps: 10, weight: 0 }],
    },
  });

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

  const onSubmit = async (data: SessionFormValues) => {
    try {
      setLoading(true);
      await supabaseStore.addSession(exerciseId, {
        date: data.date,
        sets: data.sets as Array<{ reps: number; weight: number }>,
      });
      const totalValue = data.sets.reduce((sum, set) => sum + (set.reps * set.weight), 0);
      toast.success(`${data.sets.length} sets logged (Total: ${totalValue})`);
      const lastSet = data.sets[data.sets.length - 1];
      form.reset({
        date: new Date().toISOString().split("T")[0],
        sets: [{ reps: lastSet.reps, weight: lastSet.weight }],
      });
      setOpen(false);
      onSessionAdded();
    } catch (error) {
      console.error("Error adding session:", error);
      toast.error("Failed to add session. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="lg"
          className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg z-50 hover:scale-110 transition-transform"
          style={{ boxShadow: "var(--shadow-elevated)" }}
        >
          <Plus className="h-6 w-6" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Log New Session</DialogTitle>
          <DialogDescription>
            Record your workout session for {exerciseName}.
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
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <FormLabel>Sets</FormLabel>
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
                          {index === 0 && <FormLabel>Weight (kg)</FormLabel>}
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
            
            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button type="submit" className="flex-1" disabled={loading}>
                {loading ? "Logging..." : "Log Session"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
