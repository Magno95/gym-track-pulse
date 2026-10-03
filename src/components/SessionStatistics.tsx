import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, ResponsiveContainer, CartesianGrid } from "recharts";
import { format, startOfWeek, endOfWeek, eachWeekOfInterval, subWeeks } from "date-fns";
import { it } from "date-fns/locale";
import { DaySession } from "./SessionCard";
import { TrendingUp, Calendar, Dumbbell } from "lucide-react";

interface SessionStatisticsProps {
  sessions: DaySession[];
}

export function SessionStatistics({ sessions }: SessionStatisticsProps) {
  // Data for score over time (line chart)
  const scoreOverTimeData = useMemo(() => {
    return sessions
      .slice()
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-10) // Last 10 sessions
      .map((session) => ({
        date: format(new Date(`${session.date}T12:00:00`), "dd/MM", { locale: it }),
        punteggio: session.totalValue,
      }));
  }, [sessions]);

  // Data for training frequency (sessions per week)
  const frequencyData = useMemo(() => {
    if (sessions.length === 0) return [];

    const minDate = subWeeks(new Date(), 7); // Last 8 weeks
    const maxDate = new Date();

    const weeks = eachWeekOfInterval(
      { start: minDate, end: maxDate },
      { weekStartsOn: 1 }
    );

    return weeks.map((weekStart) => {
      const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
      const sessionsInWeek = sessions.filter((session) => {
        const sessionDate = new Date(`${session.date}T12:00:00`);
        return sessionDate >= weekStart && sessionDate <= weekEnd;
      }).length;

      return {
        settimana: format(weekStart, "dd/MM", { locale: it }),
        sessioni: sessionsInWeek,
      };
    });
  }, [sessions]);

  // Data for exercises per session (bar chart)
  const exercisesPerSessionData = useMemo(() => {
    return sessions
      .slice()
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-10) // Last 10 sessions
      .map((session) => ({
        date: format(new Date(`${session.date}T12:00:00`), "dd/MM", { locale: it }),
        esercizi: session.exercises.length,
      }));
  }, [sessions]);

  const chartConfig = {
    punteggio: {
      label: "Punteggio",
      color: "hsl(var(--primary))",
    },
    sessioni: {
      label: "Sessioni",
      color: "hsl(var(--accent))",
    },
    esercizi: {
      label: "Esercizi",
      color: "hsl(var(--chart-3))",
    },
  };

  if (sessions.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Score over time */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Punteggio nel Tempo
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[200px] w-full">
            <LineChart data={scoreOverTimeData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="date" 
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis 
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line
                type="monotone"
                dataKey="punteggio"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={{ fill: "hsl(var(--primary))", strokeWidth: 2 }}
              />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Training frequency */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Calendar className="h-4 w-4 text-accent" />
            Frequenza Allenamenti (per settimana)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[200px] w-full">
            <BarChart data={frequencyData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="settimana" 
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis 
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar
                dataKey="sessioni"
                fill="hsl(var(--accent))"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Exercises per session */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Dumbbell className="h-4 w-4 text-chart-3" />
            Esercizi per Sessione
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[200px] w-full">
            <BarChart data={exercisesPerSessionData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="date" 
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis 
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar
                dataKey="esercizi"
                fill="hsl(var(--chart-3))"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  );
}
