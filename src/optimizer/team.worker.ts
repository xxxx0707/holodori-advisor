import type { Card, Holomem, LeaderChoice, Objective, Settings } from '../model/types';
import { searchBestTeams, type TeamResult } from './team';

export interface TeamWorkerRequest {
  cards: Card[];
  holomems: Holomem[];
  settings: Settings;
  objective: Objective;
  pinnedCardIds: string[];
  excludedCardIds: string[];
  leaderChoice: LeaderChoice;
}

export type TeamWorkerMessage =
  | { type: 'progress'; done: number; total: number }
  | { type: 'done'; results: TeamResult[] }
  | { type: 'error'; message: string };

self.onmessage = (e: MessageEvent<TeamWorkerRequest>) => {
  const req = e.data;
  const post = (m: TeamWorkerMessage) => self.postMessage(m);
  try {
    const results = searchBestTeams(
      {
        cards: new Map(req.cards.map((c) => [c.id, c])),
        holomems: new Map(req.holomems.map((h) => [h.id, h])),
        settings: req.settings,
        objective: req.objective,
      },
      {
        pinnedCardIds: req.pinnedCardIds,
        excludedCardIds: req.excludedCardIds,
        leaderHolomemId: req.leaderChoice?.holomemId,
        leaderCardId: req.leaderChoice?.cardId ?? undefined,
        onProgress: (done, total) => post({ type: 'progress', done, total }),
      },
    );
    post({ type: 'done', results });
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
