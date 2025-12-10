import { useState, useEffect } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const detailsSchema = z.object({
  image_url: z.string().url({ message: "Please enter a valid URL" }).or(z.literal("")),
  description: z.string().max(1000, { message: "Description must be less than 1000 characters" }),
});

type DetailsFormValues = z.infer<typeof detailsSchema>;

interface EditExerciseDetailsDialogProps {
  exerciseId: string;
  currentImageUrl?: string | null;
  currentDescription?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDetailsUpdated: () => void;
}

export function EditExerciseDetailsDialog({
  exerciseId,
  currentImageUrl,
  currentDescription,
  open,
  onOpenChange,
  onDetailsUpdated,
}: EditExerciseDetailsDialogProps) {
  const [loading, setLoading] = useState(false);

  const form = useForm<DetailsFormValues>({
    resolver: zodResolver(detailsSchema),
    defaultValues: {
      image_url: currentImageUrl || "",
      description: currentDescription || "",
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        image_url: currentImageUrl || "",
        description: currentDescription || "",
      });
    }
  }, [open, currentImageUrl, currentDescription, form]);

  const onSubmit = async (data: DetailsFormValues) => {
    try {
      setLoading(true);
      const { error } = await supabase
        .from("exercises")
        .update({
          image_url: data.image_url || null,
          description: data.description || null,
        })
        .eq("id", exerciseId);

      if (error) throw error;

      toast.success("Exercise details updated successfully");
      onOpenChange(false);
      onDetailsUpdated();
    } catch (error) {
      console.error("Error updating exercise details:", error);
      toast.error("Failed to update exercise details");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit Exercise Details</DialogTitle>
          <DialogDescription>
            Add an image URL and description for this exercise.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="image_url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Image URL</FormLabel>
                  <FormControl>
                    <Input placeholder="https://example.com/image.jpg" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Describe the exercise, proper form, muscles worked..."
                      className="min-h-[120px] resize-none"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
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
                {loading ? "Saving..." : "Save Details"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
