// Generates Kindy's Android launcher icon, splash screens and Play Store icon
// from one design. Usage: pnpm icons
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { Resvg } from '@resvg/resvg-js'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const res = path.join(repo, 'android/app/src/main/res')

const colors = {
  backgroundFrom: '#C9B4FF',
  backgroundTo: '#8C63F2',
  ivory: '#FFF5E8',
  coral: '#FF8C74',
}

// Shapes on the 108 x 108 adaptive-icon canvas, scaled into the 66dp safe zone.
const personA = {
  head: { cx: 44, cy: 44, r: 9.5 },
  body: 'M28,78 C28,66.4 35.2,58 44,58 C52.8,58 60,66.4 60,78 Z',
}
const personB = {
  head: { cx: 64, cy: 47, r: 10.5 },
  body: 'M46,82 C46,69.5 54.1,61 64,61 C73.9,61 82,69.5 82,82 Z',
}
const scale = 0.8
const shiftY = -3
const GAP = 4.5
const groupTransform = `translate(0 ${shiftY}) translate(54 54) scale(${scale}) translate(-54 -54)`

// Background corners in the group's own coordinates, so the gap between the two
// people is painted in exactly the background gradient.
const toGroup = (value, shift) => 54 + (value - 54 - shift) / scale
const gap = {
  x1: toGroup(0, 0),
  y1: toGroup(0, shiftY),
  x2: toGroup(108, 0),
  y2: toGroup(108, shiftY),
}

const circlePath = (head) =>
  `M${head.cx - head.r},${head.cy} a${head.r},${head.r} 0 1,0 ${head.r * 2},0 a${head.r},${head.r} 0 1,0 -${head.r * 2},0`

function svgPeople() {
  return `<defs><linearGradient id="gap" gradientUnits="userSpaceOnUse" x1="${gap.x1}" y1="${gap.y1}" x2="${gap.x2}" y2="${gap.y2}"><stop offset="0" stop-color="${colors.backgroundFrom}"/><stop offset="1" stop-color="${colors.backgroundTo}"/></linearGradient></defs>
<g transform="${groupTransform}">
<path d="${personA.body}" fill="${colors.ivory}"/>
<path d="${circlePath(personA.head)}" fill="${colors.ivory}"/>
<path d="${personB.body}" fill="none" stroke="url(#gap)" stroke-width="${GAP}"/>
<path d="${circlePath(personB.head)}" fill="none" stroke="url(#gap)" stroke-width="${GAP}"/>
<path d="${personB.body}" fill="${colors.coral}"/>
<path d="${circlePath(personB.head)}" fill="${colors.coral}"/>
</g>`
}

const backgroundGradient = (vertical) =>
  `<linearGradient id="bg" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${vertical ? 0 : 108}" y2="108"><stop offset="0" stop-color="${colors.backgroundFrom}"/><stop offset="1" stop-color="${colors.backgroundTo}"/></linearGradient>`

function iconSvg({ viewBox, clip }) {
  const [x, y, w, h] = viewBox
  const clipShape =
    clip === 'circle'
      ? `<circle cx="${x + w / 2}" cy="${y + h / 2}" r="${w / 2}"/>`
      : clip === 'rounded'
        ? `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${w * 0.22}"/>`
        : `<rect x="${x}" y="${y}" width="${w}" height="${h}"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox.join(' ')}"><defs>${backgroundGradient(false)}<clipPath id="shape">${clipShape}</clipPath></defs>
<g clip-path="url(#shape)"><rect width="108" height="108" fill="url(#bg)"/>${svgPeople()}</g></svg>`
}

function renderTo(svg, width, file) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(
    file,
    new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render().asPng(),
  )
}

// 1. Sources kept in the repository.
const sources = path.join(repo, 'resources')
fs.mkdirSync(sources, { recursive: true })
fs.writeFileSync(
  path.join(sources, 'icon.svg'),
  `${iconSvg({ viewBox: [0, 0, 108, 108], clip: 'none' })}\n`,
)
fs.writeFileSync(
  path.join(sources, 'icon-foreground.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108">${svgPeople()}</svg>\n`,
)

// 2. Legacy launcher icons for Android 7 (rounded square and round).
const densities = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 }
for (const [density, size] of Object.entries(densities)) {
  const dir = path.join(res, `mipmap-${density}`)
  renderTo(
    iconSvg({ viewBox: [12, 12, 84, 84], clip: 'rounded' }),
    size,
    path.join(dir, 'ic_launcher.png'),
  )
  renderTo(
    iconSvg({ viewBox: [12, 12, 84, 84], clip: 'circle' }),
    size,
    path.join(dir, 'ic_launcher_round.png'),
  )
  fs.rmSync(path.join(dir, 'ic_launcher_foreground.png'), { force: true })
}

// 3. Play Store icon: 512 x 512, square (Google Play applies the rounding).
renderTo(
  iconSvg({ viewBox: [10, 10, 88, 88], clip: 'none' }),
  512,
  path.join(sources, 'play-store-icon.png'),
)

