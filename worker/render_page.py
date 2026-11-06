"""Render one physical PDF page as a bounded PNG."""
import sys
from contextlib import closing

from pypdfium2 import PdfDocument, PdfiumError


def render(data, number, output):
    with PdfDocument(data) as document:
        if not 1 <= number <= len(document):
            raise ValueError("Page not found in this PDF.")
        with closing(document[number - 1]) as page:
            scale = min(2.0, 1560 / max(page.get_size()))
            with closing(page.render(scale=scale)) as bitmap:
                bitmap.to_pil().save(output, format="PNG")


if __name__ == "__main__":
    try:
        render(sys.stdin.buffer.read(), int(sys.argv[1]), sys.stdout.buffer)
    except (PdfiumError, ValueError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(2)
