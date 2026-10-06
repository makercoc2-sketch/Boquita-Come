import { useState, useEffect, useContext } from 'react'
import { Plus, Edit2, KeyRound, ShieldBan, ShieldCheck, UserCog, Download, Upload, Database } from 'lucide-react'
import api, { exportDatabaseBackup, importDatabaseBackup } from '../api/client'
import { AuthContext } from '../contexts/AuthContext'

export default function UserAdmin() {
    const { user } = useContext(AuthContext)
    const [users, setUsers] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [editingUser, setEditingUser] = useState(null)
    const [formData, setFormData] = useState({ name: '', pin: '', role: 'Mozo', is_active: true })
    const [saving, setSaving] = useState(false)

    // Backup state
    const [exporting, setExporting] = useState(false)
    const [importing, setImporting] = useState(false)
    const [importFile, setImportFile] = useState(null)

    const ROLES = ['Administrador', 'Sistemas', 'Caja', 'Mozo', 'Cocina', 'Bar']

    const ROLE_ICONS = {
        'Administrador': '👑',
        'Sistemas': '💻',
        'Caja': '💵',
        'Mozo': '📱',
        'Cocina': '👨‍🍳',
        'Bar': '🍸'
    }

    const handleExport = async (format = 'db') => {
        try {
            setExporting(true)
            const userRole = user?.role || 'Sistemas'
            const response = await exportDatabaseBackup(userRole, format)

            const url = window.URL.createObjectURL(new Blob([response.data]))
            const link = document.createElement('a')
            link.href = url
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
            const ext = format === 'json' ? 'json' : 'db'
            link.setAttribute('download', `boquita_come_backup_${timestamp}.${ext}`)
            document.body.appendChild(link)
            link.click()
            link.remove()
            window.URL.revokeObjectURL(url)
        } catch (err) {
            alert('Error al exportar la base de datos: ' + (err.response?.data?.detail || err.message))
        } finally {
            setExporting(false)
        }
    }

    const handleImportSubmit = async (e) => {
        e.preventDefault()
        if (!importFile) {
            alert('Por favor selecciona un archivo .db o .json de respaldo.')
            return
        }

        if (!confirm(`⚠️ ALERTA DE SEGURIDAD DE SISTEMAS:\n\n¿Estás seguro de que deseas importar "${importFile.name}"?\n\nEsta acción SOBRESCRIBIRÁ la base de datos actual. Se recomienda realizar una exportación previa como respaldo.`)) {
            return
        }

        try {
            setImporting(true)
            const formData = new FormData()
            formData.append('file', importFile)
            const userRole = user?.role || 'Sistemas'

            const { data } = await importDatabaseBackup(formData, userRole)
            alert(`✅ ${data.message || 'Base de datos restaurada correctamente.'}`)
            setImportFile(null)
            loadUsers()
        } catch (err) {
            alert('❌ Error al importar respaldo: ' + (err.response?.data?.detail || err.message))
        } finally {
            setImporting(false)
        }
    }

    const loadUsers = async () => {
        try {
            const { data } = await api.get('/auth/users')
            setUsers(data)
        } catch (err) {
            setError('Error al cargar usuarios')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { loadUsers() }, [])

    const handleOpenModal = (user = null) => {
        if (user) {
            setEditingUser(user)
            setFormData({
                name: user.name,
                pin: user.pin,
                role: user.role,
                is_active: user.is_active
            })
        } else {
            setEditingUser(null)
            setFormData({ name: '', pin: '', role: 'Mozo', is_active: true })
        }
        setError('')
        setIsModalOpen(true)
    }

    const handleCloseModal = () => {
        setIsModalOpen(false)
        setEditingUser(null)
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (formData.pin.length !== 4) {
            setError('El PIN debe tener 4 dígitos')
            return
        }
        setSaving(true)
        setError('')

        try {
            if (editingUser) {
                await api.patch(`/auth/users/${editingUser.id}`, formData)
            } else {
                await api.post('/auth/users', formData)
            }
            await loadUsers()
            handleCloseModal()
        } catch (err) {
            setError(err.response?.data?.detail || 'Error al guardar usuario')
        } finally {
            setSaving(false)
        }
    }

    const toggleStatus = async (user) => {
        if (!confirm(`¿${user.is_active ? 'Dar de baja' : 'Activar'} al usuario ${user.name}?`)) return
        try {
            await api.patch(`/auth/users/${user.id}`, { is_active: !user.is_active })
            loadUsers()
        } catch (err) {
            alert('Error al cambiar estado')
        }
    }

    if (loading) return <div className="p-8 text-center text-gray-400">Cargando usuarios...</div>

    return (
        <div className="max-w-6xl mx-auto space-y-6 animate-[fadeIn_0.3s_ease-out]">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <UserCog className="text-brand-500" />
                        Administración de Usuarios
                    </h1>
                    <p className="text-gray-400 text-sm mt-1">Gestiona los accesos y roles del sistema</p>
                </div>
                <button
                    onClick={() => handleOpenModal()}
                    className="btn-primary flex items-center gap-2"
                >
                    <Plus size={18} /> Nuevo Empleado
                </button>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-gray-300">
                        <thead className="text-xs uppercase bg-gray-800 text-gray-400">
                            <tr>
                                <th className="px-6 py-4">Usuario</th>
                                <th className="px-6 py-4">Rol</th>
                                <th className="px-6 py-4">PIN</th>
                                <th className="px-6 py-4">Estado</th>
                                <th className="px-6 py-4 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map(u => (
                                <tr key={u.id} className="border-b border-gray-800 hover:bg-gray-800/50 transition-colors">
                                    <td className="px-6 py-4 font-medium text-white">
                                        {u.name}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="flex items-center gap-2">
                                            <span>{ROLE_ICONS[u.role] || '👤'}</span>
                                            {u.role}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 font-mono text-gray-400">
                                        •••• {/* Mostramos ofuscado por seguridad UI */}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${u.is_active ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                                            {u.is_active ? 'Activo' : 'Baja'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 flex justify-end gap-2">
                                        <button
                                            onClick={() => handleOpenModal(u)}
                                            className="p-2 text-blue-400 hover:bg-blue-400/10 rounded-lg transition-colors"
                                            title="Editar Usuario"
                                        >
                                            <Edit2 size={16} />
                                        </button>
                                        <button
                                            onClick={() => toggleStatus(u)}
                                            className={`p-2 rounded-lg transition-colors ${u.is_active ? 'text-orange-400 hover:bg-orange-400/10' : 'text-green-400 hover:bg-green-400/10'}`}
                                            title={u.is_active ? 'Dar de Baja' : 'Reactivar'}
                                        >
                                            {u.is_active ? <ShieldBan size={16} /> : <ShieldCheck size={16} />}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ── Copias de Seguridad (Backup & Restore) – Perfil Sistemas ── */}
            {['Sistemas', 'Administrador'].includes(user?.role) && (
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-xl space-y-4">
                    <div className="flex items-center justify-between border-b border-gray-800 pb-4">
                        <div className="flex items-center gap-3">
                            <span className="p-2.5 bg-brand-950 text-brand-400 border border-brand-800 rounded-xl text-xl">💾</span>
                            <div>
                                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                    Respaldo y Restauración de Base de Datos
                                    <span className="text-xs bg-purple-950 text-purple-400 border border-purple-800 px-2.5 py-0.5 rounded-full font-bold">Perfil Sistemas</span>
                                </h2>
                                <p className="text-xs text-gray-400">Exporta e importa la base de datos (.db / .json) del sistema POS.</p>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-1">
                        {/* Exportar / Descargar */}
                        <div className="bg-gray-800/40 p-5 rounded-xl border border-gray-700/60 flex flex-col justify-between space-y-4">
                            <div>
                                <h3 className="text-sm font-bold text-emerald-400 flex items-center gap-2 mb-1">
                                    <Download size={16} /> Exportar Copia de Seguridad (Backup)
                                </h3>
                                <p className="text-xs text-gray-400">
                                    Descarga un archivo completo con el estado actual de todas las comandas, carta, usuarios y configuraciones.
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-2.5 pt-2">
                                <button
                                    onClick={() => handleExport('db')}
                                    disabled={exporting}
                                    className="flex-1 px-4 py-2.5 rounded-xl font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-all border border-emerald-500 shadow-md flex items-center justify-center gap-2 text-xs"
                                >
                                    <Download size={14} />
                                    {exporting ? 'Generando .db...' : 'Descargar Database (.db)'}
                                </button>
                                <button
                                    onClick={() => handleExport('json')}
                                    disabled={exporting}
                                    className="px-4 py-2.5 rounded-xl font-bold bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 transition-all flex items-center justify-center gap-2 text-xs"
                                >
                                    <Database size={14} />
                                    JSON
                                </button>
                            </div>
                        </div>

                        {/* Importar / Restaurar */}
                        <div className="bg-gray-800/40 p-5 rounded-xl border border-gray-700/60 space-y-3">
                            <div>
                                <h3 className="text-sm font-bold text-amber-400 flex items-center gap-2 mb-1">
                                    <Upload size={16} /> Importar / Restaurar Base de Datos
                                </h3>
                                <p className="text-xs text-gray-400">
                                    Selecciona un archivo <code>.db</code> o <code>.json</code> previamente respaldado para restaurarlo en el servidor.
                                </p>
                            </div>
                            <form onSubmit={handleImportSubmit} className="space-y-3 pt-1">
                                <input
                                    type="file"
                                    accept=".db,.sqlite,.json"
                                    onChange={(e) => setImportFile(e.target.files[0] || null)}
                                    className="w-full text-xs text-gray-400 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-gray-800 file:text-brand-400 hover:file:bg-gray-700 cursor-pointer"
                                />
                                <button
                                    type="submit"
                                    disabled={importing || !importFile}
                                    className={`w-full py-2.5 rounded-xl font-bold transition-all border flex items-center justify-center gap-2 text-xs ${
                                        importFile && !importing
                                            ? 'bg-amber-600 border-amber-500 text-white shadow-md hover:bg-amber-500'
                                            : 'bg-gray-800 border-gray-700 text-gray-500 cursor-not-allowed'
                                    }`}
                                >
                                    <Upload size={14} />
                                    {importing ? 'Restaurando Base de Datos...' : 'Restaurar Respaldo Seleccionado'}
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-[fadeIn_0.2s_ease-out]">
                    <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden transform animate-[slideUp_0.2s_ease-out]">
                        <div className="p-6 border-b border-gray-800 flex justify-between items-center">
                            <h3 className="text-xl font-bold text-white">
                                {editingUser ? 'Editar Usuario' : 'Nuevo Empleado'}
                            </h3>
                            <button onClick={handleCloseModal} className="text-gray-400 hover:text-white">×</button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-5">
                            {error && (
                                <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg text-sm">
                                    {error}
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">Nombre Completo (Username)</label>
                                <input
                                    type="text"
                                    required
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 focus:outline-none focus:border-brand-500 text-white"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">Rol en el Sistema</label>
                                <select
                                    value={formData.role}
                                    onChange={e => setFormData({ ...formData, role: e.target.value })}
                                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 focus:outline-none focus:border-brand-500 text-white appearance-none"
                                >
                                    {ROLES.map(r => (
                                        <option key={r} value={r}>{ROLE_ICONS[r]} {r}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1 flex items-center gap-1">
                                    <KeyRound size={14} /> PIN de Acceso (4 dígitos)
                                </label>
                                <input
                                    type="text"
                                    required
                                    maxLength={4}
                                    pattern="\d{4}"
                                    title="Debe ser exactamente 4 números"
                                    value={formData.pin}
                                    onChange={e => setFormData({ ...formData, pin: e.target.value.replace(/\D/g, '') })}
                                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 focus:outline-none focus:border-brand-500 text-white tracking-[0.5em] font-mono text-center text-lg"
                                    placeholder="••••"
                                />
                                <p className="text-xs text-gray-500 mt-1">Este PIN será usado para iniciar sesión.</p>
                            </div>

                            <div className="pt-4 flex gap-3">
                                <button
                                    type="button"
                                    onClick={handleCloseModal}
                                    className="flex-1 btn-secondary py-3"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="flex-1 btn-primary py-3"
                                >
                                    {saving ? 'Guardando...' : 'Guardar'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
