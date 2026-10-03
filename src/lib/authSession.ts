let currentUserId: string | null = null;

export class AuthSessionError extends Error {
  readonly code = "AUTH_CHANGED";
}

// Changed synchronously by the auth listener, before any asynchronous work.
export function setCurrentUserId(userId: string | null) {
  currentUserId = userId;
}

export function getCurrentUserId() {
  return currentUserId;
}

export function requireUserId(expected = currentUserId): string {
  if (!expected || expected !== currentUserId) {
    throw new AuthSessionError("Your account changed. Sign in again before saving.");
  }
  return expected;
}
