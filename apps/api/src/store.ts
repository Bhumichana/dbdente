import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import type { AuditEntry, Db } from "./domain.js";

const dbFile = path.join(config.dataDir, "db.json");
const auditFile = path.join(config.dataDir, "audit.log");

const empty: Db = { clinics: [], users: [], patients: [], charts: {}, imageLinks: {} };

let db: Db = load();

function load(): Db {
  if (!fs.existsSync(dbFile)) return structuredClone(empty);
  return { ...structuredClone(empty), ...JSON.parse(fs.readFileSync(dbFile, "utf8")) };
}

export function getDb(): Db {
  return db;
}

export function replaceDb(next: Db) {
  db = next;
  save();
}

export function save() {
  fs.mkdirSync(config.dataDir, { recursive: true });
  const tmp = dbFile + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, dbFile);
}

export function audit(entry: Omit<AuditEntry, "at">) {
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.appendFileSync(auditFile, JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n");
}

export function readAudit(clinicId: string, limit = 200): AuditEntry[] {
  if (!fs.existsSync(auditFile)) return [];
  return fs
    .readFileSync(auditFile, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as AuditEntry)
    .filter((e) => e.clinicId === clinicId)
    .slice(-limit)
    .reverse();
}
