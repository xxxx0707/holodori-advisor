import { makeObjective } from '../model/objectives';
import type { AppData, Board, BoardNode, Card, Holomem } from '../model/types';

export const SCHEMA_VERSION = 1;

/** [id, 名前, 所属...]。ゲーム内の所属表記と違う場合はアプリ内で編集できる */
const ROSTER: [string, string, ...string[]][] = [
  ['sora', 'ときのそら', '0期生'],
  ['roboco', 'ロボ子さん', '0期生'],
  ['miko', 'さくらみこ', '0期生'],
  ['suisei', '星街すいせい', '0期生'],
  ['azki', 'AZKi', '0期生'],
  ['aki', 'アキ・ローゼンタール', '1期生'],
  ['haato', '赤井はあと', '1期生'],
  ['fubuki', '白上フブキ', '1期生', 'ゲーマーズ'],
  ['matsuri', '夏色まつり', '1期生'],
  ['ayame', '百鬼あやめ', '2期生'],
  ['choco', '癒月ちょこ', '2期生'],
  ['subaru', '大空スバル', '2期生'],
  ['mio', '大神ミオ', 'ゲーマーズ'],
  ['okayu', '猫又おかゆ', 'ゲーマーズ'],
  ['korone', '戌神ころね', 'ゲーマーズ'],
  ['pekora', '兎田ぺこら', '3期生'],
  ['flare', '不知火フレア', '3期生'],
  ['noel', '白銀ノエル', '3期生'],
  ['marine', '宝鐘マリン', '3期生'],
  ['kanata', '天音かなた', '4期生'],
  ['watame', '角巻わため', '4期生'],
  ['towa', '常闇トワ', '4期生'],
  ['luna', '姫森ルーナ', '4期生'],
  ['lamy', '雪花ラミィ', '5期生'],
  ['nene', '桃鈴ねね', '5期生'],
  ['botan', '獅白ぼたん', '5期生'],
  ['polka', '尾丸ポルカ', '5期生'],
  ['laplus', 'ラプラス・ダークネス', 'holoX'],
  ['lui', '鷹嶺ルイ', 'holoX'],
  ['koyori', '博衣こより', 'holoX'],
  ['iroha', '風真いろは', 'holoX'],
  ['ao', '火威青', 'ReGLOSS'],
  ['kanade', '音乃瀬奏', 'ReGLOSS'],
  ['ririka', '一条莉々華', 'ReGLOSS'],
  ['raden', '儒烏風亭らでん', 'ReGLOSS'],
  ['hajime', '轟はじめ', 'ReGLOSS'],
  ['riona', '響咲リオナ', 'FLOW GLOW'],
  ['niko', '虎金妃笑虎', 'FLOW GLOW'],
  ['su', '水宮枢', 'FLOW GLOW'],
  ['chihaya', '輪堂千速', 'FLOW GLOW'],
  ['vivi', '綺々羅々ヴィヴィ', 'FLOW GLOW'],
];

export const SEED_HOLOMEMS: Holomem[] = ROSTER.map(([id, name, ...affiliations]) => ({ id, name, affiliations }));

/** お試し用の架空カード。数値・スキルは実際のゲームとは無関係 */
export function sampleCards(): Card[] {
  const c = (
    id: string,
    holomemId: string,
    rarity: 3 | 4 | 5,
    type: Card['type'],
    [perf, tech, sense]: [number, number, number],
    extra: Partial<Card> = {},
  ): Card => ({
    id: `sample-${id}`,
    holomemId,
    name: `サンプル${id}`,
    rarity,
    type,
    perf,
    tech,
    sense,
    level: 30,
    skills: [],
    sample: true,
    ...extra,
  });
  return [
    c('A', 'okayu', 5, 'cute', [3200, 2100, 2000], {
      costume: { name: 'サンプル衣装A', skill: { condition: { kind: 'affiliationCount', target: 'ゲーマーズ', min: 2 }, effect: { kind: 'paramUp', param: 'perf', value: 135 } } },
      skills: [{ condition: { kind: 'always' }, effect: { kind: 'scoreUp', value: 30 }, interval: 9 }],
    }),
    c('B', 'luna', 5, 'cute', [3100, 2000, 2200], {
      costume: { name: 'サンプル衣装B', skill: { condition: { kind: 'affiliationCount', target: '4期生', min: 2 }, effect: { kind: 'paramUp', param: 'perf', value: 135 } } },
      skills: [{ condition: { kind: 'always' }, effect: { kind: 'scoreSupport', value: 25 }, interval: 11 }],
    }),
    c('C', 'pekora', 5, 'happy', [2200, 2300, 3100], {
      costume: { name: 'サンプル衣装C', skill: { condition: { kind: 'always' }, effect: { kind: 'scoreSupport', value: 60 } } },
      skills: [{ condition: { kind: 'always' }, effect: { kind: 'scoreUp', value: 28 }, interval: 9 }],
    }),
    c('D', 'korone', 4, 'happy', [2700, 1900, 1800], { skills: [{ condition: { kind: 'always' }, effect: { kind: 'scoreUp', value: 22 }, interval: 9 }] }),
    c('E', 'mio', 4, 'pure', [1800, 2800, 1900], { skills: [{ condition: { kind: 'always' }, effect: { kind: 'lifeHeal', value: 30 }, interval: 12 }] }),
    c('F', 'kanata', 4, 'pure', [2600, 1900, 1900], { skills: [{ condition: { kind: 'typeCount', target: 'pure', min: 3 }, effect: { kind: 'paramUp', param: 'all', value: 20 } }] }),
    c('G', 'towa', 4, 'cute', [2000, 2000, 2700], { skills: [{ condition: { kind: 'always' }, effect: { kind: 'judge', value: 40 }, interval: 13 }] }),
    c('H', 'watame', 3, 'happy', [2200, 1700, 1700], { skills: [{ condition: { kind: 'always' }, effect: { kind: 'scoreUp', value: 15 }, interval: 10 }] }),
    c('I', 'fubuki', 4, 'cute', [2500, 2100, 2000], { skills: [{ condition: { kind: 'always' }, effect: { kind: 'activationUp', value: 20 } }] }),
    c('J', 'suisei', 4, 'pure', [2400, 2400, 1900], { skills: [{ condition: { kind: 'always' }, effect: { kind: 'scoreUp', value: 26 }, interval: 9 }] }),
  ];
}

