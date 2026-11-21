import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

// 一個查詢出錯都唔可以再令成個 app 黑屏：捉住佢，顯示一個可以撳
// 「重新載入」嘅畫面，等用戶有路行，開發者又睇到係咩錯。
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error('CaLoMei crashed:', error)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[#FFF8F0] p-6 text-center text-stone-900 dark:bg-[#12100e] dark:text-stone-100">
          <div className="text-5xl">😵</div>
          <p className="text-lg font-bold">哎呀，個 app 跌咗一跤</p>
          <p className="text-sm text-stone-500 dark:text-stone-400">
            撳下面重新載入，通常就得返。仲係唔得，cap 埋下面行字畀我睇。
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-2xl bg-amber-500 px-6 py-3 font-bold text-white active:bg-amber-600"
          >
            🔄 重新載入
          </button>
          <p className="max-w-full text-xs break-words text-stone-400 dark:text-stone-500">
            {this.state.error.message}
          </p>
        </div>
      )
    }
    return this.props.children
  }
}
