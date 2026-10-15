import { useState, useEffect, useContext } from 'react'
import {
    Wallet, TrendingUp, TrendingDown, DollarSign, Plus, Trash2,
    RotateCcw, ShoppingBag, Search, ChevronDown, ChevronUp, AlertTriangle, X
} from 'lucide-react'
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import { AuthContext } from '../contexts/AuthContext'
import {
    getFinancesSummary, getExpenses, createExpense, deleteExpense,
    getPaidOrders, deletePaidOrder, resetTestData
} from '../api/client'

export default function Finances() {
    const { user } = useContext(AuthContext)

    const [filter, setFilter] = useState('month')
    const [summary, setSummary] = useState(null)
    const [expenses, setExpenses] = useState([])
    const [paidOrders, setPaidOrders] = useState([])
    const [loading, setLoading] = useState(true)

    // Tab principal: 'sales' | 'expenses' | 'chart'
    const [activeTab, setActiveTab] = useState('sales')

    // Filtros internos de la tabla de ventas
    const [searchQuery, setSearchQuery] = useState('')
    const [methodFilter, setMethodFilter] = useState('ALL')
    const [expandedOrderId, setExpandedOrderId] = useState(null)

    // Modal de Nuevo Gasto
    const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false)
    const [expenseForm, setExpenseForm] = useState({ expense_type: 'VARIABLE', description: '', amount: '' })
    const [savingExpense, setSavingExpense] = useState(false)

    // Modal de Purgar / Limpiar Datos de Prueba
    const [isResetModalOpen, setIsResetModalOpen] = useState(false)
    const [includeExpensesReset, setIncludeExpensesReset] = useState(false)
    const [resetting, setResetting] = useState(false)

    const loadData = async () => {
        setLoading(true)
        try {
            const [sumRes, expRes, ordersRes] = await Promise.all([
                getFinancesSummary(filter),
                getExpenses(filter),
                getPaidOrders(filter)
            ])
            setSummary(sumRes.data)
            setExpenses(expRes.data)
            setPaidOrders(ordersRes.data)
        } catch (err) {
            console.error('Error cargando datos de finanzas:', err)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        loadData()
    }, [filter])

    // ── Crear Gasto ─────────────────────────────────────────────────────────────
    const handleCreateExpense = async (e) => {
        e.preventDefault()
        if (!expenseForm.description || !expenseForm.amount) return
        setSavingExpense(true)
        try {
            await createExpense({
                ...expenseForm,
                amount: parseFloat(expenseForm.amount),
                created_by_id: user?.id
            })
            setIsExpenseModalOpen(false)
            setExpenseForm({ expense_type: 'VARIABLE', description: '', amount: '' })
            await loadData()
        } catch (err) {
            alert('Error al guardar el gasto.')
        } finally {
            setSavingExpense(false)
        }
    }

    // ── Eliminar Gasto Individual ────────────────────────────────────────────────
    const handleDeleteExpense = async (id) => {
        if (!confirm('¿Seguro que deseas eliminar este gasto operacional?')) return
        try {
            await deleteExpense(id)
            await loadData()
        } catch (err) {
            alert('Error al borrar el gasto.')
        }
    }

    // ── Eliminar Venta Individual (Mesa / Delivery) ──────────────────────────────
    const handleDeleteOrder = async (order) => {
        const origin = order.is_delivery
            ? `Delivery - ${order.customer_name || 'Cliente'}`
            : (order.table_name || `Mesa ${order.table_number ?? ''}`)

        const confirmMsg = `¿Estás seguro de ELIMINAR permanentemente la venta de "${origin}" por S/ ${Number(order.total).toFixed(2)}?\n\n` +
            `• Esta venta se borrará del historial de ingresos.\n` +
            `• Los totales de caja y utilidades se recalcularán inmediatamente.`

        if (!confirm(confirmMsg)) return

        try {
            await deletePaidOrder(order.id)
            await loadData()
        } catch (err) {
            alert(err.response?.data?.detail || 'Error al eliminar la venta.')
        }
    }

    // ── Purgar Todos los Datos de Prueba (Reiniciar a S/ 0.00) ───────────────────
    const handleResetTestData = async () => {
        setResetting(true)
        try {
            const res = await resetTestData({ include_expenses: includeExpensesReset })
            setIsResetModalOpen(false)
            setIncludeExpensesReset(false)
            await loadData()
            alert(`✅ ${res.data.message || 'Datos de prueba eliminados exitosamente.'}\nSe eliminaron ${res.data.deleted_orders} órdenes. Las ventas están listas en S/ 0.00.`)
        } catch (err) {
            alert(err.response?.data?.detail || 'Error al reiniciar los datos de prueba.')
        } finally {
            setResetting(false)
        }
    }

    // ── Filtrado local de órdenes cobradas ──────────────────────────────────────
    const filteredOrders = paidOrders.filter(order => {
        const query = searchQuery.toLowerCase().trim()
        const matchesQuery = !query || (
            (order.table_name && order.table_name.toLowerCase().includes(query)) ||
            (order.customer_name && order.customer_name.toLowerCase().includes(query)) ||
            (order.waiter_name && order.waiter_name.toLowerCase().includes(query)) ||
            (String(order.id).includes(query)) ||
            (String(order.table_number).includes(query))
        )
        const matchesMethod = methodFilter === 'ALL'
            ? true
            : methodFilter === 'Pago Mixto'
            ? (order.payment_method?.includes('+') || order.payment_method?.includes('Mixto') || (order.payments && order.payments.length > 1))
            : (order.payment_method?.toLowerCase().includes(methodFilter.toLowerCase()))
        return matchesQuery && matchesMethod
    })

    // Preparar info para el gráfico (merge de ingresos y egresos por día)
    let chartData = []
    if (summary) {
        const daysSet = new Set([
            ...Object.keys(summary.income_by_day || {}),
            ...Object.keys(summary.expense_by_day || {})
        ])
        const sortedDays = Array.from(daysSet).sort()
        chartData = sortedDays.map(day => ({
            name: day.slice(5),
            Ingresos: summary.income_by_day[day] || 0,
            Gastos: summary.expense_by_day[day] || 0
        }))
    }

    const canManageData = ['Administrador', 'Sistemas'].includes(user?.role)

    return (
        <div className="max-w-7xl mx-auto space-y-6 animate-[fadeIn_0.3s_ease-out]">
            {/* Cabecera */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Wallet className="text-brand-500" />
                        Finanzas y Balance
                    </h1>
                    <p className="text-gray-400 text-sm mt-1">
                        Control de ventas cobradas, arqueo de caja y registro de egresos.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    {/* Filtro de rango de fechas */}
                    <select
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        className="bg-gray-800 text-white border border-gray-700 rounded-xl px-4 py-2 focus:outline-none focus:border-brand-500 text-sm"
                    >
                        <option value="today">Hoy</option>
                        <option value="week">Esta Semana</option>
                        <option value="month">Mes Actual</option>
                        <option value="all">Histórico Total</option>
                    </select>

                    {/* Botón Agregar Gasto */}
                    <button
                        onClick={() => setIsExpenseModalOpen(true)}
                        className="btn-secondary flex items-center gap-1.5 px-3.5 py-2 text-sm"
                    >
                        <Plus size={16} /> Gasto
                    </button>

                    {/* Botón Limpiar Pruebas (Solo Admin/Sistemas) */}
                    {canManageData && (
                        <button
                            onClick={() => setIsResetModalOpen(true)}
                            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-semibold text-sm bg-red-950/40 hover:bg-red-900/60 text-red-300 border border-red-800/60 transition-all active:scale-95 shadow-sm"
                            title="Reiniciar ventas ficticias de prueba a S/ 0.00"
                        >
                            <RotateCcw size={15} className="text-red-400" />
                            <span>Limpiar Pruebas</span>
                        </button>
                    )}
                </div>
            </div>

            {loading && !summary ? (
                <div className="text-gray-400 py-16 text-center">Cargando reporte financiero...</div>
            ) : (
                <>
                    {/* Tarjetas Ejecutivas KPI */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
                        <div className="bg-gray-900 border border-gray-800 p-5 sm:p-6 rounded-2xl shadow-lg relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                <TrendingUp size={64} className="text-green-500" />
                            </div>
                            <h3 className="text-gray-400 text-xs sm:text-sm font-semibold mb-1 sm:mb-2 uppercase tracking-wider">Total Ingresos</h3>
                            <p className="text-2xl sm:text-3xl font-black text-green-400">
                                S/ {(summary?.total_incomes || 0).toFixed(2)}
                            </p>
                        </div>
                        <div className="bg-gray-900 border border-gray-800 p-5 sm:p-6 rounded-2xl shadow-lg relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                <TrendingDown size={64} className="text-red-500" />
                            </div>
                            <h3 className="text-gray-400 text-xs sm:text-sm font-semibold mb-1 sm:mb-2 uppercase tracking-wider">Total Gastos</h3>
                            <p className="text-2xl sm:text-3xl font-black text-red-400">
                                S/ {(summary?.total_expenses || 0).toFixed(2)}
                            </p>
                        </div>
                        <div className={`bg-gray-900 border p-5 sm:p-6 rounded-2xl shadow-lg relative overflow-hidden group ${(summary?.net_profit || 0) >= 0 ? 'border-brand-500/40' : 'border-red-500/40'}`}>
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                <DollarSign size={64} className={(summary?.net_profit || 0) >= 0 ? 'text-brand-500' : 'text-red-500'} />
                            </div>
                            <h3 className="text-gray-400 text-xs sm:text-sm font-semibold mb-1 sm:mb-2 uppercase tracking-wider">Utilidad Neta</h3>
                            <p className={`text-2xl sm:text-3xl font-black ${(summary?.net_profit || 0) >= 0 ? 'text-brand-400' : 'text-red-400'}`}>
                                S/ {(summary?.net_profit || 0).toFixed(2)}
                            </p>
                        </div>
                    </div>

                    {/* Cuadre de Caja / Desglose por Canal de Pago */}
                    <div className="bg-gray-900 border border-gray-800 p-5 rounded-2xl shadow-lg space-y-4">
                        <div className="flex items-center gap-2">
                            <span className="text-xl p-2 rounded-xl bg-brand-950 border border-brand-800">💰</span>
                            <div>
                                <h3 className="text-base font-bold text-white">Cuadre de Caja (Desglose de Cobros)</h3>
                                <p className="text-xs text-gray-400">Total cobrado desglosado por canal de pago en el periodo.</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            {/* Efectivo */}
                            <div className="bg-gray-800/60 p-4 rounded-xl border border-gray-700/60 flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                                        💵 Efectivo en Caja
                                    </p>
                                    <p className="text-2xl font-black text-white">
                                        S/ {(summary?.payment_methods?.['Efectivo'] || 0).toFixed(2)}
                                    </p>
                                </div>
                                <div className="w-10 h-10 rounded-full bg-emerald-900/30 border border-emerald-700/50 flex items-center justify-center text-xl">
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
                                        S/ {(summary?.payment_methods?.['Yape / Plin'] || 0).toFixed(2)}
                                    </p>
                                </div>
                                <div className="w-10 h-10 rounded-full bg-purple-900/30 border border-purple-700/50 flex items-center justify-center text-xl">
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
                                        S/ {(summary?.payment_methods?.['POS / Tarjeta'] || 0).toFixed(2)}
                                    </p>
                                </div>
                                <div className="w-10 h-10 rounded-full bg-blue-900/30 border border-blue-700/50 flex items-center justify-center text-xl">
                                    💳
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ── Tabs de Navegación ──────────────────────────────────── */}
                    <div className="space-y-4">
                        <div className="flex flex-wrap items-center gap-2 border-b border-gray-800 pb-3">
                            <button
                                onClick={() => setActiveTab('sales')}
                                className={`px-4 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2 ${
                                    activeTab === 'sales'
                                        ? 'bg-brand-600 text-white shadow-md'
                                        : 'bg-gray-900 text-gray-400 hover:text-white hover:bg-gray-800 border border-gray-800'
                                }`}
                            >
                                <ShoppingBag size={17} />
                                <span>Ventas y Cobros ({paidOrders.length})</span>
                            </button>

                            <button
                                onClick={() => setActiveTab('expenses')}
                                className={`px-4 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2 ${
                                    activeTab === 'expenses'
                                        ? 'bg-brand-600 text-white shadow-md'
                                        : 'bg-gray-900 text-gray-400 hover:text-white hover:bg-gray-800 border border-gray-800'
                                }`}
                            >
                                <TrendingDown size={17} />
                                <span>Historial de Egresos ({expenses.length})</span>
                            </button>

                            <button
                                onClick={() => setActiveTab('chart')}
                                className={`px-4 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2 ${
                                    activeTab === 'chart'
                                        ? 'bg-brand-600 text-white shadow-md'
                                        : 'bg-gray-900 text-gray-400 hover:text-white hover:bg-gray-800 border border-gray-800'
                                }`}
                            >
                                <TrendingUp size={17} />
                                <span>Gráfico Comparativo</span>
                            </button>
                        </div>

                        {/* ── TAB 1: HISTORIAL DE VENTAS Y COBROS ──────────────────── */}
                        {activeTab === 'sales' && (
                            <div className="bg-gray-900 border border-gray-800 rounded-2xl shadow-xl p-5 space-y-4">
                                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                                    <div className="relative flex-1 max-w-md">
                                        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                                        <input
                                            type="text"
                                            placeholder="Buscar por mesa, cliente, mozo o #ID..."
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            className="w-full bg-gray-800/80 border border-gray-700/80 rounded-xl pl-9 pr-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-brand-500"
                                        />
                                    </div>

                                    {/* Filtro por método de pago */}
                                    <div className="flex items-center gap-1.5 flex-wrap text-xs">
                                        {['ALL', 'Efectivo', 'Yape / Plin', 'POS / Tarjeta', 'Pago Mixto'].map((method) => (
                                            <button
                                                key={method}
                                                onClick={() => setMethodFilter(method)}
                                                className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                                                    methodFilter === method
                                                        ? 'bg-brand-600 text-white'
                                                        : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
                                                }`}
                                            >
                                                {method === 'ALL' ? 'Todos los métodos' : method}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {filteredOrders.length === 0 ? (
                                    <div className="py-16 text-center text-gray-500 space-y-2">
                                        <p className="text-4xl">🧾</p>
                                        <p className="text-base font-semibold text-gray-400">No hay ventas registradas en este periodo.</p>
                                        <p className="text-xs">Los cobros aparecerán aquí una vez pagada la cuenta de cada mesa o delivery.</p>
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left text-sm">
                                            <thead>
                                                <tr className="border-b border-gray-800 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                                                    <th className="py-3 px-3">#ID</th>
                                                    <th className="py-3 px-3">Mesa / Origen</th>
                                                    <th className="py-3 px-3">Fecha y Hora</th>
                                                    <th className="py-3 px-3">Atendido por</th>
                                                    <th className="py-3 px-3">Método</th>
                                                    <th className="py-3 px-3">Consumo</th>
                                                    <th className="py-3 px-3 text-right">Total Cobrado</th>
                                                    <th className="py-3 px-3 text-center">Acción</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-800/60">
                                                {filteredOrders.map((order) => {
                                                    const isExpanded = expandedOrderId === order.id
                                                    const dateStr = order.paid_at
                                                        ? new Date(order.paid_at).toLocaleString('es-PE', {
                                                            day: '2-digit', month: '2-digit',
                                                            hour: '2-digit', minute: '2-digit', hour12: true
                                                        })
                                                        : '--'

                                                    return (
                                                        <tr key={order.id} className="hover:bg-gray-800/30 transition-colors group">
                                                            <td className="py-3.5 px-3 font-mono text-xs text-gray-400">
                                                                #{order.id}
                                                            </td>
                                                            <td className="py-3.5 px-3">
                                                                {order.is_delivery ? (
                                                                    <div className="flex items-center gap-1.5">
                                                                        <span className="text-xs px-2 py-0.5 rounded-md font-bold bg-orange-600/20 text-orange-400 border border-orange-500/30 flex items-center gap-1">
                                                                            🛵 Delivery
                                                                        </span>
                                                                        <span className="font-semibold text-white">
                                                                            {order.customer_name || 'Cliente'}
                                                                        </span>
                                                                    </div>
                                                                ) : (
                                                                    <div className="flex items-center gap-1.5">
                                                                        <span className="text-xs px-2 py-0.5 rounded-md font-bold bg-blue-600/20 text-blue-400 border border-blue-500/30">
                                                                            {order.table_name || `Mesa ${order.table_number}`}
                                                                        </span>
                                                                    </div>
                                                                )}
                                                            </td>
                                                            <td className="py-3.5 px-3 text-gray-300 whitespace-nowrap">
                                                                {dateStr}
                                                            </td>
                                                            <td className="py-3.5 px-3 text-gray-300">
                                                                {order.waiter_name || '—'}
                                                            </td>
                                                            <td className="py-3.5 px-3">
                                                                <span className={`text-xs px-2.5 py-1 rounded-full font-bold inline-flex items-center gap-1 border ${
                                                                    order.payment_method === 'Efectivo'
                                                                        ? 'bg-emerald-950/40 border-emerald-700/50 text-emerald-400'
                                                                        : order.payment_method === 'Yape / Plin'
                                                                        ? 'bg-purple-950/40 border-purple-700/50 text-purple-400'
                                                                        : order.payment_method === 'POS / Tarjeta'
                                                                        ? 'bg-blue-950/40 border-blue-700/50 text-blue-400'
                                                                        : 'bg-amber-950/40 border-amber-700/50 text-amber-300'
                                                                }`}>
                                                                    {order.payment_method === 'Efectivo' && '💵'}
                                                                    {order.payment_method === 'Yape / Plin' && '📲'}
                                                                    {order.payment_method === 'POS / Tarjeta' && '💳'}
                                                                    {(order.payment_method?.includes('+') || order.payment_method?.includes('Mixto')) && '🔄'}
                                                                    <span>{order.payment_method}</span>
                                                                </span>
                                                                {order.payments && order.payments.length > 1 && (
                                                                    <div className="flex flex-wrap gap-1 mt-1.5">
                                                                        {order.payments.map((p, idx) => (
                                                                            <span key={idx} className="text-[10px] bg-gray-800 text-gray-300 px-1.5 py-0.5 rounded border border-gray-700 font-mono">
                                                                                {p.method}: S/ {Number(p.amount).toFixed(2)}
                                                                            </span>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </td>
                                                            <td className="py-3.5 px-3">
                                                                <button
                                                                    onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}
                                                                    className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1 font-semibold"
                                                                >
                                                                    <span>{order.items_count} {order.items_count === 1 ? 'ítem' : 'ítems'}</span>
                                                                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                                                </button>

                                                                {/* Desglose desplegable de platos */}
                                                                {isExpanded && (
                                                                    <div className="mt-2 p-2.5 bg-gray-950/90 border border-gray-800 rounded-xl space-y-1 text-xs">
                                                                        {order.items_summary.map((it, idx) => (
                                                                            <div key={idx} className="flex justify-between items-center text-gray-300">
                                                                                <span>{it.quantity}x {it.name}</span>
                                                                                <span className="font-mono text-gray-400">S/ {it.subtotal.toFixed(2)}</span>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </td>
                                                            <td className="py-3.5 px-3 text-right font-black text-green-400 text-base">
                                                                S/ {Number(order.total).toFixed(2)}
                                                            </td>
                                                            <td className="py-3.5 px-3 text-center">
                                                                {canManageData && (
                                                                    <button
                                                                        onClick={() => handleDeleteOrder(order)}
                                                                        className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-950/30 transition-all opacity-80 group-hover:opacity-100"
                                                                        title="Eliminar este cobro"
                                                                    >
                                                                        <Trash2 size={16} />
                                                                    </button>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    )
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ── TAB 2: HISTORIAL DE EGRESOS ────────────────────────── */}
                        {activeTab === 'expenses' && (
                            <div className="bg-gray-900 border border-gray-800 rounded-2xl shadow-xl p-5 space-y-4">
                                <div className="flex items-center justify-between">
                                    <h3 className="font-bold text-white text-base">Gastos y Compras Operacionales</h3>
                                    <button
                                        onClick={() => setIsExpenseModalOpen(true)}
                                        className="btn-primary text-xs flex items-center gap-1.5 px-3 py-1.5"
                                    >
                                        <Plus size={14} /> Registrar Gasto
                                    </button>
                                </div>

                                {expenses.length === 0 ? (
                                    <div className="py-16 text-center text-gray-500 space-y-2">
                                        <p className="text-4xl">📉</p>
                                        <p className="text-base font-semibold text-gray-400">Sin gastos registrados en este periodo.</p>
                                        <p className="text-xs">Usa el botón "Registrar Gasto" para asentar compras de insumos, servicios o alquiler.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2.5">
                                        {expenses.map(e => (
                                            <div key={e.id} className="bg-gray-800/40 hover:bg-gray-800/70 p-3.5 rounded-xl border border-gray-700/60 flex justify-between items-center group transition-colors">
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                                                            e.expense_type === 'FIJO'
                                                                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                                                : 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                                                        }`}>
                                                            {e.expense_type}
                                                        </span>
                                                        <span className="text-gray-200 font-semibold text-sm">{e.description}</span>
                                                    </div>
                                                    <div className="text-xs text-gray-500 mt-1">
                                                        📅 {new Date(e.expense_date).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <span className="text-red-400 font-black text-base">S/ {e.amount.toFixed(2)}</span>
                                                    {canManageData && (
                                                        <button
                                                            onClick={() => handleDeleteExpense(e.id)}
                                                            className="text-gray-600 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-950/30 transition-all opacity-80 group-hover:opacity-100"
                                                            title="Eliminar gasto"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ── TAB 3: GRÁFICO COMPARATIVO ──────────────────────────── */}
                        {activeTab === 'chart' && (
                            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-xl space-y-4">
                                <h2 className="text-white font-bold text-base">Comparativa Diaria de Ingresos vs Egresos</h2>
                                <div className="h-96 w-full">
                                    {chartData.length > 0 ? (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                                <XAxis dataKey="name" stroke="#9CA3AF" />
                                                <YAxis stroke="#9CA3AF" />
                                                <Tooltip
                                                    contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', color: '#fff', borderRadius: '12px' }}
                                                    itemStyle={{ fontWeight: 'bold' }}
                                                />
                                                <Legend />
                                                <Bar dataKey="Ingresos" fill="#4ade80" radius={[6, 6, 0, 0]} />
                                                <Bar dataKey="Gastos" fill="#f87171" radius={[6, 6, 0, 0]} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div className="h-full flex items-center justify-center text-gray-500">
                                            No hay movimientos registrados en este periodo para graficar.
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* Modal de Nuevo Gasto */}
            {isExpenseModalOpen && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-sm shadow-2xl animate-[slideUp_0.2s_ease-out]">
                        <div className="p-5 border-b border-gray-800 flex justify-between items-center">
                            <h3 className="text-lg font-bold text-white">Registrar Gasto</h3>
                            <button onClick={() => setIsExpenseModalOpen(false)} className="text-gray-400 hover:text-white">
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleCreateExpense} className="p-5 space-y-4">
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Tipo de Gasto</label>
                                <select
                                    value={expenseForm.expense_type}
                                    onChange={e => setExpenseForm({ ...expenseForm, expense_type: e.target.value })}
                                    className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-brand-500 appearance-none"
                                >
                                    <option value="VARIABLE">Variable (Insumos, compras diarias)</option>
                                    <option value="FIJO">Fijo (Alquiler, Luz, Agua, Personal)</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Descripción</label>
                                <input
                                    type="text" required
                                    placeholder="Ej. Compra de verduras y pollo..."
                                    value={expenseForm.description}
                                    onChange={e => setExpenseForm({ ...expenseForm, description: e.target.value })}
                                    className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-brand-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Monto (S/)</label>
                                <input
                                    type="number" required min="0.01" step="0.01"
                                    placeholder="0.00"
                                    value={expenseForm.amount}
                                    onChange={e => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                                    className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-brand-500 font-black text-xl text-green-400"
                                />
                            </div>
                            <div className="pt-2">
                                <button type="submit" disabled={savingExpense} className="w-full btn-primary py-3 flex justify-center font-bold">
                                    {savingExpense ? 'Guardando...' : 'Confirmar Gasto'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal de Confirmación: Limpiar / Purgar Datos de Prueba */}
            {isResetModalOpen && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-gray-900 border border-red-700/50 rounded-2xl w-full max-w-md shadow-2xl animate-[slideUp_0.2s_ease-out] p-6 space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-2xl bg-red-950/60 border border-red-700/60 flex items-center justify-center text-2xl text-red-400">
                                <AlertTriangle size={24} />
                            </div>
                            <div>
                                <h3 className="text-lg font-black text-white">¿Limpiar Datos de Prueba?</h3>
                                <p className="text-xs text-red-300">Reiniciar historial de ventas a S/ 0.00</p>
                            </div>
                        </div>

                        <div className="bg-gray-950/70 p-4 rounded-xl border border-gray-800 space-y-2 text-xs text-gray-300">
                            <p className="font-semibold text-white">Esta acción realizará lo siguiente:</p>
                            <ul className="list-disc list-inside space-y-1 text-gray-400">
                                <li>Eliminará todas las órdenes de comanda y tickets de cocina de prueba.</li>
                                <li>Dejará el contador de ventas cobradas y arqueo de caja en <strong className="text-green-400">S/ 0.00</strong>.</li>
                                <li>Liberará todas las mesas físicas dejándolas en estado <strong className="text-emerald-400">LIBRE</strong>.</li>
                            </ul>
                            <div className="pt-2 border-t border-gray-800 text-[11px] text-emerald-400 font-semibold">
                                🛡️ Tu Carta, Productos, Precios, Categorías, Usuarios y Ajustes se mantienen 100% protegidos.
                            </div>
                        </div>

                        <label className="flex items-center gap-2.5 p-3 rounded-xl bg-gray-800/40 border border-gray-700/50 cursor-pointer text-xs text-gray-300">
                            <input
                                type="checkbox"
                                checked={includeExpensesReset}
                                onChange={(e) => setIncludeExpensesReset(e.target.checked)}
                                className="rounded text-brand-600 focus:ring-0 bg-gray-900 border-gray-700"
                            />
                            <span>Eliminar también los gastos registrados de prueba</span>
                        </label>

                        <div className="flex items-center justify-end gap-3 pt-2">
                            <button
                                type="button"
                                disabled={resetting}
                                onClick={() => setIsResetModalOpen(false)}
                                className="btn-secondary px-4 py-2 text-sm"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                disabled={resetting}
                                onClick={handleResetTestData}
                                className="px-4 py-2 text-sm font-bold rounded-xl bg-red-600 hover:bg-red-500 text-white transition-all shadow-md active:scale-95 disabled:opacity-50"
                            >
                                {resetting ? 'Limpiando...' : 'Sí, reiniciar a S/ 0.00'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
