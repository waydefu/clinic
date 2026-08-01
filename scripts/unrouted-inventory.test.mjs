import { describe, expect, it } from 'vitest';
import {
  parseDecisionRegister,
  parseRbacPermissions,
  parseStageGateStatus,
  validateRbacPermissionCoverage
} from './unrouted-inventory.mjs';

// 這個模組決定「哪些程式碼可以刻意還沒接線」。它的每一個解析器都刻意寫得很窄，
// 因為一旦格式改了而解析器沒跟上，最糟的結果不是報錯，而是**安靜地把每一筆
// 決策都當成未解決、或把每一個 blocker 都當成不存在**。以下的案例都對準那件事。

function registerRow(id, status) {
  return `| ${id} | 說明 | 負責人 | ${status} | 前置條件 |`;
}

const REGISTER_HEADER = [
  '| ID | Decision | Owner | Status | Needed before |',
  '| --- | --- | --- | --- | --- |'
].join('\n');

describe('parseDecisionRegister', () => {
  it('reads id and status from the canonical table', () => {
    const { decisions, issues } = parseDecisionRegister(
      [
        REGISTER_HEADER,
        registerRow('D-001', 'pending'),
        registerRow('D-006', 'approved (2026-07-28; evidence pending)')
      ].join('\n')
    );

    expect(issues).toEqual([]);
    expect(decisions.get('D-001')).toBe('pending');
    // 括號裡的補述不影響狀態判讀，只取開頭的狀態字。
    expect(decisions.get('D-006')).toBe('approved');
  });

  it('ignores prose lines that are not decision rows', () => {
    const { decisions } = parseDecisionRegister(
      [
        '一段說明文字。',
        REGISTER_HEADER,
        registerRow('D-002', 'deferred')
      ].join('\n')
    );
    expect([...decisions.keys()]).toEqual(['D-002']);
  });

  // 最重要的一條：解析不到任何一列時必須大聲失敗。回傳空 Map 而不報錯的話，
  // 下游會把「讀不到」誤讀成「沒有任何決策待解」。
  it('fails loudly when no row is readable', () => {
    const { decisions, issues } = parseDecisionRegister('沒有表格');
    expect(decisions.size).toBe(0);
    expect(issues.join('\n')).toContain('no readable decision rows');
  });

  it('rejects an unknown status word', () => {
    const { issues } = parseDecisionRegister(
      [REGISTER_HEADER, registerRow('D-003', 'maybe')].join('\n')
    );
    expect(issues.join('\n')).toContain('unsupported status');
  });

  it('rejects a duplicated decision row', () => {
    const { issues } = parseDecisionRegister(
      [
        REGISTER_HEADER,
        registerRow('D-004', 'pending'),
        registerRow('D-004', 'approved')
      ].join('\n')
    );
    expect(issues.join('\n')).toContain('duplicate row D-004');
  });
});

describe('parseStageGateStatus', () => {
  function status(overrides = {}) {
    return {
      $comment: ['說明'],
      stageSlices: Object.fromEntries(
        ['C0', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6'].map((id) => [id, 'pending'])
      ),
      deploymentAuthorities: Object.fromEntries(
        ['C1', 'C2', 'C3', 'C4', 'C5', 'C6'].map((id) => [id, 'not_granted'])
      ),
      ...overrides
    };
  }

  it('accepts a complete status document', () => {
    const parsed = parseStageGateStatus(status());
    expect(parsed.issues).toEqual([]);
    expect(parsed.stageSlices.get('C0')).toBe('pending');
    expect(parsed.deploymentAuthorities.get('C1')).toBe('not_granted');
  });

  it('rejects a non-object document', () => {
    expect(parseStageGateStatus('C0').issues.join('\n')).toContain(
      'must contain a JSON object'
    );
  });

  // 新增一個切片卻沒更新這裡，等於讓那一片的 blocker 掛在無人認得的狀態上。
  it('rejects an unknown slice id', () => {
    const value = status();
    value.stageSlices.C7 = 'pending';
    expect(parseStageGateStatus(value).issues.length).toBeGreaterThan(0);
  });

  it('rejects a missing slice', () => {
    const value = status();
    delete value.stageSlices.C3;
    expect(parseStageGateStatus(value).issues.length).toBeGreaterThan(0);
  });

  it('rejects an unsupported slice status', () => {
    const value = status();
    value.stageSlices.C0 = 'approved';
    expect(parseStageGateStatus(value).issues.length).toBeGreaterThan(0);
  });

  it('rejects an unknown top-level field', () => {
    expect(
      parseStageGateStatus(status({ extra: true })).issues.length
    ).toBeGreaterThan(0);
  });
});

describe('parseRbacPermissions', () => {
  it('reads the exported permission union', () => {
    const { permissions, issues } = parseRbacPermissions(
      "export type Permission = 'create_booking' | 'cancel_booking';"
    );
    expect(issues).toEqual([]);
    expect(permissions).toEqual(['create_booking', 'cancel_booking']);
  });

  // 聯集被改名或重構時必須紅，而不是回傳空清單讓覆蓋率檢查變成無條件通過。
  it('fails when the union cannot be found', () => {
    const { permissions, issues } = parseRbacPermissions('export type X = 1;');
    expect(permissions).toEqual([]);
    expect(issues.join('\n')).toContain('Could not find');
  });

  it('reports a repeated permission', () => {
    const { issues } = parseRbacPermissions(
      "export type Permission = 'a_b' | 'a_b';"
    );
    expect(issues.join('\n')).toContain('repeats a_b');
  });

  it('fails on an empty union', () => {
    expect(
      parseRbacPermissions('export type Permission = never;').issues.join('\n')
    ).toContain('no permissions');
  });
});

describe('validateRbacPermissionCoverage', () => {
  const rbac = "export type Permission = 'create_booking' | 'cancel_booking';";

  it('accepts one gate owning each permission', () => {
    const inventory = {
      capabilityGates: {
        booking: { permissions: ['create_booking', 'cancel_booking'] }
      }
    };
    expect(validateRbacPermissionCoverage(inventory, rbac)).toEqual([]);
  });

  it('cannot validate anything without capabilityGates', () => {
    expect(validateRbacPermissionCoverage({}, rbac).join('\n')).toContain(
      'without capabilityGates'
    );
  });

  // 雙向：介面上多出來的權限和清單裡過期的權限都要被抓到，否則覆蓋率會慢慢失真。
  it('reports a permission that no gate owns', () => {
    const inventory = {
      capabilityGates: { booking: { permissions: ['create_booking'] } }
    };
    expect(
      validateRbacPermissionCoverage(inventory, rbac).length
    ).toBeGreaterThan(0);
  });

  it('reports an inventory permission that the union no longer declares', () => {
    const inventory = {
      capabilityGates: {
        booking: {
          permissions: ['create_booking', 'cancel_booking', 'ghost_permission']
        }
      }
    };
    expect(
      validateRbacPermissionCoverage(inventory, rbac).join('\n')
    ).toContain('ghost_permission');
  });
});
