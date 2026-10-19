import { describe, expect, it } from 'vitest';
import { buildStatement, extract, STATEMENTS, type Facts } from './xbrl';

const f = (frame: string, val: number) => ({ end: '', val, fy: 0, fp: '', form: '10-K', filed: '2024-02-01', frame });
const facts: Facts = {
  'us-gaap': {
    Revenues: { label: '', units: { USD: [f('CY2021', 90), f('CY2022', 100)] } },
    RevenueFromContractWithCustomerExcludingAssessedTax: { label: '', units: { USD: [f('CY2023', 120), f('CY2023Q1', 30), f('CY2022', 101)] } },
    NetCashProvidedByUsedInOperatingActivities: { label: '', units: { USD: [f('CY2023', 50)] } },
    PaymentsToAcquirePropertyPlantAndEquipment: { label: '', units: { USD: [f('CY2023', 20)] } },
    Assets: { label: '', units: { USD: [f('CY2023Q4I', 500), f('CY2023Q2I', 450)] } },
  },
};

describe('xbrl', () => {
  it('prefers the first tag and falls back across tags by period', () => {
    const rev = extract(facts, STATEMENTS.income[0]!, 'annual');
    expect(rev.get('2023')?.val).toBe(120);
    expect(rev.get('2022')?.val).toBe(101);
    expect(rev.get('2021')?.val).toBe(90);
  });
  it('separates annual, quarterly and instant frames', () => {
    expect(extract(facts, STATEMENTS.income[0]!, 'quarterly').get('2023Q1')?.val).toBe(30);
    expect(extract(facts, STATEMENTS.balance[2]!, 'annual').get('2023')?.val).toBe(500);
    expect(extract(facts, STATEMENTS.balance[2]!, 'quarterly').get('2023Q2')?.val).toBe(450);
  });
  it('computes free cash flow', () => {
    const cf = buildStatement(facts, 'cashflow', 'annual');
    const fcf = cf.rows.find((r) => r.label === 'Free cash flow')!;
    expect(fcf.values[cf.periods.indexOf('2023')]).toBe(30);
  });
});
