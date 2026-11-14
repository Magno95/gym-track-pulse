import { useState } from 'react';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import { useWorkout } from '@/workout';
import { todayLocal, isCalendarDate } from '@/domain';
import { numberInput } from '@/data/actions';
import { Action, Caption, DateField, Field, FormPage } from '@/components/UI';

export default function MeasurementForm() {
  const w = useWorkout(); const params = useLocalSearchParams<{ date?: string; mode?: string }>();
  const heightMode = params.mode === 'height';
  const initialDate = params.date && isCalendarDate(params.date) ? params.date : todayLocal();
  const [date, setDate] = useState(initialDate);
  const [value, setValue] = useState(() => heightMode ? String(w.data.profile?.height_cm ?? '') : String(w.data.measurements.find((item) => item.effective_date === initialDate)?.weight_kg ?? ''));
  const [error, setError] = useState<string | null>(null);
  function save() {
    try {
      const amount = numberInput(value);
      if (!Number.isFinite(amount) || amount <= 0 || amount > (heightMode ? 300 : 1000)) throw new Error(heightMode ? 'Inserisci un’altezza tra 0 e 300 cm.' : 'Inserisci un peso tra 0 e 1.000 kg.');
      if (heightMode) w.enqueue({ type: 'save_height', height: amount });
      else {
        if (!isCalendarDate(date) || date > todayLocal()) throw new Error('Scegli una data valida fino a oggi.');
        const previous = w.data.measurements.find((item) => item.effective_date === date);
        w.enqueue({ type: 'save_weight', measurement: { id: previous?.id ?? randomUUID(), user_id: w.data.userId, weight_kg: amount, effective_date: date, created_at: previous?.created_at ?? new Date().toISOString() } });
      }
      router.back();
    } catch (e) { setError(e instanceof Error ? e.message : 'Salvataggio non riuscito.'); }
  }
  return <><Stack.Screen options={{ title: heightMode ? 'Altezza' : 'Peso corporeo' }} /><FormPage footer={<>
    {error && <Caption danger>{error}</Caption>}<Action title={heightMode ? 'Salva altezza' : 'Salva peso'} icon="checkmark" onPress={save} />
  </>}>
    {!heightMode && <DateField value={date} maximumDate={new Date()} onChange={(date) => { setDate(date); setValue(String(w.data.measurements.find((item) => item.effective_date === date)?.weight_kg ?? '')); }} />}
    <Field label={heightMode ? 'Altezza · cm' : 'Peso · kg'} keyboardType="decimal-pad" placeholder={heightMode ? 'Es. 175' : 'Es. 72,5'} value={value} onChangeText={(value) => { setValue(value); setError(null); }} autoFocus />
    <Caption>{heightMode ? 'L’altezza viene utilizzata per calcolare l’indice di massa corporea.' : 'La misurazione vale da questa data. I pesi già salvati nelle serie precedenti restano invariati.'}</Caption>
  </FormPage></>;
}
