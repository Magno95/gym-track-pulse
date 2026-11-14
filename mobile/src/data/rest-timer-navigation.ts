import type { WorkoutRun } from './workout-run.ts';

type Route = { name: string; params?: object };

export function restTimerToPresent(run: WorkoutRun | undefined, route: Route | undefined, now = Date.now()) {
  const rest = run?.endedAt === null ? run.rest : null;
  if (!rest || rest.endsAt <= now) return null;
  if (route?.name === 'rest-timer' && route.params && 'notificationId' in route.params
    && route.params.notificationId === rest.notificationId) return null;
  return rest;
}

// A deep link can remove the sheet through NAVIGATE/REPLACE/RESET. Only an
// explicit back action (including the native swipe's POP) cancels recovery.
export function isRestTimerDismissal(action: { type: string }) {
  return action.type === 'POP' || action.type === 'GO_BACK' || action.type === 'POP_TO_TOP';
}
