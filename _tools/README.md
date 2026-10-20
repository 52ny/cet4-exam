# 数据流水线（可选工具）

`data.js` 中 2021.6–2025.12 的 36 套真题由以下脚本从懒笔记站（english-exam.lazynote.cn）
确定性抓取生成。仅在新考期需要入库时使用，日常使用/部署本站不需要这些脚本。

```
python _tools/fetch_all.py      # 1. 下载整卷页 + 6 个解析页到 _raw/（幂等，可中断续跑）
python _tools/parse_all.py      # 2. 解析为 _out/{pid}.json + _brief/{pid}.json
python _tools/build_datajs.py   # 3. 合并词汇简报(_out/agent-brief-*.json)并追加进 data.js
```

注意：

- `build_datajs.py` 假设第 2 步产出的 `_brief/*.json` 已经由人工/LLM 补齐写作题干中文说明、
  套卷主题、写作与翻译高频词（合并为 `_out/agent-brief-{A..D}.json`）。
- `_raw/`、`_out/`、`_brief/` 为工作目录，已在 `.gitignore` 中排除，不会进入仓库。
