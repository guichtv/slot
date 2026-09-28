import { describe, expect, it } from 'vitest';
import { Fsm } from '../src/core/fsm';

describe('Fsm', () => {
  it('allows the nominal path and releases owned resources on exit', () => {
    const f = new Fsm();
    let released = 0;
    f.go('welcome');
    f.go('entering');
    f.go('ready');
    f.own(() => released++);
    f.go('requesting');
    expect(released).toBe(1);
    f.go('spinning');
    f.go('resolving');
    f.go('returning');
    f.go('ready');
  });
  it('rejects illegal transitions', () => {
    const f = new Fsm();
    expect(() => f.go('spinning')).toThrow();
  });
  it('blocks inputs outside allowed states', () => {
    const f = new Fsm();
    f.go('welcome');
    expect(f.accepts('spin')).toBe(false);
    f.go('entering');
    f.go('ready');
    expect(f.accepts('spin')).toBe(true);
    f.go('requesting');
    expect(f.accepts('spin')).toBe(false);
  });
});
