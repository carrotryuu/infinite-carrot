import type { Edge, Node } from '@xyflow/react';

export type CardData = {
  title: string;
  kind: 'video' | 'image' | 'text';
  sample: number;
  text: string;
};
export type CardNode = Node<CardData, 'card'>;
export const CARD_WIDTH = 216;
export const CARD_HEIGHT = 154;
export const INITIAL_VIEWPORT = { x: 48, y: 56, zoom: 0.72 };

export function createFixtures(): { nodes: CardNode[]; edges: Edge[] } {
  const nodes: CardNode[] = Array.from({ length: 150 }, (_, index) => {
    const kind = index < 100 ? 'video' : index < 130 ? 'image' : 'text';
    return {
      id: `node-${index}`,
      type: 'card',
      position: { x: (index % 10) * 260, y: Math.floor(index / 10) * 186 },
      style: { width: CARD_WIDTH, height: CARD_HEIGHT },
      data: {
        title: `${kind === 'video' ? '镜头' : kind === 'image' ? '参考图' : '剧本'} ${String(index + 1).padStart(3, '0')}`,
        kind,
        sample: (index % 5) + 1,
        text: '光线穿过走廊。人物停下脚步，回头望向远处。镜头缓慢推进。',
      },
    };
  });
  const edges = nodes.map((node, index) => ({
    id: `edge-${index}`,
    source: node.id,
    target: `node-${(index + 1) % nodes.length}`,
    type: 'straight',
  }));
  return { nodes, edges };
}
