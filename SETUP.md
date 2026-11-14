# 🚀 iAUKRO – návod: Firebase + Vercel

Aplikace má dvě části, které sdílí jednu databázi:
- **`index.html`** 📷 – appka na focení a přípravu produktů (generuje CSV pro Aukro + importuje do databáze)
- **`dashboard.html`** 📊 – přehled všech produktů (ID, název, datum, fotky)

Databáze = **Cloud Firestore** (Firebase), přihlášení = **Firebase Auth**, hosting = **Vercel**.
Přístup k datům má **jen vlastník** – nikdo cizí data nepřečte, nezmění ani nesmaže. 🔒

---

## 1️⃣ Firebase projekt
1. Jdi na [console.firebase.google.com](https://console.firebase.google.com) → přihlas se Google účtem.
2. **Add project** ➕ → název `iaukro` → Google Analytics můžeš vypnout → **Create project**.

## 2️⃣ Zapni Firestore
1. Levé menu **Build → Firestore Database → Create database**.
2. **Location:** `eur3 (europe-west)` nebo `europe-west3` 🇪🇺 (nejde později změnit!).
3. Režim: **Start in production mode** (pravidla nastavíme v kroku 4).

## 3️⃣ Zapni přihlašování (Authentication)
1. Levé menu **Build → Authentication → Get started**.
2. Záložka **Sign-in method** → povol **Email/Password** → **Save**.
3. Záložka **Users** → **Add user**:
   - **Email:** `retroaukce@email.com`  ⚠️ **malými písmeny** (musí sedět s pravidly i configem)
   - **Password:** zvol silné heslo 🔐 (tímhle se pak budeš přihlašovat do appky)

## 4️⃣ Nasaď bezpečnostní pravidla
1. **Firestore Database → záložka Rules**.
2. Vlož obsah souboru **`firestore.rules`** z tohoto repa a klikni **Publish**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isOwner() {
      return request.auth != null
        && request.auth.token.email == 'retroaukce@email.com';
    }
    match /products/{productId} {
      allow read, write: if isOwner();
    }
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

> 🔒 Tímto má plná práva (čtení, zápis i mazání) **jen** přihlášený vlastník
> `retroaukce@email.com`. Kdokoli jiný je odmítnut.
> Chceš pustit ještě další e-mail? Přidej ho do `isOwner()`:
> `request.auth.token.email in ['retroaukce@email.com', 'dalsi@email.com']`.

## 5️⃣ Config je už v repu
Web app config najdeš ve **Firebase Console → ⚙️ Project settings → Your apps → Web app → Config**.
V tomhle projektu už je vyplněný v souboru **`firebase-config.js`**:

```js
const firebaseConfig = {
  apiKey: "…",
  authDomain: "iaukro.firebaseapp.com",
  projectId: "iaukro",
  storageBucket: "iaukro.firebasestorage.app",
  messagingSenderId: "…",
  appId: "…"
};
window.OWNER_EMAIL = "retroaukce@email.com";
```

> 💡 Tyhle hodnoty jsou určené do prohlížeče – je to v pořádku, data chrání
> pravidla + přihlášení, ne utajení configu.

## 6️⃣ Přenes stará data ze Supabase (bez ztráty) 🔁
Původní data zůstávají v Supabase jako záloha. Přeneseme je do Firestore jednou:
1. Spusť web (lokálně `python -m http.server 8000`, nebo rovnou na Vercelu).
2. Otevři **`/migrate.html`** → přihlas se jako `retroaukce@email.com`.
3. **1) Načíst ze Supabase** → **2) Zapsat do Firestore**.
4. Zkontroluj **dashboard.html** – produkty tam musí naskočit. 🎉

> ⚠️ Migraci spusť jen jednou (zápis přepisuje podle `product_id`).

## 7️⃣ Vyzkoušej lokálně 🧪
```bash
python -m http.server 8000
```
- Appka: <http://localhost:8000/index.html>
- Dashboard: <http://localhost:8000/dashboard.html>

Nejdřív se přihlásíš (Firebase Auth). Pak projdi appku
(zadej ID → aspoň 3 fotky → detaily → **Přidat produkt** → **Odeslat**).
Produkt musí naskočit v **dashboardu**. 🎉

## 🕓 Zpětné (ruční) přidávání produktů
Když **fotky už máš nafocené** a produkty chceš do databáze doplnit až potom,
přepni v kroku 0 přepínač na **🕓 Zpětně** (nebo použij odkaz
**„Přidat zpětně“** v dashboardu, který na něj rovnou skočí).

