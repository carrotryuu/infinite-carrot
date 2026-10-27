import { memo, useEffect, useState, useSyncExternalStore } from 'react';
import { Handle, Position, useStore, type NodeProps } from '@xyflow/react';
import type { CardNode } from './fixtures';
import { videoSlots } from './video-slots';

export const Card = memo(function Card({ id, data, selected }: NodeProps<CardNode>) {
  const simple = useStore((state) => state.transform[2] < 0.4);
  const [hovered, setHovered] = useState(false);
  const active = useSyncExternalStore(videoSlots.subscribe, () => videoSlots.has(id));
  const eligible = !simple && data.kind === 'video' && (hovered || selected);
  useEffect(() => (eligible ? videoSlots.request(id) : undefined), [eligible, id]);
  return (
    <article
      className={`poc-card ${data.kind} ${simple ? 'simple' : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Handle type="target" position={Position.Left} />
      <header>
        <span className="kind-mark">
          {data.kind === 'video' ? '▶' : data.kind === 'image' ? '▧' : 'T'}
        </span>
        <strong>{data.title}</strong>
        <span className="sample-tag">
          {data.kind === 'video' ? '720P' : data.kind === 'image' ? '参考' : '文本'}
        </span>
      </header>
      {!simple &&
        (data.kind === 'text' ? (
          <p className="card-copy">{data.text}</p>
        ) : (
          <div className="card-media">
            {eligible && active ? (
              <video
                className="nodrag"
                src={`/poc-media/sample-${data.sample}.mp4`}
                poster={`/poc-media/sample-${data.sample}.jpg`}
                muted
                autoPlay
                loop
                playsInline
                preload="metadata"
                onError={(event) => event.currentTarget.setAttribute('data-failed', 'true')}
              />
            ) : (
              <img
                src={`/poc-media/sample-${data.sample}.jpg`}
                alt={`${data.title}封面`}
                draggable={false}
              />
            )}
            <span className="media-state">
              {data.kind === 'image'
                ? '样片封面'
                : eligible && active
                  ? '正在预览 · 03s'
                  : eligible
                    ? '等待预览名额'
                    : '悬停预览 · 03s'}
            </span>
          </div>
        ))}
      <Handle type="source" position={Position.Right} />
    </article>
  );
});
