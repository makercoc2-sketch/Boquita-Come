import { useState, useContext } from 'react'
import { loginByPin } from '../api/client'
import { AuthContext } from '../contexts/AuthContext'

export default function Login() {
    const [pin, setPin] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const { login } = useContext(AuthContext)

    const handleInput = (num) => {
        if (pin.length < 4) {
            setPin(prev => prev + num)
        }
    }

    const handleDelete = () => {
        setPin(prev => prev.slice(0, -1))
    }

    const handleSubmit = async () => {
        if (pin.length !== 4) {
            setError('Ingresa un PIN de 4 dígitos')
            return
        }

        setLoading(true)
        setError('')
        try {
            const { data } = await loginByPin({ pin })
            login(data)
        } catch (err) {
            setError(err.response?.data?.detail || 'Error al iniciar sesión')
            setPin('')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-sm flex flex-col items-center justify-center mb-10 select-none">
                <div className="flex flex-col items-center leading-[0.85]">
                    <h1 className="text-6xl font-black text-white tracking-tighter uppercase" style={{ transform: "scaleY(1.15)" }}>BOQUITA</h1>
                    <h2 className="text-5xl font-black text-brand-600 uppercase tracking-[0.2em]">COME</h2>
                </div>
            </div>

            <div className="card p-8 w-full max-w-sm space-y-6 animate-[fadeIn_0.5s_ease-out]">
                <div className="text-center">
                    <h3 className="text-xl font-bold text-white">Ingresa tu PIN</h3>
                    <p className="text-gray-400 text-sm">Validación rápida</p>
                </div>

                {/* PIN Display */}
                <div className="flex justify-center gap-3 my-6">
                    {[0, 1, 2, 3].map((i) => (
                        <div
                            key={i}
                            className={`w-14 h-16 rounded-xl border-2 flex items-center justify-center text-3xl font-bold transition-colors
                            ${pin.length > i
                                    ? 'bg-brand-600 border-brand-500 text-white shadow-[0_0_15px_rgba(223,32,39,0.5)]'
                                    : 'bg-gray-900 border-gray-700 text-transparent'}`}
                        >
                            {pin.length > i ? '•' : ''}
                        </div>
                    ))}
                </div>

                {error && (
                    <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-xl px-4 py-2 text-center text-sm font-medium">
                        {error}
                    </div>
                )}

                {/* Numpad */}
                <div className="grid grid-cols-3 gap-3">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                        <button
                            key={num}
                            onClick={() => handleInput(num.toString())}
                            className="h-16 rounded-xl bg-gray-800 text-white text-2xl font-bold hover:bg-gray-700 active:scale-95 transition-all"
                        >
                            {num}
                        </button>
                    ))}
                    <button
                        onClick={handleDelete}
                        className="h-16 rounded-xl bg-gray-900 text-gray-400 text-xl font-bold hover:bg-gray-800 active:scale-95 transition-all"
                    >
                        ⌫
                    </button>
                    <button
                        onClick={() => handleInput('0')}
                        className="h-16 rounded-xl bg-gray-800 text-white text-2xl font-bold hover:bg-gray-700 active:scale-95 transition-all"
                    >
                        0
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={loading || pin.length < 4}
                        className="h-16 rounded-xl bg-brand-600 text-white text-xl font-bold hover:bg-brand-500 active:scale-95 transition-all disabled:opacity-50 disabled:bg-gray-800 disabled:text-gray-600"
                    >
                        {loading ? '...' : 'OK'}
                    </button>
                </div>
            </div>
        </div>
    )
}
