#!/usr/bin/env python3
"""Summarize the Lex chat telemetry log (data/lex-chat.jsonl).

Usage: python3 report.py [path-to-jsonl]
Default path: <repo>/data/lex-chat.jsonl (resolved relative to this script).
Prints usage stats + every 👎 turn joined to its question/answer, so a Claude
Code session can see exactly what to fix. Tolerates missing fields on old lines.
"""
import json
import os
import sys
from statistics import mean, median


def pctl(values, p):
    if not values:
        return None
    s = sorted(values)
    k = max(0, min(len(s) - 1, round((p / 100) * (len(s) - 1))))
    return s[k]


def load(path):
    turns, feedback = [], []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                r = json.loads(line)
            except json.JSONDecodeError:
                continue
            (feedback if r.get("type") == "feedback" else turns).append(r)
    return turns, feedback


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    default = os.path.abspath(os.path.join(here, "..", "..", "..", "data", "lex-chat.jsonl"))
    path = sys.argv[1] if len(sys.argv) > 1 else default

    if not os.path.exists(path) or os.path.getsize(path) == 0:
        print(f"No telemetry yet at {path} — no usage to analyze.")
        return

    turns, feedback = load(path)
    print(f"=== Lex telemetry — {path} ===")
    if turns:
        print(f"turns: {len(turns)}   ({turns[0].get('ts','?')} → {turns[-1].get('ts','?')})")

    # source / fallback rate
    ai = sum(1 for t in turns if t.get("source") == "ai")
    fb = sum(1 for t in turns if t.get("source") == "fallback")
    if turns:
        print(f"source: ai={ai}  fallback={fb}  (fallback rate {100*fb/len(turns):.0f}%)")
    errs = [t for t in turns if t.get("error")]
    if errs:
        print(f"errors: {len(errs)} turn(s) carried an error field")

    # latency
    ttft = [t["ttft_ms"] for t in turns if isinstance(t.get("ttft_ms"), (int, float))]
    dur = [t["duration_ms"] for t in turns if isinstance(t.get("duration_ms"), (int, float))]
    if ttft:
        print(f"ttft_ms:     avg {mean(ttft):.0f}  median {median(ttft):.0f}  p95 {pctl(ttft,95):.0f}")
    if dur:
        print(f"duration_ms: avg {mean(dur):.0f}  median {median(dur):.0f}  p95 {pctl(dur,95):.0f}")

    # tool / widget frequency
    def freq(key):
        c = {}
        for t in turns:
            for v in (t.get(key) or []):
                c[v] = c.get(v, 0) + 1
        return dict(sorted(c.items(), key=lambda kv: -kv[1]))
    tools, widgets = freq("tools"), freq("widgets")
    if tools:
        print("tools used: " + ", ".join(f"{k}×{v}" for k, v in tools.items()))
    if widgets:
        print("widgets:    " + ", ".join(f"{k}×{v}" for k, v in widgets.items()))

    # feedback
    up = sum(1 for f in feedback if f.get("rating") == "up")
    down = sum(1 for f in feedback if f.get("rating") == "down")
    print(f"\nfeedback: 👍 {up}   👎 {down}   (of {len(feedback)} votes)")

    by_id = {t.get("turn_id"): t for t in turns if t.get("turn_id")}
    downs = [f for f in feedback if f.get("rating") == "down"]
    # Collect user comments (the "why") per turn — this is what lets you judge
    # whether a 👎 is valid before acting on it.
    comments = {}
    for f in feedback:
        c = f.get("comment")
        if c:
            comments.setdefault(f.get("turn_id"), []).append(c)
    if downs:
        print("\n=== 👎 disliked turns (fix these first) ===")
        seen = set()
        for f in downs:
            tid = f.get("turn_id")
            if tid in seen:
                continue
            seen.add(tid)
            t = by_id.get(tid, {})
            print(f"\n• [{tid}] {t.get('name','?')} — tools={t.get('tools') or []} source={t.get('source','?')}")
            print(f"  Q: {t.get('question','(turn not in log)')}")
            ans = (t.get("answer") or "").replace("\n", " ")
            print(f"  A: {ans[:280]}")
            for c in comments.get(tid, []):
                print(f"  💬 user: {c}")
            if tid not in comments:
                print("  💬 user: (no comment — judge validity from Q/A alone)")
    else:
        print("\nNo 👎 yet — nothing flagged bad.")


if __name__ == "__main__":
    main()
