const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadConfig } = require('../../../dist/scripts/repo-configure/src/config.js');
const { validateRepositoryIdentity, GitHubError } = require('../../../dist/scripts/repo-configure/src/github.js');
const { buildPlan } = require('../../../dist/scripts/repo-configure/src/plan.js');
const { parseArgs, run } = require('../../../dist/scripts/repo-configure/src/main.js');

const root = path.resolve(__dirname, '../../..');
const desired = loadConfig(root);
const clone = (value) => JSON.parse(JSON.stringify(value));

function fixture(overrides = {}) {
  const state = {
    repository: {
      full_name: 'team/project',
      permissions: { admin: true },
      is_template: false,
      visibility: 'public',
      default_branch: 'main',
      ...clone(desired.repository),
      ...overrides.repository,
    },
    actions: { ...clone(desired.actions), ...overrides.actions },
    forks: { ...clone(desired.privateForks), ...overrides.forks },
    rulesets: overrides.rulesets ?? [clone(desired.mainRuleset), clone(desired.releaseTagsRuleset)],
    checkRuns: overrides.checkRuns ?? [{ conclusion: 'success' }],
    failAt: overrides.failAt,
    authFails: overrides.authFails,
    unsupported: overrides.unsupported,
  };
  const calls = [];
  const client = {
    authenticate() { if (state.authFails) throw new Error('GitHub authentication failed'); },
    discoverRepository() { return 'team/project'; },
    request(method, endpoint, body) {
      calls.push({ method, endpoint, body });
      if (state.failAt === `${method} ${endpoint}`) throw new GitHubError('API denied', 403);
      if (state.unsupported === endpoint) throw new GitHubError('Unsupported', 404);
      if (endpoint === 'repos/team/project' && method === 'GET') return clone(state.repository);
      if (endpoint === 'repos/team/project' && method === 'PATCH') return Object.assign(state.repository, body);
      if (endpoint.endsWith('/actions/permissions/workflow')) {
        if (method === 'GET') return clone(state.actions);
        state.actions = clone(body); return null;
      }
      if (endpoint.endsWith('/actions/permissions/fork-pr-workflows-private-repos')) {
        if (method === 'GET') return clone(state.forks);
        state.forks = clone(body); return null;
      }
      if (endpoint.includes('/check-runs')) return { check_runs: state.checkRuns };
      if (endpoint.includes('/rulesets?')) return state.rulesets.map((item, index) => ({ id: index + 1, name: item.name, target: item.target }));
      if (endpoint.endsWith('/rulesets') && method === 'POST') { state.rulesets.push(clone(body)); return null; }
      const id = /\/rulesets\/(\d+)$/.exec(endpoint)?.[1];
      if (id) {
        if (method === 'GET') return clone(state.rulesets[Number(id) - 1]);
        state.rulesets[Number(id) - 1] = clone(body); return null;
      }
      throw new Error(`Unexpected mock API request: ${method} ${endpoint}`);
    },
  };
  return { client, calls, state };
}

function output(approval = false) {
  const text = [];
  const errors = [];
  let prompts = 0;
  return {
    text,
    errors,
    get prompts() { return prompts; },
    write(value) { text.push(value); },
    error(value) { errors.push(value); },
    async confirm() { prompts += 1; return approval; },
  };
}

