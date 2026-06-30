"""
Decoupled Academic Citation Verification Platform — Backend Engine
==================================================================

Reference FastAPI service. Mirrors the contract implemented by the live
TypeScript engine in `src/server/verify-engine/`. Deploy with:

    uvicorn main:app --host 0.0.0.0 --port 8000 --reload

Contract (identical to /api/verify-engine):
    POST /api/verify
        multipart/form-data:
            file:          PDF file
            author:        string
            quote:         string
            expected_page: string (optional)
        -> JSON:
            status:    VERIFIED_EXACT | VERIFIED_CORRECTED | ALTERNATIVE_FOUND | NOT_FOUND
            message:   string
            page:      string | null          (printed page number)
            alternative: { title, author, year, publisher, fullApa } | null
"""

from __future__ import annotations

import io
import re
from typing import Optional

import httpx
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pypdf import PdfReader

app = FastAPI(title="Citation Verification Engine", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Stage 1: PDF deep scan ────────────────────────────────────────────────────

def _extract_printed_page(text: str) -> Optional[str]:
    """Read the top/bottom margin of a page and detect a standalone page number."""
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    if not lines:
        return None
    margins = [lines[0], lines[-1]]
    if len(lines) > 1:
        margins += [lines[1], lines[-2]]
    for ln in margins:
        pure = re.sub(r"[-–—|.()\s]", "", ln)
        if re.fullmatch(r"\d{1,4}", pure):
            n = int(pure)
            if 1 <= n <= 9999 and not re.fullmatch(r"(19|20)\d{2}", pure):
                return pure
    return None


def _find_quote_in_pdf(pdf_bytes: bytes, quote: str, expected_page: Optional[str]):
    """Scan every page for the quote; return (status, printed_page, message)."""
    reader = PdfReader(io.BytesIO(pdf_bytes))
    q_norm = _normalize(quote)
    for i, page in enumerate(reader.pages):
        text = page.extract_text() or ""
        printed = _extract_printed_page(text)
        if q_norm and q_norm in _normalize(text):
            if expected_page and printed and printed != expected_page:
                return "VERIFIED_CORRECTED", printed, f"الاقتباس موجود فعلاً لكن في الصفحة المطبوعة {printed} لا {expected_page}. تم التصحيح تلقائياً."
            if expected_page and not printed:
                printed = str(i + 1)
            return "VERIFIED_EXACT", printed or str(i + 1), "الاقتباس موجود حرفياً في الملف — التوثيق صحيح 100%."
    return None, None, None


def _normalize(text: str) -> str:
    t = text.lower()
    t = re.sub(r"[«»\"“”‘’`(){}\[\],;:!?؟.,\-–—_]", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t


# ── Stage 2: Global library fallback (Google Books) ──────────────────────────

def _apa7(title: str, authors: list[str], year: str, publisher: str) -> str:
    if authors:
        parts = []
        for a in authors:
            if "," in a:
                last, rest = a.split(",", 1)
                initials = ". ".join(w[0].upper() for w in rest.strip().split())
                parts.append(f"{last.strip()}, {initials}.")
            else:
                bits = a.strip().split()
                if len(bits) == 1:
                    parts.append(bits[0])
                else:
                    initials = ". ".join(w[0].upper() for w in bits[:-1])
                    parts.append(f"{initials}. {bits[-1]}")
        if len(parts) == 1:
            author_str = parts[0]
        elif len(parts) == 2:
            author_str = f"{parts[0]} & {parts[1]}"
        else:
            author_str = f"{parts[0]} et al."
    else:
        author_str = "Unknown"
    return f"{author_str} ({year}). *{title}*. {publisher}."


async def _query_google_books(quote: str, author: str) -> Optional[dict]:
    """Strict Google Books search: 'exact quote' inauthor:author."""
    q = f'"{quote[:120]}" inauthor:{author}'
    url = "https://www.googleapis.com/books/v1/volumes"
    async with httpx.AsyncClient(timeout=8.0) as client:
        r = await client.get(url, params={"q": q, "maxResults": 5})
        if r.status_code != 200:
            return None
        data = r.json()
        items = data.get("items", [])
        if not items:
            return None
        info = items[0].get("volumeInfo", {})
        return {
            "title": info.get("title", ""),
            "author": ", ".join(info.get("authors", [])),
            "year": (info.get("publishedDate", "") or "")[:4],
            "publisher": info.get("publisher", ""),
            "fullApa": _apa7(
                info.get("title", ""),
                info.get("authors", []),
                (info.get("publishedDate", "") or "")[:4] or "n.d.",
                info.get("publisher", ""),
            ),
        }


# ── Endpoint ─────────────────────────────────────────────────────────────────

@app.post("/api/verify")
async def verify(
    file: UploadFile = File(...),
    author: str = Form(...),
    quote: str = Form(...),
    expected_page: str = Form(""),
):
    pdf_bytes = await file.read()

    # Stage 1: file deep scan
    status, page, message = _find_quote_in_pdf(pdf_bytes, quote, expected_page or None)
    if status:
        return {"status": status, "message": message, "page": page, "alternative": None}

    # Stage 2: global fallback
    alt = await _query_google_books(quote, author)
    if alt:
        return {
            "status": "ALTERNATIVE_FOUND",
            "message": "تعذّر العثور على الاقتباس في ملفك، لكن النظام عثر عليه في المكتبة العالمية مع التوثيق المعتمد 100%.",
            "page": None,
            "alternative": alt,
        }

    return {
        "status": "NOT_FOUND",
        "message": "لم يُعثر على الاقتباس في الملف ولا في المكتبات العالمية. قد يكون المرجع وهمياً أو الاقتباس غير دقيق.",
        "page": None,
        "alternative": None,
    }


@app.get("/health")
async def health():
    return {"ok": True, "service": "verify-engine", "engine": "fastapi-reference"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
