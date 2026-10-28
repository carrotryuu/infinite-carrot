import { useEffect, useState } from 'react';
import { Permission, type OrganizationContext } from '@carrot/shared';
import { PermissionsContext, usePermission } from '../auth/usePermission';
import './workspace.css';

export async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch('/api/' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
  if (response.status === 401) {
    window.location.replace('/login');
    throw new Error('请重新登录');
  }
  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(typeof error.message === 'string' ? error.message : '操作未成功，请刷新后重试');
  }
  return response.json() as Promise<T>;
}
type Person = { id: string; name: string; status: 'active' | 'disabled' };
type Assignment = { teamId: string; projectId: string | null; roleId: string };
type Administration = {
  users: Person[];
  memberships: (Assignment & { userId: string })[];
  teams: { id: string; name: string }[];
  projects: { id: string; name: string; teamId: string }[];
  roles: { id: string; key: string; name: string }[];
  organizationScope: string;
};
export default function Workspace() {
  const [context, setContext] = useState<OrganizationContext>();
  const [error, setError] = useState('');
  const refresh = () =>
    api<OrganizationContext>('organization/context')
      .then(setContext)
      .catch((e: Error) => setError(e.message));
  useEffect(() => {
    void refresh();
    const focus = () => {
      void refresh();
    };
    window.addEventListener('focus', focus);
    return () => window.removeEventListener('focus', focus);
  }, []);
  return (
    <main className="workspace">
      {context ? (
        <PermissionsContext.Provider value={context}>
          <WorkspaceContent context={context} setContext={setContext} />
        </PermissionsContext.Provider>
      ) : (
        <p role="status">正在加载工作空间…</p>
      )}
      {error && <p role="alert">{error}</p>}
    </main>
  );
}
function WorkspaceContent({
  context,
  setContext,
}: {
  context: OrganizationContext;
  setContext: (c: OrganizationContext) => void;
}) {
  const canManage = usePermission(Permission.AccountManage);
  const canGlobal = usePermission(Permission.GlobalView);
  const [tab, setTab] = useState('projects');
  const [people, setPeople] = useState<Person[]>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function switchTeam(id: string) {
    setBusy(true);
    setError('');
    try {
      setContext(await api<OrganizationContext>('organization/current-team', { teamId: id }));
      setPeople(undefined);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <header className="workspace-header">
        <a href="/">无限画布</a>
        <div className="workspace-controls">
          {context.teams.length > 0 && (
            <label>
              当前组{' '}
              <select
                aria-label="当前组"
                value={context.currentTeamId || ''}
                disabled={busy}
                onChange={(event) => void switchTeam(event.target.value)}
              >
                {context.teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {context.user.avatarUrl ? (
            <img
              className="workspace-avatar"
              src={context.user.avatarUrl}
              alt=""
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className="workspace-avatar">{context.user.name.slice(0, 1)}</span>
          )}
          <span>{context.user.name}</span>
          <button
            onClick={() =>
              void api('auth/logout', {})
                .then(() => window.location.assign('/login'))
                .catch((e: Error) => setError(e.message))
            }
          >
            退出登录
          </button>
        </div>
      </header>
      <h1>工作空间</h1>
      <p className="workspace-muted">
        按当前组和项目查看权限。角色由 HRBP 分配，修改后刷新即可生效。
      </p>
      <nav aria-label="工作空间导航">
        <button aria-pressed={tab === 'projects'} onClick={() => setTab('projects')}>
          我的项目
        </button>
        {canManage && (
          <button aria-pressed={tab === 'accounts'} onClick={() => setTab('accounts')}>
            账号管理
          </button>
        )}
        {canGlobal && (
          <button
            aria-pressed={tab === 'people'}
            onClick={() => {
              setTab('people');
              void api<Person[]>('organization/people')
                .then(setPeople)
                .catch((e: Error) => setError(e.message));
            }}
          >
            全公司人员（只读）
          </button>
        )}
      </nav>
      {context.user.pendingAssignment && (
        <section className="workspace-panel">
          <h2>等待管理员分配</h2>
          <p>请联系 HRBP 分配组和角色。</p>
        </section>
      )}
      {tab === 'projects' && (
        <section className="project-grid">
          {context.projects.map((project) => (
            <ProjectCard
              key={context.currentTeamId + ':' + project.id}
              project={project}
              teamId={context.currentTeamId!}
            />
          ))}
          {!context.projects.length && !context.user.pendingAssignment && (
            <p>当前没有可访问的项目。</p>
          )}
        </section>
      )}
      {tab === 'accounts' && canManage && <AccountManagement actorId={context.user.id} />}
      {tab === 'people' && canGlobal && (
        <section className="workspace-panel">
          <h2>全公司人员</h2>
          <p>只读跨组查看，访问已记录审计。</p>
          {people && (
            <ul>
              {people.map((person) => (
                <li key={person.id}>
                  {person.name} · {person.status === 'active' ? '启用' : '停用'}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {error && (
        <p role="alert" className="workspace-error">
          {error}
        </p>
      )}
    </>
  );
}
function ProjectCard({
  project,
  teamId,
}: {
  project: OrganizationContext['projects'][number];
  teamId: string;
}) {
  const canMembers = usePermission(Permission.MemberManage, project.id);
  const canUse = usePermission(Permission.CanvasUse, project.id);
  const [members, setMembers] = useState<Person[]>();
  const [error, setError] = useState('');
  return (
    <article className="workspace-panel" aria-label={project.name}>
      <h2>{project.name}</h2>
      <p>{canUse ? '具备画布使用权限' : '画布只读或无使用权限'}</p>
      <p className="workspace-muted">正式画布将在后续任务接入。</p>
      {canMembers && (
        <button
          onClick={() =>
            void api<Person[]>('teams/' + teamId + '/projects/' + project.id + '/members')
              .then(setMembers)
              .catch((e: Error) => setError(e.message))
          }
        >
          查看项目成员
        </button>
      )}
      {members && (
        <ul>
          {members.map((member) => (
            <li key={member.id}>{member.name}</li>
          ))}
        </ul>
      )}
      {error && <p role="alert">{error}</p>}
    </article>
  );
}
function AccountManagement({ actorId }: { actorId: string }) {
  const [data, setData] = useState<Administration>();
  const [selected, setSelected] = useState('');
  const [rows, setRows] = useState<Assignment[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const refresh = () => api<Administration>('organization/administration').then(setData);
  useEffect(() => {
    void refresh().catch((e: Error) => setError(e.message));
  }, []);
  const choose = (id: string) => {
    setSelected(id);
    setNotice('');
    setError('');
    setRows(
      data!.memberships
        .filter((m) => m.userId === id)
        .map(({ teamId, projectId, roleId }) => ({ teamId, projectId, roleId })),
    );
  };
  async function mutate(path: string, body: unknown) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api(path, body);
      await refresh();
      setNotice('已保存，权限即时生效。');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return (
      <section className="workspace-panel">
        <p>{error || '正在读取账号…'}</p>
      </section>
    );
  const person = data.users.find((user) => user.id === selected);
  const update = (index: number, change: Partial<Assignment>) =>
    setRows(rows.map((row, i) => (i === index ? { ...row, ...change } : row)));
  return (
    <section className="workspace-panel">
      <h2>账号管理</h2>
      <p>
        按组分配默认角色，也可为单个项目设置覆盖角色。调组时移除原组配置并添加新组；保存会记录完整审计。
      </p>
      <label>
        选择账号{' '}
        <select
          aria-label="选择账号"
          value={selected}
          onChange={(e) => choose(e.target.value)}
          disabled={busy}
        >
          <option value="">请选择</option>
          {data.users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name} · {user.status === 'active' ? '启用' : '停用'}
            </option>
          ))}
        </select>
      </label>
      {person && (
        <>
          <h3>{person.name}</h3>
          {person.id === actorId ? (
            <p>不能修改自己的账号，请由另一位 HRBP 操作。</p>
          ) : (
            <>
              <div className="membership-rows">
                {rows.map((row, index) => (
                  <fieldset key={index}>
                    <legend>角色配置 {index + 1}</legend>
                    <label>
                      范围{' '}
                      <select
                        aria-label={'范围 ' + (index + 1)}
                        value={row.teamId}
                        disabled={busy}
                        onChange={(e) => {
                          const org = e.target.value === data.organizationScope;
                          update(index, {
                            teamId: e.target.value,
                            projectId: null,
                            roleId: org
                              ? data.roles.find((r) => r.key === 'owner')!.id
                              : data.roles.find((r) => r.key === 'animator')!.id,
                          });
                        }}
                      >
                        <option value={data.organizationScope}>组织权限（老板 / HRBP）</option>
                        {data.teams.map((team) => (
                          <option key={team.id} value={team.id}>
                            {team.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    {row.teamId !== data.organizationScope && (
                      <label>
                        项目{' '}
                        <select
                          aria-label={'项目 ' + (index + 1)}
                          value={row.projectId || ''}
                          disabled={busy}
                          onChange={(e) => update(index, { projectId: e.target.value || null })}
                        >
                          <option value="">组内默认角色</option>
                          {data.projects
                            .filter((p) => p.teamId === row.teamId)
                            .map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                        </select>
                      </label>
                    )}
                    <label>
                      角色{' '}
                      <select
                        aria-label={'角色 ' + (index + 1)}
                        value={row.roleId}
                        disabled={busy}
                        onChange={(e) => update(index, { roleId: e.target.value })}
                      >
                        {data.roles
                          .filter(
                            (r) =>
                              row.teamId !== data.organizationScope ||
                              ['owner', 'hrbp'].includes(r.key),
                          )
                          .map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <button
                      disabled={busy}
                      onClick={() => setRows(rows.filter((_, i) => i !== index))}
                    >
                      移除配置 {index + 1}
                    </button>
                  </fieldset>
                ))}
              </div>
              <div className="workspace-actions">
                <button
                  disabled={busy || !data.teams.length}
                  onClick={() =>
                    setRows([
                      ...rows,
                      {
                        teamId: data.teams[0]!.id,
                        projectId: null,
                        roleId: data.roles.find((r) => r.key === 'animator')!.id,
                      },
                    ])
                  }
                >
                  添加角色配置
                </button>
                <button
                  className="workspace-primary"
                  disabled={busy}
                  onClick={() =>
                    void mutate('organization/users/' + selected + '/memberships', {
                      memberships: rows,
                    })
                  }
                >
                  保存组和角色
                </button>
                <button
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        '确认' +
                          (person.status === 'active' ? '停用' : '启用') +
                          ' ' +
                          person.name +
                          '？',
                      )
                    )
                      void mutate('organization/users/' + selected + '/status', {
                        status: person.status === 'active' ? 'disabled' : 'active',
                      });
                  }}
                >
                  {person.status === 'active' ? '停用账号' : '启用账号'}
                </button>
              </div>
            </>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="workspace-error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
