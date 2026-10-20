# -*- coding: utf-8 -*-
"""批量抓取懒笔记四级整卷页 + 各题型解析页（2021-06 ~ 2025-12，36 套）。
幂等：已存在且 >20KB 的文件跳过。"""
import io, os, time, urllib.request

OUT = r"c:\Users\13250\Documents\trae_projects\11\cet4-exam\_raw"
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36",
      "Accept-Language": "zh-CN,zh;q=0.9"}

SESSIONS = ["2021-06", "2021-12", "2022-06", "2022-09", "2022-12", "2023-03",
            "2023-06", "2023-12", "2024-06", "2024-12", "2025-06", "2025-12"]
PIDS = [f"{s}-{n}" for s in SESSIONS for n in (1, 2, 3)]

SECTIONS = [
    ("part1", "https://english-exam.lazynote.cn/cet4/sections/{pid}/part1/"),
    ("part-iv", "https://english-exam.lazynote.cn/cet4/sections/{pid}/part-iv/"),
    ("p3sa", "https://english-exam.lazynote.cn/cet4/sections/{pid}/part3-section-a/"),
    ("p3sb", "https://english-exam.lazynote.cn/cet4/sections/{pid}/part3-section-b/"),
    ("p3sc1", "https://english-exam.lazynote.cn/cet4/sections/{pid}/part3-section-c-1/"),
    ("p3sc2", "https://english-exam.lazynote.cn/cet4/sections/{pid}/part3-section-c-2/"),
]

def get(url, tries=3):
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=40) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:
            last = e
            time.sleep(1.2 * (i + 1))
    raise last

def fetch_one(pid):
    done = 0
    # 整卷页
    p = os.path.join(OUT, pid + ".html")
    if not (os.path.exists(p) and os.path.getsize(p) > 20000):
        html = get(f"https://english-exam.lazynote.cn/cet4/paper/{pid}/")
        io.open(p, "w", encoding="utf-8").write(html)
        time.sleep(0.35)
    done += 1
    # 解析页
    for slug, tpl in SECTIONS:
        p = os.path.join(OUT, f"sec-{pid}-{slug}.html")
        if os.path.exists(p) and os.path.getsize(p) > 20000:
            done += 1
            continue
        try:
            html = get(tpl.format(pid=pid))
            io.open(p, "w", encoding="utf-8").write(html)
        except Exception as e:
            print("FAIL", pid, slug, repr(e)[:120], flush=True)
        time.sleep(0.35)
        done += 1
    return done

if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    total = len(PIDS) * 7
    n = 0
    for pid in PIDS:
        try:
            fetch_one(pid)
            print("OK", pid, flush=True)
        except Exception as e:
            print("FAIL-PAPER", pid, repr(e)[:150], flush=True)
        n += 7
    print("ALL DONE", flush=True)
