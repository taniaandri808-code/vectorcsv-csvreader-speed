# Vector-free fast CSV reader — csv-reader-speed-01-run-20261121

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/taniaandri808-code/vectorcsv-csvreader-speed/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/taniaandri808-code/vectorcsv-csvreader-speed/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A dependency-free drop-in replacement for make.fun's `csv-reader` 1.0.0, built for
[make.fun's "Read broken CSV files faster, 21 November 2026" bounty](https://make.fun/bounty/csv-reader-speed-01-run-20261121):
`solve.js` exports `run(input)` and returns exactly the `{columns, rows, errors}` the reference returns,
several times faster, in pure JavaScript (no WebAssembly, no native addons).

- `main.ts` — the harness driver: reads `/input/cases.json`, answers each case with `run`, writes `/output/answers.json`.
- `solve.js` — the reader: one left-to-right pass over the text, native single-character `indexOf` scans for
  `,` `\n` `\r` `"`, monotonic cached scans for the rare needles, field values as slices of the input string,
  and the reference's exact broken-row policy (BOM, CRLF, stray CR, quoted newlines, `""` escapes, quote junk,
  unterminated quotes, short/long rows, ordered errors).

Run locally with the competition kit:

```
node main.ts   # reads $MAKEFUN_INPUT_DIR/cases.json, writes $MAKEFUN_OUTPUT_DIR/answers.json
```

Verified byte-identical to the reference on the practice set, a hand-written adversarial suite and a randomized fuzz suite.

## License

SPDX-License-Identifier: MIT
