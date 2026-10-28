-- Reserved company team; its projects require explicit project membership.
INSERT INTO teams (id, team_id, tenant_id, name)
VALUES ('10000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', NULL, '公司组')
ON CONFLICT (id) DO NOTHING;

INSERT INTO permissions (id, team_id, tenant_id, point) VALUES
('30000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003', NULL, 'team.create'),
('30000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003', NULL, 'project.create')
ON CONFLICT (point) DO NOTHING;

-- Update existing deployments as well as fresh seeds.
INSERT INTO role_permissions (id, team_id, tenant_id, role_id, permission_id)
SELECT md5(r.id::text || p.id::text)::uuid, r.team_id, r.tenant_id, r.id, p.id
FROM roles r JOIN permissions p ON
  (r.key = 'hrbp' AND p.point = 'team.create') OR
  (r.key IN ('director', 'producer') AND p.point = 'project.create')
WHERE r.team_id = '00000000-0000-4000-8000-000000000003' AND r.tenant_id IS NULL
ON CONFLICT (role_id, permission_id) DO NOTHING;
