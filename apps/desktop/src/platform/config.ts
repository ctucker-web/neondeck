// Config lives in plain, pretty-printed JSON files the user can read, edit,
// back up, or copy to another machine.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const NAME = /^[a-z][a-z0-9-]{0,40}$/;

export function configStore(dir: string) {
  const file = (name: string) => {
    if (!NAME.test(name)) throw new Error(`Invalid config name: ${name}`);
    return join(dir, `${name}.json`);
  };
  return {
    async read(name: string): Promise<unknown> {
      try {
        return JSON.parse(await readFile(file(name), 'utf8'));
      } catch {
        return null; // Missing or unreadable: the caller falls back to defaults.
      }
    },
    async write(name: string, data: unknown): Promise<void> {
      await mkdir(dir, { recursive: true });
      const target = file(name);
      // Write-then-rename so a crash never leaves a half-written file.
      await writeFile(`${target}.tmp`, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
      await rename(`${target}.tmp`, target);
    },
  };
}
