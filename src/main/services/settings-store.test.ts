import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { defaultSettings, readSettingsFromPath, writeSettingsToPath } from './settings-store';

test('settings store migrates legacy defaultAc7Path to ac7Path', async () => {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ac7-settings-test-'));
  const settingsPath = path.join(tempDir, 'settings.json');
  await fs.promises.writeFile(settingsPath, JSON.stringify({ defaultAc7Path: 'C:/Games/AC7' }), 'utf8');
  const settings = await readSettingsFromPath(settingsPath);
  assert.equal(settings.ac7Path, 'C:/Games/AC7');
  assert.equal(settings.defaultAc7Path, 'C:/Games/AC7');
  assert.equal(settings.defaultVRRuntime, defaultSettings.defaultVRRuntime);
});

test('settings store writes and reads full schema', async () => {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ac7-settings-write-test-'));
  const settingsPath = path.join(tempDir, 'settings.json');
  const settings = { ...defaultSettings, ac7Path: 'C:/AC7', uevrPath: 'C:/UEVR', launchOptions: '-windowed' };
  await writeSettingsToPath(settingsPath, settings);
  const roundTripped = await readSettingsFromPath(settingsPath);
  assert.equal(roundTripped.launchOptions, '-windowed');
  assert.equal(roundTripped.uevrPath, 'C:/UEVR');
});
