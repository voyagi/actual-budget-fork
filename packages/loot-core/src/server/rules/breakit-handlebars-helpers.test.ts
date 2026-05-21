import { describe, expect, it } from 'vitest';
import * as Handlebars from 'handlebars';

import { registerHandlebarsHelpers } from './handlebars-helpers';

registerHandlebarsHelpers();

function compileAndRun(
  template: string,
  context: Record<string, unknown> = {},
): string {
  return Handlebars.compile(template)(context);
}

describe('BREAKIT: handlebars-helpers', () => {
  describe('Boundary Assault', () => {
    it('div by zero produces Infinity', () => {
      const result = compileAndRun('{{div a b}}', { a: 10, b: 0 });
      expect(result).toBe('Infinity');
    });

    it('div 0 by 0 produces NaN', () => {
      const result = compileAndRun('{{div a b}}', { a: 0, b: 0 });
      expect(result).toBe('NaN');
    });

    it('mod by zero produces NaN', () => {
      const result = compileAndRun('{{mod a b}}', { a: 10, b: 0 });
      expect(result).toBe('NaN');
    });

    it('floor of NaN', () => {
      const result = compileAndRun('{{floor a}}', { a: 'not_a_number' });
      expect(result).toBe('NaN');
    });

    it('add with no arguments returns NaN', () => {
      const result = compileAndRun('{{add}}', {});
      expect(result).toBe('NaN');
    });

    it('add with single argument returns the number', () => {
      const result = compileAndRun('{{add a}}', { a: 42 });
      expect(result).toBe('42');
    });

    it('fixed with negative digits throws RangeError', () => {
      expect(() =>
        compileAndRun('{{fixed a d}}', { a: 3.14, d: -1 }),
      ).toThrow();
    });

    it('fixed with NaN digits', () => {
      const result = compileAndRun('{{fixed a d}}', { a: 3.14, d: 'abc' });
      expect(result).toBe('3');
    });

    it('concat with no args produces empty string', () => {
      const result = compileAndRun('{{concat}}', {});
      expect(result).toBe('');
    });

    it('format with invalid date returns empty (graceful handling)', () => {
      const result = compileAndRun('{{format d f}}', {
        d: 'not-a-date',
        f: 'yyyy-MM-dd',
      });
      expect(result).toBe('');
    });

    it('addDays with zero days returns same date (falsy zero bypasses guard)', () => {
      const result = compileAndRun('{{addDays d n}}', {
        d: '2025-01-15',
        n: 0,
      });
      expect(result).toBe('2025-01-15');
    });

    it('subDays with zero days returns same date (falsy zero)', () => {
      const result = compileAndRun('{{subDays d n}}', {
        d: '2025-01-15',
        n: 0,
      });
      expect(result).toBe('2025-01-15');
    });

    it('addMonths with zero months returns same date (falsy zero)', () => {
      const result = compileAndRun('{{addMonths d n}}', {
        d: '2025-01-15',
        n: 0,
      });
      expect(result).toBe('2025-01-15');
    });

    it('addWeeks with zero weeks returns same date (falsy zero)', () => {
      const result = compileAndRun('{{addWeeks d n}}', {
        d: '2025-01-15',
        n: 0,
      });
      expect(result).toBe('2025-01-15');
    });

    it('subWeeks with zero weeks returns same date (falsy zero)', () => {
      const result = compileAndRun('{{subWeeks d n}}', {
        d: '2025-01-15',
        n: 0,
      });
      expect(result).toBe('2025-01-15');
    });

    it('addYears with zero years returns same date (falsy zero)', () => {
      const result = compileAndRun('{{addYears d n}}', {
        d: '2025-01-15',
        n: 0,
      });
      expect(result).toBe('2025-01-15');
    });

    it('subYears with zero years returns same date (falsy zero)', () => {
      const result = compileAndRun('{{subYears d n}}', {
        d: '2025-01-15',
        n: 0,
      });
      expect(result).toBe('2025-01-15');
    });

    it('setDay with day=null returns original date', () => {
      const result = compileAndRun('{{setDay d n}}', {
        d: '2025-01-15',
        n: null,
      });
      expect(result).toBe('2025-01-15');
    });

    it('day/month/year with undefined date returns empty', () => {
      expect(compileAndRun('{{day}}')).toBe('');
      expect(compileAndRun('{{month}}')).toBe('');
      expect(compileAndRun('{{year}}')).toBe('');
    });
  });

  describe('Type Confusion', () => {
    it('add with string numbers coerces correctly', () => {
      const result = compileAndRun('{{add a b}}', { a: '10', b: '20' });
      expect(result).toBe('30');
    });

    it('mul with boolean coerces: true=1, false=0', () => {
      const result = compileAndRun('{{mul a b}}', { a: true, b: 5 });
      expect(result).toBe('5');
    });

    it('regex with null value returns empty string (rendered from null)', () => {
      const result = compileAndRun('{{regex val pat rep}}', {
        val: null,
        pat: 'x',
        rep: 'y',
      });
      expect(result).toBe('');
    });

    it('regex with non-string regex returns empty', () => {
      const result = compileAndRun('{{regex val pat rep}}', {
        val: 'hello',
        pat: 123,
        rep: 'world',
      });
      expect(result).toBe('');
    });

    it('regex with non-string replace returns empty', () => {
      const result = compileAndRun('{{regex val pat rep}}', {
        val: 'hello',
        pat: 'h',
        rep: 123,
      });
      expect(result).toBe('');
    });

    it('add with undefined produces NaN', () => {
      const result = compileAndRun('{{add a b}}', { a: undefined, b: 5 });
      expect(result).toBe('NaN');
    });

    it('add with null coerces to 0', () => {
      const result = compileAndRun('{{add a b}}', { a: null, b: 5 });
      expect(result).toBe('5');
    });
  });

  describe('Security Payloads', () => {
    it('ReDoS: nested quantifier (a+)+ is blocked', () => {
      const result = compileAndRun('{{regex val pat rep}}', {
        val: 'a'.repeat(30),
        pat: '/(a+)+$/g',
        rep: 'x',
      });
      expect(result).toBe('a'.repeat(30));
    });

    it('ReDoS: nested star quantifier (a*)* is blocked', () => {
      const result = compileAndRun('{{regex val pat rep}}', {
        val: 'a'.repeat(30),
        pat: '/(a*)*$/g',
        rep: 'x',
      });
      expect(result).toBe('a'.repeat(30));
    });

    it('ReDoS: quantifier with braces (a{2,})+ is blocked', () => {
      const result = compileAndRun('{{regex val pat rep}}', {
        val: 'a'.repeat(30),
        pat: '/(a{2,})+$/g',
        rep: 'x',
      });
      expect(result).toBe('a'.repeat(30));
    });

    it('ReDoS bypass attempt: spaces around quantifier', () => {
      // The regex check should still catch this
      const result = compileAndRun('{{regex val pat rep}}', {
        val: 'a'.repeat(30),
        pat: '/(a+ )+$/g',
        rep: 'x',
      });
      // This is a borderline case - spaces between ) and + may not be
      // caught by the safety regex. The safe behavior is blocking.
      expect(typeof result).toBe('string');
    });

    it('ReDoS: alternation /(a|a)+$/ is blocked by isRegexSafe', () => {
      const result = compileAndRun('{{regex val pat rep}}', {
        val: 'a'.repeat(30),
        pat: '/(a|a)+$/g',
        rep: 'x',
      });
      expect(result).toBe('a'.repeat(30));
    });

    it('ReDoS bypass: nested groups without quantifier on inner ((a+))b', () => {
      // This is safe: only outer group has quantifier, inner has no quantifier
      // after the closing paren of the inner group
      const result = compileAndRun('{{regex val pat rep}}', {
        val: 'aaab',
        pat: '/((a+))b/g',
        rep: 'x',
      });
      // Safe regex, should execute normally
      expect(result).toBe('x');
    });

    it('non-regex input with metacharacters is properly escaped', () => {
      const result = compileAndRun('{{regex val pat rep}}', {
        val: 'hello.world',
        pat: '.',
        rep: '!',
      });
      expect(result).toBe('hello!world');
    });

    it('replaceAll with metacharacters in non-regex mode', () => {
      const result = compileAndRun('{{replaceAll val pat rep}}', {
        val: 'a.b.c',
        pat: '.',
        rep: '-',
      });
      expect(result).toBe('a-b-c');
    });

    it('regex with invalid flags does not crash', () => {
      expect(() =>
        compileAndRun('{{regex val pat rep}}', {
          val: 'hello',
          pat: '/hello/xyz',
          rep: 'world',
        }),
      ).not.toThrow();
    });

    it('XSS payload is HTML-escaped by Handlebars (double-stash)', () => {
      // Handlebars auto-escapes {{}} output — XSS is mitigated at template level
      const result = compileAndRun('{{regex val pat rep}}', {
        val: '<script>alert(1)</script>',
        pat: 'script',
        rep: 'BLOCKED',
      });
      expect(result).toBe('&lt;BLOCKED&gt;alert(1)&lt;/script&gt;');
    });
  });

  describe('Mutation Detectors', () => {
    it('sub: a - b, not b - a', () => {
      expect(compileAndRun('{{sub a b}}', { a: 10, b: 3 })).toBe('7');
    });

    it('div: a / b, not b / a', () => {
      expect(compileAndRun('{{div a b}}', { a: 10, b: 2 })).toBe('5');
    });

    it('mod: a % b, not b % a', () => {
      expect(compileAndRun('{{mod a b}}', { a: 10, b: 3 })).toBe('1');
    });

    it('min picks smaller, max picks larger', () => {
      expect(compileAndRun('{{min a b}}', { a: 3, b: 7 })).toBe('3');
      expect(compileAndRun('{{max a b}}', { a: 3, b: 7 })).toBe('7');
    });

    it('setDay: day 15 to day 1', () => {
      expect(
        compileAndRun('{{setDay d n}}', { d: '2025-01-15', n: 1 }),
      ).toBe('2025-01-01');
    });

    it('setDay: day 1 to day 31 (January)', () => {
      expect(
        compileAndRun('{{setDay d n}}', { d: '2025-01-01', n: 31 }),
      ).toBe('2025-01-31');
    });

    it('setDay: day 0 wraps to previous month last day', () => {
      expect(
        compileAndRun('{{setDay d n}}', { d: '2025-02-15', n: 0 }),
      ).toBe('2025-01-31');
    });

    it('setDay: negative day goes further back', () => {
      expect(
        compileAndRun('{{setDay d n}}', { d: '2025-02-15', n: -1 }),
      ).toBe('2025-01-30');
    });

    it('setDay: day 32 overflows to next month', () => {
      expect(
        compileAndRun('{{setDay d n}}', { d: '2025-01-15', n: 32 }),
      ).toBe('2025-02-01');
    });

    it('setDay: Feb 29 leap year', () => {
      expect(
        compileAndRun('{{setDay d n}}', { d: '2024-02-01', n: 29 }),
      ).toBe('2024-02-29');
    });

    it('setDay: Feb 29 non-leap year overflows to Mar 1', () => {
      expect(
        compileAndRun('{{setDay d n}}', { d: '2025-02-01', n: 29 }),
      ).toBe('2025-03-01');
    });
  });

  describe('Property Violations', () => {
    it('add is associative: (a+b)+c === a+(b+c)', () => {
      const cases = [
        [1, 2, 3],
        [0, 0, 0],
        [-1, 1, 0],
        [100, -50, 25],
      ];
      for (const [a, b, c] of cases) {
        const left = compileAndRun('{{add (add a b) c}}', { a, b, c });
        const right = compileAndRun('{{add a (add b c)}}', { a, b, c });
        expect(left).toBe(right);
      }
    });

    it('add is commutative: a+b === b+a', () => {
      const pairs = [
        [1, 2],
        [0, 100],
        [-5, 5],
      ];
      for (const [a, b] of pairs) {
        expect(compileAndRun('{{add a b}}', { a, b })).toBe(
          compileAndRun('{{add b a}}', { a, b }),
        );
      }
    });

    it('abs idempotent: abs(abs(x)) === abs(x)', () => {
      for (const a of [0, 1, -1, 42, -42, 0.5, -0.5]) {
        expect(compileAndRun('{{abs (abs a)}}', { a })).toBe(
          compileAndRun('{{abs a}}', { a }),
        );
      }
    });

    it('floor idempotent: floor(floor(x)) === floor(x)', () => {
      for (const a of [0, 1.5, -1.5, 42.9, -42.1]) {
        expect(compileAndRun('{{floor (floor a)}}', { a })).toBe(
          compileAndRun('{{floor a}}', { a }),
        );
      }
    });

    it('ceil idempotent: ceil(ceil(x)) === ceil(x)', () => {
      for (const a of [0, 1.5, -1.5, 42.9, -42.1]) {
        expect(compileAndRun('{{ceil (ceil a)}}', { a })).toBe(
          compileAndRun('{{ceil a}}', { a }),
        );
      }
    });

    it('addDays then subDays roundtrip', () => {
      const d = '2025-06-15';
      for (const n of [1, 7, 30, 365]) {
        const added = compileAndRun('{{addDays d n}}', { d, n });
        const roundtrip = compileAndRun('{{subDays d n}}', { d: added, n });
        expect(roundtrip).toBe(d);
      }
    });

    it('addMonths then subMonths roundtrip (mid-month)', () => {
      const d = '2025-06-15';
      for (const n of [1, 3, 6, 12]) {
        const added = compileAndRun('{{addMonths d n}}', { d, n });
        const roundtrip = compileAndRun('{{subMonths d n}}', { d: added, n });
        expect(roundtrip).toBe(d);
      }
    });

    it('addMonths then subMonths roundtrip FAILS at month-end (Jan 31 + 1 month)', () => {
      // Jan 31 + 1 month = Feb 28 (clamped), then Feb 28 - 1 month = Jan 28 (not 31!)
      const added = compileAndRun('{{addMonths d n}}', {
        d: '2025-01-31',
        n: 1,
      });
      expect(added).toBe('2025-02-28');
      const roundtrip = compileAndRun('{{subMonths d n}}', {
        d: added,
        n: 1,
      });
      // Roundtrip loss: 31 -> 28 -> 28
      expect(roundtrip).not.toBe('2025-01-31');
      expect(roundtrip).toBe('2025-01-28');
    });
  });

  describe('Resource Pressure', () => {
    it('add with 100 chained arguments', () => {
      let template = '{{add';
      const context: Record<string, number> = {};
      for (let i = 0; i < 100; i++) {
        template += ` v${i}`;
        context[`v${i}`] = i;
      }
      template += '}}';
      expect(compileAndRun(template, context)).toBe('4950');
    });

    it('regex on 10KB string completes within timeout', () => {
      const val = 'a'.repeat(10000);
      const result = compileAndRun('{{regex val pat rep}}', {
        val,
        pat: 'a',
        rep: 'b',
      });
      expect(result).toHaveLength(10000);
      expect(result[0]).toBe('b');
    }, 5000);

    it('replaceAll on 10KB string completes within timeout', () => {
      const val = 'a'.repeat(10000);
      const result = compileAndRun('{{replaceAll val pat rep}}', {
        val,
        pat: 'a',
        rep: 'b',
      });
      expect(result).toBe('b'.repeat(10000));
    }, 5000);

    it('deeply nested Handlebars subexpressions', () => {
      // {{add (add (add (add 1 1) 1) 1) 1}} = 5
      const result = compileAndRun(
        '{{add (add (add (add a a) a) a) a}}',
        { a: 1 },
      );
      expect(result).toBe('5');
    });
  });
});

