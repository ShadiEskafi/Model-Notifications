export default function Layout({ children }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col antialiased">
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {children}
      </main>
      <footer className="border-t border-slate-200/80 bg-white/50 py-6 text-center text-xs text-slate-500 font-medium">
        رادار مودل — جسر التنبيهات الذكي والمستقل للمنظومة الجامعية &copy; {new Date().getFullYear()}
      </footer>
    </div>
  )
}
