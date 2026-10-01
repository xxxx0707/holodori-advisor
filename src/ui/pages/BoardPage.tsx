import { useMemo, useState } from 'react';
import type { AppData, Board, BoardProgress, Role } from '../../model/types';
import { NODE_COLOR_LABEL } from '../../model/types';
import { planRoutes, type RouteEntry } from '../../optimizer/boardRoute';
import type { Update } from '../../store/store';
import BoardSvg from '../components/BoardSvg';
import { describeEffect, holomemName } from '../format';

const ROLE_LABEL: Record<Role, string> = { leader: 'リーダー', member: 'メンバー', none: '編成外' };
const emptyProgress: BoardProgress = { opened: [], pt: 0, dreamRank: 1 };

function autoRole(data: AppData, holomemId: string): Role {
  const t = data.lastTeam;
  if (!t) return 'none';
  const hm = (id: string | null) => (id ? data.cards.find((c) => c.id === id)?.holomemId : undefined);
  if (hm(t.leaderCardId) === holomemId) return 'leader';
  if (t.memberCardIds.some((id) => hm(id) === holomemId)) return 'member';
  return 'none';
}

const costText = (pt: number, cubes: Record<string, number>) =>
  [pt ? `${pt}Pt` : '', ...Object.entries(cubes).filter(([, n]) => n > 0).map(([k, n]) => `${k}×${n}`)].filter(Boolean).join(' ') || '0';

