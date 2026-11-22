// Fast CSV parser, byte-exact with csv-reader 1.0.0 (make.fun reference).
// A single tight loop per invocation; native single-character indexOf scans
// handle ',' and '\n' (frequent and nearby), while monotonic cached scans
// handle '\r' and '"' (rare). Field values are slices of the input string;
// no per-field objects are returned.

const FIELD_COMMA = 0;
const FIELD_BREAK = 1;
const FIELD_END = 2;

// Shared state for the current run (run() is not reentrant; fine for the harness).
let sourceText, sourceLength, wantsHeader, problemList, outputRows, headerFields;
let rowWidth, offset, lineNumber, recordLineNumber, recordIndex;
let crCursor, crExhausted, quoteCursor, quoteExhausted;
let nlCursor, nlExhausted;
let commaCursor, commaExhausted;

// Outcome of the most recently parsed field.
let fieldText, fieldStop, fieldResume;

// Record a problem for the current record.
function addProblem(problemCode) {
  problemList.push({ code: problemCode, line: recordLineNumber, row: recordIndex });
}

// Return the next carriage return at or after `from`, or -1 once none remain.
function findCarriageReturn(from) {
  if (crExhausted) return -1;
  if (crCursor < from) {
    crCursor = sourceText.indexOf('\r', from);
    if (crCursor < 0) crExhausted = true;
  }
  return crCursor;
}

// Return the next double quote at or after `from`, or -1 once none remain.
function findQuote(from) {
  if (quoteExhausted) return -1;
  if (quoteCursor < from) {
    quoteCursor = sourceText.indexOf('"', from);
    if (quoteCursor < 0) quoteExhausted = true;
  }
  return quoteCursor;
}

// Return the next LF at or after `from`, or -1 once none remain.
function findNewline(from) {
  if (nlExhausted) return -1;
  if (nlCursor < from) {
    nlCursor = sourceText.indexOf('\n', from);
    if (nlCursor < 0) nlExhausted = true;
  }
  return nlCursor;
}

// Return the next comma at or after `from`, or -1 once none remain.
function findComma(from) {
  if (commaExhausted) return -1;
  if (commaCursor < from) {
    commaCursor = sourceText.indexOf(',', from);
    if (commaCursor < 0) commaExhausted = true;
  }
  return commaCursor;
}

// Read an unquoted field beginning at `p`, optionally prepending `prefix`.
// The field ends at a comma, newline, CRLF, or end of input. A lone CR is
// discarded and reported as stray_cr. Results go into fieldText/fieldStop/fieldResume.
function readField(p, prefix) {
  let assembled = prefix;
  let hasPrefix = prefix !== '';

  for (;;) {
    let stopIndex = -1;
    let stopKind = 0;

    const commaAt = findComma(p);
    stopIndex = commaAt;
    stopKind = 0;

    const newlineAt = findNewline(p);
    if (newlineAt >= 0 && (stopIndex < 0 || newlineAt < stopIndex)) {
      stopIndex = newlineAt;
      stopKind = 1;
    }

    const carriageAt = findCarriageReturn(p);
    if (carriageAt >= 0 && (stopIndex < 0 || carriageAt < stopIndex)) {
      stopIndex = carriageAt;
      stopKind = 2;
    }

    if (stopIndex < 0) {
      fieldText = hasPrefix ? assembled + sourceText.slice(p) : sourceText.slice(p);
      fieldStop = FIELD_END;
      fieldResume = sourceLength;
      return;
    }

    if (stopIndex > p) {
      const segment = sourceText.slice(p, stopIndex);
      assembled = hasPrefix ? assembled + segment : segment;
      hasPrefix = true;
    }

    if (stopKind === 0) {
      fieldText = assembled;
      fieldStop = FIELD_COMMA;
      fieldResume = stopIndex + 1;
      return;
    }

    if (stopKind === 1) {
      fieldText = assembled;
      fieldStop = FIELD_BREAK;
      fieldResume = stopIndex + 1;
      lineNumber++;
      return;
    }

    // CRLF closes the record; a bare CR is dropped and flagged as stray_cr.
    if (stopIndex + 1 < sourceLength && sourceText.charCodeAt(stopIndex + 1) === 10) {
      fieldText = assembled;
      fieldStop = FIELD_BREAK;
      fieldResume = stopIndex + 2;
      lineNumber++;
      return;
    }

    addProblem('stray_cr');
    p = stopIndex + 1;
    hasPrefix = true;
    crCursor = stopIndex; // findCarriageReturn(p) rescans because crCursor < p
  }
}

