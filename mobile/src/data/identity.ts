let activeOwner: string | null = null;
export const getActiveOwner = () => activeOwner;
export const setActiveOwner = (owner: string | null) => { activeOwner = owner; };
export function requireOwner(owner: string) {
  if (activeOwner !== owner) throw new Error('L’account è cambiato. Accedi di nuovo.');
}
