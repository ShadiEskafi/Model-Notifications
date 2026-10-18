import React from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an unhandled error:', error, errorInfo)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-slate-900 text-center font-sans antialiased">
          <div className="max-w-md w-full bg-white border border-slate-200 rounded-3xl p-8 text-center shadow-xl">
            <div className="inline-flex p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 mb-4">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <h2 className="text-lg font-black text-slate-900 mb-2">
              حدث استثناء غير متوقع في التطبيق
            </h2>
            <p className="text-xs text-slate-500 mb-4 leading-relaxed font-medium">
              حدث خطأ أثناء معالجة الواجهة. بياناتك وجداول المراقبة في قاعدة البيانات آمنة تماماً.
            </p>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-left font-mono text-[11px] text-rose-700 overflow-x-auto mb-6" dir="ltr">
              {this.state.error?.message || 'Unknown runtime error'}
            </div>
            <button
              type="button"
              onClick={this.handleReset}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-600/20 transition-all cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>إعادة تحميل لوحة التحكم</span>
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
