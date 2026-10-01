import type { Card, Condition, EffectKind, Holomem, Objective, Param, Settings, Skill, Team } from './types';
import { PARAMS } from './types';

export interface EvalContext {
  cards: Map<string, Card>;
  holomems: Map<string, Holomem>;
  settings: Settings;
  objective: Objective;
}

export type BreakdownKey = 'param' | Exclude<EffectKind, 'paramUp'>;
export const BREAKDOWN_KEYS: BreakdownKey[] = ['param', 'scoreUp', 'scoreSupport', 'judge', 'lifeHeal', 'activationUp'];
export const BREAKDOWN_LABEL: Record<BreakdownKey, string> = {
  param: 'パラメータ',
  scoreUp: 'スコアUP',
  scoreSupport: 'スコアサポート',
  judge: '判定強化',
  lifeHeal: 'ライフ回復',
  activationUp: '発動率UP',
};

export interface UnmetCondition {
  cardId: string;
  source: 'costume' | 'skill';
  skill: Skill;
  missing: number;
}

export interface TeamEvaluation {
  score: number;
  breakdown: Record<BreakdownKey, number>;
  /** 成立した衣装・パラメータ倍率（%） */
  paramMultiplier: Record<Param, number>;
  costumeActive: boolean;
  unmet: UnmetCondition[];
  /** メンバーごとの寄与（入れ替え候補の判断に使う） */
  memberContribution: Record<string, number>;
}

/** パラメータ合計をスコア尺度に揃える係数（パラメータ 500 ≒ スキル効果 10% 相当） */
const PARAM_SCALE = 1 / 500;
const SKILL_SCALE = 1 / 10;
/** アクティブスキル 1 回の効果時間の想定（秒） */
const ACTIVE_DURATION = 5;
/** 同じ種類・同じ間隔のアクティブスキルが重なるときの減衰 */
const OVERLAP_DECAY = 0.85;

export function conditionCount(cond: Condition, participants: Card[], holomems: Map<string, Holomem>): number {
  switch (cond.kind) {
    case 'always':
      return Infinity;
    case 'typeCount':
      return participants.filter((c) => c.type === cond.target).length;
    case 'affiliationCount':
      return participants.filter((c) => holomems.get(c.holomemId)?.affiliations.includes(cond.target)).length;
  }
}

export function conditionMissing(cond: Condition, participants: Card[], holomems: Map<string, Holomem>): number {
  if (cond.kind === 'always') return 0;
  return Math.max(0, cond.min - conditionCount(cond, participants, holomems));
}

/** アクティブスキルの平均的な効果率。パッシブは 1 */
export function skillUptime(skill: Skill): number {
  if (!skill.interval || skill.interval <= 0) return 1;
  return Math.min(1, ACTIVE_DURATION / skill.interval);
}

function paramsOf(card: Card): Record<Param, number> {
  return { perf: card.perf, tech: card.tech, sense: card.sense };
}

export function evaluateTeam(team: Team, ctx: EvalContext): TeamEvaluation {
  const { cards, holomems, settings, objective } = ctx;
  const w = objective.weights;
  const leader = team.leaderCardId ? cards.get(team.leaderCardId) : undefined;
  const members = team.memberCardIds.map((id) => cards.get(id)).filter((c): c is Card => !!c);
  const participants = settings.leaderCountsForCondition && leader ? [leader, ...members] : members;

  const breakdown: Record<BreakdownKey, number> = { param: 0, scoreUp: 0, scoreSupport: 0, judge: 0, lifeHeal: 0, activationUp: 0 };
  const paramMultiplier: Record<Param, number> = { perf: 0, tech: 0, sense: 0 };
  const unmet: UnmetCondition[] = [];
  const memberContribution: Record<string, number> = {};

  const addParamUp = (skill: Skill, factor: number) => {
    const targets = skill.effect.param === 'all' || !skill.effect.param ? PARAMS : [skill.effect.param];
    for (const p of targets) paramMultiplier[p] += skill.effect.value * factor;
  };

  let costumeActive = false;
  if (leader?.costume) {
    const s = leader.costume.skill;
    const missing = conditionMissing(s.condition, participants, holomems);
    if (missing === 0) {
      costumeActive = true;
      if (s.effect.kind === 'paramUp') addParamUp(s, 1);
      else breakdown[s.effect.kind] += s.effect.value * SKILL_SCALE * w[s.effect.kind];
    } else {
      unmet.push({ cardId: leader.id, source: 'costume', skill: s, missing });
    }
  }

  // スキル（パラメータUP は倍率に、それ以外は重み付きで加算）
  const activeSeen = new Map<string, number>();
  const skillScoreByCard: Record<string, number> = {};
  for (const card of members) {
    skillScoreByCard[card.id] = 0;
    for (const s of card.skills) {
      const missing = conditionMissing(s.condition, participants, holomems);
      if (missing > 0) {
        unmet.push({ cardId: card.id, source: 'skill', skill: s, missing });
        continue;
      }
      let factor = skillUptime(s);
      if (s.interval) {
        const key = `${s.effect.kind}:${s.interval}`;
        const n = activeSeen.get(key) ?? 0;
        factor *= OVERLAP_DECAY ** n;
        activeSeen.set(key, n + 1);
      }
      if (s.effect.kind === 'paramUp') {
        addParamUp(s, factor);
      } else {
        const v = s.effect.value * factor * SKILL_SCALE * w[s.effect.kind];
        breakdown[s.effect.kind] += v;
        skillScoreByCard[card.id] += v;
      }
    }
  }

  for (const card of members) {
    const p = paramsOf(card);
    let v = 0;
    for (const k of PARAMS) v += p[k] * (1 + paramMultiplier[k] / 100) * w.params[k];
    v *= PARAM_SCALE * w.param;
    breakdown.param += v;
    memberContribution[card.id] = v + skillScoreByCard[card.id];
  }

  const score = Object.values(breakdown).reduce((a, b) => a + b, 0);
  return { score, breakdown, paramMultiplier, costumeActive, unmet, memberContribution };
}

/** 枝刈り用の単体評価。条件付きスキルは半分の価値として見積もる */
export function soloScore(card: Card, ctx: EvalContext): number {
  const w = ctx.objective.weights;
  let v = 0;
  for (const k of PARAMS) v += paramsOf(card)[k] * w.params[k];
  v *= PARAM_SCALE * w.param;
  for (const s of card.skills) {
    const cond = s.condition.kind === 'always' ? 1 : 0.5;
    const f = skillUptime(s) * cond;
    if (s.effect.kind === 'paramUp') v += (s.effect.value / 100) * 0.2 * f * w.param;
    else v += s.effect.value * f * SKILL_SCALE * w[s.effect.kind];
  }
  return v;
}

export function cardMeets(card: Card, cond: Condition, holomems: Map<string, Holomem>): boolean {
  if (cond.kind === 'always') return true;
  if (cond.kind === 'typeCount') return card.type === cond.target;
  return !!holomems.get(card.holomemId)?.affiliations.includes(cond.target);
}
