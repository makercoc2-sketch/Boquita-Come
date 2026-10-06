/** @type {import('tailwindcss').Config} */
export default {
    content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
    theme: {
        extend: {
            colors: {
                brand: {
                    50: '#fff4f0',
                    100: '#ffe6dc',
                    200: '#ffc8ac',
                    300: '#fda370',
                    400: '#EE8B20',   // Naranja (Capa Inferior)
                    500: '#EE3B30',
                    600: '#DF2027',   // Rojo Brillante (Capa Tomate / Principal)
                    700: '#bd1b21',
                    800: '#8C371D',   // Marrón Claro (Capa Carne)
                    900: '#531D1C',   // Marrón Oscuro / Guinda (Borde Logo)
                    950: '#340f0d',
                },
                status: {
                    free: '#8AC33F',       // Verde (Capa Lechuga)
                    occupied: '#DF2027',   // Rojo (Capa Tomate)
                    reserved: '#FDC301',   // Amarillo (Capa Queso)
                    topay: '#EE8B20',      // Naranja (Capa Inferior)
                },
            },
            fontFamily: {
                sans: ['Inter', 'system-ui', 'sans-serif'],
            },
        },
    },
    plugins: [],
}
