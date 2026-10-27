# -*- coding: utf-8 -*-
"""轻量资料检索：从 dsh_library.json 的 chunk 文本里做关键词匹配（中文 bigram + 英文词）。

用法：python search_library.py "<query>" [topK] [library]
输出：JSON 数组 [{document, score, text}]
"""
import json
import re
import sys

LIB_JSON = r"C:\Users\19120\.dsh\storages\dsh_library.json"


def tokens(text):
    text = text.lower()
    english = re.findall(r"[a-z0-9]{2,}", text)
    zh = re.findall(r"[\u4e00-\u9fff]", text)
    bigrams = ["".join(zh[i:i + 2]) for i in range(len(zh) - 1)]
    return set(english) | set(bigrams)


def main():
    if len(sys.argv) < 2:
        print("[]")
        return 1
    query = sys.argv[1]
    top_k = int(sys.argv[2]) if len(sys.argv) > 2 else 3
    library = sys.argv[3] if len(sys.argv) > 3 else "course"

    try:
        with open(LIB_JSON, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False))
        return 1

    tables = data.get("tables", {})
    docs = tables.get("documents", {})
    chunks = tables.get("chunks", {})

    query_tokens = tokens(query)
    if not query_tokens:
        print("[]")
        return 0

    scored = []
    for chunk in chunks.values():
        if chunk.get("library") != library:
            continue
        text = chunk.get("text") or ""
        chunk_tokens = tokens(text)
        if not chunk_tokens:
            continue
        hit = len(query_tokens & chunk_tokens)
        if hit == 0:
            continue
        # 覆盖率 + 长度惩罚（避免长文靠数量堆分）
        coverage = hit / len(query_tokens)
        score = coverage - 0.000002 * len(text)
        scored.append((score, chunk))

    scored.sort(key=lambda item: item[0], reverse=True)

    out = []
    for score, chunk in scored[:top_k]:
        doc_id = chunk.get("documentId", "")
        doc = docs.get("course:" + doc_id) or docs.get(doc_id) or {}
        name = doc.get("name") or doc_id
        out.append({
            "document": name,
            "score": round(score, 4),
            "text": (chunk.get("text") or "")[:1200],
        })
    print(json.dumps(out, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
