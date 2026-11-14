import { WorkoutSessionScreen } from '@/components/WorkoutSessionScreen';
import { router, useLocalSearchParams } from 'expo-router';

export default function SessionScreen() {
  const { date } = useLocalSearchParams<{ date?: string }>();
  return <WorkoutSessionScreen followActive date={date} onDone={() => router.setParams({ date: undefined })} />;
}
