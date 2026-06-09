import { NotificationBell } from "@/components/notification-bell";

export default function MeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <header className="sticky top-0 z-50 flex items-center justify-between border-b bg-white dark:bg-zinc-950 px-6 py-3">
        <h1 className="text-lg font-semibold">我的</h1>
        <NotificationBell />
      </header>
      <main>{children}</main>
    </div>
  );
}