// Count line breaks in [from, to): each '\n', CRLF, and lone '\r' counts once.
function countLineBreaks(from, to) {
  let breaks = 0;
  let i = from;
  while (i < to) {
    const ch = sourceText.charCodeAt(i);
    if (ch === 10) {
      breaks++;
      i++;
      continue;
    }
    if (ch === 13) {
      breaks++;
      i += (i + 1 < to && sourceText.charCodeAt(i + 1) === 10) ? 2 : 1;
      continue;
    }
    i++;
  }
  return breaks;
}

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  sourceText = String(input.text);
  wantsHeader = input.header === true;
  sourceLength = sourceText.length;
  problemList = [];
  outputRows = [];
  headerFields = null;
  rowWidth = -1;
  offset = sourceText.charCodeAt(0) === 0xfeff ? 1 : 0;
  lineNumber = 1;
  recordIndex = null;
  crCursor = -1;
  crExhausted = false;
  quoteCursor = -1;
  quoteExhausted = false;
  nlCursor = -1;
  nlExhausted = false;
  commaCursor = -1;
  commaExhausted = false;
  fieldText = '';
  fieldStop = FIELD_END;
  fieldResume = sourceLength;

  while (true) {
    // Blank lines containing only LF or CRLF are skipped; they are not records.
    while (offset < sourceLength) {
      const ch = sourceText.charCodeAt(offset);
      if (ch === 10) {
        offset++;
        lineNumber++;
        continue;
      }
      if (ch === 13 && sourceText.charCodeAt(offset + 1) === 10) {
        offset += 2;
        lineNumber++;
        continue;
      }
      break;
    }
    if (offset >= sourceLength) break;

    recordLineNumber = lineNumber;
    recordIndex = wantsHeader && headerFields === null ? null : outputRows.length;
    const fields = [];
    let sawQuotedField = false;
    let lastStop = FIELD_COMMA;

    while (lastStop === FIELD_COMMA) {
      if (offset >= sourceLength) {
        fields.push('');
        lastStop = FIELD_BREAK;
        break;
      }
      const ch = sourceText.charCodeAt(offset);

      if (ch === 34) { // '"' starts a quoted field
        sawQuotedField = true;
        const openingQuote = offset;
        const openingLine = lineNumber;
        offset++;
        // Advance over quotes: a doubled quote is escaped, the first single quote closes.
        let closingQuote = -1;
        let sawEscape = false;
        for (;;) {
          const q = findQuote(offset);
          if (q < 0) break;
          if (q + 1 < sourceLength && sourceText.charCodeAt(q + 1) === 34) {
            sawEscape = true;
            offset = q + 2;
            continue;
          }
          closingQuote = q;
          break;
        }

        if (closingQuote < 0) {
          // Unterminated: treat the opening quote literally and re-read unquoted after it.
          offset = openingQuote + 1;
          lineNumber = openingLine;
          addProblem('unterminated_quote');
          crCursor = openingQuote - 1;
          crExhausted = false; // force findCarriageReturn(offset) to rescan
          quoteCursor = openingQuote - 1;
          quoteExhausted = false;
          nlCursor = openingQuote - 1;
          nlExhausted = false;
          commaCursor = openingQuote - 1;
          commaExhausted = false;
          readField(offset, '"');
          fields.push(fieldText);
          lastStop = fieldStop;
          offset = fieldResume;
          continue;
        }

        const rawInner = sourceText.slice(openingQuote + 1, closingQuote);
        offset = closingQuote + 1;
        let content = rawInner;
        if (rawInner.indexOf('\r') >= 0 || rawInner.indexOf('\n') >= 0) {
          lineNumber += countLineBreaks(openingQuote + 1, closingQuote);
          content = sawEscape
            ? rawInner.replace(/\r\n?/g, '\n').replace(/""/g, '"')
            : rawInner.replace(/\r\n?/g, '\n');
        } else if (sawEscape) {
          content = rawInner.replace(/""/g, '"');
        }

        if (offset >= sourceLength) {
          fields.push(content);
          lastStop = FIELD_BREAK;
          break;
        }

        const nextCode = sourceText.charCodeAt(offset);
        if (nextCode === 44) { // ','
          offset++;
          fields.push(content);
          continue;
        }
        if (nextCode === 10) {
          offset++;
          lineNumber++;
          fields.push(content);
          lastStop = FIELD_BREAK;
          break;
        }
        if (nextCode === 13 && sourceText.charCodeAt(offset + 1) === 10) {
          offset += 2;
          lineNumber++;
          fields.push(content);
          lastStop = FIELD_BREAK;
          break;
        }

        // Characters after the closing quote are appended verbatim; stray_cr may fire.
        const junkStartLength = content.length;
        readField(offset, content);
        if (fieldText.length > junkStartLength) addProblem('quote_junk');
        fields.push(fieldText);
        lastStop = fieldStop;
        offset = fieldResume;
        continue;
      }

      readField(offset, '');
      fields.push(fieldText);
      lastStop = fieldStop;
      offset = fieldResume;
    }

    // A lone empty unquoted field means a blank line, which is not a record.
    if (fields.length === 1 && fields[0] === '' && !sawQuotedField) continue;

    if (rowWidth < 0) rowWidth = fields.length;
    if (wantsHeader && headerFields === null) {
      headerFields = fields;
      continue;
    }

    if (fields.length < rowWidth) {
      problemList.push({
        code: 'short_row',
        line: recordLineNumber,
        row: recordIndex,
        fields: fields.length,
      });
      for (let i = fields.length; i < rowWidth; i++) fields.push('');
    } else if (fields.length > rowWidth) {
      problemList.push({
        code: 'long_row',
        line: recordLineNumber,
        row: recordIndex,
        extra: fields.splice(rowWidth),
      });
    }

    outputRows.push(fields);
  }

  return {
    columns: wantsHeader ? (headerFields ?? []) : null,
    rows: outputRows,
    errors: problemList,
  };
}
