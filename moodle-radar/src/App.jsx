import { useState, useEffect, useCallback } from 'react'
import { Radio, AlertCircle, CheckCircle2, Info, Plus } from 'lucide-react'
import { AuthProvider } from './context/AuthProvider'
import { useAuth } from './hooks/useAuth'
import { supabase } from './lib/supabaseClient'
import LoginView from './components/auth/LoginView'
import Navbar from './components/layout/Navbar'
import Layout from './components/layout/Layout'
import MetricsGrid from './components/metrics/MetricsGrid'
import DonorList from './components/donors/DonorList'
import CoursesTable from './components/courses/CoursesTable'
import OnboardDonorModal from './components/donors/OnboardDonorModal'
import DeliveryLogsModal from './components/logs/DeliveryLogsModal'
import ErrorBoundary from './components/common/ErrorBoundary'

function DashboardContent() {
  const { session, loading: authLoading } = useAuth()

  const [courses, setCourses] = useState([])
  const [coursesLoading, setCoursesLoading] = useState(true)
  const [donors, setDonors] = useState([])
  const [donorsLoading, setDonorsLoading] = useState(true)
  const [metrics, setMetrics] = useState({
    activeCourses: 0,
    totalCourses: 0,
    activeDonors: 0,
    failingDonors: 0,
    totalStudents: 0,
    deliveries24h: 0,
    deliverySuccessRate: 100,
  })

  const [isDonorModalOpen, setIsDonorModalOpen] = useState(false)
  const [isLogsModalOpen, setIsLogsModalOpen] = useState(false)
  const [toast, setToast] = useState(null)

  const showToast = (message, type = 'success', duration = 4000) => {
    setToast({ message, type })
    setTimeout(() => {
      setToast(null)
    }, duration)
  }

  // Manual refresh helper for courses
  const fetchCourses = useCallback(async () => {
    setCoursesLoading(true)
    try {
      const { data, error } = await supabase
        .from('courses')
        .select('*, donor_tokens!donor_token_id(label, status)')
        .order('id', { ascending: true })

      if (error) throw error
      setCourses(data || [])
    } catch (err) {
      console.error('Failed to load courses:', err)
      showToast('فشل تحميل المساقات من قاعدة البيانات: ' + err.message, 'error')
    } finally {
      setCoursesLoading(false)
    }
  }, [])

  // Manual refresh helper for donor tokens
  const fetchDonors = useCallback(async () => {
    setDonorsLoading(true)
    try {
      const { data, error } = await supabase
        .from('donor_tokens')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setDonors(data || [])
    } catch (err) {
      console.error('Failed to load donors:', err)
      showToast('فشل تحميل توكنات المتبرعين: ' + err.message, 'error')
    } finally {
      setDonorsLoading(false)
    }
  }, [])

  // Manual refresh helper for metrics
  const fetchMetrics = useCallback(async () => {
    try {
      const { data: coursesData } = await supabase
        .from('courses')
        .select('is_monitored')

      const totalCourses = coursesData?.length || 0
      const activeCourses = coursesData?.filter((c) => c.is_monitored).length || 0

      const { data: donorsData } = await supabase
        .from('donor_tokens')
        .select('status')

      const totalDonors = donorsData?.length || 0
      const activeDonors = donorsData?.filter((d) => d.status === 'active').length || 0
      const failingDonors = totalDonors - activeDonors

      const { count: totalStudents } = await supabase
        .from('bot_users')
        .select('*', { count: 'exact', head: true })

      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const { data: logsData } = await supabase
        .from('notification_logs')
        .select('status, recipients_count, success_count')
        .gte('created_at', since24h)

      let deliveries24h = 0
      let totalSuccess = 0
      let totalAttempted = 0

      if (logsData) {
        logsData.forEach((l) => {
          deliveries24h += l.recipients_count || 0
          totalSuccess += l.success_count || 0
          totalAttempted += l.recipients_count || 0
        })
      }

      const deliverySuccessRate =
        totalAttempted > 0 ? Math.round((totalSuccess / totalAttempted) * 100) : 100

      setMetrics({
        activeCourses,
        totalCourses,
        activeDonors,
        failingDonors,
        totalStudents: totalStudents || 0,
        deliveries24h,
        deliverySuccessRate,
      })
    } catch (err) {
      console.error('Failed to calculate metrics:', err)
    }
  }, [])

  // Initial data load effect
  useEffect(() => {
    let isMounted = true
    if (session) {
      Promise.all([
        supabase
          .from('courses')
          .select('*, donor_tokens!donor_token_id(label, status)')
          .order('id', { ascending: true }),
        supabase
          .from('donor_tokens')
          .select('*')
          .order('created_at', { ascending: false }),
        supabase.from('courses').select('is_monitored'),
        supabase.from('donor_tokens').select('status'),
        supabase.from('bot_users').select('*', { count: 'exact', head: true }),
        supabase
          .from('notification_logs')
          .select('status, recipients_count, success_count')
          .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
      ])
        .then(([coursesRes, donorsRes, coursesStats, donorStats, studentsRes, logsRes]) => {
          if (!isMounted) return

          if (coursesRes.data) {
            setCourses(coursesRes.data)
          }
          setCoursesLoading(false)

          if (donorsRes.data) {
            setDonors(donorsRes.data)
          }
          setDonorsLoading(false)

          const totalCourses = coursesStats.data?.length || 0
          const activeCourses = coursesStats.data?.filter((c) => c.is_monitored).length || 0

          const totalDonors = donorStats.data?.length || 0
          const activeDonors = donorStats.data?.filter((d) => d.status === 'active').length || 0
          const failingDonors = totalDonors - activeDonors

          const totalStudents = studentsRes.count || 0

          let deliveries24h = 0
          let totalSuccess = 0
          let totalAttempted = 0

          if (logsRes.data) {
            logsRes.data.forEach((l) => {
              deliveries24h += l.recipients_count || 0
              totalSuccess += l.success_count || 0
              totalAttempted += l.recipients_count || 0
            })
          }

          const deliverySuccessRate =
            totalAttempted > 0 ? Math.round((totalSuccess / totalAttempted) * 100) : 100

          setMetrics({
            activeCourses,
            totalCourses,
            activeDonors,
            failingDonors,
            totalStudents,
            deliveries24h,
            deliverySuccessRate,
          })
        })
        .catch((err) => {
          if (!isMounted) return
          console.error('Failed to load dashboard data:', err)
          setCoursesLoading(false)
          setDonorsLoading(false)
        })
    }
    return () => {
      isMounted = false
    }
  }, [session])

  // Toggle Course Active / Paused with Optimistic UI
  const handleToggleStatus = async (courseId, nextStatus) => {
    setCourses((prev) =>
      prev.map((c) => (c.id === courseId ? { ...c, is_monitored: nextStatus } : c))
    )

    try {
      const { error } = await supabase
        .from('courses')
        .update({ is_monitored: nextStatus, updated_at: new Date().toISOString() })
        .eq('id', courseId)

      if (error) throw error
      showToast(
        nextStatus
          ? `تم استئناف مراقبة مساق رقم #${courseId}`
          : `تم إيقاف مراقبة مساق رقم #${courseId} مؤقتاً`
      )
      fetchMetrics()
    } catch (err) {
      setCourses((prev) =>
        prev.map((c) => (c.id === courseId ? { ...c, is_monitored: !nextStatus } : c))
      )
      showToast('فشل تعديل حالة المساق: ' + err.message, 'error')
    }
  }

  // Toggle Module Filters with Optimistic UI
  const handleToggleFilter = async (courseId, field, nextValue) => {
    setCourses((prev) =>
      prev.map((c) => (c.id === courseId ? { ...c, [field]: nextValue } : c))
    )

    try {
      const { error } = await supabase
        .from('courses')
        .update({ [field]: nextValue, updated_at: new Date().toISOString() })
        .eq('id', courseId)

      if (error) throw error
      showToast(`تم تحديث فلتر التنبيهات لمساق رقم #${courseId}`)
    } catch (err) {
      setCourses((prev) =>
        prev.map((c) => (c.id === courseId ? { ...c, [field]: !nextValue } : c))
      )
      showToast('فشل تعديل الفلتر: ' + err.message, 'error')
    }
  }

  // Poll Course On-Demand
  const handlePollCourse = async (courseId) => {
    try {
      const { error } = await supabase.functions.invoke('moodle-poller', {
        body: { courseId },
      })
      if (error) throw error
      showToast(`تم إطلاق الفحص الفوري لمساق رقم #${courseId}`)
    } catch (err) {
      showToast(`تم إرسال إشارة الفحص التشخيصي لمساق رقم #${courseId} (${err.message})`, 'info')
    }
  }

  // Trigger Test Broadcast by Lookback Window
  const handleTestBroadcast = async (courseId, timeWindowHours) => {
    try {
      const { data, error } = await supabase.functions.invoke('moodle-poller', {
        body: {
          courseId,
          mode: 'test_broadcast',
          timeWindowHours,
        },
      })
      if (error) throw error

      if (!data) {
        showToast('لم يتم استلام رد من خادم الفحص', 'error')
        return
      }

      if (data.success) {
        if (data.deliveredCount > 0) {
          showToast(data.message, 'success', 6000)
        } else {
          showToast(data.message, 'info', 7000)
        }
        fetchMetrics()
      } else {
        showToast(data.message || 'تعذر العثور على تحديثات في الفترة المحددة', 'info', 6000)
      }
    } catch (err) {
      showToast(`فشل الإرسال التجريبي: ${err.message}`, 'error', 5000)
    }
  }

  // Loading Screen (Arabic Light RTL)
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 text-center">
        <div className="relative flex items-center justify-center mb-4">
          <div className="w-16 h-16 rounded-full bg-blue-100 animate-ping absolute" />
          <div className="w-14 h-14 rounded-2xl bg-white border border-slate-200 text-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/10 z-10">
            <Radio className="w-7 h-7 animate-pulse" />
          </div>
        </div>
        <p className="text-sm font-extrabold text-slate-800">جارٍ تشغيل رادار مودل...</p>
        <p className="text-xs text-slate-500 mt-1 font-medium">الاتصال بشبكة Supabase السحابية</p>
      </div>
    )
  }

  // Unauthenticated View
  if (!session) {
    return <LoginView />
  }

  // Authenticated Dashboard View (Arabic Light RTL)
  return (
    <>
      {/* Toast Notification (RTL: bottom-left) */}
      {toast && (
        <div className="fixed bottom-6 left-6 z-50 animate-in slide-in-from-bottom duration-200">
          <div
            className={`px-4 py-3 rounded-2xl shadow-xl border text-xs font-bold flex items-center gap-2.5 ${
              toast.type === 'error'
                ? 'bg-rose-50 border-rose-200 text-rose-800'
                : toast.type === 'info'
                ? 'bg-blue-50 border-blue-200 text-blue-800'
                : 'bg-emerald-50 border-emerald-200 text-emerald-800'
            }`}
          >
            {toast.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            ) : toast.type === 'info' ? (
              <Info className="w-4 h-4 text-blue-600 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            )}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      <Navbar
        onOpenDonorModal={() => setIsDonorModalOpen(true)}
        onOpenLogsModal={() => setIsLogsModalOpen(true)}
      />

      <Layout>
        {/* Workspace Header (Figma 28:658) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200/80">
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              نظرة عامة على المراقبة
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1 font-medium">
              جداول الفحص النشطة، توكنات المتبرعين، وفلاتر تنبيهات المساقات.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsDonorModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-600/20 transition-all cursor-pointer self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة متبرع جديد</span>
          </button>
        </div>

        {/* Operational KPI Metric Cards */}
        <MetricsGrid metrics={metrics} loading={coursesLoading} />

        {/* Donor Tokens Management Section */}
        <DonorList
          donors={donors}
          courses={courses}
          loading={donorsLoading}
          onOpenDonorModal={() => setIsDonorModalOpen(true)}
        />

        {/* Master Courses Table */}
        <CoursesTable
          courses={courses}
          loading={coursesLoading}
          onRefresh={() => {
            fetchCourses()
            fetchDonors()
            fetchMetrics()
          }}
          onToggleStatus={handleToggleStatus}
          onToggleFilter={handleToggleFilter}
          onPollCourse={handlePollCourse}
          onTestBroadcast={handleTestBroadcast}
          onOpenDonorModal={() => setIsDonorModalOpen(true)}
        />
      </Layout>

      {/* Modals & Drawers */}
      <OnboardDonorModal
        isOpen={isDonorModalOpen}
        onClose={() => setIsDonorModalOpen(false)}
        onSuccess={() => {
          showToast('تم تسجيل توكن المتبرع واكتشاف المساقات بنجاح!')
          fetchCourses()
          fetchDonors()
          fetchMetrics()
        }}
      />

      <DeliveryLogsModal
        isOpen={isLogsModalOpen}
        onClose={() => setIsLogsModalOpen(false)}
      />
    </>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <DashboardContent />
      </AuthProvider>
    </ErrorBoundary>
  )
}
