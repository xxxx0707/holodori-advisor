import type { Board, BoardNode, BoardProgress, Objective, Role } from '../model/types';
import { PARAMS } from '../model/types';

export interface RouteEntry {
  board: Board;
  role: Role;
  progress: BoardProgress;
}

export interface RouteStep {
  holomemId: string;
  nodeId: string;
  /** このマスが経由地なら、目的地のマス */
  targetId: string;
  costPt: number;
  costCubes: Record<string, number>;
  value: number;
}

export interface RoutePlan {
  steps: RouteStep[];
  remainingPt: Record<string, number>;
  remainingCubes: Record<string, number>;
  /** 素材が足りず届かなかった価値の高いマス（次に必要な素材の表示用） */
  blocked: { holomemId: string; nodeId: string; shortPt: number; shortCubes: Record<string, number> }[];
}

const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export function boardEdges(board: Board): Map<string, string[]> {
  const removed = new Set((board.removedEdges ?? []).map(([a, b]) => key(a, b)));
  const adj = new Map<string, string[]>(board.nodes.map((n) => [n.id, []]));
  const link = (a: string, b: string) => {
    if (removed.has(key(a, b)) || !adj.has(a) || !adj.has(b)) return;
    if (!adj.get(a)!.includes(b)) adj.get(a)!.push(b);
    if (!adj.get(b)!.includes(a)) adj.get(b)!.push(a);
  };
  const at = new Map(board.nodes.map((n) => [`${n.x},${n.y}`, n.id]));
  for (const n of board.nodes) {
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      const m = at.get(`${n.x + dx},${n.y + dy}`);
      if (m) link(n.id, m);
    }
  }
  for (const [a, b] of board.extraEdges ?? []) link(a, b);
  return adj;
}

/** マス単体の価値。役割に合わない赤・青は 0、黄・緑は常に有効だが少し割り引く */
export function nodeBaseValue(node: BoardNode, role: Role, objective: Objective): number {
  const w = objective.weights;
  let v = 0;
  const e = node.effect;
  if (e) {
    if (e.kind === 'holomemSkill') v = e.value / 10;
    else if (e.kind === 'paramUp') {
      const targets = e.param === 'all' || !e.param ? PARAMS : [e.param];
      v = (e.value / 10) * w.param * (targets.reduce((s, p) => s + w.params[p], 0) / targets.length);
    } else v = (e.value / 10) * w[e.kind];
  }
  switch (node.color) {
    case 'red':
      return role === 'leader' ? v : 0;
    case 'blue':
      return role === 'member' ? v : 0;
    case 'yellow':
    case 'green':
      return v * 0.8;
    case 'connect':
      return v;
  }
}

