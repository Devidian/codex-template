const childProcess = require('node:child_process');
const { CliGitHubClient, GitHubError } = require('../../../dist/scripts/repo-configure/src/github.js');

describe('GitHub CLI adapter', () => {
  let execute;
  beforeEach(() => { execute = jest.spyOn(childProcess, 'execFileSync'); });
  afterEach(() => { execute.mockRestore(); });

  test('discovers repository, verifies auth, and sends JSON through stdin', () => {
    execute.mockReturnValueOnce('authenticated\n')
      .mockReturnValueOnce('{"nameWithOwner":"team/project"}\n')
      .mockReturnValueOnce('{"ok":true}\n')
      .mockReturnValueOnce('');
    const client = new CliGitHubClient();
    client.authenticate();
    expect(client.discoverRepository()).toBe('team/project');
    expect(client.request('GET', 'repos/team/project')).toEqual({ ok: true });
    expect(client.request('PUT', 'repos/team/project/actions/permissions/workflow', { default_workflow_permissions: 'read' })).toBeNull();
    const mutation = execute.mock.calls[3];
    expect(mutation[0]).toBe('gh');
    expect(mutation[1]).toContain('--input');
    expect(mutation[2].input).toBe('{"default_workflow_permissions":"read"}');
    expect(mutation[2].env.GH_PROMPT_DISABLED).toBe('1');
  });

  test('sanitizes HTTP failures and missing repository discovery', () => {
    execute.mockReturnValueOnce('{}');
    expect(() => new CliGitHubClient().discoverRepository()).toThrow(/did not identify/);
    execute.mockImplementationOnce(() => { throw { stderr: Buffer.from('sensitive detail (HTTP 403)') }; });
    expect(() => new CliGitHubClient().request('GET', 'repos/team/project')).toThrow(GitHubError);
    execute.mockImplementationOnce(() => { throw { stderr: Buffer.from('secret') }; });
    expect(() => new CliGitHubClient().authenticate()).toThrow('gh auth failed');
  });
});
