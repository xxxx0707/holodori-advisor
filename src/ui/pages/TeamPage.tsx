import { useMemo, useRef, useState } from 'react';
import { BREAKDOWN_KEYS, BREAKDOWN_LABEL, evaluateTeam, type EvalContext } from '../../model/evaluate';
import { makeObjective, PRESET_DESC, PRESET_LABEL } from '../../model/objectives';
import type { AppData, Card, LeaderChoice, ObjectivePresetId, Param, Team, Weights } from '../../model/types';
import { PARAMS, PARAM_LABEL, TYPE_LABEL } from '../../model/types';
import type { TeamResult } from '../../optimizer/team';
import type { TeamWorkerMessage, TeamWorkerRequest } from '../../optimizer/team.worker';
import { newId, type Update } from '../../store/store';
import { describeCondition, describeEffect, describeSkill, fmt, holomemName } from '../format';

const PRESETS: ObjectivePresetId[] = ['highScore', 'clear', 'fullCombo', 'focusParam', 'custom'];
const WEIGHT_KEYS: { key: Exclude<keyof Weights, 'params'>; label: string }[] = [
  { key: 'param', label: 'パラメータ' },
  { key: 'scoreUp', label: 'スコアUP' },
  { key: 'scoreSupport', label: 'スコアサポート' },
  { key: 'judge', label: '判定強化' },
  { key: 'lifeHeal', label: 'ライフ回復' },
  { key: 'activationUp', label: '発動率UP' },
];

// タブを切り替えても結果を残す
let cachedResults: TeamResult[] | null = null;

export function makeContext(data: AppData): EvalContext {
  return {
    cards: new Map(data.cards.map((c) => [c.id, c])),
    holomems: new Map(data.holomems.map((h) => [h.id, h])),
    settings: data.settings,
    objective: data.objective,
  };
}

