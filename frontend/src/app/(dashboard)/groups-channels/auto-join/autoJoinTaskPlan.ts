/** Build the ordered join tasks and decide where the pacing pause belongs. */

export interface AutoJoinTask<TAccount, TTarget> {
  account: TAccount;
  target: TTarget;
}

/**
 * "all" runs every selected account against every group, grouped so all
 * accounts finish one group before the next one starts. "distribute" hands
 * each group to a single account round-robin.
 */
export function buildJoinTasks<TAccount, TTarget>(
  targets: TTarget[],
  accounts: TAccount[],
  distributionMode: "all" | "distribute"
): AutoJoinTask<TAccount, TTarget>[] {
  const tasks: AutoJoinTask<TAccount, TTarget>[] = [];

  if (distributionMode === "all") {
    for (const target of targets) {
      for (const account of accounts) {
        tasks.push({ account, target });
      }
    }
  } else {
    targets.forEach((target, idx) => {
      tasks.push({ account: accounts[idx % accounts.length], target });
    });
  }

  return tasks;
}

/**
 * Whether to pause before the next task.
 *
 * The pause belongs between groups, not between individual joins. Delaying
 * after every task meant three accounts against a single group cost three
 * delays before moving on, which is not what the setting describes.
 */
export function shouldDelayBeforeNext<TAccount, TTarget>(
  tasks: AutoJoinTask<TAccount, TTarget>[],
  index: number
): boolean {
  const next = tasks[index + 1];
  if (!next) return false;
  return next.target !== tasks[index].target;
}

/** The number of pauses a run will take, i.e. groups minus one. */
export function countDelays<TAccount, TTarget>(
  tasks: AutoJoinTask<TAccount, TTarget>[]
): number {
  let delays = 0;
  for (let i = 0; i < tasks.length; i++) {
    if (shouldDelayBeforeNext(tasks, i)) delays++;
  }
  return delays;
}
