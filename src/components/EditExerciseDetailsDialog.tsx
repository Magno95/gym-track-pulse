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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, X, Image as ImageIcon, Trophy, Plus, Trash2, Edit2, Check } from "lucide-react";
import { format } from "date-fns";

interface PersonalRecord {
  text: string;
  date: string;
}

const detailsSchema = z.object({
  name: z.string().min(1, { message: "Name is required" }).max(100, { message: "Name must be less than 100 characters" }),
  description: z.string().max(1000, { message: "Description must be less than 1000 characters" }),
  unit: z.enum(["weight", "distance", "time"]),
  superset_multiplier: z.coerce.number().min(1, "Multiplier must be at least 1").max(5, "Multiplier must be at most 5"),
});

type DetailsFormValues = z.infer<typeof detailsSchema>;

interface EditExerciseDetailsDialogProps {
  exerciseId: string;
  currentName: string;
  currentImageUrl?: string | null;
  currentDescription?: string | null;
  currentUnit?: string | null;
  currentSupersetMultiplier?: number | null;
  currentPersonalRecords?: PersonalRecord[] | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDetailsUpdated: () => void;
}

export function EditExerciseDetailsDialog({
  exerciseId,
  currentName,
  currentImageUrl,
  currentDescription,
  currentUnit,
  currentSupersetMultiplier,
  currentPersonalRecords,
  open,
  onOpenChange,
  onDetailsUpdated,
}: EditExerciseDetailsDialogProps) {
  const [loading, setLoading] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // PR state
  const [personalRecords, setPersonalRecords] = useState<PersonalRecord[]>([]);
  const [newPrText, setNewPrText] = useState("");
  const [editingPrIndex, setEditingPrIndex] = useState<number | null>(null);
  const [editingPrText, setEditingPrText] = useState("");

  const form = useForm<DetailsFormValues>({
    resolver: zodResolver(detailsSchema),
    defaultValues: {
      name: currentName || "",
      description: currentDescription || "",
      unit: (currentUnit as "weight" | "distance" | "time") || "weight",
      superset_multiplier: currentSupersetMultiplier || 1.2,
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        name: currentName || "",
        description: currentDescription || "",
        unit: (currentUnit as "weight" | "distance" | "time") || "weight",
        superset_multiplier: currentSupersetMultiplier || 1.2,
      });
      setImagePreview(currentImageUrl || null);
      setSelectedFile(null);
      setPersonalRecords(currentPersonalRecords || []);
      setNewPrText("");
      setEditingPrIndex(null);
      setEditingPrText("");
    }
  }, [open, currentName, currentImageUrl, currentDescription, currentUnit, currentSupersetMultiplier, currentPersonalRecords, form]);

  const handleAddPr = () => {
    if (!newPrText.trim()) return;
    if (personalRecords.length >= 3) {
      toast.error("Maximum 3 PRs allowed. Delete one to add a new one.");
      return;
    }
    const newPr: PersonalRecord = {
      text: newPrText.trim(),
      date: new Date().toISOString().split("T")[0],
    };
    setPersonalRecords([newPr, ...personalRecords]);
    setNewPrText("");
  };

  const handleDeletePr = (index: number) => {
    setPersonalRecords(personalRecords.filter((_, i) => i !== index));
  };

  const handleStartEditPr = (index: number) => {
    setEditingPrIndex(index);
    setEditingPrText(personalRecords[index].text);
  };

  const handleSaveEditPr = () => {
    if (editingPrIndex === null || !editingPrText.trim()) return;
    const updated = [...personalRecords];
    updated[editingPrIndex] = {
      ...updated[editingPrIndex],
      text: editingPrText.trim(),
    };
    setPersonalRecords(updated);
    setEditingPrIndex(null);
    setEditingPrText("");
  };

  const handleCancelEditPr = () => {
    setEditingPrIndex(null);
    setEditingPrText("");
  };

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
          name: data.name,
          image_url: imageUrl,
          description: data.description || null,
          unit: data.unit,
          superset_multiplier: data.superset_multiplier,
          personal_records: personalRecords as unknown as null,
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
      <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Exercise Details</DialogTitle>
          <DialogDescription>
            Update the exercise name, image and description.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Exercise name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
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
                      className="min-h-[100px] resize-none"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Personal Records Section */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-accent" />
                <label className="text-sm font-medium">🏆 Personal Records</label>
              </div>
              
              {/* Add new PR */}
              <div className="flex gap-2">
                <Input
                  placeholder="New PR (e.g., 100kg x 5)"
                  value={newPrText}
                  onChange={(e) => setNewPrText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddPr();
                    }
                  }}
                  disabled={personalRecords.length >= 3}
                />
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  onClick={handleAddPr}
                  disabled={!newPrText.trim() || personalRecords.length >= 3}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              
              {/* PR List */}
              {personalRecords.length > 0 ? (
                <div className="space-y-2">
                  {personalRecords.map((pr, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 border border-border"
                    >
                      {editingPrIndex === index ? (
                        <>
                          <Input
                            value={editingPrText}
                            onChange={(e) => setEditingPrText(e.target.value)}
                            className="flex-1 h-8"
                            autoFocus
                          />
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-accent"
                            onClick={handleSaveEditPr}
                          >
                            <Check className="h-3 w-3" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={handleCancelEditPr}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{pr.text}</p>
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(pr.date), "dd/MM/yyyy")}
                            </p>
                          </div>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => handleStartEditPr(index)}
                          >
                            <Edit2 className="h-3 w-3" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive"
                            onClick={() => handleDeletePr(index)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-2">
                  No personal records yet. Add your first PR!
                </p>
              )}
            </div>
            <FormField
              control={form.control}
              name="unit"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Unit of Measurement</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select unit" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="weight">Weight (kg)</SelectItem>
                      <SelectItem value="distance">Distance (m)</SelectItem>
                      <SelectItem value="time">Time (s)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="superset_multiplier"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Super Set Multiplier</FormLabel>
                  <FormControl>
                    <Input 
                      type="number" 
                      step="0.1" 
                      min="1" 
                      max="5"
                      placeholder="1.2"
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
