"use client";

import {
  Ban,
  Banknote,
  CreditCard,
  Landmark,
  Plus,
  Printer,
  Save,
  Trash2,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api";
import { useClinicRefs } from "@/lib/clinic";
import { cn } from "@/lib/cn";
import { thaiDate } from "@/lib/format";
import { baht } from "@/lib/money";
import { useRole } from "@/lib/session";
import {
  INVOICE_STATUS,
  PAYMENT_METHOD,
  type Invoice,
  type InvoiceItem,
  type Payment,
  type ProcedureItem,
} from "@/lib/types";
import { MoneyInput, ProcedurePicker, TeethInput } from "./inputs";

const lineTotal = (i: InvoiceItem) => i.qty * i.unitPrice - i.discount;

/** บิล 1 ใบ: แก้รายการ (ร่าง) + รับชำระเงินสด/โอน · ใบที่ชำระแล้วแสดงแบบอ่านอย่างเดียว */
export function InvoiceEditor({
  id,
  onPaid,
  onReplaced,
}: {
  id: string;
  onPaid: (inv: Invoice) => void;
  onReplaced: (newId: string) => void;
}) {
  const role = useRole();
  const { dentists } = useClinicRefs();
  const [inv, setInv] = useState<Invoice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [procedures, setProcedures] = useState<ProcedureItem[]>([]);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [dirty, setDirty] = useState(false);
  const [cash, setCash] = useState({ amount: 0, received: 0 });
  const [transfer, setTransfer] = useState({ amount: 0, ref: "" });
  const [card, setCard] = useState({ amount: 0, ref: "" });
  const [fromDeposit, setFromDeposit] = useState(0);
  const [depositBal, setDepositBal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [voiding, setVoiding] = useState(false);

  useEffect(() => {
    api<Invoice>(`/api/invoices/${id}`)
      .then((x) => {
        setInv(x);
        setItems(x.items);
        // มัดจำคงเหลือของคนไข้ (ใช้จ่ายบิลนี้ได้ ยกเว้นบิลรับมัดจำเอง)
        if (x.status === "draft" && x.kind !== "deposit")
          api<{ depositBalance: number }>(`/api/patients/${x.patientId}/finance`).then((f) => setDepositBal(f.depositBalance));
      })
      .catch((e: ApiError) => setError(e.message));
    api<ProcedureItem[]>("/api/procedures").then(setProcedures);
  }, [id]);

  if (error) return <Alert>{error}</Alert>;
  if (!inv) {
    return (
      <div className="grid gap-3">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const draft = inv.status === "draft";
  const total = items.reduce((s, i) => s + lineTotal(i), 0);
  const discount = items.reduce((s, i) => s + i.discount, 0);
  const paid = cash.amount + transfer.amount + card.amount + fromDeposit;
  const depositOver = fromDeposit > depositBal;
  const remaining = total - paid;
  const change = Math.max(0, cash.received - cash.amount);
  const cashShort =
    cash.amount > 0 && cash.received > 0 && cash.received < cash.amount;
  const badLine = items.find(
    (i) => !i.name.trim() || i.discount > i.qty * i.unitPrice,
  );

  function edit(idx: number, patch: Partial<InvoiceItem>) {
    setItems((list) =>
      list.map((x, i) => (i === idx ? { ...x, ...patch } : x)),
    );
    setDirty(true);
    setFormError(null);
  }
  function add(p?: ProcedureItem) {
    setItems((list) => [
      ...list,
      {
        id: crypto.randomUUID(),
        procedureId: p?.id,
        name: p?.name ?? "",
        teeth: [],
        qty: 1,
        unitPrice: p?.price ?? 0,
        discount: 0,
        dentistId: list.at(-1)?.dentistId ?? inv?.items[0]?.dentistId,
      },
    ]);
    setDirty(true);
  }
  const strip = (list: InvoiceItem[]) =>
    list.map(({ dentistName: _, ...rest }) => rest); // eslint-disable-line @typescript-eslint/no-unused-vars

  async function saveDraft() {
    setBusy(true);
    try {
      const x = await api<Invoice>(`/api/invoices/${id}`, {
        method: "PUT",
        body: JSON.stringify({ items: strip(items) }),
      });
      setInv(x);
      setItems(x.items);
      setDirty(false);
      toast("บันทึกรายการแล้ว");
    } catch (e) {
      setFormError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  async function pay() {
    const payments: Payment[] = [];
    if (cash.amount > 0)
      payments.push({
        method: "cash",
        amount: cash.amount,
        received: cash.received || cash.amount,
      });
    if (transfer.amount > 0)
      payments.push({
        method: "transfer",
        amount: transfer.amount,
        ref: transfer.ref.trim() || undefined,
      });
    if (card.amount > 0) payments.push({ method: "card", amount: card.amount, ref: card.ref.trim() || undefined });
    if (fromDeposit > 0) payments.push({ method: "deposit", amount: fromDeposit });
    setBusy(true);
    setFormError(null);
    try {
      const x = await api<Invoice>(`/api/invoices/${id}/pay`, {
        method: "POST",
        body: JSON.stringify({ items: strip(items), payments }),
      });
      toast(`รับชำระแล้ว · ใบเสร็จ ${x.receiptNo}`);
      onPaid(x);
    } catch (e) {
      setFormError((e as ApiError).message);
      setBusy(false);
    }
  }

  /** เติมยอดที่เหลือ (ไม่นับช่องทางที่กำลังเติม) */
  const fill = (method: "cash" | "transfer" | "card" | "deposit") => {
    const others = { cash: cash.amount, transfer: transfer.amount, card: card.amount, deposit: fromDeposit };
    const rest = Math.max(0, total - (paid - others[method]));
    if (method === "cash") setCash({ amount: rest, received: 0 });
    else if (method === "transfer") setTransfer((t) => ({ ...t, amount: rest }));
    else if (method === "card") setCard((c) => ({ ...c, amount: rest }));
    else setFromDeposit(Math.min(rest, depositBal));
  };

  const allergies = inv.patient?.allergies ?? [];

  return (
    <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_340px] 2xl:items-start">
      <div className="grid min-w-0 gap-4">
        {/* หัวบิล */}
        <Card className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Link
                href={`/patients/${inv.patientId}?tab=billing`}
                className="truncate font-semibold text-ink-900 hover:underline"
              >
                {inv.patient?.fullName}
              </Link>
              <Badge tone={INVOICE_STATUS[inv.status].tone}>
                {INVOICE_STATUS[inv.status].label}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-x-3 text-sm text-ink-500">
              <span className="font-mono">{inv.patient?.hn}</span>
              {inv.queueNo && (
                <span>
                  คิว <span className="font-mono">{inv.queueNo}</span>
                </span>
              )}
              <span>{thaiDate(inv.visitDate)}</span>
              {inv.dentistName && <span>{inv.dentistName}</span>}
            </div>
          </div>
          {allergies.length > 0 && (
            <Badge tone="danger-solid">
              <TriangleAlert className="size-3" />
              แพ้ยา: {allergies.join(", ")}
            </Badge>
          )}
          <span className="flex-1" />
          {inv.receiptNo && (
            <span className="text-sm text-ink-500">
              ใบเสร็จ{" "}
              <span className="font-mono text-ink-900">{inv.receiptNo}</span>
            </span>
          )}
        </Card>

        {inv.status === "void" && (
          <Alert tone="warning">
            ยกเลิกโดย {inv.voidedByName} เมื่อ{" "}
            {thaiDate(inv.voidedAt!, {
              dateStyle: "medium",
              timeStyle: "short",
            })}{" "}
            · เหตุผล: {inv.voidReason}
          </Alert>
        )}
        {inv.replaces && draft && (
          <Alert tone="info">
            บิลนี้ออกแทนใบเสร็จที่ถูกยกเลิก ตรวจรายการแล้วรับชำระใหม่
          </Alert>
        )}

        {/* รายการ */}
        <div className="overflow-x-auto rounded-xl border border-ink-200 bg-white">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-navy-50 text-left text-xs text-ink-500">
              <tr>
                <th className="w-20 px-3 py-2.5 font-medium">ซี่</th>
                <th className="px-3 py-2.5 font-medium">รายการ</th>
                <th className="w-36 px-3 py-2.5 font-medium">ทันตแพทย์</th>
                <th className="w-16 px-3 py-2.5 text-right font-medium">
                  จำนวน
                </th>
                <th className="w-24 px-3 py-2.5 text-right font-medium">
                  ราคา/หน่วย
                </th>
                <th className="w-24 px-3 py-2.5 text-right font-medium">
                  ส่วนลด
                </th>
                <th className="w-24 px-3 py-2.5 text-right font-medium">สุทธิ</th>
                {draft && <th className="w-10" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {items.map((it, idx) =>
                draft ? (
                  <tr key={it.id} className="align-top">
                    <td className="px-2 py-2">
                      <TeethInput
                        aria-label={`ซี่ รายการที่ ${idx + 1}`}
                        value={it.teeth}
                        onValue={(teeth) => edit(idx, { teeth })}
                        className="h-9"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <Input
                        aria-label={`ชื่อรายการที่ ${idx + 1}`}
                        value={it.name}
                        aria-invalid={!it.name.trim() || undefined}
                        placeholder="ชื่อรายการ"
                        onChange={(e) => edit(idx, { name: e.target.value })}
                        className="h-9"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <Select
                        aria-label="ทันตแพทย์"
                        value={it.dentistId ?? ""}
                        onChange={(e) =>
                          edit(idx, { dentistId: e.target.value || undefined })
                        }
                        className="h-9"
                      >
                        <option value="">—</option>
                        {dentists.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="px-2 py-2">
                      <Input
                        aria-label="จำนวน"
                        type="number"
                        min={1}
                        max={99}
                        value={it.qty}
                        onChange={(e) =>
                          edit(idx, {
                            qty: Math.min(
                              99,
                              Math.max(
                                1,
                                Math.floor(Number(e.target.value) || 1),
                              ),
                            ),
                          })
                        }
                        className="h-9 text-right font-mono"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <MoneyInput
                        aria-label="ราคาต่อหน่วย"
                        value={it.unitPrice}
                        onValue={(unitPrice) => edit(idx, { unitPrice })}
                        className="h-9"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <MoneyInput
                        aria-label="ส่วนลด"
                        value={it.discount}
                        blankZero
                        placeholder="0.00"
                        aria-invalid={
                          it.discount > it.qty * it.unitPrice || undefined
                        }
                        onValue={(d) => edit(idx, { discount: d })}
                        className="h-9"
                      />
                    </td>
                    <td className="px-3 py-3.5 text-right font-mono">
                      {baht(lineTotal(it))}
                    </td>
                    <td className="px-1 py-2">
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="ลบรายการ"
                        className="size-9 text-ink-500 hover:text-danger"
                        onClick={() => {
                          setItems((l) => l.filter((_, i) => i !== idx));
                          setDirty(true);
                        }}
                      >
                        <Trash2 />
                      </Button>
                    </td>
                  </tr>
                ) : (
                  <tr key={it.id}>
                    <td className="px-3 py-2.5 font-mono text-navy-700">
                      {it.teeth.join(", ") || "—"}
                    </td>
                    <td className="px-3 py-2.5">{it.name}</td>
                    <td className="px-3 py-2.5 text-ink-600">
                      {it.dentistName ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono">
                      {it.qty}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono">
                      {baht(it.unitPrice)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono">
                      {it.discount ? baht(it.discount) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono">
                      {baht(lineTotal(it))}
                    </td>
                  </tr>
                ),
              )}
              {items.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-8 text-center text-ink-500"
                  >
                    ยังไม่มีรายการ — ไม่พบหัตถการที่ทำเสร็จในผังฟันของ visit นี้
                    เพิ่มจากรายการด้านล่าง
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot className="border-t border-ink-200 bg-navy-50/50 text-sm">
              <tr>
                <td colSpan={5} className="px-3 py-2.5 text-ink-500">
                  รวม <span className="font-mono">{items.length}</span> รายการ
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-ink-500">
                  {discount ? `−${baht(discount)}` : ""}
                </td>
                <td className="px-3 py-2.5 text-right font-mono font-semibold text-ink-900">
                  {baht(total)}
                </td>
                {draft && <td />}
              </tr>
            </tfoot>
          </table>
        </div>

        {draft && (
          <div className="flex flex-wrap items-center gap-2">
            <ProcedurePicker procedures={procedures} onPick={add} />
            <Button variant="secondary" onClick={() => add()}>
              <Plus />
              รายการอื่น
            </Button>
            {dirty && (
              <Button
                variant="ghost"
                disabled={busy || !!badLine}
                onClick={saveDraft}
              >
                <Save />
                บันทึกร่าง
              </Button>
            )}
          </div>
        )}
      </div>

      {/* ชำระเงิน */}
      <Card className="grid gap-3 p-4 2xl:sticky 2xl:top-4">
        <div className="flex items-baseline justify-between border-b border-ink-100 pb-3">
          <span className="font-semibold text-ink-900">ยอดชำระ</span>
          <span className="font-mono text-2xl font-medium text-navy-900">
            ฿{baht(draft ? total : inv.total)}
          </span>
        </div>

        {draft ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-1">
              <div
                className={cn(
                  "grid content-start gap-2 rounded-lg border p-3",
                  cash.amount
                    ? "border-navy-300 bg-navy-50/60"
                    : "border-ink-200",
                )}
              >
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Banknote className="size-4 text-navy-600" />
                  เงินสด
                  <button
                    className="ml-auto text-xs text-teal-700 hover:underline"
                    onClick={() => fill("cash")}
                  >
                    เต็มจำนวนที่เหลือ
                  </button>
                </div>
                <MoneyInput
                  aria-label="ชำระด้วยเงินสด"
                  value={cash.amount}
                  blankZero
                  placeholder="0.00"
                  onValue={(amount) => setCash((c) => ({ ...c, amount }))}
                />
                {cash.amount > 0 && (
                  <div className="grid grid-cols-2 items-center gap-2 text-sm">
                    <label htmlFor="cash-received" className="text-ink-600">
                      รับเงินมา
                    </label>
                    <MoneyInput
                      id="cash-received"
                      value={cash.received}
                      blankZero
                      placeholder={baht(cash.amount)}
                      aria-invalid={cashShort || undefined}
                      onValue={(received) =>
                        setCash((c) => ({ ...c, received }))
                      }
                    />
                    <span className="text-ink-600">เงินทอน</span>
                    <span
                      className={cn(
                        "text-right font-mono text-lg",
                        change ? "text-success" : "text-ink-400",
                      )}
                    >
                      {baht(change)}
                    </span>
                  </div>
                )}
              </div>

              <div
                className={cn(
                  "grid content-start gap-2 rounded-lg border p-3",
                  transfer.amount
                    ? "border-navy-300 bg-navy-50/60"
                    : "border-ink-200",
                )}
              >
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Landmark className="size-4 text-navy-600" />
                  โอน / PromptPay
                  <button
                    className="ml-auto text-xs text-teal-700 hover:underline"
                    onClick={() => fill("transfer")}
                  >
                    เต็มจำนวนที่เหลือ
                  </button>
                </div>
                <MoneyInput
                  aria-label="ชำระด้วยการโอน"
                  value={transfer.amount}
                  blankZero
                  placeholder="0.00"
                  onValue={(amount) => setTransfer((t) => ({ ...t, amount }))}
                />
                {transfer.amount > 0 && (
                  <Input
                    aria-label="เลขอ้างอิงการโอน"
                    placeholder="เลขอ้างอิง / 4 หลักท้ายบัญชี (ถ้ามี)"
                    value={transfer.ref}
                    maxLength={50}
                    onChange={(e) =>
                      setTransfer((t) => ({ ...t, ref: e.target.value }))
                    }
                  />
                )}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-1">
              <div className={cn("grid content-start gap-2 rounded-lg border p-3", card.amount ? "border-navy-300 bg-navy-50/60" : "border-ink-200")}>
                <div className="flex items-center gap-2 text-sm font-medium">
                  <CreditCard className="size-4 text-navy-600" />
                  บัตรเครดิต/เดบิต
                  <button className="ml-auto text-xs text-teal-700 hover:underline" onClick={() => fill("card")}>
                    เต็มจำนวนที่เหลือ
                  </button>
                </div>
                <MoneyInput aria-label="ชำระด้วยบัตร" value={card.amount} blankZero placeholder="0.00" onValue={(amount) => setCard((c) => ({ ...c, amount }))} />
                {card.amount > 0 && (
                  <Input
                    aria-label="4 หลักท้ายบัตร"
                    placeholder="4 หลักท้ายบัตร / เลขอนุมัติ (ถ้ามี)"
                    value={card.ref}
                    maxLength={20}
                    onChange={(e) => setCard((c) => ({ ...c, ref: e.target.value }))}
                  />
                )}
              </div>
              {inv.kind !== "deposit" && (
                <div
                  className={cn(
                    "grid content-start gap-2 rounded-lg border p-3",
                    fromDeposit ? "border-navy-300 bg-navy-50/60" : "border-ink-200",
                    depositBal === 0 && "opacity-60",
                  )}
                >
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Wallet className="size-4 text-navy-600" />
                    ตัดมัดจำ
                    <span className="text-xs font-normal text-ink-500">
                      คงเหลือ <span className="font-mono">{baht(depositBal)}</span>
                    </span>
                    {depositBal > 0 && (
                      <button className="ml-auto text-xs text-teal-700 hover:underline" onClick={() => fill("deposit")}>
                        ใช้มัดจำ
                      </button>
                    )}
                  </div>
                  {depositBal > 0 && (
                    <MoneyInput
                      aria-label="ตัดจากมัดจำ"
                      value={fromDeposit}
                      blankZero
                      placeholder="0.00"
                      aria-invalid={depositOver || undefined}
                      onValue={setFromDeposit}
                    />
                  )}
                </div>
              )}
            </div>

            <div
              className={cn(
                "flex items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold",
                remaining === 0
                  ? "bg-success-soft text-success"
                  : "bg-warning-soft text-warning",
              )}
              role="status"
            >
              {remaining >= 0 ? "คงเหลือ" : "เกินยอด"}
              <span className="font-mono">{baht(Math.abs(remaining))}</span>
            </div>

            {formError && <Alert>{formError}</Alert>}
            {badLine && (
              <p className="text-sm text-danger">
                ตรวจรายการ: ชื่อรายการว่าง หรือส่วนลดมากกว่าราคา
              </p>
            )}
            <Button
              size="lg"
              disabled={
                busy ||
                !items.length ||
                remaining !== 0 ||
                paid === 0 ||
                depositOver ||
                cashShort ||
                !!badLine
              }
              onClick={pay}
            >
              ยืนยันรับชำระและออกใบเสร็จ
            </Button>
          </>
        ) : (
          <>
            <ul className="grid gap-1.5 text-sm">
              {inv.payments.map((p, i) => (
                <li key={i} className="flex justify-between gap-2">
                  <span>
                    {PAYMENT_METHOD[p.method]}
                    {p.ref && <span className="text-ink-500"> · {p.ref}</span>}
                  </span>
                  <span className="font-mono">{baht(p.amount)}</span>
                </li>
              ))}
            </ul>
            <p className="text-sm text-ink-500">
              รับชำระโดย {inv.paidByName} ·{" "}
              {inv.paidAt &&
                thaiDate(inv.paidAt, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
            </p>
            <Link
              href={`/billing/receipt/${inv.id}`}
              className={buttonClass("secondary")}
            >
              <Printer />
              {inv.status === "void" ? "ดูใบเสร็จ (ยกเลิกแล้ว)" : "ดู / พิมพ์ใบเสร็จ"}
            </Link>
            {role === "owner" && inv.status === "paid" && !inv.closed && (
              <Button
                variant="ghost"
                className="text-danger hover:bg-danger-soft"
                onClick={() => setVoiding(true)}
              >
                <Ban />
                ยกเลิกใบเสร็จ
              </Button>
            )}
            {inv.status === "paid" && inv.closed && (
              <p className="text-xs text-ink-500">
                ปิดยอดรอบนี้แล้ว ยกเลิกใบเสร็จไม่ได้
              </p>
            )}
          </>
        )}
      </Card>

      <Dialog open={voiding} onOpenChange={setVoiding}>
        {voiding && (
          <VoidDialog
            inv={inv}
            onDone={(newId) => {
              setVoiding(false);
              onReplaced(newId);
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

function VoidDialog({
  inv,
  onDone,
}: {
  inv: Invoice;
  onDone: (replacementId: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <DialogContent
      title={`ยกเลิกใบเสร็จ ${inv.receiptNo}`}
      description="ใบเสร็จจะถูกประทับ “ยกเลิก” (ไม่ลบทิ้ง) และระบบเปิดบิลร่างใบใหม่ให้ออกแทน"
    >
      <form
        className="grid gap-4 p-5"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const r = await api<{ replacement: Invoice }>(
              `/api/invoices/${inv.id}/void`,
              { method: "POST", body: JSON.stringify({ reason }) },
            );
            toast(`ยกเลิก ${inv.receiptNo} แล้ว — เปิดบิลใหม่ให้แทน`);
            onDone(r.replacement.id);
          } catch (err) {
            setError((err as ApiError).message);
            setBusy(false);
          }
        }}
      >
        <Field label="เหตุผล" error={error}>
          {(p) => (
            <Textarea
              {...p}
              required
              minLength={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="เช่น คิดราคาผิด, คนไข้ขอเปลี่ยนช่องทางชำระ"
            />
          )}
        </Field>
        <div className="flex justify-end gap-2">
          <Button
            type="submit"
            variant="danger"
            disabled={busy || reason.trim().length < 3}
          >
            ยืนยันยกเลิกใบเสร็จ
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}
