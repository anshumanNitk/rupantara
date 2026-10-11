type Handler = (data: any) => void;
export class EventBus {
  private m = new Map<string, Set<Handler>>();
  on(event: string, fn: Handler): () => void {
    if (!this.m.has(event)) this.m.set(event, new Set());
    this.m.get(event)!.add(fn);
    return () => this.m.get(event)?.delete(fn);
  }
  emit(event: string, data?: unknown) {
    this.m.get(event)?.forEach((f) => f(data));
    this.m.get('*')?.forEach((f) => f({ event, data }));
  }
}
