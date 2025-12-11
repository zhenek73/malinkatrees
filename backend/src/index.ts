import { config } from './config.js'
import { startServer } from './server.js'

console.log('🎄 Ёлка Малинка Backend Starting...')
console.log('')

// Проверка конфигурации
if (!config.supabase.url || !config.supabase.anonKey) {
  console.error('❌ ERROR: Supabase credentials not configured!')
  console.error('   Please create .env file with:')
  console.error('   SUPABASE_URL=your_url')
  console.error('   SUPABASE_ANON_KEY=your_key')
  console.error('')
  console.error('   See .env.example for reference')
  process.exit(1)
}

console.log('✅ Configuration loaded')
console.log(`   EOS Contract: ${config.eos.contract}`)
console.log(`   EOS Account: ${config.eos.account}`)
console.log(`   Hyperion API: ${config.eos.hyperionApiUrl}`)
console.log('')

// Запуск сервера
startServer()
