import { lazy, Suspense } from 'react';

const CanvasPoc = lazy(() => import('./poc/CanvasPoc'));

export function App() {
  if (typeof window !== 'undefined' && window.location.pathname === '/poc/canvas') {
    return (
      <Suspense fallback={<main>正在载入画布…</main>}>
        <CanvasPoc />
      </Suspense>
    );
  }
  return (
    <main aria-label="AI 视频无限画布">
      <h1>AI 视频无限画布</h1>
      <p>站点已启动。画布功能正在建设中。</p>
      <a href="/poc/canvas">打开画布性能验证 →</a>
    </main>
  );
}
