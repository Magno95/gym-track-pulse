import { useState, useCallback } from "react";
import { processQueue } from "@/lib/localCache";
import { format } from "date-fns";
import { useParams, useNavigate } from "react-router-dom";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { AddSessionDialog } from "@/components/AddSessionDialog";
import { EditSessionDialog } from "@/components/EditSessionDialog";
import { EditExerciseDetailsDialog } from "@/components/EditExerciseDetailsDialog";
import { ArrowLeft, Calendar, TrendingUp, Trash2, Edit, Image, Zap, Trophy } from "lucide-react";
import { getCategoryConfig } from "@/lib/categoryIcons";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Database } from "@/integrations/supabase/types";

type Session = Database["public"]["Tables"]["sessions"]["Row"];

export default function ExerciseDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [editingSession, setEditingSession] = useState<Session | null>(null);
  const [editingDetails, setEditingDetails] = useState(false);
  const [activeTab, setActiveTab] = useState("details");

  const { data: exercise, isLoading: loading } = useExercise(id);
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

  const chartData = exercise.sessions.map((session) => ({
    date: new Date(session.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    value: session.value,
  }));

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border/50">
        <div className="container max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => { processQueue(); navigate("/"); }}
              className="hover:bg-secondary"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            {(() => {
              const categoryInfo = getCategoryConfig(exercise.category);
              const CategoryIcon = categoryInfo.icon;
              return <CategoryIcon className={`h-6 w-6 ${categoryInfo.color}`} />;
            })()}
            <h1 className="text-2xl font-bold text-foreground flex-1">{exercise.name}</h1>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setEditingDetails(true)}
              className="hover:bg-secondary"
            >
              <Edit className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>

      <AddSessionDialog
        exerciseId={exercise.id}
        exerciseName={exercise.name}
        unit={exercise.unit}
        supersetMultiplier={exercise.superset_multiplier}
        onSessionAdded={handleSessionAdded}
      />

      {editingSession && (
        <EditSessionDialog
          session={editingSession}
          exerciseName={exercise.name}
          unit={exercise.unit}
          supersetMultiplier={exercise.superset_multiplier}
          open={!!editingSession}
          onOpenChange={(open) => !open && setEditingSession(null)}
        />
      )}

      <EditExerciseDetailsDialog
        exerciseId={exercise.id}
        currentName={exercise.name}
        currentImageUrl={exercise.image_url}
        currentDescription={exercise.description}
        currentUnit={exercise.unit}
        currentSupersetMultiplier={exercise.superset_multiplier}
        currentPersonalRecords={exercise.personal_records as Array<{ text: string; date: string }> | null}
        open={editingDetails}
        onOpenChange={setEditingDetails}
        onDetailsUpdated={() => id && invalidateOne(id)}
      />

      <div className="container max-w-2xl mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="sticky top-[57px] z-10 bg-background/95 backdrop-blur-sm pb-4 -mx-4 px-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="sessions">Sessions</TabsTrigger>
              <TabsTrigger value="statistics">Statistics</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="details">
            <div className="flex flex-col">
              {exercise.image_url ? (
                <img 
                  src={exercise.image_url} 
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
                const prs = exercise.personal_records as Array<{ text: string; date: string }> | null;
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
                              {format(new Date(pr.date), "dd/MM/yyyy")}
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
                          {format(new Date(session.date), "dd-MM-yyyy")}
                        </span>
                      </div>
                      <div className="space-y-1 text-sm text-muted-foreground">
                        <p>Series: {session.series}</p>
                        <p>Reps: {session.reps}</p>
                        <p>
                          {exercise.unit === "distance" ? "Distance" : exercise.unit === "time" ? "Time" : "Weight"}: {session.weight} {exercise.unit === "distance" ? "m" : exercise.unit === "time" ? "s" : "kg"}
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
                      Super Set {session.is_superset_secondary && `(${exercise.superset_multiplier || 1.2}x)`}
                    </span>
                  )}
                </Card>
              ))}
          </TabsContent>

          <TabsContent value="statistics">
            <Card className="p-6 border-border/50" style={{ boxShadow: 'var(--shadow-elevated)' }}>
              <div className="flex items-center gap-2 mb-6">
                <TrendingUp className="h-5 w-5 text-accent" />
                <h3 className="text-lg font-semibold text-foreground">Progress Over Time</h3>
              </div>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="date" 
                    stroke="hsl(var(--muted-foreground))"
                    style={{ fontSize: '12px' }}
                  />
                  <YAxis 
                    stroke="hsl(var(--muted-foreground))"
                    style={{ fontSize: '12px' }}
                  />
                  <Tooltip 
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="value" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={3}
                    dot={{ fill: 'hsl(var(--primary))', r: 5 }}
                    activeDot={{ r: 7 }}
                  />
                </LineChart>
              </ResponsiveContainer>
              <div className="mt-6 grid grid-cols-3 gap-4">
                <div className="text-center">
                  <div className="text-sm text-muted-foreground mb-1">Best</div>
                  <div className="text-xl font-bold text-accent">
                    {Math.max(...exercise.sessions.map(s => s.value))}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-sm text-muted-foreground mb-1">Average</div>
                  <div className="text-xl font-bold text-primary">
                    {Math.round(exercise.sessions.reduce((sum, s) => sum + s.value, 0) / exercise.sessions.length)}
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
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
