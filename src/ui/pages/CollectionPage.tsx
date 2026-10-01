import { useEffect, useMemo, useState } from 'react';
import type { AppData, Card, CardType } from '../../model/types';
import { CARD_TYPES, TYPE_LABEL } from '../../model/types';
import { newId, searchKey, type Update } from '../../store/store';
import CardEditor from '../components/CardEditor';
import { allAffiliations, holomemName } from '../format';

function useWide() {
  const q = '(min-width: 900px)';
  const [wide, setWide] = useState(() => matchMedia(q).matches);
  useEffect(() => {
    const m = matchMedia(q);
    const on = () => setWide(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return wide;
}

export default function CollectionPage({ data, update }: { data: AppData; update: Update }) {
  const [aff, setAff] = useState<string | null>(null);
  const [type, setType] = useState<CardType | null>(null);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<{ card: Card; isNew: boolean } | null>(null);
  const wide = useWide();
  const holomems = useMemo(() => new Map(data.holomems.map((h) => [h.id, h])), [data.holomems]);
  const affiliations = useMemo(() => allAffiliations(data.holomems), [data.holomems]);

  const list = useMemo(() => {
    const key = searchKey(q);
    return data.cards.filter((c) => {
      const h = holomems.get(c.holomemId);
      if (aff && !h?.affiliations.includes(aff)) return false;
      if (type && c.type !== type) return false;
      if (key && !searchKey(`${h?.name ?? ''}${c.name}`).includes(key)) return false;
      return true;
    });
  }, [data.cards, holomems, aff, type, q]);

  const startNew = (base?: Card) =>
    setEditing({
      isNew: true,
      card: base
        ? { ...structuredClone(base), id: newId(), name: `${base.name}（コピー）`, sample: undefined }
        : { id: newId(), holomemId: data.holomems[0]?.id ?? '', name: '', rarity: 4, type: 'cute', perf: 0, tech: 0, sense: 0, level: 1, skills: [] },
    });

  const save = (c: Card) => {
    update((d) => ({ ...d, cards: d.cards.some((x) => x.id === c.id) ? d.cards.map((x) => (x.id === c.id ? c : x)) : [...d.cards, c] }));
    setEditing(null);
  };
  const toggle = (key: 'pinnedCardIds' | 'excludedCardIds', id: string) =>
    update((d) => ({ ...d, [key]: d[key].includes(id) ? d[key].filter((x) => x !== id) : [...d[key], id] }));

  const editor = editing && (
    <CardEditor
      key={editing.card.id}
      card={editing.card}
      isNew={editing.isNew}
      holomems={data.holomems}
      affiliations={affiliations}
      pinned={data.pinnedCardIds.includes(editing.card.id)}
      excluded={data.excludedCardIds.includes(editing.card.id)}
      onSave={save}
      onDelete={() => {
        const id = editing.card.id;
        update((d) => ({
          ...d,
          cards: d.cards.filter((x) => x.id !== id),
          pinnedCardIds: d.pinnedCardIds.filter((x) => x !== id),
          excludedCardIds: d.excludedCardIds.filter((x) => x !== id),
        }));
        setEditing(null);
      }}
      onDuplicate={(c) => startNew(c)}
      onTogglePin={() => toggle('pinnedCardIds', editing.card.id)}
      onToggleExclude={() => toggle('excludedCardIds', editing.card.id)}
      onClose={() => setEditing(null)}
    />
  );

  return (
    <div>
      <div className="spread">
        <h1>所持カード（{data.cards.length}枚）</h1>
        <button className="btn primary" onClick={() => startNew()}>
          ＋ カードを追加
        </button>
      </div>
      <div className="grid2">
        <div>
          <input className="input" style={{ width: '100%' }} type="search" placeholder="ホロメン名・カード名で検索（ひらがな可）" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="chips" style={{ marginTop: 8 }} role="group" aria-label="タイプで絞り込み">
            <button className="chip" aria-pressed={type === null} onClick={() => setType(null)}>
              全タイプ
            </button>
            {CARD_TYPES.map((t) => (
              <button key={t} className="chip" aria-pressed={type === t} onClick={() => setType(type === t ? null : t)}>
                {TYPE_LABEL[t]}
              </button>
            ))}
          </div>
          <div className="chips" style={{ marginTop: 6 }} role="group" aria-label="所属で絞り込み">
            <button className="chip" aria-pressed={aff === null} onClick={() => setAff(null)}>
              全所属
            </button>
            {affiliations.map((a) => (
              <button key={a} className="chip" aria-pressed={aff === a} onClick={() => setAff(aff === a ? null : a)}>
                {a}
              </button>
            ))}
          </div>
          {list.length === 0 ? (
            <div className="empty">該当するカードがありません</div>
          ) : (
            <div className="card-grid" style={{ marginTop: 10 }}>
              {list.map((c) => (
                <button
                  key={c.id}
                  className={`card-tile${data.excludedCardIds.includes(c.id) ? ' excluded' : ''}`}
                  aria-selected={editing?.card.id === c.id}
                  onClick={() => setEditing({ card: c, isNew: false })}
                >
                  <span className="name">{holomemName(holomems, c.holomemId)}</span>
                  <span className="small">
                    ★{c.rarity} <span className={`type-${c.type}`}>{TYPE_LABEL[c.type]}</span> Lv{c.level}
                  </span>
                  <span className="small muted">{c.name || '（名前なし）'}</span>
                  <span className="small">
                    {c.costume && <span className="badge">衣装</span>} {data.pinnedCardIds.includes(c.id) && '📌'}
                    {data.excludedCardIds.includes(c.id) && <span className="badge">除外</span>} {c.sample && <span className="badge sample">サンプル</span>}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        {wide && <div className="card">{editor ?? <p className="empty">カードを選ぶとここで編集できます</p>}</div>}
      </div>
      {!wide && editing && (
        <div className="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && setEditing(null)}>
          <div className="sheet" role="dialog" aria-modal="true">
            {editor}
          </div>
        </div>
      )}
    </div>
  );
}
