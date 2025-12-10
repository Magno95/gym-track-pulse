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
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, X, Image as ImageIcon } from "lucide-react";

const detailsSchema = z.object({
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
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<DetailsFormValues>({
    resolver: zodResolver(detailsSchema),
    defaultValues: {
      description: currentDescription || "",
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        description: currentDescription || "",
      });
      setImagePreview(currentImageUrl || null);
      setSelectedFile(null);
    }
  }, [open, currentImageUrl, currentDescription, form]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        toast.error("Please select an image file");
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.error("Image must be less than 5MB");
        return;
      }
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveImage = () => {
    setImagePreview(null);
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const uploadImage = async (file: File): Promise<string> => {
    const fileExt = file.name.split(".").pop();
    const fileName = `${exerciseId}-${Date.now()}.${fileExt}`;
    const filePath = `${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("exercise-images")
      .upload(filePath, file, { upsert: true });

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from("exercise-images")
      .getPublicUrl(filePath);

    return publicUrl;
  };

  const onSubmit = async (data: DetailsFormValues) => {
    try {
      setLoading(true);
      
      let imageUrl = imagePreview;
      
      // If a new file was selected, upload it
      if (selectedFile) {
        imageUrl = await uploadImage(selectedFile);
      } else if (!imagePreview && currentImageUrl) {
        // Image was removed
        imageUrl = null;
      }

      const { error } = await supabase
        .from("exercises")
        .update({
          image_url: imageUrl,
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
            Add an image and description for this exercise.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Image</label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
              />
              
              {imagePreview ? (
                <div className="relative">
                  <img
                    src={imagePreview}
                    alt="Preview"
                    className="w-full h-40 object-cover rounded-lg"
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="absolute top-2 right-2 h-8 w-8"
                    onClick={handleRemoveImage}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-40 border-dashed flex flex-col gap-2"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <span className="text-muted-foreground">Upload Image</span>
                </Button>
              )}
              
              {imagePreview && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <ImageIcon className="h-4 w-4 mr-2" />
                  Change Image
                </Button>
              )}
            </div>

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
