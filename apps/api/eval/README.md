# Receipt evaluation set

Photos of real receipts and the result we expect for each, used by
`pnpm --filter @bill-splitter/api eval:receipts` to measure reading accuracy
after changing the prompt or the models.

For every photo `casa-lola.jpg`, add `casa-lola.json`:

```json
{
  "lines": [
    { "name": "Caña", "quantity": 2, "total": 480 },
    { "name": "Pulpo a la gallega", "quantity": 1, "total": 1850 }
  ],
  "total": 2330
}
```

Amounts are in cents. Photos stay out of git (`receipts/` is ignored) because
receipts can contain personal data; share the set privately.
