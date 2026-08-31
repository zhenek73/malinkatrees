import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import { config } from './config.js'
import { getDecorations, getTopDonors } from './database.js'
import { startParser } from './eosParser.js'
import { logger } from './logger.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const frontendDistPath = path.resolve(__dirname, '../../frontend/dist')

const app = express()

app.use(cors())
app.use(express.json())

app.use(express.static(frontendDistPath))

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.get('/api/decorations', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 1000
    const decorations = await getDecorations(limit)
    res.json({ success: true, data: decorations, count: decorations.length })
  } catch (error: any) {
    logger.error('[API] /api/decorations error:', String(error))
    res.status(500).json({ success: false, error: error.message })
  }
})

app.get('/api/donors', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10
    const donors = await getTopDonors(limit)
    res.json({ success: true, data: donors, count: donors.length })
  } catch (error: any) {
    logger.error('[API] /api/donors error:', String(error))
    res.status(500).json({ success: false, error: error.message })
  }
})

app.get('*', (_req, res) => {
  res.sendFile(path.join(frontendDistPath, 'index.html'))
})

export function startServer(): void {
  const port = parseInt(process.env.PORT || '4000', 10)

  app.listen(port, '0.0.0.0', () => {
    logger.info(`[Server] Listening on port ${port} (${config.nodeEnv})`)
  })

  startParser().catch((error) => {
    logger.error('[Server] Failed to start EOS parser:', String(error))
  })
}
