import { HStack, Image, Overlay, Text, VStack } from '@expo/ui/swift-ui';
import { activityBackgroundTint, fixedSize, font, foregroundStyle, hidden, monospacedDigit, padding } from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity } from 'expo-widgets';

type Props = { startedAt: number; restStartedAt: number | null; restEndsAt: number | null; exercises: number };

const WorkoutActivity = createLiveActivity('GymTrackSession', (props: Props) => {
  'widget';
  const start = new Date(props.startedAt);
  const upper = new Date(props.startedAt + 86400000);
  const resting = props.restEndsAt !== null && props.restStartedAt !== null;
  const timer = <Overlay alignment="trailing" modifiers={[monospacedDigit(), fixedSize({ horizontal: true, vertical: false })]}>
    <Text modifiers={[hidden()]}>{resting ? '00:00' : '00:00:00'}</Text>
    <Overlay.Content><Text timerInterval={{ lower: resting ? new Date(props.restStartedAt!) : start, upper: resting ? new Date(props.restEndsAt!) : upper }} countsDown={resting} /></Overlay.Content>
  </Overlay>;
  return {
    banner: <VStack alignment="leading" spacing={10} modifiers={[padding({ all: 16 }), foregroundStyle('#FFFFFF'), activityBackgroundTint('#111111')]}>
      <HStack spacing={8}><Image systemName="dumbbell.fill" color="#FF5000" /><Text modifiers={[font({ weight: 'bold' })]}>GymTrack · In sessione</Text></HStack>
      <Text timerInterval={{ lower: start, upper }} countsDown={false} modifiers={[font({ size: 30, weight: 'bold' }), monospacedDigit()]} />
      <Text>{props.exercises} esercizi registrati</Text>
      {resting && <HStack spacing={10}><Text>Timer</Text>{timer}</HStack>}
    </VStack>,
    compactLeading: <Image systemName={resting ? 'timer' : 'dumbbell.fill'} color="#FF5000" />,
    compactTrailing: timer,
    minimal: <Image systemName={resting ? 'timer' : 'dumbbell.fill'} color="#FF5000" />,
    expandedLeading: <VStack modifiers={[padding({ all: 8 })]}><Image systemName="dumbbell.fill" color="#FF5000" /><Text>GymTrack</Text></VStack>,
    expandedTrailing: <VStack modifiers={[padding({ all: 8 })]}><Text>{resting ? 'Timer' : 'In sessione'}</Text>{timer}</VStack>,
    expandedBottom: <Text modifiers={[padding({ all: 8 })]}>{props.exercises} esercizi · Tocca per tornare alla sessione</Text>,
  };
});
export default WorkoutActivity;
