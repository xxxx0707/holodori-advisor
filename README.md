# ホロドリ編成アドバイザー

「ホロライブドリームス」の手持ちカードから目的に合った編成を探し、ホロメンボードの解放順を提案する非公式ファンツール（iPhone / iPad 向け PWA）。

## 使い方（iPhone / iPad）
1. 公開 URL を Safari で開く
2. 共有ボタン →「ホーム画面に追加」→ ホーム画面のアイコンから開く（Safari のタブとホーム画面アプリはデータが別なので、入力はホーム画面版で）
3. 「所持」でカードを登録 →「編成」で目的を選んで探索 →「ボード」で解放順を確認
4. 「データ」から定期的にバックアップを書き出す

## 開発
```
npm install
npm run dev -- --host   # 同じ Wi-Fi の iPhone から http://<PCのIP>:5173 で確認
npm test
npm run build
```

## 公開（GitHub Pages）
GitHub にリポジトリを作って push し、Settings → Pages → Source を「GitHub Actions」にすると `.github/workflows/deploy.yml` で自動公開されます。

## 評価モデル
- 基本値 = メンバーの P/T/S ×（1 + 成立した衣装・パラメータUP 倍率）× 目的の重み
- 補正 = スキル効果 × 発動率（アクティブは間隔から推定）× 目的の重み − 同種・同間隔スキルの重複ペナルティ
- 数値は目安で、ゲーム内スコアとは一致しません。重みは「編成」→「重みを細かく調整」で変更できます。

## ボードJSON の形式
```json
{
  "holomemId": "okayu",
  "startNodeId": "s",
  "nodes": [
    { "id": "s", "x": 0, "y": 0, "color": "green", "label": "開始", "costPt": 0, "costCubes": {} },
    { "id": "r1", "x": 0, "y": -1, "color": "red", "label": "P+4%",
      "effect": { "kind": "paramUp", "param": "perf", "value": 4 },
      "costPt": 10, "costCubes": { "赤": 1 }, "requiredDreamRank": 1 }
  ],
  "extraEdges": [],
  "removedEdges": []
}
```
格子座標 (x, y) が上下左右で隣り合うマスは自動でつながります。color は red / blue / yellow / green / connect。
