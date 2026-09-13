export type TranslationScalar = string | number | boolean;

export type TranslationArrayItem =
  | TranslationScalar
  | null
  | TranslationArray
  | TranslationArrayObject;

export type TranslationArray = TranslationArrayItem[];

export type TranslationArrayObject = {
  [key: string]: TranslationArrayItem;
};

/**
 * One locale value for a translation key. Plain objects are namespaces in
 * locale documents; arrays are atomic values and may contain nested objects.
 */
export type TranslationValue = TranslationScalar | TranslationArray;

export type TranslationValues = Record<string, TranslationValue | null>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTranslationArrayItem(value: unknown): value is TranslationArrayItem {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return true;
  }
  if (Array.isArray(value)) return value.every(isTranslationArrayItem);
  if (!isPlainObject(value)) return false;
  return Object.values(value).every(isTranslationArrayItem);
}

export function isTranslationValue(value: unknown): value is TranslationValue {
  return (
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value)) ||
    (Array.isArray(value) && value.every(isTranslationArrayItem))
  );
}

export function isStructuredTranslationValue(
  value: TranslationValue | null | undefined,
): boolean {
  return value !== null && value !== undefined && typeof value !== 'string';
}

/** Deep JSON equality. Array order matters; object property order does not. */
export function translationValueEquals(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }
    return left.every((entry, index) => translationValueEquals(entry, right[index]));
  }

  if (isPlainObject(left) || isPlainObject(right)) {
    if (!isPlainObject(left) || !isPlainObject(right)) return false;
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length) return false;
    return leftKeys.every(
      (key) => Object.hasOwn(right, key) && translationValueEquals(left[key], right[key]),
    );
  }

  return false;
}

export function formatTranslationValue(value: TranslationValue | null): string {
  if (value === null) return '—';
  if (typeof value === 'string') return JSON.stringify(value);
  return JSON.stringify(value, null, Array.isArray(value) ? 2 : undefined);
}
