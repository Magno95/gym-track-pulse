export type ExerciseSection = 'details' | 'sessions' | 'statistics';
export type ExerciseSwipeTarget = ExerciseSection | 'exercises';
export function exerciseSection(value: string | undefined): ExerciseSection {
  return value === 'sessions' || value === 'statistics' ? value : 'details';
}

const sections: ExerciseSection[] = ['details', 'sessions', 'statistics'];

export function exerciseSectionDirection(from: ExerciseSection, to: ExerciseSection): -1 | 0 | 1 {
  return Math.sign(sections.indexOf(to) - sections.indexOf(from)) as -1 | 0 | 1;
}

export function exerciseSwipeTarget(section: ExerciseSection, dx: number): ExerciseSwipeTarget | null {
  if (dx === 0) return null;
  const index = sections.indexOf(section) + (dx < 0 ? 1 : -1);
  return index < 0 ? 'exercises' : sections[index] ?? null;
}

export function isExerciseSwipe(dx: number, dy: number): boolean {
  return Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.5;
}

export function completedExerciseSwipe(section: ExerciseSection, dx: number, dy: number, width: number): ExerciseSwipeTarget | null {
  return isExerciseSwipe(dx, dy) && Math.abs(dx) >= Math.max(48, width * 0.18)
    ? exerciseSwipeTarget(section, dx) : null;
}

/** Exclusions last through release/cancellation and reset only for a new touch. */
export function createExerciseSwipeGate() {
  let excluded = false;
  return {
    begin(touches: number) { excluded = touches !== 1; },
    exclude() { excluded = true; },
    allowsSwipe() { return !excluded; },
  };
}