Co se v tomhle režimu změní:
- **Fotky z galerie** – tlačítko *Vybrat fotky z galerie* nabídne rovnou výběr
  více fotek najednou (focení zůstává jako druhá možnost). Vybrané fotky vidíš
  jako náhledy a můžeš je jednotlivě odebrat.
- **Datum přidání** – vyplníš vlastní datum, nebo se doplní automaticky podle
  data pořízení první vybrané fotky. Uloží se do databáze (`date_added`
  i `created_at`), takže produkt je v dashboardu u správného dne.
- **Stačí 1 fotka** – nemusíš mít 3 (v režimu focení jsou 3 dál povinné).
- **Uložit do databáze (bez exportu)** – v posledním kroku přibylo tlačítko,
  které produkty jen zapíše do Firestore, bez generování CSV a odesílání
  přes WhatsApp. CSV si pak kdykoli vyexportuješ z dashboardu.

ID produktů se chovají stejně jako při focení – navazují na nejvyšší už použité
ID a nejde je použít podruhé.

## 📝 Poznámka k předmětu
V kroku **Detaily** je volitelné pole *Poznámka k předmětu*. Když ho vyplníš,
vloží se do popisu nabídky jako **první sekce** (hned pod logo, nad „Nabízené
zboží“); prázdná poznámka se do popisu nepromítne vůbec. Šablona popisu je
v souboru **`description.js`** – sdílí ji appka i dashboard, takže se upravuje
na jednom místě.

Poznámka jde změnit i později v dashboardu (**Upravit**). Popis nabídky se
při tom vygeneruje znovu z aktuální šablony – a jen tehdy; úprava ceny nebo
umístění uložený popis nepřepisuje.

## 📸 Víc než 3 fotky
Povinné jsou dál 3 fotky (ve zpětném režimu 1), ale přidat jich jde až
**12** (`MAX_PHOTOS` v `script.js`). Po třetí fotce appka přejde na detaily
jako dřív; další fotky se přidávají přímo tam dlaždicemi **Vyfotit** /
**Z galerie**. Všechny se nahrají na Cloudinary při přidání produktu.

## ☑️ Export jen vybraných produktů
Každá karta v dashboardu má vlevo nahoře zaškrtávátko. Jakmile něco označíš,
vyjede dole lišta s počtem a tlačítkem **Exportovat vybrané** – do CSV
půjdou přesně označené produkty (i prodané, pokud si je vybereš).
**Vybrat vše** označí to, co je právě vidět po hledání a filtru.
Tlačítko **Export všech neprodaných** funguje jako dřív.

### 📸 Přidání fotek k uloženému produktu
Nové fotky se v modálu **Upravit** nejdřív jen ořežou a označí štítkem
**nová**. Na Cloudinary se nahrají až po kliknutí na **Uložit** – zrušená
úprava tak na Cloudinary nic nenechá. Když nahrávání selže (síť), modál
zůstane otevřený a další **Uložit** nahraje jen to, co ještě chybí.

## 📄 Export pro Aukro (CSV)
Oba exporty – soubor poslaný přes WhatsApp i stažení z dashboardu – jsou
**CSV v UTF-8** ve formátu, který Aukro při importu přijalo. Skládá je
`export.js`:

- UTF-8 **bez BOM** (se značkou BOM Aukro nepoznalo sloupec `entityId`),
- oddělovač čárka, mezi řádky CRLF, za posledním řádkem nic,
- v HTML popisu `&` místo `&amp;` (v databázi zůstává popis beze změny).

- **Začátky aukcí:** první produkt začíná ve zvolený čas, každý další
  o **2 minuty** později (entityId 1 → 18:00, 2 → 18:02 …).
- **Kontrola před stažením (dashboard):** po kliknutí na export se ukáže
  okno s volbou data a času začátku, seznamem produktů v pořadí exportu
  (s kategorií, cenou a časem) a souhrnem kategorií. Upozorní na produkty
  bez kategorie, fotky či ceny a na prodané ve výběru; čas v minulosti
  stažení zablokuje. **Klepnutím na produkt** v seznamu se otevře jeho
  úprava (kategorie, cena, fotky…); po uložení se kontrola sama přepočítá
  a upravený řádek krátce blikne.
- **WhatsApp z appky** bere jako začátek nejbližší celou hodinu (čas je
  vidět v potvrzovacím dialogu), dál po 2 minutách.
- **entityId** se v každém souboru čísluje znovu: první řádek **1**,
  druhý **2** … poslední **N** (u 10 produktů 1–10). Je tak vždy unikátní.
- Pořadí řádků: v appce podle toho, jak byly produkty přidané; v dashboardu
  podle čísla ID od nejnižšího (RA01 → entityId 1).
