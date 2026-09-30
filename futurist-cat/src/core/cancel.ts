// One cancellation token per sequence (round, celebration, intro...). Cancelling runs the
// registered cleanups once, children are cancelled with their parent.
export class Cancelled extends Error {
  constructor(readonly reason = 'cancelled') { super(reason); this.name = 'Cancelled'; }
}
export const isCancelled = (e: unknown): e is Cancelled => e instanceof Cancelled;

export class CancelToken {
  cancelled = false;
  reason = '';
  private handlers = new Set<(reason: string) => void>();
  private children = new Set<CancelToken>();

  onCancel(fn: (reason: string) => void): () => void {
    if (this.cancelled) { fn(this.reason); return () => {}; }
    this.handlers.add(fn);
    return () => this.handlers.delete(fn);
  }
  cancel(reason = 'cancelled'): void {
    if (this.cancelled) return;
    this.cancelled = true;
    this.reason = reason;
    for (const c of this.children) c.cancel(reason);
    for (const h of [...this.handlers]) { try { h(reason); } catch (e) { console.error(e); } }
    this.handlers.clear();
    this.children.clear();
  }
  child(): CancelToken {
    const c = new CancelToken();
    if (this.cancelled) c.cancel(this.reason); else this.children.add(c);
    return c;
  }
  throwIfCancelled(): void { if (this.cancelled) throw new Cancelled(this.reason); }
}
