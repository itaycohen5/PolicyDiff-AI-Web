"""Read PDF bytes from stdin and write page-bound, section-aware chunks as JSON."""
import json
import re
import sys
from contextlib import closing

from pypdfium2 import PdfDocument, PdfiumError

HEADING = re.compile(r"^\s*(\d{1,2}(?:\.\d{1,3}){1,4})\.?[ \t]+(\S.*)$")
CHAPTER = re.compile(r"^\s*Section\s+(\d{1,2})\s*$", re.IGNORECASE)
NOISE = re.compile(
    r"^(?:page\s+\d+(?:\s+of\s+\d+)?$|effective\s*\(|©|"
    r"\(?OAP\s*1\)?\s*Owner|OAP\s*1[-–]EN)", re.IGNORECASE
)
MAX_PAGE_COUNT = 160
MAX_CHUNK = 850


def split_block(text):
    while len(text) > MAX_CHUNK:
        cut = text.rfind(" ", 0, MAX_CHUNK + 1)
        if cut < MAX_CHUNK // 2:
            cut = MAX_CHUNK
        yield text[:cut]
        text = text[cut:].strip()
    if text:
        yield text


def extract(data):
    try:
        with PdfDocument(data) as reader:
            if not 0 < len(reader) <= MAX_PAGE_COUNT:
                raise ValueError(f"PDFs must contain 1 to {MAX_PAGE_COUNT} pages.")
            pages = []
            for index in range(len(reader)):
                with closing(reader[index]) as page:
                    with closing(page.get_textpage()) as text:
                        pages.append(text.get_text_bounded())
    except (PdfiumError, OSError) as error:
        raise ValueError("The PDF could not be read. Check that it is valid and can be opened without a password.") from error

    if sum(len(re.findall(r"[^\W\d_]", page)) for page in pages) < 50:
        raise ValueError("This PDF has too little selectable text. Upload a text PDF.")

    chunks = []
    section = ""
    chapter = ""
    for page_no, page in enumerate(pages, start=1):
        lines = [line.strip() for line in page.splitlines() if line.strip()]
        if any(re.search(r"^(?:table of contents|contents)\s*$", line, re.I) for line in lines):
            section = ""
            continue
        block = []

        def flush():
            text = re.sub(r"\s+", " ", " ".join(block)).strip()
            heading_line = block[0] if block and HEADING.match(block[0]) else ""
            if heading_line and len(text) > len(heading_line):
                text = heading_line + "\n" + text[len(heading_line):].strip()
            chunks.extend(
                {"page": page_no, "section": section, "body": part}
                for part in split_block(text)
            )
            block.clear()

        for line in lines:
            if NOISE.match(line) or re.search(r"\.{4,}\s*\d+\s*$", line):
                continue
            chapter_marker = CHAPTER.match(line)
            if chapter_marker:
                if chapter == chapter_marker.group(1) or section.split(".")[0] == chapter_marker.group(1):
                    continue
                flush()
                chapter = section = chapter_marker.group(1)
            else:
                heading = HEADING.match(line)
                if heading:
                    flush()
                    section = heading.group(1)
            block.append(line)
        flush()
    if not chunks or len(chunks) > 3000:
        raise ValueError("The PDF has no usable text or exceeds the text processing limit.")
    return {"pageCount": len(pages), "chunks": chunks}


if __name__ == "__main__":
    try:
        print(json.dumps(extract(sys.stdin.buffer.read()), ensure_ascii=True))
    except ValueError as error:
        print(str(error), file=sys.stderr)
        sys.exit(2)
