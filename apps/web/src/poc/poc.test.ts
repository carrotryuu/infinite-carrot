import { describe, expect, it } from 'vitest';
import { PocDocument, createFixtureUpdate } from '../canvas/commands/poc-document';
import { VideoSlots } from './video-slots';
import { summarizeFrames } from './metrics';

describe('T01 canvas invariants', () => {
  it('loads the entire fixture and preserves command mutations in a Yjs round trip', () => {
    const store = new PocDocument(createFixtureUpdate());
    expect(store.getSnapshot().filter((node) => node.data.kind === 'video')).toHaveLength(100);
    expect(store.getSnapshot().filter((node) => node.data.kind === 'image')).toHaveLength(30);
    expect(store.getSnapshot().filter((node) => node.data.kind === 'text')).toHaveLength(20);
    expect(store.edges).toHaveLength(150);
    store.applyChanges([
      { id: 'node-0', type: 'position', position: { x: 123, y: 456 } },
      { id: 'node-0', type: 'select', selected: true },
    ]);
    store.setViewport({ x: 8, y: 9, zoom: 0.3 });
    const restored = new PocDocument(store.encode());
    expect(restored.getSnapshot().find((node) => node.id === 'node-0')).toMatchObject({
      position: { x: 123, y: 456 },
      selected: true,
    });
    expect(restored.getViewport()).toEqual({ x: 8, y: 9, zoom: 0.3 });
    restored.destroy();
    store.destroy();
  });
  it('caps preview allocation and gives a released slot to the next eligible node', () => {
    const slots = new VideoSlots();
    const release = Array.from({ length: 50 }, (_, index) => slots.request(`node-${index}`));
    expect(slots.size()).toBe(4);
    expect(slots.has('node-4')).toBe(false);
    release[0]!();
    expect(slots.has('node-0')).toBe(false);
    expect(slots.has('node-4')).toBe(true);
    for (const cleanup of release) cleanup();
    expect(slots.size()).toBe(0);
  });
  it('counts long frames rather than discarding stalls or hiding invalid recordings', () => {
    const regular = Array.from({ length: 241 }, (_, index) => (index * 1000) / 60);
    const stalled = regular.map((time, index) => time + (index >= 60 ? 500 : 0));
    const report = summarizeFrames('pan', stalled);
    expect(report.valid).toBe(true);
    expect(report.averageFps).toBeLessThan(55);
    expect(report.minimumWindowFps).toBeLessThan(45);
    expect(report.worstFrameMs).toBeGreaterThan(500);
    expect(summarizeFrames('pan', regular, false).valid).toBe(false);
    expect(summarizeFrames('pan', [0, 16, 32]).valid).toBe(false);
  });
});
