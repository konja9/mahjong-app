# Google Play Games Services の設定（0.3.0）

アプリ側の作りはできています。Play Console で設定して、発行された ID を2か所に貼ると動き出します。
ID を貼るまでは、アプリは Play Games を使わずにこれまでどおり動きます（`games-ids.xml` が仮の `0` のため）。

## しくみ（どこに何があるか）

| 場所 | 中身 |
|---|---|
| `android/app/src/main/java/io/github/konja9/pachifuto/PlayGamesPlugin.java` | ネイティブ側（ログイン・実績・ランキング・クラウドセーブ） |
| `android/app/src/main/java/io/github/konja9/pachifuto/MainActivity.java` | プラグインの登録と、Play Games の開始 |
| `android/app/src/main/res/values/games-ids.xml` | **プロジェクト ID（手順 1 で貼る）** |
| `src/ui/gamesIds.ts` | **実績15個・ランキング2つの ID（手順 4 で貼る）** |
| `src/ui/games.ts` | JS からの呼び出し（Web 版では何もしない） |
| `src/ui/cloudSave.ts` | クラウドセーブの中身と、端末とクラウドのどちらが進んでいるかの比べ方 |
| `src/ui/achievements.ts` | 実績の判定 |
| `store/play-games/*.png` | 実績のアイコン（`scripts/achievements.mjs` で作る） |

アプリの動き
- 起動すると自動でログインする（Play Games Services v2 の仕様）。ログインできなければ、メニューの「実績・ランキング」からログインし直せる
- 起動時にクラウドの記録と比べる
  - クラウドの方が進んでいる（経験値 → 段位 → 累計正解数の順で比べる）ときは、「クラウドを使う／この端末を使う」を聞く
  - 端末の方が進んでいれば、黙ってクラウドへ保存する
- 保存するとき：画面が隠れたとき、Lv アップ、昇段試験の合格、物語を読んだとき（60秒に1回まで）。メニューから今すぐ保存もできる
- 広告削除の購入状態はクラウドに入れない（端末ごとに Google Play から読み直す）

## 1. Play Games Services を作る
1. Play Console でアプリを開き、左のメニューで **Play Games サービス → 設定と管理 → 構成**（「Grow users → Play Games Services」と出る場合もあります）
2. 「いいえ、ゲームで Google API を使用していません」を選んで **作成**
   - ゲームの名前は「パチふと」、カテゴリは「ボード」
3. 画面に出る **プロジェクト ID**（12桁ほどの数字）を、`android/app/src/main/res/values/games-ids.xml` の `0` と置き換える

## 2. 認証情報（OAuth）
1. 同じ画面の **認証情報 → 認証情報を追加**
2. 種類は **Android**。初めてなら「OAuth 同意画面を構成」の案内が出るので、Google Cloud の画面で次を入れる
   - アプリ名：パチふと
   - サポートのメール
   - プライバシーポリシーの URL
3. パッケージ名：`io.github.konja9.pachifuto`
4. **SHA-1 証明書のフィンガープリント**：Play で配っているアプリの鍵の SHA-1
   - Play Console の **テストとリリース → アプリの完全性 → アプリの署名** にある **「アプリ署名鍵の証明書」の SHA-1**
   - 自分で入れて試す（Android Studio から実機に入れる）なら、**アップロード鍵の SHA-1** の認証情報ももう1つ作る
     - 調べ方：`keytool -list -v -keystore <鍵ファイル>`
5. 保存

## 3. クラウドセーブを有効にする
- **構成 → プロパティ**（または「Saved Games」）で **Saved Games をオン** にする

## 4. 実績とランキングを作る
左のメニューの **実績**・**リーダーボード** で作る。アイコンは `store/play-games/` の PNG（512×512）。
作ると出る ID（`CgkI…` で始まる文字列）を、`src/ui/gamesIds.ts` の該当する行の `''` の中に貼る。

**注意：実績とランキングは「公開」すると消せません**。名前・説明・ポイントは、公開する前によく確かめてください（テスト中は下書きのままで、テスターには見えます）。

