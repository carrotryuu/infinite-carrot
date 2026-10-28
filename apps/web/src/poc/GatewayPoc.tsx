import { useCallback, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { Permission, terminalStatuses, type TaskView } from '@carrot/shared';
import { usePocPermission } from '../auth/usePermission';
import './gateway.css';

const statusNames = {
  queued: '排队中',
  running: '生成中',
  succeeded: '已完成',
  failed: '失败',
  canceled: '已取消',
};
type Configuration = {
  mode: string;
  provider: string;
  concurrency: number;
  permissions: Permission[];
};
export default function GatewayPoc() {
  const [config, setConfig] = useState<Configuration | null>(null);
  const [tasks, setTasks] = useState<TaskView[]>([]);
  const [prompt, setPrompt] = useState('清晨的树林，镜头缓慢向前移动');
  const [key, setKey] = useState<string>(() => crypto.randomUUID());
  const [token, setToken] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [connected, setConnected] = useState(false);
  const [updates, setUpdates] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const canSubmit = usePocPermission(config?.permissions ?? [], Permission.CanvasUse);
  const request = useCallback(
    async (path: string, body?: object) => {
      const response = await fetch(`/api/poc/gateway/${path}`, {
        method: body ? 'POST' : 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { 'x-poc-access-token': accessToken } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({ message: '请求失败' }));
        throw new Error(
          typeof detail.message === 'string' ? detail.message : `请求失败 (${response.status})`,
        );
      }
      return response.json();
    },
    [accessToken],
  );
  const merge = useCallback(
    (incoming: TaskView[]) =>
      setTasks((current) => {
        const map = new Map(current.map((task) => [task.id, task]));
        for (const task of incoming)
          if (!map.has(task.id) || map.get(task.id)!.version <= task.version)
            map.set(task.id, task);
        return [...map.values()]
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, 200);
      }),
    [],
  );
  useEffect(() => {
    let disposed = false;
    const socket = io({
      path: '/api/poc/gateway/socket.io',
      auth: { token: accessToken },
      transports: ['websocket'],
      autoConnect: false,
    });
    const refresh = async () => {
      try {
        const incoming = await request('tasks');
        if (!disposed) merge(incoming);
      } catch (reason) {
        if (!disposed) setError((reason as Error).message);
      }
    };
    void request('config')
      .then((value) => {
        if (!disposed) {
          setConfig(value);
          setError('');
          socket.connect();
          void refresh();
        }
      })
      .catch((reason) => {
        if (!disposed) {
          setConfig(null);
          setError((reason as Error).message);
        }
      });
    socket.on('connect', () => {
      setConnected(true);
      void refresh();
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', () => setConnected(false));
    socket.on('tasks:snapshot', (snapshot: TaskView[]) => merge(snapshot));
    socket.on('task:updated', (task: TaskView) => {
      merge([task]);
      setUpdates((count) => count + 1);
    });
    socket.on('tasks:resync-required', () => void refresh());
    const timer = setInterval(() => {
      if (socket.connected) void refresh();
    }, 5000);
    return () => {
      disposed = true;
      clearInterval(timer);
      socket.disconnect();
    };
  }, [request, merge, accessToken]);
  const submit = async (count: number) => {
    setBusy(true);
    setError('');
    try {
      const results = await Promise.allSettled(
        Array.from({ length: count }, (_, index) =>
          request('tasks', {
            prompt: count === 1 ? prompt : `${prompt} · ${index + 1}`,
            idempotencyKey: count === 1 ? key : `${key}_${index + 1}`,
          }).then((task: TaskView) => merge([task])),
        ),
      );
      const failed = results.find((result) => result.status === 'rejected');
      if (failed?.status === 'rejected') setError((failed.reason as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const cancel = async (id: string) => {
    try {
      merge([await request(`tasks/${id}/cancel`, {})]);
    } catch (reason) {
      setError((reason as Error).message);
    }
  };
  return (
    <main className="gateway-page">
      <header>
        <a href="/">← 工作台</a>
        <span>T02 · 异步生成实验</span>
        <h1>模型任务调试台</h1>
        <p>提交、排队、生成与回填。任务在后台继续，刷新页面可恢复状态。</p>
      </header>
      <section className="gateway-overview">
        <strong>{config?.mode === 'real' ? '真实联调' : 'Mock 模式'}</strong>
        <span>
          供应商 {config?.provider ?? '—'} · 全局并发 {config?.concurrency ?? '—'}
        </span>
        <span data-testid="socket-status">{connected ? '实时连接正常' : '实时连接未就绪'}</span>
        <span>
          已接收 <b data-testid="socket-updates">{updates}</b> 次更新
        </span>
      </section>
      <section className="gateway-form" aria-label="提交测试任务">
        <label>
          测试提示词
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            maxLength={2000}
          />
        </label>
        <label>
          幂等键（重复提交使用相同键）
          <input value={key} onChange={(event) => setKey(event.target.value)} />
        </label>
        <div className="gateway-actions">
          <button onClick={() => setKey(crypto.randomUUID())}>新建幂等键</button>
          {canSubmit && (
            <>
              <button disabled={busy} onClick={() => void submit(1)}>
                提交 1 个任务
              </button>
              <button className="primary" disabled={busy} onClick={() => void submit(20)}>
                提交 20 个测试任务
              </button>
            </>
          )}
        </div>
        <details>
          <summary>真实联调访问令牌</summary>
          <p>仅在已获授权的真实联调环境填写调试访问令牌，不要填写模型 API 密钥。</p>
          <input
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            aria-label="调试访问令牌"
          />
          <button onClick={() => setAccessToken(token)}>连接</button>
        </details>
        {error && (
          <p className="gateway-error" role="alert">
            {error}
          </p>
        )}
      </section>
      <section className="gateway-list">
        <h2>
          任务记录{' '}
          <small>
            {tasks.length} 条 ·{' '}
            {tasks.filter((task) => terminalStatuses.includes(task.status)).length} 条终态
          </small>
        </h2>
        <div className="gateway-table-wrap">
          <table>
            <thead>
              <tr>
                <th>任务 / 提示词</th>
                <th>幂等键</th>
                <th>状态</th>
                <th>进度</th>
                <th>更新时间</th>
                <th>结果 / 操作</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr key={task.id} data-task-id={task.id} data-status={task.status}>
                  <td>
                    <code>{task.id.slice(0, 8)}</code>
                    <p>{task.prompt}</p>
                  </td>
                  <td>
                    <code>{task.idempotencyKey}</code>
                  </td>
                  <td>
                    <span className={`task-status ${task.status}`}>{statusNames[task.status]}</span>
                    {task.cancelRequested && <small>取消请求处理中</small>}
                  </td>
                  <td>
                    <progress value={task.progress} max={100} />
                    {task.progress}%
                  </td>
                  <td>
                    {new Intl.DateTimeFormat('zh-CN', {
                      timeZone: 'Asia/Shanghai',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    }).format(new Date(task.updatedAt))}
                  </td>
                  <td>
                    {task.resultUrl && (
                      <a href={task.resultUrl} target="_blank" rel="noreferrer">
                        打开视频 ↗
                      </a>
                    )}
                    {canSubmit && !terminalStatuses.includes(task.status) && (
                      <button disabled={task.cancelRequested} onClick={() => void cancel(task.id)}>
                        取消
                      </button>
                    )}
                    {task.errorCode && <small className="gateway-error">{task.errorCode}</small>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {tasks.length === 0 && (
            <p className="gateway-empty">尚无任务。提交测试任务后，在这里观察每一行的状态变化。</p>
          )}
        </div>
      </section>
      <footer>
        PoC 调试页面 · 最近 200 条 · 无积分和文件落盘 · Mock 使用固定测试组，正式身份和角色由
        T03/T04 接入
      </footer>
    </main>
  );
}
