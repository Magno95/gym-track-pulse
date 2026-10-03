import { requireUserId } from "@/lib/authSession";
import { processQueue, addToSyncQueue } from "@/lib/localCache";
import { resizeExerciseImage } from "@/lib/exerciseImages";
import { exerciseImageUrl, generatedThumbnailUrl } from "@/lib/generatedExerciseImages";
import { Json } from "@/integrations/supabase/types";
import { Switch } from "@/components/ui/switch";
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
import { getCachedExercises, setCachedExercises } from "@/lib/localCache";
import { Upload, X, Image as ImageIcon, Trophy, Plus, Trash2, Edit2, Check } from "lucide-react";
import { format } from "date-fns";
import { todayLocal } from "@/lib/bodyweight";
import { isCalendarDate } from "@/lib/validation";
import { useAuth } from "@/hooks/useAuth";

interface PersonalRecord {
  text: string;
  date: string;
}

const detailsSchema = z.object({
  name: z.string().trim().min(1, { message: "Name is required" }).max(100, { message: "Name must be less than 100 characters" }),
  description: z.string().max(1000, { message: "Description must be less than 1000 characters" }),
  unit: z.enum(["weight", "distance", "time"]),
  is_bodyweight: z.boolean().default(false),
  superset_multiplier: z.coerce.number().min(1, "Multiplier must be at least 1").max(5, "Multiplier must be at most 5"),
});

type DetailsFormValues = z.infer<typeof detailsSchema>;

interface EditExerciseDetailsDialogProps {
  exerciseId: string;
  currentName: string;
  currentImageUrl?: string | null;
  currentDescription?: string | null;
  currentUnit?: string | null;
  currentIsBodyweight?: boolean;
  currentSupersetMultiplier?: number | null;
  currentPersonalRecords?: PersonalRecord[] | null;
  open: boolean;
  inline?: boolean;
  onOpenChange: (open: boolean) => void;
  onDetailsUpdated: () => void;
}

