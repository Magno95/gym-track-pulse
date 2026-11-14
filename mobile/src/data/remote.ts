import { getSupabase } from '../supabase';
import { requireOwner } from './identity';
import { readAllPages } from './exercises';
import { type Operation, type WorkoutState } from './model';
import { uploadExerciseImage, cleanupImage } from '../images';

export async function fetchState(owner: string, signal: AbortSignal): Promise<WorkoutState> {
  requireOwner(owner);
  const client = getSupabase();
  const [exercises, sessions, measurements, profile] = await Promise.all([
    readAllPages((from, to) => client.from('exercises').select('*').eq('user_id', owner).order('id').range(from, to).abortSignal(signal)),
    readAllPages((from, to) => client.from('sessions').select('*,exercises!inner(user_id)').eq('exercises.user_id', owner).order('date').order('id').range(from, to).abortSignal(signal)),
    readAllPages((from, to) => client.from('body_weight_history').select('*').eq('user_id', owner).order('effective_date').order('id').range(from, to).abortSignal(signal)),
    client.from('profiles').select('*').eq('user_id', owner).abortSignal(signal).maybeSingle(),
  ]);
  if (profile.error) throw profile.error;
  requireOwner(owner);
  return { userId: owner, exercises: exercises.map((exercise) => ({ ...exercise, sessions: sessions.filter((session) => session.exercise_id === exercise.id)
    .map(({ exercises: _exercise, ...session }) => session) })), measurements, profile: profile.data, updatedAt: Date.now() };
}

export async function executeOperation(operation: Operation, signal: AbortSignal) {
  const owner = operation.owner;
  requireOwner(owner);
  const client = getSupabase();
  const { data, error } = await client.auth.getSession();
  if (error || data.session?.user.id !== owner) throw new Error('Accedi nuovamente per sincronizzare.');
  requireOwner(owner);
  const change = operation.change;
  switch (change.type) {
    case 'save_exercise': {
      if (change.exercise.user_id !== owner) throw new Error('Account non corrispondente.');
      if (change.image) await uploadExerciseImage(change.image, owner, signal);
      requireOwner(owner);
      const { sessions: _sessions, ...exercise } = change.exercise;
      const result = change.mode === 'update'
        ? await client.from('exercises').update(exercise).eq('id', exercise.id).eq('user_id', owner).select('id').abortSignal(signal).single()
        : await client.from('exercises').upsert(exercise, { onConflict: 'id', ignoreDuplicates: change.mode === 'create' }).abortSignal(signal);
      if (result.error) throw result.error;
      break;
    }
    case 'save_sessions': {
      // Both halves of a superset are written atomically, with stable IDs across retries.
      if (change.mode === 'update') {
        const ids = change.sessions.map((session) => session.id);
        const existing = await client.from('sessions').select('id,exercises!inner(user_id)').in('id', ids).eq('exercises.user_id', owner).abortSignal(signal);
        if (existing.error) throw existing.error;
        if (existing.data.length !== new Set(ids).size) throw Object.assign(new Error('Una sessione è stata eliminata su un altro dispositivo. Esporta le modifiche per recuperarla.'), { code: 'PGRST116' });
        requireOwner(owner);
      }
      const result = await client.from('sessions').upsert(change.sessions, { onConflict: 'id', ignoreDuplicates: change.mode === 'create' }).abortSignal(signal);
      if (result.error) throw result.error;
      break;
    }
    case 'delete_session': {
      const result = await client.from('sessions').delete().eq('id', change.sessionId).abortSignal(signal);
      if (result.error) throw result.error;
      break;
    }
    case 'delete_sessions': {
      if (!change.sessionIds.length) break;
      // One deletion preserves the atomicity of superset pairs; RLS scopes it to the owner.
      const result = await client.from('sessions').delete().in('id', change.sessionIds).abortSignal(signal);
      if (result.error) throw result.error;
      break;
    }
    case 'delete_exercise': {
      const result = await client.from('exercises').delete().eq('id', change.exerciseId).eq('user_id', owner).abortSignal(signal);
      if (result.error) throw result.error;
      break;
    }
    case 'save_height': {
      const result = await client.from('profiles').upsert({ user_id: owner, height_cm: change.height }).abortSignal(signal);
      if (result.error) throw result.error;
      break;
    }
    case 'save_weight': {
      if (change.measurement.user_id !== owner) throw new Error('Account non corrispondente.');
      const result = await client.from('body_weight_history').upsert(change.measurement, { onConflict: 'user_id,effective_date' }).abortSignal(signal);
      if (result.error) throw result.error;
      break;
    }
    case 'delete_image': await cleanupImage(change.imageUrl, owner, signal); break;
  }
  requireOwner(owner);
}
