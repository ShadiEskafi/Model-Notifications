import { useState, useMemo } from 'react'
import { Search, RefreshCw, BookOpen, Plus, SlidersHorizontal, ListFilter } from 'lucide-react'
import CourseRow from './CourseRow'

export default function CoursesTable({
  courses,
  loading,
  onRefresh,
  onToggleStatus,
  onToggleFilter,
  onPollCourse,
  onTestBroadcast,
  onOpenDonorModal,
}) {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCohort, setSelectedCohort] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')

  // Extract unique cohorts for filter dropdown
  const cohortOptions = useMemo(() => {
    const cohorts = new Set()
    courses.forEach((c) => {
      if (c.cohort_tag) cohorts.add(c.cohort_tag)
    })
    return ['ALL', ...Array.from(cohorts)]
  }, [courses])

  // Filter courses based on search, cohort, and status
  const filteredCourses = useMemo(() => {
    return courses.filter((c) => {
      const matchesSearch =
        c.fullname?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.shortname?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.id?.toString().includes(searchTerm)

      const matchesCohort =
        selectedCohort === 'ALL' || c.cohort_tag === selectedCohort

      const matchesStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'ACTIVE' && c.is_monitored) ||
        (statusFilter === 'PAUSED' && !c.is_monitored)

      return matchesSearch && matchesCohort && matchesStatus
    })
  }, [courses, searchTerm, selectedCohort, statusFilter])

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-xs">
      {/* Table Heading */}
      <div className="px-6 pt-6 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <h2 className="text-base font-extrabold text-slate-900 tracking-tight">
            المساقات المراقبة
          </h2>
          <span className="px-2.5 py-0.5 text-xs font-bold bg-slate-100 border border-slate-200 text-slate-700 rounded-md">
            {courses.length}
          </span>
        </div>
        <p className="text-xs text-slate-500 font-medium">
          فحص تلقائي كل 10 دقائق عبر Supabase pg_cron
        </p>
      </div>

      {/* Course Search and Filters Bar */}
      <div className="px-6 pb-4 pt-2 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 border-b border-slate-100">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 flex-1">
          {/* Search Input */}
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="البحث باسم المساق أو المعرّف..."
              className="w-full pr-10 pl-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all font-medium"
            />
          </div>

          {/* Cohort Filter */}
          <div className="relative">
            <SlidersHorizontal className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <select
              value={selectedCohort}
              onChange={(e) => setSelectedCohort(e.target.value)}
              className="w-full sm:w-auto pr-9 pl-7 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white appearance-none cursor-pointer font-bold shadow-2xs"
            >
              {cohortOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt === 'ALL' ? 'جميع الدفعات / الكليات' : opt}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="relative">
            <ListFilter className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full sm:w-auto pr-9 pl-7 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white appearance-none cursor-pointer font-bold shadow-2xs"
            >
              <option value="ALL">جميع الحالات</option>
              <option value="ACTIVE">النشطة فقط</option>
              <option value="PAUSED">المتوقفة مؤقتاً</option>
            </select>
          </div>
        </div>

        {/* Count and Refresh */}
        <div className="flex items-center justify-between md:justify-end gap-3 text-xs text-slate-500 font-medium">
          <span>عرض {filteredCourses.length} مساقاً</span>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            title="تحديث قائمة المساقات"
            className="p-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-slate-600 hover:text-slate-900 transition-colors cursor-pointer shadow-2xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* Table Content */}
      <div className="overflow-x-auto">
        <table className="w-full text-right border-collapse">
          <thead>
            <tr className="border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider bg-slate-50/75">
              <th className="py-3 px-4 sm:px-6">المساق الجامعي</th>
              <th className="py-3 px-4">الدفعة / التخصص</th>
              <th className="py-3 px-4">التوكن المعيّن</th>
              <th className="py-3 px-4">فلاتر تنبيهات الوحدات</th>
              <th className="py-3 px-4 text-center">المراقبة</th>
              <th className="py-3 px-4 sm:px-6 text-left">الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {filteredCourses.length > 0 ? (
              filteredCourses.map((c) => (
                <CourseRow
                  key={c.id}
                  course={c}
                  onToggleStatus={onToggleStatus}
                  onToggleFilter={onToggleFilter}
                  onPollCourse={onPollCourse}
                  onTestBroadcast={onTestBroadcast}
                />
              ))
            ) : (
              <tr>
                <td colSpan={6} className="py-16 text-center text-slate-500">
                  <div className="flex flex-col items-center justify-center max-w-sm mx-auto px-4">
                    <div className="p-3 bg-blue-50 border border-blue-100 rounded-2xl mb-3 text-blue-600">
                      <BookOpen className="w-7 h-7" />
                    </div>
                    {courses.length === 0 ? (
                      <>
                        <h3 className="font-extrabold text-slate-900 text-sm mb-1">
                          لم يتم إدراج مساقات بعد
                        </h3>
                        <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                          أضف توكن متبرع من ممثل الدفعة ليتم اكتشاف المقررات ومزامنتها تلقائياً مع منصة مودل.
                        </p>
                        <button
                          type="button"
                          onClick={onOpenDonorModal}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-600/20 transition-all cursor-pointer"
                        >
                          <Plus className="w-4 h-4" />
                          <span>إضافة أول توكن متبرع</span>
                        </button>
                      </>
                    ) : (
                      <>
                        <h3 className="font-extrabold text-slate-900 text-sm mb-1">
                          لا توجد نتائج مطابقة لبحثك
                        </h3>
                        <p className="text-xs text-slate-500">
                          يرجى محاولة تعديل كلمة البحث أو فلتر الدفعة.
                        </p>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
