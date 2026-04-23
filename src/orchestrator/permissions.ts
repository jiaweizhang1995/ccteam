export type PermissionMode = 'default' | 'skip';

export interface PermissionOpts {
  dangerouslySkipPermissions: boolean;
}

export function resolvePermissionMode(opts: PermissionOpts): PermissionMode {
  return opts.dangerouslySkipPermissions ? 'skip' : 'default';
}

export function permissionEnvVars(mode: PermissionMode): Record<string, string> {
  if (mode === 'skip') {
    return { AGENT_TEAMS_SKIP_PERMISSIONS: '1' };
  }
  return {};
}
