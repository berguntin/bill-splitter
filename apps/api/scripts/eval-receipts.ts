/**
 * Measures how well the receipt parser reads real receipts.
 *
 * Put photos in `eval/receipts/` next to a `<photo name>.json` file with the
 * expected result (`{ "lines": [{ "name", "quantity", "total" }], "total" }`,
 * amounts in cents), then run `pnpm eval:receipts` with ANTHROPIC_API_KEY set.
 * Each run calls the Claude API once or twice per photo.
 */
import Anthropic from '@anthropic-ai/sdk';
import { readdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClaudeExtractor } from '../src/receipts/claude';
import { createReceiptParser, type ImageMediaType } from '../src/receipts/parser';

interface Expected {
  lines: { name: string; quantity: number; total: number }[];
  total: number;
}

const MEDIA_TYPES: Record<string, ImageMediaType> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

const directory = fileURLToPath(new URL('../eval/receipts/', import.meta.url));

/** Share of expected line totals found among the scanned ones (as a multiset). */
function lineRecall(expected: number[], actual: number[]): number {
  if (expected.length === 0) return 1;
  const remaining = [...actual];
  let found = 0;
  for (const amount of expected) {
    const index = remaining.indexOf(amount);
    if (index !== -1) {
      found += 1;
      remaining.splice(index, 1);
    }
  }
  return found / expected.length;
}

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('Set ANTHROPIC_API_KEY to run the eval.');
  const parser = createReceiptParser(createClaudeExtractor(new Anthropic()));

  const files = (await readdir(directory)).filter(
    (file) => extname(file).toLowerCase() in MEDIA_TYPES,
  );
  if (files.length === 0) {
    console.log(`No photos found in ${directory}`);
    return;
  }

  const rows = [];
  for (const file of files.sort()) {
    const expected = JSON.parse(
      await readFile(join(directory, file.replace(/\.[^.]+$/, '.json')), 'utf8'),
    ) as Expected;
    const started = performance.now();
    const outcome = await parser.parse({
      data: await readFile(join(directory, file)),
      mediaType: MEDIA_TYPES[extname(file).toLowerCase()]!,
    });
    const seconds = (performance.now() - started) / 1000;

    if (outcome.status !== 'ok') {
      rows.push({ file, status: outcome.status, totalOk: false, recall: 0, seconds });
      continue;
    }
    rows.push({
      file,
      status: outcome.model,
      totalOk: outcome.receipt.total === expected.total,
      addsUp: !outcome.issues.some((issue) => issue.type === 'total_mismatch'),
      recall: lineRecall(
        expected.lines.map((line) => line.total),
        outcome.receipt.lines.map((line) => line.total),
      ),
      flagged: outcome.receipt.lines.filter((line) => line.confidence === 'low').length,
      seconds,
    });
  }

  console.table(
    rows.map((row) => ({
      ...row,
      recall: `${Math.round(row.recall * 100)}%`,
      seconds: row.seconds.toFixed(1),
    })),
  );
  const ok = rows.filter((row) => row.totalOk).length;
  const recall = rows.reduce((sum, row) => sum + row.recall, 0) / rows.length;
  const escalated = rows.filter((row) => row.status === 'claude-sonnet-5-5').length;
  console.log(
    `Total read correctly: ${ok}/${rows.length} · mean line recall ${Math.round(recall * 100)}% · ` +
      `escalated to Sonnet: ${escalated}/${rows.length}`,
  );
}

await main();
