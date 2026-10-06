import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import TableCard from '../components/TableCard'
import { getTables, createTable, deleteTable, mergeTables, unmergeTables, getActiveKitchenTickets } from '../api/client'
import { AuthContext } from '../contexts/AuthContext'
import { useContext, useRef } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'

export default function TableMap() {
    const [tables, setTables] = useState([])
    const [loading, setLoading] = useState(true)
    const [mergeMode, setMergeMode] = useState(false)
    const [selected, setSelected] = useState([])   // IDs seleccionadas para merge
    const [primaryId, setPrimaryId] = useState(null)
    const [filterStatus, setFilterStatus] = useState(null) // Filtro de estado
    const [error, setError] = useState(null)
    const [readyTables, setReadyTables] = useState(new Set())
    const { user } = useContext(AuthContext)
    const navigate = useNavigate()

    const audioRef = useRef(null)

    // Crear el elemento de audio una sola vez
    useEffect(() => {
        audioRef.current = new Audio('data:audio/mp3;base64,//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq/') // Base64 dummy ping if real file absent (but we'll use a synthesized beep to avoid asset problems)
    }, [])

    const playPing = () => {
        try {
            // Activar vibración si el dispositivo lo soporta (ej. [vibrar, pausa, vibrar])
            if (navigator.vibrate) {
                navigator.vibrate([200, 100, 200]);
            }

            const ctx = new (window.AudioContext || window.webkitAudioContext)()
            if (ctx.state === 'suspended') ctx.resume()

            // Sonido de campanilla doble de restaurante ("ding-ding")
            const playBell = (freq, startTime, duration) => {
                const osc = ctx.createOscillator()
                const gain = ctx.createGain()
                osc.connect(gain)
                gain.connect(ctx.destination)

                osc.type = 'sine'
                osc.frequency.setValueAtTime(freq, startTime)

                gain.gain.setValueAtTime(0, startTime)
                gain.gain.linearRampToValueAtTime(0.5, startTime + 0.02)
                gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration)

                osc.start(startTime)
                osc.stop(startTime + duration)
            }

            const now = ctx.currentTime
            playBell(1800, now, 0.6)          // Primer campanazo
            playBell(2200, now + 0.15, 0.8)   // Segundo campanazo (eco agudo)
        } catch (e) { console.warn("Audio/Vibration not supported", e) }
    }

    const { lastMessage } = useWebSocket(user ? `waiter/${user.id}` : null)
    const { lastMessage: globalMessage } = useWebSocket('global')

    // ── Carga de mesas y tickets ───────────────────────────────────────────────
    const load = useCallback(async () => {
        try {
            const [tablesRes, ticketsRes] = await Promise.all([
                getTables(),
                getActiveKitchenTickets()
            ])
            setTables(tablesRes.data)

            // Procesar tickets activos para marcar mesas con platos 'COMPLETED'
            const readySet = new Set()
            ticketsRes.data.forEach(ticket => {
                const hasReady = ticket.items.some(item => item.status === 'COMPLETED')
                if (hasReady && ticket.table_id) readySet.add(ticket.table_id)
            })
            setReadyTables(readySet)

        } catch (err) {
            setError('No se pudo conectar al servidor.')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { load() }, [load])

    // Escuchar WS para nuevos platos listos
    useEffect(() => {
        if (!lastMessage) return
        if (lastMessage.event === 'item_status_changed') {
            if (lastMessage.status === 'COMPLETED' && lastMessage.table_id) {
                setReadyTables(prev => {
                    const next = new Set(prev)
                    if (!next.has(lastMessage.table_id)) {
                        playPing()
                    }
                    next.add(lastMessage.table_id)
                    return next
                })
            }
        }
    }, [lastMessage])

    // Escuchar WS global para actualizaciones de mesas en tiempo real
    useEffect(() => {
        if (!globalMessage) return
        if (globalMessage.event === 'table_updated' && globalMessage.table) {
            setTables(prev => prev.map(t =>
                t.id === globalMessage.table.id
                    ? { ...t, ...globalMessage.table }
                    : t
            ))
        }
        // Recargar completamente al unir/separar mesas (cambia merged_into)
        if (globalMessage.event === 'tables_merged' || globalMessage.event === 'tables_unmerged') {
            load()
        }
    }, [globalMessage, load])

    // ── Crear mesa ─────────────────────────────────────────────────────────────
    const handleCreate = async () => {
        const numbers = tables.map(t => t.number)
        const next = numbers.length ? Math.max(...numbers) + 1 : 1
        const capacity = parseInt(prompt('Capacidad de la mesa:', '4'), 10) || 4
        try {
            await createTable({ number: next, capacity })
            load()
        } catch (err) {
            alert(err.response?.data?.detail ?? 'Error al crear mesa.')
        }
    }

    // ── Eliminar mesa ──────────────────────────────────────────────────────────
    const handleDelete = async (id) => {
        if (!confirm('¿Eliminar esta mesa?')) return
        try {
            await deleteTable(id)
            load()
        } catch (err) {
            alert(err.response?.data?.detail ?? 'Error al eliminar mesa.')
        }
    }

    // ── Merge ──────────────────────────────────────────────────────────────────
    const toggleSelect = (id) => {
        if (!primaryId) {
            // Primera seleccionada → es la principal
            setPrimaryId(id)
            setSelected([id])
        } else if (id === primaryId) {
            // Deseleccionar principal → reiniciar
            setPrimaryId(null)
            setSelected([])
        } else {
            setSelected(prev =>
                prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
            )
        }
    }

    const handleMerge = async () => {
        const secondaries = selected.filter(id => id !== primaryId)
        if (!secondaries.length) {
            alert('Selecciona al menos una mesa secundaria.')
            return
        }
        try {
            await mergeTables({ primary_table_id: primaryId, secondary_table_ids: secondaries })
            setMergeMode(false)
            setPrimaryId(null)
            setSelected([])
            load()
        } catch (err) {
            alert(err.response?.data?.detail ?? 'Error al unir mesas.')
        }
    }

    // ── Render ─────────────────────────────────────────────────────────────────
    if (loading) return (
        <div className="flex items-center justify-center h-64 text-gray-400">Cargando mesas…</div>
    )

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center justify-between gap-3">
                <h1 className="text-xl sm:text-2xl font-bold text-white whitespace-nowrap">Mapa de Mesas</h1>
                <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto">

                    {mergeMode ? (
                        <>
                            <span className="text-sm text-gray-400">
                                {primaryId
                                    ? `Mesa principal: #${tables.find(t => t.id === primaryId)?.number} → selecciona las secundarias`
                                    : 'Toca la mesa PRINCIPAL primero'}
                            </span>
                            <button onClick={handleMerge} className="btn-primary" disabled={selected.length < 2}>
                                ⛓ Confirmar Unión
                            </button>
                            <button onClick={() => { setMergeMode(false); setPrimaryId(null); setSelected([]) }}
                                className="btn-secondary">
                                Cancelar
                            </button>
                        </>
                    ) : (
                        <>
                            <button onClick={handleCreate} className="btn-primary w-full sm:w-auto flex-1 sm:flex-none">+ Nueva Mesa</button>
                            <button onClick={() => setMergeMode(true)} className="btn-secondary w-full sm:w-auto flex-1 sm:flex-none">⛓ Unir Mesas</button>
                        </>
                    )}
                </div>
            </div>

            {error && (
                <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-xl px-4 py-3">
                    {error}
                </div>
            )}

            {/* Filtros / Leyenda */}
            <div className="flex flex-wrap gap-4 text-sm mt-4 mb-2">
                <span className="text-gray-400 self-center hidden sm:inline-block">Filtros:</span>
                {[['ALL', 'Todas'], ['FREE', 'Libre'], ['OCCUPIED', 'Ocupada'], ['RESERVED', 'Reservada'], ['TOPAY', 'Por Pagar']].map(([s, l]) => {
                    const isActive = filterStatus === null ? s === 'ALL' : filterStatus === s;
                    const isAll = s === 'ALL';
                    const baseClass = isAll ? 'bg-gray-800 border-gray-600 text-gray-200' : `status-${s.toLowerCase()}`;

                    return (
                        <button
                            key={s}
                            onClick={() => setFilterStatus(isAll ? null : s)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all duration-200
                                ${baseClass}
                                ${!isActive && filterStatus !== null && !isAll ? 'opacity-40 grayscaleHover hover:opacity-100 hover:grayscale-0' : isActive ? 'ring-2 ring-offset-2 ring-offset-brand-950 scale-105' : 'hover:scale-105'}
                            `}
                        >
                            {!isAll && <span className="w-2 h-2 rounded-full bg-current" />}
                            {l}
                        </button>
                    )
                })}
            </div>

            {/* Grid de mesas */}
            {tables.length === 0 ? (
                <div className="card p-12 text-center text-gray-500">
                    No hay mesas. Crea la primera con el botón de arriba.
                </div>
            ) : (() => {
                const filteredTables = filterStatus ? tables.filter(t => t.status === filterStatus) : tables;

                if (filteredTables.length === 0) {
                    return (
                        <div className="card p-12 text-center text-gray-500">
                            No hay mesas con este estado.
                        </div>
                    )
                }

                return (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4 md:gap-5">
                        {filteredTables.map(table => (
                            <div key={table.id} className="relative group">
                                <TableCard
                                    table={table}
                                    isSelected={mergeMode ? selected.includes(table.id) : undefined}
                                    onSelect={() => toggleSelect(table.id)}
                                    onOpen={() => {
                                        const targetId = table.merged_into ? table.merged_into : table.id
                                        navigate(`/order/${targetId}`)
                                    }}
                                    hasReadyItems={readyTables.has(table.id)}
                                    mergedChildren={tables.filter(t => t.merged_into === table.id).length}
                                />
                                {/* Botón eliminar (solo en modo normal) */}
                                {!mergeMode && table.status === 'FREE' && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleDelete(table.id) }}
                                        className="absolute top-1 right-1 hidden group-hover:flex
                                w-6 h-6 items-center justify-center rounded-full
                                bg-red-600 text-white text-xs hover:bg-red-500 shadow-md"
                                        title="Eliminar mesa"
                                    >
                                        ×
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )
            })()}
        </div>
    )
}