describe('configuration loading and identity', () => {
  test('loads validated desired files and release-safe tag rules', () => {
    expect(desired.mainRuleset.rules.find((rule) => rule.type === 'required_status_checks').parameters.required_status_checks).toContainEqual({ context: 'acceptance' });
    expect(desired.releaseTagsRuleset.rules.map((rule) => rule.type)).toEqual(['deletion', 'non_fast_forward']);
    expect(desired.releaseTagsRuleset.bypass_actors).toEqual([]);
  });

  test('rejects invalid schema and incompatible release workflow', () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-config-test-'));
    try {
      fs.mkdirSync(path.join(temp, '.github/repository-config'), { recursive: true });
      fs.mkdirSync(path.join(temp, '.github/workflows'), { recursive: true });
      fs.copyFileSync(path.join(root, '.git-rulesets.json'), path.join(temp, '.git-rulesets.json'));
      fs.copyFileSync(path.join(root, '.github/repository-config/release-tags-ruleset.json'), path.join(temp, '.github/repository-config/release-tags-ruleset.json'));
      fs.writeFileSync(path.join(temp, '.github/repository-config/repository.json'), JSON.stringify({ repository: { ...desired.repository, allow_squash_merge: 'yes' }, actions: desired.actions, privateForks: desired.privateForks }));
      expect(() => loadConfig(temp)).toThrow(/allow_squash_merge/);
      fs.copyFileSync(path.join(root, '.github/repository-config/repository.json'), path.join(temp, '.github/repository-config/repository.json'));
      fs.copyFileSync(path.join(root, '.github/workflows/ci.yml'), path.join(temp, '.github/workflows/ci.yml'));
      fs.writeFileSync(path.join(temp, '.github/workflows/release.yml'), 'unsafe release');
      fs.copyFileSync(path.join(root, '.github/workflows/release-candidate.yml'), path.join(temp, '.github/workflows/release-candidate.yml'));
      expect(() => loadConfig(temp)).toThrow(/release.yml/);
    } finally { fs.rmSync(temp, { recursive: true, force: true }); }
  });

  test('rejects unsafe ruleset targets and missing protections', () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-rules-test-'));
    try {
      fs.mkdirSync(path.join(temp, '.github/repository-config'), { recursive: true });
      fs.mkdirSync(path.join(temp, '.github/workflows'), { recursive: true });
      fs.copyFileSync(path.join(root, '.github/repository-config/repository.json'), path.join(temp, '.github/repository-config/repository.json'));
      fs.copyFileSync(path.join(root, '.github/workflows/ci.yml'), path.join(temp, '.github/workflows/ci.yml'));
      for (const name of ['release.yml', 'release-candidate.yml']) fs.copyFileSync(path.join(root, '.github/workflows', name), path.join(temp, '.github/workflows', name));
      const mainPath = path.join(temp, '.git-rulesets.json');
      const tagPath = path.join(temp, '.github/repository-config/release-tags-ruleset.json');
      const save = (main, tags) => { fs.writeFileSync(mainPath, JSON.stringify(main)); fs.writeFileSync(tagPath, JSON.stringify(tags)); };
      const main = clone(desired.mainRuleset); const tags = clone(desired.releaseTagsRuleset);
      main.conditions.ref_name.include = ['refs/heads/other']; save(main, tags);
      expect(() => loadConfig(temp)).toThrow(/main/);
      main.conditions.ref_name.include = ['refs/heads/main']; tags.conditions.ref_name.include = ['refs/tags/other']; save(main, tags);
      expect(() => loadConfig(temp)).toThrow(/Release tag/);
      tags.conditions.ref_name.include = ['refs/tags/v*']; tags.rules.pop(); save(main, tags);
      expect(() => loadConfig(temp)).toThrow(/non_fast_forward/);
      tags.rules.push({ type: 'non_fast_forward' }); tags.rules.push({ type: 'unknown_rule' }); save(main, tags);
      expect(() => loadConfig(temp)).toThrow(/Unsupported release tag rule/);
    } finally { fs.rmSync(temp, { recursive: true, force: true }); }
  });

  test('validates exact repository identity and CLI flags', () => {
    expect(validateRepositoryIdentity('team/project')).toBe('team/project');
    expect(() => validateRepositoryIdentity('team/project/other')).toThrow();
    expect(() => parseArgs(['--apply', '--yes'])).toThrow(/--yes/);
    expect(() => parseArgs(['--json', '--apply'])).toThrow(/--json/);
    expect(() => parseArgs(['--dry-run', '--check'])).toThrow();
    expect(() => parseArgs(['--bogus'])).toThrow(/Unknown option/);
    expect(parseArgs(['--apply', '--yes', '--repo', 'team/project']).repository).toBe('team/project');
  });
});

