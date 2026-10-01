import { useMemo, useRef, useState } from 'react';
import type { Board, NodeColor } from '../../model/types';
import { NODE_COLOR_MARK } from '../../model/types';
import { boardEdges } from '../../optimizer/boardRoute';

const CELL = 70;
const R = 24;
const COLOR_VAR: Record<NodeColor, string> = {
  red: 'var(--red)',
  blue: 'var(--blue)',
  yellow: 'var(--yellow)',
  green: 'var(--green)',
  connect: 'var(--connect)',
};

interface Props {
  board: Board;
  opened: Set<string>;
  /** 提案ルート: nodeId → 手順番号（1 始まり） */
  plan: Map<string, number>;
  sealed: Set<string>;
  activeNodeId: string | null;
  onNodeTap: (id: string) => void;
}

interface View {
  x: number;
  y: number;
  k: number;
}

export default function BoardSvg({ board, opened, plan, sealed, activeNodeId, onNodeTap }: Props) {
  const bounds = useMemo(() => {
    const xs = board.nodes.map((n) => n.x);
    const ys = board.nodes.map((n) => n.y);
    const minX = Math.min(...xs, 0);
    const minY = Math.min(...ys, 0);
    return { minX, minY, w: (Math.max(...xs, 0) - minX + 1) * CELL, h: (Math.max(...ys, 0) - minY + 1) * CELL };
  }, [board.nodes]);
  const edges = useMemo(() => {
    const adj = boardEdges(board);
    const out: [string, string][] = [];
    for (const [a, list] of adj) for (const b of list) if (a < b) out.push([a, b]);
    return out;
  }, [board]);
  const pos = useMemo(
    () => new Map(board.nodes.map((n) => [n.id, { cx: (n.x - bounds.minX + 0.5) * CELL, cy: (n.y - bounds.minY + 0.5) * CELL }])),
    [board.nodes, bounds],
  );

  // ピンチズーム・パン（pointer events）。view は viewBox 上の表示範囲
  const [view, setView] = useState<View | null>(null);
  const fit: View = { x: 0, y: 0, k: 1 };
  const v = view ?? fit;
  const svgRef = useRef<SVGSVGElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ start: View; dist: number; mid: { x: number; y: number }; moved: boolean } | null>(null);
  const tapNode = useRef<string | null>(null);

  const scaleToSvg = () => {
    const r = svgRef.current!.getBoundingClientRect();
    return Math.max(bounds.w / r.width, bounds.h / r.height);
  };
  const snapshot = () => {
    const ps = [...pointers.current.values()];
    const mid = { x: ps.reduce((s, p) => s + p.x, 0) / ps.length, y: ps.reduce((s, p) => s + p.y, 0) / ps.length };
    const dist = ps.length > 1 ? Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y) : 0;
    return { mid, dist };
  };

  const onDown = (e: React.PointerEvent) => {
    if (pointers.current.size === 0) tapNode.current = (e.target as Element).closest("[data-node]")?.getAttribute("data-node") ?? null;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    gesture.current = { start: v, ...snapshot(), moved: false };
  };
  const onMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    const now = snapshot();
    const s = scaleToSvg();
    const k = g.dist > 0 && now.dist > 0 ? Math.min(4, Math.max(0.5, (g.start.k * now.dist) / g.dist)) : g.start.k;
    const dx = ((now.mid.x - g.mid.x) * s) / k;
    const dy = ((now.mid.y - g.mid.y) * s) / k;
    if (Math.abs(now.mid.x - g.mid.x) + Math.abs(now.mid.y - g.mid.y) > 6 || k !== g.start.k) g.moved = true;
    if (g.moved) setView({ x: g.start.x - dx, y: g.start.y - dy, k });
  };
  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) {
      const g = gesture.current;
      gesture.current = null;
      if (g && !g.moved && tapNode.current) onNodeTap(tapNode.current);
    } else gesture.current = { start: v, ...snapshot(), moved: true };
  };
  const onWheel = (e: React.WheelEvent) => {
    const k = Math.min(4, Math.max(0.5, v.k * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
    setView({ ...v, k });
  };

  const vw = bounds.w / v.k;
  const vh = bounds.h / v.k;
  const vx = v.x + (bounds.w - vw) / 2;
  const vy = v.y + (bounds.h - vh) / 2;

  return (
    <div className="board-wrap">
      <svg
        ref={svgRef}
        viewBox={`${vx} ${vy} ${vw} ${vh}`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onWheel={onWheel}
        role="img"
        aria-label="ホロメンボード"
      >
        {edges.map(([a, b]) => {
          const p = pos.get(a)!;
          const q = pos.get(b)!;
          const lit = (opened.has(a) || plan.has(a)) && (opened.has(b) || plan.has(b));
          return <line key={`${a}-${b}`} x1={p.cx} y1={p.cy} x2={q.cx} y2={q.cy} stroke={lit ? 'var(--accent)' : 'var(--border)'} strokeWidth={lit ? 5 : 3} />;
        })}
        {board.nodes.map((n) => {
          const p = pos.get(n.id)!;
          const isOpen = opened.has(n.id);
          const step = plan.get(n.id);
          const isSealed = sealed.has(n.id);
          const col = COLOR_VAR[n.color];
          return (
            <g key={n.id} data-node={n.id} style={{ cursor: 'pointer' }}>
              {n.id === activeNodeId && <circle cx={p.cx} cy={p.cy} r={R + 8} fill="none" stroke="var(--pink)" strokeWidth={4} />}
              <circle
                cx={p.cx}
                cy={p.cy}
                r={R}
                fill={isOpen ? col : 'var(--surface)'}
                stroke={col}
                strokeWidth={step ? 5 : 3}
                strokeDasharray={isSealed ? '5 4' : undefined}
                opacity={isSealed ? 0.55 : 1}
              />
              <text x={p.cx} y={p.cy + 6} textAnchor="middle" fontSize={17} fontWeight={800} fill={isOpen ? '#fff' : col}>
                {isSealed ? '🔒' : NODE_COLOR_MARK[n.color]}
              </text>
              <text x={p.cx} y={p.cy + R + 13} textAnchor="middle" fontSize={11} fill="var(--muted)">
                {n.label.length > 8 ? `${n.label.slice(0, 8)}…` : n.label}
              </text>
              {step && (
                <g>
                  <circle cx={p.cx + R - 2} cy={p.cy - R + 2} r={11} fill="var(--accent)" />
                  <text x={p.cx + R - 2} y={p.cy - R + 6} textAnchor="middle" fontSize={12} fontWeight={800} fill="var(--accent-ink)">
                    {step}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
      <div className="board-tools">
        <button className="btn small" onClick={() => setView({ ...v, k: Math.min(4, v.k * 1.3) })} aria-label="拡大">
          ＋
        </button>
        <button className="btn small" onClick={() => setView({ ...v, k: Math.max(0.5, v.k / 1.3) })} aria-label="縮小">
          −
        </button>
        <button className="btn small" onClick={() => setView(null)}>
          全体
        </button>
      </div>
    </div>
  );
}
