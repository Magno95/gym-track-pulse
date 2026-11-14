import { useState } from 'react';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import { Alert, Button, Switch, View } from 'react-native';
import { PersistentImage as Image } from '@/components/PersistentImage';
import { useWorkout } from '@/workout';
import { newExercise, numberInput } from '@/data/actions';
import { personalRecords, type ImageUpload } from '@/data/model';
import { categories } from '@/data/exercises';
import { todayLocal, isCalendarDate } from '@/domain';
import { chooseImage, publicImageUrl } from '@/images';
import { Action, Caption, DateField, Field, FormPage, Pills, SectionTitle, Card } from '@/components/UI';
import { ScreenState } from '@/components/ScreenState';
import { exerciseImage } from '@/exercise-images';
import { usePalette } from '@/theme';

export default function ExerciseForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const workout = useWorkout();
  if (workout.loading) return <ScreenState title="Caricamento" loading />;
  if (id && !workout.data.exercises.some((exercise) => exercise.id === id)) return <ScreenState title="Esercizio non disponibile" />;
  return <Editor key={id ?? 'new'} id={id} />;
}
function Editor({ id }: { id?: string }) {
  const w = useWorkout(); const p = usePalette();
  const [original] = useState(() => w.data.exercises.find((exercise) => exercise.id === id) ?? newExercise(w.data.userId, randomUUID()));
  const [name, setName] = useState(original.name);
  const [category, setCategory] = useState(original.category);
  const [description, setDescription] = useState(original.description ?? '');
  const [unit, setUnit] = useState(original.unit ?? 'weight');
  const [bodyweight, setBodyweight] = useState(original.is_bodyweight);
  const [multiplier, setMultiplier] = useState(String(original.superset_multiplier ?? 1.2));
  const [records, setRecords] = useState(() => personalRecords(original.personal_records));
  const [image, setImage] = useState<ImageUpload | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const preview = image ? { uri: image.uri } : removeImage ? null : exerciseImage(original);
  function change(setter: (value: string) => void) { return (value: string) => { setDirty(true); setter(value); }; }
  function close() { if (dirty) Alert.alert('Scartare le modifiche?', 'Le modifiche a questo modulo non sono ancora state salvate.', [{ text: 'Continua', style: 'cancel' }, { text: 'Scarta', style: 'destructive', onPress: () => router.back() }]); else router.back(); }
  async function pick() {
    setChoosing(true); setError(null);
    try { const picked = await chooseImage(w.data.userId); if (picked) { setImage(picked); setRemoveImage(false); setDirty(true); } }
    catch (e) { setError(e instanceof Error ? e.message : 'Immagine non disponibile.'); }
    finally { setChoosing(false); }
  }
  function save() {
    try {
      if (!name.trim() || name.trim().length > 100 || description.length > 1000) throw new Error('Inserisci un nome fino a 100 caratteri e una descrizione fino a 1.000.');
      const m = numberInput(multiplier);
      if (!Number.isFinite(m) || m < 1 || m > 5) throw new Error('Il moltiplicatore deve essere tra 1 e 5.');
      if (records.length > 3 || records.some((record) => !record.text.trim() || record.text.length > 500 || !isCalendarDate(record.date))) throw new Error('Inserisci fino a tre record, ciascuno fino a 500 caratteri, con una data valida.');
      if (id && !w.data.exercises.some((exercise) => exercise.id === id)) throw new Error('L’esercizio è stato eliminato.');
      w.enqueue({ type: 'save_exercise', mode: id ? 'update' : 'create', exercise: { ...original, name: name.trim(), category, description: description.trim() || null,
        unit, is_bodyweight: bodyweight && unit !== 'distance', superset_multiplier: m,
        personal_records: records.map((record) => ({ ...record, text: record.text.trim() })),
        image_url: image ? publicImageUrl(image.path) : removeImage ? null : original.image_url }, image: image ?? undefined, previousImage: original.image_url });
      router.back();
    } catch (e) { setError(e instanceof Error ? e.message : 'Salvataggio non riuscito.'); }
  }
  return <><Stack.Screen options={{ title: id ? 'Modifica esercizio' : 'Nuovo esercizio', gestureEnabled: !dirty, headerLeft: () => <Button title="Annulla" onPress={close} /> }} />
    <FormPage footer={<>{error && <Caption danger>{error}</Caption>}<Action title="Salva esercizio" icon="checkmark" onPress={save} disabled={choosing} /></>}>
      <Field label="Nome" value={name} onChangeText={change(setName)} maxLength={100} placeholder="Come si chiama l’esercizio?" />
      <Caption>Gruppo muscolare</Caption><Pills items={categories} value={category} onChange={change(setCategory)} />
      <Field label="Descrizione" value={description} onChangeText={change(setDescription)} multiline maxLength={1000} placeholder="Tecnica, impostazioni, note…" />
      <SectionTitle>Come lo misuri</SectionTitle>
      <Pills items={[{ id: 'weight', label: 'Peso · kg' }, { id: 'time', label: 'Tempo · s' }, { id: 'distance', label: 'Distanza · m' }]} value={unit} onChange={(value) => { setDirty(true); setUnit(value); if (value === 'distance') setBodyweight(false); }} />
      <Card><View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Caption>A corpo libero</Caption><Switch accessibilityLabel="Esercizio a corpo libero" value={bodyweight} disabled={unit === 'distance'} trackColor={{ true: p.accent }} onValueChange={(value) => { setBodyweight(value); setDirty(true); }} /></View>
        <Caption>Il punteggio include il peso corporeo valido alla data dell’allenamento e il carico aggiunto. Le sessioni precedenti mantengono i valori originali.</Caption></Card>
      <Field label="Moltiplicatore superset" keyboardType="decimal-pad" value={multiplier} onChangeText={change(setMultiplier)} />
      <SectionTitle>Immagine</SectionTitle>
      {preview && <Image source={preview} style={{ height: 180, width: '100%', borderRadius: 24 }} resizeMode="contain" />}
      <Action title="Scegli dalla libreria" variant="secondary" onPress={() => void pick()} busy={choosing} />
      {!!preview && <Action title="Rimuovi immagine" variant="danger" onPress={() => { setImage(null); setRemoveImage(true); setDirty(true); }} />}
      <SectionTitle>Record personali</SectionTitle><Caption>Fino a tre traguardi da ricordare.</Caption>
      {records.map((record, index) => <Card key={index}>
        <Field label={`Record ${index + 1}`} value={record.text} maxLength={500} onChangeText={(text) => { setRecords(records.map((item, i) => i === index ? { ...item, text } : item)); setDirty(true); }} />
        <DateField value={record.date} onChange={(date) => { setRecords(records.map((item, i) => i === index ? { ...item, date } : item)); setDirty(true); }} />
        <Action title="Rimuovi record" variant="danger" compact onPress={() => { setRecords(records.filter((_record, i) => i !== index)); setDirty(true); }} />
      </Card>)}
      {records.length < 3 && <Action title="Aggiungi record" variant="secondary" onPress={() => { setRecords([...records, { text: '', date: todayLocal() }]); setDirty(true); }} />}
    </FormPage>
  </>;
}
