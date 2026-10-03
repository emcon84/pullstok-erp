export const OTHER_GROUP = "#";

export interface LetterGroup<T> {
  letter: string;
  items: T[];
}

const normalize = (value: string) =>
  value.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

/** Groups items by the first letter of their name (accents ignored); non-letters go to a trailing "#" group. */
export function groupByLetter<T extends { name?: string | null }>(
  items: T[],
): LetterGroup<T>[] {
  const keyOf = (item: T) => {
    const first = normalize(item.name?.trim() ?? "")[0];
    return first && /[A-Z]/.test(first) ? first : OTHER_GROUP;
  };
  const sortKey = (item: T) => normalize(item.name?.trim() ?? "");

  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const bucket = map.get(key);
    if (bucket) bucket.push(item);
    else map.set(key, [item]);
  }

  return [...map.entries()]
    .sort(([a], [b]) =>
      a === OTHER_GROUP ? 1 : b === OTHER_GROUP ? -1 : a.localeCompare(b),
    )
    .map(([letter, list]) => ({
      letter,
      items: [...list].sort((a, b) =>
        sortKey(a).localeCompare(sortKey(b), "es"),
      ),
    }));
}
