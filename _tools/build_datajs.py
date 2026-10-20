# -*- coding: utf-8 -*-
"""合并 _out/*.json + 代理词汇简报 → data.js（在现有 papers 数组末尾追加）"""
import io, json, os, re, sys

ROOT = r"c:\Users\13250\Documents\trae_projects\11\cet4-exam"
OUT = os.path.join(ROOT, "_out")
DATA = os.path.join(ROOT, "data.js")

SESSIONS = ["2021-06", "2021-12", "2022-06", "2022-09", "2022-12", "2023-03",
            "2023-06", "2023-12", "2024-06", "2024-12", "2025-06", "2025-12"]
PIDS = [f"{s}-{n}" for s in SESSIONS for n in (1, 2, 3)]

def js_str(obj, indent=2):
    s = json.dumps(obj, ensure_ascii=False, indent=indent)
    s = s.replace("\\u2028", "\\\\u2028").replace("\\u2029", "\\\\u2029")
    # 防御：json.dumps 不会转义 U+2028/9（合法 JSON），但旧 JS 引擎会断串，这里替换原始字符
    s = s.replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")
    return s

def main():
    # 代理简报
    agent = {}
    for k in "ABCD":
        p = os.path.join(OUT, f"agent-brief-{k}.json")
        d = json.load(io.open(p, encoding="utf-8"))
        agent.update(d)
    print("agent pids:", len(agent))

    papers = []
    seen_pid, seen_sid = set(), set()
    # 现有 data.js 中的 section id（避免撞车）
    existing = io.open(DATA, encoding="utf-8").read()
    for m in re.finditer(r'id:\s*"(writing|cloze|matching|reading|translation)-[^"]*"', existing):
        seen_sid.add(m.group(1) if False else m.group(0).split('"')[1])

    for pid in PIDS:
        d = json.load(io.open(os.path.join(OUT, pid + ".json"), encoding="utf-8"))
        paper = d["papers"][0]
        assert paper["id"] not in seen_pid, "dup pid " + pid
        seen_pid.add(paper["id"])
        ab = agent.get(pid, {})
        for s in paper["sections"]:
            assert s["id"] not in seen_sid, "dup sid " + s["id"]
            seen_sid.add(s["id"])
            if s["type"] == "writing":
                s["promptZh"] = ab.get("promptZh", "")
                s["vocab"] = ab.get("wvocab", [])
                s["modelEssayZh"] = re.sub(r"^【[^】]{1,8}】\s*", "", s.get("modelEssayZh", ""))
            elif s["type"] == "translation":
                s["vocab"] = ab.get("tvocab", [])
        if ab.get("theme"):
            # 保留解析阶段附加的「｜...」备注
            base = paper.get("theme", "")
            paper["theme"] = ab["theme"] + (base if base else "")
        papers.append(paper)

    papers.sort(key=lambda p: (p["date"], p["id"]), reverse=True)

    # 插入到 papers 数组末尾
    src = io.open(DATA, encoding="utf-8").read()
    m = None
    for m in re.finditer(r"\n  \]\n\};\s*$", src):
        pass
    if not m:
        print("ERROR: cannot find papers array end"); sys.exit(1)
    block = ",\n".join("  " + line for p in papers for line in js_str(p, indent=2).split("\n") and ["\n" + "\n".join("  " + ln for ln in js_str(p, indent=2).split("\n"))])
    # 上面写法绕了，直接拼接：
    parts = []
    for p in papers:
        txt = js_str(p, indent=2)
        parts.append("\n".join("  " + ln for ln in txt.split("\n")))
    block = ",\n".join(parts)
    new = src[: m.start()] + ",\n" + block + src[m.start():]
    io.open(DATA, "w", encoding="utf-8").write(new)
    print("papers added:", len(papers))
    print("data.js size:", os.path.getsize(DATA), "bytes")

if __name__ == "__main__":
    main()
