import { describe, expect, it } from 'vitest';
import { gsap } from 'gsap';
import { PresentationClock } from '../src/core/clock';
import { Beat, CancelToken, Cancelled } from '../src/core/beat';

describe('Beat on virtual clock', () => {
  it('waits on presentation time, not wall time', async () => {
    const clock = new PresentationClock();
    clock.useVirtual();
    const beat = new Beat(new CancelToken(), 1, clock);
    let done = false;
    const p = beat.wait(500).then(() => (done = true));
    clock.step(400);
    await Promise.resolve();
    expect(done).toBe(false);
    clock.step(200);
    await p;
    expect(done).toBe(true);
  });
  it('skip brings a timeline to its exact end state', async () => {
    const clock = new PresentationClock();
    clock.useVirtual();
    const beat = new Beat(new CancelToken(), 1, clock);
    const o = { x: 0 };
    const p = beat.play(gsap.timeline().to(o, { x: 100, duration: 2 }));
    clock.step(300);
    expect(o.x).toBeGreaterThan(0);
    expect(o.x).toBeLessThan(100);
    beat.skip();
    await p;
    expect(o.x).toBe(100);
    // après skip, les attentes suivantes sont instantanées
    await beat.wait(10_000);
  });
  it('turbo speed shortens waits', async () => {
    const clock = new PresentationClock();
    clock.useVirtual();
    const beat = new Beat(new CancelToken(), 2, clock);
    let done = false;
    const p = beat.wait(1000).then(() => (done = true));
    clock.step(520);
    await p;
    expect(done).toBe(true);
  });
  it('cancel rejects pending sequences with Cancelled', async () => {
    const clock = new PresentationClock();
    clock.useVirtual();
    const token = new CancelToken();
    const beat = new Beat(token, 1, clock);
    const p = beat.wait(1000);
    token.cancel('test');
    await expect(p).rejects.toBeInstanceOf(Cancelled);
  });
});