export function planRoutes(entries: RouteEntry[], cubes: Record<string, number>, objective: Objective): RoutePlan {
  const remainingCubes = { ...cubes };
  const remainingPt: Record<string, number> = {};
  const steps: RouteStep[] = [];

  interface State {
    entry: RouteEntry;
    adj: Map<string, string[]>;
    nodes: Map<string, BoardNode>;
    opened: Set<string>;
    value: Map<string, number>;
    initialPt: number;
  }
  const states: State[] = entries.map((entry) => {
    const nodes = new Map(entry.board.nodes.map((n) => [n.id, n]));
    const adj = boardEdges(entry.board);
    const value = new Map<string, number>();
    for (const n of entry.board.nodes) value.set(n.id, nodeBaseValue(n, entry.role, objective));
    // コネクトは隣接マスを強化するので、隣接マスの価値の一部を自分の価値とみなす
    for (const n of entry.board.nodes) {
      if (n.color !== 'connect') continue;
      const around = (adj.get(n.id) ?? []).reduce((s, id) => s + (value.get(id) ?? 0), 0);
      value.set(n.id, (value.get(n.id) ?? 0) + around * 0.3);
    }
    remainingPt[entry.board.holomemId] = entry.progress.pt;
    return {
      entry,
      adj,
      nodes,
      opened: new Set([entry.board.startNodeId, ...entry.progress.opened]),
      value,
      initialPt: entry.progress.pt,
    };
  });

  const initialCubes = { ...cubes };
  const normCost = (s: State, n: BoardNode) => {
    let c = n.costPt / Math.max(1, s.initialPt);
    for (const [k, num] of Object.entries(n.costCubes)) {
      if (num <= 0) continue;
      const have = initialCubes[k] ?? 0;
      // 1 個も持っていない素材のマスは、他の経路があればそちらを優先させる
      c += have > 0 ? num / have : 1000 * num;
    }
    return c + 1e-6;
  };
  const sealed = (s: State, n: BoardNode) => (n.requiredDreamRank ?? 0) > s.entry.progress.dreamRank;

  const pathCost = (s: State, path: BoardNode[]) => {
    let pt = 0;
    const cb: Record<string, number> = {};
    for (const n of path) {
      pt += n.costPt;
      for (const [k, num] of Object.entries(n.costCubes)) cb[k] = (cb[k] ?? 0) + num;
    }
    return { pt, cb };
  };
  const shortage = (s: State, path: BoardNode[]) => {
    const { pt, cb } = pathCost(s, path);
    const shortPt = Math.max(0, pt - remainingPt[s.entry.board.holomemId]);
    const shortCubes: Record<string, number> = {};
    for (const [k, num] of Object.entries(cb)) {
      const lack = num - (remainingCubes[k] ?? 0);
      if (lack > 0) shortCubes[k] = lack;
    }
    return { shortPt, shortCubes, ok: shortPt === 0 && Object.keys(shortCubes).length === 0 };
  };

  /** 解放済み集合からの最小コスト経路（多始点 Dijkstra） */
  const shortestPaths = (s: State) => {
    const dist = new Map<string, number>();
    const prev = new Map<string, string | null>();
    const done = new Set<string>();
    for (const id of s.opened) {
      dist.set(id, 0);
      prev.set(id, null);
    }
    for (;;) {
      let cur: string | null = null;
      let best = Infinity;
      for (const [id, d] of dist) if (!done.has(id) && d < best) [cur, best] = [id, d];
      if (cur === null) break;
      done.add(cur);
      for (const nb of s.adj.get(cur) ?? []) {
        const n = s.nodes.get(nb)!;
        if (s.opened.has(nb) || sealed(s, n)) continue;
        const nd = best + normCost(s, n);
        if (nd < (dist.get(nb) ?? Infinity)) {
          dist.set(nb, nd);
          prev.set(nb, cur);
        }
      }
    }
    const pathTo = (id: string) => {
      const path: BoardNode[] = [];
      for (let c: string | null = id; c && !s.opened.has(c); c = prev.get(c) ?? null) path.unshift(s.nodes.get(c)!);
      return path;
    };
    return { dist, pathTo };
  };

  for (;;) {
    let pick: { s: State; path: BoardNode[]; targetId: string; ratio: number } | null = null;
    for (const s of states) {
      const { dist, pathTo } = shortestPaths(s);
      for (const [id, d] of dist) {
        if (s.opened.has(id)) continue;
        const path = pathTo(id);
        const gain = path.reduce((sum, n) => sum + (s.value.get(n.id) ?? 0), 0);
        if (gain <= 0) continue;
        const ratio = gain / d;
        if (!shortage(s, path).ok) continue;
        if (!pick || ratio > pick.ratio) pick = { s, path, targetId: id, ratio };
      }
    }
    if (!pick) break;
    const { s, path, targetId } = pick;
    for (const n of path) {
      s.opened.add(n.id);
      remainingPt[s.entry.board.holomemId] -= n.costPt;
      for (const [k, num] of Object.entries(n.costCubes)) remainingCubes[k] = (remainingCubes[k] ?? 0) - num;
      steps.push({
        holomemId: s.entry.board.holomemId,
        nodeId: n.id,
        targetId,
        costPt: n.costPt,
        costCubes: { ...n.costCubes },
        value: s.value.get(n.id) ?? 0,
      });
    }
  }

  // 残った素材では届かない、価値のあるマスを効率順に挙げる
  const blockedAll: (RoutePlan['blocked'][number] & { ratio: number })[] = [];
  for (const s of states) {
    const { dist, pathTo } = shortestPaths(s);
    for (const [id, d] of dist) {
      if (s.opened.has(id) || (s.value.get(id) ?? 0) <= 0) continue;
      const path = pathTo(id);
      const gain = path.reduce((sum, n) => sum + (s.value.get(n.id) ?? 0), 0);
      const sh = shortage(s, path);
      blockedAll.push({ holomemId: s.entry.board.holomemId, nodeId: id, shortPt: sh.shortPt, shortCubes: sh.shortCubes, ratio: gain / d });
    }
  }
  const blocked = blockedAll
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, 3)
    .map(({ ratio: _r, ...rest }) => rest);

  return { steps, remainingPt, remainingCubes, blocked };
}
