// Picks how the UI reaches the operating system: the real bridge inside the
// Windows desktop shell, or a demo bridge in a plain browser (development).
import type { PlatformApi } from '@neondeck/core';
import { PLATFORM_METHODS } from '@neondeck/core';
import { createMockPlatform } from './mock';

interface ShellBridge {
  platform: string;
  invoke: (method: string, ...args: unknown[]) => Promise<unknown>;
}

declare global {
  interface Window {
    neondeckBridge?: ShellBridge;
  }
}

function fromShell(shell: ShellBridge): PlatformApi {
  const api: Record<string, unknown> = {};
  for (const m of PLATFORM_METHODS) api[m] = (...args: unknown[]) => shell.invoke(m, ...args);
  return api as unknown as PlatformApi;
}

const shell = window.neondeckBridge;
export const isDemo = !shell || shell.platform !== 'win32';
export const platform: PlatformApi = isDemo ? createMockPlatform() : fromShell(shell!);
