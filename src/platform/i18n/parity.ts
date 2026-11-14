// Mechanical check of the message catalogs (SPEC-000 AC21): same keys, same variables, valid ICU.
import { TYPE, parse, type MessageFormatElement } from '@formatjs/icu-messageformat-parser';
import { DEFAULT_LOCALE, LOCALES, type Locale } from './locales.ts';
import { flattenCatalog, type Catalog } from './messages.ts';

export type ProblemKind =
  | 'missing_key'
  | 'extra_key'
  | 'bad_key_name'
  | 'empty'
  | 'syntax'
  | 'placeholders'
  | 'apostrophe'
  | 'rich_text';

export interface ParityProblem {
  locale: Locale;
  key: string;
  kind: ProblemKind;
  detail: string;
}

const KEY_NAME = /^[a-z][a-zA-Z0-9_]*(\.[a-z][a-zA-Z0-9_]*)*$/;

/** Names of the variables a message needs, e.g. {count, plural, ...} -> 'count'. */
function variablesOf(
  elements: readonly MessageFormatElement[],
  found = new Set<string>(),
): Set<string> {
  for (const element of elements) {
    switch (element.type) {
      case TYPE.argument:
      case TYPE.number:
      case TYPE.date:
      case TYPE.time:
        found.add(element.value);
        break;
      case TYPE.select:
      case TYPE.plural:
        found.add(element.value);
        for (const option of Object.values(element.options)) variablesOf(option.value, found);
        break;
      case TYPE.tag:
        found.add(`<${element.value}>`);
        variablesOf(element.children, found);
        break;
      default:
        break;
    }
  }
  return found;
}

const sorted = (set: Set<string>): string => [...set].sort().join(', ') || '(none)';

/** Returns every problem; an empty array means the catalogs are consistent. */
export function checkCatalogs(catalogs: Record<Locale, Catalog>): ParityProblem[] {
  const problems: ParityProblem[] = [];
  const reference = flattenCatalog(catalogs[DEFAULT_LOCALE]);
  const referenceVariables = new Map<string, Set<string>>();

  for (const locale of LOCALES) {
    const flat = flattenCatalog(catalogs[locale]);
    const add = (key: string, kind: ProblemKind, detail: string): void => {
      problems.push({ locale, key, kind, detail });
    };

    if (locale !== DEFAULT_LOCALE) {
      for (const key of reference.keys()) {
        if (!flat.has(key))
          add(key, 'missing_key', `present in ${DEFAULT_LOCALE}, absent in ${locale}`);
      }
      for (const key of flat.keys()) {
        if (!reference.has(key))
          add(key, 'extra_key', `absent in ${DEFAULT_LOCALE}, present in ${locale}`);
      }
    }

    for (const [key, message] of flat) {
      if (!KEY_NAME.test(key)) add(key, 'bad_key_name', 'keys are dotted lowercase identifiers');
      if (message.trim() === '') {
        add(key, 'empty', 'the message is empty');
        continue;
      }
      if (message.includes("'")) {
        add(
          key,
          'apostrophe',
          'use the typographic apostrophe (U+2019): a straight one is an ICU escape',
        );
      }
      let ast: MessageFormatElement[];
      try {
        ast = parse(message);
      } catch (error) {
        add(key, 'syntax', `invalid ICU message: ${(error as Error).message.slice(0, 120)}`);
        continue;
      }
      const variables = variablesOf(ast);
      if ([...variables].some((name) => name.startsWith('<'))) {
        add(key, 'rich_text', 'tags are not allowed in messages yet (no HTML in messages)');
      }
      if (locale === DEFAULT_LOCALE) {
        referenceVariables.set(key, variables);
      } else {
        const expected = referenceVariables.get(key);
        if (expected && sorted(expected) !== sorted(variables)) {
          add(
            key,
            'placeholders',
            `variables {${sorted(variables)}} differ from ${DEFAULT_LOCALE} {${sorted(expected)}}`,
          );
        }
      }
    }
  }
  return problems;
}
