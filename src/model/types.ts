export type CardType = 'happy' | 'pure' | 'cute';
export type Param = 'perf' | 'tech' | 'sense';

export const CARD_TYPES: CardType[] = ['happy', 'pure', 'cute'];
export const PARAMS: Param[] = ['perf', 'tech', 'sense'];
export const TYPE_LABEL: Record<CardType, string> = { happy: 'ハッピー', pure: 'ピュア', cute: 'キュート' };
export const PARAM_LABEL: Record<Param, string> = { perf: 'パフォーマンス', tech: 'テクニック', sense: 'センス' };
export const PARAM_SHORT: Record<Param, string> = { perf: 'P', tech: 'T', sense: 'S' };

/** スキル効果の種類。paramUp はパラメータ倍率として基本値に掛かり、それ以外は重み付きで加算する */
export type EffectKind = 'paramUp' | 'scoreUp' | 'scoreSupport' | 'judge' | 'lifeHeal' | 'activationUp';
export const EFFECT_KINDS: EffectKind[] = ['paramUp', 'scoreUp', 'scoreSupport', 'judge', 'lifeHeal', 'activationUp'];
export const EFFECT_LABEL: Record<EffectKind, string> = {
  paramUp: 'パラメータUP',
  scoreUp: 'スコアUP',
  scoreSupport: 'スコアサポート',
  judge: '判定強化',
  lifeHeal: 'ライフ回復',
  activationUp: 'スキル発動率UP',
};

/** 発動条件。typeCount/affiliationCount は編成内の人数で判定する */
export type Condition =
  | { kind: 'always' }
  | { kind: 'typeCount'; target: CardType; min: number }
  | { kind: 'affiliationCount'; target: string; min: number };

export interface Effect {
  kind: EffectKind;
  /** % 単位（例: 135 = 135%UP） */
  value: number;
  /** paramUp の対象。'all' は 3 種すべて */
  param?: Param | 'all';
}

export interface Skill {
  name?: string;
  condition: Condition;
  effect: Effect;
  /** アクティブスキルの発動間隔（秒）。未設定はパッシブ扱い */
  interval?: number;
}

export interface Costume {
  name: string;
  skill: Skill;
}

export interface Holomem {
  id: string;
  name: string;
  /** 期生・ユニットなど。複数所属可（例: 白上フブキ = 1期生, ゲーマーズ） */
  affiliations: string[];
}

export interface Card {
  id: string;
  holomemId: string;
  name: string;
  rarity: 3 | 4 | 5;
  type: CardType;
  perf: number;
  tech: number;
  sense: number;
  level: number;
  /** ★4/★5 に付く衣装。リーダーにしたときだけ有効 */
  costume?: Costume;
  skills: Skill[];
  /** 架空の数値で作ったお試し用データ */
  sample?: boolean;
}

export interface Team {
  leaderCardId: string | null;
  memberCardIds: string[];
}

export interface Weights {
  /** パラメータ種ごとの重み */
  params: Record<Param, number>;
  /** パラメータ合計への重み */
  param: number;
  scoreUp: number;
  scoreSupport: number;
  judge: number;
  lifeHeal: number;
  activationUp: number;
}

export type ObjectivePresetId = 'highScore' | 'clear' | 'fullCombo' | 'focusParam' | 'custom';

export interface Objective {
  preset: ObjectivePresetId;
  focusParam: Param;
  weights: Weights;
}

export interface Settings {
  /** メンバー枠の枚数（実機で 4 か 5 か要確認のため設定値） */
  memberCount: number;
  /** リーダーと同じホロメンのカードをメンバーに入れられるか */
  allowLeaderHolomemInMembers: boolean;
  /** 人数条件の判定にリーダーを含めるか */
  leaderCountsForCondition: boolean;
  /** 楽曲の長さ（秒）。アクティブスキルの発動回数見積もりに使う */
  songSeconds: number;
}

// ---- ホロメンボード ----

export type NodeColor = 'red' | 'blue' | 'yellow' | 'green' | 'connect';
export const NODE_COLOR_LABEL: Record<NodeColor, string> = {
  red: '赤（リーダー）',
  blue: '青（メンバー）',
  yellow: '黄（サポート）',
  green: '緑（サポート）',
  connect: 'コネクト',
};
export const NODE_COLOR_MARK: Record<NodeColor, string> = { red: 'L', blue: 'M', yellow: 'S', green: 'G', connect: 'C' };

export interface BoardNode {
  id: string;
  /** 格子座標 */
  x: number;
  y: number;
  color: NodeColor;
  label: string;
  /** 効果。holomemSkill はリーダー時のホロメンスキル */
  effect?: Effect | { kind: 'holomemSkill'; value: number };
  costPt: number;
  /** キューブ種別名 → 個数（例: { "赤": 3, "赤コア": 1 }） */
  costCubes: Record<string, number>;
  requiredDreamRank?: number;
}

export interface Board {
  holomemId: string;
  startNodeId: string;
  nodes: BoardNode[];
  /** 格子で隣接していないが繋がっている辺 */
  extraEdges?: [string, string][];
  /** 格子で隣接しているが繋がっていない辺 */
  removedEdges?: [string, string][];
  /** 架空のお試し用データ */
  sample?: boolean;
}

export interface BoardProgress {
  opened: string[];
  pt: number;
  dreamRank: number;
}

export type Role = 'leader' | 'member' | 'none';

export interface SavedTeam {
  id: string;
  name: string;
  savedAt: number;
  team: Team;
  score: number;
}

export interface AppData {
  schemaVersion: number;
  holomems: Holomem[];
  cards: Card[];
  boards: Board[];
  boardProgress: Record<string, BoardProgress>;
  cubes: Record<string, number>;
  settings: Settings;
  objective: Objective;
  pinnedCardIds: string[];
  excludedCardIds: string[];
  savedTeams: SavedTeam[];
  lastTeam: Team | null;
  lastBackupAt: number | null;
}