/** お試し用の架空ボード（猫又おかゆ）。実際のボード形状とは無関係 */
export function sampleBoard(): Board {
  const n = (id: string, x: number, y: number, color: BoardNode['color'], label: string, effect: BoardNode['effect'], costPt: number, cubes: Record<string, number>, rank?: number): BoardNode => ({
    id,
    x,
    y,
    color,
    label,
    effect,
    costPt,
    costCubes: cubes,
    requiredDreamRank: rank,
  });
  return {
    holomemId: 'okayu',
    sample: true,
    startNodeId: 's',
    nodes: [
      n('s', 3, 3, 'green', '開始', undefined, 0, {}),
      n('r1', 3, 2, 'red', 'P+4%', { kind: 'paramUp', param: 'perf', value: 4 }, 10, { 赤: 1 }),
      n('r2', 3, 1, 'red', 'P+6%', { kind: 'paramUp', param: 'perf', value: 6 }, 15, { 赤: 2 }),
      n('r3', 3, 0, 'red', 'ホロメンスキル', { kind: 'holomemSkill', value: 30 }, 30, { 赤: 3, 赤コア: 1 }, 2),
      n('b1', 4, 3, 'blue', 'S+4%', { kind: 'paramUp', param: 'sense', value: 4 }, 10, { 青: 1 }),
      n('b2', 5, 3, 'blue', '発動率+5%', { kind: 'activationUp', value: 5 }, 15, { 青: 2 }),
      n('b3', 6, 3, 'blue', 'P+8%', { kind: 'paramUp', param: 'perf', value: 8 }, 25, { 青: 3, 青コア: 1 }, 2),
      n('y1', 2, 3, 'yellow', 'スコア+2%', { kind: 'scoreUp', value: 2 }, 15, { 黄: 2 }),
      n('y2', 1, 3, 'yellow', 'スコア+3%', { kind: 'scoreUp', value: 3 }, 20, { 黄: 3 }),
      n('g1', 3, 4, 'green', '全員P+2%', { kind: 'paramUp', param: 'perf', value: 2 }, 15, { 緑: 2 }),
      n('g2', 3, 5, 'green', '全員全P+2%', { kind: 'paramUp', param: 'all', value: 2 }, 25, { 緑: 3 }),
      n('c1', 4, 2, 'connect', 'コネクト', undefined, 20, { 虹: 1 }),
    ],
  };
}

export function defaultData(): AppData {
  return {
    schemaVersion: SCHEMA_VERSION,
    holomems: SEED_HOLOMEMS,
    cards: sampleCards(),
    boards: [sampleBoard()],
    boardProgress: { okayu: { opened: [], pt: 60, dreamRank: 1 } },
    cubes: { 赤: 4, 青: 4, 黄: 2, 緑: 3, 赤コア: 0, 青コア: 0, 虹: 1 },
    settings: { memberCount: 5, allowLeaderHolomemInMembers: true, leaderCountsForCondition: true, songSeconds: 120 },
    objective: makeObjective('highScore', 'perf'),
    pinnedCardIds: [],
    excludedCardIds: [],
    leaderChoice: null,
    savedTeams: [],
    lastTeam: null,
    lastBackupAt: null,
  };
}

/** 保存データを現在のスキーマに合わせる。ユーザーの編集を優先し、足りない項目だけ補う */
export function migrate(raw: Partial<AppData> | undefined): AppData {
  const base = defaultData();
  if (!raw) return base;
  const merged: AppData = { ...base, ...raw, settings: { ...base.settings, ...raw.settings }, schemaVersion: SCHEMA_VERSION };
  // 雛形に新しく追加されたホロメンだけ足す（ユーザーが編集したホロメンは上書きしない）
  const known = new Set(merged.holomems.map((h) => h.id));
  for (const h of SEED_HOLOMEMS) if (!known.has(h.id)) merged.holomems.push(h);
  return merged;
}
