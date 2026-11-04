import path from 'node:path';
import readline from 'node:readline/promises';
import { loadConfig } from './config';
import { CliGitHubClient, GitHubClient, validateRepositoryIdentity } from './github';
import { applyChange, buildPlan, Plan } from './plan';

export interface Output {
  write(text: string): void;
  error(text: string): void;
  confirm(repository: string): Promise<boolean>;
}

export const terminal: Output = {
  write: (text) => process.stdout.write(`${text}\n`),
  error: (text) => process.stderr.write(`${text}\n`),
  async confirm(repository) {
    if (!process.stdin.isTTY || !process.stdout.isTTY) return false;
    const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
      const typed = await prompt.question(`Type ${repository} to approve these remote changes: `);
      return typed === repository;
    } finally {
      prompt.close();
    }
  },
};

interface Options {
  mode: 'default' | 'dry-run' | 'check' | 'apply';
  repository?: string;
  json: boolean;
  yes: boolean;
}

export function parseArgs(argv: string[]): Options {
  let mode: Options['mode'] = 'default';
  let repository: string | undefined;
  let json = false;
  let yes = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--repo') {
      if (repository || !argv[i + 1]) throw new Error('--repo requires one OWNER/REPO');
      repository = validateRepositoryIdentity(argv[++i]);
    } else if (arg === '--json') json = true;
    else if (arg === '--yes') yes = true;
    else if (arg === '--dry-run' || arg === '--check' || arg === '--apply') {
      if (mode !== 'default') throw new Error('Choose only one of --dry-run, --check, --apply');
      mode = arg === '--dry-run' ? 'dry-run' : arg === '--check' ? 'check' : 'apply';
    } else throw new Error(`Unknown option: ${arg}`);
  }
  if (yes && (mode !== 'apply' || !repository)) throw new Error('--yes requires --apply and explicit --repo OWNER/REPO');
  if (json && mode === 'apply' && !yes) throw new Error('--json --apply requires --yes and --repo; JSON output cannot prompt');
  return { mode, repository, json, yes };
}

function render(plan: Plan): string {
  const lines = [`Repository: ${plan.repository}${plan.isTemplate ? ' (template)' : ''}`];
  if (!plan.changes.length) lines.push('[OK] Managed settings match the desired configuration');
  for (const change of plan.changes) {
    lines.push(`[${change.kind === 'ruleset-create' ? 'MISSING' : 'CHANGE'}] ${change.label}`);
    if (change.kind === 'repository' || change.kind === 'actions' || change.kind === 'private-forks') {
      const before = change.before as Record<string, unknown>;
      const after = change.after as Record<string, unknown>;
      for (const key of Object.keys(after).sort()) lines.push(`  ${key}: ${JSON.stringify(before[key])} -> ${JSON.stringify(after[key])}`);
    } else lines.push(`  ${JSON.stringify(change.after)}`);
  }
  for (const issue of plan.issues) lines.push(`[${issue.kind.toUpperCase()}] ${issue.message}`);
  lines.push(`Summary: ${plan.changes.length} changes, ${plan.issues.length} ${plan.issues.length === 1 ? 'notice' : 'notices'}`);
  return lines.join('\n');
}

function emit(output: Output, json: boolean, value: unknown, human: string): void {
  output.write(json ? JSON.stringify(value) : human);
}

export async function run(argv: string[], client: GitHubClient, output: Output, root: string): Promise<number> {
  let options: Options | undefined;
  try {
    options = parseArgs(argv);
    const desired = loadConfig(root);
    client.authenticate();
    const repository = validateRepositoryIdentity(options.repository ?? client.discoverRepository());
    const plan = buildPlan(client, repository, desired);
    if (options.mode === 'check') {
      const compliant = plan.changes.length === 0 && !plan.issues.some((issue) => issue.kind !== 'warning') && !plan.issues.some((issue) => issue.message.includes('acceptance'));
      emit(output, options.json, { ...plan, compliant }, render(plan));
      return compliant ? 0 : plan.issues.some((issue) => issue.kind === 'permission-denied') ? 2 : 1;
    }
    if (options.mode === 'dry-run' || (options.json && options.mode === 'default')) {
      emit(output, options.json, { ...plan, applied: false }, render(plan));
      return 0;
    }
    if (!plan.changes.length) {
      emit(output, options.json, { ...plan, applied: false }, render(plan));
      return plan.issues.some((issue) => issue.kind !== 'warning') ? 1 : 0;
    }
    if (!plan.canApply || plan.issues.some((issue) => issue.kind === 'permission-denied')) {
      emit(output, options.json, { ...plan, applied: false }, render(plan));
      output.error('Repository admin permission is required before applying changes');
      return 2;
    }
    if (!options.json) output.write(render(plan));
    const approved = options.yes || await output.confirm(repository);
    if (!approved) {
      emit(output, options.json, { ...plan, applied: false }, 'No remote changes applied');
      return 1;
    }
    const completed: string[] = [];
    for (const change of plan.changes) {
      try {
        applyChange(client, repository, change, desired);
        completed.push(change.label);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        emit(output, options.json, { repository, applied: completed, failed: change.label, error: message },
          `Partial application: ${completed.join(', ') || 'none'}; failed at ${change.label}: ${message}. Re-run --dry-run to inspect remaining drift.`);
        return 2;
      }
    }
    const verified = buildPlan(client, repository, desired);
    const success = verified.changes.length === 0 && !verified.issues.some((issue) => issue.kind !== 'warning');
    emit(output, options.json, { ...verified, applied: completed, verified: success },
      `${success ? 'Verified' : 'Verification failed'}: ${completed.join(', ')}\n${render(verified)}`);
    return success ? 0 : 2;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (options?.json) output.write(JSON.stringify({ error: message, exitCode: 2 }));
    else output.error(message);
    return 2;
  }
}

if (require.main === module) {
  const root = path.resolve(__dirname, '../../../..');
  run(process.argv.slice(2), new CliGitHubClient(), terminal, root).then((code) => { process.exitCode = code; });
}
