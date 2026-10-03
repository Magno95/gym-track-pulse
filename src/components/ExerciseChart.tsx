import { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { Database } from "@/integrations/supabase/types";
type Session = Database["public"]["Tables"]["sessions"]["Row"];
export default function ExerciseChart({ sessions }: { sessions: Session[] }) {
  const data = useMemo(() => sessions.slice(-300).map((session) => ({ date: new Date(`${session.date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }), value: session.value })), [sessions]);
  return <><p className="mb-2 text-sm text-muted-foreground">{sessions.length > 300 ? "Chart shows the latest 300 sessions. Summaries include the full history." : "Session scores over time"}</p>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={data}>
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
              </ResponsiveContainer></>;
}
