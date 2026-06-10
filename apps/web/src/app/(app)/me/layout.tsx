export default function MeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <div className="border-b border-border bg-card/30">
        <div className="max-w-[1200px] mx-auto px-5 py-3">
          <h2 className="text-[16px] font-medium text-foreground">我的工作台</h2>
        </div>
      </div>
      <main className="max-w-[1200px] mx-auto px-5 py-5">{children}</main>
    </div>
  );
}