export default function BoardPage({ data, update }: { data: AppData; update: Update }) {
  const [holomemId, setHolomemId] = useState<string | null>(data.boards[0]?.holomemId ?? null);
  const [roleOverride, setRoleOverride] = useState<Record<string, Role>>({});
  const [shareAll, setShareAll] = useState(false);
  const [activeNode, setActiveNode] = useState<string | null>(null);
  const [newCube, setNewCube] = useState('');

  const holomems = useMemo(() => new Map(data.holomems.map((h) => [h.id, h])), [data.holomems]);
  const board = data.boards.find((b) => b.holomemId === holomemId);
  const progressOf = (id: string) => data.boardProgress[id] ?? emptyProgress;
  const roleOf = (id: string) => roleOverride[id] ?? autoRole(data, id);

  const entries: RouteEntry[] = useMemo(() => {
    const boards = shareAll ? data.boards.filter((b) => roleOf(b.holomemId) !== 'none' || b.holomemId === holomemId) : board ? [board] : [];
    return boards.map((b) => ({ board: b, role: roleOf(b.holomemId), progress: progressOf(b.holomemId) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, shareAll, board, roleOverride]);

  const plan = useMemo(() => planRoutes(entries, data.cubes, data.objective), [entries, data.cubes, data.objective]);

  if (!board || !holomemId) {
    return (
      <div>
        <h1>ホロメンボード</h1>
        <div className="card empty">
          <p>ボードが登録されていません。</p>
          <p className="small">「データ」タブからボードのJSONを読み込めます（ボードエディタは次の段階で追加予定）。</p>
        </div>
      </div>
    );
  }

  const progress = progressOf(holomemId);
  const opened = new Set([board.startNodeId, ...progress.opened]);
  const mySteps = plan.steps.filter((s) => s.holomemId === holomemId);
  const stepNo = new Map(mySteps.map((s, i) => [s.nodeId, i + 1]));
  const sealed = new Set(board.nodes.filter((n) => (n.requiredDreamRank ?? 0) > progress.dreamRank).map((n) => n.id));
  const nodeOf = (b: Board, id: string) => b.nodes.find((n) => n.id === id);
  const active = activeNode ? nodeOf(board, activeNode) : undefined;

  const setProgress = (id: string, patch: Partial<BoardProgress>) =>
    update((d) => ({ ...d, boardProgress: { ...d.boardProgress, [id]: { ...(d.boardProgress[id] ?? emptyProgress), ...patch } } }));

  const toggleOpened = (nodeId: string) => {
    if (nodeId === board.startNodeId) return;
    const has = progress.opened.includes(nodeId);
    setProgress(holomemId, { opened: has ? progress.opened.filter((x) => x !== nodeId) : [...progress.opened, nodeId] });
  };

  /** 提案どおりに解放した: 解放済みにして素材を消費する */
  const markDone = (hid: string, nodeId: string) => {
    const b = data.boards.find((x) => x.holomemId === hid)!;
    const n = nodeOf(b, nodeId)!;
    update((d) => {
      const pr = d.boardProgress[hid] ?? emptyProgress;
      const cubes = { ...d.cubes };
      for (const [k, num] of Object.entries(n.costCubes)) cubes[k] = Math.max(0, (cubes[k] ?? 0) - num);
      return {
        ...d,
        cubes,
        boardProgress: { ...d.boardProgress, [hid]: { ...pr, opened: [...pr.opened, nodeId], pt: Math.max(0, pr.pt - n.costPt) } },
      };
    });
  };

  return (
    <div>
      <h1>ホロメンボード</h1>
      <div className="chips" role="group" aria-label="ホロメン">
        {data.boards.map((b) => (
          <button key={b.holomemId} className="chip" aria-pressed={b.holomemId === holomemId} onClick={() => (setHolomemId(b.holomemId), setActiveNode(null))}>
            {holomemName(holomems, b.holomemId)}（{ROLE_LABEL[roleOf(b.holomemId)]}）
          </button>
        ))}
      </div>

      <div className="grid2" style={{ marginTop: 10 }}>
        <div>
          <BoardSvg board={board} opened={opened} plan={stepNo} sealed={sealed} activeNodeId={activeNode} onNodeTap={setActiveNode} />
          <div className="legend">
            {(['red', 'blue', 'yellow', 'green', 'connect'] as const).map((c) => (
              <span key={c}>
                <i style={{ background: `var(--${c})` }} />
                {NODE_COLOR_LABEL[c]}
              </span>
            ))}
            <span>塗り＝解放済み・数字＝提案順・🔒＝ランク封印</span>
          </div>
          {active && (
            <div className="card small">
              <div className="spread">
                <strong>
                  {active.label}（{NODE_COLOR_LABEL[active.color]}）
                </strong>
                {active.id !== board.startNodeId && (
                  <button className="btn small" onClick={() => toggleOpened(active.id)}>
                    {opened.has(active.id) ? '未解放に戻す' : '解放済みにする'}
                  </button>
                )}
              </div>
              <div>{active.effect ? describeEffect(active.effect) : '効果なし'}</div>
              <div className="muted">
                コスト: {costText(active.costPt, active.costCubes)}
                {active.requiredDreamRank ? `・ドリームランク${active.requiredDreamRank}で解放` : ''}
              </div>
            </div>
          )}
        </div>

        <div>
          <section className="card stack">
            <div>
              <div className="muted small">このホロメンの役割（編成結果から自動判定）</div>
              <div className="chips">
                {(['leader', 'member', 'none'] as Role[]).map((r) => (
                  <button key={r} className="chip" aria-pressed={roleOf(holomemId) === r} onClick={() => setRoleOverride({ ...roleOverride, [holomemId]: r })}>
                    {ROLE_LABEL[r]}
                  </button>
                ))}
              </div>
            </div>
            <div className="fields">
              <label className="field">
                ボードPt
                <input type="number" inputMode="numeric" min={0} value={progress.pt} onChange={(e) => setProgress(holomemId, { pt: Number(e.target.value) || 0 })} />
              </label>
              <label className="field">
                ドリームランク
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={progress.dreamRank}
                  onChange={(e) => setProgress(holomemId, { dreamRank: Number(e.target.value) || 0 })}
                />
              </label>
            </div>
            <div>
              <div className="muted small">手持ちキューブ（全ホロメン共通）</div>
              <div className="cubes">
                {Object.keys(data.cubes).map((k) => (
                  <label key={k} className="field">
                    {k}
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={data.cubes[k]}
                      onChange={(e) => update((d) => ({ ...d, cubes: { ...d.cubes, [k]: Number(e.target.value) || 0 } }))}
                    />
                  </label>
                ))}
              </div>
              <div className="row" style={{ marginTop: 6 }}>
                <input className="input" style={{ width: '9em' }} placeholder="キューブ名" value={newCube} onChange={(e) => setNewCube(e.target.value)} />
                <button
                  className="btn small"
                  disabled={!newCube.trim() || newCube.trim() in data.cubes}
                  onClick={() => {
                    update((d) => ({ ...d, cubes: { ...d.cubes, [newCube.trim()]: 0 } }));
                    setNewCube('');
                  }}
                >
                  種類を追加
                </button>
              </div>
            </div>
            <label className="check">
              <input type="checkbox" checked={shareAll} onChange={(e) => setShareAll(e.target.checked)} />
              編成メンバー全員のボードでキューブを分け合って計画する
            </label>
          </section>

          <section className="card">
            <h2 style={{ marginTop: 0 }}>おすすめの解放順</h2>
            {plan.steps.length === 0 ? (
              <p className="muted">今の素材で解放できる、役に立つマスはありません。</p>
            ) : (
              <ol className="steps">
                {plan.steps.map((s, i) => {
                  const b = data.boards.find((x) => x.holomemId === s.holomemId)!;
                  const n = nodeOf(b, s.nodeId)!;
                  const isHere = s.holomemId === holomemId;
                  return (
                    <li
                      key={`${s.holomemId}-${s.nodeId}`}
                      className={`step${isHere && activeNode === s.nodeId ? ' active' : ''}`}
                      onClick={() => {
                        setHolomemId(s.holomemId);
                        setActiveNode(s.nodeId);
                      }}
                    >
                      <span className="no">{i + 1}</span>
                      <span>
                        {shareAll && <span className="small muted">{holomemName(holomems, s.holomemId)}・</span>}
                        <strong>{n.label}</strong>
                        <span className="small muted">
                          {' '}
                          {n.effect ? describeEffect(n.effect) : ''}
                          {s.targetId !== s.nodeId ? '（経由）' : ''}
                        </span>
                        <div className="small muted">{costText(s.costPt, s.costCubes)}</div>
                      </span>
                      <button
                        className="btn small"
                        onClick={(e) => {
                          e.stopPropagation();
                          markDone(s.holomemId, s.nodeId);
                        }}
                      >
                        解放した
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
            <p className="small muted">
              実行後の残り: {Object.entries(plan.remainingPt).map(([id, pt]) => `${holomemName(holomems, id)} ${pt}Pt`).join('・')}／
              {costText(0, plan.remainingCubes)}
            </p>
          </section>

          {plan.blocked.length > 0 && (
            <section className="card">
              <h3 style={{ marginTop: 0 }}>次に素材を集めたいマス</h3>
              <ul className="small" style={{ paddingLeft: '1.2em', margin: 0 }}>
                {plan.blocked.map((b) => {
                  const bd = data.boards.find((x) => x.holomemId === b.holomemId)!;
                  const n = nodeOf(bd, b.nodeId)!;
                  return (
                    <li key={`${b.holomemId}-${b.nodeId}`}>
                      {shareAll ? `${holomemName(holomems, b.holomemId)}・` : ''}
                      {n.label}: あと {costText(b.shortPt, b.shortCubes)}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
