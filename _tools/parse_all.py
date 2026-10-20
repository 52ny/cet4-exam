# -*- coding: utf-8 -*-
"""解析懒笔记整卷页 + 解析页 → _out/{pid}.json（站点数据结构） + _brief/{pid}.json（给代理补词汇用）"""
import io, os, re, json, html as H, sys

RAW = r"c:\Users\13250\Documents\trae_projects\11\cet4-exam\_raw"
OUT = r"c:\Users\13250\Documents\trae_projects\11\cet4-exam\_out"
BRIEF = r"c:\Users\13250\Documents\trae_projects\11\cet4-exam\_brief"

SESSIONS = ["2021-06", "2021-12", "2022-06", "2022-09", "2022-12", "2023-03",
            "2023-06", "2023-12", "2024-06", "2024-12", "2025-06", "2025-12"]
PIDS = [f"{s}-{n}" for s in SESSIONS for n in (1, 2, 3)]
SESSION_NOTE = {"2022-09": "（疫情加考场）", "2023-03": "（2022年12月考期延考）"}

# ---------------- 基础工具 ----------------

def strip_tags(s, para_join="\n"):
    s = re.sub(r"<script[\s\S]*?</script>|<style[\s\S]*?</style>", "", s)
    s = re.sub(r"<!--[\s\S]*?-->", "", s)
    s = re.sub(r"</(p|div|li|h[1-6]|tr)>", "\n", s)
    s = re.sub(r"<br\s*/?>", "\n", s)
    s = re.sub(r"<[^>]+>", "", s)
    s = H.unescape(s)
    s = s.replace("\u00a0", " ").replace("\u200b", "")
    lines = [re.sub(r"[ \t]+", " ", ln).strip() for ln in s.split("\n")]
    lines = [ln for ln in lines if ln]
    return lines

def text_of(s):
    return "\n".join(strip_tags(s))

def balanced_div(raw, anchor):
    """返回 id=anchor 的 <div ...> ... </div> 平衡块内容。"""
    m = re.search(r'<div[^>]*\bid="%s"' % re.escape(anchor), raw)
    if not m:
        return None
    i = m.start()
    depth = 0
    j = i
    for t in re.finditer(r"<div\b|</div>", raw[i:]):
        if t.group(0) == "<div":
            depth += 1
        else:
            depth -= 1
        if depth == 0:
            j = i + t.end()
            break
    return raw[i:j]

def para_divs(raw, prefix, start_idx=1):
    """按 p-{prefix}-{N} 锚点顺序返回各段 HTML（N 为段序，从 1 起）。"""
    out = []
    n = start_idx
    while True:
        blk = balanced_div(raw, f"p-{prefix}-{n}")
        if blk is None:
            break
        out.append(blk)
        n += 1
    return out

def extract_anchor_divs(raw, prefix_pat):
    """通用：收集 id 形如 {prefix}-{N} 的平衡 div，按 N 排序。"""
    found = []
    for m in re.finditer(r'<div[^>]*\bid="(%s-(\d+))"' % prefix_pat, raw):
        found.append((int(m.group(2)), m.group(1)))
    out = []
    for _, anchor in sorted(set(found)):
        blk = balanced_div(raw, anchor)
        if blk:
            out.append(blk)
    return out

def h3_in_range(raw, start_anchor, end_anchor):
    s = raw.find('id="%s"' % start_anchor)
    e = raw.find('id="%s"' % end_anchor) if end_anchor else -1
    if s == -1:
        return ""
    seg = raw[s: e if e > s else s + 6000]
    m = re.search(r"<h3[^>]*>([\s\S]*?)</h3>", seg)
    return text_of(m.group(1)) if m else ""

# ---------------- 整卷页解析 ----------------

