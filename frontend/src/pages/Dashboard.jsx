import { useState, useEffect } from 'react'
import { getDashboardStats } from '../api/client'
import AdminChatbot from '../components/AdminChatbot'

export default function Dashboard() {
    const [stats, setStats] = useState(null)
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState('month')

    useEffect(() => {
        loadStats()
    }, [filter])

    const loadStats = async () => {
        setLoading(true)
        try {
            const { data } = await getDashboardStats(filter)
            setStats(data)
        } catch (err) {
            console.error('Error al cargar dashboard', err)
        } finally {
            setLoading(false)
        }
    }

    if (loading) return <div className="text-gray-400 p-8 text-center animate-pulse">Cargando métricas...</div>
    if (!stats) return <div className="text-red-400 p-8 text-center">No se pudieron cargar las estadísticas.</div>

    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            {/* ── Encabezado y Filtros ─────────────────────────────────── */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <span>📊</span> Dashboard Administrativo
                    </h1>
                    <p className="text-gray-400 text-sm">Resumen de ventas y rendimiento del equipo.</p>
                </div>
                <div className="flex bg-gray-900 rounded-xl overflow-hidden border border-gray-800">
                    {[{ id: 'today', l: 'Hoy' }, { id: 'week', l: 'Semana' }, { id: 'month', l: 'Mes' }].map(f => (
                        <button
                            key={f.id}
                            onClick={() => setFilter(f.id)}
                            className={`px-4 py-2 text-sm font-semibold transition-colors
                                ${filter === f.id ? 'bg-brand-600 text-white shadow-inner' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
                        >
                            {f.l}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── KPIs Superiores ──────────────────────────────────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="card p-5 border-l-4 border-l-status-free bg-gradient-to-r from-status-free/10 to-transparent">
                    <p className="text-gray-400 text-sm font-semibold uppercase tracking-wider mb-1">Total Ingresos</p>
                    <p className="text-3xl font-bold text-white">S/ {stats.summary.total_revenue.toFixed(2)}</p>
                </div>
                <div className="card p-5 border-l-4 border-l-brand-600 bg-gradient-to-r from-brand-600/10 to-transparent">
                    <p className="text-gray-400 text-sm font-semibold uppercase tracking-wider mb-1">Órdenes Pagadas</p>
                    <p className="text-3xl font-bold text-white">{stats.summary.total_orders}</p>
                </div>
                <div className="card p-5 border-l-4 border-l-blue-500 bg-gradient-to-r from-blue-500/10 to-transparent">
                    <p className="text-gray-400 text-sm font-semibold uppercase tracking-wider mb-1">Ticket Promedio</p>
                    <p className="text-3xl font-bold text-white">S/ {stats.summary.avg_ticket.toFixed(2)}</p>
                </div>
            </div>

            {/* ── Cuadre de Caja / Métodos de Pago ────────────────────── */}
            <div className="card p-5 bg-gray-900/90 border border-gray-800 rounded-2xl shadow-xl space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <span className="text-2xl p-2 rounded-xl bg-brand-950 border border-brand-800">💰</span>
                        <div>
                            <h3 className="text-lg font-bold text-white">Cuadre de Caja (Desglose de Cobros)</h3>
                            <p className="text-xs text-gray-400">Canales de ingreso desglosados para la conciliación de caja.</p>
                        </div>
                    </div>
                    <span className="text-xs font-bold px-3 py-1 rounded-full bg-brand-950 text-brand-400 border border-brand-800">
                        {filter === 'today' ? 'Hoy' : filter === 'week' ? 'Esta Semana' : 'Este Mes'}
                    </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {/* Efectivo */}
                    <div className="bg-gray-800/60 p-4 rounded-xl border border-gray-700/60 flex items-center justify-between">
                        <div>
                            <p className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                                💵 Efectivo en Caja
                            </p>
                            <p className="text-2xl font-black text-white">
                                S/ {(stats.summary.payment_methods?.['Efectivo'] || 0).toFixed(2)}
                            </p>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-emerald-900/30 border border-emerald-700/50 flex items-center justify-center text-xl text-emerald-400">
                            💵
                        </div>
                    </div>

                    {/* Yape / Plin */}
                    <div className="bg-gray-800/60 p-4 rounded-xl border border-gray-700/60 flex items-center justify-between">
                        <div>
                            <p className="text-xs font-bold text-purple-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                                📲 Yape / Plin
                            </p>
                            <p className="text-2xl font-black text-white">
                                S/ {(stats.summary.payment_methods?.['Yape / Plin'] || 0).toFixed(2)}
                            </p>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-purple-900/30 border border-purple-700/50 flex items-center justify-center text-xl text-purple-400">
                            📲
                        </div>
                    </div>

                    {/* POS / Tarjetas */}
                    <div className="bg-gray-800/60 p-4 rounded-xl border border-gray-700/60 flex items-center justify-between">
                        <div>
                            <p className="text-xs font-bold text-blue-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                                💳 POS / Tarjetas
                            </p>
                            <p className="text-2xl font-black text-white">
                                S/ {(stats.summary.payment_methods?.['POS / Tarjeta'] || 0).toFixed(2)}
                            </p>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-blue-900/30 border border-blue-700/50 flex items-center justify-center text-xl text-blue-400">
                            💳
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Gráfica: Ventas por día ─────────────────────────────── */}
            <div className="card p-5">
                <h3 className="text-lg font-bold text-white mb-4">Evolución de Ingresos</h3>
                {stats.daily_sales.length === 0 ? (
                    <p className="text-gray-500 py-8 text-center border border-dashed border-gray-800 rounded-lg">No hay ventas registradas.</p>
                ) : (
                    <div className="h-48 flex items-end gap-2 border-b border-gray-800/60 pb-2 relative pt-8">
                        {(() => {
                            const maxRev = Math.max(...stats.daily_sales.map(d => d.revenue)) || 1;
                            return stats.daily_sales.map(day => (
                                <div key={day.date} className="flex-1 flex flex-col justify-end items-center group relative h-full">
                                    <div
                                        className="w-full bg-status-free/80 hover:bg-status-free rounded-t-sm transition-all duration-300 min-h-[4px]"
                                        style={{ height: `${(day.revenue / maxRev) * 100}%` }}
                                    ></div>
                                    <div className="opacity-0 group-hover:opacity-100 absolute -top-8 bg-gray-800 text-white text-xs py-1 px-2 rounded whitespace-nowrap z-10 transition-opacity">
                                        <p>{day.date.split('-').reverse().slice(0, 2).join('-')}</p>
                                        <p className="font-bold">S/ {day.revenue.toFixed(2)}</p>
                                    </div>
                                    <span className="text-[10px] text-gray-500 mt-1 truncate w-full text-center">
                                        {day.date.split('-').pop()}
                                    </span>
                                </div>
                            ))
                        })()}
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* ── Top Mozos ────────────────────────────────────────── */}
                <div className="card p-5">
                    <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">⭐ Rendimiento del Personal</h3>
                    {stats.top_waiters.length === 0 ? (
                        <p className="text-gray-500 text-sm">No hay datos.</p>
                    ) : (
                        <div className="space-y-3">
                            {stats.top_waiters.map((w, i) => (
                                <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-gray-800/40 border border-gray-700/30">
                                    <div className="flex items-center gap-3">
                                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${i === 0 ? 'bg-yellow-500 text-black' : i === 1 ? 'bg-gray-400 text-black' : i === 2 ? 'bg-amber-700 text-white' : 'bg-gray-700 text-gray-400'}`}>
                                            {i + 1}
                                        </span>
                                        <div>
                                            <p className="text-white font-medium">{w.name}</p>
                                            <p className="text-xs text-gray-400">{w.orders} pedidos</p>
                                        </div>
                                    </div>
                                    <p className="text-status-free font-bold tracking-tight">S/ {w.revenue.toFixed(2)}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* ── Top Productos ────────────────────────────────────── */}
                <div className="card p-5">
                    <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">🔥 Platos Más Vendidos</h3>
                    {stats.top_products_qty.length === 0 ? (
                        <p className="text-gray-500 text-sm">No hay datos.</p>
                    ) : (
                        <div className="space-y-3">
                            {stats.top_products_qty.map((p, i) => (
                                <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-gray-800/40 border border-gray-700/30">
                                    <div className="flex items-center gap-3">
                                        <span className="text-xl opacity-60">#{i + 1}</span>
                                        <div>
                                            <p className="text-white font-medium line-clamp-1">{p.name}</p>
                                            <p className="text-xs text-gray-400">Total ingresos: S/ {p.revenue.toFixed(2)}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-brand-500 font-bold text-lg leading-none">{p.qty}</p>
                                        <p className="text-[10px] text-gray-500 uppercase tracking-wide">Unid.</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Chatbot Tool */}
            <AdminChatbot />
        </div>
    )
}
