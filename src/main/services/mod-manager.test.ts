import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { disableModInPath, enableModInPath, listModsInPath } from './mod-manager';

const createAc7Root = async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ac7-mods-test-'));
  const modsDir = path.join(root, 'Game', 'Content', 'Paks', '~mods');
  await fs.promises.mkdir(modsDir, { recursive: true });
  return { root, modsDir };
};

test('disable/enable mod moves file between ~mods and ~mods_disabled', async () => {
  const { root, modsDir } = await createAc7Root();
  const modName = 'testskin.pak';
  await fs.promises.writeFile(path.join(modsDir, modName), 'demo', 'utf8');

  await disableModInPath(root, modName);
  let mods = await listModsInPath(root);
  assert.equal(mods.length, 1);
  assert.equal(mods[0].enabled, false);

  await enableModInPath(root, modName);
  mods = await listModsInPath(root);
  assert.equal(mods.length, 1);
  assert.equal(mods[0].enabled, true);
});
