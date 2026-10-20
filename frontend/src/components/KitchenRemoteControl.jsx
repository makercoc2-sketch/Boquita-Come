import { useState, useEffect, useContext, useCallback } from 'react'
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

    // Escuchar evento disparado desde el botón de la barra de navegación (Navbar)
    useEffect(() => {
        const handleToggleEvent = () => {
            setIsExpanded(prev => {
                const next = !prev
                localStorage.setItem('kds_remote_expanded', String(next))
                return next
            })
        }
        window.addEventListener('toggle-kds-remote', handleToggleEvent)
        return () => window.removeEventListener('toggle-kds-remote', handleToggleEvent)
    }, [])

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

    const toggleExpand = () => {
        setIsExpanded(prev => {
            const next = !prev
            localStorage.setItem('kds_remote_expanded', String(next))
            return next
        })
    }

    return (
        <div className="fixed bottom-5 right-5 z-50 select-none font-sans">
            {!isExpanded ? (
                /* ── Pastilla Minimizada ───────────────────────────────── */
                <button
                    onClick={toggleExpand}
                    title="Abrir Control Remoto de Cocina (TV)"
                    className="flex items-center gap-2.5 bg-gray-900/95 hover:bg-gray-800 text-white px-4 py-2.5 rounded-2xl border-2 border-brand-500/60 shadow-[0_4px_25px_rgba(0,0,0,0.6)] transition-all duration-200 group active:scale-95"
                >
                    <span className="text-xl group-hover:scale-110 transition-transform">🍳</span>
                    <div className="text-left">
                        <p className="text-xs font-black leading-tight flex items-center gap-1.5">
                            Control Cocina
                            <span className={`w-2 h-2 rounded-full ${autoScrollActive ? 'bg-green-400 animate-pulse' : 'bg-amber-400'}`} />
                        </p>
                        <p className="text-[10px] text-gray-400 font-medium">
                            {feedback ? feedback : (autoScrollActive ? 'Auto: ON (10s)' : 'Auto: PAUSADO')}
                        </p>
                    </div>
                    <span className="text-xs text-brand-400 group-hover:text-white ml-1">▲</span>
                </button>
            ) : (
                /* ── Panel Expandido de Control Remoto ────────────────── */
                <div className="bg-gray-900/98 backdrop-blur-md border-2 border-brand-500/60 rounded-2xl shadow-[0_8px_35px_rgba(0,0,0,0.8)] p-3.5 w-72 space-y-2.5 animate-[fadeIn_0.2s_ease-out]">
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-gray-800 pb-2">
                        <div className="flex items-center gap-2">
                            <span className="text-xl">🍳</span>
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
                        <div className="bg-brand-950 border border-brand-600 text-brand-300 text-xs font-bold px-2.5 py-1 rounded-xl text-center animate-pulse">
                            {feedback}
                        </div>
                    )}

                    {/* Botones de Navegación Vertical */}
                    <div className="grid grid-cols-3 gap-2">
                        <button
                            onClick={() => sendCommand('scroll_up', null, '🔼 Subiendo en TV')}
                            disabled={isSending}
                            title="Subir vista (Alt + ▲)"
                            className="bg-gray-800 hover:bg-gray-700 active:bg-gray-600 border border-gray-700 text-white font-black py-2.5 px-2 rounded-xl text-xs flex flex-col items-center justify-center gap-1 transition-all shadow-sm active:scale-95"
                        >
                            <span className="text-base">🔼</span>
                            <span>Subir</span>
                        </button>

                        <button
                            onClick={() => sendCommand('scroll_down', null, '🔽 Bajando en TV')}
                            disabled={isSending}
                            title="Bajar vista (Alt + ▼)"
                            className="bg-gray-800 hover:bg-gray-700 active:bg-gray-600 border border-gray-700 text-white font-black py-2.5 px-2 rounded-xl text-xs flex flex-col items-center justify-center gap-1 transition-all shadow-sm active:scale-95"
                        >
                            <span className="text-base">🔽</span>
                            <span>Bajar</span>
                        </button>

                        <button
                            onClick={() => sendCommand('scroll_top', null, '🔝 Arriba del todo')}
                            disabled={isSending}
                            title="Volver arriba (Alt + Inicio)"
                            className="bg-gray-800 hover:bg-gray-700 active:bg-gray-600 border border-gray-700 text-white font-black py-2.5 px-2 rounded-xl text-xs flex flex-col items-center justify-center gap-1 transition-all shadow-sm active:scale-95"
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
                            className={`w-full py-2.5 px-3 rounded-xl font-black text-xs flex items-center justify-between border transition-all active:scale-95 ${autoScrollActive
                                ? 'bg-green-900/40 border-green-600 text-green-300 hover:bg-green-900/60'
                                : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
                                }`}
                        >
                            <span className="flex items-center gap-1.5">
                                <span>📜</span> Auto-scroll (10s)
                            </span>
                            <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-black ${autoScrollActive ? 'bg-green-500 text-gray-950' : 'bg-gray-700 text-gray-400'}`}>
                                {autoScrollActive ? 'ACTIVO' : 'PAUSADO'}
                            </span>
                        </button>
                    </div>

                    {/* Atajos de teclado */}
                    <div className="flex items-center justify-between text-[10px] text-gray-400 px-1 pt-0.5">
                        <span>Atajos:</span>
                        <span className="text-brand-300 font-mono font-bold">Alt + ▲ / ▼</span>
                    </div>
                </div>
            )}
        </div>
    )
}
