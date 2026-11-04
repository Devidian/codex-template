import fs from 'node:fs';
import path from 'node:path';
import typia from 'typia';

export interface RepositorySettings {
  allow_squash_merge: boolean;
  allow_merge_commit: boolean;
  allow_rebase_merge: boolean;
  delete_branch_on_merge: boolean;
  allow_auto_merge: boolean;
  squash_merge_commit_title: 'PR_TITLE';
  squash_merge_commit_message: 'COMMIT_MESSAGES' | 'PR_BODY' | 'BLANK';
  has_issues: boolean;
  has_wiki: boolean;
  has_discussions?: boolean;
}

export interface ActionsSettings {
  default_workflow_permissions: 'read';
  can_approve_pull_request_reviews: false;
}

export interface PrivateForkSettings {
  run_workflows_from_fork_pull_requests: true;
  send_write_tokens_to_workflows: false;
  send_secrets_and_variables: false;
  require_approval_for_fork_pr_workflows: true;
}

export interface Ruleset {
  name: string;
  target: 'branch' | 'tag';
  enforcement: 'active';
  bypass_actors: Array<{ actor_id: number; actor_type: string; bypass_mode: string }>;
  conditions: { ref_name: { include: string[]; exclude: string[] } };
  rules: Array<{ type: string; parameters?: Record<string, unknown> }>;
}

export interface DesiredConfig {
  repository: RepositorySettings;
  actions: ActionsSettings;
  privateForks: PrivateForkSettings;
  mainRuleset: Ruleset;
  releaseTagsRuleset: Ruleset;
}

function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function loadConfig(root: string): DesiredConfig {
  const settings = typia.assertEquals<Pick<DesiredConfig, 'repository' | 'actions' | 'privateForks'>>(
    readJson(path.join(root, '.github/repository-config/repository.json')),
  );
  const mainRuleset = typia.assertEquals<Ruleset>(readJson(path.join(root, '.git-rulesets.json')));
  const releaseTagsRuleset = typia.assertEquals<Ruleset>(
    readJson(path.join(root, '.github/repository-config/release-tags-ruleset.json')),
  );
  if (mainRuleset.target !== 'branch' || !mainRuleset.conditions.ref_name.include.includes('refs/heads/main')) {
    throw new Error('Main ruleset must target refs/heads/main');
  }
  if (releaseTagsRuleset.target !== 'tag' || !releaseTagsRuleset.conditions.ref_name.include.includes('refs/tags/v*')) {
    throw new Error('Release tag ruleset must target refs/tags/v*');
  }
  for (const ruleset of [mainRuleset, releaseTagsRuleset]) {
    if (ruleset.bypass_actors.length) throw new Error(`${ruleset.name}: broad bypass actors are forbidden`);
    if (!ruleset.rules.some((rule) => rule.type === 'deletion') || !ruleset.rules.some((rule) => rule.type === 'non_fast_forward')) {
      throw new Error(`${ruleset.name}: deletion and non_fast_forward rules are required`);
    }
  }
  const branchTypes = new Set(['deletion', 'non_fast_forward', 'required_linear_history', 'pull_request', 'required_status_checks']);
  const tagTypes = new Set(['deletion', 'non_fast_forward']);
  for (const rule of mainRuleset.rules) if (!branchTypes.has(rule.type)) throw new Error(`Unsupported main rule: ${rule.type}`);
  for (const rule of releaseTagsRuleset.rules) if (!tagTypes.has(rule.type)) throw new Error(`Unsupported release tag rule: ${rule.type}`);
  const checks = mainRuleset.rules.find((rule) => rule.type === 'required_status_checks');
  const required = (checks?.parameters?.required_status_checks as Array<{ context?: string }> | undefined) ?? [];
  if (!required.some((item) => item.context === 'acceptance')) throw new Error('Main ruleset must require acceptance');
  const ci = fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8');
  if (!/^  acceptance:\s*$/m.test(ci)) throw new Error('CI must define the acceptance job');
  for (const name of ['release.yml', 'release-candidate.yml']) {
    const workflow = fs.readFileSync(path.join(root, '.github/workflows', name), 'utf8');
    if (!workflow.includes('git push origin') || !workflow.includes('gh release create') || !workflow.includes('contents: write')) {
      throw new Error(`${name}: expected tag-and-release process not found`);
    }
  }
  return { ...settings, mainRuleset, releaseTagsRuleset };
}
