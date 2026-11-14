import { useState } from 'react';
import { Alert, Text } from 'react-native';
import { useActiveSession } from '../active-session';
import { usePalette } from '../theme';
import { Action, Caption, Card, Field, Pills } from './UI';
import { typography } from '../design';

export function TimerControls() {
  const session = useActiveSession(); const p = usePalette();
  const [seconds, setSeconds] = useState('90'); const [custom, setCustom] = useState(''); const [busy, setBusy] = useState(false);
  if (!session.active) return null;
  async function start() {
    setBusy(true);
    try {
      await session.startRest(Number(seconds === 'custom' ? custom : seconds));
    }
    catch (error) { Alert.alert('Timer non avviato', error instanceof Error ? error.message : 'Riprova.'); }
    finally { setBusy(false); }
  }
  return <Card>
    <Text style={{ ...typography.body, fontWeight: '600', color: p.text }}>Timer</Text>
    <Caption>Per recuperi ed esercizi a tempo.</Caption>
    <Pills value={seconds} onChange={setSeconds} items={[30, 60, 90, 120].map((value) => ({ id: String(value), label: `${value} s` })).concat({ id: 'custom', label: 'Altro' })} />
    {seconds === 'custom' && <Field label="Durata · secondi" value={custom} onChangeText={setCustom} keyboardType="number-pad" maxLength={4} />}
    <Action title="Avvia timer" icon="timer" variant="secondary" busy={busy} onPress={() => void start()} />
    <Caption>Due vibrazioni al termine con l’app aperta. A schermo bloccato ricevi una notifica, secondo le impostazioni dell’iPhone.</Caption>
  </Card>;
}
