import { describe, expect, it } from 'vitest';
import { conditionMissing, evaluateTeam, type EvalContext } from '../src/model/evaluate';
import { makeObjective } from '../src/model/objectives';
import type { Card, Holomem } from '../src/model/types';
import { searchBestTeams } from '../src/optimizer/team';

const holomems: Holomem[] = [
  { id: 'a', name: 'A', affiliations: ['G1', 'U'] },
  { id: 'b', name: 'B', affiliations: ['G1'] },
  { id: 'c', name: 'C', affiliations: ['G2', 'U'] },
  { id: 'd', name: 'D', affiliations: ['G2'] },
  { id: 'e', name: 'E', affiliations: ['G3'] },
  { id: 'f', name: 'F', affiliations: ['G3'] },
];

const card = (id: string, holomemId: string, type: Card['type'], p: number, extra: Partial<Card> = {}): Card => ({
  id, holomemId, name: id, rarity: 4, type, perf: p, tech: 0, sense: 0, level: 1, skills: [], ...extra,
});

function ctx(cards: Card[], memberCount = 3): EvalContext {
  return {
    cards: new Map(cards.map((c) => [c.id, c])),
    holomems: new Map(holomems.map((h) => [h.id, h])),
    settings: { memberCount, allowLeaderHolomemInMembers: true, leaderCountsForCondition: false, songSeconds: 120 },
    objective: makeObjective('highScore', 'perf'),
  };
}

describe('条件判定', () => {
  const cards = [card('1', 'a', 'cute', 100), card('2', 'b', 'cute', 100), card('3', 'c', 'pure', 100)];
  const h = new Map(holomems.map((x) => [x.id, x]));
  it('タイプ人数', () => {
    expect(conditionMissing({ kind: 'typeCount', target: 'cute', min: 2 }, cards, h)).toBe(0);
    expect(conditionMissing({ kind: 'typeCount', target: 'pure', min: 3 }, cards, h)).toBe(2);
  });
  it('所属人数（複数所属を数える）', () => {
    expect(conditionMissing({ kind: 'affiliationCount', target: 'U', min: 2 }, cards, h)).toBe(0);
    expect(conditionMissing({ kind: 'affiliationCount', target: 'G1', min: 3 }, cards, h)).toBe(1);
  });
});

describe('衣装スキル', () => {
  it('条件を満たすとパラメータ倍率が掛かり、満たさないと未達として返る', () => {
    const leader = card('L', 'a', 'cute', 0, {
      costume: { name: 'x', skill: { condition: { kind: 'typeCount', target: 'cute', min: 2 }, effect: { kind: 'paramUp', param: 'perf', value: 100 } } },
    });
    const m = [card('1', 'b', 'cute', 1000), card('2', 'c', 'cute', 1000), card('3', 'd', 'pure', 1000)];
    const ok = evaluateTeam({ leaderCardId: 'L', memberCardIds: ['1', '2', '3'] }, ctx([leader, ...m]));
    expect(ok.costumeActive).toBe(true);
    expect(ok.paramMultiplier.perf).toBe(100);
    const allPure = m.map((x) => ({ ...x, type: 'pure' as const }));
    const ng = evaluateTeam({ leaderCardId: 'L', memberCardIds: ['1', '2', '3'] }, ctx([leader, ...allPure]));
    expect(ng.costumeActive).toBe(false);
    expect(ng.unmet[0].missing).toBe(2);
    expect(ok.score).toBeCloseTo(ng.score * 2);
  });
});

