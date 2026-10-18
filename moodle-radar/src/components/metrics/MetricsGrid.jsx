import { BookOpen, KeyRound, Users, Send, TrendingUp, AlertTriangle } from 'lucide-react'

export default function MetricsGrid({ metrics, loading }) {
  const cards = [
    {
      label: 'المساقات المراقبة',
      value: loading ? '—' : `${metrics.activeCourses} / ${metrics.totalCourses}`,
      subtext:
        metrics.totalCourses > 0
          ? `${Math.round((metrics.activeCourses / metrics.totalCourses) * 100)}% مساقاً نشطاً`
          : 'لا توجد مساقات مضافة',
      icon: BookOpen,
      iconColor: 'text-blue-600',
      iconBg: 'bg-blue-50 border-blue-100',
    },
    {
      label: 'توكنات المتبرعين النشطة',
      value: loading ? '—' : metrics.activeDonors,
      subtext:
        metrics.failingDonors > 0
          ? `${metrics.failingDonors} توكن بحاجة لتجديد`
          : 'كافة التوكنات صالحة وسارية',
      hasAlert: metrics.failingDonors > 0,
      icon: KeyRound,
      iconColor: 'text-emerald-600',
      iconBg: 'bg-emerald-50 border-emerald-100',
    },
    {
      label: 'الطلاب المشتركون بالبوت',
      value: loading ? '—' : metrics.totalStudents.toLocaleString('ar-EG'),
      subtext: 'مشترك نشط عبر تيليجرام',
      icon: Users,
      iconColor: 'text-indigo-600',
      iconBg: 'bg-indigo-50 border-indigo-100',
    },
    {
      label: 'إرساليات البث (آخر 24 ساعة)',
      value: loading ? '—' : metrics.deliveries24h.toLocaleString('ar-EG'),
      subtext: `نسبة التسليم ${metrics.deliverySuccessRate}%`,
      icon: Send,
      iconColor: 'text-cyan-600',
      iconBg: 'bg-cyan-50 border-cyan-100',
    },
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card, idx) => {
        const Icon = card.icon

        return (
          <div
            key={idx}
            className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs hover:shadow-md hover:border-slate-300 transition-all flex flex-col justify-between"
          >
            <div className="flex items-center justify-between gap-3 mb-3">
              <span className="text-xs font-bold text-slate-600">
                {card.label}
              </span>
              <div
                className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${card.iconBg} ${card.iconColor}`}
              >
                <Icon className="w-4.5 h-4.5" />
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight font-mono">
                {card.value}
              </div>

              <div className="flex items-center gap-1.5 text-xs">
                {card.hasAlert ? (
                  <span className="text-rose-600 font-bold inline-flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {card.subtext}
                  </span>
                ) : (
                  <span className="text-slate-500 font-medium inline-flex items-center gap-1">
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                    {card.subtext}
                  </span>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
