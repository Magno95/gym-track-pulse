import { CalendarDays, FileText, Plus, Settings, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";

export function ExerciseNavigation({ onAddSession }: { onAddSession: () => void }) {
  const itemClass = "flex min-h-14 min-w-0 flex-1 flex-col gap-1 rounded-full px-1 text-[10px] shadow-none data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none sm:text-xs";
  return <nav aria-label="Exercise sections">
    <TabsList className="floating-navigation exercise-navigation">
      <TabsTrigger value="details" className={itemClass}><FileText className="h-5 w-5" aria-hidden="true" /><span>Details</span></TabsTrigger>
      <TabsTrigger value="sessions" className={itemClass}><CalendarDays className="h-5 w-5" aria-hidden="true" /><span>Sessions</span></TabsTrigger>
      <Button type="button" size="icon" aria-label="Log a new session" onClick={onAddSession}
        className="mx-1 h-12 w-12 shrink-0 rounded-full bg-linear-to-br from-primary to-primary/80 shadow-lg shadow-primary/20 transition-transform active:scale-95 motion-reduce:transition-none sm:mx-3 sm:h-14 sm:w-14">
        <Plus className="h-6 w-6" aria-hidden="true" />
      </Button>
      <TabsTrigger value="statistics" className={itemClass}><TrendingUp className="h-5 w-5" aria-hidden="true" /><span>Statistics</span></TabsTrigger>
      <TabsTrigger value="settings" className={itemClass}><Settings className="h-5 w-5" aria-hidden="true" /><span>Settings</span></TabsTrigger>
    </TabsList>
  </nav>;
}
