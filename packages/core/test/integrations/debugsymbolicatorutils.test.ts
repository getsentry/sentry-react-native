import { parseErrorStack } from '../../src/js/integrations/debugsymbolicatorutils';

describe('parseErrorStack', () => {
  it('should parse Chrome-style stack trace', () => {
    const stack = `Error: Test error
  at foo (http://localhost:8081/index.bundle:10:15)
  at bar (http://localhost:8081/index.bundle:20:25)`;

    const frames = parseErrorStack(stack);

    expect(frames).toHaveLength(2);
    expect(frames[0]).toMatchObject({
      methodName: 'foo',
      file: 'http://localhost:8081/index.bundle',
      lineNumber: 10,
    });
    expect(frames[0].column).toBeDefined();
    expect(frames[1]).toMatchObject({
      methodName: 'bar',
      file: 'http://localhost:8081/index.bundle',
      lineNumber: 20,
    });
    expect(frames[1].column).toBeDefined();
  });

  it('should handle anonymous functions', () => {
    const stack = `Error: Test error
  at <anonymous> (http://localhost:8081/index.bundle:10:15)`;

    const frames = parseErrorStack(stack);

    expect(frames.length).toBeGreaterThanOrEqual(1);
    expect(frames[0].methodName).toBeDefined();
    expect(frames[0].lineNumber).toBe(10);
  });

  it('should handle empty stack', () => {
    const frames = parseErrorStack('');

    expect(frames).toEqual([]);
  });

  it('should handle malformed stack gracefully', () => {
    const frames = parseErrorStack('Not a valid stack trace');

    expect(Array.isArray(frames)).toBe(true);
  });

  it('should preserve Metro bundle URLs with query params', () => {
    const stack = `Error: Test error
  at App (http://localhost:8081/index.bundle?platform=ios&dev=true:1:1)`;

    const frames = parseErrorStack(stack);

    expect(frames[0].file).toContain('platform=ios');
    expect(frames[0].methodName).toBe('App');
  });

  it('should handle frames without line/column info', () => {
    const stack = `Error: Test error
  at native`;

    const frames = parseErrorStack(stack);

    // Should not crash, may return empty or partial frames
    expect(Array.isArray(frames)).toBe(true);
  });
});
