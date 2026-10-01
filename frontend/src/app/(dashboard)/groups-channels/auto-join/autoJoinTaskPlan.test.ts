import { describe, expect, it } from "vitest";

import {
  buildJoinTasks,
  countDelays,
  shouldDelayBeforeNext,
} from "./autoJoinTaskPlan";

const accounts = ["user1", "user2", "user3"];
const groups = ["group1", "group2", "group3"];

const label = (t: { account: string; target: string }) =>
  `${t.account}→${t.target}`;

describe("buildJoinTasks", () => {
  it("groups the work: all accounts finish one group before the next", () => {
    const tasks = buildJoinTasks(groups, accounts, "all");

    expect(tasks.map(label)).toEqual([
      "user1→group1",
      "user2→group1",
      "user3→group1",
      "user1→group2",
      "user2→group2",
      "user3→group2",
      "user1→group3",
      "user2→group3",
      "user3→group3",
    ]);
  });

  it("covers every account-group pair", () => {
    const tasks = buildJoinTasks(groups, accounts, "all");

    expect(tasks).toHaveLength(groups.length * accounts.length);
  });

  it("assigns one account per group when distributing", () => {
    const tasks = buildJoinTasks(groups, accounts, "distribute");

    expect(tasks.map(label)).toEqual([
      "user1→group1",
      "user2→group2",
      "user3→group3",
    ]);
  });
});

describe("shouldDelayBeforeNext", () => {
  it("does not pause between accounts on the same group", () => {
    const tasks = buildJoinTasks(groups, accounts, "all");

    // user1→g1 then user2→g1: same group, no pause.
    expect(shouldDelayBeforeNext(tasks, 0)).toBe(false);
    expect(shouldDelayBeforeNext(tasks, 1)).toBe(false);
  });

  it("pauses when moving to the next group", () => {
    const tasks = buildJoinTasks(groups, accounts, "all");

    // user3→g1 then user1→g2: group changed, pause.
    expect(shouldDelayBeforeNext(tasks, 2)).toBe(true);
  });

  it("never pauses after the final task", () => {
    const tasks = buildJoinTasks(groups, accounts, "all");

    expect(shouldDelayBeforeNext(tasks, tasks.length - 1)).toBe(false);
  });

  it("pauses after every task in distribute mode", () => {
    const tasks = buildJoinTasks(groups, accounts, "distribute");

    expect(tasks.slice(0, -1).every((_, i) => shouldDelayBeforeNext(tasks, i))).toBe(
      true
    );
  });
});

describe("countDelays", () => {
  it("is one pause per group transition, not per join", () => {
    const tasks = buildJoinTasks(groups, accounts, "all");

    // 3 groups => 2 pauses, regardless of how many accounts there are.
    expect(countDelays(tasks)).toBe(2);
  });

  it("scales with groups, not with account count", () => {
    const many = ["u1", "u2", "u3", "u4", "u5", "u6"];

    expect(countDelays(buildJoinTasks(groups, many, "all"))).toBe(2);
  });

  it("has no pause for a single group", () => {
    expect(countDelays(buildJoinTasks(["group1"], accounts, "all"))).toBe(0);
  });

  it("is empty for no tasks", () => {
    expect(countDelays([])).toBe(0);
  });
});