export default function TeamPage({ data, update, goTo }: { data: AppData; update: Update; goTo: (t: 'collection' | 'board') => void }) {
  const [results, setResults] = useState<TeamResult[] | null>(cachedResults);
  const [selected, setSelected] = useState(0);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const worker = useRef<Worker | null>(null);
  const ctx = useMemo(() => makeContext(data), [data]);
  const obj = data.objective;

  const setResultsCached = (r: TeamResult[] | null) => {
    cachedResults = r;
    setResults(r);
  };

  const setPreset = (preset: ObjectivePresetId, focus: Param = obj.focusParam) =>
    update((d) => ({ ...d, objective: makeObjective(preset, focus, d.objective.weights) }));

  const setWeight = (key: Exclude<keyof Weights, 'params'>, v: number) =>
    update((d) => ({ ...d, objective: { ...d.objective, preset: 'custom', weights: { ...d.objective.weights, [key]: v } } }));
  const setParamWeight = (p: Param, v: number) =>
    update((d) => ({
      ...d,
      objective: { ...d.objective, preset: 'custom', weights: { ...d.objective.weights, params: { ...d.objective.weights.params, [p]: v } } },
    }));

  const run = (pinned = data.pinnedCardIds) => {
    worker.current?.terminate();
    setError(null);
    setProgress(0);
    const w = new Worker(new URL('../../optimizer/team.worker.ts', import.meta.url), { type: 'module' });
    worker.current = w;
    w.onmessage = (e: MessageEvent<TeamWorkerMessage>) => {
      const m = e.data;
      if (m.type === 'progress') setProgress(m.done / m.total);
      else {
        w.terminate();
        worker.current = null;
        setProgress(null);
        if (m.type === 'error') setError(m.message);
        else {
          setResultsCached(m.results);
          setSelected(0);
          if (m.results[0]) update((d) => ({ ...d, lastTeam: m.results[0].team }));
        }
      }
    };
    const req: TeamWorkerRequest = {
      cards: data.cards,
      holomems: data.holomems,
      settings: data.settings,
      objective: data.objective,
      pinnedCardIds: pinned,
      excludedCardIds: data.excludedCardIds,
      leaderChoice: data.leaderChoice,
    };
    w.postMessage(req);
  };

  const cancel = () => {
    worker.current?.terminate();
    worker.current = null;
    setProgress(null);
  };

  const togglePin = (id: string) =>
    update((d) => ({
      ...d,
      pinnedCardIds: d.pinnedCardIds.includes(id) ? d.pinnedCardIds.filter((x) => x !== id) : [...d.pinnedCardIds, id],
    }));

  const applyHint = (addId: string, removeId: string) => {
    const pinned = [...data.pinnedCardIds.filter((x) => x !== removeId), addId];
    update((d) => ({ ...d, pinnedCardIds: pinned }));
    run(pinned);
  };

  const saveTeam = (r: TeamResult) => {
    const name = prompt('編成の名前', `${PRESET_LABEL[obj.preset]} ${new Date().toLocaleDateString('ja-JP')}`);
    if (!name) return;
    update((d) => ({
      ...d,
      savedTeams: [{ id: newId(), name, savedAt: Date.now(), team: r.team, score: r.evaluation.score }, ...d.savedTeams],
    }));
  };

  const cardOf = (id: string | null): Card | undefined => (id ? ctx.cards.get(id) : undefined);
  const hasCards = data.cards.length > 0;
  const current = results?.[selected];

  const setLeaderChoice = (choice: LeaderChoice) => {
    update((d) => ({ ...d, leaderChoice: choice }));
    setResultsCached(null);
  };
  const top = results?.[0];

  return (
    <div>
      <h1>編成</h1>
      {data.cards.some((c) => c.sample) && (
        <div className="banner small">
          今はお試し用の<strong>架空のサンプルカード</strong>が入っています。「所持」タブで自分のカードを登録し、「データ」タブでサンプルを削除してください。
        </div>
      )}

      <section className="card">
        <h2 style={{ marginTop: 0 }}>目的</h2>
        <div className="chips" role="group" aria-label="目的">
          {PRESETS.map((p) => (
            <button key={p} className="chip" aria-pressed={obj.preset === p} onClick={() => setPreset(p)}>
              {PRESET_LABEL[p]}
            </button>
          ))}
        </div>
        <p className="muted">{PRESET_DESC[obj.preset]}</p>
        {obj.preset === 'focusParam' && (
          <div className="chips" role="group" aria-label="重視するパラメータ">
            {PARAMS.map((p) => (
              <button key={p} className="chip" aria-pressed={obj.focusParam === p} onClick={() => setPreset('focusParam', p)}>
                {PARAM_LABEL[p]}
              </button>
            ))}
          </div>
        )}
        <details>
          <summary>重みを細かく調整（変更するとカスタムになります）</summary>
          <div className="weights">
            {WEIGHT_KEYS.map(({ key, label }) => (
              <label key={key}>
                {label}
                <input type="range" min={0} max={2} step={0.1} value={obj.weights[key]} onChange={(e) => setWeight(key, Number(e.target.value))} />
                <span>{obj.weights[key].toFixed(1)}</span>
              </label>
            ))}
            {PARAMS.map((p) => (
              <label key={p}>
                {PARAM_LABEL[p]}
                <input type="range" min={0} max={2} step={0.1} value={obj.weights.params[p]} onChange={(e) => setParamWeight(p, Number(e.target.value))} />
                <span>{obj.weights.params[p].toFixed(1)}</span>
              </label>
            ))}
          </div>
        </details>
      </section>

      <LeaderSection data={data} ctx={ctx} onChange={setLeaderChoice} />

      {(data.pinnedCardIds.length > 0 || data.excludedCardIds.length > 0) && (
        <section className="card">
          <div className="spread">
            <strong>固定 {data.pinnedCardIds.length}枚・除外 {data.excludedCardIds.length}枚</strong>
            <button className="btn small" onClick={() => update((d) => ({ ...d, pinnedCardIds: [], excludedCardIds: [] }))}>
              すべて解除
            </button>
          </div>
          <div className="chips" style={{ marginTop: 6 }}>
            {data.pinnedCardIds.map((id) => (
              <button key={id} className="chip" onClick={() => togglePin(id)} aria-label={`${cardOf(id)?.name}の固定を解除`}>
                📌 {cardOf(id)?.name} ✕
              </button>
            ))}
          </div>
        </section>
      )}

      {!hasCards ? (
        <div className="card empty">
          <p>カードが登録されていません。</p>
          <button className="btn primary" onClick={() => goTo('collection')}>
            所持カードを登録する
          </button>
        </div>
      ) : progress !== null ? (
        <div className="card stack">
          <div className="spread">
            <span>探索中… {Math.round(progress * 100)}%</span>
            <button className="btn small" onClick={cancel}>
              キャンセル
            </button>
          </div>
          <div className="progress">
            <div style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
      ) : (
        <button className="btn primary block" onClick={() => run()}>
          最適な編成を探す
        </button>
      )}
      {error && <div className="banner">エラー: {error}</div>}

      {results && results.length === 0 && <div className="card empty">条件に合う編成が見つかりませんでした。</div>}
      {results && results.length > 0 && current && (
        <section>
          {data.leaderChoice && (
            <p className="small muted" style={{ marginTop: 16, marginBottom: 0 }}>
              リーダー: {holomemName(ctx.holomems, data.leaderChoice.holomemId)}
              {data.leaderChoice.cardId ? `（${ctx.cards.get(data.leaderChoice.cardId)?.costume?.name ?? "指定カード"}）` : "（衣装おまかせ）"}で探索
            </p>
          )}
          <div className="chips" role="tablist" style={{ marginTop: 8 }}>
            {results.map((r, i) => (
              <button key={i} role="tab" className="chip" aria-pressed={selected === i} onClick={() => setSelected(i)}>
                案{i + 1}（{fmt(r.evaluation.score)}）
              </button>
            ))}
          </div>
          <ResultView
            r={current}
            top={selected > 0 ? top : undefined}
            ctx={ctx}
            pinned={data.pinnedCardIds}
            onPin={togglePin}
            onApplyHint={applyHint}
            onSave={() => saveTeam(current)}
            onBoard={() => {
              update((d) => ({ ...d, lastTeam: current.team }));
              goTo('board');
            }}
          />
        </section>
      )}

      {data.savedTeams.length > 0 && (
        <section>
          <h2>保存した編成</h2>
          {data.savedTeams.map((s) => (
            <SavedTeamRow
              key={s.id}
              name={s.name}
              team={s.team}
              savedScore={s.score}
              ctx={ctx}
              onDelete={() => update((d) => ({ ...d, savedTeams: d.savedTeams.filter((x) => x.id !== s.id) }))}
            />
          ))}
        </section>
      )}
    </div>
  );
}

