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

## 3D WIND LAB — Phase 1–2

トップ画面の **3D WIND LAB** から、従来ゲームとは独立した実験画面を開きます。
初期は **PC TEST ON / SIMULATED WIND**。カメラ・GPS・CDNなしで使えます。
Three.js 0.183.2をMITライセンス付きで `vendor/three/` に固定して同梱しています。
ビルド不要の静的配信を維持し、`npm run build` は配信ファイル・ローカルimport参照・構文を検査します。

- 格子は各軸3〜20、計27〜8000点。Points + BufferGeometryを更新し、毎フレーム再生成しません。
- ドットサイズ1〜10、速度0〜300%、本体と軌跡の独立表示、格子・視点RESET、OrbitControlsで回転／ズーム。
- 軌跡は各粒子の過去位置を0.1秒以上の間隔で記録。履歴は最大51点、全体で最大10万線分に制限します。
  8000点の場合は13履歴点で5秒をカバーするよう間隔を広げます。WRAPを跨ぐ線分は描画しません。
- `+X = 東（右） / +Y = 上 / -Z = 北（奥）`。気象学的なFROM方位をTOへ変換します。
  北風0°は+Zへ、東風90°は-Xへ、南風180°は-Zへ、西風270°は+Xへ流れます。
  方位は地理的な座標軸の定義で、端末コンパスや実際のカメラの向きへの自動追従はしません。
- **現在地の風を取得**を押したときだけGeolocationの許可を要求します。
  **MANUAL LOCATION** は緯度経度入力。初期値35.61,139.38は南大沢周辺のデモ地点で、現在地を示しません。
  **SIMULATED WIND** はFROM方位0〜359°・風速0〜20m/s。手動風スライダーを変更するとこのモードへ戻ります。
- Open-Meteoの `current=wind_speed_10m,wind_direction_10m&wind_speed_unit=ms&timezone=auto` を使用。
  10分ごとに再取得、2秒の時定数でベクトルを補間します。失敗時は気象風が減衰し、描画・PC TESTは続きます。
  気象風ゲイン100%は1m/sを1空間単位/sの目標速度へ変換する視覚化用スケールです。
- **CAMERA ON** は既存ゲームの同じカメラ開始・Pose初期化処理を借用します。
  既存Poseインスタンスを再利用し、画面同士でカメラ・推論・描画ループを重複起動しません。
  DOTではFaceモデル・撮影を起動しません。KIDS/ARTの撮影は下記の同意付きプレイで有効にします。**SKELETON ON** は小窓に鏡像の骨格を重ねます。
- 身体風は肩中心と腰中心から、鏡像表示の左右傾斜、胴体の画像上の伸縮、推定奥行き差を計算します。
  Yは伸縮の目安であり、厳密な鉛直姿勢・前後移動の測定ではありません。
  worldLandmarksがあればZに優先利用しますが、単眼推定は不安定なため範囲を制限します。
  絶対傾斜と変化速度が全粒子へ作用し、CALIBRATEでその姿勢を基準にします。
- 両手は独立した3D位置のサンプル差から速度を推定。鏡像の右移動→+X、上移動→+Y。
  影響半径は空間一辺の5〜50%、半径内で `exp(-r²/(2σ²))`, `σ=半径/2`、半径外は0です。
  HAND FIELD DEBUGは左右の球状領域を緑／橙で表示。停止・欠損時は局所風が減衰します。
- エンジンの共通入力は `input({body:[x,y,z],left:[x,y,z],right:[x,y,z]}, timestampMs)`。
  検出欠損は該当項目をnullにします。PC TESTのスライダー・AUTO MOTIONもこの同じ入力を使います。
  4風成分を位置ごとに合成し、速度目標へ指数追従（係数6/s）、速度上限25空間単位/s、dt上限0.1秒・内部1/60秒刻み。
  非表示中はLabのRAFを停止し、復帰時の入力差分もリセットします。
- 粒子、気象、身体、手の設定だけを `wind-tree-lab-v1` のlocalStorageへ保存します。
  GPS座標・キャリブレーション・画像・ランドマークは保存しません。画面退出時にカメラ、Pose、気象更新タイマー、
  OrbitControls、Geometry、Material、Rendererを解放します。気象APIへは取得操作の際に座標だけを送信します。
