/**
 * TableCard – tarjeta de una mesa en el mapa.
 * Props:
 *   table       {id, number, name, capacity, status, merged_into}
 *   isSelected  bool  – seleccionada para merge
 *   onSelect    fn()  – callback al hacer click en modo selección
 *   onOpen      fn()  – abrir panel de orden
 *   hasReadyItems bool – tiene items listos para entregar
 *   mergedChildren number – cantidad de mesas secundarias unidas
 */

const STATUS_STYLES = {
    FREE: 'border-status-free     bg-status-free/10     hover:bg-status-free/20',
    OCCUPIED: 'border-status-occupied bg-status-occupied/10 hover:bg-status-occupied/20',
    RESERVED: 'border-status-reserved bg-status-reserved/10 hover:bg-status-reserved/20',
    TOPAY: 'border-status-topay    bg-status-topay/10    hover:bg-status-topay/20',
}

const STATUS_LABELS = {
    FREE: 'Libre',
    OCCUPIED: 'Ocupada',
    RESERVED: 'Reservada',
    TOPAY: 'Por Pagar',
}

const STATUS_DOT = {
    FREE: 'bg-status-free',
    OCCUPIED: 'bg-status-occupied',
    RESERVED: 'bg-status-reserved',
    TOPAY: 'bg-status-topay',
}

export default function TableCard({ table, isSelected, onSelect, onOpen, hasReadyItems, mergedChildren }) {
    const style = STATUS_STYLES[table.status] ?? STATUS_STYLES.FREE

    return (
        <button
            id={`table-card-${table.id}`}
            onClick={() => (isSelected !== undefined ? onSelect() : onOpen())}
            className={`
        relative flex flex-col items-center justify-center
        w-full aspect-square rounded-2xl border-2
        transition-all duration-200 cursor-pointer select-none
        ${style}
        ${isSelected ? 'ring-4 ring-brand-500 scale-95' : ''}
        ${hasReadyItems ? 'ring-4 ring-red-500 shadow-[0_0_15px_rgba(239,68,68,0.6)] animate-[pulse_2s_ease-in-out_infinite]' : ''}
        ${table.merged_into ? 'opacity-60' : ''}
      `}
        >
            {/* Número de mesa */}
            <span className="text-2xl font-bold text-white">{table.number}</span>

            {/* Nombre opcional */}
            {table.name && (
                <span className="text-xs text-gray-400 mt-0.5 px-1 truncate max-w-full">
                    {table.name}
                </span>
            )}

            {/* Capacidad */}
            <span className="text-xs text-gray-500 mt-1">👥 {table.capacity}</span>

            {/* Badge de estado */}
            <span className={`
        absolute bottom-2 right-2 flex items-center gap-1
        text-[10px] font-semibold px-1.5 py-0.5 rounded-full border
        ${`status-${table.status.toLowerCase()}`}
      `}>
                <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[table.status]}`} />
                {STATUS_LABELS[table.status]}
            </span>

            {/* Notification Badge */}
            {hasReadyItems && (
                <span className="absolute -top-2 -right-2 flex h-6 w-6">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-6 w-6 bg-red-500 text-white font-bold items-center justify-center text-xs shadow-md border-2 border-gray-900">!</span>
                </span>
            )}

            {/* Icono de mesa principal con grupo unido */}
            {mergedChildren > 0 && !table.merged_into && (
                <span className="absolute top-2 left-2 text-xs bg-brand-600 text-white rounded px-1.5 py-0.5 font-bold shadow-md">
                    ⛓ +{mergedChildren}
                </span>
            )}

            {/* Icono de mesa secundaria (unida a otra) */}
            {table.merged_into && (
                <span className="absolute top-2 left-2 text-xs bg-gray-700 text-gray-300 rounded px-1">
                    ⛓ →{table.merged_into}
                </span>
            )}
        </button>
    )
}
