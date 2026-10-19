import { useState, useRef, useEffect } from 'react'
import {
  Play,
  Loader2,
  MessageSquare,
  Bell,
  FileText,
  FolderGit2,
  Check,
  FlaskConical,
  ChevronDown,
  Clock,
  Sparkles,
} from 'lucide-react'

export default function CourseRow({
  course,
  onToggleStatus,
  onToggleFilter,
  onPollCourse,
  onTestBroadcast,
}) {
  const [polling, setPolling] = useState(false)
  const [broadcasting, setBroadcasting] = useState(false)
  const [isTestOpen, setIsTestOpen] = useState(false)
  const dropdownRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsTestOpen(false)
      }
    }
    if (isTestOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isTestOpen])

  const handlePoll = async () => {
    setPolling(true)
    try {
      await onPollCourse(course.id)
    } finally {
      setPolling(false)
    }
  }

  const handleTestBroadcast = async (hours) => {
    setIsTestOpen(false)
    setBroadcasting(true)
    try {
      await onTestBroadcast(course.id, hours)
    } finally {
      setBroadcasting(false)
    }
  }

  return (
    <tr className="border-b border-slate-200/80 hover:bg-slate-50/70 transition-colors text-xs">
      {/* 1. Course Info */}
      <td className="py-4 px-4 sm:px-6">
        <div className="flex items-start gap-3">
          <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-slate-100 text-slate-700 rounded-md border border-slate-200 shrink-0 mt-0.5">
            {course.shortname || `#${course.id}`}
          </span>
          <div>
            <div className="font-bold text-slate-900 leading-snug">
              {course.fullname}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              معرّف المساق · {course.id}
            </div>
          </div>
        </div>
      </td>

      {/* 2. Cohort Tag */}
      <td className="py-4 px-4 whitespace-nowrap">
        <span className="inline-flex items-center px-2.5 py-1 text-xs font-bold rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 shadow-2xs">
          {course.cohort_tag}
        </span>
      </td>

      {/* 3. Donor Token */}
      <td className="py-4 px-4 whitespace-nowrap">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-slate-800">
              {course.donor_tokens?.label || 'توكن مباشر'}
            </span>
            {course.donor_tokens?.status === 'revoked' && (
              <span className="px-1.5 py-0.5 text-[9px] font-bold bg-rose-50 text-rose-700 border border-rose-200 rounded">
                التوكن ملغي
              </span>
            )}
          </div>
          {course.fallback_token_id && (
            <span className="inline-block mt-0.5 text-[10px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
              احتياطي مفعل{course.fallback_donor?.label ? ` (${course.fallback_donor.label})` : ''}
            </span>
          )}
        </div>
      </td>

      {/* 4. Module Filters (Figma 28:976) */}
      <td className="py-4 px-4">
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Forum Discussions */}
          <button
            type="button"
            onClick={() => onToggleFilter(course.id, 'filter_forum', !course.filter_forum)}
            title="تبديل مراقبة مناقشات المنتديات"
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer shadow-2xs ${
              course.filter_forum
                ? 'bg-blue-50 border-blue-200 text-blue-700'
                : 'bg-white border-slate-200 text-slate-400 hover:text-slate-600'
            }`}
          >
            <MessageSquare className="w-3 h-3" />
            <span>منتديات</span>
            {course.filter_forum && <Check className="w-3 h-3 mr-0.5 text-blue-600" />}
          </button>

          {/* Announcements */}
          <button
            type="button"
            onClick={() => onToggleFilter(course.id, 'filter_forum', !course.filter_forum)}
            title="تبديل مراقبة الإعلانات والأخبار"
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer shadow-2xs ${
              course.filter_forum
                ? 'bg-cyan-50 border-cyan-200 text-cyan-700'
                : 'bg-white border-slate-200 text-slate-400 hover:text-slate-600'
            }`}
          >
            <Bell className="w-3 h-3" />
            <span>إعلانات</span>
            {course.filter_forum && <Check className="w-3 h-3 mr-0.5 text-cyan-600" />}
          </button>

          {/* Assignments */}
          <button
            type="button"
            onClick={() => onToggleFilter(course.id, 'filter_assign', !course.filter_assign)}
            title="تبديل مراقبة التكليفات والواجبات"
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer shadow-2xs ${
              course.filter_assign
                ? 'bg-amber-50 border-amber-200 text-amber-700'
                : 'bg-white border-slate-200 text-slate-400 hover:text-slate-600'
            }`}
          >
            <FileText className="w-3 h-3" />
            <span>واجبات</span>
            {course.filter_assign && <Check className="w-3 h-3 mr-0.5 text-amber-600" />}
          </button>

          {/* Resources */}
          <button
            type="button"
            onClick={() => onToggleFilter(course.id, 'filter_resources', !course.filter_resources)}
            title="تبديل مراقبة ملفات المحاضرات والمجلدات"
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer shadow-2xs ${
              course.filter_resources
                ? 'bg-purple-50 border-purple-200 text-purple-700'
                : 'bg-white border-slate-200 text-slate-400 hover:text-slate-600'
            }`}
          >
            <FolderGit2 className="w-3 h-3" />
            <span>ملفات</span>
            {course.filter_resources && <Check className="w-3 h-3 mr-0.5 text-purple-600" />}
          </button>
        </div>
      </td>

      {/* 5. Monitoring Switch (Figma 28:1013) */}
      <td className="py-4 px-4 text-center whitespace-nowrap">
        <button
          type="button"
          onClick={() => onToggleStatus(course.id, !course.is_monitored)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
            course.is_monitored ? 'bg-emerald-600' : 'bg-slate-300'
          }`}
          title={course.is_monitored ? 'المساق قيد المراقبة والفحص' : 'المراقبة متوقفة مؤقتاً'}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
              course.is_monitored ? '-translate-x-6' : '-translate-x-1'
            }`}
          />
        </button>
        <div className="text-[10px] text-slate-500 mt-1 font-bold">
          {course.is_monitored ? (
            <span className="text-emerald-700">نشط</span>
          ) : (
            <span className="text-slate-400">متوقف</span>
          )}
        </div>
      </td>

      {/* 6. Action: Test Broadcast & Poll Now */}
      <td className="py-4 px-4 sm:px-6 text-left whitespace-nowrap">
        <div className="flex items-center justify-end gap-2">
          {/* Test Broadcast Dropdown Menu */}
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setIsTestOpen((prev) => !prev)}
              disabled={broadcasting || !course.is_monitored}
              title="إرسال تجريبي لآخر تحديثات المساق للطلاب المشتركين على تليجرام"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold text-indigo-700 bg-indigo-50/90 hover:bg-indigo-100 hover:text-indigo-900 disabled:opacity-40 disabled:cursor-not-allowed border border-indigo-200 rounded-xl transition-all cursor-pointer shadow-2xs"
            >
              {broadcasting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                  <span>جارٍ الإرسال...</span>
                </>
              ) : (
                <>
                  <FlaskConical className="w-3.5 h-3.5 text-indigo-600" />
                  <span>إرسال تجريبي</span>
                  <ChevronDown
                    className={`w-3 h-3 text-indigo-500 transition-transform ${
                      isTestOpen ? 'rotate-180' : ''
                    }`}
                  />
                </>
              )}
            </button>

            {/* Dropdown Popover */}
            {isTestOpen && (
              <div className="absolute left-0 mt-1.5 w-64 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 py-1.5 text-right animate-in fade-in zoom-in-95 duration-100">
                <div className="px-3.5 py-2 border-b border-slate-100">
                  <div className="text-[11px] font-bold text-slate-800 flex items-center gap-1.5">
                    <FlaskConical className="w-3.5 h-3.5 text-indigo-600" />
                    <span>إرسال تجريبي عبر تليجرام</span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-0.5 leading-tight font-medium">
                    حدد نطاق البحث عن أحدث نشاط لإرساله للمشتركين:
                  </p>
                </div>

                <div className="p-1 space-y-0.5">
                  <button
                    type="button"
                    onClick={() => handleTestBroadcast(24)}
                    className="w-full text-right px-3 py-2 rounded-xl text-xs hover:bg-indigo-50/50 flex items-center justify-between group transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-600 transition-colors" />
                      <span className="font-bold text-slate-700 group-hover:text-slate-900">
                        آخر 24 ساعة
                      </span>
                    </div>
                    <span className="text-[10px] text-indigo-600 font-semibold bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                      موصى به
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleTestBroadcast(72)}
                    className="w-full text-right px-3 py-2 rounded-xl text-xs hover:bg-slate-50 flex items-center justify-between group transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-600 transition-colors" />
                      <span className="font-bold text-slate-700 group-hover:text-slate-900">
                        آخر 3 أيام
                      </span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleTestBroadcast(168)}
                    className="w-full text-right px-3 py-2 rounded-xl text-xs hover:bg-slate-50 flex items-center justify-between group transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-600 transition-colors" />
                      <span className="font-bold text-slate-700 group-hover:text-slate-900">
                        آخر أسبوع
                      </span>
                    </div>
                  </button>

                  <div className="h-px bg-slate-100 my-1" />

                  <button
                    type="button"
                    onClick={() => handleTestBroadcast(0)}
                    className="w-full text-right px-3 py-2 rounded-xl text-xs hover:bg-amber-50/50 flex items-center justify-between group transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                      <div>
                        <div className="font-bold text-slate-800 group-hover:text-amber-900">
                          أحدث محتوى متاح
                        </div>
                        <div className="text-[10px] text-slate-400">
                          بغض النظر عن تاريخ النشر
                        </div>
                      </div>
                    </div>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Poll Now Button */}
          <button
            type="button"
            onClick={handlePoll}
            disabled={polling || !course.is_monitored}
            title="تشغيل فحص فوري للمساق وتحديث التغييرات"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 bg-slate-50 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 disabled:cursor-not-allowed border border-slate-200 rounded-xl transition-colors cursor-pointer shadow-2xs"
          >
            {polling ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                <span>جارٍ الفحص...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 text-blue-600 fill-blue-600/20" />
                <span>فحص الآن</span>
              </>
            )}
          </button>
        </div>
      </td>
    </tr>
  )
}
