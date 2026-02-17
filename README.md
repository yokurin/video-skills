# video-skills

Claude Code 向けの動画生成スキル集。

## Skills

| スキル | 説明 |
|--------|------|
| [create-anime-lifehack](skills/create-anime-lifehack/) | TikTok/Shorts向けアニメ風ライフハック動画を一括生成 |

## Install

```bash
# 全スキルをインストール
npx skills add yokurin/video-skills

# 特定のスキルだけインストール
npx skills add yokurin/video-skills --skill create-anime-lifehack
```

## Requirements

- [Claude Code](https://claude.com/claude-code)
- Node.js 18+
- ffmpeg / ffprobe
- 環境変数 `FAL_KEY`（[fal.ai](https://fal.ai) のAPIキー）
