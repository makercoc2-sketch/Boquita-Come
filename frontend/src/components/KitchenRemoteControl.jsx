import { useState, useEffect, useContext, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { AuthContext } from '../contexts/AuthContext'
import { sendKitchenControl } from '../api/client'
import { useWebSocket } from '../hooks/useWebSocket'

/**
 * Control Remoto de Cocina para Caja / Administrador.
 * Permite controlar el desplazamiento de la pantalla de Cocina (TV Box)
 * en tiempo real sin que los cocineros tengan que tocar controles ni pantallas.
 */
export default function KitchenRemoteControl() {
    const { user } = useContext(AuthContext)
    const location = useLocation()
    const [isExpanded, setIsExpanded] = useState(() => localStorage.getItem('kds_remote_expanded') === 'true')
    const [autoScrollActive, setAutoScrollActive] = useState(() => localStorage.getItem('kds_remote_autoscroll') !== 'false')
    const [feedback, setFeedback] = useState(null)
    const [isSending, setIsSending] = useState(false)

    // Escuchar eventos globales para mantener sincronizado el estado del auto-scroll
    const { lastMessage } = useWebSocket('global')

    useEffect(() => {
        if (!lastMessage) return
        if (lastMessage.event === 'kds_remote_control') {
            if (lastMessage.action === 'set_autoscroll') {
                setAutoScrollActive(Boolean(lastMessage.value))
                localStorage.setItem('kds_remote_autoscroll', String(lastMessage.value))
            } else if (lastMessage.action === 'toggle_autoscroll') {
                setAutoScrollActive(prev => {
                    const next = !prev
                    localStorage.setItem('kds_remote_autoscroll', String(next))
                    return next
                })
            }
        }
    }, [lastMessage])

    const sendCommand = useCallback(async (action, value = null, label = '') => {
        setIsSending(true)
        setFeedback(label)
        try {
            await sendKitchenControl(action, value)
            if (action === 'toggle_autoscroll') {
                setAutoScrollActive(prev => {
                    const next = !prev
                    localStorage.setItem('kds_remote_autoscroll', String(next))
                    return next
                })
            } else if (action === 'set_autoscroll') {
                setAutoScrollActive(Boolean(value))
                localStorage.setItem('kds_remote_autoscroll', String(value))
            }
        } catch (err) {
            console.error('Error enviando comando a cocina:', err)
            setFeedback('⚠️ Error de conexión')
        } finally {
            setIsSending(false)
            setTimeout(() => setFeedback(null), 2500)
        }
    }, [])

    // Atajos de teclado rápidos (Alt + Flecha Abajo / Arriba / Inicio / S)
    useEffect(() => {
        const handleKeyDown = (e) => {
            // Ignorar si el usuario está escribiendo en un input, textarea o select
            const tag = e.target.tagName.toLowerCase()
            if (tag === 'input' || tag === 'textarea' || tag === 'select') return

            if (e.altKey && e.key === 'ArrowDown') {
                e.preventDefault()
                sendCommand('scroll_down', null, '🔽 Bajando...')
            } else if (e.altKey && e.key === 'ArrowUp') {
                e.preventDefault()
                sendCommand('scroll_up', null, '🔼 Subiendo...')
            } else if (e.altKey && e.key === 'Home') {
                e.preventDefault()
                sendCommand('scroll_top', null, '🔝 Arriba...')
            } else if (e.altKey && (e.key === 's' || e.key === 'S')) {
                e.preventDefault()
                sendCommand('toggle_autoscroll', null, '📜 Auto-scroll')
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [sendCommand])

    // Solo visible para Caja, Administrador y Sistemas
    if (!user || !['Administrador', 'Sistemas', 'Caja'].includes(user.role)) {
        return null
    }

    // No mostrar dentro de la propia vista de cocina (ya tiene sus controles locales)
    if (location.pathname === '/kitchen') {
        return null
    }

    const toggleExpand = () => {
        setIsExpanded(prev => {
            const next = !prev
            localStorage.setItem('kds_remote_expanded', String(next))
            return next
        })
    }

    return (
        <div className="fixed bottom-4 right-4 z-40 select-none font-sans">
            {!isExpanded ? (
                /* ── Pastilla Minimizada ───────────────────────────────── */
                <button
                    onClick={toggleExpand}
                    title="Abrir Control Remoto de Cocina (TV)"
                    className="flex items-center gap-2.5 bg-gray-900/95 hover:bg-gray-800 text-white px-3.5 py-2.5 rounded-2xl border border-gray-700 shadow-2xl transition-all duration-200 group active:scale-95"
                >
                    <span className="text-lg group-hover:scale-110 transition-transform">🍳</span>
                    <div className="text-left">
                        <p className="text-xs font-black leading-tight flex items-center gap-1.5">
                            Control Cocina
                            <span className={`w-2 h-2 rounded-full ${autoScrollActive ? 'bg-green-400 animate-pulse' : 'bg-amber-400'}`} />
                        </p>
                        <p className="text-[10px] text-gray-400 font-medium">
                            {feedback ? feedback : (autoScrollActive ? 'Auto: ON (10s)' : 'Auto: PAUSADO')}
                        </p>
                    </div>
                    <span className="text-xs text-gray-400 group-hover:text-white ml-1">▲</span>
                </button>
            ) : (
                /* ── Panel Expandido de Control Remoto ────────────────── */
                <div className="bg-gray-900/95 backdrop-blur-md border border-gray-700 rounded-2xl shadow-2xl p-3 w-72 space-y-2.5 animate-[fadeIn_0.2s_ease-out]">
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-gray-800 pb-2">
                        <div className="flex items-center gap-2">
                            <span className="text-lg">🍳</span>
                            <div>
                                <h3 className="text-xs font-black text-white flex items-center gap-1.5">
                                    Monitor Cocina (TV)
                                    <span className={`w-2 h-2 rounded-full ${autoScrollActive ? 'bg-green-400 animate-pulse' : 'bg-amber-400'}`} />
                                </h3>
                                <p className="text-[10px] text-gray-400">Control en tiempo real</p>
                            </div>
                        </div>
                        <button
                            onClick={toggleExpand}
                            className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-800 text-xs transition-colors"
                            title="Minimizar"
                        >
                            ✕
                        </button>
                    </div>

                    {/* Feedback Temporal */}
                    {feedback && (
                        <div className="bg-brand-950/80 border border-brand-700/60 text-brand-300 text-xs font-bold px-2.5 py-1 rounded-xl text-center animate-pulse">
                            {feedback}
                        </div>
                    )}

                    {/* Botones de Navegación Vertical */}
                    <div className="grid grid-cols-3 gap-1.5">
                        <button
                            onClick={() => sendCommand('scroll_up', null, '🔼 Subiendo en TV')}
                            disabled={isSending}
                            title="Subir vista (Alt + ▲)"
                            className="bg-gray-800 hover:bg-gray-700 active:bg-gray-600 border border-gray-700 text-white font-black py-2 px-2 rounded-xl text-xs flex flex-col items-center justify-center gap-0.5 transition-all shadow-sm"
                        >
                            <span className="text-base">🔼</span>
                            <span>Subir</span>
                        </button>

                        <button
                            onClick={() => sendCommand('scroll_down', null, '🔽 Bajando en TV')}
                            disabled={isSending}
                            title="Bajar vista (Alt + ▼)"
                            className="bg-gray-800 hover:bg-gray-700 active:bg-gray-600 border border-gray-700 text-white font-black py-2 px-2 rounded-xl text-xs flex flex-col items-center justify-center gap-0.5 transition-all shadow-sm"
                        >
                            <span className="text-base">🔽</span>
                            <span>Bajar</span>
                        </button>

                        <button
                            onClick={() => sendCommand('scroll_top', null, '🔝 Arriba del todo')}
                            disabled={isSending}
                            title="Volver arriba (Alt + Inicio)"
                            className="bg-gray-800 hover:bg-gray-700 active:bg-gray-600 border border-gray-700 text-white font-black py-2 px-2 rounded-xl text-xs flex flex-col items-center justify-center gap-0.5 transition-all shadow-sm"
                        >
                            <span className="text-base">🔝</span>
                            <span>Inicio</span>
                        </button>
                    </div>

                    {/* Interruptor de Auto-Scroll */}
                    <div className="pt-1 border-t border-gray-800">
                        <button
                            onClick={() => sendCommand('toggle_autoscroll', null, autoScrollActive ? '⏸️ Pausando auto-scroll' : '📜 Activando auto-scroll')}
                            disabled={isSending}
                            className={`w-full py-2 px-3 rounded-xl font-black text-xs flex items-center justify-between border transition-all ${autoScrollActive
                                ? 'bg-green-900/30 border-green-700 text-green-300 hover:bg-green-900/50'
                                : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
                                }`}
                        >
                            <span className="flex items-center gap-1.5">
                                <span>📜</span> Auto-scroll (10s)
                            </span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${autoScrollActive ? 'bg-green-500 text-black' : 'bg-gray-700 text-gray-400'}`}>
                                {autoScrollActive ? 'ACTIVO' : 'PAUSADO'}
                            </span>
                        </button>
                    </div>

                    {/* Atajos de teclado */}
                    <div className="flex items-center justify-between text-[10px] text-gray-400 px-1 pt-0.5">
                        <span>Atajos:</span>
                        <span className="text-gray-400 font-mono">Alt + ▲ / ▼</span>
                    </div>
                </div>
            )}
        </div>
    )
}
