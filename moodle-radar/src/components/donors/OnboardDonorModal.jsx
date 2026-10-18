import { useState } from 'react'
import { X, KeyRound, ShieldCheck, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'

export default function OnboardDonorModal({ isOpen, onClose, onSuccess }) {
  const [label, setLabel] = useState('')
  const [moodleUrl, setMoodleUrl] = useState('https://moodle.university.edu')
  const [wstoken, setWstoken] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [successData, setSuccessData] = useState(null)

  if (!isOpen) return null

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      // Call Supabase Edge Function: /sync-courses
      const { data, error: funcError } = await supabase.functions.invoke('sync-courses', {
        body: {
          label: label.trim(),
          moodle_base_url: moodleUrl.trim(),
          wstoken: wstoken.trim(),
        },
      })

      if (funcError) {
        let msg = funcError.message
        if (funcError.context && typeof funcError.context.json === 'function') {
          try {
            const errJson = await funcError.context.json()
            if (errJson && errJson.message) {
              msg = errJson.message
            }
          } catch (e) {
            void e
          }
        }
        throw new Error(msg || 'فشل استدعاء دالة المزامنة')
      }

      if (data && !data.success) {
        throw new Error(data.message || 'فشل التحقق من صلاحية توكن مودل')
      }

      setSuccessData(data)
      setTimeout(() => {
        onSuccess()
        handleClose()
      }, 1500)
    } catch (err) {
      setError(err.message || 'حدث خطأ غير متوقع أثناء إضافة التوكن والتحقق منه.')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setLabel('')
    setWstoken('')
    setError(null)
    setSuccessData(null)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150 text-right">
        
        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-blue-50 border border-blue-100 text-blue-600">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900 tracking-tight">
                إضافة توكن متبرع جديد
              </h3>
              <p className="text-xs text-slate-500 mt-0.5 font-medium">
                تسجيل رمز وصول لطالب لاكتشاف مساقات الدفعة تلقائياً
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200/90 text-rose-800 text-xs flex items-start gap-3">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
              <div className="leading-relaxed font-medium">{error}</div>
            </div>
          )}

          {successData && (
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200/90 text-emerald-800 text-xs flex items-start gap-3">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
              <div>
                <span className="font-bold">نجحت المصافحة والربط!</span> تم الاتصال بحساب الطالب{' '}
                <span className="underline font-bold">{successData.moodle_user_fullname || 'الطالب'}</span>. جارية مزامنة المقررات...
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2">
              تسمية الدفعة أو التخصص <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder='مثال: "الأمن السيبراني — السنة 3" أو "هندسة البرمجيات — السنة 2"'
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 text-xs font-medium focus:outline-none focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2">
              رابط بوابة مودل الأساسي <span className="text-rose-500">*</span>
            </label>
            <input
              type="url"
              required
              dir="ltr"
              value={moodleUrl}
              onChange={(e) => setMoodleUrl(e.target.value)}
              placeholder="https://moodle.university.edu"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 text-xs font-mono focus:outline-none focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all text-left"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2">
              رمز وصول خدمة الويب لمودل (`wstoken`) <span className="text-rose-500">*</span>
            </label>
            <input
              type="password"
              required
              dir="ltr"
              value={wstoken}
              onChange={(e) => setWstoken(e.target.value)}
              placeholder="رمز مكون من 32 حرفاً سداسي عشري"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 text-xs font-mono focus:outline-none focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all text-left"
            />
          </div>

          {/* Security Notice (Figma 28:1172) */}
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <p className="leading-relaxed font-medium">
              يتم التحقق من الرمز عبر <code className="text-slate-800 font-mono">core_webservice_get_site_info</code> وتشفيره بنظام <span className="text-slate-900 font-bold">AES-256-GCM</span> قبل وصوله لقاعدة البيانات. لا يتم حفظ الرموز المجردة أبداً.
            </p>
          </div>

          {/* Actions */}
          <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={loading || !!successData}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl shadow-md shadow-blue-600/20 transition-all cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>جارٍ الاتصال والمزامنة...</span>
                </>
              ) : (
                <span>التحقق والربط الآن</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
