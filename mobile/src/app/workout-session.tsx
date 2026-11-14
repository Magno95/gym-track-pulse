import { Redirect, useLocalSearchParams } from 'expo-router';
import { useActiveSession } from '@/active-session';
import { isCalendarDate } from '@/domain';
import { ScreenState } from '@/components/ScreenState';
import { WorkoutSessionScreen } from '@/components/WorkoutSessionScreen';

// Preserve historical links and route older Live Activities to the session tab.
export default function WorkoutSessionRoute() {
  const { date } = useLocalSearchParams<{ date?: string }>();
  const { active, runs } = useActiveSession();
  if (!date || date === active?.date) return <Redirect href="/session" />;
  if (!isCalendarDate(date) || !runs.some((run) => run.date === date)) return <ScreenState title="Sessione non disponibile" />;
  return <WorkoutSessionScreen key={date} date={date} />;
}
