import * as Y from 'yjs';
import { applyNodeChanges, type Edge, type NodeChange, type Viewport } from '@xyflow/react';
import { createFixtures, INITIAL_VIEWPORT, type CardNode } from '../../poc/fixtures';

// T01 in-memory document only. Every graph mutation enters through this class.
// No persistence, provider, business file paths or collaboration transport.
export class PocDocument {
  readonly doc = new Y.Doc();
  private readonly nodes = this.doc.getMap<CardNode>('nodes');
  private readonly meta = this.doc.getMap<unknown>('meta');
  private snapshot: CardNode[] = [];
  private readonly listeners = new Set<() => void>();
  readonly loadStarted: number;
  readonly decodeMs: number;
  readonly edges: Edge[];

  constructor(update: Uint8Array) {
    this.loadStarted = performance.now();
    Y.applyUpdate(this.doc, update, 'load');
    this.snapshot = [...this.nodes.values()];
    this.edges = this.doc.getArray<Edge>('edges').toArray();
    this.decodeMs = performance.now() - this.loadStarted;
    this.nodes.observe(() => {
      this.snapshot = [...this.nodes.values()];
      this.listeners.forEach((listener) => listener());
    });
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.snapshot;
  getViewport = () => this.meta.get('viewport') as Viewport;

  applyChanges = (changes: NodeChange<CardNode>[]) => {
    const next = applyNodeChanges(changes, this.snapshot);
    this.doc.transact(() => {
      const retained = new Set(next.map((node) => node.id));
      for (const id of this.nodes.keys()) if (!retained.has(id)) this.nodes.delete(id);
      for (const node of next) if (this.nodes.get(node.id) !== node) this.nodes.set(node.id, node);
    }, 'canvas-command');
  };

  setViewport = (viewport: Viewport) => {
    this.doc.transact(() => this.meta.set('viewport', viewport), 'viewport-command');
  };

  reset = () => {
    this.doc.transact(() => {
      this.nodes.clear();
      createFixtures().nodes.forEach((node) => this.nodes.set(node.id, node));
      this.meta.set('viewport', INITIAL_VIEWPORT);
    }, 'reset-command');
  };

  encode = () => Y.encodeStateAsUpdate(this.doc);
  destroy = () => {
    this.listeners.clear();
    this.doc.destroy();
  };
}

export function createFixtureUpdate() {
  const source = new Y.Doc();
  const fixture = createFixtures();
  source.transact(() => {
    fixture.nodes.forEach((node) => source.getMap<CardNode>('nodes').set(node.id, node));
    source.getArray<Edge>('edges').push(fixture.edges);
    source.getMap('meta').set('viewport', INITIAL_VIEWPORT);
  });
  const update = Y.encodeStateAsUpdate(source);
  source.destroy();
  return update;
}
