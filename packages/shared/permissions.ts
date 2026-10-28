export enum Permission {
  AccountManage = 'account.manage',
  CanvasView = 'canvas.view',
  CanvasUse = 'canvas.use',
  ReviewDecide = 'review.decide',
  SkillPublish = 'skill.publish',
  TemplatePublish = 'template.publish',
  CreditAllocate = 'credit.allocate',
  ModelConfigure = 'model.configure',
  MemberManage = 'member.manage',
  GlobalView = 'global.view',
}

export const roleDefinitions = [
  {
    key: 'director',
    name: '导演',
    permissions: [
      Permission.CanvasView,
      Permission.CanvasUse,
      Permission.ReviewDecide,
      Permission.SkillPublish,
      Permission.TemplatePublish,
      Permission.CreditAllocate,
      Permission.MemberManage,
    ],
  },
  {
    key: 'executive',
    name: '执行导演',
    permissions: [Permission.CanvasView, Permission.CanvasUse, Permission.ReviewDecide],
  },
  { key: 'animator', name: '动画师', permissions: [Permission.CanvasView, Permission.CanvasUse] },
  { key: 'editor', name: '剪辑', permissions: [Permission.CanvasView] },
  {
    key: 'producer',
    name: '制片',
    permissions: [
      Permission.CanvasView,
      Permission.CanvasUse,
      Permission.ReviewDecide,
      Permission.SkillPublish,
      Permission.TemplatePublish,
      Permission.CreditAllocate,
      Permission.ModelConfigure,
      Permission.MemberManage,
    ],
  },
  { key: 'owner', name: '老板', permissions: [Permission.CanvasView, Permission.GlobalView] },
  {
    key: 'hrbp',
    name: 'HRBP',
    permissions: [
      Permission.CreditAllocate,
      Permission.MemberManage,
      Permission.AccountManage,
      Permission.GlobalView,
    ],
  },
] as const;
export type RoleKey = (typeof roleDefinitions)[number]['key'];
export interface OrganizationContext {
  user: { id: string; name: string; avatarUrl: string | null; pendingAssignment: boolean };
  teams: { id: string; name: string }[];
  currentTeamId: string | null;
  permissions: Permission[];
  organizationPermissions: Permission[];
  projects: { id: string; name: string; permissions: Permission[] }[];
}
