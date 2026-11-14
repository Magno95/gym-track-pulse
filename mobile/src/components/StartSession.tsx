import { Alert } from 'react-native';
import { router } from 'expo-router';
import { useActiveSession, useNow } from '../active-session';
import { elapsedSeconds, formatTimer, localRunDate, type WorkoutRun } from '../data/workout-run';
import { Action, Caption } from './UI';

export function StartSession({ disabled, onOpen }: { disabled?: boolean; onOpen?: (run: WorkoutRun) => void }) {
  const session = useActiveSession(); const now = useNow(true);
  const today = session.runs.find((run) => run.date === localRunDate(now));
  return <>
    <Action variant="brand" icon={session.active ? 'timer' : today ? 'checkmark.circle' : 'play.fill'}
      title={session.active ? `In sessione · ${formatTimer(elapsedSeconds(session.active, now))}` : today ? 'Riepilogo sessione' : 'Inizia allenamento'}
      disabled={disabled || !!session.error} onPress={() => {
        try {
          const run = session.active ?? today ?? session.start();
          if (onOpen) onOpen(run);
          else router.push({ pathname: '/workout-session', params: { date: run.date } });
        } catch (error) { Alert.alert('Sessione non avviata', error instanceof Error ? error.message : 'Riprova.'); }
      }} />
    {session.error && <Caption danger>{session.error}</Caption>}
  </>;
}
