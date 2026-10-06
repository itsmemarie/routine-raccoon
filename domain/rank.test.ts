import { compareRank, rankAfter, rankForPosition, ranksAfter } from "./rank";

function order(ranks: readonly string[]): boolean {
  return ranks.every((r, i) => i === 0 || (ranks[i - 1] ?? "") < r);
}

describe("rankForPosition", () => {
  const siblings = [{ rank: "a0" }, { rank: "a1" }, { rank: "a2" }];

  it.each([
    [0, "first"],
    [1, "between the first two"],
    [3, "last"],
  ])("index %i (%s) needs only one new key", (index) => {
    const { rank, siblingRanks } = rankForPosition(siblings, index);
    expect(siblingRanks).toBeNull();
    const all = siblings.map((s) => s.rank);
    all.splice(index, 0, rank);
    expect(order(all)).toBe(true);
  });

  it("clamps out-of-range indexes", () => {
    expect(rankForPosition(siblings, -4).rank < "a0").toBe(true);
    expect(rankForPosition(siblings, 99).rank > "a2").toBe(true);
    expect(rankForPosition([], 3).rank).toBe("a0");
  });

  it("renumbers the siblings when neighbours share a key (two phones appended offline)", () => {
    const dupes = [{ rank: "a1" }, { rank: "a1" }, { rank: "a2" }];
    const { rank, siblingRanks } = rankForPosition(dupes, 1);
    expect(siblingRanks).toHaveLength(3);
    const all = [...(siblingRanks ?? [])];
    all.splice(1, 0, rank);
    expect(order(all)).toBe(true);
  });

  it("renumbers when a key isn't in a format the library produces", () => {
    const { siblingRanks } = rankForPosition([{ rank: "zzz" }, { rank: "!" }], 1);
    expect(siblingRanks).not.toBeNull();
  });
});

describe("rankAfter / ranksAfter tolerate bad keys", () => {
  it("appends after a valid key, restarts after an invalid one", () => {
    expect(rankAfter("a0") > "a0").toBe(true);
    expect(rankAfter("!!")).toBe("a0");
    expect(ranksAfter("!!", 2)).toEqual(["a0", "a1"]);
  });
});

describe("compareRank", () => {
  it("breaks ties by id, then section_id", () => {
    expect(compareRank({ rank: "a0", id: "b" }, { rank: "a0", id: "a" })).toBe(1);
    expect(compareRank({ rank: "a0", section_id: "a" }, { rank: "a0", section_id: "b" })).toBe(-1);
    expect(compareRank({ rank: "a0" }, { rank: "a1" })).toBe(-1);
  });
});
