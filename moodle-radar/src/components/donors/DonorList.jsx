import { ShieldCheck, AlertCircle, Plus, KeyRound, Clock, AlertTriangle } from 'lucide-react'

export default function DonorList({ donors = [], courses = [], loading = false, onOpenDonorModal }) {
  return (
    <div className="space-y-4">
      {/* Section Heading */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <h2 className="text-base font-extrabold text-slate-900 tracking-tight">
            إدارة توكنات المتبرعين
          </h2>
          <span className="px-2.5 py-0.5 text-xs font-bold bg-slate-100 border border-slate-200 text-slate-700 rounded-md">
            {donors.length}
          </span>
        </div>
        <p className="text-xs text-slate-500 font-medium">
          يتم التحقق الدوري كل 10 دقائق · التوكنات مشفرة بالكامل بواسطة AES-256-GCM
        </p>
      </div>

      {/* Donors Grid (Figma 28:703) */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between h-48 animate-pulse shadow-xs"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="h-4 bg-slate-200 rounded w-28"></div>
                  <div className="h-4 bg-slate-200 rounded w-14"></div>
                </div>
                <div className="h-5 bg-slate-200 rounded w-36 mb-2"></div>
                <div className="h-3 bg-slate-200 rounded w-24 mb-4"></div>
                <div className="h-3 bg-slate-200 rounded w-32"></div>
              </div>
              <div className="h-8 bg-slate-100 rounded-lg w-full"></div>
            </div>
          ))}
        </div>
      ) : donors.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {donors.map((donor) => {
            const isActive = donor.status === 'active'
            const isRevoked = donor.status === 'revoked'
            const isExpired = donor.status === 'expired'

            const primaryCount = courses?.filter((c) => c.donor_token_id === donor.id).length || 0
            const fallbackCount = courses?.filter((c) => c.fallback_token_id === donor.id).length || 0

            return (
              <div
                key={donor.id}
                className="bg-white border border-slate-200/90 rounded-2xl p-5 flex flex-col justify-between hover:border-slate-300 hover:shadow-md transition-all shadow-xs"
              >
                <div>
                  {/* Cohort & Status */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <span className="font-bold text-xs text-slate-800 line-clamp-1" title={donor.label}>
                      {donor.label}
                    </span>
                    <span
                      className={`px-2.5 py-0.5 text-[10px] font-bold rounded-md border shrink-0 ${
                        isActive
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                          : isRevoked
                          ? 'bg-rose-50 border-rose-200 text-rose-700'
                          : isExpired
                          ? 'bg-amber-50 border-amber-200 text-amber-700'
                          : 'bg-slate-100 border-slate-200 text-slate-600'
                      }`}
                    >
                      {isActive ? 'نشط' : isRevoked ? 'ملغي' : isExpired ? 'منتهي' : 'غير معروف'}
                    </span>
                  </div>

                  {/* Donor Identity */}
                  <div className="mb-3">
                    <div className="text-sm font-bold text-slate-900 truncate" title={donor.moodle_user_fullname || 'متبرع مسجل'}>
                      {donor.moodle_user_fullname || 'متبرع مسجل'}
                    </div>
                    <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                      معرف مودل · {donor.moodle_user_id || '—'}
                    </div>
                  </div>

                  {/* Last Validated */}
                  <div className="text-[11px] text-slate-500 mb-4 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                    {donor.last_validated_at ? (
                      <span className="truncate">
                        آخر تحقق ·{' '}
                        {new Date(donor.last_validated_at).toLocaleDateString('ar-EG', {
                          month: 'short',
                          day: 'numeric',
                        })}{' '}
                        {new Date(donor.last_validated_at).toLocaleTimeString('ar-EG', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    ) : (
                      <span>بانتظار التحقق الأولي</span>
                    )}
                  </div>
                </div>

                {/* Diagnostic Footer (Figma 28:703) */}
                <div
                  className={`p-2.5 rounded-xl border text-[11px] font-semibold flex items-center gap-2 ${
                    isActive
                      ? 'bg-slate-50 border-slate-200 text-slate-700'
                      : isRevoked
                      ? 'bg-rose-50 border-rose-200 text-rose-800'
                      : 'bg-amber-50 border-amber-200 text-amber-800'
                  }`}
                >
                  {isActive ? (
                    <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : isRevoked ? (
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  )}
                  <span className="truncate">
                    {isActive
                      ? `أساسي لـ ${primaryCount} مساقات · ${fallbackCount} احتياطي`
                      : donor.last_error_message || (isRevoked ? 'تم إلغاء التوكن أو تغيير كلمة المرور' : 'انتهت صلاحية الجلسة')}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        /* Empty State (Figma 28:1056) */
        <div className="bg-white border border-slate-200 border-dashed rounded-2xl p-8 text-center shadow-xs">
          <div className="p-3 bg-blue-50 border border-blue-100 rounded-2xl inline-block text-blue-600 mb-2">
            <KeyRound className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-bold text-slate-900">لا توجد توكنات متبرعين مضافة بعد</h4>
          <p className="text-xs text-slate-500 mt-1 mb-4 max-w-md mx-auto leading-relaxed">
            أضف رمز وصول (Token) لطالب ممثل عن الدفعة لاكتشاف المقررات المسجلة تلقائياً وبدء مراقبة الإعلانات والتكليفات.
          </p>
          <button
            type="button"
            onClick={onOpenDonorModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm shadow-blue-600/30"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة أول توكن متبرع</span>
          </button>
        </div>
      )}
    </div>
  )
}
