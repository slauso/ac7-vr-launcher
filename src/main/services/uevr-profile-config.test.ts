import assert from 'node:assert/strict';
import test from 'node:test';
import { serializeCameraPresets } from './uevr-profile-config';

test('serializeCameraPresets writes line-oriented cameras format', () => {
  const out = serializeCameraPresets([
    {
      id: 'inside-cockpit',
      name: 'Inside Cockpit',
      mode: 'inside-cockpit',
      fov: 90,
      offsetX: 0,
      offsetY: 0,
      offsetZ: 0,
      pitch: 0,
      yaw: 0,
      roll: 0
    }
  ]);
  assert.match(out, /^inside-cockpit\|Inside Cockpit\|inside-cockpit\|90\|0\|0\|0\|0\|0\|0\n$/);
});
