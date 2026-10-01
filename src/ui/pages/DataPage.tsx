import { useRef, useState } from 'react';
import { defaultData } from '../../data/seed';
import type { AppData, Board } from '../../model/types';
import { exportJson, newId, parseImport, type Update } from '../../store/store';

async function shareOrDownload(name: string, text: string) {
  const file = new File([text], name, { type: 'application/json' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return true;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return false;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return true;
}

function validateBoard(raw: unknown): Board {
  const b = raw as Board;
  if (!b || typeof b.holomemId !== 'string' || typeof b.startNodeId !== 'string' || !Array.isArray(b.nodes)) throw new Error('holomemId / startNodeId / nodes が必要です');
  for (const n of b.nodes) {
    if (typeof n.id !== 'string' || typeof n.x !== 'number' || typeof n.y !== 'number') throw new Error('各マスに id / x / y が必要です');
    n.costPt ??= 0;
    n.costCubes ??= {};
    n.label ??= n.id;
  }
  if (!b.nodes.some((n) => n.id === b.startNodeId)) throw new Error('startNodeId のマスがありません');
  return b;
}

export default function DataPage({ data, update, replace }: { data: AppData; update: Update; replace: (d: AppData) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const boardRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newAff, setNewAff] = useState('');
  const s = data.settings;
  const setSetting = (patch: Partial<AppData['settings']>) => update((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
  const sampleCount = data.cards.filter((c) => c.sample).length + data.boards.filter((b) => b.sample).length;

  const doExport = async () => {
    const stamp = new Date().toISOString().slice(0, 10);
    const ok = await shareOrDownload(`holodori-backup-${stamp}.json`, exportJson({ ...data, lastBackupAt: Date.now() }));
    if (ok) {
      update((d) => ({ ...d, lastBackupAt: Date.now() }));
      setMsg('バックアップを書き出しました。「ファイル」アプリなどに保存してください。');
    }
  };

  const doImport = async (f: File) => {
    try {
      const next = parseImport(await f.text());
      if (!confirm('今のデータをバックアップの内容で置き換えます。よろしいですか？')) return;
      replace(next);
      setMsg('バックアップを読み込みました。');
    } catch (e) {
      setMsg(`読み込めませんでした: ${(e as Error).message}`);
    }
  };

  const doImportBoard = async (f: File) => {
    try {
      const raw = JSON.parse(await f.text());
      const boards = (Array.isArray(raw) ? raw : [raw]).map(validateBoard);
      update((d) => ({ ...d, boards: [...d.boards.filter((b) => !boards.some((x) => x.holomemId === b.holomemId)), ...boards] }));
      setMsg(`ボードを${boards.length}件読み込みました。`);
    } catch (e) {
      setMsg(`ボードを読み込めませんでした: ${(e as Error).message}`);
    }
  };

  return (
    <div>
      <h1>データと設定</h1>
      {msg && (
        <div className="banner info spread">
          <span className="small">{msg}</span>
          <button className="btn small" onClick={() => setMsg(null)}>
            OK
          </button>
        </div>
      )}

      <section className="card stack">
        <h2 style={{ marginTop: 0 }}>バックアップ</h2>
        <p className="small muted">
          データはこの端末のアプリ内にだけ保存されます。iPhone の空き容量が少ないと消えることがあるので、ときどき書き出してください。
          {data.lastBackupAt ? `最終バックアップ: ${new Date(data.lastBackupAt).toLocaleString('ja-JP')}` : 'まだバックアップしていません。'}
        </p>
        <div className="row">
          <button className="btn primary" onClick={doExport}>
            書き出す
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            読み込む
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && doImport(e.target.files[0])} />
        </div>
      </section>

      <section className="card stack">
        <h2 style={{ marginTop: 0 }}>編成ルール</h2>
        <p className="small muted">ゲーム内の仕様と違う場合はここで合わせてください。</p>
        <label className="field" style={{ maxWidth: 200 }}>
          メンバー枠の枚数
          <input type="number" inputMode="numeric" min={1} max={6} value={s.memberCount} onChange={(e) => setSetting({ memberCount: Math.max(1, Number(e.target.value) || 1) })} />
        </label>
        <label className="check">
          <input type="checkbox" checked={s.allowLeaderHolomemInMembers} onChange={(e) => setSetting({ allowLeaderHolomemInMembers: e.target.checked })} />
          リーダーと同じホロメンのカードをメンバーに入れられる
        </label>
        <label className="check">
          <input type="checkbox" checked={s.leaderCountsForCondition} onChange={(e) => setSetting({ leaderCountsForCondition: e.target.checked })} />
          「◯◯2人以上」などの人数にリーダーを含める
        </label>
      </section>

      {sampleCount > 0 && (
        <section className="card stack">
          <h2 style={{ marginTop: 0 }}>サンプルデータ</h2>
          <p className="small muted">お試し用の架空カード・ボードが{sampleCount}件入っています（数値は実際のゲームとは無関係です）。</p>
          <button
            className="btn danger"
            onClick={() =>
              confirm('サンプルカードとサンプルボードを削除しますか？') &&
              update((d) => {
                const ids = new Set(d.cards.filter((c) => c.sample).map((c) => c.id));
                return {
                  ...d,
                  cards: d.cards.filter((c) => !c.sample),
                  pinnedCardIds: d.pinnedCardIds.filter((x) => !ids.has(x)),
                  excludedCardIds: d.excludedCardIds.filter((x) => !ids.has(x)),
                  boards: d.boards.filter((b) => !b.sample),
                  lastTeam: null,
                };
              })
            }
          >
            サンプルを削除
          </button>
        </section>
      )}

      <section className="card stack">
        <h2 style={{ marginTop: 0 }}>ホロメンボード</h2>
        <p className="small muted">
          登録済み: {data.boards.length}件。ボードは JSON で読み込めます（形式は「書き出す」で出したファイルの boards を参考にしてください）。同じホロメンのボードは上書きされます。
        </p>
        <div className="row">
          <button className="btn" onClick={() => boardRef.current?.click()}>
            ボードJSONを読み込む
          </button>
          <input ref={boardRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && doImportBoard(e.target.files[0])} />
        </div>
      </section>

      <section className="card stack">
        <h2 style={{ marginTop: 0 }}>ホロメンと所属</h2>
        <p className="small muted">所属（期生・ユニット）は衣装スキルの人数条件に使います。カンマ区切りで編集できます。</p>
        <details>
          <summary>一覧を編集（{data.holomems.length}人）</summary>
          <table className="simple">
            <tbody>
              {data.holomems.map((h) => (
                <tr key={h.id}>
                  <td style={{ width: '40%' }}>{h.name}</td>
                  <td>
                    <input
                      className="input"
                      style={{ width: '100%' }}
                      defaultValue={h.affiliations.join(', ')}
                      onBlur={(e) => {
                        const affiliations = e.target.value.split(/[,、]/).map((x) => x.trim()).filter(Boolean);
                        update((d) => ({ ...d, holomems: d.holomems.map((x) => (x.id === h.id ? { ...x, affiliations } : x)) }));
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
        <div className="fields">
          <label className="field">
            名前
            <input value={newName} onChange={(e) => setNewName(e.target.value)} />
          </label>
          <label className="field">
            所属（カンマ区切り）
            <input value={newAff} onChange={(e) => setNewAff(e.target.value)} />
          </label>
        </div>
        <button
          className="btn"
          disabled={!newName.trim()}
          onClick={() => {
            const affiliations = newAff.split(/[,、]/).map((x) => x.trim()).filter(Boolean);
            update((d) => ({ ...d, holomems: [...d.holomems, { id: newId(), name: newName.trim(), affiliations }] }));
            setNewName('');
            setNewAff('');
          }}
        >
          ホロメンを追加
        </button>
      </section>

      <section className="card stack">
        <h2 style={{ marginTop: 0 }}>初期化</h2>
        <button className="btn danger" onClick={() => confirm('すべてのデータを消して最初の状態に戻します。よろしいですか？') && replace(defaultData())}>
          すべて初期化
        </button>
      </section>
      <p className="small muted">
        このアプリは非公式のファンツールです。評価値は入力データと重みからの目安で、ゲーム内の実際のスコアとは一致しません。
      </p>
    </div>
  );
}
