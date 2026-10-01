import { get, set } from 'idb-keyval';
import { useCallback, useEffect, useRef, useState } from 'react';
import { migrate } from '../data/seed';
import type { AppData } from '../model/types';

const KEY = 'holodori-advisor';

export async function loadData(): Promise<AppData> {
  try {
    return migrate(await get<AppData>(KEY));
  } catch {
    return migrate(undefined);
  }
}

export async function saveData(data: AppData): Promise<void> {
  await set(KEY, data);
}

/** iOS でストレージが自動削除されにくくする */
export async function requestPersist(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

export function useAppData() {
  const [data, setData] = useState<AppData | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    loadData().then(setData);
    requestPersist();
  }, []);

  const update = useCallback((fn: (d: AppData) => AppData) => {
    setData((prev) => {
      if (!prev) return prev;
      const next = fn(prev);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => saveData(next), 300);
      return next;
    });
  }, []);

  const replace = useCallback((next: AppData) => {
    setData(next);
    saveData(next);
  }, []);

  return { data, update, replace };
}

export type Update = (fn: (d: AppData) => AppData) => void;

export const newId = () => Math.random().toString(36).slice(2, 10);

/** ひらがな・カタカナ・大文字小文字を区別しない検索キー */
export function searchKey(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

export function exportJson(data: AppData): string {
  return JSON.stringify(data, null, 1);
}

export function parseImport(text: string): AppData {
  const raw = JSON.parse(text);
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.cards)) throw new Error('バックアップファイルの形式が違います');
  return migrate(raw);
}
