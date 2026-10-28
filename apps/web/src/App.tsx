import { lazy, Suspense } from 'react';

const CanvasPoc = lazy(() => import('./poc/CanvasPoc'));
const GatewayPoc = lazy(() => import('./poc/GatewayPoc'));
const AccountPage = lazy(() => import('./auth/AccountPage'));

export function App() {
  if (
    typeof window !== 'undefined' &&
    ['/login', '/auth/callback', '/account'].includes(window.location.pathname)
  ) {
    return (
      <Suspense fallback={<main>正在载入账号页面…</main>}>
        <AccountPage />
      </Suspense>
    );
  }
  if (typeof window !== 'undefined' && window.location.pathname === '/poc/gateway') {
    return (
      <Suspense fallback={<main>正在载入调试台…</main>}>
        <GatewayPoc />
      </Suspense>
    );
  }
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
      <p>
        <a href="/account">登录 / 我的账号 →</a>
      </p>
      <a href="/poc/canvas">打开画布性能验证 →</a>
      <p>
        <a href="/poc/gateway">打开模型任务调试台 →</a>
      </p>
    </main>
  );
}
