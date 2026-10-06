import { Routes, Route, Link, useLocation, Navigate } from 'react-router-dom'
import { useContext } from 'react'
import { AuthContext } from './contexts/AuthContext'
import TableMap from './pages/TableMap'
import KitchenDisplay from './pages/KitchenDisplay'
import BarDisplay from './pages/BarDisplay'
import MenuManager from './pages/MenuManager'
import UserAdmin from './pages/UserAdmin'
import Finances from './pages/Finances'
import Dashboard from './pages/Dashboard'
import OrderPanel from './pages/OrderPanel'
import Login from './pages/Login'
import GlobalNotifications from './components/GlobalNotifications'

export default function App() {
    const location = useLocation()
    const { user, logout, loading } = useContext(AuthContext)

    if (loading) return null

    if (!user) {
        return <Login />
    }

    const navLink = (to, label, allowedRoles) => {
        if (allowedRoles && !allowedRoles.includes(user.role)) return null

        const isActive = location.pathname === to
        return (
            <Link to={to}
                className={`transition-colors font-medium ${isActive ? 'text-brand-500' : 'text-gray-300 hover:text-white'}`}>
                {label}
            </Link>
        )
    }

    // Redirect Cocina/Bar to their specific routes directly
    if (user.role === 'Cocina' && location.pathname !== '/kitchen') {
        return <Navigate to="/kitchen" />
    }
    if (user.role === 'Bar' && location.pathname !== '/bar') {
        return <Navigate to="/bar" />
    }

    return (
        <div className="min-h-screen flex flex-col">
            <GlobalNotifications />
            {/* ── Navbar ──────────────────────────────────────────────── */}
            <nav className="bg-gray-900 border-b border-gray-800 px-4 sm:px-6 py-3 flex items-center justify-between gap-4 overflow-x-auto">
                <div className="flex items-center gap-4 sm:gap-6">
                    <div className="flex flex-col items-center justify-center leading-[0.85] mr-2 select-none">
                        <span className="text-white font-black text-xl sm:text-2xl tracking-tighter uppercase" style={{ transform: "scaleY(1.1)" }}>BOQUITA</span>
                        <span className="text-brand-600 font-black text-lg sm:text-xl tracking-widest uppercase">COME</span>
                    </div>
                    {navLink('/', 'Mesas', ['Administrador', 'Sistemas', 'Caja', 'Mozo'])}
                    {navLink('/kitchen', '🍳 Cocina', ['Administrador', 'Sistemas', 'Cocina', 'Caja'])}
                    {navLink('/bar', '🍹 Bar', ['Administrador', 'Sistemas', 'Bar'])}

                    {navLink('/menu', '📋 Carta', ['Administrador', 'Sistemas', 'Caja'])}
                    {navLink('/users', '👥 Usuarios', ['Administrador', 'Sistemas'])}
                    {navLink('/dashboard', '📊 Dashboard', ['Administrador'])}
                    {navLink('/finances', '📈 Finanzas', ['Administrador'])}
                </div>
                <div className="flex items-center gap-3 sm:gap-4">
                    <span className="text-gray-400 text-sm hidden lg:inline-block">
                        Hola, <strong className="text-white">{user.name}</strong> ({user.role})
                    </span>
                    <button
                        onClick={logout}
                        className="flex items-center gap-1.5 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-red-400 hover:text-red-300 font-bold rounded-xl transition-all shadow-sm border border-gray-700 active:scale-95"
                        title="Cambio de turno / Bloqueo rápido"
                    >
                        <span className="text-lg">🔒</span>
                        <span className="hidden sm:inline">Bloquear</span>
                    </button>
                </div>
            </nav>

            {/* ── Contenido ───────────────────────────────────────────── */}
            <main className="flex-1 p-4 md:p-6">
                <Routes>
                    {(['Administrador', 'Sistemas', 'Caja', 'Mozo'].includes(user.role)) && (
                        <Route path="/" element={<TableMap />} />
                    )}
                    {(['Administrador', 'Sistemas', 'Cocina', 'Caja'].includes(user.role)) && (
                        <Route path="/kitchen" element={<KitchenDisplay />} />
                    )}

                    {(['Administrador', 'Sistemas', 'Bar'].includes(user.role)) && (
                        <Route path="/bar" element={<BarDisplay />} />
                    )}
                    {/* El OrderPanel se permite a quienes puedan ver mesas (Mozo, Admin, Sistemas, Caja) */}
                    {(['Administrador', 'Sistemas', 'Caja', 'Mozo'].includes(user.role)) && (
                        <Route path="/order/:tableId" element={<OrderPanel />} />
                    )}
                    {(['Administrador', 'Sistemas', 'Caja'].includes(user.role)) && (
                        <Route path="/menu" element={<MenuManager />} />
                    )}
                    {(['Administrador', 'Sistemas'].includes(user.role)) && (
                        <Route path="/users" element={<UserAdmin />} />
                    )}
                    {(['Administrador'].includes(user.role)) && (
                        <Route path="/finances" element={<Finances />} />
                    )}
                    {(['Administrador'].includes(user.role)) && (
                        <Route path="/dashboard" element={<Dashboard />} />
                    )}
                    <Route path="*" element={<Navigate to="/" />} />
                </Routes>
            </main>
        </div>
    )
}
