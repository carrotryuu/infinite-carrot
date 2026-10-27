import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  useNodesInitialized,
  useReactFlow,
  type Viewport,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './poc.css';
import { PocDocument, createFixtureUpdate } from '../canvas/commands/poc-document';
import { Card } from './Card';
import { INITIAL_VIEWPORT, type CardNode } from './fixtures';
import { Metrics, type Operation } from './metrics';
import { videoSlots } from './video-slots';

const nodeTypes = { card: Card };
// Fixture generation precedes the timed Yjs decode; the route starts a fresh in-memory document.
const documentStore = new PocDocument(createFixtureUpdate());
const metrics = new Metrics(documentStore.decodeMs);
const operationLabels: Record<Operation, string> = {
  pan: '平移',
  zoom: '缩放',
  'selection-drag': '框选拖动',
};

function FirstPaint() {
  const initialized = useNodesInitialized();
  useEffect(() => {
    if (!initialized) return;
    let cancelled = false;
    void Promise.all(
      [...document.querySelectorAll<HTMLImageElement>('.poc-stage img')].map((image) =>
        image.decode().catch(() => undefined),
      ),
    ).then(() => {
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (!cancelled) metrics.firstPaint(performance.now() - documentStore.loadStarted);
        }),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [initialized]);
  return null;
}

function MetricsPanel() {
  const report = useSyncExternalStore(metrics.subscribe, metrics.getSnapshot);
  const active = useSyncExternalStore(videoSlots.subscribe, videoSlots.size);
  useEffect(() => metrics.attach(), []);
  const exportReport = () => {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            ...report,
            userAgent: navigator.userAgent,
            viewport: { width: innerWidth, height: innerHeight },
            devicePixelRatio,
            nodeCount: 150,
            edgeCount: 150,
            exportedAt: new Date().toISOString(),
          },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'canvas-poc-report.json';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <aside className="poc-metrics" aria-label="性能记录" data-report={JSON.stringify(report)}>
      <div className="panel-heading">
        <span>性能观察</span>
        <span className="live-dot">LIVE</span>
      </div>
      <div className="fps-number">
        {report.liveFps.toFixed(0)}
        <small> FPS</small>
      </div>
      <dl>
        <div>
          <dt>Yjs → 首屏</dt>
          <dd data-testid="first-paint">
            {report.firstPaintMs === null ? '加载中' : `${report.firstPaintMs.toFixed(0)} ms`}
          </dd>
        </div>
        <div>
          <dt>文档解码</dt>
          <dd>{report.decodeMs.toFixed(1)} ms</dd>
        </div>
        <div>
          <dt>JS 堆内存</dt>
          <dd>
            {report.heapBytes === null
              ? '浏览器未提供'
              : `${(report.heapBytes / 1024 ** 2).toFixed(1)} MB`}
          </dd>
        </div>
        <div>
          <dt>视频名额</dt>
          <dd data-testid="video-count">{active} / 4</dd>
        </div>
      </dl>
      <h2>记录一次操作</h2>
      <p>选择操作后，连续操作至少 3 秒，再停止。切出页面的记录无效。</p>
      <div className="record-buttons">
        {(Object.keys(operationLabels) as Operation[]).map((operation) => (
          <button
            key={operation}
            disabled={report.recording !== null}
            onClick={() => metrics.start(operation)}
          >
            记录{operationLabels[operation]}
          </button>
        ))}
      </div>
      <button className="stop-record" disabled={!report.recording} onClick={metrics.stop}>
        {report.recording ? `停止${operationLabels[report.recording]}记录` : '尚未记录'}
      </button>
      <div className="record-list">
        {report.recordings.map((record, index) => (
          <div className="record" key={index}>
            <strong>
              {operationLabels[record.operation]} {record.valid ? '' : '（无效）'}
            </strong>
            <span>
              平均 {record.averageFps.toFixed(1)} / 最低 {record.minimumWindowFps.toFixed(1)}
            </span>
            <small>
              最慢帧 {record.worstFrameMs.toFixed(1)} ms · {(record.durationMs / 1000).toFixed(1)}{' '}
              秒
            </small>
          </div>
        ))}
      </div>
      <button className="export-report" onClick={exportReport}>
        导出记录 JSON ↗
      </button>
      <p className="metric-note">
        最低 FPS 为完整 1 秒窗口最低值。内存仅为 JS 堆，不含 GPU 与视频解码。
      </p>
    </aside>
  );
}

function Canvas() {
  const nodes = useSyncExternalStore(documentStore.subscribe, documentStore.getSnapshot);
  const flow = useReactFlow<CardNode>();
  const stage = useRef<HTMLDivElement>(null);
  const onMove = useCallback(
    (_event: MouseEvent | TouchEvent | null, viewport: Viewport) =>
      documentStore.setViewport(viewport),
    [],
  );
  const reset = () => {
    documentStore.reset();
    void flow.setViewport(INITIAL_VIEWPORT);
  };
  const selected = nodes.filter((node) => node.selected).length;
  return (
    <main className="poc-shell" aria-label="画布性能验证">
      <header className="poc-topbar">
        <a href="/" className="poc-brand">
          <span>∞</span> 无限画布
        </a>
        <div className="poc-title">
          <span>工作台 / 技术验证</span>
          <h1>一集的规模，一张画布</h1>
        </div>
        <span className="poc-badge">T01 · 性能实验</span>
        <button onClick={reset}>重置画布</button>
      </header>
      <div className="poc-toolbar">
        <div>
          <strong>150</strong> 个节点 <i />
          100 视频 · 30 图片 · 20 文本 <i />
          150 条连线
        </div>
        <span data-testid="selection-count">已选 {selected} 个</span>
        <button onClick={() => void flow.fitView({ padding: 0.08 })}>查看全局</button>
        <button onClick={() => void flow.setViewport(INITIAL_VIEWPORT)}>回到起点</button>
      </div>
      <div className="poc-workspace">
        <div className="poc-stage" ref={stage}>
          <ReactFlow<CardNode>
            nodes={nodes}
            edges={documentStore.edges}
            nodeTypes={nodeTypes}
            onNodesChange={documentStore.applyChanges}
            onMove={onMove}
            defaultViewport={documentStore.getViewport()}
            onlyRenderVisibleElements
            minZoom={0.15}
            maxZoom={1.5}
            selectionOnDrag
            multiSelectionKeyCode="Shift"
            selectionMode={SelectionMode.Full}
            panOnDrag={[1, 2]}
            panActivationKeyCode="Space"
            deleteKeyCode={null}
            nodesConnectable={false}
            edgesFocusable={false}
          >
            <Background gap={24} size={1} color="#cbd4d2" />
            <MiniMap
              pannable
              zoomable
              nodeColor={(node) =>
                node.data.kind === 'video'
                  ? '#467a6b'
                  : node.data.kind === 'image'
                    ? '#b19a67'
                    : '#9aa5ac'
              }
            />
            <Controls showInteractive={false} />
            <FirstPaint />
          </ReactFlow>
          <div className="canvas-caption">本地合成样片 · 不连接模型服务</div>
        </div>
        <MetricsPanel />
      </div>
      <footer className="poc-footer">
        <span>
          <kbd>空格</kbd> + 拖动平移 · 滚轮缩放 · 空白处拖动框选 · 悬停视频预览
        </span>
        <span>缩放 &lt; 40% 时简化卡片 · 刷新后重置</span>
      </footer>
    </main>
  );
}

export default function CanvasPoc() {
  return (
    <ReactFlowProvider>
      <Canvas />
    </ReactFlowProvider>
  );
}