// 4. Splash screens: vertical lavender gradient with the two people centred.
function splashSvg(width, height) {
  const size = Math.min(width, height) * 0.42
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"><defs><linearGradient id="splash" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${colors.backgroundFrom}"/><stop offset="1" stop-color="${colors.backgroundTo}"/></linearGradient></defs>
<rect width="${width}" height="${height}" fill="url(#splash)"/>
<svg x="${(width - size) / 2}" y="${(height - size) / 2}" width="${size}" height="${size}" viewBox="0 0 108 108"><rect width="108" height="108" rx="24" fill="url(#bgIcon)"/><defs>${backgroundGradient(false).replace('id="bg"', 'id="bgIcon"')}</defs>${svgPeople()}</svg></svg>`
}
for (const dir of fs.readdirSync(res)) {
  const file = path.join(res, dir, 'splash.png')
  if (!fs.existsSync(file)) continue
  const buffer = fs.readFileSync(file)
  renderTo(
    splashSvg(buffer.readUInt32BE(16), buffer.readUInt32BE(20)),
    buffer.readUInt32BE(16),
    file,
  )
}

// 5. Vector drawables: adaptive icon (Android 8+) and themed monochrome icon (13+).
const gradientStroke = `
            android:strokeWidth="${GAP}">
            <aapt:attr name="android:strokeColor">
                <gradient
                    android:type="linear"
                    android:startX="${gap.x1}"
                    android:startY="${gap.y1}"
                    android:endX="${gap.x2}"
                    android:endY="${gap.y2}">
                    <item android:offset="0" android:color="${colors.backgroundFrom}" />
                    <item android:offset="1" android:color="${colors.backgroundTo}" />
                </gradient>
            </aapt:attr>
        </path>`

function vectorGroup(fillA, fillB, withGap) {
  const filled = (pathData, fill) => `        <path
            android:fillColor="${fill}"
            android:pathData="${pathData}" />`
  const gapPath = (pathData) => `        <path
            android:pathData="${pathData}"${gradientStroke}`
  return [
    `    <group
        android:pivotX="54"
        android:pivotY="54"
        android:scaleX="${scale}"
        android:scaleY="${scale}"
        android:translateY="${shiftY}">`,
    filled(personA.body, fillA),
    filled(circlePath(personA.head), fillA),
    ...(withGap ? [gapPath(personB.body), gapPath(circlePath(personB.head))] : []),
    filled(personB.body, fillB),
    filled(circlePath(personB.head), fillB),
    '    </group>',
  ].join('\n')
}

const vector = (body, withAapt) => `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"${withAapt ? '\n    xmlns:aapt="http://schemas.android.com/aapt"' : ''}
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
${body}
</vector>
`

fs.writeFileSync(
  path.join(res, 'drawable', 'ic_launcher_foreground.xml'),
  vector(vectorGroup(colors.ivory, colors.coral, true), true),
)
fs.writeFileSync(
  path.join(res, 'drawable', 'ic_launcher_monochrome.xml'),
  vector(vectorGroup('#FFFFFFFF', '#FFFFFFFF', false), false),
)
fs.writeFileSync(
  path.join(res, 'drawable', 'ic_launcher_background.xml'),
  vector(
    `    <path android:pathData="M0,0h108v108h-108z">
        <aapt:attr name="android:fillColor">
            <gradient
                android:type="linear"
                android:startX="0"
                android:startY="0"
                android:endX="108"
                android:endY="108">
                <item android:offset="0" android:color="${colors.backgroundFrom}" />
                <item android:offset="1" android:color="${colors.backgroundTo}" />
            </gradient>
        </aapt:attr>
    </path>`,
    true,
  ),
)
fs.rmSync(path.join(res, 'drawable-v24', 'ic_launcher_foreground.xml'), { force: true })

const adaptive = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_background" />
    <foreground android:drawable="@drawable/ic_launcher_foreground" />
    <monochrome android:drawable="@drawable/ic_launcher_monochrome" />
</adaptive-icon>
`
fs.writeFileSync(path.join(res, 'mipmap-anydpi-v26', 'ic_launcher.xml'), adaptive)
fs.writeFileSync(path.join(res, 'mipmap-anydpi-v26', 'ic_launcher_round.xml'), adaptive)
fs.writeFileSync(
  path.join(res, 'values', 'ic_launcher_background.xml'),
  `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">${colors.backgroundTo}</color>
</resources>
`,
)
// 6. Preview for Android's widget picker: a language-neutral mock of "Coming up".
function widgetPreviewSvg() {
  const row = (
    y,
    dot,
    width,
  ) => `<rect x="24" y="${y}" width="352" height="52" rx="16" fill="#F6F1FF"/>
<rect x="38" y="${y + 12}" width="28" height="28" rx="8" fill="${dot}"/>
<rect x="80" y="${y + 12}" width="60" height="9" rx="4.5" fill="#C9BEE6"/>
<rect x="80" y="${y + 28}" width="${width}" height="12" rx="6" fill="#3B2A73"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240"><rect width="400" height="240" rx="28" fill="#FFFDFD"/>
<rect x="24" y="22" width="110" height="14" rx="7" fill="#6633EE"/>
${row(50, colors.coral, 150)}${row(112, colors.backgroundFrom, 190)}${row(174, '#9ED7B3', 120)}</svg>`
}
renderTo(widgetPreviewSvg(), 800, path.join(res, 'drawable-nodpi', 'widget_coming_up_preview.png'))

console.log('icons written')
