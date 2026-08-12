# Alican price-list fixtures

Real supplier PDFs from the user's Downloads folder (Alican, period 08/2026),
used to validate the parser end-to-end. Both files are committed as fixtures so
the suite does not depend on the user's machine.

| File | Origin | Description |
|---|---|---|
| `alican-seco-082026.pdf` | `Downloads/082026. LP Alican SECO - 10ago2026.pdf` | SECO layout: 6 pages, 138 product rows (137 with prices + 1 error row with "-" prices) |
| `alican-wet-082026.pdf` | `Downloads/082026. LP Alican WET - 10ago2026.pdf` | WET layout: 1 page, 64 product rows, flat (no hierarchy) |

## Deterministic `.txt` fixtures

`alican-seco-082026.txt` and `alican-wet-082026.txt` are the text extracted
from the PDFs with `pdf-parse` (`new PDFParse({ data: buf })` + `getText()`),
captured once and committed so the parser tests run deterministically without
pdf-parse variance in CI. The integration test `providerPriceListService.test.ts`
also parses the real PDFs once to prove the parser works against live extraction.

## How to regenerate the `.txt` files

```bash
# From api/ (pdf-parse is a dependency):
node -e "
const fs = require('fs');
const { PDFParse } = require('pdf-parse');
(async () => {
  const buf = fs.readFileSync('tests/fixtures/pdfs/alican-seco-082026.pdf');
  const parser = new PDFParse({ data: buf });
  const res = await parser.getText();
  fs.writeFileSync('tests/fixtures/pdfs/alican-seco-082026.txt', res.text);
})();
"
```

Repeat with `alican-wet-082026.pdf`. Commit both `.pdf` and `.txt` together.
