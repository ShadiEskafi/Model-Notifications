import { Radio, LogOut, Plus, ListChecks } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'

export default function Navbar({ onOpenDonorModal, onOpenLogsModal }) {
  const { user, signOut } = useAuth()

  // Generate initials from email
  const userInitials = user?.email
    ? user.email.slice(0, 2).toUpperCase()
    : 'مس'

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200 bg-white/95 backdrop-blur-md shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-18 items-center justify-between gap-4">
          
          {/* Brand & Workspace (RTL Start: Right) */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2.5">
              <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-blue-600 text-white shadow-sm shadow-blue-600/30">
                <Radio className="w-5 h-5 text-white" />
              </div>
              <span className="font-extrabold text-lg text-slate-900 tracking-tight">
                رادار مودل
              </span>
            </div>
            <div className="h-5 w-px bg-slate-200 hidden sm:block"></div>
            <span className="text-xs font-semibold text-slate-500 hidden sm:inline-block">
              لوحة الإدارة المركزية
            </span>
          </div>

          {/* Navigation Actions (RTL End: Left) */}
          <div className="flex items-center gap-3">
            
            {/* System Health Badge (Figma 28:646) */}
            <div className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>متصل / تشغيلي</span>
            </div>

            {/* Audit Logs Trigger */}
            <button
              type="button"
              onClick={onOpenLogsModal}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-bold text-slate-700 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors cursor-pointer shadow-2xs"
            >
              <ListChecks className="w-4 h-4 text-slate-500" />
              <span className="hidden sm:inline">سجلات التدقيق والتسليم</span>
              <span className="sm:hidden">السجلات</span>
            </button>

            {/* Onboard Donor Button */}
            <button
              type="button"
              onClick={onOpenDonorModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-sm shadow-blue-600/25 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة متبرع</span>
            </button>

            <div className="h-5 w-px bg-slate-200 hidden md:block"></div>

            {/* Admin Profile */}
            <div className="flex items-center gap-2.5">
              <div className="w-8.5 h-8.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center font-bold text-xs shadow-2xs">
                {userInitials}
              </div>
              <div className="hidden lg:flex flex-col text-right leading-tight">
                <span className="text-xs font-bold text-slate-800 truncate max-w-36">
                  {user?.email?.split('@')[0] || 'مسؤول النظام'}
                </span>
                <span className="text-[10px] font-semibold text-slate-400">
                  مشرف عام
                </span>
              </div>
              <button
                type="button"
                onClick={signOut}
                title="تسجيل الخروج"
                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl border border-slate-200 transition-colors cursor-pointer mr-1"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
