import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Безопасная инициализация Telegram SDK — только в реальном Telegram
if (typeof window !== 'undefined') {
  import('@telegram-apps/sdk').then(({ miniApp, viewport }) => {
    if ((window as any).Telegram?.WebApp) {
      try {
        miniApp.ready()

        if (viewport.requestFullscreen?.isAvailable?.()) {
          viewport.requestFullscreen()
        }
        if (viewport.bindCssVars?.isAvailable?.()) {
          viewport.bindCssVars()  // --tg-viewport-stable-height только в TG
        }

        console.log('Telegram SDK инициализирован (в Telegram)')
      } catch (e) {
        console.log('Telegram SDK: ошибка в TG (игнорируем)', e)
      }
    } else {
      console.log('Запуск в браузере: SDK пропущен, используем fallback 100vh')
    }
  }).catch(() => {
    console.log('SDK не загружен (браузер)')
  })
}

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element not found. Check index.html for <div id="root"></div>')
}

ReactDOM.createRoot(rootElement).render(
 
    <App />
 
)
