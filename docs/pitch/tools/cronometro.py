#!/usr/bin/env python3
"""How long the 3-minute pitch script takes to read out loud.

Counts syllables (vowel groups, a good approximation of Spanish diphthongs) in the spoken
lines (those starting with "> ") of every "### " block, skipping the italic stage directions,
and divides by a speaking rate. Output is in Spanish: the team reads it.

Usage: python3 docs/pitch/tools/cronometro.py docs/pitch/guion-3-minutos.md 4.2
"""
import re, sys, unicodedata

VOWELS = set("aeiouyáéíóúü")

def syllables(text):
    t = text.lower()
    n, prev = 0, False
    for ch in t:
        v = ch in VOWELS
        if v and not prev:
            n += 1
        prev = v
    return n

def spoken(block_lines):
    out = []
    for ln in block_lines:
        s = ln.strip()
        if not s.startswith(">"):
            continue
        s = s.lstrip("> ").strip()
        s = re.sub(r"\*\[[^\]]*\]\*", " ", s)      # *[stage direction]*
        s = re.sub(r"\*\([^)]*\)\*", " ", s)        # *(a beat of silence)*
        s = re.sub(r"\*\*|\*", "", s)
        if s:
            out.append(s)
    return " ".join(out)

def main(path, rate=4.2):
    lines = open(path, encoding="utf-8").read().splitlines()
    blocks, cur, head = [], [], None
    for ln in lines:
        if ln.startswith("### "):
            if head:
                blocks.append((head, cur))
            head, cur = ln[4:].strip(), []
        elif head is not None:
            cur.append(ln)
    if head:
        blocks.append((head, cur))

    total_said = 0.0
    rows = []
    for head, body in blocks:
        text = spoken(body)
        if not text:
            continue
        syl = syllables(text)
        words = len(text.split())
        secs = syl / rate
        total_said += secs
        m = re.match(r"(\d+):(\d+)[–-](\d+):(\d+)", head)
        window = None
        if m:
            a = int(m.group(1)) * 60 + int(m.group(2))
            b = int(m.group(3)) * 60 + int(m.group(4))
            window = b - a
        rows.append((head, words, syl, secs, window))

    print(f"velocidad supuesta: {rate} silabas/s\n")
    print(f"{'bloque':<52}{'pal':>5}{'sil':>6}{'habla':>8}{'hueco':>8}{'sobra':>8}")
    for head, words, syl, secs, window in rows:
        short = head[:50]
        w = f"{window}s" if window else "-"
        slack = f"{window-secs:+.0f}s" if window else "-"
        print(f"{short:<52}{words:>5}{syl:>6}{secs:>7.0f}s{w:>8}{slack:>8}")
    windows = sum(r[4] for r in rows if r[4])
    print(f"\nsolo hablando:        {total_said:5.0f} s  ({total_said/60:.2f} min)")
    print(f"huecos del guion:     {windows:5.0f} s")
    print(f"margen para escena:   {windows-total_said:5.0f} s")

if __name__ == "__main__":
    main(sys.argv[1], float(sys.argv[2]) if len(sys.argv) > 2 else 4.2)
