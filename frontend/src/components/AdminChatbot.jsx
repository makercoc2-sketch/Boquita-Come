import { useState, useRef, useEffect } from 'react'
import { askChatbot } from '../api/client'

export default function AdminChatbot() {
    const [isOpen, setIsOpen] = useState(false)
    const [messages, setMessages] = useState([
        { sender: 'bot', text: '¡Hola! Soy el asistente inteligente de tu negocio. Pregúntame sobre las ventas o el rendimiento del mes.' }
    ])
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const messagesEndRef = useRef(null)

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }

    useEffect(() => {
        if (isOpen) scrollToBottom()
    }, [messages, isOpen])

    const handleSend = async (e) => {
        e.preventDefault()
        if (!input.trim() || loading) return

        const userMsg = input.trim()
        setMessages(prev => [...prev, { sender: 'user', text: userMsg }])
        setInput('')
        setLoading(true)

        try {
            const { data } = await askChatbot(userMsg)
            setMessages(prev => [...prev, { sender: 'bot', text: data.reply }])
        } catch (err) {
            setMessages(prev => [...prev, { sender: 'bot', text: 'Error de conexión con el asistente.' }])
        } finally {
            setLoading(false)
        }
    }

    return (
        <>
            {/* Floating Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`fixed bottom-6 right-6 w-14 h-14 rounded-full bg-brand-600 text-white shadow-lg flex items-center justify-center text-2xl hover:bg-brand-500 transition-all z-50 hover:scale-110 active:scale-95 ${isOpen ? 'rotate-12' : ''}`}
                title="Consultar IA"
            >
                {isOpen ? '✕' : '🤖'}
            </button>

            {/* Chat Window */}
            {isOpen && (
                <div className="fixed bottom-24 right-6 w-[350px] max-w-[calc(100vw-3rem)] bg-gray-900 border border-brand-500/30 rounded-2xl shadow-2xl z-50 flex flex-col overflow-hidden animate-[fadeIn_0.2s_ease-out]">
                    <div className="bg-gradient-to-r from-brand-700 to-brand-500 p-4 text-white">
                        <h3 className="font-bold flex items-center gap-2">
                            <span>✨</span> Asistente Boquita Come
                        </h3>
                        <p className="text-xs opacity-80">Conectado a la base de datos de ventas</p>
                    </div>

                    <div className="flex-1 p-4 h-[350px] overflow-y-auto space-y-4 bg-gray-950/50">
                        {messages.map((msg, idx) => (
                            <div key={idx} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${msg.sender === 'user' ? 'bg-brand-600 text-white rounded-br-sm' : 'bg-gray-800 text-gray-200 border border-gray-700 rounded-bl-sm'} shadow-md whitespace-pre-wrap`}>
                                    {msg.text}
                                </div>
                            </div>
                        ))}
                        {loading && (
                            <div className="flex justify-start">
                                <div className="bg-gray-800 text-gray-400 rounded-2xl px-4 py-2 text-sm rounded-bl-sm animate-pulse border border-gray-700">
                                    Analizando datos...
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    <form onSubmit={handleSend} className="p-3 bg-gray-900 border-t border-gray-800 flex gap-2">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="Ej. ¿Qué producto se vende más?"
                            className="flex-1 bg-gray-950 border border-gray-700 rounded-xl px-4 py-2 focus:outline-none focus:border-brand-500 text-white text-sm transition-colors"
                        />
                        <button
                            type="submit"
                            disabled={!input.trim() || loading}
                            className="bg-brand-600 hover:bg-brand-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-xl px-4 py-2 transition-all font-bold active:scale-95 flex items-center justify-center placeholder-gray-500"
                        >
                            <span className="transform rotate-0">➤</span>
                        </button>
                    </form>
                </div>
            )}
        </>
    )
}
