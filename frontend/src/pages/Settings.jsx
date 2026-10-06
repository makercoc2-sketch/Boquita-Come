import { useState, useEffect, useContext } from 'react'
import { getSettings, updateSettings, testPrintSettings, exportDatabaseBackup, importDatabaseBackup, printerStatus } from '../api/client'
import { AuthContext } from '../contexts/AuthContext'

export default function Settings() {
    const { user } = useContext(AuthContext)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [testingPrint, setTestingPrint] = useState(false)
    const [statusMessage, setStatusMessage] = useState(null)
    const [errorMessage, setErrorMessage] = useState(null)
    const [detectedPrinter, setDetectedPrinter] = useState(null)

    const [form, setForm] = useState({
        business_name: '',
        business_ruc: '',
        business_address: '',
        business_phone: '',
        igv_percentage: 10.5,
        receipt_footer: '¡Gracias por su visita!',
        printer_name: '',
    })

    useEffect(() => {
        loadData()
    }, [])

    const loadData = async () => {
        setLoading(true)
        setErrorMessage(null)
        try {
            const [settRes, printRes] = await Promise.allSettled([
                getSettings(),
                printerStatus()
            ])

            if (settRes.status === 'fulfilled') {
                const data = settRes.value.data
                setForm({
                    business_name: data.business_name || '',
                    business_ruc: data.business_ruc || '',
                    business_address: data.business_address || '',
                    business_phone: data.business_phone || '',
                    igv_percentage: data.igv_percentage ?? 10.5,
                    receipt_footer: data.receipt_footer || '¡Gracias por su visita!',
                    printer_name: data.printer_name || '',
                })
            }

            if (printRes.status === 'fulfilled') {
                setDetectedPrinter(printRes.value.data.windows_printer_detected || null)
            }
        } catch (err) {
            setErrorMessage('Error al cargar la configuración del sistema.')
        } finally {
            setLoading(false)
        }
    }

    const handleChange = (e) => {
        const { name, value } = e.target
        setForm(prev => ({
            ...prev,
            [name]: name === 'igv_percentage' ? parseFloat(value) || 0 : value
        }))
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setSaving(true)
        setStatusMessage(null)
        setErrorMessage(null)

        try {
            await updateSettings(form)
            setStatusMessage('✅ Configuración guardada correctamente. Los próximos tickets saldrán con estos datos.')
            setTimeout(() => setStatusMessage(null), 5000)
        } catch (err) {
            setErrorMessage(err.response?.data?.detail ?? 'Error al guardar la configuración.')
        } finally {
            setSaving(false)
        }
    }

    const handleTestPrint = async () => {
        setTestingPrint(true)
        setStatusMessage(null)
        setErrorMessage(null)
        try {
            await testPrintSettings()
            setStatusMessage('🖨️ Ticket de prueba enviado a la impresora.')
            setTimeout(() => setStatusMessage(null), 4000)
        } catch (err) {
            setErrorMessage(err.response?.data?.detail ?? 'No se pudo imprimir el ticket de prueba.')
        } finally {
            setTestingPrint(false)
        }
    }

    const handleBackupExport = async () => {
        try {
            const res = await exportDatabaseBackup(user?.role || 'Administrador', 'db')
            const url = window.URL.createObjectURL(new Blob([res.data]))
            const link = document.createElement('a')
            link.href = url
            link.setAttribute('download', `boquita_come_backup_${new Date().toISOString().slice(0, 10)}.db`)
            document.body.appendChild(link)
            link.click()
            link.remove()
        } catch (err) {
            alert('Error al descargar la copia de seguridad.')
        }
    }

    const handleBackupImport = async (e) => {
        const file = e.target.files?.[0]
        if (!file) return

        if (!confirm('⚠️ ¿Estás seguro de restaurar esta base de datos? Se reemplazarán los datos actuales.')) {
            e.target.value = ''
            return
        }

        const formData = new FormData()
        formData.append('file', file)

        try {
            await importDatabaseBackup(formData, user?.role || 'Administrador')
            alert('✅ Base de datos restaurada con éxito. La página se recargará.')
            window.location.reload()
        } catch (err) {
            alert(err.response?.data?.detail ?? 'Error al restaurar la base de datos.')
        } finally {
            e.target.value = ''
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64 text-gray-400">
                <span className="text-lg">Cargando configuración…</span>
            </div>
        )
    }

    return (
        <div className="max-w-6xl mx-auto space-y-6 pb-12">
            {/* Encabezado */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-black text-white flex items-center gap-2">
                        <span>⚙️</span> Configuración del Restaurante y Recibos
                    </h1>
                    <p className="text-gray-400 text-sm mt-1">
                        Personaliza los datos impresos en los comprobantes, tasas de impuesto y hardware.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={handleTestPrint}
                        disabled={testingPrint}
                        className="btn-secondary px-4 py-2.5 rounded-xl font-bold flex items-center gap-2 text-sm shadow active:scale-95"
                        title="Imprime un ticket de muestra con los datos actuales"
                    >
                        <span>🖨️</span>
                        <span>{testingPrint ? 'Imprimiendo…' : 'Probar Impresora'}</span>
                    </button>
                </div>
            </div>

            {/* Mensajes de estado */}
            {statusMessage && (
                <div className="bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 px-4 py-3 rounded-2xl font-medium animate-fadeIn">
                    {statusMessage}
                </div>
            )}
            {errorMessage && (
                <div className="bg-red-950/80 border border-red-500/50 text-red-300 px-4 py-3 rounded-2xl font-medium animate-fadeIn">
                    {errorMessage}
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                {/* ── Formulario Principal (2 columnas) ────────────────────────── */}
                <form onSubmit={handleSubmit} className="lg:col-span-2 space-y-6">
                    {/* Tarjeta 1: Datos del Negocio */}
                    <div className="card p-5 sm:p-6 space-y-4">
                        <h2 className="text-lg font-bold text-white flex items-center gap-2 border-b border-gray-800 pb-3">
                            <span>🏢</span> Identificación del Negocio
                        </h2>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="sm:col-span-2 space-y-1.5">
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider">
                                    Nombre Comercial / Razón Social *
                                </label>
                                <input
                                    type="text"
                                    name="business_name"
                                    value={form.business_name}
                                    onChange={handleChange}
                                    required
                                    placeholder="Ej. Boquita Come"
                                    className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3.5 py-2.5 text-white font-medium focus:border-brand-500 focus:outline-none transition-colors"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider">
                                    RUC del Negocio *
                                </label>
                                <input
                                    type="text"
                                    name="business_ruc"
                                    value={form.business_ruc}
                                    onChange={handleChange}
                                    required
                                    maxLength={20}
                                    placeholder="Ej. 20123456789"
                                    className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3.5 py-2.5 text-white font-medium focus:border-brand-500 focus:outline-none transition-colors"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider">
                                    Teléfono / WhatsApp
                                </label>
                                <input
                                    type="text"
                                    name="business_phone"
                                    value={form.business_phone}
                                    onChange={handleChange}
                                    placeholder="Ej. 987 654 321"
                                    className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3.5 py-2.5 text-white font-medium focus:border-brand-500 focus:outline-none transition-colors"
                                />
                            </div>

                            <div className="sm:col-span-2 space-y-1.5">
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider">
                                    Dirección Fiscal o del Local *
                                </label>
                                <input
                                    type="text"
                                    name="business_address"
                                    value={form.business_address}
                                    onChange={handleChange}
                                    required
                                    placeholder="Ej. Av. Principal 123, Miraflores, Lima"
                                    className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3.5 py-2.5 text-white font-medium focus:border-brand-500 focus:outline-none transition-colors"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Tarjeta 2: Impuestos y Pie de Ticket */}
                    <div className="card p-5 sm:p-6 space-y-4">
                        <h2 className="text-lg font-bold text-white flex items-center gap-2 border-b border-gray-800 pb-3">
                            <span>🧾</span> Parámetros del Recibo & Fiscales
                        </h2>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider">
                                    Porcentaje de IGV (%)
                                </label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        step="0.1"
                                        min="0"
                                        max="100"
                                        name="igv_percentage"
                                        value={form.igv_percentage}
                                        onChange={handleChange}
                                        required
                                        className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3.5 py-2.5 text-white font-medium focus:border-brand-500 focus:outline-none transition-colors"
                                    />
                                    <span className="absolute right-3.5 top-2.5 text-gray-500 font-bold">%</span>
                                </div>
                                <p className="text-[11px] text-gray-500">
                                    Ley Restaurantes Perú 2026: <strong>10.5%</strong> (o 18% estándar).
                                </p>
                            </div>

                            <div className="space-y-1.5">
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider">
                                    Nombre Impresora (Opcional)
                                </label>
                                <input
                                    type="text"
                                    name="printer_name"
                                    value={form.printer_name}
                                    onChange={handleChange}
                                    placeholder="Dejar vacío para autodetección"
                                    className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3.5 py-2.5 text-white font-medium focus:border-brand-500 focus:outline-none transition-colors"
                                />
                                <p className="text-[11px] text-gray-500">
                                    {detectedPrinter ? (
                                        <span className="text-emerald-400 font-semibold">
                                            ✓ Detectada en Windows: {detectedPrinter}
                                        </span>
                                    ) : (
                                        <span>Autodetecta Epson / TM-T20II</span>
                                    )}
                                </p>
                            </div>

                            <div className="sm:col-span-2 space-y-1.5">
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider">
                                    Mensaje de Despedida / Pie de Ticket
                                </label>
                                <input
                                    type="text"
                                    name="receipt_footer"
                                    value={form.receipt_footer}
                                    onChange={handleChange}
                                    maxLength={150}
                                    placeholder="Ej. ¡Gracias por su visita! Vuelva pronto."
                                    className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3.5 py-2.5 text-white font-medium focus:border-brand-500 focus:outline-none transition-colors"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Botón de Guardar */}
                    <div className="flex justify-end pt-2">
                        <button
                            type="submit"
                            disabled={saving}
                            className="btn-primary w-full sm:w-auto min-w-[200px] py-3.5 px-6 rounded-xl text-base font-bold shadow-lg shadow-brand-600/30 active:scale-95"
                        >
                            {saving ? 'Guardando cambios…' : '💾 Guardar Configuración'}
                        </button>
                    </div>
                </form>

                {/* ── Columna Lateral: Vista Previa y Respaldo (1 columna) ────────── */}
                <div className="space-y-6">
                    {/* Tarjeta: Vista Previa del Ticket Térmico */}
                    <div className="card p-5 space-y-3 bg-gray-950/60 border-dashed border-gray-700">
                        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center justify-between">
                            <span>Simulación de Ticket</span>
                            <span className="text-[10px] text-brand-400 bg-brand-950/80 px-2 py-0.5 rounded-full border border-brand-500/30">
                                Vista Previa
                            </span>
                        </h3>

                        {/* Ticket Paper Simulation */}
                        <div className="bg-white text-gray-900 font-mono text-xs p-4 rounded-lg shadow-inner space-y-2 leading-tight select-none">
                            <div className="text-center font-bold text-sm tracking-wide">
                                {form.business_name || 'BOQUITA COME'}
                            </div>
                            <div className="text-center text-[10px] text-gray-700">
                                RUC: {form.business_ruc || '20XXXXXXXXX'}
                            </div>
                            <div className="text-center text-[10px] text-gray-700 break-words">
                                {form.business_address || 'Av. Principal 123'}
                            </div>
                            {form.business_phone && (
                                <div className="text-center text-[10px] text-gray-700">
                                    Tel: {form.business_phone}
                                </div>
                            )}

                            <div className="border-t border-dashed border-gray-400 pt-1.5 text-center font-bold">
                                BOLETA ELECTRÓNICA
                                <div className="text-[10px] font-normal text-gray-600">B001-00000123</div>
                            </div>

                            <div className="border-t border-dashed border-gray-400 pt-1.5 space-y-1">
                                <div className="flex justify-between text-[11px]">
                                    <span>1x Lomo Saltado</span>
                                    <span>S/ 35.00</span>
                                </div>
                                <div className="flex justify-between text-[11px]">
                                    <span>1x Chicha Morada 1L</span>
                                    <span>S/ 15.00</span>
                                </div>
                            </div>

                            <div className="border-t border-dashed border-gray-400 pt-1.5 space-y-0.5 text-[10px] text-gray-700">
                                <div className="flex justify-between">
                                    <span>OP. GRAVADAS:</span>
                                    <span>S/ 45.25</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>IGV ({form.igv_percentage}%):</span>
                                    <span>S/ 4.75</span>
                                </div>
                                <div className="flex justify-between font-bold text-xs text-gray-900 pt-0.5 border-t border-gray-300">
                                    <span>TOTAL:</span>
                                    <span>S/ 50.00</span>
                                </div>
                            </div>

                            <div className="border-t border-dashed border-gray-400 pt-2 text-center text-[10px] text-gray-600 italic">
                                {form.receipt_footer || '¡Gracias por su visita!'}
                            </div>
                        </div>
                    </div>

                    {/* Tarjeta: Copias de Seguridad */}
                    <div className="card p-5 space-y-3">
                        <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                            <span>💾</span> Copias de Seguridad
                        </h3>
                        <p className="text-xs text-gray-400 leading-relaxed">
                            Descarga una copia completa de tu base de datos o restaura una copia anterior en caso de mantenimiento.
                        </p>

                        <div className="space-y-2 pt-1">
                            <button
                                type="button"
                                onClick={handleBackupExport}
                                className="w-full btn-secondary py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 border border-gray-700 hover:border-gray-600"
                            >
                                <span>📥</span> Descargar Copia (.db)
                            </button>

                            <label className="w-full btn-secondary py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 border border-gray-700 hover:border-gray-600 cursor-pointer">
                                <span>📤</span> Restaurar Copia (.db)
                                <input
                                    type="file"
                                    accept=".db,.sqlite,.sqlite3"
                                    onChange={handleBackupImport}
                                    className="hidden"
                                />
                            </label>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
