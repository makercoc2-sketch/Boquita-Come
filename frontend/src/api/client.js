import axios from 'axios'

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL ?? '/api',
    headers: { 'Content-Type': 'application/json' },
})

// ── Auth ─────────────────────────────────────────────────────────────────────
export const loginByPin = (data) => api.post('/auth/login', data)

// Finances
export const getFinancesSummary = (filter) => api.get(`/finances/summary?date_filter=${filter}`)
export const getPaidOrders = (filter) => api.get(`/finances/orders?date_filter=${filter}`)
export const deletePaidOrder = (id) => api.delete(`/finances/orders/${id}`)
export const resetTestData = (params) => api.post('/finances/reset-test-data', null, { params })
export const getExpenses = (filter) => api.get(`/finances/expenses?date_filter=${filter}`)
export const createExpense = (data) => api.post('/finances/expenses', data)
export const deleteExpense = (id) => api.delete(`/finances/expenses/${id}`)

// Dashboard
export const getDashboardStats = (filter) => api.get(`/dashboard/stats?date_filter=${filter}`)
export const askChatbot = (message) => api.post('/dashboard/chat', { message })

// ── Tables ───────────────────────────────────────────────────────────────────
export const getTables = () => api.get('/tables/')
export const getTable = (id) => api.get(`/tables/${id}`)
export const createTable = (data) => api.post('/tables/', data)
export const updateTable = (id, data) => api.patch(`/tables/${id}`, data)
export const deleteTable = (id) => api.delete(`/tables/${id}`)
export const mergeTables = (data) => api.post('/tables/merge', data)
export const unmergeTables = (primaryId) => api.post(`/tables/unmerge/${primaryId}`)

// ── Orders ───────────────────────────────────────────────────────────────────
export const createOrder = (data) => api.post('/orders/', data)
export const createDeliveryOrder = (data) => api.post('/orders/delivery', data)
export const getActiveDeliveryOrders = () => api.get('/orders/delivery/active')
export const getOrder = (id) => api.get(`/orders/${id}`)
export const updateOrder = (id, data) => api.patch(`/orders/${id}`, data)
export const cancelOrder = (id) => api.delete(`/orders/${id}`)
export const addOrderItems = (id, items) => api.post(`/orders/${id}/items`, items)
export const sendToKitchen = (id, data = {}) => api.post(`/orders/${id}/send-kitchen`, data)
export const closeOrder = (id, data) => api.post(`/orders/${id}/close`, data)
export const getActiveKitchenTickets = () => api.get('/orders/kitchen-tickets/active')
export const getTodayKitchenTickets = () => api.get('/orders/kitchen-tickets/today')
export const updateItemStatus = (itemId, status) => api.patch(`/orders/items/${itemId}/status`, { status })
export const updateOrderItem = (itemId, data) => api.put(`/orders/items/${itemId}`, data)
export const deleteOrderItem = (itemId, userRole) => api.delete(`/orders/items/${itemId}`, { params: { user_role: userRole } })


// ── Billing ──────────────────────────────────────────────────────────────────
export const previewBilling = (orderId) => api.get(`/billing/${orderId}/preview`)
export const exportBilling = (orderId, params) => api.post(`/billing/${orderId}/export`, null, { params })

// ── Printing ─────────────────────────────────────────────────────────────────
export const printKitchenTicket = (data) => api.post('/print/kitchen-ticket', data)
export const printReceipt = (data) => api.post('/print/receipt', data)
export const printerStatus = () => api.get('/print/status')

// ── Menu / Carta ─────────────────────────────────────────────────────────────
export const getCategories = () => api.get('/menu/categories')
export const createCategory = (data) => api.post('/menu/categories', data)
export const updateCategory = (id, data) => api.patch(`/menu/categories/${id}`, data)
export const deleteCategory = (id) => api.delete(`/menu/categories/${id}`)

export const getProducts = (categoryId) =>
    api.get('/menu/products', { params: categoryId ? { category_id: categoryId } : {} })
export const createProduct = (data) => api.post('/menu/products', data)
export const updateProduct = (id, data) => api.patch(`/menu/products/${id}`, data)
export const deleteProduct = (id) => api.delete(`/menu/products/${id}`)
export const toggleProductAvailability = (id) => api.patch(`/menu/products/${id}/toggle-availability`)

// ── Cremas y Salsas ──────────────────────────────────────────────────────────
export const getCreams = () => api.get('/creams/')
export const createCream = (data) => api.post('/creams/', data)
export const updateCream = (id, data) => api.put(`/creams/${id}`, data)
export const deleteCream = (id) => api.delete(`/creams/${id}`)

// ── Backup / Copias de Seguridad ─────────────────────────────────────────────
export const exportDatabaseBackup = (role, format = 'db') => {
    const url = format === 'json' ? `/backup/export-json?role=${encodeURIComponent(role)}` : `/backup/export?role=${encodeURIComponent(role)}`
    return api.get(url, { responseType: 'blob' })
}

export const importDatabaseBackup = (formData, role) => {
    return api.post(`/backup/import?role=${encodeURIComponent(role)}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    })
}

// ── Configuración / Ajustes ──────────────────────────────────────────────────
export const getSettings = () => api.get('/settings/')
export const updateSettings = (data) => api.put('/settings/', data)
export const testPrintSettings = () => api.post('/settings/test-print')

export default api
