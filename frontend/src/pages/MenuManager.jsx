import { useState, useEffect, useCallback } from 'react'
import {
    getCategories, createCategory, updateCategory, deleteCategory,
    getProducts, createProduct, updateProduct, deleteProduct, toggleProductAvailability,
    getCreams, createCream, updateCream, deleteCream
} from '../api/client'

/* ═══════════════════════════════════════════════════════════════════════════════
   COLOR PRESETS for categories
   ═══════════════════════════════════════════════════════════════════════════════ */
const COLOR_PRESETS = [
    '#6366F1', '#8B5CF6', '#A855F7', '#EC4899',
    '#EF4444', '#F97316', '#EAB308', '#22C55E',
    '#14B8A6', '#06B6D4', '#3B82F6', '#64748B',
]

/* ═══════════════════════════════════════════════════════════════════════════════
   MODAL OVERLAY (reusable)
   ═══════════════════════════════════════════════════════════════════════════════ */
function Modal({ open, onClose, title, children }) {
    if (!open) return null
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={onClose}>
            {/* backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            {/* modal */}
            <div className="relative bg-gray-900 border border-gray-700/60 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
                onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
                    <h2 className="text-lg font-bold text-white">{title}</h2>
                    <button onClick={onClose}
                        className="text-gray-400 hover:text-white transition-colors text-xl leading-none">✕</button>
                </div>
                <div className="p-6">
                    {children}
                </div>
            </div>
        </div>
    )
}

/* ═══════════════════════════════════════════════════════════════════════════════
   CREAM FORM
   ═══════════════════════════════════════════════════════════════════════════════ */
function CreamForm({ initial, onSave, onCancel, saving }) {
    const [name, setName] = useState(initial?.name ?? '')
    const [abbreviation, setAbbreviation] = useState(initial?.abbreviation ?? '')

    const handleSubmit = (e) => {
        e.preventDefault()
        onSave({ name, abbreviation })
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Nombre Completo de la Crema / Salsa</label>
                <input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    required
                    placeholder="Ej: Mayonesa, Ketchup, Ají de la Casa..."
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-600 transition"
                />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Diminutivo / Abreviatura (para Cocina)</label>
                <input
                    value={abbreviation}
                    onChange={e => setAbbreviation(e.target.value)}
                    required
                    placeholder="Ej: /my, /kt, /aj, /mz..."
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-600 transition font-mono"
                />
                <p className="text-xs text-gray-400 mt-1">Este diminutivo es el que aparecerá en la pantalla de cocina para ahorrar espacio (ej. /my para Mayonesa).</p>
            </div>
            <div className="flex gap-3 pt-2">
                <button type="submit" disabled={saving || !name.trim() || !abbreviation.trim()} className="btn-primary flex-1">
                    {saving ? '⏳ Guardando…' : '💾 Guardar'}
                </button>
                <button type="button" onClick={onCancel} className="btn-secondary">Cancelar</button>
            </div>
        </form>
    )
}

/* ═══════════════════════════════════════════════════════════════════════════════
   CATEGORY FORM
   ═══════════════════════════════════════════════════════════════════════════════ */
