import puppeteer from "puppeteer-core";
const api = "http://localhost:5000/api";

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

let loads = 0;
page.on("load", () => loads++);
const failed = [];
page.on("requestfailed", (r) => failed.push(r.url()));

await page.goto("http://localhost:5173/dashboard", { waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 1200));

// marcador que SOLO sobrevive si NO hay recarga de documento
await page.evaluate(() => (window.__marker = "vivo"));
const loadsBefore = loads;

// click en el link "Ventas" del sidebar
await page.evaluate(() => {
  const links = [...document.querySelectorAll("a")];
  const v = links.find((a) => a.textContent.trim() === "Ventas");
  if (v) v.click();
});
await new Promise((r) => setTimeout(r, 2500));

const marker = await page.evaluate(() => window.__marker);
console.log("URL despues del click:", page.url());
console.log("loads totales:", loads, "| loads por el click:", loads - loadsBefore);
console.log("marcador window.__marker:", marker, "(vivo = SPA, undefined = recarga real)");
console.log("requests fallidas:", failed.length);
await browser.close();