describe('plan and idempotency', () => {
  test('compliant repository has no plan and never mutates', async () => {
    const mock = fixture(); const out = output();
    expect(buildPlan(mock.client, 'team/project', desired).changes).toEqual([]);
    expect(await run(['--apply', '--repo', 'team/project'], mock.client, out, root)).toBe(0);
    expect(mock.calls.filter((call) => call.method !== 'GET')).toEqual([]);
    expect(out.prompts).toBe(0);
  });

  test('detects repository and Actions drift without visibility changes', () => {
    const mock = fixture({ repository: { allow_merge_commit: true }, actions: { default_workflow_permissions: 'write' } });
    const changes = buildPlan(mock.client, 'team/project', desired).changes;
    expect(changes.map((change) => change.kind)).toEqual(['repository', 'actions']);
    expect(changes[0].after).toEqual({ allow_merge_commit: false });
    expect(JSON.stringify(changes)).not.toContain('visibility');
  });

  test('normalizes rule ordering and irrelevant API fields', () => {
    const main = clone(desired.mainRuleset);
    main.rules.reverse();
    main.rules.find((rule) => rule.type === 'required_status_checks').parameters.require_extra_approval_for_unattributed_changes = true;
    const mock = fixture({ rulesets: [main, clone(desired.releaseTagsRuleset)] });
    expect(buildPlan(mock.client, 'team/project', desired).changes).toEqual([]);
  });

  test('reuses existing ruleset and preserves additional rule parameters', () => {
    const main = clone(desired.mainRuleset);
    main.enforcement = 'disabled';
    main.rules.find((rule) => rule.type === 'pull_request').parameters.extra_parameter = 'keep';
    const mock = fixture({ rulesets: [main, clone(desired.releaseTagsRuleset)] });
    const plan = buildPlan(mock.client, 'team/project', desired);
    expect(plan.changes).toHaveLength(1);
    expect(plan.changes[0].kind).toBe('ruleset-update');
    expect(plan.changes[0].after.rules.find((rule) => rule.type === 'pull_request').parameters.extra_parameter).toBe('keep');
  });

  test('restores a missing rule and applies a ruleset update without creating a duplicate', async () => {
    const main = clone(desired.mainRuleset);
    main.rules = main.rules.filter((rule) => rule.type !== 'required_linear_history');
    const mock = fixture({ rulesets: [main, clone(desired.releaseTagsRuleset)] });
    const out = output();
    expect(await run(['--apply', '--yes', '--repo', 'team/project'], mock.client, out, root)).toBe(0);
    expect(mock.calls.filter((call) => call.method === 'PUT' && call.endpoint.includes('/rulesets/'))).toHaveLength(1);
    expect(mock.state.rulesets).toHaveLength(2);
    expect(mock.state.rulesets[0].rules.some((rule) => rule.type === 'required_linear_history')).toBe(true);
  });

  test('creates only missing tag ruleset; duplicate names require manual resolution', () => {
    const main = clone(desired.mainRuleset);
    const missing = buildPlan(fixture({ rulesets: [main] }).client, 'team/project', desired);
    expect(missing.changes.map((item) => item.kind)).toEqual(['ruleset-create']);
    const duplicate = buildPlan(fixture({ rulesets: [main, clone(main), clone(desired.releaseTagsRuleset)] }).client, 'team/project', desired);
    expect(duplicate.issues.some((item) => item.kind === 'manual')).toBe(true);
    expect(duplicate.changes).toEqual([]);
  });

  test('reports unsupported Actions and private fork APIs without writing', () => {
    const publicMock = fixture({ unsupported: 'repos/team/project/actions/permissions/workflow' });
    expect(buildPlan(publicMock.client, 'team/project', desired).issues).toContainEqual(expect.objectContaining({ kind: 'unsupported' }));
    const privateMock = fixture({ repository: { visibility: 'private' }, unsupported: 'repos/team/project/actions/permissions/fork-pr-workflows-private-repos' });
    expect(buildPlan(privateMock.client, 'team/project', desired).issues).toContainEqual(expect.objectContaining({ kind: 'unsupported' }));
  });

  test('applies private fork safety settings with the required full API body', async () => {
    const mock = fixture({ repository: { visibility: 'private' }, forks: { send_write_tokens_to_workflows: true } });
    const out = output();
    expect(await run(['--apply', '--yes', '--repo', 'team/project'], mock.client, out, root)).toBe(0);
    const mutation = mock.calls.find((call) => call.method === 'PUT' && call.endpoint.includes('fork-pr-workflows'));
    expect(mutation.body).toEqual(desired.privateForks);
  });

  test('wrong target and extra rules are reported without deleting unrelated rules', () => {
    const main = clone(desired.mainRuleset);
    main.rules.push({ type: 'commit_message_pattern', parameters: { operator: 'contains', pattern: 'x' } });
    const tags = clone(desired.releaseTagsRuleset);
    tags.target = 'branch';
    const plan = buildPlan(fixture({ rulesets: [main, tags] }).client, 'team/project', desired);
    expect(plan.issues.filter((item) => item.kind === 'manual')).toHaveLength(2);
    expect(plan.changes).toEqual([]);
  });

  test('ruleset permission error is reported, other inspection continues', () => {
    const mock = fixture({ unsupported: 'repos/team/project/rulesets?per_page=100&page=1' });
    const plan = buildPlan(mock.client, 'team/project', desired);
    expect(plan.issues.some((item) => item.kind === 'unsupported')).toBe(true);
    expect(plan.changes).toEqual([]);
  });

  test('API errors outside known plan limitations remain errors', () => {
    const mock = fixture({ failAt: 'GET repos/team/project/actions/permissions/workflow' });
    const errorClient = { ...mock.client, request(method, endpoint, body) {
      if (endpoint.endsWith('/actions/permissions/workflow')) throw new Error('network failure');
      return mock.client.request(method, endpoint, body);
    } };
    expect(() => buildPlan(errorClient, 'team/project', desired)).toThrow(/network failure/);
  });

  test('empty remote branch reports acceptance status as unavailable', () => {
    const mock = fixture({ failAt: 'GET repos/team/project/commits/main/check-runs?check_name=acceptance' });
    expect(buildPlan(mock.client, 'team/project', desired).issues.some((item) => item.message.includes('acceptance'))).toBe(true);
  });

  test('reports missing permissions and unavailable acceptance check', () => {
    const mock = fixture({ repository: { permissions: { admin: false }, allow_merge_commit: true }, checkRuns: [] });
    const plan = buildPlan(mock.client, 'team/project', desired);
    expect(plan.canApply).toBe(false);
    expect(plan.issues.some((item) => item.kind === 'permission-denied')).toBe(true);
    expect(plan.issues.some((item) => item.message.includes('acceptance'))).toBe(true);
  });

  test('rejects API identity mismatch', () => {
    const mock = fixture({ repository: { full_name: 'other/repository' } });
    expect(() => buildPlan(mock.client, 'team/project', desired)).toThrow(/different repository/);
  });
});

