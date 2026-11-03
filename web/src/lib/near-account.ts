/** Shortens a NEAR account id for display: keeps the start and end so people can still recognise it. */
export function shortAccount(id: string): string {
  if (/^[0-9a-f]{64}$/.test(id)) return `${id.slice(0, 6)}…${id.slice(-6)}`;
  if (id.length <= 22) return id;
  return `${id.slice(0, 9)}…${id.slice(-9)}`;
}
