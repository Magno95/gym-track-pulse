import { createContext, useContext } from 'react';
import type { Change, Operation, WorkoutState } from './data/model';

export const WorkoutContext = createContext<{
  data: WorkoutState; pending: Operation[]; online: boolean; loading: boolean; syncing: boolean;
  error: string | null; retry: () => Promise<void>; enqueue: (change: Change) => void;
} | null>(null);
export function useWorkout() {
  const context = useContext(WorkoutContext);
  if (!context) throw new Error('WorkoutProvider mancante.');
  return context;
}
