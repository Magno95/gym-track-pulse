import { useState, lazy, Suspense } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { CalendarDays, Dumbbell, Plus, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
const AddExerciseDialog = lazy(() => import("@/components/AddExerciseDialog").then((module) => ({ default: module.AddExerciseDialog })));
const AddSessionDialog = lazy(() => import("@/components/AddSessionDialog").then((module) => ({ default: module.AddSessionDialog })));
import { useExercises, useInvalidateExercises } from "@/hooks/useExercises";
import { ExerciseWithSessions } from "@/lib/supabaseStore";
import { cn } from "@/lib/utils";

export function FloatingNavigation() {
  const location = useLocation();
  const [params] = useSearchParams();
  const [action, setAction] = useState<"choose" | "session" | null>(null);
  const [addExerciseOpen, setAddExerciseOpen] = useState(false);
  const [sessionExercise, setSessionExercise] = useState<ExerciseWithSessions | null>(null);
  const { data: exercises = [], isLoading, isError } = useExercises();
  const { invalidateAll } = useInvalidateExercises();
  const onHome = location.pathname === "/";

  const itemClass = (active: boolean) => cn(
    "flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-full text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
    active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
  );

  return <>
    <nav aria-label="Main navigation" className="floating-navigation">
      <Link to="/" aria-current={onHome && params.get("tab") !== "sessions" ? "page" : undefined}
        className={itemClass(onHome && params.get("tab") !== "sessions")}>
        <Dumbbell className="h-6 w-6" aria-hidden="true" /><span>Exercises</span>
      </Link>
      <Button size="icon" aria-label="Add exercise or session" onClick={() => setAction("choose")}
        className="mx-5 h-14 w-14 shrink-0 rounded-full bg-gradient-to-br from-primary to-primary/80 shadow-lg shadow-primary/20 transition-transform active:scale-95 motion-reduce:transition-none">
        <Plus className="h-7 w-7" aria-hidden="true" />
      </Button>
      <Link to="/?tab=sessions" aria-current={onHome && params.get("tab") === "sessions" ? "page" : undefined}
        className={itemClass(onHome && params.get("tab") === "sessions")}>
        <CalendarDays className="h-6 w-6" aria-hidden="true" /><span>Sessions</span>
      </Link>
    </nav>

    <Dialog open={action !== null} onOpenChange={(open) => !open && setAction(null)}>
      <DialogContent className="sm:max-w-md max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{action === "session" ? "Choose an exercise" : "What would you like to add?"}</DialogTitle>
          <DialogDescription>{action === "session" ? "Select the exercise for your next session." : "Build your exercise library or log a workout."}</DialogDescription>
        </DialogHeader>
        {action === "choose" ? <div className="space-y-3">
          <button type="button" className="quick-add-option" onClick={() => { setAction(null); setAddExerciseOpen(true); }}>
            <span className="rounded-2xl bg-primary/10 p-3 text-primary"><Dumbbell className="h-6 w-6" /></span>
            <span className="flex-1"><span className="block font-semibold">New exercise</span><span className="text-sm text-muted-foreground">Add to your library</span></span><ArrowRight className="h-4 w-4" />
          </button>
          <button type="button" className="quick-add-option" onClick={() => setAction("session")}>
            <span className="rounded-2xl bg-accent/10 p-3 text-accent"><CalendarDays className="h-6 w-6" /></span>
            <span className="flex-1"><span className="block font-semibold">Log session</span><span className="text-sm text-muted-foreground">Record sets, reps and load</span></span><ArrowRight className="h-4 w-4" />
          </button>
        </div> : <div className="space-y-2">
          {isLoading ? <p className="py-6 text-center text-muted-foreground">Loading exercises...</p> : isError && exercises.length === 0 ?
            <p role="alert" className="py-6 text-center text-destructive">Could not load exercises. Please try again.</p> : exercises.length === 0 ?
            <div className="py-6 text-center"><p className="mb-4 text-muted-foreground">Add your first exercise to start logging.</p><Button onClick={() => { setAction(null); setAddExerciseOpen(true); }}>New exercise</Button></div> :
            exercises.map((exercise) => <button type="button" key={exercise.id} className="quick-add-option" onClick={() => { setAction(null); setSessionExercise(exercise); }}>
              <span className="flex-1"><span className="block font-medium">{exercise.name}</span><span className="text-xs capitalize text-muted-foreground">{exercise.category}{exercise.is_bodyweight ? " · Bodyweight" : ""}</span></span><ArrowRight className="h-4 w-4 text-muted-foreground" />
            </button>)}
        </div>}
      </DialogContent>
    </Dialog>
    {addExerciseOpen && <Suspense fallback={<p role="status">Loading editor…</p>}><AddExerciseDialog open={addExerciseOpen} onOpenChange={setAddExerciseOpen} hideTrigger onExerciseAdded={invalidateAll} /></Suspense>}
    {sessionExercise && <Suspense fallback={<p role="status">Loading editor…</p>}><AddSessionDialog exerciseId={sessionExercise.id} exerciseName={sessionExercise.name}
      unit={sessionExercise.unit} isBodyweight={sessionExercise.is_bodyweight} supersetMultiplier={sessionExercise.superset_multiplier}
      open hideTrigger onOpenChange={(open) => !open && setSessionExercise(null)} onSessionAdded={invalidateAll} /></Suspense>}
  </>;
}
