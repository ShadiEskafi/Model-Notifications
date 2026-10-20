import { useState } from 'react'
import {
  X,
  KeyRound,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Eye,
  EyeOff,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Lock,
} from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'

function OnboardDonorModalDialog({ onClose, onSuccess, donorToEdit = null }) {
  const isEdit = Boolean(donorToEdit)
  const initialMode = donorToEdit?.auth_mode === 'credentials' ? 'credentials' : 'credentials'

  const [authMode, setAuthMode] = useState(initialMode)
  const [label, setLabel] = useState(donorToEdit?.label || '')
  const [moodleUrl, setMoodleUrl] = useState(donorToEdit?.moodle_base_url || 'https://moodle.university.edu')
  
  // Credentials fields
  const [username, setUsername] = useState(donorToEdit?.username || '')
  const [password, setPassword] = useState('')
  const [moodleService, setMoodleService] = useState(donorToEdit?.moodle_service || 'moodle_mobile_app')
  const [showPassword, setShowPassword] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)

  // Manual Token fields
  const [wstoken, setWstoken] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [successData, setSuccessData] = useState(null)

  const handleClose = () => {
    setError(null)
    setSuccessData(null)
    onClose()
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const payload = {
        label: label.trim(),
        moodle_base_url: moodleUrl.trim(),
        auth_mode: authMode,
      }

      if (isEdit && donorToEdit?.id) {
        payload.donor_id = donorToEdit.id
      }

      if (authMode === 'credentials') {
        payload.username = username.trim()
        payload.password = password.trim()
        payload.moodle_service = moodleService.trim() || 'moodle_mobile_app'
      } else {
        payload.wstoken = wstoken.trim()
      }

      // Call Supabase Edge Function: /sync-courses
      const { data, error: funcError } = await supabase.functions.invoke('sync-courses', {
        body: payload,
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
        throw new Error(msg || 'فشل استدعاء دالة المزامنة والربط')
      }

      if (data && !data.success) {
        throw new Error(data.message || 'فشل التحقق من صلاحية بيانات مودل')
      }

      setSuccessData(data)
      setTimeout(() => {
        onSuccess(data)
        handleClose()
      }, 1500)
    } catch (err) {
      setError(err.message || 'حدث خطأ غير متوقع أثناء معالجة التوكن والتحقق منه.')
    } finally {
      setLoading(false)
    }
  }

  const isFailing = isEdit && (donorToEdit.status === 'revoked' || donorToEdit.status === 'expired')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150 text-right max-h-[90vh] overflow-y-auto">
        
        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white/95 backdrop-blur-xs z-10">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-2xl border ${isEdit ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-blue-50 border-blue-100 text-blue-600'}`}>
              {isEdit ? <RefreshCw className="w-5 h-5" /> : <KeyRound className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900 tracking-tight">
                {isEdit ? 'تجديد وتحديث متبرع مودل' : 'إضافة حساب متبرع جديد'}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5 font-medium">
                {isEdit
                  ? `تحديث الاتصال واستئناف مراقبة مساقات "${donorToEdit.label}"`
                  : 'ربط حساب طالب لاكتشاف مساقات الدفعة والمراقبة الذاتية'}
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
          {/* Diagnostic Warning for Revoked / Invalid Tokens */}
          {isFailing && (
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
              <div>
                <span className="font-bold">الحساب غير صالح حالياً ({donorToEdit.status === 'revoked' ? 'ملغي' : 'منتهي'}): </span>
                <span className="font-medium">
                  {donorToEdit.last_error_message || 'تم رفض التوكن أو فشلت المصادقة مع مودل. أدخل بيانات الدخول المحدثة أو رمز وصول جديد لنفس الطالب.'}
                </span>
              </div>
            </div>
          )}

          {/* Student Identity Guard Indicator */}
          {isEdit && donorToEdit.moodle_user_fullname && (
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-[11px] flex items-center justify-between">
              <div>
                <span className="text-slate-500 font-medium">حساب الطالب المسجل: </span>
                <span className="font-bold text-slate-900">{donorToEdit.moodle_user_fullname}</span>
              </div>
              <span className="font-mono text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200 text-[10px]">
                معرف #{donorToEdit.moodle_user_id}
              </span>
            </div>
          )}

          {/* Mode Switcher: Self-Healing Credentials vs Manual Token */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2">
              طريقة المصادقة والمراقبة
            </label>
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-2xl border border-slate-200/80">
              <button
                type="button"
                onClick={() => setAuthMode('credentials')}
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  authMode === 'credentials'
                    ? 'bg-white text-blue-600 shadow-xs border border-slate-200/70'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>معالجة ذاتية (مستحسن)</span>
              </button>

              <button
                type="button"
                onClick={() => setAuthMode('token')}
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  authMode === 'token'
                    ? 'bg-white text-slate-800 shadow-xs border border-slate-200/70'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>رمز يدوي (wstoken)</span>
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed font-medium">
              {authMode === 'credentials'
                ? 'تتيح المعالجة الذاتية للنظام إعادة تسجيل الدخول فوراً عند انتهاء صلاحية التوكن دون توقف المراقبة، مع حماية تامة لمنع قفل الحساب.'
                : 'يتم استخدام رمز الوصول المستخرج يدوياً فقط، ويتطلب التجديد اليدوي كلما انتهت جلسته.'}
            </p>
          </div>

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
                <span className="font-bold">
                  {isEdit ? 'تم تحديث البيانات واستئناف المراقبة بنجاح!' : 'نجحت المصافحة والربط!'}
                </span>{' '}
                تم الاتصال بحساب الطالب{' '}
                <span className="underline font-bold">{successData.moodle_user_fullname || 'الطالب'}</span>.
              </div>
            </div>
          )}

          {/* Cohort Label */}
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

          {/* Moodle Base URL */}
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

          {/* Conditional Input based on authMode */}
          {authMode === 'credentials' ? (
            <>
              {/* Username Field */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">
                  اسم المستخدم أو الرقم الجامعي <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  dir="ltr"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="202100452"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 text-xs font-mono focus:outline-none focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all text-left"
                />
              </div>

              {/* Password Field */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">
                  كلمة المرور لحساب مودل <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    dir="ltr"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full px-3.5 py-2.5 pl-10 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 text-xs font-mono focus:outline-none focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all text-left"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-1"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Advanced Settings Toggle */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="text-[11px] font-bold text-slate-500 hover:text-blue-600 flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <span>خيارات متقدمة (خدمة مودل)</span>
                  {showAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>

                {showAdvanced && (
                  <div className="mt-2 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      اسم خدمة تطبيق مودل (Moodle Service Shortname)
                    </label>
                    <input
                      type="text"
                      dir="ltr"
                      value={moodleService}
                      onChange={(e) => setMoodleService(e.target.value)}
                      placeholder="moodle_mobile_app"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-900 text-xs font-mono focus:outline-none focus:border-blue-600 transition-all text-left"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">
                      القيمة الافتراضية القياسية لمودل هي <code className="font-mono">moodle_mobile_app</code>.
                    </p>
                  </div>
                )}
              </div>

              {/* Zero-Lockout & Security Notice */}
              <div className="p-3.5 rounded-2xl bg-blue-50/70 border border-blue-200/80 text-[11px] text-blue-900 flex items-start gap-2.5">
                <Lock className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold">تشفير AES-256-GCM عسكري وحماية من قفل الحساب:</p>
                  <p className="text-blue-800 leading-relaxed font-medium">
                    تُحفظ كلمة المرور مشفرة ولا تظهر لأي مستخدم كنص مجرد. يتضمن النظام آلية <span className="font-bold underline">Zero-Lockout</span>: إذا تم رفض بيانات الدخول لأي سبب، يتوقف النظام فوراً من المحاولة الأولى لحماية حسابك الجامعي من الإغلاق.
                  </p>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Manual WSToken Field */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">
                  {isEdit ? 'رمز وصول مودل الجديد (`wstoken`)' : 'رمز وصول خدمة الويب لمودل (`wstoken`)'}{' '}
                  <span className="text-rose-500">*</span>
                </label>
                <input
                  type="password"
                  required
                  dir="ltr"
                  value={wstoken}
                  onChange={(e) => setWstoken(e.target.value)}
                  placeholder={isEdit ? 'أدخل رمز الوصول الجديد الصالح (32 حرفاً)' : 'رمز مكون من 32 حرفاً سداسي عشري'}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 text-xs font-mono focus:outline-none focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all text-left"
                />
              </div>

              {/* Security Notice for Manual Token */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <p className="leading-relaxed font-medium">
                  يتم التحقق من الرمز عبر <code className="text-slate-800 font-mono">core_webservice_get_site_info</code> وتشفيره بنظام <span className="text-slate-900 font-bold">AES-256-GCM</span> قبل حفظه.
                </p>
              </div>
            </>
          )}

          {/* Form Actions */}
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
              className={`inline-flex items-center gap-2 px-5 py-2.5 text-white text-xs font-bold rounded-xl shadow-md transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                isEdit
                  ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/20'
                  : 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/20'
              }`}
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>{isEdit ? 'جارٍ التحقق وتحديث البيانات...' : 'جارٍ الاتصال والمزامنة...'}</span>
                </>
              ) : (
                <span>{isEdit ? 'التحقق وتحديث البيانات الآن' : 'التحقق والربط الآن'}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function OnboardDonorModal({ isOpen, onClose, onSuccess, donorToEdit = null }) {
  if (!isOpen) return null

  return (
    <OnboardDonorModalDialog
      key={donorToEdit?.id || 'new-donor'}
      onClose={onClose}
      onSuccess={onSuccess}
      donorToEdit={donorToEdit}
    />
  )
}
