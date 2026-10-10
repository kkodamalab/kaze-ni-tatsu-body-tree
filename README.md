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
