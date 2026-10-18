import { useState } from 'react'
import {
  Radio,
  Lock,
  Mail,
  ShieldCheck,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff,
  GraduationCap,
  Send,
  Sparkles
} from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'

export default function LoginView() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const { error: authError } = await signIn(email, password)
      if (authError) {
        throw authError
      }
    } catch (err) {
      console.error('Login error:', err)
      setError('بيانات الاعتماد غير صحيحة. يرجى التأكد من كتابة البريد الإلكتروني وكلمة المرور بشكل دقيق.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col lg:flex-row antialiased selection:bg-blue-100 selection:text-blue-900">
      
      {/* 1. Main Admin Access Form (RTL Start: Right Side) */}
      <div className="flex-1 flex flex-col justify-between p-6 sm:p-10 lg:p-14 bg-white border-l border-slate-200/90 shadow-xs z-10">
        
        {/* Top Header / Access Restriction */}
        <div className="flex items-center justify-between">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-200/80 text-blue-700 text-xs font-semibold">
            <ShieldCheck className="w-4 h-4 text-blue-600" />
            <span>بوابة الإشراف المركزية المعتمدة</span>
          </div>

          <div className="flex items-center gap-2 lg:hidden">
            <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm shadow-blue-600/30">
              <Radio className="w-4.5 h-4.5" />
            </div>
            <span className="font-bold text-base text-slate-900">رادار مودل</span>
          </div>
        </div>

        {/* Center: Sign In Form */}
        <div className="w-full max-w-md mx-auto my-auto py-8">
          <div className="mb-8 text-right">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-100">
              لوحة تحكم المسؤول
            </span>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight mt-3 mb-2">
              تسجيل الدخول
            </h1>
            <p className="text-sm text-slate-500 leading-relaxed">
              أدخل بيانات حساب المشرف للمتابعة إلى لوحة رصد المساقات وتحديثات الطلاب.
            </p>
          </div>

          {/* Invalid Credentials Banner (Figma 28:562) */}
          {error && (
            <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200/90 text-rose-800 text-xs flex items-start gap-3 shadow-xs animate-in fade-in slide-in-from-top-2 duration-150">
              <AlertCircle className="w-5 h-5 shrink-0 text-rose-600 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold text-rose-900">فشل التحقق من الهوية</p>
                <p className="leading-relaxed text-rose-700">{error}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email Field */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-2">
                البريد الإلكتروني الأكاديمي <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="email"
                  required
                  dir="ltr"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@university.edu"
                  className="w-full pr-10 pl-3.5 py-2.5 bg-slate-50/80 border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 text-xs font-medium focus:outline-none focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all text-left"
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-2">
                كلمة المرور <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  dir="ltr"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full pr-10 pl-10 py-2.5 bg-slate-50/80 border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 text-xs font-mono focus:outline-none focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all text-left"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                  title={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit Action */}
            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 inline-flex items-center justify-center gap-2 py-3 px-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl shadow-md shadow-blue-600/25 transition-all cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>جارٍ التحقق وتأكيد الجلسة...</span>
                </>
              ) : (
                <span>تسجيل الدخول إلى النظام</span>
              )}
            </button>
          </form>

          {/* Security Note (Figma 28:457) */}
          <div className="mt-8 p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center gap-2.5 text-xs text-slate-600">
            <Lock className="w-4 h-4 text-emerald-600 shrink-0" />
            <p className="leading-relaxed">
              جلسة العمل مشفرة بالكامل ومحمية وفق معايير الأمان المعتمدة في الخوادم السحابية.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-6 border-t border-slate-100 text-xs text-slate-500">
          <span>نظام Moodle Radar الجامعي &copy; {new Date().getFullYear()}</span>
          <span className="font-mono text-[11px] text-slate-400">الإصدار v1.0.0 (Arabic Light)</span>
        </div>
      </div>

      {/* 2. Product Introduction & Mission (RTL End: Left Side) */}
      <div className="hidden lg:flex lg:w-[480px] xl:w-[540px] bg-slate-100/90 border-r border-slate-200 flex-col justify-between p-10 xl:p-14 relative overflow-hidden">
        
        {/* Background Subtle Gradient Grid */}
        <div className="absolute inset-0 bg-radial from-blue-50/50 via-slate-100 to-slate-200 pointer-events-none" />
        
        {/* Header Branding */}
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-600/30">
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <div className="font-black text-lg text-slate-900 tracking-tight leading-none">
                رادار مودل
              </div>
              <div className="text-[11px] font-semibold text-blue-600 mt-1">
                Moodle Radar Admin
              </div>
            </div>
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100/80 border border-emerald-300 text-emerald-800 text-xs font-bold">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>جاهزية 99.9%</span>
          </div>
        </div>

        {/* Center: Mission & Connection Diagram (Figma 28:475) */}
        <div className="relative z-10 py-10 space-y-6">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-blue-100/70 text-blue-800 text-xs font-bold">
              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              <span>مراقبة ذكية وبث فوري</span>
            </div>
            <h2 className="text-2xl xl:text-3xl font-black text-slate-900 leading-tight">
              المراقبة اللحظية لمساقاتك الجامعية وإشعار الطلاب دون انقطاع.
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              جسر ربط ذاتي الاستقلالية يراقب التحديثات والإعلانات والواجبات على منصة مودل وينقلها فوراً عبر بوت تيليجرام بمعدل فحص كل 10 دقائق.
            </p>
          </div>

          {/* Connection Diagram Treatement */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-sm relative overflow-hidden">
            {/* Concentric radar rings */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-40">
              <div className="w-56 h-56 rounded-full border border-blue-200" />
              <div className="w-40 h-40 rounded-full border border-blue-300 absolute" />
              <div className="w-24 h-24 rounded-full border border-blue-400 absolute" />
            </div>

            {/* 3 Interconnected Nodes */}
            <div className="relative z-10 grid grid-cols-3 items-center text-center gap-2">
              {/* Moodle Source */}
              <div className="flex flex-col items-center">
                <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center shadow-xs mb-2">
                  <GraduationCap className="w-6 h-6" />
                </div>
                <span className="text-xs font-bold text-slate-800">بوابة مودل</span>
                <span className="text-[10px] text-slate-500">مصدر المساقات</span>
              </div>

              {/* Radar Bridge (Center) */}
              <div className="flex flex-col items-center relative">
                <div className="w-14 h-14 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-600/30 mb-2">
                  <Radio className="w-7 h-7 animate-pulse" />
                </div>
                <span className="text-xs font-bold text-blue-700">رادار مودل</span>
                <span className="text-[10px] text-slate-500">محرك الفحص الدوري</span>
              </div>

              {/* Telegram Destination */}
              <div className="flex flex-col items-center">
                <div className="w-12 h-12 rounded-2xl bg-sky-50 border border-sky-200 text-sky-700 flex items-center justify-center shadow-xs mb-2">
                  <Send className="w-6 h-6" />
                </div>
                <span className="text-xs font-bold text-slate-800">بوت تيليجرام</span>
                <span className="text-[10px] text-slate-500">إشعارات الطلاب</span>
              </div>
            </div>
          </div>
        </div>

        {/* Environment Footer */}
        <div className="relative z-10 flex items-center justify-between text-xs text-slate-500 pt-4 border-t border-slate-200/80">
          <span>بيئة سحابية فائقة الأمان</span>
          <span className="font-semibold text-slate-700">تشفير AES-256-GCM للتوكنات</span>
        </div>
      </div>
    </div>
  )
}
