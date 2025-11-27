-- Create exercises table
CREATE TABLE public.exercises (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create sessions table
CREATE TABLE public.sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  exercise_id UUID NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  series INTEGER NOT NULL,
  reps INTEGER NOT NULL,
  weight NUMERIC NOT NULL,
  value NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for exercises
CREATE POLICY "Users can view their own exercises"
  ON public.exercises FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own exercises"
  ON public.exercises FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own exercises"
  ON public.exercises FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own exercises"
  ON public.exercises FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for sessions
CREATE POLICY "Users can view their own sessions"
  ON public.sessions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.exercises
      WHERE exercises.id = sessions.exercise_id
      AND exercises.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create sessions for their exercises"
  ON public.sessions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.exercises
      WHERE exercises.id = sessions.exercise_id
      AND exercises.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own sessions"
  ON public.sessions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.exercises
      WHERE exercises.id = sessions.exercise_id
      AND exercises.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their own sessions"
  ON public.sessions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.exercises
      WHERE exercises.id = sessions.exercise_id
      AND exercises.user_id = auth.uid()
    )
  );

-- Create indexes for better performance
CREATE INDEX idx_exercises_user_id ON public.exercises(user_id);
CREATE INDEX idx_sessions_exercise_id ON public.sessions(exercise_id);
CREATE INDEX idx_sessions_date ON public.sessions(date);