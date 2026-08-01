import { describe, expect, it } from 'vitest';
import { computeNextActiveTab, tabDisplayLabel } from './sshTabs';
import { EC2Server } from '@shared/api/tauri/commands';

function server(id: string, name: string): EC2Server {
  return {
    id,
    name,
    host: `${id}.example.com`,
    user: 'ubuntu',
    pem_path: `C:\\keys\\${id}.pem`,
    created_at: '',
    updated_at: '',
  };
}

const tab = (tabId: string, srv: EC2Server) => ({ tabId, server: srv });

describe('computeNextActiveTab', () => {
  const tabs = [tab('a', server('s1', 'prod')), tab('b', server('s1', 'prod')), tab('c', server('s2', 'dev'))];

  it('활성 탭을 닫으면 오른쪽 이웃으로 넘어간다', () => {
    expect(computeNextActiveTab(tabs, 'b', 'b')).toBe('c');
    expect(computeNextActiveTab(tabs, 'a', 'a')).toBe('b');
  });

  it('오른쪽이 없으면 왼쪽 이웃으로 넘어간다', () => {
    expect(computeNextActiveTab(tabs, 'c', 'c')).toBe('b');
  });

  it('마지막 남은 탭을 닫으면 활성 탭이 없어진다', () => {
    expect(computeNextActiveTab([tab('a', server('s1', 'prod'))], 'a', 'a')).toBeNull();
  });

  it('활성 탭이 아닌 탭을 닫으면 활성 탭은 그대로다', () => {
    expect(computeNextActiveTab(tabs, 'a', 'c')).toBe('c');
    expect(computeNextActiveTab(tabs, 'c', 'a')).toBe('a');
  });

  it('이미 없는 탭을 닫아도 활성 탭을 잃지 않는다', () => {
    expect(computeNextActiveTab(tabs, 'zzz', 'b')).toBe('b');
  });

  it('활성 탭이 없는 상태에서도 안전하다', () => {
    expect(computeNextActiveTab(tabs, 'a', null)).toBeNull();
  });
});

describe('tabDisplayLabel', () => {
  it('서버당 탭이 하나면 서버 이름만 쓴다', () => {
    const tabs = [tab('a', server('s1', 'prod')), tab('b', server('s2', 'dev'))];
    expect(tabDisplayLabel(tabs, tabs[0])).toBe('prod');
    expect(tabDisplayLabel(tabs, tabs[1])).toBe('dev');
  });

  it('같은 서버로 여러 탭을 열면 순번을 붙인다', () => {
    const s1 = server('s1', 'prod');
    const tabs = [tab('a', s1), tab('b', server('s2', 'dev')), tab('c', s1)];
    expect(tabDisplayLabel(tabs, tabs[0])).toBe('prod (1)');
    expect(tabDisplayLabel(tabs, tabs[2])).toBe('prod (2)');
    // 사이에 낀 다른 서버는 영향을 받지 않는다
    expect(tabDisplayLabel(tabs, tabs[1])).toBe('dev');
  });

  it('서버 객체가 매번 새로 만들어져도 id 기준으로 묶는다', () => {
    // getAllServers()가 매번 새 객체를 주므로 참조 동일성에 의존하면 안 된다
    const tabs = [tab('a', server('s1', 'prod')), tab('b', server('s1', 'prod'))];
    expect(tabDisplayLabel(tabs, tabs[0])).toBe('prod (1)');
    expect(tabDisplayLabel(tabs, tabs[1])).toBe('prod (2)');
  });
});