def parse_paper_page(pid):
    raw = io.open(os.path.join(RAW, pid + ".html"), encoding="utf-8").read()
    d = {}

    # 写作 Directions
    div = balanced_div(raw, "directions-part1")
    t = text_of(div or "")
    t = re.sub(r"^Directions\s*[:：]?\s*", "", t, flags=re.I)
    d["promptEn"] = t.strip()

    # 选词填空原文
    paras = para_divs(raw, "part3-section-a")
    pp = []
    for blk in paras:
        blk = re.sub(r"<u[^>]*>[\s\u3000]*(\d+)[\s\u3000]*</u>", r"[[\1]]", blk)
        pp.append(text_of(blk))
    d["clozePassage"] = "\n\n".join(pp)

    # 词库
    bank = []
    div = balanced_div(raw, "choices-part3-section-a")
    if div:
        for m in re.finditer(r'<span class="select-none"[^>]*>\s*([A-O])\)\s*</span>\s*<span[^>]*>([^<]*)</span>', div):
            bank.append({"key": m.group(1), "word": m.group(2).strip()})
    d["bank"] = bank

    # 长篇阅读
    d["matchTitle"] = h3_in_range(raw, "mod-part3-section-b", "mod-part3-section-c-1")
    mparas = []
    for blk in extract_anchor_divs(raw, r"p-part3-section-b"):
        lab = re.search(r'<span class="select-none"[^>]*>\s*([A-Z])\)\s*</span>', blk)
        body = re.search(r'data-pdh-letter="([A-Z])"[^>]*>([\s\S]*?)</div>', blk)
        text = text_of(body.group(2)) if body else text_of(re.sub(r'<span class="select-none"[^>]*>\s*[A-Z]\)\s*</span>', "", blk, count=1))
        mparas.append({"label": lab.group(1) if lab else "", "text": text})
    d["matchParas"] = mparas

    # 仔细阅读两篇（c-1 可能是独立模块 p-part3-section-c-1-{N}，也可能是合并模块 p-part3-section-c-{N}）
    reading = []
    for ci in (1, 2):
        title = h3_in_range(raw, f"mod-part3-section-c-{ci}", f"mod-part3-section-c-{ci+1}" if ci == 1 else "mod-part-iv")
        pt = [text_of(blk) for blk in para_divs(raw, f"part3-section-c-{ci}")]
        if ci == 1 and not pt:
            title = h3_in_range(raw, "mod-part3-section-c", "mod-part3-section-c-2")
            pt = [text_of(blk) for blk in para_divs(raw, "part3-section-c")]
        reading.append({"title": title, "text": "\n\n".join(pt)})
    d["readingPassages"] = reading

    # 题干（长篇 36-45 / 仔细 46-55），按锚点就地向前搜索，避免跨块吞并
    stems = {}
    for m in re.finditer(r'<div[^>]*\bid="qp-(\d+)"', raw):
        n = int(m.group(1))
        if not (36 <= n <= 55) or n in stems:
            continue
        seg = raw[m.start(): m.start() + 4000]
        sm = re.search(r'data-pdh-stem[^>]*>([\s\S]*?)</div>', seg)
        if sm:
            stems[n] = text_of(sm.group(1))
    d["stems"] = stems

    # 翻译原文
    div = balanced_div(raw, "stem-part-iv")
    d["transOriginal"] = text_of(div or "")

    # 答案表（长篇段落可达 16 段，字母到 P）
    ans = {}
    for row_id in ["ans-part3-section-a", "ans-part3-section-b", "ans-part3-section-c-1", "ans-part3-section-c", "ans-part3-section-c-2"]:
        m = re.search(r'<tr id="%s"[\s\S]*?</tr>' % row_id, raw)
        if not m:
            continue
        td = re.search(r'<td class="wp-answers__cell"[^>]*>([\s\S]*?)</td>', m.group(0))
        if not td:
            continue
        txt = " ".join(strip_tags(td.group(1)))
        for qm in re.finditer(r'\b(\d{1,2})\s*([A-P])\b', txt):
            ans[int(qm.group(1))] = qm.group(2)
    d["answers"] = ans
    return d

# ---------------- 解析页解析 ----------------

EXPL_KEYS = ["依据", "解析", "定位", "分析", "排除", "思路", "词性槽"]

