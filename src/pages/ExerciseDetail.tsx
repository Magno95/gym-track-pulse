import { isCalendarDate } from "@/lib/validation";
import { exerciseImageUrl } from "@/lib/generatedExerciseImages";
import { ExerciseNavigation } from "@/components/ExerciseNavigation";
import { getSessionSets, isBodyweightSession, isTimedBodyweightSession } from "@/lib/bodyweight";
import { useState, useCallback, lazy, Suspense } from "react";
import { processQueue } from "@/lib/localCache";
import { format } from "date-fns";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useExercise, useInvalidateExercises } from "@/hooks/useExercises";
import { useDeleteSession } from "@/hooks/useSessionMutations";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
const AddSessionDialog = lazy(() => import("@/components/AddSessionDialog").then((module) => ({ default: module.AddSessionDialog })));
const EditSessionDialog = lazy(() => import("@/components/EditSessionDialog").then((module) => ({ default: module.EditSessionDialog })));
const EditExerciseDetailsDialog = lazy(() => import("@/components/EditExerciseDetailsDialog").then((module) => ({ default: module.EditExerciseDetailsDialog })));
import { ArrowLeft, Calendar, TrendingUp, Trash2, Image, Zap, Trophy } from "lucide-react";
import { getCategoryConfig } from "@/lib/categoryIcons";
const ExerciseChart = lazy(() => import("@/components/ExerciseChart"));
import { QueryError } from "@/components/QueryError";
import { Database } from "@/integrations/supabase/types";

type Session = Database["public"]["Tables"]["sessions"]["Row"];

