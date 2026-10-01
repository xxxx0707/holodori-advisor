import type { CardType, Condition, Effect, EffectKind, Param, Skill } from '../../model/types';
import { CARD_TYPES, EFFECT_KINDS, EFFECT_LABEL, PARAMS, PARAM_LABEL, TYPE_LABEL } from '../../model/types';

export function ConditionEditor({ value, onChange, affiliations }: { value: Condition; onChange: (c: Condition) => void; affiliations: string[] }) {
  return (
    <div className="fields">
      <label className="field">
        条件
        <select
          value={value.kind}
          onChange={(e) => {
            const k = e.target.value as Condition['kind'];
            if (k === 'always') onChange({ kind: 'always' });
            else if (k === 'typeCount') onChange({ kind: 'typeCount', target: 'cute', min: 2 });
            else onChange({ kind: 'affiliationCount', target: affiliations[0] ?? '', min: 2 });
          }}
        >
          <option value="always">条件なし</option>
          <option value="typeCount">タイプの人数</option>
          <option value="affiliationCount">所属の人数</option>
        </select>
      </label>
      {value.kind === 'typeCount' && (
        <label className="field">
          タイプ
          <select value={value.target} onChange={(e) => onChange({ ...value, target: e.target.value as CardType })}>
            {CARD_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
      )}
      {value.kind === 'affiliationCount' && (
        <label className="field">
          所属
          <select value={value.target} onChange={(e) => onChange({ ...value, target: e.target.value })}>
            {affiliations.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
      )}
      {value.kind !== 'always' && (
        <label className="field">
          人数以上
          <input type="number" inputMode="numeric" min={1} max={6} value={value.min} onChange={(e) => onChange({ ...value, min: Number(e.target.value) || 1 })} />
        </label>
      )}
    </div>
  );
}

export function EffectEditor({ value, onChange }: { value: Effect; onChange: (e: Effect) => void }) {
  return (
    <div className="fields">
      <label className="field">
        効果
        <select
          value={value.kind}
          onChange={(e) => {
            const kind = e.target.value as EffectKind;
            onChange(kind === 'paramUp' ? { kind, value: value.value, param: value.param ?? 'all' } : { kind, value: value.value });
          }}
        >
          {EFFECT_KINDS.map((k) => (
            <option key={k} value={k}>
              {EFFECT_LABEL[k]}
            </option>
          ))}
        </select>
      </label>
      {value.kind === 'paramUp' && (
        <label className="field">
          対象
          <select value={value.param ?? 'all'} onChange={(e) => onChange({ ...value, param: e.target.value as Param | 'all' })}>
            <option value="all">全パラメータ</option>
            {PARAMS.map((p) => (
              <option key={p} value={p}>
                {PARAM_LABEL[p]}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="field">
        効果量（%）
        <input type="number" inputMode="decimal" min={0} value={value.value} onChange={(e) => onChange({ ...value, value: Number(e.target.value) || 0 })} />
      </label>
    </div>
  );
}

export function SkillEditor({ value, onChange, onRemove, affiliations }: { value: Skill; onChange: (s: Skill) => void; onRemove: () => void; affiliations: string[] }) {
  return (
    <div className="card stack" style={{ background: 'var(--surface-2)' }}>
      <div className="spread">
        <label className="check">
          <input
            type="checkbox"
            checked={!!value.interval}
            onChange={(e) => onChange({ ...value, interval: e.target.checked ? 10 : undefined })}
          />
          アクティブ（一定間隔で発動）
        </label>
        <button className="btn small danger" onClick={onRemove}>
          削除
        </button>
      </div>
      {value.interval !== undefined && (
        <label className="field" style={{ maxWidth: 160 }}>
          発動間隔（秒）
          <input type="number" inputMode="decimal" min={1} value={value.interval} onChange={(e) => onChange({ ...value, interval: Number(e.target.value) || 1 })} />
        </label>
      )}
      <EffectEditor value={value.effect} onChange={(effect) => onChange({ ...value, effect })} />
      <ConditionEditor value={value.condition} onChange={(condition) => onChange({ ...value, condition })} affiliations={affiliations} />
    </div>
  );
}

export const newSkill = (): Skill => ({ condition: { kind: 'always' }, effect: { kind: 'scoreUp', value: 20 }, interval: 10 });
