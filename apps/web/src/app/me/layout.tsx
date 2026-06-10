import { NotificationBell } from "@/components/notification-bell";

export default function MeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <div className="border-b border-[color:var(--rule)] bg-[color:var(--cream)]">
        <div className="max-w-[1400px] mx-auto px-6 py-3 flex items-center justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-[color:var(--vermilion)]">
              § Author Studio
            </p>
            <h2 className="font-display italic text-[22px] leading-none mt-0.5">
              我的 · <span className="not-italic">Workspace</span>
            </h2>
          </div>
          <NotificationBell />
        </div>
      </div>
      <main className="max-w-[1400px] mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
