import { useMemo, useState } from 'react';
import type { Card, Holomem } from '../../model/types';
import { CARD_TYPES, PARAMS, PARAM_LABEL, TYPE_LABEL } from '../../model/types';
import { searchKey } from '../../store/store';
import { ConditionEditor, EffectEditor, newSkill, SkillEditor } from './SkillEditor';

interface Props {
  card: Card;
  isNew: boolean;
  holomems: Holomem[];
  affiliations: string[];
  pinned: boolean;
  excluded: boolean;
  onSave: (c: Card) => void;
  onDelete: () => void;
  onDuplicate: (c: Card) => void;
  onTogglePin: () => void;
  onToggleExclude: () => void;
  onClose: () => void;
}

export default function CardEditor(p: Props) {
  const [c, setC] = useState<Card>(p.card);
  const [q, setQ] = useState('');
  const set = (patch: Partial<Card>) => setC((prev) => ({ ...prev, ...patch }));

  // 期生・ユニットの最初の所属でグループ分けしたホロメン選択肢
  const groups = useMemo(() => {
    const key = searchKey(q);
    const m = new Map<string, Holomem[]>();
    for (const h of p.holomems) {
      if (key && !searchKey(h.name).includes(key) && !h.affiliations.some((a) => searchKey(a).includes(key))) continue;
      const g = h.affiliations[0] ?? 'その他';
      if (!m.has(g)) m.set(g, []);
      m.get(g)!.push(h);
    }
    return [...m.entries()];
  }, [p.holomems, q]);

  const stepLevel = (d: number) => set({ level: Math.max(1, c.level + d) });

  return (
    <div className="stack">
      <div className="spread">
        <h2 style={{ margin: 0 }}>{p.isNew ? 'カードを追加' : 'カードを編集'}</h2>
        <button className="btn small" onClick={p.onClose}>
          閉じる
        </button>
      </div>
      {c.sample && <span className="badge sample">サンプル（架空の数値）</span>}

      <div className="fields">
        <label className="field">
          ホロメンを検索
          <input type="search" placeholder="名前・所属" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label className="field">
          ホロメン
          <select value={c.holomemId} onChange={(e) => set({ holomemId: e.target.value })}>
            {!p.holomems.some((h) => h.id === c.holomemId) && <option value={c.holomemId}>（選択してください）</option>}
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
        <label className="field">
          カード名
          <input value={c.name} onChange={(e) => set({ name: e.target.value })} />
        </label>
      </div>

      <div className="chips" role="group" aria-label="レアリティ">
        {([3, 4, 5] as const).map((r) => (
          <button key={r} className="chip" aria-pressed={c.rarity === r} onClick={() => set({ rarity: r, costume: r >= 4 ? c.costume : undefined })}>
            ★{r}
          </button>
        ))}
      </div>
      <div className="chips" role="group" aria-label="タイプ">
        {CARD_TYPES.map((t) => (
          <button key={t} className="chip" aria-pressed={c.type === t} onClick={() => set({ type: t })}>
            {TYPE_LABEL[t]}
          </button>
        ))}
      </div>

      <div className="fields">
        {PARAMS.map((k) => (
          <label key={k} className="field">
            {PARAM_LABEL[k]}
            <input type="number" inputMode="numeric" min={0} value={c[k]} onChange={(e) => set({ [k]: Number(e.target.value) || 0 } as Partial<Card>)} />
          </label>
        ))}
        <label className="field">
          Lv
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <button className="btn small" onClick={() => stepLevel(-1)} aria-label="Lvを下げる">
              −
            </button>
            <input className="input" style={{ width: '4.5em' }} type="number" inputMode="numeric" min={1} value={c.level} onChange={(e) => set({ level: Number(e.target.value) || 1 })} />
            <button className="btn small" onClick={() => stepLevel(1)} aria-label="Lvを上げる">
              ＋
            </button>
          </div>
        </label>
      </div>

      {c.rarity >= 4 && (
        <div className="card stack">
          <div className="spread">
            <h3 style={{ margin: 0 }}>衣装（リーダー時に有効）</h3>
            {c.costume ? (
              <button className="btn small danger" onClick={() => set({ costume: undefined })}>
                衣装なしにする
              </button>
            ) : (
              <button
                className="btn small"
                onClick={() =>
                  set({ costume: { name: '', skill: { condition: { kind: 'always' }, effect: { kind: 'paramUp', param: 'perf', value: 100 } } } })
                }
              >
                衣装を追加
              </button>
            )}
          </div>
          {c.costume && (
            <>
              <label className="field">
                衣装名
                <input value={c.costume.name} onChange={(e) => set({ costume: { ...c.costume!, name: e.target.value } })} />
              </label>
              <EffectEditor value={c.costume.skill.effect} onChange={(effect) => set({ costume: { ...c.costume!, skill: { ...c.costume!.skill, effect } } })} />
              <ConditionEditor
                value={c.costume.skill.condition}
                onChange={(condition) => set({ costume: { ...c.costume!, skill: { ...c.costume!.skill, condition } } })}
                affiliations={p.affiliations}
              />
            </>
          )}
        </div>
      )}

      <div>
        <div className="spread">
          <h3>スキル</h3>
          <button className="btn small" onClick={() => set({ skills: [...c.skills, newSkill()] })}>
            スキルを追加
          </button>
        </div>
        {c.skills.length === 0 && <p className="muted small">アクティブ・パッシブ・SPスキルを登録すると評価に反映されます。</p>}
        {c.skills.map((s, i) => (
          <SkillEditor
            key={i}
            value={s}
            affiliations={p.affiliations}
            onChange={(ns) => set({ skills: c.skills.map((x, j) => (j === i ? ns : x)) })}
            onRemove={() => set({ skills: c.skills.filter((_, j) => j !== i) })}
          />
        ))}
      </div>

      {!p.isNew && (
        <div className="row">
          <label className="check">
            <input type="checkbox" checked={p.pinned} onChange={p.onTogglePin} />
            編成に必ず入れる（固定）
          </label>
          <label className="check">
            <input type="checkbox" checked={p.excluded} onChange={p.onToggleExclude} />
            編成に使わない（除外）
          </label>
        </div>
      )}

      <div className="row">
        <button className="btn primary" onClick={() => p.onSave({ ...c, sample: c.sample && c === p.card ? true : undefined })}>
          保存
        </button>
        {!p.isNew && (
          <>
            <button className="btn" onClick={() => p.onDuplicate(c)}>
              複製して追加
            </button>
            <button
              className="btn danger"
              onClick={() => {
                if (confirm(`「${c.name}」を削除しますか？`)) p.onDelete();
              }}
            >
              削除
            </button>
          </>
        )}
      </div>
    </div>
  );
}
