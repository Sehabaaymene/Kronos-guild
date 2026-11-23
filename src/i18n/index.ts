import { en, type Dictionary } from './en';

/**
 * Tiny translation layer. To add French later:
 *   1. copy en.ts to fr.ts and translate the values,
 *   2. register it in `dictionaries` below,
 *   3. add a language option in Settings that calls setLanguage('fr').
 */
const dictionaries: Record<string, Dictionary> = { en };
let current: Dictionary = en;

export function setLanguage(lang: string) {
  current = dictionaries[lang] ?? en;
}

export type TKey = keyof Dictionary;

export function t(key: TKey, vars?: Record<string, string | number>): string {
  let s: string = current[key] ?? en[key] ?? String(key);
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(new RegExp(`{${k}}`, 'g'), String(v));
  return s;
}
