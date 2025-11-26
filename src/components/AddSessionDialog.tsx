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
import { exerciseStore } from "@/lib/exerciseStore";
import { toast } from "@/hooks/use-toast";

const sessionSchema = z.object({
  date: z.string().min(1, { message: "Date is required" }),
  series: z.coerce
    .number()
    .min(1, { message: "Must be at least 1 series" })
    .max(20, { message: "Maximum 20 series" }),
  reps: z.coerce
    .number()
    .min(1, { message: "Must be at least 1 rep" })
    .max(100, { message: "Maximum 100 reps" }),
  weight: z.coerce
    .number()
    .min(0, { message: "Weight cannot be negative" })
    .max(1000, { message: "Maximum 1000 kg" }),
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

  const form = useForm<SessionFormValues>({
    resolver: zodResolver(sessionSchema),
    defaultValues: {
      date: new Date().toISOString().split("T")[0],
      series: 3,
      reps: 10,
      weight: 0,
    },
  });

  const onSubmit = (data: SessionFormValues) => {
    try {
      exerciseStore.addSession(exerciseId, {
        date: data.date,
        series: data.series,
        reps: data.reps,
        weight: data.weight,
      });
      const totalValue = data.series * data.reps * data.weight;
      toast({
        title: "Session logged!",
        description: `${data.series}×${data.reps} @ ${data.weight}kg (Total: ${totalValue})`,
      });
      form.reset({
        date: new Date().toISOString().split("T")[0],
        series: data.series,
        reps: data.reps,
        weight: data.weight,
      });
      setOpen(false);
      onSessionAdded();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to add session. Please try again.",
        variant: "destructive",
      });
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
            <div className="grid grid-cols-3 gap-3">
              <FormField
                control={form.control}
                name="series"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Series</FormLabel>
                    <FormControl>
                      <Input type="number" min="1" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="reps"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reps</FormLabel>
                    <FormControl>
                      <Input type="number" min="1" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="weight"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Weight (kg)</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" step="0.5" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
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
              <Button type="submit" className="flex-1">
                Log Session
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