export function EditExerciseDetailsDialog({
  exerciseId,
  currentName,
  currentImageUrl,
  currentDescription,
  currentUnit,
  currentIsBodyweight = false,
  currentSupersetMultiplier,
  currentPersonalRecords,
  open,
  inline = false,
  onOpenChange,
  onDetailsUpdated,
}: EditExerciseDetailsDialogProps) {
  const { userId: renderedUserId } = useAuth();
  const [loading, setLoading] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(currentImageUrl || null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const displayedImage = exerciseImageUrl(currentName, imagePreview);
  const isDefaultImage = !!displayedImage && generatedThumbnailUrl(displayedImage) !== null;
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
      is_bodyweight: currentIsBodyweight,
      superset_multiplier: currentSupersetMultiplier || 1.2,
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        name: currentName || "",
        description: currentDescription || "",
        unit: (currentUnit as "weight" | "distance" | "time") || "weight",
        is_bodyweight: currentIsBodyweight,
        superset_multiplier: currentSupersetMultiplier || 1.2,
      });
      setImagePreview(currentImageUrl || null);
      setSelectedFile(null);
      setPersonalRecords(Array.isArray(currentPersonalRecords) ? currentPersonalRecords.filter((record) =>
        record && typeof record === "object" && typeof record.text === "string"
          && typeof record.date === "string" && isCalendarDate(record.date)) : []);
      setNewPrText("");
      setEditingPrIndex(null);
      setEditingPrText("");
    }
  }, [open, currentName, currentImageUrl, currentDescription, currentUnit, currentIsBodyweight, currentSupersetMultiplier, currentPersonalRecords, form]);

  const handleAddPr = () => {
    if (!newPrText.trim()) return;
    if (personalRecords.length >= 3) {
      toast.error("Maximum 3 PRs allowed. Delete one to add a new one.");
      return;
    }
    const newPr: PersonalRecord = {
      text: newPrText.trim(),
      date: todayLocal(),
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

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      let resized: File;
      try { resized = await resizeExerciseImage(file, 1280); }
      catch (error) { toast.error(error instanceof Error ? error.message : "Could not open image."); return; }
      setSelectedFile(resized);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(resized);
    }
  };

  const handleRemoveImage = () => {
    setImagePreview(null);
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const uploadImage = async (file: File, userId: string): Promise<string> => {
    const path = `${userId}/${exerciseId}/${crypto.randomUUID()}.webp`;
    const url = supabase.storage.from("exercise-images").getPublicUrl(path).data.publicUrl;
    const thumbnail = await resizeExerciseImage(file, 192);
    requireUserId(userId);
    // Durable cleanup waits ten minutes so uploads/metadata writes can finish.
    // It then checks the server reference, including when the save response was lost.
    await addToSyncQueue({ type: "delete_image", payload: { imageUrl: url } }, userId);
    const { error } = await supabase.storage.from("exercise-images").upload(path, file, { upsert: false, contentType: "image/webp" });
    if (error) throw error;
    requireUserId(userId);
    const thumb = await supabase.storage.from("exercise-images").upload(path.replace(/\.webp$/, "-thumb.webp"), thumbnail, { upsert: false, contentType: "image/webp" });
    if (thumb.error) throw thumb.error;
    return url;
  };

  const onSubmit = async (data: DetailsFormValues) => {
    try {
      const userId = requireUserId(renderedUserId);
      setLoading(true);
      if (personalRecords.length > 3 || personalRecords.some((record) => !record.text.trim() || record.text.length > 500)) {
        throw new Error("Enter up to three personal records, each up to 500 characters.");
      }
      await processQueue({ force: true });
      requireUserId(userId);
      // Verify creation was acknowledged before editing an exercise that was added offline.
      const existing = await supabase.from("exercises").select("id,image_url").eq("id", exerciseId).eq("user_id", userId).single();
      if (existing.error) throw existing.error;
      if (existing.data.image_url !== (currentImageUrl ?? null)) throw new Error("The image changed in another window. Reload the settings before saving.");
      const imageUrl = selectedFile ? await uploadImage(selectedFile, userId) : imagePreview;
      requireUserId(userId);
      const fields = {
        name: data.name, image_url: imageUrl, description: data.description || null, unit: data.unit,
        is_bodyweight: (data.unit === "weight" || data.unit === "time") && data.is_bodyweight,
        superset_multiplier: data.superset_multiplier, personal_records: personalRecords as unknown as Json,
      };
      // Persist cleanup before the metadata commit. A failed or lost response is safe:
      // delayed cleanup checks whether this image is still referenced on the server.
      if (currentImageUrl && currentImageUrl !== imageUrl) {
        await addToSyncQueue({ type: "delete_image", payload: { imageUrl: currentImageUrl } }, userId);
      }
      requireUserId(userId);
      let update = supabase.from("exercises").update(fields).eq("id", exerciseId).eq("user_id", userId);
      update = currentImageUrl ? update.eq("image_url", currentImageUrl) : update.is("image_url", null);
      const result = await update.select("id,image_url").single();
      if (result.error) throw result.error;
      requireUserId(userId);
      const cache = getCachedExercises();
      if (cache) setCachedExercises(cache.map((exercise) => exercise.id === exerciseId ? { ...exercise, ...fields } : exercise));
      toast.success("Exercise details saved"); onOpenChange(false); onDetailsUpdated();
    } catch (error) {
      // Never delete a new upload here: a lost response may have followed a committed update.
      // The durable cleanup operation checks the server reference before removing it.
      toast.error(error instanceof Error ? error.message : "Could not update exercise details. Please retry.");
    } finally { setLoading(false); }
  };

  const content = (
    <>
        {inline ? <div className="mb-5"><h2 className="text-xl font-semibold">Exercise settings</h2><p className="mt-1 text-sm text-muted-foreground">Manage details, bodyweight mode and workout preferences.</p></div> : <DialogHeader>
          <DialogTitle>Edit Exercise Details</DialogTitle>
          <DialogDescription>
            Update the exercise name, image and description.
          </DialogDescription>
        </DialogHeader>}
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
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileSelect}
                className="hidden"
              />
              
              {displayedImage ? (
                <div className="relative">
                  <img
                    src={displayedImage}
                    alt="Preview"
                    className={`w-full h-40 ${isDefaultImage ? "object-contain bg-white" : "object-cover"} rounded-lg`}
                  />
                  {imagePreview && !isDefaultImage && <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="absolute top-2 right-2 h-8 w-8"
                    onClick={handleRemoveImage}
                  >
                    <X className="h-4 w-4" />
                  </Button>}
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
              
              {displayedImage && (
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
                              {format(new Date(`${pr.date}T12:00:00`), "dd/MM/yyyy")}
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
                  <Select onValueChange={(value) => { field.onChange(value); if (value === "distance") form.setValue("is_bodyweight", false); }} value={field.value}>
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

            {form.watch("unit") !== "distance" && <FormField
              control={form.control}
              name="is_bodyweight"
              render={({ field }) => (
                <FormItem className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <FormLabel>Bodyweight exercise</FormLabel>
                    <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">{form.watch("unit") === "time"
                    ? "New sets record duration in seconds and use your profile weight on the workout date, plus any added load. Score = seconds × total weight. Existing sessions keep their original values and mode."
                    : "New sessions use your profile weight on the workout date, plus added weight for each set. Existing sessions keep their original loads and mode."}</p>
                  <FormMessage />
                </FormItem>
              )}
            />}

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
              {!inline && <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="flex-1"
              >
                Cancel
              </Button>}
              <Button type="submit" className="flex-1" disabled={loading}>
                {loading ? "Saving..." : "Save Details"}
              </Button>
            </div>
          </form>
        </Form>
    </>
  );

  if (inline) return <div className="rounded-2xl border border-border/50 bg-card p-5 sm:p-6">{content}</div>;
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto">{content}</DialogContent>
  </Dialog>;
}
