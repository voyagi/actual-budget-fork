import {
  addMonths,
  addWeeks,
  addYears,
  subMonths,
  subWeeks,
  subYears,
} from 'date-fns';
import * as Handlebars from 'handlebars';

import { logger } from '../../platform/server/log';
import { addDays, format, parseDate, subDays } from '../../shared/months';

export function registerHandlebarsHelpers() {
  const regexTest = /^\/(.*)\/([gimuy]*)$/;

  /**
   * Escape regex metacharacters in a string for safe use in RegExp constructor.
   * Prevents ReDoS when payee names contain characters like . + * ? etc. (sec-17)
   */
  function escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Detect potentially catastrophic regex patterns (nested quantifiers).
   * Returns true if the pattern appears safe, false if it may cause ReDoS.
   *
   * Note: Handlebars helpers are called synchronously (action.ts line 150),
   * so worker_threads timeout is not viable. This pre-check rejects the most
   * dangerous patterns before execution. Combined with try/catch on all apply
   * calls for graceful error handling.
   */
  function isRegexSafe(pattern: string): boolean {
    // Reject nested quantifiers like (a+)+, (a*)+, (a{2,})+, etc.
    // These are the primary cause of catastrophic backtracking.
    const nestedQuantifier =
      /([+*?]|\{[0-9]+,?\})\s*[)]\s*([+*?]|\{[0-9]+,?\})/;
    // Catch nested groups: ((a+))+ where inner ) breaks the direct match
    const nestedGroupQuantifier =
      /([+*?]|\{[0-9]+,?\})\s*\)\s*\)\s*([+*?]|\{[0-9]+,?\})/;
    // Catch alternation inside quantified groups: (a|a)+ or (a|b|c)+
    // where the group content has | and the group is quantified
    const alternationQuantifier = /\([^)]*\|[^)]*\)\s*([+*?]|\{[0-9]+,?\})/;
    return (
      !nestedQuantifier.test(pattern) &&
      !nestedGroupQuantifier.test(pattern) &&
      !alternationQuantifier.test(pattern)
    );
  }

  function mathHelper(fn: (a: number, b: number) => number) {
    return (a: unknown, ...b: unknown[]) => {
      return b.map(Number).reduce(fn, Number(a));
    };
  }

  function regexHelper(
    mapRegex: (regex: string, flags: string) => string | RegExp,
    mapNonRegex: (value: string) => string | RegExp,
    apply: (value: string, regex: string | RegExp, replace: string) => string,
  ) {
    return (value: unknown, regex: unknown, replace: unknown) => {
      if (value == null) {
        return null;
      }

      if (typeof regex !== 'string' || typeof replace !== 'string') {
        return '';
      }

      const match = regexTest.exec(regex);
      // Regex-literal branch: /regex/flags - apply safety checks
      if (match) {
        if (!isRegexSafe(match[1])) {
          logger.log(
            `[handlebars] Blocked potentially catastrophic regex: ${regex}`,
          );
          return String(value);
        }
        const regexp = mapRegex(match[1], match[2]);
        try {
          return apply(String(value), regexp, String(replace));
        } catch (e) {
          logger.log(
            `[handlebars] Regex operation failed: ${(e as Error).message}`,
          );
          return String(value);
        }
      }

      // Non-regex branch: escaped input, safe, runs synchronously
      const regexp = mapNonRegex(String(regex));
      try {
        return apply(String(value), regexp, String(replace));
      } catch (e) {
        logger.log(
          `[handlebars] Regex operation failed: ${(e as Error).message}`,
        );
        return String(value);
      }
    };
  }

  const helpers = {
    regex: regexHelper(
      (regex, flags) => new RegExp(regex, flags),
      value => new RegExp(escapeRegExp(value)),
      (value, regex, replace) => value.replace(regex, replace),
    ),
    replace: regexHelper(
      (regex, flags) => new RegExp(regex, flags),
      value => value,
      (value, regex, replace) => value.replace(regex, replace),
    ),
    replaceAll: regexHelper(
      (regex, flags) => new RegExp(regex, flags),
      value => value,
      (value, regex, replace) => value.replaceAll(regex, replace),
    ),
    add: mathHelper((a, b) => a + b),
    sub: mathHelper((a, b) => a - b),
    div: mathHelper((a, b) => a / b),
    mul: mathHelper((a, b) => a * b),
    mod: mathHelper((a, b) => a % b),
    floor: (a: unknown) => Math.floor(Number(a)),
    ceil: (a: unknown) => Math.ceil(Number(a)),
    round: (a: unknown) => Math.round(Number(a)),
    abs: (a: unknown) => Math.abs(Number(a)),
    min: mathHelper((a, b) => Math.min(a, b)),
    max: mathHelper((a, b) => Math.max(a, b)),
    fixed: (a: unknown, digits: unknown) => Number(a).toFixed(Number(digits)),
    day: (date?: string) => {
      if (!date) return date;
      try {
        return format(date, 'd');
      } catch {
        return undefined;
      }
    },
    month: (date?: string) => {
      if (!date) return date;
      try {
        return format(date, 'M');
      } catch {
        return undefined;
      }
    },
    year: (date?: string) => {
      if (!date) return date;
      try {
        return format(date, 'yyyy');
      } catch {
        return undefined;
      }
    },
    format: (date?: string, f?: string) => {
      if (!date || !f) return date;
      try {
        return format(date, f);
      } catch {
        return undefined;
      }
    },
    addDays: (date?: string, days?: number) => {
      if (!date || !days) return date;
      try {
        return format(addDays(date, days), 'yyyy-MM-dd');
      } catch {
        return undefined;
      }
    },
    subDays: (date?: string, days?: number) => {
      if (!date || !days) return date;
      try {
        return format(subDays(date, days), 'yyyy-MM-dd');
      } catch {
        return undefined;
      }
    },
    addMonths: (date?: string, months?: number) => {
      if (!date || !months) return date;
      try {
        return format(addMonths(parseDate(date), months), 'yyyy-MM-dd');
      } catch {
        return undefined;
      }
    },
    subMonths: (date?: string, months?: number) => {
      if (!date || !months) return date;
      try {
        return format(subMonths(parseDate(date), months), 'yyyy-MM-dd');
      } catch {
        return undefined;
      }
    },
    addWeeks: (date?: string, weeks?: number) => {
      if (!date || !weeks) return date;
      try {
        return format(addWeeks(parseDate(date), weeks), 'yyyy-MM-dd');
      } catch {
        return undefined;
      }
    },
    subWeeks: (date?: string, weeks?: number) => {
      if (!date || !weeks) return date;
      try {
        return format(subWeeks(parseDate(date), weeks), 'yyyy-MM-dd');
      } catch {
        return undefined;
      }
    },
    addYears: (date?: string, years?: number) => {
      if (!date || !years) return date;
      try {
        return format(addYears(parseDate(date), years), 'yyyy-MM-dd');
      } catch {
        return undefined;
      }
    },
    subYears: (date?: string, years?: number) => {
      if (!date || !years) return date;
      try {
        return format(subYears(parseDate(date), years), 'yyyy-MM-dd');
      } catch {
        return undefined;
      }
    },
    setDay: (date?: string, day?: number) => {
      if (!date || day == null || !Number.isFinite(day)) return date;
      try {
        const actualDay = Number(format(date, 'd'));
        return format(addDays(date, day - actualDay), 'yyyy-MM-dd');
      } catch {
        return undefined;
      }
    },
    debug: (value: unknown) => {
      logger.log(value);
    },
    concat: (...args: unknown[]) => args.join(''),
  } as Record<string, Handlebars.HelperDelegate>;

  for (const [name, fn] of Object.entries(helpers)) {
    Handlebars.registerHelper(name, (...args: unknown[]) => {
      //The last argument is the Handlebars options object
      return fn(...args.slice(0, -1));
    });
  }
}
