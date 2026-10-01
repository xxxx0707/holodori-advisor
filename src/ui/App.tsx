import { useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useAppData } from '../store/store';
import BoardPage from './pages/BoardPage';
import CollectionPage from './pages/CollectionPage';
import DataPage from './pages/DataPage';
import TeamPage from './pages/TeamPage';

type Tab = 'team' | 'board' | 'collection' | 'data';
const TABS: { id: Tab; label: string; ico: string }[] = [
  { id: 'team', label: '編成', ico: '★' },
  { id: 'board', label: 'ボード', ico: '◈' },
  { id: 'collection', label: '所持', ico: '▦' },
  { id: 'data', label: 'データ', ico: '⚙' },
];

const BACKUP_REMIND_MS = 7 * 24 * 60 * 60 * 1000;

function isStandalone(): boolean {
  return (navigator as Navigator & { standalone?: boolean }).standalone === true || matchMedia('(display-mode: standalone)').matches;
}
function isIOS(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export default function App() {
  const { data, update, replace } = useAppData();
  const [tab, setTab] = useState<Tab>('team');
  const [hideInstall, setHideInstall] = useState(() => sessionStorageGet('hideInstall') === '1');
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!data) return <div className="empty">読み込み中…</div>;

  const showInstall = isIOS() && !isStandalone() && !hideInstall;
  const hasUserCards = data.cards.some((c) => !c.sample);
  const needBackup = hasUserCards && (!data.lastBackupAt || Date.now() - data.lastBackupAt > BACKUP_REMIND_MS);

  return (
    <div className="app">
      <nav className="tabbar" aria-label="メニュー">
        {TABS.map((t) => (
          <button key={t.id} aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
            <span className="ico" aria-hidden>
              {t.ico}
            </span>
            {t.label}
          </button>
        ))}
      </nav>
      <main className="main">
        {showInstall && (
          <div className="banner info">
            <strong>ホーム画面に追加して使ってください</strong>
            <p className="small">Safari で開いたままだと、ホーム画面のアプリとデータが別になります。データを入力する前に追加するのがおすすめです。</p>
            <ol className="install-steps small">
              <li>画面下（iPad は右上）の共有ボタン（□に↑）をタップ</li>
              <li>「ホーム画面に追加」を選ぶ</li>
              <li>ホーム画面のアイコンから開き直す</li>
            </ol>
            <button
              className="btn small"
              onClick={() => {
                sessionStorageSet('hideInstall', '1');
                setHideInstall(true);
              }}
            >
              今は閉じる
            </button>
          </div>
        )}
        {needBackup && tab !== 'data' && (
          <div className="banner spread">
            <span className="small">最後のバックアップから7日以上たっています。</span>
            <button className="btn small" onClick={() => setTab('data')}>
              バックアップする
            </button>
          </div>
        )}
        {tab === 'team' && <TeamPage data={data} update={update} goTo={setTab} />}
        {tab === 'board' && <BoardPage data={data} update={update} />}
        {tab === 'collection' && <CollectionPage data={data} update={update} />}
        {tab === 'data' && <DataPage data={data} update={update} replace={replace} />}
      </main>
      {needRefresh && (
        <div className="toast" role="status">
          <span className="small">新しいバージョンがあります</span>
          <button className="btn small primary" onClick={() => updateServiceWorker(true)}>
            再読込
          </button>
          <button className="btn small" onClick={() => setNeedRefresh(false)}>
            あとで
          </button>
        </div>
      )}
    </div>
  );
}

function sessionStorageGet(k: string): string | null {
  try {
    return sessionStorage.getItem(k);
  } catch {
    return null;
  }
}
function sessionStorageSet(k: string, v: string) {
  try {
    sessionStorage.setItem(k, v);
  } catch {
    /* プライベートブラウズ等では保存できなくてもよい */
  }
}
