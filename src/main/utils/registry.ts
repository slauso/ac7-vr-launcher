import { execSync } from 'node:child_process';

export const readRegistryValue = (key: string, valueName: string): string | null => {
  try {
    const output = execSync(`reg query "${key}" /v "${valueName}"`, { encoding: 'utf8' });
    const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const target = lines.find((line) => line.includes(` ${valueName} `));
    if (!target) return null;
    const parts = target.split(/\s{2,}/).filter(Boolean);
    return parts[parts.length - 1] ?? null;
  } catch {
    return null;
  }
};

export const registryKeyExists = (key: string): boolean => {
  try {
    execSync(`reg query "${key}"`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};