def split_q_blocks(raw, nums):
    """按 id="q-N" 切块，块止于下一个 q- 或终止锚点。"""
    cuts = []
    for m in re.finditer(r'id="q-(\d+)"', raw):
        cuts.append((m.start(), int(m.group(1))))
    stops = [m.start() for m in re.finditer(r'id="(?:wordbank|distractors|sentences|high-freq|difficulty|links|faq)"', raw)]
    blocks = {}
    for i, (pos, n) in enumerate(cuts):
        end = cuts[i + 1][0] if i + 1 < len(cuts) else len(raw)
        for s in stops:
            if pos < s < end:
                end = s
                break
        if n in nums:
            blocks[n] = raw[pos:end]
    return blocks

def compose_explanation(block_html, letter, word, cap=250):
    lines = strip_tags(block_html)
    txt = "\n".join(lines)
    am = re.search(r"【答案】\s*\*{0,2}\(?([A-O])\)?[^【\n]*", txt)
    segs = re.findall(r"【([^】]{1,6})】([^\【]*)", txt)
    parts = []
    got = set()
    for name, content in segs:
        name = name.strip()
        content = content.strip()
        if name in ("答案", "答案与解析") or not content:
            continue
        if name in EXPL_KEYS and name not in got:
            got.add(name)
            parts.append(content)
    exp = "；".join(parts)
    if not exp:
        # 回退：取【答案】行之后文本
        m = re.search(r"【答案】[^\n]*\n?([\s\S]*)", txt)
        exp = re.sub(r"\s+", " ", m.group(1)) if m else ""
    exp = re.sub(r"\s+", " ", exp).strip("；; ")
    if len(exp) > cap:
        exp = exp[: cap - 1].rstrip() + "…"
    head = f"{letter}) {word}" if word else letter
    return f"选 {head}。{exp}" if exp else f"答案为 {head}。"

def parse_highfreq(raw):
    vocab = []
    seen = set()
    for m in re.finditer(r'<li class="hfw__item"[\s\S]*?</li>', raw):
        blk = m.group(0)
        w = re.search(r'class="hfw__en"[^>]*>([^<]+)<', blk)
        g = re.search(r'class="hfw__gloss"[^>]*>([\s\S]*?)</span>', blk)
        c = re.search(r'class="hfw__cefr"[^>]*>([^<]+)<', blk)
        st = re.search(r'class="hfw__stat"[^>]*>([\s\S]*?)</span>', blk)
        if not w:
            continue
        word = w.group(1).strip()
        if word.lower() in seen:
            continue
        seen.add(word.lower())
        note = ""
        if st:
            nums = re.findall(r'class="num"[^>]*>(\d+)<', st.group(1))
            if len(nums) >= 2:
                note = f"本篇出现 {nums[0]} 次 · 四级真题 {nums[1]} 句"
        if c:
            note = (note + f" · CEFR {c.group(1)}").strip(" ·")
        vocab.append({"word": word, "phonetic": "", "cn": text_of(g.group(1)) if g else "", "note": note})
    return vocab

def parse_section_page(pid, slug):
    path = os.path.join(RAW, f"sec-{pid}-{slug}.html")
    if not os.path.exists(path):
        return None
    raw = io.open(path, encoding="utf-8").read()
    d = {"highfreq": parse_highfreq(raw)}
    if slug == "part1":
        essay = balanced_div(raw, "essay")
        ezh = balanced_div(raw, "essay-zh")
        d["modelEssay"] = "\n\n".join(strip_tags(essay or ""))
        d["modelEssayZh"] = "\n".join(strip_tags(ezh or ""))
    elif slug == "part-iv":
        ref = balanced_div(raw, "translation")
        lines = [ln for ln in strip_tags(ref or "") if not re.search(r"参考译文|复盘资产|四档评分", ln)]
        d["reference"] = " ".join(lines)
        kps = []
        for m in re.finditer(r'class="tqp-stem"[^>]*>([\s\S]*?)</p>[\s\S]{0,4000}?class="rp-text tqp-final"[^>]*>([\s\S]*?)</p>', raw, re.S):
            cn = text_of(m.group(1))
            en = text_of(m.group(2))
            cn = re.sub(r"^\d+[.、]\s*", "", cn)
            if cn and en:
                kps.append({"cn": cn, "en": en})
        d["keyPhrases"] = kps
    else:
        rng = {"p3sa": range(26, 36), "p3sb": range(36, 46), "p3sc1": range(46, 51), "p3sc2": range(51, 56)}[slug]
        blocks = split_q_blocks(raw, set(rng))
        expl = {}
        for n in rng:
            if n in blocks:
                expl[n] = blocks[n]
        d["qblocks"] = expl
    return d

