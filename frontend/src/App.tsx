/// <reference types="react" />
import React, { useEffect, useState, useMemo, useRef, Suspense } from 'react'
import { Sparkles, X } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { fetchDecorations, fetchTopDonors } from './api'
import { Decoration, TopDonor } from './types'
import { getSupabaseClient } from './api'

const Snowfall = React.lazy(() => import('./components/Snowfall'))

interface Position {
  x: number
  y: number
}

type ModalType = 'light' | 'ball' | 'envelope' | 'gift' | 'star' | null

// Список ярких цветов для огоньков
const LIGHT_COLORS = [
  '#FFD700', // золото
  '#FF6B6B', // красный
  '#FFFFFF', // белый
  '#00D4AA', // зеленый
  '#9C27B0', // фиолетовый
  '#673AB7', // пурпурный
  '#2196F3', // синий
  '#FFEB3B', // желтый
  '#E91E63'  // розовый
]

export default function App() {
  //const [decorations, setDecorations] = useState<Decoration[]>([])

  const [decorations, setDecorations] = useState<Decoration[]>(() => {
    /* Для тестирования 
      const testLights = Array.from({ length: 300 }, (_, i): Decoration => ({
        id: -i - 1,
        type: 'light',
        from_account: 'testuser',
        username: `Тестер #${i + 1}`,
        amount: '1',
        created_at: new Date(Date.now() - i * 1000).toISOString(),
        tx_id: `test-tx-${i}`
      }))
  
      const testBalls = Array.from({ length: 66 }, (_, i): Decoration => ({
        id: -1000 - i,
        type: 'ball',
        from_account: 'testuser',
        username: `Шарик #${i + 1}`,
        amount: '10',
        created_at: new Date(Date.now() - i * 1000).toISOString(),
        tx_id: `test-ball-${i}`
      }))

      const testEnvelopes = Array.from({ length: 18 }, (_, i): Decoration => ({
        id: -2000 - i,
        type: 'candle',
        from_account: 'testuser',
        username: `Отправитель #${i + 1}`,
        text: `Текст открытки номер ${i + 1} с пожеланиями`,
        amount: '100',
        created_at: new Date(Date.now() - i * 1000).toISOString(),
        tx_id: `test-envelope-${i}`
      }))

   //   return [...testLights, ...testBalls, ...testEnvelopes]
   */
    return []  // пусто — реальные данные будут загружаться из бэкенда
  })

  const [loading, setLoading] = useState(true)
  const [modalType, setModalType] = useState<ModalType>(null)
  const [waitingForPayment, setWaitingForPayment] = useState(false)
  const [countdown, setCountdown] = useState(6)
  const [envelopeText, setenvelopeText] = useState('')
  const [giftUrl, setGiftUrl] = useState('')
  const [showDonatePanel, setShowDonatePanel] = useState(false)
  const [showLog, setShowLog] = useState(false)
  const [logTab, setLogTab] = useState<'actions' | 'donors'>('actions')
  const [topDonors, setTopDonors] = useState<TopDonor[]>([])
  const [timeLeft, setTimeLeft] = useState('')
  const [bidAmount, setBidAmount] = useState('')
  const [bidError, setBidError] = useState('')
  const [burstCount, setBurstCount] = useState(0)  // обнуляется при перезагрузке
  const [showSalute, setShowSalute] = useState(false)
  const [auctionEnded, setAuctionEnded] = useState(false)
  const [localLights, setLocalLights] = useState<number[]>([])      // индексы локальных огоньков
  const [localBalls, setLocalBalls] = useState<number[]>([])       // индексы локальных шариков
  const [localEnvelopes, setLocalEnvelopes] = useState<number[]>([]) // индексы локальных открыток
  const [showBurstCounter, setShowBurstCounter] = useState(false)  // видимость счётчика снежинок
  const [showVideoCard, setShowVideoCard] = useState(false)  // показ видео открытки
  const [isRadioExpanded, setIsRadioExpanded] = useState(false)  // расширение кнопки радио
  const [showRadioControls, setShowRadioControls] = useState(false)  // показ элементов управления радио
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const radioTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Музыкальный плеер PayCash
  const PAYCASH_SONGS = [
    '/Paycash_rave.mp3',
    '/Paycash_song.mp3',
    '/paycash3.mp3',
    '/pcsongs1.mp3',
    '/pcsongs2.mp3',
    '/pcsongs3.mp3',
    '/pcsongs4.mp3'
  ]
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Обработка лопания снежинки
  const handleBurst = () => {
    const newCount = burstCount + 1
    setBurstCount(newCount)
    setShowBurstCounter(true) // Показываем счётчик при лопании
    
    // Каждая лопнувшая снежинка → зажигает новый огонёк (следующий свободный)
    setLocalLights((prev: number[]) => {
      const nextIndex = prev.length
      if (nextIndex < lightPositions.length) return [...prev, nextIndex]
      return prev
    })
    
    // Каждые 5 лопнувших снежинок → +1 локальный шарик
    if (newCount % 5 === 0) {
      setLocalBalls((prev: number[]) => {
        const nextIndex = prev.length
        if (nextIndex < ballPositions.length) return [...prev, nextIndex]
        return prev
      })
    }
    
    // Каждые 20 лопнувших снежинок → +1 локальная открытка
    if (newCount % 20 === 0) {
      setLocalEnvelopes((prev: number[]) => {
        const nextIndex = prev.length
        if (nextIndex < envelopePositions.length) return [...prev, nextIndex]
        return prev
      })
    }
    
    // Салют каждые 20 лопнувших снежинок
    if (newCount % 20 === 0) {
      // Салют - GIF + звук
      setShowSalute(true)
      try {
        new Audio('/firework.mp3').play().catch(() => console.log('firework'))
      } catch {
        console.log('firework')
      }
      setTimeout(() => {
        setShowSalute(false)
      }, 3000)
    }
  }

  // Автоматическое скрытие счётчика через 3 секунды после последнего лопания
  useEffect(() => {
    if (showBurstCounter) {
      const timer = setTimeout(() => {
        setShowBurstCounter(false)
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [burstCount, showBurstCounter])

  // Окно ожидания с таймером обратного отсчета
  useEffect(() => {
    if (waitingForPayment) {
      setCountdown(6)
      const countdownInterval = setInterval(() => {
        setCountdown((prev: number) => {
          if (prev <= 1) {
            clearInterval(countdownInterval)
            setWaitingForPayment(false)
            // Данные обновятся автоматически через Realtime
            return 0
          }
          return prev - 1
        })
      }, 1000)

      return () => {
        clearInterval(countdownInterval)
      }
    }
  }, [waitingForPayment])

  // Загрузка данных при монтировании и Realtime подписка
  useEffect(() => {
    // Начальная загрузка данных
    loadData()
    
    // Подписка на Supabase Realtime для мгновенных обновлений
    let channel: any = null
    
    const setupRealtime = async () => {
      const supabase = await getSupabaseClient()
      if (!supabase) {
        console.warn('⚠️ [App] Supabase client not available, Realtime disabled')
        return
      }

      // Правильная подписка на изменения в БД (только новые INSERT)
      channel = supabase
        .channel('decorations-db-changes')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'decorations'
          },
          (payload: any) => {
            console.log('📡 [Realtime] New decoration inserted:', payload.new)
            const newDecoration = payload.new as Decoration

            const newDec = { ...newDecoration, createdAt: Date.now() }

            setDecorations(prev => {
              // Защита от дубликатов по id
              if (prev.some(d => d.id === newDec.id)) {
                console.log('⚠️ [Realtime] Duplicate ignored')
                return prev
              }

              console.log('✨ [Realtime] Adding new decoration')
              return [newDec, ...prev]
            })
          }
        )
        .subscribe((status: string) => {
          console.log('[Realtime] Subscription status:', status)
          if (status === 'SUBSCRIBED') {
            console.log('✅ [Realtime] Connected to database changes')
          } else if (status === 'CHANNEL_ERROR') {
            console.error('❌ [Realtime] Channel error — проверь лимиты Supabase')
          }
        })
    }
    
    setupRealtime()
    
    return () => {
      if (channel) {
        getSupabaseClient().then((client: any) => {
          if (client) {
            client.removeChannel(channel!)
            console.log('🔌 [Realtime] Unsubscribed from decorations channel')
          }
        })
      }
    }
  }, [])

  async function loadData() {
    try {
      console.log('🔄 [App] Loading data...')
      const decs = await fetchDecorations()
      console.log(`✅ [App] Loaded ${decs.length} decorations`)
      setDecorations(decs)
      setLoading(false)
    } catch (error) {
      console.error('❌ [App] Error loading data:', error)
      setLoading(false)
    }
  }

  // Функции управления музыкальным плеером
  const loadTrack = (index: number) => {
    if (audioRef.current) {
      audioRef.current.pause()
    }
    audioRef.current = new Audio(PAYCASH_SONGS[index])
  }

  // Обработка окончания трека - переход к следующему
  useEffect(() => {
    if (!audioRef.current) return
    
    const handleEnd = () => {
      const nextIndex = (currentTrackIndex + 1) % PAYCASH_SONGS.length
      setCurrentTrackIndex(nextIndex)
    }
    
    audioRef.current.addEventListener('ended', handleEnd)
    return () => {
      if (audioRef.current) {
        audioRef.current.removeEventListener('ended', handleEnd)
      }
    }
  }, [currentTrackIndex])

  // Загрузка трека при изменении индекса
  useEffect(() => {
    const wasPlaying = isPlaying && audioRef.current
    loadTrack(currentTrackIndex)
    if (wasPlaying && audioRef.current) {
      audioRef.current.play().catch((err: unknown) => {
        console.log('Ошибка воспроизведения:', err)
        setIsPlaying(false)
      })
    }
  }, [currentTrackIndex])

  const togglePlay = () => {
    if (!audioRef.current) {
      loadTrack(currentTrackIndex)
    }
    
    if (isPlaying) {
      audioRef.current?.pause()
      setIsPlaying(false)
      // При паузе полностью сворачиваем кнопку радио
      setIsRadioExpanded(false)
      setShowRadioControls(false)
      if (radioTimeoutRef.current) {
        clearTimeout(radioTimeoutRef.current)
        radioTimeoutRef.current = null
      }
    } else {
      audioRef.current?.play().catch((err: unknown) => {
        console.log('Ошибка воспроизведения:', err)
        setIsPlaying(false)
      })
      setIsPlaying(true)
    }
  }

  // Таймер автоскрытия контролов радио через 10 секунд
  useEffect(() => {
    if (showRadioControls && isRadioExpanded) {
      if (radioTimeoutRef.current) {
        clearTimeout(radioTimeoutRef.current)
      }
      radioTimeoutRef.current = setTimeout(() => {
        setShowRadioControls(false)
        radioTimeoutRef.current = null
      }, 10000)
      return () => {
        if (radioTimeoutRef.current) {
          clearTimeout(radioTimeoutRef.current)
          radioTimeoutRef.current = null
        }
      }
    }
  }, [showRadioControls, isRadioExpanded])

  // Сброс таймера при взаимодействии с контролами
  const resetRadioTimeout = () => {
    if (radioTimeoutRef.current) {
      clearTimeout(radioTimeoutRef.current)
      radioTimeoutRef.current = null
    }
    if (isRadioExpanded) {
      setShowRadioControls(true)
    }
  }

  const playNext = () => {
    const wasPlaying = isPlaying
    if (audioRef.current) {
      audioRef.current.pause()
    }
    const nextIndex = (currentTrackIndex + 1) % PAYCASH_SONGS.length
    setCurrentTrackIndex(nextIndex)
    loadTrack(nextIndex)
    if (wasPlaying) {
      audioRef.current?.play().catch((err: unknown) => {
        console.log('Ошибка воспроизведения:', err)
        setIsPlaying(false)
      })
    }
  }

  const playPrev = () => {
    const wasPlaying = isPlaying
    if (audioRef.current) {
      audioRef.current.pause()
    }
    const prevIndex = (currentTrackIndex - 1 + PAYCASH_SONGS.length) % PAYCASH_SONGS.length
    setCurrentTrackIndex(prevIndex)
    loadTrack(prevIndex)
    if (wasPlaying) {
      audioRef.current?.play().catch((err: unknown) => {
        console.log('Ошибка воспроизведения:', err)
        setIsPlaying(false)
      })
    }
  }


  // Подсчёт статистики
  const stats = useMemo(() => {
    const lightsAmount = decorations
      .filter(d => d.type?.toLowerCase() === 'light')
      .reduce((sum, d) => sum + (typeof d.amount === 'number' ? d.amount : parseFloat(d.amount || '0')), 0)
    const balls = decorations.filter(d => d.type?.toLowerCase() === 'ball').length
    const envelopes = decorations.filter(d => d.type?.toLowerCase() === 'candle' || d.type?.toLowerCase() === 'envelope').length
    const gifts = decorations.filter(d => d.type?.toLowerCase() === 'gift').length
    const total = decorations.length
    return { lights: Math.floor(lightsAmount), balls, envelopes, gifts, total }
  }, [decorations])


  // Расчёт лидирующей ставки на звезду
  const starBids = useMemo(() => {
    const bids = decorations
      .filter(d => d.type?.toLowerCase() === 'star')
      .sort((a, b) => {
        const amtA = typeof a.amount === 'number' ? a.amount : parseFloat(a.amount || '0')
        const amtB = typeof b.amount === 'number' ? b.amount : parseFloat(b.amount || '0')
        return amtB - amtA
      })
    
    // Убираем дубли по сумме, оставляем только максимальную
    const uniqueBids = []
    const seenAmounts = new Set()
    for (const bid of bids) {
      const amt = typeof bid.amount === 'number' ? bid.amount : parseFloat(bid.amount || '0')
      if (!seenAmounts.has(amt)) {
        seenAmounts.add(amt)
        uniqueBids.push(bid)
      }
    }
    return uniqueBids
  }, [decorations])

  const currentBid = starBids.length > 0 ? (typeof starBids[0].amount === 'number' ? starBids[0].amount : parseFloat(starBids[0].amount || '0')) : 1000  // минимум 1001, но считаем от 1000
  const minBid = currentBid + 1

  // Обработчик изменения ставки
  const handleBidChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setBidAmount(value)
    if (value && parseFloat(value) <= currentBid) {
      setBidError(`Сумма должна быть выше текущей ставки (${currentBid.toFixed(6)} MLNK)`)
    } else {
      setBidError('')
    }
  }

  // Таймер обратного отсчёта до конца аукциона
  useEffect(() => {
    const auctionEnd = new Date('2025-12-29T23:59:59')
    const updateTimer = () => {
      const now = new Date()
      const diff = auctionEnd.getTime() - now.getTime()
      if (diff <= 0) {
        setTimeLeft('Аукцион завершён')
        setAuctionEnded(true)
        return
      }
      const days = Math.floor(diff / (1000 * 60 * 60 * 24))
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
      const seconds = Math.floor((diff % (1000 * 60)) / 1000)
      setTimeLeft(`${days}д ${hours}ч ${minutes}м ${seconds}с`)
    }
    updateTimer() // Вызываем сразу для немедленного отображения
    const timer = setInterval(updateTimer, 1000)
    return () => clearInterval(timer)
  }, [])

  // Позиции лампочек из JSON файла
  const [lightPositions, setLightPositions] = useState<Position[]>([])
  
  // Ref для фонового изображения ёлки
  const treeImageRef = useRef<HTMLImageElement>(null)
  
  // Состояние для размеров и позиции реального изображения на экране
  const [imageBounds, setImageBounds] = useState<{
    left: number
    top: number
    width: number
    height: number
  } | null>(null)

  useEffect(() => {
    fetch('/light-positions.json')
      .then(res => res.json())
      .then(data => setLightPositions(data))
      .catch(() => {
        // Fallback позиции из маски заказчика (512×1024)
        setLightPositions([
          {"x":318,"y":122},{"x":810,"y":139},{"x":780,"y":287},{"x":750,"y":332},
          {"x":403,"y":406},{"x":455,"y":424},{"x":486,"y":431},{"x":516,"y":438},
          {"x":546,"y":441},{"x":576,"y":448},{"x":606,"y":451},{"x":364,"y":473},
          {"x":395,"y":482},{"x":425,"y":488},{"x":446,"y":491},{"x":479,"y":500},
          {"x":518,"y":505},{"x":550,"y":508},{"x":587,"y":515},{"x":622,"y":517},
          {"x":661,"y":517},{"x":311,"y":554},{"x":335,"y":564},{"x":371,"y":570},
          {"x":402,"y":575},{"x":428,"y":581},{"x":456,"y":585},{"x":485,"y":588},
          {"x":511,"y":591},{"x":539,"y":594},{"x":567,"y":597},{"x":595,"y":600},
          {"x":631,"y":599},{"x":663,"y":604},{"x":691,"y":604},{"x":719,"y":604},
          {"x":739,"y":601},{"x":231,"y":642},{"x":256,"y":650},{"x":284,"y":657},
          {"x":321,"y":665},{"x":360,"y":670},{"x":401,"y":675},{"x":433,"y":680},
          {"x":464,"y":684},{"x":493,"y":686},{"x":524,"y":689},{"x":555,"y":692},
          {"x":587,"y":695},{"x":622,"y":697},{"x":657,"y":700},{"x":690,"y":700},
          {"x":718,"y":700},{"x":746,"y":697},{"x":772,"y":695},{"x":801,"y":675}
        ])
      })
  }, [])

//добавляем шарики
  const [ballPositions, setBallPositions] = useState<Position[]>([])

  useEffect(() => {
    fetch('/ball-positions.json')
      .then(res => res.json())
      .then(data => setBallPositions(data))
      .catch(() => setBallPositions([]))
  }, [])

  // Загрузка позиций открыток (конвертов)
  const [envelopePositions, setEnvelopePositions] = useState<Position[]>([])

  useEffect(() => {
    fetch('/envelope-positions.json')
      .then(res => res.json())
      .then(data => setEnvelopePositions(data))
      .catch(() => setEnvelopePositions([]))
  }, [])

  // Вычисление реальных размеров и позиции изображения на экране
  // Вычисление реальных видимых границ картинки при object-fit: contain
useEffect(() => {
  const updateImageBounds = () => {
    const img = treeImageRef.current;
    if (!img) return;

    const container = img.parentElement;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const naturalWidth = img.naturalWidth;
    const naturalHeight = img.naturalHeight;

    if (!naturalWidth || !naturalHeight) return;

    const containerW = containerRect.width;
    const containerH = containerRect.height;

    const scale = Math.min(
      containerW / naturalWidth,
      containerH / naturalHeight
    );

    const displayWidth = naturalWidth * scale;
    const displayHeight = naturalHeight * scale;

    const offsetLeft = (containerW - displayWidth) / 2;
    const offsetTop = (containerH - displayHeight) / 2;

    setImageBounds({
      left: offsetLeft,
      top: offsetTop,
      width: displayWidth,
      height: displayHeight
    });
  };

  updateImageBounds();
  window.addEventListener("resize", updateImageBounds);
  treeImageRef.current?.addEventListener("load", updateImageBounds);

  return () => {
    window.removeEventListener("resize", updateImageBounds);
    treeImageRef.current?.removeEventListener("load", updateImageBounds);
  };
}, []);


  // Случайные цвета и задержки для каждого огонька (стабильные при каждом рендере)
  const lightColors = useMemo(() => {
    return lightPositions.map(() => 
      LIGHT_COLORS[Math.floor(Math.random() * LIGHT_COLORS.length)]
    )
  }, [lightPositions])

  // Случайные задержки анимации для эффекта волн
  const lightDelays = useMemo(() => {
    return lightPositions.map(() => Math.random() * 2)
  }, [lightPositions])

  
  
  

  // Генерация позиций для украшений (шарики, свечи, подарки)
  const decorationPositions = useMemo(() => {
    const positions: Map<number, Position> = new Map()
    decorations.forEach((dec, index) => {
      if (dec.type?.toLowerCase() !== 'light' && !positions.has(index)) {
        // Случайные позиции на ветках
        positions.set(index, {
          x: 80 + (index % 5) * 40 + Math.random() * 20,
          y: 150 + Math.floor(index / 5) * 60 + Math.random() * 30
        })
      }
    })
    return positions
  }, [decorations])

  // Генерация QR-кода в JSON формате для PayCash
  const getQRCodeData = (type: ModalType): string => {
    const baseData = {
      symbol: "MLNK",
      address: "malinkatrees",
      precision: 6,
      contract: "swap.pcash",
      protocol: "ScanProtocol",
      action: "transfer",
      memo: "",
      amount: 0
    }
    
    switch (type) {
      case 'light':
        return JSON.stringify({
          ...baseData,
          amount: 1.000000,
          memo: ""
        })
      case 'ball':
        return JSON.stringify({
          ...baseData,
          amount: 10.000000,
          memo: ""
        })
      case 'envelope':
        return JSON.stringify({
          ...baseData,
          amount: 100.000000,
          memo: envelopeText.trim().substring(0, 200) || ""
        })
      case 'gift':
        return JSON.stringify({
          ...baseData,
          amount: 1000.000000,
          memo: giftUrl.trim() || ""
        })
      case 'star':
        const amount = parseFloat(bidAmount) || minBid
        return JSON.stringify({
          ...baseData,
          amount: amount.toFixed(6),
          memo: "звезда"
        })
      default:
        return ''
    }
  }

  const handleOpenModal = (type: ModalType) => {
    setModalType(type)
    setWaitingForPayment(false)
    setShowDonatePanel(false)
    if (type === 'envelope') setenvelopeText('')
    if (type === 'gift') setGiftUrl('')
    if (type === 'star') {
      setBidAmount('')
      setBidError('')
    }
  }

  const handlePaymentDone = () => {
    setWaitingForPayment(true)
    setModalType(null)
    // Ждём 8–10 секунд (время подтверждения в EOS + парсер) и подтягиваем свежие данные
    setTimeout(async () => {
      await loadData()  // принудительно обновляем decorations
      setWaitingForPayment(false)
      console.log('✅ [App] Forced reload after payment')
    }, 10000)  // 10 секунд — достаточно для EOS блока + парсера
  }

  const handleCloseModal = () => {
    setModalType(null)
    setWaitingForPayment(false)
  }

  // Все действия (все украшения)
  const allActions = useMemo(() => {
    return decorations.slice()
  }, [decorations])

  // Группировка украшений по дарителям для детальной статистики
  const donorStats = useMemo(() => {
    const stats = new Map<string, {
      lights: number
      balls: number
      envelopes: number
      stars: number
      total: number
    }>()

    decorations.forEach(dec => {
      const account = dec.from_account
      if (!stats.has(account)) {
        stats.set(account, { lights: 0, balls: 0, envelopes: 0, stars: 0, total: 0 })
      }
      const stat = stats.get(account)!
      const type = dec.type?.toLowerCase()
      
      if (type === 'light') {
        stat.lights += Math.floor(typeof dec.amount === 'number' ? dec.amount : parseFloat(dec.amount || '0'))
      } else if (type === 'ball') {
        stat.balls += 1
      } else if (type === 'envelope' || type === 'candle') {
        stat.envelopes += 1
      } else if (type === 'star') {
        stat.stars += 1
      }
      const amountValue = typeof dec.amount === 'number' ? dec.amount : (typeof dec.amount === 'string' ? parseFloat(dec.amount) : 0)
      stat.total += amountValue
    })

    return stats
  }, [decorations])

  // Загрузка топ дарителей
  useEffect(() => {
    if (showLog && logTab === 'donors') {
      fetchTopDonors(50).then(setTopDonors)
    }
  }, [showLog, logTab])

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black overflow-hidden">
      {/* Снег — на весь экран, вне контейнера ёлки, не перерендеривается */}
      <Suspense fallback={null}>
        <Snowfall onBurst={handleBurst} />
      </Suspense>

      <div 
        className="relative w-full max-w-lg mx-auto flex items-center justify-center"
        style={{ 
          height: 'var(--tg-viewport-stable-height, 100vh)',
          aspectRatio: '512 / 1024'
        }}
      >
        {/* Фоновое изображение ёлки на весь экран */}
        <img 
          ref={treeImageRef}
          src="/tree-base.png" 
          alt="Christmas Tree" 
          className="absolute inset-0 w-full h-full object-contain object-center pointer-events-none z-1"
        />


      {/* Огоньки — точное позиционирование через imageBounds */}
      <div className="absolute inset-0 pointer-events-none z-15">
      {(stats.lights + localLights.length) > 0 && imageBounds && lightPositions.length > 0 && (() => {
  // Подсчитываем количество свежих огоньков
  const freshLights = decorations.filter(d => 
    d.type?.toLowerCase() === 'light' && 
    d.createdAt && 
    (Date.now() - d.createdAt) < 60000
  ).length
  
  const totalLights = stats.lights + localLights.length
  const isFullyLit = localLights.length >= 100
  
  // КРИТИЧНО: максимум видимых огоньков = количество позиций в JSON
  // Если в light-positions.json 83 позиции — будет максимум 83 огонька
  const MAX_VISIBLE_LIGHTS = Number(import.meta.env.VITE_MAX_VISIBLE_LIGHTS ?? 690)

  // Или временно захардкодь: const MAX_VISIBLE_LIGHTS = 690

  const renderCount = Math.min(totalLights, MAX_VISIBLE_LIGHTS)

  return Array.from({ length: renderCount }, (_, i) => {
    const isLocal = i >= stats.lights
    const pos = lightPositions[i % lightPositions.length]  // цикл по позициям
    const color = lightColors[i % lightColors.length] || LIGHT_COLORS[0]
    const delay = lightDelays[i % lightDelays.length] || 0
    
    // Последние N огоньков считаются свежими
    const isFresh = !isLocal && i >= stats.lights - freshLights && freshLights > 0
    const lightSize = isFullyLit ? (isFresh ? 0.025 : 0.018) : (isFresh ? 0.021 : 0.014)
    const lightBrightness = isFullyLit ? 1.8 : (isFresh ? 1.5 : 1)

    const relX = pos.x / 1024
    const relY = pos.y / 2048

    const screenX = imageBounds.left + relX * imageBounds.width
    const screenY = imageBounds.top + relY * imageBounds.height

    return (
      <div
        key={`light-${i}`}
        className={`absolute transition-all duration-1000 ${isFresh ? 'animate-pulse drop-shadow-glow' : ''}`}
        style={{
          left: `${screenX}px`,
          top: `${screenY}px`,
          width: imageBounds ? `${imageBounds.width * lightSize}px` : (isFresh ? '21px' : '14px'),
          height: imageBounds ? `${imageBounds.width * lightSize}px` : (isFresh ? '21px' : '14px'),
          backgroundColor: color,
          borderRadius: '50%',
          transform: `translate(-50%, -50%) ${isFresh ? 'scale(1.5)' : 'scale(1)'}`,
          filter: `brightness(${lightBrightness}) blur(1px)`,
          boxShadow: `
            
            0 0 ${imageBounds ? imageBounds.width * (isFresh ? 0.18 : 0.12) : (isFresh ? 90 : 60)}px ${color}40`,
          opacity: isFresh ? 1 : 0.9,
          animation: `pulse ${0.8 + Math.random() * 0.8}s ease-in-out infinite`,
          animationDelay: `${delay}s`,
        }}
      />
    )
  })
})()}
      </div>
      
     {/* Шарики — точное позиционирование */}
<div className="absolute inset-0 pointer-events-none z-30">
  {(stats.balls + localBalls.length) > 0 && imageBounds && ballPositions.length > 0 && (
    Array.from({ length: stats.balls + localBalls.length }, (_, i) => {
      const pos = ballPositions[i % ballPositions.length]
      const isLocal = i >= stats.balls
      const ball = isLocal ? null : decorations.filter(d => d.type === 'ball')[i]
      const username = isLocal ? 'Zhenek' : (ball?.username || 'Аноним')

      const relX = pos.x / 1024
      const relY = pos.y / 2048
      
      const SPREAD_X = 1.1
      const SPREAD_Y = 1.1
      
      const adjustedRelX = 0.5 + (relX - 0.5) * SPREAD_X
      const adjustedRelY = 0.5 + (relY - 0.5) * SPREAD_Y
      
      const screenX = imageBounds.left + adjustedRelX * imageBounds.width
      const screenY = imageBounds.top + adjustedRelY * imageBounds.height + 13

      const isFresh = !isLocal && ball?.createdAt && (Date.now() - ball.createdAt) < 60000

      return (
        <div
          key={`ball-${i}`}
          className={`group absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto hover:animate-wiggle transition-all duration-1000 ${isFresh ? 'animate-bounce-slight drop-shadow-glow' : ''}`}
          style={{
            left: `${screenX}px`,
            top: `${screenY}px`,
            transform: `translate(-50%, -50%) ${isFresh ? 'scale(1.25)' : 'scale(1)'}`,
            zIndex: 30, // базовый z-index
          }}
          // 🎈 ДОБАВЛЯЕМ МАГИЮ ДЛЯ ШАРИКОВ
          onMouseEnter={(e) => {
            e.currentTarget.style.zIndex = '9999'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.zIndex = '30'
          }}
        >
          <img
            src="/malinka-ball.svg"
            alt="Шарик"
            style={{
              width: imageBounds ? `${imageBounds.width * (isFresh ? 0.09375 : 0.075)}px` : (isFresh ? '60px' : '48px'),
              height: 'auto',
              filter: isFresh ? 'brightness(1.5) drop-shadow(0 4px 8px rgba(0,0,0,0.5))' : 'drop-shadow(0 4px 8px rgba(0,0,0,0.5))'
            }}
          />
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            <div className="bg-yellow-400 text-black text-xs font-bold px-3 py-1 rounded-lg shadow-lg whitespace-nowrap">
              {username}
            </div>
          </div>
        </div>
      )
    })
  )}
  {/* Открытки (конверты) — фиксированные позиции через imageBounds */}
  {/*объединил шарики и открытки в один слой. пока не ясно чем это грозит если что было так
  
       </div>
    <div className="absolute inset-0 pointer-events-none z-30">
 */}
  {(stats.envelopes + localEnvelopes.length) > 0 && imageBounds && envelopePositions.length > 0 && (
    Array.from({ length: stats.envelopes + localEnvelopes.length }, (_, i) => {
      const pos = envelopePositions[i % envelopePositions.length]
      const isLocal = i >= stats.envelopes
      const envelope = isLocal ? null : decorations.filter(d => d.type?.toLowerCase() === 'candle' || d.type?.toLowerCase() === 'envelope')[i]
      const username = isLocal ? 'Zhenek' : (envelope?.username || envelope?.from_account || 'Аноним')
      const text = isLocal ? 'Здесь могло бы быть Ваше поздравление!😉' : (envelope?.text || null)

      const relX = pos.x / 1024
      const relY = pos.y / 2048

      const screenX = imageBounds.left + relX * imageBounds.width
      const screenY = imageBounds.top + relY * imageBounds.height

      const isFresh = !isLocal && envelope?.createdAt && (Date.now() - envelope.createdAt) < 60000

      return (
        <div
          key={`envelope-${i}`}
          className={`group absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto hover:animate-wiggle transition-all duration-1000 ${isFresh ? 'animate-pulse drop-shadow-glow' : ''}`}
          style={{
            left: `${screenX}px`,
            top: `${screenY}px`,
            transform: `translate(-50%, -50%) ${isFresh ? 'scale(1.5)' : 'scale(1)'}`,
            zIndex: 30, // базовый z-index
          }}
          // 🔥 ДОБАВЛЯЕМ ДИНАМИЧЕСКИЙ z-index через inline стиль
          onMouseEnter={(e) => {
            e.currentTarget.style.zIndex = '9999'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.zIndex = '30'
          }}
        >
          <img
            src="/envelope.png"
            alt="Открытка"
            style={{
              width: imageBounds ? `${imageBounds.width * (isFresh ? 0.075 : 0.05)}px` : (isFresh ? '72px' : '48px'),
              height: 'auto',
              filter: isFresh ? 'brightness(1.5) drop-shadow(0 4px 8px rgba(0,0,0,0.5))' : 'drop-shadow(0 4px 8px rgba(0,0,0,0.5))'
            }}
          />
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            <div className="bg-yellow-400 text-black text-xs font-bold px-3 py-2 rounded-lg shadow-lg border border-yellow-600 max-w-[200px]">
              <div className="font-semibold">{username}:</div>
              {text && (
                <div className="text-xs mt-1 leading-tight">{text}</div>
              )}
            </div>
            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 w-0 h-0 border-l-8 border-r-8 border-t-8 border-transparent border-t-yellow-400"></div>
          </div>
        </div>
      )
    })
  )}
</div>
      
      {/* Гифки - полноразмерные */}
      {decorations
        .filter(d => d.type?.toLowerCase() === 'gift')
        .map((_, i) => {
          const pos = decorationPositions.get(i)
          if (!pos) return null
          return (
            <img
              key={`gift-${i}`}
              src=""
              alt="Gift"
              className="gift-gif absolute"
              style={{
                left: `${(pos.x / 320) * 100}%`,
                top: `${(pos.y / 400) * 100}%`,
                width: '80px',
                height: '80px',
                transform: 'translate(-50%, -50%)',
                zIndex: 30
              }}
            />
          )
        })}
      
      {/* Сияющая пятиконечная звезда на макушке */}
      {imageBounds && (
        <div 
          className="group absolute left-1/2 z-45"
          style={{
            top: `${imageBounds.top + imageBounds.height * 0.267}px`,
            transform: 'translateX(calc(-50% - 2px))',
            opacity: auctionEnded || localLights.length >= 100 ? 1 : 0,
            transition: 'opacity 1s ease-in-out',
          }}
        >
          <div 
            className="relative animate-pulse-slow"
            style={{
              width: `${imageBounds.width * 0.15}px`,
              height: `${imageBounds.width * 0.15}px`,
            }}
          >
          <div className="absolute inset-0 bg-gradient-to-br from-yellow-300 via-yellow-500 to-amber-600 rounded-full blur-md animate-glow"></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-2xl">
              <path 
                d="M50 0 L61 35 L98 35 L67 57 L76 90 L50 70 L24 90 L33 57 L2 35 L39 35 Z" 
                fill="#FFD700" 
                stroke="#FFAA00" 
                strokeWidth="2"
              />
            </svg>
          </div>
          <div className="absolute inset-0 animate-spin-slow opacity-70">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1 h-12 bg-yellow-400 blur-sm"></div>
            <div className="absolute top-1/2 left-0 -translate-y-1/2 w-12 h-1 bg-yellow-400 blur-sm"></div>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rotate-45 w-12 h-1 bg-yellow-400 blur-sm"></div>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-45 w-12 h-1 bg-yellow-400 blur-sm"></div>
          </div>
        </div>
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-[100]">
            <div className="bg-yellow-400 text-black text-sm font-bold px-4 py-2 rounded-lg shadow-lg whitespace-nowrap">
              {localLights.length >= 100 && !auctionEnded ? 'Поздравляю! Ты зажёг звезду!' : (starBids.length > 0 ? `Звезду зажёг ${starBids[0].username || starBids[0].from_account}! С Новым годом, друзья!` : 'победитель! С Новым годом, друзья!')}
            </div>
            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 w-0 h-0 border-l-8 border-r-8 border-t-8 border-transparent border-t-yellow-400"></div>
          </div>
        </div>
      )}


      {/* Кнопка "Украсить ёлку" внизу (поднята выше) */}
      {!showVideoCard && (
      <div className="absolute left-1/2 -translate-x-1/2 z-40 w-full px-4" style={{ bottom: 'max(16px, env(safe-area-inset-bottom, var(--tg-content-safe-area-inset-bottom, 20px)))' }}>
        {!showDonatePanel ? (
          <button
            onClick={() => setShowDonatePanel(true)}
            className="w-full bg-gradient-to-r from-pink-600 to-purple-600 text-white font-bold py-4 px-8 rounded-full text-xl shadow-2xl hover:scale-105 transition"
          >
            🎄 Украсить ёлку
          </button>
        ) : (
          <div className="bg-black/80 backdrop-blur-sm rounded-2xl p-4 space-y-2">
            {/* Кнопки доната */}
            <button 
              onClick={() => handleOpenModal('light')}
              className="w-full bg-gradient-to-r from-pink-600 to-purple-600 text-white font-bold py-3 px-6 rounded-full text-lg shadow-xl hover:scale-105 transition"
            >
              💡 Огонёк (1 MLNK)
            </button>
            
            <button 
              onClick={() => handleOpenModal('ball')}
              className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-bold py-3 px-6 rounded-full text-lg shadow-xl hover:scale-105 transition flex items-center justify-center gap-2"
            >
              <img src="/malinka-ball.svg" className="w-8 h-8" alt="Шарик" />
              Шарик (10 MLNK)
            </button>
            
            <button 
              onClick={() => handleOpenModal('envelope')}
              className="w-full bg-gradient-to-r from-yellow-500 via-amber-500 to-yellow-600 text-white font-bold py-3 px-6 rounded-full text-lg shadow-xl hover:scale-105 transition flex items-center justify-center gap-2"
            >
              <img src="/envelope.png" className="w-6 h-8" alt="Открытка" />
              Открытка (100 MLNK)
            </button>
            
            <button 
              onClick={() => handleOpenModal('star')}
              disabled={auctionEnded}
              className={`w-full text-white font-bold py-3 px-6 rounded-full text-lg shadow-xl transition ${
                auctionEnded 
                  ? 'bg-gray-600 cursor-not-allowed opacity-50' 
                  : 'bg-gradient-to-r from-yellow-600 to-orange-600 hover:scale-105 animate-pulse-slow'
              }`}
            >
              ⭐ Зажечь звезду (∞ MLNK)
            </button>

            {/* Кнопка открытия лога */}
            <button
              onClick={() => setShowLog(true)}
              className="w-full bg-gray-700 text-white font-bold py-2 px-4 rounded-full text-sm hover:bg-gray-600 transition"
            >
              📜 Лог действий ({allActions.length})
            </button>

            {/* Кнопка закрытия панели */}
            <button
              onClick={() => setShowDonatePanel(false)}
              className="w-full text-gray-300 text-sm py-2 hover:text-white transition"
            >
              Скрыть
            </button>
          </div>
        )}
      </div>
      )}

      {/* Статус ожидания оплаты с таймером */}
      {waitingForPayment && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4" onClick={handleCloseModal}>
          <div className="bg-gradient-to-br from-purple-900 to-pink-900 rounded-2xl p-6 md:p-8 text-center w-full max-w-md mx-4 md:mx-auto my-8 max-h-full overflow-y-auto border-2 border-yellow-500/50 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="animate-spin mb-4">
              <Sparkles className="w-16 h-16 text-yellow-400 mx-auto" />
            </div>
            <h3 className="text-2xl font-bold text-white mb-2 animate-pulse">
              Ожидаем подтверждения...
            </h3>
            <div className="text-6xl font-bold text-yellow-400 mb-4">
              {countdown}
            </div>
            <p className="text-pink-200 mb-2">Обычно это занимает 10–30 секунд</p>
            <p className="text-yellow-300 text-sm mb-4">
              Автообновление каждые 5 секунд
            </p>
            <button
              onClick={() => {
                setWaitingForPayment(false)
                loadData()
              }}
              className="mt-4 text-gray-300 hover:text-white underline text-sm transition"
            >
              Закрыть
            </button>
          </div>
        </div>
      )}

      {/* Специальная модалка для аукциона звезды */}
      {modalType === 'star' && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4" onClick={handleCloseModal}>
          <div className="bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 rounded-3xl p-6 md:p-8 w-full max-w-md mx-4 md:mx-auto my-8 max-h-full overflow-y-auto relative border-4 border-yellow-500/70 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <button onClick={handleCloseModal} className="absolute top-4 right-4 text-white/70 hover:text-white">
              <X className="w-6 h-6" />
            </button>

            <h2 className="text-3xl font-bold text-yellow-400 mb-4 text-center animate-pulse">
              ⭐ Аукцион звезды ⭐
            </h2>

            <div className="text-center space-y-4 text-white">
              <p className="text-lg">Текущая ставка: <span className="text-yellow-400 font-bold">{currentBid.toFixed(6)} MLNK</span></p>
              <p className="text-pink-300 text-sm">Ваша ставка должна быть выше</p>
              <p className="text-2xl font-bold text-yellow-300">{timeLeft}</p>
              <p className="text-sm text-gray-300">С победителем свяжемся через PayCash</p>
              <p className="text-pink-400 text-xs">Проигравшие ставки не возвращаются</p>
            </div>

            <div className="my-6">
              <input
                type="number"
                step="0.000001"
                value={bidAmount}
                onChange={handleBidChange}
                placeholder={`Минимум ${minBid.toFixed(6)} MLNK`}
                className="w-full bg-black/30 border border-yellow-500/50 rounded-lg px-4 py-3 text-white text-center text-xl focus:outline-none focus:border-yellow-400"
              />
              {bidError && <p className="text-red-400 text-sm mt-2 text-center">{bidError}</p>}
            </div>

            <div className="flex justify-center my-8">
              <QRCodeSVG value={getQRCodeData('star')} size={256} level="H" includeMargin fgColor="#000" className="rounded-2xl shadow-2xl" />
            </div>

            <div className="bg-black/40 rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-400">Кому:</span><span className="text-white font-mono">malinkatrees</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Ваша ставка:</span><span className="text-yellow-400 font-bold">{bidAmount ? parseFloat(bidAmount).toFixed(6) : minBid.toFixed(6)} MLNK</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Memo:</span><span className="text-yellow-300">звезда</span></div>
            </div>

            <button 
              onClick={handlePaymentDone} 
              disabled={!bidAmount || parseFloat(bidAmount) <= currentBid}
              className={`mt-6 w-full text-white font-bold py-4 rounded-full text-lg shadow-2xl transition ${!bidAmount || parseFloat(bidAmount) <= currentBid ? 'bg-gray-600 cursor-not-allowed' : 'bg-gradient-to-r from-yellow-500 to-amber-600 hover:scale-105 animate-pulse'}`}
            >
              {!bidAmount || parseFloat(bidAmount) <= currentBid ? 'Введите сумму выше' : '✅ Сделать ставку!'}
            </button>
          </div>
        </div>
      )}

      {/* Модалка с QR-кодом */}
      {modalType && modalType !== 'star' && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4" onClick={handleCloseModal}>
          <div className="bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 rounded-3xl p-6 md:p-8 w-full max-w-md mx-4 md:mx-auto my-8 max-h-full overflow-y-auto relative border-2 border-yellow-500/30 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={handleCloseModal}
              className="absolute top-4 right-4 text-white/70 hover:text-white transition"
            >
              <X className="w-6 h-6" />
            </button>

            <h2 className="text-2xl font-bold text-white mb-2 text-center">
              {modalType === 'light' && '💡 Зажечь огонёк'}
              {modalType === 'ball' && '🎈 Повесить шарик'}
              {modalType === 'envelope' && '📮 Послать открытку'}
              {modalType === 'gift' && '🎁 Подарить гифку'}
            </h2>
            
            <p className="text-pink-300 text-center mb-6">
              {modalType === 'light' && '1.000000 MLNK'}
              {modalType === 'ball' && '10.000000 MLNK'}
              {modalType === 'envelope' && '100.000000 MLNK'}
              {modalType === 'gift' && '1000.000000 MLNK'}
            </p>

            {modalType === 'envelope' && (
              <div className="mb-4">
                <input
                  type="text"
                  value={envelopeText}
                  onChange={(e) => setenvelopeText(e.target.value)}
                  placeholder="Введите текст открытки (до 200 символов)"
                  maxLength={200}
                  className="w-full bg-black/30 border border-pink-500/50 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-pink-500"
                />
                <p className="text-xs text-gray-400 mt-1">{envelopeText.length}/200</p>
              </div>
            )}

            {modalType === 'gift' && (
              <div className="mb-4">
                <input
                  type="url"
                  value={giftUrl}
                  onChange={(e) => setGiftUrl(e.target.value)}
                  placeholder="https://ссылка_на_гифку.gif"
                  className="w-full bg-black/30 border border-green-500/50 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-green-500"
                />
                <p className="text-xs text-gray-400 mt-1">Поддерживаются .gif, .png, .jpg</p>
              </div>
            )}

            <div className="flex justify-center mb-6">
              <div className="bg-white p-4 rounded-2xl shadow-2xl relative">
                <div className="absolute inset-0 bg-gradient-to-br from-yellow-400/20 to-orange-400/20 rounded-2xl animate-pulse"></div>
                <QRCodeSVG
                  value={getQRCodeData(modalType)}
                  size={256}
                  level="H"
                  includeMargin={true}
                  fgColor="#000000"
                  className="relative z-10"
                />
              </div>
            </div>

            <p className="text-center text-yellow-300 mb-4 text-sm">
              Сканируй в PayCash 
            </p>

            <div className="bg-black/40 rounded-lg p-4 mb-6 space-y-2 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Кому:</span>
                <span className="text-white font-mono">malinkatrees</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Сумма:</span>
                <span className="text-pink-300 font-bold">
                  {modalType === 'light' && '1.000000 MLNK'}
                  {modalType === 'ball' && '10.000000 MLNK'}
                  {modalType === 'envelope' && '100.000000 MLNK'}
                  {modalType === 'gift' && '1000.000000 MLNK'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Memo:</span>
                <span className="text-yellow-300 font-mono text-xs break-all text-right">
                  {modalType === 'light' && '(пусто)'}
                  {modalType === 'ball' && '(пусто)'}
                  {modalType === 'envelope' && (envelopeText.trim() ? envelopeText.trim().substring(0, 50) + (envelopeText.length > 50 ? '...' : '') : '(пусто)')}
                  {modalType === 'gift' && (giftUrl.trim() ? giftUrl.trim().substring(0, 30) + (giftUrl.length > 30 ? '...' : '') : '(пусто)')}
                </span>
              </div>
            </div>

            <button
              onClick={handlePaymentDone}
              className="w-full bg-gradient-to-r from-yellow-500 to-orange-500 text-white font-bold py-4 px-6 rounded-full text-lg shadow-2xl hover:scale-105 transition animate-pulse"
            >
              ✅ Готово, оплатил!
            </button>
          </div>
        </div>
      )}

      {/* Лог действий - на весь экран */}
      {showLog && (
        <div className="fixed inset-0 bg-black/95 flex flex-col z-50" onClick={() => setShowLog(false)}>
          <div className="flex justify-between items-center p-4 border-b border-yellow-500/30" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-2xl font-bold text-white">
              {logTab === 'actions' ? '📜 Лог действий' : '🏆 Топ дарителей'}
            </h2>
            <button
              onClick={() => setShowLog(false)}
              className="text-white/70 hover:text-white transition"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
          
          {/* Вкладки */}
          <div className="flex border-b border-yellow-500/30" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setLogTab('actions')}
              className={`flex-1 py-3 text-center font-bold transition ${
                logTab === 'actions'
                  ? 'bg-yellow-500/20 text-yellow-400 border-b-2 border-yellow-400'
                  : 'text-white/70 hover:text-white'
              }`}
            >
              Лог действий
            </button>
            <button
              onClick={() => setLogTab('donors')}
              className={`flex-1 py-3 text-center font-bold transition ${
                logTab === 'donors'
                  ? 'bg-yellow-500/20 text-yellow-400 border-b-2 border-yellow-400'
                  : 'text-white/70 hover:text-white'
              }`}
            >
              Топ дарителей
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2" onClick={(e) => e.stopPropagation()}>
            {logTab === 'actions' ? (
              allActions.length === 0 ? (
                <p className="text-gray-400 text-center">Пока нет действий</p>
              ) : (
                allActions.map((dec, i) => (
                  <div
                    key={`log-${i}`}
                    className="bg-black/40 rounded-lg p-3 text-sm"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="text-yellow-400 font-bold">
                          {dec.type === 'light' && `💡 Зажёг ${Math.floor(typeof dec.amount === 'number' ? dec.amount : parseFloat(dec.amount || '0'))} огоньков!`}
                          {dec.type === 'ball' && '🎈 Шарик'}
                          {(dec.type === 'candle' || dec.type === 'envelope') && '📮 Открытка'}
                          {dec.type === 'gift' && '🎁 Подарок'}
                          {dec.type === 'star' && (
                            <>
                              ⭐ {dec.username || dec.from_account} делает ставку на право зажечь звезду на Новый год! 🎉
                              {(typeof dec.amount === 'number' ? dec.amount : parseFloat(dec.amount || '0')) === currentBid && ' (текущий лидер!)'}
                            </>
                          )}
                        </div>
                        <div className="text-white mt-1">
                          От: {dec.from_account}
                        </div>
                        <div className="text-pink-300 text-xs mt-1">
                          Сумма: {(() => {
                            const amt = typeof dec.amount === 'number' ? dec.amount : parseFloat(String(dec.amount || '0'))
                            return amt.toFixed(6)
                          })()} MLNK
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )
            ) : (
              topDonors.length === 0 ? (
                <p className="text-gray-400 text-center">Загрузка...</p>
              ) : (
                topDonors.map((donor, i) => {
                  const stats = donorStats.get(donor.from_account)
                  const isLeader = starBids.length > 0 && starBids[0].from_account === donor.from_account
                  
                  return (
                    <div
                      key={`donor-${donor.from_account}`}
                      className="bg-black/40 rounded-lg p-4 text-sm"
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="text-yellow-400 font-bold text-lg">
                            #{i + 1} {donor.from_account}
                          </div>
                          <div className="text-pink-300 text-xs mt-2 space-y-1">
                            {stats && stats.lights > 0 && (
                              <div>Зажёг огоньков: {stats.lights}</div>
                            )}
                            {stats && stats.balls > 0 && (
                              <div>Повесил шариков: {stats.balls}</div>
                            )}
                            {stats && stats.envelopes > 0 && (
                              <div>Написал поздравлений: {stats.envelopes}</div>
                            )}
                            {stats && stats.stars > 0 && (
                              <div>{isLeader ? '🏆 ' : ''}Ставок на аукционе: {stats.stars}</div>
                            )}
                          </div>
                        </div>
                        <div className="text-white font-bold text-lg">
                          {donor.total_amount.toFixed(6)} MLNK
                        </div>
                      </div>
                    </div>
                  )
                })
              )
            )}
          </div>
        </div>
      )}

      {/* Статистика вверху на всю ширину */}
      {!loading && !showVideoCard && (
        <div className="absolute top-4 left-4 right-4 z-30 bg-black/60 backdrop-blur-sm rounded-lg p-3 text-center">
          <p className="text-pink-300 text-sm">
            Огоньков: {stats.lights} • Шариков: {stats.balls} • Открыток: {stats.envelopes} 
          </p>
          <p className="text-pink-200 text-xs mt-1">
            Всего: {stats.lights+stats.balls+stats.envelopes} {' '}
            {(() => {
              const n = stats.total
              if (n % 10 === 1 && n % 100 !== 11) return 'украшение'
              if ([2,3,4].includes(n % 10) && ![12,13,14].includes(n % 100)) return 'украшения'
              return 'украшений'
            })()}
          </p>
        </div>
      )}

      {/* Три кнопки под статистикой */}
      {!loading && !showVideoCard && (
        <div className="absolute top-24 left-4 right-4 z-30 flex gap-1.5">
          {/* Расширяющаяся кнопка Радио PayCash */}
          <div className={`flex-[1.5] bg-gradient-to-r from-yellow-600 to-orange-600 rounded-lg shadow-lg overflow-hidden transition-all duration-300 ${isRadioExpanded ? 'max-h-28' : 'max-h-8'}`}>
            <button
              onClick={() => {
                if (!isRadioExpanded) {
                  setIsRadioExpanded(true)
                  setShowRadioControls(true)
                } else {
                  setIsRadioExpanded(false)
                  setShowRadioControls(false)
                }
              }}
              className="w-full text-white font-semibold py-1.5 px-2 flex items-center justify-center gap-1 text-xs hover:scale-105 transition-transform relative"
            >
              <span className="text-xs">📻</span>
              <span className="text-xs">Радио</span>
              {/* Мини-индикатор когда контролы скрыты */}
              {isRadioExpanded && !showRadioControls && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowRadioControls(true)
                    resetRadioTimeout()
                  }}
                  className="absolute top-0.5 right-0.5 bg-yellow-500/50 hover:bg-yellow-500/70 rounded-full p-0.5 text-[10px] transition-colors"
                  title={isPlaying ? 'Пауза' : 'Воспроизведение'}
                >
                  {isPlaying ? '⏸' : '▶️'}
                </button>
              )}
            </button>
            {/* Встроенный плеер */}
            <div className={`overflow-hidden transition-all duration-300 ${showRadioControls && isRadioExpanded ? 'max-h-20 opacity-100' : 'max-h-0 opacity-0'}`}>
              <div className="px-2 pb-2 space-y-1.5">
                <div className="text-yellow-200 text-[10px] text-center font-medium">
                  {currentTrackIndex + 1} / {PAYCASH_SONGS.length}
                </div>
                <div className="flex items-center justify-center gap-1.5">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      playPrev()
                      resetRadioTimeout()
                    }}
                    className="bg-yellow-500/30 hover:bg-yellow-500/50 text-yellow-200 rounded-full p-1 transition-colors text-[10px]"
                    disabled={!audioRef.current}
                    title="Предыдущий трек"
                  >
                    ◄◄
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      togglePlay()
                    }}
                    className="bg-yellow-500/40 hover:bg-yellow-500/60 text-yellow-200 rounded-full p-1 transition-colors text-[10px]"
                    title={isPlaying ? 'Пауза' : 'Воспроизведение'}
                  >
                    {isPlaying ? '⏸' : '▶️'}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      playNext()
                      resetRadioTimeout()
                    }}
                    className="bg-yellow-500/30 hover:bg-yellow-500/50 text-yellow-200 rounded-full p-1 transition-colors text-[10px]"
                    disabled={!audioRef.current}
                    title="Следующий трек"
                  >
                    ►►
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Кнопка Открытка PayCash */}
          <button
            onClick={() => {
              setShowVideoCard(true)
            }}
            className="flex-1 bg-gradient-to-r from-pink-600 to-purple-600 text-white font-semibold py-1.5 px-2 rounded-lg shadow-lg hover:scale-105 transition flex items-center justify-center gap-1 text-xs"
          >
            <img src="/notext.png" alt="Paycash" className="w-4 h-4" />
            <span className="text-xs">Открытка</span>
          </button>

          {/* Кнопка Викторина PayCash */}
          <button
            onClick={() => {
              window.open('https://chatquizbot-production.up.railway.app', '_blank')
            }}
            className="flex-1 bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-semibold py-1.5 px-2 rounded-lg shadow-lg hover:scale-105 transition flex items-center justify-center gap-1 text-xs"
          >
            <span className="text-xs">🎯</span>
            <span className="text-xs">Викторина</span>
          </button>
        </div>
      )}

      {/* Видео открытка */}
      {showVideoCard && (
        <div className="fixed inset-0 bg-black z-50 flex items-center justify-center">
          <video
            ref={videoRef}
            src="/1227 (1).mp4"
            className="w-full h-full object-contain"
            onEnded={() => {
              setShowVideoCard(false)
            }}
            onLoadedData={() => {
              // Автоматически запускаем видео когда оно загружено
              if (videoRef.current) {
                videoRef.current.play().catch((err: unknown) => {
                  console.log('Ошибка воспроизведения видео:', err)
                })
              }
            }}
            playsInline
            autoPlay
          />
        </div>
      )}

      {/* Счётчик лопнувших снежинок */}
      {showBurstCounter && burstCount > 0 && (
        <div className="fixed top-4 right-4 bg-yellow-400 text-black font-bold text-2xl px-6 py-3 rounded-full shadow-2xl z-50 animate-pulse transition-opacity duration-1000 opacity-100">
          +{burstCount}
        </div>
      )}

      {/* Салют - GIF */}
      {showSalute && (
        
        <div className="fixed inset-x-0 top-0 flex items-start justify-center pointer-events-none z-50 pt-8">
        
          <img
            src="/iskra.gif"
            alt="Салют"
            className="w-128 h-128 object-contain"
            style={{ animation: 'none' }}
          />
        </div>
      )}
      </div>
    </div>
  )
}
