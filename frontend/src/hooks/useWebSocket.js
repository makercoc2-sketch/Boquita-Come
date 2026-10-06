import { useEffect, useRef, useState, useCallback } from 'react'

const WS_BASE = import.meta.env.VITE_WS_URL ?? `ws://${window.location.hostname}:8000`

/**
 * Hook que mantiene una conexión WebSocket a una sala específica.
 *
 * @param {string} room  - "kitchen" | "cashier" | `table_${id}`
 * @returns {{ lastMessage, isConnected, sendMessage }}
 */
export function useWebSocket(room) {
    const [lastMessage, setLastMessage] = useState(null)
    const [isConnected, setIsConnected] = useState(false)
    const wsRef = useRef(null)
    const reconnectTimer = useRef(null)

    const connect = useCallback(() => {
        if (!room) {
            setIsConnected(false)
            return
        }
        const url = `${WS_BASE}/ws/${room}`
        const ws = new WebSocket(url)

        ws.onopen = () => {
            setIsConnected(true)
            console.info(`[WS] Conectado a sala "${room}"`)
            // Ping periódico para mantener la conexión viva
            const pingInterval = setInterval(() => {
                if (ws.readyState === WebSocket.OPEN) ws.send('ping')
            }, 25_000)
            ws._ping = pingInterval
        }

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data)
                setLastMessage(data)
            } catch {
                setLastMessage(event.data)
            }
        }

        ws.onclose = () => {
            setIsConnected(false)
            if (ws._ping) clearInterval(ws._ping)
            console.warn(`[WS] Desconectado de "${room}". Reconectando en 3s...`)
            reconnectTimer.current = setTimeout(connect, 3_000)
        }

        ws.onerror = (err) => {
            console.error(`[WS] Error en sala "${room}":`, err)
            ws.close()
        }

        wsRef.current = ws
    }, [room])

    useEffect(() => {
        if (!room) return
        connect()
        return () => {
            clearTimeout(reconnectTimer.current)
            if (wsRef.current?._ping) clearInterval(wsRef.current._ping)
            wsRef.current?.close()
        }
    }, [connect, room])


    const sendMessage = useCallback((data) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(typeof data === 'string' ? data : JSON.stringify(data))
        }
    }, [])

    return { lastMessage, isConnected, sendMessage }
}
