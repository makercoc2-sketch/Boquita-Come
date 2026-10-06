import { useState, useEffect, useContext } from 'react'
import { Wallet, TrendingUp, TrendingDown, DollarSign, Plus, Trash2 } from 'lucide-react'
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer
} from 'recharts'
import { AuthContext } from '../contexts/AuthContext'
import { getFinancesSummary, getExpenses, createExpense, deleteExpense } from '../api/client'

export default function Finances() {
    const { user } = useContext(AuthContext)

    const [filter, setFilter] = useState('month')
    const [summary, setSummary] = useState(null)
    const [expenses, setExpenses] = useState([])
    const [loading, setLoading] = useState(true)

    // Form stuff
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [formData, setFormData] = useState({ expense_type: 'VARIABLE', description: '', amount: '' })
    const [saving, setSaving] = useState(false)

    const loadData = async () => {
        setLoading(true)
        try {
            const [sumRes, expRes] = await Promise.all([
                getFinancesSummary(filter),
                getExpenses(filter)
            ])
            setSummary(sumRes.data)
            setExpenses(expRes.data)
        } catch (err) {
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        loadData()
    }, [filter])

    const handleCreateExpense = async (e) => {
        e.preventDefault()
        if (!formData.description || !formData.amount) return
        setSaving(true)
        try {
            await createExpense({
                ...formData,
                amount: parseFloat(formData.amount),
                created_by_id: user.id
            })
            setIsModalOpen(false)
            setFormData({ expense_type: 'VARIABLE', description: '', amount: '' })
            loadData()
        } catch (err) {
            alert('Error al guardar gasto')
        } finally {
            setSaving(false)
        }
    }

    const handleDeleteExpense = async (id) => {
        if (!confirm('¿Seguro que deseas eliminar este gasto?')) return
        try {
            await deleteExpense(id)
            loadData()
        } catch (err) {
            alert('Error al borrar gasto')
        }
    }

    // Preparar info para el gráfico (merge de ingresos y egresos por día)
    let chartData = []
    if (summary) {
        const daysSet = new Set([
            ...Object.keys(summary.income_by_day || {}),
            ...Object.keys(summary.expense_by_day || {})
        ])

        // Convert to array and sort
        const sortedDays = Array.from(daysSet).sort()
        chartData = sortedDays.map(day => ({
            name: day.slice(5), // shows MM-DD
            Ingresos: summary.income_by_day[day] || 0,
            Gastos: summary.expense_by_day[day] || 0
        }))
    }

    return (
        <div className="max-w-7xl mx-auto space-y-6 animate-[fadeIn_0.3s_ease-out]">
            {/* Cabecera */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Wallet className="text-brand-500" />
                        Finanzas y Balance
                    </h1>
                    <p className="text-gray-400 text-sm mt-1">Ingresos de ventas y registro de gastos operacionales.</p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <select
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        className="bg-gray-800 text-white border border-gray-700 rounded-xl px-4 py-2 focus:outline-none focus:border-brand-500"
                    >
                        <option value="today">Hoy</option>
                        <option value="week">Esta Semana</option>
                        <option value="month">Mes Actual</option>
                        <option value="all">Historico Total</option>
                    </select>

                    <button
                        onClick={() => setIsModalOpen(true)}
                        className="btn-primary flex items-center gap-2 px-4 py-2 text-sm"
                    >
                        <Plus size={16} /> Agregar Gasto
                    </button>
                </div>
            </div>

            {loading && !summary ? (
                <div className="text-gray-400 py-10 text-center">Cargando reporte...</div>
            ) : (
                <>
                    {/* Tarjetas Ejecutivas */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="bg-gray-900 border border-gray-800 p-6 rounded-2xl shadow-lg relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                <TrendingUp size={64} className="text-green-500" />
                            </div>
                            <h3 className="text-gray-400 text-sm font-semibold mb-2">Total Ingresos</h3>
                            <p className="text-3xl font-black text-green-400">
                                S/ {summary.total_incomes.toFixed(2)}
                            </p>
                        </div>
                        <div className="bg-gray-900 border border-gray-800 p-6 rounded-2xl shadow-lg relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                <TrendingDown size={64} className="text-red-500" />
                            </div>
                            <h3 className="text-gray-400 text-sm font-semibold mb-2">Total Gastos</h3>
                            <p className="text-3xl font-black text-red-400">
                                S/ {summary.total_expenses.toFixed(2)}
                            </p>
                        </div>
                        <div className={`bg-gray-900 border p-6 rounded-2xl shadow-lg relative overflow-hidden group ${summary.net_profit >= 0 ? 'border-brand-500/50' : 'border-red-500/50'}`}>
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                <DollarSign size={64} className={summary.net_profit >= 0 ? 'text-brand-500' : 'text-red-500'} />
                            </div>
                            <h3 className="text-gray-400 text-sm font-semibold mb-2">Utilidad Neta</h3>
                            <p className={`text-3xl font-black ${summary.net_profit >= 0 ? 'text-brand-400' : 'text-red-400'}`}>
                                S/ {summary.net_profit.toFixed(2)}
                            </p>
                        </div>
                    </div>

                    {/* ── Cuadre de Caja / Métodos de Pago ────────────────────── */}
                    <div className="bg-gray-900 border border-gray-800 p-5 rounded-2xl shadow-lg space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="text-xl p-2 rounded-xl bg-brand-950 border border-brand-800">💰</span>
                                <div>
                                    <h3 className="text-base font-bold text-white">Cuadre de Caja (Desglose de Cobros)</h3>
                                    <p className="text-xs text-gray-400">Total cobrado desglosado por canal de pago.</p>
                                </div>
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
                                        S/ {(summary.payment_methods?.['Efectivo'] || 0).toFixed(2)}
                                    </p>
                                </div>
                                <div className="w-9 h-9 rounded-full bg-emerald-900/30 border border-emerald-700/50 flex items-center justify-center text-lg text-emerald-400">
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
                                        S/ {(summary.payment_methods?.['Yape / Plin'] || 0).toFixed(2)}
                                    </p>
                                </div>
                                <div className="w-9 h-9 rounded-full bg-purple-900/30 border border-purple-700/50 flex items-center justify-center text-lg text-purple-400">
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
                                        S/ {(summary.payment_methods?.['POS / Tarjeta'] || 0).toFixed(2)}
                                    </p>
                                </div>
                                <div className="w-9 h-9 rounded-full bg-blue-900/30 border border-blue-700/50 flex items-center justify-center text-lg text-blue-400">
                                    💳
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Chart */}
                        <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-xl">
                            <h2 className="text-white font-bold mb-6">Comparativa Ingresos vs Gastos</h2>
                            <div className="h-80 w-full">
                                {chartData.length > 0 ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                            <XAxis dataKey="name" stroke="#9CA3AF" />
                                            <YAxis stroke="#9CA3AF" />
                                            <Tooltip
                                                contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', color: '#fff', borderRadius: '8px' }}
                                                itemStyle={{ fontWeight: 'bold' }}
                                            />
                                            <Legend />
                                            <Bar dataKey="Ingresos" fill="#4ade80" radius={[4, 4, 0, 0]} />
                                            <Bar dataKey="Gastos" fill="#f87171" radius={[4, 4, 0, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="h-full flex items-center justify-center text-gray-500">
                                        No hay datos en este periodo
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Lista de gastos */}
                        <div className="bg-gray-900 border border-gray-800 rounded-2xl shadow-xl flex flex-col h-[400px]">
                            <div className="p-4 border-b border-gray-800 font-bold text-white flex justify-between items-center">
                                Historial de Egresos
                            </div>
                            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                                {expenses.length === 0 ? (
                                    <p className="text-gray-500 text-sm text-center py-4">Sin gastos registrados.</p>
                                ) : (
                                    expenses.map(e => (
                                        <div key={e.id} className="bg-gray-800/50 p-3 rounded-xl border border-gray-700 flex justify-between items-center group">
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${e.expense_type === 'FIJO' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'}`}>
                                                        {e.expense_type}
                                                    </span>
                                                    <span className="text-gray-200 font-medium text-sm">{e.description}</span>
                                                </div>
                                                <div className="text-xs text-gray-500 mt-1">
                                                    {new Date(e.expense_date).toLocaleDateString()}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <span className="text-red-400 font-bold">S/ {e.amount.toFixed(2)}</span>
                                                <button
                                                    onClick={() => handleDeleteExpense(e.id)}
                                                    className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* Modal de Nuevo Gasto */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-sm shadow-2xl animate-[slideUp_0.2s_ease-out]">
                        <div className="p-5 border-b border-gray-800 flex justify-between items-center">
                            <h3 className="text-lg font-bold text-white">Registrar Gasto</h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-white">×</button>
                        </div>
                        <form onSubmit={handleCreateExpense} className="p-5 space-y-4">
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Tipo de Gasto</label>
                                <select
                                    value={formData.expense_type}
                                    onChange={e => setFormData({ ...formData, expense_type: e.target.value })}
                                    className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-brand-500 appearance-none"
                                >
                                    <option value="VARIABLE">Variable (Insumos, etc)</option>
                                    <option value="FIJO">Fijo (Luz, Alquiler, etc)</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Descripción</label>
                                <input
                                    type="text" required
                                    placeholder="Ej. Compra de papas..."
                                    value={formData.description}
                                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                                    className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-brand-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Monto (S/)</label>
                                <input
                                    type="number" required min="0.01" step="0.01"
                                    placeholder="0.00"
                                    value={formData.amount}
                                    onChange={e => setFormData({ ...formData, amount: e.target.value })}
                                    className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-brand-500 font-bold text-xl"
                                />
                            </div>
                            <div className="pt-2">
                                <button type="submit" disabled={saving} className="w-full btn-primary py-3 flex justify-center py-3">
                                    {saving ? 'Guardando...' : 'Confirmar Gasto'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
