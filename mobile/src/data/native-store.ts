import { openDatabaseSync } from 'expo-sqlite';
import { Outbox } from './outbox';
import { getActiveOwner } from './identity';

export const outbox = new Outbox(openDatabaseSync('gymtrack-workouts.db'), getActiveOwner);
