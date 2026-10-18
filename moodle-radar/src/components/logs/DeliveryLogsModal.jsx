import { useEffect, useState, useMemo } from 'react'
import {
  X,
  ScrollText,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  Send,
  CheckCircle,
  Info
} from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'

export default function DeliveryLogsModal({ isOpen, onClose }) {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [expandedLogId, setExpandedLogId] = useState(null)

  const handleRefresh = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('notification_logs')
        .select('*, courses(fullname, shortname, cohort_tag)')
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) throw error
      setLogs(data || [])
    } catch (err) {
      console.error('Failed to fetch delivery logs:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let isMounted = true
    if (isOpen) {
      supabase
        .from('notification_logs')
        .select('*, courses(fullname, shortname, cohort_tag)')
        .order('created_at', { ascending: false })
        .limit(50)
        .then(({ data, error }) => {
          if (!isMounted) return
          if (!error && data) {
            setLogs(data)
          }
        })
    }
    return () => {
      isMounted = false
    }
  }, [isOpen])

  // Compute top 4 summary metrics from logs
  const stats = useMemo(() => {
    let delivered = 0
    let failed = 0
    let totalAttempts = 0

    logs.forEach((log) => {
      delivered += log.success_count || 0
      failed += log.failure_count || 0
      totalAttempts += log.recipients_count || 0
    })

    const successRate = totalAttempts > 0 ? ((delivered / totalAttempts) * 100).toFixed(1) : '100.0'

    return {
      delivered,
      pending: 0,
      failed,
      successRate: `${successRate}%`,
    }
  }, [logs])

  // Filter logs by selected tab
  const filteredLogs = useMemo(() => {
    if (statusFilter === 'ALL') return logs
    return logs.filter((l) => l.status === statusFilter.toLowerCase())
  }, [logs, statusFilter])

  const toggleExpand = (id) => {
    setExpandedLogId((prev) => (prev === id ? null : id))
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 overflow-hidden animate-in fade-in duration-200">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity cursor-pointer"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Flyout Drawer (RTL: Opens from Left Side) */}
      <div className="fixed inset-y-0 left-0 max-w-full flex pr-10">
        <div className="w-screen max-w-2xl bg-white border-r border-slate-200 shadow-2xl flex flex-col h-full animate-in slide-in-from-left duration-250 text-right">
          
          {/* Drawer Header (Figma 28:2200) */}
          <div className="p-6 border-b border-slate-200/80 bg-slate-50/70 shrink-0">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-blue-50 border border-blue-200 text-blue-600">
                  <ScrollText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 tracking-tight">
                    درج سجلات التدقيق والتسليم
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5 font-medium">
                    سجل بث تيليجرام المباشر، نسب الإرسال، وتفاصيل أخطاء البوت
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleRefresh}
                  disabled={loading}
                  title="تحديث السجلات"
                  className="p-2 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-slate-600 hover:text-slate-900 transition-colors cursor-pointer shadow-2xs"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-600' : ''}`} />
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* 4 Summary Statistics Pills (Figma 28:2208) */}
            <div className="grid grid-cols-4 gap-2.5 mt-5">
              <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-2xs">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <CheckCircle className="w-3 h-3 text-emerald-600" />
                  <span>تم التسليم</span>
                </div>
                <div className="text-base font-black text-emerald-600 mt-1 font-mono">
                  {stats.delivered}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-2xs">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <Clock className="w-3 h-3 text-blue-600" />
                  <span>قيد الانتظار</span>
                </div>
                <div className="text-base font-black text-blue-600 mt-1 font-mono">
                  {stats.pending}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-2xs">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <AlertTriangle className="w-3 h-3 text-rose-600" />
                  <span>فشل الإرسال</span>
                </div>
                <div className="text-base font-black text-rose-600 mt-1 font-mono">
                  {stats.failed}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-2xs">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <Send className="w-3 h-3 text-cyan-600" />
                  <span>معدل النجاح</span>
                </div>
                <div className="text-base font-black text-slate-900 mt-1 font-mono">
                  {stats.successRate}
                </div>
              </div>
            </div>

            {/* Status Filter Tabs (Figma 28:2221) */}
            <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-200">
              {[
                { key: 'ALL', label: 'كافة السجلات' },
                { key: 'SUCCESS', label: 'الناجحة' },
                { key: 'PARTIAL', label: 'الجزئية' },
                { key: 'FAILED', label: 'الفاشلة' },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setStatusFilter(tab.key)}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                    statusFilter === tab.key
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
              <span className="mr-auto text-[11px] text-slate-400 font-bold font-mono">
                {filteredLogs.length} سجلاً
              </span>
            </div>
          </div>

          {/* Drawer Body - Feed (Figma 28:2236) */}
          <div className="flex-1 overflow-y-auto p-6 space-y-3">
            {filteredLogs.length > 0 ? (
              filteredLogs.map((log) => {
                const isExpanded = expandedLogId === log.id
                const isFailed = log.status === 'failed'
                const isPartial = log.status === 'partial'
                const isSuccess = log.status === 'success'

                const timeStr = new Date(log.created_at).toLocaleTimeString('ar-EG', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })
                const dateStr = new Date(log.created_at).toLocaleDateString('ar-EG', {
                  month: 'short',
                  day: 'numeric',
                })

                return (
                  <div
                    key={log.id}
                    className={`border rounded-2xl transition-all ${
                      isFailed
                        ? 'bg-rose-50/50 border-rose-200'
                        : isPartial
                        ? 'bg-amber-50/50 border-amber-200'
                        : 'bg-white border-slate-200 hover:border-slate-300 shadow-2xs'
                    }`}
                  >
                    {/* Primary Row */}
                    <div
                      className="p-4 flex items-start justify-between gap-3 cursor-pointer select-none"
                      onClick={() => toggleExpand(log.id)}
                    >
                      <div className="space-y-1 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-mono text-slate-500 font-semibold">
                            {dateStr} {timeStr}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                            {log.event_type}
                          </span>
                          {log.courses?.cohort_tag && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 border border-indigo-200 text-indigo-700">
                              {log.courses.cohort_tag}
                            </span>
                          )}
                        </div>

                        <div className="font-extrabold text-xs text-slate-900 truncate" title={log.item_title}>
                          {log.item_title}
                        </div>

                        <div className="text-[11px] text-slate-500 truncate">
                          {log.courses?.fullname || `مساق رقم #${log.course_id}`}
                        </div>
                      </div>

                      <div className="flex flex-col items-start gap-1 shrink-0">
                        {isSuccess && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-bold bg-emerald-50 px-2.5 py-0.5 rounded-md border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            تم التسليم
                          </span>
                        )}
                        {isPartial && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 font-bold bg-amber-50 px-2.5 py-0.5 rounded-md border border-amber-200">
                            <AlertTriangle className="w-3 h-3 text-amber-600" />
                            تسليم جزئي
                          </span>
                        )}
                        {isFailed && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-rose-700 font-bold bg-rose-50 px-2.5 py-0.5 rounded-md border border-rose-200">
                            <XCircle className="w-3 h-3 text-rose-600" />
                            فشل الإرسال
                          </span>
                        )}

                        <span className="text-[10px] font-mono text-slate-500">
                          {log.success_count} / {log.recipients_count} تم إرسالها
                        </span>

                        <div className="text-slate-400 mt-0.5">
                          {isExpanded ? (
                            <ChevronUp className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5" />
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Expandable Diagnostic Drawer Card (Figma 28:2317) */}
                    {isExpanded && (
                      <div className="px-4 pb-4 pt-1 border-t border-slate-100 space-y-2 text-xs">
                        <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-200">
                          <div>
                            <span className="text-slate-400">معرف السجل:</span>{' '}
                            <span className="font-mono text-slate-800 truncate inline-block max-w-[140px] align-bottom">
                              {log.id}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400">معرف المساق:</span>{' '}
                            <span className="font-mono text-slate-800">{log.course_id}</span>
                          </div>
                          <div>
                            <span className="text-slate-400">الناجحة:</span>{' '}
                            <span className="text-emerald-700 font-bold">{log.success_count}</span>
                          </div>
                          <div>
                            <span className="text-slate-400">الفاشلة:</span>{' '}
                            <span className="text-rose-700 font-bold">{log.failure_count}</span>
                          </div>
                        </div>

                        {log.error_details && (
                          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-[11px]">
                            <div className="flex items-center gap-1.5 font-bold text-rose-800 mb-1">
                              <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                              <span>بيانات خطأ واجهة تيليجرام (Telegram Error Telemetry)</span>
                            </div>
                            <pre className="font-mono text-[10px] text-rose-900 whitespace-pre-wrap break-all bg-white/80 p-2 rounded-lg border border-rose-200 text-left" dir="ltr">
                              {log.error_details}
                            </pre>
                          </div>
                        )}

                        {!log.error_details && isSuccess && (
                          <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-800 flex items-center gap-2">
                            <Info className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                            <span>تم إرسال كافة التنبيهات بنجاح إلى جميع الطلاب دون قيود على معدل الإرسال.</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })
            ) : (
              <div className="text-center py-16 text-slate-400">
                <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center mx-auto mb-3 text-slate-400">
                  <ScrollText className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-bold text-slate-800">لا توجد إرساليات مسجلة</h4>
                <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto leading-relaxed">
                  الإشعارات التي يتم بثها عبر الفاحص الدوري كل 10 دقائق ستظهر في هذا السجل بصورة فورية.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