- WEATHER ONLY / BODY ONLY / LEFT HAND ONLY / RIGHT HAND ONLY / ALL ON / ALL OFFで成分を切り分けて確認できます。
  画面負荷が続く場合は描画画素密度を1へ下げます。粒子数は勝手に変更しません。

モジュールは `src/wind-engine/` の8クラス、画面は `wind-lab.js` と `wind-lab.css`。
KIDS/ARTで同じ入力・物理演算を再利用できるよう、WindEngineはThree.jsとDOMに依存しません。

```sh
npm run build
npm test
# README冒頭の方法でPlaywrightをリポジトリ外へ導入し、静的サーバーを起動してから:
PLAYWRIGHT_MODULE=/workspace/.onboarding/wind-tree/node_modules/playwright/index.mjs node tests/wind-lab-browser.mjs
# 任意: 実気象APIと実Pose＋生成カメラ。実人物の画像は使いません。
PLAYWRIGHT_MODULE=/workspace/.onboarding/wind-tree/node_modules/playwright/index.mjs node tests/wind-lab-live-browser.mjs
```

API仕様はOpen-Meteo公式リポジトリの [OpenAPI](https://github.com/open-meteo/open-meteo/blob/main/openapi/forecast.yml) と
[単位変換実装](https://github.com/open-meteo/open-meteo/blob/main/Sources/App/Helper/SiUnit.swift) に照合しています。
気象データは予測であり精密な実測ではありません。[Open-Meteo利用条件](https://open-meteo.com/en/terms)も参照してください。
カメラと位置情報はHTTPSまたはlocalhostが必要です。

自動テストは生成カメラ／合成Poseの身体入力、実モデルの初期化と生成映像への推論、PC TEST、
GPS拒否、API成功・失敗、8000粒子の履歴制限、カメラ共有と解放、390px幅のUIを検証します。
iPhone/iPad/Android/Windowsの実機、実人物の追跡精度、奥行きと体感方向、実GPS許可、端末別FPSは別途確認が必要です。


## 3D WIND LAB — Phase 3–4

DISPLAY MODEのDOT（初期）/ KIDS / ARTは同じWindEngineの位置・速度・入力を描画します。
モード切替では物理エンジン・カメラ・Poseモデルを作り直しません。
KIDSは明るい空・雲・地面、4色の大きな秋の葉、枝と葉が育つ木です。
ARTは暗い空間、加算合成の光粒子・軌跡、色のゆっくりした変化、奥行きの霧、細い光の木です。
重いBloomや独自の葉・渦の物理は使用せず、手による流線変化も共通HandWindだけで決まります。

KIDS/ARTのSTARTは粒子・成長・時間を新しいプレイにリセットします。
時間は既存トップの1〜60秒設定を引き継ぎ、プレイ画面でも変更できます。
共通GrowthSessionが正常な入力の継続時間を積算し、設定時間で割った0〜1を両モードの木へ渡します。
静止中も有効入力として成長します。Pose欠損・動画停止は750msの猶予後に停止し、復帰時に再開します。
PAUSEとタブ非表示の時間は除外します。DOTへ移動中は成長・撮影を一時停止し、KIDS/ARTへ戻ると再開します。
KIDS↔ARTでは時間・成長・写真を共有します。終了後は成長した木を保持します。
「もういっかい」「RESET / 次の参加者」で写真・選択・撮影同意・成長を消去します。

主な感度・気象ON/OFFとプレイ設定を表示し、詳細設定を折りたたみます。KIDSにはDEBUGを表示しません。
DOTのDEBUGでは33点の検出数、身体XYZ、左右手XYZ/速度/局所風、4風成分、Pose推論FPSと描画FPSを確認できます。
SKELETONは33点と接続線をカメラ映像に合わせて鏡像表示します。
将来の傾きセンサは `lab.acceptInput({body:[x,y,z],left:null,right:null}, performance.now(), "sensor")`
の同じ入力経路へ接続できます。今回センサを起動せず、片足立ち判定も行いません。

カメラON・笑顔撮影ON・参加者ごとの同意を確認してSTARTすると、既存FaceCapture/SmileGateを起動します。
閾値・200ms保持・2秒クールダウン・最大10枚・品質入替は従来仕様です。
写真はカメラ小窓と同じ全体範囲の鏡像JPEGで、終了後に一覧・拡大・選択・保存・削除できます。
撮影OFF/同意なし/PC TESTでは写真なしで正常に終了します。カメラOFFやモデルエラーでは撮影だけを停止します。
PHOTO GIFTの既存 `window.windTreePhotoGift.getSelectedGift()` はLabにも対応し、結果に
`displayMode`, `growth`, `configuredDurationSec`, `validElapsedTimeSec` を含めます。QR転送はありません。
CSVは成長・有効時間・入力状態・モード・4風ベクトルを記録し、最大6000行でメモリを制限します。

描画リソースはモード切替でGeometry/Texture、背景のGeometry/Materialを解放します。
履歴最大10万線分は維持し、遅いフレームが続けば画素密度・軌跡時間・ART光粒子サイズを減らします。
物理の粒子総数を勝手に変更しません。退出時は写真URL、Face worker、成長タイマーも解放します。
設定の保存対象は引き続きWindConfigのみで、表示モードは毎回DOT、同意・写真・位置・ランドマークは保存しません。

```sh
npm test
npm run build
PLAYWRIGHT_MODULE=/workspace/.onboarding/wind-tree/node_modules/playwright/index.mjs node tests/pose-lab-browser.mjs
PLAYWRIGHT_MODULE=/workspace/.onboarding/wind-tree/node_modules/playwright/index.mjs node tests/modes-play-browser.mjs
```

単体テスト38件。ブラウザ回帰は既存ゲーム、設定/PHOTO、DOT、合成33点Pose、KIDS/ARTの5スイートです。
合成PoseでBODY ONLY/LEFT HAND ONLY/RIGHT HAND ONLY/ALL ONと単一モデルを検証し、
生成カメラと合成Face結果で笑顔撮影・写真操作・同意・参加者交代・入力喪失/復帰を検証します。
8000粒子の3モード、繰り返し切替でのGPUテクスチャ解放、390px幅の操作も確認します。
実人物のPose/笑顔、実GPS、Windows/Edge・iPhone/iPad/Safari・Android実機と端末別FPSは未検証です。

## 3Dスケルトンアバター・XYZ AXIS

詳細設定の既存 **XYZ AXIS** はDOT / KIDS / ARTすべてでON/OFFが有効です（初期ON）。
モード側の軸の強制非表示を廃止しました。軸とアバターの切替で粒子・速度・履歴・視点をリセットしません。

新しい **AVATAR** セクションの **3D AVATAR**（初期OFF）、**AVATAR SIZE**（20〜300%、初期100%）、
**AVATAR STYLE**（SKELETON / POINTS、初期SKELETON）は同じWindConfigのlocalStorageに保存します。
RESET SETTINGSで初期値へ戻ります。KIDS/ARTでは「詳細設定」を開いて操作してください。
SKELETONは関節点＋骨格線、POINTSは関節点だけ。3モードで同じSkeletonAvatarを使用します。
関節と線は2つのBufferGeometryとPoints / LineSegmentsを更新して再利用し、退出時にdisposeします。
カメラ・Pose・Faceモデルを追加で起動しません。2D骨格の表示設定とは独立しています。

33点の標準接続を2D骨格と共通化しています。3Dは有効なworldLandmarksを優先し、なければ正規化座標を使います。
左右反転のX、上向きY、既存WindEngineと同じZ符号を使用し、腰の中点を原点に置きます。
初回有効姿勢で表示縮尺を決め、手を上げるたびに全身が縮まないよう保持します。
縮尺はカメラ開始・参加者交代・world/正規化入力の切替で取り直します。
X/Yを優先して推定Zを制限し、45msの軽い指数平滑化を適用します。
最終倍率は設定サイズを基本とし、大きな動作や300%表示で立方体を越える場合だけ一様に収めます。
検出欠損時は250ms保持、次の500msでフェード、750msで非表示。復帰すると再表示します。
非表示タブから戻った時は新しい入力を待ちます。関節は白、左右手首は緑／橙、線はシアン系です。
KIDSの明るい背景では濃いシアン系に調整し、粒子に埋もれないよう深度テストを無効にします。

PC TESTは同じ身体軸・左右手の入力から簡易33点骨格を作り、手首・腕・上半身の動きに追従します。
PC TESTは膝用の独立入力を持たないため、脚は標準姿勢です。実Poseでは膝・足首も33点から追従します。
DEBUGで **PC TEST SYNTHETIC / POSE WORLD / POSE NORMALIZED**、検出／フェード／欠損、
有効点数、表示サイズ・実効表示倍率、左右手首座標を確認できます。BODY風・左右局所風の位置も従来どおり表示します。

座標変換はCoordinateMapperに集約しました。ただし、既存の風の体感・作用位置を維持するため、
Phase 5で実PoseのHandWindも腰中心の共通座標へ統一しました。
アバターの手首は平滑化・ジャンプ検査後のHandWind.positionに固定し、全表示サイズで一致します。
表示倍率・立方体フィットは胴体など他の関節だけへ適用し、手首の位置・風の影響半径を変更しません。
そのためサイズ変更時に腕の表示上の長さ・比率は変わります。

```sh
npm test
npm run build
PLAYWRIGHT_MODULE=/workspace/.onboarding/wind-tree/node_modules/playwright/index.mjs node tests/avatar-browser.mjs
```

アバター追加後の単体テストは44件、ブラウザ回帰は6スイートです。
アバターの20/100/300%、スタイル、全モードの軸切替、33点・world/正規化座標、姿勢変化、欠損・復帰、
設定復元、共通カメラ/Pose、8000粒子、60回の表示切替でGPU Geometry数が増えないこと、390px幅の操作と退出時解放を検証します。
ブラウザのPoseは合成33点、カメラは生成映像です。実人物・実カメラの追従精度、実スマートフォン／Safari／Edgeの描画とFPSは未検証です。


## Phase 5 — 身体追従・風の校正

最新mainのXYZ AXIS / 3D AVATAR / SIZE / STYLEを再利用し、追加モードは作っていません。
CoordinateMapperの腰中心・鏡像・上向きYの座標を、BodyWind / HandWind / Avatarで共有します。
worldLandmarksを優先し、なければ正規化画像座標を使います。実Poseの手の物理入力位置を旧カメラ中心座標から変更しました。
手首の描画は受理済みの物理位置をそのまま使用します。サイズ20/100/300%でも風の中心・半径は移動しません。
胴体等の表示倍率を変えても手首は固定されるため、腕の見た目の比率は変わります。

BodyWindは肩と腰の傾きの比からX/Z方向を計算し、Y入力は0（PC TESTのYは従来どおり）です。
右傾斜→+X、左傾斜→-X、奥行き傾斜→Z。BODY ONLYで全粒子へ同じ風を与えます。
CALIBRATEは現在の姿勢を基準とし、角度の差分・風ベクトル・校正状態をDEBUGで確認できます。
**BODY DEAD ZONE** は0〜15度、初期2度。デッドゾーン内では角度変化速度も風に加えません。
校正姿勢からの角度差で判定し、大きな相対角度の風も有限範囲に制限します。身体軸の単発の大きな飛びも除外し、3サンプル安定すると変化速度0から受理します。

**HAND SPEED THRESHOLD** は0〜3空間単位/s、初期0.15。
**HAND SMOOTHING** は0〜100%、初期30%で、位置と速度目標を平滑化します。
低信頼点を除外し、1サンプルの大きな座標ジャンプは受理せず、同じ場所で3サンプル続けば速度0から再捕捉します。
速度20単位/s・速度目標の変化80単位/s²を上限とし、欠損/停止時は風が減衰します。
設定は既存WindConfigに保存します。Gaussian球・左右の独立感度・半径5〜50%は維持します。
HAND FIELD DEBUGは左シアン／右オレンジの中心マーカー、球、風の矢印を表示します。
通常のKIDS/ARTでは隠し、詳細設定のBODY TRACKING DEBUGを明示的に開くと確認できます。

PosePipelineとpose-workerは既存ゲームとLabで同じ1つのPoseモデルを共有します。
Pose推論はWorker内で実行し、最大640pxの生成ImageBitmapをローカルに転送、処理中は追加フレームを積みません。
描画は推論を待たず最新結果を使用し、Labでは同一結果を重複計上せず、500ms超の遅い結果を見送ります。
カメラ停止時に世代番号で古い結果を無効化し、退出でWorkerをterminateします。
起動45秒/推論10秒のタイムアウト、再起動時の失敗モデル解放に対応します。画像・点群を外部へ送信しません。
Face Worker・同意・撮影・写真管理は既存仕様です。Web Worker、createImageBitmap、Worker内のWASMを利用できるブラウザが必要です。

折りたたみ **BODY TRACKING DEBUG** は有効点数・実推論FPS/描画FPS・身体角度/差分/風・校正、
左右の受理位置・速度・風・アバター手首・ジャンプ除外数を表示します。
**TRACKING CSV** はDOTでも利用でき、最大6000行をメモリに保持します。
指定のtimestamp、pose_detected、body_tilt/body_wind、左右の位置/速度、weather_wind、FPSを含みます。
KIDS/ARTの既存プレイCSVにも同じ列を追加しました。CSVはクリック時のみ端末へダウンロードします。

PC TESTの「合成33点Pose」からTEST A〜G（ニュートラル、左右/前後傾斜、左手左右、右手上下、両手、欠損/復帰）を選べます。
同じCoordinateMapper / BodyWind / HandWindを通し、DEBUGにSYNTHETIC POSEと表示します。
MANUAL / AUTO MOTIONに戻すと従来のPC TESTスライダーも使えます。合成テストではカメラ・モデルを起動しません。

```sh
npm test
npm run build
PLAYWRIGHT_MODULE=/workspace/.onboarding/wind-tree/node_modules/playwright/index.mjs node tests/phase5-browser.mjs
```

単体54件と7ブラウザスイートで、A〜G、全粒子/局所風、サイズ変更後の手首一致、ノイズ/ジャンプ/欠損、
校正、CSV、遅いWorkerでもRAF継続、単一モデル、1000/8000粒子、既存ゲーム・成長・笑顔PHOTOを確認します。
実モデルのWorker推論・Face推論と生成カメラ、実Open-Meteo取得は任意のオンラインテストでも確認します。
visibility/presenceは[MediaPipe公式型定義](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/web/components/containers/landmark.d.ts)を確認しました。
presenceはモデルが出力しない場合があり、未提供時はpresenceだけを理由に除外しません。visibilityの低い点は除外します。
合成Poseは実人物の精度検証ではありません。実人物・実カメラ・実GPS・iPhone/iPad/Safari/Android/Windows/Edge実機、
端末別FPS、照明・服・遮蔽・奥行き精度、子供の体感に合わせた最終感度調整は未検証です。

### アバターが2Dだけ表示される場合の修正

腰のランドマーク信頼度が低いと、以前は3D用の全姿勢を破棄していました。
現在は有効な肩・腕などを描画し、直前の腰原点、または肩から推定した表示原点を使います。
低信頼度の腰点は描画・身体風の判定に使わず、有効な手首とHandWindは同じ座標を共有します。
保持250ms・消失750msの時間は変更していません。空の姿勢は最終有効Pose時刻を更新しません。
AVATAR ONで非表示の場合、3D画面上に入力元・検出状態・有効点数・最終Pose経過時間・描画状態・非表示理由を表示します。
PARTICLESとAVATARにあるXYZ AXISは単一の設定値を共有し、カメラや粒子をリセットしません。
合成PoseによるWorker経路・DOT/KIDS/ART・サイズ20/100/183/300%を自動検証しています。
実人物を使ったカメラ追従はクラウド環境で未検証です。

## Home design and wind response

トップ画面はプレイ時間・スタートを中心にし、感度・笑顔撮影・同意・難易度は「詳細設定」にまとめました。設定を開いた場合もページ全体がスクロールし、内部パネルの二重スクロールはありません。撮影同意なしで画像を撮影しない既存仕様を維持します。

3D WIND LABには共通のSOFT / NORMAL / STRONG / CUSTOM反応プリセットを追加しました。新規設定はNORMAL、既存の個別保存設定はCUSTOMのまま保持します。風の計算だけでなく、実粒子の速度・変位・直近1秒の移動量をDEBUGとCSVで確認できます。

修正前後の数値、プリセットの全設定値、非同期入力の修正、未検証項目は[検証報告](docs/wind-response-validation.md)を参照してください。実人物でのカメラ追従は未検証です。
