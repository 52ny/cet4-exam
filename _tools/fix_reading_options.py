# -*- coding: utf-8 -*-
"""修复 data.js：为 2021-06 ~ 2025-12 的仔细阅读补回 A/B/C/D 选项，并从题干中剥离误吞的 A) 选项。

用法：
  python fix_reading_options.py --dry   仅统计，不写文件
  python fix_reading_options.py         写入 data.js
"""
import io, os, re, json, sys

ROOT = r"c:\Users\13250\Documents\trae_projects\11\cet4-exam"
RAW = os.path.join(ROOT, "_raw")
DATA = os.path.join(ROOT, "data.js")

SESSIONS = ["2021-06", "2021-12", "2022-06", "2022-09", "2022-12", "2023-03",
            "2023-06", "2023-12", "2024-06", "2024-12", "2025-06", "2025-12"]
PIDS = [f"{s}-{n}" for s in SESSIONS for n in (1, 2, 3)]

import html as H


def text_of(s):
    s = re.sub(r"<!--[\s\S]*?-->", "", s)
    s = re.sub(r"<br\s*/?>", " ", s)
    s = re.sub(r"<[^>]+>", "", s)
    s = H.unescape(s).replace("\u00a0", " ").replace("\u200b", "")
    return re.sub(r"\s+", " ", s).strip()


def qp_block(raw, n):
    m = re.search(r'<div[^>]*\bid="qp-%d"' % n, raw)
    if not m:
        return None
    nxt = re.search(r'<div[^>]*\bid="qp-\d+"', raw[m.end():])
    end = m.end() + (nxt.start() if nxt else 8000)
    return raw[m.start():end]


def parse_q(seg):
    if not seg:
        return "", []
    sm = re.search(r"data-pdh-stem[^>]*>([\s\S]*?)</span>", seg)
    stem = text_of(sm.group(1)) if sm else ""
    opts, seen = [], set()
    for om in re.finditer(r'data-pdh-letter="([A-D])"[^>]*>([\s\S]*?)</span>', seg):
        k = om.group(1)
        if k in seen:
            continue
        seen.add(k)
        opts.append({"key": k, "text": text_of(om.group(2))})
    return stem, opts


def extract(pid, qns):
    """从 p3sc1/p3sc2 解析页提取指定题号的题干与选项。"""
    out = {}
    for slug, rng in (("p3sc1", qns[:5]), ("p3sc2", qns[5:])):
        p = os.path.join(RAW, f"sec-{pid}-{slug}.html")
        if not os.path.exists(p) and slug == "p3sc1":
            # 2025 年起部分套卷第一篇用合并模块（part3-section-c）
            p = os.path.join(RAW, f"sec-{pid}-p3scM.html")
        if not os.path.exists(p):
            continue
        raw = io.open(p, encoding="utf-8").read()
        for n in rng:
            stem, opts = parse_q(qp_block(raw, n))
            out[n] = {"stem": stem, "options": opts}
    return out


def main():
    dry = "--dry" in sys.argv
    src = io.open(DATA, encoding="utf-8").read()
    dec = json.JSONDecoder()

    report, total_fixed, total_bad = [], 0, 0
    for pid in PIDS:
        marker = '"id": "reading-%s"' % pid
        i = src.find(marker)
        if i < 0:
            continue
        start = src.rfind("{", 0, i)
        obj, end = dec.raw_decode(src[start:])
        qids = [q["id"] for p in obj["passages"] for q in p["questions"]]
        got = extract(pid, qids)

        changed = 0
        for p in obj["passages"]:
            for q in p["questions"]:
                g = got.get(q["id"])
                if not g:
                    continue
                if g["stem"]:
                    q["stem"] = g["stem"]
                if len(g["options"]) == 4 and all(o["text"] for o in g["options"]):
                    q["options"] = g["options"]
                    changed += 1
                else:
                    total_bad += 1
                    report.append("  BAD %s q%s options=%d stem=%r" % (pid, q["id"], len(g["options"]), g["stem"][:50]))
        report.append("%-12s q=%d fixed=%d" % (pid, len(qids), changed))
        total_fixed += changed

        if not dry and changed:
            body = json.dumps(obj, ensure_ascii=False, indent=2)
            body = "\n".join(("      " + ln) if ln.strip() else ln for ln in body.split("\n"))
            src = src[:start] + body + src[start + end:]

    print("\n".join(report))
    print("TOTAL fixed: %d, bad: %d, dry=%s" % (total_fixed, total_bad, dry))
    if not dry:
        io.open(DATA, "w", encoding="utf-8").write(src)
        print("data.js written:", os.path.getsize(DATA), "bytes")


if __name__ == "__main__":
    main()
