import { describe, expect, it } from 'vitest';
import { makeObjective } from '../src/model/objectives';
import type { Board, BoardNode } from '../src/model/types';
import { boardEdges, planRoutes } from '../src/optimizer/boardRoute';

const n = (id: string, x: number, y: number, color: BoardNode['color'], value: number, pt: number, cubes: Record<string, number> = {}, rank?: number): BoardNode => ({
  id, x, y, color, label: id, effect: value ? { kind: 'scoreUp', value } : undefined, costPt: pt, costCubes: cubes, requiredDreamRank: rank,
});

// s - a(赤 小) - b(赤 大)
// |   |
// c   d(黄、ランク5で封印)
const board: Board = {
  holomemId: 'h',
  startNodeId: 's',
  nodes: [
    n('s', 0, 0, 'green', 0, 0),
    n('a', 1, 0, 'red', 10, 10, { 赤: 1 }),
    n('b', 2, 0, 'red', 100, 10, { 赤: 1 }),
    n('c', 0, 1, 'blue', 100, 10, { 青: 1 }),
    n('d', 1, 1, 'yellow', 100, 1, {}, 5),
  ],
};
const obj = makeObjective('highScore', 'perf');

describe('ボードルート', () => {
  it('格子で隣接するマスを自動でつなぐ', () => {
    const adj = boardEdges(board);
    expect(adj.get('s')).toEqual(expect.arrayContaining(['a', 'c']));
    expect(adj.get('a')).toEqual(expect.arrayContaining(['s', 'b', 'd']));
  });

  it('リーダーなら赤を経由して奥の大きいマスへ。青と封印マスは選ばない', () => {
    const plan = planRoutes([{ board, role: 'leader', progress: { opened: [], pt: 100, dreamRank: 1 } }], { 赤: 5, 青: 5 }, obj);
    expect(plan.steps.map((s) => s.nodeId)).toEqual(['a', 'b']);
  });

  it('メンバーなら青を選ぶ', () => {
    const plan = planRoutes([{ board, role: 'member', progress: { opened: [], pt: 100, dreamRank: 1 } }], { 赤: 5, 青: 5 }, obj);
    expect(plan.steps.map((s) => s.nodeId)).toEqual(['c']);
  });

  it('予算を超えず、常に解放済みマスとつながっている', () => {
    const plan = planRoutes([{ board, role: 'leader', progress: { opened: [], pt: 15, dreamRank: 9 } }], { 赤: 1 }, obj);
    expect(plan.remainingPt.h).toBeGreaterThanOrEqual(0);
    expect(plan.remainingCubes['赤']).toBeGreaterThanOrEqual(0);
    const adj = boardEdges(board);
    const opened = new Set(['s']);
    for (const s of plan.steps) {
      expect(adj.get(s.nodeId)!.some((x) => opened.has(x))).toBe(true);
      opened.add(s.nodeId);
    }
    // 封印が解けた d（1pt）は取れる。b は Pt が足りず届かない
    expect(plan.steps.map((s) => s.nodeId)).toContain('d');
    expect(plan.blocked.map((b) => b.nodeId)).toContain('b');
  });
});
