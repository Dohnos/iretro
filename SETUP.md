# 🚀 iAUKRO – návod: Firebase + Vercel

Aplikace má dvě části, které sdílí jednu databázi:
- **`index.html`** 📷 – appka na focení a přípravu produktů (generuje Excel + importuje do databáze)
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
(zadej ID → 3 fotky → detaily → **Přidat produkt** → **Odeslat**).
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
- **Stačí 1 fotka** – nemusíš mít všechny 3 (v režimu focení jsou 3 dál povinné).
- **Uložit do databáze (bez Excelu)** – v posledním kroku přibylo tlačítko,
  které produkty jen zapíše do Firestore, bez generování Excelu a odesílání
  přes WhatsApp. Excel si pak kdykoli vyexportuješ z dashboardu.

ID produktů se chovají stejně jako při focení – navazují na nejvyšší už použité
ID a nejde je použít podruhé.

## ✏️ Úprava produktů v databázi
V dashboardu má každá karta tlačítko **✏️ Upravit**. V modálu jdou změnit:

| Pole | Poznámka |
|---|---|
| Název | formát pro Aukro je `NÁZEV \| ID` |
| Cena | |
| Umístění | zároveň se přepočítá `extId` (`umístění \| ID`) |
| Datum přidání | mění `date_added` i `created_at` (dashboard podle něj řadí) |
| Kategorie | výběr s hledáním z `MapaKat.txt` |
| Doprava | stejný seznam jako v appce; neznámé ID u starších produktů se doplní |
| Propagace | přednostní výpis, tučný titulek, zvýraznění |
| Fotky | odebrání, přehození pořadí (⭐ = hlavní fotka) a přidání přes odkaz |

**ID produktu měnit nejde** – je to klíč dokumentu v databázi (a pojistka proti
dvojímu použití ID).

Úprava se ukládá do „plochých“ sloupců i do pole `raw`, ze kterého se skládá
Excel pro Aukro – export z dashboardu tak vždycky odpovídá tomu, co je vidět
na kartě.

## 8️⃣ Nahraj na GitHub a deploy na Vercel 🚀
```bash
git add .
git commit -m "Migrace na Firebase (Firestore + Auth)"
git push
```
Na Vercelu je to statický web – **Framework Preset: Other**, Build & Output nech prázdné.

## ✅ Hotovo
- Focení a generování Excelu funguje jako dřív. 📸
- Po přihlášení se produkty ukládají do **Firestore** a hned se objeví v **dashboardu**. 🗄️
- Data vidíš i ručně ve **Firebase Console → Firestore Database**. 🧹
