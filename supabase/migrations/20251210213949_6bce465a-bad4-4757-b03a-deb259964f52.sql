-- Create storage bucket for exercise images
INSERT INTO storage.buckets (id, name, public)
VALUES ('exercise-images', 'exercise-images', true);

-- Allow authenticated users to upload their own exercise images
CREATE POLICY "Users can upload exercise images"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'exercise-images' 
  AND auth.uid() IS NOT NULL
);

-- Allow public read access to exercise images
CREATE POLICY "Exercise images are publicly accessible"
ON storage.objects
FOR SELECT
USING (bucket_id = 'exercise-images');

-- Allow users to update their own images
CREATE POLICY "Users can update their exercise images"
ON storage.objects
FOR UPDATE
USING (bucket_id = 'exercise-images' AND auth.uid() IS NOT NULL);

-- Allow users to delete their own images
CREATE POLICY "Users can delete their exercise images"
ON storage.objects
FOR DELETE
USING (bucket_id = 'exercise-images' AND auth.uid() IS NOT NULL);