function CategoryForm({ initial, onSave, onCancel, saving }) {
    const [name, setName] = useState(initial?.name ?? '')
    const [color, setColor] = useState(initial?.color ?? '#6366F1')
    const [sortOrder, setSortOrder] = useState(initial?.sort_order ?? 0)
    const [destination, setDestination] = useState(initial?.destination ?? 'kitchen')

    const handleSubmit = (e) => {
        e.preventDefault()
        onSave({ name, color, sort_order: sortOrder, destination })
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-5">
            <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Nombre</label>
                <input value={name} onChange={e => setName(e.target.value)}
                    required maxLength={100} placeholder="Ej: Entradas, Fondos, Bebidas…"
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-600 transition" />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Color</label>
                <div className="flex flex-wrap gap-2">
                    {COLOR_PRESETS.map(c => (
                        <button key={c} type="button" onClick={() => setColor(c)}
                            className={`w-8 h-8 rounded-lg transition-all duration-150 ${color === c ? 'ring-2 ring-white scale-110' : 'hover:scale-105 opacity-70 hover:opacity-100'}`}
                            style={{ backgroundColor: c }} />
                    ))}
                </div>
            </div>
            <div className="flex gap-4">
                <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-300 mb-1.5">Orden</label>
                    <input type="number" value={sortOrder} onChange={e => setSortOrder(+e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-brand-600 transition" />
                </div>
                <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-300 mb-1.5">Destino de Pedido</label>
                    <select value={destination} onChange={e => setDestination(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-brand-600 transition">
                        <option value="kitchen">🍳 Cocina</option>
                        <option value="bar">🍹 Bar</option>
                    </select>
                </div>
            </div>
            <div className="flex gap-3 pt-2">
                <button type="submit" disabled={saving || !name.trim()} className="btn-primary flex-1">
                    {saving ? '⏳ Guardando…' : '💾 Guardar'}
                </button>
                <button type="button" onClick={onCancel} className="btn-secondary">Cancelar</button>
            </div>
        </form>
    )
}

/* ═══════════════════════════════════════════════════════════════════════════════
   PRODUCT FORM
   ═══════════════════════════════════════════════════════════════════════════════ */
function ProductForm({ initial, categories, onSave, onCancel, saving }) {
    const [name, setName] = useState(initial?.name ?? '')
    const [description, setDescription] = useState(initial?.description ?? '')
    const [suggestions, setSuggestions] = useState(initial?.suggestions ?? '')
    const [price, setPrice] = useState(initial?.price ?? '')
    const [categoryId, setCategoryId] = useState(initial?.category_id ?? '')
    const [isAvailable, setIsAvailable] = useState(initial?.is_available ?? true)

    const handleSubmit = (e) => {
        e.preventDefault()
        onSave({
            name,
            description: description || null,
            suggestions: suggestions || null,
            price: parseFloat(price),
            category_id: categoryId ? parseInt(categoryId) : null,
            is_available: isAvailable,
        })
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-5">
            <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Nombre del plato</label>
                <input value={name} onChange={e => setName(e.target.value)}
                    required maxLength={150} placeholder="Ej: Lomo Saltado, Ceviche Mixto…"
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-600 transition" />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Descripción (opcional)</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)}
                    rows={2} placeholder="Descripción breve…"
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-600 transition resize-none" />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                    💡 Sugerencias u opciones rápidas (separadas por comas)
                </label>
                <input value={suggestions} onChange={e => setSuggestions(e.target.value)}
                    placeholder="Ej: Sin cebolla, Poco Ají, Bien Cocido (o para bebida: Helada, Sin Helar)"
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-600 transition" />
                <p className="text-xs text-gray-400 mt-1">
                    Botones de un solo toque que le aparecerán al mozo para este producto específico.
                </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1.5">Precio (S/)</label>
                    <input type="number" step="0.01" min="0" value={price}
                        onChange={e => setPrice(e.target.value)}
                        required placeholder="0.00"
                        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-600 transition" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1.5">Categoría</label>
                    <select value={categoryId} onChange={e => setCategoryId(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-brand-600 transition">
                        <option value="">— Sin categoría —</option>
                        {categories.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                    </select>
                </div>
            </div>
            <div className="flex items-center gap-3">
                <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={isAvailable}
                        onChange={e => setIsAvailable(e.target.checked)}
                        className="sr-only peer" />
                    <div className="w-11 h-6 bg-gray-700 rounded-full peer 
                        peer-checked:after:translate-x-full peer-checked:bg-brand-600
                        after:content-[''] after:absolute after:top-[2px] after:left-[2px]
                        after:bg-white after:rounded-full after:h-5 after:w-5
                        after:transition-all" />
                </label>
                <span className="text-sm text-gray-300">Disponible</span>
            </div>
            <div className="flex gap-3 pt-2">
                <button type="submit" disabled={saving || !name.trim() || !price} className="btn-primary flex-1">
                    {saving ? '⏳ Guardando…' : '💾 Guardar'}
                </button>
                <button type="button" onClick={onCancel} className="btn-secondary">Cancelar</button>
            </div>
        </form>
    )
}


/* ═══════════════════════════════════════════════════════════════════════════════
   MAIN PAGE – MENU MANAGER
   ═══════════════════════════════════════════════════════════════════════════════ */
export default function MenuManager() {
    const [categories, setCategories] = useState([])
    const [products, setProducts] = useState([])
    const [creams, setCreams] = useState([])
    const [activeCatId, setActiveCatId] = useState(null) // null = all
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    // Modal state
    const [catModal, setCatModal] = useState({ open: false, editing: null })
    const [prodModal, setProdModal] = useState({ open: false, editing: null })
    const [showCreamManager, setShowCreamManager] = useState(false)
    const [creamEditModal, setCreamEditModal] = useState({ open: false, editing: null })

    // ── Fetch ────────────────────────────────────────────────────────────────
    const fetchCategories = useCallback(async () => {
        try {
            const { data } = await getCategories()
            setCategories(data)
        } catch (err) { console.error('Error fetching categories', err) }
    }, [])

    const fetchProducts = useCallback(async () => {
        try {
            const { data } = await getProducts(activeCatId)
            setProducts(data)
        } catch (err) { console.error('Error fetching products', err) }
    }, [activeCatId])

    const fetchCreams = useCallback(async () => {
        try {
            const { data } = await getCreams()
            setCreams(data)
        } catch (err) { console.error('Error fetching creams', err) }
    }, [])

    useEffect(() => {
        Promise.all([fetchCategories(), fetchProducts(), fetchCreams()]).finally(() => setLoading(false))
    }, [])

    useEffect(() => { fetchProducts() }, [activeCatId])

    // ── Cream CRUD ───────────────────────────────────────────────────────────
    const handleSaveCream = async (data) => {
        setSaving(true)
        try {
            if (creamEditModal.editing) {
                await updateCream(creamEditModal.editing.id, data)
            } else {
                await createCream(data)
            }
            setCreamEditModal({ open: false, editing: null })
            await fetchCreams()
        } catch (err) {
            alert('Error: ' + (err.response?.data?.detail ?? err.message))
        } finally { setSaving(false) }
    }

    const handleDeleteCream = async (creamItem) => {
        if (!confirm(`¿Eliminar la crema "${creamItem.name}" (${creamItem.abbreviation})?`)) return
        try {
            await deleteCream(creamItem.id)
            await fetchCreams()
        } catch (err) {
            alert('Error: ' + (err.response?.data?.detail ?? err.message))
        }
    }

    // ── Category CRUD ────────────────────────────────────────────────────────
    const handleSaveCategory = async (data) => {
        setSaving(true)
        try {
            if (catModal.editing) {
                await updateCategory(catModal.editing.id, data)
            } else {
                await createCategory(data)
            }
            setCatModal({ open: false, editing: null })
            await fetchCategories()
            await fetchProducts()
        } catch (err) {
            alert('Error: ' + (err.response?.data?.detail ?? err.message))
        } finally { setSaving(false) }
    }

    const handleDeleteCategory = async (cat) => {
        if (!confirm(`¿Eliminar la categoría "${cat.name}"? Los productos quedarán sin categoría.`)) return
        try {
            await deleteCategory(cat.id)
            if (activeCatId === cat.id) setActiveCatId(null)
            await fetchCategories()
            await fetchProducts()
        } catch (err) {
            alert('Error: ' + (err.response?.data?.detail ?? err.message))
        }
    }

    // ── Product CRUD ─────────────────────────────────────────────────────────
    const handleSaveProduct = async (data) => {
        setSaving(true)
        try {
            if (prodModal.editing) {
                await updateProduct(prodModal.editing.id, data)
            } else {
                await createProduct(data)
            }
            setProdModal({ open: false, editing: null })
            await fetchProducts()
        } catch (err) {
            alert('Error: ' + (err.response?.data?.detail ?? err.message))
        } finally { setSaving(false) }
    }

    const handleDeleteProduct = async (prod) => {
        if (!confirm(`¿Eliminar "${prod.name}" de la carta?`)) return
        try {
            await deleteProduct(prod.id)
            await fetchProducts()
        } catch (err) {
            alert('Error: ' + (err.response?.data?.detail ?? err.message))
        }
    }

    const handleToggleAvailability = async (prod) => {
        try {
            await toggleProductAvailability(prod.id)
            await fetchProducts()
        } catch (err) {
            alert('Error: ' + (err.response?.data?.detail ?? err.message))
        }
    }

    // ── Render ────────────────────────────────────────────────────────────────
    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-brand-500"></div>
            </div>
        )
    }

    const getCategoryColor = (catId) => {
        const cat = categories.find(c => c.id === catId)
        return cat?.color ?? '#64748B'
    }

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            {/* ── Header ──────────────────────────────────────────── */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">📋 Gestión de Carta</h1>
                    <p className="text-gray-400 text-sm mt-1">Administra las categorías y productos de tu menú</p>
                </div>
                <div className="flex flex-wrap gap-2.5">
                    <button onClick={() => setShowCreamManager(true)}
                        className="btn-secondary text-sm flex items-center gap-1.5">
                        🧴 Cremas ({creams.length})
                    </button>
                    <button onClick={() => setCatModal({ open: true, editing: null })}
                        className="btn-secondary text-sm">
                        ➕ Categoría
                    </button>
                    <button onClick={() => setProdModal({ open: true, editing: null })}
                        className="btn-primary text-sm">
                        ➕ Nuevo Plato
                    </button>
                </div>
            </div>

            {/* ── Category Tabs ───────────────────────────────────── */}
            <div className="flex flex-wrap gap-2">
                <button
                    onClick={() => setActiveCatId(null)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200
                        ${activeCatId === null
                            ? 'bg-brand-600 text-white shadow-lg shadow-brand-900/40'
                            : 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700'}`}>
                    Todos ({products.length})
                </button>
                {categories.map(cat => (
                    <div key={cat.id} className="group relative">
                        <button
                            onClick={() => setActiveCatId(activeCatId === cat.id ? null : cat.id)}
                            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 flex items-center gap-2
                                ${activeCatId === cat.id
                                    ? 'text-white shadow-lg scale-105'
                                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700'}`}
                            style={activeCatId === cat.id ? { backgroundColor: cat.color, boxShadow: `0 4px 14px ${cat.color}40` } : {}}>
                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cat.color }} />
                            {cat.name}
                        </button>
                        {/* Edit/Delete on hover */}
                        <div className="absolute -top-2 -right-2 hidden group-hover:flex gap-1 z-10">
                            <button onClick={() => setCatModal({ open: true, editing: cat })}
                                className="w-6 h-6 flex items-center justify-center rounded-full bg-gray-700 hover:bg-brand-600 text-xs text-white transition shadow">
                                ✏️
                            </button>
                            <button onClick={() => handleDeleteCategory(cat)}
                                className="w-6 h-6 flex items-center justify-center rounded-full bg-gray-700 hover:bg-red-600 text-xs text-white transition shadow">
                                🗑️
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {/* ── Products Grid ───────────────────────────────────── */}
            {products.length === 0 ? (
                <div className="card p-12 text-center">
                    <p className="text-gray-400 text-lg">No hay productos aún</p>
                    <p className="text-gray-500 text-sm mt-1">Agrega tu primer plato con el botón "➕ Nuevo Plato"</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {products.map(prod => (
                        <div key={prod.id}
                            className={`card p-5 flex flex-col gap-3 transition-all duration-200 hover:border-gray-600
                                ${!prod.is_available ? 'opacity-50' : ''}`}>
                            {/* Top row: category badge + availability toggle */}
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-medium px-2.5 py-1 rounded-lg"
                                    style={{
                                        backgroundColor: getCategoryColor(prod.category_id) + '20',
                                        color: getCategoryColor(prod.category_id),
                                        border: `1px solid ${getCategoryColor(prod.category_id)}50`,
                                    }}>
                                    {categories.find(c => c.id === prod.category_id)?.name ?? 'Sin categoría'}
                                </span>
                                <button onClick={() => handleToggleAvailability(prod)}
                                    title={prod.is_available ? 'Marcar como agotado' : 'Marcar como disponible'}
                                    className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors
                                        ${prod.is_available
                                            ? 'bg-green-500/20 text-green-400 border border-green-500/50 hover:bg-green-500/30'
                                            : 'bg-red-500/20 text-red-400 border border-red-500/50 hover:bg-red-500/30'}`}>
                                    {prod.is_available ? '✅ Disponible' : '❌ Agotado'}
                                </button>
                            </div>

                            {/* Product info */}
                            <div className="flex-1">
                                <h3 className="text-white font-semibold text-lg leading-tight">{prod.name}</h3>
                                {prod.description && (
                                    <p className="text-gray-400 text-sm mt-1 line-clamp-2">{prod.description}</p>
                                )}
                                {prod.suggestions && (
                                    <p className="text-xs text-brand-300 font-medium mt-1">
                                        💡 Sugerencias: <span className="text-gray-300">{prod.suggestions}</span>
                                    </p>
                                )}
                            </div>

                            {/* Price */}
                            <div className="flex items-end justify-between">
                                <span className="text-2xl font-bold text-brand-400">
                                    S/ {parseFloat(prod.price).toFixed(2)}
                                </span>
                                <div className="flex gap-2">
                                    <button onClick={() => setProdModal({ open: true, editing: prod })}
                                        className="w-9 h-9 flex items-center justify-center rounded-xl bg-gray-800 hover:bg-brand-600 text-sm transition-colors border border-gray-700 hover:border-brand-500"
                                        title="Editar">
                                        ✏️
                                    </button>
                                    <button onClick={() => handleDeleteProduct(prod)}
                                        className="w-9 h-9 flex items-center justify-center rounded-xl bg-gray-800 hover:bg-red-600 text-sm transition-colors border border-gray-700 hover:border-red-500"
                                        title="Eliminar">
                                        🗑️
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* ── Category Modal ──────────────────────────────────── */}
            <Modal
                open={catModal.open}
                onClose={() => setCatModal({ open: false, editing: null })}
                title={catModal.editing ? '✏️ Editar Categoría' : '➕ Nueva Categoría'}>
                <CategoryForm
                    initial={catModal.editing}
                    onSave={handleSaveCategory}
                    onCancel={() => setCatModal({ open: false, editing: null })}
                    saving={saving} />
            </Modal>

            {/* ── Product Modal ───────────────────────────────────── */}
            <Modal
                open={prodModal.open}
                onClose={() => setProdModal({ open: false, editing: null })}
                title={prodModal.editing ? '✏️ Editar Producto' : '➕ Nuevo Producto'}>
                <ProductForm
                    initial={prodModal.editing}
                    categories={categories}
                    onSave={handleSaveProduct}
                    onCancel={() => setProdModal({ open: false, editing: null })}
                    saving={saving} />
            </Modal>

            {/* ── Cream Manager Modal ────────────────────────────── */}
            <Modal
                open={showCreamManager}
                onClose={() => setShowCreamManager(false)}
                title="🧴 Gestión de Cremas y Diminutivos">
                <div className="space-y-4">
                    <div className="flex justify-between items-center bg-gray-800/80 p-3 rounded-xl border border-gray-700">
                        <span className="text-sm font-medium text-gray-300">Cremas registradas ({creams.length})</span>
                        <button
                            onClick={() => setCreamEditModal({ open: true, editing: null })}
                            className="btn-primary text-xs py-1.5 px-3">
                            ➕ Nueva Crema
                        </button>
                    </div>

                    {creams.length === 0 ? (
                        <p className="text-center text-gray-500 py-6">No hay cremas registradas.</p>
                    ) : (
                        <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                            {creams.map(c => (
                                <div key={c.id} className="flex items-center justify-between bg-gray-800/40 border border-gray-700/60 rounded-xl px-4 py-2.5">
                                    <div>
                                        <p className="font-bold text-white text-sm">{c.name}</p>
                                        <span className="text-xs text-brand-400 font-mono font-bold bg-brand-950 px-2 py-0.5 rounded border border-brand-800">
                                            Diminutivo: {c.abbreviation}
                                        </span>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setCreamEditModal({ open: true, editing: c })}
                                            className="w-8 h-8 rounded-lg bg-gray-700 hover:bg-brand-600 text-white flex items-center justify-center text-xs transition">
                                            ✏️
                                        </button>
                                        <button
                                            onClick={() => handleDeleteCream(c)}
                                            className="w-8 h-8 rounded-lg bg-gray-700 hover:bg-red-600 text-white flex items-center justify-center text-xs transition">
                                            🗑️
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="pt-2 flex justify-end">
                        <button onClick={() => setShowCreamManager(false)} className="btn-secondary text-xs">
                            Cerrar
                        </button>
                    </div>
                </div>
            </Modal>

            {/* ── Cream Form Edit/Create Modal ────────────────────────────── */}
            <Modal
                open={creamEditModal.open}
                onClose={() => setCreamEditModal({ open: false, editing: null })}
                title={creamEditModal.editing ? '✏️ Editar Crema' : '➕ Nueva Crema'}>
                <CreamForm
                    initial={creamEditModal.editing}
                    onSave={handleSaveCream}
                    onCancel={() => setCreamEditModal({ open: false, editing: null })}
                    saving={saving}
                />
            </Modal>
        </div>
    )
}