describe('CLI safety and results', () => {
  test('dry-run and check produce no mutations with meaningful exit codes', async () => {
    const mock = fixture({ actions: { default_workflow_permissions: 'write' } });
    const out = output();
    expect(await run(['--dry-run', '--repo', 'team/project'], mock.client, out, root)).toBe(0);
    expect(await run(['--check', '--repo', 'team/project'], mock.client, out, root)).toBe(1);
    expect(mock.calls.filter((item) => item.method !== 'GET')).toEqual([]);
  });

  test('JSON output is parseable and does not prompt', async () => {
    const mock = fixture({ actions: { default_workflow_permissions: 'write' } }); const out = output();
    expect(await run(['--json', '--repo', 'team/project'], mock.client, out, root)).toBe(0);
    expect(JSON.parse(out.text[0]).changes[0].kind).toBe('actions');
    expect(out.prompts).toBe(0);
  });

  test('default and --apply require approval', async () => {
    for (const args of [[], ['--apply']]) {
      const mock = fixture({ actions: { default_workflow_permissions: 'write' } }); const out = output(false);
      expect(await run(args, mock.client, out, root)).toBe(1);
      expect(out.prompts).toBe(1);
      expect(mock.calls.filter((item) => item.method !== 'GET')).toEqual([]);
    }
  });

  test('explicit scoped approval applies and verifies, then remains idempotent', async () => {
    const mock = fixture({ actions: { default_workflow_permissions: 'write' }, rulesets: [clone(desired.mainRuleset)] });
    const out = output();
    expect(await run(['--apply', '--yes', '--repo', 'team/project', '--json'], mock.client, out, root)).toBe(0);
    expect(JSON.parse(out.text[0]).verified).toBe(true);
    expect(mock.calls.filter((item) => item.method !== 'GET').map((item) => item.method)).toEqual(['PUT', 'POST']);
    const again = output();
    expect(await run(['--apply', '--yes', '--repo', 'team/project'], mock.client, again, root)).toBe(0);
    expect(mock.calls.filter((item) => item.method !== 'GET')).toHaveLength(2);
  });

  test('partial API failure reports completed operations', async () => {
    const mock = fixture({ repository: { allow_merge_commit: true }, actions: { default_workflow_permissions: 'write' }, failAt: 'PUT repos/team/project/actions/permissions/workflow' });
    const out = output();
    expect(await run(['--apply', '--yes', '--repo', 'team/project', '--json'], mock.client, out, root)).toBe(2);
    expect(JSON.parse(out.text[0]).applied).toEqual(['Repository settings']);
    expect(JSON.parse(out.text[0]).failed).toBe('Actions default permissions');
  });

  test('authentication and admin failures return error code 2', async () => {
    const auth = fixture({ authFails: true });
    expect(await run(['--check'], auth.client, output(), root)).toBe(2);
    const denied = fixture({ repository: { permissions: { admin: false }, allow_merge_commit: true } });
    expect(await run(['--apply'], denied.client, output(), root)).toBe(2);
    expect(denied.calls.filter((item) => item.method !== 'GET')).toEqual([]);
  });
});
