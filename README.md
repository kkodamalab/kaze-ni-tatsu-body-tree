# 風の木になろう！ / Become a Wind Tree!

イベント「風に立つ」を想定した身体性 Visual Biofeedback WebゲームのMVPです。

- MediaPipe Pose Landmarkerで姿勢推定
- 肩中央〜腰中央のBody Axisが垂直に近いほど木が成長
- 左右手首の移動量（肩幅で正規化）から風を生成
- 枝の揺れ、葉っぱ、蝶、風船のエフェクト
- 難易度3段階
- Research mode / CSV
- カメラなしのPC Test mode

## 公開
このフォルダの中身をGitHubリポジトリのルートへアップロードし、Settings → Pages → Deploy from a branch → main / root を選択してください。

カメラはHTTPSまたはlocalhostでのみ利用できます。

## 注意
初版MVPです。iPhone Safari / Android Chromeで、カメラ画角・左右反転・MediaPipeの実効FPS・屋外逆光条件を実機調整してください。

## 開発・秋の落ち葉

ビルド不要の静的サイトです。Python 3 と Node.js（テスト用）を使用します。

```sh
python3 -m http.server 8000 --bind 127.0.0.1
node --test tests/autumn.test.mjs
```

PCテストモードは外部通信やカメラなしで動きます。体軸は正の値で画面右、負で画面左へ風を送ります。左右の手のX/Yスライダー、またはCanvas上のドラッグで手を動かします。既存の手の強度スライダーは動きの風の倍率にもなり、0では局所風を発生させません。SKELETON ONで手の影響範囲・方向・強さを表示します。落ち葉は最大64枚で、ゲーム終了時に停止します。

身体軸は肩中心から骨盤中心へ向かう画像平面上の角度です。ボードの角度・重心の推定ではありません。カメラの鏡像表示とcoverクロップに合わせたCSSピクセル座標に変換してから、身体軸と手の風を計算します。CSVのbodyAxisAngleはこの画面座標での符号になります（旧版の未反転座標と符号が逆）。従来の列名は維持し、bodyAxisWind（px/sの目標風）、leftHandWind/rightHandWind（0〜1）、leafCountを追加しています。

カメラモードはHTTPSまたはlocalhost、カメラ許可、および以下へのアクセスが必要です。

- cdn.jsdelivr.net: MediaPipeモジュールとWASM
- storage.googleapis.com: Pose Landmarkerモデル

ブラウザー回帰テスト（サーバーを起動して別ターミナルで実行）:

```sh
npm install --prefix /workspace/.onboarding/wind-tree --cache /workspace/.onboarding/npm-cache --no-audit --no-fund playwright@1.58.2
PLAYWRIGHT_MODULE=/workspace/.onboarding/wind-tree/node_modules/playwright/index.mjs node tests/browser.mjs
```

既存Chromium（既定 `/usr/bin/chromium`）を使用し、必要なら `CHROMIUM_PATH` と `TEST_URL` を指定します。外部通信を遮断したPCモード、身体軸左右、両手、検出欠損、スケルトン切替、リサイズ、木の成長、30秒終了、CSV、再プレイを検証します。カメラ座標入力は合成ランドマークで検証します。実機でのカメラ追跡精度、左右の体感、低性能端末でのFPSは別途確認してください。

## プレイ時間・感度・笑顔の写真

開始画面でプレイ時間を1〜60秒（初期30秒）、身体軸・左右の手の感度を個別に0〜100%（初期70%）へ設定できます。感度だけをlocalStorageに保存し、撮影同意・写真・顔情報は保存しません。実効ゲインは `3 × (感度/100)^1.4` で、70%は従来の約1.82倍です。0%でも自然風・落下は続きます。SKELETON ONとResearchで実効ゲイン、最大葉速度、風ベクトルを確認できます。

開始は3・2・1の各1秒です。非表示タブでは開始演出・プレイ・撮影を一時停止し、表示タブへ戻ると再開します。非表示時間はCSVの `activePlayTimeSec` に含めません。Pose/Face検出欠損や動画フレーム停止では時計を止めません。木の成長は設定プレイ時間で正規化します。従来列を維持し、CSVに `configuredDurationSec`, `activePlayTimeSec`, `bodySensitivityPercent`, `leftSensitivityPercent`, `rightSensitivityPercent` を追加しました。

笑顔撮影は初期ONですが、毎試行の明示的な撮影同意がなければOFFで遊びます。PCテストモードは撮影なしです。途中でも「撮影を止める」で停止できます。Face LandmarkerはClassic Workerで推論（MediaPipeのWASM初期化にimportScriptsが必要）し、Faceを最大8fps・入力長辺640px、Poseを最大約30fpsで処理します。Faceモデルの読み込み・推論失敗は撮影だけを停止します。

笑顔スコアは `0.75 × 左右平均 + 0.25 × 左右最大値` を時間平滑化し、閾値以上が200ms継続した時に撮影します。閾値は笑顔確率・正解率ではありません。再撮影は閾値より8ポイント低くなった後、最低2秒間隔です（閾値0%では顔検出中に2秒以上間隔で撮影）。顔欠損時は撮影しません。写真の優先度は笑顔スコア、顔の画面内サイズ・ランドマークの完全性・移動量、画像のエッジ鮮明度を組み合わせた目安です。臨床的な品質指標ではありません。

写真はプレビューと同じ中央coverクロップ・左右反転のJPEG（長辺最大960px）で、ブラウザメモリに最大10枚だけ保持します。上限では品質の低い写真をより良い写真で入れ替えます。顔画像・写真・スコアを外部へ送信せず、自動永続保存しません。モデル取得にはCDNとGoogle Storageへの通信が必要です。終了画面で拡大・PHOTO GIFT選択・保存・削除ができます。「もういっかい」とページ離脱時に写真・選択・撮影スコアを消去し、Object URLもrevokeします。保存ボタンで本人・保護者がダウンロードした写真は端末に残ります。

将来の統合用インターフェースは `window.windTreePhotoGift.getSelectedGift()` です。選択がなければnull、あれば `{ blob, trialId, gameName, capturedAt, elapsedSec, smileScore, result }` を返します。`capturedAt` はISO時刻、`elapsedSec` は有効プレイ秒です。取得したBlobの管理は統合先で行います。QR転送は実装していません。

追加テスト:

```sh
node --test tests/*.test.mjs
PLAYWRIGHT_MODULE=/workspace/.onboarding/wind-tree/node_modules/playwright/index.mjs node tests/browser.mjs
PLAYWRIGHT_MODULE=/workspace/.onboarding/wind-tree/node_modules/playwright/index.mjs node tests/settings-photos-browser.mjs
# 任意: ネットワークとcurlが必要。実モデル＋生成カメラで推論を確認
PLAYWRIGHT_MODULE=/workspace/.onboarding/wind-tree/node_modules/playwright/index.mjs node tests/models-browser.mjs
```

写真UIテストには合成カメラ・合成推論結果を使用します。実機での笑顔判定精度、左右非対称の顔・照明条件、端末性能、iPhone/Androidの撮影・保存操作は別途検証が必要です。
