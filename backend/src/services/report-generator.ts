import { prisma } from '../db'

/* ────────────────────────────────────────────────────────
 *  Helpers
 * ──────────────────────────────────────────────────────── */

function fmtMoney(n: number): string {
  return n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(d: Date): string {
  return new Date(d).toLocaleDateString('ru-RU')
}

async function getCompanyName(): Promise<string> {
  const row = await prisma.setting.findUnique({ where: { key: 'company_name' } })
  return row?.value ?? 'LKHY'
}

interface CategoryBucket {
  name: string
  color: string
  amount: number
}

/* ────────────────────────────────────────────────────────
 *  PDF (HTML) Report
 * ──────────────────────────────────────────────────────── */

export async function generatePdfReport(dateFrom: Date, dateTo: Date): Promise<string> {
  const [transactions, companyName] = await Promise.all([
    prisma.buhTransaction.findMany({
      where: { date: { gte: dateFrom, lte: dateTo } },
      include: { category: true },
      orderBy: { date: 'desc' },
    }),
    getCompanyName(),
  ])

  // KPIs
  const income  = transactions.filter(t => t.type === 'INCOME').reduce((s, t) => s + Number(t.amount), 0)
  const expense = transactions.filter(t => t.type === 'EXPENSE').reduce((s, t) => s + Number(t.amount), 0)
  const profit  = income - expense

  // Category breakdown (expenses)
  const byCategory = new Map<string, CategoryBucket>()
  for (const t of transactions) {
    if (t.type !== 'EXPENSE') continue
    const key = t.categoryId ?? '__none__'
    const cur = byCategory.get(key) || {
      name:   t.category?.name  ?? 'Без категории',
      color:  t.category?.color ?? '#999999',
      amount: 0,
    }
    cur.amount += Number(t.amount)
    byCategory.set(key, cur)
  }

  const categoryRows = [...byCategory.values()].sort((a, b) => b.amount - a.amount)

  // Build HTML
  const transactionRows = transactions.map(t => `
    <tr>
      <td>${fmtDate(t.date)}</td>
      <td class="${t.type === 'INCOME' ? 'income' : 'expense'}">${t.type === 'INCOME' ? 'Доход' : 'Расход'}</td>
      <td class="money">${fmtMoney(Number(t.amount))}</td>
      <td>${t.category?.name ?? '—'}</td>
      <td>${t.description ?? '—'}</td>
    </tr>`).join('')

  const categoryTableRows = categoryRows.map(c => `
    <tr>
      <td><span class="color-dot" style="background:${c.color}"></span> ${c.name}</td>
      <td class="money">${fmtMoney(c.amount)}</td>
      <td class="money">${expense > 0 ? ((c.amount / expense) * 100).toFixed(1) : '0.0'}%</td>
    </tr>`).join('')

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>Финансовый отчёт — ${companyName}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; background: #fff; padding: 40px; font-size: 13px; }
  .header { border-bottom: 3px solid #3b82f6; padding-bottom: 16px; margin-bottom: 24px; }
  .header h1 { font-size: 22px; color: #1e40af; }
  .header .period { color: #64748b; margin-top: 4px; font-size: 14px; }
  .header .generated { color: #94a3b8; font-size: 11px; margin-top: 2px; }
  .kpi-grid { display: flex; gap: 16px; margin-bottom: 32px; }
  .kpi-card { flex: 1; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; }
  .kpi-card .label { color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: .5px; }
  .kpi-card .value { font-size: 24px; font-weight: 700; margin-top: 4px; }
  .kpi-card .value.income  { color: #16a34a; }
  .kpi-card .value.expense { color: #dc2626; }
  .kpi-card .value.profit  { color: ${profit >= 0 ? '#16a34a' : '#dc2626'}; }
  .kpi-card .count { font-size: 11px; color: #94a3b8; margin-top: 2px; }
  section { margin-bottom: 32px; }
  section h2 { font-size: 16px; color: #1e40af; margin-bottom: 12px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { background: #f1f5f9; text-align: left; padding: 8px 10px; font-weight: 600; color: #475569; }
  td { padding: 6px 10px; border-bottom: 1px solid #f1f5f9; }
  tr:hover td { background: #f8fafc; }
  .money { text-align: right; font-variant-numeric: tabular-nums; }
  .income  { color: #16a34a; font-weight: 600; }
  .expense { color: #dc2626; font-weight: 600; }
  .color-dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; vertical-align: middle; margin-right: 6px; }
  .footer { margin-top: 40px; text-align: center; color: #94a3b8; font-size: 11px; border-top: 1px solid #e2e8f0; padding-top: 12px; }
  @media print { body { padding: 20px; } .kpi-grid { page-break-inside: avoid; } }
</style>
</head>
<body>

<div class="header">
  <h1>${companyName} — Финансовый отчёт</h1>
  <div class="period">Период: ${fmtDate(dateFrom)} — ${fmtDate(dateTo)}</div>
  <div class="generated">Сформирован: ${fmtDate(new Date())}</div>
</div>

<div class="kpi-grid">
  <div class="kpi-card">
    <div class="label">Доходы</div>
    <div class="value income">${fmtMoney(income)} ₽</div>
    <div class="count">${transactions.filter(t => t.type === 'INCOME').length} операций</div>
  </div>
  <div class="kpi-card">
    <div class="label">Расходы</div>
    <div class="value expense">${fmtMoney(expense)} ₽</div>
    <div class="count">${transactions.filter(t => t.type === 'EXPENSE').length} операций</div>
  </div>
  <div class="kpi-card">
    <div class="label">Прибыль</div>
    <div class="value profit">${profit >= 0 ? '+' : ''}${fmtMoney(profit)} ₽</div>
    <div class="count">${transactions.length} операций всего</div>
  </div>
</div>

${categoryRows.length > 0 ? `
<section>
  <h2>Расходы по категориям</h2>
  <table>
    <thead><tr><th>Категория</th><th class="money">Сумма</th><th class="money">Доля</th></tr></thead>
    <tbody>${categoryTableRows}</tbody>
    <tfoot><tr><th>Итого</th><th class="money">${fmtMoney(expense)}</th><th class="money">100%</th></tr></tfoot>
  </table>
</section>
` : ''}

<section>
  <h2>Список операций (${transactions.length})</h2>
  <table>
    <thead><tr><th>Дата</th><th>Тип</th><th class="money">Сумма</th><th>Категория</th><th>Описание</th></tr></thead>
    <tbody>${transactionRows}</tbody>
  </table>
</section>

<div class="footer">${companyName} &bull; Автоматический отчёт</div>

</body>
</html>`
}

/* ────────────────────────────────────────────────────────
 *  Excel (CSV) Report
 * ──────────────────────────────────────────────────────── */

function csvEscape(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`
  }
  return val
}

export async function generateExcelReport(dateFrom: Date, dateTo: Date): Promise<string> {
  const transactions = await prisma.buhTransaction.findMany({
    where: { date: { gte: dateFrom, lte: dateTo } },
    include: { category: true },
    orderBy: { date: 'desc' },
  })

  const header = 'Date,Type,Amount,Category,Description'
  const rows = transactions.map(t => [
    fmtDate(t.date),
    t.type === 'INCOME' ? 'Доход' : 'Расход',
    Number(t.amount).toFixed(2),
    csvEscape(t.category?.name ?? ''),
    csvEscape(t.description ?? ''),
  ].join(','))

  // BOM for Excel to correctly detect UTF-8
  return '\uFEFF' + [header, ...rows].join('\r\n')
}

/* ────────────────────────────────────────────────────────
 *  Period Comparison
 * ──────────────────────────────────────────────────────── */

interface PeriodRange { from: Date; to: Date }

interface PeriodStats {
  income: number
  expense: number
  profit: number
  count: number
  byCategory: CategoryBucket[]
}

async function computePeriodStats(from: Date, to: Date): Promise<PeriodStats> {
  const transactions = await prisma.buhTransaction.findMany({
    where: { date: { gte: from, lte: to } },
    include: { category: true },
  })

  const income  = transactions.filter(t => t.type === 'INCOME').reduce((s, t) => s + Number(t.amount), 0)
  const expense = transactions.filter(t => t.type === 'EXPENSE').reduce((s, t) => s + Number(t.amount), 0)

  const catMap = new Map<string, CategoryBucket>()
  for (const t of transactions) {
    if (t.type !== 'EXPENSE') continue
    const key = t.categoryId ?? '__none__'
    const cur = catMap.get(key) || {
      name:   t.category?.name  ?? 'Без категории',
      color:  t.category?.color ?? '#999999',
      amount: 0,
    }
    cur.amount += Number(t.amount)
    catMap.set(key, cur)
  }

  return {
    income,
    expense,
    profit: income - expense,
    count: transactions.length,
    byCategory: [...catMap.values()].sort((a, b) => b.amount - a.amount),
  }
}

export async function generateComparisonData(
  periodA: PeriodRange,
  periodB: PeriodRange,
) {
  const [a, b] = await Promise.all([
    computePeriodStats(periodA.from, periodA.to),
    computePeriodStats(periodB.from, periodB.to),
  ])

  const pctDelta = (cur: number, prev: number) =>
    prev !== 0 ? Math.round(((cur - prev) / Math.abs(prev)) * 10000) / 100 : null

  return {
    periodA: a,
    periodB: b,
    deltas: {
      income:       a.income  - b.income,
      expense:      a.expense - b.expense,
      profit:       a.profit  - b.profit,
      count:        a.count   - b.count,
      incomePct:    pctDelta(a.income,  b.income),
      expensePct:   pctDelta(a.expense, b.expense),
      profitPct:    pctDelta(a.profit,  b.profit),
    },
  }
}
