// A single pool for the entire canvas, including offscreen/selected nodes.
export class VideoSlots {
  private requested = new Set<string>();
  private active = new Set<string>();
  private listeners = new Set<() => void>();
  constructor(readonly limit = 4) {}
  has = (id: string) => this.active.has(id);
  size = () => this.active.size;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  request(id: string) {
    this.requested.add(id);
    this.reconcile();
    return () => {
      this.requested.delete(id);
      this.reconcile();
    };
  }
  private reconcile() {
    const next = new Set([...this.requested].slice(0, this.limit));
    if (next.size === this.active.size && [...next].every((id) => this.active.has(id))) return;
    this.active = next;
    this.listeners.forEach((listener) => listener());
  }
}
export const videoSlots = new VideoSlots();