describe('編成探索', () => {
  const leader = card('L', 'a', 'happy', 0, {
    costume: { name: 'x', skill: { condition: { kind: 'affiliationCount', target: 'G3', min: 2 }, effect: { kind: 'paramUp', param: 'all', value: 200 } } },
  });
  const cards = [
    leader,
    card('b1', 'b', 'cute', 1000),
    card('b2', 'b', 'cute', 990), // 同じホロメン
    card('c1', 'c', 'cute', 900),
    card('d1', 'd', 'cute', 800),
    card('e1', 'e', 'cute', 300),
    card('f1', 'f', 'cute', 300),
  ];

  it('全組合せの総当たりと結果が一致し、同じホロメンを重複させない', () => {
    const c = ctx(cards);
    const [best] = searchBestTeams(c, { pinnedCardIds: [], excludedCardIds: [], topK: 3, conditionExtra: 2 });
    const others = cards.filter((x) => x.id !== 'L');
    let bestScore = -1;
    for (let i = 0; i < others.length; i++)
      for (let j = i + 1; j < others.length; j++)
        for (let k = j + 1; k < others.length; k++) {
          const t = [others[i], others[j], others[k]];
          if (new Set(t.map((x) => x.holomemId)).size < 3) continue;
          bestScore = Math.max(bestScore, evaluateTeam({ leaderCardId: 'L', memberCardIds: t.map((x) => x.id) }, c).score);
        }
    expect(best.evaluation.score).toBeCloseTo(bestScore);
    // 衣装条件（G3 2人）を満たす e1, f1 を含む編成が最適
    expect(best.team.memberCardIds).toEqual(expect.arrayContaining(['e1', 'f1']));
    const hs = best.team.memberCardIds.map((id) => c.cards.get(id)!.holomemId);
    expect(new Set(hs).size).toBe(hs.length);
  });

  it('固定と除外が反映される', () => {
    const [best] = searchBestTeams(ctx(cards), { pinnedCardIds: ['d1'], excludedCardIds: ['e1'] });
    expect(best.team.memberCardIds).toContain('d1');
    expect(best.team.memberCardIds).not.toContain('e1');
  });

  it('あと1人で発動する衣装条件には入れ替え候補を出す', () => {
    // f1 を除外して探索 → 衣装は未達。その後 f1 を戻した所持データでヒントを作る
    const c = ctx(cards);
    const [r] = searchBestTeams(c, { pinnedCardIds: ['e1'], excludedCardIds: ['f1'] });
    expect(r.evaluation.costumeActive).toBe(false);
    const costumeHint = r.hints.find((h) => h.unmet.source === 'costume');
    expect(costumeHint?.addCardId).toBeNull(); // 除外したので候補なし
  });
});

describe('指定リーダーでの探索', () => {
  const costume = (target: string) => ({
    name: target,
    skill: { condition: { kind: 'affiliationCount' as const, target, min: 2 }, effect: { kind: 'paramUp' as const, param: 'all' as const, value: 200 } },
  });
  const cards = [
    card('L1', 'a', 'happy', 0, { costume: costume('G3') }),
    card('L2', 'a', 'happy', 0, { costume: costume('G2') }),
    card('C1', 'c', 'cute', 500, { costume: costume('G1') }),
    card('b1', 'b', 'cute', 1000),
    card('d1', 'd', 'cute', 800),
    card('e1', 'e', 'cute', 300),
    card('f1', 'f', 'cute', 300),
  ];

  it('ホロメン指定時は、全結果のリーダーがそのホロメンの衣装付きカードになる', () => {
    const rs = searchBestTeams(ctx(cards), { pinnedCardIds: [], excludedCardIds: [], leaderHolomemId: 'a' });
    expect(rs.length).toBeGreaterThan(0);
    for (const r of rs) expect(['L1', 'L2']).toContain(r.team.leaderCardId);
  });

  it('カード指定時はそのカードがリーダーになる（除外リストに入っていても）', () => {
    const rs = searchBestTeams(ctx(cards), { pinnedCardIds: [], excludedCardIds: ['L2'], leaderCardId: 'L2' });
    for (const r of rs) expect(r.team.leaderCardId).toBe('L2');
    expect(rs[0].evaluation.costumeActive).toBe(true); // G2 = c, d の2人
  });

  it('衣装付きカードが無いホロメンを指定しても、衣装なしのリーダーで結果が出る', () => {
    const rs = searchBestTeams(ctx(cards), { pinnedCardIds: [], excludedCardIds: [], leaderHolomemId: 'b' });
    expect(rs[0].team.leaderCardId).toBe('b1');
    expect(rs[0].team.memberCardIds).not.toContain('b1');
  });

  it('指定リーダーの最良は、おまかせ探索での同リーダーの最良と一致する', () => {
    const c = ctx(cards);
    const [fixed] = searchBestTeams(c, { pinnedCardIds: [], excludedCardIds: [], leaderCardId: 'L1' });
    const all = searchBestTeams(c, { pinnedCardIds: [], excludedCardIds: [], resultCount: 50 });
    const bestL1 = all.find((r) => r.team.leaderCardId === 'L1')!;
    expect(fixed.evaluation.score).toBeCloseTo(bestL1.evaluation.score);
  });
});