- Popis nabídky (HTML s uvozovkami) je v CSV správně uzavřený v uvozovkách.
- `priorityListing`, `boldTitle`, `highlight` jsou zapsané jako `TRUE` / `FALSE`.

## 🎨 Vzhled
Appka i dashboard mají vlastní černobílý design bez CSS frameworku
(`styles.css` + `dashboard.css`) a čárové SVG ikony z **`icons.js`** –
nic z toho nepotřebuje CDN. Světlý/tmavý režim přepíná tlačítko vpravo nahoře
(bez uložené volby se řídí nastavením telefonu).

Sdílené soubory: `photos.js` (ořez, nahrání na Cloudinary, zmenšené náhledy),
`ui.js` (zámek scrollu pod modálem, skloňování, místní datum),
`description.js` (šablona popisu), `categories.js`, `icons.js`.

Dashboard nestahuje plné fotky (1600 px): karty berou z Cloudinary náhled
480 px a načítají se až při doscrollování. Kdyby Cloudinary transformace
odmítl, obrázek se sám přepne na originál.

## ✅ Hromadné označení prodaných
V dashboardu tlačítko **Hromadně prodané** otevře okno, kam vložíš názvy
prodaných aukcí – klidně celý text zkopírovaný z přehledu prodaných na Aukru.
Z každého názvu se vezme ID za znakem `|` (např. `PRIM KROUŽEK | RA86` →
`RA86`); funguje i když je ID zalomené na další řádek nebo stojí samo
na řádku. Čísla aukcí, ceny a ostatní text se ignorují.

Před uložením je vidět náhled: co se **označí**, co je **už prodané**
a které ID **v databázi není**. Teprve tlačítko **Označit prodané (N)**
zapíše vše najednou (`sold: true`, `sold_at`). Omylem označený produkt
vrátíš na kartě tlačítkem **Vrátit**.

**Kupující Aledas a Ebisu:** když je u aukce v textu „Kupující: Aledas“
nebo „Kupující: Ebisu“ (na velikosti písmen nezáleží), produkt se jako
prodaný **neoznačí** – v náhledu je u něj varování „neoznačí se“ a po
uložení hláška vyjmenuje, co bylo přeskočeno. Seznam jmen je
v `dashboard.js` (`BULK_SOLD_SKIP_BUYERS`).

## ✏️ Úprava produktů v databázi
V dashboardu má každá karta tlačítko **✏️ Upravit**. V modálu jdou změnit:

| Pole | Poznámka |
|---|---|
| Název | formát pro Aukro je `NÁZEV \| ID` |
| Cena | |
| Umístění | zároveň se přepočítá `extId` (`umístění \| ID`) |
| Poznámka | při změně se přegeneruje popis nabídky |
| Datum přidání | mění `date_added` i `created_at` (dashboard podle něj řadí) |
| Kategorie | výběr s hledáním z `MapaKat.txt` |
| Doprava | stejný seznam jako v appce; neznámé ID u starších produktů se doplní |
| Propagace | přednostní výpis, tučný titulek, zvýraznění |
| Fotky | přidání (vyfotit / z galerie, s ořezem jako v appce), odebrání, přehození pořadí (⭐ = hlavní fotka), případně vložení odkazem |

**ID produktu měnit nejde** – je to klíč dokumentu v databázi (a pojistka proti
dvojímu použití ID).

Úprava se ukládá do „plochých“ sloupců i do pole `raw`, ze kterého se skládá
export pro Aukro – export z dashboardu tak vždycky odpovídá tomu, co je vidět
na kartě.

### 🗑️ Smazání produktu
Ve stejném modálu je tlačítko **Smazat**, které po potvrzení odstraní dokument
z Firestore. Dvě věci k tomu:
- **Fotky zůstanou na Cloudinary** – maže se jen záznam v databázi.
- **ID se uvolní.** Appka odvozuje další ID od nejvyššího, které v databázi je;
  když smažeš produkt s nejvyšším ID, dostane ho příští nový produkt.

## 8️⃣ Nahraj na GitHub a deploy na Vercel 🚀
```bash
git add .
git commit -m "Migrace na Firebase (Firestore + Auth)"
git push
```
Na Vercelu je to statický web – **Framework Preset: Other**, Build & Output nech prázdné.

## ✅ Hotovo
- Focení a generování exportu (CSV) funguje jako dřív. 📸
- Po přihlášení se produkty ukládají do **Firestore** a hned se objeví v **dashboardu**. 🗄️
- Data vidíš i ručně ve **Firebase Console → Firestore Database**. 🧹
