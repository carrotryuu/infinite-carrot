export type Operation = 'pan' | 'zoom' | 'selection-drag';
export type FrameResult = {
  operation: Operation;
  durationMs: number;
  frames: number;
  averageFps: number;
  minimumWindowFps: number;
  worstFrameMs: number;
  valid: boolean;
};

export function summarizeFrames(
  operation: Operation,
  timestamps: number[],
  valid = true,
): FrameResult {
  const durationMs =
    timestamps.length > 1 ? timestamps[timestamps.length - 1]! - timestamps[0]! : 0;
  const deltas = timestamps.slice(1).map((time, index) => time - timestamps[index]!);
  const windows: number[] = [];
  let windowStart = timestamps[0] ?? 0;
  let frames = 0;
  for (const time of timestamps.slice(1)) {
    frames++;
    if (time - windowStart >= 1000) {
      windows.push((frames * 1000) / (time - windowStart));
      frames = 0;
      windowStart = time;
    }
  }
  const averageFps = durationMs ? (deltas.length * 1000) / durationMs : 0;
  return {
    operation,
    durationMs,
    frames: deltas.length,
    averageFps,
    minimumWindowFps: windows.length ? Math.min(...windows) : averageFps,
    worstFrameMs: deltas.length ? Math.max(...deltas) : 0,
    valid: valid && durationMs >= 3000,
  };
}

export type Report = {
  firstPaintMs: number | null;
  decodeMs: number;
  heapBytes: number | null;
  recordings: FrameResult[];
  liveFps: number;
  recording: Operation | null;
};

export class Metrics {
  private report: Report;
  private timestamps: number[] = [];
  private valid = true;
  private listeners = new Set<() => void>();
  constructor(decodeMs: number) {
    this.report = {
      firstPaintMs: null,
      decodeMs,
      heapBytes: null,
      recordings: [],
      liveFps: 0,
      recording: null,
    };
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.report;
  private publish(patch: Partial<Report>) {
    this.report = { ...this.report, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  firstPaint(ms: number) {
    if (this.report.firstPaintMs === null) this.publish({ firstPaintMs: ms });
  }
  start(operation: Operation) {
    this.timestamps = [];
    this.valid = !document.hidden;
    this.publish({ recording: operation });
  }
  stop = () => {
    if (!this.report.recording) return;
    const result = summarizeFrames(this.report.recording, this.timestamps, this.valid);
    this.publish({ recording: null, recordings: [...this.report.recordings, result] });
  };
  attach() {
    let raf = 0;
    let lastPublish = performance.now();
    let frameCount = 0;
    const visibility = () => {
      if (document.hidden) this.valid = false;
    };
    document.addEventListener('visibilitychange', visibility);
    const tick = (time: number) => {
      if (this.report.recording) this.timestamps.push(time);
      frameCount++;
      if (time - lastPublish >= 500) {
        const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } })
          .memory;
        this.publish({
          liveFps: (frameCount * 1000) / (time - lastPublish),
          heapBytes: memory?.usedJSHeapSize ?? null,
        });
        frameCount = 0;
        lastPublish = time;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', visibility);
    };
  }
}
