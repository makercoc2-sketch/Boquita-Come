import { useEffect, useRef, useState, useCallback } from 'react'

const getWsBase = () => {
    if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host || `${window.location.hostname}:8000`
    return `${protocol}//${host}`
}

/**
 * Hook que mantiene una conexión WebSocket ultra resistente a una sala específica.
 * Incluye Heartbeat / Watchdog para detectar y revivir sockets zombis en TV Bro / Android TV.
 *
 * @param {string} room  - "kitchen" | "bar" | "cashier" | `waiter_${id}`
 * @returns {{ lastMessage, isConnected, sendMessage, reconnect: () => void }}
 */
export function useWebSocket(room) {
    const [lastMessage, setLastMessage] = useState(null)
    const [isConnected, setIsConnected] = useState(false)
    const wsRef = useRef(null)
    const reconnectTimer = useRef(null)
    const watchdogTimer = useRef(null)
    const pingTimer = useRef(null)
    const lastActivityRef = useRef(Date.now())
    const isConnectingRef = useRef(false)

    const cleanup = useCallback(() => {
        if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
        if (watchdogTimer.current) clearInterval(watchdogTimer.current)
        if (pingTimer.current) clearInterval(pingTimer.current)
        if (wsRef.current) {
            try {
                wsRef.current.onopen = null
                wsRef.current.onmessage = null
                wsRef.current.onerror = null
                wsRef.current.onclose = null
                wsRef.current.close()
            } catch {
                // Silencioso
            }
            wsRef.current = null
        }
    }, [])

    const connect = useCallback(() => {
        if (!room) {
            setIsConnected(false)
            return
        }

        cleanup()

        try {
            const baseUrl = getWsBase()
            const url = `${baseUrl}/ws/${room}`
            const ws = new WebSocket(url)
            wsRef.current = ws
            lastActivityRef.current = Date.now()

            ws.onopen = () => {
                setIsConnected(true)
                lastActivityRef.current = Date.now()
                console.info(`[WS] Conectado a sala "${room}" (${url})`)

                // 1. Ping periódico cada 10s para mantener el socket despierto en Android / TV Box
                pingTimer.current = setInterval(() => {
                    if (ws.readyState === WebSocket.OPEN) {
                        try {
                            ws.send('ping')
                        } catch (e) {
                            console.warn('[WS] Fallo al enviar ping:', e)
                        }
                    }
                }, 10_000)

                // 2. Watchdog: si pasan más de 25s sin respuesta o mensaje, el socket está zombi
                watchdogTimer.current = setInterval(() => {
                    if (Date.now() - lastActivityRef.current > 25_000) {
                        console.warn(`[WS] Socket congelado en "${room}" (>25s sin respuesta). Forzando reconexión...`)
                        setIsConnected(false)
                        connect()
                    }
                }, 5_000)
            }

            ws.onmessage = (event) => {
                lastActivityRef.current = Date.now()
                if (event.data === 'pong') {
                    return // Respuesta interna de keep-alive
                }
                try {
                    const data = JSON.parse(event.data)
                    setLastMessage(data)
                } catch {
                    setLastMessage(event.data)
                }
            }

            ws.onclose = () => {
                setIsConnected(false)
                cleanup()
                console.warn(`[WS] Desconectado de "${room}". Reconectando en 3s...`)
                reconnectTimer.current = setTimeout(connect, 3_000)
            }

            ws.onerror = (err) => {
                console.error(`[WS] Error en sala "${room}":`, err)
                try { ws.close() } catch { }
            }
        } catch (err) {
            console.error(`[WS] Excepción al conectar sala "${room}":`, err)
            setIsConnected(false)
            reconnectTimer.current = setTimeout(connect, 4_000)
        }
    }, [room, cleanup])

    useEffect(() => {
        if (!room) return
        connect()

        // Si la TV o la pestaña se reactivan (pasan a primer plano), verificar y revivir socket
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || Date.now() - lastActivityRef.current > 15_000) {
                    console.info('[WS] Pantalla activa detectada, sincronizando conexión WebSocket...')
                    connect()
                }
            }
        }

        const handleOnline = () => {
            console.info('[WS] Red restaurada (online), reconectando...')
            connect()
        }

        document.addEventListener('visibilitychange', handleVisibilityChange)
        window.addEventListener('online', handleOnline)

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange)
            window.removeEventListener('online', handleOnline)
            cleanup()
        }
    }, [connect, room, cleanup])

    const sendMessage = useCallback((data) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(typeof data === 'string' ? data : JSON.stringify(data))
        }
    }, [])

    return { lastMessage, isConnected, sendMessage, reconnect: connect }
}
