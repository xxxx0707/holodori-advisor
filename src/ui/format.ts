import type { BoardNode, Condition, Effect, Holomem, Skill } from '../model/types';
import { EFFECT_LABEL, PARAM_LABEL, TYPE_LABEL } from '../model/types';

export function describeCondition(c: Condition): string {
  switch (c.kind) {
    case 'always':
      return '条件なし';
    case 'typeCount':
      return `${TYPE_LABEL[c.target]}${c.min}人以上`;
    case 'affiliationCount':
      return `${c.target}${c.min}人以上`;
  }
}

export function describeEffect(e: Effect | NonNullable<BoardNode['effect']>): string {
  if (e.kind === 'holomemSkill') return `ホロメンスキル（価値${e.value}）`;
  if (e.kind === 'paramUp') {
    const p = !e.param || e.param === 'all' ? '全パラメータ' : PARAM_LABEL[e.param];
    return `${p}+${e.value}%`;
  }
  return `${EFFECT_LABEL[e.kind]}${e.value}%`;
}

export function describeSkill(s: Skill): string {
  const head = s.interval ? `${s.interval}秒毎 ` : '常時 ';
  const cond = s.condition.kind === 'always' ? '' : `［${describeCondition(s.condition)}］`;
  return `${head}${describeEffect(s.effect)}${cond}`;
}

export function holomemName(holomems: Map<string, Holomem>, id: string): string {
  return holomems.get(id)?.name ?? '（不明なホロメン）';
}

export const fmt = (n: number) => (Math.round(n * 10) / 10).toLocaleString('ja-JP');

export function allAffiliations(holomems: Holomem[]): string[] {
  const s = new Set<string>();
  for (const h of holomems) for (const a of h.affiliations) s.add(a);
  return [...s];
}