function ResultView({
  r,
  top,
  ctx,
  pinned,
  onPin,
  onApplyHint,
  onSave,
  onBoard,
}: {
  r: TeamResult;
  top?: TeamResult;
  ctx: EvalContext;
  pinned: string[];
  onPin: (id: string) => void;
  onApplyHint: (add: string, remove: string) => void;
  onSave: () => void;
  onBoard: () => void;
}) {
  const ev = r.evaluation;
  const leader = r.team.leaderCardId ? ctx.cards.get(r.team.leaderCardId) : undefined;
  const topIds = new Set(top ? [top.team.leaderCardId, ...top.team.memberCardIds] : []);
  const maxBar = Math.max(...BREAKDOWN_KEYS.map((k) => ev.breakdown[k]), 1e-9);
  const name = (c: Card) => `${holomemName(ctx.holomems, c.holomemId)}「${c.name}」`;

  return (
    <div className="card stack">
      <div className="spread">
        <div>
          <div className="muted small">評価値</div>
          <div className="score">{fmt(ev.score)}</div>
        </div>
        <div className="row">
          <button className="btn small" onClick={onSave}>
            保存
          </button>
          <button className="btn small" onClick={onBoard}>
            ボードのルートへ
          </button>
        </div>
      </div>

      <div className="member-list">
        {leader && (
          <div className={`member${top && !topIds.has(leader.id) ? ' diff' : ''}`}>
            <span className="role">リーダー</span>
            <div>
              <div>
                <strong>{name(leader)}</strong> <span className={`badge ${leader.type}`}>{TYPE_LABEL[leader.type]}</span>
              </div>
              {leader.costume && (
                <div className="small">
                  衣装「{leader.costume.name}」: {describeEffect(leader.costume.skill.effect)}（{describeCondition(leader.costume.skill.condition)}）{' '}
                  <span className={`badge ${ev.costumeActive ? 'ok' : 'ng'}`}>{ev.costumeActive ? '発動' : '未発動'}</span>
                </div>
              )}
            </div>
            <span />
          </div>
        )}
        {r.team.memberCardIds.map((id) => {
          const c = ctx.cards.get(id)!;
          return (
            <div key={id} className={`member${top && !topIds.has(id) ? ' diff' : ''}`}>
              <span className="role">メンバー</span>
              <div>
                <div>
                  <strong>{name(c)}</strong> <span className={`badge ${c.type}`}>{TYPE_LABEL[c.type]}</span>
                </div>
                <div className="small muted">
                  P{c.perf} / T{c.tech} / S{c.sense}・寄与 {fmt(ev.memberContribution[id] ?? 0)}
                </div>
              </div>
              <button className="btn small" aria-pressed={pinned.includes(id)} onClick={() => onPin(id)} aria-label={pinned.includes(id) ? '固定を解除' : '固定する'}>
                {pinned.includes(id) ? '📌固定中' : '固定'}
              </button>
            </div>
          );
        })}
      </div>
      {top && <p className="small muted">ピンク枠は案1と違うカードです。</p>}

      <div>
        <h3>評価の内訳</h3>
        <div className="bars">
          {BREAKDOWN_KEYS.map((k) => (
            <div className="bar" key={k}>
              <span>{BREAKDOWN_LABEL[k]}</span>
              <div className="track">
                <div className="fill" style={{ width: `${(ev.breakdown[k] / maxBar) * 100}%` }} />
              </div>
              <span className="num">{fmt(ev.breakdown[k])}</span>
            </div>
          ))}
        </div>
        <p className="small muted">
          パラメータ倍率: {PARAMS.map((p) => `${PARAM_LABEL[p]} +${fmt(ev.paramMultiplier[p])}%`).join(' / ')}
        </p>
      </div>

      {r.hints.length > 0 && (
        <div>
          <h3>発動していない条件</h3>
          <div className="stack">
            {r.hints.map((h, i) => {
              const owner = ctx.cards.get(h.unmet.cardId)!;
              const add = h.addCardId ? ctx.cards.get(h.addCardId) : undefined;
              const rm = h.removeCardId ? ctx.cards.get(h.removeCardId) : undefined;
              return (
                <div key={i} className="banner small">
                  <div>
                    {h.unmet.source === 'costume' ? '衣装スキル' : `${owner.name}のスキル`}「{describeEffect(h.unmet.skill.effect)}」は
                    {describeCondition(h.unmet.skill.condition)}が条件。<strong>あと{h.unmet.missing}人</strong>足りません。
                  </div>
                  {add && rm && h.newScore !== null && (
                    <div className="spread" style={{ marginTop: 6 }}>
                      <span>
                        {rm.name} → {add.name}（{holomemName(ctx.holomems, add.holomemId)}）に入れ替えると {fmt(h.newScore)}（
                        {h.newScore >= r.evaluation.score ? '+' : ''}
                        {fmt(h.newScore - r.evaluation.score)}）
                      </span>
                      <button className="btn small" onClick={() => onApplyHint(add.id, rm.id)}>
                        入れ替えて再計算
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function SavedTeamRow({ name, team, savedScore, ctx, onDelete }: { name: string; team: Team; savedScore: number; ctx: EvalContext; onDelete: () => void }) {
  const valid = [team.leaderCardId, ...team.memberCardIds].every((id) => !id || ctx.cards.has(id));
  const now = valid ? evaluateTeam(team, ctx).score : null;
  const cards = [team.leaderCardId, ...team.memberCardIds].map((id) => (id ? ctx.cards.get(id) : undefined));
  return (
    <div className="card">
      <div className="spread">
        <strong>{name}</strong>
        <button className="btn small danger" onClick={onDelete}>
          削除
        </button>
      </div>
      <p className="small">{cards.map((c) => (c ? holomemName(ctx.holomems, c.holomemId) : '（削除済み）')).join('・')}</p>
      <p className="small muted">
        保存時 {fmt(savedScore)} → 今の目的・所持で {now === null ? '評価不可' : fmt(now)}
      </p>
    </div>
  );
}

function LeaderSection({ data, ctx, onChange }: { data: AppData; ctx: EvalContext; onChange: (c: LeaderChoice) => void }) {
  const choice = data.leaderChoice;
  // 所持カードがあるホロメンだけを、最初の所属でグループ分けして出す
  const groups = useMemo(() => {
    const owned = new Set(data.cards.map((c) => c.holomemId));
    const m = new Map<string, { id: string; name: string }[]>();
    for (const h of data.holomems) {
      if (!owned.has(h.id)) continue;
      const g = h.affiliations[0] ?? "その他";
      if (!m.has(g)) m.set(g, []);
      m.get(g)!.push({ id: h.id, name: h.name });
    }
    return [...m.entries()];
  }, [data.cards, data.holomems]);
  const firstHolomem = groups[0]?.[1][0]?.id;
  const costumeCards = choice ? data.cards.filter((c) => c.holomemId === choice.holomemId && c.costume) : [];
  const noCostume = !!choice && costumeCards.length === 0;

  return (
    <section className="card stack">
      <h2 style={{ marginTop: 0 }}>リーダー</h2>
      <div className="chips" role="group" aria-label="リーダーの決め方">
        <button className="chip" aria-pressed={!choice} onClick={() => onChange(null)}>
          おまかせ
        </button>
        <button className="chip" aria-pressed={!!choice} disabled={!firstHolomem} onClick={() => !choice && firstHolomem && onChange({ holomemId: firstHolomem, cardId: null })}>
          ホロメンを指定
        </button>
      </div>
      {!choice ? (
        <p className="muted">所持している衣装付きカードを全部リーダー候補にして探します。</p>
      ) : (
        <>
          <div className="fields">
            <label className="field">
              ホロメン
              <select value={choice.holomemId} onChange={(e) => onChange({ holomemId: e.target.value, cardId: null })}>
                {groups.map(([g, hs]) => (
                  <optgroup key={g} label={g}>
                    {hs.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            {!noCostume && (
              <label className="field">
                衣装
                <select value={choice.cardId ?? ""} onChange={(e) => onChange({ ...choice, cardId: e.target.value || null })}>
                  <option value="">おまかせ（{costumeCards.length}着から最適）</option>
                  {costumeCards.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.costume!.name || c.name}（★{c.rarity}）
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {noCostume ? (
            <p className="banner small">{holomemName(ctx.holomems, choice.holomemId)}の衣装付きカードが登録されていないため、衣装なしのリーダーとして探します。</p>
          ) : choice.cardId && ctx.cards.get(choice.cardId)?.costume ? (
            <p className="small muted">衣装スキル: {describeSkill(ctx.cards.get(choice.cardId)!.costume!.skill)}</p>
          ) : null}
        </>
      )}
    </section>
  );
}
