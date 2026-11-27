import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { NAV_ITEMS } from "@/lib/nav";

/** หน้าของเมนูที่อยู่ในแผน — บอกว่าจะมีอะไรและอยู่เฟสไหน (ใช้ตอนเดโมกับคลินิก) */
export function ComingSoon({ href }: { href: string }) {
  const item = NAV_ITEMS.find((i) => i.href === href);
  if (!item?.soon) return null;
  const Icon = item.icon;
  return (
    <div className="mx-auto w-full max-w-2xl p-4 sm:p-8">
      <Card className="overflow-hidden">
        <div className="flex items-start gap-4 bg-navy-50 px-6 py-5">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-navy-700 text-white">
            <Icon className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-ink-900">{item.label}</h1>
              <Badge tone="navy">{item.soon.phase}</Badge>
            </div>
            <p className="mt-1 text-ink-600">{item.soon.summary}</p>
          </div>
        </div>
        <div className="px-6 py-5">
          <h2 className="mb-3 text-sm font-medium text-ink-500">สิ่งที่จะมีในหน้านี้</h2>
          <ul className="space-y-2.5">
            {item.soon.features.map((f) => (
              <li key={f} className="flex gap-2.5 text-ink-800">
                <Check className="mt-1 size-4 shrink-0 text-navy-500" />
                {f}
              </li>
            ))}
          </ul>
        </div>
      </Card>
      <p className="mt-4 text-center text-sm text-ink-500">หน้านี้อยู่ในแผนพัฒนา ยังไม่เปิดใช้ในเดโม</p>
    </div>
  );
}