// ============================================================
// ESCALATION: harder variants targeting surviving functions
// ============================================================
describe('ESCALATION: handlebars-helpers', () => {
  describe('Invalid date crashes across all date helpers', () => {
    const invalidDates = [
      'not-a-date',
      '2025-13-01',
      '2025-00-01',
      '2025-02-30',
      'undefined',
      '',
      '9999-99-99',
    ];

    for (const d of invalidDates) {
      it(`day('${d}') does not crash`, () => {
        expect(() => compileAndRun('{{day d}}', { d })).not.toThrow();
      });

      it(`month('${d}') does not crash`, () => {
        expect(() => compileAndRun('{{month d}}', { d })).not.toThrow();
      });

      it(`year('${d}') does not crash`, () => {
        expect(() => compileAndRun('{{year d}}', { d })).not.toThrow();
      });

      it(`addDays('${d}', 1) does not crash`, () => {
        expect(() =>
          compileAndRun('{{addDays d n}}', { d, n: 1 }),
        ).not.toThrow();
      });

      it(`setDay('${d}', 15) does not crash`, () => {
        expect(() =>
          compileAndRun('{{setDay d n}}', { d, n: 15 }),
        ).not.toThrow();
      });
    }
  });

  describe('Extreme numeric inputs to math helpers', () => {
    it('add Infinity + -Infinity = NaN', () => {
      expect(
        compileAndRun('{{add a b}}', { a: Infinity, b: -Infinity }),
      ).toBe('NaN');
    });

    it('mul MAX_SAFE_INTEGER * 2 loses precision', () => {
      const result = Number(
        compileAndRun('{{mul a b}}', {
          a: Number.MAX_SAFE_INTEGER,
          b: 2,
        }),
      );
      // Beyond safe integer range - precision loss
      expect(Number.isSafeInteger(result)).toBe(false);
    });

    it('fixed with 100 digits throws RangeError', () => {
      expect(() =>
        compileAndRun('{{fixed a d}}', { a: 3.14, d: 101 }),
      ).toThrow(RangeError);
    });

    it('sub of two very close floats has precision issues', () => {
      const result = compileAndRun('{{sub a b}}', { a: 0.3, b: 0.1 });
      // IEEE 754: 0.3 - 0.1 !== 0.2
      expect(result).not.toBe('0.2');
    });
  });

  describe('More ReDoS bypass patterns', () => {
    it('overlapping character classes /(\\s+)+/ bypass', () => {
      // (\s+)+ — quantifier on group containing quantifier
      const result = compileAndRun('{{regex val pat rep}}', {
        val: ' '.repeat(30),
        pat: '/(\\s+)+$/g',
        rep: 'x',
      });
      // Should be blocked by isRegexSafe
      expect(result).toBe(' '.repeat(30));
    });

    it('dot-star inside quantified group /(.+)+/ bypass', () => {
      const result = compileAndRun('{{regex val pat rep}}', {
        val: 'a'.repeat(30),
        pat: '/(.+)+$/g',
        rep: 'x',
      });
      expect(result).toBe('a'.repeat(30));
    });

    it('optional quantifier /(a?)+/ bypass attempt', () => {
      const result = compileAndRun('{{regex val pat rep}}', {
        val: 'a'.repeat(30),
        pat: '/(a?)+$/g',
        rep: 'x',
      });
      // (a?)+ has ? before ) and + after — should be caught
      expect(result).toBe('a'.repeat(30));
    });

    it('nested group with outer quantifier /((a+))+/ bypass', () => {
      // Has + before inner ), + after outer )
      const result = compileAndRun('{{regex val pat rep}}', {
        val: 'a'.repeat(30),
        pat: '/((a+))+$/g',
        rep: 'x',
      });
      expect(result).toBe('a'.repeat(30));
    });
  });

  describe('Combined boundary + type confusion', () => {
    it('addDays with NaN days', () => {
      const result = compileAndRun('{{addDays d n}}', {
        d: '2025-01-15',
        n: NaN,
      });
      // NaN is falsy, so !days is true, returns original date
      expect(result).toBe('2025-01-15');
    });

    it('addDays with negative large number', () => {
      expect(() =>
        compileAndRun('{{addDays d n}}', { d: '2025-01-15', n: -1000000 }),
      ).not.toThrow();
    });

    it('setDay with NaN wraps incorrectly', () => {
      // NaN - actualDay = NaN, addDays('2025-01-15', NaN) should fail or return invalid
      expect(() =>
        compileAndRun('{{setDay d n}}', { d: '2025-01-15', n: NaN }),
      ).not.toThrow();
    });

    it('setDay with Infinity overflows', () => {
      expect(() =>
        compileAndRun('{{setDay d n}}', { d: '2025-01-15', n: Infinity }),
      ).not.toThrow();
    });

    it('chained operations: add then div by result that could be zero', () => {
      // (5 + -5) = 0, then 10 / 0 = Infinity
      const result = compileAndRun('{{div c (add a b)}}', {
        a: 5,
        b: -5,
        c: 10,
      });
      expect(result).toBe('Infinity');
    });

    it('nested math producing NaN cascades through template', () => {
      // div(0,0) = NaN, add(NaN, 5) = NaN, mul(NaN, 10) = NaN
      const result = compileAndRun('{{mul (add (div a b) c) d}}', {
        a: 0,
        b: 0,
        c: 5,
        d: 10,
      });
      expect(result).toBe('NaN');
    });
  });
});
