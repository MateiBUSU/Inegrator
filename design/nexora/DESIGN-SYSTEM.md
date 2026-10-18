# Nexora — specificații UI

## Tipografie

- Familie principală: **Manrope**
- Import: Google Fonts, `Manrope:wght@400;500;600;700;800`
- Fallback: `sans-serif`
- Greutăți:
  - 400 — text curent
  - 500 — text secundar
  - 600 — controale și metadate
  - 700 — butoane și etichete
  - 800 — titluri

## Paletă Light Mode

| Token | Hex | Utilizare |
|---|---:|---|
| Canvas | `#FBF8EF` | fundalul principal, warm off-white |
| Surface | `#FFFDF7` | carduri, sidebar, header, formulare |
| Primary | `#24345F` | butoane principale, navigație activă, linkuri |
| Border | `#E6E0D3` | contururi și separatoare |
| Text principal | `#0F172A` | titluri și text cu prioritate mare |
| Text secundar | `#475569` | descrieri |
| Text discret | `#64748B` | metadate și placeholder |
| Success | `#39705D` | progres pozitiv și confirmări |
| Success text | `#2F6553` | text de succes |
| Success surface | `#EDF5F1` | fundal mesaje de succes |
| Error | `#E11D48` | erori și răspunsuri incorecte |
| Warning | `#F59E0B` | termene și atenționări |
| Violet support | `#7C3AED` | conținut generat de AI |

## Paletă Dark Mode

| Token | Hex | Utilizare |
|---|---:|---|
| Canvas | `#1C1B22` | fundal principal |
| Surface | `#26242D` | carduri, sidebar și header |
| Surface raised | `#2F2C38` | controale și suprafețe ridicate |
| Surface subtle | `#37333F` | fundaluri secundare |
| Border | `#46414F` | contururi și separatoare |
| Text principal | `#F1EDF4` | titluri și text |
| Text secundar | `#AAA3B2` | descrieri și metadate |
| Mustard primary | `#B18A45` | acțiuni și progres |
| Mustard dark | `#8F6C32` | butoane principale |
| Mustard surface | `#3D3428` | navigație activă și etichete |
| Violet | `#5D437D` | conținut AI și clase |
| Violet surface | `#352B43` | fundal AI |
| Violet text | `#C4A7E7` | text AI |
| Success | `#27785C` | progres și confirmări |
| Success surface | `#173E32` | fundal succes |
| Success text | `#65D0A6` | text succes |
| Error | `#9E3F50` | erori și avertizări |
| Error surface | `#47232D` | fundal eroare |
| Error text | `#EF8292` | text eroare |

## Border radius

- `8px` — badge-uri, controale mici, celule
- `12px` — butoane, inputuri, selecturi, navigație
- `16px` — carduri standard și panouri
- `24px` — hero, panouri principale și suprafețe promo
- `9999px` — avataruri, statusuri și progress dots

## Spațiere

Sistem bazat pe multipli de 4px, cu ritm principal de 8px:

- `4px` — spațiu intern minim
- `8px` — între icon și text, badge-uri
- `12px` — controale compacte
- `16px` — padding mobil și card compact
- `20px` — card standard
- `24px` — panou și secțiune
- `28px` — hero compact
- `32px` — separare între secțiuni
- `40px` — margini desktop și secțiuni majore

## Dimensiuni responsive exportate

- Desktop: `1440 × 1200px`
- Mobil: `390 × 844px`
- Sidebar desktop: `256px`
- Header: `80px`
- Container conținut: maximum `1280px`

## Umbre și borduri

- Cardurile folosesc bordură de `1px`.
- Umbrele sunt discrete și apar mai ales la hover.
- În Dark Mode: `0 12px 34px rgb(10 8 14 / 24%)`.