# ---------------- 组装 ----------------

def build_paper(pid):
    page = parse_paper_page(pid)
    sec = {slug: parse_section_page(pid, slug) for slug in ["part1", "part-iv", "p3sa", "p3sb", "p3sc1", "p3sc2"]}
    year, month = pid.split("-")[:2]
    n = pid.split("-")[2]
    paper = {
        "id": pid,
        "label": f"{int(year)} 年 {int(month)} 月 · 卷 {n}",
        "short": f"卷 {n}",
        "date": f"{year}-{month}",
        "theme": SESSION_NOTE.get(f"{year}-{month}", ""),
        "sections": [],
    }
    problems = []

    # 写作
    w = sec["part1"] or {}
    paper["sections"].append({
        "id": f"writing-{pid}", "type": "writing", "title": "Part I 写作", "short": "写作", "minutes": 30,
        "promptEn": page["promptEn"], "promptZh": "", "modelEssay": w.get("modelEssay", ""),
        "modelEssayZh": w.get("modelEssayZh", ""), "vocab": [],
    })
    if not page["promptEn"] or not w.get("modelEssay"):
        problems.append("writing incomplete")

    # 选词填空（部分套卷站点未收录该部分，与同期卷 1 相同）
    qs = []
    for i, qn in enumerate(range(26, 36)):
        letter = page["answers"].get(qn, "")
        blk = (sec["p3sa"] or {}).get("qblocks", {}).get(qn)
        word = next((b["word"] for b in page["bank"] if b["key"] == letter), "") if letter else ""
        expl = compose_explanation(blk, letter, word) if blk else (f"答案为 {letter}。" if letter else "缺答案")
        qs.append({"id": qn, "answer": letter, "explanation": expl})
    if page["bank"] and page["clozePassage"]:
        paper["sections"].append({
            "id": f"cloze-{pid}", "type": "cloze", "title": "Part III Section A 选词填空", "short": "选词填空", "minutes": 10,
            "passage": page["clozePassage"], "bank": page["bank"], "questions": qs,
            "vocab": (sec["p3sa"] or {}).get("highfreq", []),
        })
        if len(page["bank"]) != 15 or any(not q["answer"] for q in qs) or not all(f"[[{n}]]" in page["clozePassage"] for n in range(26, 36)):
            problems.append(f"cloze bank={len(page['bank'])} ans={sum(1 for q in qs if q['answer'])} blanks={len(re.findall(r'\[\[\d+\]\]', page['clozePassage']))}")
    else:
        paper["theme"] += "｜本套卷选词填空等部分与同期卷 1 相同，未重复收录"

    # 长篇阅读
    qs = []
    for qn in range(36, 46):
        letter = page["answers"].get(qn, "")
        blk = (sec["p3sb"] or {}).get("qblocks", {}).get(qn)
        expl = compose_explanation(blk, letter, "") if blk else (f"答案为 {letter}。" if letter else "缺答案")
        qs.append({"id": qn, "stem": page["stems"].get(qn, ""), "answer": letter, "explanation": expl})
    if page["matchParas"]:
        paper["sections"].append({
            "id": f"matching-{pid}", "type": "matching", "title": "Part III Section B 长篇阅读", "short": "长篇阅读", "minutes": 15,
            "passageTitle": page["matchTitle"], "paragraphs": page["matchParas"], "questions": qs,
            "vocab": (sec["p3sb"] or {}).get("highfreq", []),
        })
        if len(page["matchParas"]) < 8 or any(not q["answer"] or not q["stem"] for q in qs):
            problems.append(f"matching paras={len(page['matchParas'])} ans={sum(1 for q in qs if q['answer'])} stems={sum(1 for q in qs if q['stem'])}")

    # 仔细阅读
    qs46 = []
    for qn in range(46, 51):
        letter = page["answers"].get(qn, "")
        blk = (sec["p3sc1"] or {}).get("qblocks", {}).get(qn)
        expl = compose_explanation(blk, letter, "") if blk else (f"答案为 {letter}。" if letter else "缺答案")
        qs46.append({"id": qn, "stem": page["stems"].get(qn, ""), "answer": letter, "explanation": expl})
    qs51 = []
    for qn in range(51, 56):
        letter = page["answers"].get(qn, "")
        blk = (sec["p3sc2"] or {}).get("qblocks", {}).get(qn)
        expl = compose_explanation(blk, letter, "") if blk else (f"答案为 {letter}。" if letter else "缺答案")
        qs51.append({"id": qn, "stem": page["stems"].get(qn, ""), "answer": letter, "explanation": expl})
    passages = []
    if page["readingPassages"][0]["text"] and any(q["answer"] for q in qs46):
        passages.append({"title": page["readingPassages"][0]["title"], "text": page["readingPassages"][0]["text"], "questions": qs46})
    if page["readingPassages"][1]["text"] and any(q["answer"] for q in qs51):
        passages.append({"title": page["readingPassages"][1]["title"], "text": page["readingPassages"][1]["text"], "questions": qs51})
    if passages:
        paper["sections"].append({
            "id": f"reading-{pid}", "type": "reading", "title": "Part III Section C 仔细阅读", "short": "仔细阅读", "minutes": 20,
            "passages": passages,
            "vocab": (sec["p3sc1"] or {}).get("highfreq", []) + (sec["p3sc2"] or {}).get("highfreq", []),
        })
        ok46 = all(q["answer"] and q["stem"] for q in qs46)
        ok51 = all(q["answer"] and q["stem"] for q in qs51)
        t1 = len(page["readingPassages"][0]["text"])
        t2 = len(page["readingPassages"][1]["text"])
        if not (ok46 and ok51) or t1 < 300 or t2 < 300:
            problems.append(f"reading ans46={sum(1 for q in qs46 if q['answer'])}/5 ans51={sum(1 for q in qs51 if q['answer'])}/5 text={t1}/{t2}")

    # 翻译
    t = sec["part-iv"] or {}
    paper["sections"].append({
        "id": f"translation-{pid}", "type": "translation", "title": "Part IV 翻译", "short": "翻译", "minutes": 30,
        "original": page["transOriginal"], "reference": t.get("reference", ""),
        "keyPhrases": t.get("keyPhrases", []), "vocab": [],
    })
    if not page["transOriginal"] or not t.get("reference"):
        problems.append("translation incomplete")

    return paper, problems

