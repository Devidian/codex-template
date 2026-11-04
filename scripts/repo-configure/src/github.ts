import { execFileSync } from 'node:child_process';

export class GitHubError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
  }
}

export interface GitHubClient {
  authenticate(): void;
  discoverRepository(): string;
  request(method: 'GET' | 'PATCH' | 'POST' | 'PUT', endpoint: string, body?: unknown): unknown;
}

export class CliGitHubClient implements GitHubClient {
  private run(args: string[], input?: string): string {
    try {
      return execFileSync('gh', args, {
        encoding: 'utf8',
        input,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, GH_PROMPT_DISABLED: '1' },
      }).trim();
    } catch (error) {
      const failure = error as { stderr?: Buffer | string; code?: string };
      const stderr = String(failure.stderr ?? '');
      const status = /HTTP (\d{3})/.exec(stderr);
      throw new GitHubError(`gh ${args[0]} failed${status ? ` (HTTP ${status[1]})` : ''}`, status ? Number(status[1]) : undefined);
    }
  }

  authenticate(): void {
    this.run(['auth', 'status', '-h', 'github.com']);
  }

  discoverRepository(): string {
    const result = JSON.parse(this.run(['repo', 'view', '--json', 'nameWithOwner'])) as { nameWithOwner?: string };
    if (!result.nameWithOwner) throw new GitHubError('gh repo view did not identify a repository');
    return result.nameWithOwner;
  }

  request(method: 'GET' | 'PATCH' | 'POST' | 'PUT', endpoint: string, body?: unknown): unknown {
    const args = ['api', '-X', method, endpoint, '-H', 'Accept: application/vnd.github+json'];
    if (body !== undefined) args.push('--input', '-');
    const output = this.run(args, body === undefined ? undefined : JSON.stringify(body));
    return output ? JSON.parse(output) as unknown : null;
  }
}

export function validateRepositoryIdentity(value: string): string {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value) || value.includes('..')) {
    throw new Error(`Invalid repository identity: ${value}`);
  }
  return value;
}
