import { useEffect, useState } from 'react';
import './account.css';

type Account = { id: string; name: string; avatarUrl: string | null; pendingAssignment: boolean };
type Config = { mode: 'mock' | 'feishu'; people: { id: string; name: string }[] };
export default function AccountPage() {
  const login = window.location.pathname === '/login';
  const [config, setConfig] = useState<Config>();
  const [account, setAccount] = useState<Account>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(
    new URLSearchParams(window.location.search).has('error')
      ? '登录未完成，请重试；如账号已停用，请联系 HRBP。'
      : '',
  );
  async function load() {
    const response = await fetch('/api/auth/me', { cache: 'no-store' });
    if (response.status === 401) {
      window.location.replace('/login');
      return;
    }
    if (!response.ok) throw new Error('暂时无法读取账号，请稍后重试。');
    const profile = (await response.json()) as Account;
    if (!profile.pendingAssignment) {
      window.location.replace('/workspace');
      return;
    }
    setAccount(profile);
  }
  useEffect(() => {
    if (login) {
      void fetch('/api/auth/config')
        .then(async (response) => {
          if (!response.ok) throw new Error();
          setConfig((await response.json()) as Config);
        })
        .catch(() => setError('登录服务暂不可用，请刷新重试。'));
    } else {
      void load().catch(() => setError('暂时无法读取账号，请刷新重试。'));
      const refresh = () => {
        if (document.visibilityState === 'visible') void load().catch(() => undefined);
      };
      document.addEventListener('visibilitychange', refresh);
      return () => document.removeEventListener('visibilitychange', refresh);
    }
  }, [login]);
  async function choose(id: string) {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/auth/mock/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!response.ok) throw new Error('登录失败，账号可能已停用。请联系 HRBP。');
      window.location.assign('/auth/callback');
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) throw new Error();
      window.location.replace('/login');
    } catch {
      setError('退出失败，请重试。');
      setBusy(false);
    }
  }
  return (
    <main className="account-page">
      <header className="account-header">
        <a href="/">无限画布</a>
        {account && (
          <div className="account-person">
            {account.avatarUrl ? (
              <img src={account.avatarUrl} alt="" referrerPolicy="no-referrer" />
            ) : (
              <span className="account-avatar" aria-label="账号头像">
                {account.name.slice(0, 1)}
              </span>
            )}
            <span>{account.name}</span>
            <button onClick={() => void logout()} disabled={busy}>
              退出登录
            </button>
          </div>
        )}
      </header>
      <section className="account-card">
        {login ? (
          <>
            <p className="account-eyebrow">团队创作工作台</p>
            <h1>登录无限画布</h1>
            <p>使用公司飞书账号登录。首次登录后，由 HRBP 分配组和角色。</p>
            {!config && !error && <p role="status">正在连接登录服务…</p>}
            {config?.mode === 'feishu' && (
              <a className="account-primary" href="/api/auth/feishu/start">
                使用飞书登录
              </a>
            )}
            {config?.mode === 'mock' && (
              <>
                <p className="account-notice">
                  当前为测试环境，请选择一个演示账号。实际权限以管理员分配为准，不能由账号名称推断。
                </p>
                <div className="account-choices">
                  {config.people.map((person) => (
                    <button key={person.id} disabled={busy} onClick={() => void choose(person.id)}>
                      {person.name}
                    </button>
                  ))}
                </div>
              </>
            )}
          </>
        ) : account ? (
          <>
            <p className="account-eyebrow">账号已登录</p>
            <h1>{account.pendingAssignment ? '等待管理员分配' : '欢迎回来'}</h1>
            <p>
              {account.pendingAssignment
                ? '请联系 HRBP 分配组和角色。分配完成后即可进入对应工作空间。'
                : '你的账号已就绪。'}
            </p>
            <button
              disabled={busy}
              onClick={() => {
                setError('');
                void load().catch(() => setError('暂时无法刷新，请重试。'));
              }}
            >
              刷新账号状态
            </button>
          </>
        ) : (
          <p role="status">正在确认登录状态…</p>
        )}
        {error && (
          <p className="account-error" role="alert">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
