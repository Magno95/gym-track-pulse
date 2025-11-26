import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { exerciseStore } from "@/lib/exerciseStore";
import { Exercise } from "@/data/mockData";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { AddSessionDialog } from "@/components/AddSessionDialog";
import { ArrowLeft, Calendar, TrendingUp } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export default function ExerciseDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [exercise, setExercise] = useState<Exercise | undefined>(undefined);

  useEffect(() => {
    if (id) {
      setExercise(exerciseStore.getById(id));
    }
  }, [id]);

  const handleSessionAdded = () => {
    if (id) {
      setExercise(exerciseStore.getById(id));
    }
  };

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
          <div className="flex items-center gap-3 mb-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/")}
              className="hover:bg-secondary"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-2xl font-bold text-foreground flex-1">{exercise.name}</h1>
          </div>
          <AddSessionDialog
            exerciseId={exercise.id}
            exerciseName={exercise.name}
            onSessionAdded={handleSessionAdded}
          />
        </div>
      </div>

      <div className="container max-w-2xl mx-auto px-4 py-6">
        <Tabs defaultValue="sessions" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="sessions">Sessions</TabsTrigger>
            <TabsTrigger value="statistics">Statistics</TabsTrigger>
          </TabsList>

          <TabsContent value="sessions" className="space-y-3">
            {exercise.sessions
              .slice()
              .reverse()
              .map((session) => (
                <Card key={session.id} className="p-4 border-border/50" style={{ boxShadow: 'var(--shadow-card)' }}>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <Calendar className="h-4 w-4 text-primary" />
                        <span className="font-medium text-foreground">
                          {new Date(session.date).toLocaleDateString("en-US", {
                            weekday: "short",
                            month: "long",
                            day: "numeric",
                          })}
                        </span>
                      </div>
                      <div className="space-y-1 text-sm text-muted-foreground">
                        <p>Series: {session.series}</p>
                        <p>Reps: {session.reps}</p>
                        <p>Weight: {session.weight} kg</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground mb-1">Total Value</div>
                      <div className="text-2xl font-bold text-primary">{session.value}</div>
                    </div>
                  </div>
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
