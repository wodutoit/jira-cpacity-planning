// Global saving counter — fire-and-forget writes notify the header indicator.
// Usage: notifySaving(+1) before, notifySaving(-1) in finally.
export function notifySaving(delta) {
  window.dispatchEvent(new CustomEvent('cpw-saving', { detail: delta }));
}

// Wrap an async fn with saving notification
export async function withSaving(fn) {
  notifySaving(1);
  try { return await fn(); } finally { notifySaving(-1); }
}