### 実績（15個）
| `gamesIds.ts` の名前 | 実績名 | 説明 | アイコン | ポイントの目安 |
|---|---|---|---|---|
| `firstBonus` | 初めての大当り | パチンコで初めて BONUS を引く | 01-firstBonus.png | 5 |
| `firstRush` | RUSH 突入 | 確変を引いて RUSH に入る | 02-firstRush.png | 10 |
| `premium` | 赤五筒 | PREMIUM（赤五筒）の超大当りを引く | 03-premium.png | 30 |
| `rank5kyu` | 5級 | 昇段試験の5級に受かる | 04-rank5kyu.png | 10 |
| `rankShodan` | 初段 | 昇段試験の初段に受かる | 05-rankShodan.png | 50 |
| `rankMeijin` | 名人 | 昇段試験の名人に受かる | 06-rankMeijin.png | 150 |
| `allSlots` | 台の鍵をすべて開く | 改造の枠を5つとも開く | 07-allSlots.png | 100 |
| `allParts` | 改造パーツ一式 | 改造パーツを12種類すべて手に入れる | 08-allParts.png | 50 |
| `storyEnd` | すべて思い出した | パチふとくんの記憶（全20話）が戻る | 09-storyEnd.png | 150 |
| `allNotes` | 帳面の最後の頁 | 帳面を10頁すべて読む | 10-allNotes.png | 100 |
| `streak20` | 20連続正解 | 20問続けて正解する | 11-streak20.png | 20 |
| `correct100` | 正解 100問 | 合わせて100問に正解する | 12-correct100.png | 10 |
| `correct1000` | 正解 1000問 | 合わせて1000問に正解する | 13-correct1000.png | 50 |
| `correct5000` | 正解 5000問 | 合わせて5000問に正解する | 14-correct5000.png | 150 |
| `yakuman` | 役満を数えた | 役満の手の点数に正解する | 15-yakuman.png | 30 |

- 合計は 1000 ポイント以内にする（Play の上限）。上の目安で 915
- 「隠し実績」にはしない（どれも目標として見せる方が励みになる）
- 種類はすべて「標準」（段階的ではない）

### リーダーボード（2つ）
| `gamesIds.ts` の名前 | 名前 | スコアの形式 | 並べ方 | アイコン |
|---|---|---|---|---|
| `bestStreak` | 最大連続正解 | 数値（小数なし） | 大きいほど上 | 11-streak20.png |
| `totalCorrect` | 累計正解数 | 数値（小数なし） | 大きいほど上 | 13-correct1000.png |

## 5. テスターを足す
- **Play Games サービス → テスター** に、クローズドテストのテスターの Google アカウント（またはそのグループ）を足す
- 公開前のゲームの実績・ランキングは、ここに入っている人にしか見えない

## 6. ビルドして試す
1. ID を2か所に貼ったら：
   ```bash
   npm run android:release
   npm run android:open
   ```
2. Android Studio で実機に入れて起動する。ログインのポップアップ（「○○としてログイン」）が出れば成功
3. メニューに「実績・ランキング」が出る
   - 実績を見る・ランキング・クラウドに保存、を順に試す
4. うまくいかないとき
   - ログインできない：SHA-1 が、入れたアプリの鍵と合っていない。手順 2 の4を確かめる
   - ビルドのエラー：エラーの文面を、そのまま送ってください（こちらではビルドできないため、文面を見て直します）
   - `play-services-games-v2` が見つからない：`android/app/build.gradle` の版（今は 20.1.2）を、Android Studio が出す候補の版に変える

## 7. 公開の前に直すもの
- **データ セーフティ**（ポリシーとプログラム → アプリのコンテンツ）
  - クラウドセーブで、ゲームの進み具合（Lv・段位・成績・持ち物）が Google のサーバーに送られる
  - 「アプリのアクティビティ → その他のアプリ内アクション」または「アプリ情報とパフォーマンス」などで「収集する」に当たるかを、Play Console のヘルプで確かめて答える
  - 目的は「アプリの機能」、送るときは暗号化、ユーザーは Play Games の設定から消せる
- **プライバシーポリシー**（https://konja9.github.io/privacy.html。別のリポジトリ）に、次の段落を足す

  > **Google Play ゲームについて**　Android 版では、Google Play ゲーム サービスを使って、ログイン、実績、ランキング、クラウドセーブを提供します。ログインすると、Google Play ゲームのプレイヤー ID と表示名がアプリから使えるようになります。クラウドセーブには、ゲームの進み具合（レベル、段位、成績、持ち物、設定）が保存されます。これらは Google のサーバーに保存され、Google のプライバシーポリシー（https://policies.google.com/privacy）に従って扱われます。Google Play ゲームの設定から、いつでも削除できます。
