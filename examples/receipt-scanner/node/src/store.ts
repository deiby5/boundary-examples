import fs from "fs";
import path from "path";
import type { Receipt } from "./contract.js";

const DB_PATH = path.resolve("expenses.json");

export interface Expense extends Receipt {
  id: number;
  scannedAt: string;
  file: string;
}

function load(): Expense[] {
  if (!fs.existsSync(DB_PATH)) return [];
  return JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
}

function save(expenses: Expense[]): void {
  fs.writeFileSync(DB_PATH, JSON.stringify(expenses, null, 2));
}

export function addExpense(receipt: Receipt, file: string): Expense {
  const expenses = load();
  const expense: Expense = {
    ...receipt,
    id: expenses.length + 1,
    scannedAt: new Date().toISOString(),
    file,
  };
  console.log(`[Boundary] Saving expense #${expense.id}: ${expense.vendor} — ${expense.currency} ${expense.amount.toFixed(2)} (${expense.category})`);
  expenses.push(expense);
  save(expenses);
  console.log(`[Boundary] Expense #${expense.id} written to store (total: ${expenses.length} record(s))`);
  return expense;
}

export function listExpenses(): Expense[] {
  return load();
}
