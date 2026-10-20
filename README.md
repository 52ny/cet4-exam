# CET-4 真题训练站

一个纯静态的大学英语四级（CET-4）真题答题网站。无需后端、无需构建，克隆后直接打开或用 GitHub Pages 发布即可使用。

内容覆盖 **2021 年 6 月至 2026 年 6 月共 13 个考期、39 套真题**（含 2022 年 9 月加考、2023 年 3 月延考场次），按“套卷 → 模块”组织，支持在线作答、即时判分、逐题解析、词汇渗透与 AI 作文/翻译批改。听力部分不在范围内。

## 功能

- **在线答题**：选词填空（下拉选词）、长篇阅读（段落匹配）、仔细阅读（四选一）、写作与翻译（文本输入）。
- **即时判分与解析**：客观题提交后自动判分，逐题给出答案、正误与中文解析；已提交答案会回显，便于复盘。
- **进度持久化**：答题记录、草稿、生词本、主题偏好均保存在浏览器 `localStorage`，刷新不丢失。
- **词汇渗透**：
  - 文章中的目标词自动高亮（兼容 `-s / -ed / -ing / -ly` 等词形变化），点击即可查看音标、释义并一键收藏；
  - 每个模块作答结束后，结果页汇总该模块的**高频词**，可一键全部收藏；
  - 侧栏“生词本”提供翻转卡片复习、搜索、掌握标记与 TSV 导出（可导入 Anki / 欧路词典）。
- **AI 作文 / 翻译批改**：接入任意 OpenAI 兼容的 `/chat/completions` 接口（DeepSeek、OpenAI 或自建网关），按 15 分制给出分项得分、改进建议与参考表达；未配置 Key 或接口失败时自动回退到内置的本地启发式评分。
- **Material 风格界面**：固定侧栏、文档式排版、响应式抽屉导航、深色模式。

## 目录结构

```
cet4-exam/
├── index.html     # 站点外壳：侧栏、顶栏、内容容器、弹窗
├── style.css      # Material 风格样式、响应式、深色模式
├── data.js        # 真题数据（39 套试卷 → 模块 → 题目 / 答案 / 解析 / 词汇）
├── app.js         # 路由、渲染、判分、词汇、AI 批改、本地存储
├── _tools/        # 真题抓取/解析/合并脚本（可选，见 _tools/README.md）
├── .nojekyll      # GitHub Pages 跳过 Jekyll 处理
├── .gitignore
└── README.md
```

## 本地运行

由于使用了 `fetch` 与 `localStorage`，建议通过 HTTP 服务访问，而不是 `file://` 直接打开。

```bash
# 任选其一
python -m http.server 8000
npx serve .
```

然后访问 <http://localhost:8000>。

## 发布到 GitHub Pages

1. 新建仓库并推送本项目（`index.html` 位于仓库根目录，或位于 `cet4-exam/` 子目录）。
2. 仓库 **Settings → Pages**：
   - Source 选择 `Deploy from a branch`；
   - Branch 选择 `main`，目录选择 `/ (root)`（若文件在子目录则选 `/docs` 或调整目录）。
3. 保存后等待一两分钟，访问 `https://<用户名>.github.io/<仓库名>/`。

仓库已包含 `.nojekyll`，可避免 Jekyll 忽略以下划线开头的文件。

## AI 批改配置

1. 点击侧栏底部的 **⚙ AI 批改设置**；
2. 选择服务商预设（DeepSeek / OpenAI / 自定义），填写 Base URL、模型名与 API Key；
3. 保存后进入写作或翻译模块，输入答案并点击“AI 批改”。

默认预设：

| 服务商 | Base URL | 模型 |
| --- | --- | --- |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |

> **安全提示**：API Key 仅保存在当前浏览器的 `localStorage` 中，不会上传到本项目的任何服务器，但**不建议在公共电脑或公开部署的站点上填写长期有效的 Key**。如站点面向公众，请改用自建代理服务转发请求并在服务端保管密钥。

## 如何新增真题

所有内容集中在 `data.js` 的 `window.CET_DATA.papers` 数组中。新增一套试卷只需追加一个对象：

```js
{
  id: "2026-12-1",
  label: "2026 年 12 月 · 卷 1",
  short: "卷 1",
  date: "2026-12",
  theme: "主题概括",
  sections: [
    {
      id: "writing-1",
      type: "writing",
      title: "Writing",
      promptEn: "Directions: ...",
      promptZh: "题目中文说明",
      modelEssay: "参考范文",
      modelEssayZh: "范文译文",
      vocab: [
        { word: "sustainable", phonetic: "/səˈsteɪnəbl/", cn: "可持续的", note: "写作高频" }
      ]
    }
  ]
}
```

支持的模块类型与关键字段：

| type | 关键字段 |
| --- | --- |
| `writing` | `promptEn`、`promptZh`、`modelEssay`、`modelEssayZh`、`vocab[]` |
| `cloze` | `passage`（空位写作 `[[26]]`）、`bank[{key,word}]`、`questions[{id,answer,explanation}]`、`vocab[]` |
| `matching` | `paragraphs[{label,text}]`、`questions[{id,stem,answer,explanation}]`、`vocab[]` |
| `reading` | `passages[{title,text,questions[{id,stem,options[{key,text}],answer,explanation}]}]`、`vocab[]` |
| `translation` | `original`、`reference`、`keyPhrases[{cn,en}]`、`vocab[]` |

`vocab` 中的词条会自动在文章正文中高亮，并在模块结果页作为高频词汇总。词条格式：

```js
{ word: "controversial", phonetic: "/ˌkɒntrəˈvɜːʃl/", cn: "有争议的", note: "阅读高频" }
```

## 数据说明

- 2021.6–2025.12 的 36 套真题由脚本自懒笔记站（english-exam.lazynote.cn）整卷页与解析页确定性抓取生成：文章、题干、选项与答案来自原站公开内容；范文与参考译文取自其解析页；逐题解析做了压缩改写；模块高频词来自原站词表（含本篇出现次数与真题例句数）。
- 2026 年 6 月三套卷依据公开真题（含考生回忆版）手工整理，部分选项为真题风格还原，可能与官方原卷存在措辞差异。
- 个别套卷（如 2022-09 卷 2/卷 3、2023-03 卷 2/卷 3）的阅读部分与同期卷 1 相同，仅收录其写作与翻译，试卷卡片上已注明。
- `data.js` 约 2.3MB（Gzip 后约 600KB），首次加载稍慢，浏览器会缓存。
- 新考期真题的抓取/解析/合并脚本见 `_tools/`（含使用说明），日常使用与部署无需这些脚本。
- 本项目仅用于个人备考与学习交流，真题版权归原命题机构所有。如涉版权问题，请联系删除。

## 许可证

代码部分采用 MIT License。真题文本与解析的版权归原作者/机构所有，不在本许可证授权范围内。
