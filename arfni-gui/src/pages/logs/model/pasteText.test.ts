import { describe, expect, it } from 'vitest';
import { isMultilinePaste, sanitizePasteText } from './pasteText';

describe('sanitizePasteText', () => {
  it('끝의 개행을 떼어내 즉시 실행을 막는다', () => {
    // This is what caused "right clicked and the command ran immediately"
    expect(sanitizePasteText('docker ps\n')).toBe('docker ps');
    expect(sanitizePasteText('docker ps\r\n')).toBe('docker ps');
    expect(sanitizePasteText('docker ps\n\n\n')).toBe('docker ps');
  });

  it('중간 개행은 그대로 둔다', () => {
    // Bracketed paste handles multi-line input, so the content must not be altered.
    expect(sanitizePasteText('cd /opt\ndocker ps\n')).toBe('cd /opt\ndocker ps');
  });

  it('개행이 없으면 그대로 둔다', () => {
    expect(sanitizePasteText('docker ps')).toBe('docker ps');
  });

  it('앞뒤 공백은 건드리지 않는다', () => {
    // Indentation that carries meaning, as in YAML, must survive
    expect(sanitizePasteText('  indented\n')).toBe('  indented');
    expect(sanitizePasteText('trailing spaces   \n')).toBe('trailing spaces   ');
  });

  it('빈 문자열과 개행만 있는 경우도 안전하다', () => {
    expect(sanitizePasteText('')).toBe('');
    expect(sanitizePasteText('\n')).toBe('');
    expect(sanitizePasteText('\r\n\r\n')).toBe('');
  });
});

describe('isMultilinePaste', () => {
  it('끝 개행만 있는 한 줄은 여러 줄이 아니다', () => {
    expect(isMultilinePaste('docker ps\n')).toBe(false);
    expect(isMultilinePaste('docker ps')).toBe(false);
  });

  it('중간에 개행이 있으면 여러 줄이다', () => {
    expect(isMultilinePaste('cd /opt\ndocker ps')).toBe(true);
    expect(isMultilinePaste('cd /opt\ndocker ps\n')).toBe(true);
  });
});
