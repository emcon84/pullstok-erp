import { describe, expect, it } from "vitest";
import { groupByLetter } from "../utils/groupByLetter";

const c = (name?: string | null) => ({ name });

describe("groupByLetter", () => {
  it("groups by first letter, sorted alphabetically", () => {
    const groups = groupByLetter([c("Beto"), c("Ana"), c("Alberto")]);
    expect(groups.map((g) => g.letter)).toEqual(["A", "B"]);
    expect(groups[0].items.map((i) => i.name)).toEqual(["Alberto", "Ana"]);
  });

  it("ignores accents and case when grouping and sorting", () => {
    const groups = groupByLetter([c("álvaro"), c("Ana"), c("zoe")]);
    expect(groups.map((g) => g.letter)).toEqual(["A", "Z"]);
    expect(groups[0].items.map((i) => i.name)).toEqual(["álvaro", "Ana"]);
  });

  it("puts non-letter and nameless customers in a trailing # group", () => {
    const groups = groupByLetter([c("123 Foods"), c(undefined), c("Ana")]);
    expect(groups.map((g) => g.letter)).toEqual(["A", "#"]);
    expect(groups[1].items).toHaveLength(2);
  });

  it("returns an empty list for no customers", () => {
    expect(groupByLetter([])).toEqual([]);
  });
});
