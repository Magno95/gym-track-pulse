import type { WorkoutRun } from './workout-run.ts';

export type SessionActivityStatus = 'idle' | 'active' | 'expo-go' | 'missing-build' | 'unsupported' | 'unavailable';
export type ActivityProps = { startedAt: number; restStartedAt: number | null; restEndsAt: number | null; exercises: number };
type Activity = { update: (props: ActivityProps) => Promise<void>; end: (policy: 'immediate') => Promise<void> };
type Factory = { getInstances: () => Activity[]; start: (props: ActivityProps, url: string) => unknown };

export function createSessionActivitySynchronizer(environment: () => 'available' | 'expo-go' | 'missing-build' | 'unsupported', load: () => Promise<Factory>) {
  let queue: Promise<SessionActivityStatus> = Promise.resolve('idle');
  return (run: WorkoutRun | null, exercises: number): Promise<SessionActivityStatus> => {
    queue = queue.then(async () => {
      const support = environment();
      if (support !== 'available') return support;
      const factory = await load();
      const instances = factory.getInstances();
      if (!run || run.endedAt !== null) {
        await Promise.all(instances.map((instance) => instance.end('immediate')));
        return 'idle';
      }
      const props = { startedAt: run.startedAt, restStartedAt: run.rest?.startedAt ?? null, restEndsAt: run.rest?.endsAt ?? null, exercises };
      if (instances[0]) {
        await instances[0].update(props);
        await Promise.all(instances.slice(1).map((instance) => instance.end('immediate')));
      } else factory.start(props, 'gymtrack://session');
      return 'active';
    }).catch(() => 'unavailable');
    return queue;
  };
}
