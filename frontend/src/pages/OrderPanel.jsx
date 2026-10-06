import { useState, useEffect, useCallback, useContext } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { AuthContext } from '../contexts/AuthContext'
import {
    getOrder, createOrder, addOrderItems, sendToKitchen, closeOrder, cancelOrder,
    getCategories, getProducts, updateTable, updateItemStatus, unmergeTables, getTables,
    previewBilling, printReceipt, getCreams, updateOrderItem, deleteOrderItem
} from '../api/client'

import { useWebSocket } from '../hooks/useWebSocket'
import api from '../api/client'

/**
 * Panel de Comanda (Add-on) para una mesa.
 * Permite añadir ítems en cualquier momento y enviarlos a cocina.
 */
export default function OrderPanel() {
    const { tableId } = useParams()
    const navigate = useNavigate()

    const [order, setOrder] = useState(null)
    const [categories, setCategories] = useState([])
    const [products, setProducts] = useState([])
    const [creams, setCreams] = useState([])
    const [activeCatId, setActiveCatId] = useState(null)
    const [searchQuery, setSearchQuery] = useState('')
    const [selectedProduct, setSelectedProduct] = useState(null) // Para el Modal de agregar plato
    const [modalQty, setModalQty] = useState(1)
    const [modalNotes, setModalNotes] = useState('')
    const [selectedCreams, setSelectedCreams] = useState([])
    const [isTakeout, setIsTakeout] = useState(false)
    const [showCreamPicker, setShowCreamPicker] = useState(false)

    const [cart, setCart] = useState([])   // ítems pendientes de envío

    const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

    const handleToggleCream = (abbr) => {
        setSelectedCreams(prev =>
            prev.includes(abbr) ? prev.filter(a => a !== abbr) : [...prev, abbr]
        )
    }

    const handleAddSuggestion = (mod) => {
        setModalNotes(prev => prev ? `${prev}, ${mod}` : mod)
    }

    const [editingSentItem, setEditingSentItem] = useState(null)

    const openEditSentItemModal = (item) => {
        const product = products.find(p => p.id === item.product_id)
        if (!product) return

        setEditingSentItem(item)
        setModalQty(item.quantity)

        let baseNotes = item.notes || ''
        const hasTakeout = baseNotes.includes('[PARA LLEVAR]') || baseNotes.includes('[LLEVAR]')
        baseNotes = baseNotes.replace(/\[PARA LLEVAR\]|\[LLEVAR\]/g, '').trim()

        const knownAbbrs = creams.map(c => c.abbreviation)
        const foundCreams = []

        knownAbbrs.forEach(abbr => {
            const reg = new RegExp(`(?:^|\\s)${escapeRegExp(abbr)}(?=$|\\s)`, 'g')
            if (reg.test(baseNotes)) {
                foundCreams.push(abbr)
                baseNotes = baseNotes.replace(reg, '')
            }
        })

        setModalNotes(baseNotes.replace(/\s+/g, ' ').trim())
        setSelectedCreams(foundCreams)
        setIsTakeout(hasTakeout)
        setShowCreamPicker(false)
        setSelectedProduct(product)
    }

    const handleDeleteSentItem = async (item) => {
        const userRole = user?.role || 'Mozo'
        const roleClean = String(userRole).toLowerCase().trim()
        const privilegedKeywords = ['administrador', 'admin', 'caja', 'cajero', 'cashier', 'sistemas', 'system']
        const isPrivileged = privilegedKeywords.some(r => roleClean.includes(r))

        if ((item.status === 'PREPARING' || item.status === 'COMPLETED' || item.status === 'DELIVERED') && !isPrivileged) {
            alert('⚠️ El plato ya está en preparación en cocina. Solo un Cajero o Administrador puede cancelarlo.')
            return
        }

        const prodName = getProductName(item.product_id)
        if (!confirm(`¿Estás seguro de cancelar/eliminar "${prodName}" de la comanda?`)) return

        try {
            await deleteOrderItem(item.id, userRole)
            await loadOrCreateOrder()
        } catch (err) {
            alert(err.response?.data?.detail ?? 'Error al eliminar el ítem.')
        }
    }
    const [loading, setLoading] = useState(true)
    const [sending, setSending] = useState(false)
    const [error, setError] = useState(null)
    const [showPaymentModal, setShowPaymentModal] = useState(false)
    const [selectedPaymentMethod, setSelectedPaymentMethod] = useState(null)
    const [cashReceived, setCashReceived] = useState('')
    const [paymentRef, setPaymentRef] = useState('')
    const [paymentSuccessData, setPaymentSuccessData] = useState(null)
    const [printingReceipt, setPrintingReceipt] = useState(false)
    const [showFreeModal, setShowFreeModal] = useState(false)
    const [mergedSecondaries, setMergedSecondaries] = useState([])


    const { user } = useContext(AuthContext)

    // Conectar WebSocket para recibir notificaciones de platos listos
    const { lastMessage: waiterWs } = useWebSocket(user ? `waiter/${user.id}` : null)
    const { lastMessage: globalWs } = useWebSocket('global')
    const lastMessage = globalWs || waiterWs

    // ── Cargar categorías, productos y cremas ──────────────────────────
    useEffect(() => {
        Promise.all([
            getCategories().then(r => setCategories(r.data)).catch(() => { }),
            getProducts().then(r => setProducts(r.data)).catch(() => { }),
            getCreams().then(r => setCreams(r.data)).catch(() => { }),
        ])
    }, [])

    // ── Cargar / crear orden ──────────────────────────────────────────────────
    const loadOrCreateOrder = useCallback(async () => {
        try {
            // Obtener orden activa de la mesa
            const res = await api.get(`/orders/active/${tableId}`)
            if (res?.data) {
                // Fetch de la orden completa para traer todos los items con sus detalles frescos
                const existing = await getOrder(res.data.id)
                setOrder(existing.data)
                return
            }
        } catch (err) {
            if (err.response?.status === 404) {
                // No hay orden activa, la creamos ahora para ocupar la mesa inmediatamente
                try {
                    const { data } = await createOrder({ table_id: parseInt(tableId), user_id: user?.id })
                    setOrder(data)
                } catch (createErr) {
                    if (createErr.response?.status === 409) {
                        try {
                            const res = await api.get(`/orders/active/${tableId}`)
                            if (res?.data) {
                                const existing = await getOrder(res.data.id)
                                setOrder(existing.data)
                            }
                        } catch (e) {
                            console.error("Error al obtener la orden activa tras 409", e)
                        }
                    }
                }
            } else {
                try {
                    const res = await api.get(`/orders/active/${tableId}`)
                    if (res?.data) {
                        const existing = await getOrder(res.data.id)
                        setOrder(existing.data)
                    }
                } catch (e) {
                    console.error("Error al obtener orden activa", e)
                }
            }
        } finally {
            setLoading(false)
        }
    }, [tableId, user?.id])

    useEffect(() => { loadOrCreateOrder() }, [loadOrCreateOrder])


    // Cargar mesas secundarias unidas a esta mesa
    useEffect(() => {
        getTables().then(res => {
            const secs = res.data.filter(t => t.merged_into === parseInt(tableId))
            setMergedSecondaries(secs)
        }).catch(() => { })
    }, [tableId])

    // Escuchar WebSocket para actualizar estado de items enviados y cambios en tiempo real
    useEffect(() => {
        if (!lastMessage || !order) return
        if (
            (lastMessage.event === 'item_status_changed' ||
             lastMessage.event === 'item_updated' ||
             lastMessage.event === 'item_deleted' ||
             lastMessage.event === 'new_ticket') &&
            (lastMessage.order_id === order.id || lastMessage.table_id === parseInt(tableId))
        ) {
            if (lastMessage.event === 'item_status_changed' && lastMessage.status === 'COMPLETED') {
                try {
                    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);

                    const ctx = new (window.AudioContext || window.webkitAudioContext)();
                    if (ctx.state === 'suspended') ctx.resume();

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
                    playBell(1800, now, 0.6)
                    playBell(2200, now + 0.15, 0.8)
                } catch (e) {
                    // Ignore audio issues
                }
            }

            loadOrCreateOrder()
        }
    }, [lastMessage, order?.id, tableId, loadOrCreateOrder])

    // ── Productos filtrados ───────────────────────────────────────────────────
    const filteredProducts = products.filter(p => {
        if (activeCatId && p.category_id !== activeCatId) return false
        if (searchQuery) {
            const q = searchQuery.toLowerCase()
            return p.name.toLowerCase().includes(q) || String(p.id).includes(q)
        }
        return true
    })

    // ── Helpers ───────────────────────────────────────────────────────────────
    const getProductName = (productId) => {
        return products.find(p => p.id === productId)?.name ?? `Producto #${productId}`
    }

    // ── Carrito ───────────────────────────────────────────────────────────────
    const openProductModal = (product) => {
        setEditingSentItem(null)
        const existing = cart.find(i => i.product_id === product.id)
        if (existing) {
            setModalQty(existing.quantity)
            
            // Separar notas de texto, cremas y marca de Para Llevar
            let baseNotes = existing.notes || ''
            const hasTakeout = baseNotes.includes('[PARA LLEVAR]') || baseNotes.includes('[LLEVAR]')
            baseNotes = baseNotes.replace(/\[PARA LLEVAR\]|\[LLEVAR\]/g, '').trim()

            const knownAbbrs = creams.map(c => c.abbreviation)
            const foundCreams = []

            knownAbbrs.forEach(abbr => {
                const reg = new RegExp(`(?:^|\\s)${escapeRegExp(abbr)}(?=$|\\s)`, 'g')
                if (reg.test(baseNotes)) {
                    foundCreams.push(abbr)
                    baseNotes = baseNotes.replace(reg, '')
                }
            })

            setModalNotes(baseNotes.replace(/\s+/g, ' ').trim())
            setSelectedCreams(foundCreams)
            setIsTakeout(hasTakeout)
        } else {
            setModalQty(1)
            setModalNotes('')
            setSelectedCreams([])
            setIsTakeout(false)
        }
        setShowCreamPicker(false)
        setSelectedProduct(product)
    }

    const confirmAddToCart = async () => {
        if (!selectedProduct) return

        // Combinar notas: [PARA LLEVAR] (si aplica) + texto + cremas (al final)
        const cleanBaseNotes = modalNotes.trim()
        const creamsString = selectedCreams.join(' ')

        let parts = []
        if (isTakeout) parts.push('[PARA LLEVAR]')
        if (cleanBaseNotes) parts.push(cleanBaseNotes)
        if (creamsString) parts.push(creamsString)

        const combinedNotes = parts.join(' ')

        if (editingSentItem) {
            try {
                await updateOrderItem(editingSentItem.id, { notes: combinedNotes })
                await loadOrCreateOrder()
            } catch (err) {
                alert(err.response?.data?.detail ?? 'Error al actualizar el ítem enviado.')
            } finally {
                setEditingSentItem(null)
                setSelectedProduct(null)
            }
            return
        }

        setCart(prev => {
            const existing = prev.find(i => i.product_id === selectedProduct.id)
            if (existing) {
                return prev.map(i => i.product_id === selectedProduct.id
                    ? { ...i, quantity: modalQty, notes: combinedNotes }
                    : i
                )
            }
            return [...prev, { product_id: selectedProduct.id, quantity: modalQty, _product: selectedProduct, modifiers: [], notes: combinedNotes }]
        })
        setSelectedProduct(null)
    }

    const removeFromCart = (productId) => {
        setCart(prev => prev.filter(i => i.product_id !== productId))
    }

    const updateQty = (productId, qty) => {
        if (qty < 1) { removeFromCart(productId); return }
        setCart(prev => prev.map(i => i.product_id === productId ? { ...i, quantity: qty } : i))
    }

    const updateNotes = (productId, notes) => {
        setCart(prev => prev.map(i => i.product_id === productId ? { ...i, notes } : i))
    }

    // ── Enviar a cocina ───────────────────────────────────────────────────────
    const handleSendToKitchen = async () => {
        if (!cart.length) return
        setSending(true)
        setError(null)
        try {
            let activeOrder = order

            // Crear orden si no existe
            if (!activeOrder) {
                const { data } = await createOrder({ table_id: parseInt(tableId), user_id: user?.id })
                activeOrder = data
                setOrder(data)
            }

            // Agregar ítems
            const items = cart.map(({ product_id, quantity, modifiers, notes }) =>
                ({ product_id, quantity, modifiers, notes: notes || null })
            )
            await addOrderItems(activeOrder.id, items)

            // Enviar a cocina → genera ticket WebSocket
            await sendToKitchen(activeOrder.id)

            // Actualizar orden y limpiar carrito
            const { data: updated } = await getOrder(activeOrder.id)
            setOrder(updated)
            setCart([])
        } catch (err) {
            setError(err.response?.data?.detail ?? 'Error al enviar a cocina.')
        } finally {
            setSending(false)
        }
    }

    // ── Gestión de Cobro y Confirmación de Pago ────────────────────────────────
    const handleOpenPaymentModal = () => {
        setShowPaymentModal(true)
        setSelectedPaymentMethod(null)
        setCashReceived('')
        setPaymentRef('')
        setPaymentSuccessData(null)
    }

    const handleSelectMethod = (method) => {
        setSelectedPaymentMethod(method)
        if (method === 'Efectivo') {
            setCashReceived(sentTotal.toFixed(2))
        }
    }

    const handleConfirmPayment = async () => {
        if (!order || !selectedPaymentMethod) return
        setSending(true)
        try {
            const received = selectedPaymentMethod === 'Efectivo' ? (parseFloat(cashReceived) || sentTotal) : sentTotal
            const change = selectedPaymentMethod === 'Efectivo' ? Math.max(0, received - sentTotal) : 0

            await closeOrder(order.id, { payment_method: selectedPaymentMethod })

            setPaymentSuccessData({
                orderId: order.id,
                tableNumber: tableId,
                paymentMethod: selectedPaymentMethod,
                paymentRef,
                total: sentTotal,
                cashReceived: received,
                change,
            })
        } catch (err) {
            alert(err.response?.data?.detail ?? 'Error al cerrar cuenta.')
        } finally {
            setSending(false)
        }
    }

    const handlePrintReceipt = async () => {
        if (!order) return
        setPrintingReceipt(true)
        try {
            const doc = await previewBilling(order.id)
            await printReceipt(doc.data)
            alert("✅ Recibo enviado a la impresora correctamente.")
        } catch (err) {
            alert(err.response?.data?.detail ?? 'No se pudo conectar a la impresora. Impresión simulada en la consola del servidor.')
        } finally {
            setPrintingReceipt(false)
        }
    }

    const handleFinishPayment = () => {
        setShowPaymentModal(false)
        setPaymentSuccessData(null)
        navigate('/')
    }


    // ── Solicitar cuenta (marcar mesa Por Pagar) ─────────────────────────────
    const handleRequestBill = async () => {
        if (!order) return
        if (!confirm('¿Marcar la mesa como POR PAGAR? La mesa quedará lista para cobro.')) return
        try {
            await updateTable(tableId, { status: 'TOPAY' })
            navigate('/')
        } catch (err) {
            alert(err.response?.data?.detail ?? 'Error al actualizar.')
        }
    }

    // ── Liberar Mesa (Cancelar Orden) ──────────────────────────────────────────
    const handleFreeTable = async () => {
        if (!order) {
            navigate('/')
            return
        }
        // Mostrar modal de confirmación con advertencia apropiada
        setShowFreeModal(true)
    }

    const confirmFreeTable = async () => {
        setShowFreeModal(false)
        try {
            await cancelOrder(order.id)
            navigate('/')
        } catch (err) {
            alert(err.response?.data?.detail ?? 'Error al liberar la mesa.')
        }
    }

    // ── Separar Mesas ─────────────────────────────────────────────────────────
    const handleUnmerge = async () => {
        if (!confirm(`¿Separar las ${mergedSecondaries.length} mesa(s) secundaria(s)? Las mesas secundarias quedarán libres.`)) return
        try {
            await unmergeTables(parseInt(tableId))
            setMergedSecondaries([])
        } catch (err) {
            alert(err.response?.data?.detail ?? 'Error al separar mesas.')
        }
    }

    // ── Render ─────────────────────────────────────────────────────────────────
    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-brand-500"></div>
        </div>
    )

    const sentItems = order?.items?.filter(i => i.sent_to_kitchen_at) ?? []
    const cartTotal = cart.reduce((s, i) => s + Number(i._product.price) * i.quantity, 0)
    const sentTotal = sentItems.reduce((s, i) => s + i.price_at_time * i.quantity, 0)

    return (
        <div className="max-w-5xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <button onClick={() => navigate('/')} className="btn-secondary text-sm">← Mesas</button>
                <h1 className="text-xl font-bold text-white flex-1">
                    🍽️ Mesa #{tableId}
                    {order && <span className="ml-2 text-sm text-gray-400">Orden #{order.id}</span>}
                </h1>
                {order && (
                    <div className="flex gap-2 flex-wrap">
                        <button onClick={handleFreeTable} className="btn-secondary text-sm border-gray-500/50 hover:border-gray-500 hover:text-white" title="Liberar Mesa">
                            🗑️ Liberar
                        </button>
                        {mergedSecondaries.length > 0 && (
                            <button onClick={handleUnmerge} className="btn-secondary text-sm border-yellow-500/50 hover:border-yellow-500 text-yellow-200" title="Separar mesas unidas">
                                ⛓ Separar ({mergedSecondaries.length})
                            </button>
                        )}
                        {order.items?.length > 0 && (
                            <button onClick={handleRequestBill} className="btn-secondary text-sm border-orange-500/50 hover:border-orange-500 text-orange-200">
                                🔔 Pedir Cuenta
                            </button>
                        )}
                        <button onClick={handleOpenPaymentModal} className="btn-danger text-sm">
                            💳 Cerrar Cuenta
                        </button>
                    </div>
                )}
            </div>

            {/* Payment Modal con Confirmación de Pago */}
            {showPaymentModal && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-[fadeIn_0.2s_ease-out]">
                    <div className="bg-gray-900 border border-gray-700 rounded-3xl shadow-2xl p-6 w-full max-w-md space-y-6">

                        {/* PASO 3: PAGO CONFIRMADO CON ÉXITO */}
                        {paymentSuccessData ? (
                            <div className="space-y-6 text-center animate-[scaleUp_0.3s_ease-out]">
                                <div className="w-20 h-20 bg-emerald-500/20 border-2 border-emerald-500 text-emerald-400 rounded-full flex items-center justify-center text-4xl mx-auto shadow-[0_0_25px_rgba(16,185,129,0.4)]">
                                    ✓
                                </div>

                                <div>
                                    <h3 className="text-2xl font-black text-white">¡Pago Confirmado!</h3>
                                    <p className="text-emerald-400 font-semibold text-sm mt-1">El pago ha sido recibido y la mesa fue liberada.</p>
                                </div>

                                {/* Resumen del cobro */}
                                <div className="bg-gray-800/80 border border-gray-700/80 rounded-2xl p-4 text-left space-y-2 text-sm">
                                    <div className="flex justify-between text-gray-300">
                                        <span>Mesa:</span>
                                        <span className="font-bold text-white">Mesa #{tableId}</span>
                                    </div>
                                    <div className="flex justify-between text-gray-300">
                                        <span>Método de Pago:</span>
                                        <span className="font-bold text-brand-400">{paymentSuccessData.paymentMethod}</span>
                                    </div>
                                    {paymentSuccessData.paymentRef && (
                                        <div className="flex justify-between text-gray-300">
                                            <span>N° Operación:</span>
                                            <span className="font-mono text-white">{paymentSuccessData.paymentRef}</span>
                                        </div>
                                    )}
                                    <hr className="border-gray-700" />
                                    <div className="flex justify-between text-lg font-bold text-white">
                                        <span>Total Cobrado:</span>
                                        <span className="text-emerald-400">S/ {paymentSuccessData.total.toFixed(2)}</span>
                                    </div>
                                    {paymentSuccessData.paymentMethod === 'Efectivo' && (
                                        <>
                                            <div className="flex justify-between text-xs text-gray-400">
                                                <span>Monto Recibido:</span>
                                                <span>S/ {paymentSuccessData.cashReceived.toFixed(2)}</span>
                                            </div>
                                            <div className="flex justify-between text-xs text-emerald-300 font-bold">
                                                <span>Vuelto Entregado:</span>
                                                <span>S/ {paymentSuccessData.change.toFixed(2)}</span>
                                            </div>
                                        </>
                                    )}
                                </div>

                                <div className="space-y-3 pt-2">
                                    <button
                                        onClick={handlePrintReceipt}
                                        disabled={printingReceipt}
                                        className="w-full py-3.5 bg-gray-800 hover:bg-gray-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 border border-gray-600 transition-all active:scale-95"
                                    >
                                        {printingReceipt ? '⏳ Imprimiendo...' : '🖨️ Imprimir Ticket Recibo'}
                                    </button>

                                    <button
                                        onClick={handleFinishPayment}
                                        className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-lg font-bold shadow-lg transition-transform active:scale-95"
                                    >
                                        🏠 Finalizar y Volver a Mesas
                                    </button>
                                </div>
                            </div>
                        ) : !selectedPaymentMethod ? (
                            /* PASO 1: SELECCIONAR MÉTODO DE PAGO */
                            <div className="space-y-6">
                                <div className="text-center">
                                    <h3 className="text-2xl font-black text-white">Cerrar Cuenta</h3>
                                    <p className="text-gray-400 text-sm mt-1">Selecciona cómo pagará el cliente</p>
                                    <div className="mt-3 bg-brand-950/60 border border-brand-500/30 rounded-2xl p-3">
                                        <span className="text-xs text-gray-400 block uppercase font-semibold">Total a Cobrar</span>
                                        <span className="text-3xl font-black text-brand-400">S/ {sentTotal.toFixed(2)}</span>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 gap-3">
                                    {[
                                        { id: 'Efectivo', label: 'Efectivo', icon: '💵', color: 'hover:border-emerald-500' },
                                        { id: 'Tarjeta', label: 'Tarjeta (POS)', icon: '💳', color: 'hover:border-blue-500' },
                                        { id: 'Yape / Plin', label: 'Yape / Plin', icon: '📱', color: 'hover:border-purple-500' },
                                    ].map(method => (
                                        <button
                                            key={method.id}
                                            onClick={() => handleSelectMethod(method.id)}
                                            className={`w-full py-4 px-5 bg-gray-800 hover:bg-gray-700/80 border border-gray-700 text-white rounded-2xl text-lg font-bold flex items-center justify-between transition-all active:scale-95 ${method.color}`}
                                        >
                                            <span className="flex items-center gap-3">
                                                <span className="text-2xl">{method.icon}</span>
                                                {method.label}
                                            </span>
                                            <span className="text-gray-400">→</span>
                                        </button>
                                    ))}
                                </div>

                                <button
                                    onClick={() => setShowPaymentModal(false)}
                                    className="btn-secondary w-full py-3"
                                >
                                    Cancelar
                                </button>
                            </div>
                        ) : (
                            /* PASO 2: DETALLES Y CONFIRMACIÓN DE PAGO RECIBIDO */
                            <div className="space-y-6">
                                <div className="flex items-center justify-between border-b border-gray-800 pb-3">
                                    <button
                                        onClick={() => setSelectedPaymentMethod(null)}
                                        className="text-gray-400 hover:text-white text-sm font-semibold flex items-center gap-1"
                                    >
                                        ← Cambiar método
                                    </button>
                                    <span className="text-sm font-bold text-brand-400 bg-brand-950/80 px-3 py-1 rounded-full border border-brand-500/30">
                                        {selectedPaymentMethod}
                                    </span>
                                </div>

                                <div className="text-center">
                                    <span className="text-xs text-gray-400 uppercase font-semibold">Total a Cobrar</span>
                                    <h4 className="text-4xl font-black text-white mt-1">S/ {sentTotal.toFixed(2)}</h4>
                                </div>

                                {/* Si eligió EFECTIVO: Calculadora de Vuelto */}
                                {selectedPaymentMethod === 'Efectivo' && (
                                    <div className="space-y-4">
                                        <div>
                                            <label className="text-gray-300 text-sm font-bold block mb-2">Monto Recibido de Cliente (S/)</label>
                                            <input
                                                type="number"
                                                step="0.10"
                                                value={cashReceived}
                                                onChange={(e) => setCashReceived(e.target.value)}
                                                placeholder="Ej. 50.00"
                                                className="w-full bg-gray-800 text-white text-2xl font-bold text-center rounded-2xl p-3 border border-gray-700 focus:border-emerald-500 outline-none"
                                            />
                                        </div>

                                        {/* Billetes rápidos */}
                                        <div className="flex gap-2">
                                            {[
                                                sentTotal,
                                                Math.ceil(sentTotal / 10) * 10,
                                                50,
                                                100,
                                            ].filter((v, i, a) => v >= sentTotal && a.indexOf(v) === i).slice(0, 4).map(val => (
                                                <button
                                                    key={val}
                                                    onClick={() => setCashReceived(val.toFixed(2))}
                                                    className="flex-1 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white rounded-xl text-xs font-bold transition-all"
                                                >
                                                    {val === sentTotal ? 'Exacto' : `S/ ${val}`}
                                                </button>
                                            ))}
                                        </div>

                                        {/* Vuelto calculado */}
                                        {(() => {
                                            const received = parseFloat(cashReceived) || 0;
                                            const change = received - sentTotal;
                                            if (received < sentTotal) {
                                                return (
                                                    <div className="bg-red-900/40 border border-red-700 rounded-xl p-3 text-center text-red-300 text-sm font-bold">
                                                        ⚠️ Faltan S/ {(sentTotal - received).toFixed(2)}
                                                    </div>
                                                );
                                            }
                                            return (
                                                <div className="bg-emerald-950/60 border border-emerald-500/40 rounded-xl p-3 text-center">
                                                    <span className="text-xs text-emerald-400 font-semibold block uppercase">Vuelto a Entregar</span>
                                                    <span className="text-2xl font-black text-emerald-300">S/ {change.toFixed(2)}</span>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                )}

                                {/* Si eligió TARJETA o YAPE/PLIN: N° Operación (Opcional) */}
                                {(selectedPaymentMethod === 'Tarjeta' || selectedPaymentMethod === 'Yape / Plin') && (
                                    <div className="space-y-4">
                                        <div>
                                            <label className="text-gray-300 text-sm font-semibold block mb-2">N° de Operación / Referencia (Opcional)</label>
                                            <input
                                                type="text"
                                                value={paymentRef}
                                                onChange={(e) => setPaymentRef(e.target.value)}
                                                placeholder="Ej. 123456"
                                                className="w-full bg-gray-800 text-white text-lg font-bold text-center rounded-2xl p-3 border border-gray-700 focus:border-brand-500 outline-none"
                                            />
                                        </div>
                                    </div>
                                )}

                                <button
                                    onClick={handleConfirmPayment}
                                    disabled={sending || (selectedPaymentMethod === 'Efectivo' && (parseFloat(cashReceived) || 0) < sentTotal)}
                                    className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-800 disabled:text-gray-500 text-white rounded-2xl text-lg font-black tracking-wide shadow-lg transition-all active:scale-95"
                                >
                                    {sending ? '⏳ Registrando...' : `✅ Confirmar Pago Recibido`}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}


            {/* Free Table Confirmation Modal */}
            {showFreeModal && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl p-6 w-full max-w-sm space-y-4">
                        <h3 className="text-xl font-bold text-white text-center">🗑️ Liberar Mesa</h3>

                        {(order?.items?.length > 0 || cart.length > 0) ? (
                            <div className="space-y-3">
                                <div className="bg-red-900/40 border border-red-700 rounded-xl p-4">
                                    <p className="text-red-300 font-bold text-center">⚠️ ¡ATENCIÓN!</p>
                                    <p className="text-red-200 text-sm mt-2 text-center">
                                        La mesa tiene {(order?.items?.length || 0)} consumo(s) registrado(s)
                                        {cart.length > 0 && ` y ${cart.length} ítem(s) en carrito`}.
                                    </p>
                                    <p className="text-red-300 text-sm mt-2 text-center font-semibold">
                                        Al liberar se cancelará TODO el pedido SIN cobrar.
                                    </p>
                                </div>
                                {mergedSecondaries.length > 0 && (
                                    <div className="bg-yellow-900/30 border border-yellow-700 rounded-xl p-3">
                                        <p className="text-yellow-200 text-sm text-center">
                                            ⛓ También se liberarán {mergedSecondaries.length} mesa(s) unida(s).
                                        </p>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <p className="text-gray-300 text-center">¿Deseas liberar esta mesa? No hay consumos pendientes.</p>
                        )}

                        <div className="grid grid-cols-2 gap-3 pt-2">
                            <button
                                onClick={() => setShowFreeModal(false)}
                                className="btn-secondary py-3"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={confirmFreeTable}
                                className="py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold transition-colors"
                            >
                                Sí, Liberar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Producto (Ergonómico / Dedo Gordo) */}
            {selectedProduct && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[60] flex flex-col justify-end sm:justify-center items-center sm:p-4 animate-[fadeIn_0.2s_ease-out]">
                    <div className="bg-gray-900 border border-brand-500/30 rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 w-full max-w-lg space-y-6 transform animate-[slideUp_0.3s_ease-out]">
                        <div className="flex justify-between items-start">
                            <div>
                                <h2 className="text-2xl font-black text-white leading-tight">{selectedProduct.name}</h2>
                                <p className="text-brand-400 font-bold text-lg mt-1">S/ {Number(selectedProduct.price).toFixed(2)}</p>
                            </div>
                            <button onClick={() => setSelectedProduct(null)} className="w-12 h-12 bg-gray-800 text-gray-400 hover:text-white rounded-2xl text-2xl font-bold flex items-center justify-center">
                                ×
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="text-gray-400 text-sm font-semibold mb-2 block">Términos o Preferencias (Opcional)</label>
                                {/* Conmutador dedicado Para Llevar */}
                                <div className="mb-3 flex items-center justify-between bg-gray-800/80 p-2.5 px-4 rounded-2xl border border-gray-700/80">
                                    <span className="text-xs sm:text-sm font-bold text-gray-200 flex items-center gap-2">
                                        🛍️ ¿Es pedido para llevar?
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => setIsTakeout(prev => !prev)}
                                        className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-black transition-all border active:scale-95 flex items-center gap-1.5 ${
                                            isTakeout
                                                ? 'bg-amber-500 border-amber-400 text-gray-950 shadow-md'
                                                : 'bg-gray-800 border-gray-600 text-gray-400 hover:bg-gray-700 hover:text-white'
                                        }`}
                                    >
                                        {isTakeout ? '✓ SÍ, PARA LLEVAR' : 'NO (MESA)'}
                                    </button>
                                </div>

                                <textarea
                                    value={modalNotes}
                                    onChange={(e) => setModalNotes(e.target.value)}
                                    placeholder="Ej. Sin cebolla, término medio..."
                                    className="w-full bg-gray-800/80 text-white min-h-[80px] rounded-2xl p-4 border border-gray-700 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 text-lg outline-none resize-none"
                                />
                                {/* Quick Modifier Buttons */}
                                {(() => {
                                    const rawSuggestions = selectedProduct?.suggestions || ''
                                    const suggestionList = rawSuggestions
                                        .split(',')
                                        .map(s => s.trim())
                                        .filter(Boolean)

                                    if (suggestionList.length === 0 && (!creams || creams.length === 0)) return null

                                    return (
                                        <div className="flex flex-wrap gap-2 mt-3">
                                            {suggestionList.map(mod => (
                                                <button
                                                    key={mod}
                                                    type="button"
                                                    onClick={() => handleAddSuggestion(mod)}
                                                    className="px-3.5 py-1.5 bg-gray-800 border border-gray-700 rounded-xl text-xs sm:text-sm font-medium hover:bg-brand-600 hover:border-brand-500 hover:text-white transition-colors active:scale-95"
                                                >
                                                    {mod}
                                                </button>
                                            ))}

                                            {/* Botón dentro de sugerencias para abrir/cerrar la lista de cremas */}
                                            {creams && creams.length > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={() => setShowCreamPicker(prev => !prev)}
                                                    className={`px-3.5 py-1.5 border rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-1.5 active:scale-95 ${
                                                        showCreamPicker || selectedCreams.length > 0
                                                            ? 'bg-amber-500/20 border-amber-500 text-amber-300 shadow-sm'
                                                            : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
                                                    }`}
                                                >
                                                    <span>🧴 Cremas</span>
                                                    {selectedCreams.length > 0 && (
                                                        <span className="bg-amber-500 text-gray-950 font-black text-[10px] px-1.5 py-0.2 rounded-full">
                                                            {selectedCreams.length}
                                                        </span>
                                                    )}
                                                    <span className="text-[10px] opacity-75">{showCreamPicker ? '▲' : '▼'}</span>
                                                </button>
                                            )}
                                        </div>
                                    )
                                })()}

                                {/* Selección Rápida de Cremas (Desplegable) */}
                                {creams && creams.length > 0 && showCreamPicker && (
                                    <div className="mt-3 pt-3 border-t border-gray-800/80 animate-[fadeIn_0.15s_ease-out]">
                                        <label className="text-gray-400 text-xs font-bold uppercase tracking-wider block mb-2">
                                            🧴 Seleccionar Cremas:
                                        </label>
                                        <div className="flex flex-wrap gap-2">
                                            {creams.map(cream => {
                                                const abbr = cream.abbreviation
                                                const isSelected = selectedCreams.includes(abbr)

                                                return (
                                                    <button
                                                        key={cream.id}
                                                        type="button"
                                                        onClick={() => handleToggleCream(abbr)}
                                                        className={`px-3 py-1.5 rounded-xl text-xs sm:text-sm font-bold border transition-all active:scale-95 ${
                                                            isSelected
                                                                ? 'bg-emerald-600 border-emerald-500 text-white shadow-md'
                                                                : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700 hover:border-brand-500'
                                                        }`}
                                                    >
                                                        {cream.name}
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="flex bg-gray-800 p-2 rounded-2xl items-center justify-between">
                                <button
                                    onClick={() => setModalQty(q => Math.max(1, q - 1))}
                                    className="w-16 h-16 bg-gray-700 hover:bg-gray-600 text-brand-300 rounded-xl text-4xl font-black flex items-center justify-center transition-all active:scale-90"
                                >
                                    −
                                </button>
                                <span className="text-3xl font-black text-white">{modalQty}</span>
                                <button
                                    onClick={() => setModalQty(q => q + 1)}
                                    className="w-16 h-16 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-4xl font-black flex items-center justify-center transition-all active:scale-90"
                                >
                                    +
                                </button>
                            </div>
                        </div>

                        <button
                            onClick={confirmAddToCart}
                            className="w-full py-5 bg-brand-600 hover:bg-brand-500 text-white rounded-2xl text-xl font-black tracking-wide shadow-lg transition-transform active:scale-95"
                        >
                            AGREGAR S/ {(Number(selectedProduct.price) * modalQty).toFixed(2)}
                        </button>
                    </div>
                </div>
            )}

            {error && (
                <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-xl px-4 py-2 text-sm">
                    {error}
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                {/* ── Catálogo de productos (3 cols) ───────────────────── */}
                <div className="lg:col-span-3 lg:col-start-1 card p-4 space-y-4 flex flex-col h-[65vh] lg:h-auto">
                    <h2 className="font-semibold text-gray-200 text-lg hidden lg:block">📋 Carta</h2>

                    {/* Buscador ultrarrápido */}
                    <input
                        type="text"
                        placeholder="🔍 Buscar plato por nombre o código..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full bg-gray-900 border border-gray-700 text-white text-lg rounded-xl px-5 py-4 min-h-[44px] focus:ring-2 focus:ring-brand-500 outline-none"
                    />

                    {/* Category filter tabs */}
                    {categories.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            <button
                                onClick={() => setActiveCatId(null)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200
                                    ${activeCatId === null
                                        ? 'bg-brand-600 text-white shadow-lg'
                                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700'}`}>
                                Todos
                            </button>
                            {categories.map(cat => (
                                <button
                                    key={cat.id}
                                    onClick={() => setActiveCatId(activeCatId === cat.id ? null : cat.id)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 flex items-center gap-1.5
                                        ${activeCatId === cat.id
                                            ? 'text-white shadow-lg'
                                            : 'bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700'}`}
                                    style={activeCatId === cat.id ? { backgroundColor: cat.color } : {}}>
                                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }} />
                                    {cat.name}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Product grid */}
                    <div className="flex-1 overflow-y-auto min-h-0 pr-1">
                        {filteredProducts.length === 0 ? (
                            <div className="py-8 text-center">
                                <p className="text-gray-500 text-sm">
                                    {products.length === 0
                                        ? 'Sin productos. Agrégalos desde 📋 Carta en el menú.'
                                        : 'No hay productos en esta categoría.'}
                                </p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {filteredProducts.map(p => {
                                    const catColor = categories.find(c => c.id === p.category_id)?.color ?? '#64748B'
                                    const inCart = cart.find(i => i.product_id === p.id)
                                    return (
                                        <button
                                            key={p.id}
                                            onClick={() => openProductModal(p)}
                                            disabled={!p.is_available}
                                            className={`relative card p-3 text-left transition-all duration-150
                                                hover:border-brand-500/60 hover:scale-[1.02] active:scale-95
                                                disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100
                                                ${inCart ? 'border-brand-500/50 bg-brand-950/30' : ''}`}
                                        >
                                            {/* Category dot */}
                                            <div className="flex items-center gap-1.5 mb-1">
                                                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: catColor }} />
                                                <span className="text-[10px] text-gray-500 truncate">
                                                    {categories.find(c => c.id === p.category_id)?.name ?? ''}
                                                </span>
                                            </div>
                                            <p className="font-medium text-white text-sm leading-tight">{p.name}</p>
                                            <p className="text-brand-400 font-bold text-sm mt-1">S/ {Number(p.price).toFixed(2)}</p>
                                            {!p.is_available && (
                                                <span className="absolute top-2 right-2 text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded">
                                                    Agotado
                                                </span>
                                            )}
                                            {inCart && (
                                                <span className="absolute -top-1.5 -right-1.5 bg-brand-600 text-white text-xs font-bold
                                                    w-5 h-5 rounded-full flex items-center justify-center shadow-lg">
                                                    {inCart.quantity}
                                                </span>
                                            )}
                                        </button>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Panel derecho (2 cols) ───────────────────────────── */}
                <div className="lg:col-span-2 flex flex-col gap-4">
                    {/* Carrito (ítems nuevos por enviar) */}
                    <div className="card p-4 space-y-3">
                        <h2 className="font-semibold text-gray-200 flex items-center gap-2">
                            🛒 Nuevos ítems
                            {cart.length > 0 && (
                                <span className="bg-brand-600 text-white text-xs font-bold
                                 rounded-full px-2 py-0.5">{cart.length}</span>
                            )}
                        </h2>

                        {cart.length === 0 ? (
                            <p className="text-gray-500 text-sm py-4 text-center">
                                Toca un producto de la carta para agregarlo
                            </p>
                        ) : (
                            <>
                                <ul className="space-y-2">
                                    {cart.map(item => (
                                        <li key={item.product_id}
                                            className="flex flex-col gap-2 bg-gray-800/50 rounded-xl p-2.5">
                                            {/* Top Row: Info and Controls */}
                                            <div className="flex items-center gap-2">
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-white truncate">{item._product.name}</p>
                                                    <p className="text-xs text-gray-400">
                                                        S/ {Number(item._product.price).toFixed(2)} c/u
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <button onClick={() => updateQty(item.product_id, item.quantity - 1)}
                                                        className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gray-700 hover:bg-gray-600 text-white text-xl font-bold flex items-center justify-center transition-colors shadow-sm min-w-[44px] min-h-[44px] shrink-0">
                                                        −
                                                    </button>
                                                    <span className="w-6 text-center text-white font-bold text-sm sm:text-base shrink-0">{item.quantity}</span>
                                                    <button onClick={() => updateQty(item.product_id, item.quantity + 1)}
                                                        className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-brand-600/50 hover:bg-brand-500/50 border border-brand-500/50 text-brand-100 text-xl font-bold flex items-center justify-center transition-colors shadow-sm min-w-[44px] min-h-[44px] shrink-0">
                                                        +
                                                    </button>
                                                </div>
                                                <div className="flex flex-col items-end">
                                                    <span className="text-sm font-semibold text-brand-400 w-16 text-right whitespace-nowrap">
                                                        S/ {(Number(item._product.price) * item.quantity).toFixed(2)}
                                                    </span>
                                                    {item.notes && (
                                                        <span className="text-[10px] text-gray-400 truncate max-w-[80px]">
                                                            📝 {item.notes}
                                                        </span>
                                                    )}
                                                </div>
                                                <button onClick={() => removeFromCart(item.product_id)}
                                                    className="w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center text-red-500 hover:text-white hover:bg-red-500 rounded-xl transition-colors shrink-0 min-w-[44px] min-h-[44px]">
                                                    <span className="text-xl">🗑</span>
                                                </button>
                                            </div>
                                        </li>
                                    ))}
                                </ul>

                                {/* Cart subtotal */}
                                <div className="flex justify-between text-sm pt-1 border-t border-gray-800">
                                    <span className="text-gray-400">Subtotal nuevos</span>
                                    <span className="text-white font-semibold">S/ {cartTotal.toFixed(2)}</span>
                                </div>
                            </>
                        )}

                        <button
                            onClick={handleSendToKitchen}
                            disabled={!cart.length || sending}
                            className="w-full btn-primary min-h-[64px] rounded-2xl text-lg font-black tracking-wider uppercase shadow-[0_0_20px_rgba(234,88,12,0.3)] active:scale-95"
                        >
                            {sending ? '⏳ Enviando…' : '🍳 Enviar a Cocina'}
                        </button>
                    </div>

                    {/* Ítems ya enviados */}
                    {sentItems.length > 0 && (
                        <div className="card p-4 space-y-3">
                            <h2 className="font-semibold text-gray-200">📄 Cuenta actual</h2>
                            <ul className="space-y-2">
                                {sentItems.map(item => {
                                    const isTakeoutItem = item.notes?.includes('[PARA LLEVAR]') || item.notes?.includes('[LLEVAR]')
                                    const cleanNotes = (item.notes || '').replace(/\[PARA LLEVAR\]|\[LLEVAR\]/g, '').trim()

                                    return (
                                        <li key={item.id} className="p-2.5 bg-gray-800/40 rounded-2xl border border-gray-800 space-y-1.5">
                                            <div className="flex justify-between items-start">
                                                <div className="space-y-1 flex-1 pr-2">
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        <span className="font-bold text-white text-sm">
                                                            {item.quantity}× {getProductName(item.product_id)}
                                                        </span>
                                                        {isTakeoutItem && (
                                                            <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] px-1.5 py-0.2 rounded font-black">
                                                                🛍️ Para Llevar
                                                            </span>
                                                        )}
                                                    </div>

                                                    {/* Status Badges en Vivo para el Mozo */}
                                                    <div className="flex items-center gap-2">
                                                        {item.status === 'PENDING' && (
                                                            <span className="text-[10px] text-red-400 font-extrabold bg-red-950/80 border border-red-500/40 px-2 py-0.5 rounded-full flex items-center gap-1">
                                                                🔴 ESPERA (En cola)
                                                            </span>
                                                        )}
                                                        {item.status === 'PREPARING' && (
                                                            <span className="text-[10px] text-yellow-300 font-extrabold bg-yellow-950/80 border border-yellow-500/40 px-2 py-0.5 rounded-full flex items-center gap-1">
                                                                🟡 EN PREPARACIÓN
                                                            </span>
                                                        )}
                                                        {item.status === 'COMPLETED' && (
                                                            <span className="text-[10px] text-emerald-300 font-extrabold bg-emerald-950/80 border border-emerald-500/40 px-2 py-0.5 rounded-full flex items-center gap-1">
                                                                🟢 LISTO PARA RECOGER
                                                            </span>
                                                        )}
                                                        {item.status === 'DELIVERED' && (
                                                            <span className="text-[10px] text-gray-400 font-bold bg-gray-800 px-2 py-0.5 rounded-full">
                                                                ✓ Entregado
                                                            </span>
                                                        )}
                                                    </div>

                                                    {cleanNotes && (
                                                        <p className="text-xs text-yellow-300/90 font-medium italic">
                                                            📝 {cleanNotes}
                                                        </p>
                                                    )}
                                                </div>

                                                <div className="flex items-center gap-2 shrink-0">
                                                    <span className="text-gray-300 font-bold text-sm">
                                                        S/ {(item.price_at_time * item.quantity).toFixed(2)}
                                                    </span>

                                                    {/* Botón Entregar */}
                                                    {item.status === 'COMPLETED' && (
                                                        <button
                                                            onClick={() => updateItemStatus(item.id, 'DELIVERED')}
                                                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all active:scale-95 shadow-sm"
                                                        >
                                                            Entregar
                                                        </button>
                                                    )}

                                                    {/* Acciones: Editar y Eliminar (disponibles en PENDING y PREPARING) */}
                                                    {(item.status === 'PENDING' || item.status === 'PREPARING') && (
                                                        <div className="flex gap-1">
                                                            <button
                                                                onClick={() => openEditSentItemModal(item)}
                                                                className="p-1.5 px-2 bg-gray-800 hover:bg-brand-600 border border-gray-700 text-gray-300 hover:text-white rounded-xl text-xs font-bold transition-all active:scale-95"
                                                                title="Editar observaciones / cremas / para llevar"
                                                            >
                                                                ✏️
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteSentItem(item)}
                                                                className="p-1.5 px-2 bg-gray-800 hover:bg-red-600 border border-gray-700 text-gray-300 hover:text-white rounded-xl text-xs font-bold transition-all active:scale-95"
                                                                title="Cancelar / Eliminar plato"
                                                            >
                                                                🗑️
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </li>
                                    )
                                })}
                            </ul>
                            <hr className="border-gray-800" />
                            <div className="flex justify-between font-bold text-white text-lg">
                                <span>Total</span>
                                <span className="text-brand-400">S/ {sentTotal.toFixed(2)}</span>
                            </div>
                        </div>
                    )}
                </div>
            </div >
        </div >
    )
}
