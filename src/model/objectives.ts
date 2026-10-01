import type { Objective, ObjectivePresetId, Param, Weights } from './types';

export const PRESET_LABEL: Record<ObjectivePresetId, string> = {
  highScore: 'ハイスコア',
  clear: 'クリア重視',
  fullCombo: 'フルコンボ',
  focusParam: 'パラメータ特化',
  custom: 'カスタム',
};

export const PRESET_DESC: Record<ObjectivePresetId, string> = {
  highScore: 'パラメータ合計とスコアUP・スコアサポートを重視',
  clear: 'ライフ回復を最優先。難しい曲のクリア向け',
  fullCombo: '判定強化を最優先。フルコンボ狙い向け',
  focusParam: '選んだパラメータが高いカードと、その倍率を重視',
  custom: '各項目の重みを自分で調整',
};

const even = { perf: 1, tech: 1, sense: 1 };

export function presetWeights(preset: ObjectivePresetId, focus: Param, current?: Weights): Weights {
  switch (preset) {
    case 'highScore':
      return { params: even, param: 1, scoreUp: 1, scoreSupport: 1.2, judge: 0.2, lifeHeal: 0, activationUp: 0.6 };
    case 'clear':
      return { params: even, param: 0.5, scoreUp: 0.2, scoreSupport: 0.2, judge: 0.8, lifeHeal: 1.5, activationUp: 0.6 };
    case 'fullCombo':
      return { params: even, param: 0.5, scoreUp: 0.3, scoreSupport: 0.3, judge: 1.5, lifeHeal: 0.6, activationUp: 0.6 };
    case 'focusParam': {
      const params = { perf: 0.3, tech: 0.3, sense: 0.3 };
      params[focus] = 1;
      return { params, param: 1.2, scoreUp: 0.8, scoreSupport: 1, judge: 0.2, lifeHeal: 0, activationUp: 0.5 };
    }
    case 'custom':
      return current ?? presetWeights('highScore', focus);
  }
}

export function makeObjective(preset: ObjectivePresetId, focus: Param, current?: Weights): Objective {
  return { preset, focusParam: focus, weights: presetWeights(preset, focus, current) };
}
