import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import { config } from './config.js'
import { getDecorations, getTopDonors } from './database.js'
import { startParser } from './eosParser.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ESM-compatible path resolution for static files (works on Linux/Windows)
const frontendDistPath = path.resolve(__dirname, '../../frontend/dist')

const app = express()

app.use(cors())
app.use(express.json())

// Логирование всех запросов
app.use((req, res, next) => {
  const timestamp = new Date().toISOString()
  console.log(`📥 [${timestamp}] ${req.method} ${req.path}`, req.query)
  next()
})

// Статические файлы фронтенда
app.use(express.static(frontendDistPath))

// Health check
app.get('/health', (req, res) => {
  console.log('✅ Health check requested')
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// API: Получить все украшения
app.get('/api/decorations', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 1000
    console.log(`🔍 Fetching decorations (limit: ${limit})...`)
    const decorations = await getDecorations(limit)
    console.log(`✅ Returning ${decorations.length} decorations`)
    res.json({ success: true, data: decorations, count: decorations.length })
  } catch (error: any) {
    console.error('❌ Error in /api/decorations:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// API: Получить топ дарителей
app.get('/api/donors', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10
    console.log(`🔍 Fetching top donors (limit: ${limit})...`)
    const donors = await getTopDonors(limit)
    console.log(`✅ Returning ${donors.length} top donors`)
    res.json({ success: true, data: donors, count: donors.length })
  } catch (error: any) {
    console.error('❌ Error in /api/donors:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// SPA fallback - все остальные маршруты возвращают index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendDistPath, 'index.html'))
})

export function startServer(): void {
  const port = parseInt(process.env.PORT || '4000', 10)

  app.listen(port, '0.0.0.0', () => {
    console.log('✅ Server listening on port', port)
    console.log(`🚀 Server running on http://localhost:${port}`)
    console.log(`   Environment: ${config.nodeEnv}`)
    console.log(`   Frontend: http://localhost:${port}`)
    console.log(`   API: http://localhost:${port}/api/decorations`)
  })

  // Запуск парсера транзакций
  startParser().catch((error) => {
    console.error('❌ Failed to start parser:', error)
  })
}

