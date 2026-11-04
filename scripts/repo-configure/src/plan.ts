import { DesiredConfig, RepositorySettings, Ruleset } from './config';
import { GitHubClient, GitHubError } from './github';

export type ChangeKind = 'repository' | 'actions' | 'private-forks' | 'ruleset-create' | 'ruleset-update';

export interface Change {
  kind: ChangeKind;
  label: string;
  before: unknown;
  after: unknown;
  id?: number;
}

export interface Issue {
  kind: 'unsupported' | 'permission-denied' | 'manual' | 'warning';
  message: string;
}

export interface Plan {
  repository: string;
  isTemplate: boolean;
  changes: Change[];
  issues: Issue[];
  canApply: boolean;
}

type ApiRepository = Record<string, unknown> & {
  full_name?: string;
  is_template?: boolean;
  visibility?: string;
  permissions?: { admin?: boolean };
  default_branch?: string;
};

function fields(current: Record<string, unknown>, desired: Record<string, unknown>): { before: Record<string, unknown>; after: Record<string, unknown> } | null {
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(desired)) {
    if (JSON.stringify(current[key]) !== JSON.stringify(value)) {
      before[key] = current[key] ?? null;
      after[key] = value;
    }
  }
  return Object.keys(after).length ? { before, after } : null;
}

