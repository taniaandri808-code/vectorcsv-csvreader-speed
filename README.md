# Vector-free fast CSV reader (csv-reader-speed-01)

A dependency-free drop-in replacement for make.fun's `csv-reader` 1.0.0: `solve.js` exports
`run(input)` returning exactly `{columns, rows, errors}` the reference returns, several times faster.

- `main.ts` — the harness driver (reads `/input/cases.json`, answers each case with `run`, writes `/output/answers.json`)
- `solve.js` — the reader: one left-to-right pass, native single-char `indexOf` jumps for `,`/`\n`/`\r`/`"`,
  monotonic needle caches, field values as slices of the input string, exact broken-row policy
  (BOM, CRLF, stray CR, quoted newlines, `""` escapes, quote junk, unterminated quotes, short/long rows).

## License

SPDX-License-Identifier: MIT
