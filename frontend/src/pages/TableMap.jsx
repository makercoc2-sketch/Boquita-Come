import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import TableCard from '../components/TableCard'
import { getTables, createTable, deleteTable, mergeTables, unmergeTables, getActiveKitchenTickets, createDeliveryOrder, getActiveDeliveryOrders } from '../api/client'
import { AuthContext } from '../contexts/AuthContext'
import { useContext, useRef } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'

export default function TableMap() {
    const [tables, setTables] = useState([])
    const [deliveryOrders, setDeliveryOrders] = useState([])
    const [loading, setLoading] = useState(true)
    const [mergeMode, setMergeMode] = useState(false)
    const [selected, setSelected] = useState([])   // IDs seleccionadas para merge
    const [primaryId, setPrimaryId] = useState(null)
    const [filterStatus, setFilterStatus] = useState(null) // Filtro de estado
    const [error, setError] = useState(null)
    const [readyTables, setReadyTables] = useState(new Set())
    const { user } = useContext(AuthContext)
    const navigate = useNavigate()

    // ── Delivery modal state ──────────────────────────────────────────────────
    const [showDeliveryModal, setShowDeliveryModal] = useState(false)
    const [deliveryForm, setDeliveryForm] = useState({ customer_name: '', customer_phone: '', customer_address: '' })
    const [deliveryLoading, setDeliveryLoading] = useState(false)



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

    // ── Carga de mesas, delivery y tickets ────────────────────────────────────
    const load = useCallback(async () => {
        try {
            const [tablesRes, ticketsRes, deliveryRes] = await Promise.all([
                getTables(),
                getActiveKitchenTickets(),
                getActiveDeliveryOrders().catch(() => ({ data: [] }))
            ])
            setTables(tablesRes.data)
            setDeliveryOrders(deliveryRes.data || [])

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

    // Escuchar WS global para actualizaciones de mesas y pedidos delivery en tiempo real
    useEffect(() => {
        if (!globalMessage) return
        if (globalMessage.event === 'table_updated' && globalMessage.table) {
            setTables(prev => prev.map(t =>
                t.id === globalMessage.table.id
                    ? { ...t, ...globalMessage.table }
                    : t
            ))
        }
        // Recargar al haber cambios de delivery o uniones
        if (
            globalMessage.event === 'tables_merged' || 
            globalMessage.event === 'tables_unmerged' ||
            globalMessage.event === 'new_delivery_order' ||
            globalMessage.event === 'new_ticket'
        ) {
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

    // ── Crear pedido delivery ───────────────────────────────────────────────────
    const handleDelivery = async (e) => {
        e.preventDefault()
        if (!deliveryForm.customer_name.trim()) {
            alert('El nombre del cliente es obligatorio.')
            return
        }
        setDeliveryLoading(true)
        try {
            const { data } = await createDeliveryOrder({
                user_id: user?.id,
                customer_name: deliveryForm.customer_name.trim(),
                customer_phone: deliveryForm.customer_phone.trim(),
                customer_address: deliveryForm.customer_address.trim(),
            })
            setShowDeliveryModal(false)
            setDeliveryForm({ customer_name: '', customer_phone: '', customer_address: '' })
            // Navegar al panel de la orden delivery (usa el order id directamente)
            navigate(`/order/${data.id}?delivery=1`)
        } catch (err) {
            alert(err.response?.data?.detail ?? 'Error al crear pedido delivery.')
        } finally {
            setDeliveryLoading(false)
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
                            {['Administrador', 'Sistemas', 'Caja'].includes(user?.role) && (
                                <button
                                    onClick={() => setShowDeliveryModal(true)}
                                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl font-semibold text-sm bg-orange-600 hover:bg-orange-500 text-white transition-all active:scale-95 shadow-md w-full sm:w-auto flex-1 sm:flex-none"
                                >
                                    🛵 Nuevo Delivery
                                </button>
                            )}
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

            {/* ── Sección de Pedidos Delivery Activos (si hay alguno) ──────── */}
            {deliveryOrders.length > 0 && (
                <div className="bg-gray-900/60 border border-orange-500/30 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <h2 className="text-base font-bold text-orange-400 flex items-center gap-2">
                            <span>🛵</span> Pedidos Delivery Activos ({deliveryOrders.length})
                        </h2>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                        {deliveryOrders.map(deliv => {
                            const customerName = deliv.extra?.customer_name || 'Cliente'
                            const customerPhone = deliv.extra?.customer_phone || ''
                            const customerAddress = deliv.extra?.customer_address || ''
                            const itemsCount = (deliv.items || []).length
                            const isSent = deliv.status === 'SENT'

                            return (
                                <div
                                    key={deliv.id}
                                    onClick={() => navigate(`/order/${deliv.id}?delivery=1`)}
                                    className="p-3.5 rounded-xl border border-orange-600/40 bg-orange-950/20 hover:bg-orange-900/30 transition-all cursor-pointer space-y-2 hover:scale-[1.02] shadow-sm group"
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div>
                                            <span className="font-bold text-white text-base group-hover:text-orange-300">
                                                {customerName}
                                            </span>
                                            {customerPhone && (
                                                <p className="text-xs text-gray-400">📞 {customerPhone}</p>
                                            )}
                                        </div>
                                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                                            isSent ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' : 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                                        }`}>
                                            {isSent ? 'EN COCINA' : 'ABIERTO'}
                                        </span>
                                    </div>

                                    {customerAddress && (
                                        <p className="text-xs text-gray-300 truncate" title={customerAddress}>
                                            📍 {customerAddress}
                                        </p>
                                    )}

                                    <div className="flex items-center justify-between pt-1 border-t border-gray-800 text-xs text-gray-400">
                                        <span>{itemsCount} {itemsCount === 1 ? 'plato' : 'platos'}</span>
                                        <span className="font-bold text-white">S/ {Number(deliv.subtotal || 0).toFixed(2)}</span>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}

            {/* Grid de mesas — excluye la mesa virtual de delivery (number=0) */}
            {tables.filter(t => t.number !== 0).length === 0 ? (

                <div className="card p-12 text-center text-gray-500">
                    No hay mesas. Crea la primera con el botón de arriba.
                </div>
            ) : (() => {
                const filteredTables = (filterStatus
                    ? tables.filter(t => t.status === filterStatus)
                    : tables
                ).filter(t => t.number !== 0);  // ocultar mesa virtual delivery

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

            {/* ── Modal Nuevo Delivery ─────────────────────────────────────── */}
            {showDeliveryModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="card w-full max-w-md p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                🛵 <span>Nuevo Pedido Delivery</span>
                            </h2>
                            <button onClick={() => { setShowDeliveryModal(false); setDeliveryForm({ customer_name: '', customer_phone: '', customer_address: '' }) }}
                                className="text-gray-400 hover:text-white text-xl leading-none">✕</button>
                        </div>
                        <form onSubmit={handleDelivery} className="space-y-3">
                            <div>
                                <label className="block text-sm text-gray-300 font-semibold mb-1">Nombre del cliente *</label>
                                <input
                                    type="text"
                                    className="w-full bg-gray-950 border border-gray-700 rounded-xl px-3.5 py-2.5 text-white placeholder-gray-500 font-medium focus:border-brand-500 focus:outline-none"
                                    placeholder="Ej: Juan Pérez"
                                    value={deliveryForm.customer_name}
                                    onChange={e => setDeliveryForm(f => ({ ...f, customer_name: e.target.value }))}
                                    required
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-300 font-semibold mb-1">Teléfono</label>
                                <input
                                    type="tel"
                                    className="w-full bg-gray-950 border border-gray-700 rounded-xl px-3.5 py-2.5 text-white placeholder-gray-500 font-medium focus:border-brand-500 focus:outline-none"
                                    placeholder="Ej: 987654321"
                                    value={deliveryForm.customer_phone}
                                    onChange={e => setDeliveryForm(f => ({ ...f, customer_phone: e.target.value }))}
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-300 font-semibold mb-1">Dirección de entrega</label>
                                <input
                                    type="text"
                                    className="w-full bg-gray-950 border border-gray-700 rounded-xl px-3.5 py-2.5 text-white placeholder-gray-500 font-medium focus:border-brand-500 focus:outline-none"
                                    placeholder="Ej: Av. Lima 123, Miraflores"
                                    value={deliveryForm.customer_address}
                                    onChange={e => setDeliveryForm(f => ({ ...f, customer_address: e.target.value }))}
                                />
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button type="submit" className="btn-primary flex-1" disabled={deliveryLoading}>
                                    {deliveryLoading ? 'Creando…' : '✓ Crear Pedido'}
                                </button>
                                <button type="button"
                                    onClick={() => { setShowDeliveryModal(false); setDeliveryForm({ customer_name: '', customer_phone: '', customer_address: '' }) }}
                                    className="btn-secondary flex-1">
                                    Cancelar
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}

