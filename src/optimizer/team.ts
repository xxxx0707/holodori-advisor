import { cardMeets, evaluateTeam, soloScore, type EvalContext, type TeamEvaluation, type UnmetCondition } from '../model/evaluate';
import type { Card, Team } from '../model/types';

export interface SwapHint {
  unmet: UnmetCondition;
  addCardId: string | null;
  removeCardId: string | null;
  newScore: number | null;
}

export interface TeamResult {
  team: Team;
  evaluation: TeamEvaluation;
  hints: SwapHint[];
}

export interface SearchOptions {
  pinnedCardIds: string[];
  excludedCardIds: string[];
  /** 単体評価の上位から何枚を組合せ候補にするか */
  topK?: number;
  /** リーダー衣装の条件を満たすカードを追加で何枚候補に入れるか */
  conditionExtra?: number;
  resultCount?: number;
  onProgress?: (done: number, total: number) => void;
}

const teamKey = (t: Team) => `${t.leaderCardId}|${[...t.memberCardIds].sort().join(',')}`;

export function searchBestTeams(ctx: EvalContext, opts: SearchOptions): TeamResult[] {
  const topK = opts.topK ?? 15;
  const conditionExtra = opts.conditionExtra ?? 6;
  const resultCount = opts.resultCount ?? 3;
  const excluded = new Set(opts.excludedCardIds);
  const owned = [...ctx.cards.values()].filter((c) => !excluded.has(c.id));
  const solo = new Map(owned.map((c) => [c.id, soloScore(c, ctx)] as const));
  const bySolo = (a: Card, b: Card) => solo.get(b.id)! - solo.get(a.id)!;

  const leaders: (Card | null)[] = owned.filter((c) => c.costume);
  if (leaders.length === 0) leaders.push(null);

  const memberCount = ctx.settings.memberCount;
  const best: { key: string; score: number; team: Team }[] = [];
  const consider = (team: Team) => {
    const score = evaluateTeam(team, ctx).score;
    if (best.length >= resultCount && score <= best[best.length - 1].score) return;
    const key = teamKey(team);
    if (best.some((b) => b.key === key)) return;
    best.push({ key, score, team });
    best.sort((a, b) => b.score - a.score);
    if (best.length > resultCount) best.pop();
  };

  leaders.forEach((leader, li) => {
    const blocked = new Set<string>();
    let pool = owned.filter((c) => c.id !== leader?.id);
    if (leader && !ctx.settings.allowLeaderHolomemInMembers) pool = pool.filter((c) => c.holomemId !== leader.holomemId);

    // 固定カード（同じホロメンが重複する場合は先のものを採用）
    const pinned: Card[] = [];
    for (const id of opts.pinnedCardIds) {
      const c = pool.find((p) => p.id === id);
      if (c && !blocked.has(c.holomemId) && pinned.length < memberCount) {
        pinned.push(c);
        blocked.add(c.holomemId);
      }
    }
    const rest = pool.filter((c) => !pinned.includes(c) && !blocked.has(c.holomemId)).sort(bySolo);
    const cand = rest.slice(0, topK);
    if (leader?.costume) {
      const cond = leader.costume.skill.condition;
      const extra = rest.filter((c) => !cand.includes(c) && cardMeets(c, cond, ctx.holomems)).slice(0, conditionExtra);
      cand.push(...extra);
    }

    const need = Math.min(memberCount - pinned.length, new Set(cand.map((c) => c.holomemId)).size);
    const chosen: Card[] = [];
    const used = new Set(blocked);
    const rec = (start: number) => {
      if (chosen.length === need) {
        consider({ leaderCardId: leader?.id ?? null, memberCardIds: [...pinned, ...chosen].map((c) => c.id) });
        return;
      }
      for (let i = start; i <= cand.length - (need - chosen.length); i++) {
        const c = cand[i];
        if (used.has(c.holomemId)) continue;
        used.add(c.holomemId);
        chosen.push(c);
        rec(i + 1);
        chosen.pop();
        used.delete(c.holomemId);
      }
    };
    rec(0);
    opts.onProgress?.(li + 1, leaders.length);
  });

  return best.map((b) => {
    const evaluation = evaluateTeam(b.team, ctx);
    return { team: b.team, evaluation, hints: buildHints(b.team, evaluation, ctx, owned, opts.pinnedCardIds) };
  });
}

/** 未達の条件について「誰を誰と入れ替えれば発動するか」を 1 枚入れ替えで探す */
export function buildHints(team: Team, ev: TeamEvaluation, ctx: EvalContext, owned: Card[], pinnedIds: string[]): SwapHint[] {
  const inTeam = new Set([team.leaderCardId, ...team.memberCardIds]);
  const leader = team.leaderCardId ? ctx.cards.get(team.leaderCardId) : undefined;
  return ev.unmet.map((unmet) => {
    const hint: SwapHint = { unmet, addCardId: null, removeCardId: null, newScore: null };
    if (unmet.missing !== 1) return hint;
    const cond = unmet.skill.condition;
    const removable = team.memberCardIds
      .map((id) => ctx.cards.get(id)!)
      .filter((c) => c && !pinnedIds.includes(c.id) && c.id !== unmet.cardId && !cardMeets(c, cond, ctx.holomems));
    let bestScore = -Infinity;
    for (const add of owned) {
      if (inTeam.has(add.id) || !cardMeets(add, cond, ctx.holomems)) continue;
      if (leader && !ctx.settings.allowLeaderHolomemInMembers && add.holomemId === leader.holomemId) continue;
      for (const rm of removable) {
        const others = team.memberCardIds.filter((id) => id !== rm.id).map((id) => ctx.cards.get(id)!);
        if (others.some((o) => o.holomemId === add.holomemId)) continue;
        const t: Team = { leaderCardId: team.leaderCardId, memberCardIds: team.memberCardIds.map((id) => (id === rm.id ? add.id : id)) };
        const s = evaluateTeam(t, ctx).score;
        if (s > bestScore) {
          bestScore = s;
          hint.addCardId = add.id;
          hint.removeCardId = rm.id;
          hint.newScore = s;
        }
      }
    }
    return hint;
  });
}
