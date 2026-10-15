import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'
import { getActiveKitchenTickets, getTodayKitchenTickets, updateItemStatus } from '../api/client'

/**
 * Pantalla de Cocina – KDS (Kitchen Display System)
 * Se conecta al WebSocket /ws/kitchen y muestra los tickets en tiempo real.
 */
export default function KitchenDisplay() {
    const containerRef = useRef(null)
    const [tickets, setTickets] = useState([])
    const [historyTickets, setHistoryTickets] = useState([])
    const [activeTab, setActiveTab] = useState('active') // 'active' | 'history'
    const [isLoadingHistory, setIsLoadingHistory] = useState(false)
    const [sortOrder, setSortOrder] = useState('asc') // 'asc': más antiguo a más reciente (predeterminado) | 'desc': más reciente a más antiguo
    const [viewMode, setViewMode] = useState(() => localStorage.getItem('kds_view_mode') || 'tv') // 'tv' (Compacto para TV 24") | 'normal'
    const [isKiosk, setIsKiosk] = useState(false)
    const [autoDismiss, setAutoDismiss] = useState(() => localStorage.getItem('kds_auto_dismiss') !== 'false')
    const [autoScroll, setAutoScroll] = useState(() => localStorage.getItem('kds_auto_scroll') !== 'false')
    const [flashItemIds, setFlashItemIds] = useState([])

    const [dismissedChunkKeys, setDismissedChunkKeys] = useState([])
    const [audioUnlocked, setAudioUnlocked] = useState(false)

    const { lastMessage, isConnected } = useWebSocket('kitchen')

    // Desbloquear audio automáticamente al presionar cualquier botón del control remoto o clic en pantalla
    useEffect(() => {
        const unlockAudio = () => {
            try {
                const ctx = window._kdsAudioCtx || new (window.AudioContext || window.webkitAudioContext)()
                if (!window._kdsAudioCtx) window._kdsAudioCtx = ctx
                if (ctx.state === 'suspended') {
                    ctx.resume().then(() => setAudioUnlocked(true))
                } else if (ctx.state === 'running') {
                    setAudioUnlocked(true)
                }
            } catch (e) { }
        }
        window.addEventListener('click', unlockAudio, { passive: true })
        window.addEventListener('keydown', unlockAudio, { passive: true })
        window.addEventListener('touchstart', unlockAudio, { passive: true })
        return () => {
            window.removeEventListener('click', unlockAudio)
            window.removeEventListener('keydown', unlockAudio)
            window.removeEventListener('touchstart', unlockAudio)
        }
    }, [])

    // Helper para fragmentar tickets con más de 3 ítems en múltiples tarjetas de 1 columna
    const splitTicketIntoChunks = (ticket, chunkSize = 3) => {
        const items = ticket.items ?? []
        if (items.length <= chunkSize) {
            return [{
                ...ticket,
                chunk_index: 0,
                total_chunks: 1,
                chunk_items: items,
                chunk_key: `${ticket.ticket_id}-p1`
            }]
        }

        const chunks = []
        const totalChunks = Math.ceil(items.length / chunkSize)

        for (let i = 0; i < items.length; i += chunkSize) {
            const chunkItems = items.slice(i, i + chunkSize)
            const chunkIndex = Math.floor(i / chunkSize)
            chunks.push({
                ...ticket,
                chunk_index: chunkIndex,
                total_chunks: totalChunks,
                chunk_items: chunkItems,
                chunk_key: `${ticket.ticket_id}-p${chunkIndex + 1}`
            })
        }
        return chunks
    }

    // Ordenar tickets según el filtro seleccionado (memoizado)
    const sortedTickets = useMemo(() => {
        return [...tickets].sort((a, b) => {
            const timeA = new Date(a.created_at || 0).getTime()
            const timeB = new Date(b.created_at || 0).getTime()
            if (timeA === timeB) {
                return sortOrder === 'asc' ? (a.ticket_id - b.ticket_id) : (b.ticket_id - a.ticket_id)
            }
            return sortOrder === 'asc' ? timeA - timeB : timeB - timeA
        })
    }, [tickets, sortOrder])

    const sortedHistoryTickets = useMemo(() => {
        return [...historyTickets].sort((a, b) => {
            const timeA = new Date(a.created_at || 0).getTime()
            const timeB = new Date(b.created_at || 0).getTime()
            if (timeA === timeB) {
                return sortOrder === 'asc' ? (a.ticket_id - b.ticket_id) : (b.ticket_id - a.ticket_id)
            }
            return sortOrder === 'asc' ? timeA - timeB : timeB - timeA
        })
    }, [historyTickets, sortOrder])

    const displayTickets = useMemo(() => {
        return sortedTickets
            .flatMap(ticket => splitTicketIntoChunks(ticket, 3))
            .filter(chunk => !dismissedChunkKeys.includes(chunk.chunk_key))
    }, [sortedTickets, dismissedChunkKeys])

    const displayHistoryTickets = useMemo(() => {
        return sortedHistoryTickets
            .flatMap(ticket => splitTicketIntoChunks(ticket, 3))
    }, [sortedHistoryTickets])

    // Helper de desplazamiento suave (smooth scroll JS) compatible con TV Bro / Android WebViews y navegadores modernos
    const smoothScrollTo = (target, to, duration = 500) => {
        const isWin = target === window
        const start = isWin ? (window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0) : target.scrollTop
        const change = to - start
        if (Math.abs(change) < 2) return

        let nativeSuccess = false
        try {
            if (isWin) {
                window.scrollTo({ top: to, behavior: 'smooth' })
                nativeSuccess = true
            } else if (typeof target.scrollTo === 'function') {
                target.scrollTo({ top: to, behavior: 'smooth' })
                nativeSuccess = true
            }
        } catch (e) {
            nativeSuccess = false
        }

        const startTime = performance.now()
        const animateScroll = (currentTime) => {
            const elapsed = currentTime - startTime
            const progress = Math.min(elapsed / duration, 1)
            const ease = progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress
            const currentPos = start + change * ease

            if (isWin) {
                window.scrollTo(0, currentPos)
                document.documentElement.scrollTop = currentPos
                document.body.scrollTop = currentPos
            } else {
                target.scrollTop = currentPos
            }

            if (progress < 1) {
                requestAnimationFrame(animateScroll)
            }
        }

        if (!nativeSuccess) {
            requestAnimationFrame(animateScroll)
        } else {
            setTimeout(() => {
                if (isWin) {
                    window.scrollTo(0, to)
                } else {
                    target.scrollTop = to
                }
            }, duration + 50)
        }
    }

    // Auto-scroll cíclico por filas cada 5 segundos (Compatible con TV Bro & Android TV)
    useEffect(() => {
        if (!autoScroll) return

        const interval = setInterval(() => {
            let targetEl = null
            let currentScroll = 0
            let maxScroll = 0
            let visibleHeight = 0

            // 1. Revisar si el contenedor de tickets desborda
            if (containerRef.current) {
                const c = containerRef.current
                const max = c.scrollHeight - c.clientHeight
                if (max > 15) {
                    targetEl = c
                    currentScroll = c.scrollTop
                    maxScroll = max
                    visibleHeight = c.clientHeight
                }
            }

            // 2. Si el contenedor no desborda, revisar si la ventana principal desborda
            if (!targetEl) {
                const docEl = document.documentElement
                const body = document.body
                const winMax = Math.max(docEl.scrollHeight, body.scrollHeight) - window.innerHeight
                const winCurrent = window.scrollY || docEl.scrollTop || body.scrollTop || 0
                if (winMax > 15) {
                    targetEl = window
                    currentScroll = winCurrent
                    maxScroll = winMax
                    visibleHeight = window.innerHeight
                }
            }

            if (!targetEl || maxScroll <= 15) return

            const step = Math.max(200, Math.floor(visibleHeight * 0.7))
            const next = currentScroll + step

            if (currentScroll + 25 >= maxScroll) {
                smoothScrollTo(targetEl, 0, 600)
            } else {
                smoothScrollTo(targetEl, next, 600)
            }
        }, 5000)

        return () => clearInterval(interval)
    }, [autoScroll])

    // Cargar tickets activos (con diff inteligente para evitar renders innecesarios)
    const loadActiveTickets = useCallback(async (isBackgroundPoll = false) => {
        try {
            const { data } = await getActiveKitchenTickets()
            // Mostrar todos los tickets e ítems (incluyendo bar) en Cocina
            const kitchenTickets = (data || []).filter(ticket => ticket.items && ticket.items.length > 0)

            setTickets(prev => {
                // Crear firmas para comparar si realmente hay cambios
                const prevSig = prev.map(t => `${t.ticket_id}_${t.ticket_number}_${(t.items || []).map(i => `${i.order_item_id}:${i.status}:${i.notes}`).join(',')}`).join('|')
                const nextSlice = kitchenTickets.slice(0, 50)
                const newSig = nextSlice.map(t => `${t.ticket_id}_${t.ticket_number}_${(t.items || []).map(i => `${i.order_item_id}:${i.status}:${i.notes}`).join(',')}`).join('|')

                if (prevSig === newSig) {
                    return prev // Sin cambios: cero re-renders
                }

                // Si es polling en segundo plano y hay un ticket nuevo que no existía antes:
                if (isBackgroundPoll && prev.length > 0) {
                    const prevIds = new Set(prev.map(t => t.ticket_id))
                    const hasNewTicket = nextSlice.some(t => !prevIds.has(t.ticket_id))
                    if (hasNewTicket) {
                        try { playNewTicketChime() } catch (e) { }
                    }
                }

                return nextSlice
            })
        } catch (err) {
            console.error('Error al cargar tickets:', err)
        }
    }, [])

    useEffect(() => {
        loadActiveTickets(false)

        // Polling de respaldo cada 5 segundos (garantiza que la TV Box se actualice sola si el WebSocket cae o se congela)
        const pollInterval = setInterval(() => {
            loadActiveTickets(true)
        }, 5000)

        // Al volver la pestaña / encender pantalla de la TV
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                loadActiveTickets(false)
            }
        }
        document.addEventListener('visibilitychange', handleVisibilityChange)

        return () => {
            clearInterval(pollInterval)
            document.removeEventListener('visibilitychange', handleVisibilityChange)
        }
    }, [loadActiveTickets])

    const loadHistoryTickets = async () => {
        setIsLoadingHistory(true)
        try {
            const { data } = await getTodayKitchenTickets()
            const kitchenTickets = (data || []).filter(ticket => ticket.items && ticket.items.length > 0)
            setHistoryTickets(kitchenTickets)
        } catch (err) {
            console.error('Error al cargar historial:', err)
        } finally {
            setIsLoadingHistory(false)
        }
    }

    useEffect(() => {
        if (activeTab === 'history') {
            loadHistoryTickets()
        }
    }, [activeTab])

    // Reproducir tono de notificación (1 vez) cuando llega una nueva comanda
    const playNewTicketChime = () => {
        try {
            const ctx = window._kdsAudioCtx || new (window.AudioContext || window.webkitAudioContext)();
            if (!window._kdsAudioCtx) window._kdsAudioCtx = ctx;
            if (ctx.state === 'suspended') ctx.resume();

            const playBeep = (freq, delay) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);

                osc.type = 'triangle';
                osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);

                gain.gain.setValueAtTime(0, ctx.currentTime + delay);
                gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + delay + 0.05);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.4);

                osc.start(ctx.currentTime + delay);
                osc.stop(ctx.currentTime + delay + 0.4);
            };

            playBeep(650, 0);
            playBeep(850, 0.15);
            playBeep(1050, 0.3);
        } catch (e) {
            console.warn('Alerta sonora bloqueada por políticas del navegador.');
        }
    }

    // Reproducir tono de modificación (sawtooth) cuando un pedido es editado
    const playEditAlertChime = () => {
        try {
            const ctx = window._kdsAudioCtx || new (window.AudioContext || window.webkitAudioContext)();
            if (!window._kdsAudioCtx) window._kdsAudioCtx = ctx;
            if (ctx.state === 'suspended') ctx.resume();

            const playBeep = (freq, type, delay) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);

                osc.type = type;
                osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);

                gain.gain.setValueAtTime(0, ctx.currentTime + delay);
                gain.gain.linearRampToValueAtTime(0.6, ctx.currentTime + delay + 0.05);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.35);

                osc.start(ctx.currentTime + delay);
                osc.stop(ctx.currentTime + delay + 0.35);
            };

            playBeep(900, 'sawtooth', 0);
            playBeep(450, 'sawtooth', 0.15);
            playBeep(900, 'sawtooth', 0.3);
        } catch (e) {
            console.warn('Alerta sonora bloqueada por políticas del navegador.');
        }
    }

    // Recibir eventos vía WebSocket
    useEffect(() => {
        if (!lastMessage) return
        if (lastMessage.event === 'new_ticket') {
            const ticket = lastMessage.ticket
            if (!ticket.items || ticket.items.length === 0) return

            // Tono sonoro protegido al recibir nuevo pedido
            try {
                playNewTicketChime()
            } catch (e) {
                console.warn('Error al reproducir timbre de nuevo pedido:', e)
            }

            setTickets(prev => {
                if (prev.some(t => t.ticket_id === ticket.ticket_id)) return prev
                return [ticket, ...prev].slice(0, 50)
            })

            // Sincronizar en segundo plano de inmediato para garantizar consistencia completa
            loadActiveTickets(false)
        }
        else if (lastMessage.event === 'item_status_changed') {
            setTickets(prev => prev.map(t => ({
                ...t,
                items: (t.items || []).map(it =>
                    it.order_item_id === lastMessage.item_id
                        ? { ...it, status: lastMessage.status }
                        : it
                )
            })))
        }
        else if (lastMessage.event === 'item_updated') {
            if (lastMessage.item_id) {
                try { playEditAlertChime() } catch (e) { }
                setFlashItemIds(prev => [...prev, lastMessage.item_id])
                setTimeout(() => {
                    setFlashItemIds(prev => prev.filter(id => id !== lastMessage.item_id))
                }, 5000)
            }
            setTickets(prev => prev.map(t => ({
                ...t,
                items: (t.items || []).map(it =>
                    it.order_item_id === lastMessage.item_id
                        ? { ...it, notes: lastMessage.notes, is_takeout: lastMessage.is_takeout, is_edited: true }
                        : it
                )
            })))
            loadActiveTickets(false)
        }
        else if (lastMessage.event === 'item_deleted') {
            setTickets(prev => prev.map(t => ({
                ...t,
                items: (t.items || []).filter(it => it.order_item_id !== lastMessage.item_id)
            })).filter(t => t.items && t.items.length > 0))
            loadActiveTickets(false)
        }
    }, [lastMessage, loadActiveTickets])


    const dismissChunk = (chunkKey) => {
        setDismissedChunkKeys(prev => [...prev, chunkKey])
    }

    const handleItemStatusChange = async (itemId, newStatus) => {
        try {
            // Optimistic update
            setTickets(prev => prev.map(t => ({
                ...t,
                items: t.items.map(it =>
                    it.order_item_id === itemId ? { ...it, status: newStatus } : it
                )
            })))
            await updateItemStatus(itemId, newStatus)
        } catch (err) {
            console.error('Error updating status', err)
        }
    }

    // Auto-limpiar sub-tickets cuando todos sus ítems están COMPLETED / DELIVERED (si autoDismiss está activado)
    useEffect(() => {
        if (!autoDismiss) return
        const timer = setTimeout(() => {
            setDismissedChunkKeys(prev => {
                let hasChanges = false
                const newDismissed = [...prev]
                displayTickets.forEach(chunk => {
                    const items = chunk.chunk_items ?? []
                    if (items.length > 0 && items.every(it => it.status === 'COMPLETED' || it.status === 'DELIVERED')) {
                        if (!newDismissed.includes(chunk.chunk_key)) {
                            newDismissed.push(chunk.chunk_key)
                            hasChanges = true
                        }
                    }
                })
                return hasChanges ? newDismissed : prev
            })
        }, 3000)
        return () => clearTimeout(timer)
    }, [displayTickets, autoDismiss])

    // Alternar Pantalla Completa Kiosco
    const toggleKioskMode = () => {
        const next = !isKiosk
        setIsKiosk(next)
        if (next) {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(() => { })
            }
        } else {
            if (document.fullscreenElement) {
                document.exitFullscreen().catch(() => { })
            }
        }
    }

    // Cantidad de tickets con ítems pendientes de preparación (ESPERA)
    const pendingTicketsCount = tickets.filter(t => t.items && t.items.some(it => it.status === 'PENDING')).length

    const gridClasses = viewMode === 'tv'
        ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5"
        : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"

    return (
        <div ref={containerRef} className={isKiosk ? "fixed inset-0 z-50 bg-gray-950 p-3 overflow-y-auto space-y-3 min-h-screen" : "space-y-4 max-h-[calc(100vh-80px)] overflow-y-auto"}>
            {/* Toolbar Superior / Controles KDS */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-gray-900/80 p-3 rounded-2xl border border-gray-800 shadow-md">
                <div className="flex flex-wrap items-center gap-3">
                    <h1 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
                        🍳 Cocina <span className="text-xs bg-brand-950 text-brand-400 border border-brand-800 px-2 py-0.5 rounded-full font-bold">KDS</span>
                    </h1>
                    <span className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${isConnected
                        ? 'bg-green-900/30 border-green-700 text-green-400'
                        : 'bg-red-900/30 border-red-700 text-red-400'
                        }`}>
                        <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
                        {isConnected ? 'En línea' : 'Reconectando…'}
                    </span>

                    {/* Alerta Visual Intermitente de Pedidos en Espera */}
                    {pendingTicketsCount > 0 && (
                        <div className="animate-[pulse_1.2s_infinite] bg-red-600 text-white font-black text-xs sm:text-sm px-3.5 py-1 sm:px-4 sm:py-1.5 rounded-full border-2 border-red-400 shadow-[0_0_20px_rgba(239,68,68,0.9)] flex items-center gap-2">
                            <span className="text-base animate-bounce">🚨</span>
                            <span>{pendingTicketsCount} {pendingTicketsCount === 1 ? 'PEDIDO EN ESPERA' : 'PEDIDOS EN ESPERA'}</span>
                        </div>
                    )}
                </div>

                {/* Controles de Vista, Auto-limpieza y Pantalla Completa */}
                <div className="flex flex-wrap items-center gap-2 text-xs">
                    {/* Selector de modo de vista */}
                    <button
                        onClick={() => {
                            const next = viewMode === 'tv' ? 'normal' : 'tv'
                            setViewMode(next)
                            localStorage.setItem('kds_view_mode', next)
                        }}
                        className={`px-3 py-1.5 rounded-xl font-bold transition-all border flex items-center gap-1.5 ${viewMode === 'tv'
                            ? 'bg-brand-600 border-brand-500 text-white shadow-lg'
                            : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
                            }`}
                    >
                        {viewMode === 'tv' ? '📺 Vista 24"' : '💻 Normal'}
                    </button>

                    {/* Toggle auto-scroll por filas cada 5s */}
                    <button
                        onClick={() => {
                            const next = !autoScroll
                            setAutoScroll(next)
                            localStorage.setItem('kds_auto_scroll', String(next))
                        }}
                        className={`px-3 py-1.5 rounded-xl font-bold transition-all border flex items-center gap-1.5 ${autoScroll
                            ? 'bg-purple-600 border-purple-500 text-white shadow-md'
                            : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'
                            }`}
                    >
                        📜 Auto-scroll {autoScroll ? '(ON)' : '(OFF)'}
                    </button>

                    {/* Toggle auto-ocultar */}
                    <button
                        onClick={() => {
                            const next = !autoDismiss
                            setAutoDismiss(next)
                            localStorage.setItem('kds_auto_dismiss', String(next))
                        }}
                        className={`px-3 py-1.5 rounded-xl font-bold transition-all border flex items-center gap-1.5 ${autoDismiss
                            ? 'bg-green-600 border-green-500 text-white shadow-md'
                            : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'
                            }`}
                    >
                        ⚡ Auto {autoDismiss ? '(ON)' : '(OFF)'}
                    </button>

                    {/* Alerta / Botón de Sonido */}
                    <button
                        onClick={() => {
                            playNewTicketChime()
                            setAudioUnlocked(true)
                        }}
                        title="Probar y asegurar alertas de sonido en la TV"
                        className={`px-3 py-1.5 rounded-xl font-bold transition-all border flex items-center gap-1.5 ${audioUnlocked
                            ? 'bg-gray-800 border-gray-700 text-yellow-400 hover:bg-gray-700'
                            : 'bg-amber-600/30 border-amber-500 text-amber-300 animate-pulse'
                            }`}
                    >
                        {audioUnlocked ? '🔔 Sonido OK' : '🔇 Activar Sonido'}
                    </button>

                    {/* Toggle Kiosk Fullscreen */}
                    <button
                        onClick={toggleKioskMode}
                        className="px-3 py-1.5 rounded-xl font-bold bg-gray-800 border border-gray-700 text-white hover:bg-gray-700 flex items-center gap-1.5 shadow-sm"
                    >
                        {isKiosk ? '❌ Salir' : '📺 Fullscreen'}
                    </button>
                </div>
            </div>

            {/* Tabs y Filtro de Ordenamiento */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-800 pb-2">
                <div className="flex gap-2">
                    <button
                        onClick={() => setActiveTab('active')}
                        className={`px-4 py-2 font-bold rounded-t-xl transition-colors ${activeTab === 'active' ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
                    >
                        🔥 Pendientes ({tickets.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('history')}
                        className={`px-4 py-2 font-bold rounded-t-xl transition-colors ${activeTab === 'history' ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
                    >
                        🕒 Historial (Hoy)
                    </button>
                </div>

                {/* Filtro de ordenación */}
                <div className="flex items-center gap-2 text-sm">
                    <span className="text-gray-400 font-medium hidden sm:inline">Ordenar:</span>
                    <select
                        value={sortOrder}
                        onChange={(e) => setSortOrder(e.target.value)}
                        className="bg-gray-800 border border-gray-700 text-white text-xs sm:text-sm font-semibold rounded-xl px-3 py-1.5 focus:outline-none focus:border-brand-500 cursor-pointer shadow-sm"
                    >
                        <option value="asc">⏳ Más antiguos a más recientes (Predeterminado)</option>
                        <option value="desc">⚡ Más recientes a más antiguos</option>
                    </select>
                </div>
            </div>

            {activeTab === 'active' ? (
                displayTickets.length === 0 ? (
                    <div className="card p-16 text-center text-gray-500">
                        <p className="text-4xl mb-3">🍽️</p>
                        <p>Esperando pedidos…</p>
                    </div>
                ) : (
                    <div className={gridClasses}>
                        {displayTickets.map((chunk) => (
                            <KitchenTicketCard
                                key={chunk.chunk_key}
                                ticket={chunk}
                                onDismiss={dismissChunk}
                                onItemStatusChange={handleItemStatusChange}
                                viewMode={viewMode}
                                flashItemIds={flashItemIds}
                            />
                        ))}
                    </div>
                )
            ) : (
                isLoadingHistory ? (
                    <div className="p-16 text-center text-white">Cargando historial...</div>
                ) : displayHistoryTickets.length === 0 ? (
                    <div className="card p-16 text-center text-gray-500">
                        <p className="text-4xl mb-3">🕒</p>
                        <p>No hay historial de pedidos para hoy.</p>
                    </div>
                ) : (
                    <div className={gridClasses}>
                        {displayHistoryTickets.map((chunk) => (
                            <KitchenTicketCard
                                key={chunk.chunk_key}
                                ticket={chunk}
                                onDismiss={() => { }} // In history, we don't dismiss
                                onItemStatusChange={handleItemStatusChange}
                                isHistory={true}
                                viewMode={viewMode}
                                flashItemIds={flashItemIds}
                            />
                        ))}
                    </div>
                )
            )}
        </div>
    )
}

function KitchenTicketCard({ ticket, onDismiss, onItemStatusChange, isHistory = false, viewMode = 'tv', flashItemIds = [] }) {
    const isTv = viewMode === 'tv'
    const time = ticket.created_at
        ? new Date(ticket.created_at).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
        : '--:--'

    const advanceStatus = (item) => {
        if (item.status === 'PENDING') return onItemStatusChange(item.order_item_id, 'PREPARING')
        if (item.status === 'PREPARING') return onItemStatusChange(item.order_item_id, 'COMPLETED')
    }

    const getStatusColors = (status) => {
        switch (status) {
            case 'PREPARING': return 'bg-yellow-500/25 border-yellow-500/60 text-yellow-100 font-bold'
            case 'COMPLETED': return 'bg-green-500/25 border-green-500/60 text-green-100 opacity-60'
            default: return 'bg-red-500/25 border-red-500/60 text-red-100 font-bold' // PENDING
        }
    }

    const chunkItems = ticket.chunk_items ?? ticket.items ?? []
    const isAllCompleted = chunkItems.every(it => it.status === 'COMPLETED' || it.status === 'DELIVERED')

    return (
        <div className={`card ${isTv ? 'p-2.5 space-y-2 text-xs' : 'p-4 space-y-3'} animate-[fadeIn_0.3s_ease-out] transition-all duration-300 ${isAllCompleted ? 'ring-2 ring-green-500 bg-green-900/15' : ''} ${ticket.is_delivery ? 'ring-2 ring-orange-600/70 bg-orange-950/10' : ''}`}>
            {/* Cabecera del ticket */}
            <div className="flex items-start justify-between">
                <div>
                    {ticket.is_delivery ? (
                        <>
                            <p className="text-[10px] text-orange-400 uppercase tracking-wide font-semibold">🛵 Delivery</p>
                            <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`${isTv ? 'text-base' : 'text-xl'} font-black ${isAllCompleted ? 'text-green-400' : 'text-orange-300'}`}>
                                    {ticket.delivery_info?.customer_name || 'Cliente'}
                                </span>
                            </div>
                        </>
                    ) : (
                        <>
                            <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">Mesa</p>
                            <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`${isTv ? 'text-2xl' : 'text-3xl'} font-black ${isAllCompleted ? 'text-green-400' : 'text-white'}`}>
                                    {ticket.table_number ?? '?'}
                                </span>
                                {ticket.total_chunks > 1 && (
                                    <span className="text-amber-400 font-black text-xs sm:text-sm bg-amber-950/90 px-2 py-0.5 rounded-md border border-amber-500/50 shadow-sm">
                                        ({ticket.chunk_index + 1}/{ticket.total_chunks})
                                    </span>
                                )}
                            </div>
                        </>
                    )}
                    {ticket.waiter_name && (
                        <span className={`inline-flex items-center gap-1 ${isTv ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-0.5'} font-bold text-brand-300 bg-brand-950/80 border border-brand-700/60 rounded-lg mt-0.5 shadow-sm`}>
                            <span>👤</span> {ticket.waiter_name}
                        </span>
                    )}
                </div>
                <div className="text-right">
                    {ticket.is_delivery && (
                        <span className="inline-block bg-orange-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wide mb-1">
                            DELIVERY
                        </span>
                    )}
                    {!ticket.is_delivery && ticket.total_chunks > 1 && <div />}
                    <p className="text-[10px] text-gray-400 font-medium">Ticket #{ticket.ticket_number}</p>
                    <p className={`${isTv ? 'text-xs' : 'text-sm'} text-gray-300 font-bold`}>{time}</p>
                </div>
            </div>

            <hr className="border-gray-800" />

            {/* Ítems (Máx 3 por tarjeta) */}
            <ul className={isTv ? 'space-y-1.5' : 'space-y-2'}>
                {chunkItems.map((item, i) => {
                    const isTakeoutItem = item.is_takeout || item.notes?.includes('[PARA LLEVAR]') || item.notes?.includes('[LLEVAR]')
                    const cleanNotes = (item.notes || '').replace(/\[PARA LLEVAR\]|\[LLEVAR\]/g, '').trim()
                    const isFlashing = flashItemIds.includes(item.order_item_id)
                    const isEditedItem = item.is_edited || isFlashing

                    return (
                        <li key={i}
                            onClick={() => advanceStatus(item)}
                            className={`rounded-lg ${isTv ? 'px-2 py-1' : 'px-3 py-2'} border transition-all cursor-pointer hover:brightness-125 ${getStatusColors(item.status)} ${isFlashing ? 'ring-2 ring-cyan-400 bg-cyan-950/80 animate-pulse' : ''}`}>
                            <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`bg-black/50 text-white ${isTv ? 'text-xs w-5 h-5' : 'text-sm w-7 h-7'} font-black rounded-md flex items-center justify-center shrink-0`}>
                                    {item.qty}
                                </span>
                                <span className={`${isTv ? 'text-xs' : 'text-sm'} font-bold leading-tight text-white`}>
                                    {item.product}
                                </span>

                                {isEditedItem && (
                                    <span className="bg-cyan-500 text-gray-950 font-black text-[10px] sm:text-xs px-2 py-0.5 rounded-md tracking-wider shrink-0 shadow-sm border border-cyan-300">
                                        ✏️ EDITADO
                                    </span>
                                )}

                                {isTakeoutItem && (
                                    <span className="bg-amber-400 text-gray-950 font-black text-[10px] sm:text-xs px-2 py-0.5 rounded-md tracking-wider shrink-0 shadow-sm border border-amber-300">
                                        🛍️ PARA LLEVAR
                                    </span>
                                )}

                                <span className={`${isTv ? 'text-[10px] px-1.5 py-0.2' : 'text-xs px-2 py-0.5'} font-extrabold rounded-full bg-black/40 shrink-0 ml-auto`}>
                                    {item.status === 'PENDING' ? 'ESPERA' : item.status === 'PREPARING' ? 'PREPARANDO' : 'LISTO'}
                                </span>
                            </div>
                            {cleanNotes && (
                                <p className={`${isTv ? 'text-[11px] ml-6' : 'text-xs ml-9'} mt-0.5 text-yellow-300 font-semibold`}>⚠ {cleanNotes}</p>
                            )}
                            {(item.modifiers ?? []).map((mod, mi) => (
                                <p key={mi} className={`${isTv ? 'text-[10px] ml-6' : 'text-xs ml-9'} opacity-80 text-gray-300`}>
                                    · {mod.group}: {mod.option}
                                </p>
                            ))}
                        </li>
                    )
                })}
            </ul>

            {/* Botón Listo */}
            {!isHistory && (
                <button
                    onClick={() => onDismiss(ticket.chunk_key)}
                    className={`w-full ${isTv ? 'text-xs py-1' : 'text-sm py-1.5'} transition-colors font-bold rounded-lg
                        ${isAllCompleted ? 'bg-green-600 hover:bg-green-500 text-white shadow-md' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'}`}
                >
                    ✓ Ocultar Ticket
                </button>
            )}
        </div>
    )
}