export default function ExerciseDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [editingSession, setEditingSession] = useState<Session | null>(null);
  const [visibleSessions, setVisibleSessions] = useState(30);
  const [addSessionOpen, setAddSessionOpen] = useState(false);
  const [params, setParams] = useSearchParams();
  const section = params.get("section");
  const activeTab = ["details", "sessions", "statistics", "settings"].includes(section ?? "") ? section! : "details";
  const setActiveTab = (value: string) => setParams({ section: value });

  const { data: exercise, isLoading: loading, isError, isPlaceholderData, hasCompleteHistory, refetch } = useExercise(id);
  const { invalidateOne } = useInvalidateExercises();
  const deleteSessionMutation = useDeleteSession(id || "");

  const handleSessionAdded = () => {
    if (id) invalidateOne(id);
  };

  const handleDeleteSession = (sessionId: string) => {
    deleteSessionMutation.mutate(sessionId);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (isError && !exercise) return <div className="p-8"><QueryError onRetry={() => void refetch()} /></div>;

  if (!exercise) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Exercise not found</h1>
          <Button onClick={() => navigate("/")}>Go Back</Button>
        </div>
      </div>
    );
  }

  const imageUrl = exerciseImageUrl(exercise.name, exercise.image_url);

  return (
    <div className="floating-page min-h-screen bg-background">
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-xs border-b border-border/50">
        <div className="container max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => { void processQueue().catch(() => {}); navigate("/"); }}
              className="hover:bg-secondary"
              aria-label="Back to exercises"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            {(() => {
              const categoryInfo = getCategoryConfig(exercise.category);
              const CategoryIcon = categoryInfo.icon;
              return <CategoryIcon className={`h-6 w-6 ${categoryInfo.color}`} />;
            })()}
            <h1 className="text-2xl font-bold text-foreground flex-1">{exercise.name}</h1>

          </div>
        </div>
      </div>

      {addSessionOpen && <Suspense fallback={<p role="status">Loading session editor…</p>}><AddSessionDialog
        exerciseId={exercise.id}
        exerciseName={exercise.name}
        unit={exercise.unit}
        isBodyweight={exercise.is_bodyweight}
        supersetMultiplier={exercise.superset_multiplier}
        onSessionAdded={handleSessionAdded}
        open={addSessionOpen}
        onOpenChange={setAddSessionOpen}
        hideTrigger
      /></Suspense>}

      {editingSession && (
        <Suspense fallback={<p role="status">Loading session editor…</p>}><EditSessionDialog
          session={editingSession}
          exerciseName={exercise.name}
          unit={exercise.unit}
          supersetMultiplier={exercise.superset_multiplier}
          open={!!editingSession}
          onOpenChange={(open) => !open && setEditingSession(null)}
        /></Suspense>
      )}


      <div className="container max-w-2xl mx-auto px-4 py-6">
        {isError && <QueryError onRetry={() => void refetch()} />}
        {!hasCompleteHistory && <p role="status">Only locally available sessions are shown until the full history loads.</p>}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsContent value="details">
            <div className="flex flex-col">
              {imageUrl ? (
                <img 
                  src={imageUrl}
                  alt={exercise.name}
                  className="w-full aspect-square object-cover rounded-xl mb-6"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              ) : (
                <div className="w-full aspect-square bg-muted rounded-xl flex items-center justify-center mb-6">
                  <Image className="h-16 w-16 text-muted-foreground" />
                </div>
              )}
              
              <div className="w-full">
                <h3 className="text-lg font-semibold text-foreground mb-2">Description</h3>
                {exercise.description ? (
                  <p className="text-muted-foreground whitespace-pre-wrap">{exercise.description}</p>
                ) : (
                  <p className="text-muted-foreground italic">No description added yet.</p>
                )}
              </div>

              {/* Personal Records Section */}
              {(() => {
                const prs = Array.isArray(exercise.personal_records) ? (exercise.personal_records as Array<{ text?: string; date?: string }>)
                  .filter((record): record is { text: string; date: string } => !!record && typeof record.text === "string" && typeof record.date === "string") : [];
                return (
                  <div className="w-full mt-6">
                    <div className="flex items-center gap-2 mb-3">
                      <Trophy className="h-5 w-5 text-accent" />
                      <h3 className="text-lg font-semibold text-foreground">🏆 PR</h3>
                    </div>
                    {prs && prs.length > 0 ? (
                      <div className="space-y-2">
                        {prs.map((pr, index) => (
                          <div
                            key={index}
                            className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border"
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-lg font-bold text-primary">#{index + 1}</span>
                              <span className="font-medium text-foreground">{pr.text}</span>
                            </div>
                            <span className="text-sm text-muted-foreground">
                              {isCalendarDate(pr.date) ? format(new Date(`${pr.date}T12:00:00`), "dd/MM/yyyy") : "Date unavailable"}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-muted-foreground italic">No personal records yet. Add one by editing the exercise!</p>
                    )}
                  </div>
                );
              })()}
            </div>
          </TabsContent>

          <TabsContent value="sessions" className="space-y-3">
            {exercise.sessions
              .slice()
              .reverse()
              .slice(0, visibleSessions)
              .map((session) => (
                <Card 
                  key={session.id} 
                  className="p-4 border-border/50 relative group cursor-pointer hover:shadow-md transition-shadow" 
                  style={{ boxShadow: 'var(--shadow-card)' }}
                  onClick={() => setEditingSession(session)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Calendar className="h-4 w-4 text-primary" />
                        <span className="font-medium text-foreground">
                          {format(new Date(`${session.date}T12:00:00`), "dd-MM-yyyy")}
                        </span>
                      </div>
                      <div className="space-y-1 text-sm text-muted-foreground">
                        {isBodyweightSession(session) && <p className="text-primary">Body weight: {getSessionSets(session)[0].body_weight} kg · Added load per set</p>}
                        <p>Series: {session.series}</p>
                        <p>{isTimedBodyweightSession(session) ? "Time" : "Reps"}: {session.reps}{isTimedBodyweightSession(session) ? " s" : ""}</p>
                        <p>
                          {isBodyweightSession(session) ? "Weight" : exercise.unit === "distance" ? "Distance" : exercise.unit === "time" ? "Time" : "Weight"}: {session.weight} {isBodyweightSession(session) ? "kg" : exercise.unit === "distance" ? "m" : exercise.unit === "time" ? "s" : "kg"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground mb-1">Total Value</div>
                        <div className="text-2xl font-bold text-primary">{session.value}</div>
                      </div>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Session</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete this session? This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction 
                              onClick={() => handleDeleteSession(session.id)}
                              disabled={deleteSessionMutation.isPending}
                            >
                              {deleteSessionMutation.isPending ? "Deleting..." : "Delete"}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                  {session.superset_id && (
                    <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-accent/20 text-accent">
                      <Zap className="h-3 w-3" />
                      Super Set {session.is_superset_secondary && `(${session.value_multiplier ?? exercise.superset_multiplier ?? 1.2}x)`}
                    </span>
                  )}
                </Card>
              ))}
              {exercise.sessions.length > visibleSessions && <Button variant="outline" onClick={() => setVisibleSessions((value) => value + 30)}>Load more sessions</Button>}
          </TabsContent>

          <TabsContent value="statistics">
            {hasCompleteHistory ? <>
            <Card className="p-6 border-border/50" style={{ boxShadow: 'var(--shadow-elevated)' }}>
              <div className="flex items-center gap-2 mb-6">
                <TrendingUp className="h-5 w-5 text-accent" />
                <h3 className="text-lg font-semibold text-foreground">Progress Over Time</h3>
              </div>
              {activeTab === "statistics" && <Suspense fallback={<p>Loading chart…</p>}><ExerciseChart sessions={exercise.sessions} /></Suspense>}
              <div className="mt-6 grid grid-cols-3 gap-4">
                <div className="text-center">
                  <div className="text-sm text-muted-foreground mb-1">Best</div>
                  <div className="text-xl font-bold text-accent">
                    {exercise.sessions.length ? exercise.sessions.reduce((best, session) => Math.max(best, session.value), 0) : 0}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-sm text-muted-foreground mb-1">Average</div>
                  <div className="text-xl font-bold text-primary">
                    {exercise.sessions.length ? Math.round(exercise.sessions.reduce((sum, s) => sum + s.value, 0) / exercise.sessions.length) : 0}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-sm text-muted-foreground mb-1">Sessions</div>
                  <div className="text-xl font-bold text-foreground">
                    {exercise.sessions.length}
                  </div>
                </div>
              </div>
            </Card>
            </> : <p>Statistics require the complete session history. Connect to load it.</p>}
          </TabsContent>
          <TabsContent value="settings">
            {activeTab === "settings" && <Suspense fallback={<p>Loading settings…</p>}><EditExerciseDetailsDialog
              exerciseId={exercise.id}
              currentName={exercise.name}
              currentImageUrl={exercise.image_url}
              currentDescription={exercise.description}
              currentUnit={exercise.unit}
              currentIsBodyweight={exercise.is_bodyweight}
              currentSupersetMultiplier={exercise.superset_multiplier}
              currentPersonalRecords={exercise.personal_records as Array<{ text: string; date: string }> | null}
              inline
              open={activeTab === "settings"}
              onOpenChange={() => {}}
              onDetailsUpdated={() => id && invalidateOne(id)}
            /></Suspense>}
          </TabsContent>
          <ExerciseNavigation onAddSession={() => setAddSessionOpen(true)} />
        </Tabs>
      </div>
    </div>
  );
}
