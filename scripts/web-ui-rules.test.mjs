import { describe, expect, it } from 'vitest';
import {
  containsNormalized,
  duplicateIds,
  normalizeWhitespace,
  reviewInjectedInputs,
  reviewTextRequirements
} from './web-ui-rules.mjs';

// 這道守衛擋的是「介面悄悄退步」：少一個 aria 屬性、多一個撞名的 id、多一個
// 讀不回值的欄位。它們都不會讓任何東西壞掉，只會讓某些使用者用不了——所以沒有
// 測試會抓到，只有這道 gate 會。它自己失效時也一樣安靜。

describe('normalizeWhitespace', () => {
  it('removes every kind of whitespace so formatting cannot break a rule', () => {
    expect(normalizeWhitespace('a  b\n\tc')).toBe('abc');
  });

  it('accepts non-string input without throwing', () => {
    expect(normalizeWhitespace(undefined)).toBe('undefined');
  });
});

describe('containsNormalized', () => {
  // 這正是它存在的理由：同一段標記換行方式不同，仍然應該算數。
  it('matches across differing line breaks and indentation', () => {
    const source = '<button\n  type="submit"\n  aria-label="送出"\n>';
    expect(containsNormalized(source, '<button type="submit"')).toBe(true);
  });

  it('does not match text that is genuinely absent', () => {
    expect(containsNormalized('<button>', 'aria-label')).toBe(false);
  });
});

describe('reviewTextRequirements', () => {
  it('reports a required construct that is missing', () => {
    expect(
      reviewTextRequirements('<div></div>', [
        { text: 'role="status"', description: '缺少狀態區' }
      ])
    ).toEqual(['缺少狀態區']);
  });

  it('says nothing when the required construct is present', () => {
    expect(
      reviewTextRequirements('<div role="status"></div>', [
        { text: 'role="status"', description: '缺少狀態區' }
      ])
    ).toEqual([]);
  });

  // 反向守衛不可省略：只要求正確寫法在場，擋不住有人在旁邊又加一份錯的。
  it('reports a refused construct that came back', () => {
    expect(
      reviewTextRequirements('<div aria-live="polite">', [
        {
          text: 'aria-live',
          description: '這一區不得是 live region',
          mode: 'refuse'
        }
      ])
    ).toEqual(['這一區不得是 live region']);
  });

  it('defaults to require when no mode is given', () => {
    expect(
      reviewTextRequirements('', [{ text: 'x', description: 'missing x' }])
    ).toEqual(['missing x']);
  });

  it('collects every unmet requirement, not only the first', () => {
    expect(
      reviewTextRequirements('', [
        { text: 'a', description: 'A' },
        { text: 'b', description: 'B' }
      ])
    ).toEqual(['A', 'B']);
  });
});

describe('reviewInjectedInputs', () => {
  it('accepts an injected input with a name binding', () => {
    expect(
      reviewInjectedInputs('view.js', '<input name="note" type="text">')
    ).toEqual([]);
  });

  it('accepts a data-* binding that carries a value', () => {
    expect(
      reviewInjectedInputs(
        'view.js',
        '<input data-request-tag="same_day" type="checkbox">'
      )
    ).toEqual([]);
  });

  // 已知限制，行為刻意維持原樣：規則要求 `data-*=`，所以沒有值的
  // `data-request-tag` 會被判成缺繫結。實務上不會踩到——需要這種寫法的
  // tag-picker 是用 `${attributeFor(...)}` 插入的，而那條路徑另有允許清單。
  // 這一條把限制釘住，將來真的有人寫出無值屬性時，會看到的是這個測試而不是
  // 一段查不出原因的 gate 失敗。
  it('flags a valueless data-* attribute, a known limitation of the rule', () => {
    expect(
      reviewInjectedInputs(
        'view.js',
        '<input data-request-tag type="checkbox">'
      )
    ).toHaveLength(1);
  });

  // 兩份客戶端都用 querySelectorAll('[id]') 建 elements 表，撞名會靜默覆蓋控制項。
  it('rejects an injected input carrying an id', () => {
    const [failure] = reviewInjectedInputs(
      'view.js',
      '<input id="note" name="note">'
    );
    expect(failure).toContain('carrying an id');
  });

  it('rejects an input with no way to read its value back', () => {
    const [failure] = reviewInjectedInputs('view.js', '<input type="text">');
    expect(failure).toContain('no name or data-* binding');
  });

  // 繫結由呼叫端插進來時，字串在這個階段還不存在，不該被判成缺繫結。
  it('leaves an interpolated binding to the allow list', () => {
    expect(
      reviewInjectedInputs('tag-picker.js', '<input ${attributeFor(tag)}>')
    ).toEqual([]);
  });

  it('reports every offending input in the file', () => {
    const source = '<input type="text"><input id="x" name="x">';
    expect(reviewInjectedInputs('view.js', source)).toHaveLength(2);
  });

  it('ignores markup with no inputs at all', () => {
    expect(reviewInjectedInputs('view.js', '<p>沒有欄位</p>')).toEqual([]);
  });
});

describe('duplicateIds', () => {
  it('finds an id used twice', () => {
    expect(
      duplicateIds('<div id="a"></div><textarea id="a"></textarea>')
    ).toEqual(['a']);
  });

  it('reports each duplicated id once, however many times it repeats', () => {
    expect(duplicateIds('<i id="a"><i id="a"><i id="a">')).toEqual(['a']);
  });

  it('says nothing when every id is unique', () => {
    expect(duplicateIds('<i id="a"><i id="b">')).toEqual([]);
  });

  it('does not treat a substring like data-id as an id attribute', () => {
    expect(duplicateIds('<i data-id="a"><i data-id="a">')).toEqual([]);
  });
});
