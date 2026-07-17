import { afterEach, describe, expect, it } from 'vitest';
import {
  clearRegisteredSecrets,
  redactString,
  redactValue,
  registerSecret,
} from '../../src/core/redact.js';

afterEach(() => clearRegisteredSecrets());

describe('redactString', () => {
  it('removes registered secret values wherever they appear', () => {
    registerSecret('sk_live_abc123XYZ');
    const input = 'https://api.example.com/v1/data?api_key=sk_live_abc123XYZ&x=1';
    const out = redactString(input);
    expect(out).not.toContain('sk_live_abc123XYZ');
    expect(out).toContain('[REDACTED]');
  });

  it('redacts key=value credential patterns even when unregistered', () => {
    const out = redactString('GET /obs?apikey=zzz-secret-value&series=CPI');
    expect(out).not.toContain('zzz-secret-value');
    expect(out).toContain('apikey=[REDACTED]');
  });

  it('redacts bearer tokens', () => {
    const out = redactString('authorization: Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig');
    expect(out).toContain('Bearer [REDACTED]');
    expect(out).not.toContain('eyJhbGciOiJIUzI1NiJ9');
  });

  it('ignores short values that cannot be registered', () => {
    registerSecret('abc');
    expect(redactString('abc is fine')).toBe('abc is fine');
  });
});

describe('redactValue', () => {
  it('masks credential-like object keys entirely', () => {
    const out = redactValue({ apiKey: 'topsecret99', note: 'hello' }) as Record<string, unknown>;
    expect(out.apiKey).toBe('[REDACTED]');
    expect(out.note).toBe('hello');
  });

  it('walks nested arrays and objects', () => {
    registerSecret('deep-secret-1');
    const out = redactValue({ list: [{ msg: 'value deep-secret-1 here' }] }) as {
      list: { msg: string }[];
    };
    expect(out.list[0]?.msg).not.toContain('deep-secret-1');
  });

  it('serializes Errors safely', () => {
    registerSecret('errsecret9');
    const out = redactValue(new Error('failed with errsecret9')) as { message: string };
    expect(out.message).not.toContain('errsecret9');
  });
});
