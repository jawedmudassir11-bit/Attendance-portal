import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SPRING_TACTILE,
  SPRING_CONTAINER,
  SPRING_SHEET,
  computePointerSpecular,
  computeScrollHeaderMetrics,
  parseGlassAppearanceMode,
  formatFirestoreErrorMessage
} from './glassPhysics';

test('spring physics constants match Apple Liquid Glass damped specifications', () => {
  assert.deepEqual(SPRING_TACTILE, { type: 'spring', stiffness: 420, damping: 32, mass: 0.85 });
  assert.deepEqual(SPRING_CONTAINER, { type: 'spring', stiffness: 320, damping: 28, mass: 1.0 });
  assert.deepEqual(SPRING_SHEET, { type: 'spring', stiffness: 260, damping: 30, mass: 1.1 });
});

test('computePointerSpecular normalizes and clamps coordinates inside surface bounds', () => {
  const rect = { left: 100, top: 200, width: 400, height: 200 };

  const center = computePointerSpecular(300, 300, rect);
  assert.equal(center.xPercent, 50);
  assert.equal(center.yPercent, 50);

  const clampedTopLeft = computePointerSpecular(-50, 10, rect);
  assert.equal(clampedTopLeft.xPercent, 0);
  assert.equal(clampedTopLeft.yPercent, 0);

  const clampedBottomRight = computePointerSpecular(999, 999, rect);
  assert.equal(clampedBottomRight.xPercent, 100);
  assert.equal(clampedBottomRight.yPercent, 100);
});

test('computeScrollHeaderMetrics smoothly interpolates compact ratio, rim opacity, and parallax', () => {
  const top = computeScrollHeaderMetrics(0);
  assert.equal(top.compactRatio, 0);
  assert.equal(top.isScrolled, false);
  assert.equal(top.rimOpacity, 0.55);
  assert.equal(top.blurBoostPx, 0);
  assert.equal(top.parallaxY, 0);

  const mid = computeScrollHeaderMetrics(36);
  assert.equal(mid.compactRatio, 0.5);
  assert.equal(mid.isScrolled, true);
  assert.equal(mid.blurBoostPx, 5);

  const deep = computeScrollHeaderMetrics(400);
  assert.equal(deep.compactRatio, 1);
  assert.equal(deep.isScrolled, true);
  assert.equal(deep.rimOpacity, 1);
  assert.equal(deep.blurBoostPx, 10);
  assert.ok(deep.parallaxY <= -16 && deep.parallaxY >= -36);
});

test('parseGlassAppearanceMode defaults to clear and accepts tinted', () => {
  assert.equal(parseGlassAppearanceMode('tinted'), 'tinted');
  assert.equal(parseGlassAppearanceMode('clear'), 'clear');
  assert.equal(parseGlassAppearanceMode(null), 'clear');
  assert.equal(parseGlassAppearanceMode('unexpected'), 'clear');
});

test('formatFirestoreErrorMessage converts raw JSON permission payloads into clean user copy', () => {
  const rawJson = JSON.stringify({
    error: 'Missing or insufficient permissions.',
    authInfo: { userId: 'abc', email: 'test@gmail.com' },
    operationType: 'list',
    path: 'portals (owned)'
  });
  const friendly = formatFirestoreErrorMessage(rawJson);
  assert.ok(!friendly.includes('authInfo'), 'Must not expose raw authInfo JSON');
  assert.ok(friendly.toLowerCase().includes('retry sync'));

  const plain = formatFirestoreErrorMessage('Custom sync issue');
  assert.equal(plain, 'Custom sync issue');
});
