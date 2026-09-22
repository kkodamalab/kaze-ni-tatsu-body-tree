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
