"""
Synthetic test documents for EDITOR.

Generates PDFs containing FICTIONAL information only. The output file
`synthetic-bank-statement.pdf` is a demo bank statement clearly marked as
synthetic — use it to exercise text search, replacement, annotation,
redaction and the AI pipeline. Never commit real customer statements.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pikepdf


def make_synthetic_statement(output: Path) -> None:
    pdf = pikepdf.Pdf.new()

    body = """DEMO FINANCIAL DOCUMENT
This is synthetic data. Not a real bank statement.
Generated for EDITOR testing purposes only.

ACME DEMO BANK - FICTIONAL ACCOUNT
Account holder: Jane Demo
Account number: XXXX-1234 (synthetic)
Statement period: 2026-01-01 to 2026-01-31

Date        Description                  Amount
2026-01-02  Opening balance              1,000.00
2026-01-05  Salary credit (demo corp)    2,500.00
2026-01-08  Grocery Mart purchase         -85.40
2026-01-12  Utility bill payment         -120.00
2026-01-15  ATM withdrawal                -200.00
2026-01-21  Subscription service          -15.99
2026-01-31  Closing balance               3,078.61

All names, numbers and amounts above are fabricated.
"""

    font = pikepdf.Dictionary(
        Type=pikepdf.Name.Font,
        Subtype=pikepdf.Name.Type1,
        BaseFont=pikepdf.Name.Helvetica,
        Encoding=pikepdf.Name.WinAnsiEncoding,
    )
    pdf.add_blank_page(page_size=(612, 792))
    page = pdf.pages[0]
    page.Resources = pikepdf.Dictionary(Font=pikepdf.Dictionary(F1=font))

    ops = ["BT", "/F1 11 Tf", "14 TL", "72 720 Td"]
    for line in body.splitlines():
        # escape parentheses for PDF literal strings
        safe = line.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")
        ops.append(f"({safe}) Tj")
        ops.append("T*")
    ops.append("ET")
    page.Contents = pdf.make_stream(" ".join(ops).encode("latin-1", errors="replace"))

    with pdf.open_metadata() as meta:
        meta["dc:title"] = "DEMO FINANCIAL DOCUMENT (synthetic)"
        meta["dc:description"] = "Synthetic test data - not a real bank statement."

    pdf.save(str(output))
    print(f"wrote {output}")


def make_simple_text_pdf(output: Path, text: str = "Hello EDITOR") -> None:
    pdf = pikepdf.Pdf.new()
    font = pikepdf.Dictionary(
        Type=pikepdf.Name.Font,
        Subtype=pikepdf.Name.Type1,
        BaseFont=pikepdf.Name.Helvetica,
        Encoding=pikepdf.Name.WinAnsiEncoding,
    )
    pdf.add_blank_page(page_size=(612, 792))
    page = pdf.pages[0]
    page.Resources = pikepdf.Dictionary(Font=pikepdf.Dictionary(F1=font))
    safe = text.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")
    page.Contents = pdf.make_stream(f"BT /F1 24 Tf 72 700 Td ({safe}) Tj ET".encode())
    pdf.save(str(output))
    print(f"wrote {output}")


if __name__ == "__main__":
    out_dir = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
    out_dir.mkdir(parents=True, exist_ok=True)
    make_synthetic_statement(out_dir / "synthetic-bank-statement.pdf")
    make_simple_text_pdf(out_dir / "synthetic-hello.pdf", "The quick brown fox jumps over the lazy dog")
