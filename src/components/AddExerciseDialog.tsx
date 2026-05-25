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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { ExerciseWithSessions } from "@/lib/supabaseStore";
import { getCachedExercises, setCachedExercises, addToSyncQueue } from "@/lib/localCache";
import { EXERCISES_QUERY_KEY } from "@/hooks/useExercises";

const exerciseSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { message: "Exercise name is required" })
    .max(50, { message: "Name must be less than 50 characters" }),
  category: z.enum(["arms", "chest", "back", "legs", "core", "cardio"], {
    required_error: "Please select a category",
  }),
});

type ExerciseFormValues = z.infer<typeof exerciseSchema>;

interface AddExerciseDialogProps {
  onExerciseAdded: () => void;
}

export function AddExerciseDialog({ onExerciseAdded }: AddExerciseDialogProps) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const form = useForm<ExerciseFormValues>({
    resolver: zodResolver(exerciseSchema),
    defaultValues: {
      name: "",
      category: "arms",
    },
  });

  const onSubmit = (data: ExerciseFormValues) => {
    const tempId = `temp-ex-${Date.now()}`;
    const newExercise: ExerciseWithSessions = {
      id: tempId,
      name: data.name,
      category: data.category,
      user_id: 'local',
      created_at: new Date().toISOString(),
      description: null,
      image_url: null,
      personal_records: null,
      superset_multiplier: 1.2,
      unit: 'weight',
      sessions: [],
    };

    // Update react-query cache
    queryClient.setQueryData<ExerciseWithSessions[]>(EXERCISES_QUERY_KEY, (old) =>
      [newExercise, ...(old || [])]
    );
    // Update localStorage cache
    const cache = getCachedExercises();
    setCachedExercises([newExercise, ...(cache || [])]);
    // Queue for background DB sync
    addToSyncQueue({ type: 'add_exercise', payload: { name: data.name, category: data.category, tempId } });

    toast.success(`${data.name} has been added to ${data.category}.`);
    form.reset();
    setOpen(false);
    onExerciseAdded();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="lg"
          className="fixed bottom-6 left-6 h-[72px] w-[72px] rounded-full shadow-lg z-50 hover:scale-110 transition-transform"
          style={{ boxShadow: "var(--shadow-elevated)" }}
        >
          <Plus className="h-8 w-8" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add New Exercise</DialogTitle>
          <DialogDescription>
            Create a new exercise to track in your workout routine.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Exercise Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Shoulder Press" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a category" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="arms">Arms</SelectItem>
                      <SelectItem value="chest">Chest</SelectItem>
                      <SelectItem value="back">Back</SelectItem>
                      <SelectItem value="legs">Legs</SelectItem>
                      <SelectItem value="core">Core</SelectItem>
                      <SelectItem value="cardio">Cardio</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
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
                Add Exercise
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
