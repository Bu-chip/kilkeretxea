# Killkir Etxea — Web MVP

## Proyecto
Web estática single-page para Killkir Etxea, asociación cultural de Bilbao.
Bilingüe EU/ES. Hosted en GitHub Pages. HTML + CSS + JS vanilla.

## Estructura
kilkir_etxea_web/
├── index.html          (versión ES)
├── eu/
│   └── index.html      (versión EU)
├── style.css           (sistema de diseño + estilos)
├── script.js           (menú mobile + selector idioma)
├── img/                (fotos optimizadas, WebP)
├── CLAUDE.md           (este archivo)
└── README.md

## Sistema de diseño — REGLAS OBLIGATORIAS

### Paleta (usar SOLO estos colores, no improvisar)
- Gris Carbón:  #E8ECEB / #A3B0AB / #6E7F79 / #4E635D / #1A2522
- Cian:         #E6F9F8 / #9AE5E0 / #53CFC7 / #2FA39C / #0F3D3A
- Verde Lima:   #F0FCE5 / #D4F9B8 / #B9F58C / #7EBF53 / #2D4A17
- Lavanda:      #EDEEF4 / #BCC3D6 / #8994B6 / #5F6A8C / #262B3B
- Fondo:        #FAFBFA (blanco roto)
- Texto:        #1A2522 (NUNCA #000000)

### Tipografía
- Bebas Neue: SOLO títulos grandes, SIEMPRE mayúsculas, nunca para texto corriente
- Oswald: todo lo demás (cuerpo 400, énfasis 700, nav 500)
- Escala: 12 / 14 / 16 / 18 / 24 / 36 / 48 / 72 px (no improvisar)

### Spacing (escala fija)
4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96 px

### Layout
- Max-width contenido: 960px centrado
- Max-width texto: 640px
- Grid tarjetas: 2 cols mobile, 3 cols desktop
- Breakpoint: 768px
- Mobile first

### Reglas Refactoring UI
- Jerarquía con color + peso, no solo tamaño
- Separar secciones con fondo alterno + espacio, NUNCA con borders
- Accent border: 3px solid #53CFC7 bajo títulos de sección
- Fotos: object-fit: cover en contenedor ratio fijo, overlay oscuro en hero
- Empezar con más espacio del necesario
- Nunca negro puro
- Nunca rellenar toda la pantalla

### Secciones de la página (en este orden)
1. Header (fondo #4E635D, logo verde lima, nav blanco)
2. Hero (foto + overlay 60% + claim Bebas Neue 48px)
3. Tailerrak / Talleres (fondo #FAFBFA, grid tarjetas)
4. Topaketak / Encuentros (fondo #E8ECEB, grid tarjetas)
5. Nor gara / Quiénes somos (fondo #FAFBFA, foto + texto + tags)
6. Kontaktua / Contacto (fondo #E8ECEB)
7. Footer (fondo #4E635D)

### Idiomas
- index.html = versión ES
- eu/index.html = versión EU
- Selector de idioma en header: EU | ES