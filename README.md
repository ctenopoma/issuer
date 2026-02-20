# Issuer v0.2.1

共有フォルダに置くだけで動く、チーム向け Issue 管理ツール。

## 必要環境

- Python 3.13 以上
- Windows（共有フォルダ運用を想定）

## セットアップ

```bash
uv sync
```

## 起動

```bash
uv run python main.py
```

## ファイル構成

```
issue_manager/
├── main.py           # 起動エントリーポイント
├── app/              # アプリケーションパッケージ
│   ├── ui.py             # メイン UI・ルーティング
│   ├── db.py             # DB 操作
│   ├── config.py         # 設定・定数
│   └── utils/
│       ├── lock.py           # 排他制御
│       └── attachments.py    # 画像添付
├── pyproject.toml
└── README.md
```

初回起動時に同じフォルダへ自動生成:
```
data.db      # SQLite データベース
app.lock     # ロックファイル（使用中のみ存在）
assets/      # 添付画像フォルダ
```

## ビルド（Windows 配布用 .exe）

```bash
# Flet 0.21 以上
flet pack main.py --name "IssueManager"

# Flet 0.21 未満
pyinstaller --onefile --windowed --name "IssueManager" main.py
```

## 共有フォルダ運用

生成された `IssueManager.exe` と `data.db`・`assets/` を共有フォルダに配置して、  
チームメンバーが exe を直接起動するだけで使用できます。

- 編集モード: 最初に起動した 1 人のみ
- 閲覧専用モード: 2 人目以降（誰が編集中か AppBar に表示）
- ゾンビロック解除: 1 時間以上前のロックは起動時に強制解除ダイアログが表示

## 制限事項

- 同時に編集できるのは 1 人のみ
- データベースは暗号化なし（機密情報は書き込まないこと）
- 数千件を超えると起動が遅くなる可能性あり