function ordered(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(ordered).sort().join(',')}]`;
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${ordered(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function rulesetDrift(current: Ruleset, desired: Ruleset): boolean {
  if (current.enforcement !== desired.enforcement || ordered(current.bypass_actors) !== ordered(desired.bypass_actors)) return true;
  if (ordered(current.conditions.ref_name) !== ordered(desired.conditions.ref_name)) return true;
  for (const expected of desired.rules) {
    const existing = current.rules.find((item) => item.type === expected.type);
    if (!existing) return true;
    for (const [key, value] of Object.entries(expected.parameters ?? {})) {
      if (ordered(existing.parameters?.[key]) !== ordered(value)) return true;
    }
  }
  return false;
}

function mergedRuleset(current: Ruleset, desired: Ruleset): Ruleset {
  const rules = current.rules.map((rule) => ({ type: rule.type, ...(rule.parameters ? { parameters: rule.parameters } : {}) }));
  for (const expected of desired.rules) {
    const existing = rules.find((rule) => rule.type === expected.type);
    if (existing) {
      if (expected.parameters) existing.parameters = { ...(existing.parameters ?? {}), ...expected.parameters };
    } else rules.push(expected);
  }
  return {
    name: desired.name,
    target: desired.target,
    enforcement: desired.enforcement,
    bypass_actors: desired.bypass_actors,
    conditions: { ...current.conditions, ref_name: desired.conditions.ref_name },
    rules,
  };
}

function listRulesets(client: GitHubClient, repository: string): Array<{ id: number; name: string; target: string }> {
  const all: Array<{ id: number; name: string; target: string }> = [];
  for (let page = 1; page <= 100; page += 1) {
    const batch = client.request('GET', `repos/${repository}/rulesets?per_page=100&page=${page}`) as typeof all;
    if (!Array.isArray(batch)) throw new Error('GitHub returned an invalid ruleset list');
    all.push(...batch);
    if (batch.length < 100) return all;
  }
  throw new Error('Ruleset pagination limit exceeded');
}

function readOptional(client: GitHubClient, endpoint: string, label: string, issues: Issue[]): Record<string, unknown> | null {
  try {
    return client.request('GET', endpoint) as Record<string, unknown>;
  } catch (error) {
    if (error instanceof GitHubError && (error.status === 403 || error.status === 404 || error.status === 409)) {
      issues.push({ kind: error.status === 403 ? 'permission-denied' : 'unsupported', message: `${label} cannot be inspected (HTTP ${error.status}); check repository plan and admin permissions` });
      return null;
    }
    throw error;
  }
}

export function buildPlan(client: GitHubClient, repository: string, desired: DesiredConfig): Plan {
  const issues: Issue[] = [];
  const changes: Change[] = [];
  const actual = client.request('GET', `repos/${repository}`) as ApiRepository;
  if (!actual || typeof actual !== 'object') throw new Error('GitHub returned an invalid repository response');
  if (actual.full_name?.toLowerCase() !== repository.toLowerCase()) throw new Error(`GitHub returned a different repository for ${repository}`);
  const canApply = actual.permissions?.admin === true;
  const settings = fields(actual, desired.repository as unknown as Record<string, unknown>);
  if (settings) changes.push({ kind: 'repository', label: 'Repository settings', ...settings });

  const actions = readOptional(client, `repos/${repository}/actions/permissions/workflow`, 'Actions permissions', issues);
  if (actions) {
    const difference = fields(actions, desired.actions as unknown as Record<string, unknown>);
    if (difference) changes.push({ kind: 'actions', label: 'Actions default permissions', ...difference });
  }
  if (actual.visibility === 'private') {
    const forks = readOptional(client, `repos/${repository}/actions/permissions/fork-pr-workflows-private-repos`, 'Private fork workflow settings', issues);
    if (forks) {
      const difference = fields(forks, desired.privateForks as unknown as Record<string, unknown>);
      if (difference) changes.push({ kind: 'private-forks', label: 'Private fork workflow safety', ...difference });
    }
  }

  let listed: ReturnType<typeof listRulesets> = [];
  try {
    listed = listRulesets(client, repository);
  } catch (error) {
    if (error instanceof GitHubError && (error.status === 403 || error.status === 404)) {
      issues.push({ kind: error.status === 403 ? 'permission-denied' : 'unsupported', message: `Repository rulesets cannot be inspected (HTTP ${error.status})` });
    } else throw error;
  }
  if (!issues.some((item) => item.message.startsWith('Repository rulesets cannot'))) {
    for (const expected of [desired.mainRuleset, desired.releaseTagsRuleset]) {
      const matches = listed.filter((item) => item.name === expected.name);
      if (matches.length > 1) {
        issues.push({ kind: 'manual', message: `Multiple rulesets named ${expected.name}; resolve duplicates manually` });
        continue;
      }
      if (!matches.length) {
        changes.push({ kind: 'ruleset-create', label: expected.name, before: null, after: expected });
        continue;
      }
      if (matches[0].target !== expected.target) {
        issues.push({ kind: 'manual', message: `${expected.name} targets ${matches[0].target}; review manually` });
        continue;
      }
      const current = client.request('GET', `repos/${repository}/rulesets/${matches[0].id}`) as Ruleset;
      const extras = current.rules.filter((rule) => !expected.rules.some((item) => item.type === rule.type));
      if (extras.length) issues.push({ kind: 'manual', message: `${expected.name} has additional rules (${extras.map((rule) => rule.type).join(', ')}); they will be preserved` });
      if (rulesetDrift(current, expected)) {
        changes.push({ kind: 'ruleset-update', label: expected.name, id: matches[0].id, before: current, after: mergedRuleset(current, expected) });
      }
    }
  }

  if (!canApply && changes.length) issues.push({ kind: 'permission-denied', message: `Repository admin permission is required for: ${changes.map((change) => change.label).join(', ')}` });
  if (actual.default_branch) {
    try {
      const checks = client.request('GET', `repos/${repository}/commits/${encodeURIComponent(actual.default_branch)}/check-runs?check_name=acceptance`) as { check_runs?: Array<{ conclusion?: string }> };
      if (!checks.check_runs?.some((run) => run.conclusion === 'success')) issues.push({ kind: 'warning', message: 'acceptance has no successful run on the default branch yet' });
    } catch (error) {
      if (error instanceof GitHubError && (error.status === 403 || error.status === 404 || error.status === 422)) issues.push({ kind: 'warning', message: 'acceptance status could not be verified yet' });
      else throw error;
    }
  } else issues.push({ kind: 'warning', message: 'Default branch does not exist yet; acceptance has not run' });
  return { repository, isTemplate: actual.is_template === true, changes, issues, canApply };
}

export function applyChange(client: GitHubClient, repository: string, change: Change, desired: DesiredConfig): void {
  switch (change.kind) {
    case 'repository':
      client.request('PATCH', `repos/${repository}`, change.after as Partial<RepositorySettings>);
      break;
    case 'actions':
      client.request('PUT', `repos/${repository}/actions/permissions/workflow`, desired.actions);
      break;
    case 'private-forks':
      client.request('PUT', `repos/${repository}/actions/permissions/fork-pr-workflows-private-repos`, desired.privateForks);
      break;
    case 'ruleset-create':
      client.request('POST', `repos/${repository}/rulesets`, change.after);
      break;
    case 'ruleset-update':
      client.request('PUT', `repos/${repository}/rulesets/${change.id}`, change.after);
      break;
  }
}