def main():
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(BRIEF, exist_ok=True)
    report = []
    for pid in PIDS:
        try:
            paper, problems = build_paper(pid)
            io.open(os.path.join(OUT, pid + ".json"), "w", encoding="utf-8").write(
                json.dumps({"papers": [paper]}, ensure_ascii=False, indent=1))
            # 简报（给词汇代理）
            w = next(s for s in paper["sections"] if s["type"] == "writing")
            t = next(s for s in paper["sections"] if s["type"] == "translation")
            io.open(os.path.join(BRIEF, pid + ".json"), "w", encoding="utf-8").write(json.dumps({
                "id": pid, "date": paper["date"],
                "promptEn": w["promptEn"], "modelEssay": w["modelEssay"],
                "original": t["original"], "reference": t["reference"],
            }, ensure_ascii=False, indent=1))
            nq = sum(len(s.get("questions", [])) + sum(len(p.get("questions", [])) for p in s.get("passages", [])) for s in paper["sections"])
            size = os.path.getsize(os.path.join(OUT, pid + ".json"))
            print(("WARN " + pid + " " + "; ".join(problems)) if problems else ("OK   " + pid), f"questions={nq} {size//1024}KB", flush=True)
            report.append((pid, problems))
        except Exception as e:
            import traceback
            print("ERROR", pid, repr(e), flush=True)
            traceback.print_exc()
    bad = [r for r in report if r[1]]
    print(f"== done. total={len(report)} with_problems={len(bad)}", flush=True)

if __name__ == "__main__":
    if len(sys.argv) > 1:
        PIDS[:] = sys.argv[1:]
    main()
