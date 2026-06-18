import puppeteer from "puppeteer-core";
const api = "http://localhost:5000/api";
const out = process.argv[2] || "/tmp/sale.png";

const res = await fetch(`${api}/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "admin@demo.com", password: "admin123" }),
});
const data = await res.json();

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.goto("http://localhost:5173/", { waitUntil: "domcontentloaded" });
await page.evaluate(
  (t, u) => {
    localStorage.setItem("token", t);
    if (u) localStorage.setItem("user", JSON.stringify(u));
  },
  data.accessToken,
  data.user,
);
await page.goto("http://localhost:5173/Ventas", { waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 1200));

// 1) Abrir el Sheet "Agregar venta"
await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) =>
    x.textContent.includes("Agregar venta"),
  );
  if (b) b.click();
});
await new Promise((r) => setTimeout(r, 800));

// 2) Abrir el selector de productos (ultimo boton con ese texto = el de accion)
await page.evaluate(() => {
  const bs = [...document.querySelectorAll("button")].filter(
    (x) => x.textContent.trim() === "Agregar productos",
  );
  const target = bs[bs.length - 1];
  if (target) target.click();
});
await new Promise((r) => setTimeout(r, 900));
await page.screenshot({ path: out });
await browser.close();
console.log("ok", out);
